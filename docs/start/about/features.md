# 站点功能说明

本页介绍 QUTWiKi 在 VitePress 基础上自行开发的功能，方便编写者查阅使用。

---

## 一、XLSX 表格卡片渲染

在 Markdown 中引用 Excel 文件，自动转为卡片网格展示。

### 基本语法

````markdown
```xlsx /resources/文件.xlsx?key=一级分组列,二级标题列&hide=隐藏列1,隐藏列2&contact=联系方式列
```
````

### 参数说明

| 参数 | 说明 | 示例 |
|------|------|------|
| `?key=A,B` | A 为一级分组（`h3` 标题），B 为二级标题（卡片名称） | `key=业务指导单位,学生社团名称` |
| `&hide=C,D` | 隐藏的列（不渲染） | `hide=序号,备注` |
| `&contact=E,F` | 底部联系方式（`|` 分隔，线框样式） | `contact=姓名,性别,专业班级` |
| `&table=Sheet名` | 指定工作表（默认读取第一个） | `table=Sheet1` |

### 卡片布局

从上到下：圆形头像（取名称首字）→ 名称 → 中间 tag → 底部联系方式。多值用 Excel 内换行 (`Alt+Enter`) 分隔，渲染后自动拆分为独立 tag。

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
