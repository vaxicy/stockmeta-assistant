// content/batch.js
// One-click batch mode for the Adobe Stock "Uploaded files" grid.
//
// Flow, for every tile flagged with a red dot (= missing title / keywords):
//   select the tile -> wait until Adobe really switched the detail form to that
//   asset -> read the thumbnail -> generate title & keywords -> apply everything
//   -> save -> next asset.
//
// DOM anchors confirmed by F12 inspection on contributor.stock.adobe.com/en/uploads:
//   grid    : .content-grid[data-t="assets-content-grid"][role="listbox"]
//   tile    : [role="option"][title="Content tile"]  (aria-selected toggles on click)
//   thumb   : img.upload-tile__thumbnail
//   red dot : i.icon-red inside .upload-statusbar
//
// The dot is detected through several independent signals, because Adobe ships
// slightly different markup between builds:
//   1. a class containing "icon-red" anywhere inside the tile group, and
//   2. the computed colour of the small status icons (the dot is painted by a
//      ::before box, so the colour is the only reliable marker).
// If neither matches while the grid is clearly not empty, the panel offers a
// "verify all" fallback that opens every tile and only processes the ones whose
// title / keywords are actually missing.
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
  const RED_CLASS_SELECTORS = [
    '.upload-statusbar i[class*="icon-red"]',
    '[class*="icon-red"]',
    '.upload-statusbar [class*="icon-danger"]',
    '.upload-statusbar [class*="icon-error"]',
  ];
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

  function isRedish(value) {
    const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(String(value || ''));
    if (!m) return false;
    const r = +m[1];
    const g = +m[2];
    const b = +m[3];
    return r >= 140 && r - g >= 55 && r - b >= 55;
  }

  // Signal 2: the dot is drawn by a ::before box, so the element's computed
  // colour (inherited from icon-red / a danger token) is the marker.
  function hasRedColorMarker(scope) {
    const list = scope.querySelectorAll(ICON_HINT_SELECTOR);
    const max = Math.min(list.length, COLOR_SCAN_MAX);
    for (let i = 0; i < max; i++) {
      const el = list[i];
      if ((el.textContent || '').trim().length > 24) continue; // not an icon
      let cs;
      try {
        cs = getComputedStyle(el);
      } catch (_) {
        continue;
      }
      if (isRedish(cs.color) || isRedish(cs.backgroundColor) || isRedish(cs.fill) || isRedish(cs.borderTopColor)) {
        return true;
      }
    }
    return false;
  }

  function isPending(tile) {
    if (!tile) return false;
    const scope = tileScope(tile);
    // Signal 1: explicit red class anywhere in this asset's group.
    for (const sel of RED_CLASS_SELECTORS) {
      if (scope.querySelector(sel)) return true;
    }
    // Signal 2: colour of the status icons — scan the status bar when there is
    // one (precise, ~4 icons), otherwise the whole tile group.
    const bar = scope.querySelector('.upload-statusbar');
    return hasRedColorMarker(bar || scope);
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

  // ---------------------------------------------------------------- one asset
  async function processAsset(tile, key, index, total, mode) {
    // Fail closed: if we cannot prove the detail form switched to THIS asset,
    // stop instead of risking writing one asset's metadata onto another.
    if (selectedTileKey() !== key) {
      reportPhase(index, total, mode === 'verify' ? 'batchVerifying' : 'batchSelecting');
      try {
        tile.scrollIntoView({ block: 'center' });
      } catch (_) {}
      await sleep(150);
      const beforeTitle = core.titleValue();
      tile.click();
      const switched = await waitFor(() => {
        if (selectedTileKey() !== key) return false;
        if (!core.hasTitleInput()) return false;
        return core.titleValue() !== beforeTitle;
      }, SELECT_TIMEOUT_MS);
      if (!switched) {
        core.showError('BATCH_SELECT_TIMEOUT');
        return 'abort';
      }
      await sleep(SETTLE_MS);
    }

    // "Verify all" fallback: no red dot could be read, so decide from the asset
    // itself — anything with a title and enough keywords is left untouched.
    if (mode === 'verify') {
      const title = String(core.titleValue() || '').trim();
      const kw = core.keywordCount ? core.keywordCount() : 0;
      console.log('[StockMeta][batch] verify:', title ? title.slice(0, 40) : '(no title)', '| keywords:', kw);
      if (title && kw >= 5) return 'skip';
    }

    reportPhase(index, total, 'batchGenerating');
    const gen = await withTimeout(
      Promise.resolve().then(() => core.generate()),
      GENERATE_TIMEOUT_MS,
      'generate',
      { ok: false, error: 'TIMEOUT' }
    );
    if (!gen || !gen.ok) {
      console.warn('[StockMeta][batch] generate failed:', key, gen && gen.error);
      core.showError((gen && gen.error) || 'UNKNOWN');
      return 'fail';
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

    reportPhase(index, total, 'batchSaving');
    await withTimeout(Promise.resolve().then(() => core.save()), SAVE_TIMEOUT_MS, 'save', undefined);
    await sleep(SAVE_SETTLE_MS);
    return 'ok';
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
            return !!k && processedKeys.indexOf(k) === -1;
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
    let consecutiveFail = 0;
    let aborted = false;
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
    } finally {
      const stopped = stopRequested;
      stopRequested = false;
      running = false;
      clearState();
      lastSummary = { ok, fail, skip, stopped, aborted };
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
    diagnose,
  };
})();
