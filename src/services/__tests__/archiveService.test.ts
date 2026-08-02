import { describe, it, expect } from 'vitest';
import {
  archiveCustomers,
  archiveSalesInvoices,
  archiveCollections,
  getArchiveSummary,
  hasArchivedData
} from '../archiveService';

describe('archiveService unit tests', () => {
  it('should handle customer archiving without errors', async () => {
    const res = await archiveCustomers([
      { customerId: '5000999999', customerName: 'Test Müşteri 999' }
    ]);
    expect(res).toHaveProperty('added');
    expect(res).toHaveProperty('skippedDuplicate');
  });

  it('should handle sales invoice archiving without errors', async () => {
    const res = await archiveSalesInvoices([
      { invoiceId: 'INV-TEST-999', customerId: '5000999999', amount: 1000, invoiceDate: '2026-07-30' }
    ]);
    expect(res).toHaveProperty('added');
  });

  it('should handle collection archiving without errors', async () => {
    const res = await archiveCollections([
      { collectionId: 'COL-TEST-999', customerId: '5000999999', amount: 500, date: '2026-07-30' }
    ]);
    expect(res).toHaveProperty('added');
  });

  it('should return archive summary and check archived data existence', async () => {
    const summary = await getArchiveSummary();
    expect(summary).toHaveProperty('customers');
    expect(summary).toHaveProperty('satisRecords');

    const hasData = await hasArchivedData();
    expect(typeof hasData).toBe('boolean');
  });
});
