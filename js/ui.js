// ===== FinTrack UI Module =====

const UI = {

  // ===== SNACKBAR =====
  snack(msg) {
    let s = document.getElementById('snackbar');
    if (!s) {
      s = document.createElement('div');
      s.id = 'snackbar';
      s.className = 'snackbar';
      document.body.appendChild(s);
    }
    s.textContent = msg;
    s.className = 'snackbar show';

    // Clear any existing timeout to avoid multiple timers
    if (s._t) clearTimeout(s._t);

    // Auto-hide after 3 seconds
    s._t = setTimeout(() => {
      s.className = 'snackbar';
      // Clean up timeout reference
      s._t = null;
    }, 3000);
  },

  // ===== MONTH LABELS =====
  updateMonthLabel() {
    document.getElementById('monthLabel').textContent = MONTHS[FT.month] + ' ' + FT.year;
  },

  updateInvMonthLabel() {
    document.getElementById('invMonthLabel').textContent = MONTHS[FT.invMonth] + ' ' + FT.invYear;
  },

  // ===== CATEGORIES =====
  renderCats() {
    const cats = getCatsForType(FT.type);
    const keys = Object.keys(cats);
    if (!FT.cat && keys.length) FT.cat = keys[0];
    if (!keys.includes(FT.cat) && keys.length) FT.cat = keys[0];

    const g = document.getElementById('catChips');
    if (!keys.length) {
      g.innerHTML = '<span style="font-size:.82rem;color:var(--md-on-surface-var)">Cargando categorías...</span>';
      document.getElementById('subcatBox').classList.remove('show');
      return;
    }

    g.innerHTML = keys.map(k => {
      const ic = cats[k].icon || 'label';
      return `<button class="chip${k === FT.cat ? ' selected' : ''}" onclick="App.pickCat('${esc(k)}')"><span class="ci"><span class="msr">${ic}</span></span>${k}</button>`;
    }).join('') +
      `<button class="chip add-chip" onclick="App.showCustom('Cat')"><span class="msr">add</span></button>`;

    this.renderSubcats();
  },

  renderSubcats() {
    const cats = getCatsForType(FT.type);
    const info = cats[FT.cat];
    const area = document.getElementById('subcatBox');
    const g = document.getElementById('subcatChips');

    if (!info || !info.subs.length) { area.classList.remove('show'); FT.sub = ''; return; }
    area.classList.add('show');

    // Sort by usage
    const usage = getSubUsage(FT.cat);
    const sorted = [...info.subs].sort((a, b) => (usage[b] || 0) - (usage[a] || 0));

    if (!FT.sub || !sorted.includes(FT.sub)) FT.sub = sorted[0];

    g.innerHTML = sorted.map(s =>
      `<button class="sub-chip${s === FT.sub ? ' selected' : ''}" onclick="App.pickSub('${esc(s)}')">${s}</button>`
    ).join('') +
      `<button class="sub-chip add-sub" onclick="App.showCustom('Sub')">+</button>`;
  },

  // ===== HISTORY LIST (grouped by day) =====
  renderList() {
    const filtered = FT.tx.filter(tx => {
      const d = new Date(tx.date);
      if (d.getMonth() !== FT.month || d.getFullYear() !== FT.year) return false;
      if (tx.type === 'Inversión') return false;
      if (FT.filter === 'all') return true;
      if (FT.filter === 'Común') return tx.scope === 'Común';
      return tx.type === FT.filter;
    }).sort((a, b) => new Date(b.date) - new Date(a.date));

    const list = document.getElementById('txList');

    if (!filtered.length) {
      list.innerHTML = `<div class="empty"><span class="msr">search_off</span><p>Sin movimientos en ${MONTHS[FT.month]} ${FT.year}</p></div>`;
      return;
    }

    // Group by day
    const days = {};
    filtered.forEach(tx => {
      const key = tx.date; // yyyy-mm-dd
      if (!days[key]) days[key] = [];
      days[key].push(tx);
    });

    const WEEKDAYS = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
    let html = '';
    for (const [dateKey, txs] of Object.entries(days)) {
      const d = new Date(dateKey + 'T12:00:00');
      const dayNum = d.getDate();
      const wday = WEEKDAYS[d.getDay()];
      const dayTotal = txs.reduce((s, t) => s + (t.type === 'Gasto' ? -t.amount : t.amount), 0);
      const sign = dayTotal >= 0 ? '+' : '−';

      html += `<div class="day-header"><span class="dh-date">${wday} ${dayNum}</span><span class="dh-total">${sign}€${Math.abs(dayTotal).toFixed(2)}</span></div>`;
      html += txs.map(tx => this._txCard(tx)).join('');
    }

    list.innerHTML = html;
  },

  _renderBatch(container, items, offset) {
    const CHUNK = 20;
    const chunk = items.slice(offset, offset + CHUNK);
    if (!chunk.length) return;

    requestAnimationFrame(() => {
      const frag = document.createDocumentFragment();
      const temp = document.createElement('div');
      temp.innerHTML = chunk.map(tx => this._txCard(tx)).join('');
      while (temp.firstChild) frag.appendChild(temp.firstChild);
      container.appendChild(frag);

      if (offset + CHUNK < items.length) {
        this._renderBatch(container, items, offset + CHUNK);
      }
    });
  },

  _txCard(tx) {
    const isE = tx.type === 'Gasto', isI = tx.type === 'Ingreso';
    const cls = isE ? 'expense' : isI ? 'income' : 'inversion';
    const ic = catIcon(tx.category);
    const sub = tx.subcategory ? ' / ' + tx.subcategory : '';
    const sign = isE ? '−' : '+';
    const desc = tx.description || tx.category || 'Sin descripción';
    const descCls = tx.description ? 'tx-t' : 'tx-t no-desc';

    const recBadge = tx.recurrence
      ? `<span class="tx-badge rec"><span class="msr">autorenew</span> ${tx.recurrence === 'suscripcion' ? 'SUB' : 'PER'}</span>`
      : '';
    const comBadge = tx.scope === 'Común'
      ? `<span class="tx-badge common"><span class="msr">group</span> Común</span>`
      : '';

    return `<div class="tx-card">
      <div class="tx-ava ${cls}"><span class="msr filled">${ic}</span></div>
      <div class="tx-body"><div class="${descCls}">${desc}</div><div class="tx-m">${tx.category}${sub} ${recBadge}${comBadge}</div></div>
      <div class="tx-v num ${cls}">${sign}€${tx.amount.toFixed(2)}</div>
      <div class="tx-actions">
        <button class="tx-act" onclick="App.openEdit('${tx.id}')" title="Editar"><span class="msr">edit</span></button>
        <button class="tx-act" onclick="App.deleteEntry('${tx.id}')" title="Eliminar"><span class="msr">delete</span></button>
      </div>
    </div>`;
  },

  // ===== SUMMARY (balance hero) =====
  updateSummary() {
    const mt = FT.tx.filter(tx => {
      const d = new Date(tx.date);
      return d.getMonth() === FT.month && d.getFullYear() === FT.year && tx.type !== 'Inversión';
    });

    const inc = mt.filter(t => t.type === 'Ingreso').reduce((s, t) => s + t.amount, 0);
    const exp = mt.filter(t => t.type === 'Gasto').reduce((s, t) => s + t.amount, 0);
    const bal = inc - exp;

    document.getElementById('sumInc').textContent = '€' + inc.toFixed(2);
    document.getElementById('sumExp').textContent = '€' + exp.toFixed(2);

    const bEl = document.getElementById('sumBal');
    bEl.textContent = (bal >= 0 ? '+' : '−') + '€' + Math.abs(bal).toFixed(2);
    bEl.className = 'bh-val num-lg ' + (bal > 0 ? 'positive' : bal < 0 ? 'negative' : '');
  },

  // ===== TEMPLATES / RECURRENTES =====
  renderTemplates() {
    const list = document.getElementById('subsList');
    let items = FT.templates;
    if (FT.subFilter !== 'all') items = items.filter(t => t.recurrence === FT.subFilter);
    if (FT.subCycleFilter !== 'all') items = items.filter(t => t.frequency === FT.subCycleFilter);

    const active = items.filter(s => s.status === 'activo');
    const paused = items.filter(s => s.status !== 'activo');

    const monthlyTotal = active.reduce((s, x) => s + monthlyAmount(x), 0);

    document.getElementById('subsTotal').textContent = '€' + monthlyTotal.toFixed(2);
    const ac = active.length;
    document.getElementById('subsCount').textContent = ac + ' activa' + (ac !== 1 ? 's' : '');

    if (!items.length) {
      list.innerHTML = '<div class="empty"><span class="msr">autorenew</span><p>Sin recurrencias registradas.</p></div>';
      return;
    }

    const freqMap = { mensual: 'Mensual', trimestral: 'Trim.', semestral: 'Sem.', anual: 'Anual' };

    const render = arr => arr.map(s => {
      const ic = catIcon(s.category);
      const sub = s.subcategory ? ' / ' + s.subcategory : '';
      const fLabel = freqMap[s.frequency] || '';
      const isActive = s.status === 'activo';
      const desc = s.description || s.category;

      // Next charge date
      let nextStr = '';
      if (s.next && isActive) {
        const nd = new Date(s.next + 'T12:00:00');
        if (!isNaN(nd)) {
          const diff = Math.ceil((nd - new Date()) / 86400000);
          if (diff <= 0) nextStr = 'Hoy';
          else if (diff === 1) nextStr = 'Mañana';
          else if (diff <= 7) nextStr = 'En ' + diff + ' días';
          else nextStr = nd.getDate() + ' ' + MONTHS_SHORT[nd.getMonth()];
        }
      }
      const nextHtml = nextStr ? `<div class="sc-next"><span class="msr">schedule</span>${nextStr}</div>` : '';

      return `<div class="sub-card ${isActive ? '' : 'off'}">
        <div class="sc-icon"><span class="msr filled">${ic}</span></div>
        <div class="sc-info">
          <div class="sc-name">${desc}<span class="sc-freq">${fLabel}</span></div>
          <div class="sc-detail">${s.category}${sub}</div>
          ${nextHtml}
        </div>
        <div class="sc-right">
          <span class="sc-price num">€${s.amount.toFixed(2)}</span>
          <div class="sc-actions">
            <button class="tx-act" onclick="App.openEditTemplate('${s.id}')" title="Editar"><span class="msr">edit</span></button>
            <button class="tx-act" onclick="App.deleteTemplate('${s.id}')" title="Eliminar"><span class="msr">delete</span></button>
            <label class="m3-sw"><input type="checkbox" ${isActive ? 'checked' : ''} onchange="App.toggleTemplate('${s.id}')"><span class="track"></span></label>
          </div>
        </div>
      </div>`;
    }).join('');

    list.innerHTML = render(active) + render(paused);
  },

  // ===== INVESTMENTS =====
  renderInvestments() {
    const items = FT.tx.filter(tx => {
      const d = new Date(tx.date);
      return tx.type === 'Inversión' && d.getMonth() === FT.invMonth && d.getFullYear() === FT.invYear;
    }).sort((a, b) => new Date(b.date) - new Date(a.date));

    const total = items.reduce((s, t) => s + t.amount, 0);
    document.getElementById('invTotal').textContent = '€' + total.toFixed(2);
    document.getElementById('invCount').textContent = items.length + ' aportacion' + (items.length !== 1 ? 'es' : '');

    const list = document.getElementById('invList');
    if (!items.length) {
      list.innerHTML = `<div class="empty"><span class="msr">account_balance_wallet</span><p>Sin inversiones en ${MONTHS[FT.invMonth]} ${FT.invYear}</p></div>`;
      return;
    }

    list.innerHTML = items.map(tx => {
      const ic = catIcon(tx.category);
      const sub = tx.subcategory ? ' / ' + tx.subcategory : '';
      const d = new Date(tx.date);
      const ds = d.getDate() + ' ' + MONTHS_SHORT[d.getMonth()];
      const desc = tx.description || tx.category || 'Inversión';
      const descCls = tx.description ? 'tx-t' : 'tx-t no-desc';

      return `<div class="tx-card">
        <div class="tx-ava inversion"><span class="msr filled">${ic}</span></div>
        <div class="tx-body"><div class="${descCls}">${desc}</div><div class="tx-m">${tx.category}${sub} · ${ds}</div></div>
        <div class="tx-v num inversion">€${tx.amount.toFixed(2)}</div>
        <div class="tx-actions">
          <button class="tx-act" onclick="App.openEdit('${tx.id}')" title="Editar"><span class="msr">edit</span></button>
          <button class="tx-act" onclick="App.deleteEntry('${tx.id}')" title="Eliminar"><span class="msr">delete</span></button>
        </div>
      </div>`;
    }).join('');
  },

  _renderInvBars() {
    const bars = document.getElementById('invBars');
    if (!bars) return;

    // Collect last 6 months totals from loaded data
    const months = [];
    for (let i = 5; i >= 0; i--) {
      let m = FT.invMonth - i;
      let y = FT.invYear;
      if (m < 0) { m += 12; y--; }
      const total = FT.tx
        .filter(tx => {
          if (tx.type !== 'Inversión') return false;
          const d = new Date(tx.date);
          return d.getMonth() === m && d.getFullYear() === y;
        })
        .reduce((s, t) => s + t.amount, 0);
      months.push({ m, y, total, current: m === FT.invMonth && y === FT.invYear });
    }

    const max = Math.max(...months.map(x => x.total), 1);

    bars.innerHTML = months.map(x => {
      const h = Math.max((x.total / max) * 60, 2);
      return `<div class="inv-bar-col">
        <div class="inv-bar${x.current ? ' current' : ''}" style="height:${h}px"></div>
        <span class="inv-bar-label">${MONTHS_SHORT[x.m]}</span>
      </div>`;
    }).join('');
  },

  // ===== EDIT MODAL =====
  _editCat: '',
  _editSub: '',

  openEditModal(tx) {
    document.getElementById('editId').value = tx.id;
    document.getElementById('editType').value = tx.type;
    document.getElementById('editDesc').value = tx.description || '';
    document.getElementById('editAmount').value = tx.amount;
    document.getElementById('editDate').value = tx.date;

    this._editCat = tx.category || '';
    this._editSub = tx.subcategory || '';
    this.renderEditCats(tx.type);

    document.getElementById('editModal').classList.add('show');
  },

  closeEditModal() {
    document.getElementById('editModal').classList.remove('show');
  },

  renderEditCats(type) {
    const cats = getCatsForType(type);
    const keys = Object.keys(cats);
    if (!keys.includes(this._editCat) && keys.length) this._editCat = keys[0];

    const g = document.getElementById('editCatChips');
    g.innerHTML = keys.map(k => {
      const ic = cats[k].icon || 'label';
      return `<button class="chip${k === this._editCat ? ' selected' : ''}" onclick="App.pickEditCat('${esc(k)}')"><span class="ci"><span class="msr">${ic}</span></span>${k}</button>`;
    }).join('');

    this.renderEditSubcats(type);
  },

  renderEditSubcats(type) {
    const cats = getCatsForType(type);
    const info = cats[this._editCat];
    const box = document.getElementById('editSubcatBox');
    const g = document.getElementById('editSubcatChips');

    if (!info || !info.subs.length) {
      box.style.display = 'none';
      this._editSub = '';
      return;
    }

    box.style.display = '';
    if (!info.subs.includes(this._editSub)) this._editSub = info.subs[0];

    g.innerHTML = info.subs.map(s =>
      `<button class="sub-chip${s === this._editSub ? ' selected' : ''}" onclick="App.pickEditSub('${esc(s)}')">${s}</button>`
    ).join('');
  },

  // ===== YTD CATEGORIES =====
  renderYTDCategories(txList, containerId, type) {
    const container = document.getElementById(containerId);
    if (!txList.length) {
      container.innerHTML = '<div class="empty" style="padding:24px"><p>Sin datos</p></div>';
      return;
    }

    // Group by category
    const cats = {};
    txList.forEach(tx => {
      if (!cats[tx.category]) cats[tx.category] = { total: 0, count: 0 };
      cats[tx.category].total += tx.amount;
      cats[tx.category].count++;
    });

    // Sort by total desc
    const sorted = Object.entries(cats).sort((a, b) => b[1].total - a[1].total);
    const maxTotal = sorted[0] ? sorted[0][1].total : 1;

    const fillCls = type === 'exp' ? 'exp-fill' : 'inc-fill';
    const colorCls = type === 'exp' ? 'exp-color' : 'inc-color';

    container.innerHTML = sorted.map(([name, data]) => {
      const ic = catIcon(name);
      const pct = Math.round((data.total / maxTotal) * 100);
      return `<div class="ytd-cat-card">
        <div class="yc-icon"><span class="msr">${ic}</span></div>
        <div class="yc-info">
          <div class="yc-name">${name}</div>
          <div class="yc-bar"><div class="yc-bar-fill ${fillCls}" style="width:${pct}%"></div></div>
          <div class="yc-count">${data.count} movimiento${data.count !== 1 ? 's' : ''}</div>
        </div>
        <div class="yc-amount ${colorCls} num">€${data.total.toFixed(2)}</div>
      </div>`;
    }).join('');
  },

  // ===== SKELETON =====
  showSkeleton(containerId) {
    document.getElementById(containerId).innerHTML =
      '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';
  },

  showError(containerId, msg) {
    document.getElementById(containerId).innerHTML =
      `<div class="empty"><span class="msr">warning</span><p>${msg}</p></div>`;
  }
};
