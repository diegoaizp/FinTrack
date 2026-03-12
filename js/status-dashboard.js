// ===== Status Dashboard — Standalone Controller =====

const StatusDash = {
  _seq: 0,

  // ── INIT ──────────────────────────────────────────────
  async init() {
    // Month label + scroll shadow — always set up regardless of key
    this.updateMonthLabel();

    window.addEventListener('scroll', () => {
      document.getElementById('sdTopbar').classList.toggle('scrolled', window.scrollY > 8);
    });

    const key = localStorage.getItem('ft_sb_key');
    if (!key) {
      this._showEmpty('Configura tu clave en la app principal para ver los datos.');
      this._renderEmptyChart();
      this._updateCreateBtn();
      return;
    }

    // Load data
    await this.loadData({ showSkeleton: true, reloadAccounts: true });
  },

  // ── MONTH NAVIGATION ─────────────────────────────────
  updateMonthLabel() {
    const el = document.getElementById('sdMonthLabel');
    if (el) el.textContent = MONTHS[FT.statusMonth] + ' ' + FT.statusYear;
  },

  async changeMonth(d) {
    FT.statusMonth += d;
    if (FT.statusMonth > 11) { FT.statusMonth = 0; FT.statusYear++; }
    if (FT.statusMonth < 0) { FT.statusMonth = 11; FT.statusYear--; }
    this.updateMonthLabel();
    await this.loadData({ showSkeleton: true });
  },

  _isCurrentMonth() {
    const now = new Date();
    return FT.statusYear === now.getFullYear() && FT.statusMonth === now.getMonth();
  },

  // ── DATA LOADING ──────────────────────────────────────
  async loadData(opts = {}) {
    const showSkeleton = !!opts.showSkeleton;
    const reloadAccounts = !!opts.reloadAccounts;
    const seq = ++this._seq;

    if (showSkeleton) {
      this._showHeroSkeleton();
      this._showCardsSkeleton();
    }

    try {
      if (reloadAccounts || !FT.statusAccounts.length) {
        await API.loadStatusAccounts();
      }

      // Fetch 6 months of data
      const monthSeries = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(FT.statusYear, FT.statusMonth - i, 1);
        monthSeries.push({ y: d.getFullYear(), m: d.getMonth() });
      }

      const reqs = monthSeries.map(m => API.fetchStatusMonth(m.y, m.m));
      const monthRows = await Promise.all(reqs);

      if (seq !== this._seq) return;

      // Build per-month latest entries by account
      const perMonthLatest = {};
      monthSeries.forEach((m, idx) => {
        perMonthLatest[`${m.y}-${m.m}`] = this._latestEntryByAccount(monthRows[idx]);
      });

      const currentKey = `${FT.statusYear}-${FT.statusMonth}`;
      const currentLatest = perMonthLatest[currentKey] || {};
      const currentEntries = Object.values(currentLatest);
      FT.statusEntries = currentEntries;

      // Prev month
      const prevDate = new Date(FT.statusYear, FT.statusMonth - 1, 1);
      const prevKey = `${prevDate.getFullYear()}-${prevDate.getMonth()}`;
      const prevLatest = perMonthLatest[prevKey] || {};

      // Calculate totals
      let total = 0, liquidityTotal = 0, investmentTotal = 0, lastDate = '';
      const rows = FT.statusAccounts.map(a => {
        const curr = currentLatest[a.id] || null;
        const prev = prevLatest[a.id] || null;
        const amount = curr ? parseAmount(curr.amount) : 0;
        total += amount;

        const accType = normText(a.type);
        if (accType === 'liquidez') liquidityTotal += amount;
        if (accType === 'inversion') investmentTotal += amount;
        if (curr && curr.statusDate && (!lastDate || curr.statusDate > lastDate)) lastDate = curr.statusDate;

        const hasPrev = !!prev;
        const prevAmount = hasPrev ? parseAmount(prev.amount) : 0;
        const delta = hasPrev ? (amount - prevAmount) : 0;
        const pct = hasPrev && prevAmount !== 0 ? ((delta / Math.abs(prevAmount)) * 100) : null;

        return {
          id: a.id,
          latestId: curr ? curr.id : '',
          name: a.name,
          icon: a.icon || 'account_balance_wallet',
          type: accType,
          typeLabel: this._typeLabel(a.type),
          amount,
          delta,
          deltaNA: !hasPrev,
          deltaPct: pct === null ? 'N/A' : pct.toFixed(1),
          sparkline: this._buildSparkline(a.id, monthSeries, perMonthLatest)
        };
      });

      if (seq !== this._seq) return;

      // Render everything
      this.renderHero({ total, liquidityTotal, investmentTotal, lastDate });
      this.renderChart(monthSeries, perMonthLatest);
      this.renderCards(rows);
      this._updateCreateBtn();

    } catch (e) {
      this._showEmpty(e.message || 'Error al cargar datos.');
    }
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

  _typeLabel(t) {
    const type = String(t || '').toLowerCase();
    if (type === 'ahorro') return 'Ahorro';
    if (type === 'liquidez') return 'Liquidez';
    if (type === 'inversion') return 'Inversión';
    return type ? type.charAt(0).toUpperCase() + type.slice(1) : '—';
  },

  _typeClass(t) {
    const type = String(t || '').toLowerCase();
    if (type === 'liquidez') return 'liquidez';
    if (type === 'inversion') return 'inversion';
    if (type === 'ahorro') return 'ahorro';
    return 'default';
  },

  // ── HERO ──────────────────────────────────────────────
  renderHero(vm) {
    const hero = document.getElementById('sdHero');
    if (!hero) return;
    hero.classList.remove('sk-loading');

    document.getElementById('sdHeroTotal').textContent = formatEUR(vm.total);
    document.getElementById('sdHeroLiquidity').textContent = formatEUR(vm.liquidityTotal);
    document.getElementById('sdHeroInvestment').textContent = formatEUR(vm.investmentTotal);
    const dateEl = document.getElementById('sdHeroDate');
    if (dateEl) dateEl.textContent = vm.lastDate ? `Último status: ${vm.lastDate}` : 'Último status: —';
  },

  _showHeroSkeleton() {
    const hero = document.getElementById('sdHero');
    if (hero) hero.classList.add('sk-loading');
  },

  // ── CHART ─────────────────────────────────────────────
  renderChart(monthSeries, perMonthLatest) {
    const canvas = document.getElementById('sdChart');
    const labelsEl = document.getElementById('sdChartLabels');
    if (!canvas || !labelsEl) return;

    // Collect total per month
    const data = monthSeries.map(m => {
      const latest = perMonthLatest[`${m.y}-${m.m}`] || {};
      let total = 0;
      FT.statusAccounts.forEach(a => {
        const e = latest[a.id];
        if (e) total += parseAmount(e.amount);
      });
      return { m: m.m, y: m.y, total };
    });

    // Use getBoundingClientRect for accurate sizing
    const parentRect = canvas.parentElement.getBoundingClientRect();
    const padStyle = getComputedStyle(canvas.parentElement);
    const pL = parseFloat(padStyle.paddingLeft) || 0;
    const pR = parseFloat(padStyle.paddingRight) || 0;
    const W = Math.round(parentRect.width - pL - pR) || 340;
    const H = 180;

    // Set canvas at 1:1 pixel ratio — avoid DPR scaling issues
    canvas.width = W;
    canvas.height = H;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';

    const ctx = canvas.getContext('2d');

    const PAD_L = 10, PAD_R = 10, PAD_T = 28, PAD_B = 6;
    const chartW = W - PAD_L - PAD_R;
    const chartH = H - PAD_T - PAD_B;
    const n = data.length;
    if (!n) return;

    const allZero = data.every(d => d.total === 0);
    const totals = data.map(d => d.total);
    const rawMax = Math.max(...totals);
    const rawMin = Math.min(...totals);
    const pad10 = (rawMax - rawMin) * 0.1 || 10;
    const rangeMax = allZero ? 100 : rawMax + pad10;
    const rangeMin = allZero ? 0 : Math.max(0, rawMin - pad10);
    const range = rangeMax - rangeMin || 1;

    ctx.clearRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = 'rgba(160,155,180,0.2)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
      const gy = Math.round(PAD_T + (chartH / 4) * i) + 0.5;
      ctx.beginPath();
      ctx.moveTo(PAD_L, gy);
      ctx.lineTo(W - PAD_R, gy);
      ctx.stroke();
    }

    // Compute points
    const points = data.map((d, i) => ({
      x: Math.round(PAD_L + (i / (n - 1 || 1)) * chartW),
      y: Math.round(PAD_T + chartH - ((d.total - rangeMin) / range) * chartH),
      total: d.total,
      m: d.m,
      y2: d.y
    }));

    if (allZero) {
      ctx.fillStyle = 'rgba(185,178,208,0.5)';
      ctx.font = '500 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Sin datos de status', W / 2, H / 2);
    } else {
      // Area fill
      const grad = ctx.createLinearGradient(0, Math.min(...points.map(p => p.y)), 0, PAD_T + chartH);
      grad.addColorStop(0, 'rgba(200,190,240,0.35)');
      grad.addColorStop(1, 'rgba(200,190,240,0.02)');
      ctx.beginPath();
      ctx.moveTo(points[0].x, PAD_T + chartH);
      for (const p of points) ctx.lineTo(p.x, p.y);
      ctx.lineTo(points[n - 1].x, PAD_T + chartH);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // Line
      ctx.beginPath();
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#CBC3EF';
      for (let i = 0; i < n; i++) {
        i === 0 ? ctx.moveTo(points[i].x, points[i].y) : ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.stroke();

      // Dots + labels
      for (let i = 0; i < n; i++) {
        const p = points[i];
        const last = (i === n - 1);
        // Dot
        ctx.beginPath();
        ctx.arc(p.x, p.y, last ? 5 : 3, 0, Math.PI * 2);
        ctx.fillStyle = last ? '#CBC3EF' : 'rgba(203,195,239,0.6)';
        ctx.fill();
        if (last) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(203,195,239,0.25)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        // Value label
        ctx.fillStyle = '#E0D8F0';
        ctx.font = last ? 'bold 11px sans-serif' : '9px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(this._shortAmount(p.total), p.x, p.y - 8);
      }
      ctx.textBaseline = 'alphabetic';
    }

    // Month labels
    labelsEl.innerHTML = '';
    const M_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    data.forEach((d, i) => {
      const span = document.createElement('span');
      span.textContent = M_SHORT[d.m];
      span.className = 'sd-chart-label' + (i === n - 1 ? ' current' : '');
      labelsEl.appendChild(span);
    });

    // Touch/click tooltip
    const _tooltip = (clientX) => {
      const cr = canvas.getBoundingClientRect();
      const relX = clientX - cr.left;
      const idx = Math.min(Math.max(Math.round((relX / cr.width) * (n - 1)), 0), n - 1);
      const d = data[idx];
      this._snack(`${M_SHORT[d.m]} ${d.y2 || d.y}: ${formatEUR(d.total)}`);
    };
    canvas.onclick = e => _tooltip(e.clientX);
    canvas.ontouchend = e => { e.preventDefault(); _tooltip(e.changedTouches[0].clientX); };
  },

  _shortAmount(n) {
    const abs = Math.abs(n);
    if (abs >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (abs >= 1000) return (n / 1000).toFixed(1) + 'k';
    return n.toFixed(0) + '€';
  },

  // Renders a placeholder chart when there's no data/key
  _renderEmptyChart() {
    const canvas = document.getElementById('sdChart');
    const labelsEl = document.getElementById('sdChartLabels');
    if (!canvas || !labelsEl) return;

    const parentRect = canvas.parentElement.getBoundingClientRect();
    const padStyle = getComputedStyle(canvas.parentElement);
    const pL = parseFloat(padStyle.paddingLeft) || 0;
    const pR = parseFloat(padStyle.paddingRight) || 0;
    const W = Math.round(parentRect.width - pL - pR) || 340;
    const H = 180;

    canvas.width = W;
    canvas.height = H;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);

    // Grid lines
    const PAD_L = 10, PAD_R = 10, PAD_T = 28, PAD_B = 6;
    const chartH = H - PAD_T - PAD_B;
    ctx.strokeStyle = 'rgba(160,155,180,0.2)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
      const gy = Math.round(PAD_T + (chartH / 4) * i) + 0.5;
      ctx.beginPath(); ctx.moveTo(PAD_L, gy); ctx.lineTo(W - PAD_R, gy); ctx.stroke();
    }

    // "Sin datos" centered text
    ctx.fillStyle = 'rgba(185,178,208,0.4)';
    ctx.font = "500 13px 'Google Sans Flex', sans-serif";
    ctx.textAlign = 'center';
    ctx.fillText('Sin datos de status', W / 2, H / 2);

    // Month labels
    labelsEl.innerHTML = '';
    const M_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(FT.statusYear, FT.statusMonth - i, 1);
      const span = document.createElement('span');
      span.textContent = M_SHORT[d.getMonth()];
      span.className = 'sd-chart-label' + (i === 0 ? ' current' : '');
      labelsEl.appendChild(span);
    }
  },

  // ── ACCOUNT CARDS ─────────────────────────────────────
  renderCards(rows) {
    const grid = document.getElementById('sdCardsGrid');
    if (!grid) return;

    if (!rows.length) {
      grid.innerHTML = `<div class="sd-empty"><span class="msr">account_balance_wallet</span><p>Sin cuentas configuradas.</p></div>`;
      return;
    }

    grid.innerHTML = rows.map(r => {
      const typeCls = this._typeClass(r.type);
      let deltaHtml;
      if (r.deltaNA) {
        deltaHtml = `<span class="sd-acc-delta neutral"><span class="msr">remove</span> N/A</span>`;
      } else if (r.delta > 0) {
        deltaHtml = `<span class="sd-acc-delta positive"><span class="msr">trending_up</span> +${formatEUR(r.delta)} (${r.deltaPct}%)</span>`;
      } else if (r.delta < 0) {
        deltaHtml = `<span class="sd-acc-delta negative"><span class="msr">trending_down</span> −${formatEUR(Math.abs(r.delta))} (${r.deltaPct}%)</span>`;
      } else {
        deltaHtml = `<span class="sd-acc-delta neutral"><span class="msr">trending_flat</span> 0,00€ (0%)</span>`;
      }

      const editBtn = r.latestId
        ? `<button class="tx-act" onclick="StatusDash.openEdit('${esc(r.latestId)}')" title="Editar"><span class="msr">edit</span></button>`
        : '';

      return `<div class="sd-account-card">
        <div class="sd-acc-icon ${typeCls}"><span class="msr">${r.icon}</span></div>
        <div class="sd-acc-body">
          <div class="sd-acc-name">${r.name}</div>
          <div class="sd-acc-type">${r.typeLabel}</div>
          ${deltaHtml}
        </div>
        <div class="sd-acc-right">
          <div class="sd-acc-amount num">${formatEUR(r.amount)}</div>
          <div class="sd-acc-sparkline">${r.sparkline}</div>
          ${editBtn}
        </div>
      </div>`;
    }).join('');
  },

  _showCardsSkeleton() {
    const grid = document.getElementById('sdCardsGrid');
    if (!grid) return;
    const skCard = `<div class="sd-sk-card">
      <div class="sd-sk-icon shimmer"></div>
      <div class="sd-sk-body">
        <div class="sd-sk-line shimmer"></div>
        <div class="sd-sk-line short shimmer"></div>
      </div>
      <div class="sd-sk-val shimmer"></div>
    </div>`;
    grid.innerHTML = skCard + skCard + skCard;
  },

  _buildSparkline(accountId, monthSeries, perMonthLatest) {
    let max = 0;
    const vals = monthSeries.map(m => {
      const e = perMonthLatest[`${m.y}-${m.m}`]?.[accountId];
      const v = e ? Number(e.amount || 0) : 0;
      max = Math.max(max, Math.abs(v));
      return v;
    });
    const top = max || 1;
    return vals.map((v, i) => {
      const h = Math.max(3, Math.round((Math.abs(v) / top) * 18));
      const isCurrent = (i === vals.length - 1);
      const cls = isCurrent ? 'current' : (v >= 0 ? 'up' : 'down');
      return `<span class="sd-spark-bar ${cls}" style="height:${h}px"></span>`;
    }).join('');
  },

  // ── CREATE BUTTON ─────────────────────────────────────
  _updateCreateBtn() {
    const btn = document.getElementById('sdCreateBtn');
    if (btn) btn.disabled = !this._isCurrentMonth();
  },

  // ── MODALS ────────────────────────────────────────────
  openAdd() {
    if (!this._isCurrentMonth()) {
      this._snack('Solo puedes crear status en el mes actual');
      return;
    }
    const box = document.getElementById('sdFormRows');
    if (!box) return;
    box.innerHTML = FT.statusAccounts.map(a => `
      <div class="field-group">
        <span class="field-label">${a.name} (${this._typeLabel(a.type)})</span>
        <input class="m3-input" data-status-account="${a.id}" type="number" step="0.01" inputmode="decimal" placeholder="0.00">
      </div>
    `).join('');
    document.getElementById('sdAddDate').value = todayStr();
    document.getElementById('sdAddModal').classList.add('show');
  },

  closeAdd() {
    document.getElementById('sdAddModal').classList.remove('show');
  },

  async saveAdd() {
    const date = document.getElementById('sdAddDate').value || todayStr();
    const fields = Array.from(document.querySelectorAll('#sdFormRows [data-status-account]'));
    const items = fields.map(f => ({
      accountId: f.dataset.statusAccount,
      amount: parseAmount(f.value || 0)
    }));

    const bar = document.getElementById('sdProgress');
    if (bar) bar.classList.add('running');

    try {
      await Promise.all(items.map(item => API.addStatusEntry({
        status_id: genId('s'),
        year: FT.statusYear,
        month: FT.statusMonth + 1,
        cuenta_id: item.accountId,
        saldo: item.amount,
        fecha_status: date,
        estado: 'activo'
      })));
      this.closeAdd();
      await this.loadData({ showSkeleton: false });
      this._snack('Status guardado ✓');
    } catch (e) {
      this._snack('Error al guardar status');
    } finally {
      if (bar) bar.classList.remove('running');
    }
  },

  openEdit(id) {
    const e = FT.statusEntries.find(x => x.id === id);
    if (!e) return;
    document.getElementById('sdEditId').value = e.id;
    document.getElementById('sdEditAmount').value = e.amount;
    document.getElementById('sdEditDate').value = e.statusDate || todayStr();
    document.getElementById('sdEditModal').classList.add('show');
  },

  closeEdit() {
    document.getElementById('sdEditModal').classList.remove('show');
  },

  async saveEdit() {
    const id = document.getElementById('sdEditId').value;
    const amount = parseAmount(document.getElementById('sdEditAmount').value || 0);
    const date = document.getElementById('sdEditDate').value || todayStr();

    const bar = document.getElementById('sdProgress');
    if (bar) bar.classList.add('running');

    try {
      await API.updateStatusEntry(id, { saldo: amount, fecha_status: date });
      this.closeEdit();
      await this.loadData({ showSkeleton: false });
      this._snack('Status actualizado ✓');
    } catch (e) {
      this._snack('Error al actualizar');
    } finally {
      if (bar) bar.classList.remove('running');
    }
  },

  // ── HELPERS ───────────────────────────────────────────
  _showEmpty(msg) {
    const grid = document.getElementById('sdCardsGrid');
    if (grid) grid.innerHTML = `<div class="sd-empty"><span class="msr">warning</span><p>${msg}</p></div>`;
  },

  _snack(msg) {
    let s = document.getElementById('sdSnackbar');
    if (!s) return;
    s.textContent = msg;
    s.className = 'snackbar show';
    if (s._t) clearTimeout(s._t);
    s._t = setTimeout(() => { s.className = 'snackbar'; s._t = null; }, 3000);
  }
};

// ===== BOOT =====
document.addEventListener('DOMContentLoaded', () => StatusDash.init());
