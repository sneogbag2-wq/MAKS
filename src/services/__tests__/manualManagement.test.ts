import { describe, it, expect, beforeAll } from 'vitest';
import { authenticateAdmin } from '../customRulesService';
import {
  initFromArchive,
  addManualInvoice,
  addManualCollection,
  addVirmanTransfer,
  deleteTransactionRecord,
  getCustomerStatement
} from '../customerService';

describe('Manual Transaction Management & Virman', () => {
  beforeAll(async () => {
    authenticateAdmin('2580');
    await initFromArchive();
  });

  it('should add a manual sales invoice and increase customer debt balance', async () => {
    const custId = '5000188291';
    const initStmt = await getCustomerStatement(custId);
    const initBalance = initStmt.balance;

    const inv = await addManualInvoice({
      customerId: custId,
      amount: 15000,
      description: 'Test Manuel Fatura'
    });

    expect(inv).toHaveProperty('invoiceId');
    expect(inv.amount).toBe(15000);

    const updatedStmt = await getCustomerStatement(custId);
    expect(updatedStmt.balance).toBe(initBalance + 15000);
  });

  it('should add a manual collection and decrease customer debt balance', async () => {
    const custId = '5000188291';
    const initStmt = await getCustomerStatement(custId);
    const initBalance = initStmt.balance;

    const col = await addManualCollection({
      customerId: custId,
      amount: 5000,
      method: 'NAKİT',
      description: 'Test Manuel Tahsilat'
    });

    expect(col).toHaveProperty('collectionId');
    expect(col.amount).toBe(5000);

    const updatedStmt = await getCustomerStatement(custId);
    expect(updatedStmt.balance).toBe(initBalance - 5000);
  });

  it('should execute Virman transfer between two customers', async () => {
    const sourceId = '5000188291';
    const targetId = '5000266833';

    const sourceInit = await getCustomerStatement(sourceId);
    const targetInit = await getCustomerStatement(targetId);

    const virmanRes = await addVirmanTransfer({
      sourceCustomerId: sourceId,
      targetCustomerId: targetId,
      amount: 2500,
      description: 'Test Virman Transfer'
    });

    expect(virmanRes).toHaveProperty('virmanDocNo');

    const sourceUpdated = await getCustomerStatement(sourceId);
    const targetUpdated = await getCustomerStatement(targetId);

    expect(sourceUpdated.balance).toBe(sourceInit.balance - 2500);
    expect(targetUpdated.balance).toBe(targetInit.balance + 2500);
  });

  it('should delete a transaction record and update balance', async () => {
    const custId = '5000188291';
    const inv = await addManualInvoice({
      customerId: custId,
      amount: 7500,
      description: 'Temporary Test Invoice'
    });

    const stmtBefore = await getCustomerStatement(custId);

    await deleteTransactionRecord({
      id: inv.invoiceId,
      type: 'SATIŞ',
      customerId: custId
    });

    const stmtAfter = await getCustomerStatement(custId);
    expect(stmtAfter.balance).toBe(stmtBefore.balance - 7500);
  });
});
