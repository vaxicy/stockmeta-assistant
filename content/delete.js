// content/delete.js
// Batch delete for the Adobe Stock "Uploaded files" grid.
//
// Why this exists: some assets keep a RED status dot even though the title and
// the keywords are complete — Adobe seems to get stuck on them, and they can no
// longer be submitted. Removing them means opening each one and confirming a
// dialog, so this engine walks the whole grid instead.
//
// The red dot is the ONLY selection criterion. Assets whose dot is green or
// unreadable are never touched, and the keyword badge deliberately plays no part
// here: an asset that merely lacks keywords must NOT be deleted (that is the
// batch generator's job). Because deletion cannot be undone, every asset goes
// through Adobe's own confirmation dialog and a dry run is available that walks
// the exact same path but cancels the dialog instead of confirming it.
//
// Flow, per asset:
//   select the tile -> prove the detail view really switched to it (stock id)
//   -> click the sidebar delete button -> wait for Adobe's confirmation dialog
//   -> click "Confirm and Delete" -> wait until the tile leaves the grid.
//
// DOM anchors confirmed by F12 on contributor.stock.adobe.com/en/uploads:
//   delete button : [data-t="asset-sidebar-delete-asset-button"]
//                   (aria-label="Delete asset button"; it is a React Aria
//                    pressable, so the click must be synthetic
//                    mousedown/mouseup/click — a bare .click() can be ignored)
//   confirm dialog: .mti-modal -> [data-t="delete-all-assets-confirmation-CTA"]
// The Spectrum class prefixes (cQAdjg, CqADjq, …) are build-hashed and change
// between Adobe releases, so they are only used as a last-resort fallback.
//
// The panel owns the button, the counter and the progress line; this module only
// owns the destructive sequence and reports through the `core` API handed over
// by content.js.

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

  // Primary anchors are custom data attributes (stable); hashed Spectrum classes
  // are never used as the first choice.
  const DELETE_BTN_SELECTORS = [
    '[data-t="asset-sidebar-delete-asset-button"]',
    'button[aria-label="Delete asset button"]',
    'button[data-t*="delete-asset"]',
    'button[aria-label*="Delete asset" i]',
  ];
  const DELETE_BTN_FALLBACKS = [
    '.content-side-panel button[class*="spectrum-ActionButton"]',
    '.content-side-panel [data-t="asset-sidebar-header"] button',
  ];
  const CONFIRM_SELECTORS = [
    '[data-t="delete-all-assets-confirmation-CTA"]',
    '.mti-modal__footer button.button--dialog',
    '.mti-modal button[class*="dialog"][class*="primary"]',
  ];
  // The Cancel / close affordances, used by the dry run so nothing is deleted.
  const CANCEL_SELECTORS = [
    '.mti-modal__footer button:not([data-t="delete-all-assets-confirmation-CTA"]):not(.button--dialog)',
    '.mti-modal__footer button[class*="secondary"]',
  ];
  const MODAL_SELECTOR = '.mti-modal';

  const SELECT_TIMEOUT_MS = 12000;
  const DELETE_BTN_TIMEOUT_MS = 4000;
  const MODAL_TIMEOUT_MS = 6000;
  const GONE_TIMEOUT_MS = 15000;
  const SETTLE_MS = 400;
  const POLL_MS = 150;
  // Reading a tile's dot costs computed-style lookups, so the red list is cached
  // the same way the batch engine caches its scan (the panel polls every second).
  const SCAN_CACHE_MS = 2500;
  // Repeated failures mean the markup changed (or the panel is gone) — stop
  // instead of walking the whole grid doing nothing.
  const MAX_CONSECUTIVE_FAIL = 3;
  // A destructive run must never be able to walk forever.
  const SAFETY_MAX_ASSETS = 300;

  let core = null;
  let running = false;
  let stopRequested = false;
  let lastSummary = null;
  let scanCache = { at: 0, red: null };

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
        if (
          !tile &&
          el.classList &&
          (el.classList.contains('upload-tile') || el.classList.contains('content-grid-element'))
        ) {
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
  // doubles as the queue key and as the "is it still there?" marker.
  function tileKey(tile) {
    const img = tileImage(tile);
    if (!img) return '';
    return img.currentSrc || img.src || img.getAttribute('data-src') || '';
  }

  function tileId(tile) {
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

  function findTileByKey(key) {
    if (!key) return null;
    return queryTiles().find((t) => tileKey(t) === key) || null;
  }

  // Only the dot decides here — never the keyword badge (see the header).
  function isRedTile(tile) {
    const Batch = window.StockMetaBatch;
    if (!Batch || !Batch.dotState) return false;
    try {
      return Batch.dotState(tile) === 'red';
    } catch (_) {
      return false;
    }
  }

  function redTiles(force) {
    const now = Date.now();
    if (!force && scanCache.red && now - scanCache.at < SCAN_CACHE_MS) return scanCache.red;
    let red = [];
    try {
      red = queryTiles().filter(isRedTile);
    } catch (_) {
      red = [];
    }
    scanCache = { at: now, red };
    return red;
  }

  function invalidateScan() {
    scanCache = { at: 0, red: null };
  }

  // ---------------------------------------------------------------- click
  // A plain el.click() is not always enough for React handlers; mousedown /
  // mouseup / click mirrors what a real click sends without opening anything.
  // (Same helper the batch engine uses on the grid tiles.)
  function clickEl(el) {
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

  function isVisible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  async function waitFor(fn, timeout) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      if (stopRequested) return false;
      let ok = false;
      try {
        ok = !!fn();
      } catch (_) {}
      if (ok) return true;
      await sleep(POLL_MS);
    }
    return false;
  }

  async function waitForEl(getter, timeout) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      if (stopRequested) return null;
      let el = null;
      try {
        el = getter();
      } catch (_) {}
      if (el) return el;
      await sleep(POLL_MS);
    }
    return null;
  }

  // ---------------------------------------------------------------- controls
  function firstMatch(selectors, { visibleOnly, scope } = {}) {
    const root = scope || document;
    for (const sel of selectors) {
      let list = [];
      try {
        list = Array.from(root.querySelectorAll(sel));
      } catch (_) {
        list = [];
      }
      if (!list.length) continue;
      if (visibleOnly) {
        const seen = list.find(isVisible);
        if (seen) return seen;
        continue;
      }
      return list[0];
    }
    return null;
  }

  // The trash button in the detail side panel. Prefer a visible one so a hidden
  // duplicate from a previous render can never win.
  function findDeleteButton() {
    return (
      firstMatch(DELETE_BTN_SELECTORS, { visibleOnly: true }) ||
      firstMatch(DELETE_BTN_SELECTORS) ||
      firstMatch(DELETE_BTN_FALLBACKS, { visibleOnly: true })
    );
  }

  function findConfirmButton() {
    return (
      firstMatch(CONFIRM_SELECTORS, { visibleOnly: true }) ||
      firstMatch(CONFIRM_SELECTORS)
    );
  }

  // Close Adobe's dialog without confirming (used by the dry run and whenever a
  // step after the dialog failed).
  function dismissDialog() {
    const modal = document.querySelector(MODAL_SELECTOR);
    if (!modal) return;
    const cancel = firstMatch(CANCEL_SELECTORS, { visibleOnly: true, scope: modal });
    if (cancel) {
      clickEl(cancel);
      return;
    }
    const close = modal.querySelector('[class*="close" i]');
    if (close) {
      clickEl(close);
      return;
    }
    try {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    } catch (_) {}
  }

  // ---------------------------------------------------------------- select
  // Prove that the detail view really shows THIS tile before the delete button is
  // pressed: with the wrong asset on screen, the delete button would remove the
  // wrong asset. The proof is the stock id of the image that is on screen, never
  // a business field (an empty title is not an identity).
  async function ensureSelected(tile, key) {
    const wantId = tileId(tile);
    const beforeId = core.currentAssetId ? core.currentAssetId() : '';
    const beforeSrc = core.currentImageSrc ? core.currentImageSrc() : '';

    if (isStockId(wantId) && beforeId === wantId) return true;

    try {
      tile.scrollIntoView({ block: 'center' });
    } catch (_) {}
    await sleep(150);

    const proof = () => {
      if (core.hasTitleInput && !core.hasTitleInput()) return false; // panel not ready
      const nowId = core.currentAssetId ? core.currentAssetId() : '';
      if (isStockId(wantId) && isStockId(nowId)) return nowId === wantId;
      const nowSrc = core.currentImageSrc ? core.currentImageSrc() : '';
      return !!nowSrc && nowSrc !== beforeSrc;
    };

    const candidates = [tile, tileImage(tile), tile.closest('.content-grid-element')].filter(
      (el, i, arr) => el && arr.indexOf(el) === i
    );
    for (const el of candidates) {
      if (stopRequested) return false;
      clickEl(el);
      if (await waitFor(proof, Math.round(SELECT_TIMEOUT_MS / candidates.length))) {
        await sleep(SETTLE_MS);
        return true;
      }
    }

    console.warn(
      '[StockMeta][delete] could not confirm the switch — want:',
      wantId || key,
      '| asset on screen now:',
      core.currentAssetId ? core.currentAssetId() : '(n/a)'
    );
    return false;
  }

  // ---------------------------------------------------------------- one asset
  // Returns 'ok' | 'fail' | 'skip'.
  async function deleteOne(item, index, total, dryRun) {
    const tile = findTileByKey(item.key) || item.tile;
    if (!tile) return 'skip';
    // Re-read the dot right before acting: a tile that turned green in the
    // meantime must not be deleted.
    if (!isRedTile(tile)) {
      console.log('[StockMeta][delete] skipped (dot is not red anymore):', item.key);
      return 'skip';
    }

    core.phase(index, total, 'deleteSelecting');
    if (!(await ensureSelected(tile, item.key))) {
      core.showError('DELETE_SELECT_TIMEOUT');
      return 'fail';
    }

    // The button only exists while the side panel shows the selected asset.
    const btn = await waitForEl(findDeleteButton, DELETE_BTN_TIMEOUT_MS);
    if (!btn) {
      core.showError('DELETE_NO_BUTTON');
      return 'fail';
    }

    core.phase(index, total, dryRun ? 'deleteVerifying' : 'deleteRemoving');
    clickEl(btn);

    const confirmBtn = await waitForEl(findConfirmButton, MODAL_TIMEOUT_MS);
    if (!confirmBtn) {
      core.showError('DELETE_NO_DIALOG');
      dismissDialog();
      return 'fail';
    }

    if (dryRun) {
      // Identical path, but cancel instead of confirming: proves every selector
      // without removing anything.
      dismissDialog();
      await sleep(SETTLE_MS);
      console.log('[StockMeta][delete] dry run reached the dialog for', item.key);
      return 'ok';
    }

    clickEl(confirmBtn);

    // The asset only counts as deleted when its tile really left the grid.
    const gone = await waitFor(() => !findTileByKey(item.key), GONE_TIMEOUT_MS);
    if (!gone) {
      core.showError('DELETE_NOT_GONE');
      return 'fail';
    }
    invalidateScan();
    console.log('[StockMeta][delete] deleted', item.key);
    return 'ok';
  }

  // ---------------------------------------------------------------- run
  async function start(opts) {
    if (running) return lastSummary;
    const options = opts || {};
    const parsed = parseInt(options.intervalMs, 10);
    const intervalMs = Math.max(300, Number.isFinite(parsed) ? parsed : 2000);
    const dryRun = !!options.dryRun;

    let targets = [];
    try {
      targets = redTiles(true)
        .map((tile) => ({ tile, key: tileKey(tile) }))
        .filter((x) => !!x.key);
    } catch (err) {
      console.warn('[StockMeta][delete] scan failed:', err);
      targets = [];
    }
    invalidateScan();

    if (!targets.length) {
      lastSummary = { ok: 0, fail: 0, skip: 0, stopped: false, dryRun };
      if (core && core.notify) core.notify(lastSummary, false);
      return lastSummary;
    }
    if (targets.length > SAFETY_MAX_ASSETS) {
      console.warn('[StockMeta][delete] capping the run at', SAFETY_MAX_ASSETS, 'assets');
      targets = targets.slice(0, SAFETY_MAX_ASSETS);
    }

    running = true;
    stopRequested = false;
    if (core && core.notify) core.notify(null, true);
    console.log('[StockMeta][delete] starting', { count: targets.length, intervalMs, dryRun });

    let ok = 0;
    let fail = 0;
    let skip = 0;
    let consecutiveFail = 0;

    for (let i = 0; i < targets.length; i++) {
      if (stopRequested) break;
      const item = targets[i];
      let res = 'fail';
      try {
        res = await deleteOne(item, i + 1, targets.length, dryRun);
      } catch (err) {
        console.warn('[StockMeta][delete] crashed on', item.key, err);
        res = 'fail';
      }
      if (res === 'ok') {
        ok++;
        consecutiveFail = 0;
      } else if (res === 'skip') {
        skip++;
        consecutiveFail = 0;
      } else {
        fail++;
        consecutiveFail++;
      }
      if (consecutiveFail >= MAX_CONSECUTIVE_FAIL) {
        console.warn('[StockMeta][delete] aborting after', consecutiveFail, 'consecutive failures');
        break;
      }
      if (i < targets.length - 1) await sleep(intervalMs);
    }

    const stopped = stopRequested;
    stopRequested = false;
    running = false;
    invalidateScan();
    lastSummary = { ok, fail, skip, stopped, dryRun };
    console.log('[StockMeta][delete] finished:', lastSummary);
    if (core && core.notify) core.notify(lastSummary, false);
    return lastSummary;
  }

  function stop() {
    if (!running) return;
    stopRequested = true;
  }

  window.StockMetaDelete = {
    init(c) {
      core = c;
    },
    start,
    stop,
    isRunning: () => running,
    lastSummary: () => lastSummary,
    // Counted for the panel button. Cached (see SCAN_CACHE_MS) because the panel
    // polls it once a second.
    countRed: () => {
      try {
        return redTiles().length;
      } catch (_) {
        return 0;
      }
    },
    redTiles: () => redTiles(true),
    // Debug helpers: StockMetaDebug.delete.dryRun() walks the whole path and
    // cancels every dialog, so nothing is deleted.
    dryRun: (intervalMs) => start({ intervalMs, dryRun: true }),
    findDeleteButton,
    findConfirmButton,
  };
})();
