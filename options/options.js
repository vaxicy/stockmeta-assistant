// options/options.js
// Settings page: AI provider, API key, model id, keyword count, language, test connection, save,
// plus a provider-aware "how to connect" tutorial modal.

const DEFAULTS = {
  apiKey: '',
  provider: 'siliconflow',
  baseUrl: '',
  model: 'Qwen/Qwen3-Omni-30B-A3B-Captioner',
  keywordCount: 30,
};

const PROVIDER_DEFAULTS = {
  siliconflow: { model: 'Qwen/Qwen3-Omni-30B-A3B-Captioner', url: 'https://cloud.siliconflow.cn' },
  openai: { model: 'gpt-4o-mini', url: 'https://platform.openai.com/api-keys' },
  custom: { model: '', url: '' },
};

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
    optTestOk: 'Connection OK. Model responded.',
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
    optTestOk: '连接成功，模型已响应。',
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

function getProvider() {
  const sel = document.getElementById('providerSelect');
  return sel ? sel.value : DEFAULTS.provider;
}

function getDefaultModelFor(provider) {
  return PROVIDER_DEFAULTS[provider]?.model || DEFAULTS.model;
}

async function load() {
  const stored = await chrome.storage.local.get(['apiKey', 'provider', 'baseUrl', 'model', 'keywordCount', 'autoCheckAI', 'autoSaveAfterApply']);
  const provider = stored.provider ?? DEFAULTS.provider;
  document.getElementById('providerSelect').value = provider;
  document.getElementById('baseUrl').value = stored.baseUrl ?? DEFAULTS.baseUrl;
  document.getElementById('apiKey').value = stored.apiKey ?? DEFAULTS.apiKey;
  document.getElementById('model').value = stored.model ?? getDefaultModelFor(provider);
  document.getElementById('keywordCount').value = stored.keywordCount ?? DEFAULTS.keywordCount;
  document.getElementById('autoCheckAI').checked = !!(stored.autoCheckAI);
  document.getElementById('autoSaveAfterApply').checked = !!(stored.autoSaveAfterApply);
  updateProviderUI();
}

function collectSettings() {
  const apiKey = document.getElementById('apiKey').value.trim();
  const provider = getProvider();
  const baseUrl = document.getElementById('baseUrl').value.trim();
  const model = document.getElementById('model').value.trim() || getDefaultModelFor(provider);
  let keywordCount = parseInt(document.getElementById('keywordCount').value, 10);
  if (isNaN(keywordCount)) keywordCount = DEFAULTS.keywordCount;
  keywordCount = Math.max(1, Math.min(50, keywordCount));
  const autoCheckAI = document.getElementById('autoCheckAI').checked;
  const autoSaveAfterApply = document.getElementById('autoSaveAfterApply').checked;
  return { apiKey, provider, baseUrl, model, keywordCount, autoCheckAI, autoSaveAfterApply };
}

async function onSave() {
  const s = collectSettings();
  await chrome.storage.local.set(s);
  setStatus(msg('optSaved'), 'ok');
}

let autoSaveTimer = null;
function autoSave() {
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(async () => {
    const s = collectSettings();
    await chrome.storage.local.set(s);
    setStatus(msg('optSaved'), 'ok');
  }, 300);
}

function onTest() {
  const apiKey = document.getElementById('apiKey').value.trim();
  if (!apiKey) {
    setStatus(msg('optTestMissing'), 'err');
    return;
  }
  setStatus('…');
  chrome.runtime.sendMessage({ type: 'TEST_CONNECTION' }, (resp) => {
    if (chrome.runtime.lastError) {
      setStatus(msg('optTestFail') + ' ' + chrome.runtime.lastError.message, 'err');
      return;
    }
    if (resp && resp.ok) {
      setStatus(msg('optTestOk'), 'ok');
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

  if (baseUrlField) {
    baseUrlField.classList.toggle('is-hidden', provider !== 'custom');
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

  updateTutorialLink();
}

async function initProviderSelect() {
  const sel = document.getElementById('providerSelect');
  if (!sel) return;
  sel.addEventListener('change', () => {
    const provider = sel.value;
    const modelInput = document.getElementById('model');
    if (modelInput && !modelInput.value) {
      modelInput.value = getDefaultModelFor(provider);
    }
    updateProviderUI();
    autoSave();
  });
}

function initAutoSave() {
  const debounced = ['apiKey', 'baseUrl', 'model', 'keywordCount'];
  debounced.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', autoSave);
  });
  const immediate = ['autoCheckAI', 'autoSaveAfterApply'];
  immediate.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', autoSave);
  });
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

document.addEventListener('DOMContentLoaded', () => {
  applyStaticI18n();
  load();
  initLangSelect();
  initProviderSelect();
  initTutorial();
  initSupport();
  initAutoSave();
  document.getElementById('saveBtn').addEventListener('click', onSave);
  document.getElementById('testBtn').addEventListener('click', onTest);
});
