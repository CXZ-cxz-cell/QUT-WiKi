import { defineConfig } from 'vitepress'

export default defineConfig({
  lang: 'zh-CN',
  title: 'QUTWiKi',
  description: '青岛理工大学 Wiki 知识库',
  lastUpdated: true,
  cleanUrls: true,
  themeConfig: {
    nav: [
      { text: '首页', link: '/' },
      { text: '指南', link: '/guide/getting-started' },
      {
        text: '更多',
        items: [
          { text: 'Markdown 示例', link: '/examples/markdown' },
          { text: 'API 示例', link: '/examples/api' }
        ]
      }
    ],
    sidebar: {
      '/guide/': [
        {
          text: '序言',
          items: [
            { text: '项目介绍', link: '/guide/getting-started' },
            { text: '参与开发', link: '/guide/configuration' }
          ]
        }
      ],
      '/examples/': [
        {
          text: '示例',
          items: [
            { text: 'Markdown 示例', link: '/examples/markdown' },
            { text: 'API 示例', link: '/examples/api' }
          ]
        }
      ]
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/' }
    ],
    footer: {
      message: '基于 VitePress 构建',
      copyright: 'Copyright © 2026 QUTWiKi'
    },
    outline: { level: [2, 3], label: '本页导航' },
    docFooter: { prev: '上一篇', next: '下一篇' },
    lastUpdatedText: '最后更新于',
    search: { provider: 'local' }
  }
})
