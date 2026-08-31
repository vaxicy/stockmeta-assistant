// options/options.js
// Settings page: AI provider, API key, model id, keyword count, language, test connection, save,
// plus a provider-aware "how to connect" tutorial modal.

// NOTE: options.html loads this file as a classic script, so we cannot use ES
// module imports here. This list is duplicated from services/aiProvider.js to
// avoid adding a module build step just for the settings page. Keep the two
// copies in sync.
const ADOBE_CATEGORIES = [
  'Animals',
  'Buildings and Architecture',
  'Business',
  'Drinks',
  'The Environment',
  'States of Mind',
  'Food',
  'Graphic Resources',
  'Hobbies and Leisure',
  'Industry',
  'Landscapes',
  'Lifestyle',
  'People',
  'Plants and Flowers',
  'Culture and Religion',
  'Science',
  'Social Issues',
  'Sports',
  'Technology',
  'Transport',
  'Travel',
];

const DEFAULTS = {
  apiKey: '',
  provider: 'siliconflow',
  baseUrl: '',
  model: 'Qwen/Qwen3-Omni-30B-A3B-Captioner',
  keywordCount: 30,
};

const PROVIDER_DEFAULTS = {
  siliconflow: { model: 'Qwen/Qwen3-Omni-30B-A3B-Captioner', url: 'https://api.siliconflow.cn/v1' },
  openai: { model: 'gpt-4o-mini', url: 'https://api.openai.com/v1' },
  custom: { model: '', url: '' },
};

// Per-provider vision model presets shown in the model dropdown. The sentinel
// '__custom__' is always appended as the last option so users on a custom
// endpoint (or wanting an off-list model) can type any ID manually.
const CUSTOM_MODEL_VALUE = '__custom__';
const PROVIDER_MODEL_PRESETS = {
  siliconflow: [
    'Qwen/Qwen3-Omni-30B-A3B-Captioner',
    'Qwen/Qwen3-VL-32B-Instruct',
    'Qwen/Qwen3-VL-8B-Instruct',
    'Qwen/Qwen2.5-VL-72B-Instruct',
    'Qwen/Qwen3-VL-30B-A3B-Instruct',
  ],
  openai: [
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4.1',
    'gpt-4.1-mini',
    'gpt-4.5',
    'gpt-5',
    'gpt-5-mini',
  ],
  custom: [],
};

// Rebuild the model <select> options for the given provider. Presets come
// first, then a manual-input sentinel. Called on init and on provider switch.
// For the "custom" provider there is no preset list, so we hide the whole
// dropdown and show only the manual input box.
function rebuildModelOptions(provider) {
  const selWrap = document.querySelector('.opt-select[data-target="modelSelect"]');
  const customInput = document.getElementById('modelCustom');
  const sel = document.getElementById('modelSelect');
  if (!sel) return;
  if (provider === 'custom') {
    if (selWrap) selWrap.classList.add('is-hidden');
    if (customInput) customInput.classList.remove('is-hidden');
    return;
  }
  if (selWrap) selWrap.classList.remove('is-hidden');
  sel.innerHTML = '';
  const presets = PROVIDER_MODEL_PRESETS[provider] || [];
  presets.forEach((m) => {
    const o = document.createElement('option');
    o.value = m;
    o.textContent = m;
    sel.appendChild(o);
  });
  const customOpt = document.createElement('option');
  customOpt.value = CUSTOM_MODEL_VALUE;
  customOpt.textContent = msg('optModelCustom');
  sel.appendChild(customOpt);
}

// Decide which dropdown option to select for a stored model string, and show
// the custom input if the model is not among the presets (or if the provider
// has no presets at all, i.e. custom). Also called when the user switches the
// dropdown to the manual-input sentinel so the box appears immediately.
function restoreModelSelection(model) {
  const selWrap = document.querySelector('.opt-select[data-target="modelSelect"]');
  const sel = document.getElementById('modelSelect');
  const customInput = document.getElementById('modelCustom');
  if (!sel || !customInput) return;
  const presets = PROVIDER_MODEL_PRESETS[currentProvider] || [];
  if (currentProvider === 'custom') {
    // Custom provider: no dropdown, always show the manual box.
    if (selWrap) selWrap.classList.add('is-hidden');
    customInput.classList.remove('is-hidden');
    customInput.placeholder = 'your-model-id, e.g. gpt-4o / Qwen/Qwen3-VL-8B-Instruct';
    customInput.value = model || '';
    return;
  }
  if (selWrap) selWrap.classList.remove('is-hidden');
  if (model && presets.indexOf(model) !== -1) {
    sel.value = model;
    customInput.classList.add('is-hidden');
    customInput.value = '';
  } else {
    sel.value = CUSTOM_MODEL_VALUE;
    customInput.classList.remove('is-hidden');
    customInput.value = model || '';
  }
  refreshCustomSelects();
}

