// options/options.js
// Settings page: API key, model id, keyword count, language, test connection, save,
// plus a "how to connect" tutorial modal.

const DEFAULTS = {
  apiKey: '',
  model: 'Qwen/Qwen3-Omni-30B-A3B-Captioner',
  keywordCount: 30,
};

// Self-contained translations so the page can switch language independently of
// the browser UI language (chrome.i18n.getMessage always follows the browser).
const OPT_I18N = {
  en: {
    optTitle: 'StockMeta Assistant — Settings',
    optLang: 'Language',
    optLangAuto: 'Follow browser',
    optApiKey: 'SiliconFlow API Key',
    optApiKeyDesc: 'Stored locally in chrome.storage.local. Never hardcoded.',
    optModel: 'Vision Model ID',
    optModelDesc: 'e.g. Qwen/Qwen3-Omni-30B-A3B-Captioner',
    optKeywordCount: 'Keyword Count',
    optKeywordCountDesc: 'Number of keywords to request (1–50).',
    optTest: 'Test Connection',
    optSave: 'Save',
    optSaved: 'Settings saved.',
    optTestOk: 'Connection OK. Model responded.',
    optTestFail: 'Connection failed:',
    optTestMissing: 'Please enter an API Key first.',
    optTutorialLink: 'How to connect SiliconFlow?',
    optTutorialTitle: 'How to connect SiliconFlow',
    optTutorialStep1: 'Register / log in at SiliconFlow and open the API Keys page.',
    optTutorialStep2: 'Create a new API Key and copy it.',
    optTutorialStep3: 'Paste the key above and click Save, then Test Connection.',
    optTutorialGo: 'Go to SiliconFlow',
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
    optTitle: 'StockMeta 助手 — 设置',
    optLang: '语言',
    optLangAuto: '跟随浏览器',
    optApiKey: 'SiliconFlow API Key',
    optApiKeyDesc: '保存在本地 chrome.storage.local，绝不硬编码。',
    optModel: '视觉模型 ID',
    optModelDesc: '例如 Qwen/Qwen3-Omni-30B-A3B-Captioner',
    optKeywordCount: '关键词数量',
    optKeywordCountDesc: '请求生成的关键词数量（1–50）。',
    optTest: '测试连接',
    optSave: '保存',
    optSaved: '设置已保存。',
    optTestOk: '连接成功，模型已响应。',
    optTestFail: '连接失败：',
    optTestMissing: '请先填写 API Key。',
    optTutorialLink: '如何接入 SiliconFlow？',
    optTutorialTitle: '如何接入 SiliconFlow',
    optTutorialStep1: '注册 / 登录 SiliconFlow，打开 API Keys 页面。',
    optTutorialStep2: '创建一个新的 API Key 并复制。',
    optTutorialStep3: '将 Key 粘贴到上方并点击保存，然后测试连接。',
    optTutorialGo: '前往 SiliconFlow',
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

async function load() {
  const stored = await chrome.storage.local.get(['apiKey', 'model', 'keywordCount']);
  document.getElementById('apiKey').value = stored.apiKey ?? DEFAULTS.apiKey;
  document.getElementById('model').value = stored.model ?? DEFAULTS.model;
  document.getElementById('keywordCount').value = stored.keywordCount ?? DEFAULTS.keywordCount;
}

async function onSave() {
  const apiKey = document.getElementById('apiKey').value.trim();
  const model = document.getElementById('model').value.trim() || DEFAULTS.model;
  let keywordCount = parseInt(document.getElementById('keywordCount').value, 10);
  if (isNaN(keywordCount)) keywordCount = DEFAULTS.keywordCount;
  keywordCount = Math.max(1, Math.min(50, keywordCount));

  await chrome.storage.local.set({ apiKey, model, keywordCount });
  setStatus(msg('optSaved'), 'ok');
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

function initTutorial() {
  const mask = document.getElementById('tutorialMask');
  const link = document.getElementById('tutorialLink');
  const close = document.getElementById('tutorialClose');
  const go = document.getElementById('tutorialGo');
  if (!mask || !link) return;
  link.addEventListener('click', (e) => {
    e.preventDefault();
    mask.hidden = false;
  });
  close.addEventListener('click', () => {
    mask.hidden = true;
  });
  mask.addEventListener('click', (e) => {
    if (e.target === mask) mask.hidden = true;
  });
  go.addEventListener('click', () => {
    window.open('https://cloud.siliconflow.cn', '_blank');
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
  initTutorial();
  initSupport();
  document.getElementById('saveBtn').addEventListener('click', onSave);
  document.getElementById('testBtn').addEventListener('click', onTest);
});
