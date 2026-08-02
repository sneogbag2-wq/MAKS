import { safeIsoDate } from './src/utils/dateUtils.js';
import * as XLSX from 'xlsx';
import fs from 'fs';
const data = fs.readFileSync('../SATIŞ.xlsx');
const workbook = XLSX.read(data, { type: 'buffer', cellDates: true });
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
const days = {0:0, 1:0, 2:0, 3:0, 4:0, 5:0, 6:0};
let invalid = 0;
rows.forEach(r => {
  const d = r['Fatura Tarihi'];
  const iso = safeIsoDate(d);
  if (iso) {
    const day = new Date(iso).getUTCDay();
    days[day]++;
  } else {
    invalid++;
  }
});
console.log('Day distribution:', days);
console.log('Invalid dates:', invalid);
