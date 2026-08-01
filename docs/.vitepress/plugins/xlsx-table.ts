import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { resolve, join, dirname } from 'path'
import { tmpdir } from 'os'
import { execSync } from 'child_process'
import XLSX from 'xlsx'

const DANGER = 'style="color:#d32f2f;font-weight:bold"'
const TEN_API = process.env.QUTWIKI_XLSX_API || 'http://sync.wiki.quters.top'
const CACHE_TTL = 3600000

function esc(s: string): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }
  return s.replace(/[&<>"]/g, c => map[c] || c)
}

function syncDownloadFile(url: string): Buffer | null {
  const tmpFile = join(tmpdir(), `xlsx_${Date.now()}_${Math.random().toString(36).slice(2)}.xlsx`)
  const scriptFile = join(tmpdir(), `xlsx_dl_${Date.now()}.js`)
  writeFileSync(scriptFile, `
    fetch(${JSON.stringify(url)})
      .then(r => { if (!r.ok) throw new Error(r.status + ' ' + r.statusText); return r.arrayBuffer() })
      .then(b => require('fs').writeFileSync(${JSON.stringify(tmpFile)}, Buffer.from(b)))
      .catch(() => process.exit(1))
  `)
  try {
    execSync(`node "${scriptFile}"`, { timeout: 30000, stdio: 'pipe', windowsHide: true })
    const buf = readFileSync(tmpFile)
    return buf
  } catch {
    return null
  } finally {
    try { unlinkSync(tmpFile) } catch {}
    try { unlinkSync(scriptFile) } catch {}
  }
}

function syncTencentDoc(docUrl: string, cacheDir: string): Buffer | null {
  const match = docUrl.match(/docs\.qq\.com\/sheet\/([A-Za-z0-9]+)/)
  if (!match) return null
  const docId = match[1]

  const cacheFile = join(cacheDir, `${docId}.xlsx`)
  if (existsSync(cacheFile)) {
    const age = Date.now() - require('fs').statSync(cacheFile).mtimeMs
    if (age < CACHE_TTL) return readFileSync(cacheFile)
  }

  const apiUrl = `${TEN_API}/api/xlsx?url=${encodeURIComponent(docUrl)}`
  const tmpFile = join(tmpdir(), `xlsx_tc_${Date.now()}.xlsx`)
  const scriptFile = join(tmpdir(), `xlsx_tc_fetch_${Date.now()}.js`)
  writeFileSync(scriptFile, `
    require('http').get(${JSON.stringify(apiUrl)}, function (res) {
      if (res.statusCode !== 200) process.exit(1)
      var chunks = []
      res.on('data', function (c) { chunks.push(c) })
      res.on('end', function () { require('fs').writeFileSync(${JSON.stringify(tmpFile)}, Buffer.concat(chunks)) })
    }).on('error', function () { process.exit(1) })
  `)
  try {
    execSync(`node "${scriptFile}"`, { timeout: 60000, stdio: 'pipe', windowsHide: true })
    if (existsSync(tmpFile)) {
      const buf = readFileSync(tmpFile)
      mkdirSync(dirname(cacheFile), { recursive: true })
      writeFileSync(cacheFile, buf)
      return buf
    }
  } catch { } finally {
    try { unlinkSync(tmpFile) } catch { }
    try { unlinkSync(scriptFile) } catch { }
  }
  return null
}

function sheetToHtml(sheet: XLSX.WorkSheet, keyCols: string[], hideCols: string[], contactCols: string[], avatarCol: string | null, descCol: string | null, tagCols: string[], nameCol: string | null): string {
  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
  const rows = rawRows.filter(r => r.some((c: any) => c != null && String(c).trim() !== ''))
  if (rows.length === 0) return '<p>（空表格）</p>'

  const header = rows[0].map((c: any) => String(c).trim())
  const body = rows.slice(1)
  const hideSet = new Set(hideCols)
  const contactSet = new Set(contactCols)
  const tagSet = new Set(tagCols)

  const keyIndices: number[] = []
  for (const k of keyCols) {
    const idx = header.findIndex(h => h === k)
    if (idx === -1) return `<p ${DANGER}>[xlsx] 主键列 "${esc(k)}" 不存在（可用：${header.map(esc).join('、')}）</p>`
    keyIndices.push(idx)
  }

  const avatarIdx = avatarCol ? header.findIndex(h => h === avatarCol) : -1
  if (avatarCol && avatarIdx === -1) return `<p ${DANGER}>[xlsx] 头像列 "${esc(avatarCol)}" 不存在（可用：${header.map(esc).join('、')}）</p>`
  const descIdx = descCol ? header.findIndex(h => h === descCol) : -1
  if (descCol && descIdx === -1) return `<p ${DANGER}>[xlsx] 描述列 "${esc(descCol)}" 不存在（可用：${header.map(esc).join('、')}）</p>`
  const nameIdx = nameCol ? header.findIndex(h => h === nameCol) : -1
  if (nameCol && nameIdx === -1) return `<p ${DANGER}>[xlsx] 名称列 "${esc(nameCol)}" 不存在（可用：${header.map(esc).join('、')}）</p>`

  for (const ki of keyIndices) {
    let lastVal = ''
    for (const row of body) {
      const v = String(row[ki] ?? '').trim()
      if (v) { lastVal = v } else { row[ki] = lastVal }
    }
  }

  const groups = keyIndices.length > 0 ? buildGroups(body, keyIndices[0]) : new Map<string, any[][]>([['', body]])
  const titleIdx = nameIdx >= 0 ? nameIdx : (keyIndices.length >= 2 ? keyIndices[1] : (keyIndices.length === 1 ? keyIndices[0] : -1))
  let html = '<div class="xlsx-cards">\n'

  for (const [gName, gRows] of groups) {
    if (gName) {
      html += `<div class="xlsx-card-group">\n`
      html += `<h3 class="xlsx-card-group-title">${esc(gName)}</h3>\n`
    }
    html += '<div class="xlsx-card-grid">\n'
    for (const row of gRows) {
      html += renderCard(header, row, titleIdx, descIdx, avatarIdx, hideSet, contactSet, tagSet)
    }
    html += '</div>\n'
    if (gName) html += '</div>\n'
  }

  html += '</div>\n'
  return html
}

function buildGroups(body: any[][], keyIdx: number): Map<string, any[][]> {
  const groups = new Map<string, any[][]>()
  for (const row of body) {
    const k = String(row[keyIdx] ?? '').trim()
    if (!k) continue
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(row)
  }
  return groups
}

function genAvatarUrl(val: string): string {
  if (!val) return ''
  if (val.startsWith('http://') || val.startsWith('https://')) return val
  return `https://p.qlogo.cn/gh/${val}/${val}/0/`
}

function renderCard(header: string[], row: any[], titleIdx: number, descIdx: number, avatarIdx: number, hideSet: Set<string>, contactSet: Set<string>, tagSet: Set<string>): string {
  const title = titleIdx >= 0 ? String(row[titleIdx] ?? '').trim() : ''
  const desc = descIdx >= 0 ? String(row[descIdx] ?? '').trim() : ''
  const avatarVal = avatarIdx >= 0 ? String(row[avatarIdx] ?? '').trim() : ''
  const avatarUrl = genAvatarUrl(avatarVal)
  const avatarChar = title ? (title.replace(/[a-zA-Z0-9]/g, '').charAt(0) || title.charAt(0)) : ''

  const LINK_SVG = `<svg class="xlsx-card-link-icon" viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M10.86 8.52a3.3 3.3 0 0 0 0-4.66L9.45 2.45a3.3 3.3 0 0 0-4.66 0a3.3 3.3 0 0 0 0 4.66l.47.47a.75.75 0 0 0 1.06-1.06l-.47-.47a1.8 1.8 0 0 1 2.54-2.54l1.41 1.41a1.8 1.8 0 0 1 0 2.54l-.47.47a.75.75 0 1 0 1.06 1.06z"/><path d="M4.67 7.49a3.3 3.3 0 0 0 0 4.66l1.41 1.41a3.3 3.3 0 0 0 4.66 0a3.3 3.3 0 0 0 0-4.66l-.47-.47a.75.75 0 0 0-1.06 1.06l.47.47a1.8 1.8 0 0 1-2.54 2.54l-1.41-1.41a1.8 1.8 0 0 1 0-2.54l.47-.47a.75.75 0 0 0-1.06-1.06z"/></svg>`

  let tagHtml = ''
  let infoHtml = ''

  for (let i = 0; i < header.length; i++) {
    const val = String(row[i] ?? '').trim()
    if (!val) continue
    if (i === titleIdx) continue
    if (i === descIdx) continue
    if (i === avatarIdx) continue
    if (hideSet.has(header[i])) continue

    if (contactSet.has(header[i])) {
      const parts = val.split('\n').filter(Boolean)
      infoHtml += parts.map(v => `<span class="xlsx-card-link">${LINK_SVG}<span>${esc(v)}</span></span>`).join('')
    } else if (tagSet.size > 0 ? tagSet.has(header[i]) : true) {
      const parts = val.split(/[\n,，]/).map(s => s.trim()).filter(Boolean)
      tagHtml += parts.map(v => `<span class="xlsx-badge">${esc(v)}</span>`).join('')
    }
  }

  let infoSection = ''
  if (infoHtml) {
    infoSection = `<div class="xlsx-card-info">${infoHtml}</div>`
  }

  return `<div class="xlsx-card">
  <div class="xlsx-card-face">
    ${avatarUrl ? `<img class="xlsx-card-blur-bg" src="${esc(avatarUrl)}" alt="">` : ''}
    ${avatarUrl ? `<div class="xlsx-card-banner"><img class="xlsx-card-avatar-el" src="${esc(avatarUrl)}" alt=""></div>` : ''}
    ${!avatarUrl && title ? `<div class="xlsx-card-avatar">${esc(avatarChar)}</div>` : ''}
    <div class="xlsx-card-name">${esc(title)}</div>
    ${desc ? `<div class="xlsx-card-desc">${esc(desc)}</div>\n` : ''}
    ${tagHtml ? `<div class="xlsx-card-tags">${tagHtml}</div>\n` : ''}
    ${infoSection}
  </div>
</div>\n`
}

export function xlsxTablePlugin(md: any, baseDir: string) {
  const origFence = md.renderer.rules.fence || function (tokens: any, idx: number, opts: any, _env: any, self: any) {
    return self.renderToken(tokens, idx, opts)
  }

  md.renderer.rules.fence = (tokens: any, idx: number, opts: any, env: any, self: any) => {
    const token = tokens[idx]
    const info = (token.info || '').trim()

    if (!info.startsWith('xlsx')) {
      return origFence(tokens, idx, opts, env, self)
    }

    let spec = info.slice(4).trim()
    let targetSheet: string | null = null
    let keyCols: string[] = []
    let hideCols: string[] = []
    let contactCols: string[] = []
    let avatarCol: string | null = null
    let descCol: string | null = null
    let tagCols: string[] = []
    let nameCol: string | null = null

    let qs = ''
    const spIdx = spec.indexOf(' ')
    if (spIdx !== -1) {
      qs = spec.slice(spIdx + 1).trim()
      spec = spec.slice(0, spIdx).trim()
    } else {
      const qIdx = spec.indexOf('?')
      if (qIdx !== -1) {
        qs = spec.slice(qIdx + 1)
        spec = spec.slice(0, qIdx).trim()
      }
    }
    if (qs) {
      for (const p of qs.split('&')) {
        const eqIdx = p.indexOf('=')
        if (eqIdx === -1) continue
        const name = p.slice(0, eqIdx).trim()
        const vals = p.slice(eqIdx + 1).split(',').map(s => s.trim()).filter(Boolean)
        if (name === 'key') keyCols = vals
        else if (name === 'hide') hideCols = vals
        else if (name === 'contact') contactCols = vals
        else if (name === 'avatar') avatarCol = vals[0] || null
        else if (name === 'desc') descCol = vals[0] || null
        else if (name === 'tag') tagCols = vals
        else if (name === 'name') nameCol = vals[0] || null
        else if (name === 'sheet' || name === 'table') targetSheet = vals[0] || null
      }
    }

    if (!targetSheet) {
      const hashIdx = spec.indexOf('#')
      if (hashIdx !== -1) { targetSheet = spec.slice(hashIdx + 1).trim(); spec = spec.slice(0, hashIdx).trim() }
    }

    if (!spec) return `<p ${DANGER}>[xlsx] 未指定文件路径</p>`

    const isUrl = spec.startsWith('http://') || spec.startsWith('https://')
    const httpCacheDir = resolve(baseDir, '.http_cache')

    try {
      let wb: XLSX.WorkBook
      if (isUrl) {
        if (spec.includes('docs.qq.com/sheet/')) {
          const buf = syncTencentDoc(spec, httpCacheDir)
          if (!buf || buf.length === 0) return `<p ${DANGER}>[xlsx] 腾讯文档同步失败，请确保后端服务已启动：<br><code>cd code && npm start</code></p>`
          wb = XLSX.read(buf, { type: 'buffer' })
        } else {
          const buf = syncDownloadFile(spec)
          if (!buf || buf.length === 0) return `<p ${DANGER}>[xlsx] 下载失败：${esc(spec)}</p>`
          wb = XLSX.read(buf, { type: 'buffer' })
        }
      } else {
        const filePath = resolve(baseDir, spec.replace(/^\//, ''))
        if (!existsSync(filePath)) return `<p ${DANGER}>[xlsx] 文件不存在：${esc(spec)}</p>`
        wb = XLSX.readFile(filePath)
      }
      const names = wb.SheetNames

      if (targetSheet) {
        const sheet = wb.Sheets[targetSheet]
        if (!sheet) return `<p ${DANGER}>[xlsx] 工作表 "${esc(targetSheet)}" 不存在（可用：${names.map(esc).join('、')}）</p>`
        return sheetToHtml(sheet, keyCols, hideCols, contactCols, avatarCol, descCol, tagCols, nameCol)
      }

      if (names.length === 1) return sheetToHtml(wb.Sheets[names[0]], keyCols, hideCols, contactCols, avatarCol, descCol, tagCols, nameCol)

      let out = ''
      for (const name of names) {
        out += `<h3 class="xlsx-sheet-title">${esc(name)}</h3>\n`
        out += sheetToHtml(wb.Sheets[name], keyCols, hideCols, contactCols, avatarCol, descCol, tagCols, nameCol)
      }
      return out
    } catch (e: any) {
      return `<p ${DANGER}>[xlsx] 读取失败：${esc(e.message || String(e))}</p>`
    }
  }
}
