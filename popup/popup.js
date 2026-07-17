// popup/popup.js
(function () {
  const PP_I18N = {
    en: {
      extName: 'StockMeta Assistant',
      extDescription: 'Generate Adobe Stock titles and keywords from your current asset using a vision model, then fill them in with one click. Does not auto-submit.',
      optTitle: 'StockMeta Assistant — Settings',
      optTestOk: 'Connection OK. Model responded.',
      optTestMissing: 'Please enter an API Key first.',
    },
    zh: {
      extName: 'StockMeta 助手',
      extDescription: '使用视觉模型从当前素材生成 Adobe Stock 标题与关键词，一键填入。不会自动提交。',
      optTitle: 'StockMeta 助手 — 设置',
      optTestOk: '连接成功，模型已响应。',
      optTestMissing: '请先填写 API Key。',
    },
  };

  function getBrowserLang() {
    let ui;
    try {
      ui = chrome.i18n.getUILanguage();
    } catch (_) {}
    if (!ui) ui = navigator.language || 'en';
    return ui.toLowerCase().startsWith('zh') ? 'zh' : 'en';
  }

  let currentLang = getBrowserLang();

  function msg(key) {
    const dict = PP_I18N[currentLang] || PP_I18N.en;
    return dict[key] !== undefined ? dict[key] : key;
  }

  function applyStaticI18n() {
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = msg(el.getAttribute('data-i18n'));
    });
    document.title = msg('extName');
    document.documentElement.lang = currentLang === 'zh' ? 'zh-CN' : 'en';
  }

  function setStatus(text, kind) {
    const el = document.getElementById('pp-status');
    el.textContent = text;
    el.className = 'pp-status' + (kind ? ' ' + kind : '');
  }

  async function init() {
    const stored = await chrome.storage.local.get(['apiKey', 'lang']);
    if (stored.lang === 'zh' || stored.lang === 'en') {
      currentLang = stored.lang;
    } else {
      currentLang = getBrowserLang();
    }
    applyStaticI18n();
    if (stored.apiKey) {
      setStatus('✓ ' + msg('optTestOk').split('.')[0], 'ok');
    } else {
      setStatus('⚠ ' + msg('optTestMissing'), 'warn');
    }
    document.getElementById('pp-options').addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
