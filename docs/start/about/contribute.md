# 参与编写

本指南介绍如何向青理 Wiki（QUTWiKi）贡献内容。

---

## 一、准备环境

- [Node.js](https://nodejs.org/) 18+，推荐 [nvm-windows](https://github.com/coreybutler/nvm-windows)
- [Git](https://git-scm.com/)，配置用户名和邮箱
- 推荐编辑器：[VS Code](https://code.visualstudio.com/)

::: tip 国内加速
```bash
npm config set registry https://registry.npmmirror.com
```
:::

---

## 二、获取代码

```bash
# Fork 后在 GitHub 上复制你的仓库地址
git clone https://github.com/YOUR_USERNAME/QUTWiKi.git
cd QUTWiKi
```

---

## 三、安装并预览

```bash
npm install
npm run dev
```

浏览器访问 `http://localhost:5173`，修改 `.md` 后自动热更新。或直接运行 `.\build.ps1`。

---

## 四、编写文档

### 文件位置

`docs/start/` 下按目录分类存放：

| 目录 | 内容 |
|------|------|
| `newstudent/` | 新生入学 |
| `campus-life/` | 校园生活 |
| `about/` | 关于本站 |

### 命名与格式

- 小写英文 + 短横线：`canteen-guide.md`
- 必含一个 `# 标题`，或写 `title: 标题` 在 frontmatter 中
- 更多自定义功能（xlsx 表格、Gallery 画廊、贡献者显示等）见 [站点功能说明](./features)

---

## 五、提交 PR

```bash
git checkout -b docs/我的文档
git add .
git commit -m "新增: 文档说明"
git push origin docs/我的文档
```

在 GitHub 上发起 Pull Request，base 分支选 `contribute`。

---

## 六、注意事项

- 每次贡献前先 `git pull` 最新代码
- 一 PR 一事，不混入无关修改
- 引用资料注明出处，个人信息须经本人同意
- 收到 review 后在同一分支继续修改并 push 即可
