# 青理 Wiki（QUTWiKi）

青岛理工大学 Wiki 知识库，由学生自发维护的生活指南，帮助新生和在校生快速获取校园生活、学习资源、社团活动等实用信息。

## 本地开发

```bash
npm install
npm run dev       # 启动开发服务器 http://localhost:5173
npm run build     # 构建生产版本
```

网站基于 [VitePress](https://vitepress.dev/) 构建，文档使用 Markdown 编写。

## 致谢

本项目的部分前端样式和后端代码参考了[西邮 Wiki](https://wiki.cooo.site/)（[xupt-wiki/xupt-wiki](https://github.com/xupt-wiki/xupt-wiki)），在此感谢西邮 Wiki 项目组的无私开源。

校园地图功能参考了[重庆大学校园地图导航系统](https://github.com/littlemana-bot/CQUMAPS)（[CQUMAPS](https://github.com/littlemana-bot/CQUMAPS)）与[重庆大学资源共享计划 CQU-openlib](https://github.com/INFO-studio/CQU-openlib)（[cqu-openlib.cn/map](https://cqu-openlib.cn/map)）的页面布局、交互设计与配色方案，在此感谢两个项目的无私开源。

## 参与编写

详见 [参与编写](https://wiki.quters.top/start/about/contribute) 页面，内容涵盖环境准备、文档规范、提交流程等完整指引。

## 项目结构

```
.
├── .gitattributes              # GitHub Linguist 配置
├── .gitignore
├── build.ps1                   # Windows 本地开发启动脚本
├── package.json
├── README.md
│
└── docs/                       # VitePress 文档根目录
    ├── index.md                # 首页
    ├── public/
    │   └── _redirects          # 静态重定向规则
    │
    ├── .vitepress/             # VitePress 配置与主题
    │   ├── config.ts           # 站点配置
    │   ├── contributors-mapping.json
    │   ├── scripts/
    │   │   └── gen-contributors.mjs   # 贡献者信息生成
    │   └── theme/
    │       ├── index.ts               # 主题入口
    │       ├── MyLayout.vue           # 自定义布局
    │       ├── style.css              # 自定义样式
    │       └── components/
    │           ├── Contributors.vue   # 贡献者组件
    │           └── Gallery.vue        # 图片集组件
    │
    └── start/
        ├── preface/
        │   └── introduction.md       # 前言 / 项目介绍
        ├── newstudent/               # 新生入学
        │   ├── anti-fraud.md         # 防诈骗指南
        │   ├── campus-buildings.md   # 校园建筑
        │   ├── campus-card.md        # 校园卡
        │   ├── campus-network.md     # 校园网
        │   ├── military-assistant.md # 军训助手
        │   └── transportation.md     # 交通出行
        ├── campus-life/              # 校园生活
        │   ├── academic-system.md    # 教务系统
        │   ├── library-reservation.md# 图书馆预约
        │   ├── smart-QUT.md          # 智慧学工系统
        │   ├── tuition-fee.md        # 学费缴纳
        │   └── utility-bill.md       # 水电费缴纳
        └── about/                    # 关于 Wiki
            ├── changelog.md          # 更新日志
            ├── contribute.md         # 参与编写
            ├── join-us.md            # 加入我们
            └── todo.md               # 编写计划
```

