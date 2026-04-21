// Invoice Generator — pure client-side, localStorage persistence, two templates.
// No auth yet. Designed so anyone can use it blank; user populates via Settings.

'use strict';

// ============== STATE ==============
const STORE = {
  SETTINGS: 'invgen:settings',
  CLIENTS: 'invgen:clients',
  KIT: 'invgen:kit',
  RECENTS: 'invgen:recents',
  APPEARANCE: 'invgen:appearance',
};

// ============== APPEARANCE ==============
const DEFAULT_APPEARANCE = {
  accent: '#1E3A5F', highlight: '#D4B896', bg: '#F7F5F0', ink: '#0A0E1A',
  displayFont: 'DM Serif Display', bodyFont: 'Inter', fontSize: 'medium',
  _activeTheme: 'classic', _customThemes: [],
};

const THEMES = {
  classic: { accent: '#1E3A5F', highlight: '#D4B896', bg: '#F7F5F0', ink: '#0A0E1A' },
  minimal: { accent: '#111111', highlight: '#888888', bg: '#FFFFFF', ink: '#111111' },
  warm:    { accent: '#7B3B2A', highlight: '#C9A87C', bg: '#FDF6EF', ink: '#1A0F08' },
  forest:  { accent: '#1D4A2E', highlight: '#A8B87C', bg: '#F4F7F1', ink: '#0D1F0F' },
  slate:   { accent: '#2D3B4E', highlight: '#7BA7C2', bg: '#F2F5F8', ink: '#0D1520' },
};

// Panel session state (not persisted)
let _apEditingCustomSlot = null; // which custom slot is being edited: null | 1 | 2
let _apDirty = false;            // pickers have unsaved changes
let _apCurrentThemeKey = null;   // active theme key in current panel session

function hexToRgb(hex) {
  const h = hex.replace('#','');
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}
function hexToRgba(hex, a) { const [r,g,b] = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; }
function lightenHex(hex, t) {
  const [r,g,b] = hexToRgb(hex);
  const ch = v => Math.min(255, Math.round(v + (255-v)*t)).toString(16).padStart(2,'0');
  return `#${ch(r)}${ch(g)}${ch(b)}`;
}
function darkenHex(hex, t) {
  const [r,g,b] = hexToRgb(hex);
  const ch = v => Math.max(0, Math.round(v*(1-t))).toString(16).padStart(2,'0');
  return `#${ch(r)}${ch(g)}${ch(b)}`;
}

const FONT_STACK = {
  'DM Serif Display': `'DM Serif Display', Georgia, serif`,
  'Playfair Display': `'Playfair Display', Georgia, serif`,
  'Cormorant Garamond': `'Cormorant Garamond', Georgia, serif`,
  'Libre Baskerville': `'Libre Baskerville', Georgia, serif`,
  'Inter': `'Inter', -apple-system, BlinkMacSystemFont, sans-serif`,
  'DM Sans': `'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif`,
  'Outfit': `'Outfit', -apple-system, BlinkMacSystemFont, sans-serif`,
  'Lato': `'Lato', -apple-system, BlinkMacSystemFont, sans-serif`,
};

