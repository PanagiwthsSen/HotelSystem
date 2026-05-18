/* 2. Δημιουργία νέου αρχείου: js/export.js */
window.exportToExcel = function(tableId, filename) {
    const table = document.getElementById(tableId);
    if (!table) return;
    const wb = XLSX.utils.table_to_book(table, {sheet: "GrandKavala"});
    XLSX.writeFile(wb, `${filename}.xlsx`);
};

window.exportToPDF = function(elementId, filename) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    const wrap = document.createElement('div');
    wrap.innerHTML = `
        <div style="text-align:center; margin-bottom:20px; border-bottom:2px solid #A8892A; padding-bottom:10px;">
            <h1 style="color:#1a2b4c; font-family:'Times New Roman', serif; letter-spacing:2px; margin:0;">GRAND KAVALA</h1>
            <p style="color:#A8892A; font-size:12px; margin:0; letter-spacing:1px;">LUXURY HOTEL & RESORT</p>
        </div>
    `;
    const clonedContent = element.cloneNode(true);
    wrap.appendChild(clonedContent);

    const opt = {
        margin: 15,
        filename: `${filename}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    html2pdf().set(opt).from(wrap).save();
};