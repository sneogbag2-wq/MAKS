import * as XLSX from 'xlsx';
import { formatCurrency, formatDate } from './formatters';
import { getCustomerStatementSync, searchCustomersSync } from '../services/customerService';

export function exportToCorporateExcel({
  title = 'CARİ HESAP EKSTRESİ',
  customer,
  subtitle = '',
  columns,
  rows,
  fileName = 'Rapor.xlsx',
  sheetName = 'Ekstre'
}: {
  title?: string;
  customer?: any;
  subtitle?: string;
  columns: any[];
  rows: any[];
  fileName?: string;
  sheetName?: string;
}) {
  try {
    const custName = customer?.signName || customer?.customerName || 'Tüm Şirket (Genel)';
    const custId = customer?.customerId || '-';
    const salesRep = customer?.salesRepName || customer?.salesRep || 'Key Account';
    const reportDate = new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    const totalCols = columns.length;
    const lastColIdx = Math.max(0, totalCols - 1);

    const sheetData: any[][] = [
      ['AKGÜN MEŞRUBAT GIDA SAN. VE TİC. LTD. ŞTİ.'],
      [`RAPOR: ${title.toUpperCase()} ${subtitle ? `(${subtitle})` : ''}`],
      [`Cari Adı: ${custName}  |  Cari Kod: ${custId}  |  Temsilci: ${salesRep}`],
      [`Rapor Oluşturma Tarihi: ${reportDate}`],
      [],
      columns.map(c => c.header)
    ];

    rows.forEach(r => {
      const rowValues = columns.map(c => {
        const rawVal = c.excelValue ? c.excelValue(r) : (c.key ? r[c.key] : '');
        if (c.isNumeric) {
          const num = parseFloat(rawVal) || 0;
          return Math.round(num * 100) / 100;
        }
        return rawVal ?? '';
      });
      sheetData.push(rowValues);
    });

    const hasNumericCols = columns.some(c => c.isNumeric);
    const summaryRowIdx = sheetData.length + 1;
    
    if (hasNumericCols) {
      sheetData.push([]);
      const totalRow = columns.map((c, idx) => {
        if (idx === 0) return 'GENEL TOPLAM / SON DURUM';
        if (c.isNumeric && c.key) {
          const sum = rows.reduce((acc, curr) => acc + (parseFloat(curr[c.key]) || 0), 0);
          return Math.round(sum * 100) / 100;
        }
        return '';
      });
      sheetData.push(totalRow);
    }

    const worksheet = XLSX.utils.aoa_to_sheet(sheetData);

    const firstNumericColIdx = columns.findIndex(c => c.isNumeric);
    const labelMergeEndCol = firstNumericColIdx > 0 ? firstNumericColIdx - 1 : Math.max(0, totalCols - 4);

    const merges: XLSX.Range[] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: lastColIdx } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: lastColIdx } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: lastColIdx } },
      { s: { r: 3, c: 0 }, e: { r: 3, c: lastColIdx } }
    ];

    if (hasNumericCols) {
      merges.push({ s: { r: summaryRowIdx, c: 0 }, e: { r: summaryRowIdx, c: labelMergeEndCol } });
    }

    worksheet['!merges'] = merges;

    const colWidths = columns.map((col, colIdx) => {
      let maxLen = (col.header || '').length;
      sheetData.slice(5).forEach(row => {
        const val = row[colIdx];
        if (val !== undefined && val !== null) {
          const strLen = String(val).length;
          if (strLen > maxLen) maxLen = strLen;
        }
      });
      return { wch: Math.max(maxLen + 5, 16) };
    });

    worksheet['!cols'] = colWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    const cleanFileName = fileName.endsWith('.xlsx') ? fileName : `${fileName.replace('.xls', '')}.xlsx`;
    XLSX.writeFile(workbook, cleanFileName);

  } catch (error) {
    console.error('Kurumsal Excel oluşturma hatası:', error);
    exportToBasicExcel(rows, fileName, sheetName);
  }
}

export function exportToBasicExcel(data: any[], fileName = 'Rapor.xlsx', sheetName = 'Sayfa1') {
  try {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    XLSX.writeFile(workbook, fileName);
  } catch (error: any) {
    console.error('Basic Excel Error:', error);
    alert(`Excel dosyası oluşturulamadı: ${error.message}`);
  }
}

