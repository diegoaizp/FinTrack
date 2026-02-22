// ===== FinTrack State Module =====

const FT = {
  // Current form state
  type: 'Gasto',
  scope: 'Personal',
  cat: '',
  sub: '',
  recType: 'suscripcion',
  freq: 'mensual',

  // Filters
  filter: 'all',
  subFilter: 'all',
  subCycleFilter: 'all',

  // Month navigation
  month: new Date().getMonth(),
  year: new Date().getFullYear(),
  invMonth: new Date().getMonth(),
  invYear: new Date().getFullYear(),
  statusMonth: new Date().getMonth(),
  statusYear: new Date().getFullYear(),

  // Data
  tx: [],           // Current month movimientos
  templates: [],    // All plantillas
  categories: [],   // All categorias
  statusAccounts: [],
  statusEntries: [],

  // Edit state
  editingId: null,

  // Loading flags
  loading: false,
  loadingCount: 0,
  catsLoaded: false,
  tplLoaded: false,
  statusCache: {},
};

// ===== CACHE =====
const Cache = {
  _prefix: 'ft_',

  key(year, month) {
    return `${this._prefix}${year}_${String(month + 1).padStart(2, '0')}`;
  },

  get(year, month) {
    try {
      const raw = localStorage.getItem(this.key(year, month));
      if (!raw) return null;
      const data = JSON.parse(raw);
      // Check staleness (3 min)
      if (Date.now() - (data._ts || 0) > 3 * 60 * 1000) return null;
      return data.items;
    } catch (e) { return null; }
  },

  set(year, month, items) {
    try {
      localStorage.setItem(this.key(year, month), JSON.stringify({
        items,
        _ts: Date.now()
      }));
    } catch (e) { /* localStorage full — silent fail */ }
  },

  invalidate(year, month) {
    localStorage.removeItem(this.key(year, month));
  },

  invalidateCurrent() {
    this.invalidate(FT.year, FT.month);
    this.invalidate(FT.invYear, FT.invMonth);
  },

  clearAll() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      // Only remove month-cache keys (ft_YYYY_MM), keep ft_url and other app settings.
      if (k && /^ft_\d{4}_\d{2}$/.test(k)) keys.push(k);
    }
    keys.forEach(k => localStorage.removeItem(k));
  }
};

// ===== HELPERS =====
function genId(prefix) {
  return prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
}

function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function nowISO() {
  return new Date().toISOString().slice(0, 19);
}

function parseAmount(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  let s = String(v || '').trim();
  if (!s) return 0;
  s = s.replace(/\s/g, '');
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function formatEUR(n) {
  const value = Number.isFinite(Number(n)) ? Number(n) : 0;
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  const fixed = abs.toFixed(2);
  const parts = fixed.split('.');
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}${intPart},${parts[1]}€`;
}

function formatSignedEUR(n) {
  const value = Number.isFinite(Number(n)) ? Number(n) : 0;
  if (value === 0) return '0,00€';
  return `${value > 0 ? '+' : '−'}${formatEUR(Math.abs(value))}`;
}

function calcNextDate(dateStr, freq) {
  const d = new Date(dateStr);
  const add = { mensual: 1, trimestral: 3, semestral: 6, anual: 12 }[freq] || 1;
  d.setMonth(d.getMonth() + add);
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function esc(s) {
  return s.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const MONTHS_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

// ===== CATEGORY HELPERS =====
function getCatsForType(type) {
  const typeName = type === 'Inversión' ? 'Inversión' : type;
  const filtered = FT.categories.filter(c => c.tipo === typeName && c.estado === 'activo');

  // Count usage for sorting
  const usage = {};
  FT.tx.forEach(tx => {
    if (tx.type === typeName) {
      usage[tx.category] = (usage[tx.category] || 0) + 1;
    }
  });

  // Group by category
  const cats = {};
  filtered.forEach(c => {
    if (!cats[c.categoria]) cats[c.categoria] = { icon: c.icono, subs: [] };
    if (c.subcategoria && !cats[c.categoria].subs.includes(c.subcategoria)) {
      cats[c.categoria].subs.push(c.subcategoria);
    }
  });

  // Sort categories by usage desc, then alphabetically
  const sorted = Object.keys(cats).sort((a, b) =>
    (usage[b] || 0) - (usage[a] || 0) || a.localeCompare(b)
  );

  const result = {};
  sorted.forEach(k => result[k] = cats[k]);
  return result;
}

function getSubUsage(category) {
  const usage = {};
  FT.tx.forEach(tx => {
    if (tx.category === category) {
      usage[tx.subcategory] = (usage[tx.subcategory] || 0) + 1;
    }
  });
  return usage;
}

function catIcon(name) {
  const c = FT.categories.find(x => x.categoria === name);
  return c ? c.icono : 'label';
}

function normText(v) {
  return String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function isCompensatingBizum(tx) {
  if (!tx) return false;
  return tx.type === 'Ingreso' &&
    normText(tx.category) === 'reembolsos' &&
    normText(tx.subcategory) === 'bizum' &&
    !!String(tx.templateId || '').trim();
}

// Monthly cost normalization for templates
function monthlyAmount(tpl) {
  const mult = { mensual: 1, trimestral: 1 / 3, semestral: 1 / 6, anual: 1 / 12 }[tpl.frequency] || 1;
  return tpl.amount * mult;
}
