import { defineConfig, type DefaultTheme } from 'vitepress'
import { readdirSync, readFileSync, statSync } from 'fs'
import { resolve, extname, dirname, join } from 'path'
import { fileURLToPath } from 'url'
import taskLists from 'markdown-it-task-lists'
import { xlsxTablePlugin } from './plugins/xlsx-table'

const __dirname = dirname(fileURLToPath(import.meta.url))
const docsRoot = resolve(__dirname, '..')
const startRoot = resolve(docsRoot, 'start')

// ---- 侧边栏自动生成 ----
// 分组名称：文件夹 -> 中文名。缺少映射会在生成时报错，提醒补充。
const directoryLabels: Record<string, string> = {
  preface: '序言',
  newstudent: '新生入学',
  'campus-life': '校园生活',
  about: '关于',
}
// 顶层分组的展示顺序，未列出的目录排在最后并按名称排序。
const sectionOrder = ['preface', 'newstudent', 'campus-life', 'about']

function getDirectoryLabel(relativeDir: string): string {
  const label = directoryLabels[relativeDir]
  if (!label) {
    throw new Error(`文件夹缺少中文名映射：docs/start/${relativeDir}。请在 config.ts 的 directoryLabels 中添加。`)
  }
  if (!/[\u4e00-\u9fff]/.test(label)) {
    throw new Error(`文件夹的中文名映射必须包含中文字符：docs/start/${relativeDir}。请更新 config.ts 中的 directoryLabels。`)
  }
  return label
}

// 读取 Markdown 的一级标题，跳过代码块内的伪标题。
// 优先使用 frontmatter 中的 title，其次 # 标题，最后 <h1> 标签
function extractTitle(file: string): string {
  const raw = readFileSync(file, 'utf-8')

  // 检查 frontmatter title
  const fmMatch = raw.match(/^---\s*\n([\s\S]*?)\n---/)
  if (fmMatch) {
    const titleMatch = fmMatch[1].match(/^title:\s*(.+)$/m)
    if (titleMatch) return titleMatch[1].trim().replace(/^["'](.+)["']$/, '$1')
  }

  const lines = raw.split(/\r?\n/)
  let fence: string | null = null
  for (const line of lines) {
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/)
    if (fenceMatch) {
      const marker = fenceMatch[1][0]
      if (fence === null) fence = marker
      else if (fence === marker) fence = null
      continue
    }
    if (fence === null) {
      const heading = line.match(/^#(?!#)\s+(.+?)\s*$/)
      if (heading) return heading[1].replace(/\s+#+\s*$/, '').trim()
      const h1 = line.match(/<h1[^>]*>(.+?)<\/h1>/i)
      if (h1) return h1[1].trim()
    }
  }
  throw new Error(`Markdown 文件缺少一级标题：${file}`)
}

function extractTop(file: string): number | null {
  const raw = readFileSync(file, 'utf-8')
  const fmMatch = raw.match(/^---\s*\n([\s\S]*?)\n---/)
  if (!fmMatch) return null

  const topMatch = fmMatch[1].match(/^top:\s*(.+)$/m)
  if (!topMatch) return null

  const value = Number(topMatch[1].trim().replace(/^["'](.+)["']$/, '$1'))
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`Markdown 文件的 top 必须是从 1 开始的整数：${file}`)
  }
  return value
}

function sortMarkdownFiles<T extends { name: string, full: string, stat: ReturnType<typeof statSync> }>(a: T, b: T): number {
  const topA = extractTop(a.full)
  const topB = extractTop(b.full)
  if (topA !== null || topB !== null) {
    if (topA === null) return 1
    if (topB === null) return -1
    return topA - topB || a.stat.birthtimeMs - b.stat.birthtimeMs || a.name.localeCompare(b.name)
  }
  return a.stat.birthtimeMs - b.stat.birthtimeMs || a.name.localeCompare(b.name)
}

function hasMarkdown(dir: string): boolean {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      if (hasMarkdown(full)) return true
    } else if (extname(name) === '.md') {
      return true
    }
  }
  return false
}

// 目录内的条目：文件可用 frontmatter top 置顶排序，否则按创建时间从早到晚排序；子目录按名称排序并递归成组。
function buildItems(dir: string, relativeDir: string): DefaultTheme.SidebarItem[] {
  const entries = readdirSync(dir).map((name) => {
    const full = join(dir, name)
    return { name, full, stat: statSync(full) }
  })

  const items: DefaultTheme.SidebarItem[] = []

  const files = entries
    .filter((e) => e.stat.isFile() && extname(e.name) === '.md')
    .sort(sortMarkdownFiles)
  for (const file of files) {
    const base = file.name.replace(/\.md$/, '')
    const link = relativeDir ? `/start/${relativeDir}/${base}` : `/start/${base}`
    items.push({ text: extractTitle(file.full), link })
  }

  const dirs = entries
    .filter((e) => e.stat.isDirectory() && hasMarkdown(e.full))
    .sort((a, b) => a.name.localeCompare(b.name))
  for (const child of dirs) {
    const childRelative = relativeDir ? `${relativeDir}/${child.name}` : child.name
    items.push({
      text: getDirectoryLabel(childRelative),
      collapsed: false,
      items: buildItems(child.full, childRelative),
    })
  }

  return items
}

// 顶层：根目录 .md 作为独立条目，各文件夹按 sectionOrder 成组。
function buildStartSidebar(): DefaultTheme.SidebarItem[] {
  const entries = readdirSync(startRoot).map((name) => {
    const full = join(startRoot, name)
    return { name, full, stat: statSync(full) }
  })

  const groups: DefaultTheme.SidebarItem[] = []

  const rootFiles = entries
    .filter((e) => e.stat.isFile() && extname(e.name) === '.md')
    .sort(sortMarkdownFiles)
  for (const file of rootFiles) {
    groups.push({ text: extractTitle(file.full), link: `/start/${file.name.replace(/\.md$/, '')}` })
  }

  const dirs = entries
    .filter((e) => e.stat.isDirectory() && hasMarkdown(e.full))
    .sort((a, b) => {
      const rankA = sectionOrder.indexOf(a.name)
      const rankB = sectionOrder.indexOf(b.name)
      const orderA = rankA === -1 ? sectionOrder.length : rankA
      const orderB = rankB === -1 ? sectionOrder.length : rankB
      return orderA - orderB || a.name.localeCompare(b.name)
    })
  for (const dir of dirs) {
    groups.push({
      text: getDirectoryLabel(dir.name),
      collapsed: false,
      items: buildItems(dir.full, dir.name),
    })
  }

  return groups
}

// dev 模式下监听 docs/start：仅当生成结果（结构/标题/顺序）变化时重启，
// 普通正文编辑保持 VitePress 原生 HMR，不触发重启。
function sidebarWatchPlugin() {
  const signature = () => {
    try {
      return JSON.stringify(buildStartSidebar())
    } catch (err) {
      return `ERROR:${(err as Error).message}`
    }
  }
  return {
    name: 'qutwiki-sidebar-watch',
    configureServer(server: any) {
      let last = signature()
      let timer: ReturnType<typeof setTimeout> | null = null
      const check = () => {
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => {
          const next = signature()
          if (next !== last) {
            last = next
            server.restart()
          }
        }, 150)
      }
      server.watcher.add(startRoot)
      server.watcher.on('add', check)
      server.watcher.on('unlink', check)
      server.watcher.on('addDir', check)
      server.watcher.on('unlinkDir', check)
      server.watcher.on('change', check)
    },
  }
}

function countChineseChars(dir: string): number {
  let total = 0
  const entries = readdirSync(dir)
  for (const entry of entries) {
    const full = resolve(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry === '.vitepress' || entry.startsWith('.')) continue
      total += countChineseChars(full)
    } else if (extname(entry) === '.md') {
      try {
        const content = readFileSync(full, 'utf-8')
        const chinese = content.replace(/[^\u4e00-\u9fff]/g, '')
        total += chinese.length
      } catch {}
    }
  }
  return total
}

