// ===== FinTrack API Module — Supabase =====

const SUPABASE_URL = 'https://akbhflfrusuakvpimwcu.supabase.co';

// La anon key se guarda en localStorage: sin ella no se puede acceder.
let _sb = null;

function _getSbKey() {
  return localStorage.getItem('ft_sb_key') || '';
}

function _initSb() {
  const key = _getSbKey();
  if (!key) { _sb = null; return null; }
  if (!_sb) _sb = window.supabase.createClient(SUPABASE_URL, key);
  return _sb;
}

function sbCheck(error, label) {
  if (error) throw new Error(`[${label}] ${error.message}`);
}

const API = {

  // ── getUrl() devuelve truthy sólo si hay key configurada ─────────────
  getUrl() { return _getSbKey() ? SUPABASE_URL : ''; },

  setUrl(key) {
    key = (key || '').trim();
    if (key) {
      localStorage.setItem('ft_sb_key', key);
    } else {
      localStorage.removeItem('ft_sb_key');
    }
    // Re-crear el cliente con la nueva key
    _sb = null;
    _initSb();
  },

  // ===== READ =====

  async loadMonth(year, month, force = false) {
    const cached = force ? null : Cache.get(year, month);
    if (cached) { FT.tx = cached; return cached; }

    const m     = month + 1; // la app usa mes 0-based
    const start = `${year}-${String(m).padStart(2, '0')}-01`;
    const end   = m === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(m + 1).padStart(2, '0')}-01`;

    const { data, error } = await _initSb()
      .from('movimientos')
      .select('*')
      .gte('fecha', start)
      .lt('fecha', end)
      .eq('estado', 'activo');

    sbCheck(error, 'loadMonth');

    const items = (data || []).map(r => ({
      id:          r.id,
      date:        r.fecha,
      type:        r.tipo,
      scope:       r.ambito,
      category:    r.categoria,
      subcategory: r.subcategoria  || '',
      description: r.descripcion   || '',
      amount:      parseAmount(r.importe),
      recurrence:  String(r.recurrencia || '').toLowerCase().trim(),
      frequency:   String(r.frecuencia  || '').toLowerCase().trim(),
      templateId:  r.plantilla_id  || '',
      status:      String(r.estado || 'activo').toLowerCase().trim(),
      created:     r.creado        || '',
      updated:     r.modificado    || ''
    }));

    Cache.set(year, month, items);
    FT.tx = items;
    return items;
  },

  async loadTemplates() {
    const { data, error } = await _initSb()
      .from('plantillas')
      .select('*')
      .neq('estado', 'eliminado');

    sbCheck(error, 'loadTemplates');

    FT.templates = (data || []).map(r => ({
      id:          r.plantilla_id,
      type:        r.tipo,
      scope:       r.ambito,
      category:    r.categoria,
      subcategory: r.subcategoria || '',
      description: r.descripcion  || '',
      amount:      parseAmount(r.importe),
      recurrence:  String(r.recurrencia || '').toLowerCase().trim(),
      frequency:   String(r.frecuencia  || '').toLowerCase().trim(),
      dayOfCharge: parseInt(r.dia_cobro, 10) || 1,
      start:       r.inicio   || '',
      next:        r.proxima  || '',
      status:      String(r.estado || 'activo').toLowerCase().trim()
    }));

    FT.tplLoaded = true;
    return FT.templates;
  },

  async loadCategories() {
    const { data, error } = await _initSb()
      .from('categorias')
      .select('*')
      .eq('estado', 'activo');

    sbCheck(error, 'loadCategories');

    FT.categories = (data || []).map(r => ({
      tipo:         r.tipo,
      categoria:    r.categoria,
      subcategoria: r.subcategoria || '',
      icono:        r.icono        || '',
      origen:       r.origen       || 'sistema',
      estado:       r.estado       || 'activo'
    }));

    FT.catsLoaded = true;
    return FT.categories;
  },

  _statusKey(year, month) {
    return `${year}-${month}`;
  },

  async loadStatusAccounts() {
    const { data, error } = await _initSb()
      .from('status_accounts')
      .select('*')
      .eq('estado', 'activo')
      .order('orden', { ascending: true });

    sbCheck(error, 'loadStatusAccounts');

    const uniq = {};
    FT.statusAccounts = (data || []).map(r => ({
      id:     r.cuenta_id,
      name:   r.nombre,
      type:   String(r.tipo   || '').toLowerCase().trim(),
      icon:   r.icono         || 'account_balance_wallet',
      order:  parseInt(r.orden, 10) || 9999,
      status: String(r.estado || 'activo').toLowerCase().trim()
    })).filter(a => {
      if (!a.id || uniq[a.id]) return false;
      uniq[a.id] = true;
      return true;
    });

    return FT.statusAccounts;
  },

  async fetchStatusMonth(year, month) {
    const key = this._statusKey(year, month);
    if (FT.statusCache[key]) return FT.statusCache[key];

    const { data, error } = await _initSb()
      .from('status_monthly')
      .select('*')
      .eq('year', year)
      .eq('month', month + 1)   // la app usa mes 0-based
      .eq('estado', 'activo');

    sbCheck(error, 'fetchStatusMonth');

    const items = (data || []).map(r => ({
      id:         r.status_id,
      year:       parseInt(r.year,  10) || year,
      month:      parseInt(r.month, 10) || (month + 1),
      accountId:  r.cuenta_id    || '',
      amount:     parseAmount(r.saldo),
      statusDate: r.fecha_status || '',
      status:     String(r.estado || 'activo').toLowerCase().trim()
    })).filter(x => x.status === 'activo');

    FT.statusCache[key] = items;
    return items;
  },

  async loadStatusMonth(year, month) {
    const entries = await this.fetchStatusMonth(year, month);
    FT.statusEntries = entries;
    return entries;
  },

  // Carga completa al arrancar
  async loadAll() {
    Cache.clearAll();
    FT.statusCache = {};

    const [monthData, templates, categories] = await Promise.all([
      this.loadMonth(FT.year, FT.month),
      this.loadTemplates(),
      this.loadCategories()
    ]);

    return { monthData, templates, categories };
  },

  // ===== WRITE: MOVIMIENTOS =====

  async addMovimiento(entry) {
    const now = new Date().toISOString();
    const { error } = await _initSb().from('movimientos').insert({
      id:           entry.id,
      fecha:        entry.fecha,
      tipo:         entry.tipo,
      ambito:       entry.ambito,
      categoria:    entry.categoria,
      subcategoria: entry.subcategoria  || '',
      descripcion:  entry.descripcion   || '',
      importe:      entry.importe,
      recurrencia:  entry.recurrencia   || '',
      frecuencia:   entry.frecuencia    || '',
      plantilla_id: entry.plantilla_id  || null,
      estado:       entry.estado        || 'activo',
      creado:       entry.creado        || now,
      modificado:   entry.modificado    || now
    });
    sbCheck(error, 'addMovimiento');

    // Actualización optimista
    FT.tx.push({
      id: entry.id, date: entry.fecha, type: entry.tipo,
      scope: entry.ambito, category: entry.categoria,
      subcategory: entry.subcategoria  || '',
      description: entry.descripcion   || '',
      amount:      parseAmount(entry.importe),
      recurrence:  String(entry.recurrencia || '').toLowerCase().trim(),
      frequency:   String(entry.frecuencia  || '').toLowerCase().trim(),
      templateId:  entry.plantilla_id  || '',
      status: 'activo', created: entry.creado || now, updated: entry.modificado || now
    });
    Cache.invalidateCurrent();
  },

  async updateMovimiento(id, fields) {
    const update = { modificado: fields.modificado || new Date().toISOString() };
    if (fields.descripcion  !== undefined) update.descripcion  = fields.descripcion;
    if (fields.importe      !== undefined) update.importe      = fields.importe;
    if (fields.fecha        !== undefined) update.fecha        = fields.fecha;
    if (fields.categoria    !== undefined) update.categoria    = fields.categoria;
    if (fields.subcategoria !== undefined) update.subcategoria = fields.subcategoria;

    const { error } = await _initSb()
      .from('movimientos').update(update).eq('id', id);
    sbCheck(error, 'updateMovimiento');

    const tx = FT.tx.find(t => t.id === id);
    if (tx) {
      if (fields.descripcion  !== undefined) tx.description = fields.descripcion;
      if (fields.importe      !== undefined) tx.amount      = parseAmount(fields.importe);
      if (fields.fecha        !== undefined) tx.date        = fields.fecha;
      if (fields.categoria    !== undefined) tx.category    = fields.categoria;
      if (fields.subcategoria !== undefined) tx.subcategory = fields.subcategoria;
      tx.updated = update.modificado;
    }
    Cache.invalidateCurrent();
  },

  async deleteMovimiento(id) {
    const { error } = await _initSb()
      .from('movimientos').delete().eq('id', id);
    sbCheck(error, 'deleteMovimiento');

    FT.tx = FT.tx.filter(t => t.id !== id);
    Cache.invalidateCurrent();
  },

  // ===== WRITE: PLANTILLAS =====

  async addTemplate(tpl) {
    const now = new Date().toISOString();
    const { error } = await _initSb().from('plantillas').insert({
      plantilla_id: tpl.plantilla_id,
      tipo:         tpl.tipo,
      ambito:       tpl.ambito,
      categoria:    tpl.categoria,
      subcategoria: tpl.subcategoria || '',
      descripcion:  tpl.descripcion  || '',
      importe:      tpl.importe,
      recurrencia:  tpl.recurrencia,
      frecuencia:   tpl.frecuencia,
      dia_cobro:    tpl.dia_cobro    || 1,
      inicio:       tpl.inicio       || null,
      proxima:      tpl.proxima      || null,
      estado:       tpl.estado       || 'activo',
      creado:       now
    });
    sbCheck(error, 'addTemplate');

    FT.templates.push({
      id: tpl.plantilla_id, type: tpl.tipo, scope: tpl.ambito,
      category: tpl.categoria, subcategory: tpl.subcategoria || '',
      description: tpl.descripcion || '', amount: parseAmount(tpl.importe),
      recurrence: String(tpl.recurrencia || '').toLowerCase().trim(),
      frequency:  String(tpl.frecuencia  || '').toLowerCase().trim(),
      dayOfCharge: tpl.dia_cobro || 1,
      start: tpl.inicio || '', next: tpl.proxima || '', status: 'activo'
    });
  },

  async updateTemplate(pid, fields) {
    const update = {};
    if (fields.descripcion  !== undefined) update.descripcion  = fields.descripcion;
    if (fields.importe      !== undefined) update.importe      = fields.importe;
    if (fields.categoria    !== undefined) update.categoria    = fields.categoria;
    if (fields.subcategoria !== undefined) update.subcategoria = fields.subcategoria;
    if (fields.frecuencia   !== undefined) update.frecuencia   = fields.frecuencia;
    if (fields.dia_cobro    !== undefined) update.dia_cobro    = fields.dia_cobro;
    if (fields.proxima      !== undefined) update.proxima      = fields.proxima;

    const { error } = await _initSb()
      .from('plantillas').update(update).eq('plantilla_id', pid);
    sbCheck(error, 'updateTemplate');

    const t = FT.templates.find(x => x.id === pid);
    if (t) {
      if (fields.descripcion  !== undefined) t.description = fields.descripcion;
      if (fields.importe      !== undefined) t.amount      = parseAmount(fields.importe);
      if (fields.categoria    !== undefined) t.category    = fields.categoria;
      if (fields.subcategoria !== undefined) t.subcategory = fields.subcategoria;
      if (fields.frecuencia   !== undefined) t.frequency   = fields.frecuencia;
      if (fields.proxima      !== undefined) t.next        = fields.proxima;
      if (fields.dia_cobro    !== undefined) t.dayOfCharge = fields.dia_cobro;
    }
  },

  async toggleTemplate(pid, activate) {
    const estado = activate ? 'activo' : 'pausado';
    const { error } = await _initSb()
      .from('plantillas').update({ estado }).eq('plantilla_id', pid);
    sbCheck(error, 'toggleTemplate');

    const t = FT.templates.find(x => x.id === pid);
    if (t) t.status = estado;
  },

  async deleteTemplate(pid) {
    const { error } = await _initSb()
      .from('plantillas').delete().eq('plantilla_id', pid);
    sbCheck(error, 'deleteTemplate');

    FT.templates = FT.templates.filter(x => x.id !== pid);
  },

  // ===== WRITE: CATEGORÍAS =====

  async addCategory(tipo, cat, sub, icon) {
    const { error } = await _initSb().from('categorias').insert({
      tipo, categoria: cat, subcategoria: sub,
      icono: icon, origen: 'usuario', estado: 'activo'
    });
    sbCheck(error, 'addCategory');

    FT.categories.push({
      tipo, categoria: cat, subcategoria: sub,
      icono: icon, origen: 'usuario', estado: 'activo'
    });
  },

  // ===== WRITE: STATUS =====

  async addStatusEntry(entry) {
    const { error } = await _initSb().from('status_monthly').insert({
      status_id:    entry.status_id,
      year:         entry.year,
      month:        entry.month,
      cuenta_id:    entry.cuenta_id,
      saldo:        entry.saldo,
      fecha_status: entry.fecha_status || null,
      estado:       entry.estado       || 'activo'
    });
    sbCheck(error, 'addStatusEntry');
    FT.statusCache = {};
  },

  async updateStatusEntry(id, fields) {
    const update = {};
    if (fields.saldo        !== undefined) update.saldo        = fields.saldo;
    if (fields.fecha_status !== undefined) update.fecha_status = fields.fecha_status;

    const { error } = await _initSb()
      .from('status_monthly').update(update).eq('status_id', id);
    sbCheck(error, 'updateStatusEntry');
    FT.statusCache = {};
  }
};
