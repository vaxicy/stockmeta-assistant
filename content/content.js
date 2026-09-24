// content/content.js
// Injects the AI Assistant side panel into Adobe Stock Contributor pages,
// detects the selected asset, and orchestrates metadata generation + filling.

(function () {
  const { t, tf, applyStaticI18n } = window.StockMetaI18n;
  const Img = window.StockMetaImage;
  const Dom = window.StockMetaDom;
  const Batch = window.StockMetaBatch;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const INJECTED_FLAG = 'data-stockmeta-injected';
  let panel = null;
  let state = { title: '', keywords: [], category: '', fileType: '', lastImageSrc: null, lastAssetId: null, collapsed: false, lastStatus: { key: 'statusIdle', isError: false } };

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
          <button class="sm-btn sm-icon" id="sm-collapse" data-i18n-title="collapse" aria-label="Collapse">
            <svg class="sm-icon-svg sm-icon-minus" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false"><path d="M2 7h10" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
            <svg class="sm-icon-svg sm-icon-plus" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false"><path d="M7 2v10M2 7h10" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
          </button>
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
            <span class="sm-label-right">
              <button class="sm-btn sm-refresh" id="sm-regen-title" data-i18n-title="regenerateTitle"><span class="sm-refresh-icon">↻</span></button>
            </span>
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
              <button class="sm-btn sm-refresh" id="sm-regen-kw" data-i18n-title="regenerateKeywords"><span class="sm-refresh-icon">↻</span></button>
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
    panel.querySelector('#sm-collapse').setAttribute('aria-label', state.collapsed ? t('expand') : t('collapse'));
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
  function setStatus(key, isError, vars) {
    const el = panel.querySelector('#sm-status');
    el.textContent = vars ? tf(key, vars) : t(key);
    el.classList.toggle('sm-error', !!isError);
    state.lastStatus = { key, isError: !!isError, vars: vars || null };
  }

  // Raw status text: batch progress carries numbers, so it cannot go through t().
  function setStatusText(text, isError) {
    const el = panel.querySelector('#sm-status');
    el.textContent = text;
    el.classList.toggle('sm-error', !!isError);
    state.lastStatus = { key: null, isError: !!isError, text };
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
      SELECT_TRIGGER_NOT_FOUND: 'errSelect',
      SELECT_OPTION_NOT_FOUND: 'errSelect',
      EXTENSION_CONTEXT_INVALIDATED: 'errContextInvalid',
      BATCH_SELECT_TIMEOUT: 'batchSelectTimeout',
    };
    let key;
    if (map[errCode]) {
      key = map[errCode];
    } else if (String(errCode).startsWith('HTTP_')) {
      key = 'errServer';
    } else {
      key = 'errUnknown';
    }
    console.warn('[StockMeta] error code:', errCode, detail || '');
    setStatus(key, true);
  }

  // Feedback previously shown in a floating toast is now surfaced in the panel
  // status line (#sm-status): transient confirmations auto-revert to idle,
  // validation/error keys render in red.
  function toast(msgKey, vars) {
    const isError = /^(err|no)/.test(msgKey);
    setStatus(msgKey, isError, vars);
    clearTimeout(toast._t);
    toast._t = setTimeout(() => setStatus('statusIdle'), 1800);
  }

  // ---------------------------------------------------------------- preview

  // Adobe repaints image URLs constantly (lazy loading, low-res -> high-res,
  // cache busting), so the raw src is NOT an asset identity. Deriving the stock
  // id keeps the panel from wiping freshly generated results on every repaint —
  // which used to make a running batch look frozen.
  function assetIdentity(src) {
    if (!src) return '';
    try {
      const m = /(?:^|[^a-z0-9])F_(\d+)/i.exec(src);
      if (m) return 'f:' + m[1];
      const u = new URL(src, location.href);
      return 'u:' + u.pathname;
    } catch (_) {
      return 's:' + src;
    }
  }

  function updatePreview() {
    const img = Img.findCurrentImage();
    const preview = panel.querySelector('#sm-preview');
    if (!img) {
      preview.removeAttribute('src');
      preview.alt = t('statusNoImage');
      state.lastImageSrc = null;
      state.lastAssetId = null;
      return;
    }
    const src = img.currentSrc || img.src || img.getAttribute('data-src');
    preview.src = src;
    preview.alt = t('previewAlt');
    const id = assetIdentity(src);
    if (id === state.lastAssetId) {
      // Same asset, new URL: keep the results (and the batch progress line).
      state.lastImageSrc = src;
      return;
    }
    state.lastImageSrc = src;
    state.lastAssetId = id;
    resetResults();
    // While a batch runs, the status line belongs to the progress report.
    if (Batch && Batch.isRunning()) renderBatchProgress();
    else setStatus('statusIdle');
  }

  function resetResults() {
    state.title = '';
    state.keywords = [];
    state.category = '';
    state.fileType = '';
    panel.querySelector('#sm-title').value = '';
    panel.querySelector('#sm-keywords').value = '';
    panel.querySelector('#sm-kw-count').textContent = '';
    updateRegenButtons();
  }

  // ---------------------------------------------------------------- generate

  // Shared generation core: read the asset currently on screen, ask the model,
  // store the result in `state`. Status/error surfacing stays in the caller so
  // the panel button and the batch engine reuse exactly the same logic.
  async function generateForCurrentAsset(onPhase) {
    if (onPhase) onPhase('reading');
    const imageBase64 = await Img.getCurrentImageBase64();
    if (onPhase) onPhase('generating');
    const resp = await sendGenerate(imageBase64);
    console.log('[StockMeta] generate response:', resp);
    if (!resp.ok) return { ok: false, error: resp.error };
    if (!resp.title && (!Array.isArray(resp.keywords) || !resp.keywords.length) && !resp.category) {
      return { ok: false, error: 'EMPTY_RESPONSE' };
    }
    state.title = resp.title || '';
    state.keywords = Array.isArray(resp.keywords) ? resp.keywords : [];
    state.category = resp.category || '';
    state.fileType = resp.fileType || '';
    renderResults();
    return { ok: true };
  }

  async function onGenerate() {
    // Batch mode: with the setting on, this single button drives the whole run
    // (and stops it while a run is in flight).
    if (shouldRunBatch()) {
      await onBatchClick();
      return;
    }
    const genBtn = panel.querySelector('#sm-generate');
    genBtn.disabled = true;
    try {
      const res = await generateForCurrentAsset((phase) =>
        setStatus(phase === 'reading' ? 'statusReading' : 'statusGenerating')
      );
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setStatus('statusDone');
      // Optional: apply everything as soon as the result lands, so the user does
      // not have to press "Apply All" afterwards. Driven by the settings toggle.
      const cfg = await getApplyConfig();
      if (cfg.autoApplyAfterGenerate) {
        await onApplyAll();
      }
    } catch (err) {
      const code = err && err.message ? err.message : 'UNKNOWN';
      setError(code, err);
    } finally {
      genBtn.disabled = false;
    }
  }

  // If the MV3 service worker dies mid-request the sendMessage callback never
  // fires; without this guard the panel (and the batch) would wait forever.
  const CLIENT_RESPONSE_TIMEOUT_MS = 100000;

  function sendMessageWithTimeout(message) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (r) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(r);
      };
      const timer = setTimeout(() => {
        console.warn('[StockMeta] no response from the background worker after', CLIENT_RESPONSE_TIMEOUT_MS, 'ms:', message.type);
        finish({ ok: false, error: 'TIMEOUT' });
      }, CLIENT_RESPONSE_TIMEOUT_MS);
      try {
        chrome.runtime.sendMessage(message, (resp) => {
          if (chrome.runtime.lastError) {
            const msg = String(chrome.runtime.lastError.message || '');
            if (msg.includes('Extension context invalidated')) {
              finish({ ok: false, error: 'EXTENSION_CONTEXT_INVALIDATED' });
            } else {
              finish({ ok: false, error: 'NETWORK_ERROR' });
            }
          } else {
            finish(resp || { ok: false, error: 'UNKNOWN' });
          }
        });
      } catch (err) {
        const msg = err && err.message ? err.message : '';
        if (String(msg).includes('Extension context invalidated')) {
          finish({ ok: false, error: 'EXTENSION_CONTEXT_INVALIDATED' });
        } else {
          finish({ ok: false, error: 'NETWORK_ERROR' });
        }
      }
    });
  }

  function sendGenerate(imageBase64) {
    return sendMessageWithTimeout({ type: 'GENERATE_METADATA', imageBase64 });
  }

  // Regenerate a single field (title or keywords) without touching the other.
  function sendGenerateField(imageBase64, mode) {
    const type = mode === 'title' ? 'GENERATE_TITLE' : 'GENERATE_KEYWORDS';
    return sendMessageWithTimeout({ type, imageBase64 });
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
      // Optional: apply the field that was just regenerated, so the ↻ buttons
      // also save a manual click when the auto-apply setting is on.
      const cfg = await getApplyConfig();
      if (cfg.autoApplyAfterGenerate) {
        await onApply(mode);
      }
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

  // The per-field regenerate buttons are always clickable, even before any
  // result exists, so the user can generate title/keywords on first entry
  // (no extra button needed). onGenerateField already handles the empty state.
  function updateRegenButtons() {
    const titleBtn = panel.querySelector('#sm-regen-title');
    const kwBtn = panel.querySelector('#sm-regen-kw');
    if (titleBtn) titleBtn.disabled = false;
    if (kwBtn) kwBtn.disabled = false;
  }

  // ---------------------------------------------------------------- apply

  // Apply the two settings-driven fields: the default category (only when
  // autoSelectCategory is on) and the default file type. Returns true when at
  // least one field was resolvable, so callers can pick the status message.
  // Shared by "Apply All" AND the individual apply buttons so these settings
  // take effect on ANY apply action.
  async function applyCategoryAndFileType(cfg) {
    let applied = false;
    if (cfg.autoSelectCategory) {
      const cat = cfg.defaultCategory && cfg.defaultCategory !== 'auto' ? cfg.defaultCategory : state.category;
      if (cat) {
        // Only fill the category when Adobe itself did not already recognize
        // one (e.g. it auto-detected "Science"). This avoids overwriting a
        // system-identified category while still filling blank ones.
        const existing = Dom.getAdobeCategory();
        if (existing) {
          console.log('[StockMeta] Adobe already categorized as "' + existing + '", keeping it.');
          toast('categoryKept');
        } else {
          await Dom.setAdobeCategory(cat);
          applied = true;
        }
      }
    }
    // File type: a fixed user choice always wins; in "auto" mode fall back to
    // the AI-suggested value, and to "Photos" when the AI is uncertain (Adobe
    // does not auto-detect this field, Photos is the safe default).
    const ft = cfg.defaultFileType && cfg.defaultFileType !== 'auto' ? cfg.defaultFileType : (state.fileType || 'Photos');
    if (ft) {
      try {
        const cur = Dom.getAdobeFileType();
        if (cur !== ft) {
          await Dom.setAdobeFileType(ft);
        } else {
          console.log('[StockMeta] File type already "' + ft + '", skipping.');
        }
        applied = true;
      } catch (err) {
        // Non-fatal: title/keywords/category are more important than file type.
        console.warn('[StockMeta] File type not applied (continuing):', err && err.message);
      }
    }
    return applied;
  }

  async function onApply(which) {
    try {
      let primaryApplied = false;
      if (which === 'title') {
        if (state.title) {
          Dom.setAdobeTitle(state.title);
          primaryApplied = true;
        }
      } else if (which === 'keywords') {
        if (state.keywords.length) {
          await Dom.replaceAdobeKeywords(state.keywords);
          primaryApplied = true;
        }
      } else if (which === 'category') {
        const catCfg = await getApplyConfig();
        const cat = catCfg.defaultCategory && catCfg.defaultCategory !== 'auto' ? catCfg.defaultCategory : state.category;
        if (cat) {
          await Dom.setAdobeCategory(cat);
          primaryApplied = true;
        }
      }

      // The default category + default file type are settings-driven, so they
      // apply on ANY apply action — not only "Apply All". (The explicit
      // "Apply Category" action already handled the category above.)
      const cfg = await getApplyConfig();
      let settingsApplied = false;
      if (which !== 'category') {
        settingsApplied = await applyCategoryAndFileType(cfg);
      }
      // 单独应用时也触发 AI 勾选 + 自动保存（与 onApplyAll 行为一致）
      if (cfg.autoCheckAI) checkAIDeclarationBoxes();
      if (cfg.autoSaveAfterApply) clickSaveWorkButton();

      if (primaryApplied) {
        toast(which === 'title' ? 'appliedTitle' : which === 'keywords' ? 'appliedKeywords' : 'appliedCategory');
      } else if (settingsApplied) {
        toast('appliedSettings');
      } else if (which === 'title') {
        toast('noTitle');
      } else if (which === 'keywords') {
        toast('noKeywords');
      } else {
        toast('noCategory');
      }
    } catch (err) {
      const code = err && err.message ? err.message : 'UNKNOWN';
      console.error('[StockMeta] apply failed:', which, code, err);
      setError(code, err);
    }
  }

  // Shared "apply everything" core. Returns whether anything was written; the
  // caller decides how to report it. `save: true` forces save + wait — batch mode
  // must never switch assets while metadata is still unsaved.
  async function applyAllCurrent(opts) {
    let applied = false;
    if (state.title) {
      Dom.setAdobeTitle(state.title);
      applied = true;
    }
    if (state.keywords.length) {
      await Dom.replaceAdobeKeywords(state.keywords);
      applied = true;
    }
    const cfg = await getApplyConfig();
    // Settings-driven fields (default category + default file type) apply here
    // too, and even when no title/keywords were generated.
    if (await applyCategoryAndFileType(cfg)) applied = true;
    if (cfg.autoCheckAI) checkAIDeclarationBoxes();
    // `save` = save and wait (batch); `skipAutoSave` = batch saves itself right
    // after, so the setting-driven click must not fire a second save request.
    if (opts && opts.save) await saveAndWait();
    else if (cfg.autoSaveAfterApply && !(opts && opts.skipAutoSave)) clickSaveWorkButton();
    return applied;
  }

  async function onApplyAll() {
    try {
      const applied = await applyAllCurrent();
      if (!applied) {
        toast('noTitle');
        return;
      }
      toast('appliedAll');
    } catch (err) {
      const code = err && err.message ? err.message : 'UNKNOWN';
      console.error('[StockMeta] apply all failed:', code, err);
      setError(code, err);
    }
  }

  // Read the four apply-related settings in one shot so Apply All can act on
  // them consistently. Falls back to safe defaults if storage is unavailable.
  function getApplyConfig() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(
          ['autoCheckAI', 'autoSaveAfterApply', 'autoSelectCategory', 'defaultCategory', 'defaultFileType', 'autoApplyAfterGenerate'],
          (s) =>
            resolve({
              autoCheckAI: !!s.autoCheckAI,
              autoSaveAfterApply: !!s.autoSaveAfterApply,
              autoSelectCategory: s.autoSelectCategory !== undefined ? !!s.autoSelectCategory : true,
              defaultCategory: s.defaultCategory || 'auto',
              defaultFileType: s.defaultFileType || 'auto',
              autoApplyAfterGenerate: !!s.autoApplyAfterGenerate,
            })
        );
      } catch (_) {
        resolve({
          autoCheckAI: false,
          autoSaveAfterApply: false,
          autoSelectCategory: true,
          autoApplyAfterGenerate: false,
        });
      }
    });
  }

  function findSaveWorkButton() {
    // Priority 1: exact match by data-t attribute (from F12 inspection)
    let btn = document.querySelector('button[data-t="save-work"]');
    // Priority 2: match by combined class chain
    if (!btn) btn = document.querySelector('button.button.button--act.icon__center-align');
    // Priority 3: fallback to text content search
    if (!btn) {
      btn = Array.from(document.querySelectorAll('button[role="button"], button'))
        .find((b) => /save\s*work/i.test((b.textContent || '').trim()));
    }
    return btn || null;
  }

  function clickSaveWorkButton() {
    const btn = findSaveWorkButton();
    if (btn) {
      setTimeout(() => btn.click(), 200);
    } else {
      console.warn('[StockMeta] Save work button not found');
    }
  }

  // Save and wait for Adobe to finish writing, so a batch run never leaves the
  // previous asset unsaved (nor clicks the next tile mid-request).
  async function saveAndWait() {
    const btn = findSaveWorkButton();
    if (!btn) {
      console.warn('[StockMeta] Save work button not found');
      return false;
    }
    const busy = () => !!btn.disabled || btn.getAttribute('aria-disabled') === 'true';
    btn.click();
    await sleep(300);
    if (busy()) {
      const t0 = Date.now();
      while (busy() && Date.now() - t0 < 8000) await sleep(200);
    }
    await sleep(300);
    return true;
  }

  function checkAIDeclarationBoxes() {
    const ids = [
      'content-tagger-generative-ai-checkbox',
      'content-tagger-generative-ai-property-release-checkbox',
    ];
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el && !el.checked) {
        el.click(); // .click() triggers React's controlled onChange reliably
      }
    });
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

  // ---------------------------------------------------------------- batch
  // One click walks every grid tile flagged with a red dot (missing title /
  // keywords): select -> generate -> apply -> save. The engine itself lives in
  // content/batch.js; the panel only owns the button, the counter and the
  // progress line, and hands the engine the same write path the buttons use.
  let batchCfg = { batchProcess: false, batchIntervalMs: 1500 };

  function loadBatchConfig() {
    try {
      chrome.storage.local.get(['batchProcess', 'batchIntervalMs'], (s) => {
        batchCfg = {
          batchProcess: !!(s && s.batchProcess),
          batchIntervalMs: (s && parseInt(s.batchIntervalMs, 10)) || 1500,
        };
        renderBatchUi();
      });
    } catch (_) {}
  }

  // Progress is rendered by the panel (not the engine): it owns the status line
  // and a 1 s ticker, so a slow API call visibly counts up instead of looking
  // frozen while Adobe repaints the grid underneath.
  let batchPhase = null; // { i, total, phaseKey, at }

  function renderBatchProgress() {
    if (!batchPhase) return;
    const secs = Math.round((Date.now() - batchPhase.at) / 1000);
    const phase = t(batchPhase.phaseKey) + (secs >= 5 ? ' ' + secs + 's' : '');
    setStatusText(tf('batchProgress', { i: batchPhase.i, total: batchPhase.total, phase }), false);
  }

  function onBatchPhase(i, total, phaseKey) {
    batchPhase = { i, total, phaseKey, at: Date.now() };
    renderBatchProgress();
  }

  function renderBatchUi(info) {
    if (!panel) return;
    const btn = panel.querySelector('#sm-generate');
    if (!btn) return;
    const isRunning =
      info && typeof info.running === 'boolean' ? info.running : !!(Batch && Batch.isRunning());
    panel.classList.toggle('sm-busy', isRunning);
    if (isRunning) {
      btn.disabled = false;
      btn.classList.add('sm-danger');
      btn.textContent = t('batchStop');
      return;
    }
    // Idle: the button keeps its primary blue look in every batch state.
    btn.classList.remove('sm-danger');
    if (!Batch || !batchCfg.batchProcess) {
      btn.disabled = false;
      btn.textContent = t('generate');
      return;
    }
    const n = Batch.countPending();
    if (n > 0) {
      btn.disabled = false;
      btn.textContent = tf('generateBatch', { n });
      return;
    }
    // Nothing matched the red dot. Instead of claiming "nothing pending" while
    // the grid is visibly full of red dots, offer the verify-all fallback: it
    // opens each tile and only processes the ones that really lack metadata.
    const all = Batch.countTiles();
    if (all > 0) {
      btn.disabled = false;
      btn.textContent = tf('generateBatchAll', { n: all });
      return;
    }
    btn.disabled = false;
    btn.textContent = t('generate');
  }

  // With batch mode on, "Generate Title & Keywords" drives the whole run — the
  // panel no longer has a second button for it.
  function shouldRunBatch() {
    if (!Batch || !batchCfg.batchProcess) return false;
    if (Batch.isRunning()) return true;
    return Batch.countTiles() > 0;
  }

  async function onBatchClick() {
    if (!Batch) return;
    // The button doubles as the stop control while a run is in flight.
    if (Batch.isRunning()) {
      Batch.stop();
      return;
    }
    if (!batchCfg.batchProcess) {
      toast('batchNeedSetting');
      return;
    }
    // Red dot readable -> fast path. Otherwise verify every tile against its own
    // title / keywords (slower, but independent of Adobe's status markup).
    const mode = Batch.countPending() > 0 ? 'dots' : 'verify';
    if (mode === 'verify' && Batch.countTiles() === 0) {
      Batch.diagnose(true);
      toast('batchNoGrid');
      return;
    }
    await Batch.start({ intervalMs: batchCfg.batchIntervalMs, mode });
  }

  // Called by the batch engine whenever it starts or finishes a run.
  function onBatchStateChange(summary, isRunning) {
    if (!isRunning) batchPhase = null;
    renderBatchUi({ running: isRunning });
    if (!summary) return;
    // The summary deserves a longer dwell time than a regular toast.
    const key = summary.aborted ? 'batchAborted' : summary.stopped ? 'batchStopped' : 'batchDone';
    setStatus(key, summary.fail > 0, summary);
    clearTimeout(toast._t);
    toast._t = setTimeout(() => setStatus('statusIdle'), 6000);
  }

  // How many keywords Adobe already holds for the asset on screen. The tag UI
  // only exposes "Remaining keywords: N" (N = 49 - applied); the textarea path is
  // kept for simpler markup. Used by the batch "verify all" fallback.
  function currentKeywordCount() {
    const el = Dom.findKeywordInput();
    if (el && typeof el.value === 'string' && el.value.trim()) {
      return el.value.split(/[,\n]/).map((s) => s.trim()).filter(Boolean).length;
    }
    try {
      const m = /Remaining keywords:\s*(\d+)/i.exec(document.body.innerText || '');
      if (m) return Math.max(0, 49 - parseInt(m[1], 10));
    } catch (_) {}
    return 0;
  }

  // Everything the batch engine is allowed to do. Keeping the write path in one
  // place guarantees batch and single-asset behaviour can never diverge.
  function createCoreApi() {
    return {
      t,
      tf,
      toast,
      status: setStatusText,
      phase: onBatchPhase,
      showError: (code) => setError(code),
      generate: generateForCurrentAsset,
      applyAll: () => applyAllCurrent({ skipAutoSave: true }),
      save: saveAndWait,
      titleValue: () => {
        const el = Dom.findTitleInput();
        return el && typeof el.value === 'string' ? el.value : '';
      },
      hasTitleInput: () => !!Dom.findTitleInput(),
      keywordCount: currentKeywordCount,
      notify: onBatchStateChange,
    };
  }

  // ---------------------------------------------------------------- debug
  window.StockMetaDebug = {
    findCurrentImage: Img.findCurrentImage,
    findTitleInput: Dom.findTitleInput,
    findKeywordInput: Dom.findKeywordInput,
    // e.g. StockMetaDebug.batch.pendingTiles() to sanity-check the red-dot scan.
    batch: Batch,
  };

  // Re-apply translations when the language is changed from the settings page.
  function refreshLang() {
    applyStaticI18n(panel);
    const collapseBtn = panel.querySelector('#sm-collapse');
    if (collapseBtn) collapseBtn.setAttribute('aria-label', state.collapsed ? t('expand') : t('collapse'));
    if (state.title || state.keywords.length) renderResults();
    // Always re-render the status line in the new language, regardless of
    // whether results exist (renderResults does not touch the status text).
    // Batch progress is raw text, so it must be re-rendered verbatim.
    if (state.lastStatus.key) {
      setStatus(state.lastStatus.key, state.lastStatus.isError, state.lastStatus.vars);
    } else if (state.lastStatus.text) {
      setStatusText(state.lastStatus.text, state.lastStatus.isError);
    }
    renderBatchUi();
  }

  // ---------------------------------------------------------------- boot
  function boot() {
    injectPanel();
    observeSelection();
    window.addEventListener('stockmeta-lang', refreshLang);
    // Re-check preview after lazy images load.
    window.addEventListener('load', updatePreview);
    if (Batch) {
      Batch.init(createCoreApi());
      loadBatchConfig();
      try {
        chrome.storage.onChanged.addListener((changes, area) => {
          if (area === 'local' && (changes.batchProcess || changes.batchIntervalMs)) loadBatchConfig();
        });
      } catch (_) {}
      // 1 s tick: keeps the progress counter ticking during a run (proof of
      // life) and the pending counter honest while the grid itself changes
      // (uploads finishing, filters, pagination).
      setInterval(() => {
        if (Batch.isRunning()) {
          if (!state.lastStatus.isError) renderBatchProgress();
          return;
        }
        renderBatchUi();
      }, 1000);
      // Drop any leftover run flag from a previous page session.
      Batch.clearStaleRun();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