const totalK = (countChineseChars(docsRoot) / 1000).toFixed(1)

export default defineConfig({
  lang: 'zh-CN',
  title: 'QUTWiKi',
  description: '青岛理工大学 Wiki 知识库',
  lastUpdated: true,
  cleanUrls: true,
  vite: {
    plugins: [sidebarWatchPlugin()],
  },
  markdown: {
    config: (md) => {
      md.use(taskLists)
      md.use(xlsxTablePlugin, docsRoot)
      md.core.ruler.push('word_count', (state) => {
        if ((state.env as any).frontmatter?.wordCount === false) return
        const text = state.src.replace(/[^\u4e00-\u9fff]/g, '')
        const count = text.length
        if (count === 0) return
        const minutes = count < 150 ? '不到1分钟' : `约${Math.ceil(count / 350)}分钟`
        const tokens = state.tokens
        for (let i = 0; i < tokens.length; i++) {
          if (tokens[i].type === 'heading_open' && tokens[i].tag === 'h1') {
            const closeIdx = tokens.findIndex((t, j) => j > i && t.type === 'heading_close' && t.tag === 'h1')
            if (closeIdx !== -1) {
              const span = new state.Token('html_inline', '', 0)
              span.content = `<span class="word-count">${count}字 / ${minutes}</span>`
              tokens.splice(closeIdx, 0, span)
            }
            break
          }
        }
      })
      const origImg = md.renderer.rules.image || ((tokens: any, idx: any, options: any, _env: any, self: any) => self.renderToken(tokens, idx, options))
      md.renderer.rules.image = (tokens, idx, options, env, self) => {
        const token = tokens[idx]
        const alt = token.content || token.attrGet('alt') || ''
        let html = origImg(tokens, idx, options, env, self)
        if (alt) html += `<span class="img-caption">${alt}</span>`
        return html
      }
    },
  },
  head: [
    ['link', { rel: 'dns-prefetch', href: 'https://pic1.imgdb.cn' }],
    ['link', { rel: 'preconnect', href: 'https://pic1.imgdb.cn', crossorigin: '' }],
  ],
  themeConfig: {
    nav: [
      { text: '首页', link: '/' },
      {
        text: '更多',
        items: [
          { text: '更新日志', link: '/start/about/changelog' }
        ]
      }
    ],
    sidebar: {
      '/start/': buildStartSidebar(),
      '/': [
        {
          text: '站点',
          collapsed: false,
          items: [
            { text: '首页', link: '/' },
            { text: '更新日志', link: '/start/about/changelog' }
          ]
        }
      ]
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/LucasAndrew0120/QUT-WiKi' }
    ],
    footer: {
      message: `基于 VitePress 构建  ·  全站共计 <span style="color:rgb(1,93,149)">${totalK}K</span> 字`,
      copyright: 'Copyright © 2026 <a href="https://github.com/LucasAndrew0120/QUT-WiKi" style="color:inherit;">QUTWiKi</a>'
    },
    outline: { level: [2, 3], label: '本页导航' },
    docFooter: { prev: '上一篇', next: '下一篇' },
    lastUpdatedText: '最后更新于',
    search: { provider: 'local' }
  }
})
