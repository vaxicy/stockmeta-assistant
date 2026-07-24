# StockMeta Assistant

> 为 Adobe Stock 供稿者（Contributor）打造的 Chrome 扩展，用视觉大模型一键生成图片的**英文标题（Title）与关键词（Keywords）**，并填充进 Adobe Stock 上传表单。**永不自动提交。**

A Chrome extension (Manifest V3) that helps Adobe Stock contributors generate English **titles and keywords** for their current asset using a vision model (SiliconFlow), then fills them into the Adobe Stock form with one click. **It never auto-submits.**

---

## ✨ 功能特性 / Features

- **AI 一键生成**：在 Adobe Stock Contributor 页面右侧注入侧边面板，读取当前选中素材图片，调用视觉大模型返回英文标题 + 关键词。
- **单字段独立刷新**：生成后可单独「重新生成标题」或「重新生成关键词」，无需整段重来。
- **一键应用 / 复制**：支持 `应用标题`、`应用关键词`、`全部应用`，以及 `复制标题`、`复制关键词`；生成结果可手动编辑。
- **图片预览**：面板内实时显示当前素材缩略图。
- **中英双语界面**：跟随浏览器语言或手动切换（英文 / 中文），所有动态文案均随语言切换。
- **设置页**：配置 SiliconFlow API Key、视觉模型 ID、关键词数量（1–50，默认 30），并支持「测试连接」。
- **弹窗入口**：扩展图标弹窗提供 Adobe Stock 上传页直达入口与设置入口。
- **自定义 Tooltip**：用 CSS 自绘提示替代原生 `title`，避免样式冲突。
- **面板折叠**：可折叠 / 展开面板，最小化占用屏幕空间。
- **健壮的错误处理**：覆盖 API Key 缺失、模型不存在、网络错误、超时、图片读取失败、JSON 解析失败、模型返回空内容等场景，扩展不会崩溃。
- **原生实现**：Manifest V3 + 原生 HTML/CSS/JS，无 React / Vue / TypeScript 依赖。

---

## 🔗 Chrome 网上应用店 / Chrome Web Store

- 开发者后台（编辑 listings）：
  https://chrome.google.com/webstore/devconsole/bd5c56c6-aa1a-43cc-98b7-e88a5441667e/afiigmeicppdepjodjeemfhmeimmbeio/edit

> 公开安装地址以 Chrome 网上应用店实际上线页面为准。

---

## 🚀 使用流程 / Workflow

1. 打开 Adobe Stock Contributor 页面：`https://contributor.stock.adobe.com/*`
2. 右侧自动注入 **StockMeta Assistant** 面板。
3. 点击 **Generate Title & Keywords**（生成标题和关键词）——读取当前图片并调用视觉模型，返回标题 + 关键词。
4. 查看 / 编辑结果，然后点击 **Apply Title**、**Apply Keywords** 或 **Apply All**；也可 **Copy** 或 **Retry**。
5. 在 Adobe Stock 页面**手动提交**素材。

---

## ⚙️ 安装（开发者模式）/ Install (Developer Mode)

1. 打开 `chrome://extensions`。
2. 开启右上角「开发者模式（Developer mode）」。
3. 点击「加载已解压的扩展程序（Load unpacked）」，选择本项目文件夹。
4. 点击拼图图标 → 固定 **StockMeta Assistant**。
5. 打开扩展「选项（Options）」（右键图标 → 选项，或面板内 ⚙ 设置），填写：
   - **SiliconFlow API Key**
   - **Vision Model ID**（如 `Qwen/Qwen3-Omni-30B-A3B-Captioner`）
   - **Keyword Count**（1–50，默认 30）
6. 点击 **Test Connection**，再点击 **Save**。
7. 进入 Adobe Stock Contributor 页面使用面板。

---

## 🧩 技术实现 / How It Works

- **Manifest V3**，Background Service Worker 负责 SiliconFlow API 调用与消息路由。
- **Content Script** 注入侧边面板，使用 `MutationObserver` 检测当前选中素材（依据 `aria-selected` / `data-selected` / `role` 等多重候选，而非单一 CSS class），切换素材后自动刷新状态。
- **图片自动读取**：`currentSrc` / `src` / `blob:` / `data:` → 缩放到最长边 1024px、JPEG 质量 0.82 → Base64。
- **Adobe 表单填充**：兼容 `<input>`、`<textarea>`、React 受控输入框与标签输入（tag input），填充后校验结果。
- **双语 UI**：`chrome.i18n` + 内嵌字典（`utils/i18n.js`）。
- **API Key 存储**：保存在 `chrome.storage.local`，永不硬编码。
- **视觉模型**：仅通过 `fetch()` 调用用户配置的 SiliconFlow 端点，代码全部打包在扩展内，**不使用远程代码**。

---

## 📂 项目结构 / Project Structure

```
stockmeta-assistant/
├── manifest.json
├── background/
│   └── background.js          # service worker: message router + API orchestration
├── content/
│   ├── content.js             # inject panel, observe selection, orchestrate UI
│   └── panel.css              # injected panel styles
├── services/
│   ├── config.js              # chrome.storage.local config access
│   └── siliconflow.js         # SiliconFlow chat-completions call + JSON parse
├── utils/
│   ├── i18n.js                # embedded en/zh dictionary + t()
│   ├── image.js               # findCurrentImage + Base64 conversion/resize
│   └── dom.js                 # find inputs + fill Adobe form (React/tag safe)
├── options/
│   ├── options.html / .css / .js
├── popup/
│   ├── popup.html / .css / .js
├── _locales/
│   ├── en/messages.json
│   └── zh_CN/messages.json
├── icons/
│   └── icon16/48/128.png
├── LICENSE
└── README.md
```

---

## 🐞 调试 / Debugging

打开 Adobe 页面控制台，使用：

```js
window.StockMetaDebug.findCurrentImage()  // 当前素材 <img>
window.StockMetaDebug.findTitleInput()    // 标题输入框
window.StockMetaDebug.findKeywordInput()  // 关键词输入框
```

---

## ⚠️ 已知限制 / Notes & Limitations

- Adobe Stock 的 DOM 可能变化；Content Script 使用多套候选选择器，选择器失效时优雅降级（报错而非崩溃）。
- 视觉模型须为支持 `image_url` 字段的 SiliconFlow 模型。
- 本扩展**不会**向 Adobe Stock 提交素材，仅负责生成与填写元数据。
- 若模型对部分图片（纯色、抽象、极简）返回空内容，会提示 `EMPTY_RESPONSE`，可换图重试。

---

## 📄 许可证 / License

本项目采用 **非商业使用许可证（Non-Commercial License）**。

- 允许个人非商业使用、学习研究与非商业分发（须保留版权与许可声明）。
- **禁止商业使用**，如需商业授权请联系作者。

详见 [LICENSE](./LICENSE) 文件。

This project is licensed under the **Non-Commercial License** — personal / non-commercial use and study are permitted; commercial use is prohibited without written permission. See [LICENSE](./LICENSE).