// Read the effective model string: dropdown value unless it's the sentinel,
// in which case use the manual input.
function readModelValue() {
  const sel = document.getElementById('modelSelect');
  const customInput = document.getElementById('modelCustom');
  if (!sel) return '';
  if (sel.value === CUSTOM_MODEL_VALUE) {
    return (customInput ? customInput.value.trim() : '');
  }
  return sel.value.trim();
}

// Strip trailing slash, and common mis-pasted endpoint suffixes
// (e.g. /chat/completions, /v1/chat/completions) so the base always ends
// at the version prefix. Mirrors the ReplyPilot normalization.
function normalizeBaseUrl(input) {
  let b = (input || '').trim().replace(/\/+$/, '');
  b = b.replace(/\/(chat|images|embeddings|audio)\/completions$/i, '');
  b = b.replace(/\/v1\/messages$/i, '');
  return b;
}

// Self-contained translations so the page can switch language independently of
// the browser UI language (chrome.i18n.getMessage always follows the browser).
const OPT_I18N = {
  en: {
    optTitle: 'Settings',
    optLang: 'Language',
    optLangAuto: 'Follow browser',
    optProvider: 'AI Provider',
    optProviderSiliconFlow: 'SiliconFlow',
    optProviderOpenAI: 'OpenAI',
    optProviderCustom: 'Custom (OpenAI-compatible)',
    optBaseUrl: 'Base URL',
    optBaseUrlDesc: 'OpenAI-compatible endpoint, e.g. https://api.openai.com/v1',
    optApiKey: 'API Key',
    optApiKeyDesc: 'Stored locally in chrome.storage.local. Never hardcoded.',
    optShow: 'Show',
    optHide: 'Hide',
    optModel: 'Vision Model ID',
    optModelDesc: 'e.g. Qwen/Qwen3-Omni-30B-A3B-Captioner',
    optModelCustom: 'Custom (manual input)',
    optKeywordCount: 'Keyword Count',
    optKeywordCountDesc: 'Number of keywords to request (1–50).',
    optAutoCheckAI: 'Auto-check AI declaration boxes',
    optAutoCheckAIDesc: 'When applying the title, keywords, or all, also tick the two AI declaration checkboxes on the Adobe Stock form.',
    optAutoSaveAfterApply: 'Auto-save after Apply',
    optAutoSaveAfterApplyDesc: 'After applying the title, keywords, or all metadata, automatically click the "Save work" button on Adobe Stock.',
    optTest: 'Test Connection',
    optSave: 'Save',
    optSaved: 'Settings saved.',
    optTestOk: 'Connection successful. API key and endpoint are both working.',
    optTestModelWarn: 'Model ID was not found in the endpoint model list — if this model actually works, you can ignore this notice.',
    optTestFail: 'Connection failed:',
    optTestMissing: 'Please enter an API Key first.',
    optTutorialLink: 'How to get an API Key?',
    optTutorialTitle: 'How to get an API Key',
    optTutorialStep1: 'Open the provider\'s API Keys page.',
    optTutorialStep2: 'Create a new API Key and copy it.',
    optTutorialStep3: 'Paste the key above and click Save, then Test Connection.',
    optTutorialGo: 'Open API Keys page',
    optTutorialClose: 'Close',
    optSupportLink: 'Support the author',
    optSupportTitle: 'Support the author',
    optSupportWeChat: 'Scan with WeChat to leave a tip',
    optSupportPayPalDesc: 'Prefer PayPal? Any amount helps.',
    optSupportPayPalBtn: 'Donate via PayPal',
    optSupportSwitchToPayPal: 'Overseas? Use PayPal instead',
    optSupportSwitchToWeChat: 'Switch to WeChat reward',
    optAutoSelectCategory: 'Auto-select Adobe Category',
    optAutoSelectCategoryDesc: 'When clicking Apply All on the panel, automatically apply the AI-suggested Adobe Stock category.',
    optDefaultCategory: 'Default Category',
    optDefaultCategoryAuto: 'AI auto-detect',
    optDefaultCategoryDesc: 'When a fixed category is chosen, it overrides the AI suggestion and is applied to the Adobe Stock form.',
  },
  zh: {
    optTitle: '设置',
    optLang: '语言',
    optLangAuto: '跟随浏览器',
    optProvider: 'AI 提供商',
    optProviderSiliconFlow: 'SiliconFlow',
    optProviderOpenAI: 'OpenAI',
    optProviderCustom: '自定义（OpenAI 兼容）',
    optBaseUrl: 'Base URL',
    optBaseUrlDesc: 'OpenAI 兼容的 endpoint，例如 https://api.openai.com/v1',
    optApiKey: 'API Key',
    optApiKeyDesc: '保存在本地 chrome.storage.local，绝不硬编码。',
    optShow: '显示',
    optHide: '隐藏',
    optModel: '视觉模型 ID',
    optModelDesc: '例如 Qwen/Qwen3-Omni-30B-A3B-Captioner',
    optModelCustom: '自定义（手动输入）',
    optKeywordCount: '关键词数量',
    optKeywordCountDesc: '请求生成的关键词数量（1–50）。',
    optAutoCheckAI: '自动勾选 AI 声明复选框',
    optAutoCheckAIDesc: '应用标题、关键词或全部应用时，均会自动勾选 Adobe Stock 表单上的「使用生成式 AI 工具创建」与「人物与财产均为虚构」两项。',
    optAutoSaveAfterApply: '应用后自动保存',
    optAutoSaveAfterApplyDesc: '应用标题、关键词或全部应用后，自动点击 Adobe Stock 页面上的「保存」按钮。',
    optTest: '测试连接',
    optSave: '保存',
    optSaved: '设置已保存。',
    optTestOk: '连接成功，密钥与端点均正常。',
    optTestModelWarn: '当前 Model ID 未在端点模型列表中匹配到，若该模型确实可用，可忽略此提示。',
    optTestFail: '连接失败：',
    optTestMissing: '请先填写 API Key。',
    optTutorialLink: '如何获取 API Key？',
    optTutorialTitle: '如何获取 API Key',
    optTutorialStep1: '打开所选提供商的 API Keys 页面。',
    optTutorialStep2: '创建一个新的 API Key 并复制。',
    optTutorialStep3: '将 Key 粘贴到上方并点击保存，然后测试连接。',
    optTutorialGo: '前往 API Keys 页面',
    optTutorialClose: '关闭',
    optSupportLink: '支持作者',
    optSupportTitle: '支持作者',
    optSupportWeChat: '用微信扫码赞赏',
    optSupportPayPalDesc: '海外用户？欢迎用 PayPal 支持',
    optSupportPayPalBtn: '通过 PayPal 打赏',
    optSupportSwitchToPayPal: '海外用户？改用 PayPal',
    optSupportSwitchToWeChat: '国内用户？改用微信赞赏',
    optAutoSelectCategory: '自动选择 Adobe 类别',
    optAutoSelectCategoryDesc: '点击面板上的“全部应用”时，自动应用 AI 推荐的 Adobe Stock 类别。',
    optDefaultCategory: '默认类别',
    optDefaultCategoryAuto: 'AI 自动识别',
    optDefaultCategoryDesc: '选择固定类别后，将覆盖 AI 识别结果并应用到 Adobe Stock 表单。',
  },
};

