<div align="center">

<img src="icons/icon128.png" width="80" alt="StockMeta Assistant logo">

# StockMeta Assistant

**为 Adobe Stock 供稿者打造的 Chrome 扩展** —— 用视觉模型为图片生成**英文标题与关键词**，并填入上传表单。

A Chrome extension for Adobe Stock contributors: it generates English **titles and keywords** with a vision model and fills them into the upload form.

<br>

![Version](https://img.shields.io/badge/version-1.3.0-blue)
![License](https://img.shields.io/badge/license-Non--Commercial-red)
[![Chrome Web Store](https://img.shields.io/badge/Chrome_Web_Store-Add_to_Chrome-4285F4?logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/stockmeta-assistant-for-a/afiigmeicppdepjodjeemfhmeimmbeio)

</div>

---

> 💡 **永不自动提交** —— 扩展只负责生成与填写元数据，是否上传由你手动决定。

## 📑 目录 / Contents

- [功能特性 / Features](#-功能特性--features)
- [Chrome 网上应用店 / Chrome Web Store](#-chrome-网上应用店--chrome-web-store)
- [使用流程 / Workflow](#-使用流程--workflow)
- [安装 / Install](#-安装开发者模式--install-developer-mode)
- [技术实现 / How It Works](#-技术实现--how-it-works)
- [项目结构 / Structure](#-项目结构--project-structure)
- [调试 / Debugging](#-调试--debugging)
- [已知限制 / Limitations](#-已知限制--notes--limitations)
- [许可证 / License](#-许可证--license)

---

## ✨ 功能特性 / Features

| 功能 | 说明 |
| --- | --- |
| 🤖 **生成标题与关键词** | 在 Contributor 页面右侧注入面板，读取当前选中的素材，调用视觉模型返回英文标题与关键词。 |
| 🔌 **多家服务商** | 支持 SiliconFlow、OpenAI、Gemini（OpenAI 兼容层）与任意 OpenAI 兼容端点。 |
| 🔁 **单字段重新生成** | 可单独重新生成标题或关键词，无需整体重来。 |
| 📋 **应用与复制** | 支持 `应用标题`、`应用关键词`、`全部应用`，以及 `复制标题`、`复制关键词`；结果可手动编辑。 |
| 🖼️ **图片预览** | 面板内实时显示当前素材缩略图。 |
| 🌐 **中英双语界面** | 跟随浏览器语言或手动切换，所有动态文案均随语言切换。 |
| ⚙️ **设置页** | 配置服务商、API Key、模型 ID 与关键词数量（1–50，默认 30），支持「测试连接」。 |
| 🚀 **弹窗入口** | 扩展图标弹窗提供 Adobe Stock 上传页与设置页入口。 |
| 💬 **自定义 Tooltip** | 用 CSS 自绘提示替代原生 `title`，避免样式冲突。 |
| ↔️ **面板折叠** | 可折叠 / 展开面板，最小化占用屏幕空间；默认展开或折叠可在设置里选择。 |
| ⚡ **批量处理** | 设置中开启后，点一次「生成标题和关键词」即自动处理网格里所有待处理素材（逐张生成 → 校验卡片关键词 → 保存）。 |
| 🗑️ **批量删除红点素材** | 设置中开启后，面板会显示独立按钮，可一次性删除字段已填但仍标记为红点、无法提交的素材。只处理红点素材，删除前二次确认，删除后不可恢复。 |
| 🛡️ **错误处理** | 覆盖 Key 缺失、模型不存在、网络超时、图片读取、JSON 解析与空内容等场景，扩展不崩溃。 |
| 🧱 **原生实现** | Manifest V3 + 原生 HTML/CSS/JS，无框架依赖。 |

---

## 🔗 Chrome 网上应用店 / Chrome Web Store

[![Add to Chrome](https://img.shields.io/badge/Chrome_Web_Store-Add_to_Chrome-4285F4?logo=googlechrome&logoColor=white&style=for-the-badge)](https://chromewebstore.google.com/detail/stockmeta-assistant-for-a/afiigmeicppdepjodjeemfhmeimmbeio)

> 点击上方按钮前往 Chrome 网上应用店安装本扩展。

---

## 🚀 使用流程 / Workflow

1. 打开 Adobe Stock Contributor 页面：`https://contributor.stock.adobe.com/*`
2. 右侧自动注入 **StockMeta Assistant** 面板。
3. 点击 **Generate Title & Keywords** —— 读取当前图片并调用视觉模型，返回标题 + 关键词。
4. 查看 / 编辑结果，然后点击 **Apply Title**、**Apply Keywords** 或 **Apply All**；也可 **Copy** 或 **Retry**。
5. 在 Adobe Stock 页面**手动提交**素材。

---

## ⚙️ 安装（开发者模式）/ Install (Developer Mode)

1. 打开 `chrome://extensions`。
2. 开启右上角「开发者模式（Developer mode）」。
3. 点击「加载已解压的扩展程序（Load unpacked）」，选择本项目文件夹。
4. 点击拼图图标 → 固定 **StockMeta Assistant**。
5. 打开扩展「选项（Options）」（右键图标 → 选项，或面板内 ⚙ 设置），填写：
   - **Provider**：SiliconFlow / OpenAI / Gemini / 自定义
   - **API Key**
   - **Model ID**：默认依次为 `Qwen/Qwen3-Omni-30B-A3B-Captioner`、`gpt-4o-mini`、`gemini-2.5-flash`
   - **Keyword Count**（1–50，默认 30）
6. 点击 **Test Connection**，再点击 **Save**。
7. 进入 Adobe Stock Contributor 页面使用面板。

---

## 🧩 技术实现 / How It Works

- **Manifest V3**，Background Service Worker 负责 AI 接口调用与消息路由。
- **Content Script** 注入侧边面板，使用 `MutationObserver` 检测当前选中素材（依据 `aria-selected` / `data-selected` / `role` 等多重候选，而非单一 CSS class），切换素材后自动刷新状态。
- **图片自动读取**：`currentSrc` / `src` / `blob:` / `data:` → 缩放到最长边 1024px、JPEG 质量 0.82 → Base64。
- **Adobe 表单填充**：兼容 `<input>`、`<textarea>`、React 受控输入框与标签输入（tag input），填充后校验结果。
- **双语 UI**：`chrome.i18n` + 内嵌字典（`utils/i18n.js`）。
- **API Key 存储**：保存在 `chrome.storage.local`，不写入代码。
- **模型调用**：仅通过 `fetch()` 请求用户配置的服务商端点，代码全部打包在扩展内，**不使用远程代码**。

---

## 📂 项目结构 / Project Structure

```
stockmeta-assistant/
├── manifest.json
├── background/
│   └── background.js          # service worker: message router + API orchestration
├── content/
│   ├── content.js             # inject panel, observe selection, orchestrate UI
│   ├── batch.js               # batch generation over the grid
│   ├── delete.js              # bulk delete of red-dot assets
│   └── panel.css              # injected panel styles
├── services/
│   ├── config.js              # chrome.storage.local config access
│   └── aiProvider.js          # OpenAI-compatible chat-completions call + JSON parse
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
├── docs/
│   └── privacy-policy.html    # hosted via GitHub Pages
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

## 🔒 隐私 / Privacy

- API Key 与设置保存在 `chrome.storage.local`，仅存在于本机。
- 仅在生成时把当前素材的缩略图（最长边 1024px 的 JPEG）发送到你在设置中选择的服务商；请求不经过任何开发者服务器，也不会上传其他数据。
- 扩展不会向 Adobe Stock 提交素材，所有提交动作由你手动完成。
- 完整隐私政策：[Privacy Policy](https://vaxicy.github.io/stockmeta-assistant/privacy-policy.html)

---

## 📄 许可证 / License

本项目采用 **非商业使用许可证（Non-Commercial License）**。

- ✅ 允许：个人非商业使用、学习研究与非商业分发（须保留版权与许可声明）。
- ❌ 禁止：商业使用，如需商业授权请联系作者。

详见 [LICENSE](./LICENSE) 文件。

*This project is licensed under the **Non-Commercial License** — personal / non-commercial use and study are permitted; commercial use is prohibited without written permission. See [LICENSE](./LICENSE).*
