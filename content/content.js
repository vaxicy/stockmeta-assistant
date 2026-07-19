// content/content.js
// Injects the AI Assistant side panel into Adobe Stock Contributor pages,
// detects the selected asset, and orchestrates metadata generation + filling.

(function () {
  const { t, applyStaticI18n } = window.StockMetaI18n;
  const Img = window.StockMetaImage;
  const Dom = window.StockMetaDom;

  const INJECTED_FLAG = 'data-stockmeta-injected';
  let panel = null;
  let state = { title: '', keywords: [], lastImageSrc: null, collapsed: false };

  // ---------------------------------------------------------------- inject
  function injectPanel() {
    if (document.getElementById('stockmeta-panel') || document.querySelector('[' + INJECTED_FLAG + ']')) {
      return; // prevent duplicate injection
    }

    const root = document.createElement('div');
    root.id = 'stockmeta-panel';
    root.setAttribute(INJECTED_FLAG, 'true');
    root.innerHTML = `
      <div class="sm-header">
        <span class="sm-title" data-i18n="panelTitle"></span>
        <div class="sm-header-actions">
          <button class="sm-btn sm-icon" id="sm-settings" data-i18n-title="openOptions">⚙</button>
          <button class="sm-btn sm-icon" id="sm-collapse" data-i18n-title="collapse">–</button>
        </div>
      </div>
      <div class="sm-body">
        <div class="sm-status" id="sm-status"></div>
        <div class="sm-preview-wrap">
          <img id="sm-preview" class="sm-preview" alt="" />
        </div>
        <button class="sm-btn sm-primary" id="sm-generate" data-i18n="generate"></button>
        <div class="sm-field">
          <label class="sm-label">
            <span data-i18n="titleLabel"></span>
            <button class="sm-btn sm-refresh" id="sm-regen-title" data-i18n-title="regenerateTitle" title="Regenerate Title" disabled><span class="sm-refresh-icon">↻</span></button>
          </label>
          <textarea id="sm-title" class="sm-textarea" rows="2" readonly></textarea>
          <div class="sm-row">
            <button class="sm-btn" id="sm-apply-title" data-i18n="applyTitle"></button>
            <button class="sm-btn" id="sm-copy-title" data-i18n="copyTitle"></button>
          </div>
        </div>
        <div class="sm-field">
          <label class="sm-label">
            <span data-i18n="keywordsLabel"></span>
            <span class="sm-label-right">
              <span class="sm-count" id="sm-kw-count"></span>
              <button class="sm-btn sm-refresh" id="sm-regen-kw" data-i18n-title="regenerateKeywords" title="Regenerate Keywords" disabled><span class="sm-refresh-icon">↻</span></button>
            </span>
          </label>
          <textarea id="sm-keywords" class="sm-textarea" rows="6" readonly></textarea>
          <div class="sm-row">
            <button class="sm-btn" id="sm-apply-kw" data-i18n="applyKeywords"></button>
            <button class="sm-btn" id="sm-copy-kw" data-i18n="copyKeywords"></button>
          </div>
        </div>
        <div class="sm-row sm-row-main">
          <button class="sm-btn sm-primary" id="sm-apply-all" data-i18n="applyAll"></button>
          <button class="sm-btn" id="sm-retry" data-i18n="retry"></button>
        </div>
      </div>
      <div class="sm-toast" id="sm-toast"></div>
    `;
    document.documentElement.appendChild(root);
    panel = root;
    applyStaticI18n(root);

    bindEvents();
    makeDraggable();
    setStatus('statusIdle');
    updatePreview();
  }

  // ---------------------------------------------------------------- events
  function bindEvents() {
    panel.querySelector('#sm-generate').addEventListener('click', onGenerate);
    panel.querySelector('#sm-apply-title').addEventListener('click', () => onApply('title'));
    panel.querySelector('#sm-apply-kw').addEventListener('click', () => onApply('keywords'));
    panel.querySelector('#sm-apply-all').addEventListener('click', onApplyAll);
    panel.querySelector('#sm-copy-title').addEventListener('click', () => copyText(state.title, 'copied'));
    panel.querySelector('#sm-copy-kw').addEventListener('click', () =>
      copyText(state.keywords.join(', '), 'copied')
    );
    panel.querySelector('#sm-retry').addEventListener('click', onGenerate);
    panel.querySelector('#sm-regen-title').addEventListener('click', () => onGenerateField('title'));
    panel.querySelector('#sm-regen-kw').addEventListener('click', () => onGenerateField('keywords'));
    panel.querySelector('#sm-settings').addEventListener('click', openOptions);
    panel.querySelector('#sm-collapse').addEventListener('click', toggleCollapse);
  }

  function openOptions() {
    try {
      if (!chrome.runtime || !chrome.runtime.id) {
        toast('errContextInvalid');
        return;
      }
      chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' }, () => {
        if (chrome.runtime.lastError) {
          toast('errContextInvalid');
        }
      });
    } catch (err) {
      toast('errContextInvalid');
    }
  }

  function toggleCollapse() {
    state.collapsed = !state.collapsed;
    panel.classList.toggle('sm-collapsed', state.collapsed);
    panel.querySelector('#sm-collapse').textContent = state.collapsed ? '+' : '–';
    panel.querySelector('#sm-collapse').setAttribute('data-tooltip', state.collapsed ? t('expand') : t('collapse'));
    panel.querySelector('#sm-collapse').removeAttribute('title');
  }

  // ---------------------------------------------------------------- draggable
  function makeDraggable() {
    const header = panel.querySelector('.sm-header');
    if (!header) return;
    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;
    header.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) return; // 不拦截设置/收起按钮
      dragging = true;
      const rect = panel.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;
      e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      let x = e.clientX - offsetX;
      let y = e.clientY - offsetY;
      x = Math.max(0, Math.min(x, window.innerWidth - panel.offsetWidth));
      y = Math.max(0, Math.min(y, window.innerHeight - panel.offsetHeight));
      panel.style.left = x + 'px';
      panel.style.top = y + 'px';
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
    });
    document.addEventListener('mouseup', () => {
      dragging = false;
    });
  }

  // ---------------------------------------------------------------- status
  function setStatus(key, isError) {
    const el = panel.querySelector('#sm-status');
    el.textContent = t(key);
    el.classList.toggle('sm-error', !!isError);
  }

  function setError(errCode, detail) {
    const map = {
      MISSING_API_KEY: 'errMissingKey',
      INVALID_API_KEY: 'errMissingKey',
      MODEL_NOT_FOUND: 'errModel',
      NETWORK_ERROR: 'errNet',
      TIMEOUT: 'errTimeout',
      MISSING_IMAGE: 'errImage',
      NO_IMAGE: 'errImage',
      READ_FAILED: 'errImage',
      LOAD_FAILED: 'errImage',
      NO_SRC: 'errImage',
      JSON_PARSE_FAILED: 'errJson',
      EMPTY_CONTENT: 'errJson',
      EMPTY_RESPONSE: 'errEmpty',
      BAD_RESPONSE: 'errJson',
      KEYWORD_APPLY_NOT_VERIFIED: 'errKeywordVerify',
      KEYWORD_INPUT_NOT_FOUND: 'errKeywordVerify',
      TITLE_INPUT_NOT_FOUND: 'errTitleVerify',
      EXTENSION_CONTEXT_INVALIDATED: 'errContextInvalid',
    };
    let key;
    if (map[errCode]) {
      key = map[errCode];
    } else if (String(errCode).startsWith('HTTP_')) {
      key = 'errServer';
    } else {
      key = 'errUnknown';
    }
    console.error('[StockMeta] error code:', errCode, detail || '');
    setStatus(key, true);
  }

  function toast(msgKey) {
    const el = panel.querySelector('#sm-toast');
    el.textContent = t(msgKey);
    el.classList.add('sm-show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('sm-show'), 1800);
  }

  // ---------------------------------------------------------------- preview
  function updatePreview() {
    const img = Img.findCurrentImage();
    const preview = panel.querySelector('#sm-preview');
    if (!img) {
      preview.removeAttribute('src');
      preview.alt = t('statusNoImage');
      state.lastImageSrc = null;
      return;
    }
    const src = img.currentSrc || img.src || img.getAttribute('data-src');
    preview.src = src;
    preview.alt = t('previewAlt');
    if (src !== state.lastImageSrc) {
      state.lastImageSrc = src;
      resetResults();
      setStatus('statusIdle');
    }
  }

  function resetResults() {
    state.title = '';
    state.keywords = [];
    panel.querySelector('#sm-title').value = '';
    panel.querySelector('#sm-keywords').value = '';
    panel.querySelector('#sm-kw-count').textContent = '';
    updateRegenButtons();
  }

  // ---------------------------------------------------------------- generate
  async function onGenerate() {
    const genBtn = panel.querySelector('#sm-generate');
    genBtn.disabled = true;
    try {
      setStatus('statusReading');
      const imageBase64 = await Img.getCurrentImageBase64();
      setStatus('statusGenerating');
      const resp = await sendGenerate(imageBase64);
      console.log('[StockMeta] generate response:', resp);
      if (!resp.ok) {
        setError(resp.error);
        return;
      }
      if (!resp.title && (!Array.isArray(resp.keywords) || !resp.keywords.length)) {
        setError('EMPTY_RESPONSE');
        return;
      }
      state.title = resp.title || '';
      state.keywords = Array.isArray(resp.keywords) ? resp.keywords : [];
      renderResults();
      setStatus('statusDone');
    } catch (err) {
      const code = err && err.message ? err.message : 'UNKNOWN';
      setError(code, err);
    } finally {
      genBtn.disabled = false;
    }
  }

  function sendGenerate(imageBase64) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(
          { type: 'GENERATE_METADATA', imageBase64 },
          (resp) => {
            if (chrome.runtime.lastError) {
              const msg = String(chrome.runtime.lastError.message || '');
              if (msg.includes('Extension context invalidated')) {
                resolve({ ok: false, error: 'EXTENSION_CONTEXT_INVALIDATED' });
              } else {
                resolve({ ok: false, error: 'NETWORK_ERROR' });
              }
            } else {
              resolve(resp || { ok: false, error: 'UNKNOWN' });
            }
          }
        );
      } catch (err) {
        const msg = err && err.message ? err.message : '';
        if (String(msg).includes('Extension context invalidated')) {
          resolve({ ok: false, error: 'EXTENSION_CONTEXT_INVALIDATED' });
        } else {
          resolve({ ok: false, error: 'NETWORK_ERROR' });
        }
      }
    });
  }

  // Regenerate a single field (title or keywords) without touching the other.
  function sendGenerateField(imageBase64, mode) {
    const type = mode === 'title' ? 'GENERATE_TITLE' : 'GENERATE_KEYWORDS';
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type, imageBase64 }, (resp) => {
          if (chrome.runtime.lastError) {
            const msg = String(chrome.runtime.lastError.message || '');
            if (msg.includes('Extension context invalidated')) {
              resolve({ ok: false, error: 'EXTENSION_CONTEXT_INVALIDATED' });
            } else {
              resolve({ ok: false, error: 'NETWORK_ERROR' });
            }
          } else {
            resolve(resp || { ok: false, error: 'UNKNOWN' });
          }
        });
      } catch (err) {
        const msg = err && err.message ? err.message : '';
        if (String(msg).includes('Extension context invalidated')) {
          resolve({ ok: false, error: 'EXTENSION_CONTEXT_INVALIDATED' });
        } else {
          resolve({ ok: false, error: 'NETWORK_ERROR' });
        }
      }
    });
  }

  async function onGenerateField(mode) {
    const btn = panel.querySelector(mode === 'title' ? '#sm-regen-title' : '#sm-regen-kw');
    if (!btn || btn.disabled) return;
    btn.disabled = true;
    btn.classList.add('sm-spinning');
    try {
      setStatus(mode === 'title' ? 'statusGeneratingTitle' : 'statusGeneratingKeywords');
      const imageBase64 = await Img.getCurrentImageBase64();
      const resp = await sendGenerateField(imageBase64, mode);
      if (!resp.ok) {
        setError(resp.error);
        return;
      }
      if (mode === 'title') {
        if (!resp.title) {
          setError('EMPTY_RESPONSE');
          return;
        }
        state.title = resp.title;
      } else {
        if (!Array.isArray(resp.keywords) || !resp.keywords.length) {
          setError('EMPTY_RESPONSE');
          return;
        }
        state.keywords = resp.keywords;
      }
      renderResults();
      setStatus(mode === 'title' ? 'statusTitleReady' : 'statusKeywordsReady');
    } catch (err) {
      const code = err && err.message ? err.message : 'UNKNOWN';
      setError(code, err);
    } finally {
      btn.classList.remove('sm-spinning');
      updateRegenButtons();
    }
  }

  function renderResults() {
    panel.querySelector('#sm-title').value = state.title;
    panel.querySelector('#sm-keywords').value = state.keywords.join('\n');
    panel.querySelector('#sm-kw-count').textContent = `${state.keywords.length} ${t('keywordCountNote')}`;
    updateRegenButtons();
  }

  // Enable/disable the per-field regenerate buttons based on existing results.
  function updateRegenButtons() {
    const titleBtn = panel.querySelector('#sm-regen-title');
    const kwBtn = panel.querySelector('#sm-regen-kw');
    if (titleBtn) titleBtn.disabled = !state.title;
    if (kwBtn) kwBtn.disabled = !state.keywords.length;
  }

  // ---------------------------------------------------------------- apply
  async function onApply(which) {
    try {
      if (which === 'title') {
        if (!state.title) {
          toast('noTitle');
          return;
        }
        Dom.setAdobeTitle(state.title);
        toast('appliedTitle');
      } else if (which === 'keywords') {
        if (!state.keywords.length) {
          toast('noKeywords');
          return;
        }
        await Dom.replaceAdobeKeywords(state.keywords);
        toast('appliedKeywords');
      }
    } catch (err) {
      const code = err && err.message ? err.message : 'UNKNOWN';
      console.error('[StockMeta] apply failed:', which, code, err);
      setError(code, err);
    }
  }

  async function onApplyAll() {
    try {
      if (!state.title && !state.keywords.length) {
        toast('noTitle');
        return;
      }
      if (state.title) Dom.setAdobeTitle(state.title);
      if (state.keywords.length) await Dom.replaceAdobeKeywords(state.keywords);
      toast('appliedAll');
    } catch (err) {
      const code = err && err.message ? err.message : 'UNKNOWN';
      console.error('[StockMeta] apply all failed:', code, err);
      setError(code, err);
    }
  }

  async function copyText(text, msgKey) {
    if (!text) {
      toast('noTitle');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (_) {}
      ta.remove();
    }
    toast(msgKey);
  }

  // ---------------------------------------------------------------- observe
  function observeSelection() {
    const observer = new MutationObserver(() => {
      updatePreview();
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['aria-selected', 'data-selected', 'class', 'src', 'currentSrc'],
    });
  }

  // ---------------------------------------------------------------- debug
  window.StockMetaDebug = {
    findCurrentImage: Img.findCurrentImage,
    findTitleInput: Dom.findTitleInput,
    findKeywordInput: Dom.findKeywordInput,
  };

  // Re-apply translations when the language is changed from the settings page.
  function refreshLang() {
    applyStaticI18n(panel);
    const collapseBtn = panel.querySelector('#sm-collapse');
    if (collapseBtn) collapseBtn.title = state.collapsed ? t('expand') : t('collapse');
    if (state.title || state.keywords.length) renderResults();
    else setStatus('statusIdle');
  }

  // ---------------------------------------------------------------- boot
  function boot() {
    injectPanel();
    observeSelection();
    window.addEventListener('stockmeta-lang', refreshLang);
    // Re-check preview after lazy images load.
    window.addEventListener('load', updatePreview);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