function getBrowserLang() {
  let ui = 'en';
  try {
    ui = chrome.i18n.getUILanguage() || 'en';
  } catch (_) {}
  return ui.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

function currentLang() {
  const params = new URLSearchParams(location.search);
  const q = params.get('lang');
  if (q === 'zh' || q === 'en') return q;
  return getBrowserLang();
}

function msg(key) {
  const lang = currentLang();
  const dict = OPT_I18N[lang] || OPT_I18N.en;
  return dict[key] !== undefined ? dict[key] : key;
}

function applyStaticI18n() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = msg(el.getAttribute('data-i18n'));
  });
  document.title = msg('optTitle');
  document.documentElement.lang = currentLang() === 'zh' ? 'zh-CN' : 'en';
}

let toastTimer = null;
function setStatus(text, kind) {
  const el = document.getElementById('status');
  el.textContent = text;
  el.className = 'opt-status' + (kind ? ' ' + kind : '');
  // Only the transient "saved" feedback should auto-hide; persistent error
  // / progress messages stay until the next action clears them.
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = null;
  if (kind === 'ok' && text === msg('optSaved')) {
    // Show briefly then fade out so the user can tell a save actually happened.
    el.classList.add('is-visible');
    toastTimer = setTimeout(() => {
      el.classList.remove('is-visible');
    }, 2500);
  } else {
    el.classList.remove('is-visible');
  }
}

// Module-level pointer to the slot currently shown in the inputs.
// Switching providers must always write back to THIS before changing it,
// otherwise the new select.value is used as the slot key and clobbers it.
let currentProvider = DEFAULTS.provider;

