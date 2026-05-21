/* ==============================================================
   EXPORT MODULE — Grand Kavala Luxury Hotel & Resort
   Premium business reports (PDF, Excel)
   ============================================================== */

(function () {
  'use strict';

  /* ── Helpers ────────────────────────────────────────────── */

  function getUserMeta() {
    try {
      const u = JSON.parse(localStorage.getItem('hotel_user') || '{}');
      return { name: u.name || 'Χρήστης', role: u.Role || '' };
    } catch { return { name: 'Χρήστης', role: '' }; }
  }

  function fmtDate(d) {
    return d.toLocaleDateString('el-GR', {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  const now = new Date();
  const meta = getUserMeta();
  const dateStr = fmtDate(now);

  /* ── Extract stat cards (key-value pairs) from DOM ──────── */

  function extractStats(root) {
    const cards = [];
    root.querySelectorAll('.sc').forEach(el => {
      const label = el.querySelector('.sc-lbl')?.textContent?.trim();
      const value = el.querySelector('.sc-val')?.textContent?.trim();
      if (label && value) cards.push({ label, value });
    });
    return cards;
  }

  /* ── Build executive summary HTML block ────────────────── */

  function buildSummary(stats) {
    if (!stats.length) return '';
    const cols = Math.min(stats.length, 4);
    const items = stats.map(s => `
      <div style="background:#F4F6F9;border-radius:8px;padding:14px 16px;border-left:3px solid #A8892A;text-align:center;">
        <div style="font-size:10px;color:#6B7280;text-transform:uppercase;letter-spacing:.6px;margin-bottom:4px;">${s.label}</div>
        <div style="font-size:20px;font-weight:600;color:#1A2B4C;">${s.value}</div>
      </div>
    `).join('');
    return `
      <div style="margin-bottom:28px;">
        <div style="font-size:13px;font-weight:600;color:#1A2B4C;text-transform:uppercase;letter-spacing:1px;margin:0 0 2px 0;">Εκτελεστική Περίληψη</div>
        <p style="font-size:10px;color:#6B7280;margin:0 0 12px 0;">Συνοπτική παρουσίαση βασικών μεγεθών και δεικτών απόδοσης</p>
        <div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:10px;">${items}</div>
      </div>
    `;
  }

  /* ── Build metadata bar ────────────────────────────────── */

  function buildMeta(title) {
    const roleLabel = meta.role ? ` · ${meta.role}` : '';
    return `
      <div style="display:flex;flex-wrap:wrap;gap:16px 28px;padding:0 0 18px 0;margin-bottom:22px;border-bottom:1px solid #E5E7EB;font-size:10px;color:#6B7280;">
        <span><strong style="color:#374151;">Αναφορά:</strong> ${title}</span>
        <span><strong style="color:#374151;">Ημερομηνία:</strong> ${dateStr}</span>
        <span><strong style="color:#374151;">Δημιουργός:</strong> ${meta.name}${roleLabel}</span>
      </div>
    `;
  }

  /* ── Build footer ────────────────────────────────────────── */

  function buildFooter() {
    return `
      <div style="padding:14px 30px;background:#F9FAFB;border-top:1px solid #E5E7EB;text-align:center;font-size:9px;color:#9CA3AF;line-height:1.7;">
        Grand Kavala Luxury Hotel &amp; Resort — Αναφορά δημιουργήθηκε στις ${dateStr} από ${meta.name}
        <br>Εμπιστευτικό έγγραφο — Μόνο για εσωτερική χρήση
      </div>
    `;
  }

  /* ── Prepare DOM clone for clean PDF output ────────────── */

  function prepareContent(el) {
    const clone = el.cloneNode(true);
    clone.querySelectorAll('button, input, textarea, select, .room-actions').forEach(n => n.remove());
    clone.querySelectorAll('[onclick]').forEach(n => n.removeAttribute('onclick'));
    return clone;
  }

  /* ── Guess report title from element ───────────────────── */

  function guessTitle(el) {
    const hd = el.querySelector('.card-hd-l, .card-hd');
    if (hd) return hd.textContent.trim().replace(/^[^a-zA-Zα-ωΑ-Ω0-9]+/, '');
    return 'Αναφορά';
  }

  /* ══════════════════════════════════════════════════════════
     PDF EXPORT — premium A4 report
     ══════════════════════════════════════════════════════════ */

  window.exportToPDF = function (elementId, filename) {
    const element = document.getElementById(elementId);
    if (!element) return;

    const cloned = prepareContent(element);
    const stats = extractStats(cloned);
    const title = guessTitle(element);

    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div style="width:190mm;padding:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#111827;background:#FFFFFF;">

        <!-- HEADER BAND -->
        <div style="background:linear-gradient(135deg,#1A2B4C 0%,#0F1D33 100%);padding:28px 30px 22px 30px;">
          <div style="color:#A8892A;font-size:10px;letter-spacing:3px;text-transform:uppercase;">Grand Kavala Luxury Hotel &amp; Resort</div>
          <div style="color:#FFFFFF;font-size:24px;font-weight:300;margin-top:6px;letter-spacing:.5px;">${title}</div>
          <div style="color:rgba(255,255,255,.55);font-size:11px;margin-top:3px;">${filename.replace(/_/g, ' ')}</div>
        </div>

        <!-- BODY -->
        <div style="padding:24px 30px 10px 30px;">
          ${buildSummary(stats)}
          ${buildMeta(title)}
          <div id="gk-export-content" style="font-size:11px;line-height:1.7;color:#374151;">
            ${cloned.innerHTML}
          </div>
        </div>

        <!-- FOOTER -->
        ${buildFooter()}

      </div>
    `;

    const opt = {
      margin: 10,
      filename: `${filename}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    html2pdf().set(opt).from(wrap).save();
  };

  /* ══════════════════════════════════════════════════════════
     EXCEL EXPORT — styled workbook (summary + data)
     ══════════════════════════════════════════════════════════ */

  window.exportToExcel = function (tableId, filename) {
    const table = document.getElementById(tableId);
    if (!table) return;

    const wb = XLSX.utils.book_new();

    // ── Sheet 1: Executive Summary ──
    const tbody = table.querySelector('tbody');
    const rowCount = tbody ? tbody.rows.length : 0;
    const colCount = table.querySelector('thead tr')?.cells.length || 2;

    let total = 0;
    if (tbody) {
      for (const row of tbody.rows) {
        const last = row.cells[row.cells.length - 1]?.textContent?.trim().replace(/[^0-9,.-]/g, '').replace(',', '.');
        const v = parseFloat(last);
        if (!isNaN(v)) total += v;
      }
    }

    const now = new Date();
    const meta = getUserMeta();
    const dateStr = fmtDate(now);

    const summaryRows = [
      ['Grand Kavala Luxury Hotel & Resort'],
      ['Executive Summary'],
      [],
      ['Ημερομηνία δημιουργίας', dateStr],
      ['Δημιουργός', `${meta.name}${meta.role ? ' · ' + meta.role : ''}`],
      ['Αρχείο', `${filename}.xlsx`],
      [],
      ['Στατιστικά Στοιχεία'],
      ['Σύνολο εγγραφών', rowCount],
      ['Σύνολο στηλών', colCount],
      ['Σύνολο ποσού (€)', total > 0 ? `€${total.toFixed(2)}` : '—'],
    ];

    const wsSum = XLSX.utils.aoa_to_sheet(summaryRows);
    wsSum['!cols'] = [{ wch: 32 }, { wch: 42 }];
    XLSX.utils.book_append_sheet(wb, wsSum, 'Executive Summary');

    // ── Sheet 2: Data ──
    const wsData = XLSX.utils.table_to_sheet(table, { raw: true });
    wsData['!cols'] = Array.from({ length: colCount }, (_, i) => ({ wch: i === 0 ? 28 : 16 }));
    XLSX.utils.book_append_sheet(wb, wsData, 'Λεπτομέρειες');

    XLSX.writeFile(wb, `${filename}.xlsx`);
  };

})();
