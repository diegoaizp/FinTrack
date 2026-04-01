// ===== FinTrack App Controller =====

const App = {
  _reimbCandidates: [],

  // Para operaciones de escritura (guardar, borrar): barra top + toast compacto
  async _withLoading(msg, fn) {
    const bar = document.getElementById('topProgress');
    if (bar) bar.classList.add('running');
    UI.showGlobalLoading(msg);
    try {
      return await fn();
    } finally {
      UI.hideGlobalLoading();
      if (bar) bar.classList.remove('running');
    }
  },

  // ===== INIT =====
  async init() {
    const url = API.getUrl();
    if (url) document.getElementById('sbKey').value = url;
    document.getElementById('inputDate').value = todayStr();
    UI.updateMonthLabel();
    UI.updateInvMonthLabel();

    // Restaurar filtro persistido
    const savedFilter = localStorage.getItem('ft_filter');
    if (savedFilter && savedFilter !== 'all') {
      FT.filter = savedFilter;
      document.querySelectorAll('.fchip[data-f]').forEach(b =>
        b.classList.toggle('active', b.dataset.f === savedFilter)
      );
    }

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

    document.getElementById('inputDate').addEventListener('change', () => this.refreshReimbCandidates());
  },

  // ===== DATA LOADING =====
  async loadAll() {
    // Mostrar skeletons inmediatamente — sin overlay bloqueante
    UI.showSkeleton('txList');
    UI.showHeroSkeleton();
    UI.showInvHeroSkeleton();

    try {
      // Fase 1: categorías → habilita el formulario cuanto antes
      await API.loadCategories();
      UI.renderCats();
      this.updateReimbUI();

      // Fase 2: resto en paralelo
      await Promise.all([
        API.loadMonth(FT.year, FT.month),
        API.loadTemplates()
      ]);

      UI.hideHeroSkeleton();
      UI.renderList();
      UI.updateSummary();
      UI.renderTemplates();
      UI.renderInvestments();
      UI.hideInvHeroSkeleton();

      // Status cargado ahora en status.html
      UI.snack('Datos actualizados');
    } catch (e) {
      UI.hideHeroSkeleton();
      UI.hideInvHeroSkeleton();
      UI.showError('txList', 'Error al cargar datos.<br>Revisa la clave y la conexión.');
    }
  },

  async loadCurrentMonth() {
    // Skeleton en lista y hero mientras recarga el mes
    UI.showSkeleton('txList');
    UI.showHeroSkeleton();
    try {
      await API.loadMonth(FT.year, FT.month, true);
      UI.hideHeroSkeleton();
      UI.renderList();
      UI.updateSummary();
    } catch (e) {
      UI.hideHeroSkeleton();
      UI.showError('txList', 'Error al cargar datos.');
    }
  },

  // ===== CONFIG =====
  toggleConfig() {
    document.getElementById('configSheet').classList.toggle('show');
  },

  saveConfig() {
    const url = document.getElementById('sbKey').value.trim();
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
    ['form', 'history', 'subs', 'invest', 'ytd', 'predict'].forEach(s =>
      document.getElementById('sec-' + s)?.classList.toggle('show', s === t)
    );
    // Show/hide floating register button
    const registerBtn = document.getElementById('floatingRegister');
    if (registerBtn) registerBtn.style.display = t === 'form' ? 'flex' : 'none';
    // Show/hide bottom nav (hide on YTD page)
    const bnav = document.querySelector('.bottom-nav');
    if (bnav) bnav.style.display = (t === 'ytd' || t === 'predict') ? 'none' : '';

    if (t === 'form') setTimeout(() => document.getElementById('inputAmount').focus(), 150);
    if (t === 'subs') {
      // Sincronizar visibilidad del subfiltro de ciclos con el filtro actual
      const cycleRow = document.getElementById('subsCycleFilter');
      if (cycleRow) cycleRow.style.display = FT.subFilter !== 'all' ? '' : 'none';
      UI.renderTemplates();
    }
    if (t === 'invest') {
      UI.renderInvestments();
      // Pre-carga los 5 meses anteriores en background para rellenar las barras
      this._preloadInvHistory();
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
    this.updateReimbUI();
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
    this.updateReimbUI();
  },

  pickSub(s) {
    FT.sub = s;
    document.getElementById('customSubRow').classList.remove('show');
    UI.renderSubcats();
    this.updateReimbUI();
  },

  _isBizumReembolso() {
    return FT.type === 'Ingreso' &&
      normText(FT.cat) === 'reembolsos' &&
      normText(FT.sub) === 'bizum';
  },

  toggleReimb() {
    const on = !!document.getElementById('isReimb').checked;
    document.getElementById('reimbOpts').style.display = on ? '' : 'none';
    if (on) this.refreshReimbCandidates();
  },

  updateReimbUI() {
    const group = document.getElementById('reimbGroup');
    const check = document.getElementById('isReimb');
    const opts = document.getElementById('reimbOpts');
    if (!group || !check || !opts) return;

    const show = this._isBizumReembolso();
    group.style.display = show ? '' : 'none';
    if (!show) {
      check.checked = false;
      opts.style.display = 'none';
      document.getElementById('reimbExpense').innerHTML = '<option value="">Selecciona un gasto</option>';
      document.getElementById('reimbHint').textContent = '';
    }
  },

  async refreshReimbCandidates() {
    if (!this._isBizumReembolso()) return;
    if (!document.getElementById('isReimb').checked) return;

    const url = API.getUrl();
    if (!url) return;

    const sel = document.getElementById('reimbExpense');
    const hint = document.getElementById('reimbHint');
    const selected = sel.value;
    sel.innerHTML = '<option value="">Cargando...</option>';
    hint.textContent = 'Buscando gastos recientes...';

    const baseDate = document.getElementById('inputDate').value || todayStr();
    const pivot = new Date(baseDate + 'T12:00:00');
    if (isNaN(pivot.getTime())) return;

    try {
      const jobs = [];
      for (let i = 0; i < 6; i++) {
        const d = new Date(pivot.getFullYear(), pivot.getMonth() - i, 1);
        jobs.push(
          API.fetchMonth(d.getFullYear(), d.getMonth(), true)
            .then(items => (items || []).filter(x => x.status === 'activo' && x.type === 'Gasto' && x.amount > 0))
        );
      }

      const results = await Promise.all(jobs);
      this._reimbCandidates = results.flat().sort((a, b) => {
        const byDate = new Date(b.date) - new Date(a.date);
        if (byDate !== 0) return byDate;
        return b.id.localeCompare(a.id);
      });

      if (!this._reimbCandidates.length) {
        sel.innerHTML = '<option value="">No hay gastos para compensar</option>';
        hint.textContent = 'No se encontraron gastos activos en los últimos 6 meses.';
        return;
      }

      sel.innerHTML = ['<option value="">Selecciona un gasto</option>']
        .concat(this._reimbCandidates.map(x => {
          const sub = x.subcategory ? ` / ${x.subcategory}` : '';
          const desc = x.description || `${x.category}${sub}`;
          return `<option value="${esc(x.id)}">${x.date} · ${desc} · ${formatEUR(x.amount)}</option>`;
        }))
        .join('');

      if (selected && this._reimbCandidates.some(x => x.id === selected)) {
        sel.value = selected;
      }
      hint.textContent = 'El importe del Bizum reducirá este gasto.';
    } catch (e) {
      sel.innerHTML = '<option value="">Error al cargar gastos</option>';
      hint.textContent = 'No se pudieron cargar los gastos para compensar.';
    }
  },

  async _findExpenseById(expenseId, baseDateStr) {
    const url = API.getUrl();
    if (!url || !expenseId) return null;

    const base = new Date((baseDateStr || todayStr()) + 'T12:00:00');
    if (isNaN(base.getTime())) return null;

    for (let i = 0; i < 6; i++) {
      const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
      try {
        const items = await API.fetchMonth(d.getFullYear(), d.getMonth(), true);
        const found = (items || []).find(x => x.id === expenseId && x.status === 'activo' && x.type === 'Gasto');
        if (found) return found;
      } catch (e) {}
    }
    return null;
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
    const day = Math.max(1, Math.min(31, parseInt(document.getElementById('inputDay').value) || 1));
    const isReimb = this._isBizumReembolso() && document.getElementById('isReimb').checked;
    const reimbId = isReimb ? document.getElementById('reimbExpense').value : '';
    const reimbTarget = isReimb ? this._reimbCandidates.find(x => x.id === reimbId) : null;

    if (!amount || amount <= 0) { UI.snack('Introduce un importe'); return; }
    if (isReimb && !reimbTarget) { UI.snack('Selecciona el gasto a compensar'); return; }

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
      plantilla_id: isReimb ? reimbTarget.id : '',
      estado: 'activo',
      creado: nowISO(),
      modificado: nowISO()
    };

    await this._withLoading('Guardando movimiento...', async () => {
      try {
        await API.addMovimiento(entry);
        if (isReimb && reimbTarget) {
          const newAmount = Math.max(0, parseAmount(reimbTarget.amount) - amount);
          await API.updateMovimiento(reimbTarget.id, {
            importe: newAmount,
            modificado: nowISO()
          });
          if (reimbTarget.date) {
            const d = new Date(reimbTarget.date + 'T12:00:00');
            if (!isNaN(d.getTime())) Cache.invalidate(d.getFullYear(), d.getMonth());
          }
        }

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
        document.getElementById('isReimb').checked = false;
        this.toggleReimb();

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
    UI.showInvHeroSkeleton();
    try {
      // fetchMonth no sobrescribe FT.tx — seguro para meses distintos
      if (FT.invYear !== FT.year || FT.invMonth !== FT.month) {
        FT._invTx = await API.fetchMonth(FT.invYear, FT.invMonth);
      } else {
        FT._invTx = null;
      }
      UI.renderInvestments();
      this._preloadInvHistory();
    } catch (e) {
      UI.snack('Error al cargar inversiones');
    } finally {
      UI.hideInvHeroSkeleton();
    }
  },

  // Pre-carga en background los 5 meses anteriores al mes de inversión actual
  // para rellenar las barras del gráfico sin bloquear la UI
  _preloadInvHistory() {
    for (let i = 1; i <= 5; i++) {
      let m = FT.invMonth - i;
      let y = FT.invYear;
      if (m < 0) { m += 12; y--; }
      if (!Cache.get(y, m)) {
        // fetchMonth solo cachea, no toca FT.tx
        API.fetchMonth(y, m, false).then(() => UI._renderInvBars()).catch(() => {});
      }
    }
  },

  // ===== FILTERS =====
  setFilter(f) {
    FT.filter = f;
    localStorage.setItem('ft_filter', f);
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
    if (isCompensatingBizum(tx)) {
      UI.snack('Este Bizum compensatorio no se puede editar');
      return;
    }
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
        const tx = FT.tx.find(t => t.id === id);
        if (tx && isCompensatingBizum(tx)) {
          const linked = await this._findExpenseById(tx.templateId, tx.date);
          if (!linked) {
            UI.snack('No se pudo restaurar el gasto vinculado');
            return;
          }
          await API.updateMovimiento(linked.id, {
            importe: parseAmount(linked.amount) + parseAmount(tx.amount),
            modificado: nowISO()
          });
          if (tx.date) {
            const d = new Date(tx.date + 'T12:00:00');
            if (!isNaN(d.getTime())) Cache.invalidate(d.getFullYear(), d.getMonth());
          }
        }
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
    // Limpiar gráfica mensual
    const chartCanvas = document.getElementById('ytdMonthChart');
    if (chartCanvas) { const c = chartCanvas.getContext('2d'); c.clearRect(0, 0, chartCanvas.width, chartCanvas.height); }
    const chartLabels = document.getElementById('ytdMonthLabels');
    if (chartLabels) chartLabels.innerHTML = '';
    const avgEl = document.getElementById('ytdAvgExp');
    if (avgEl) avgEl.textContent = '—';
    const ytdInvRow = document.getElementById('ytdInvRow');
    if (ytdInvRow) ytdInvRow.style.display = 'none';

    await this._withLoading('Cargando balance YTD...', async () => {
      try {
        // Load all months for the year
        const allTx = [];
        if (!API.getUrl()) { UI.snack('Configura la URL primero'); return; }

        // Load each month Jan–current using Supabase API
        const currentMonth = new Date().getFullYear() === year ? new Date().getMonth() : 11;
        const promises = [];
        for (let m = 0; m <= currentMonth; m++) {
          promises.push(API.fetchMonth(year, m, true));
        }
        const results = await Promise.all(promises);
        results.forEach(items => allTx.push(...(items || [])));

        // Calculate totals (reembolsos excluidos de ingresos en todos los totales)
        const incTx = allTx.filter(t => t.type === 'Ingreso' && !isReembolso(t));
        const expTx = allTx.filter(t => t.type === 'Gasto');
        const invTx = allTx.filter(t => t.type === 'Inversión');
        const totalInc = incTx.reduce((s, t) => s + t.amount, 0);
        const totalExp = expTx.reduce((s, t) => s + t.amount, 0);
        const totalInv = invTx.reduce((s, t) => s + t.amount, 0);
        // YTD balance = Ingresos − Gastos (invertido es solo informativo aquí)
        const bal = totalInc - totalExp;

        // Gasto promedio: solo contar meses que tienen al menos un gasto
        const monthsWithExp = new Set(expTx.map(t => t.date.slice(0, 7))).size;
        const avgExp = monthsWithExp > 0 ? totalExp / monthsWithExp : 0;

        document.getElementById('ytdInc').textContent = formatEUR(totalInc);
        document.getElementById('ytdExp').textContent = formatEUR(totalExp);
        const avgEl = document.getElementById('ytdAvgExp');
        if (avgEl) avgEl.textContent = avgExp > 0 ? formatEUR(avgExp) : '—';
        const bEl = document.getElementById('ytdBalance');
        bEl.textContent = formatSignedEUR(bal);
        bEl.className = 'bh-val num-lg ' + (bal > 0 ? 'positive' : bal < 0 ? 'negative' : '');

        // Línea Invertido (visible solo si hay inversiones en el año)
        const ytdInvRow = document.getElementById('ytdInvRow');
        if (ytdInvRow) ytdInvRow.style.display = totalInv > 0 ? '' : 'none';
        const ytdInvEl = document.getElementById('ytdInv');
        if (ytdInvEl) ytdInvEl.textContent = formatEUR(totalInv);

        // ── Gráfica mensual ──────────────────────────────────────────────
        // Construir datos por mes: inc, exp, bal
        const monthData = results.map((items, i) => {
          const mItems = items || [];
          const mInc = mItems.filter(t => t.type === 'Ingreso' && !isReembolso(t)).reduce((s, t) => s + t.amount, 0);
          const mExp = mItems.filter(t => t.type === 'Gasto').reduce((s, t) => s + t.amount, 0);
          return { m: i, inc: mInc, exp: mExp, bal: mInc - mExp };
        });
        // currentMonth como índice dentro de monthData (0 = Enero)
        const chartCurrentIdx = new Date().getFullYear() === year ? new Date().getMonth() : currentMonth;
        UI.renderYTDMonthChart(monthData, chartCurrentIdx);

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

  // ===== PREDICTION =====
  async openPredict() {
    this.goTab('predict');
    document.getElementById('predExpTotal').textContent = '0,00€';
    document.getElementById('predIncTotal').textContent = '0,00€';
    document.getElementById('predMeta').textContent = '';
    document.getElementById('predExpList').innerHTML = '';
    document.getElementById('predIncList').innerHTML = '';
    document.getElementById('predLoading').style.display = '';

    await this._withLoading('Cargando predicción...', async () => {
      try {
        if (!API.getUrl()) { UI.snack('Configura la URL primero'); return; }

        // Fetch ALL historical expenses & income in a single query
        const { data, error } = await _initSb()
          .from('movimientos')
          .select('fecha, tipo, categoria, importe, ambito')
          .in('tipo', ['Gasto', 'Ingreso'])
          .eq('estado', 'activo');
        sbCheck(error, 'predict');

        const all = (data || []).map(r => ({
          date:     r.fecha,
          type:     r.tipo,
          category: r.categoria,
          amount:   parseAmount(r.importe),
          scope:    r.ambito
        }));

        // Filter reembolsos out of income
        const allExp = all.filter(t => t.type === 'Gasto');
        const allInc = all.filter(t => t.type === 'Ingreso' && !isReembolso(t));

        if (!allExp.length && !allInc.length) {
          document.getElementById('predExpList').innerHTML =
            '<div class="empty" style="padding:24px"><p>Sin movimientos registrados</p></div>';
          document.getElementById('predLoading').style.display = 'none';
          return;
        }

        // Count unique months across all history (using both types)
        const allMonths = new Set(all.map(t => t.date.slice(0, 7)));
        const monthCount = allMonths.size;

        // Current month key
        const now = new Date();
        const curKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        // Build category data for a given set of transactions
        const buildCats = (txList) => {
          const cats = {};
          txList.forEach(tx => {
            if (!cats[tx.category]) cats[tx.category] = { total: 0, curMonth: 0 };
            cats[tx.category].total += tx.amount;
            if (tx.date.startsWith(curKey)) cats[tx.category].curMonth += tx.amount;
          });
          return Object.entries(cats)
            .map(([name, d]) => ({ name, avg: d.total / monthCount, curMonth: d.curMonth }))
            .sort((a, b) => b.avg - a.avg);
        };

        const expSorted = buildCats(allExp);
        const incSorted = buildCats(allInc);
        const totalExpAvg = expSorted.reduce((s, c) => s + c.avg, 0);
        const totalIncAvg = incSorted.reduce((s, c) => s + c.avg, 0);

        document.getElementById('predExpTotal').textContent = formatEUR(totalExpAvg);
        document.getElementById('predIncTotal').textContent = formatEUR(totalIncAvg);
        document.getElementById('predMeta').textContent =
          `Basado en ${monthCount} mes${monthCount !== 1 ? 'es' : ''} de historial`;

        UI.renderPrediction(expSorted, totalExpAvg, 'predExpList', 'exp');
        UI.renderPrediction(incSorted, totalIncAvg, 'predIncList', 'inc');
      } catch (e) {
        UI.snack('Error al cargar predicción');
      }
    });
    document.getElementById('predLoading').style.display = 'none';
  },

  closePredict() {
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
    UI.renderTemplateHistory(pid);
    document.getElementById('editTplModal').classList.add('show');
  },

  closeEditTemplate() {
    document.getElementById('editTplModal').classList.remove('show');
  },

  // ===== COBRO RÁPIDO DESDE PLANTILLA =====
  openCobro(pid) {
    const t = FT.templates.find(x => x.id === pid);
    if (!t) return;
    document.getElementById('cobroTplId').value = pid;
    document.getElementById('cobroAmount').value = t.amount;
    document.getElementById('cobroDate').value = todayStr();
    const ic = catIcon(t.category);
    const sub = t.subcategory ? ' / ' + t.subcategory : '';
    const freqMap = { mensual: 'Mensual', trimestral: 'Trimestral', semestral: 'Semestral', anual: 'Anual' };
    document.getElementById('cobroInfo').innerHTML = `
      <div class="ci-icon"><span class="msr filled">${ic}</span></div>
      <div>
        <div class="ci-name">${esc(t.description || t.category)}</div>
        <div class="ci-detail">${esc(t.category)}${esc(sub)} · ${freqMap[t.frequency] || t.frequency}</div>
      </div>`;
    document.getElementById('cobroModal').classList.add('show');
  },

  closeCobro() {
    document.getElementById('cobroModal').classList.remove('show');
  },

  async saveCobro() {
    const pid = document.getElementById('cobroTplId').value;
    const amount = parseAmount(document.getElementById('cobroAmount').value);
    const date = document.getElementById('cobroDate').value;

    if (!amount || amount <= 0) { UI.snack('Introduce un importe'); return; }
    if (!date) { UI.snack('Introduce una fecha'); return; }

    const tpl = FT.templates.find(x => x.id === pid);
    if (!tpl) return;

    await this._withLoading('Registrando cobro...', async () => {
      try {
        // 1. Crear movimiento vinculado a la plantilla
        const id = genId('m');
        await API.addMovimiento({
          id,
          fecha: date,
          tipo: tpl.type,
          ambito: tpl.scope || 'Personal',
          categoria: tpl.category,
          subcategoria: tpl.subcategory || '',
          descripcion: tpl.description || '',
          importe: amount,
          recurrencia: tpl.recurrence || '',
          frecuencia: tpl.frequency || '',
          plantilla_id: pid,   // ← vínculo clave
          estado: 'activo',
          creado: nowISO(),
          modificado: nowISO()
        });

        // 2. Avanzar la fecha próxima en la plantilla
        const base = tpl.next && tpl.next >= date ? tpl.next : date;
        const newProxima = calcNextDate(base, tpl.frequency);
        await API.updateTemplate(pid, { proxima: newProxima });

        this.closeCobro();
        UI.renderList();
        UI.updateSummary();
        UI.renderTemplates();
        UI.snack('Cobro registrado ✓');
      } catch (e) {
        UI.snack('Error al registrar cobro');
      }
    });
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

    // Recalcular proxima si cambiaron frecuencia o día de cobro
    const tpl = FT.templates.find(x => x.id === pid);
    const freqChanged = tpl && this._editTplFreq !== tpl.frequency;
    const dayChanged  = tpl && day !== tpl.dayOfCharge;
    let newProxima;
    if (tpl && (freqChanged || dayChanged)) {
      const baseDate = todayStr().slice(0, 8) + String(day).padStart(2, '0');
      newProxima = calcNextDate(baseDate, this._editTplFreq);
    }

    await this._withLoading('Guardando recurrencia...', async () => {
      try {
        const fields = {
          descripcion: desc,
          importe: amount,
          frecuencia: this._editTplFreq,
          dia_cobro: day
        };
        if (newProxima) fields.proxima = newProxima;
        await API.updateTemplate(pid, fields);
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

};

// ===== BOOT =====
document.addEventListener('DOMContentLoaded', () => App.init());