const GFONTS_LOADED = new Set(['DM Serif Display','Inter','JetBrains Mono']);
function loadGFont(name) {
  if (GFONTS_LOADED.has(name)) return;
  GFONTS_LOADED.add(name);
  const slug = name.replace(/ /g,'+');
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${slug}:wght@400;500;600;700&display=swap`;
  document.head.appendChild(link);
}

function applyAppearance(a) {
  const s = { ...DEFAULT_APPEARANCE, ...a };
  const root = document.documentElement;
  root.style.setProperty('--accent', s.accent);
  root.style.setProperty('--accent-soft', lightenHex(s.accent, 0.3));
  root.style.setProperty('--highlight', s.highlight);
  root.style.setProperty('--highlight-soft', hexToRgba(s.highlight, 0.35));
  root.style.setProperty('--highlight-tint', hexToRgba(s.highlight, 0.15));
  root.style.setProperty('--highlight-60', hexToRgba(s.highlight, 0.35));
  root.style.setProperty('--bg', s.bg);
  root.style.setProperty('--bg-soft', darkenHex(s.bg, 0.05));
  root.style.setProperty('--ink', s.ink);
  root.style.setProperty('--ink-muted', lightenHex(s.ink, 0.45));
  loadGFont(s.displayFont); loadGFont(s.bodyFont);
  root.style.setProperty('--font-display', FONT_STACK[s.displayFont] || FONT_STACK['DM Serif Display']);
  root.style.setProperty('--font-body', FONT_STACK[s.bodyFont] || FONT_STACK['Inter']);
  const sz = { small: '13px', medium: '14px', large: '15px' };
  document.body.style.fontSize = sz[s.fontSize] || '14px';
}

function getAppearance() {
  const stored = load(STORE.APPEARANCE, {}) || {};
  return { ...DEFAULT_APPEARANCE, ...stored, _customThemes: stored._customThemes || [] };
}

// ---- Custom theme helpers ----

function renderCustomThemeSlots() {
  const wrap = $('#custom-theme-slots');
  if (!wrap) return;
  const a = getAppearance();
  const customs = a._customThemes || [];
  wrap.innerHTML = '';

  customs.forEach((ct, idx) => {
    const slot = idx + 1;
    const isActive = _apCurrentThemeKey === `custom${slot}`;
    const div = document.createElement('div');
    div.className = 'custom-slot-wrap';
    div.innerHTML = `<button type="button" class="theme-preset-btn custom-theme-btn${isActive ? ' active-theme' : ''}" data-custom-slot="${slot}">${ct.name}</button><button type="button" class="custom-slot-del" data-del-slot="${slot}" title="Delete">✕</button>`;
    wrap.appendChild(div);
  });

  if (customs.length < 2) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'theme-preset-btn';
    btn.textContent = '+ Custom';
    btn.addEventListener('click', onNewCustomTheme);
    wrap.appendChild(btn);
  }

  wrap.querySelectorAll('[data-del-slot]').forEach(btn => {
    btn.addEventListener('click', () => deleteCustomTheme(parseInt(btn.dataset.delSlot)));
  });
  wrap.querySelectorAll('[data-custom-slot]').forEach(btn => {
    btn.addEventListener('click', () => loadCustomThemeSlot(parseInt(btn.dataset.customSlot)));
  });
}

function loadCustomThemeSlot(slot) {
  const a = getAppearance();
  const ct = (a._customThemes || []).find((_, i) => i + 1 === slot);
  if (!ct) return;
  $('#ap-accent').value = ct.accent;
  $('#ap-highlight').value = ct.highlight;
  $('#ap-bg').value = ct.bg;
  $('#ap-ink').value = ct.ink;
  _apEditingCustomSlot = slot;
  _apCurrentThemeKey = `custom${slot}`;
  _apDirty = false;
  applyAppearance({ ...a, ...ct });
  updateActiveThemeIndicator(_apCurrentThemeKey);
  updateThemeStatus();
}

function deleteCustomTheme(slot) {
  const a = getAppearance();
  const customs = (a._customThemes || []).filter((_, i) => i + 1 !== slot);
  const wasActive = a._activeTheme === `custom${slot}`;
  const newActive = wasActive ? 'classic' : a._activeTheme;
  const updated = { ...a, _customThemes: customs, _activeTheme: newActive };
  save(STORE.APPEARANCE, updated);
  if (wasActive) {
    applyAppearance({ ...updated, ...THEMES.classic });
    _apCurrentThemeKey = 'classic';
    _apEditingCustomSlot = null;
    const t = THEMES.classic;
    $('#ap-accent').value = t.accent;
    $('#ap-highlight').value = t.highlight;
    $('#ap-bg').value = t.bg;
    $('#ap-ink').value = t.ink;
  }
  renderCustomThemeSlots();
  updateActiveThemeIndicator(_apCurrentThemeKey);
  updateThemeStatus();
}

function updateActiveThemeIndicator(key) {
  $$('.theme-preset-btn').forEach(btn => {
    const btnKey = btn.dataset.theme || (btn.dataset.customSlot ? `custom${btn.dataset.customSlot}` : null);
    btn.classList.toggle('active-theme', btnKey === key);
  });
}

function updateThemeStatus() {
  const el = $('#ap-theme-status');
  if (!el) return;
  if (_apEditingCustomSlot !== null && _apDirty) {
    const a = getAppearance();
    const ct = (a._customThemes || [])[_apEditingCustomSlot - 1];
    const name = ct ? ct.name : `Custom ${_apEditingCustomSlot}`;
    el.textContent = `Changes will update "${name}" on Apply`;
  } else if (_apEditingCustomSlot !== null) {
    const a = getAppearance();
    const ct = (a._customThemes || [])[_apEditingCustomSlot - 1];
    el.textContent = ct ? `Editing "${ct.name}"` : '';
  } else if (_apDirty) {
    const count = (getAppearance()._customThemes || []).length;
    el.textContent = count >= 2 ? 'Apply to replace a saved theme' : 'Apply to save as a new custom theme';
  } else {
    el.textContent = '';
  }
}

function onPickerChange() {
  _apDirty = true;
  if (_apEditingCustomSlot === null) {
    _apCurrentThemeKey = null;
    updateActiveThemeIndicator(null);
  }
  const preview = {
    accent: $('#ap-accent').value, highlight: $('#ap-highlight').value,
    bg: $('#ap-bg').value, ink: $('#ap-ink').value,
    displayFont: $('#ap-display-font').value, bodyFont: $('#ap-body-font').value,
    fontSize: $('#ap-font-size').value,
  };
  applyAppearance(preview);
  updateThemeStatus();
}

function onNewCustomTheme() {
  _apEditingCustomSlot = null;
  _apDirty = true;
  updateActiveThemeIndicator(null);
  updateThemeStatus();
}

function flashApplyBtn(msg) {
  const btn = $('#appearance-save');
  const orig = btn.textContent;
  btn.textContent = msg;
  btn.disabled = true;
  setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 1500);
}

// ---- Main appearance panel functions ----

function openAppearance() {
  $('#appearance-panel').hidden = false;
  const a = getAppearance();
  $('#ap-accent').value = a.accent;
  $('#ap-highlight').value = a.highlight;
  $('#ap-bg').value = a.bg;
  $('#ap-ink').value = a.ink;
  $('#ap-display-font').value = a.displayFont;
  $('#ap-body-font').value = a.bodyFont;
  $('#ap-font-size').value = a.fontSize;
  _apDirty = false;
  _apCurrentThemeKey = a._activeTheme || 'classic';
  _apEditingCustomSlot = _apCurrentThemeKey.startsWith('custom')
    ? parseInt(_apCurrentThemeKey.replace('custom', '')) : null;
  renderCustomThemeSlots();
  updateActiveThemeIndicator(_apCurrentThemeKey);
  updateThemeStatus();
}

function closeAppearance() {
  $('#appearance-panel').hidden = true;
  _apDirty = false;
  _apEditingCustomSlot = null;
  _apCurrentThemeKey = null;
}

function saveAppearanceForm() {
  const colors = {
    accent: $('#ap-accent').value, highlight: $('#ap-highlight').value,
    bg: $('#ap-bg').value, ink: $('#ap-ink').value,
  };
  const fonts = {
    displayFont: $('#ap-display-font').value, bodyFont: $('#ap-body-font').value,
    fontSize: $('#ap-font-size').value,
  };
  const a = getAppearance();
  const customs = [...(a._customThemes || [])];

  if (!_apDirty) {
    // No color changes — just save font/size + active theme
    const updated = { ...a, ...fonts, _activeTheme: _apCurrentThemeKey || a._activeTheme };
    save(STORE.APPEARANCE, updated);
    applyAppearance(updated);
    flashApplyBtn('✓ Applied');
    closeAppearance();
    return;
  }

  if (_apEditingCustomSlot !== null) {
    // Update existing custom theme
    const idx = _apEditingCustomSlot - 1;
    if (customs[idx]) customs[idx] = { ...customs[idx], ...colors };
    const updated = { ...a, ...colors, ...fonts, _activeTheme: `custom${_apEditingCustomSlot}`, _customThemes: customs };
    save(STORE.APPEARANCE, updated);
    applyAppearance(updated);
    flashApplyBtn('✓ Updated');
    closeAppearance();
    return;
  }

  // Colors changed from preset — need to create or replace custom theme
  if (customs.length < 2) {
    const defaultName = `Custom ${customs.length + 1}`;
    const name = prompt('Name this custom theme:', defaultName);
    if (name === null) return; // cancelled
    const slot = customs.length + 1;
    customs.push({ slot, name: name.trim() || defaultName, ...colors });
    const updated = { ...a, ...colors, ...fonts, _activeTheme: `custom${slot}`, _customThemes: customs };
    save(STORE.APPEARANCE, updated);
    applyAppearance(updated);
    flashApplyBtn('✓ Saved');
    closeAppearance();
  } else {
    const [c1, c2] = customs;
    const choice = confirm(`You have 2 saved themes:\n1. "${c1.name}"\n2. "${c2.name}"\n\nOK = replace "${c1.name}"\nCancel = replace "${c2.name}"`);
    const replaceIdx = choice ? 0 : 1;
    const replaceSlot = replaceIdx + 1;
    const newName = prompt(`New name for this theme (replacing "${customs[replaceIdx].name}"):`, customs[replaceIdx].name);
    if (newName === null) return;
    customs[replaceIdx] = { slot: replaceSlot, name: newName.trim() || customs[replaceIdx].name, ...colors };
    const updated = { ...a, ...colors, ...fonts, _activeTheme: `custom${replaceSlot}`, _customThemes: customs };
    save(STORE.APPEARANCE, updated);
    applyAppearance(updated);
    flashApplyBtn('✓ Saved');
    closeAppearance();
  }
}

const DEFAULT_SETTINGS = {
  title: '',
  brandedTitle: '',
  business: '',
  name: '',
  address: '',
  phone: '',
  email: '',
  payHead: '',
  payDetail: '',
  payNote: '',
  lateFee: 'A late fee of 1.5% per month accrues on balances past due.',
  mealPenalty: '',
  defaultDepositPct: '50',
  invoiceNumberPrefix: '',
  // Payment method
  paymentMethod: 'zelle',
  bankName: '',
  accountName: '',
  accountNumber: '',
  wireRouting: '',
  achRouting: '',
  wirePreferred: false,
  // Tax info
  businessEIN: '',
  businessSSN: '',
  w9OnFile: true,
  logo: { dataUrl: '', size: 'medium', placement: 'top-left' },
  venmo: '',
  cashApp: '',
};

// slug + display label, ordered as they should appear in selects/optgroups
const KIT_CATEGORIES = [
  { slug: 'camera', label: 'Camera' },
  { slug: 'lenses', label: 'Lenses' },
  { slug: 'filters', label: 'Filters' },
  { slug: 'lighting', label: 'Lighting' },
  { slug: 'light-modifiers', label: 'Light Modifiers' },
  { slug: 'audio', label: 'Audio' },
  { slug: 'grip', label: 'Grip & Support' },
  { slug: 'media', label: 'Media' },
  { slug: 'other', label: 'Other' },
];

// Migration: map legacy display-name categories → slug. Anything unknown → 'other'.
function normalizeCategory(c) {
  if (!c) return 'other';
  const map = {
    'Camera': 'camera', 'Cameras': 'camera',
    'Lenses': 'lenses', 'Lens': 'lenses',
    'Filters': 'filters', 'Filter': 'filters',
    'Lighting': 'lighting', 'Lights': 'lighting',
    'Light Modifiers': 'light-modifiers', 'Modifiers': 'light-modifiers',
    'Audio': 'audio',
    'Grip & Support': 'grip', 'Grip': 'grip', 'Support': 'grip', 'Tripods': 'grip',
    'Media': 'media',
    'Other': 'other', 'Misc': 'other', 'Miscellaneous': 'other',
  };
  if (map[c]) return map[c];
  if (typeof c === 'string') {
    const lc = c.toLowerCase();
    return KIT_CATEGORIES.some((cat) => cat.slug === lc) ? lc : 'other';
  }
  return 'other';
}

function categoryLabel(slug) {
  const cat = KIT_CATEGORIES.find((c) => c.slug === slug);
  return cat ? cat.label : 'Other';
}

// Loaded at runtime from rate-card.json
let RATE_CARD = { roles: [], projectTypes: [], clientTiers: [], floors: {} };

// Sample kit broken into per-category bulk loaders. Each button under Settings → Kit Catalog
// appends its category's items to the catalog (deduplicated by name, case-insensitive).
// Items are common industry-standard gear so any working filmmaker recognizes them.
const SAMPLE_KIT_BY_CATEGORY = {
  camera: [
    { name: 'Sony FX3',          rate: 150 },
    { name: 'BMPCC 6K Pro',      rate: 150 },
    { name: 'Fujifilm X-H2S',    rate: 100 },
    { name: 'Sony A7R II',       rate: 50  },
    { name: 'Lumix GH5S',        rate: 75  },
  ],
  lenses: [
    { name: 'Sony FE PZ 28-135mm f/4 G OSS',          rate: 75  },
    { name: 'Rokinon Cine DS Set (35/50/85mm T-Stop)', rate: 150 },
    { name: 'Rokinon 16mm f/2.0',                      rate: 25  },
    { name: 'Sigma 18-35mm f/1.8',                     rate: 45  },
    { name: 'Sigma 70-200mm f/2.8',                    rate: 55  },
    { name: 'DZO Prime Set',                           rate: 200 },
  ],
  filters: [
    { name: 'Tiffen ND Set 77mm',             rate: 20 },
    { name: 'Tiffen ND Set 82mm',             rate: 20 },
    { name: 'Tiffen 1/8 Black Pro Mist 77mm', rate: 15 },
    { name: 'Tiffen Polarizer 82mm',          rate: 15 },
    { name: 'Tiffen Split Diopter 72mm',      rate: 20 },
  ],
  lighting: [
    { name: 'Aputure 600C Pro',               rate: 150 },
    { name: 'Aputure 300X',                   rate: 100 },
    { name: 'Aputure 300D II',                rate: 95  },
    { name: 'Aputure Accent B7c 8-Light Kit', rate: 75  },
    { name: 'Aputure MC Pro 8-Light Kit',     rate: 60  },
    { name: 'Aputure MC 4-Light Travel Kit',  rate: 50  },
    { name: 'Aputure INFINIBAR PB3 (×4)',     rate: 60  },
    { name: 'COLBOR CL60R RGB',               rate: 35  },
    { name: 'GVM RGB 1×1 LED Panel',            rate: 30  },
    { name: 'Neewer Bi-Color 1×1 LED Panels',   rate: 25  },
    { name: 'Neewer AP150B 150W Bi-Color Panel', rate: 60  },
    { name: 'Neewer TL120C RGB Tube Light',      rate: 35  },
    { name: 'Neewer TL60 RGB Tube Light',        rate: 25  },
  ],
  'light-modifiers': [
    { name: 'Aputure Spotlight MaxKit + 19° Lens',      rate: 75 },
    { name: 'Aputure Spotlight Max Gobo Kit (10-piece)', rate: 50 },
    { name: 'Aputure Light Dome 150',                    rate: 45 },
    { name: 'Aputure Light Dome SE',                     rate: 20 },
    { name: 'Aputure Light Dome III',                    rate: 25 },
    { name: 'Aputure Light Box 60×90',                   rate: 30 },
    { name: 'Aputure Lantern 90in',                      rate: 20 },
    { name: 'Aputure Lantern 26in',                      rate: 15 },
    { name: 'Aputure INFINIBAR PB3 Grid (Eggcrate)',     rate: 15 },
    { name: 'Reflector Dishes',                          rate: 10 },
  ],
  audio: [
    { name: 'Wireless Lavalier Kit', rate: 50 },
    { name: 'Shotgun Mic + Boom',    rate: 75 },
  ],
  grip: [
    { name: 'SIRUI SVS75 Cinema Tripod',   rate: 40  },
    { name: 'Sirui Heavy Duty Tripod',     rate: 30  },
    { name: 'Manfrotto 502HD + 545B Legs', rate: 25  },
    { name: 'Manfrotto Shoulder Mount',    rate: 35  },
    { name: 'Ronin S2 Gimbal',             rate: 60  },
    { name: 'M7 Jib Head',                rate: 400 },
    { name: 'C-Stand',                    rate: 15  },
    { name: 'Large Light Bounce',         rate: 10  },
  ],
  media: [
    { name: '256GB SD Delkin',  rate: 90 },
    { name: '256GB SD Generic', rate: 28 },
  ],
  other: [
    { name: 'Cables & Expendables',    rate: 25 },
    { name: 'Gaff Tape (per roll)',    rate: 5  },
    { name: 'Power Distro / Stingers', rate: 20 },
  ],
};

const SECTIONS = ['labor', 'kit', 'media', 'fees', 'crew', 'talent', 'misc'];

let currentInvoice = blankInvoice();

function generateInvoiceNo() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const settings = getSettings();
  const userPrefix = (settings.invoiceNumberPrefix || '').trim();
  const prefix = userPrefix ? `${userPrefix}-${y}-${m}-` : `${y}-${m}-`;
  // Find highest ### for this month from recents (ignore others)
  const recents = getRecents();
  let maxSeq = 0;
  for (const r of recents) {
    const num = r.invoiceNo || '';
    if (!num.startsWith(prefix)) continue;
    const tail = num.slice(prefix.length);
    const seq = parseInt(tail, 10);
    if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq;
  }
  return `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;
}

function blankInvoice() {
  const today = new Date().toISOString().slice(0, 10);
  return {
    template: 'coverage',
    invoiceNo: generateInvoiceNo(),
    invoiceDate: today,
    terms: 'due-on-receipt',
    dueDate: today,
    status: 'draft',
    client: { attn: '', company: '', address: '', tier: '' },
    project: { name: '', shootDates: '', scopeRoles: '', deliverables: '', quoteScope: '', type: '', dayType: '' },
    sections: { labor: [{ details: 'Director of Photography', amount: '1200', rate: 1200, qty: 1, notes: '', additional: '' }, { details: 'Camera Operator', amount: '650', rate: 650, qty: 1, notes: '', additional: '' }, { details: 'Production Sound Mixer', amount: '950', rate: 950, qty: 1, notes: '', additional: '' }], kit: [{ details: 'Sony FX3', amount: '150', rate: 150, qty: 1, notes: '', additional: '', category: 'camera' }], media: [], fees: [], crew: [], talent: [], misc: [] },
    totalOverride: '',
    discount: '',
    depositEnabled: false,
    depositType: '50',
    depositCustomPct: null,
    depositCustomFlat: null,
    depositDue: 'booking',
    depositCustomDate: null,
    depositNonrefundable: true,
    injectTaxInfo: false,
    invoiceHeadlineOverride: '',
  };
}

