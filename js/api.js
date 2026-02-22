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

  async loadMonth(year, month) {
    const url = this.getUrl();
    if (!url) return null;

    // Check cache first
    const cached = Cache.get(year, month);
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
      description: r[6] || '', amount: parseFloat(r[7]) || 0,
      recurrence: r[8] || '', frequency: r[9] || '',
      templateId: r[10] || '', status: r[11] || 'activo'
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
      amount: parseFloat(r[6]) || 0, recurrence: r[7],
      frequency: r[8], dayOfCharge: parseInt(r[9]) || 1,
      start: r[10], next: r[11], status: r[12] || 'activo'
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

  // Load everything needed on startup (always fresh, bypass cache)
  async loadAll() {
    const url = this.getUrl();
    if (!url) throw new Error('No URL');

    // Clear ALL cache to force fresh data from server
    Cache.clearAll();

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
      amount: entry.importe, recurrence: entry.recurrencia || '',
      frequency: entry.frecuencia || '', templateId: entry.plantilla_id || '',
      status: 'activo'
    });
    Cache.invalidateCurrent();
  },

  async addTemplate(tpl) {
    await this.post({ action: 'addTemplate', ...tpl });
    // Optimistic update
    FT.templates.push({
      id: tpl.plantilla_id, type: tpl.tipo, scope: tpl.ambito,
      category: tpl.categoria, subcategory: tpl.subcategoria,
      description: tpl.descripcion, amount: tpl.importe,
      recurrence: tpl.recurrencia, frequency: tpl.frecuencia,
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
      if (fields.importe !== undefined) tx.amount = fields.importe;
      if (fields.fecha !== undefined) tx.date = fields.fecha;
      if (fields.categoria !== undefined) tx.category = fields.categoria;
      if (fields.subcategoria !== undefined) tx.subcategory = fields.subcategoria;
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
  }
};
