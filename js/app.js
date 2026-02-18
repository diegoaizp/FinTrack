// ===== FinTrack App Controller =====

const App = {

  // ===== INIT =====
  async init() {
    const url = API.getUrl();
    if (url) document.getElementById('scriptUrl').value = url;
    document.getElementById('inputDate').value = todayStr();
    UI.updateMonthLabel();
    UI.updateInvMonthLabel();
    this.updateSyncStatusFromStorage();
    this.registerServiceWorker();
    this.applyHashRoute();
    window.addEventListener('hashchange', () => this.applyHashRoute());

    if (url) {
      this.loadAll(false);
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
  async loadAll(force = false) {
    UI.showSkeleton('txList');
    UI.setSyncStatus('syncing', 'Sincronizando...');
    try {
      await API.loadAll(force);
      UI.renderCats();
      UI.renderList();
      UI.updateSummary();
      UI.renderTemplates();
      UI.renderInvestments();
      await this.loadMonthlyInsights();
      this.markSyncSuccess();
      UI.snack('Datos actualizados');
    } catch (e) {
      UI.setSyncStatus('error', 'Error de sincronización');
      UI.showError('txList', 'Error al cargar datos.<br>Revisa la URL y el despliegue.');
    }
  },

  async loadCurrentMonth(force = false) {
    UI.showSkeleton('txList');
    UI.setSyncStatus('syncing', 'Sincronizando...');
    try {
      await API.loadMonth(FT.year, FT.month, force);
      UI.renderList();
      UI.updateSummary();
      await this.loadMonthlyInsights();
      this.markSyncSuccess();
    } catch (e) {
      UI.setSyncStatus('error', 'Error de sincronización');
      UI.showError('txList', 'Error al cargar datos.');
    }
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
    this.loadAll(true);
  },

  async syncTemplatesFromBackend() {
    try {
      await API.loadTemplates();
    } catch (e) {
      // Keep optimistic state if backend read fails
    }
    UI.renderTemplates();
  },

  registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // Fail silently; app should work without SW.
    });
  },

  tabFromHash(hash) {
    const key = (hash || '').replace('#', '').trim().toLowerCase();
    const map = {
      form: 'form',
      history: 'history',
      historial: 'history',
      status: 'history',
      subs: 'subs',
      recurrentes: 'subs',
      invest: 'invest',
      inversion: 'invest',
      inversiones: 'invest',
      ytd: 'ytd',
      forecast: 'forecast',
      prediccion: 'forecast'
    };
    return map[key] || 'form';
  },

  applyHashRoute() {
    const tab = this.tabFromHash(window.location.hash);
    this.goTab(tab, false);
  },

  updateSyncStatusFromStorage() {
    const raw = localStorage.getItem('ft_last_sync');
    if (!raw) {
      UI.setSyncStatus('ok', 'Sin sincronizar');
      return;
    }
    const ts = parseInt(raw, 10);
    if (!ts) {
      UI.setSyncStatus('ok', 'Sin sincronizar');
      return;
    }
    UI.setSyncStatus('ok', 'Última sync: ' + this._formatTime(ts));
  },

  markSyncSuccess() {
    const ts = Date.now();
    localStorage.setItem('ft_last_sync', String(ts));
    UI.setSyncStatus('ok', 'Última sync: ' + this._formatTime(ts));
  },

  _formatTime(ts) {
    try {
      return new Date(ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return '--:--';
    }
  },

  async fetchMonthTx(year, month) {
    const url = API.getUrl();
    if (!url) return [];
    const rows = await fetch(`${url}?action=getMonth&year=${year}&month=${month + 1}`).then(r => r.json());
    return (rows || []).map(r => ({
      type: r[2],
      scope: r[3],
      category: r[4],
      amount: parseFloat(r[7]) || 0,
      status: String(r[11] || 'activo').toLowerCase().trim()
    })).filter(t => t.status === 'activo' && t.type !== 'Inversión');
  },

  async loadMonthlyInsights() {
    const curr = FT.tx.filter(tx => {
      const d = new Date(tx.date);
      return d.getMonth() === FT.month && d.getFullYear() === FT.year && tx.type !== 'Inversión';
    });

    const out = [];

    const currGastoByCat = {};
    curr.filter(x => x.type === 'Gasto').forEach(x => {
      currGastoByCat[x.category] = (currGastoByCat[x.category] || 0) + x.amount;
    });
    const topCat = Object.entries(currGastoByCat).sort((a, b) => b[1] - a[1])[0];
    if (topCat) out.push({ icon: 'category', text: `Mayor gasto del mes: ${topCat[0]} (${fmtMoney(topCat[1])}).` });
    else out.push({ icon: 'category', text: 'No hay gastos este mes para calcular categoría principal.' });

    const prevDate = new Date(FT.year, FT.month - 1, 1);
    try {
      const prev = await this.fetchMonthTx(prevDate.getFullYear(), prevDate.getMonth());
      const currExp = curr.filter(x => x.type === 'Gasto').reduce((s, x) => s + x.amount, 0);
      const prevExp = prev.filter(x => x.type === 'Gasto').reduce((s, x) => s + x.amount, 0);
      const diff = prevExp - currExp;
      if (diff > 0) out.push({ icon: 'savings', text: `Has ahorrado ${fmtMoney(diff)} frente a ${MONTHS[prevDate.getMonth()]}.` });
      else if (diff < 0) out.push({ icon: 'trending_up', text: `Gastaste ${fmtMoneyAbs(diff)} más que en ${MONTHS[prevDate.getMonth()]}.` });
      else out.push({ icon: 'balance', text: `Gasto igual que en ${MONTHS[prevDate.getMonth()]}.` });
    } catch (e) {
      out.push({ icon: 'savings', text: 'No se pudo comparar con el mes anterior.' });
    }

    const currExp = curr.filter(x => x.type === 'Gasto').reduce((s, x) => s + x.amount, 0);
    const fixedEstimate = FT.templates
      .filter(t => t.status === 'activo' && t.type === 'Gasto')
      .reduce((s, t) => s + monthlyAmount(t), 0);
    const variableEstimate = Math.max(currExp - fixedEstimate, 0);
    out.push({
      icon: 'stacked_line_chart',
      text: `Composición del gasto: fijo estimado ${fmtMoney(fixedEstimate)} y variable ${fmtMoney(variableEstimate)} en ${MONTHS[FT.month]}.`
    });

    UI.renderMonthlyInsights(out.slice(0, 3));
  },

  // ===== TABS =====
  goTab(t, updateHash = true) {
    document.querySelectorAll('.bnav-item').forEach(n =>
      n.classList.toggle('active', n.dataset.t === t)
    );
    ['form', 'history', 'subs', 'invest', 'ytd', 'forecast'].forEach(s =>
      document.getElementById('sec-' + s).classList.toggle('show', s === t)
    );
    // Show/hide floating register button
    document.getElementById('floatingRegister').style.display = t === 'form' ? 'flex' : 'none';
    // Show/hide bottom nav (hide on YTD page)
    document.querySelector('.bottom-nav').style.display = (t === 'ytd' || t === 'forecast') ? 'none' : '';

    if (t === 'form') setTimeout(() => document.getElementById('inputAmount').focus(), 150);
    if (t === 'subs') UI.renderTemplates();
    if (t === 'invest') UI.renderInvestments();

    if (updateHash) {
      const expected = '#' + t;
      if (window.location.hash !== expected) history.replaceState(null, '', expected);
    }
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
    document.querySelectorAll('.freq-btn').forEach(b =>
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

    const amount = parseFloat(document.getElementById('inputAmount').value);
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
        await this.syncTemplatesFromBackend();
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
      this.loadMonthlyInsights();

      setTimeout(() => document.getElementById('inputAmount').focus(), 100);
    } catch (e) {
      UI.snack('Error al enviar');
    }

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
    try {
      await API.loadMonth(FT.invYear, FT.invMonth);
      UI.renderInvestments();
    } catch (e) {}
  },

  // ===== FILTERS =====
  setFilter(f) {
    FT.filter = f;
    document.querySelectorAll('.fchip[data-f]').forEach(b =>
      b.classList.toggle('active', b.dataset.f === f)
    );
    UI.renderList();
  },

  toggleHistoryCategoryFilter() {
    FT.historyCatSummaryEnabled = !FT.historyCatSummaryEnabled;
    document.querySelectorAll('.fchip[data-hf]').forEach(b =>
      b.classList.toggle('active', FT.historyCatSummaryEnabled)
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
    const amount = parseFloat(document.getElementById('editAmount').value);
    const date = document.getElementById('editDate').value;

    if (!amount) { UI.snack('Introduce un importe'); return; }

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
      this.loadMonthlyInsights();
      UI.snack('Movimiento actualizado');
    } catch (e) { UI.snack('Error al guardar'); }
  },

  // ===== DELETE =====
  async deleteEntry(id) {
    if (!confirm('¿Eliminar este movimiento?')) return;
    try {
      await API.deleteMovimiento(id);
      UI.renderList();
      UI.updateSummary();
      UI.renderInvestments();
      this.loadMonthlyInsights();
      UI.snack('Movimiento eliminado');
    } catch (e) { UI.snack('Error al eliminar'); }
  },

  // ===== YTD BALANCE =====
  async openYTD() {
    this.goTab('ytd');
    const year = FT.year;
    document.getElementById('ytdYear').textContent = year;
    document.getElementById('ytdLoading').style.display = '';
    document.getElementById('ytdExpCats').innerHTML = '';
    document.getElementById('ytdIncCats').innerHTML = '';
    document.getElementById('ytdBalance').textContent = fmtMoney(0);
    document.getElementById('ytdInc').textContent = fmtMoney(0);
    document.getElementById('ytdExp').textContent = fmtMoney(0);

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
              amount: parseFloat(r[7]) || 0, status: r[11] || 'activo'
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

      document.getElementById('ytdInc').textContent = fmtMoney(totalInc);
      document.getElementById('ytdExp').textContent = fmtMoney(totalExp);
      const bEl = document.getElementById('ytdBalance');
      bEl.textContent = fmtMoneySigned(bal);
      bEl.className = 'bh-val num-lg ' + (bal > 0 ? 'positive' : bal < 0 ? 'negative' : '');

      // Group by category
      UI.renderYTDCategories(expTx, 'ytdExpCats', 'exp');
      UI.renderYTDCategories(incTx, 'ytdIncCats', 'inc');
    } catch (e) {
      UI.snack('Error al cargar datos YTD');
    }
    document.getElementById('ytdLoading').style.display = 'none';
  },

  closeYTD() {
    this.goTab('history');
  },

  // ===== NEXT MONTH PREDICTION (AVERAGE) =====
  async openForecast() {
    this.goTab('forecast');

    const loading = document.getElementById('forecastLoading');
    const list = document.getElementById('forecastMonths');
    const label = document.getElementById('forecastMonthLabel');
    const info = document.getElementById('forecastInfo');
    const incEl = document.getElementById('forecastInc');
    const expEl = document.getElementById('forecastExp');
    const balEl = document.getElementById('forecastBalance');

    list.innerHTML = '';
    info.textContent = '';
    incEl.textContent = fmtMoney(0);
    expEl.textContent = fmtMoney(0);
    balEl.textContent = fmtMoney(0);
    balEl.className = 'bh-val num-lg';
    loading.style.display = '';

    const nextDate = new Date(FT.year, FT.month + 1, 1);
    label.textContent = `${MONTHS[nextDate.getMonth()]} ${nextDate.getFullYear()}`;
    document.querySelectorAll('.fchip[data-fm]').forEach(b =>
      b.classList.toggle('active', parseInt(b.dataset.fm, 10) === FT.forecastMonthsBack)
    );

    try {
      const url = API.getUrl();
      if (!url) { UI.snack('Configura la URL primero'); return; }

      const monthsBack = FT.forecastMonthsBack;
      const periods = [];
      for (let i = monthsBack; i >= 1; i--) {
        const d = new Date(FT.year, FT.month - i + 1, 1);
        periods.push({ year: d.getFullYear(), month: d.getMonth() });
      }

      const results = await Promise.all(periods.map(p =>
        fetch(`${url}?action=getMonth&year=${p.year}&month=${p.month + 1}`)
          .then(r => r.json())
          .then(rows => ({ p, rows: rows || [] }))
      ));

      const monthTotals = results.map(({ p, rows }) => {
        const items = rows.map(r => ({
          type: r[2],
          amount: parseFloat(r[7]) || 0,
          status: String(r[11] || 'activo').toLowerCase().trim()
        })).filter(t => t.status === 'activo' && t.type !== 'Inversión');

        const inc = items.filter(t => t.type === 'Ingreso').reduce((s, t) => s + t.amount, 0);
        const exp = items.filter(t => t.type === 'Gasto').reduce((s, t) => s + t.amount, 0);
        return { ...p, inc, exp, bal: inc - exp };
      });

      if (!monthTotals.length) {
        info.textContent = 'Sin meses anteriores para calcular.';
        return;
      }

      const avgInc = monthTotals.reduce((s, m) => s + m.inc, 0) / monthTotals.length;
      const avgExp = monthTotals.reduce((s, m) => s + m.exp, 0) / monthTotals.length;
      const avgBal = avgInc - avgExp;

      incEl.textContent = fmtMoney(avgInc);
      expEl.textContent = fmtMoney(avgExp);
      balEl.textContent = fmtMoneySigned(avgBal);
      balEl.className = 'bh-val num-lg ' + (avgBal > 0 ? 'positive' : avgBal < 0 ? 'negative' : '');

      const first = monthTotals[0];
      const last = monthTotals[monthTotals.length - 1];
      info.textContent = `Promedio simple de ${monthTotals.length} meses (${MONTHS_SHORT[first.month]} ${first.year} a ${MONTHS_SHORT[last.month]} ${last.year}). Solo activos, excluye inversión.`;
      list.innerHTML = monthTotals.map(m => `
        <div class="ytd-cat-card">
          <div class="yc-icon"><span class="msr">calendar_month</span></div>
          <div class="yc-info">
            <div class="yc-name">${MONTHS_SHORT[m.month]} ${m.year}</div>
            <div class="yc-count">Ingresos ${fmtMoney(m.inc)} · Gastos ${fmtMoney(m.exp)}</div>
          </div>
          <div class="yc-amount ${m.bal >= 0 ? 'inc-color' : 'exp-color'} num">${fmtMoneySigned(m.bal)}</div>
        </div>
      `).join('');
    } catch (e) {
      UI.snack('Error al cargar predicción');
    } finally {
      loading.style.display = 'none';
    }
  },

  closeForecast() {
    this.goTab('history');
  },

  setForecastMonthsBack(months) {
    FT.forecastMonthsBack = months;
    document.querySelectorAll('.fchip[data-fm]').forEach(b =>
      b.classList.toggle('active', parseInt(b.dataset.fm, 10) === months)
    );
    if (document.getElementById('sec-forecast')?.classList.contains('show')) {
      this.openForecast();
    }
  },

  // ===== TEMPLATES =====
  async pauseTemplate(pid) {
    if (!confirm('¿Pausar esta recurrencia?')) return;
    try {
      await API.toggleTemplate(pid, false);
      UI.renderList();
      await this.syncTemplatesFromBackend();
      UI.snack('Recurrencia pausada');
    } catch (e) { UI.snack('Error'); }
  },

  async toggleTemplate(pid) {
    const sid = String(pid ?? '').trim();
    const t = FT.templates.find(x => String(x.id ?? '').trim() === sid);
    if (!t) return;
    const activate = t.status !== 'activo';
    try {
      await API.toggleTemplate(sid, activate);
      await this.syncTemplatesFromBackend();
      UI.snack(activate ? 'Recurrencia activada' : 'Recurrencia pausada');
    } catch (e) { UI.snack('Error'); }
  },

  // ===== EDIT TEMPLATE =====
  _editTplFreq: 'mensual',

  openEditTemplate(pid) {
    const sid = String(pid ?? '').trim();
    const t = FT.templates.find(x => String(x.id ?? '').trim() === sid);
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
    const amount = parseFloat(document.getElementById('editTplAmount').value);
    const day = parseInt(document.getElementById('editTplDay').value) || 1;

    if (!amount) { UI.snack('Introduce un importe'); return; }

    try {
      await API.updateTemplate(pid, {
        descripcion: desc,
        importe: amount,
        frecuencia: this._editTplFreq,
        dia_cobro: day
      });
      this.closeEditTemplate();
      await this.syncTemplatesFromBackend();
      UI.snack('Recurrencia actualizada');
    } catch (e) { UI.snack('Error al guardar'); }
  },

  async deleteTemplate(pid) {
    if (!confirm('¿Eliminar esta recurrencia?')) return;
    const sid = String(pid ?? '').trim();
    try {
      await API.deleteTemplate(sid);
      await this.syncTemplatesFromBackend();
      const stillExists = FT.templates.some(x => String(x.id ?? '').trim() === sid);
      UI.snack(stillExists ? 'No se pudo eliminar (revisa backend)' : 'Recurrencia eliminada');
    } catch (e) { UI.snack('Error al eliminar'); }
  }
};

// ===== BOOT =====
document.addEventListener('DOMContentLoaded', () => App.init());