// Migrate legacy {deposit: {required,type,customValue,dueWhen,nonRefundable}} → flat fields
function migrateDeposit(inv) {
  if (inv.deposit && typeof inv.deposit === 'object') {
    const d = inv.deposit;
    if (inv.depositEnabled === undefined) inv.depositEnabled = !!d.required;
    if (inv.depositType === undefined) inv.depositType = d.type === 'custom-amt' ? 'custom-flat' : (d.type || '50');
    if (inv.depositCustomPct == null && d.type === 'custom-pct') inv.depositCustomPct = parseFloat(d.customValue) || null;
    if (inv.depositCustomFlat == null && (d.type === 'custom-amt' || d.type === 'custom-flat')) inv.depositCustomFlat = parseFloat(d.customValue) || null;
    if (inv.depositDue === undefined) inv.depositDue = d.dueWhen && d.dueWhen.toLowerCase().includes('booking') ? 'booking' : 'booking';
    if (inv.depositNonrefundable === undefined) inv.depositNonrefundable = d.nonRefundable !== false;
    delete inv.deposit;
  }
  return inv;
}

function computeDepositAmount(inv, grandTotal) {
  if (!inv.depositEnabled) return 0;
  const t = inv.depositType;
  if (t === 'custom-flat') return parseFloat(inv.depositCustomFlat) || 0;
  if (t === 'custom-pct') return grandTotal * ((parseFloat(inv.depositCustomPct) || 0) / 100);
  return grandTotal * (parseFloat(t) / 100);
}

function depositLabel(inv) {
  const t = inv.depositType;
  if (!t) return '';
  if (t === 'custom-flat') return '';
  if (t === 'custom-pct') return `${parseFloat(inv.depositCustomPct) || 0}%`;
  return `${t}%`;
}

function depositDueText(inv) {
  if (inv.depositDue === 'invoice-date' && inv.invoiceDate) return `due ${formatDate(inv.invoiceDate)}`;
  if (inv.depositDue === 'custom-date' && inv.depositCustomDate) return `due ${formatDate(inv.depositCustomDate)}`;
  return 'due upon booking';
}

function addDaysISO(iso, days) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function termsDays(terms) {
  return { 'due-on-receipt': 0, 'net-15': 15, 'net-30': 30, 'net-45': 45, 'net-60': 60, 'custom': null }[terms] ?? 30;
}

// ============== STORAGE ==============
// NOTE: declared as `function` (not `const`) so they're hoisted and can be safely
// called by blankInvoice() at module-load time. Switching to `const` arrows here
// caused "Cannot access 'load' before initialization" and crashed the whole script.
function load(k, fallback) {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function save(k, v) { localStorage.setItem(k, JSON.stringify(v)); }

function getSettings() { return { ...DEFAULT_SETTINGS, ...(load(STORE.SETTINGS, {}) || {}) }; }
function setSettings(s) { save(STORE.SETTINGS, s); }

function getClients() { return load(STORE.CLIENTS, []); }
function saveClient(c) {
  const clients = getClients();
  const existing = clients.findIndex((x) => x.company === c.company && x.attn === c.attn);
  if (existing >= 0) clients[existing] = c; else clients.push(c);
  save(STORE.CLIENTS, clients);
}

function getKit() {
  // Read raw + normalize legacy category names to slug. Existing items survive migration.
  const raw = load(STORE.KIT, []);
  return raw.map((k) => ({ ...k, category: normalizeCategory(k.category) }));
}
function setKit(k) { save(STORE.KIT, k); }

function getRecents() {
  const raw = load(STORE.RECENTS, []);
  let migrated = false;
  raw.forEach(r => { if (!r._id) { r._id = r._savedAt || new Date().toISOString(); migrated = true; } });
  if (migrated) save(STORE.RECENTS, raw);
  return raw;
}
function pushRecent(inv) {
  const recents = getRecents();
  const stamp = new Date().toISOString();
  recents.unshift({ ...inv, _savedAt: stamp, _id: inv._id || stamp });
  save(STORE.RECENTS, recents.slice(0, 20));
}

function saveInvoice() {
  fieldsToState();
  const recents = getRecents();
  const stamp = new Date().toISOString();
  const idx = currentInvoice._id
    ? recents.findIndex(r => r._id === currentInvoice._id)
    : -1;
  if (idx !== -1) {
    // Update existing entry
    recents[idx] = { ...currentInvoice, _savedAt: stamp, _id: currentInvoice._id };
    save(STORE.RECENTS, recents.slice(0, 20));
    renderRecents();
    flashSaveBtn('✓ Updated');
    return;
  }
  // New entry — warn if same invoice number already exists
  if (currentInvoice.invoiceNo && recents.some(r => r.invoiceNo === currentInvoice.invoiceNo)) {
    const ok = confirm(`Invoice "${currentInvoice.invoiceNo}" already exists in your recents. Save as a duplicate?`);
    if (!ok) return;
  }
  currentInvoice._id = stamp;
  recents.unshift({ ...currentInvoice, _savedAt: stamp, _id: stamp });
  save(STORE.RECENTS, recents.slice(0, 20));
  renderRecents();
  flashSaveBtn('✓ Saved');
}

function flashSaveBtn(msg) {
  const btn = $('#save-invoice-btn');
  if (!btn) return;
  btn.textContent = msg;
  setTimeout(refreshSaveBtn, 1500);
}

function refreshSaveBtn() {
  const btn = $('#save-invoice-btn');
  if (!btn) return;
  const isExisting = currentInvoice._id
    && getRecents().some(r => r._id === currentInvoice._id);
  btn.textContent = isExisting ? '✏ Update' : '💾 Save';
}

// ============== DOM HELPERS ==============
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (typeof v === 'boolean') { if (v) e.setAttribute(k, ''); }
    else e.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return e;
}

// ============== SECTION ROWS ==============
function renderSectionRows() {
  for (const name of SECTIONS) {
    const container = $(`[data-rows="${name}"]`);
    if (!container) continue;
    container.innerHTML = '';
    let lastCat = null;
    for (const [i, row] of (currentInvoice.sections[name] || []).entries()) {
      if (name === 'kit' && row.category && row.category !== lastCat) {
        lastCat = row.category;
        const div = el('div', { class: 'kit-cat-divider' }, row.category.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()));
        container.appendChild(div);
      }
      container.appendChild(renderRow(name, i, row));
    }
  }
}

function renderRow(section, idx, row) {
  const r = el('div', { class: 'row-item' });
  const details = el('input', {
    type: 'text',
    placeholder: section === 'labor' ? 'Role (start typing — suggestions from your history)' : 'Description',
    value: row.details || '',
    list: section === 'labor' ? 'role-suggestions' : '',
  });
  const qty = el('input', { type: 'number', placeholder: 'Qty', min: '1', step: '1', value: row.qty != null ? row.qty : 1 });
  const amount = el('input', { type: 'text', placeholder: '$', value: row.amount || '' });
  const notes = el('input', { type: 'text', placeholder: 'Notes', value: row.notes || '' });
  const dup = el('button', { type: 'button', class: 'dup-btn', title: 'Duplicate row' }, '⎘');
  const rm = el('button', { type: 'button', class: 'rm-btn', title: 'Remove' }, '×');

  details.addEventListener('input', () => {
    currentInvoice.sections[section][idx].details = details.value;
    if (section === 'labor' && !amount.value) {
      const match = RATE_CARD.roles.find((r) => r.name === details.value);
      if (match) {
        amount.value = String(match.typical);
        currentInvoice.sections[section][idx].amount = String(match.typical);
        currentInvoice.sections[section][idx].rate = match.typical;
        if (!notes.value) {
          notes.value = `Typical $${match.typical} · Range $${match.low}–$${match.high}`;
          currentInvoice.sections[section][idx].notes = notes.value;
        }
      }
    }
    update();
  });
  qty.addEventListener('input', () => {
    const q = parseFloat(qty.value) || 1;
    currentInvoice.sections[section][idx].qty = q;
    const rate = currentInvoice.sections[section][idx].rate || 0;
    if (rate) {
      const total = rate * q;
      amount.value = String(total);
      currentInvoice.sections[section][idx].amount = String(total);
    }
    update();
  });
  amount.addEventListener('input', () => {
    const val = parseFloat(String(amount.value).replace(/[^0-9.\-]/g, '')) || 0;
    const q = parseFloat(qty.value) || 1;
    currentInvoice.sections[section][idx].amount = amount.value;
    currentInvoice.sections[section][idx].rate = q > 0 ? val / q : val;
    update();
  });
  notes.addEventListener('input', () => { currentInvoice.sections[section][idx].notes = notes.value; update(); });
  dup.addEventListener('click', () => duplicateSectionRow(section, idx));
  rm.addEventListener('click', () => { currentInvoice.sections[section].splice(idx, 1); renderSectionRows(); update(); });

  r.append(details, qty, amount, notes, dup, rm);
  return r;
}

function duplicateSectionRow(section, idx) {
  const rows = currentInvoice.sections[section];
  if (!rows || !rows[idx]) return;
  rows.splice(idx + 1, 0, { ...rows[idx] });
  renderSectionRows();
  update();
  setTimeout(() => {
    const items = document.querySelectorAll(`[data-rows="${section}"] .row-item`);
    if (items[idx + 1]) items[idx + 1].querySelector('input')?.focus();
  }, 50);
}

function addRow(section, preset = {}) {
  currentInvoice.sections[section] = currentInvoice.sections[section] || [];
  currentInvoice.sections[section].push({ details: '', amount: '', notes: '', additional: '', qty: 1, rate: 0, ...preset });
  renderSectionRows();
  update();
}

// ============== KIT CATALOG ==============
function renderKitCatalogPicker() {
  const sel = $('#kit-catalog-pick');
  if (!sel) return;
  const kit = getKit();
  sel.innerHTML = '<option value="">— catalog —</option>';
  const byCat = {};
  for (const [i, k] of kit.entries()) {
    if (!k.name || !k.name.trim()) continue; // skip blank items
    const slug = normalizeCategory(k.category);
    (byCat[slug] = byCat[slug] || []).push({ ...k, _i: i });
  }
  for (const cat of KIT_CATEGORIES) {
    const items = byCat[cat.slug];
    if (!items || items.length === 0) continue;
    const grp = document.createElement('optgroup');
    grp.label = cat.label;
    for (const k of items) {
      const opt = el('option', { value: String(k._i) }, `${k.name} — $${k.rate}`);
      grp.appendChild(opt);
    }
    sel.appendChild(grp);
  }
}

function renderKitCatalogSettings() {
  const wrap = $('#kit-summary-wrap');
  if (!wrap) return;
  const kit = getKit().filter(k => k.name && k.name.trim());
  const counts = {};
  for (const k of kit) counts[k.category] = (counts[k.category] || 0) + 1;
  const catEntries = KIT_CATEGORIES.filter(c => counts[c.slug]);
  const total = kit.length;

  wrap.innerHTML = '';
  if (total === 0) {
    wrap.appendChild(el('p', { class: 'muted' }, 'No kit items yet. Open the kit catalog to get started.'));
  } else {
    const summary = el('p', { class: 'kit-summary-line' }, `${total} item${total !== 1 ? 's' : ''} across ${catEntries.length} categor${catEntries.length !== 1 ? 'ies' : 'y'}`);
    wrap.appendChild(summary);
    const pills = el('div', { class: 'kit-summary-pills' });
    for (const c of catEntries) {
      pills.appendChild(el('span', { class: 'kit-summary-pill' }, `${c.label} (${counts[c.slug]})`));
    }
    wrap.appendChild(pills);
  }
}

function duplicateKitItem(idx) {
  const kit = getKit();
  if (!kit[idx]) return;
  const orig = kit[idx];
  kit.splice(idx + 1, 0, { ...orig, name: (orig.name || '') + ' (copy)' });
  setKit(kit);
  renderKitCatalogSettings();
  renderKitCatalogPicker();
  setTimeout(() => {
    const rows = document.querySelectorAll('.kit-catalog-row');
    const newRow = rows[idx + 1];
    if (newRow) {
      const nameInput = newRow.querySelector('input[type="text"]');
      if (nameInput) { nameInput.focus(); nameInput.select(); }
    }
  }, 50);
}

