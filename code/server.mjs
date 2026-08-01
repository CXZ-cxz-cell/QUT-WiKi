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

function extractStrings(buf) {
  const text = buf.toString('utf8')
  const re = /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffefa-zA-Z0-9\.\-\+\:\/]{2,}/g
  return [...new Set(text.match(re) || [])]
}

function parseSheetData(raw) {
  // response format: key, text, len, value (4 lines per entry)
  const lines = raw.split(/\r?\n/)
  const strings = []
  for (let i = 0; i + 3 < lines.length; i += 4) {
    const key = lines[i]
    if (!key || !key.startsWith('chunk_')) continue
    // skip workbook chunk (just metadata)
    if (key === 'chunk_workbook') continue
    const b64 = lines[i + 3]
    if (!b64) continue
    try {
      const decompressed = inflateSync(Buffer.from(b64, 'base64'))
      const strs = extractStrings(decompressed)
      strings.push({ key, strs })
    } catch { }
  }
  return strings
}

function filterMeta(strs) {
  const meta = new Set([
    '3.0.0', 'ZB', 's4', 'q3', 'b2',
    'code', 'QUTWiKi', 'docs', 'resources',
    'href', 'https', 'http',
  ])
  return strs.filter(s =>
    !meta.has(s) &&
    !/^[0-9A-Fa-f]{6,}$/.test(s) &&
    !/^[0-9]+$/.test(s) &&
    !/^[a-f0-9]{8,}-[a-f0-9]{4,}/.test(s) &&
    !s.includes('outlook.com') &&
    !s.includes('qun.qq.com')
  )
}

function buildWorkbook(chunks, targetSheet) {
  const wb = XLSX.utils.book_new()
  const chunkNames = chunks.map(c => c.key).join(', ')
  log(`  数据块：${chunkNames}`)

  for (const { key, strs } of chunks) {
    const cleaned = filterMeta(strs)
    if (cleaned.length === 0) continue

    // First match to sheet name
    const sheetNameMatch = key.match(/chunk_([a-zA-Z0-9]+)_/)
    const sheetId = sheetNameMatch ? sheetNameMatch[1] : 'unknown'

    // Find headers: consecutive meaningful strings at the start
    const headers = []
    let headerEnd = 0
    for (let i = 0; i < cleaned.length; i++) {
      const s = cleaned[i]
      if (s === sheetId) continue
      if (/^[\u4e00-\u9fff]/.test(s) && headers.length < 20) {
        headers.push(s)
        headerEnd = i + 1
      } else if (headers.length > 0) {
        break
      }
    }

    if (headers.length === 0) continue

    // Remaining strings after headers are cell values
    const values = cleaned.slice(headerEnd)
    log(`  「${headers[0]}」${headers.length} 列，${values.length} 个值`)

    // Build rows
    const rows = [headers]
    let row = []
    for (const v of values) {
      row.push(v)
      if (row.length === headers.length) {
        rows.push(row)
        row = []
      }
    }
    if (row.length > 0) rows.push(row)

    const ws = XLSX.utils.aoa_to_sheet(rows)
    const name = targetSheet || headers[0] || sheetId
    XLSX.utils.book_append_sheet(wb, ws, name)
  }
  return wb
}

async function syncSheets(docUrl) {
  // Extract doc ID
  const m = docUrl.match(/docs\.qq\.com\/sheet\/([A-Za-z0-9]+)/)
  if (!m) throw new Error('无法解析文档 ID')
  const docId = m[1]

  // Get tab parameter from URL
  const tabMatch = docUrl.match(/[?&]tab=(\w+)/)
  const tab = tabMatch ? tabMatch[1] : ''

  log(`文档 ID: ${docId}` + (tab ? `，工作表: ${tab}` : ''))

  // Step 1: Get sheet list via opendoc API
  log('获取工作表列表...')
  const openUrl = `https://docs.qq.com/dop-api/opendoc?id=${docId}&normal=1&outformat=1&wb=1&nowb=0` + (tab ? `&tab=${tab}` : '')
  const openRaw = await fetch(openUrl)
  const openJson = JSON.parse(openRaw)

  // Step 2: Get sheet data
  log('获取表格数据...')
  const dataUrl = `https://docs.qq.com/dop-api/sheet/data?id=${docId}` + (tab ? `&tab=${tab}` : '')
  const sheetRaw = await fetch(dataUrl)

  // Step 3: Parse chunks
  const chunks = parseSheetData(sheetRaw)
  if (chunks.length === 0) throw new Error('未找到有效数据块')

  // Step 4: Build workbook
  return buildWorkbook(chunks, '')
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