function getProvider() {
  return currentProvider;
}

function getDefaultModelFor(provider) {
  return PROVIDER_DEFAULTS[provider]?.model || DEFAULTS.model;
}

// Read ONLY the active provider's slot out of the stored providerConfigs.
// Other providers are never read into memory and never touched on write.
async function loadSlot(provider) {
  const stored = await chrome.storage.local.get(['providerConfigs', 'apiKey', 'baseUrl', 'model']);
  const raw = (stored && stored.providerConfigs) || null;
  const slot = (raw && raw[provider]) || {};
  const def = PROVIDER_DEFAULTS[provider] || { model: DEFAULTS.model, url: '' };
  let baseUrl = slot.baseUrl ?? '';
  let apiKey = slot.apiKey ?? '';
  let model = slot.model ?? '';
  // Migrate legacy flat apiKey/baseUrl/model into THIS provider's slot on first load.
  if (stored && ('apiKey' in stored || 'baseUrl' in stored || 'model' in stored) && stored.provider === provider) {
    baseUrl = stored.baseUrl ?? baseUrl;
    apiKey = stored.apiKey ?? apiKey;
    model = stored.model ?? model;
  }
  return { baseUrl, apiKey, model, def };
}

async function applySlotToInputs(provider) {
  const { baseUrl, apiKey, model, def } = await loadSlot(provider);
  const baseUrlInput = document.getElementById('baseUrl');
  const apiKeyInput = document.getElementById('apiKey');
  baseUrlInput.value = normalizeBaseUrl(baseUrl) || def.url || '';
  apiKeyInput.value = apiKey;
  rebuildModelOptions(provider);
  restoreModelSelection(model || getDefaultModelFor(provider));
}

// Patch only the current provider's slot inside the stored providerConfigs,
// preserving every other provider's stored values. Returns the full configs map.
// This is the slot-only half of a save, used by provider switches / test flush.
async function persistSlot() {
  const provider = currentProvider;
  const slot = {
    baseUrl: normalizeBaseUrl(document.getElementById('baseUrl').value),
    apiKey: document.getElementById('apiKey').value.trim(),
    model: readModelValue(),
  };
  const stored = await chrome.storage.local.get(['providerConfigs']);
  const configs = (stored && stored.providerConfigs) || {};
  configs[provider] = slot;
  await chrome.storage.local.set({ provider, providerConfigs: configs });
  return configs;
}

// The single source of truth for writing ALL settings: the active provider's
// slot PLUS every scalar setting (keywordCount, autoCheckAI, autoSaveAfterApply,
// autoSelectCategory, defaultCategory). Writing the whole object in one set keeps
// it atomic. autoSave() and onSave() both funnel through here so the two paths
// never diverge (previously autoSave() only persisted the slot, so changing the
// default category appeared to save but never hit chrome.storage).
async function saveAllSettings() {
  const s = collectSettings();
  const stored = await chrome.storage.local.get(['providerConfigs']);
  const configs = (stored && stored.providerConfigs) || {};
  configs[s.provider] = {
    baseUrl: s.baseUrl,
    apiKey: s.apiKey,
    model: s.model,
  };
  await chrome.storage.local.set({
    provider: s.provider,
    providerConfigs: configs,
    apiKey: s.apiKey,
    baseUrl: s.baseUrl,
    model: s.model,
    keywordCount: s.keywordCount,
    autoCheckAI: s.autoCheckAI,
    autoSaveAfterApply: s.autoSaveAfterApply,
    autoSelectCategory: s.autoSelectCategory,
    defaultCategory: s.defaultCategory,
  });
}

function collectSettings() {
  const provider = currentProvider;
  const apiKey = document.getElementById('apiKey').value.trim();
  const baseUrl = normalizeBaseUrl(document.getElementById('baseUrl').value);
  const model = readModelValue() || getDefaultModelFor(provider);
  let keywordCount = parseInt(document.getElementById('keywordCount').value, 10);
  if (isNaN(keywordCount)) keywordCount = DEFAULTS.keywordCount;
  keywordCount = Math.max(1, Math.min(50, keywordCount));
  const autoCheckAI = document.getElementById('autoCheckAI').checked;
  const autoSaveAfterApply = document.getElementById('autoSaveAfterApply').checked;
  const autoSelectCategory = document.getElementById('autoSelectCategory').checked;
  const defaultCategory = document.getElementById('defaultCategory').value;
  return { provider, apiKey, baseUrl, model, keywordCount, autoCheckAI, autoSaveAfterApply, autoSelectCategory, defaultCategory };
}

