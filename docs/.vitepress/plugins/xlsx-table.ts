import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import XLSX from 'xlsx'

const DANGER = 'style="color:#d32f2f;font-weight:bold"'

function esc(s: string): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }
  return s.replace(/[&<>"]/g, c => map[c] || c)
}

function sheetToHtml(sheet: XLSX.WorkSheet): string {
  const rows = XLSX.utils.sheet_to_json<any[][]>(sheet, { header: 1, defval: '' })
    .filter(r => r.some((c: any) => c != null && String(c).trim() !== ''))
  if (rows.length === 0) return '<p>（空表格）</p>'

  const header = rows[0]
  const body = rows.slice(1)
  const colCount = header.length

  const colWidths = new Array(colCount).fill(0)
  for (const row of rows) {
    for (let i = 0; i < colCount; i++) {
      const len = String(row[i] ?? '').replace(/[^\x00-\xff]/g, 'aa').length
      if (len > colWidths[i]) colWidths[i] = len
    }
  }

  let html = '<div class="xlsx-table-wrapper"><table>\n'
  html += '<colgroup>'
  for (const w of colWidths) {
    const pc = Math.min(Math.max(w * 1.8, 3), 30)
    html += `<col style="width:${pc.toFixed(1)}em">`
  }
  html += '</colgroup>\n'

  html += '<thead><tr>' + header.map((c, i) => `<th>${esc(String(c))}</th>`).join('') + '</tr></thead>\n'
  html += '<tbody>'
  for (const row of body) {
    const tds = row.map((c: any) => `<td>${esc(String(c))}</td>`).join('')
    html += `<tr>${tds}</tr>\n`
  }
  html += '</tbody>\n</table></div>\n'
  return html
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

    const qMatch = spec.match(/^(.+?)\?sheet=(.+)$/)
    if (qMatch) { spec = qMatch[1].trim(); targetSheet = qMatch[2].trim() }

    const hashIdx = spec.indexOf('#')
    if (hashIdx !== -1) { targetSheet = spec.slice(hashIdx + 1).trim(); spec = spec.slice(0, hashIdx).trim() }

    if (!spec) return `<p ${DANGER}>[xlsx] 未指定文件路径</p>`

    const filePath = resolve(baseDir, spec.replace(/^\//, ''))

    if (!existsSync(filePath)) return `<p ${DANGER}>[xlsx] 文件不存在：${esc(spec)}</p>`

    try {
      const wb = XLSX.readFile(filePath, { type: 'file' })
      const names = wb.SheetNames

      if (targetSheet) {
        const sheet = wb.Sheets[targetSheet]
        if (!sheet) return `<p ${DANGER}>[xlsx] 工作表 "${esc(targetSheet)}" 不存在（可用：${names.map(esc).join('、')}）</p>`
        return sheetToHtml(sheet)
      }

      if (names.length === 1) return sheetToHtml(wb.Sheets[names[0]])

      let out = ''
      for (const name of names) {
        out += `<h3 class="xlsx-sheet-title">${esc(name)}</h3>\n`
        out += sheetToHtml(wb.Sheets[name])
      }
      return out
    } catch (e: any) {
      return `<p ${DANGER}>[xlsx] 读取失败：${esc(e.message || String(e))}</p>`
    }
  }
}
