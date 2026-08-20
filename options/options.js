// options/options.js
// Settings page: AI provider, API key, model id, keyword count, language, test connection, save,
// plus a provider-aware "how to connect" tutorial modal.

import { ADOBE_CATEGORIES } from '../services/aiProvider.js';

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

function setStatus(text, kind) {
  const el = document.getElementById('status');
  el.textContent = text;
  el.className = 'opt-status' + (kind ? ' ' + kind : '');
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
  const modelInput = document.getElementById('model');
  baseUrlInput.value = normalizeBaseUrl(baseUrl) || def.url || '';
  apiKeyInput.value = apiKey;
  modelInput.value = model || getDefaultModelFor(provider);
}

// The single source of truth for writing: read the REAL stored providerConfigs,
// patch only the current provider's slot, and write the whole object back.
// Other providers' slots are preserved exactly as stored — never overwritten.
async function persistSlot() {
  const provider = currentProvider;
  const slot = {
    baseUrl: normalizeBaseUrl(document.getElementById('baseUrl').value),
    apiKey: document.getElementById('apiKey').value.trim(),
    model: document.getElementById('model').value.trim(),
  };
  const stored = await chrome.storage.local.get(['providerConfigs']);
  const configs = (stored && stored.providerConfigs) || {};
  configs[provider] = slot;
  await chrome.storage.local.set({ provider, providerConfigs: configs });
  return configs;
}

function collectSettings() {
  const provider = currentProvider;
  const apiKey = document.getElementById('apiKey').value.trim();
  const baseUrl = normalizeBaseUrl(document.getElementById('baseUrl').value);
  const model = document.getElementById('model').value.trim() || getDefaultModelFor(provider);
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
  const s = collectSettings();
  // Patch only the current provider's slot inside the stored providerConfigs,
  // preserving every other provider's stored values. Then write the scalar
  // settings alongside. Writing the whole object in a single set keeps it atomic.
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
  setStatus(msg('optSaved'), 'ok');
}

let autoSaveTimer = null;
function autoSave() {
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(async () => {
    await persistSlot();
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
  const model = document.getElementById('model').value.trim() || getDefaultModelFor(currentProvider);
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
  const modelInput = document.getElementById('model');
  const modelHint = document.querySelector('p[data-i18n="optModelDesc"]');
  const baseUrlHint = document.querySelector('p[data-i18n="optBaseUrlDesc"]');

  // Base URL is always visible; it shows the built-in endpoint for known
  // providers and is editable for custom endpoints.
  if (baseUrlField) {
    baseUrlField.classList.remove('is-hidden');
  }
  if (apiKeyLabel) {
    apiKeyLabel.textContent = msg('optApiKey');
  }
  if (modelInput && !modelInput.value) {
    modelInput.value = getDefaultModelFor(provider);
  }
  if (modelHint) {
    modelHint.textContent = provider === 'openai' ? 'e.g. gpt-4o-mini' : msg('optModelDesc');
  }
  if (baseUrlHint) {
    baseUrlHint.textContent = provider === 'custom'
      ? msg('optBaseUrlDesc')
      : '默认已填充该提供商的接口地址，一般无需修改。';
  }

  updateTutorialLink();
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
    const modelInput = document.getElementById('model');
    if (modelInput && !modelInput.value) {
      modelInput.value = getDefaultModelFor(nextProvider);
    }
    updateProviderUI();
    // 3) Persist the provider switch itself.
    await chrome.storage.local.set({ provider: nextProvider });
  });
}

function initAutoSave() {
  const debounced = ['apiKey', 'baseUrl', 'model', 'keywordCount'];
  debounced.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', autoSave);
    // High-value fields (apiKey/baseUrl/model) also save immediately on blur so
    // the background config cache can never be more than one tab-click behind.
    // This avoids the "I typed a key, clicked Test, got MISSING_API_KEY" race
    // when the 300ms debounce hasn't fired yet.
    if (el && (id === 'apiKey' || id === 'baseUrl' || id === 'model')) {
      el.addEventListener('blur', () => {
        if (autoSaveTimer) clearTimeout(autoSaveTimer);
        autoSaveTimer = null;
        persistSlot().then(() => setStatus(msg('optSaved'), 'ok'));
      });
    }
  });
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
}

document.addEventListener('DOMContentLoaded', () => {
  applyStaticI18n();
  load();
  initLangSelect();
  initProviderSelect();
  initTutorial();
  initSupport();
  initApiKeyToggle();
  initAutoSave();
  document.getElementById('saveBtn').addEventListener('click', onSave);
  document.getElementById('testBtn').addEventListener('click', onTest);
});
