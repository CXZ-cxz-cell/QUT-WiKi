# 青理 Wiki（QUTWiKi）

青岛理工大学 Wiki 知识库，由学生自发维护的生活指南，帮助新生和在校生快速获取校园生活、学习资源、社团活动等实用信息。

## 本地开发

```bash
npm install
npm run dev       # 启动开发服务器 http://localhost:5173
npm run build     # 构建生产版本
```

网站基于 [VitePress](https://vitepress.dev/) 构建，文档使用 Markdown 编写。

## 参与编写

详见 [参与编写](https://qutwiki.pages.dev/start/参与编写) 页面，内容涵盖环境准备、文档规范、提交流程等完整指引。

## 项目结构

```
docs/                  # 文档根目录
├── index.md           # 首页
├── 更新日志.md         # 更新日志
├── .vitepress/        # VitePress 配置
└── start/             # 所有内容目录
    ├── 项目介绍.md
    ├── 加入我们.md
    ├── 参与编写.md
    ├── newstudent/    # 新生入学
    ├── examples/      # 示例
    └── ...            # 更多按需扩展
```
