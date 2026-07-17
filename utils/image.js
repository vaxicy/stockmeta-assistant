// utils/image.js
// Locate the currently selected Adobe Stock asset image and convert it to a
// Base64 data URL (resized so the longest edge <= 1024px, JPEG quality 0.82).

(function () {
  const MAX_EDGE = 1024;
  const JPEG_QUALITY = 0.82;

  // Candidate selectors for the "selected" asset container (do not rely on a
  // single class — Adobe DOM changes frequently).
  const SELECTED_CONTAINER_SELECTORS = [
    '[aria-selected="true"]',
    '[data-selected="true"]',
    '[data-testid*="selected" i]',
    '.is-selected',
    '.selected',
    '[aria-current="true"]',
    '.Mui-selected',
    '[data-state="selected"]',
  ];

  const IMG_SELECTORS = [
    'img[src]',
    'img[srcset]',
    'img[data-src]',
    'img',
    'picture img',
    'canvas',
  ];

  function pickSelectedContainer() {
    for (const sel of SELECTED_CONTAINER_SELECTORS) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    // Fallback: the element currently focused / active within a grid.
    const active = document.activeElement;
    if (active && active.closest('[role="listitem"], [role="gridcell"], [role="option"], li, article, .asset, .card')) {
      return active.closest('[role="listitem"], [role="gridcell"], [role="option"], li, article, .asset, .card');
    }
    return null;
  }

  function findImageIn(scope) {
    const root = scope || document;
    // Prefer selected container first.
    const container = scope || pickSelectedContainer();
    const searchRoot = container || document;
    for (const sel of IMG_SELECTORS) {
      const imgs = searchRoot.querySelectorAll(sel);
      for (const img of imgs) {
        const url = img.currentSrc || img.src || img.getAttribute('data-src');
        if (url && !url.startsWith('data:image/svg+xml') && !url.includes('placeholder')) {
          return img;
        }
      }
    }
    return null;
  }

  // Public: find the current asset image element.
  function findCurrentImage() {
    let img = findImageIn(null);
    if (!img) {
      // Last resort: any reasonably sized content image on the page.
      const all = Array.from(document.querySelectorAll('img[src]')).filter(
        (i) => i.naturalWidth > 80 && i.naturalHeight > 80
      );
      img = all[0] || null;
    }
    return img;
  }

  // Load an image element's pixels into a canvas. Supports src/currentSrc,
  // data URL, blob URL.
  function loadToCanvas(imgEl) {
    return new Promise((resolve, reject) => {
      const url = imgEl.currentSrc || imgEl.src || imgEl.getAttribute('data-src');
      if (!url) return reject(new Error('NO_SRC'));
      const im = new Image();
      im.crossOrigin = 'anonymous';
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error('LOAD_FAILED'));
      im.src = url;
    });
  }

  function resizeCanvas(im) {
    let { width, height } = im;
    if (width > MAX_EDGE || height > MAX_EDGE) {
      const ratio = Math.min(MAX_EDGE / width, MAX_EDGE / height);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(im, 0, 0, width, height);
    return canvas;
  }

  // Public: convert the current asset image to a Base64 JPEG data URL.
  async function getCurrentImageBase64() {
    const img = findCurrentImage();
    if (!img) throw new Error('NO_IMAGE');
    let im;
    try {
      im = await loadToCanvas(img);
    } catch (_) {
      // Try reading directly as a blob via fetch (handles blob: URLs).
      const url = img.currentSrc || img.src || img.getAttribute('data-src');
      if (url && url.startsWith('blob:')) {
        try {
          const blob = await (await fetch(url)).blob();
          const dataUrl = await blobToDataURL(blob);
          const im2 = await loadDataUrlToImage(dataUrl);
          im = im2;
        } catch (e2) {
          throw new Error('READ_FAILED');
        }
      } else {
        throw new Error('READ_FAILED');
      }
    }
    const canvas = resizeCanvas(im);
    return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  }

  function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('READ_FAILED'));
      reader.readAsDataURL(blob);
    });
  }

  function loadDataUrlToImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error('LOAD_FAILED'));
      im.src = dataUrl;
    });
  }

  window.StockMetaImage = { findCurrentImage, getCurrentImageBase64, MAX_EDGE, JPEG_QUALITY };
})();
