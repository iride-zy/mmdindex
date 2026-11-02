# 维护与提交

`mmd.json` 是唯一数据源。页面、编辑页和 `mmd.js` 都由它生成，不要手工改生成文件。

## 本地

```bash
node scripts/selftest.mjs
node scripts/validate.mjs
node scripts/build.mjs --out dist
```

打开 `dist/index.html` 即可预览。`dist/` 不提交。

## 修改已有条目

1. 在目录中打开条目，点「编辑此条」。
2. 修改字段；URL 会自动识别视频/文章，不要手工加视频标记。
3. 点「预览 JSON」，复制片段。
4. 在 `mmd.json` 中找到对应 `"seq"` 的对象，整体替换。
5. 提交 PR。

## 新增条目

1. 点页脚「新增条目」，或打开 `edit.html?new=1`。
2. `seq` 默认取当前最大值 + 1；`status` 默认 `pending`。
3. 填 `title`、`url`，按需补其他字段；确认公开时把 `status` 改成 `approved`。
4. 复制片段，追加到 `records` 数组末尾，并给前一条补逗号。
5. 提交 PR。

## 字段

- 已知 31 个 key 由 `src/schema.js` 定义；空值也保留。
- 自定义 key 可以新增、改名、删除，类型支持 string / number / boolean / JSON；导出和 `mmd.js` 会保留。
- 自定义 key 默认不出现在公开页；要展示，需要同时改 `src/page.template.html` 的 `VIEW` 和详情区。
- `readBody`、`anchor` 是字符串 `"true"`/`"false"`；`anchorConflict`、`reviewCleared`、`needsReview` 是布尔值。
- `videoPages`、`videoDuration` 是可选字符串，只用于展示；播放由 URL 自动识别。

## CI

- PR：`selftest` → `validate` → `build`，上传 `site-preview` artifact。
- 合并到 `main`：同一套检查后部署 GitHub Pages。
- 有错误会阻止构建；未知 key 只警告，不阻止。

### 首次启用 Pages

GitHub 的 `GITHUB_TOKEN` 不能创建 Pages 站点，只能部署。首次需要手动设置一次：

`Settings → Pages → Build and deployment → Source → GitHub Actions`

之后推送到 `main` 即可自动部署。私有仓库在免费账户下不能使用 Pages。

## 边界

- 编辑页只生成 JSON，不能写仓库，不保存 Token。
- `b23.tv` 短链、非 https、未知主机和重复 URL 会被拒绝。
- 视频能否播放取决于 B 站（地区、付费、删除等）；页面始终保留「打开原文」。
