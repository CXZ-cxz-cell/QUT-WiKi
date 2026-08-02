// 从腾讯文档下载表格数据，保存为本地 xlsx
// 用法: node docs/scripts/sync-tencent-docs.mjs [腾讯文档URL] [输出路径]
// 默认输出到 docs/resources/QUT-Organization.xlsx

import { chromium } from 'playwright'
import { writeFileSync } from 'fs'
import { resolve } from 'path'
import XLSX from 'xlsx'

const DOC_URL = process.argv[2] || 'https://docs.qq.com/sheet/DSE9ZcUd3dFhpVmVm?tab=000003'
const OUT_PATH = resolve(process.argv[3] || 'docs/resources/QUT-Organization.xlsx')

function getCellText(cell) {
  if (!cell) return ''
  if (cell.formattedValue && typeof cell.formattedValue.value === 'string') return cell.formattedValue.value
  if (typeof cell.value === 'string') return cell.value
  if (cell.value && cell.value.r) return cell.value.r.map(run => run.t || '').join('')
  return ''
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  
  console.log(`[sync] 打开 ${DOC_URL} ...`)
  await page.goto(DOC_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  
  // 等待 SpreadsheetApp 加载
  await page.waitForFunction(() => window.SpreadsheetApp?.workbook?.worksheetManager, { timeout: 30000 })
  console.log('[sync] 表格加载完成')
  
  // 获取所有 sheet 信息
  const sheetInfo = await page.evaluate(() => {
    const wm = window.SpreadsheetApp.workbook.worksheetManager
    const list = wm.getSheetList()
    return list.map(s => ({ id: s.getSheetId(), name: s.getSheetName() }))
  })
  
  console.log(`[sync] 发现 ${sheetInfo.length} 个工作表: ${sheetInfo.map(s => s.name).join(', ')}`)
  
  const workbook = XLSX.utils.book_new()
  
  for (const { id, name } of sheetInfo) {
    console.log(`[sync] 读取 "${name}" ...`)
    
    // 切换到该 sheet
    await page.evaluate((sid) => {
      const wb = window.SpreadsheetApp.workbook
      wb.activeSheetId = sid
    }, id)
    
    // 等待数据加载
    await page.waitForTimeout(2000)
    
    // 提取数据
    const rows = await page.evaluate((sid) => {
      const sheet = window.SpreadsheetApp.workbook.worksheetManager.getSheetBySheetId(sid)
      if (!sheet) return []
      const cdg = sheet.cellDataGrid
      const totalRows = sheet.getRowCount()
      const totalCols = sheet.getColCount()
      
      function getCellText(cell) {
        if (!cell) return ''
        if (cell.formattedValue && typeof cell.formattedValue.value === 'string') return cell.formattedValue.value
        if (typeof cell.value === 'string') return cell.value
        if (cell.value && cell.value.r) return cell.value.r.map(run => run.t || '').join('')
        return ''
      }
      
      const data = []
      for (let r = 0; r < totalRows; r++) {
        let hasData = false
        const row = []
        for (let c = 0; c < totalCols; c++) {
          const text = getCellText(cdg.getCellData(r, c))
          row.push(text)
          if (text) hasData = true
        }
        if (hasData) data.push(row)
        // 如果连续10行没数据，停止
        if (!hasData && data.length > 0) {
          let emptyCount = 0
          for (let i = data.length - 1; i >= 0 && data[i].every(v => !v); i--) emptyCount++
          if (emptyCount >= 10) break
        }
      }
      return data
    }, id)
    
    if (rows.length === 0) {
      console.log(`  (空)`)
      continue
    }
    
    console.log(`  ${rows.length} 行数据`)
    const ws = XLSX.utils.aoa_to_sheet(rows)
    XLSX.utils.book_append_sheet(workbook, ws, name)
  }
  
  writeFileSync(OUT_PATH, XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }))
  console.log(`[sync] 已保存到 ${OUT_PATH}`)
  
  await browser.close()
}

main().catch(e => {
  console.error('[sync] 失败:', e.message)
  process.exit(1)
})
