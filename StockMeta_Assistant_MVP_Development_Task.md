# StockMeta Assistant（MVP）开发任务

## 项目目标

开发一个 Chrome Extension（Manifest V3），用于 Adobe Stock Contributor
页面。

实现流程：

Adobe 当前素材 → 自动读取当前选中图片 → 调用 SiliconFlow 视觉模型 →
返回英文 Title + Keywords → 用户确认 → 自动填写 Adobe Stock 标题和关键词

**不要自动提交 Adobe Stock。**

------------------------------------------------------------------------

# 技术要求

-   Manifest V3
-   原生 HTML / CSS / JavaScript
-   不使用 React、Vue、TypeScript
-   Background Service Worker
-   Content Script
-   chrome.storage.local
-   中英文 i18n
-   模块化代码

------------------------------------------------------------------------

# 推荐目录

``` text
stockmeta-assistant/
├── manifest.json
├── background/
├── content/
├── services/
├── utils/
├── options/
├── popup/
├── _locales/
├── icons/
└── README.md
```

------------------------------------------------------------------------

# 第一阶段

完成：

-   Manifest
-   Popup
-   Options
-   Background
-   Content Script

保证扩展可以正常加载。

------------------------------------------------------------------------

# Options 页面

实现：

-   SiliconFlow API Key
-   Vision Model ID
-   Keyword Count
-   Test Connection
-   Save

API Key 保存到：

chrome.storage.local

不要硬编码 API Key。

------------------------------------------------------------------------

# Adobe 页面

进入：

https://contributor.stock.adobe.com/\*

要求：

1.  注入一个侧边 AI Assistant 面板
2.  防止重复注入
3.  使用 MutationObserver
4.  检测当前选中的素材
5.  素材切换后自动刷新状态

不要依赖单一 CSS class。

优先：

-   aria-label
-   role
-   data-testid
-   aria-selected

------------------------------------------------------------------------

# 图片读取

目标：

自动获取当前素材图片。

支持：

-   currentSrc
-   src
-   blob URL
-   data URL

最终转换：

Base64

图片最长边：

1024px

JPEG Quality：

0.82

------------------------------------------------------------------------

# SiliconFlow

接口：

POST

https://api.siliconflow.cn/v1/chat/completions

模型：

从用户设置读取。

不要写死。

发送：

图片(Base64)+Prompt

返回：

``` json
{
  "title":"...",
  "keywords":[]
}
```

------------------------------------------------------------------------

# Prompt

让模型：

生成：

-   一个英文 Adobe Stock Title
-   30 个英文 Keywords

规则：

-   只描述可见内容
-   不虚构品牌
-   不虚构地点
-   不输出 Markdown
-   返回 JSON

------------------------------------------------------------------------

# 页面 UI

包含：

-   当前图片预览
-   Generate Metadata
-   Apply Title
-   Apply Keywords
-   Apply All
-   Copy Title
-   Copy Keywords
-   Retry

允许用户修改 AI 结果。

------------------------------------------------------------------------

# Adobe 自动填写

实现：

setAdobeTitle()

addAdobeKeywords()

replaceAdobeKeywords()

兼容：

-   input
-   textarea
-   React 输入框
-   Tag Input

填写完成后验证是否成功。

------------------------------------------------------------------------

# 错误处理

处理：

-   API Key 缺失
-   模型不存在
-   网络错误
-   超时
-   图片读取失败
-   JSON 解析失败

不得导致扩展崩溃。

------------------------------------------------------------------------

# 调试

提供：

window.StockMetaDebug

至少包含：

-   findCurrentImage()
-   findTitleInput()
-   findKeywordInput()

方便后续调试 Adobe DOM。

------------------------------------------------------------------------

# 验收标准

必须达到：

-   Chrome 可正常加载扩展
-   Adobe 页面成功注入 Assistant
-   能识别当前图片
-   能调用 SiliconFlow
-   能显示 Title
-   能显示 Keywords
-   能自动填写 Adobe 表单
-   不自动提交 Adobe
-   API Key 不写入源码
-   README 完整

------------------------------------------------------------------------

> 当前无法直接验证 Adobe Contributor 的真实
> DOM，请使用多套候选选择器，不要假设单一 class
> 永久有效，并保证选择器失效时扩展不会崩溃。