async function onSave() {
  await saveAllSettings();
  setStatus(msg('optSaved'), 'ok');
}

let autoSaveTimer = null;
function autoSave() {
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(async () => {
    await saveAllSettings();
    setStatus(msg('optSaved'), 'ok');
  }, 300);
}

async function onTest() {
  const apiKey = document.getElementById('apiKey').value.trim();
  if (!apiKey) {
    setStatus(msg('optTestMissing'), 'err');
    return;
  }
  setStatus('…');
  // Flush the live DOM inputs into storage before testing. The background reads
  // its config from chrome.storage, so a debounced autoSave (300ms) would leave
  // it one step behind when the user types a fresh key after switching providers
  // and clicks Test immediately. Without this flush, storage's
  // providerConfigs[currentProvider].apiKey is still empty and the background
  // returns MISSING_API_KEY even though the input clearly has a key.
  await persistSlot();
  const baseUrl = normalizeBaseUrl(document.getElementById('baseUrl').value);
  const model = readModelValue() || getDefaultModelFor(currentProvider);
  // Also send a one-shot override in the message so background can use the live
  // DOM values even if its cache wasn't invalidated yet. Background falls back
  // to its cached/stored config if override fields are missing.
  chrome.runtime.sendMessage({
    type: 'TEST_CONNECTION',
    override: { apiKey, baseUrl, model, provider: currentProvider },
  }, (resp) => {
    if (chrome.runtime.lastError) {
      setStatus(msg('optTestFail') + ' ' + chrome.runtime.lastError.message, 'err');
      return;
    }
    if (resp && resp.ok) {
      if (resp.hasModel) {
        setStatus(msg('optTestOk'), 'ok');
      } else {
        setStatus(msg('optTestOk') + ' ' + msg('optTestModelWarn'), 'ok');
      }
    } else {
      const errMap = {
        MISSING_API_KEY: 'optTestMissing',
        INVALID_API_KEY: 'optTestMissing',
        MODEL_NOT_FOUND: 'optModelDesc',
        NETWORK_ERROR: 'optTestFail',
        TIMEOUT: 'optTestFail',
      };
      const label = errMap[resp && resp.error] || 'optTestFail';
      setStatus(msg(label) + (resp && resp.error && label === 'optTestFail' ? ' ' + resp.error : ''), 'err');
    }
  });
}

function updateProviderUI() {
  const provider = getProvider();
  const baseUrlField = document.getElementById('baseUrlField');
  const apiKeyLabel = document.querySelector('label[for="apiKey"]');
  const baseUrlHint = document.querySelector('p[data-i18n="optBaseUrlDesc"]');

  // Base URL is always visible; it shows the built-in endpoint for known
  // providers and is editable for custom endpoints.
  if (baseUrlField) {
    baseUrlField.classList.remove('is-hidden');
  }
  if (apiKeyLabel) {
    apiKeyLabel.textContent = msg('optApiKey');
  }
  if (baseUrlHint) {
    baseUrlHint.textContent = provider === 'custom'
      ? msg('optBaseUrlDesc')
      : '默认已填充该提供商的接口地址，一般无需修改。';
  }

  updateTutorialLink();
}

// ---- Custom CSS dropdown (replaces native <select> rendering) ----
// Each .opt-select wraps a hidden native <select>. We build a custom listbox
// from the native options, keep the native select as the source of truth
// (so existing load/save/change logic stays intact), and sync value both ways.

