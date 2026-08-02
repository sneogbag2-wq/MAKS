import { calculateBalance, getOpenInvoices } from './src/calculations/cariCalculations.js';
import { mockSalesInvoices, mockCollections, mockCustomerCreditNotes, mockCustomers } from './src/data/mockData.js';

const atesBakkal = mockCustomers.find(c => c.customerName && c.customerName.includes('ATEŞ'));
console.log("Customer:", atesBakkal.customerName, atesBakkal.customerId);

const sales = mockSalesInvoices.filter(s => s.customerId === atesBakkal.customerId);
const cols = mockCollections.filter(c => c.customerId === atesBakkal.customerId);
const credits = mockCustomerCreditNotes.filter(c => c.customerId === atesBakkal.customerId);

const open = getOpenInvoices(sales, cols, credits, new Date());
console.log("Open invoices length:", open.length);
open.forEach(o => console.log(o.invoiceDate, o.originalAmount, o.openAmount));
