// utils/i18n.js
// Lightweight i18n for the injected panel. Dynamic text MUST go through t().
// Language priority: ?lang= > chrome.i18n UI language > browser language.

(function () {
  const I18N = {
    en: {
      panelTitle: 'StockMeta Assistant',
      statusIdle: 'Ready. Select an asset to begin.',
      statusNoImage: 'No asset image detected.',
      statusReading: 'Reading image…',
      statusGenerating: 'Generating title & keywords…',
      statusDone: 'Title & description ready.',
      statusError: 'Error',
      generate: 'Generate Title & Keywords',
      applyTitle: 'Apply Title',
      applyKeywords: 'Apply Keywords',
      applyAll: 'Apply All',
      copyTitle: 'Copy Title',
      copyKeywords: 'Copy Keywords',
      retry: 'Retry',
      titleLabel: 'Title',
      keywordsLabel: 'Keywords',
      previewAlt: 'Current asset preview',
      openOptions: 'Settings',
      collapse: 'Collapse',
      expand: 'Expand',
      copied: 'Copied!',
      noTitle: 'No title generated yet.',
      noKeywords: 'No keywords generated yet.',
      appliedTitle: 'Title applied.',
      appliedKeywords: 'Keywords applied.',
      errMissingKey: 'API Key missing. Open Settings to add it.',
      errModel: 'Model not found. Check Settings.',
      errNet: 'Network error. Check connection.',
      errTimeout: 'Request timed out.',
      errImage: 'Failed to read image.',
      errJson: 'Failed to parse model response.',
      errEmpty: 'Model returned empty content; the current model may not support generating title/keywords.',
      errKeywordVerify: 'Keywords were not written successfully. Please check the Adobe keyword input.',
      errTitleVerify: 'Title input not found. Please check the Adobe title field.',
      errServer: 'Server error. Please retry later.',
      errContextInvalid: 'Extension disconnected. Please refresh the page and try again.',
      errUnknown: 'Unexpected error.',
      keywordCountNote: 'keywords',
      regenerateTitle: 'Regenerate title',
      regenerateKeywords: 'Regenerate keywords',
      statusGeneratingTitle: 'Generating title…',
      statusGeneratingKeywords: 'Generating keywords…',
      statusTitleReady: 'Title updated.',
      statusKeywordsReady: 'Keywords updated.',
      categoryLabel: 'Category',
      applyCategory: 'Apply Category',
      appliedCategory: 'Category applied.',
      appliedAll: 'Title, keywords and category applied.',
      appliedSettings: 'Default category / file type applied.',
      noCategory: 'No category suggested yet.',
      errSelect: 'Could not apply: Adobe dropdown not found or option missing.',
      batchButton: 'Batch process ({n})',
      batchStop: 'Stop batch',
      batchNoPending: 'Batch: nothing pending',
      batchBusy: 'Batch running…',
      batchNeedSetting: 'Batch mode is off. Turn it on in Settings first.',
      batchProgress: 'Batch {i}/{total} · {phase}',
      batchSelecting: 'selecting asset…',
      batchGenerating: 'generating…',
      batchApplying: 'applying…',
      batchSaving: 'saving…',
      batchDone: 'Batch finished — {ok} done, {fail} failed, {skip} skipped.',
      batchStopped: 'Batch stopped — {ok} done, {fail} failed, {skip} skipped.',
      batchResumed: 'Resuming the interrupted batch…',
      batchSelectTimeout: 'Could not confirm the asset switch. Batch stopped so nothing lands on the wrong asset.',
      batchGenFailed: 'Batch: generation failed for one asset (see console).',
      batchButtonAll: 'Batch process (verify all {n})',
      batchVerifying: 'checking…',
      batchNoGrid: 'Batch: no asset grid found on this page.',
    },
    zh: {
      panelTitle: 'StockMeta Assistant',
      statusIdle: '就绪。请选择一个素材。',
      statusNoImage: '未检测到素材图片。',
      statusReading: '正在读取图片…',
      statusGenerating: '正在生成标题和关键词…',
      statusDone: '标题和描述已生成。',
      statusError: '错误',
      generate: '生成标题和关键词',
      applyTitle: '应用标题',
      applyKeywords: '应用关键词',
      applyAll: '全部应用',
      copyTitle: '复制标题',
      copyKeywords: '复制关键词',
      retry: '重试',
      titleLabel: '标题',
      keywordsLabel: '关键词',
      previewAlt: '当前素材预览',
      openOptions: '设置',
      collapse: '收起',
      expand: '展开',
      copied: '已复制！',
      noTitle: '尚未生成标题。',
      noKeywords: '尚未生成关键词。',
      appliedTitle: '标题已应用。',
      appliedKeywords: '关键词已应用。',
      appliedAll: '标题与关键词已应用。',
      errMissingKey: '缺少 API Key，请打开设置添加。',
      errModel: '模型不存在，请检查设置。',
      errNet: '网络错误，请检查连接。',
      errTimeout: '请求超时。',
      errImage: '读取图片失败。',
      errJson: '解析模型返回失败。',
      errEmpty: '模型返回为空，可能当前模型不支持生成标题/关键词。',
      errKeywordVerify: '关键词未成功写入，请检查 Adobe 关键词输入框。',
      errTitleVerify: '未找到标题输入框，请检查 Adobe 标题字段。',
      errServer: '服务器错误，请稍后重试。',
      errContextInvalid: '扩展连接已断开，请刷新页面后重试。',
      errUnknown: '未知错误。',
      keywordCountNote: '个关键词',
      regenerateTitle: '重新生成标题',
      regenerateKeywords: '重新生成关键词',
      statusGeneratingTitle: '正在生成标题…',
      statusGeneratingKeywords: '正在生成关键词…',
      statusTitleReady: '标题已更新。',
      statusKeywordsReady: '关键词已更新。',
      categoryLabel: '类别',
      applyCategory: '应用类别',
      appliedCategory: '类别已应用。',
      appliedAll: '标题、关键词与类别已应用。',
      appliedSettings: '默认类别 / 素材类型已应用。',
      noCategory: '尚未推荐类别。',
      errSelect: '无法应用：未找到 Adobe 下拉框或对应选项。',
      batchButton: '批量处理（{n}）',
      batchStop: '停止批量',
      batchNoPending: '批量：无待处理',
      batchBusy: '批量处理中…',
      batchNeedSetting: '批量功能未开启，请先到设置里打开。',
      batchProgress: '批量 {i}/{total} · {phase}',
      batchSelecting: '切换素材…',
      batchGenerating: '生成中…',
      batchApplying: '应用中…',
      batchSaving: '保存中…',
      batchDone: '批量完成 —— 成功 {ok}，失败 {fail}，跳过 {skip}。',
      batchStopped: '批量已停止 —— 成功 {ok}，失败 {fail}，跳过 {skip}。',
      batchResumed: '正在继续上次未完成的批量…',
      batchSelectTimeout: '无法确认素材已切换，已停止批量，避免内容写进错误的素材。',
      batchGenFailed: '批量：某张素材生成失败（详情见控制台）。',
      batchButtonAll: '批量处理（全量校验 {n}）',
      batchVerifying: '校验中…',
      batchNoGrid: '批量：当前页面未找到素材网格。',
    },
  };

  function detectLang() {
    try {
      const params = new URLSearchParams(location.search);
      const q = params.get('lang');
      if (q === 'zh' || q === 'en') return q;
    } catch (_) {}
    let ui;
    try {
      ui = chrome.i18n.getUILanguage();
    } catch (_) {
      ui = navigator.language || 'en';
    }
    return ui && ui.toLowerCase().startsWith('zh') ? 'zh' : 'en';
  }

  let LANG = detectLang();

  function setLang(l) {
    if (l === 'zh' || l === 'en') LANG = l;
  }

  // Allow the settings page to override language via chrome.storage.local.
  try {
    chrome.storage.local.get(['lang'], (res) => {
      if (res && (res.lang === 'zh' || res.lang === 'en')) {
        LANG = res.lang;
        window.dispatchEvent(new CustomEvent('stockmeta-lang', { detail: { lang: LANG } }));
      }
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.lang) {
        const v = changes.lang.newValue;
        if (v === 'zh' || v === 'en') {
          LANG = v;
          window.dispatchEvent(new CustomEvent('stockmeta-lang', { detail: { lang: LANG } }));
        }
      }
    });
  } catch (_) {}

  function t(key) {
    const dict = I18N[LANG] || I18N.en;
    return dict[key] !== undefined ? dict[key] : (I18N.en[key] !== undefined ? I18N.en[key] : key);
  }

  // t() with {placeholder} interpolation, e.g. tf('batchProgress', { i: 3, total: 9 }).
  function tf(key, vars) {
    let s = t(key);
    if (vars) {
      Object.keys(vars).forEach((k) => {
        s = s.split('{' + k + '}').join(String(vars[k]));
      });
    }
    return s;
  }

  // Apply static translations to elements with data-i18n attribute.
  function applyStaticI18n(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      el.textContent = t(key);
    });
    scope.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      const key = el.getAttribute('data-i18n-placeholder');
      el.setAttribute('placeholder', t(key));
    });
    scope.querySelectorAll('[data-i18n-title]').forEach((el) => {
      // Tooltip removed — data-tooltip/title stripped to prevent clipped popups.
      el.removeAttribute('data-tooltip');
      el.removeAttribute('title');
    });
  }

  window.StockMetaI18n = { t, tf, LANG, setLang, applyStaticI18n };
})();
