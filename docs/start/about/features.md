# 站点功能说明

本页介绍 QUTWiKi 在 VitePress 基础上自行开发的功能，方便编写者查阅使用。

---

## 一、XLSX 表格卡片渲染

在 Markdown 中引用 Excel 文件，自动转为卡片网格展示。

### 基本语法

````markdown
```xlsx /resources/文件.xlsx?name=卡片名称列&key=分组列1,分组列2&hide=隐藏列1,隐藏列2&contact=联系方式列&avatar=头像列&desc=描述列&tag=标签列
```
````

### 参数说明

| 参数 | 说明 | 示例 |
|------|------|------|
| `?name=A` | 卡片名称列 | `name=学生社团名称` |
| `&key=B,C` | 分组列，支持多级分组（`h3` 标题）。<br>不填则不分组，所有卡片平铺。 | `key=业务指导单位` |
| `&hide=D,E` | 隐藏的列（不渲染） | `hide=序号` |
| `&contact=F,G` | 底部联系方式，每个值前带链接图标 | `contact=联系方式` |
| `&avatar=H` | 头像列：URL 直接使用，QQ 群号自动拼接 `p.qlogo.cn` 地址 | `avatar=群头像链接` |
| `&desc=I` | 描述列，显示在名称下方 | `desc=简介` |
| `&tag=J,K` | 标签列（逗号分隔），指定后**只**渲染这些列为标签；<br>不指定时回退到旧行为：所有非隐藏/非联系列自动变为标签 | `tag=备注` |
| `&table=Sheet名` | 指定工作表（默认读取第一个） | `table=兴趣群` |
| `#Sheet名` | 等价于 `table=Sheet名`（写 URL 后面） | `文件.xlsx#兴趣群` |

### 卡片布局

当指定 **`avatar`** 参数时（新版样式）：
```
模糊背景图 → 圆形头像 → 名称 → 描述 → 标签 → 底部联系方式（带链接图标）
```
未指定 `avatar` 时（旧版兼容）：
```
文字圆形头像 → 名称 → 标签 → 联系方式
```

多值分隔规则：
- **tag** 列：按中英文逗号 `,` `，` 或换行 `↵` 分割为独立标签
- **contact** 列：按换行 `↵` 分割，多值用竖线 `|` 分隔
- **avatar** 列：URL 直接使用，纯数字自动拼接为 `https://p.qlogo.cn/gh/{数字}/{数字}/0/`

### URL 远程下载

fence 路径支持远程 URL，构建时自动下载后解析：

````markdown
```xlsx https://example.com/data.xlsx?key=名称&avatar=头像
```
````

> 注意：腾讯文档等在线平台需要公开权限才能直接下载。可使用 `docs/scripts/sync-tencent-docs.mjs` 同步脚本配合 Playwright 从腾讯文档下载。

---

## 二、Gallery 图片画廊

将多张图片按原始比例排列为杂志式网格布局。

### 用法

图片无需指定宽高，组件自动按原始比例适配每行高度：

```md
<Gallery :row-height="220" :gap="8">

![图片说明](https://example.com/pic1.jpg)

![图片说明](https://example.com/pic2.jpg)

</Gallery>
```

| 属性 | 默认值 | 说明 |
|------|--------|------|
| `row-height` | `220` | 每行目标高度 (px)，为空时自动计算 |
| `gap` | `8` | 图片间距 (px) |

> 图片前后需保留空行，否则不会被解析。

---

## 三、贡献者自动识别

每条文档底部会自动显示 Git 贡献者头像。由 `docs/.vitepress/scripts/gen-contributors.mjs` 在构建前通过 `git log` 生成 `contributors.json`。

无需手动配置，每次 `npm run build` 或 `npm run dev` 自动执行。

关联配置：
- `docs/.vitepress/contributors-mapping.json`——手动映射邮箱到 GitHub 用户名

---

## 四、Frontmatter 扩展配置

QUTWiKi 在 VitePress 原生 frontmatter 之外新增以下配置项：

```yaml
---
wordCount: false
---
```

| 配置项 | 类型 | 默认 | 说明 |
|--------|------|------|------|
| `wordCount` | boolean | `true` | `false` 关闭字数统计与阅读时间 |

---

## 五、构建脚本

项目根目录的 `build.ps1` 一键构建并启动开发服务器：

```powershell
.\build.ps1
```

流程：生成贡献者数据 → `npm run build` → 清理 5173 端口旧进程 → `npm run dev`