// ============== CLIENTS ==============
function renderClientPicker() {
  const sel = $('#client-select');
  if (!sel) return;
  const clients = getClients();
  sel.innerHTML = '<option value="">— new —</option>';
  for (const [i, c] of clients.entries()) {
    const opt = el('option', { value: String(i) }, `${c.company || '(no company)'} — ${c.attn || ''}`.trim());
    sel.appendChild(opt);
  }
}

function loadClient(i) {
  const clients = getClients();
  const c = clients[i];
  if (!c) return;
  currentInvoice.client = { attn: c.attn || '', company: c.company || '', address: c.address || '' };
  $('#client-attn').value = c.attn || '';
  $('#client-company').value = c.company || '';
  $('#client-address').value = c.address || '';
  update();
}

// ============== FORM <-> STATE ==============
function fieldsToState() {
  const t = $('input[name="template"]:checked');
  currentInvoice.template = t ? t.value : 'coverage';
  currentInvoice.invoiceNo = $('#invoice-no').value;
  currentInvoice.invoiceDate = $('#invoice-date').value;
  const termsSel = $('#terms-select');
  if (termsSel) currentInvoice.terms = termsSel.value;
  const dueEl = $('#due-date');
  if (dueEl) currentInvoice.dueDate = dueEl.value;
  const statusSel = $('#status-select');
  if (statusSel) currentInvoice.status = statusSel.value;
  currentInvoice.client.attn = $('#client-attn').value;
  currentInvoice.client.email = $('#client-email').value;
  currentInvoice.client.company = $('#client-company').value;
  currentInvoice.client.address = $('#client-address').value;
  const tierSel = $('#client-tier');
  if (tierSel) currentInvoice.client.tier = tierSel.value || '';
  currentInvoice.project.name = $('#project-name').value;
  currentInvoice.project.shootDates = $('#shoot-dates').value;
  currentInvoice.project.scopeRoles = $('#scope-roles').value;
  currentInvoice.project.deliverables = $('#deliverables').value;
  currentInvoice.project.quoteScope = $('#quote-scope').value;
  const typeSel = $('#project-type');
  if (typeSel) currentInvoice.project.type = typeSel.value || '';
  const dayTypeSel = $('#day-type');
  if (dayTypeSel) currentInvoice.project.dayType = dayTypeSel.value || '';
  currentInvoice.totalOverride = $('#total-override').value;
  currentInvoice.discount = $('#discount-amount').value;
  const inj = $('#injectTaxInfo');
  if (inj) currentInvoice.injectTaxInfo = inj.checked;
  const headlineOv = $('#invoiceHeadlineOverride');
  if (headlineOv) currentInvoice.invoiceHeadlineOverride = headlineOv.value;
  // Deposit (flat fields)
  const dEn = $('#depositEnabled');
  if (dEn) currentInvoice.depositEnabled = dEn.checked;
  const dType = $('#depositType');
  if (dType) currentInvoice.depositType = dType.value;
  const dCpct = $('#depositCustomPct');
  if (dCpct) currentInvoice.depositCustomPct = dCpct.value === '' ? null : parseFloat(dCpct.value);
  const dCflat = $('#depositCustomFlat');
  if (dCflat) currentInvoice.depositCustomFlat = dCflat.value === '' ? null : parseFloat(dCflat.value);
  const dDue = $('#depositDue');
  if (dDue) currentInvoice.depositDue = dDue.value;
  const dCdate = $('#depositCustomDate');
  if (dCdate) currentInvoice.depositCustomDate = dCdate.value || null;
  const dNR = $('#depositNonrefundable');
  if (dNR) currentInvoice.depositNonrefundable = dNR.checked;
}

function stateToFields() {
  const t = $(`input[name="template"][value="${currentInvoice.template}"]`);
  if (t) t.checked = true;
  $('#invoice-no').value = currentInvoice.invoiceNo || '';
  $('#invoice-date').value = currentInvoice.invoiceDate || '';
  const termsSel = $('#terms-select');
  if (termsSel) termsSel.value = currentInvoice.terms || 'net-30';
  const dueEl = $('#due-date');
  if (dueEl) dueEl.value = currentInvoice.dueDate || '';
  const statusSel = $('#status-select');
  if (statusSel) statusSel.value = currentInvoice.status || 'draft';
  $('#client-attn').value = currentInvoice.client.attn || '';
  $('#client-email').value = currentInvoice.client.email || '';
  $('#client-company').value = currentInvoice.client.company || '';
  $('#client-address').value = currentInvoice.client.address || '';
  const tierSel = $('#client-tier');
  if (tierSel) tierSel.value = currentInvoice.client.tier || '';
  $('#project-name').value = currentInvoice.project.name || '';
  $('#shoot-dates').value = currentInvoice.project.shootDates || '';
  $('#scope-roles').value = currentInvoice.project.scopeRoles || '';
  $('#deliverables').value = currentInvoice.project.deliverables || '';
  $('#quote-scope').value = currentInvoice.project.quoteScope || '';
  const typeSel = $('#project-type');
  if (typeSel) typeSel.value = currentInvoice.project.type || '';
  const dayTypeSel = $('#day-type');
  if (dayTypeSel) dayTypeSel.value = currentInvoice.project.dayType || '';
  $('#total-override').value = currentInvoice.totalOverride || '';
  $('#discount-amount').value = currentInvoice.discount || '';
  const inj = $('#injectTaxInfo');
  if (inj) inj.checked = !!currentInvoice.injectTaxInfo;
  const headlineOvEl = $('#invoiceHeadlineOverride');
  if (headlineOvEl) headlineOvEl.value = currentInvoice.invoiceHeadlineOverride || '';
  // Deposit (flat fields)
  migrateDeposit(currentInvoice);
  const dEn = $('#depositEnabled');
  if (dEn) dEn.checked = !!currentInvoice.depositEnabled;
  const dType = $('#depositType');
  if (dType) dType.value = currentInvoice.depositType || '50';
  const dCpct = $('#depositCustomPct');
  if (dCpct) dCpct.value = currentInvoice.depositCustomPct == null ? '' : currentInvoice.depositCustomPct;
  const dCflat = $('#depositCustomFlat');
  if (dCflat) dCflat.value = currentInvoice.depositCustomFlat == null ? '' : currentInvoice.depositCustomFlat;
  const dDue = $('#depositDue');
  if (dDue) dDue.value = currentInvoice.depositDue || 'booking';
  const dCdate = $('#depositCustomDate');
  if (dCdate) dCdate.value = currentInvoice.depositCustomDate || '';
  const dNR = $('#depositNonrefundable');
  if (dNR) dNR.checked = currentInvoice.depositNonrefundable !== false;
  toggleDepositUI();
  toggleTemplateUI();
  renderSectionRows();
}

function toggleTemplateUI() {
  const isQuote = currentInvoice.template === 'quote';
  $$('.quote-only').forEach((el) => { el.hidden = !isQuote; });
  $('#quote-scope-field').hidden = !isQuote;
}

function toggleDepositUI() {
  const en = !!currentInvoice.depositEnabled;
  document.querySelectorAll('.deposit-fields').forEach((el) => { el.hidden = !en; });

  // Show/hide custom inputs based on depositType
  const t = currentInvoice.depositType;
  const cpct = $('#depositCustomPct');
  const cflat = $('#depositCustomFlat');
  if (cpct) cpct.hidden = t !== 'custom-pct';
  if (cflat) cflat.hidden = t !== 'custom-flat';

  // Show/hide custom date based on depositDue
  const cdate = $('#depositCustomDate');
  if (cdate) cdate.hidden = currentInvoice.depositDue !== 'custom-date';
}

// ============== TOTALS ==============
function sumSections() {
  let total = 0;
  for (const section of SECTIONS) {
    for (const r of currentInvoice.sections[section] || []) {
      const n = parseFloat(String(r.amount).replace(/[^0-9.\-]/g, '')) || 0;
      total += n;
    }
  }
  return total;
}

