import * as XLSX from 'xlsx';
import fs from 'fs';
import { parseSales } from './src/parsers/salesParser.js';

const data = fs.readFileSync('../SATIŞ.xlsx');
const workbook = XLSX.read(data, { type: 'buffer', cellDates: true });
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });

const result = parseSales(rows);
console.log('Total parsed records:', result.records.length);

const days = {0:0, 1:0, 2:0, 3:0, 4:0, 5:0, 6:0};
result.records.forEach(r => {
  const iso = r.invoiceDate;
  if (iso) {
    const day = new Date(iso).getUTCDay();
    days[day]++;
  }
});
console.log('Day distribution of PARSED records:', days);
