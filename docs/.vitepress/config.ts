import { defineConfig } from 'vitepress'
import { readdirSync, readFileSync, statSync } from 'fs'
import { resolve, extname, dirname } from 'path'
import { fileURLToPath } from 'url'
import taskLists from 'markdown-it-task-lists'

const __dirname = dirname(fileURLToPath(import.meta.url))
const docsRoot = resolve(__dirname, '..')

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
  markdown: {
    config: (md) => {
      md.use(taskLists)
      md.core.ruler.push('word_count', (state) => {
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
      '/start/': [
        {
          text: '序言',
          collapsed: false,
          items: [
            { text: '项目介绍', link: '/start/preface/introduction' },
            
          ]
        },
        {
          text: '新生入学',
          collapsed: false,
          items: [
            { text: '学校建筑', link: '/start/newstudent/campus-buildings' },
            { text: '防骗防诈', link: '/start/newstudent/anti-fraud' },
            { text: '交通出行', link: '/start/newstudent/transportation' }
          ]
        },
        {
          text: '关于',
          collapsed: false,
          items: [
            { text: '参与贡献', link: '/start/about/contribute' },
            { text: '加入我们', link: '/start/about/join-us' },
            { text: '更新日志', link: '/start/about/changelog' },
            { text: '开发&编写计划', link: '/start/about/todo' },
          ]
        }
      ],
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
