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
  const RED_DOT_SELECTORS = [
    '.upload-statusbar i.icon-red',
    '.upload-statusbar [class*="icon-red"]',
    'i.icon-red',
    '[class*="icon-red"]',
  ];

  const STATE_KEY = 'batchState';
  const SELECT_TIMEOUT_MS = 12000;
  const SETTLE_MS = 400;
  const SAVE_SETTLE_MS = 500;
  const SAFETY_MAX_ASSETS = 500;
  const RESUME_MAX_AGE_MS = 10 * 60 * 1000;

  let core = null;
  let running = false;
  let stopRequested = false;
  let processedKeys = [];
  let lastSummary = null;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------------------------------------------------------------- grid
  function gridRoot() {
    return (
      document.querySelector('[data-t="assets-content-grid"]') ||
      document.querySelector('.content-grid') ||
      document.querySelector('[role="listbox"][aria-multiselectable="true"]') ||
      null
    );
  }

  function queryTiles() {
    const root = gridRoot();
    const scopes = root ? [root, document] : [document];
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

  function isPending(tile) {
    if (!tile) return false;
    const scope = tile.closest('.content-grid-element') || tile;
    const bar = scope.querySelector('.upload-statusbar');
    const roots = bar && bar !== scope ? [bar, scope] : [scope];
    for (const root of roots) {
      for (const sel of RED_DOT_SELECTORS) {
        if (root.querySelector(sel)) return true;
      }
    }
    return false;
  }

  function pendingTiles() {
    return queryTiles().filter(isPending);
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

  function selectedTileKey() {
    const root = gridRoot();
    if (!root) return '';
    const sel = root.querySelector('[role="option"][aria-selected="true"]');
    return sel ? tileKey(sel) : '';
  }

  function findTileByKey(key) {
    return queryTiles().find((t) => tileKey(t) === key) || null;
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
  function reportPhase(index, total, phaseKey) {
    if (!core || !core.status) return;
    core.status(core.tf('batchProgress', { i: index, total, phase: core.t(phaseKey) }));
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
    if (core && core.notify) core.notify(null, running);
  }

  // ---------------------------------------------------------------- one asset
  async function processAsset(tile, key, index, total) {
    // Only click when this asset is not already on screen; clicking the tile that
    // is already selected would never change the form and look like a timeout.
    if (selectedTileKey() !== key) {
      reportPhase(index, total, 'batchSelecting');
      try {
        tile.scrollIntoView({ block: 'center' });
      } catch (_) {}
      await sleep(150);
      const beforeTitle = core.titleValue();
      tile.click();
      // Fail closed: if we cannot prove the detail form switched to THIS asset,
      // stop instead of risking writing one asset's metadata onto another.
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

    reportPhase(index, total, 'batchGenerating');
    const gen = await core.generate();
    if (!gen || !gen.ok) {
      console.warn('[StockMeta][batch] generate failed:', key, gen && gen.error);
      core.showError((gen && gen.error) || 'UNKNOWN');
      return 'fail';
    }

    reportPhase(index, total, 'batchApplying');
    try {
      await core.applyAll();
    } catch (err) {
      // A failing dropdown (category / file type) must not throw away an asset
      // whose title and keywords are already written.
      console.warn('[StockMeta][batch] apply warning (continuing):', err && err.message);
    }

    reportPhase(index, total, 'batchSaving');
    await core.save();
    await sleep(SAVE_SETTLE_MS);
    return 'ok';
  }

  // ---------------------------------------------------------------- run
  async function start(opts) {
    if (running) return lastSummary;
    if (!core) return null;
    const options = opts || {};
    const intervalMs = Math.max(300, parseInt(options.intervalMs, 10) || 1500);
    if (!options.resume) processedKeys = [];

    const queue = unprocessedPending();
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
    const total = Math.min(queue.length, SAFETY_MAX_ASSETS);
    const startedAt = options.startedAt || Date.now();
    persist({ running: true, startedAt, processedKeys, total });

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
          res = await processAsset(findTileByKey(key) || tile, key, i + 1, total);
        } catch (err) {
          console.warn('[StockMeta][batch] asset crashed:', key, err);
          res = 'fail';
        }
        if (processedKeys.indexOf(key) === -1) processedKeys.push(key);
        if (res === 'ok') ok++;
        else if (res === 'fail') fail++;
        else skip++; // 'skip' / 'abort'
        persist({ running: true, startedAt, processedKeys, total });
        if (res === 'abort') break;
        if (i < total - 1) await sleep(intervalMs);
      }
    } finally {
      const stopped = stopRequested;
      stopRequested = false;
      running = false;
      clearState();
      lastSummary = { ok, fail, skip, stopped };
      if (core && core.notify) core.notify(lastSummary, false);
    }
    return lastSummary;
  }

  function stop() {
    if (!running) return;
    stopRequested = true;
  }

  // ---------------------------------------------------------------- resume
  // Adobe's uploads page usually swaps the detail form in place, but if the page
  // does reload mid-run we pick the queue back up instead of silently dying.
  function maybeResume() {
    try {
      chrome.storage.local.get([STATE_KEY, 'batchProcess', 'batchIntervalMs'], (s) => {
        const st = s && s[STATE_KEY];
        if (!st || !st.running) return;
        const age = Date.now() - (st.startedAt || 0);
        if (age > RESUME_MAX_AGE_MS || !s.batchProcess) {
          clearState();
          return;
        }
        processedKeys = Array.isArray(st.processedKeys) ? st.processedKeys.slice() : [];
        if (!unprocessedPending().length) {
          clearState();
          return;
        }
        setTimeout(() => {
          if (running || !core) return;
          core.toast('batchResumed');
          start({
            intervalMs: s.batchIntervalMs,
            resume: true,
            startedAt: st.startedAt,
          });
        }, 2500);
      });
    } catch (_) {}
  }

  window.StockMetaBatch = {
    init(c) {
      core = c;
    },
    start,
    stop,
    maybeResume,
    countPending,
    isRunning: () => running,
    lastSummary: () => lastSummary,
    // Debug helpers (also used by the panel's pending counter).
    scanTiles: queryTiles,
    pendingTiles,
  };
})();
