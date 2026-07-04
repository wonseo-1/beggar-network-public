// ═══════════════════════════════════════════════════════════
// TWEAKS PANEL — toggle from toolbar "Tweaks" button
// Lets you fiddle with handle style, panel widths, and demo
// state without re-saving the file.
// ═══════════════════════════════════════════════════════════

(function () {
  'use strict';

  const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
    "handleStyle": "tab",
    "panelLeftWidth": 320,
    "panelRightWidth": 340,
    "headerHeight": 56,
    "openOnLoad": "none"
  }/*EDITMODE-END*/;

  // Apply persisted defaults immediately
  const state = Object.assign({}, TWEAK_DEFAULTS);
  applyAll();

  function applyAll() {
    const r = document.documentElement;
    r.style.setProperty('--panel-w-left', state.panelLeftWidth + 'px');
    r.style.setProperty('--panel-w-right', state.panelRightWidth + 'px');
    r.style.setProperty('--header-h', state.headerHeight + 'px');

    document.body.dataset.handleStyle = state.handleStyle;
    applyHandleStyle(state.handleStyle);
  }

  function applyHandleStyle(style) {
    // Adjust the edge-handle visuals based on style choice
    const lh = document.getElementById('handleLeft');
    const rh = document.getElementById('handleRight');
    if (!lh || !rh) return;
    [lh, rh].forEach(h => {
      h.classList.remove('edge-handle--tab', 'edge-handle--pill', 'edge-handle--minimal');
      h.classList.add('edge-handle--' + style);
    });
  }

  // ─── Open-on-load behavior ─────────────────────────────
  // Wait a beat so panels-shim has wired things up.
  window.setTimeout(() => {
    if (state.openOnLoad === 'table' && typeof toggleRankingPanel === 'function') toggleRankingPanel();
    else if (state.openOnLoad === 'court' && typeof toggleCourtPanel === 'function') toggleCourtPanel();
    else if (state.openOnLoad === 'both') {
      if (typeof toggleRankingPanel === 'function') toggleRankingPanel();
      if (typeof toggleCourtPanel === 'function') toggleCourtPanel();
    }
  }, 200);

  // ─── Listen for parent toolbar Tweaks toggle ───────────
  const panel = document.getElementById('tweaksPanel');

  function setKey(key, value, persist = true) {
    state[key] = value;
    applyAll();
    if (persist) {
      try {
        window.parent.postMessage({
          type: '__edit_mode_set_keys',
          edits: { [key]: value },
        }, '*');
      } catch (e) { /* not in editor */ }
    }
  }

  function showPanel() {
    if (!panel.children.length) renderPanel();
    panel.hidden = false;
  }
  function hidePanel() {
    panel.hidden = true;
    try {
      window.parent.postMessage({ type: '__edit_mode_dismissed' }, '*');
    } catch (e) {}
  }

  // Register listener BEFORE announcing availability
  window.addEventListener('message', (e) => {
    if (!e || !e.data) return;
    if (e.data.type === '__activate_edit_mode') showPanel();
    else if (e.data.type === '__deactivate_edit_mode') hidePanel();
  });
  try {
    window.parent.postMessage({ type: '__edit_mode_available' }, '*');
  } catch (e) {}

  function renderPanel() {
    panel.innerHTML = `
      <div class="tweaks-panel__head">
        <div class="tweaks-panel__title">Tweaks</div>
        <button class="tweaks-panel__close" id="tweaksClose" aria-label="Close tweaks">✕</button>
      </div>

      <div class="tweak-group">
        <span class="tweak-label">Handle style</span>
        <div class="tweak-segmented" data-key="handleStyle">
          <button data-val="tab">Tab</button>
          <button data-val="pill">Pill</button>
          <button data-val="minimal">Minimal</button>
        </div>
      </div>

      <div class="tweak-group">
        <span class="tweak-label">Default state</span>
        <div class="tweak-segmented" data-key="openOnLoad">
          <button data-val="none">Closed</button>
          <button data-val="table">Table</button>
          <button data-val="court">Court</button>
          <button data-val="both">Both</button>
        </div>
      </div>

      <div class="tweak-group">
        <span class="tweak-label">The Table width</span>
        <div class="tweak-slider-row">
          <input type="range" class="tweak-slider" data-key="panelLeftWidth" min="240" max="420" step="10">
          <output></output>
        </div>
      </div>

      <div class="tweak-group">
        <span class="tweak-label">The Court width</span>
        <div class="tweak-slider-row">
          <input type="range" class="tweak-slider" data-key="panelRightWidth" min="260" max="440" step="10">
          <output></output>
        </div>
      </div>

      <div class="tweak-group">
        <span class="tweak-label">Header height</span>
        <div class="tweak-slider-row">
          <input type="range" class="tweak-slider" data-key="headerHeight" min="44" max="72" step="2">
          <output></output>
        </div>
      </div>
    `;

    // Wire segmented controls
    panel.querySelectorAll('.tweak-segmented').forEach(seg => {
      const key = seg.dataset.key;
      seg.querySelectorAll('button').forEach(btn => {
        if (btn.dataset.val === String(state[key])) btn.classList.add('is-active');
        btn.addEventListener('click', () => {
          seg.querySelectorAll('button').forEach(b => b.classList.remove('is-active'));
          btn.classList.add('is-active');
          const v = btn.dataset.val;
          setKey(key, v);
          if (key === 'openOnLoad') {
            // also apply immediately
            applyOpenState(v);
          }
        });
      });
    });

    // Wire sliders
    panel.querySelectorAll('.tweak-slider').forEach(s => {
      const key = s.dataset.key;
      const out = s.parentElement.querySelector('output');
      s.value = state[key];
      out.textContent = state[key] + 'px';
      s.addEventListener('input', () => {
        out.textContent = s.value + 'px';
        setKey(key, Number(s.value), false);
      });
      s.addEventListener('change', () => {
        setKey(key, Number(s.value), true);
      });
    });

    panel.querySelector('#tweaksClose').addEventListener('click', hidePanel);
  }

  function applyOpenState(v) {
    if (!window.__panels) return;
    window.__panels.setTableOpen(v === 'table' || v === 'both');
    window.__panels.setCourtOpen(v === 'court' || v === 'both');
  }
})();
