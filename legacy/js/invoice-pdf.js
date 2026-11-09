/* Invoice layout + renderers.
   One layout function produces drawing ops in PDF points (US Letter, 612x792) that
   both the on-screen preview (HTML) and the downloadable PDF (jsPDF) draw from,
   so the preview always matches the file. */
(function () {
  'use strict';
  const PW = 612, PH = 792;
  const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const DEFAULT_LOGO = 'assets/pages-logo.jpg';

  const fonts = {reg: null, bold: null};
  let fontsReady = null, measurer = null;
  const logoCache = new Map();

  function toB64(buf) {
    const bytes = new Uint8Array(buf); let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function ready() {
    if (!fontsReady) {
      fontsReady = Promise.all(['Regular', 'Bold'].map(w => fetch(`fonts/NotoSans-${w}.ttf`).then(r => {
        if (!r.ok) throw new Error('Font failed to load');
        return r.arrayBuffer();
      }).then(toB64))).then(([r, b]) => { fonts.reg = r; fonts.bold = b; measurer = newDoc(); });
      fontsReady.catch(() => { fontsReady = null; });
    }
    return fontsReady;
  }
  function newDoc() {
    if (!window.jspdf) throw new Error('PDF library failed to load');
    const doc = new window.jspdf.jsPDF({unit: 'pt', format: 'letter', compress: true});
    doc.addFileToVFS('NS-R.ttf', fonts.reg); doc.addFont('NS-R.ttf', 'NS', 'normal');
    doc.addFileToVFS('NS-B.ttf', fonts.bold); doc.addFont('NS-B.ttf', 'NS', 'bold');
    doc.setFont('NS', 'normal');
    return doc;
  }
  function wrap(str, size, bold, width) {
    measurer.setFont('NS', bold ? 'bold' : 'normal'); measurer.setFontSize(size);
    return measurer.splitTextToSize(String(str == null ? '' : str), width);
  }

  async function logoData(src) {
    src = src || DEFAULT_LOGO;
    if (src.startsWith('data:')) return src;
    if (!logoCache.has(src)) {
      logoCache.set(src, fetch(src).then(r => r.blob()).then(b => new Promise((res, rej) => {
        const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(b);
      })).catch(() => null));
    }
    return logoCache.get(src);
  }

  const money = n => '₹' + (Number(n) || 0).toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2});
  function fmtDate(s) {
    if (!s) return '';
    const [y, m, d] = String(s).split('-').map(Number);
    return y && m && d ? `${MON[m - 1]} ${d}, ${y}` : String(s);
  }
  function totals(inv) {
    const subtotal = (inv.items || []).reduce((a, it) => a + (Number(it.qty) || 0) * (Number(it.rate) || 0), 0);
    const rate = inv.type === 'gst' ? (Number(inv.taxRate) || 0) : 0;
    const tax = Math.round(subtotal * rate) / 100;
    const total = Math.round((subtotal + tax) * 100) / 100;
    const paid = Math.min(Number(inv.paid) || 0, total);
    return {subtotal: Math.round(subtotal * 100) / 100, tax, total, paid, balance: Math.round((total - paid) * 100) / 100, rate};
  }

  /* ---------- layout ---------- */
  function layout(inv, logo) {
    const ops = []; let page = 0;
    const DARK = '#333333', GREY = '#777777';
    const T = (str, x, y, o = {}) => ops.push({t: 'text', p: page, str: String(str), x, y, s: o.s || 10, b: !!o.b, c: o.c || DARK, al: o.al || 'left'});
    const R = (x, y, w, h, fill, r = 0) => ops.push({t: 'rect', p: page, x, y, w, h, fill, r});
    const t = totals(inv);
    const seller = inv.seller || {}, client = inv.client || {};

    if (logo) ops.push({t: 'img', p: page, src: logo, x: 36.5, y: 14, w: 150, h: 64, r: 5});
    T('INVOICE', 576, 50, {s: 29, al: 'right'});
    T('# ' + (inv.label || ''), 572, 68, {s: 12, c: GREY, al: 'right'});

    // Seller block (left)
    let y = 98; const LX = 48, LW = 262, LH = 12;
    const sellerLines = [];
    if (seller.legalName) sellerLines.push([`LEGAL NAME - ${seller.legalName}`, true]);
    if (inv.type === 'gst' && seller.gstin) sellerLines.push([`GST NO ${seller.gstin}`, false]);
    if (seller.address) sellerLines.push([`ADDRESS - ${seller.address}`, false]);
    if (seller.pan) sellerLines.push([`PAN NUMBER - ${seller.pan}`, false]);
    for (const [txt, bold] of sellerLines) for (const ln of wrap(txt, 10, bold, LW)) { T(ln, LX, y, {b: bold}); y += LH; }

    // Date / balance (right)
    let ry = 114;
    T('Date:', 464, ry, {c: GREY, al: 'right'}); T(fmtDate(inv.date), 568, ry, {al: 'right'});
    if (inv.dueDate) { ry += 18; T('Due Date:', 464, ry, {c: GREY, al: 'right'}); T(fmtDate(inv.dueDate), 568, ry, {al: 'right'}); }
    const boxTop = ry + 13;
    R(317, boxTop, 270, 26, '#F3F3F3', 4);
    T('Balance Due:', 464, boxTop + 17.5, {b: true, s: 12, al: 'right'});
    T(money(t.balance), 568, boxTop + 17.5, {b: true, s: 12, al: 'right'});

    // Bill to
    y = Math.max(y + 22, 185);
    T('Bill To:', LX, y, {c: GREY}); y += 16;
    const billLines = [];
    if (client.company) billLines.push([`Company Name: ${client.company}`, true]);
    if (client.address) billLines.push([`Billing Address: ${client.address}`, false]);
    if (client.gstin) billLines.push([`GST Number: ${client.gstin}`, false]);
    if (client.pan) billLines.push([`PAN Number: ${client.pan}`, false]);
    for (const [txt, bold] of billLines) for (const ln of wrap(txt, 10, bold, 250)) { T(ln, LX, y, {b: bold}); y += LH; }

    // Items table
    const tableHeader = top => {
      R(29, top, 554, 21, '#333333', 4);
      const by = top + 14;
      T('Item', 44, by, {c: '#FFFFFF'}); T('Quantity', 373, by, {c: '#FFFFFF'});
      T('Rate', 493, by, {c: '#FFFFFF', al: 'right'}); T('Amount', 568, by, {c: '#FFFFFF', al: 'right'});
      return top + 21 + 15;
    };
    let top = Math.max(y + 22, boxTop + 26 + 30);
    y = tableHeader(top);
    let last = y;
    for (const it of (inv.items || [])) {
      const lines = wrap(it.desc || '', 10, true, 315);
      const need = lines.length * 13 + 9;
      if (y + need > 740) { page++; y = tableHeader(40); }
      lines.forEach((ln, i) => T(ln, 44, y + i * 13, {b: true}));
      const amount = (Number(it.qty) || 0) * (Number(it.rate) || 0);
      T(fmtQty(it.qty), 373, y); T(money(it.rate), 493, y, {al: 'right'}); T(money(amount), 568, y, {al: 'right'});
      last = y + (lines.length - 1) * 13;
      y += need;
    }

    // Totals
    const rows = [['Subtotal:', money(t.subtotal)]];
    if (inv.type === 'gst') rows.push([`Tax (${trimNum(t.rate)}%):`, money(t.tax)]);
    rows.push(['Total:', money(t.total)]);
    if (t.paid > 0) rows.push(['Amount Paid:', money(t.paid)]);
    y = last + 64;
    if (y + rows.length * 22 > 760) { page++; y = 60; }
    for (const [k, v] of rows) { T(k, 464, y, {c: GREY, al: 'right'}); T(v, 568, y, {al: 'right'}); y += 22; }

    // Notes + terms
    y += 33;
    const block = (label, text) => {
      if (!text || !String(text).trim()) return;
      const lines = String(text).split('\n').flatMap(l => wrap(l, 10, false, 460));
      if (y + 16 + lines.length * 13.5 > 770) { page++; y = 60; }
      T(label, LX, y, {c: GREY}); y += 16;
      for (const ln of lines) { T(ln, LX, y); y += 13.5; }
      y += 14;
    };
    block('Notes:', inv.notes);
    block('Terms:', seller.terms);
    return {ops, pages: page + 1};
  }
  const trimNum = n => String(Math.round((Number(n) || 0) * 100) / 100);
  const fmtQty = q => trimNum(q);

  /* ---------- renderers ---------- */
  async function toPDF(inv) {
    await ready();
    const logo = await logoData(inv.logo);
    const {ops, pages} = layout(inv, logo);
    const doc = newDoc();
    for (let i = 1; i < pages; i++) doc.addPage();
    for (const op of ops) {
      doc.setPage(op.p + 1);
      if (op.t === 'rect') {
        doc.setFillColor(op.fill);
        if (op.r) doc.roundedRect(op.x, op.y, op.w, op.h, op.r, op.r, 'F'); else doc.rect(op.x, op.y, op.w, op.h, 'F');
      } else if (op.t === 'text') {
        doc.setFont('NS', op.b ? 'bold' : 'normal'); doc.setFontSize(op.s); doc.setTextColor(op.c);
        doc.text(op.str, op.x, op.y, {align: op.al});
      } else if (op.t === 'img') {
        const fmt = /^data:image\/png/i.test(op.src) ? 'PNG' : 'JPEG';
        try {
          doc.saveGraphicsState();
          doc.roundedRect(op.x, op.y, op.w, op.h, op.r, op.r, null); doc.clip(); doc.discardPath();
          doc.addImage(op.src, fmt, op.x, op.y, op.w, op.h);
          doc.restoreGraphicsState();
        } catch (e) { try { doc.addImage(op.src, fmt, op.x, op.y, op.w, op.h); } catch (e2) {} }
      }
    }
    doc.setProperties({title: `Invoice ${inv.label || ''}`, creator: 'Pages Desk'});
    return doc;
  }

  const escH = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  async function toHTML(inv) {
    await ready();
    const logo = await logoData(inv.logo);
    const {ops, pages} = layout(inv, logo);
    const out = [];
    for (let p = 0; p < pages; p++) {
      const parts = ops.filter(o => o.p === p).map(o => {
        if (o.t === 'rect') return `<div class="o" style="left:${o.x}px;top:${o.y}px;width:${o.w}px;height:${o.h}px;background:${o.fill};border-radius:${o.r}px"></div>`;
        if (o.t === 'img') return `<img class="o" alt="" src="${escH(o.src)}" style="left:${o.x}px;top:${o.y}px;width:${o.w}px;height:${o.h}px;border-radius:${o.r}px">`;
        const top = o.y - o.s * 0.86;
        const pos = o.al === 'right' ? `right:${PW - o.x}px` : `left:${o.x}px`;
        return `<div class="o" style="${pos};top:${top.toFixed(2)}px;font-size:${o.s}px;font-weight:${o.b ? 700 : 400};color:${o.c}">${escH(o.str)}</div>`;
      }).join('');
      out.push(`<div class="paper-fit" data-page="${p}"><div class="inv-page">${parts}</div></div>`);
    }
    return out.join('');
  }
  function fitPreview(root) {
    root.querySelectorAll('.paper-fit').forEach(f => {
      const k = f.clientWidth / PW;
      f.style.height = (PH * k) + 'px';
      const pg = f.firstElementChild; if (pg) pg.style.transform = `scale(${k})`;
    });
  }

  const safe = s => String(s || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  const fileName = inv => `Invoice ${safe(inv.label)}${inv.client && inv.client.company ? ' - ' + safe(inv.client.company) : ''}.pdf`;

  async function download(inv, save) {
    const doc = await toPDF(inv);
    return save(fileName(inv), doc.output('blob'));
  }
  async function zip(invs, zipName, save, onProgress) {
    if (!window.JSZip) throw new Error('ZIP library failed to load');
    const z = new window.JSZip(); const used = new Set();
    for (let i = 0; i < invs.length; i++) {
      const doc = await toPDF(invs[i]);
      let name = fileName(invs[i]); let n = 2;
      while (used.has(name)) name = fileName(invs[i]).replace(/\.pdf$/, ` (${n++}).pdf`);
      used.add(name);
      z.file(name, doc.output('arraybuffer'));
      if (onProgress) onProgress(i + 1, invs.length);
    }
    const blob = await z.generateAsync({type: 'blob'});
    return save(zipName, blob);
  }

  window.InvoicePDF = {ready, toPDF, toHTML, fitPreview, download, zip, totals, money, fmtDate, fileName};
})();