// Lightweight JS custom scrollbar for the dropdown list (no native scrollbar,
// no third-party lib). Attaches to the .opt-select-scroll wrapper which holds
// the real scrolling .opt-select-list and a .opt-scrollbar-track sibling.
function initCustomScrollbar(wrap) {
  const view = wrap.querySelector('.opt-select-list');
  const track = wrap.querySelector('.opt-scrollbar-track');
  const thumb = wrap.querySelector('.opt-scrollbar-thumb');
  if (!view || !track || !thumb) return;

  let dragOffset = 0;
  let dragging = false;

  function scrollable() {
    return view.scrollHeight > view.clientHeight + 1;
  }

  function update() {
    if (!scrollable()) {
      track.style.display = 'none';
      thumb.style.height = '0px';
      thumb.style.transform = 'translateY(0px)';
      return;
    }
    track.style.display = 'block';
    const trackH = track.clientHeight;
    const thumbH = Math.max(30, Math.round(view.clientHeight * (view.clientHeight / view.scrollHeight)));
    const maxScroll = view.scrollHeight - view.clientHeight;
    const maxThumb = trackH - thumbH;
    const ratio = maxScroll > 0 ? view.scrollTop / maxScroll : 0;
    thumb.style.height = thumbH + 'px';
    thumb.style.transform = 'translateY(' + (ratio * maxThumb) + 'px)';
  }

  view.addEventListener('scroll', update);

  thumb.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragging = true;
    const rect = thumb.getBoundingClientRect();
    dragOffset = e.clientY - rect.top;
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const trackRect = track.getBoundingClientRect();
    const thumbH = thumb.offsetHeight;
    let y = e.clientY - trackRect.top - dragOffset;
    y = Math.max(0, Math.min(y, trackRect.height - thumbH));
    const ratio = y / (trackRect.height - thumbH);
    const maxScroll = view.scrollHeight - view.clientHeight;
    view.scrollTop = ratio * maxScroll;
  });

  document.addEventListener('mouseup', () => {
    dragging = false;
  });

  // Click on track (above/below thumb) jumps by a page.
  track.addEventListener('mousedown', (e) => {
    if (e.target === thumb) return;
    const trackRect = track.getBoundingClientRect();
    const thumbH = thumb.offsetHeight;
    const clickY = e.clientY - trackRect.top;
    const curTop = parseFloat(thumb.style.transform.replace(/[^0-9.\-]/g, '')) || 0;
    const delta = clickY < curTop ? -thumbH : thumbH;
    let y = Math.max(0, Math.min(curTop + delta, trackRect.height - thumbH));
    const ratio = y / (trackRect.height - thumbH);
    const maxScroll = view.scrollHeight - view.clientHeight;
    view.scrollTop = ratio * maxScroll;
  });

  window.addEventListener('resize', update);

  // Store updater so rebuildList can refresh it.
  wrap._optScrollUpdate = update;
  update();
}

function initCustomSelects() {
  document.querySelectorAll('.opt-select').forEach((wrap) => {
    const native = wrap.querySelector('.opt-native-select');
    const trigger = wrap.querySelector('.opt-select-trigger');
    const textEl = wrap.querySelector('.opt-select-text');
    const scrollWrap = wrap.querySelector('.opt-select-scroll');
    const list = wrap.querySelector('.opt-select-list');
    if (!native || !trigger || !list) return;

    function buildList() {
      list.innerHTML = '';
      Array.from(native.options).forEach((opt) => {
        const li = document.createElement('li');
        li.setAttribute('role', 'option');
        li.dataset.value = opt.value;
        li.textContent = opt.textContent;
        li.id = 'opt-item-' + native.id + '-' + opt.value;
        if (opt.value === native.value) {
          li.classList.add('is-selected');
        }
        li.addEventListener('click', () => {
          selectValue(opt.value);
          closeList();
        });
        list.appendChild(li);
      });
      syncText();
      if (wrap._optScrollUpdate) wrap._optScrollUpdate();
    }

    function syncText() {
      const sel = native.options[native.selectedIndex];
      textEl.textContent = sel ? sel.textContent : '';
    }

    function selectValue(value) {
      native.value = value;
      syncText();
      Array.from(list.children).forEach((li) => {
        li.classList.toggle('is-selected', li.dataset.value === value);
      });
      // Native change fires so existing handlers (lang redirect, provider slot) run.
      native.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function openList() {
      wrap.classList.add('is-open');
      trigger.setAttribute('aria-expanded', 'true');
      // Defer so layout is ready before measuring scroll metrics.
      requestAnimationFrame(() => {
        const sel = list.querySelector('.is-selected');
        if (sel) sel.scrollIntoView({ block: 'nearest' });
        initCustomScrollbar(wrap);
      });
    }

    function closeList() {
      wrap.classList.remove('is-open');
      trigger.setAttribute('aria-expanded', 'false');
    }

    // Rebuild when native options change (e.g. default category dynamic fill).
    const observer = new MutationObserver(() => {
      buildList();
    });
    observer.observe(native, { childList: true });

    // Keep trigger text in sync whenever the native value changes externally
    // (load restore, provider switch, language select redirect sets value).
    native.addEventListener('change', syncText);

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      if (wrap.classList.contains('is-open')) {
        closeList();
      } else {
        // Close any other open dropdown first.
        document.querySelectorAll('.opt-select.is-open').forEach((w) => {
          if (w !== wrap) {
            w.classList.remove('is-open');
            const t = w.querySelector('.opt-select-trigger');
            if (t) t.setAttribute('aria-expanded', 'false');
          }
        });
        buildList();
        openList();
      }
    });

    trigger.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (!wrap.classList.contains('is-open')) {
          buildList();
          openList();
        }
      } else if (e.key === 'Escape') {
        closeList();
      }
    });

    // Close when clicking elsewhere.
    document.addEventListener('click', (e) => {
      if (!wrap.contains(e.target)) closeList();
    });
  });
}

