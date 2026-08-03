import { createServer } from 'node:http'
import { CACHE_DIR, CACHE_TTL, cacheKey, fromCache, isTencentSheetUrl, log, refreshCache, ts } from './xlsx-sync.mjs'

const PORT = Number(process.env.PORT || 3456)

function json(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  })
  res.end(JSON.stringify(data))
}

function sendXlsx(res, buffer, cacheStatus) {
  res.writeHead(200, {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Length': buffer.length,
    'Access-Control-Allow-Origin': '*',
    'X-Cache': cacheStatus,
  })
  res.end(buffer)
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,OPTIONS',
    })
    return res.end()
  }

  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  if (requestUrl.pathname === '/health') return json(res, { ok: true })

  const docUrl = requestUrl.searchParams.get('url')
  if (requestUrl.pathname !== '/api/xlsx' || !docUrl) {
    return json(res, { error: '用法：/api/xlsx?url=<腾讯文档链接>' }, 400)
  }
  if (!isTencentSheetUrl(docUrl)) {
    return json(res, { error: '仅支持 https://docs.qq.com/sheet/ 链接' }, 400)
  }

  const key = cacheKey(docUrl)
  const force = requestUrl.searchParams.get('force') === '1'
  log(`收到请求 ${key}${force ? ' [强制刷新]' : ''}`)

  if (!force) {
    const cached = fromCache(key)
    if (cached) {
      log('  → 命中缓存')
      return sendXlsx(res, cached, 'HIT')
    }
  }

  try {
    log('  → 开始同步')
    const { buffer } = await refreshCache(docUrl)
    log(`  → 同步完成，缓存 ${buffer.length} 字节`)
    sendXlsx(res, buffer, 'MISS')
  } catch (error) {
    log(`  → 同步失败：${error.message}`)
    json(res, { error: error.message }, 502)
  }
})

server.listen(PORT, () => {
  log(`服务已启动 http://localhost:${PORT}`)
  log(`缓存目录：${CACHE_DIR}`)
  log(`缓存有效期：${CACHE_TTL / 60000} 分钟`)
}).on('error', error => {
  console.error(`[${ts()}] 启动失败：${error.message}`)
  process.exit(1)
})
