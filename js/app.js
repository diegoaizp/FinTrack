// ===== FinTrack App Controller =====

const App = {
  _statusSeq: 0,

  async _withLoading(msg, fn) {
    UI.showGlobalLoading(msg);
    try {
      return await fn();
    } finally {
      UI.hideGlobalLoading();
    }
  },

  // ===== INIT =====
  async init() {
    const url = API.getUrl();
    if (url) document.getElementById('scriptUrl').value = url;
    document.getElementById('inputDate').value = todayStr();
    UI.updateMonthLabel();
    UI.updateInvMonthLabel();
    UI.updateStatusMonthLabel();

    if (url) {
      this.loadAll();
    } else {
      this.toggleConfig();
    }

    setTimeout(() => document.getElementById('inputAmount').focus(), 350);

    // Scroll shadow
    window.addEventListener('scroll', () => {
      document.getElementById('topBar').classList.toggle('scrolled', window.scrollY > 8);
    });

    // Enter key handlers
    document.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.id === 'customCatInput') this.addCustomCat();
      if (e.key === 'Enter' && e.target.id === 'customSubInput') this.addCustomSub();
    });
  },

  // ===== DATA LOADING =====
  async loadAll() {
    UI.showSkeleton('txList');
    UI.showGlobalLoading('Cargando categorías...');
    try {
      // Phase 1: unlock register form as soon as categories are ready.
      await API.loadCategories();
      UI.renderCats();
      UI.hideGlobalLoading();

      // Phase 2: load the rest in background.
      await Promise.all([
        API.loadMonth(FT.year, FT.month),
        API.loadTemplates()
      ]);
      UI.renderList();
      UI.updateSummary();
      UI.renderTemplates();
      UI.renderInvestments();
      await this.loadStatusData({ showGlobal: false, reloadAccounts: true }).catch(() => {});
      UI.snack('Datos actualizados');
    } catch (e) {
      UI.hideGlobalLoading();
      UI.showError('txList', 'Error al cargar datos.<br>Revisa la URL y el despliegue.');
    }
  },

  async loadCurrentMonth() {
    UI.showSkeleton('txList');
    await this._withLoading('Cargando historial...', async () => {
      try {
        await API.loadMonth(FT.year, FT.month);
        UI.renderList();
        UI.updateSummary();
      } catch (e) {
        UI.showError('txList', 'Error al cargar datos.');
      }
    });
  },

  // ===== CONFIG =====
  toggleConfig() {
    document.getElementById('configSheet').classList.toggle('show');
  },

  saveConfig() {
    const url = document.getElementById('scriptUrl').value.trim();
    if (!url) { UI.snack('Introduce una URL'); return; }
    API.setUrl(url);
    UI.snack('Guardado');
    this.toggleConfig();
    this.loadAll();
  },

  // ===== TABS =====
  goTab(t) {
    document.querySelectorAll('.bnav-item').forEach(n =>
      n.classList.toggle('active', n.dataset.t === t)
    );
    ['form', 'history', 'status', 'subs', 'invest', 'ytd'].forEach(s =>
      document.getElementById('sec-' + s)?.classList.toggle('show', s === t)
    );
    // Show/hide floating register button
    const registerBtn = document.getElementById('floatingRegister');
    if (registerBtn) registerBtn.style.display = t === 'form' ? 'flex' : 'none';
    // Show/hide bottom nav (hide on YTD page)
    const bnav = document.querySelector('.bottom-nav');
    if (bnav) bnav.style.display = t === 'ytd' ? 'none' : '';

    if (t === 'form') setTimeout(() => document.getElementById('inputAmount').focus(), 150);
    if (t === 'subs') UI.renderTemplates();
    if (t === 'invest') UI.renderInvestments();
    if (t === 'status') this.loadStatusData({ showGlobal: true });
  },

  // ===== TYPE =====
  setType(t) {
    FT.type = t;
    FT.cat = '';
    FT.sub = '';

    document.getElementById('segExp').className = 'seg-btn' + (t === 'Gasto' ? ' sel-exp' : '');
    document.getElementById('segInc').className = 'seg-btn' + (t === 'Ingreso' ? ' sel-inc' : '');
    document.getElementById('segInv').className = 'seg-btn' + (t === 'Inversión' ? ' sel-inv' : '');

    document.getElementById('scopeRow').style.display = t === 'Inversión' ? 'none' : '';
    document.getElementById('recBox').style.display = t === 'Ingreso' ? 'none' : '';
    document.getElementById('isRec').checked = false;
    this.toggleRec();

    UI.renderCats();
  },

  // ===== SCOPE =====
  setScope(s) {
    FT.scope = s;
    document.querySelectorAll('.scope-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.s === s)
    );
  },

  // ===== RECURRENCE =====
  toggleRec() {
    const on = document.getElementById('isRec').checked;
    document.getElementById('recOpts').classList.toggle('show', on);
    document.getElementById('recCheckRow').classList.toggle('has-opts', on);
  },

  setRecType(rt) {
    FT.recType = rt;
    document.querySelectorAll('.rec-type-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.rt === rt)
    );
  },

  setFreq(f) {
    FT.freq = f;
    document.querySelectorAll('.freq-btn[data-fq]').forEach(b =>
      b.classList.toggle('active', b.dataset.fq === f)
    );
  },

  // ===== CATEGORIES =====
  pickCat(c) {
    FT.cat = c;
    FT.sub = '';
    this.hideCustom();
    UI.renderCats();
  },

  pickSub(s) {
    FT.sub = s;
    document.getElementById('customSubRow').classList.remove('show');
    UI.renderSubcats();
  },

  showCustom(which) {
    const row = document.getElementById('custom' + which + 'Row');
    row.classList.toggle('show');
    if (row.classList.contains('show')) {
      document.getElementById('custom' + which + 'Input').focus();
    }
  },

  hideCustom() {
    document.getElementById('customCatRow').classList.remove('show');
    document.getElementById('customSubRow').classList.remove('show');
  },

  async addCustomCat() {
    const v = document.getElementById('customCatInput').value.trim();
    if (!v) return;
    const typeName = FT.type === 'Inversión' ? 'Inversión' : FT.type;
    try {
      await API.addCategory(typeName, v, 'General', 'label');
      FT.cat = v;
      FT.sub = '';
      document.getElementById('customCatInput').value = '';
      this.hideCustom();
      UI.renderCats();
      UI.snack('Categoría añadida');
    } catch (e) { UI.snack('Error'); }
  },

  async addCustomSub() {
    const v = document.getElementById('customSubInput').value.trim();
    if (!v) return;
    const typeName = FT.type === 'Inversión' ? 'Inversión' : FT.type;
    const icon = getCatsForType(FT.type)[FT.cat]?.icon || 'label';
    try {
      await API.addCategory(typeName, FT.cat, v, icon);
      FT.sub = v;
      document.getElementById('customSubInput').value = '';
      document.getElementById('customSubRow').classList.remove('show');
      UI.renderSubcats();
      UI.snack('Subcategoría añadida');
    } catch (e) { UI.snack('Error'); }
  },

  // ===== SUBMIT =====
  async submitEntry() {
    const url = API.getUrl();
    if (!url) { UI.snack('Configura la URL primero'); return; }

    const amount = parseAmount(document.getElementById('inputAmount').value);
    const desc = document.getElementById('inputDesc').value.trim();
    const date = document.getElementById('inputDate').value;
    const isRec = document.getElementById('isRec').checked;
    const day = parseInt(document.getElementById('inputDay').value) || 1;

    if (!amount || amount <= 0) { UI.snack('Introduce un importe'); return; }

    const btn = document.getElementById('floatingRegister');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Guardando...';

    const id = genId('m');
    const entry = {
      id,
      fecha: date,
      tipo: FT.type === 'Inversión' ? 'Inversión' : FT.type,
      ambito: FT.type === 'Inversión' ? 'Personal' : FT.scope,
      categoria: FT.cat,
      subcategoria: FT.sub,
      descripcion: desc,
      importe: amount,
      recurrencia: isRec ? FT.recType : '',
      frecuencia: isRec ? FT.freq : '',
      plantilla_id: '',
      estado: 'activo',
      creado: nowISO(),
      modificado: nowISO()
    };

    await this._withLoading('Guardando movimiento...', async () => {
      try {
        await API.addMovimiento(entry);

        // Create template if recurrent
        if (isRec) {
          const pid = genId('p');
          const tpl = {
            plantilla_id: pid,
            tipo: entry.tipo,
            ambito: entry.ambito,
            categoria: FT.cat,
            subcategoria: FT.sub,
            descripcion: desc,
            importe: amount,
            recurrencia: FT.recType,
            frecuencia: FT.freq,
            dia_cobro: day,
            inicio: date,
            proxima: calcNextDate(date, FT.freq),
            estado: 'activo',
            creado: nowISO()
          };
          await API.addTemplate(tpl);
        }

        UI.snack(FT.type + ' registrado');

        // Reset form
        document.getElementById('inputAmount').value = '';
        document.getElementById('inputDesc').value = '';
        document.getElementById('inputDate').value = todayStr();
        document.getElementById('isRec').checked = false;
        this.toggleRec();

        UI.renderList();
        UI.updateSummary();
        UI.renderInvestments();

        setTimeout(() => document.getElementById('inputAmount').focus(), 100);
      } catch (e) {
        UI.snack('Error al enviar');
      }
    });

    btn.disabled = false;
    btn.innerHTML = '<span class="msr">check</span> Registrar';
  },

  // ===== MONTH NAVIGATION =====
  async changeMonth(d) {
    FT.month += d;
    if (FT.month > 11) { FT.month = 0; FT.year++; }
    if (FT.month < 0) { FT.month = 11; FT.year--; }
    UI.updateMonthLabel();
    await this.loadCurrentMonth();
  },

  async changeInvMonth(d) {
    FT.invMonth += d;
    if (FT.invMonth > 11) { FT.invMonth = 0; FT.invYear++; }
    if (FT.invMonth < 0) { FT.invMonth = 11; FT.invYear--; }
    UI.updateInvMonthLabel();

    // Load investment month data
    await this._withLoading('Cargando inversiones...', async () => {
      try {
        await API.loadMonth(FT.invYear, FT.invMonth);
        UI.renderInvestments();
      } catch (e) {}
    });
  },

  async changeStatusMonth(d) {
    FT.statusMonth += d;
    if (FT.statusMonth > 11) { FT.statusMonth = 0; FT.statusYear++; }
    if (FT.statusMonth < 0) { FT.statusMonth = 11; FT.statusYear--; }
    UI.updateStatusMonthLabel();
    await this.loadStatusData({ showGlobal: true });
  },

  _isCurrentStatusMonth() {
    const now = new Date();
    return FT.statusYear === now.getFullYear() && FT.statusMonth === now.getMonth();
  },

  _latestEntryByAccount(entries) {
    const by = {};
    entries.forEach(e => {
      const prev = by[e.accountId];
      if (!prev) { by[e.accountId] = e; return; }
      const prevDate = Date.parse(prev.statusDate || '');
      const curDate = Date.parse(e.statusDate || '');
      if (!Number.isNaN(curDate) && (Number.isNaN(prevDate) || curDate >= prevDate)) {
        by[e.accountId] = e;
      }
    });
    return by;
  },

  _buildTrend(accountId, monthSeries, perMonthLatest) {
    let max = 0;
    const vals = monthSeries.map(m => {
      const e = perMonthLatest[`${m.y}-${m.m}`]?.[accountId];
      const v = e ? Number(e.amount || 0) : 0;
      max = Math.max(max, Math.abs(v));
      return v;
    });
    const top = max || 1;
    return vals.map(v => {
      const h = Math.max(3, Math.round((Math.abs(v) / top) * 16));
      const cls = v >= 0 ? 'up' : 'down';
      return `<span class="status-bar ${cls}" style="height:${h}px"></span>`;
    }).join('');
  },

  async loadStatusData(opts = {}) {
    const showGlobal = !!opts.showGlobal;
    const reloadAccounts = !!opts.reloadAccounts;
    const url = API.getUrl();
    if (!url) return;

    const seq = ++this._statusSeq;
    const loading = document.getElementById('statusLoading');
    if (loading) loading.style.display = '';
    if (showGlobal) UI.showGlobalLoading('Cargando status...');

    try {
      if (reloadAccounts || !FT.statusAccounts.length) {
        await API.loadStatusAccounts();
      }

      const monthSeries = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(FT.statusYear, FT.statusMonth - i, 1);
        monthSeries.push({ y: d.getFullYear(), m: d.getMonth() });
      }
      const reqs = monthSeries.map(m => API.fetchStatusMonth(m.y, m.m));
      const monthRows = await Promise.all(reqs);

      const perMonthLatest = {};
      monthSeries.forEach((m, idx) => {
        perMonthLatest[`${m.y}-${m.m}`] = this._latestEntryByAccount(monthRows[idx]);
      });
      if (seq !== this._statusSeq) return;

      const currentKey = `${FT.statusYear}-${FT.statusMonth}`;
      const currentEntries = perMonthLatest[currentKey]
        ? Object.values(perMonthLatest[currentKey])
        : [];
      FT.statusEntries = currentEntries;
      const currentLatest = perMonthLatest[currentKey] || {};

      const prevDate = new Date(FT.statusYear, FT.statusMonth - 1, 1);
      const prevKey = `${prevDate.getFullYear()}-${prevDate.getMonth()}`;
      const prevLatest = perMonthLatest[prevKey] || this._latestEntryByAccount(await API.fetchStatusMonth(prevDate.getFullYear(), prevDate.getMonth()));

      const usedIds = {};
      FT.statusAccounts.forEach(a => {
        if (usedIds[a.id]) {
          console.warn('Status account id duplicado:', a.id, a.name);
        }
        usedIds[a.id] = true;
      });

      const accountRows = FT.statusAccounts.map((a, idx) => ({
        ...a,
        _rowId: `${a.id}__${idx}`
      }));

      let total = 0;
      let lastDate = '';
      const rows = accountRows.map(a => {
        const curr = currentLatest[a.id] || null;
        const prev = prevLatest[a.id] || null;
        const amount = curr ? parseAmount(curr.amount) : 0;
        total += amount;
        if (curr && curr.statusDate && (!lastDate || curr.statusDate > lastDate)) lastDate = curr.statusDate;

        const hasPrev = !!prev;
        const prevAmount = hasPrev ? parseAmount(prev.amount) : 0;
        const delta = hasPrev ? (amount - prevAmount) : 0;
        const pct = hasPrev && prevAmount !== 0 ? ((delta / Math.abs(prevAmount)) * 100) : null;
        return {
          id: a._rowId,
          latestId: curr ? curr.id : '',
          name: a.name,
          icon: a.icon,
          typeLabel: UI.statusTypeLabel(a.type),
          amount,
          delta,
          deltaNA: !hasPrev,
          deltaPct: pct === null ? 'N/A' : pct.toFixed(1),
          trendHtml: this._buildTrend(a.id, monthSeries, perMonthLatest)
        };
      });

      if (seq !== this._statusSeq) return;
      UI.renderStatus({
        total,
        lastDate,
        canCreate: this._isCurrentStatusMonth(),
        rows
      });
    } catch (e) {
      const list = document.getElementById('statusList');
      if (list) list.innerHTML = `<div class="empty"><span class="msr">warning</span><p>${e.message || 'Error al cargar status.'}</p></div>`;
    } finally {
      if (loading) loading.style.display = 'none';
      if (showGlobal) UI.hideGlobalLoading();
    }
  },

  // ===== FILTERS =====
  setFilter(f) {
    FT.filter = f;
    document.querySelectorAll('.fchip[data-f]').forEach(b =>
      b.classList.toggle('active', b.dataset.f === f)
    );
    UI.renderList();
  },

  setSubFilter(f) {
    FT.subFilter = f;
    FT.subCycleFilter = 'all';
    document.querySelectorAll('.fchip[data-sf]').forEach(b =>
      b.classList.toggle('active', b.dataset.sf === f)
    );
    // Show/hide cycle sub-filter
    const cycleRow = document.getElementById('subsCycleFilter');
    cycleRow.style.display = f !== 'all' ? '' : 'none';
    // Reset cycle chips
    document.querySelectorAll('.fchip[data-cf]').forEach(b =>
      b.classList.toggle('active', b.dataset.cf === 'all')
    );
    UI.renderTemplates();
  },

  setSubCycleFilter(f) {
    FT.subCycleFilter = f;
    document.querySelectorAll('.fchip[data-cf]').forEach(b =>
      b.classList.toggle('active', b.dataset.cf === f)
    );
    UI.renderTemplates();
  },

  // ===== EDIT =====
  openEdit(id) {
    const tx = FT.tx.find(t => t.id === id);
    if (!tx) return;
    UI.openEditModal(tx);
  },

  closeEdit() {
    UI.closeEditModal();
  },

  pickEditCat(c) {
    UI._editCat = c;
    UI._editSub = '';
    const type = document.getElementById('editType').value;
    UI.renderEditCats(type);
  },

  pickEditSub(s) {
    UI._editSub = s;
    const type = document.getElementById('editType').value;
    UI.renderEditSubcats(type);
  },

  async saveEdit() {
    const id = document.getElementById('editId').value;
    const desc = document.getElementById('editDesc').value.trim();
    const amount = parseAmount(document.getElementById('editAmount').value);
    const date = document.getElementById('editDate').value;

    if (!amount) { UI.snack('Introduce un importe'); return; }

    await this._withLoading('Guardando cambios...', async () => {
      try {
        await API.updateMovimiento(id, {
          descripcion: desc,
          importe: amount,
          fecha: date,
          categoria: UI._editCat,
          subcategoria: UI._editSub,
          modificado: nowISO()
        });
        UI.closeEditModal();
        UI.renderList();
        UI.updateSummary();
        UI.renderInvestments();
        UI.snack('Movimiento actualizado');
      } catch (e) { UI.snack('Error al guardar'); }
    });
  },

  // ===== DELETE =====
  async deleteEntry(id) {
    if (!confirm('¿Eliminar este movimiento?')) return;
    await this._withLoading('Eliminando movimiento...', async () => {
      try {
        await API.deleteMovimiento(id);
        UI.renderList();
        UI.updateSummary();
        UI.renderInvestments();
        UI.snack('Movimiento eliminado');
      } catch (e) { UI.snack('Error al eliminar'); }
    });
  },

  // ===== YTD BALANCE =====
  async openYTD() {
    this.goTab('ytd');
    const year = FT.year;
    document.getElementById('ytdYear').textContent = year;
    document.getElementById('ytdLoading').style.display = '';
    document.getElementById('ytdExpCats').innerHTML = '';
    document.getElementById('ytdIncCats').innerHTML = '';
    document.getElementById('ytdBalance').textContent = '0,00€';
    document.getElementById('ytdInc').textContent = '0,00€';
    document.getElementById('ytdExp').textContent = '0,00€';

    await this._withLoading('Cargando balance YTD...', async () => {
      try {
        // Load all months for the year
        const allTx = [];
        const url = API.getUrl();
        if (!url) { UI.snack('Configura la URL primero'); return; }

        // Load each month Jan–current
        const currentMonth = new Date().getFullYear() === year ? new Date().getMonth() : 11;
        const promises = [];
        for (let m = 0; m <= currentMonth; m++) {
          promises.push(
            fetch(`${url}?action=getMonth&year=${year}&month=${m + 1}`)
              .then(r => r.json())
              .then(rows => (rows || []).map(r => ({
                type: r[2], category: r[4], subcategory: r[5] || '',
                amount: parseAmount(r[7]), status: String(r[11] || 'activo').toLowerCase().trim()
              })).filter(t => t.status === 'activo'))
          );
        }
        const results = await Promise.all(promises);
        results.forEach(items => allTx.push(...items));

        // Calculate totals
        const incTx = allTx.filter(t => t.type === 'Ingreso');
        const expTx = allTx.filter(t => t.type === 'Gasto');
        const totalInc = incTx.reduce((s, t) => s + t.amount, 0);
        const totalExp = expTx.reduce((s, t) => s + t.amount, 0);
        const bal = totalInc - totalExp;

        document.getElementById('ytdInc').textContent = formatEUR(totalInc);
        document.getElementById('ytdExp').textContent = formatEUR(totalExp);
        const bEl = document.getElementById('ytdBalance');
        bEl.textContent = formatSignedEUR(bal);
        bEl.className = 'bh-val num-lg ' + (bal > 0 ? 'positive' : bal < 0 ? 'negative' : '');

        // Group by category
        UI.renderYTDCategories(expTx, 'ytdExpCats', 'exp');
        UI.renderYTDCategories(incTx, 'ytdIncCats', 'inc');
      } catch (e) {
        UI.snack('Error al cargar datos YTD');
      }
    });
    document.getElementById('ytdLoading').style.display = 'none';
  },

  closeYTD() {
    this.goTab('history');
  },

  // ===== TEMPLATES =====
  async pauseTemplate(pid) {
    if (!confirm('¿Pausar esta recurrencia?')) return;
    await this._withLoading('Actualizando recurrencia...', async () => {
      try {
        await API.toggleTemplate(pid, false);
        UI.renderList();
        UI.renderTemplates();
        UI.snack('Recurrencia pausada');
      } catch (e) { UI.snack('Error'); }
    });
  },

  async toggleTemplate(pid) {
    const t = FT.templates.find(x => x.id === pid);
    if (!t) return;
    const activate = t.status !== 'activo';
    await this._withLoading('Actualizando recurrencia...', async () => {
      try {
        await API.toggleTemplate(pid, activate);
        UI.renderTemplates();
        UI.snack(activate ? 'Recurrencia activada' : 'Recurrencia pausada');
      } catch (e) { UI.snack('Error'); }
    });
  },

  // ===== EDIT TEMPLATE =====
  _editTplFreq: 'mensual',

  openEditTemplate(pid) {
    const t = FT.templates.find(x => x.id === pid);
    if (!t) return;
    document.getElementById('editTplId').value = t.id;
    document.getElementById('editTplDesc').value = t.description || '';
    document.getElementById('editTplAmount').value = t.amount;
    document.getElementById('editTplDay').value = t.dayOfCharge || 1;
    this._editTplFreq = t.frequency || 'mensual';
    document.querySelectorAll('#editTplFreqRow .freq-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.efq === this._editTplFreq)
    );
    document.getElementById('editTplModal').classList.add('show');
  },

  closeEditTemplate() {
    document.getElementById('editTplModal').classList.remove('show');
  },

  setEditTplFreq(f) {
    this._editTplFreq = f;
    document.querySelectorAll('#editTplFreqRow .freq-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.efq === f)
    );
  },

  async saveEditTemplate() {
    const pid = document.getElementById('editTplId').value;
    const desc = document.getElementById('editTplDesc').value.trim();
    const amount = parseAmount(document.getElementById('editTplAmount').value);
    const day = parseInt(document.getElementById('editTplDay').value) || 1;

    if (!amount) { UI.snack('Introduce un importe'); return; }

    await this._withLoading('Guardando recurrencia...', async () => {
      try {
        await API.updateTemplate(pid, {
          descripcion: desc,
          importe: amount,
          frecuencia: this._editTplFreq,
          dia_cobro: day
        });
        this.closeEditTemplate();
        UI.renderTemplates();
        UI.snack('Recurrencia actualizada');
      } catch (e) { UI.snack('Error al guardar'); }
    });
  },

  async deleteTemplate(pid) {
    if (!confirm('¿Eliminar esta recurrencia?')) return;
    await this._withLoading('Eliminando recurrencia...', async () => {
      try {
        await API.deleteTemplate(pid);
        UI.renderTemplates();
        UI.snack('Recurrencia eliminada');
      } catch (e) { UI.snack('Error al eliminar'); }
    });
  },

  // ===== STATUS =====
  openStatusAdd() {
    if (!this._isCurrentStatusMonth()) {
      UI.snack('Solo puedes crear status en el mes actual');
      return;
    }
    UI.renderStatusForm(FT.statusAccounts);
    document.getElementById('statusAddDate').value = todayStr();
    document.getElementById('statusAddModal').classList.add('show');
  },

  closeStatusAdd() {
    document.getElementById('statusAddModal').classList.remove('show');
  },

  async saveStatusAdd() {
    const date = document.getElementById('statusAddDate').value || todayStr();
    const fields = Array.from(document.querySelectorAll('[data-status-account]'));
    const items = fields.map(f => ({
      accountId: f.dataset.statusAccount,
      amount: parseAmount(f.value || 0)
    }));

    await this._withLoading('Guardando status...', async () => {
      try {
        await Promise.all(items.map(item => API.addStatusEntry({
          status_id: genId('s'),
          year: FT.statusYear,
          month: FT.statusMonth + 1,
          cuenta_id: item.accountId,
          saldo: item.amount,
          ha_stat: date,
          estado: 'activo'
        })));
        this.closeStatusAdd();
        await this.loadStatusData({ showGlobal: false });
        UI.snack('Status guardado');
      } catch (e) {
        UI.snack('Error al guardar status');
      }
    });
  },

  openEditStatus(id) {
    const e = FT.statusEntries.find(x => x.id === id);
    if (!e) return;
    document.getElementById('statusEditId').value = e.id;
    document.getElementById('statusEditAmount').value = e.amount;
    document.getElementById('statusEditDate').value = e.statusDate || todayStr();
    document.getElementById('statusEditModal').classList.add('show');
  },

  closeEditStatus() {
    document.getElementById('statusEditModal').classList.remove('show');
  },

  async saveEditStatus() {
    const id = document.getElementById('statusEditId').value;
    const amount = parseAmount(document.getElementById('statusEditAmount').value || 0);
    const date = document.getElementById('statusEditDate').value || todayStr();
    await this._withLoading('Actualizando status...', async () => {
      try {
        await API.updateStatusEntry(id, { saldo: amount, ha_stat: date });
        this.closeEditStatus();
        await this.loadStatusData({ showGlobal: false });
        UI.snack('Status actualizado');
      } catch (e) {
        UI.snack('Error al actualizar status');
      }
    });
  }
};

// ===== BOOT =====
document.addEventListener('DOMContentLoaded', () => App.init());
