// content/batch.js
// One-click batch mode for the Adobe Stock "Uploaded files" grid.
//
// Flow, for every tile flagged with a RED dot (= missing title / keywords):
//   select the tile -> wait until Adobe really switched the detail form to that
//   asset -> read the thumbnail -> generate title & keywords -> apply everything
//   -> VERIFY the CARD shows the keywords -> save once -> next asset.
//
// A tile with a GREEN dot is complete and is never touched — in dot mode and in
// the verify-all fallback alike, UNLESS its keyword badge proves the opposite.
// Adobe paints the dot green the moment the asset is SAVED, so a green tile
// showing "0" keywords is not finished at all: that combination used to be
// skipped in both modes, which left the user pressing "regenerate keywords" on
// each such tile by hand. The badge therefore overrides the dot in both
// directions. The run also refuses to advance while the current asset still has
// no keywords, because the point of the batch is to leave every asset submittable.
//
// DOM anchors confirmed by F12 inspection on contributor.stock.adobe.com/en/uploads:
//   grid      : .content-grid[data-t="assets-content-grid"][role="listbox"]
//   tile      : [role="option"][title="Content tile"]  (aria-selected toggles on click)
//   thumb     : img.upload-tile__thumbnail
//   status bar: .upload-statusbar -> span.badge (keyword count) + the status dot
//   red dot   : i.icon-red inside .upload-statusbar (i.icon-green when complete)
//
// Both markers are read through several independent signals, because Adobe ships
// slightly different markup between builds:
//   1. a class containing "icon-red" / "icon-green" inside the status bar, and
//   2. the computed colour of the small status icons (the dot is painted by a
//      ::before box, so the colour is the only reliable marker),
//   3. the keyword badge of the tile ("30") as a fallback for the dot.
// If no marker is readable while the grid is clearly not empty, the panel offers
// a "verify all" fallback that opens the ambiguous tiles only and processes the
// ones whose title / keywords are actually missing.
//
// This module never touches the Adobe form itself: every write goes through the
// `core` API handed over by content.js, so the single-asset flow and the batch
// flow can never diverge.

