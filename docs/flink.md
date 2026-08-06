---
title: 友情链接
sidebar: false
outline: false
---

<h1 align="center">友情链接</h1>

---

<flink>
  
</flink>

## 添加友链

在 `<flink>` 和 `</flink>` 之间按以下格式追加一条即可：

```markdown
<flink>
  - name: 站点名称
    link: https://example.com/
    avatar: 头像图片链接
    descr: 一句话描述
    siteshot: 友链卡片背景图链接
</flink>
```

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `name` | ✅ | 站点名称 |
| `link` | ✅ | 站点链接（建议 https） |
| `avatar` | ❌ | 头像图片链接 |
| `descr` | ❌ | 站点描述（也兼容 `desc`） |
| `siteshot` | ❌ | 友链卡片背景图链接 |

## 其他页面使用

在任意 Markdown 页面中可以直接用 `<flink>` 标签生成单张卡



多个连续书写（中间不要空行）自动排布为网格卡片。