function formatMoney(n) {
  return '$' + Number(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// ============== TEMPLATES ==============
function renderPreview() {
  const root = $('#invoice-preview');
  root.className = 'invoice ' + currentInvoice.template;
  root.innerHTML = '';
  if (currentInvoice.template === 'quote') root.appendChild(renderQuote());
  else root.appendChild(renderCoverage());
}

function renderCoverage() {
  const s = getSettings();
  const inv = currentInvoice;
  const frag = document.createDocumentFragment();

  const dateStr = inv.invoiceDate ? formatDate(inv.invoiceDate) : '';
  const ph = (val, placeholder) => val || `<span class="ph">${placeholder}</span>`;

  frag.appendChild(el('div', { class: 'cv-inv-num' }, `INVOICE ${inv.invoiceNo || ''}`.trim()));

  const titleBlock = el('div', { class: 'cv-title-block' });
  const titleRow = el('div', { class: 'cv-title-row preview-title' });
  const title = el('div', { class: 'cv-title' });
  const activeHeadline = inv.invoiceHeadlineOverride || s.title;
  title.innerHTML = activeHeadline ? activeHeadline : '<span class="ph">Your Business Title — set in Settings</span>';
  const pencilTitle = el('span', {
    class: 'edit-icon',
    title: 'Edit headline in Settings',
    onclick: () => focusSettingField('#s-title'),
  }, '✎');
  titleRow.append(title, pencilTitle);
  titleBlock.appendChild(titleRow);

  const bizRow = el('div', { class: 'cv-biz-row preview-subtitle' });
  const biz = el('div', { class: 'cv-biz' });
  biz.innerHTML = s.business ? s.business : '<span class="ph">Your Business LLC</span>';
  const pencilBiz = el('span', {
    class: 'edit-icon',
    title: 'Edit Legal Business Name in Settings',
    onclick: () => focusSettingField('#s-business'),
  }, '✎');
  bizRow.append(biz, pencilBiz);
  titleBlock.appendChild(bizRow);

  const logo = s.logo && s.logo.dataUrl && s.logo.placement !== 'hidden';
  if (logo) {
    const logoImg = el('img', { class: `invoice-logo size-${s.logo.size || 'medium'}`, src: s.logo.dataUrl, alt: 'logo' });
    if (s.logo.placement === 'top-center') {
      const wrap = el('div', { class: 'cv-header-logo-center' });
      wrap.appendChild(logoImg);
      wrap.appendChild(titleBlock);
      frag.appendChild(wrap);
    } else if (s.logo.placement === 'top-right') {
      const wrap = el('div', { class: 'cv-header-logo-right' });
      wrap.appendChild(titleBlock);
      wrap.appendChild(logoImg);
      frag.appendChild(wrap);
    } else {
      const wrap = el('div', { class: 'cv-header-logo-left' });
      wrap.appendChild(logoImg);
      wrap.appendChild(titleBlock);
      frag.appendChild(wrap);
    }
  } else {
    frag.appendChild(titleBlock);
  }

  if (s.name) frag.appendChild(el('div', { class: 'cv-addr' }, s.name));
  if (s.address) frag.appendChild(el('div', { class: 'cv-addr' }, s.address));
  if (s.phone) frag.appendChild(el('div', { class: 'cv-phone' }, s.phone));
  if (inv.injectTaxInfo && s.businessEIN) frag.appendChild(el('div', { class: 'cv-tax' }, `EIN: ${s.businessEIN}`));
  if (inv.injectTaxInfo && s.w9OnFile) frag.appendChild(el('div', { class: 'cv-tax' }, 'W9 available on request'));
  if (dateStr) frag.appendChild(el('div', { class: 'cv-date' }, `Invoice Date - ${dateStr}`));

  // Job details / Deliverables grid (scaffold always renders even when empty)
  const grid = el('div', { class: 'cv-details-grid' });
  const jobCol = el('div');
  jobCol.appendChild(el('div', { class: 'cv-label' }, 'JOB DETAILS'));
  const jobBody = el('div', { class: 'cv-scope' });
  if (inv.client.attn) {
    const attnText = inv.client.email ? `ATTN: ${inv.client.attn} — ${inv.client.email}` : `ATTN: ${inv.client.attn}`;
    jobCol.appendChild(el('div', { class: 'cv-attn' }, attnText));
  }
  const jobLines = [];
  if (inv.project.name) jobLines.push(`Project Name: ${inv.project.name}`);
  if (inv.project.type) {
    const typeLabel = inv.project.type.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    jobLines.push(`Project Type: ${typeLabel}`);
  }
  if (inv.project.dayType) {
    const dayLabel = inv.project.dayType.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    jobLines.push(`Day Type: ${dayLabel}`);
  }
  if (inv.project.shootDates) jobLines.push(`Shoot Date: ${inv.project.shootDates}`);
  if (inv.client.company) jobLines.push(inv.client.company);
  if (inv.client.address) jobLines.push(inv.client.address);
  if (inv.project.scopeRoles) jobLines.push('', inv.project.scopeRoles);
  if (jobLines.length === 0 && !inv.client.attn) {
    jobBody.innerHTML = '<span class="ph">[Project scope will appear here]</span>';
  } else {
    jobBody.textContent = jobLines.join('\n');
  }
  jobCol.appendChild(jobBody);
  grid.appendChild(jobCol);

  const delCol = el('div');
  delCol.appendChild(el('div', { class: 'cv-label' }, 'Deliverables'));
  const delBody = el('div', { class: 'cv-deliverables' });
  if (inv.project.deliverables) {
    delBody.textContent = inv.project.deliverables;
  } else {
    delBody.innerHTML = '<span class="ph">[Deliverables will appear here]</span>';
  }
  delCol.appendChild(delBody);
  grid.appendChild(delCol);
  frag.appendChild(grid);

  const table = el('table');
  const thead = el('thead');
  const thr = el('tr');
  thr.appendChild(el('th', { class: 'col-details' }, 'DETAILS'));
  thr.appendChild(el('th', { class: 'col-notes' }, 'NOTES'));
  thr.appendChild(el('th', { class: 'col-amount' }, 'AMOUNT'));
  thead.appendChild(thr);
  table.appendChild(thead);
  const tbody = el('tbody');

  const sectionLabels = {
    labor: 'POSITION / JOB',
    kit: 'KIT',
    media: 'MEDIA',
    fees: 'Additional Fees',
  };

  let anyRows = false;
  let sectionCount = 0;
  for (const section of ['labor', 'kit', 'media', 'fees']) {
    const rows = inv.sections[section] || [];
    if (rows.length === 0) continue;
    if (sectionCount > 0) {
      const divRow = el('tr', { class: 'cv-section-divider' });
      divRow.appendChild(el('td', { colspan: '3' }));
      tbody.appendChild(divRow);
    }
    anyRows = true;
    sectionCount++;
    const headRow = el('tr', { class: 'cv-section-row' });
    headRow.appendChild(el('td', { colspan: '3' }, sectionLabels[section] || section.toUpperCase()));
    tbody.appendChild(headRow);
    if (section === 'kit') {
      let lastCat = null;
      for (const r of rows) {
        const cat = r.category || '';
        if (cat && cat !== lastCat) {
          lastCat = cat;
          const subRow = el('tr', { class: 'cv-kit-subcat-row' });
          subRow.appendChild(el('td', { colspan: '3' }, cat.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())));
          tbody.appendChild(subRow);
        }
        const tr = el('tr');
        const qty = parseFloat(r.qty) || 1;
        const detailLabel = (r.details || '') + (qty > 1 ? ` ×${qty}` : '');
        tr.appendChild(el('td', {}, detailLabel));
        tr.appendChild(el('td', { class: 'notes-col' }, r.notes || ''));
        tr.appendChild(el('td', { class: 'amt' }, (() => { const v = parseFloat(String(r.amount).replace(/[^0-9.\-]/g, '')); return v ? formatMoney(v) : ''; })()));
        tbody.appendChild(tr);
      }
    }
    if (section !== 'kit') for (const r of rows) {
      const tr = el('tr');
      const qty = parseFloat(r.qty) || 1;
      const detailLabel = (r.details || '') + (qty > 1 ? ` ×${qty}` : '');
      tr.appendChild(el('td', {}, detailLabel));
      tr.appendChild(el('td', { class: 'notes-col' }, r.notes || ''));
      tr.appendChild(el('td', { class: 'amt' }, (() => { const v = parseFloat(String(r.amount).replace(/[^0-9.\-]/g, '')); return v ? formatMoney(v) : ''; })()));
      tbody.appendChild(tr);
    }
  }

  // Empty-state scaffold placeholder row
  if (!anyRows) {
    const emptyRow = el('tr', { class: 'cv-empty-row' });
    const emptyCell = el('td', { colspan: '3' });
    emptyCell.innerHTML = '<span class="ph">[Add line items to see them here]</span>';
    emptyRow.appendChild(emptyCell);
    tbody.appendChild(emptyRow);
  }

  const subtotalVal = inv.totalOverride
    ? parseFloat(String(inv.totalOverride).replace(/[^0-9.\-]/g, '')) || 0
    : sumSections();
  const discountVal = parseFloat(String(inv.discount || '').replace(/[^0-9.\-]/g, '')) || 0;
  const totalVal = Math.max(0, subtotalVal - discountVal);

  if (discountVal > 0) {
    const subRow = el('tr', { class: 'cv-subtotal-row' });
    subRow.appendChild(el('td', {}, 'Subtotal'));
    subRow.appendChild(el('td', {}));
    subRow.appendChild(el('td', { class: 'amt' }, formatMoney(subtotalVal)));
    tbody.appendChild(subRow);
    const discRow = el('tr', { class: 'cv-discount-row' });
    discRow.appendChild(el('td', {}, 'Discount'));
    discRow.appendChild(el('td', {}));
    discRow.appendChild(el('td', { class: 'amt' }, `−${formatMoney(discountVal)}`));
    tbody.appendChild(discRow);
  }

  // Deposit split rows (before TOTAL) — 2-col layout, descriptive text folded into label
  if (inv.depositEnabled && totalVal > 0) {
    const depAmt = computeDepositAmount(inv, totalVal);
    const depLbl = depositLabel(inv);
    const balance = totalVal - depAmt;
    const nrTag = inv.depositNonrefundable !== false ? 'Non-refundable, ' : '';
    const whenTag = depositDueText(inv);
    const depRow = el('tr', { class: 'cv-deposit-row' });
    depRow.appendChild(el('td', {}, `Deposit Due${depLbl ? ' (' + depLbl + ')' : ''} — ${nrTag}${whenTag}`));
    depRow.appendChild(el('td', {}));
    depRow.appendChild(el('td', { class: 'amt' }, formatMoney(depAmt)));
    tbody.appendChild(depRow);
    const balRow = el('tr', { class: 'cv-balance-row' });
    balRow.appendChild(el('td', {}, `Remaining Balance${inv.dueDate ? ' (Due ' + formatDate(inv.dueDate) + ')' : ''}`));
    balRow.appendChild(el('td', {}));
    balRow.appendChild(el('td', { class: 'amt' }, formatMoney(balance)));
    tbody.appendChild(balRow);
  }

  const totalRow = el('tr', { class: 'cv-total-row' });
  totalRow.appendChild(el('td', {}, 'TOTAL'));
  totalRow.appendChild(el('td', {}));
  totalRow.appendChild(el('td', { class: 'amt' }, formatMoney(totalVal)));
  tbody.appendChild(totalRow);

  table.appendChild(tbody);
  frag.appendChild(table);

  // Payment block — varies by paymentMethod (zelle/wire/both)
  const pay = el('div', { class: 'cv-payment-block' });
  const pm = s.paymentMethod || 'zelle';
  if (pm === 'zelle' || pm === 'both') {
    if (s.payHead) pay.appendChild(el('div', { class: 'cv-pay-head' }, `${s.payHead} to`));
    if (s.payDetail) pay.appendChild(el('div', { class: 'cv-pay-detail' }, s.payDetail));
    if (s.payNote) pay.appendChild(el('div', { class: 'cv-pay-note' }, s.payNote));
  }
  const altMethods = [];
  if (s.venmo) altMethods.push({ label: 'Venmo', value: s.venmo });
  if (s.cashApp) altMethods.push({ label: 'Cash App', value: s.cashApp });
  if (altMethods.length) {
    if (!s.payHead && !s.payDetail) pay.appendChild(el('div', { class: 'cv-pay-head' }, 'SEND PAYMENT TO'));
    const methodsBlock = el('div', { class: 'cv-pay-methods' });
    for (const m of altMethods) {
      const line = el('div', { class: 'cv-pay-method-line' });
      line.innerHTML = `<span class="cv-pay-method-label">${m.label}:</span> ${m.value}`;
      methodsBlock.appendChild(line);
    }
    pay.appendChild(methodsBlock);
  }
  if (pm === 'wire' || pm === 'both') {
    if (pm === 'both') pay.appendChild(el('div', { class: 'cv-pay-divider' }));
    pay.appendChild(el('div', { class: 'cv-pay-head' }, 'BANKING INFORMATION'));
    if (s.wirePreferred && (pm === 'wire' || pm === 'both')) {
      pay.appendChild(el('div', { class: 'cv-pay-preferred' }, 'WIRE TRANSFERS ARE PREFERRED'));
    }
    const bankLines = [];
    if (s.bankName) bankLines.push(`Bank: ${s.bankName}`);
    if (s.accountName) bankLines.push(`Account name: ${s.accountName}`);
    if (s.accountNumber) bankLines.push(`Account number: ${s.accountNumber}`);
    if (s.wireRouting) bankLines.push(`Wire routing: ${s.wireRouting}`);
    if (s.achRouting) bankLines.push(`ACH routing: ${s.achRouting}`);
    if (bankLines.length) pay.appendChild(el('div', { class: 'cv-pay-banking' }, bankLines.join('\n')));
  }
  // Legal clauses (due date, late fee, meal penalty)
  const clauses = [];
  if (inv.dueDate) {
    const termsLabel = { 'due-on-receipt': 'Due on receipt', 'net-15': 'Net-15', 'net-30': 'Net-30', 'net-45': 'Net-45', 'net-60': 'Net-60', 'custom': '' }[inv.terms] || '';
    clauses.push(`Due: ${formatDate(inv.dueDate)}${termsLabel ? ' (' + termsLabel + ')' : ''}`);
  }
  if (s.lateFee) clauses.push(s.lateFee);
  if (s.mealPenalty) clauses.push(s.mealPenalty);
  if (clauses.length) pay.appendChild(el('div', { class: 'cv-clauses' }, clauses.join('\n')));
  frag.appendChild(pay);

  const wrap = el('div');
  wrap.appendChild(frag);
  return wrap;
}

function renderQuote() {
  const s = getSettings();
  const inv = currentInvoice;
  const frag = document.createDocumentFragment();

  const dateStr = inv.invoiceDate ? formatDate(inv.invoiceDate) : '';

  frag.appendChild(el('div', { class: 'q-inv-num' }, `INVOICE ${inv.invoiceNo || 'Q00000'}`));

  const hero = el('div', { class: 'q-hero' });
  const left = el('div');
  left.appendChild(el('div', { class: 'q-logo' }, '🎬 📽 🎥'));
  const qBizRow = el('div', { class: 'preview-subtitle' });
  const qBiz = el('div', { class: 'q-biz' });
  qBiz.innerHTML = `${s.business || 'Your Business LLC'}${s.address ? '<br>' + s.address.replace(/\n/g, '<br>') : ''}`;
  const pencilQBiz = el('span', { class: 'edit-icon', title: 'Edit Legal Business Name', onclick: () => focusSettingField('#s-business') }, '✎');
  qBizRow.append(qBiz, pencilQBiz);
  left.appendChild(qBizRow);
  if (inv.injectTaxInfo && s.businessEIN) left.appendChild(el('div', { class: 'q-tax' }, `EIN: ${s.businessEIN}`));
  if (inv.injectTaxInfo && s.w9OnFile) left.appendChild(el('div', { class: 'q-tax' }, 'W9 available on request'));
  hero.appendChild(left);

  const right = el('div');
  const brandTitleRow = el('div', { class: 'q-title-row preview-title' });
  const brandTitle = el('div', { class: 'q-brand-title' });
  const activeQHeadline = inv.invoiceHeadlineOverride || s.brandedTitle;
  brandTitle.innerHTML = activeQHeadline ? activeQHeadline : '<span class="ph">Your Studio / Brand — set in Settings</span>';
  const pencilQ = el('span', {
    class: 'edit-icon',
    title: 'Edit Branded Title in Settings',
    onclick: () => focusSettingField('#s-branded-title'),
  }, '✎');
  brandTitleRow.append(brandTitle, pencilQ);
  right.appendChild(brandTitleRow);
  const recipLines = [];
  if (inv.client.attn) recipLines.push(`To: ${inv.client.attn}${inv.client.company ? ' of' : ''}`);
  if (inv.client.company) recipLines.push(inv.client.company);
  if (inv.client.address) recipLines.push(inv.client.address);
  right.appendChild(el('div', { class: 'q-recipient' }, recipLines.join('\n')));
  if (dateStr) right.appendChild(el('div', { class: 'q-date' }, `Invoice Date - ${dateStr}`));
  if (inv.project.quoteScope) {
    right.appendChild(el('div', { class: 'q-scope-label' }, `SCOPE - ${inv.project.name || ''}`.trim()));
    right.appendChild(el('div', { class: 'q-scope-body' }, inv.project.quoteScope));
  }
  hero.appendChild(right);
  frag.appendChild(hero);

  // Header bar
  frag.appendChild(el('div', { class: 'q-header-bar' }, 'PRODUCTION QUOTE'));

  const table = el('table');
  const thead = el('thead');
  const thr = el('tr');
  thr.appendChild(el('th', { class: 'col-details' }, 'ROLE / SERVICE'));
  thr.appendChild(el('th', { class: 'col-notes' }, 'NOTES'));
  thr.appendChild(el('th', { class: 'col-amount' }, 'RATE'));
  thead.appendChild(thr);
  table.appendChild(thead);
  const tbody = el('tbody');

  const quoteSections = {
    kit: 'CAMERA KIT',
    media: 'LIGHTING & GRIP',
    labor: 'AUDIO / LIGHTING & GRIP',
    crew: 'CREW',
    talent: 'TALENT',
    fees: 'MISCELLANEOUS',
    misc: 'MISCELLANEOUS',
  };

  let qAnyRows = false;
  for (const section of ['kit', 'media', 'labor', 'crew', 'talent', 'fees', 'misc']) {
    const rows = inv.sections[section] || [];
    if (rows.length === 0) continue;
    qAnyRows = true;
    const headRow = el('tr', { class: 'q-section' });
    headRow.appendChild(el('td', { colspan: '3' }, quoteSections[section] || section.toUpperCase()));
    tbody.appendChild(headRow);
    for (const r of rows) {
      const tr = el('tr', { class: 'q-item' });
      const qty = parseFloat(r.qty) || 1;
      const detailLabel = (r.details || '') + (qty > 1 ? ` ×${qty}` : '');
      tr.appendChild(el('td', {}, detailLabel));
      tr.appendChild(el('td', { class: 'notes-col' }, r.notes || ''));
      tr.appendChild(el('td', { class: 'amt' }, (() => { const v = parseFloat(String(r.amount).replace(/[^0-9.\-]/g, '')); return v ? formatMoney(v) : ''; })()));
      tbody.appendChild(tr);
    }
  }

  if (!qAnyRows) {
    const emptyRow = el('tr', { class: 'q-item' });
    const emptyCell = el('td', { colspan: '3' });
    emptyCell.innerHTML = '<span class="ph">[Add line items to see them here]</span>';
    emptyRow.appendChild(emptyCell);
    tbody.appendChild(emptyRow);
  }

  tbody.appendChild(el('tr', { class: 'q-spacer' }, el('td', { colspan: '3' })));
  const qSubtotal = inv.totalOverride
    ? parseFloat(String(inv.totalOverride).replace(/[^0-9.\-]/g, '')) || 0
    : sumSections();
  const qDiscount = parseFloat(String(inv.discount || '').replace(/[^0-9.\-]/g, '')) || 0;
  const totalVal = Math.max(0, qSubtotal - qDiscount);

  if (qDiscount > 0) {
    const subRow = el('tr', { class: 'q-subtotal-row' });
    subRow.appendChild(el('td', {}, 'Subtotal'));
    subRow.appendChild(el('td', {}));
    subRow.appendChild(el('td', { class: 'amt' }, formatMoney(qSubtotal)));
    tbody.appendChild(subRow);
    const discRow = el('tr', { class: 'q-discount-row' });
    discRow.appendChild(el('td', {}, 'Discount'));
    discRow.appendChild(el('td', {}));
    discRow.appendChild(el('td', { class: 'amt' }, `−${formatMoney(qDiscount)}`));
    tbody.appendChild(discRow);
  }

  if (inv.depositEnabled && totalVal > 0) {
    const depAmt = computeDepositAmount(inv, totalVal);
    const depLbl = depositLabel(inv);
    const balance = totalVal - depAmt;
    const nrTag = inv.depositNonrefundable !== false ? 'Non-refundable, ' : '';
    const whenTag = depositDueText(inv);
    const depRow = el('tr', { class: 'q-deposit-row' });
    depRow.appendChild(el('td', {}, `Deposit Due${depLbl ? ' (' + depLbl + ')' : ''} — ${nrTag}${whenTag}`));
    depRow.appendChild(el('td', {}));
    depRow.appendChild(el('td', { class: 'amt' }, formatMoney(depAmt)));
    tbody.appendChild(depRow);
    const balRow = el('tr', { class: 'q-balance-row' });
    balRow.appendChild(el('td', {}, `Remaining Balance${inv.dueDate ? ' (Due ' + formatDate(inv.dueDate) + ')' : ''}`));
    balRow.appendChild(el('td', {}));
    balRow.appendChild(el('td', { class: 'amt' }, formatMoney(balance)));
    tbody.appendChild(balRow);
  }

  const totalRow = el('tr', { class: 'q-total' });
  totalRow.appendChild(el('td', {}, 'ESTIMATED TOTAL'));
  totalRow.appendChild(el('td', {}));
  totalRow.appendChild(el('td', { class: 'amt' }, formatMoney(totalVal)));
  tbody.appendChild(totalRow);
  tbody.appendChild(el('tr', { class: 'q-spacer' }, el('td', { colspan: '3' })));

  table.appendChild(tbody);
  frag.appendChild(table);

  const wrap = el('div');
  wrap.appendChild(frag);
  return wrap;
}

function formatDate(iso) {
  const [y, m, d] = iso.split('-');
  if (!y) return '';
  return `${m}.${d}.${y}`;
}

// ============== UPDATE LOOP ==============
function update() {
  fieldsToState();
  toggleTemplateUI();
  renderPreview();
  refreshSaveBtn();
}

// ============== SETTINGS PANEL ==============
function openSettings() { $('#settings-panel').hidden = false; loadSettingsForm(); renderKitCatalogSettings(); }
function closeSettings() { $('#settings-panel').hidden = true; }
function loadSettingsForm() {
  const s = getSettings();
  $('#s-title').value = s.title || '';
  $('#s-branded-title').value = s.brandedTitle || '';
  $('#s-business').value = s.business || '';
  $('#s-name').value = s.name || '';
  $('#s-address').value = s.address || '';
  $('#s-phone').value = s.phone || '';
  $('#s-email').value = s.email || '';
  $('#s-pay-head').value = s.payHead || '';
  $('#s-pay-detail').value = s.payDetail || '';
  $('#s-pay-note').value = s.payNote || '';
  const lf = $('#s-late-fee'); if (lf) lf.value = s.lateFee || '';
  const mp = $('#s-meal-penalty'); if (mp) mp.value = s.mealPenalty || '';
  const dd = $('#s-default-deposit-pct'); if (dd) dd.value = s.defaultDepositPct || '50';
  const ip = $('#s-invoice-prefix'); if (ip) ip.value = s.invoiceNumberPrefix || '';
  // Tax info
  const ein = $('#businessEIN'); if (ein) ein.value = s.businessEIN || '';
  const ssn = $('#businessSSN'); if (ssn) ssn.value = s.businessSSN || '';
  const w9 = $('#w9OnFile'); if (w9) w9.checked = s.w9OnFile !== false;
  // Payment method
  const pm = document.querySelector(`input[name="paymentMethod"][value="${s.paymentMethod || 'zelle'}"]`);
  if (pm) pm.checked = true;
  const bn = $('#bankName'); if (bn) bn.value = s.bankName || '';
  const an = $('#accountName'); if (an) an.value = s.accountName || '';
  const acn = $('#accountNumber'); if (acn) acn.value = s.accountNumber || '';
  const wr = $('#wireRouting'); if (wr) wr.value = s.wireRouting || '';
  const ar = $('#achRouting'); if (ar) ar.value = s.achRouting || '';
  const wp = $('#wirePreferred'); if (wp) wp.checked = !!s.wirePreferred;
  toggleWireFields();
  const venmoEl = $('#s-venmo'); if (venmoEl) venmoEl.value = s.venmo || '';
  const cashAppEl = $('#s-cashapp'); if (cashAppEl) cashAppEl.value = s.cashApp || '';
  const logoSizeEl = $('#logoSize'); if (logoSizeEl) logoSizeEl.value = (s.logo && s.logo.size) || 'medium';
  const logoPEl = $('#logoPlacement'); if (logoPEl) logoPEl.value = (s.logo && s.logo.placement) || 'top-left';
  const logoImg = $('#logoPreviewImg');
  const logoRemoveBtn = $('#logoRemove');
  if (logoImg && s.logo && s.logo.dataUrl) {
    logoImg.src = s.logo.dataUrl;
    logoImg.style.display = 'inline-block';
    if (logoRemoveBtn) logoRemoveBtn.style.display = 'inline-block';
  }
}

function toggleWireFields() {
  const sel = document.querySelector('input[name="paymentMethod"]:checked');
  const val = sel ? sel.value : 'zelle';
  const wf = document.querySelector('.wire-fields');
  if (wf) wf.hidden = !(val === 'wire' || val === 'both');
}
function saveSettingsForm() {
  const s = {
    title: $('#s-title').value,
    brandedTitle: $('#s-branded-title').value,
    business: $('#s-business').value,
    name: $('#s-name').value,
    address: $('#s-address').value,
    phone: $('#s-phone').value,
    email: $('#s-email').value,
    payHead: $('#s-pay-head').value,
    payDetail: $('#s-pay-detail').value,
    payNote: $('#s-pay-note').value,
    lateFee: ($('#s-late-fee') || {}).value || '',
    mealPenalty: ($('#s-meal-penalty') || {}).value || '',
    defaultDepositPct: ($('#s-default-deposit-pct') || {}).value || '50',
    invoiceNumberPrefix: ($('#s-invoice-prefix') || {}).value || '',
    businessEIN: ($('#businessEIN') || {}).value || '',
    businessSSN: ($('#businessSSN') || {}).value || '',
    w9OnFile: ($('#w9OnFile') || {}).checked,
    paymentMethod: (document.querySelector('input[name="paymentMethod"]:checked') || {}).value || 'zelle',
    bankName: ($('#bankName') || {}).value || '',
    accountName: ($('#accountName') || {}).value || '',
    accountNumber: ($('#accountNumber') || {}).value || '',
    wireRouting: ($('#wireRouting') || {}).value || '',
    achRouting: ($('#achRouting') || {}).value || '',
    wirePreferred: ($('#wirePreferred') || {}).checked || false,
    venmo: ($('#s-venmo') || {}).value || '',
    cashApp: ($('#s-cashapp') || {}).value || '',
    logo: {
      dataUrl: (getSettings().logo && getSettings().logo.dataUrl) || '',
      size: ($('#logoSize') || {}).value || 'medium',
      placement: ($('#logoPlacement') || {}).value || 'top-left',
    },
  };
  setSettings(s);
  update();
  closeSettings();
}

// ============== RECENTS ==============
function openRecents() { $('#recents-panel').hidden = false; renderRecents(); }
function closeRecents() { $('#recents-panel').hidden = true; }
function renderRecents() {
  const ul = $('#recents-list');
  ul.innerHTML = '';
  const recents = getRecents();
  if (recents.length === 0) {
    ul.appendChild(el('li', { class: 'muted' }, 'No recent invoices yet. Download or save one to see it here.'));
    return;
  }
  for (const [idx, inv] of recents.entries()) {
    const li = el('li');
    const title = [inv.client.company, inv.project.name].filter(Boolean).join(' — ') || '(untitled)';
    const when = new Date(inv._savedAt).toLocaleString();
    const subtotal = parseFloat(String(inv.totalOverride || sumFromInv(inv)).replace(/[^0-9.\-]/g, '')) || 0;
    const discountVal = parseFloat(String(inv.discount || '').replace(/[^0-9.\-]/g, '')) || 0;
    const netTotal = Math.max(0, subtotal - discountVal);
    const statusBadge = el('span', { class: 'status-badge status-' + (inv.status || 'draft') }, (inv.status || 'draft').toUpperCase());
    const head = el('div', { class: 'r-head' });
    head.appendChild(document.createTextNode(title + ' '));
    head.appendChild(statusBadge);
    const delBtn = el('button', { type: 'button', class: 'btn btn-sm r-delete-btn', title: 'Delete this entry' }, '🗑');
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const label = title !== '(untitled)' ? `"${title}"` : 'this invoice';
      if (!confirm(`Delete ${label} from recents? This can't be undone.`)) return;
      const updated = getRecents();
      updated.splice(idx, 1);
      save(STORE.RECENTS, updated);
      renderRecents();
    });
    head.appendChild(delBtn);
    li.appendChild(head);
    const subLine = el('div', { class: 'r-sub' });
    let subText = `${when} · ${inv.template} · ${formatMoney(netTotal)}`;
    if (discountVal > 0) subText += ` · was ${formatMoney(subtotal)}`;
    if (inv.dueDate) subText += ` · due ${formatDate(inv.dueDate)}`;
    subLine.textContent = subText;
    if (discountVal > 0) {
      const discTag = el('span', { class: 'r-discount-tag' }, `−${formatMoney(discountVal)} discount`);
      subLine.appendChild(discTag);
    }
    li.appendChild(subLine);
    li.addEventListener('click', () => { currentInvoice = JSON.parse(JSON.stringify(inv)); stateToFields(); update(); closeRecents(); });
    ul.appendChild(li);
  }
}
function sumFromInv(inv) {
  let t = 0;
  for (const sec of SECTIONS) for (const r of inv.sections[sec] || []) t += parseFloat(String(r.amount).replace(/[^0-9.\-]/g, '')) || 0;
  return t;
}

