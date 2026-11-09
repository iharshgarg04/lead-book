/* Invoices module: history + filters, single editor with live preview, detail page,
   bulk creation, PDF/ZIP downloads, and business settings. Data lives in Firestore:
   invoices/{id}, settings/business, settings/counters. */
(function () {
  'use strict';
  const A = window.APP, P = window.InvoicePDF;
  if (!A || !P) return;
  const {$, $$, esc, toast, opt} = A;

  /* ---------- defaults (from the Pages Production invoice format) ---------- */
  // Business details live only in Firestore (settings/business) — never in this public code.
  const blankProfile = prefix => ({legalName: '', gstin: '', address: '', pan: '', terms: '', prefix});
  const DEFAULTS = {taxRate: 18, logo: '', profiles: {gst: blankProfile(''), nongst: blankProfile('NG-')}};
  const COUNTER_DEFAULT = {gst: 301, nongst: 1};
  const TYPE_LABEL = {gst: 'GST', nongst: 'Non-GST'};
  const STATUS = [['unpaid', 'Unpaid'], ['partial', 'Partly paid'], ['paid', 'Paid'], ['cancelled', 'Cancelled']];
  const STATUS_LABEL = Object.fromEntries(STATUS);
  const IC = {
    dl: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  };

  const clone = o => JSON.parse(JSON.stringify(o));
  const IV = {
    list: [], loaded: false, err: null,
    settings: clone(DEFAULTS), counters: {...COUNTER_DEFAULT},
    f: {q: '', type: '', status: '', client: '', year: '', mon: '', from: '', to: '', sort: 'newest'},
    sel: new Set(), shown: 100, view: '', draft: null, editId: null, bulk: null, bulkResult: null,
    settingsDirty: false,
  };
  const LSF = 'pagesdesk.invoices.f', LSB = 'pagesdesk.invoices.bulk';
  try { Object.assign(IV.f, JSON.parse(localStorage.getItem(LSF) || '{}')); } catch (e) {}
  const saveF = () => { try { localStorage.setItem(LSF, JSON.stringify(IV.f)); } catch (e) {} };

  /* ---------- helpers ---------- */
  const money = P.money;
  const num = v => { const n = parseFloat(String(v == null ? '' : v).replace(/[₹,\s]/g, '')); return isFinite(n) ? n : 0; };
  const today = () => A.todayKey();
  const nowIso = () => new Date().toISOString();
  function mergeSettings(d) {
    const s = clone(DEFAULTS);
    if (!d) return s;
    if (d.taxRate != null) s.taxRate = Number(d.taxRate) || 0;
    if (typeof d.logo === 'string') s.logo = d.logo;
    for (const t of ['gst', 'nongst']) Object.assign(s.profiles[t], (d.profiles || {})[t] || {});
    return s;
  }
  function calc(inv) { return P.totals(inv); }
  function statusOf(inv) {
    if (inv.cancelled) return 'cancelled';
    const t = calc(inv);
    if (t.total > 0 && t.balance <= 0) return 'paid';
    return t.paid > 0 ? 'partial' : 'unpaid';
  }
  const stPill = st => `<span class="ist" data-st="${st}">${esc(STATUS_LABEL[st])}</span>`;
  const tyPill = t => `<span class="ity" data-t="${t}">${esc(TYPE_LABEL[t] || t)}</span>`;
  const nextLabel = type => `${IV.settings.profiles[type].prefix || ''}${IV.counters[type]}`;
  const byId = id => IV.list.find(x => x.id === id);
  const fmtD = P.fmtDate;
  function forPdf(inv) { return Object.assign({}, inv, {logo: IV.settings.logo || ''}); }

  async function downloadOne(inv) {
    try { toast('Preparing PDF…'); await P.download(forPdf(inv), A.download); toast(`Downloaded invoice ${inv.label}`); }
    catch (e) { console.error(e); toast('Couldn’t create the PDF: ' + (e.message || 'unknown error')); }
  }
  async function downloadMany(invs, name) {
    if (!invs.length) { toast('No invoices to download.'); return; }
    if (invs.length === 1) return downloadOne(invs[0]);
    try {
      await P.zip(invs.map(forPdf), name || `Invoices ${today()}.zip`, A.download, (i, n) => toast(`Creating PDFs… ${i} of ${n}`));
      toast(`Downloaded ${invs.length} invoices (ZIP)`);
    } catch (e) { console.error(e); toast('Couldn’t create the ZIP: ' + (e.message || 'unknown error')); }
  }

  /* ---------- numbering ---------- */
  async function reserve(type, n) {
    const ref = A.db.doc('settings/counters');
    return A.db.runTransaction(async tx => {
      const s = await tx.get(ref);
      const cur = (s.exists && Number(s.data()[type])) || COUNTER_DEFAULT[type];
      tx.set(ref, {[type]: cur + n}, {merge: true});
      return cur;
    });
  }
  async function bumpPast(type, number) {
    const ref = A.db.doc('settings/counters');
    return A.db.runTransaction(async tx => {
      const s = await tx.get(ref);
      const cur = (s.exists && Number(s.data()[type])) || COUNTER_DEFAULT[type];
      if (number >= cur) tx.set(ref, {[type]: number + 1}, {merge: true});
    });
  }
  const isDup = (type, label, exceptId) => IV.list.some(x => x.id !== exceptId && x.type === type && String(x.label) === String(label));

  /* ---------- data ---------- */
  A.onReady(db => {
    db.collection('invoices').onSnapshot(snap => {
      IV.list = snap.docs.map(d => Object.assign({id: d.id}, d.data()));
      IV.loaded = true; IV.err = null;
      for (const id of [...IV.sel]) if (!byId(id)) IV.sel.delete(id);
      refresh(); A.emit('invoices');
    }, err => { IV.err = err && err.code; IV.loaded = true; refresh(); });
    db.doc('settings/business').onSnapshot(d => {
      IV.settings = mergeSettings(d.exists ? d.data() : null);
      if (A.S.page === 'settings' && !IV.settingsDirty) renderSettings();
      if (A.S.page === 'invoices' && IV.view === 'edit') updatePreview();
    }, () => {});
    db.doc('settings/counters').onSnapshot(d => {
      const v = d.exists ? d.data() : {};
      IV.counters = {gst: Number(v.gst) || COUNTER_DEFAULT.gst, nongst: Number(v.nongst) || COUNTER_DEFAULT.nongst};
      if (A.S.page === 'invoices' && IV.view === 'edit') { const h = $('#ed-num-hint'); if (h) h.textContent = numHint(); }
      if (A.S.page === 'settings' && !IV.settingsDirty) renderSettings();
    }, () => {});
  });
  function refresh() {
    updateNavCount();
    if (A.S.page !== 'invoices') return;
    if (IV.view === 'list') renderListBody();
    else if (IV.view === 'detail') renderDetail(IV.editId, true);
  }
  function updateNavCount() {
    const unpaid = IV.list.filter(x => ['unpaid', 'partial'].includes(statusOf(x))).length;
    $$('#nav-invoices, .bottom-nav [data-count="invoices"]').forEach(n => { n.textContent = unpaid ? String(unpaid) : ''; n.hidden = !unpaid; });
  }

  /* ---------- router ---------- */
  A.pages.invoices = {
    render(rest) {
      const [path, query] = rest.split('?');
      const qs = new URLSearchParams(query || '');
      const root = $('#page-invoices');
      if (!path) return renderList(root);
      if (path === 'new') return renderEditor(root, null, {lead: qs.get('lead'), from: qs.get('from'), type: qs.get('type')});
      if (path === 'bulk') return renderBulk(root);
      const [id, sub] = path.split('/');
      if (sub === 'edit') return renderEditor(root, id, {});
      return renderDetail(id);
    },
  };
  A.pages.settings = {render() { IV.settingsDirty = false; renderSettings(); }};
  function loadingHTML(msg) { return `<div class="skeleton">${'<div></div>'.repeat(3)}</div><p class="meta-line" style="margin-top:12px">${esc(msg || 'Loading invoices…')}</p>`; }

  /* ======================================================================
     LIST
     ====================================================================== */
  function renderList(root) {
    IV.view = 'list'; IV.editId = null;
    root.innerHTML = `
      <div class="ph"><div><h1>Invoices</h1><p class="sub">GST and non-GST invoices for Pages Production</p></div>
        <div class="ph-actions"><a class="btn" href="#invoices/bulk">${IC.plus}Create multiple</a><a class="btn primary" href="#invoices/new">${IC.plus}New invoice</a></div></div>
      <div class="stats" id="iv-stats"></div>
      <div class="filters">
        <div class="search">${IC.search}<label class="sr" for="iv-q">Search invoices</label><input id="iv-q" type="search" placeholder="Search client, invoice #, item, GSTIN…" autocomplete="off"></div>
        <div class="seg" role="group" aria-label="Invoice type" id="iv-type">
          <button type="button" data-ia="ftype" data-v="">All</button><button type="button" data-ia="ftype" data-v="gst">GST</button><button type="button" data-ia="ftype" data-v="nongst">Non-GST</button>
        </div>
        <label class="sr" for="iv-status">Status</label><select id="iv-status"></select>
        <label class="sr" for="iv-client">Client</label><select id="iv-client"></select>
        <label class="sr" for="iv-mon">Month</label><select id="iv-mon"></select>
        <label class="sr" for="iv-year">Year</label><select id="iv-year"></select>
        <label class="fl" style="flex-direction:row;align-items:center;gap:6px" for="iv-from">From<input type="date" id="iv-from"></label>
        <label class="fl" style="flex-direction:row;align-items:center;gap:6px" for="iv-to">To<input type="date" id="iv-to"></label>
        <label class="sr" for="iv-sort">Sort</label><select id="iv-sort"></select>
      </div>
      <div class="result-line"><span id="iv-count"></span><span style="display:flex;gap:6px;flex-wrap:wrap"><button type="button" class="btn small" data-ia="dl-filtered">${IC.dl}Download these</button><button type="button" class="btn link small" data-ia="fclear" id="iv-clear">Clear filters</button></span></div>
      <div class="list" id="iv-list"></div>
      <div id="iv-selbar"></div>`;
    renderListBody(true);
  }
  function filterInv(f, skip) {
    const q = (f.q || '').trim().toLowerCase();
    return IV.list.filter(inv => {
      if (skip !== 'type' && f.type && inv.type !== f.type) return false;
      if (skip !== 'status' && f.status && statusOf(inv) !== f.status) return false;
      if (skip !== 'client' && f.client && ((inv.client || {}).company || '').trim().toLowerCase() !== f.client) return false;
      const d = inv.date || '';
      if (skip !== 'date' && f.year && d.slice(0, 4) !== f.year) return false;
      if (skip !== 'date' && f.mon && d.slice(5, 7) !== f.mon) return false;
      if (f.from && d < f.from) return false;
      if (f.to && d > f.to) return false;
      if (q) {
        const c = inv.client || {};
        const hay = [inv.label, c.company, c.gstin, c.address, c.email, inv.notes, ...(inv.items || []).map(i => i.desc)].join(' ').toLowerCase();
        if (!q.split(/\s+/).every(w => hay.includes(w))) return false;
      }
      return true;
    });
  }
  const SORTS = {
    newest: ['Newest first', (a, b) => (b.date || '').localeCompare(a.date || '') || (b.number || 0) - (a.number || 0)],
    oldest: ['Oldest first', (a, b) => (a.date || '').localeCompare(b.date || '') || (a.number || 0) - (b.number || 0)],
    high: ['Amount: high to low', (a, b) => calc(b).total - calc(a).total],
    low: ['Amount: low to high', (a, b) => calc(a).total - calc(b).total],
    due: ['Balance due', (a, b) => calc(b).balance - calc(a).balance],
    number: ['Invoice number', (a, b) => (a.type || '').localeCompare(b.type || '') || (b.number || 0) - (a.number || 0)],
  };
  function renderFilterOptions() {
    const f = IV.f;
    $$('#iv-type button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === f.type)));
    const base = filterInv(f, 'status');
    const sc = {}; base.forEach(i => { const s = statusOf(i); sc[s] = (sc[s] || 0) + 1; });
    $('#iv-status').innerHTML = opt('', 'Any status', f.status) + STATUS.map(([k, l]) => opt(k, `${l} · ${sc[k] || 0}`, f.status)).join('');
    const clients = new Map();
    for (const i of IV.list) { const n = ((i.client || {}).company || '').trim(); if (n) { const k = n.toLowerCase(); const c = clients.get(k) || {name: n, n: 0}; c.n++; clients.set(k, c); } }
    $('#iv-client').innerHTML = opt('', 'All clients', f.client) + [...clients.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name)).map(([k, c]) => opt(k, `${c.name} · ${c.n}`, f.client)).join('');
    const years = new Map(), mons = new Map();
    for (const i of filterInv(f, 'date')) {
      const y = (i.date || '').slice(0, 4), m = (i.date || '').slice(5, 7);
      if (!y) continue;
      if (!f.mon || m === f.mon) years.set(y, (years.get(y) || 0) + 1);
      if (!f.year || y === f.year) mons.set(m, (mons.get(m) || 0) + 1);
    }
    $('#iv-year').innerHTML = opt('', 'Any year', f.year) + [...years.keys()].sort().reverse().map(y => opt(y, `${y} · ${years.get(y)}`, f.year)).join('');
    $('#iv-mon').innerHTML = opt('', 'Any month', f.mon) + A.MONTH_FULL.map((n, i) => { const k = A.pad(i + 1); const c = mons.get(k) || 0; return c || k === f.mon ? opt(k, `${n} · ${c}`, f.mon) : ''; }).join('');
    $('#iv-sort').innerHTML = Object.entries(SORTS).map(([k, [l]]) => opt(k, 'Sort: ' + l, f.sort)).join('');
    if (document.activeElement !== $('#iv-q')) $('#iv-q').value = f.q;
    $('#iv-from').value = f.from; $('#iv-to').value = f.to;
  }
  function renderListBody(first) {
    if (!$('#iv-list')) return;
    renderFilterOptions();
    const f = IV.f;
    const list = filterInv(f).sort((SORTS[f.sort] || SORTS.newest)[1]);
    IV.filtered = list;
    const live = list.filter(i => !i.cancelled);
    const sum = k => live.reduce((a, i) => a + calc(i)[k], 0);
    const unpaidN = live.filter(i => calc(i).balance > 0).length;
    $('#iv-stats').innerHTML = [
      ['Invoices', String(list.length), `${list.filter(i => i.type === 'gst').length} GST · ${list.filter(i => i.type === 'nongst').length} non-GST`],
      ['Billed', money(sum('total')), 'excluding cancelled'],
      ['Received', money(sum('paid')), '', 'good'],
      ['Outstanding', money(sum('balance')), `${unpaidN} invoice${unpaidN === 1 ? '' : 's'} unpaid`, sum('balance') > 0 ? 'warn' : ''],
      ['GST collected', money(live.filter(i => i.type === 'gst').reduce((a, i) => a + calc(i).tax, 0)), 'on GST invoices'],
    ].map(([k, v, d, cls]) => `<div class="stat ${cls || ''}"><div class="k">${k}</div><div class="v">${v}</div>${d ? `<div class="d">${esc(d)}</div>` : ''}</div>`).join('');
    const active = f.q || f.type || f.status || f.client || f.year || f.mon || f.from || f.to;
    $('#iv-count').textContent = `${list.length} of ${IV.list.length} invoices`;
    $('#iv-clear').hidden = !active;
    const root = $('#iv-list');
    if (!IV.loaded) { root.innerHTML = `<div class="empty" style="border:0">${A.db ? 'Loading invoices…' : 'Sign in to see invoices.'}</div>`; renderSelbar(); return; }
    if (IV.err) { root.innerHTML = `<div class="empty" style="border:0"><strong>Couldn’t load invoices</strong>${esc(IV.err === 'permission-denied' ? 'This account doesn’t have access.' : IV.err)}</div>`; return; }
    if (!list.length) {
      root.innerHTML = IV.list.length ? `<div class="empty" style="border:0"><strong>No invoices match</strong>Try removing a filter.</div>`
        : `<div class="empty" style="border:0"><strong>No invoices yet</strong>Create your first one — it continues from invoice #${esc(nextLabel('gst'))}.<div style="margin-top:12px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap"><a class="btn" href="#invoices/bulk">Create multiple</a><a class="btn primary" href="#invoices/new">New invoice</a></div></div>`;
      renderSelbar(); return;
    }
    const allSel = list.slice(0, IV.shown).every(i => IV.sel.has(i.id));
    root.innerHTML = `<div class="irow-head"><div><input type="checkbox" data-ia="selall" aria-label="Select all shown" ${allSel ? 'checked' : ''}></div><div>Invoice</div><div>Date</div><div>Client</div><div class="c-type">Type</div><div class="r">Amount</div><div class="r c-bal">Balance</div><div>Status</div><div></div></div>` +
      list.slice(0, IV.shown).map(inv => {
        const t = calc(inv), st = statusOf(inv), c = inv.client || {};
        const items = (inv.items || []).map(i => i.desc).filter(Boolean);
        return `<div class="irow" data-ia="open" data-id="${esc(inv.id)}" tabindex="0">
          <div class="c-ck"><input type="checkbox" data-ia="sel" data-id="${esc(inv.id)}" aria-label="Select invoice ${esc(inv.label)}" ${IV.sel.has(inv.id) ? 'checked' : ''}></div>
          <div class="num c-num">#${esc(inv.label)}</div>
          <div class="c-date mono" style="font-size:13px">${esc(fmtD(inv.date))}</div>
          <div class="cl"><strong>${esc(c.company || '—')}</strong><span>${esc(items.join(', ') || '—')}</span></div>
          <div class="c-meta"><span class="mono">#${esc(inv.label)}</span>${tyPill(inv.type)}<span>${esc(fmtD(inv.date))}</span></div>
          <div class="c-type">${tyPill(inv.type)}</div>
          <div class="amt c-tot">${money(t.total)}</div>
          <div class="amt c-bal ${t.balance > 0 && st !== 'cancelled' ? 'due' : 'zero'}">${money(st === 'cancelled' ? 0 : t.balance)}</div>
          <div class="c-st">${stPill(st)}</div>
          <div class="c-dl"><button type="button" class="icon-dl" data-ia="dl" data-id="${esc(inv.id)}" title="Download PDF" aria-label="Download invoice ${esc(inv.label)}">${IC.dl}</button></div>
        </div>`;
      }).join('') +
      (list.length > IV.shown ? `<div style="padding:14px;text-align:center;border-top:1px solid var(--line)"><button class="btn small" type="button" data-ia="more">Show ${Math.min(100, list.length - IV.shown)} more</button></div>` : '');
    renderSelbar();
  }
  function renderSelbar() {
    const el = $('#iv-selbar'); if (!el) return;
    const sel = IV.list.filter(i => IV.sel.has(i.id));
    if (!sel.length) { el.innerHTML = ''; return; }
    const tot = sel.reduce((a, i) => a + calc(i).total, 0);
    el.innerHTML = `<div class="selbar"><b>${sel.length} selected</b><span class="mono" style="opacity:.8">${money(tot)}</span><span class="grow"></span>
      <button type="button" class="btn small" data-ia="sel-dl">${IC.dl}Download PDFs</button>
      <button type="button" class="btn small" data-ia="sel-paid">Mark paid</button>
      <button type="button" class="btn small" data-ia="sel-clear">Clear</button></div>`;
  }

  /* ======================================================================
     EDITOR (new / edit / duplicate / from lead)
     ====================================================================== */
  function blankDraft(type) {
    return {type: type || 'gst', numberMode: 'auto', number: '', date: today(), dueDate: '',
      client: {company: '', address: '', gstin: '', pan: '', email: '', phone: ''},
      items: [{desc: '', qty: 1, rate: ''}], taxRate: IV.settings.taxRate, paid: 0, notes: '',
      terms: IV.settings.profiles[type || 'gst'].terms, termsEdited: false, leadPath: '', seller: null};
  }
  function draftFrom(inv, copy) {
    const d = blankDraft(inv.type);
    Object.assign(d, {
      type: inv.type, date: copy ? today() : inv.date, dueDate: copy ? '' : (inv.dueDate || ''),
      client: Object.assign(d.client, clone(inv.client || {})), items: clone(inv.items || []),
      taxRate: inv.taxRate != null ? inv.taxRate : IV.settings.taxRate, paid: copy ? 0 : (calc(inv).paid || 0),
      notes: inv.notes || '', terms: (inv.seller || {}).terms || IV.settings.profiles[inv.type].terms, termsEdited: true,
      leadPath: copy ? '' : (inv.leadPath || ''), seller: copy ? null : clone(inv.seller || null),
    });
    if (!copy) { d.numberMode = 'manual'; d.number = String(inv.number || ''); }
    if (!d.items.length) d.items = [{desc: '', qty: 1, rate: ''}];
    return d;
  }
  const numHint = () => IV.draft && IV.draft.numberMode === 'auto' ? `Auto: next ${TYPE_LABEL[IV.draft.type]} number is ${nextLabel(IV.draft.type)}` : 'Typed by you — must not repeat an existing invoice';
  function draftInvoice() {
    const d = IV.draft, prof = IV.settings.profiles[d.type];
    const seller = Object.assign({}, d.seller && d.seller.__type === d.type ? d.seller : prof, {terms: d.terms});
    delete seller.__type; delete seller.prefix;
    const number = d.numberMode === 'auto' ? IV.counters[d.type] : (parseInt(d.number, 10) || d.number);
    return {type: d.type, number, label: `${prof.prefix || ''}${number}`, date: d.date, dueDate: d.dueDate, seller, client: d.client,
      items: d.items.map(i => ({desc: i.desc, qty: num(i.qty), rate: num(i.rate)})), taxRate: d.type === 'gst' ? num(d.taxRate) : 0,
      paid: num(d.paid), notes: d.notes};
  }
  function renderEditor(root, id, opts) {
    IV.view = 'edit'; IV.editId = id || null;
    if (id) {
      const inv = byId(id);
      if (!inv) { root.innerHTML = IV.loaded ? `<div class="empty" style="margin-top:24px"><strong>Invoice not found</strong><a href="#invoices">Back to invoices</a></div>` : loadingHTML(); if (!IV.loaded) waitThen(() => A.route()); return; }
      IV.draft = draftFrom(inv, false);
      if (inv.seller) IV.draft.seller = Object.assign(clone(inv.seller), {__type: inv.type});
    } else if (opts.from) {
      const src = byId(opts.from);
      if (!src) { root.innerHTML = loadingHTML(); waitThen(() => A.route()); return; }
      IV.draft = draftFrom(src, true);
    } else {
      IV.draft = blankDraft(opts.type === 'nongst' ? 'nongst' : 'gst');
      if (opts.lead) {
        const l = A.getLead(opts.lead);
        if (l) { Object.assign(IV.draft.client, {company: l.company || l.name || '', email: l.email || '', phone: l.phone || ''}); IV.draft.leadPath = l.path; fillFromPast(true); }
      }
    }
    const d = IV.draft;
    const title = id ? `Edit invoice #${esc(byId(id).label)}` : opts.from ? 'Duplicate invoice' : 'New invoice';
    const clients = pastClients();
    root.innerHTML = `
      <div class="crumbs"><a href="#invoices">Invoices</a><span>/</span><span>${title}</span></div>
      <div class="ph"><div><h1>${title}</h1>${d.leadPath ? `<p class="sub">For lead: ${esc(A.displayName(A.getLead(d.leadPath) || {}))}</p>` : ''}</div></div>
      <div class="ed">
        <form class="panel" id="ed-form" novalidate>
          <div class="fsec">
            <h3>Invoice type</h3>
            <div class="seg" role="group" aria-label="Invoice type"><button type="button" data-ia="etype" data-v="gst">GST invoice</button><button type="button" data-ia="etype" data-v="nongst">Non-GST invoice</button></div>
            <div class="fgrid three">
              <label class="fl" for="ed-number">Invoice #<input id="ed-number" type="text" inputmode="numeric" placeholder="Auto" value="${esc(d.numberMode === 'manual' ? d.number : '')}"><span class="hint" id="ed-num-hint">${esc(numHint())}</span></label>
              <label class="fl" for="ed-date">Date<input id="ed-date" type="date" value="${esc(d.date)}" required></label>
              <label class="fl" for="ed-due">Due date <span class="hint">optional</span><input id="ed-due" type="date" value="${esc(d.dueDate)}"></label>
            </div>
          </div>
          <div class="fsec">
            <h3>Bill to <span class="grow"></span><button type="button" class="btn small" data-ia="pick-lead">Pick from leads</button></h3>
            <label class="fl" for="ed-company">Company name<input id="ed-company" data-f="client.company" type="text" list="ed-clients" autocomplete="off" value="${esc(d.client.company)}" required><datalist id="ed-clients">${clients.map(c => `<option value="${esc(c.company)}"></option>`).join('')}</datalist></label>
            <label class="fl" for="ed-address">Billing address<textarea id="ed-address" data-f="client.address" rows="3">${esc(d.client.address)}</textarea></label>
            <div class="fgrid">
              <label class="fl" for="ed-gstin">GST number <span class="hint">optional</span><input id="ed-gstin" data-f="client.gstin" type="text" autocomplete="off" value="${esc(d.client.gstin)}" style="text-transform:uppercase"></label>
              <label class="fl" for="ed-pan">PAN number <span class="hint">optional</span><input id="ed-pan" data-f="client.pan" type="text" autocomplete="off" value="${esc(d.client.pan)}" style="text-transform:uppercase"></label>
              <label class="fl" for="ed-email">Email <span class="hint">not printed</span><input id="ed-email" data-f="client.email" type="email" value="${esc(d.client.email)}"></label>
              <label class="fl" for="ed-phone">Phone <span class="hint">not printed</span><input id="ed-phone" data-f="client.phone" type="tel" value="${esc(d.client.phone)}"></label>
            </div>
          </div>
          <div class="fsec">
            <h3>Items</h3>
            <div class="item-head"><span>Item</span><span>Qty</span><span>Rate (₹)</span><span>Amount</span><span></span></div>
            <div class="items" id="ed-items"></div>
            <div><button type="button" class="btn small" data-ia="add-item">${IC.plus}Add item</button></div>
          </div>
          <div class="fsec">
            <h3>Totals</h3>
            <div class="fgrid">
              <label class="fl" for="ed-tax" id="ed-tax-wrap">GST rate<select id="ed-tax">${[0, 5, 12, 18, 28].map(r => opt(String(r), r + '%', String(num(d.taxRate)))).join('')}</select></label>
              <label class="fl" for="ed-paid">Amount received (₹) <span class="hint">leave 0 if unpaid</span><input id="ed-paid" type="text" inputmode="decimal" value="${esc(d.paid || 0)}"></label>
            </div>
            <div class="totals" id="ed-totals"></div>
          </div>
          <div class="fsec">
            <h3>Notes &amp; terms</h3>
            <label class="fl" for="ed-notes">Notes <span class="hint">optional, printed above terms</span><textarea id="ed-notes" rows="2" placeholder="e.g. Deliverables: 3 UGC videos, 2 revisions">${esc(d.notes)}</textarea></label>
            <label class="fl" for="ed-terms">Terms / bank details <span class="hint">from Settings — edit for this invoice only</span><textarea id="ed-terms" rows="6">${esc(d.terms)}</textarea></label>
          </div>
          <p class="form-err" id="ed-err" role="alert" style="padding:0 18px"></p>
          <div class="ed-actions">
            <a class="btn" href="${id ? '#invoices/' + esc(id) : '#invoices'}">Cancel</a>
            <button type="button" class="btn" data-ia="save" data-dl="1">${IC.dl}Save &amp; download</button>
            <button type="submit" class="btn primary">${id ? 'Save changes' : 'Create invoice'}</button>
          </div>
        </form>
        <div class="paper-col">
          <div class="pv-bar"><span>Live preview — the PDF looks exactly like this</span><button type="button" class="btn small" data-ia="preview-pdf">${IC.dl}Preview PDF</button></div>
          <div class="paper-wrap" id="ed-preview">${loadingHTML('Loading preview…')}</div>
        </div>
      </div>`;
    syncTypeUI(); renderItems(); renderTotals(); updatePreview(); warnSeller();
  }
  function warnSeller() {
    const p = IV.settings.profiles[IV.draft ? IV.draft.type : 'gst'];
    const el = $('#ed-err'); if (!el) return;
    el.innerHTML = p.legalName ? '' : `Your business details for ${TYPE_LABEL[IV.draft.type]} invoices are empty — <a href="#settings">add them in Settings</a> first.`;
  }
  function syncTypeUI() {
    const d = IV.draft;
    $$('#ed-form [data-ia="etype"]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === d.type)));
    const tw = $('#ed-tax-wrap'); if (tw) tw.hidden = d.type !== 'gst';
    const h = $('#ed-num-hint'); if (h) h.textContent = numHint();
    const n = $('#ed-number'); if (n) n.placeholder = d.numberMode === 'auto' ? `Auto (${nextLabel(d.type)})` : '';
  }
  function renderItems() {
    $('#ed-items').innerHTML = IV.draft.items.map((it, i) => `<div class="item">
      <label class="sr" for="it-d-${i}">Item ${i + 1} description</label><textarea id="it-d-${i}" data-item="${i}" data-k="desc" rows="1" placeholder="e.g. 1 Story Reshare">${esc(it.desc)}</textarea>
      <label class="sr" for="it-q-${i}">Quantity</label><input id="it-q-${i}" data-item="${i}" data-k="qty" type="text" inputmode="decimal" value="${esc(it.qty)}">
      <label class="sr" for="it-r-${i}">Rate</label><input id="it-r-${i}" data-item="${i}" data-k="rate" type="text" inputmode="decimal" placeholder="0.00" value="${esc(it.rate)}">
      <span class="amt" id="it-a-${i}">${money(num(it.qty) * num(it.rate))}</span>
      <button type="button" class="x-btn" data-ia="rm-item" data-i="${i}" aria-label="Remove item ${i + 1}" ${IV.draft.items.length < 2 ? 'disabled' : ''}>${IC.x}</button>
    </div>`).join('');
  }
  function renderTotals() {
    const t = calc(draftInvoice());
    const rows = [['Subtotal', money(t.subtotal)]];
    if (IV.draft.type === 'gst') rows.push([`GST (${t.rate}%)`, money(t.tax)]);
    rows.push(['Total', money(t.total)]);
    if (t.paid > 0) rows.push(['Received', money(t.paid)]);
    rows.push(['Balance due', money(t.balance)]);
    $('#ed-totals').innerHTML = rows.map(([k, v], i) => `<span class="${k === 'Total' || k === 'Balance due' ? 'big' : ''}">${k}</span><span class="${k === 'Total' || k === 'Balance due' ? 'big' : ''}">${v}</span>`).join('');
  }
  let pvTimer = 0, pvSeq = 0;
  function updatePreview() {
    clearTimeout(pvTimer);
    pvTimer = setTimeout(async () => {
      const el = $('#ed-preview'); if (!el || !IV.draft) return;
      const seq = ++pvSeq;
      try {
        const html = await P.toHTML(forPdf(draftInvoice()));
        if (seq !== pvSeq || !$('#ed-preview')) return;
        el.innerHTML = html; P.fitPreview(el);
      } catch (e) { el.innerHTML = `<div class="empty">Preview unavailable: ${esc(e.message || 'error')}</div>`; }
    }, 120);
  }
  function pastClients() {
    const m = new Map();
    for (const inv of [...IV.list].sort((a, b) => (b.date || '').localeCompare(a.date || ''))) {
      const c = inv.client || {}; const k = (c.company || '').trim().toLowerCase();
      if (k && !m.has(k)) m.set(k, c);
    }
    return [...m.values()];
  }
  function fillFromPast(silent) {
    const d = IV.draft, k = (d.client.company || '').trim().toLowerCase(); if (!k) return false;
    const c = pastClients().find(x => (x.company || '').trim().toLowerCase() === k); if (!c) return false;
    let changed = false;
    for (const f of ['address', 'gstin', 'pan', 'email', 'phone']) if (!d.client[f] && c[f]) { d.client[f] = c[f]; changed = true; }
    if (changed && !silent) {
      for (const f of ['address', 'gstin', 'pan', 'email', 'phone']) { const el = $(`#ed-form [data-f="client.${f}"]`); if (el) el.value = d.client[f] || ''; }
      toast('Filled the client’s details from their last invoice');
    }
    return changed;
  }
  function readEditorField(el) {
    const d = IV.draft;
    if (el.dataset.f) { const k = el.dataset.f.split('.')[1]; d.client[k] = (k === 'gstin' || k === 'pan') ? el.value.toUpperCase() : el.value; return; }
    if (el.dataset.item != null) {
      const it = d.items[Number(el.dataset.item)]; if (!it) return;
      it[el.dataset.k] = el.value;
      const a = $(`#it-a-${el.dataset.item}`); if (a) a.textContent = money(num(it.qty) * num(it.rate));
      return;
    }
    switch (el.id) {
      case 'ed-number': d.number = el.value.trim(); d.numberMode = d.number ? 'manual' : 'auto'; syncTypeUI(); break;
      case 'ed-date': d.date = el.value; break;
      case 'ed-due': d.dueDate = el.value; break;
      case 'ed-tax': d.taxRate = num(el.value); break;
      case 'ed-paid': d.paid = el.value; break;
      case 'ed-notes': d.notes = el.value; break;
      case 'ed-terms': d.terms = el.value; d.termsEdited = true; break;
    }
  }
  async function saveInvoice(andDownload) {
    const d = IV.draft, err = $('#ed-err'); err.textContent = '';
    if (!A.db) { err.textContent = 'Not connected — sign in first.'; return; }
    const items = d.items.map(i => ({desc: String(i.desc || '').trim(), qty: num(i.qty), rate: num(i.rate)})).filter(i => i.desc || i.rate);
    if (!d.client.company.trim()) { err.textContent = 'Add the client’s company name.'; $('#ed-company').focus(); return; }
    if (!items.length) { err.textContent = 'Add at least one item with a description and rate.'; return; }
    if (items.some(i => !i.desc)) { err.textContent = 'Every item needs a description.'; return; }
    if (items.some(i => i.qty <= 0)) { err.textContent = 'Quantities must be more than 0.'; return; }
    if (!d.date) { err.textContent = 'Pick the invoice date.'; return; }
    if (d.numberMode === 'manual' && !/^\d+$/.test(d.number)) { err.textContent = 'The invoice number should be digits only (the prefix is added from Settings).'; return; }
    const prof = IV.settings.profiles[d.type];
    const btns = $$('#ed-form button'); btns.forEach(b => b.disabled = true);
    try {
      let number;
      if (d.numberMode === 'manual') {
        number = parseInt(d.number, 10);
        if (isDup(d.type, `${prof.prefix || ''}${number}`, IV.editId)) { err.textContent = `Invoice ${prof.prefix || ''}${number} already exists. Use another number or leave it blank for auto.`; btns.forEach(b => b.disabled = false); return; }
      } else number = await reserve(d.type, 1);
      const base = draftInvoice();
      const inv = Object.assign(base, {number, label: `${prof.prefix || ''}${number}`, prefix: prof.prefix || '', items});
      const t = calc(inv);
      const prev = IV.editId ? byId(IV.editId) : null;
      const payments = prev && Array.isArray(prev.payments) ? prev.payments : [];
      const doc = Object.assign(inv, {subtotal: t.subtotal, tax: t.tax, total: t.total, paid: t.paid, balance: t.balance,
        leadPath: d.leadPath || '', updatedAt: nowIso(), updatedBy: A.meId, payments});
      doc.status = statusOf(doc);
      if (prev && prev.cancelled) doc.cancelled = true;
      let id = IV.editId;
      if (id) await A.db.doc(`invoices/${id}`).update(doc);
      else { doc.createdAt = nowIso(); doc.createdBy = A.meId; doc.cancelled = false; const ref = await A.db.collection('invoices').add(doc); id = ref.id; }
      if (d.numberMode === 'manual') bumpPast(d.type, number).catch(() => {});
      if (!IV.editId && d.leadPath) noteOnLead(d.leadPath, `Invoice #${doc.label} created — ${money(t.total)}`);
      toast(IV.editId ? `Saved invoice #${doc.label}` : `Created invoice #${doc.label}`);
      if (andDownload) downloadOne(Object.assign({id}, doc));
      IV.draft = null;
      A.go('#invoices/' + id);
    } catch (e) {
      console.error(e); A.onWriteError(e); err.textContent = 'Not saved: ' + (e.message || e.code || 'unknown error');
      btns.forEach(b => b.disabled = false);
    }
  }
  function noteOnLead(path, text) {
    const l = A.getLead(path); if (!l) return;
    A.db.doc(path).update({notes: [...(l.notes || []), {kind: 'note', t: text, at: nowIso(), by: A.meId}], updatedAt: nowIso(), updatedBy: A.meId}).catch(() => {});
  }
  function pickLeadModal() {
    A.openModal(`<h2>Pick a lead</h2><p class="lead">Fills the company name, email and phone from the lead.</p>
      <div class="search" style="margin-bottom:10px">${IC.search}<label class="sr" for="pl-q">Search leads</label><input id="pl-q" type="search" placeholder="Search name, brand or phone…" autocomplete="off"></div>
      <div id="pl-list" class="list" style="max-height:50vh;overflow:auto"></div>
      <div class="modal-actions"><button type="button" class="btn" data-act="modal-close">Close</button></div>`, '#pl-q');
    const draw = q => {
      q = (q || '').trim().toLowerCase(); const qd = A.digits(q);
      const L = A.allLeads().filter(l => !q || (qd.length >= 4 ? A.digits(l.phone).includes(qd) : l._hay.includes(q)))
        .sort((a, b) => (b.month || '').localeCompare(a.month || '') || (b.seq || 0) - (a.seq || 0)).slice(0, 40);
      $('#pl-list').innerHTML = L.length ? L.map(l => `<div class="row" style="grid-template-columns:1fr auto;display:grid" data-ia="pl-pick" data-path="${esc(l.path)}" tabindex="0"><div class="c-name"><strong>${A.rateBadge(l.rating)}${esc(A.displayName(l))}</strong><span>${esc(l.company || l.email || '')}</span></div><div class="c-st">${A.chip(l.status || 'new')}</div></div>`).join('') : '<div class="empty" style="border:0">No leads match.</div>';
    };
    draw('');
    $('#pl-q').addEventListener('input', e => draw(e.target.value));
  }

  /* ======================================================================
     DETAIL
     ====================================================================== */
  function waitThen(fn) { const off = () => { if (IV.loaded) { A.listeners.invoices = (A.listeners.invoices || []).filter(f => f !== h); fn(); } }; const h = () => off(); A.on('invoices', h); }
  function renderDetail(id, soft) {
    IV.view = 'detail'; IV.editId = id;
    const root = $('#page-invoices');
    const inv = byId(id);
    if (!inv) { root.innerHTML = IV.loaded ? `<div class="empty" style="margin-top:24px"><strong>Invoice not found</strong>It may have been deleted. <a href="#invoices">Back to invoices</a></div>` : loadingHTML(); return; }
    const t = calc(inv), st = statusOf(inv), c = inv.client || {};
    const payments = Array.isArray(inv.payments) ? inv.payments : [];
    const keepPay = soft ? ($('#dt-pay') || {}).value : '';
    root.innerHTML = `
      <div class="crumbs"><a href="#invoices">Invoices</a><span>/</span><span>#${esc(inv.label)}</span></div>
      <div class="ph"><div><h1>Invoice #${esc(inv.label)}</h1><p class="sub" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${tyPill(inv.type)}${stPill(st)}<span>${esc(c.company || '')}</span></p></div>
        <div class="ph-actions"><a class="btn" href="#invoices/${esc(id)}/edit">Edit</a><button type="button" class="btn primary" data-ia="dl" data-id="${esc(id)}">${IC.dl}Download PDF</button></div></div>
      <div class="dt">
        <div class="paper-wrap" id="dt-preview">${loadingHTML('Loading preview…')}</div>
        <div class="dt-side">
          <div class="panel">
            <div class="kv">
              <span>Date</span><span>${esc(fmtD(inv.date))}</span>
              ${inv.dueDate ? `<span>Due</span><span>${esc(fmtD(inv.dueDate))}</span>` : ''}
              <span>Subtotal</span><span>${money(t.subtotal)}</span>
              ${inv.type === 'gst' ? `<span>GST (${t.rate}%)</span><span>${money(t.tax)}</span>` : ''}
              <span><b>Total</b></span><span><b>${money(t.total)}</b></span>
              <span>Received</span><span>${money(t.paid)}</span>
              <span><b>Balance due</b></span><span><b>${money(st === 'cancelled' ? 0 : t.balance)}</b></span>
            </div>
          </div>
          ${st !== 'cancelled' && t.balance > 0 ? `<div class="panel">
            <h4 style="margin:0;font:600 11.5px var(--f-body);letter-spacing:.07em;text-transform:uppercase;color:var(--muted)">Record a payment</h4>
            <div class="row2"><label class="sr" for="dt-pay">Amount received</label><input id="dt-pay" type="text" inputmode="decimal" placeholder="₹ amount" value="${esc(keepPay || '')}"><label class="sr" for="dt-pay-date">Payment date</label><input id="dt-pay-date" type="date" value="${today()}"></div>
            <div class="row2"><button type="button" class="btn" data-ia="pay" data-id="${esc(id)}">Add payment</button><button type="button" class="btn primary" data-ia="pay-full" data-id="${esc(id)}">Mark fully paid</button></div>
          </div>` : ''}
          ${payments.length ? `<div class="panel"><h4 style="margin:0;font:600 11.5px var(--f-body);letter-spacing:.07em;text-transform:uppercase;color:var(--muted)">Payments</h4>
            <div class="kv">${payments.map((p, i) => `<span>${esc(fmtD(p.date))}</span><span>${money(p.amount)} <button type="button" class="linkish" data-ia="pay-rm" data-id="${esc(id)}" data-i="${i}" aria-label="Remove payment">remove</button></span>`).join('')}</div></div>` : ''}
          <div class="panel stack">
            <a class="btn" href="#invoices/new?from=${esc(id)}">Duplicate as new invoice</a>
            ${inv.leadPath && A.getLead(inv.leadPath) ? `<button type="button" class="btn" data-ia="open-lead" data-path="${esc(inv.leadPath)}">Open lead</button>` : ''}
            <button type="button" class="btn" data-ia="cancel-toggle" data-id="${esc(id)}">${inv.cancelled ? 'Restore invoice' : 'Mark as cancelled'}</button>
            <button type="button" class="btn danger" data-ia="del" data-id="${esc(id)}">Delete invoice</button>
            <div id="dt-del"></div>
            <p class="meta-line" style="margin:0">Created ${esc(inv.createdAt ? new Date(inv.createdAt).toLocaleString('en-IN', {dateStyle: 'medium', timeStyle: 'short'}) : '')}${inv.updatedAt && inv.updatedAt !== inv.createdAt ? ` · updated ${esc(new Date(inv.updatedAt).toLocaleString('en-IN', {dateStyle: 'medium', timeStyle: 'short'}))}` : ''}</p>
          </div>
        </div>
      </div>`;
    P.toHTML(forPdf(inv)).then(html => { const el = $('#dt-preview'); if (el && IV.editId === id) { el.innerHTML = html; P.fitPreview(el); } })
      .catch(e => { const el = $('#dt-preview'); if (el) el.innerHTML = `<div class="empty">Preview unavailable: ${esc(e.message || '')}</div>`; });
  }
  async function updatePayments(inv, payments, msg) {
    const paid = Math.round(payments.reduce((a, p) => a + num(p.amount), 0) * 100) / 100;
    const next = Object.assign({}, inv, {payments, paid});
    const t = calc(next);
    try {
      await A.db.doc(`invoices/${inv.id}`).update({payments, paid: t.paid, balance: t.balance, status: statusOf(next), updatedAt: nowIso(), updatedBy: A.meId});
      toast(msg);
    } catch (e) { A.onWriteError(e); }
  }
  function legacyPayments(inv) {
    const p = Array.isArray(inv.payments) ? inv.payments.slice() : [];
    const recorded = p.reduce((a, x) => a + num(x.amount), 0);
    const paid = num(inv.paid);
    if (paid > recorded + 0.004) p.unshift({amount: Math.round((paid - recorded) * 100) / 100, date: inv.date, at: inv.updatedAt || nowIso(), by: inv.updatedBy || null});
    return p;
  }

  /* ======================================================================
     BULK
     ====================================================================== */
  const BULK_COLS = [['ref', 'Ref', 70], ['type', 'Type', 104], ['date', 'Date', 140], ['company', 'Company name', 190], ['address', 'Billing address', 230], ['gstin', 'GSTIN', 150], ['pan', 'PAN', 120], ['desc', 'Item', 200], ['qty', 'Qty', 64], ['rate', 'Rate (₹)', 100]];
  const blankRow = () => ({ref: '', type: IV.bulkDefaults ? IV.bulkDefaults.type : 'gst', date: IV.bulkDefaults ? IV.bulkDefaults.date : today(), company: '', address: '', gstin: '', pan: '', desc: '', qty: '1', rate: ''});
  function loadBulk() {
    if (IV.bulk) return;
    try { const s = JSON.parse(localStorage.getItem(LSB) || 'null'); if (Array.isArray(s) && s.length) { IV.bulk = s; return; } } catch (e) {}
    IV.bulk = [blankRow(), blankRow(), blankRow()];
  }
  const saveBulk = () => { try { localStorage.setItem(LSB, JSON.stringify(IV.bulk)); } catch (e) {} };
  function renderBulk(root) {
    IV.view = 'bulk'; IV.editId = null; IV.bulkResult = null;
    IV.bulkDefaults = IV.bulkDefaults || {type: 'gst', date: today()};
    loadBulk();
    root.innerHTML = `
      <div class="crumbs"><a href="#invoices">Invoices</a><span>/</span><span>Create multiple</span></div>
      <div class="ph"><div><h1>Create multiple invoices</h1><p class="sub">Each row is one item. Rows with the same <b>Ref</b> become one invoice with several items; leave Ref empty to make each row its own invoice.</p></div>
        <div class="ph-actions"><button type="button" class="btn" data-ia="bulk-template">${IC.dl}Template</button><button type="button" class="btn" data-ia="bulk-paste">Paste from sheet</button></div></div>
      <div class="filters" style="padding-bottom:0">
        <span class="meta-line" style="margin:0">Defaults for new rows:</span>
        <label class="sr" for="bd-type">Default type</label><select id="bd-type">${opt('gst', 'GST', IV.bulkDefaults.type)}${opt('nongst', 'Non-GST', IV.bulkDefaults.type)}</select>
        <label class="sr" for="bd-date">Default date</label><input type="date" id="bd-date" value="${esc(IV.bulkDefaults.date)}">
        <button type="button" class="btn small" data-ia="bulk-apply">Apply to empty cells</button>
      </div>
      <div class="bulk-wrap"><table class="bulk"><thead><tr><th>#</th>${BULK_COLS.map(([, l, w]) => `<th style="min-width:${w}px">${l}</th>`).join('')}<th></th></tr></thead><tbody id="bulk-body"></tbody></table></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button type="button" class="btn small" data-ia="bulk-add">${IC.plus}Add 5 rows</button><button type="button" class="btn small link" data-ia="bulk-clear">Clear all rows</button></div>
      <div class="bulk-sum" id="bulk-sum"></div>
      <div id="bulk-result"></div>`;
    renderBulkBody(); renderBulkSum();
  }
  function renderBulkBody() {
    $('#bulk-body').innerHTML = IV.bulk.map((r, i) => `<tr data-r="${i}">
      <td class="n">${i + 1}</td>
      ${BULK_COLS.map(([k, l]) => {
        const id = `b-${k}-${i}`, lab = `<label class="sr" for="${id}">${l} row ${i + 1}</label>`;
        if (k === 'type') return `<td>${lab}<select id="${id}" data-b="${i}" data-k="type">${opt('gst', 'GST', r.type)}${opt('nongst', 'Non-GST', r.type)}</select></td>`;
        if (k === 'date') return `<td>${lab}<input id="${id}" type="date" data-b="${i}" data-k="date" value="${esc(r.date)}"></td>`;
        if (k === 'address' || k === 'desc') return `<td>${lab}<textarea id="${id}" rows="1" data-b="${i}" data-k="${k}">${esc(r[k])}</textarea></td>`;
        return `<td>${lab}<input id="${id}" type="text" data-b="${i}" data-k="${k}" value="${esc(r[k])}" ${k === 'qty' || k === 'rate' ? 'inputmode="decimal"' : ''} ${k === 'company' ? 'list="bulk-clients"' : ''}></td>`;
      }).join('')}
      <td><button type="button" class="x-btn" data-ia="bulk-rm" data-i="${i}" aria-label="Remove row ${i + 1}">${IC.x}</button></td></tr>`).join('') +
      `<datalist id="bulk-clients">${pastClients().map(c => `<option value="${esc(c.company)}"></option>`).join('')}</datalist>`;
  }
  const rowEmpty = r => !['company', 'address', 'gstin', 'pan', 'desc', 'rate', 'ref'].some(k => String(r[k] || '').trim());
  function bulkGroups() {
    const groups = new Map(), bad = new Map();
    IV.bulk.forEach((r, i) => {
      if (rowEmpty(r)) return;
      const key = String(r.ref || '').trim() ? 'ref:' + String(r.ref).trim().toLowerCase() : 'row:' + i;
      if (!groups.has(key)) groups.set(key, {rows: [], idx: []});
      const g = groups.get(key); g.rows.push(r); g.idx.push(i);
    });
    const out = [];
    for (const g of groups.values()) {
      const pick = k => (g.rows.find(r => String(r[k] || '').trim()) || {})[k] || '';
      const inv = {type: pick('type') === 'nongst' ? 'nongst' : 'gst', date: pick('date') || today(),
        client: {company: pick('company').trim(), address: pick('address').trim(), gstin: pick('gstin').trim().toUpperCase(), pan: pick('pan').trim().toUpperCase(), email: '', phone: ''},
        items: g.rows.filter(r => String(r.desc || '').trim() || String(r.rate || '').trim()).map(r => ({desc: String(r.desc || '').trim(), qty: num(r.qty || 1), rate: num(r.rate)})), idx: g.idx};
      const problems = [];
      if (!inv.client.company) problems.push('company name');
      if (!inv.items.length) problems.push('an item');
      if (inv.items.some(it => !it.desc)) problems.push('item descriptions');
      if (inv.items.some(it => it.qty <= 0)) problems.push('quantity above 0');
      if (problems.length) g.idx.forEach(i => bad.set(i, problems));
      inv.problems = problems;
      out.push(inv);
    }
    return {invs: out, bad};
  }
  function renderBulkSum() {
    const {invs, bad} = bulkGroups();
    $$('#bulk-body tr').forEach(tr => tr.classList.toggle('bad', bad.has(Number(tr.dataset.r))));
    const ok = invs.filter(i => !i.problems.length);
    const g = ok.filter(i => i.type === 'gst'), n = ok.filter(i => i.type === 'nongst');
    const total = ok.reduce((a, i) => a + calc(Object.assign({taxRate: IV.settings.taxRate}, i)).total, 0);
    const range = (type, k) => k ? ` (${nextLabel(type)}${k > 1 ? '–' + (IV.settings.profiles[type].prefix || '') + (IV.counters[type] + k - 1) : ''})` : '';
    $('#bulk-sum').innerHTML = `<span><b>${ok.length}</b> invoice${ok.length === 1 ? '' : 's'} ready</span>
      <span>GST: <b>${g.length}</b>${range('gst', g.length)}</span><span>Non-GST: <b>${n.length}</b>${range('nongst', n.length)}</span>
      <span>Total incl. GST: <b>${money(total)}</b></span>
      ${bad.size ? `<span style="color:var(--danger)">${bad.size} row${bad.size === 1 ? '' : 's'} need fixing (highlighted)</span>` : ''}
      <span class="grow" style="flex:1"></span>
      <button type="button" class="btn primary" data-ia="bulk-create" ${ok.length && !bad.size ? '' : 'disabled'}>Create ${ok.length || ''} invoice${ok.length === 1 ? '' : 's'}</button>`;
  }
  async function createBulk() {
    const {invs, bad} = bulkGroups();
    if (bad.size || !invs.length) return;
    const btn = $('[data-ia="bulk-create"]'); btn.disabled = true; btn.textContent = 'Creating…';
    try {
      const byType = {gst: invs.filter(i => i.type === 'gst'), nongst: invs.filter(i => i.type === 'nongst')};
      const start = {};
      for (const t of ['gst', 'nongst']) if (byType[t].length) start[t] = await reserve(t, byType[t].length);
      const created = [];
      const batch = A.db.batch();
      for (const t of ['gst', 'nongst']) byType[t].forEach((src, k) => {
        const prof = IV.settings.profiles[t];
        const number = start[t] + k;
        const seller = {legalName: prof.legalName, gstin: prof.gstin, address: prof.address, pan: prof.pan, terms: prof.terms};
        const inv = {type: t, number, prefix: prof.prefix || '', label: `${prof.prefix || ''}${number}`, date: src.date, dueDate: '', seller, client: src.client,
          items: src.items, taxRate: t === 'gst' ? IV.settings.taxRate : 0, paid: 0, notes: '', leadPath: '', payments: [], cancelled: false};
        const tt = calc(inv);
        Object.assign(inv, {subtotal: tt.subtotal, tax: tt.tax, total: tt.total, balance: tt.balance, status: 'unpaid', createdAt: nowIso(), createdBy: A.meId, updatedAt: nowIso(), updatedBy: A.meId});
        const ref = A.db.collection('invoices').doc();
        batch.set(ref, inv);
        created.push(Object.assign({id: ref.id}, inv));
      });
      await batch.commit();
      IV.bulk = [blankRow(), blankRow(), blankRow()]; saveBulk();
      IV.bulkResult = created;
      renderBulkBody(); renderBulkSum();
      $('#bulk-result').innerHTML = `<div class="panel" style="padding:16px 18px;margin-top:16px">
        <h2 style="margin:0;font:650 18px var(--f-display)">Created ${created.length} invoice${created.length === 1 ? '' : 's'}</h2>
        <div class="result-list">${created.map(c => `<a href="#invoices/${esc(c.id)}">#${esc(c.label)} · ${esc(c.client.company)} · ${money(c.total)}</a>`).join('')}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><button type="button" class="btn primary" data-ia="bulk-dl">${IC.dl}Download all (ZIP)</button><a class="btn" href="#invoices">Go to invoices</a></div></div>`;
      toast(`Created ${created.length} invoices`);
    } catch (e) { console.error(e); A.onWriteError(e); btn.disabled = false; btn.textContent = 'Try again'; }
  }
  const BULK_TEMPLATE = 'ref,type,date,company,address,gstin,pan,item,qty,rate\n' +
    'A1,GST,05/11/2026,Example Brand Pvt Ltd,"Street, City, State PIN",GSTIN here,PAN here,1 Story Reshare,1,5000\n' +
    'A2,Non-GST,05/11/2026,Another Brand,"Street, City, State PIN",,,UGC video (30s),3,4500\n' +
    'A2,Non-GST,05/11/2026,Another Brand,"Street, City, State PIN",,,Raw footage add-on,1,1500\n';
  function bulkPasteModal() {
    A.openModal(`<h2>Paste rows</h2><p class="lead">Copy rows from Google Sheets or Excel and paste here. Use the column order <span class="mono" style="font-size:12px">ref, type, date, company, address, gstin, pan, item, qty, rate</span> — or include a header row with those names in any order.</p>
      <label class="sr" for="bp-text">Rows</label><textarea id="bp-text" rows="8" placeholder="Paste here…"></textarea>
      <p class="meta-line" id="bp-msg" style="margin-top:8px"></p>
      <div class="modal-actions"><button type="button" class="btn" data-act="modal-close">Cancel</button><button type="button" class="btn primary" data-ia="bulk-paste-go">Add rows</button></div>`, '#bp-text');
    $('#bp-text').addEventListener('input', e => { const rows = parseBulk(e.target.value); $('#bp-msg').textContent = rows.length ? `${rows.length} row${rows.length === 1 ? '' : 's'} found` : ''; });
  }
  function normDate(s) {
    s = String(s || '').trim(); if (!s) return '';
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return `${m[1]}-${A.pad(+m[2])}-${A.pad(+m[3])}`;
    m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/); if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${A.pad(+m[2])}-${A.pad(+m[1])}`;
    const d = new Date(s); return isNaN(d) ? '' : A.dkey(d);
  }
  function parseBulk(text) {
    const rows = A.parseDelimited(text || '').map(r => r.map(c => (c || '').trim())).filter(r => r.some(Boolean));
    if (!rows.length) return [];
    const keys = BULK_COLS.map(c => c[0]);
    const alias = {ref: ['ref', 'invoice ref', 'group'], type: ['type', 'gst/non-gst', 'invoice type'], date: ['date', 'invoice date'], company: ['company', 'company name', 'client', 'customer', 'bill to'],
      address: ['address', 'billing address'], gstin: ['gstin', 'gst', 'gst number', 'gst no'], pan: ['pan', 'pan number'], desc: ['item', 'description', 'service'], qty: ['qty', 'quantity'], rate: ['rate', 'price', 'amount']};
    let map = keys;
    const head = rows[0].map(c => c.toLowerCase());
    if (head.some(h => ['company', 'company name', 'item', 'rate', 'client'].includes(h))) {
      map = head.map(h => keys.find(k => alias[k].includes(h)) || null); rows.shift();
    }
    return rows.map(r => {
      const o = blankRow();
      map.forEach((k, j) => { if (k && r[j] != null && r[j] !== '') o[k] = r[j]; });
      o.type = /non|without|no\s*gst/i.test(o.type) ? 'nongst' : /gst/i.test(o.type) ? 'gst' : (o.type === 'nongst' ? 'nongst' : (IV.bulkDefaults || {}).type || 'gst');
      o.date = normDate(o.date) || (IV.bulkDefaults || {}).date || today();
      o.rate = String(o.rate).replace(/[₹,\s]/g, ''); o.qty = String(o.qty || '1').replace(/[,\s]/g, '');
      return o;
    });
  }

  /* ======================================================================
     SETTINGS
     ====================================================================== */
  function renderSettings() {
    const root = $('#page-settings'); if (!root) return;
    const s = IV.settings;
    const prof = (t, title, sub) => {
      const p = s.profiles[t];
      return `<div class="panel"><div class="fsec"><h3>${title}</h3><p class="meta-line" style="margin:0">${sub}</p>
        <label class="fl" for="s-${t}-legal">Legal name<input id="s-${t}-legal" data-s="${t}.legalName" type="text" value="${esc(p.legalName)}"></label>
        ${t === 'gst' ? `<label class="fl" for="s-${t}-gstin">GST number<input id="s-${t}-gstin" data-s="${t}.gstin" type="text" value="${esc(p.gstin)}" style="text-transform:uppercase"></label>` : ''}
        <label class="fl" for="s-${t}-addr">Address<textarea id="s-${t}-addr" data-s="${t}.address" rows="3">${esc(p.address)}</textarea></label>
        <label class="fl" for="s-${t}-pan">PAN number<input id="s-${t}-pan" data-s="${t}.pan" type="text" value="${esc(p.pan)}" style="text-transform:uppercase"></label>
        <label class="fl" for="s-${t}-terms">Terms / bank details <span class="hint">printed at the bottom</span><textarea id="s-${t}-terms" data-s="${t}.terms" rows="6">${esc(p.terms)}</textarea></label>
        <div class="fgrid"><label class="fl" for="s-${t}-prefix">Number prefix <span class="hint">e.g. NG-</span><input id="s-${t}-prefix" data-s="${t}.prefix" type="text" value="${esc(p.prefix)}"></label>
        <label class="fl" for="s-${t}-next">Next number<input id="s-${t}-next" data-sn="${t}" type="text" inputmode="numeric" value="${esc(IV.counters[t])}"></label></div>
      </div></div>`;
    };
    root.innerHTML = `
      <div class="ph"><div><h1>Settings</h1><p class="sub">Business details printed on invoices, numbering and backups</p></div>
        <div class="ph-actions"><button type="button" class="btn primary" data-ia="settings-save" id="settings-save">Save settings</button></div></div>
      <div class="set-grid">
        ${prof('gst', 'GST invoices', 'Seller details printed on GST invoices (with 18% tax by default).')}
        ${prof('nongst', 'Non-GST invoices', 'Seller details printed on invoices without GST — the GST number and tax line are left out.')}
        <div class="panel"><div class="fsec"><h3>Logo &amp; tax</h3>
          <img class="logo-prev" id="s-logo-prev" src="${esc(s.logo || 'assets/pages-logo.jpg')}" alt="Invoice logo">
          <div style="display:flex;gap:8px;flex-wrap:wrap"><label class="btn small" for="s-logo">Change logo</label><input type="file" id="s-logo" accept="image/png,image/jpeg" hidden>${s.logo ? '<button type="button" class="btn small link" data-ia="logo-reset">Use original logo</button>' : ''}</div>
          <label class="fl" for="s-tax">Default GST rate<select id="s-tax">${[0, 5, 12, 18, 28].map(r => opt(String(r), r + '%', String(s.taxRate))).join('')}</select></label>
        </div></div>
        <div class="panel"><div class="fsec"><h3>Account &amp; backup</h3>
          <p class="meta-line" style="margin:0">Signed in as <b>${esc((A.user && A.user.email) || '—')}</b>.</p>
          <button type="button" class="btn" data-ia="backup">${IC.dl}Download full backup (.json)</button>
          <p class="meta-line" style="margin:0">Includes every lead with its history and every invoice. Keep one every month; restore leads from Leads → Import.</p>
          <button type="button" class="btn small link" data-act="signout" style="align-self:flex-start">Sign out</button>
        </div></div>
      </div>`;
  }
  function settingsFromForm() {
    const s = clone(IV.settings);
    $$('#page-settings [data-s]').forEach(el => { const [t, k] = el.dataset.s.split('.'); s.profiles[t][k] = (k === 'gstin' || k === 'pan') ? el.value.trim().toUpperCase() : (k === 'prefix' ? el.value.trim() : el.value); });
    s.taxRate = num($('#s-tax').value);
    return s;
  }
  async function saveSettings() {
    const s = settingsFromForm(); const btn = $('#settings-save'); btn.disabled = true;
    try {
      await A.db.doc('settings/business').set({profiles: s.profiles, taxRate: s.taxRate, logo: s.logo || '', updatedAt: nowIso(), updatedBy: A.meId});
      const counters = {};
      for (const t of ['gst', 'nongst']) {
        const v = parseInt($(`#s-${t}-next`).value, 10);
        if (!(v > 0)) { toast('Next numbers must be whole numbers above 0.'); btn.disabled = false; return; }
        if (v !== IV.counters[t]) {
          const pre = s.profiles[t].prefix || '';
          const taken = IV.list.filter(i => i.type === t && String(i.label).startsWith(pre)).map(i => Number(i.number) || 0);
          if (taken.some(n => n >= v)) { toast(`${TYPE_LABEL[t]} invoice ${pre}${Math.max(...taken)} already exists — the next number must be higher.`); btn.disabled = false; return; }
          counters[t] = v;
        }
      }
      if (Object.keys(counters).length) await A.db.doc('settings/counters').set(counters, {merge: true});
      IV.settingsDirty = false; toast('Settings saved');
    } catch (e) { A.onWriteError(e); }
    btn.disabled = false;
  }
  function resizeLogo(file) {
    return new Promise((res, rej) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const w = Math.min(756, img.naturalWidth), h = Math.round(img.naturalHeight * w / img.naturalWidth);
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', 0.88));
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Not an image')); };
      img.src = url;
    });
  }
  function backup() {
    const months = [...A.S.months.values()].map(m => ({id: m.key, data: {key: m.key, label: m.label, tab: m.tab || ''}}));
    const leads = A.allLeads().map(l => { const d = Object.assign({}, l); ['id', 'month', 'path', '_hay'].forEach(k => delete d[k]); return {month: l.month, id: l.id, data: d}; });
    const invoices = IV.list.map(i => { const d = Object.assign({}, i); delete d.id; return {id: i.id, data: d}; });
    const json = {format: 'leadbook-backup', version: 2, exportedAt: nowIso(), months, leads, invoices, settings: {business: IV.settings, counters: IV.counters}};
    A.download(`pages-desk-backup-${today()}.json`, JSON.stringify(json)).then(() => toast(`Backup saved: ${leads.length} leads, ${invoices.length} invoices`));
  }

  /* ======================================================================
     EVENTS
     ====================================================================== */
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-ia]'); if (!a) return;
    const ia = a.dataset.ia, id = a.dataset.id;
    if (ia === 'sel' || ia === 'selall') return; // handled on change
    if (ia === 'open') { if (e.target.closest('input,button,a')) return; A.go('#invoices/' + id); return; }
    switch (ia) {
      case 'ftype': IV.f.type = a.dataset.v; saveF(); renderListBody(); break;
      case 'fclear': IV.f = {q: '', type: '', status: '', client: '', year: '', mon: '', from: '', to: '', sort: IV.f.sort}; saveF(); renderListBody(); break;
      case 'more': IV.shown += 100; renderListBody(); break;
      case 'dl': { const inv = byId(id); if (inv) downloadOne(inv); break; }
      case 'dl-filtered': downloadMany(IV.filtered || [], `Invoices ${today()}.zip`); break;
      case 'sel-dl': downloadMany(IV.list.filter(i => IV.sel.has(i.id)), `Invoices ${today()}.zip`); break;
      case 'sel-clear': IV.sel.clear(); renderListBody(); break;
      case 'sel-paid': {
        const sel = IV.list.filter(i => IV.sel.has(i.id) && !i.cancelled && calc(i).balance > 0);
        if (!sel.length) { toast('Those invoices are already paid.'); break; }
        const batch = A.db.batch();
        sel.forEach(inv => {
          const t = calc(inv); const payments = [...legacyPayments(inv), {amount: t.balance, date: today(), at: nowIso(), by: A.meId}];
          batch.update(A.db.doc(`invoices/${inv.id}`), {payments, paid: t.total, balance: 0, status: 'paid', updatedAt: nowIso(), updatedBy: A.meId});
        });
        batch.commit().then(() => { toast(`Marked ${sel.length} invoice${sel.length === 1 ? '' : 's'} paid`); IV.sel.clear(); renderListBody(); }).catch(A.onWriteError);
        break;
      }
      case 'etype': {
        const d = IV.draft; if (!d || d.type === a.dataset.v) break;
        const prevTerms = IV.settings.profiles[d.type].terms;
        d.type = a.dataset.v;
        if (!d.termsEdited || d.terms === prevTerms) { d.terms = IV.settings.profiles[d.type].terms; d.termsEdited = false; $('#ed-terms').value = d.terms; }
        syncTypeUI(); renderTotals(); updatePreview(); warnSeller(); break;
      }
      case 'add-item': IV.draft.items.push({desc: '', qty: 1, rate: ''}); renderItems(); renderTotals(); updatePreview(); { const n = IV.draft.items.length - 1; const el = $(`#it-d-${n}`); if (el) el.focus(); } break;
      case 'rm-item': IV.draft.items.splice(Number(a.dataset.i), 1); renderItems(); renderTotals(); updatePreview(); break;
      case 'pick-lead': pickLeadModal(); break;
      case 'pl-pick': {
        const l = A.getLead(a.dataset.path); if (!l || !IV.draft) break;
        const d = IV.draft; d.leadPath = l.path;
        Object.assign(d.client, {company: l.company || l.name || d.client.company, email: l.email || d.client.email, phone: l.phone || d.client.phone});
        fillFromPast(true);
        for (const f of ['company', 'address', 'gstin', 'pan', 'email', 'phone']) { const el = $(`#ed-form [data-f="client.${f}"]`); if (el) el.value = d.client[f] || ''; }
        A.closeModal(); updatePreview(); toast(`Using lead: ${A.displayName(l)}`); break;
      }
      case 'save': saveInvoice(!!a.dataset.dl); break;
      case 'preview-pdf': (async () => { try { const doc = await P.toPDF(forPdf(draftInvoice())); const url = doc.output('bloburl'); const w = window.open(url, '_blank'); if (!w) A.download(P.fileName(draftInvoice()), doc.output('blob')); } catch (err) { toast('Couldn’t create the PDF: ' + (err.message || '')); } })(); break;
      case 'pay': case 'pay-full': {
        const inv = byId(id); if (!inv) break;
        const t = calc(inv);
        const amt = ia === 'pay-full' ? t.balance : num($('#dt-pay').value);
        if (!(amt > 0)) { toast('Enter the amount received.'); $('#dt-pay').focus(); break; }
        if (amt > t.balance + 0.004) { toast(`That’s more than the balance due (${money(t.balance)}).`); break; }
        const payments = [...legacyPayments(inv), {amount: Math.round(amt * 100) / 100, date: $('#dt-pay-date').value || today(), at: nowIso(), by: A.meId}];
        updatePayments(inv, payments, ia === 'pay-full' ? `Invoice #${inv.label} marked paid` : `Recorded ${money(amt)}`);
        break;
      }
      case 'pay-rm': { const inv = byId(id); if (!inv) break; const p = legacyPayments(inv); p.splice(Number(a.dataset.i), 1); updatePayments(inv, p, 'Payment removed'); break; }
      case 'cancel-toggle': {
        const inv = byId(id); if (!inv) break;
        const cancelled = !inv.cancelled;
        A.db.doc(`invoices/${id}`).update({cancelled, status: cancelled ? 'cancelled' : statusOf(Object.assign({}, inv, {cancelled: false})), updatedAt: nowIso(), updatedBy: A.meId})
          .then(() => toast(cancelled ? `Invoice #${inv.label} cancelled` : `Invoice #${inv.label} restored`)).catch(A.onWriteError);
        break;
      }
      case 'del': $('#dt-del').innerHTML = `<div class="confirm">Delete invoice #${esc(byId(id).label)} for good? Its number won’t be reused. Use “Mark as cancelled” to keep a record instead.<span class="grow"></span><button type="button" class="btn small" data-ia="del-no">Keep</button><button type="button" class="btn small primary" data-ia="del-yes" data-id="${esc(id)}">Delete</button></div>`; break;
      case 'del-no': $('#dt-del').innerHTML = ''; break;
      case 'del-yes': { const inv = byId(id); A.db.doc(`invoices/${id}`).delete().then(() => { toast(`Deleted invoice #${inv ? inv.label : ''}`); A.go('#invoices'); }).catch(A.onWriteError); break; }
      case 'open-lead': A.go('#leads'); setTimeout(() => A.openLead && A.openLead(a.dataset.path), 50); break;
      case 'bulk-add': for (let i = 0; i < 5; i++) IV.bulk.push(blankRow()); saveBulk(); renderBulkBody(); renderBulkSum(); break;
      case 'bulk-rm': IV.bulk.splice(Number(a.dataset.i), 1); if (!IV.bulk.length) IV.bulk.push(blankRow()); saveBulk(); renderBulkBody(); renderBulkSum(); break;
      case 'bulk-clear': IV.bulk = [blankRow(), blankRow(), blankRow()]; saveBulk(); renderBulkBody(); renderBulkSum(); break;
      case 'bulk-apply': IV.bulk.forEach(r => { if (rowEmpty(r)) { r.type = IV.bulkDefaults.type; r.date = IV.bulkDefaults.date; } else if (!r.date) r.date = IV.bulkDefaults.date; }); saveBulk(); renderBulkBody(); renderBulkSum(); break;
      case 'bulk-template': A.download('invoice-bulk-template.csv', BULK_TEMPLATE).then(() => toast('Template downloaded')); break;
      case 'bulk-paste': bulkPasteModal(); break;
      case 'bulk-paste-go': {
        const rows = parseBulk($('#bp-text').value);
        if (!rows.length) { $('#bp-msg').textContent = 'No rows found — check the format.'; break; }
        IV.bulk = IV.bulk.filter(r => !rowEmpty(r)).concat(rows); saveBulk(); A.closeModal(); renderBulkBody(); renderBulkSum(); toast(`Added ${rows.length} rows`); break;
      }
      case 'bulk-create': createBulk(); break;
      case 'bulk-dl': downloadMany(IV.bulkResult || [], `Invoices ${today()}.zip`); break;
      case 'settings-save': saveSettings(); break;
      case 'logo-reset': IV.settings.logo = ''; IV.settingsDirty = true; $('#s-logo-prev').src = 'assets/pages-logo.jpg'; a.remove(); toast('Original logo will be used — click Save settings'); break;
      case 'backup': backup(); break;
    }
  });
  document.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.irow')) { e.preventDefault(); A.go('#invoices/' + e.target.dataset.id); }
    if ((e.key === 'Enter') && e.target.matches && e.target.matches('[data-ia="pl-pick"]')) e.target.click();
  });
  document.addEventListener('change', e => {
    const el = e.target;
    if (el.dataset.ia === 'sel') { if (el.checked) IV.sel.add(el.dataset.id); else IV.sel.delete(el.dataset.id); renderSelbar(); return; }
    if (el.dataset.ia === 'selall') { (IV.filtered || []).slice(0, IV.shown).forEach(i => el.checked ? IV.sel.add(i.id) : IV.sel.delete(i.id)); renderListBody(); return; }
    const fmap = {'iv-status': 'status', 'iv-client': 'client', 'iv-mon': 'mon', 'iv-year': 'year', 'iv-from': 'from', 'iv-to': 'to', 'iv-sort': 'sort'};
    if (fmap[el.id]) { IV.f[fmap[el.id]] = el.value; IV.shown = 100; saveF(); renderListBody(); return; }
    if (el.closest && el.closest('#ed-form')) {
      readEditorField(el);
      if (el.id === 'ed-company') { if (fillFromPast(false)) {} }
      renderTotals(); updatePreview(); return;
    }
    if (el.id === 'bd-type' || el.id === 'bd-date') { IV.bulkDefaults[el.id === 'bd-type' ? 'type' : 'date'] = el.value; return; }
    if (el.dataset.b != null) { IV.bulk[Number(el.dataset.b)][el.dataset.k] = el.value; saveBulk(); renderBulkSum(); return; }
    if (el.id === 's-logo' && el.files && el.files[0]) {
      resizeLogo(el.files[0]).then(url => {
        if (url.length > 700000) { toast('That image is too large — use one under 500 KB.'); return; }
        IV.settings.logo = url; IV.settingsDirty = true; $('#s-logo-prev').src = url; toast('Logo ready — click Save settings');
      }).catch(() => toast('Couldn’t read that image. Use a PNG or JPG.'));
      return;
    }
    if (el.closest && el.closest('#page-settings')) IV.settingsDirty = true;
  });
  let qT = 0;
  document.addEventListener('input', e => {
    const el = e.target;
    if (el.id === 'iv-q') { clearTimeout(qT); qT = setTimeout(() => { IV.f.q = el.value; IV.shown = 100; saveF(); renderListBody(); }, 120); return; }
    if (el.closest && el.closest('#ed-form') && el.tagName !== 'SELECT') { readEditorField(el); renderTotals(); updatePreview(); return; }
    if (el.dataset.b != null) { IV.bulk[Number(el.dataset.b)][el.dataset.k] = el.value; saveBulk(); clearTimeout(qT); qT = setTimeout(renderBulkSum, 200); return; }
    if (el.closest && el.closest('#page-settings')) IV.settingsDirty = true;
  });
  document.addEventListener('submit', e => { if (e.target.id === 'ed-form') { e.preventDefault(); saveInvoice(false); } });
  window.addEventListener('resize', () => { ['#ed-preview', '#dt-preview'].forEach(s => { const el = $(s); if (el) P.fitPreview(el); }); });

  A.invoices = {list: () => IV.list, calc, statusOf, money, loaded: () => IV.loaded};
})();
