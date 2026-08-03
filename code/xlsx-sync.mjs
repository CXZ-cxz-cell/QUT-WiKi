import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'
import XLSX from 'xlsx'

export const CACHE_DIR = process.env.CACHE_DIR || join(tmpdir(), 'qutwiki_xlsx_cache')
export const CACHE_TTL = Number(process.env.CACHE_TTL || 60 * 60 * 1000)

const syncing = new Map()
mkdirSync(CACHE_DIR, { recursive: true })

export function ts() {
  return new Date().toLocaleString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' })
}

export function log(...args) {
  console.log(`[${ts()}]`, ...args)
}

export function cacheKey(url) {
  const match = url.match(/docs\.qq\.com\/sheet\/([A-Za-z0-9]+)/)
  return match ? match[1] : Buffer.from(url).toString('base64url').slice(0, 20)
}

export function cacheFile(key) {
  return join(CACHE_DIR, `${key}.xlsx`)
}

export function fromCache(key) {
  const file = cacheFile(key)
  if (!existsSync(file)) return null
  if (Date.now() - statSync(file).mtimeMs > CACHE_TTL) return null
  return readFileSync(file)
}

export function isTencentSheetUrl(url) {
  return /^https:\/\/docs\.qq\.com\/sheet\/[A-Za-z0-9]+/.test(url)
}

export async function syncSheets(docUrl) {
  log('启动 Chromium...')
  const browser = await puppeteer.launch({
    args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  })

  try {
    const page = await browser.newPage()
    log(`打开腾讯文档：${docUrl}`)
    await page.goto(docUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForFunction(() => {
      const manager = window.SpreadsheetApp?.workbook?.worksheetManager
      return manager?.getSheetList?.().length > 0
    }, { timeout: 60000, polling: 500 })

    const sheetInfo = await page.evaluate(() => {
      const manager = window.SpreadsheetApp.workbook.worksheetManager
      return manager.getSheetList().map(sheet => ({
        id: sheet.getSheetId(),
        name: sheet.getSheetName(),
      }))
    })
    log(`发现 ${sheetInfo.length} 个工作表：${sheetInfo.map(sheet => sheet.name).join('、')}`)

    const workbook = XLSX.utils.book_new()
    for (const { id, name } of sheetInfo) {
      log(`读取工作表「${name}」...`)
      const sheetUrl = new URL(docUrl)
      sheetUrl.searchParams.set('tab', id)
      await page.goto(sheetUrl.href, { waitUntil: 'domcontentloaded', timeout: 30000 })
      await page.waitForFunction((sheetId) => {
        const workbook = window.SpreadsheetApp?.workbook
        return workbook?.worksheetManager?.getSheetBySheetId?.(sheetId)?.cellDataGrid
      }, { timeout: 60000, polling: 500 }, id)
      await new Promise(resolve => setTimeout(resolve, 2000))

      const rows = await page.evaluate((sheetId) => {
        const sheet = window.SpreadsheetApp.workbook.worksheetManager.getSheetBySheetId(sheetId)
        if (!sheet) return []
        const grid = sheet.cellDataGrid
        const rowCount = sheet.getRowCount()
        const colCount = sheet.getColCount()
        const data = []
        let trailingEmptyRows = 0

        function textOf(cell) {
          if (!cell) return ''
          if (cell.formattedValue && typeof cell.formattedValue.value === 'string') return cell.formattedValue.value
          if (typeof cell.value === 'string' || typeof cell.value === 'number') return String(cell.value)
          if (cell.value?.r) return cell.value.r.map(run => run.t || '').join('')
          return ''
        }

        for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
          const row = []
          let hasData = false
          for (let colIndex = 0; colIndex < colCount; colIndex++) {
            const text = textOf(grid.getCellData(rowIndex, colIndex))
            row.push(text)
            if (text) hasData = true
          }

          if (hasData) {
            trailingEmptyRows = 0
            data.push(row)
          } else if (data.length > 0 && ++trailingEmptyRows >= 10) {
            break
          }
        }
        const usedColumns = data.reduce((max, row) => {
          for (let index = row.length - 1; index >= 0; index--) {
            if (row[index]) return Math.max(max, index + 1)
          }
          return max
        }, 0)
        return data.map(row => row.slice(0, usedColumns))
      }, id)

      if (rows.length === 0) {
        log('  → 空表，跳过')
        continue
      }

      log(`  → ${rows.length} 行数据`)
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name)
    }

    if (workbook.SheetNames.length === 0) throw new Error('腾讯文档中没有可读取的工作表')
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
  } finally {
    try {
      await Promise.race([
        browser.close(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Chromium 关闭超时')), 10000)),
      ])
      log('Chromium 已关闭')
    } catch (error) {
      log(`${error.message}，强制结束 Chromium`)
      browser.process()?.kill('SIGKILL')
    }
  }
}

export function syncOnce(key, url) {
  if (syncing.has(key)) {
    log(`  → 文档正在同步，等待已有任务：${key}`)
    return syncing.get(key)
  }

  const task = syncSheets(url).finally(() => syncing.delete(key))
  syncing.set(key, task)
  return task
}

export async function refreshCache(docUrl) {
  const key = cacheKey(docUrl)
  const buffer = await syncOnce(key, docUrl)
  const file = cacheFile(key)
  writeFileSync(file, buffer)
  return { buffer, file, key }
}