// ============== DOWNLOAD ==============
function downloadPDF() {
  fieldsToState();
  const target = $('#invoice-preview');
  const filename = buildFilename();
  const opt = {
    margin: [0.45, 0.45, 0.45, 0.45],
    filename,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', scrollY: 0, scrollX: 0 },
    jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' },
  };
  html2pdf().set(opt).from(target).save();
}

function buildFilename() {
  const inv = currentInvoice;
  // Sanitize: trim, replace spaces w/ hyphens, strip unsafe filename chars + punctuation
  const sanitize = (str) => (str || '').trim()
    .replace(/[/\\:*?"<>|,.']/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  const client = sanitize(inv.client.company) || sanitize(inv.client.attn) || 'Client';
  const project = sanitize(inv.project.name) || 'Project';
  const docType = inv.template === 'quote' ? 'Quote' : 'Invoice';
  // YYMMDD from invoiceDate
  let yymmdd = '';
  if (inv.invoiceDate) {
    const [y, m, d] = inv.invoiceDate.split('-');
    if (y && m && d) yymmdd = y.slice(2) + m + d;
  }
  return `${client}_${project}_${docType}${yymmdd ? '_' + yymmdd : ''}.pdf`;
}

// ============== INITIAL SEED ==============
function loadSampleKitForCategory(slug) {
  const items = SAMPLE_KIT_BY_CATEGORY[slug] || [];
  if (items.length === 0) return;
  const kit = getKit();
  const existingNames = new Set(kit.map((k) => (k.name || '').toLowerCase().trim()));
  let added = 0;
  for (const item of items) {
    const key = item.name.toLowerCase().trim();
    if (existingNames.has(key)) continue;
    kit.push({ category: slug, name: item.name, rate: item.rate, notes: item.notes || '' });
    existingNames.add(key);
    added++;
  }
  setKit(kit);
  renderKitCatalogSettings();
  renderKitCatalogPicker();
  const label = (KIT_CATEGORIES.find((c) => c.slug === slug) || {}).label || slug;
  alert(`${label}: added ${added} item${added === 1 ? '' : 's'} (${items.length - added} already in catalog).`);
}

function loadSampleKitAll() {
  for (const slug of Object.keys(SAMPLE_KIT_BY_CATEGORY)) {
    const items = SAMPLE_KIT_BY_CATEGORY[slug] || [];
    const kit = getKit();
    const existingNames = new Set(kit.map((k) => (k.name || '').toLowerCase().trim()));
    for (const item of items) {
      const key = item.name.toLowerCase().trim();
      if (existingNames.has(key)) continue;
      kit.push({ category: slug, name: item.name, rate: item.rate, notes: item.notes || '' });
      existingNames.add(key);
    }
    setKit(kit);
  }
  renderKitCatalogSettings();
  renderKitCatalogPicker();
  alert('All sample categories loaded. Edit, replace, or remove items as you go.');
}
function resetBrand() {
  setSettings(DEFAULT_SETTINGS);
  loadSettingsForm();
  update();
  alert('Settings reset to brandless defaults.');
}

// ============== URL PARAMS (for Atlas-driven drafts) ==============
function applyURLParams() {
  // Accept a ?draft=<base64 JSON> param OR individual params for manual linking.
  const params = new URLSearchParams(window.location.search);
  const draft = params.get('draft');
  if (draft) {
    try {
      const obj = JSON.parse(atob(decodeURIComponent(draft)));
      currentInvoice = { ...blankInvoice(), ...obj, sections: { ...blankInvoice().sections, ...(obj.sections || {}) } };
      stateToFields();
      update();
      return;
    } catch (e) { console.warn('bad draft param', e); }
  }
  // Individual params (simple use)
  const simple = ['invoiceNo', 'invoiceDate', 'projectName', 'shootDates', 'company', 'attn'];
  let any = false;
  for (const key of simple) {
    const v = params.get(key);
    if (!v) continue;
    any = true;
    if (key === 'projectName') currentInvoice.project.name = v;
    else if (key === 'shootDates') currentInvoice.project.shootDates = v;
    else if (key === 'company') currentInvoice.client.company = v;
    else if (key === 'attn') currentInvoice.client.attn = v;
    else currentInvoice[key] = v;
  }
  const tpl = params.get('template');
  if (tpl === 'quote' || tpl === 'coverage') currentInvoice.template = tpl;
  if (any) { stateToFields(); update(); }
}

function focusSettingField(selector) {
  openSettings();
  setTimeout(() => {
    const el = document.querySelector(selector);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => { el.focus(); if (el.select) el.select(); }, 350);
    }
  }, 80);
}

