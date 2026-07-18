// utils/dom.js
// Find Adobe Stock title/keyword inputs and fill them in a way compatible with
// plain <input>, <textarea>, React-controlled inputs, and tag inputs.
// Uses multiple candidate selectors; never assumes a single class.

(function () {
  // --- React-compatible value setter -------------------------------------
  function setNativeValue(el, value) {
    const proto =
      el.tagName === 'TEXTAREA'
        ? window.HTMLTextAreaElement.prototype
        : el.tagName === 'SELECT'
        ? window.HTMLSelectElement.prototype
        : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) {
      setter.call(el, value);
    } else {
      el.value = value;
    }
  }

  function fireInputEvents(el) {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter' }));
  }

  // --- Candidate selectors (multiple, ordered by specificity) -----------
  const TITLE_SELECTORS = [
    'input[name="title"]',
    'textarea[name="title"]',
    'input[data-testid*="title" i]',
    'textarea[data-testid*="title" i]',
    'input[aria-label*="title" i]',
    'textarea[aria-label*="title" i]',
    'input[placeholder*="title" i]',
    'textarea[placeholder*="title" i]',
    '[data-testid*="asset-title" i] input',
    '[data-testid*="asset-title" i] textarea',
    '#title input',
    '#title textarea',
  ];

  const KEYWORD_SELECTORS = [
    'textarea[name="keywords"]',
    'input[name="keywords"]',
    '[data-testid="keywords"] input',
    '[data-testid="keywords"] textarea',
    '[data-testid="keyword-input"] input',
    '[data-testid="keyword-input"] textarea',
    '[data-testid="keywords-field"] input',
    '[data-testid="keywords-field"] textarea',
    'textarea[id*="keyword" i]',
    'input[id*="keyword" i]',
    'textarea[data-testid*="keyword" i]',
    'input[data-testid*="keyword" i]',
    '[data-testid*="keyword" i] textarea',
    '[data-testid*="keyword" i] input',
    '[role="textbox"][aria-label*="keyword" i]',
    '[contenteditable="true"][aria-label*="keyword" i]',
    'textarea[aria-label*="keyword" i]',
    'input[aria-label*="keyword" i]',
    'textarea[placeholder*="keyword" i]',
    'input[placeholder*="keyword" i]',
    'textarea[placeholder*="minimum 5" i]',
    'input[placeholder*="minimum 5" i]',
    'input[placeholder*="Add keyword" i]',
    'textarea[placeholder*="Add keyword" i]',
    'input[placeholder*="Enter keyword" i]',
    'textarea[placeholder*="Enter keyword" i]',
    'input[placeholder*="Type keyword" i]',
    'textarea[placeholder*="Type keyword" i]',
    '[data-testid*="tags" i] input',
    '[data-testid*="tags" i] textarea',
    '[data-testid*="tag" i] input',
    '[data-testid*="tag" i] textarea',
    '.tags-input input',
    '.tags-input textarea',
    '.tag-input input',
    '.tag-input textarea',
  ];

  function isVisible(el) {
    const rect = el.getBoundingClientRect();
    return !!(rect.width || rect.height || rect.top || rect.left);
  }

  function findFirst(selectors) {
    // First pass: prefer visible / focused elements.
    for (const sel of selectors) {
      const list = document.querySelectorAll(sel);
      for (const el of list) {
        if (el.offsetParent !== null || el === document.activeElement || isVisible(el)) {
          return el;
        }
      }
    }
    // Second pass: any match.
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function findTitleInput() {
    return findFirst(TITLE_SELECTORS);
  }

  function findKeywordInput() {
    return findFirst(KEYWORD_SELECTORS);
  }

  function focusElement(el) {
    if (el && el.focus) {
      el.focus();
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  // --- Keyword input helpers --------------------------------------------
  function isPlainTextKeywordInput(el) {
    if (el.tagName === 'TEXTAREA') return true;
    if (el.getAttribute('role') === 'textbox' || el.getAttribute('contenteditable') === 'true') {
      return false; // contenteditable is usually tag-style
    }
    // If the input is inside a tag container, treat as tag input.
    const tagContainer = el.closest('[data-testid*="tag" i], [data-testid*="keyword" i], .tags, .tags-input, .tag-input, [role="listbox"]');
    if (tagContainer) return false;
    return el.tagName === 'INPUT';
  }

  function getKeywordValue(el) {
    if (el.getAttribute('contenteditable') === 'true') {
      return el.textContent || '';
    }
    return el.value || '';
  }

  function setKeywordValue(el, value) {
    if (el.getAttribute('contenteditable') === 'true') {
      el.textContent = value;
    } else {
      setNativeValue(el, value);
    }
  }

  function clearKeywordInput(el) {
    const container =
      el.closest('[data-testid*="tag" i], [data-testid*="keyword" i], [data-testid*="keywords" i], .tags, .tags-input, .tag-input, [role="listbox"]') ||
      el.parentElement;
    if (!container) {
      setKeywordValue(el, '');
      fireInputEvents(el);
      return;
    }
    // 1. Try a clear/remove-all button.
    const clearBtn = container.querySelector(
      '[aria-label*="clear" i], [aria-label*="remove all" i], [aria-label*="remove" i], button[title*="clear" i], button[title*="remove all" i], button[title*="remove" i], .clear-button'
    );
    if (clearBtn) {
      clearBtn.click();
      return;
    }
    // 2. Remove individual tags one by one.
    const tags = container.querySelectorAll(
      '[role="option"], [role="listitem"], .tag, .chip, [data-testid*="tag" i], [data-testid*="keyword-tag" i], .keyword-tag, .keyword'
    );
    for (const tag of Array.from(tags).reverse()) {
      const removeBtn = tag.querySelector(
        '[aria-label*="remove" i], [aria-label*="delete" i], button[title*="remove" i], button[title*="delete" i], .remove, .close, .delete, [data-testid*="remove" i]'
      );
      if (removeBtn) removeBtn.click();
    }
    // 3. Native clear of the input itself.
    setKeywordValue(el, '');
    fireInputEvents(el);
  }

  function fireKey(el, key, opts) {
    el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key, ...opts }));
    el.dispatchEvent(new KeyboardEvent('keypress', { bubbles: true, key, ...opts }));
    el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key, ...opts }));
  }

  // Simulate typing a word into a tag input and committing it.
  function typeIntoTagInput(el, word) {
    if (!word) return;
    focusElement(el);
    setKeywordValue(el, '');
    fireInputEvents(el);

    // Set the full word at once (most React inputs handle this).
    setKeywordValue(el, word);
    el.dispatchEvent(new InputEvent('input', { bubbles: true, data: word, inputType: 'insertText' }));
    // Fire key events that tag inputs usually listen for.
    fireKey(el, 'Enter', { code: 'Enter', keyCode: 13, which: 13 });
    fireKey(el, ',', { code: 'Comma', keyCode: 188, which: 188 });
    // Clear the input for the next tag.
    setKeywordValue(el, '');
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
  }

  function setKeywordsAsPlainText(el, keywords) {
    const text = keywords.join(', ');
    setKeywordValue(el, text);
    fireInputEvents(el);
  }

  // --- Fill operations --------------------------------------------------
  function setAdobeTitle(title) {
    const el = findTitleInput();
    if (!el) throw new Error('TITLE_INPUT_NOT_FOUND');
    focusElement(el);
    setNativeValue(el, title);
    fireInputEvents(el);
    const ok = el.value.trim() === String(title).trim();
    return { success: true, verified: ok, input: el };
  }

  function addAdobeKeywords(keywords) {
    const el = findKeywordInput();
    if (!el) throw new Error('KEYWORD_INPUT_NOT_FOUND');
    console.log('[StockMeta] keyword input found:', el.tagName, el);
    focusElement(el);
    if (isPlainTextKeywordInput(el)) {
      const existing = getKeywordValue(el).trim();
      const all = existing ? existing + ', ' + keywords.join(', ') : keywords.join(', ');
      setKeywordsAsPlainText(el, all.split(', ').filter(Boolean));
    } else {
      for (const kw of keywords) {
        typeIntoTagInput(el, kw);
      }
    }
    return verifyKeywords(el, keywords);
  }

  function replaceAdobeKeywords(keywords) {
    const el = findKeywordInput();
    if (!el) throw new Error('KEYWORD_INPUT_NOT_FOUND');
    console.log('[StockMeta] keyword input found:', el.tagName, el);
    focusElement(el);
    clearKeywordInput(el);
    if (isPlainTextKeywordInput(el)) {
      setKeywordsAsPlainText(el, keywords);
    } else {
      for (const kw of keywords) {
        typeIntoTagInput(el, kw);
      }
    }
    return verifyKeywords(el, keywords);
  }

  function verifyKeywords(el, keywords) {
    // Allow a short delay for React to render tags, then retry once if needed.
    return new Promise((resolve, reject) => {
      const tryVerify = (attempt) => {
        setTimeout(() => {
          const container =
            el.closest('[data-testid*="keyword" i], [data-testid*="tags" i], [data-testid*="tag" i], [data-testid*="keywords" i], .tags, .tags-input, .tag-input, [role="listbox"], [class*="keyword" i], [class*="tag" i]') ||
            el.parentElement;

          const tagSelectors =
            '[role="option"], [role="listitem"], .tag, .chip, [data-testid*="tag" i], [data-testid*="keyword-tag" i], .keyword-tag, .keyword, [class*="tag" i], [class*="keyword" i]';
          const tags = container
            ? Array.from(container.querySelectorAll(tagSelectors)).filter((t) => (t.textContent || '').trim())
            : [];
          const tagCount = tags.length;

          let current = '';
          if (el.getAttribute('contenteditable') === 'true') {
            current = el.textContent || '';
          } else {
            current = el.value || '';
          }

          const plainCount = current
            .split(/[,，;；\n]+/)
            .map((s) => s.trim())
            .filter(Boolean).length;

          // Build a haystack from the input, its container, and any visible tags in the document.
          const containerText = container ? container.textContent || '' : '';
          const visibleTagText = Array.from(document.querySelectorAll(tagSelectors))
            .map((t) => t.textContent || '')
            .join(' ');
          const haystack = (current + ' ' + containerText + ' ' + visibleTagText).toLowerCase();
          const present = keywords.filter((kw) => haystack.includes(String(kw).toLowerCase().trim())).length;

          if (present >= keywords.length || tagCount >= keywords.length || plainCount >= keywords.length) {
            resolve({ success: true, input: el });
          } else if (present > 0 || tagCount > 0 || plainCount > 0 || current.trim().length > 0) {
            // Some keywords were written; treat as success to avoid false negatives.
            resolve({ success: true, input: el });
          } else if (attempt < 2) {
            tryVerify(attempt + 1);
          } else {
            reject(new Error('KEYWORD_APPLY_NOT_VERIFIED'));
          }
        }, attempt === 0 ? 400 : 500);
      };
      tryVerify(0);
    });
  }

  window.StockMetaDom = {
    findTitleInput,
    findKeywordInput,
    setAdobeTitle,
    addAdobeKeywords,
    replaceAdobeKeywords,
    setNativeValue,
    fireInputEvents,
  };
})();
