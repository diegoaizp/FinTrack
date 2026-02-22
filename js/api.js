// ===== FinTrack API Module =====

const API = {
  _expectArray(rows, label) {
    if (Array.isArray(rows)) return rows;
    const msg = rows && rows.error ? rows.error : `Respuesta inválida en ${label}`;
    throw new Error(msg);
  },

  getUrl() {
    return localStorage.getItem('ft_url') || '';
  },

  setUrl(url) {
    localStorage.setItem('ft_url', url);
  },

  // ===== READ =====

  async loadMonth(year, month, force = false) {
    const url = this.getUrl();
    if (!url) return null;

    // Check cache first
    const cached = force ? null : Cache.get(year, month);
    if (cached) {
      FT.tx = cached;
      return cached;
    }

    const res = await fetch(`${url}?action=getMonth&year=${year}&month=${month + 1}`);
    const raw = await res.json();
    const rows = this._expectArray(raw, 'getMonth');

    const items = (rows || []).map(r => ({
      id: r[0], date: r[1], type: r[2], scope: r[3],
      category: r[4], subcategory: r[5] || '',
      description: r[6] || '', amount: parseAmount(r[7]),
      recurrence: String(r[8] || '').toLowerCase().trim(),
      frequency: String(r[9] || '').toLowerCase().trim(),
      templateId: r[10] || '', status: String(r[11] || 'activo').toLowerCase().trim(),
      created: r[12] || '', updated: r[13] || ''
    })).filter(t => t.status === 'activo');

    Cache.set(year, month, items);
    FT.tx = items;
    return items;
  },

  async loadTemplates() {
    const url = this.getUrl();
    if (!url) return null;
    const res = await fetch(`${url}?action=getTemplates`);
    const raw = await res.json();
    const rows = this._expectArray(raw, 'getTemplates');

    FT.templates = (rows || []).map(r => ({
      id: r[0], type: r[1], scope: r[2], category: r[3],
      subcategory: r[4], description: r[5],
      amount: parseAmount(r[6]),
      recurrence: String(r[7] || '').toLowerCase().trim(),
      frequency: String(r[8] || '').toLowerCase().trim(),
      dayOfCharge: parseInt(r[9], 10) || 1,
      start: r[10], next: r[11], status: String(r[12] || 'activo').toLowerCase().trim()
    }));

    FT.tplLoaded = true;
    return FT.templates;
  },

  async loadCategories() {
    const url = this.getUrl();
    if (!url) return null;
    const res = await fetch(`${url}?action=getCategories`);
    const raw = await res.json();
    const rows = this._expectArray(raw, 'getCategories');

    FT.categories = (rows || []).map(r => ({
      tipo: r[0], categoria: r[1], subcategoria: r[2],
      icono: r[3], origen: r[4], estado: r[5] || 'activo'
    }));

    FT.catsLoaded = true;
    return FT.categories;
  },

  _statusKey(year, month) {
    return `${year}-${month}`;
  },

  async loadStatusAccounts() {
    const url = this.getUrl();
    if (!url) return [];
    const res = await fetch(`${url}?action=getStatusAccounts`);
    const raw = await res.json();
    const rows = this._expectArray(raw, 'getStatusAccounts');

    const active = (rows || []).map(r => ({
      id: String(r[0] || ''),
      name: String(r[1] || ''),
      type: String(r[2] || '').toLowerCase().trim(),
      icon: String(r[3] || 'account_balance_wallet'),
      order: parseInt(r[4], 10) || 9999,
      status: String(r[5] || 'activo').toLowerCase().trim()
    })).filter(a => a.id && a.status === 'activo')
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

    const uniq = {};
    FT.statusAccounts = active.filter(a => {
      if (uniq[a.id]) return false;
      uniq[a.id] = true;
      return true;
    });

    return FT.statusAccounts;
  },

  async fetchStatusMonth(year, month) {
    const key = this._statusKey(year, month);
    if (FT.statusCache[key]) return FT.statusCache[key];

    const url = this.getUrl();
    if (!url) return [];
    const res = await fetch(`${url}?action=getStatusMonth&year=${year}&month=${month + 1}`);
    const raw = await res.json();
    const rows = this._expectArray(raw, 'getStatusMonth');

    const items = (rows || []).map(r => ({
      id: String(r[0] || ''),
      year: parseInt(r[1], 10) || year,
      month: parseInt(r[2], 10) || (month + 1),
      accountId: String(r[3] || ''),
      amount: parseAmount(r[4]),
      statusDate: String(r[5] || ''),
      status: String(r[6] || 'activo').toLowerCase().trim()
    })).filter(x => x.status === 'activo');

    FT.statusCache[key] = items;
    return items;
  },

  async loadStatusMonth(year, month) {
    const entries = await this.fetchStatusMonth(year, month);
    FT.statusEntries = entries;
    return entries;
  },

  // Load everything needed on startup (always fresh, bypass cache)
  async loadAll() {
    const url = this.getUrl();
    if (!url) throw new Error('No URL');

    // Clear ALL cache to force fresh data from server
    Cache.clearAll();
    FT.statusCache = {};

    // Parallel load
    const [monthData, templates, categories] = await Promise.all([
      this.loadMonth(FT.year, FT.month),
      this.loadTemplates(),
      this.loadCategories()
    ]);

    return { monthData, templates, categories };
  },

  // ===== WRITE =====

  async post(data) {
    const url = this.getUrl();
    if (!url) throw new Error('No URL');
    await fetch(url, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(data)
    });
  },

  async addMovimiento(entry) {
    await this.post({ action: 'add', ...entry });
    // Optimistic update
    FT.tx.push({
      id: entry.id, date: entry.fecha, type: entry.tipo,
      scope: entry.ambito, category: entry.categoria,
      subcategory: entry.subcategoria, description: entry.descripcion,
      amount: parseAmount(entry.importe),
      recurrence: String(entry.recurrencia || '').toLowerCase().trim(),
      frequency: String(entry.frecuencia || '').toLowerCase().trim(),
      templateId: entry.plantilla_id || '',
      status: 'activo', created: entry.creado || '', updated: entry.modificado || ''
    });
    Cache.invalidateCurrent();
  },

  async addTemplate(tpl) {
    await this.post({ action: 'addTemplate', ...tpl });
    // Optimistic update
    FT.templates.push({
      id: tpl.plantilla_id, type: tpl.tipo, scope: tpl.ambito,
      category: tpl.categoria, subcategory: tpl.subcategoria,
      description: tpl.descripcion, amount: parseAmount(tpl.importe),
      recurrence: String(tpl.recurrencia || '').toLowerCase().trim(),
      frequency: String(tpl.frecuencia || '').toLowerCase().trim(),
      dayOfCharge: tpl.dia_cobro, start: tpl.inicio,
      next: tpl.proxima, status: 'activo'
    });
  },

  async addCategory(tipo, cat, sub, icon) {
    await this.post({
      action: 'addCategory',
      tipo, categoria: cat, subcategoria: sub, icono: icon
    });
    // Optimistic update
    FT.categories.push({
      tipo, categoria: cat, subcategoria: sub,
      icono: icon, origen: 'usuario', estado: 'activo'
    });
  },

  async updateMovimiento(id, fields) {
    await this.post({ action: 'update', id, ...fields });
    // Optimistic update
    const tx = FT.tx.find(t => t.id === id);
    if (tx) {
      if (fields.descripcion !== undefined) tx.description = fields.descripcion;
      if (fields.importe !== undefined) tx.amount = parseAmount(fields.importe);
      if (fields.fecha !== undefined) tx.date = fields.fecha;
      if (fields.categoria !== undefined) tx.category = fields.categoria;
      if (fields.subcategoria !== undefined) tx.subcategory = fields.subcategoria;
      if (fields.modificado !== undefined) tx.updated = fields.modificado;
    }
    Cache.invalidateCurrent();
  },

  async deleteMovimiento(id) {
    await this.post({ action: 'delete', id });
    FT.tx = FT.tx.filter(t => t.id !== id);
    Cache.invalidateCurrent();
  },

  async toggleTemplate(pid, activate) {
    const action = activate ? 'activateTemplate' : 'pauseTemplate';
    await this.post({ action, plantilla_id: pid });
    const t = FT.templates.find(x => x.id === pid);
    if (t) t.status = activate ? 'activo' : 'pausado';
  },

  async updateTemplate(pid, fields) {
    await this.post({ action: 'updateTemplate', plantilla_id: pid, ...fields });
    const t = FT.templates.find(x => x.id === pid);
    if (t) {
      if (fields.descripcion !== undefined) t.description = fields.descripcion;
      if (fields.importe !== undefined) t.amount = fields.importe;
      if (fields.categoria !== undefined) t.category = fields.categoria;
      if (fields.subcategoria !== undefined) t.subcategory = fields.subcategoria;
      if (fields.frecuencia !== undefined) t.frequency = fields.frecuencia;
      if (fields.dia_cobro !== undefined) t.dayOfCharge = fields.dia_cobro;
    }
  },

  async deleteTemplate(pid) {
    await this.post({ action: 'deleteTemplate', plantilla_id: pid });
    FT.templates = FT.templates.filter(x => x.id !== pid);
  },

  async addStatusEntry(entry) {
    await this.post({ action: 'addStatusEntry', ...entry });
    FT.statusCache = {};
  },

  async updateStatusEntry(id, fields) {
    await this.post({ action: 'updateStatusEntry', status_id: id, ...fields });
    FT.statusCache = {};
  }
};
