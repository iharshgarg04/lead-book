/* Overview: a one-screen summary across Leads and Invoices. */
(function () {
  'use strict';
  const A = window.APP; if (!A) return;
  const {$, esc} = A;

  function greet() {
    const h = new Date().getHours();
    const part = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    const name = ((A.user && A.user.displayName) || '').split(' ')[0];
    return name ? `${part}, ${name}` : part;
  }
  function render() {
    const root = $('#page-overview'); if (!root) return;
    const L = A.allLeads();
    const open = L.filter(l => !['won', 'lost', 'junk'].includes(l.status));
    const due = open.filter(l => ['overdue', 'today'].includes(A.dueState(l)))
      .sort((a, b) => String(a.nextAt).localeCompare(String(b.nextAt)));
    const hot = open.filter(l => l.rating === 'hot');
    const fresh = L.filter(l => (l.status || 'new') === 'new' && !l.nextAt);
    const IV = A.invoices;
    const invs = IV ? IV.list() : [];
    const money = IV ? IV.money : (n => '₹' + n);
    const mk = A.todayKey().slice(0, 7);
    const live = invs.filter(i => !i.cancelled);
    const month = live.filter(i => (i.date || '').startsWith(mk));
    const billedMonth = month.reduce((a, i) => a + IV.calc(i).total, 0);
    const unpaid = live.filter(i => IV.calc(i).balance > 0).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const outstanding = unpaid.reduce((a, i) => a + IV.calc(i).balance, 0);
    const recent = [...invs].sort((a, b) => (b.createdAt || b.date || '').localeCompare(a.createdAt || a.date || '')).slice(0, 6);
    const t = new Date();
    const loading = !A.db;

    const leadLine = l => `<a class="ov-line" href="#leads" data-ov-lead="${esc(l.path)}">${A.rateBadge(l.rating)}<span class="grow">${esc(A.displayName(l))}${l.company && l.name ? ` <span style="color:var(--muted)">· ${esc(l.company)}</span>` : ''}</span>${A.chip(l.status || 'new')}</a>`;
    const invLine = i => { const c = IV.calc(i); return `<a class="ov-line" href="#invoices/${esc(i.id)}"><span class="mono">#${esc(i.label)}</span><span class="grow">${esc((i.client || {}).company || '')}</span><span class="mono">${money(c.total)}</span></a>`; };
    const dueLine = i => { const c = IV.calc(i); return `<a class="ov-line" href="#invoices/${esc(i.id)}"><span class="mono">#${esc(i.label)}</span><span class="grow">${esc((i.client || {}).company || '')}</span><span class="mono" style="color:var(--warn)">${money(c.balance)}</span></a>`; };

    root.innerHTML = `
      <div class="ph"><div><h1>${esc(greet())}</h1><p class="sub">${A.WD[t.getDay()]} ${t.getDate()} ${A.MO[t.getMonth()]} · Pages Production</p></div>
        <div class="ph-actions"><a class="btn" href="#leads">Open call list</a><a class="btn primary" href="#invoices/new">New invoice</a></div></div>
      <div class="stats">
        <a class="stat ${due.length ? 'warn' : ''}" href="#leads" style="text-decoration:none;color:inherit"><div class="k">Calls due today</div><div class="v">${loading ? '—' : due.length}</div><div class="d">overdue + today</div></a>
        <a class="stat" href="#leads" style="text-decoration:none;color:inherit"><div class="k">Hot leads</div><div class="v" style="color:var(--r-hot)">${loading ? '—' : hot.length}</div><div class="d">${fresh.length} never called</div></a>
        <a class="stat" href="#invoices" style="text-decoration:none;color:inherit"><div class="k">Billed this month</div><div class="v">${money(billedMonth)}</div><div class="d">${month.length} invoice${month.length === 1 ? '' : 's'}</div></a>
        <a class="stat ${outstanding > 0 ? 'warn' : ''}" href="#invoices" style="text-decoration:none;color:inherit"><div class="k">Outstanding</div><div class="v">${money(outstanding)}</div><div class="d">${unpaid.length} unpaid invoice${unpaid.length === 1 ? '' : 's'}</div></a>
      </div>
      <div class="ov-grid">
        <section class="ov-card"><h2>Calls due today <a href="#leads">All leads →</a></h2>${due.length ? due.slice(0, 7).map(leadLine).join('') : `<div class="ov-empty">${loading ? 'Loading…' : 'Nothing due — start on fresh leads.'}</div>`}</section>
        <section class="ov-card"><h2>Hot leads <a href="#leads">View →</a></h2>${hot.length ? hot.slice(0, 7).map(leadLine).join('') : `<div class="ov-empty">${loading ? 'Loading…' : 'No hot leads yet — rate leads after a call.'}</div>`}</section>
        <section class="ov-card"><h2>Unpaid invoices <a href="#invoices">View →</a></h2>${unpaid.length ? unpaid.slice(0, 7).map(dueLine).join('') : `<div class="ov-empty">${loading ? 'Loading…' : 'All invoices are paid.'}</div>`}</section>
        <section class="ov-card"><h2>Recent invoices <a href="#invoices/new">New →</a></h2>${recent.length ? recent.map(invLine).join('') : `<div class="ov-empty">${loading ? 'Loading…' : 'No invoices yet.'}</div>`}</section>
      </div>`;
  }
  A.pages.overview = {render};
  const rerender = () => { if (A.S.page === 'overview') render(); };
  A.on('leads', rerender);
  A.on('invoices', rerender);
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-ov-lead]'); if (!a) return;
    const path = a.dataset.ovLead;
    setTimeout(() => A.openLead(path), 30);
  });
})();
