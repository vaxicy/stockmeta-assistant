# StockMeta Assistant

A Chrome Extension (Manifest V3) that helps Adobe Stock Contributors generate
titles and keywords for their current asset using a vision model (SiliconFlow),
then fills them into the Adobe Stock form with one click. **It never auto-submits.**

## Workflow

1. Open an asset on `https://contributor.stock.adobe.com/*`.
2. The AI Assistant panel is injected on the right.
3. Click **Generate Metadata** — the current image is read, sent to the vision
   model, and a Title + Keywords are returned.
4. Review / edit the results, then **Apply Title**, **Apply Keywords**, or
   **Apply All**. You can also **Copy** or **Retry**.
5. Submit manually on Adobe Stock.

## Features

- Manifest V3, native HTML/CSS/JS (no React/Vue/TypeScript).
- Background Service Worker handles SiliconFlow API calls.
- Content Script injects a side panel and detects the selected asset via
  `MutationObserver` (uses `aria-selected` / `data-selected` / `role` etc., not a
  single CSS class).
- Image auto-read: `currentSrc` / `src` / `blob:` / `data:` → resized to max
  1024px longest edge, JPEG quality 0.82, converted to Base64.
- Adobe form filling compatible with `<input>`, `<textarea>`, React-controlled
  inputs, and tag inputs. Fill result is verified.
- Bilingual UI (English / 中文) via `chrome.i18n` + embedded dictionaries.
- API Key stored in `chrome.storage.local` — never hardcoded.
- Robust error handling (missing key, model not found, network, timeout, image
  read failure, JSON parse failure) — the extension never crashes.

## Install (Developer Mode)

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top-right).
3. Click **Load unpacked** and select this project folder.
4. Click the puzzle icon → pin **StockMeta Assistant**.
5. Open the extension **Options** (right-click icon → Options, or the ⚙ in the
   panel) and enter:
   - **SiliconFlow API Key**
   - **Vision Model ID** (e.g. `Qwen/Qwen3-Omni-30B-A3B-Captioner`)
   - **Keyword Count** (1–50, default 30)
6. Click **Test Connection**, then **Save**.
7. Go to your Adobe Stock Contributor page and use the panel.

## Project Structure

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
└── README.md
```

## Debugging

Open the Adobe page console and use:

```js
window.StockMetaDebug.findCurrentImage()  // current asset <img>
window.StockMetaDebug.findTitleInput()    // title input element
window.StockMetaDebug.findKeywordInput()  // keyword input element
```

## Notes / Limitations

- Adobe Stock's DOM may change; the content script uses multiple candidate
  selectors and degrades gracefully (shows an error instead of crashing) if a
  selector no longer matches.
- The vision model must be a SiliconFlow model that accepts image URLs in the
  chat-completions `image_url` field.
- This extension does **not** submit assets to Adobe Stock.