async function loadRateCard() {
  try {
    const res = await fetch('rate-card.json', { cache: 'no-store' });
    if (!res.ok) return;
    RATE_CARD = await res.json();
    // Derive flat roles array from departments for backwards compat
    if (!RATE_CARD.roles && RATE_CARD.departments) {
      RATE_CARD.roles = RATE_CARD.departments.flatMap(d => d.roles);
    }
    renderRateCardDatalists();
    renderLaborPicker();
  } catch (e) { console.warn('rate-card.json load failed', e); }
}

function renderRateCardDatalists() {
  let rolesDL = document.getElementById('role-suggestions');
  if (!rolesDL) {
    rolesDL = el('datalist', { id: 'role-suggestions' });
    document.body.appendChild(rolesDL);
  }
  rolesDL.innerHTML = '';
  for (const r of RATE_CARD.roles || []) {
    rolesDL.appendChild(el('option', { value: r.name, label: `$${r.low}–$${r.high} (typical $${r.typical})` }));
  }
}

function renderLaborPicker() {
  const deptSel = $('#labor-dept-pick');
  const roleSel = $('#labor-role-pick');
  if (!deptSel || !roleSel) return;
  const depts = RATE_CARD.departments || [];
  deptSel.innerHTML = '<option value="">— department —</option>';
  for (const d of depts) {
    deptSel.appendChild(el('option', { value: d.slug }, d.label));
  }
  deptSel.onchange = () => {
    const dept = depts.find(d => d.slug === deptSel.value);
    roleSel.innerHTML = '<option value="">— role —</option>';
    roleSel.disabled = !dept;
    if (!dept) return;
    for (const r of dept.roles) {
      roleSel.appendChild(el('option', { value: r.name }, `${r.name} — $${r.typical}`));
    }
  };
  roleSel.disabled = true;
}

function duplicateLast() {
  fieldsToState();
  const srcNo = currentInvoice.invoiceNo || 'this invoice';
  const ok = confirm(`Duplicate "${srcNo}"?\n\nA new draft will be created with today's date and a new invoice number. The original is unchanged.`);
  if (!ok) return;
  const copy = JSON.parse(JSON.stringify(currentInvoice));
  delete copy._savedAt;
  delete copy._id;
  copy.invoiceNo = generateInvoiceNo();
  copy.invoiceDate = new Date().toISOString().slice(0, 10);
  copy.status = 'draft';
  currentInvoice = copy;
  stateToFields();
  update();
}

