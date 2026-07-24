import { defineConfig } from 'vitepress'

export default defineConfig(
{
lang: 'zh-CN',
title: 'QUTWiKi',
description: '青岛理工大学 Wiki 知识库',
lastUpdated: true,
cleanUrls: true,
themeConfig: {
nav: [
        { text: '首页', link: '/' },
        {
text: '更多',
items: [
            { text: '更新日志', link: '/start/更新日志' },
            { text: 'API 示例', link: '/examples/api' }
            ]
        }
        ],
sidebar: {
'/start/': [
            {
text: '序言',
collapsed: true,
items: [
                { text: '项目介绍', link: '/start/项目介绍' },
                { text: '参与开发', link: '/start/参与编写' },
                { text: '加入我们', link: '/start/加入我们' }
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
        { icon: 'github', link: 'https://github.com/LucasAndrew0120/QUT-WiKi' }
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