(function () {
  const TILE_SELECTORS = [
    '[data-t="assets-content-grid"] [role="option"]',
    '.content-grid [role="option"]',
    '.content-grid-element [role="option"]',
    '.upload-tile [role="option"]',
  ];
  const GRID_SELECTORS = [
    '[data-t="assets-content-grid"]',
    '.content-grid',
    '[role="listbox"][aria-multiselectable="true"]',
  ];
  const THUMB_SELECTORS = ['img.upload-tile__thumbnail', 'img[class*="upload-tile__thumbnail" i]'];
  // The status dot carries the whole state: red = title/keywords missing,
  // green = Adobe considers the asset complete. A green asset is NEVER touched —
  // that is the contract of this feature (see dotState below).
  const RED_CLASS_SELECTORS = ['[class*="icon-red"]', '[class*="icon-danger"]', '[class*="icon-error"]'];
  const GREEN_CLASS_SELECTORS = [
    '[class*="icon-green"]',
    '[class*="icon-success"]',
    '[class*="icon-done"]',
  ];
  // Keyword-count badge of a tile inside its status bar (".badge", e.g. "30").
  // Read as a second signal next to the form/panel: it can both prove an asset is
  // incomplete (0-4 keywords) and prove one is done.
  const BADGE_SELECTOR = '[class*="badge" i]';
  // Adobe's own minimum for a submittable asset — used as the "keywords landed"
  // threshold everywhere in this file.
  const MIN_KEYWORDS = 5;
  // How long the CARD badge may take to show the keywords the apply just wrote.
  // This is the gate in front of the save (user's rule: "验证完图片卡片上关键词
  // 数量不为0之后保存，然后切换"), so it only has to cover a repaint.
  const CARD_VERIFY_MS = 3000;
  // Danger: never let an asset whose keywords were not recognized be treated as
  // done. Generation gets a second go per asset (the background service already
  // re-asks the model up to 3 times per call), then the whole asset is retried
  // once more at the end of the run.
  const GEN_ATTEMPTS = 2;
  const RETRY_BACKOFF_MS = 900;
  // Candidate elements the red dot may be painted on.
  const ICON_HINT_SELECTOR = 'i, svg, [class*="icon" i], [class*="dot" i], [class*="status" i]';

  const STATE_KEY = 'batchState';
  const SELECT_TIMEOUT_MS = 12000;
  const SETTLE_MS = 400;
  const SAVE_SETTLE_MS = 500;
  const SAFETY_MAX_ASSETS = 500;
  const SCAN_CACHE_MS = 2500;
  const COLOR_SCAN_MAX = 12;
  const DIAG_INTERVAL_MS = 15000;
  // A run must never be able to sit still forever.
  const GENERATE_TIMEOUT_MS = 120000;
  const APPLY_TIMEOUT_MS = 60000;
  const SAVE_TIMEOUT_MS = 45000;
  // Repeated failures mean something systemic (key, quota, layout) — stop
  // instead of walking the whole grid doing nothing.
  const MAX_CONSECUTIVE_FAIL = 3;

  let core = null;
  let running = false;
  let stopRequested = false;
  let processedKeys = [];
  let lastSummary = null;
  let scanCache = { at: 0, pending: null, tiles: 0 };
  let lastDiagAt = 0;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------------------------------------------------------------- grid
  function gridContainer() {
    for (const sel of GRID_SELECTORS) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  // Resolve the clickable tile for a thumbnail image: the closest ancestor that
  // is the listbox option (or the tile wrapper when the option is missing).
  function resolveTiles(thumbs) {
    const out = [];
    const seen = new Set();
    for (const img of thumbs) {
      let el = img.parentElement;
      let tile = null;
      for (let i = 0; i < 6 && el; i++) {
        if (el.getAttribute && el.getAttribute('role') === 'option') {
          tile = el;
          break;
        }
        if (!tile && el.classList && (el.classList.contains('upload-tile') || el.classList.contains('content-grid-element'))) {
          tile = el;
        }
        el = el.parentElement;
      }
      tile = tile || img.parentElement;
      if (tile && !seen.has(tile)) {
        seen.add(tile);
        out.push(tile);
      }
    }
    return out;
  }

  function queryTiles() {
    // Thumbnails are the one element every layout keeps, so anchor on them and
    // limit the search to the grid when we can find it.
    const grid = gridContainer();
    for (const sel of THUMB_SELECTORS) {
      const found = Array.from(document.querySelectorAll(sel)).filter(
        (img) => !grid || grid.contains(img)
      );
      if (found.length) return resolveTiles(found);
    }
    // Fallback: listbox options (kept for layouts without the thumbnail class).
    const scopes = grid ? [grid, document] : [document];
    for (const sel of TILE_SELECTORS) {
      for (const scope of scopes) {
        const list = Array.from(scope.querySelectorAll(sel)).filter((el) => !!el.querySelector('img'));
        if (list.length) return list;
      }
    }
    return [];
  }

  function tileImage(tile) {
    if (!tile) return null;
    return (
      tile.querySelector('img.upload-tile__thumbnail') ||
      tile.querySelector('img[class*="upload-tile__thumbnail" i]') ||
      tile.querySelector('.upload-tile__thumbnail') ||
      tile.querySelector('img')
    );
  }

  // The thumbnail URL identifies the asset and survives React re-renders, so it
  // is used as both the queue key and the "already handled" marker.
  function tileKey(tile) {
    const img = tileImage(tile);
    if (!img) return '';
    return img.currentSrc || img.src || img.getAttribute('data-src') || '';
  }

  // Ascend from the tile while the ancestor still describes exactly ONE asset.
  // The status bar (and therefore the red dot) is sometimes a sibling of the
  // [role="option"] element rather than a descendant of it.
  function tileScope(tile) {
    let scope = tile;
    let el = tile;
    for (let i = 0; i < 5; i++) {
      const parent = el.parentElement;
      if (!parent) break;
      if (parent.querySelectorAll('img').length > 1) break;
      if (parent.querySelectorAll('[role="option"]').length > 1) break;
      scope = parent;
      el = parent;
    }
    return scope;
  }

  // The status bar of one asset. It is normally inside the tile scope, but can
  // also be a sibling of [role="option"] inside the grid element.
  function statusBarFor(tile) {
    if (!tile) return null;
    const scope = tileScope(tile);
    const bar = scope.querySelector('.upload-statusbar');
    if (bar) return bar;
    const wrap = tile.closest ? tile.closest('.content-grid-element') : null;
    const fromWrap = wrap && wrap.querySelector('.upload-statusbar');
    return fromWrap || scope;
  }

  function classMarker(root, selectors) {
    if (!root) return false;
    for (const sel of selectors) {
      try {
        if (root.querySelector(sel)) return true;
      } catch (_) {}
    }
    return false;
  }

  function isRedish(value) {
    const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(String(value || ''));
    if (!m) return false;
    const r = +m[1];
    const g = +m[2];
    const b = +m[3];
    return r >= 140 && r - g >= 55 && r - b >= 55;
  }

  function isGreenish(value) {
    const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(String(value || ''));
    if (!m) return false;
    const r = +m[1];
    const g = +m[2];
    const b = +m[3];
    return g >= 100 && g - r >= 35 && g - b >= 20;
  }

  // The dot is drawn by a ::before box, so size + computed colour are the only
  // reliable markers. Scanning is limited to the small status icons.
  function hasColorMarker(root, test) {
    if (!root) return false;
    const list = root.querySelectorAll(ICON_HINT_SELECTOR);
    const max = Math.min(list.length, COLOR_SCAN_MAX);
    for (let i = 0; i < max; i++) {
      const el = list[i];
      if ((el.textContent || '').trim().length > 24) continue; // not an icon
      let rect = null;
      try {
        rect = el.getBoundingClientRect();
      } catch (_) {}
      // The dot is a 12px box — anything clearly larger is not the status dot.
      if (rect && (rect.width > 26 || rect.height > 26)) continue;
      let cs;
      try {
        cs = getComputedStyle(el);
      } catch (_) {
        continue;
      }
      if (test(cs.color) || test(cs.backgroundColor) || test(cs.fill) || test(cs.borderTopColor)) {
        return true;
      }
    }
    return false;
  }

  // 'red' = metadata missing, 'green' = Adobe says complete, 'unknown' = the
  // markup could not be read (never guessed: guessing is what made finished
  // assets get processed again).
  function dotState(tile) {
    if (!tile) return 'unknown';
    const bar = statusBarFor(tile);
    if (!bar) return 'unknown';
    // Class signals are exact (icon-red / icon-green).
    if (classMarker(bar, GREEN_CLASS_SELECTORS)) return 'green';
    if (classMarker(bar, RED_CLASS_SELECTORS)) return 'red';
    // Colour fallback; green wins because processing a finished asset is the
    // one mistake the user explicitly asked us to stop making.
    if (hasColorMarker(bar, isGreenish)) return 'green';
    if (hasColorMarker(bar, isRedish)) return 'red';
    return 'unknown';
  }

  // How many keywords Adobe already holds for this tile (-1 = unreadable). This
  // is the number the user sees on the tile, so it doubles as the "the keywords
  // really landed" proof.
  function tileKeywordCount(tile) {
    if (!tile) return -1;
    const bar = statusBarFor(tile);
    if (!bar) return -1;
    const badge = bar.querySelector(BADGE_SELECTOR);
    if (!badge) return -1;
    const m = /(\d+)/.exec(badge.textContent || '');
    return m ? parseInt(m[1], 10) : -1;
  }

  // A READABLE keyword count below Adobe's minimum makes the tile incomplete no
  // matter what the dot says. The green dot only means "saved", and a saved
  // asset with 0 keywords is exactly what the user was stuck on: the batch kept
  // skipping those tiles, so the keywords had to be regenerated by hand.
  // An unreadable badge (-1) never decides anything — this only fires on a
  // number that was actually parsed out of the tile.
  function keywordStarved(tile) {
    const n = tileKeywordCount(tile);
    return n >= 0 && n < MIN_KEYWORDS;
  }

  // An asset that is already fine must never be touched — not in red-dot mode
  // and not in verify-all mode.
  function tileLooksDone(tile) {
    if (keywordStarved(tile)) return false;
    const dot = dotState(tile);
    if (dot === 'green') return true;
    const n = tileKeywordCount(tile);
    return n >= MIN_KEYWORDS && dot !== 'red';
  }

  // Tiles Adobe flags red are queued; green ones never are — except green tiles
  // whose badge shows fewer than 5 keywords (incomplete by Adobe's own rule).
  // When neither the dot nor the badge can be read, nothing is guessed: guessing
  // is what made finished assets get processed again in the first place.
  function isPending(tile) {
    if (keywordStarved(tile)) return true;
    return dotState(tile) === 'red';
  }

  function scanGrid() {
    const now = Date.now();
    if (scanCache.pending && now - scanCache.at < SCAN_CACHE_MS) return scanCache;
    let tiles = [];
    let pending = [];
    try {
      tiles = queryTiles();
      pending = tiles.filter(isPending);
    } catch (err) {
      console.warn('[StockMeta][batch] grid scan failed:', err);
    }
    scanCache = { at: now, tiles: tiles.length, pending };
    if (!pending.length && tiles.length) diagnose();
    return scanCache;
  }

  function pendingTiles() {
    return scanGrid().pending;
  }

  function unprocessedPending() {
    return pendingTiles().filter((t) => {
      const k = tileKey(t);
      return !!k && processedKeys.indexOf(k) === -1;
    });
  }

  function countPending() {
    try {
      return unprocessedPending().length;
    } catch (_) {
      return 0;
    }
  }

  function countTiles() {
    try {
      return scanGrid().tiles;
    } catch (_) {
      return 0;
    }
  }

  function selectedTileKey() {
    const tiles = queryTiles();
    for (const t of tiles) {
      if (t.getAttribute('aria-selected') === 'true') return tileKey(t);
    }
    const sel = document.querySelector('[role="option"][aria-selected="true"]');
    return sel ? tileKey(sel) : '';
  }

  function findTileByKey(key) {
    return queryTiles().find((t) => tileKey(t) === key) || null;
  }

  // The stock id ("f:123456") of the asset a tile points at. Thumbnails and
  // detail images of the same asset share it, so it is the one stable identity
  // we can compare across the grid and the detail view.
  function tileAssetId(tile) {
    const src = tileKey(tile);
    if (!src || !core || !core.assetId) return '';
    try {
      return core.assetId(src) || '';
    } catch (_) {
      return '';
    }
  }

  function isStockId(id) {
    return !!id && id.indexOf('f:') === 0;
  }

  // A plain tile.click() is not always enough for React handlers; mousedown /
  // mouseup / click mirrors what a real click sends without opening anything.
  function clickTile(el) {
    if (!el) return;
    const opts = { bubbles: true, cancelable: true, view: window };
    try {
      el.dispatchEvent(new MouseEvent('mousedown', opts));
      el.dispatchEvent(new MouseEvent('mouseup', opts));
    } catch (_) {}
    try {
      el.click();
    } catch (_) {}
  }

  // Prove that the detail view really shows THIS tile before anything is
  // generated for it. The old proof compared the title field, which never
  // changes when both assets are empty — i.e. in every real batch run.
  // The new proof compares the asset id of the image that would be captioned,
  // so it is both reliable and exactly the thing that must be correct.
  async function ensureSelected(tile, key, index, total, mode) {
    const wantId = tileAssetId(tile);
    const beforeId = core.currentAssetId ? core.currentAssetId() : '';
    const beforeSrc = core.currentImageSrc ? core.currentImageSrc() : '';

    // Already showing it: nothing to click, no waiting.
    if (isStockId(wantId) && beforeId === wantId) return true;

    reportPhase(index, total, mode === 'verify' ? 'batchVerifying' : 'batchSelecting');
    try {
      tile.scrollIntoView({ block: 'center' });
    } catch (_) {}
    await sleep(150);

    const proof = () => {
      if (!core.hasTitleInput || !core.hasTitleInput()) return false; // form not ready
      const nowId = core.currentAssetId ? core.currentAssetId() : '';
      const nowSrc = core.currentImageSrc ? core.currentImageSrc() : '';
      if (isStockId(wantId) && isStockId(nowId)) return nowId === wantId;
      // No stock id available on either side: require the captioned image to
      // really change, which a no-op click can never fake.
      return !!nowSrc && nowSrc !== beforeSrc;
    };

    // Try the option first, then the thumbnail / wrapper: whichever the page
    // actually listens on wins, and the loop stops as soon as it is proven.
    const candidates = [tile, tileImage(tile), tile.closest('.content-grid-element')].filter(
      (el, i, arr) => el && arr.indexOf(el) === i
    );
    for (const el of candidates) {
      if (stopRequested) return false;
      clickTile(el);
      if (await waitFor(proof, Math.round(SELECT_TIMEOUT_MS / candidates.length))) {
        await sleep(SETTLE_MS);
        return true;
      }
    }

    console.warn(
      '[StockMeta][batch] could not confirm the switch — want:',
      wantId || key,
      '| captioned image id now:',
      core.currentAssetId ? core.currentAssetId() : '(n/a)',
      '| tile aria-selected:',
      tile.getAttribute('aria-selected'),
      '| selected tile key:',
      selectedTileKey()
    );
    core.showError('BATCH_SELECT_TIMEOUT');
    return false;
  }

  // Dump everything needed to fix the detection when it finds nothing, but only
  // every DIAG_INTERVAL_MS so the console stays readable.
  function diagnose(force) {
    if (!force && Date.now() - lastDiagAt < DIAG_INTERVAL_MS) return null;
    lastDiagAt = Date.now();
    const tiles = (() => {
      try {
        return queryTiles();
      } catch (_) {
        return [];
      }
    })();
    const first = tiles[0];
    const report = {
      url: location.href,
      gridFound: !!gridContainer(),
      gridClass: gridContainer() ? String(gridContainer().className) : null,
      tiles: tiles.length,
      docRedClassMatches: document.querySelectorAll('[class*="icon-red"]').length,
      docGreenClassMatches: document.querySelectorAll('[class*="icon-green"]').length,
      // Per-tile verdicts: the fastest way to see whether the dot/badge reader
      // works at all on the current Adobe build.
      sample: tiles.slice(0, 6).map((t) => ({
        dot: dotState(t),
        keywords: tileKeywordCount(t),
        done: tileLooksDone(t),
      })),
    };
    if (first) {
      const scope = tileScope(first);
      report.tileTag = first.tagName + '.' + String(first.className || '');
      report.scopeClass = String(scope.className || '');
      report.hasStatusbar = !!scope.querySelector('.upload-statusbar');
      report.redClassInScope = !!scope.querySelector('[class*="icon-red"]');
      report.scopeHtml = String(scope.outerHTML || '').slice(0, 700);
      report.icons = Array.from(scope.querySelectorAll(ICON_HINT_SELECTOR))
        .slice(0, 14)
        .map((el) => {
          let cs = {};
          try {
            cs = getComputedStyle(el);
          } catch (_) {}
          return {
            cls: String(el.className || '').slice(0, 90),
            color: cs.color || '',
            bg: cs.backgroundColor || '',
          };
        });
    }
    console.warn('[StockMeta][batch] no red dot detected — diagnostics:', report);
    return report;
  }

  async function waitFor(fn, timeout) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      if (stopRequested) return false;
      try {
        if (fn()) return true;
      } catch (_) {}
      await sleep(150);
    }
    return false;
  }

  // ---------------------------------------------------------------- progress
  // The panel formats and ticks the progress line (it can show elapsed seconds),
  // so the engine only reports the phase.
  function reportPhase(index, total, phaseKey) {
    if (!core || !core.phase) return;
    core.phase(index, total, phaseKey);
  }

  // Last-resort guard so a stalled API call / dead service worker can never hang
  // a run forever.
  function withTimeout(promise, ms, label, fallback) {
    return Promise.race([
      promise,
      new Promise((resolve) =>
        setTimeout(() => {
          console.warn('[StockMeta][batch] step timed out after', ms + 'ms:', label);
          resolve(fallback);
        }, ms)
      ),
    ]);
  }

  function persist(patch) {
    try {
      chrome.storage.local.set({ [STATE_KEY]: patch });
    } catch (_) {}
  }

  function clearState() {
    try {
      chrome.storage.local.remove(STATE_KEY);
    } catch (_) {}
  }

  function setRunning(value) {
    running = value;
    scanCache = { at: 0, pending: null, tiles: 0 };
    if (core && core.notify) core.notify(null, running);
  }

  // ---------------------------------------------------------------- landing
  // Reading Adobe's OWN tile state. The keyword badge is the number the user reads
  // on the card, so it is the gate in front of every save; the status dot and the
  // form count are read alongside it for the log (a badge-0 tile can still have the
  // raw text sitting in the box while Adobe has not committed it).
  async function readLanding(tile, key) {
    // React may re-render the tile while we poll, so re-resolve it by key.
    const cur = findTileByKey(key) || tile;
    return {
      title: String((core.titleValue && core.titleValue()) || '').trim(),
      formKeywords: core.keywordCount ? core.keywordCount() : 0,
      badge: tileKeywordCount(cur),
      dot: dotState(cur),
      error: core.keywordError ? !!core.keywordError() : false,
    };
  }

  // Wait (bounded) for Adobe's tile to show the keywords we just applied. The
  // badge is the number the user reads on the card, so it is the gate that has to
  // pass BEFORE an asset is persisted — the user's rule: "验证完图片卡片上关键词
  // 数量不为0之后保存，然后切换". Returns the last reading, never throws.
  async function waitCardKeywords(tile, key, timeout) {
    const started = Date.now();
    let last = { badge: -1, dot: 'unknown', error: false, form: 0 };
    while (Date.now() - started < timeout) {
      if (stopRequested) return last;
      const cur = findTileByKey(key) || tile;
      last = {
        badge: tileKeywordCount(cur),
        dot: dotState(cur),
        error: core.keywordError ? !!core.keywordError() : false,
        form: core.keywordCount ? core.keywordCount() : 0,
      };
      if (last.badge >= MIN_KEYWORDS) return last;
      await sleep(200);
    }
    return last;
  }

  // One instant look at the card right after the save, for the log only. There is
  // NO waiting and NO second save here any more: the card was already verified
  // BEFORE the write, so the run moves straight on (user's rule: "如果卡片上显示
  // 关键词达标就保存就下一个"). It only speaks up when the card reads 0 keywords
  // after a save, i.e. Adobe did not store it — worth knowing, not worth holding
  // the whole batch up for.
  async function logCardAfterSave(tile, key) {
    try {
      const state = await readLanding(tile, key);
      if (state.badge >= 0 && state.badge < MIN_KEYWORDS) {
        console.warn(
          '[StockMeta][batch] saved but the card still reads ' + state.badge + ' keyword(s) — moving on:',
          key
        );
      }
    } catch (_) {}
  }

  // Click "Save work" and say so when the button could not be clicked, instead of
  // silently pretending it happened. The click itself returns immediately now, so
  // this costs almost nothing per asset (user's rule: "直接识别卡片关键词数量达标就
  // 保存然后下一张" — no waiting step).
  async function saveAsset() {
    const done = await withTimeout(
      Promise.resolve().then(() => core.save()),
      SAVE_TIMEOUT_MS,
      'save',
      false
    );
    if (done === false) {
      console.warn(
        '[StockMeta][batch] the Save work button was not clickable — this asset may not be stored'
      );
    }
    return done !== false;
  }

  // ---------------------------------------------------------------- one asset
  async function processAsset(tile, key, index, total, mode) {
    // Fail closed: if we cannot prove the detail view shows THIS asset, stop
    // instead of risking writing one asset's metadata onto another.
    const selected = await ensureSelected(tile, key, index, total, mode);
    if (!selected) return stopRequested ? 'skip' : 'abort';

    // Clear the panel for THIS asset, on purpose, at a well-defined moment. Doing
    // it here (rather than letting the mutation observer wipe it whenever Adobe
    // repaints) is what keeps the result the next pass generates alive all the way
    // to the apply/verify step — a wiped panel reads "0 keywords" and made the
    // batch regenerate an asset it had already generated (an extra model call).
    if (core.resetResults) core.resetResults();

    // Already complete (green dot / keywords on the tile): leave it alone. This
    // also covers tiles that turned green while the queue was being worked off.
    if (tileLooksDone(tile)) {
      console.log('[StockMeta][batch] already complete, skipping:', key);
      return 'skip';
    }

    // "Verify all" fallback: no red dot could be read, so decide from the asset
    // itself once it is open — title present and enough keywords means done.
    if (mode === 'verify') {
      const title = String(core.titleValue() || '').trim();
      const kw = Math.max(core.keywordCount ? core.keywordCount() : 0, tileKeywordCount(tile));
      console.log('[StockMeta][batch] verify:', title ? title.slice(0, 40) : '(no title)', '| keywords:', kw);
      if (title && kw >= MIN_KEYWORDS) return 'skip';
    }

    // A few passes at most: generate -> apply -> save -> verify. A retry only
    // happens when the previous pass did not produce usable keywords or did not
    // land on the asset.
    let retryLabel = 'batchRetrying';
    // A retry asks for the keywords ALONE (what the ↻ button does) instead of
    // redoing the whole metadata — and only when the panel really reads 0. When it
    // still holds keywords, the retry re-applies them rather than paying for a new
    // generation (see the reusePanel branch below).
    let keywordsOnly = false;
    for (let pass = 1; pass <= GEN_ATTEMPTS; pass++) {
      if (stopRequested) return 'skip';
      if (pass > 1) reportPhase(index, total, retryLabel);
      // Persist exactly ONCE per pass (see the save further down): when the card
      // had to be saved for it to repaint, that save already stored the asset.
      let savedThisPass = false;

      // The bar is the count the USER configured (range minimum / fixed count),
      // never below Adobe's own minimum: a result under it is "recognized but too
      // short" and has to be regenerated — the user's rule: "批量的时候也检查如果
      // 关键词不满足用户设置数量也要重新生成".
      const targetMin = Math.max(
        MIN_KEYWORDS,
        core.targetKeywordMinimum ? core.targetKeywordMinimum() : MIN_KEYWORDS
      );
      // Retry pass only: if the panel already MEETS that bar, the recognition
      // succeeded and only the write/store did not. Re-apply what we have instead
      // of asking the model again — regenerating there spends a whole extra call
      // for keywords we already got ("不消耗二次token"). A panel below the bar
      // (including 0) goes back to the model.
      const panelKeywords = core.resultKeywordCount ? core.resultKeywordCount() : 0;
      const reusePanel = pass > 1 && panelKeywords >= targetMin;
      if (reusePanel) {
        console.log(
          '[StockMeta][batch] ' +
            panelKeywords +
            ' keywords already recognized — re-applying instead of regenerating (no extra API call)'
        );
      } else {
        reportPhase(index, total, keywordsOnly ? 'batchRegenKeywords' : 'batchGenerating');
        const gen = await withTimeout(
          Promise.resolve().then(() => core.generate({ keywordsOnly })),
          GENERATE_TIMEOUT_MS,
          'generate',
          { ok: false, error: 'TIMEOUT' }
        );
        if (!gen || !gen.ok) {
          const code = (gen && gen.error) || 'UNKNOWN';
          console.warn('[StockMeta][batch] generate failed (' + pass + '/' + GEN_ATTEMPTS + '):', key, code);
          // Re-recognize instead of giving up on the asset straight away — except
          // for NO_KEYWORDS, which already exhausted the model retries (3 calls)
          // plus the panel's keywords-only regeneration. The end-of-run round still
          // gives such an asset a second, later chance.
          if (code !== 'NO_KEYWORDS' && pass < GEN_ATTEMPTS) {
            retryLabel = 'batchRecognizing';
            await sleep(RETRY_BACKOFF_MS * pass);
            continue;
          }
          core.showError(code);
          return 'fail';
        }

        // A result below the requested count can never satisfy the user (and an
        // empty one can never turn the tile green) — ask again instead of writing a
        // thin asset. This covers both "0 keywords" and "12 keywords when 20-30
        // was configured".
        const produced = core.resultKeywordCount ? core.resultKeywordCount() : 0;
        if (produced < targetMin && pass < GEN_ATTEMPTS) {
          console.warn(
            '[StockMeta][batch] model returned ' +
              produced +
              ' keyword(s) but the user wants at least ' +
              targetMin +
              ' — re-recognizing'
          );
          retryLabel = 'batchRecognizing';
          // The title is already fine; only the keyword list is short.
          keywordsOnly = true;
          await sleep(RETRY_BACKOFF_MS * pass);
          continue;
        }
      }

      reportPhase(index, total, 'batchApplying');
      try {
        await withTimeout(
          Promise.resolve().then(() => core.applyAll()),
          APPLY_TIMEOUT_MS,
          'apply',
          undefined
        );
      } catch (err) {
        // A failing dropdown (category / file type) must not throw away an asset
        // whose title and keywords are already written.
        console.warn('[StockMeta][batch] apply warning (continuing):', err && err.message);
      }

      // VERIFY THE CARD BEFORE SAVING (user's rule, 2026-09-24: "验证完图片卡片上
      // 关键词数量不为0之后保存，然后切换"). The tile badge is the number the user
      // reads on the card, so it is the gate: an asset whose card still reads 0 is
      // NOT persisted — it goes back for another pass instead.
      reportPhase(index, total, 'batchChecking');
      let card = await waitCardKeywords(tile, key, CARD_VERIFY_MS);
      if (card.badge < MIN_KEYWORDS && card.form >= MIN_KEYWORDS && !card.error) {
        // The keywords ARE in the form but Adobe has not repainted the badge yet —
        // persisting is what makes it catch up. Save now and read the card again
        // rather than spending another model call on keywords we already have.
        console.warn(
          '[StockMeta][batch] keywords are on the form but the card still reads 0 — saving so the card can catch up:',
          key
        );
        await saveAsset();
        savedThisPass = true;
        card = await waitCardKeywords(tile, key, CARD_VERIFY_MS);
      }
      if (card.badge < MIN_KEYWORDS) {
        if (pass < GEN_ATTEMPTS) {
          console.warn(
            '[StockMeta][batch] the card still reads ' +
              card.badge +
              ' keyword(s) — NOT saving this asset, regenerating first'
          );
          keywordsOnly = true;
          retryLabel = 'batchRecognizing';
          await sleep(RETRY_BACKOFF_MS * pass);
          continue;
        }
        // Nothing left to try: better to leave the asset untouched (still red) than
        // to persist a card that shows 0 keywords.
        console.warn('[StockMeta][batch] the card never showed the keywords — leaving this asset unsaved:', key);
        core.showError('BATCH_NOT_LANDED');
        return 'fail';
      }

      // The card proves the keywords are in, so click save — ONCE — and move on
      // (user's rule: "直接识别卡片关键词数量达标就保存然后下一张"). No second save
      // and no post-save wait: the extension clicks Save work and returns straight
      // away instead of waiting for Adobe's button, which used to cost seconds per
      // asset for nothing ("这个不必要的保存步骤…能不能直接去掉").
      if (!savedThisPass) {
        reportPhase(index, total, 'batchSaving');
        await saveAsset();
        await sleep(SAVE_SETTLE_MS);
      }
      await logCardAfterSave(tile, key);
      return 'ok';
    }

    core.showError('BATCH_NOT_LANDED');
    return 'fail';
  }

  // ---------------------------------------------------------------- run
  async function start(opts) {
    if (running) return lastSummary;
    if (!core) return null;
    const options = opts || {};
    const mode = options.mode === 'verify' ? 'verify' : 'dots';
    const intervalMs = Math.max(
      300,
      parseInt(options.intervalMs, 10) || (mode === 'verify' ? 700 : 1500)
    );
    if (!options.resume) processedKeys = [];
    scanCache = { at: 0, pending: null, tiles: 0 };

    const all = countTiles();
    if (!all) {
      console.warn('[StockMeta][batch] no asset grid found on this page:', location.href);
      diagnose(true);
      core.toast('batchNoGrid');
      return { ok: 0, fail: 0, skip: 0, stopped: false };
    }

    const queue =
      mode === 'verify'
        ? queryTiles().filter((t) => {
            const k = tileKey(t);
            // Even in verify mode a tile Adobe marks as complete is left alone;
            // only ambiguous ones are opened and judged from the form.
            return !!k && processedKeys.indexOf(k) === -1 && !tileLooksDone(t);
          })
        : unprocessedPending();

    if (!queue.length) {
      core.toast('batchNoPending');
      return { ok: 0, fail: 0, skip: 0, stopped: false };
    }

    running = true;
    stopRequested = false;
    setRunning(true);

    let ok = 0;
    let fail = 0;
    let skip = 0;
    let recovered = 0;
    let consecutiveFail = 0;
    let aborted = false;
    // Assets that failed get one more recognition round once the queue is done:
    // the usual causes (a slow model answer, a rate limit, a single empty reply)
    // are gone by then, so the second try has a real chance.
    const failedKeys = [];
    const total = Math.min(queue.length, SAFETY_MAX_ASSETS);
    const startedAt = options.startedAt || Date.now();
    console.log('[StockMeta][batch] start', mode, '| tiles:', all, '| queue:', total, '| interval:', intervalMs + 'ms');
    persist({ running: true, startedAt, processedKeys, total, mode });

    try {
      for (let i = 0; i < total; i++) {
        if (stopRequested) break;
        const tile = queue[i];
        const key = tileKey(tile);
        if (!key || processedKeys.indexOf(key) !== -1) {
          skip++;
          continue;
        }
        let res;
        try {
          res = await processAsset(findTileByKey(key) || tile, key, i + 1, total, mode);
        } catch (err) {
          console.warn('[StockMeta][batch] asset crashed:', key, err);
          res = 'fail';
        }
        if (processedKeys.indexOf(key) === -1) processedKeys.push(key);
        if (res === 'ok') {
          ok++;
          consecutiveFail = 0;
        } else if (res === 'fail') {
          fail++;
          consecutiveFail++;
          failedKeys.push(key);
          console.warn('[StockMeta][batch] asset failed (' + consecutiveFail + ' in a row):', i + 1, '/', total, key);
        } else {
          skip++; // 'skip' / 'abort'
          consecutiveFail = 0;
        }
        console.log('[StockMeta][batch] progress', i + 1 + '/' + total, '->', res, '| ok', ok, 'fail', fail, 'skip', skip);
        persist({ running: true, startedAt, processedKeys, total, mode });
        if (res === 'abort') break;
        if (consecutiveFail >= MAX_CONSECUTIVE_FAIL) {
          console.warn('[StockMeta][batch] aborting: ' + MAX_CONSECUTIVE_FAIL + ' consecutive failures (check API key / quota / page layout)');
          aborted = true;
          break;
        }
        if (i < total - 1) await sleep(intervalMs);
      }

      // ---- second chance: re-recognize the assets that failed ----------------
      // "Keywords not recognized" is usually a one-off (slow answer, rate limit,
      // empty reply), so the failed assets get another recognition round once
      // the queue is done instead of being left at 0 keywords.
      if (!stopRequested && !aborted && failedKeys.length) {
        console.log('[StockMeta][batch] re-recognizing ' + failedKeys.length + ' failed asset(s)');
        for (let j = 0; j < failedKeys.length; j++) {
          if (stopRequested) break;
          const key = failedKeys[j];
          const tile = findTileByKey(key);
          if (!tile) continue;
          reportPhase(j + 1, failedKeys.length, 'batchRecognizing');
          let res;
          try {
            res = await processAsset(tile, key, j + 1, failedKeys.length, mode);
          } catch (err) {
            console.warn('[StockMeta][batch] re-recognition crashed:', key, err);
            res = 'fail';
          }
          if (res === 'ok') {
            ok++;
            fail--;
            recovered++;
            consecutiveFail = 0;
            console.log('[StockMeta][batch] recovered by re-recognition:', key);
          }
          persist({ running: true, startedAt, processedKeys, total, mode });
          if (j < failedKeys.length - 1) await sleep(intervalMs);
        }
      }
    } finally {
      const stopped = stopRequested;
      stopRequested = false;
      running = false;
      clearState();
      lastSummary = { ok, fail, skip, stopped, aborted, recovered };
      console.log('[StockMeta][batch] finished:', lastSummary);
      if (core && core.notify) core.notify(lastSummary, false);
    }
    return lastSummary;
  }

  function stop() {
    if (!running) return;
    stopRequested = true;
  }

  // ---------------------------------------------------------------- leftovers
  // A run never restarts by itself: a leftover "running" flag (page reloaded, or
  // the tab was closed mid-run) is cleared so the next click starts from scratch
  // instead of spending API calls the user never asked for again.
  function clearStaleRun() {
    try {
      chrome.storage.local.get([STATE_KEY], (s) => {
        const st = s && s[STATE_KEY];
        if (!st) return;
        console.warn('[StockMeta][batch] clearing stale batch state from a previous session:', st);
        clearState();
        scanCache = { at: 0, pending: null, tiles: 0 };
        if (core && core.notify) core.notify(null, false);
      });
    } catch (_) {}
  }

  window.StockMetaBatch = {
    init(c) {
      core = c;
    },
    start,
    stop,
    clearStaleRun,
    countPending,
    countTiles,
    isRunning: () => running,
    lastSummary: () => lastSummary,
    // Debug helpers, also used by the panel's pending counter.
    scanTiles: queryTiles,
    pendingTiles,
    // Per-tile readers: StockMetaDebug.batch.dotState(tile) etc.
    dotState,
    tileKeywordCount,
    tileLooksDone,
    isPending,
    diagnose,
  };
})();
