import { defineConfig } from 'vitepress'

export default defineConfig({
  lang: 'zh-CN',
  title: 'QUTWiKi',
  description: '青岛理工大学 Wiki 知识库',
  lastUpdated: true,
  cleanUrls: true,
  markdown: {
    config: (md) => {
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
          { text: '更新日志', link: '/changelog' }
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
            { text: '加入我们', link: '/start/preface/join-us' },
            { text: '参与编写', link: '/start/preface/contribute' }
          ]
        },
        {
          text: '新生入学',
          collapsed: false,
          items: [
            { text: '学校建筑', link: '/start/newstudent/campus-buildings' },
            { text: '防骗防诈', link: '/start/newstudent/anti-fraud' }
          ]
        },
      ],
      '/': [
        {
          text: '站点',
          collapsed: false,
          items: [
            { text: '首页', link: '/' },
            { text: '更新日志', link: '/changelog' }
          ]
        }
      ]
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/LucasAndrew0120/QUT-WiKi' }
    ],
    footer: {
      message: '基于 VitePress 构建',
      copyright: 'Copyright © 2026 <a href="https://github.com/LucasAndrew0120/QUT-WiKi" style="color:inherit;">QUTWiKi</a>'
    },
    outline: { level: [2, 3], label: '本页导航' },
    docFooter: { prev: '上一篇', next: '下一篇' },
    lastUpdatedText: '最后更新于',
    search: { provider: 'local' }
  }
})
