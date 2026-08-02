import { createServer } from 'node:http'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { get } from 'node:https'
import { inflateSync } from 'node:zlib'
import XLSX from 'xlsx'

const PORT = process.env.PORT || 3456
const CACHE_DIR = join(tmpdir(), 'qutwiki_xlsx_cache')
const CACHE_TTL = 60 * 60 * 1000
mkdirSync(CACHE_DIR, { recursive: true })

function ts() {
  return new Date().toLocaleString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' })
}

function log(...args) {
  console.log(`[${ts()}]`, ...args)
}

function fetch(url) {
  return new Promise((resolve, reject) => {
    get(url, { headers: { Referer: 'https://docs.qq.com/' } }, res => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => resolve(data))
    }).on('error', reject)
  })
}

function cacheKey(url) {
  const m = url.match(/docs\.qq\.com\/sheet\/([A-Za-z0-9]+)/)
  return m ? m[1] : Buffer.from(url).toString('base64url').slice(0, 20)
}

function fromCache(key) {
  const file = join(CACHE_DIR, `${key}.xlsx`)
  if (!existsSync(file)) return null
  if (Date.now() - statSync(file).mtimeMs > CACHE_TTL) return null
  return readFileSync(file)
}

function readVarint(buf, pos) {
  let v = 0, shift = 0
  while (pos < buf.length) {
    const b = buf[pos++]
    v |= (b & 0x7f) << shift
    if (!(b & 0x80)) break
    shift += 7
  }
  return { value: v >>> 0, pos }
}

function collectStrings(buf) {
  const result = []
  let pos = 0
  while (pos < buf.length - 1) {
    try {
      const tag = readVarint(buf, pos)
      pos = tag.pos
      const wt = tag.value & 7
      if (wt === 0) {
        pos = readVarint(buf, pos).pos
      } else if (wt === 2) {
        const len = readVarint(buf, pos)
        pos = len.pos
        if (len.value > 0 && len.value < 5000 && pos + len.value <= buf.length) {
          const part = buf.slice(pos, pos + len.value)
          const str = part.toString('utf8')
          // Only keep strings that look like readable text (not binary garbage)
          if (str.length >= 1 && str.length <= 200) {
            const clean = str.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g, '')
            if (clean.length > 0 && clean.length === str.length) {
              result.push(clean)
            }
          }
        }
        pos += len.value
      } else if (wt === 1) { pos += 8 }
      else if (wt === 5) { pos += 4 }
      else { break }
    } catch { break }
  }
  return result
}

function parseSheetData(raw) {
  const lines = raw.split(/\r?\n/)
  const chunkMap = new Map()
  for (let i = 0; i + 3 < lines.length; i += 4) {
    const key = lines[i]
    if (!key || !key.startsWith('chunk_') || key === 'chunk_workbook') continue
    const b64 = lines[i + 3]
    if (!b64) continue
    try {
      const decompressed = inflateSync(Buffer.from(b64, 'base64'))
      const strs = collectStrings(decompressed)
      if (strs.length > 0) chunkMap.set(key, strs)
    } catch { }
  }
  return chunkMap
}

function isMetaString(s) {
  if (s === '3.0.0') return true
  if (/^[A-Z]{1,3}$/.test(s)) return true // ZB, MV, UI etc
  if (/^[a-z]\d+$/.test(s)) return true  // s4, q3, b2
  if (/^[0-9A-Fa-f]{6,8}$/.test(s)) return true // color codes
  if (/^[0-9]+$/.test(s)) return true // pure numbers
  if (/^[a-f0-9]{8,}-[a-f0-9]{4,}-/.test(s)) return true // UUID
  if (s.includes('outlook.com') || s.includes('qun.qq.com')) return true
  if (s === 'href' || s === 'https' || s === 'http') return true
  return false
}

function trySheetName(strs) {
  const knownSheets = ['兴趣群', '实验室', '学生社团', '填写说明']
  for (const s of strs) {
    if (knownSheets.includes(s)) return s
  }
  return null
}

function mergeChunks(chunkMap) {
  // Group chunks by sheet prefix (e.g. chunk_000001_*)
  const groups = new Map()
  for (const [key, strs] of chunkMap) {
    const m = key.match(/^chunk_(\w+)_/)
    if (!m) continue
    const prefix = m[1]
    if (!groups.has(prefix)) groups.set(prefix, [])
    groups.get(prefix).push(...strs)
  }
  return groups
}