// Re-sync the custom trigger text + selected item from the native select
// value. Call after load() or after the default category list is rebuilt.
function refreshCustomSelects() {
  document.querySelectorAll('.opt-select').forEach((wrap) => {
    const native = wrap.querySelector('.opt-native-select');
    const textEl = wrap.querySelector('.opt-select-text');
    const list = wrap.querySelector('.opt-select-list');
    if (!native || !textEl) return;
    const sel = native.options[native.selectedIndex];
    textEl.textContent = sel ? sel.textContent : '';
    if (list) {
      Array.from(list.children).forEach((li) => {
        li.classList.toggle('is-selected', li.dataset.value === native.value);
      });
    }
  });
}

async function initProviderSelect() {
  const sel = document.getElementById('providerSelect');
  if (!sel) return;
  sel.addEventListener('change', async () => {
    const nextProvider = sel.value;
    // 1) Write the current inputs into the OLD slot (currentProvider) before leaving it.
    await persistSlot();
    // 2) Switch the module pointer, then load the new slot's values.
    currentProvider = nextProvider;
    await applySlotToInputs(nextProvider);
    updateProviderUI();
    // 3) Persist the provider switch itself.
    await chrome.storage.local.set({ provider: nextProvider });
  });
}

function initAutoSave() {
  const debounced = ['apiKey', 'baseUrl', 'keywordCount'];
  debounced.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', autoSave);
    if (el && (id === 'apiKey' || id === 'baseUrl')) {
      el.addEventListener('blur', () => {
        if (autoSaveTimer) clearTimeout(autoSaveTimer);
        autoSaveTimer = null;
        persistSlot().then(() => setStatus(msg('optSaved'), 'ok'));
      });
    }
  });
  // Model: dropdown change + custom input typing/blur both flush the slot.
  const modelSel = document.getElementById('modelSelect');
  if (modelSel) {
    // Re-show/hide the manual input box whenever the dropdown selection changes
    // (e.g. switching to "Custom (manual input)"), then auto-save.
    modelSel.addEventListener('change', () => {
      restoreModelSelection(modelSel.value === CUSTOM_MODEL_VALUE ? '' : modelSel.value);
      autoSave();
    });
  }
  const modelCustom = document.getElementById('modelCustom');
  if (modelCustom) {
    modelCustom.addEventListener('input', autoSave);
    modelCustom.addEventListener('blur', () => {
      if (autoSaveTimer) clearTimeout(autoSaveTimer);
      autoSaveTimer = null;
      persistSlot().then(() => setStatus(msg('optSaved'), 'ok'));
    });
  }
  const immediate = ['autoCheckAI', 'autoSaveAfterApply', 'autoSelectCategory', 'defaultCategory'];
  immediate.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', autoSave);
  });
  // Persist the current slot whenever the provider changes.
  const sel = document.getElementById('providerSelect');
  if (sel) sel.addEventListener('change', autoSave);
}

async function initLangSelect() {
  const stored = await chrome.storage.local.get(['lang']);
  const sel = document.getElementById('langSelect');
  sel.value = stored.lang === 'zh' || stored.lang === 'en' ? stored.lang : 'auto';
  sel.addEventListener('change', async () => {
    const v = sel.value;
    if (v === 'auto') {
      await chrome.storage.local.remove('lang');
    } else {
      await chrome.storage.local.set({ lang: v });
    }
    const params = new URLSearchParams(location.search);
    if (v === 'auto') params.delete('lang');
    else params.set('lang', v);
    location.search = params.toString();
  });
}

function updateTutorialLink() {
  const provider = getProvider();
  const link = document.getElementById('tutorialLink');
  if (link) link.textContent = msg('optTutorialLink');
  const title = document.getElementById('tutorialTitle');
  if (title) title.textContent = msg('optTutorialTitle');
  const go = document.getElementById('tutorialGo');
  if (go) go.textContent = msg('optTutorialGo');
}

function initTutorial() {
  const mask = document.getElementById('tutorialMask');
  const link = document.getElementById('tutorialLink');
  const close = document.getElementById('tutorialClose');
  if (!mask || !link) return;
  link.addEventListener('click', (e) => {
    e.preventDefault();
    updateTutorialLink();
    mask.hidden = false;
  });
  close.addEventListener('click', () => {
    mask.hidden = true;
  });
  mask.addEventListener('click', (e) => {
    if (e.target === mask) mask.hidden = true;
  });
}