// ============== WIRE UP ==============
document.addEventListener('DOMContentLoaded', () => {
  // First-run banner: if no settings saved AND no kit, show welcome
  const hasSettings = !!localStorage.getItem(STORE.SETTINGS);
  const hasKit = getKit().length > 0;
  if (!hasSettings && !hasKit) {
    const banner = $('#welcome-banner');
    if (banner) banner.hidden = false;
  }

  applyAppearance(getAppearance());
  stateToFields();
  renderKitCatalogPicker();
  renderClientPicker();
  loadRateCard();
  applyURLParams();
  update();

  // Field listeners
  const formInputs = $$('.form-pane input, .form-pane textarea, .form-pane select');
  formInputs.forEach((inp) => inp.addEventListener('input', update));
  formInputs.forEach((inp) => inp.addEventListener('change', update));

  // Section add/remove
  $$('[data-action="add-row"]').forEach((btn) => {
    btn.addEventListener('click', () => addRow(btn.dataset.section));
  });

  // Add from catalog
  $('[data-action="add-from-catalog"]').addEventListener('click', () => {
    const sel = $('#kit-catalog-pick');
    const idx = sel.value;
    if (idx === '') return;
    const k = getKit()[idx];
    if (!k) return;
    addRow('kit', { details: k.name, amount: k.rate, rate: k.rate, qty: 1, notes: k.notes || '', category: k.category || '' });
    sel.value = '';
  });

  // Add from labor picker
  $('[data-action="add-from-labor"]').addEventListener('click', () => {
    const deptSel = $('#labor-dept-pick');
    const roleSel = $('#labor-role-pick');
    const roleName = roleSel && roleSel.value;
    if (!roleName) return;
    const allRoles = (RATE_CARD.departments || []).flatMap(d => d.roles);
    const r = allRoles.find(x => x.name === roleName);
    if (!r) return;
    addRow('labor', { details: r.name, amount: String(r.typical), rate: r.typical, qty: 1, notes: r.notes || '' });
    deptSel.value = '';
    roleSel.innerHTML = '<option value="">— role —</option>';
    roleSel.disabled = true;
  });

  // Client picker
  $('#client-select').addEventListener('change', (e) => { if (e.target.value !== '') loadClient(parseInt(e.target.value, 10)); });
  $('#save-client-btn').addEventListener('click', () => {
    fieldsToState();
    if (!currentInvoice.client.company && !currentInvoice.client.attn) { alert('Add a company or contact name first.'); return; }
    saveClient({ ...currentInvoice.client });
    renderClientPicker();
    alert('Client saved.');
  });

  // Template toggle
  $$('input[name="template"]').forEach((r) => r.addEventListener('change', update));

  // Header buttons
  $('#new-btn').addEventListener('click', () => {
    currentInvoice = blankInvoice();  // generateInvoiceNo runs fresh, picking up current settings prefix
    stateToFields();
    update();
  });
  $('#download-btn').addEventListener('click', downloadPDF);
  $('#print-btn').addEventListener('click', () => { fieldsToState(); window.print(); });
  $('#settings-btn').addEventListener('click', openSettings);
  $('#settings-close').addEventListener('click', closeSettings);
  $('#settings-save').addEventListener('click', saveSettingsForm);
  $('#settings-reset').addEventListener('click', resetBrand);
  $('#appearance-btn').addEventListener('click', openAppearance);
  $('#appearance-close').addEventListener('click', () => {
    // Revert live preview to saved state on close without apply
    applyAppearance(getAppearance());
    closeAppearance();
  });
  $('#appearance-save').addEventListener('click', saveAppearanceForm);
  $('#appearance-reset').addEventListener('click', () => {
    const reset = { ...DEFAULT_APPEARANCE, _customThemes: [] };
    save(STORE.APPEARANCE, reset);
    applyAppearance(reset);
    closeAppearance();
  });
  // Preset buttons — fill pickers + live preview, no custom slot changes
  $$('.theme-preset-btn').forEach(btn => {
    if (!btn.dataset.theme) return; // skip custom slot buttons (wired in renderCustomThemeSlots)
    btn.addEventListener('click', () => {
      const t = THEMES[btn.dataset.theme];
      if (!t) return;
      $('#ap-accent').value = t.accent;
      $('#ap-highlight').value = t.highlight;
      $('#ap-bg').value = t.bg;
      $('#ap-ink').value = t.ink;
      _apEditingCustomSlot = null;
      _apCurrentThemeKey = btn.dataset.theme;
      _apDirty = false;
      applyAppearance({ ...getAppearance(), ...t });
      updateActiveThemeIndicator(btn.dataset.theme);
      updateThemeStatus();
    });
  });
  // Live preview on picker change
  ['#ap-accent','#ap-highlight','#ap-bg','#ap-ink'].forEach(id => {
    $(id).addEventListener('input', onPickerChange);
  });
  ['#ap-display-font','#ap-body-font','#ap-font-size'].forEach(id => {
    $(id).addEventListener('change', onPickerChange);
  });
  $('#kit-add-btn')?.addEventListener('click', () => { const kit = getKit(); kit.push({ category: 'other', name: '', rate: 0, notes: '' }); setKit(kit); renderKitCatalogSettings(); renderKitCatalogPicker(); });
  const seedAllBtn = $('#kit-seed-all-btn');
  if (seedAllBtn) seedAllBtn.addEventListener('click', loadSampleKitAll);
  $$('[data-seed-cat]').forEach((btn) => {
    btn.addEventListener('click', () => loadSampleKitForCategory(btn.getAttribute('data-seed-cat')));
  });
  $('#recents-btn').addEventListener('click', openRecents);
  $('#recents-close').addEventListener('click', closeRecents);

  // Top toolbar Kit shortcut → dedicated kit page
  $('#kit-shortcut-btn')?.addEventListener('click', () => {
    window.open('kit.html', '_blank');
  });

  // Refresh kit picker if the kit page saves changes in another tab
  window.addEventListener('storage', (e) => {
    if (e.key === STORE.KIT) {
      renderKitCatalogPicker();
      renderKitCatalogSettings();
    }
  });

  // Payment method radio change
  document.querySelectorAll('input[name="paymentMethod"]').forEach((r) => {
    r.addEventListener('change', toggleWireFields);
  });

  // SSN show/hide toggle
  $('#ssn-toggle')?.addEventListener('click', () => {
    const ssn = $('#businessSSN');
    if (!ssn) return;
    ssn.type = ssn.type === 'password' ? 'text' : 'password';
  });
  $('#logoUpload')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 500 * 1024) { alert('Logo too large. Please use an image under 500KB.'); e.target.value = ''; return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;
      const existing = getSettings();
      existing.logo = { ...(existing.logo || {}), dataUrl };
      setSettings(existing);
      const logoImg = $('#logoPreviewImg');
      const logoRemoveBtn = $('#logoRemove');
      if (logoImg) { logoImg.src = dataUrl; logoImg.style.display = 'inline-block'; }
      if (logoRemoveBtn) logoRemoveBtn.style.display = 'inline-block';
      update();
    };
    reader.readAsDataURL(file);
  });
  $('#logoRemove')?.addEventListener('click', () => {
    const existing = getSettings();
    existing.logo = { ...(existing.logo || {}), dataUrl: '' };
    setSettings(existing);
    const logoImg = $('#logoPreviewImg');
    const logoRemoveBtn = $('#logoRemove');
    if (logoImg) { logoImg.src = ''; logoImg.style.display = 'none'; }
    if (logoRemoveBtn) logoRemoveBtn.style.display = 'none';
    const logoUpload = $('#logoUpload');
    if (logoUpload) logoUpload.value = '';
    update();
  });
  ['#logoSize', '#logoPlacement'].forEach((sel) => {
    $(sel)?.addEventListener('change', () => {
      const existing = getSettings();
      existing.logo = {
        ...(existing.logo || {}),
        size: ($('#logoSize') || {}).value || 'medium',
        placement: ($('#logoPlacement') || {}).value || 'top-left',
      };
      setSettings(existing);
      update();
    });
  });
  $('#duplicate-btn').addEventListener('click', duplicateLast);
  $('#save-invoice-btn').addEventListener('click', saveInvoice);
  $('#mark-paid-btn').addEventListener('click', () => {
    currentInvoice.status = 'paid';
    const sel = $('#status-select');
    if (sel) sel.value = 'paid';
    update();
    // Also update in recents if this was saved
    if (currentInvoice._id) {
      const recents = getRecents();
      const match = recents.findIndex(r => r._id === currentInvoice._id);
      if (match >= 0) {
        recents[match].status = 'paid';
        save(STORE.RECENTS, recents);
        renderRecents();
      }
    }
  });
  // Terms select recomputes due date
  $('#terms-select').addEventListener('change', () => {
    const terms = $('#terms-select').value;
    currentInvoice.terms = terms;
    if (terms !== 'custom' && currentInvoice.invoiceDate) {
      currentInvoice.dueDate = addDaysISO(currentInvoice.invoiceDate, termsDays(terms));
      $('#due-date').value = currentInvoice.dueDate;
    }
    update();
  });
  $('#invoice-date').addEventListener('change', () => {
    currentInvoice.invoiceDate = $('#invoice-date').value;
    if (currentInvoice.terms && currentInvoice.terms !== 'custom') {
      currentInvoice.dueDate = addDaysISO(currentInvoice.invoiceDate, termsDays(currentInvoice.terms));
      $('#due-date').value = currentInvoice.dueDate;
    }
    update();
  });
  // Project type triggers a rate-band hint in the welcome area
  $('#project-type').addEventListener('change', () => {
    const val = $('#project-type').value;
    const match = (RATE_CARD.projectTypes || []).find((t) => t.name === val);
    if (match) {
      showToast(`💡 ${val} typical: ${match.range}`);
    }
    update();
  });
  // Client tier triggers a floor hint — try exact match first, then friendly map
  // Deposit handlers (flat fields)
  $('#depositEnabled')?.addEventListener('change', () => {
    currentInvoice.depositEnabled = $('#depositEnabled').checked;
    toggleDepositUI();
    update();
  });
  $('#depositType')?.addEventListener('change', () => {
    currentInvoice.depositType = $('#depositType').value;
    toggleDepositUI();
    update();
  });
  $('#depositDue')?.addEventListener('change', () => {
    currentInvoice.depositDue = $('#depositDue').value;
    toggleDepositUI();
    update();
  });
  ['#depositCustomPct', '#depositCustomFlat', '#depositCustomDate', '#depositNonrefundable'].forEach((sel) => {
    const el = $(sel);
    if (el) { el.addEventListener('input', update); el.addEventListener('change', update); }
  });

  // Template-toggle: default deposit ON for Quote, OFF for Coverage
  $$('input[name="template"]').forEach((r) => {
    r.addEventListener('change', () => {
      const newTemplate = r.value;
      const wasManuallySet = currentInvoice._depositManuallySet;
      if (!wasManuallySet) {
        if (newTemplate === 'quote') {
          currentInvoice.depositEnabled = true;
          const s = getSettings();
          currentInvoice.depositType = s.defaultDepositPct || '50';
        } else {
          currentInvoice.depositEnabled = false;
        }
        const dEn = $('#depositEnabled');
        if (dEn) dEn.checked = currentInvoice.depositEnabled;
        const dType = $('#depositType');
        if (dType) dType.value = currentInvoice.depositType;
        toggleDepositUI();
      }
    });
  });
  $('#depositEnabled')?.addEventListener('change', () => { currentInvoice._depositManuallySet = true; });
  $('#client-tier').addEventListener('change', () => {
    const val = $('#client-tier').value;
    const tierHints = {
      'production-company': 'Full kit rates. They have budget. Hold your day rate ceiling.',
      'network': 'Expect OT clauses, meal penalties, and union-adjacent rates.',
      'direct-brand': 'Wide range — creator/brand-ambassador deals pay best.',
      'producer': 'Independent producer — hold firm at full rates. Quote high first.',
      'line-producer': 'Budget-aware. They know the numbers. Justify every line item.',
      'indie': 'Soft rate zone. Floor at $500. Cap below $2K unless repeat.',
      'payroll': 'Wrapbook/BTL/Ross flow — you may get hired as W-2 day-player. Deal memo not invoice.',
      'nonprofit': 'Mission discount OK. Cap $1,000 unless scope is big.',
      'friend': 'Below-market by choice. Note it is a relationship play, not market.',
    };
    if (tierHints[val]) showToast(`🎯 ${val}: ${tierHints[val]}`);
    update();
  });

});

let toastEl = null;
function showToast(msg) {
  if (!toastEl) {
    toastEl = el('div', { class: 'toast' });
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = msg;
  toastEl.classList.add('toast-visible');
  setTimeout(() => { toastEl.classList.remove('toast-visible'); }, 4000);
}
