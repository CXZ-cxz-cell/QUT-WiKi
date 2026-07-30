import { existsSync } from 'fs'
import { resolve } from 'path'
import XLSX from 'xlsx'

const DANGER = 'style="color:#d32f2f;font-weight:bold"'

function esc(s: string): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }
  return s.replace(/[&<>"]/g, c => map[c] || c)
}

function sheetToHtml(sheet: XLSX.WorkSheet, keyCols: string[], hideCols: string[], contactCols: string[]): string {
  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
  const rows = rawRows.filter(r => r.some((c: any) => c != null && String(c).trim() !== ''))
  if (rows.length === 0) return '<p>（空表格）</p>'

  const header = rows[0].map((c: any) => String(c).trim())
  const body = rows.slice(1)
  const hideSet = new Set(hideCols)
  const contactSet = new Set(contactCols)

  const keyIndices: number[] = []
  for (const k of keyCols) {
    const idx = header.findIndex(h => h === k)
    if (idx === -1) return `<p ${DANGER}>[xlsx] 主键列 "${esc(k)}" 不存在（可用：${header.map(esc).join('、')}）</p>`
    keyIndices.push(idx)
  }

  for (const ki of keyIndices) {
    let lastVal = ''
    for (const row of body) {
      const v = String(row[ki] ?? '').trim()
      if (v) { lastVal = v } else { row[ki] = lastVal }
    }
  }

  const groups = keyIndices.length > 0 ? buildGroups(body, keyIndices[0]) : new Map<string, any[][]>([['', body]])
  const titleIdx = keyIndices.length >= 2 ? keyIndices[1] : -1
  let html = '<div class="xlsx-cards">\n'

  for (const [gName, gRows] of groups) {
    if (gName) {
      html += `<div class="xlsx-card-group">\n`
      html += `<h3 class="xlsx-card-group-title">${esc(gName)}</h3>\n`
    }
    html += '<div class="xlsx-card-grid">\n'
    for (const row of gRows) {
      html += renderCard(header, row, titleIdx, hideSet, contactSet)
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

function renderCard(header: string[], row: any[], titleIdx: number, hideSet: Set<string>, contactSet: Set<string>): string {
  const title = titleIdx >= 0 ? String(row[titleIdx] ?? '').trim() : ''
  let tagHtml = ''
  let infoHtml = ''

  for (let i = 0; i < header.length; i++) {
    const val = String(row[i] ?? '').trim()
    if (!val) continue
    if (i === titleIdx) continue
    if (hideSet.has(header[i])) continue

    if (contactSet.has(header[i])) {
      const parts = val.split('\n').filter(Boolean)
      infoHtml += `<span class="xlsx-info-item">${parts.map(esc).join('、')}</span>\n`
    } else {
      const parts = val.split('\n').filter(Boolean)
      tagHtml += parts.map(v => `<span class="xlsx-badge">${esc(v)}</span>\n`).join('')
    }
  }

  const avatarChar = title ? (title.replace(/[a-zA-Z0-9]/g, '').charAt(0) || title.charAt(0)) : ''

  return `<div class="xlsx-card">
  <div class="xlsx-card-face">
    <div class="xlsx-card-avatar">${esc(avatarChar)}</div>
    <div class="xlsx-card-name">${esc(title)}</div>
    ${tagHtml ? `<div class="xlsx-card-tags">${tagHtml}</div>\n` : ''}
    ${infoHtml ? `<div class="xlsx-card-info">${infoHtml}</div>\n` : ''}
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

    const qIdx = spec.indexOf('?')
    if (qIdx !== -1) {
      let qs = spec.slice(qIdx + 1)
      spec = spec.slice(0, qIdx).trim()
      for (const p of qs.split('&')) {
        const eqIdx = p.indexOf('=')
        if (eqIdx === -1) continue
        const name = p.slice(0, eqIdx).trim()
        const vals = p.slice(eqIdx + 1).split(',').map(s => s.trim()).filter(Boolean)
        if (name === 'key') keyCols = vals
        else if (name === 'hide') hideCols = vals
        else if (name === 'contact') contactCols = vals
        else if (name === 'sheet' || name === 'table') targetSheet = vals[0] || null
      }
    }

    if (!targetSheet) {
      const hashIdx = spec.indexOf('#')
      if (hashIdx !== -1) { targetSheet = spec.slice(hashIdx + 1).trim(); spec = spec.slice(0, hashIdx).trim() }
    }

    if (!spec) return `<p ${DANGER}>[xlsx] 未指定文件路径</p>`

    const filePath = resolve(baseDir, spec.replace(/^\//, ''))

    if (!existsSync(filePath)) return `<p ${DANGER}>[xlsx] 文件不存在：${esc(spec)}</p>`

    try {
      const wb = XLSX.readFile(filePath)
      const names = wb.SheetNames

      if (targetSheet) {
        const sheet = wb.Sheets[targetSheet]
        if (!sheet) return `<p ${DANGER}>[xlsx] 工作表 "${esc(targetSheet)}" 不存在（可用：${names.map(esc).join('、')}）</p>`
        return sheetToHtml(sheet, keyCols, hideCols, contactCols)
      }

      if (names.length === 1) return sheetToHtml(wb.Sheets[names[0]], keyCols, hideCols, contactCols)

      let out = ''
      for (const name of names) {
        out += `<h3 class="xlsx-sheet-title">${esc(name)}</h3>\n`
        out += sheetToHtml(wb.Sheets[name], keyCols, hideCols, contactCols)
      }
      return out
    } catch (e: any) {
      return `<p ${DANGER}>[xlsx] 读取失败：${esc(e.message || String(e))}</p>`
    }
  }
}