function initApiKeyToggle() {
  const input = document.getElementById('apiKey');
  const btn = document.getElementById('apiKeyToggle');
  if (!input || !btn) return;
  const showEl = btn.querySelector('.opt-show');
  const hideEl = btn.querySelector('.opt-hide');
  btn.addEventListener('click', () => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.setAttribute('aria-label', show ? 'Hide API key' : 'Show API key');
    if (showEl) showEl.hidden = show;
    if (hideEl) hideEl.hidden = !show;
  });
}

function initSupport() {
  const mask = document.getElementById('supportMask');
  const link = document.getElementById('supportLink');
  const close = document.getElementById('supportClose');
  const wechat = document.getElementById('supportWeChat');
  const paypal = document.getElementById('supportPayPal');
  const switchLink = document.getElementById('supportSwitch');
  const paypalBtn = document.getElementById('supportPayPalBtn');
  if (!mask || !link) return;

  const PAYPAL_URL = 'https://www.paypal.com/ncp/payment/QRM8PMBMQ2ZHN';
  // Default method follows the current UI language: zh -> WeChat, en -> PayPal.
  let mode = currentLang() === 'zh' ? 'wechat' : 'paypal';

  function render() {
    const zh = mode === 'wechat';
    wechat.classList.toggle('is-hidden', !zh);
    paypal.classList.toggle('is-hidden', zh);
    switchLink.textContent = msg(zh ? 'optSupportSwitchToPayPal' : 'optSupportSwitchToWeChat');
  }

  link.addEventListener('click', (e) => {
    e.preventDefault();
    mode = currentLang() === 'zh' ? 'wechat' : 'paypal';
    render();
    mask.hidden = false;
  });
  close.addEventListener('click', () => {
    mask.hidden = true;
  });
  mask.addEventListener('click', (e) => {
    if (e.target === mask) mask.hidden = true;
  });
  switchLink.addEventListener('click', (e) => {
    e.preventDefault();
    mode = mode === 'wechat' ? 'paypal' : 'wechat';
    render();
  });
  paypalBtn.addEventListener('click', () => {
    window.open(PAYPAL_URL, '_blank');
  });
}

// Initialize every input from the stored settings. This is the single entry
// point that used to be referenced as `load()` but was missing, which left all
// the scalar fields blank and kept `currentProvider` stuck on its default —
// so switching providers wrote into the wrong slot (the "three share one" bug)
// and auto-save had nothing valid to persist.
async function load() {
  const stored = await chrome.storage.local.get([
    'provider',
    'providerConfigs',
    'keywordCount',
    'autoCheckAI',
    'autoSaveAfterApply',
    'autoSelectCategory',
  ]);
  // Provider select + module pointer.
  const provider = stored.provider || DEFAULTS.provider;
  currentProvider = provider;
  const sel = document.getElementById('providerSelect');
  if (sel) sel.value = provider;
  // Per-provider slot into the three endpoint inputs.
  await applySlotToInputs(provider);
  // Scalar fields.
  const keywordInput = document.getElementById('keywordCount');
  keywordInput.value = stored.keywordCount ?? DEFAULTS.keywordCount;
  const ac = document.getElementById('autoCheckAI');
  ac.checked = !!stored.autoCheckAI;
  const as = document.getElementById('autoSaveAfterApply');
  as.checked = !!stored.autoSaveAfterApply;
  const asc = document.getElementById('autoSelectCategory');
  asc.checked = stored.autoSelectCategory !== undefined ? !!stored.autoSelectCategory : true;
  // Default category select: first option is "AI auto-detect", the rest are the
  // fixed Adobe Stock categories imported from the shared constant.
  const dcSel = document.getElementById('defaultCategory');
  if (dcSel) {
    if (dcSel.options.length <= 1) {
      ADOBE_CATEGORIES.forEach((c) => {
        const o = document.createElement('option');
        o.value = c;
        o.textContent = c;
        dcSel.appendChild(o);
      });
    }
    dcSel.value = stored.defaultCategory || 'auto';
  }
  // Provider-aware UI hints / defaults.
  updateProviderUI();
  // Sync custom dropdown displays with the restored native select values.
  refreshCustomSelects();
}

document.addEventListener('DOMContentLoaded', () => {
  applyStaticI18n();
  load();
  initLangSelect();
  initProviderSelect();
  initCustomSelects();
  initTutorial();
  initSupport();
  initApiKeyToggle();
  initAutoSave();
  document.getElementById('saveBtn').addEventListener('click', onSave);
  document.getElementById('testBtn').addEventListener('click', onTest);
});