function buildWorkbook(chunkMap) {
  const wb = XLSX.utils.book_new()
  const groups = mergeChunks(chunkMap)

  for (const [prefix, rawStrs] of groups) {
    // Filter metadata and deduplicate while preserving order
    const seen = new Set()
    const strs = []
    for (const s of rawStrs) {
      if (isMetaString(s)) continue
      if (seen.has(s)) continue
      seen.add(s)
      strs.push(s)
    }
    if (strs.length < 3) continue

    // Find sheet name (skip first if it's a known sheet name)
    const sheetName = trySheetName(strs)
    const dataStrs = sheetName ? strs.slice(strs.indexOf(sheetName) + 1) : strs

    // Find headers: longest consecutive run of strings that look like column headers
    // (CJK or meaningful text, before the first non-matching string)
    const headers = []
    let headerEnd = 0
    for (let i = 0; i < dataStrs.length; i++) {
      const s = dataStrs[i]
      // Column headers are typically short CJK strings (2-10 chars)
      if (/^[\u4e00-\u9fff]{2,12}$/.test(s) && headers.length < 30) {
        headers.push(s)
        headerEnd = i + 1
      } else if (headers.length >= 2) {
        break
      } else {
        headers.length = 0
        headerEnd = 0
      }
    }

    if (headers.length === 0) continue

    // Combine remaining strings as cell values
    const values = dataStrs.slice(headerEnd)
    // Filter values that are clearly not cell data
    const cellValues = values.filter(s => !isMetaString(s) && !/^[A-Za-z][:；]/.test(s))

    log(`  「${sheetName || headers[0]}」${headers.length} 列，${cellValues.length} 个值`)

    // Build rows
    const rows = [headers]
    let row = []
    for (const v of cellValues) {
      row.push(v)
      if (row.length === headers.length) {
        rows.push(row)
        row = []
      }
    }
    if (row.length > 0 && row.some(v => v)) rows.push(row)

    const ws = XLSX.utils.aoa_to_sheet(rows)
    const name = sheetName || headers[0] || prefix
    XLSX.utils.book_append_sheet(wb, ws, name)
  }
  return wb
}

async function syncSheets(docUrl) {
  const m = docUrl.match(/docs\.qq\.com\/sheet\/([A-Za-z0-9]+)/)
  if (!m) throw new Error('无法解析文档 ID')
  const docId = m[1]

  const tabMatch = docUrl.match(/[?&]tab=(\w+)/)
  const tab = tabMatch ? tabMatch[1] : ''

  log(`文档 ID: ${docId}` + (tab ? `，工作表: ${tab}` : ''))

  log('获取表格数据...')
  const dataUrl = `https://docs.qq.com/dop-api/sheet/data?id=${docId}` + (tab ? `&tab=${tab}` : '')
  const sheetRaw = await fetch(dataUrl)

  const chunkMap = parseSheetData(sheetRaw)
  if (chunkMap.size === 0) throw new Error('未找到有效数据块')

  log(`发现 ${chunkMap.size} 个数据块`)
  return buildWorkbook(chunkMap)
}

function json(res, data, code = 200) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
  res.end(JSON.stringify(data))
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,OPTIONS' })
    return res.end()
  }

  const u = new URL(req.url, `http://${req.headers.host || 'localhost'}`)

  if (u.pathname === '/health') {
    return json(res, { ok: true })
  }

  if (u.pathname !== '/api/xlsx' || !u.searchParams.get('url')) {
    return json(res, { error: 'Usage: /api/xlsx?url=<tencent-docs-url>' }, 400)
  }

  const url = u.searchParams.get('url')
  const key = cacheKey(url)
  const force = u.searchParams.get('force') === '1'

  log(`收到请求 ${key}` + (force ? ' [强制刷新]' : ''))

  if (!force) {
    const cached = fromCache(key)
    if (cached) {
      log('  → 命中缓存')
      res.writeHead(200, {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Access-Control-Allow-Origin': '*',
        'X-Cache': 'HIT'
      })
      return res.end(cached)
    }
  }

  if (!url.includes('docs.qq.com/sheet/')) {
    log('  → 不支持的 URL')
    return json(res, { error: '仅支持 docs.qq.com/sheet/ 链接' }, 400)
  }

  try {
    log('  → 开始同步...')
    const wb = await syncSheets(url)
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

    writeFileSync(join(CACHE_DIR, `${key}.xlsx`), buf)
    log('  → 同步完成，已缓存')

    res.writeHead(200, {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Access-Control-Allow-Origin': '*',
      'X-Cache': 'MISS'
    })
    res.end(buf)
  } catch (e) {
    log(`  → 同步失败：${e.message}`)
    json(res, { error: e.message }, 500)
  }
})

server.listen(PORT, () => {
  log(`服务已启动 http://localhost:${PORT}`)
}).on('error', err => {
  console.error(`[${ts()}] 启动失败：${err.message}`)
  process.exit(1)
})