export function printReportHTML({ title, customer, subtitle, columns, rows, summaryBoxes }: {
  title: string;
  customer?: any;
  subtitle?: string;
  columns: any[];
  rows: any[];
  summaryBoxes?: any[];
}) {
  const printWindow = window.open('', '_blank', 'width=1050,height=850');
  if (!printWindow) {
    alert('Yazdırma penceresi açılamadı. Lütfen tarayıcınızın pop-up engelleyicisini kontrol edin.');
    return;
  }

  const custName = customer?.signName || customer?.customerName || 'Tüm Şirket (Genel)';
  const custId = customer?.customerId || '-';
  const salesRep = customer?.salesRepName || customer?.salesRep || 'Key Account';
  const printDate = new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const summaryHtml = summaryBoxes && summaryBoxes.length > 0 ? `
    <div style="display: flex; gap: 15px; margin-bottom: 20px;">
      ${summaryBoxes.map(b => `
        <div style="flex: 1; background: #F8FAFC; border: 1px solid #CBD5E1; border-radius: 8px; padding: 10px 14px; box-shadow: 0 1px 2px rgba(0,0,0,0.03);">
          <div style="font-size: 10px; color: #64748B; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">${b.label}</div>
          <div style="font-size: 16px; font-weight: 800; color: ${b.color || '#0F172A'}; margin-top: 4px;">${b.value}</div>
        </div>
      `).join('')}
    </div>
  ` : '';

  const tableHeaderHtml = `
    <thead>
      <tr>
        ${columns.map(c => `<th style="background: #0F172A; color: #FFFFFF; padding: 9px 12px; font-size: 11px; text-transform: uppercase; text-align: ${c.align || 'left'}; border: 1px solid #334155; font-weight: 700; letter-spacing: 0.03em;">${c.header}</th>`).join('')}
      </tr>
    </thead>
  `;

  const tableBodyHtml = `
    <tbody>
      ${rows.map((r, idx) => `
        <tr style="background: ${idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC'};">
          ${columns.map(c => `<td style="padding: 8px 12px; font-size: 11px; color: #0F172A; border-bottom: 1px solid #E2E8F0; border-right: 1px solid #F1F5F9; text-align: ${c.align || 'left'};">${c.render ? c.render(r) : (r[c.key] ?? '-')}</td>`).join('')}
        </tr>
      `).join('')}
    </tbody>
  `;

  const html = `
    <!DOCTYPE html>
    <html lang="tr">
    <head>
      <meta charset="UTF-8">
      <title>${title} - ${custName}</title>
      <style>
        @page { size: A4 portrait; margin: 12mm; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0F172A; margin: 0; padding: 20px; font-size: 12px; background: #FFFFFF; }
        .brand-container { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #8A6D1F; padding-bottom: 12px; margin-bottom: 16px; }
        .brand-title { font-size: 22px; font-weight: 900; color: #8A6D1F; letter-spacing: -0.5px; line-height: 1.1; }
        .brand-subtitle { font-size: 11px; color: #64748B; font-weight: 600; margin-top: 2px; }
        .report-title-box { text-align: right; }
        .report-title { font-size: 18px; font-weight: 800; color: #0F172A; text-transform: uppercase; letter-spacing: -0.3px; }
        .report-subtitle { font-size: 11px; color: #64748B; margin-top: 2px; }
        .info-card { background: #F1F5F9; border: 1px solid #CBD5E1; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; display: flex; justify-content: space-between; gap: 15px; }
        .info-item { font-size: 11px; color: #475569; }
        .info-item strong { color: #0F172A; font-weight: 700; margin-left: 4px; }
        table.data-table { width: 100%; border-collapse: collapse; margin-top: 10px; border: 1px solid #CBD5E1; border-radius: 6px; overflow: hidden; }
        .footer { margin-top: 30px; border-top: 1px solid #E2E8F0; padding-top: 12px; font-size: 10px; color: #94A3B8; display: flex; justify-content: space-between; }
        @media print {
          body { padding: 0; }
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      <div class="brand-container">
        <div>
          <div class="brand-title">AKGÜN MEŞRUBAT GIDA</div>
          <div class="brand-subtitle">Finansal Dağıtım & Risk Yönetim Sistemi</div>
        </div>
        <div class="report-title-box">
          <div class="report-title">${title}</div>
          <div class="report-subtitle">${subtitle || ''}</div>
        </div>
      </div>

      <div class="info-card">
        <div class="info-item">Cari Adı:<strong>${custName}</strong></div>
        <div class="info-item">Cari Kod:<strong>${custId}</strong></div>
        <div class="info-item">Temsilci:<strong>${salesRep}</strong></div>
        <div class="info-item">Rapor Tarihi:<strong>${printDate}</strong></div>
      </div>

      ${summaryHtml}

      <table class="data-table">
        ${tableHeaderHtml}
        ${tableBodyHtml}
      </table>

      <div class="footer">
        <span>AKGÜN Meşrubat Gıda San. ve Tic. Ltd. Şti. — Resmi Rapor Çıktısı</span>
        <span>Raporlama Sistemi v1.1</span>
      </div>

      <script>
        window.onload = function() {
          setTimeout(function() {
            window.print();
          }, 300);
        };
      </script>
    </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}

export function parseDateRangeFromQuery(query = '') {
  if (!query || typeof query !== 'string') return null;
  const q = query.toLowerCase();
  const months = ['ocak', 'şubat', 'mart', 'nisan', 'mayıs', 'haziran', 'temmuz', 'ağustos', 'eylül', 'ekim', 'kasım', 'aralık'];
  
  const rangeMatch = q.match(/(\d{1,2})\s+([a-zğüşıöç]+)(?:\s+(\d{4}))?\s*[-–—a-zğüşıöç\s]*\s*(\d{1,2})\s+([a-zğüşıöç]+)(?:\s+(\d{4}))?/i);
  if (rangeMatch) {
    const day1 = parseInt(rangeMatch[1], 10);
    const m1Idx = months.indexOf(rangeMatch[2].toLowerCase());
    const year1 = rangeMatch[3] ? parseInt(rangeMatch[3], 10) : 2026;

    const day2 = parseInt(rangeMatch[4], 10);
    const m2Idx = months.indexOf(rangeMatch[5].toLowerCase());
    const year2 = rangeMatch[6] ? parseInt(rangeMatch[6], 10) : year1;

    if (m1Idx !== -1 && m2Idx !== -1) {
      const startDate = `${year1}-${String(m1Idx + 1).padStart(2, '0')}-${String(day1).padStart(2, '0')}`;
      const endDate = `${year2}-${String(m2Idx + 1).padStart(2, '0')}-${String(day2).padStart(2, '0')}`;
      return { startDate, endDate };
    }
  }

  for (let i = 0; i < months.length; i++) {
    if (q.includes(months[i])) {
      const mNum = String(i + 1).padStart(2, '0');
      const lastDay = new Date(2026, i + 1, 0).getDate();
      return {
        startDate: `2026-${mNum}-01`,
        endDate: `2026-${mNum}-${String(lastDay).padStart(2, '0')}`
      };
    }
  }

  return null;
}

export function triggerCustomerPDFPrintSync(customerIdOrQuery: string, options: any = {}) {
  try {
    let stmt = getCustomerStatementSync(customerIdOrQuery);
    if (!stmt || !stmt.transactions || stmt.transactions.length === 0) {
      const matched = searchCustomersSync(customerIdOrQuery, true);
      if (matched && matched.length > 0) {
        stmt = getCustomerStatementSync(matched[0].customerId);
      }
    }
    if (!stmt || !stmt.customer) return false;

    let rows = stmt.transactions || [];
    let startDate = options?.startDate;
    let endDate = options?.endDate;

    if (!startDate && typeof customerIdOrQuery === 'string') {
      const parsed = parseDateRangeFromQuery(customerIdOrQuery);
      if (parsed) {
        startDate = parsed.startDate;
        endDate = parsed.endDate;
      }
    }

    if (startDate && endDate) {
      rows = rows.filter((r: any) => {
        const d = String(r.date || '');
        return d >= startDate && d <= endDate;
      });
    }

    const totalSales = rows.filter((r: any) => (r.type || '') === 'SATIŞ').reduce((sum: number, r: any) => sum + (r.debit || 0), 0);
    const totalCollections = rows.filter((r: any) => (r.type || '').includes('TAHSİLAT')).reduce((sum: number, r: any) => sum + (r.credit || 0), 0);
    
    let subtitleStr = `Toplam ${rows.length} Hareket`;
    if (startDate && endDate) {
      subtitleStr = `${formatDate(startDate)} - ${formatDate(endDate)} Tarihleri Arası (${rows.length} İşlem)`;
    }

    printReportHTML({
      title: 'CARİ HESAP EKSTRESİ',
      customer: stmt.customer,
      subtitle: subtitleStr,
      summaryBoxes: [
        { label: 'GÜNCEL BAKİYE', value: `${formatCurrency(Math.abs(stmt.balance || 0))} ${stmt.balance > 0 ? '(B)' : '(A)'}`, color: stmt.balance > 0 ? '#dc2626' : '#059669' },
        { label: 'DÖNEM SATIŞ', value: formatCurrency(totalSales), color: '#2563eb' },
        { label: 'DÖNEM TAHSİLAT', value: formatCurrency(totalCollections), color: '#059669' }
      ],
      columns: [
        { header: 'İşlem Tarihi', render: (r: any) => formatDate(r.date) },
        { header: 'İşlem Türü', render: (r: any) => r.type },
        { header: 'Belge No', render: (r: any) => r.docNo },
        { header: 'Açıklama', render: (r: any) => r.description },
        { header: 'Borç (TL)', align: 'right', render: (r: any) => r.debit > 0 ? formatCurrency(r.debit) : '-' },
        { header: 'Alacak (TL)', align: 'right', render: (r: any) => r.credit > 0 ? formatCurrency(r.credit) : '-' },
        { header: 'Bakiye (TL)', align: 'right', render: (r: any) => `${formatCurrency(Math.abs(r.balance))} ${r.balance > 0 ? '(B)' : '(A)'}` }
      ],
      rows: rows
    });
    return true;
  } catch (err) {
    console.error('triggerCustomerPDFPrintSync error:', err);
    return false;
  }
}

export function triggerCustomerExcelExportSync(customerIdOrQuery: string, options: any = {}) {
  try {
    let stmt = getCustomerStatementSync(customerIdOrQuery);
    if (!stmt || !stmt.transactions || stmt.transactions.length === 0) {
      const matched = searchCustomersSync(customerIdOrQuery, true);
      if (matched && matched.length > 0) {
        stmt = getCustomerStatementSync(matched[0].customerId);
      }
    }
    if (!stmt || !stmt.customer) return false;

    let rows = stmt.transactions || [];
    let startDate = options?.startDate;
    let endDate = options?.endDate;

    if (!startDate && typeof customerIdOrQuery === 'string') {
      const parsed = parseDateRangeFromQuery(customerIdOrQuery);
      if (parsed) {
        startDate = parsed.startDate;
        endDate = parsed.endDate;
      }
    }

    if (startDate && endDate) {
      rows = rows.filter((r: any) => {
        const d = String(r.date || '');
        return d >= startDate && d <= endDate;
      });
    }

    let subtitleStr = `Toplam ${rows.length} Hareket`;
    if (startDate && endDate) {
      subtitleStr = `${formatDate(startDate)} - ${formatDate(endDate)} Tarihleri Arası (${rows.length} İşlem)`;
    }

    exportToCorporateExcel({
      title: 'CARİ HESAP EKSTRESİ',
      customer: stmt.customer,
      subtitle: subtitleStr,
      fileName: `Cari_Ekstre_${stmt.customer?.customerId}_${Date.now()}.xlsx`,
      sheetName: 'Ekstre',
      columns: [
        { header: 'İşlem Tarihi', excelValue: (r: any) => formatDate(r.date) },
        { header: 'İşlem Türü', excelValue: (r: any) => r.type },
        { header: 'Açıklama', excelValue: (r: any) => r.description || '' },
        { header: 'Belge / Fatura No', excelValue: (r: any) => r.docNo || '' },
        { header: 'Borç (TL)', key: 'debit', isNumeric: true, excelValue: (r: any) => r.debit || 0 },
        { header: 'Alacak (TL)', key: 'credit', isNumeric: true, excelValue: (r: any) => r.credit || 0 },
        { header: 'Küm. Bakiye (TL)', key: 'balance', isNumeric: true, excelValue: (r: any) => r.balance || 0 }
      ],
      rows: rows
    });
    return true;
  } catch (err) {
    console.error('triggerCustomerExcelExportSync error:', err);
    return false;
  }
}

if (typeof window !== 'undefined') {
  (window as any).__triggerCustomerPDFPrint = triggerCustomerPDFPrintSync;
  (window as any).__triggerCustomerExcelExport = triggerCustomerExcelExportSync;
}
