import { describe, it, expect } from 'vitest';
import type { Customer, SalesInvoice, Collection, Cheque, AiMessage, InvoiceControlReport } from '../index.js';

describe('TypeScript Models & Type Integrity Tests', () => {
  it('should construct a valid Customer object matching TypeScript interface', () => {
    const customer: Customer = {
      customerId: '5000100015',
      customerName: 'ATEŞ BAKKALİYESİ',
      signName: 'ATEŞ BAKKAL',
      salesRep: 'ALİCAN AKBAŞ',
      balance: 12450.50,
      averageVade: 15
    };

    expect(customer.customerId).toBe('5000100015');
    expect(customer.balance).toBe(12450.50);
    expect(typeof customer.customerId).toBe('string');
  });

  it('should construct a valid SalesInvoice object matching TypeScript interface', () => {
    const invoice: SalesInvoice = {
      invoiceId: 'INV-2026-001',
      customerId: '5000100015',
      amount: 45000.00,
      invoiceDate: '2026-07-29',
      eDocumentNo: 'GIB202600000123'
    };

    expect(invoice.amount).toBe(45000.00);
    expect(invoice.invoiceDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('should construct a valid Collection object with payment method', () => {
    const collection: Collection = {
      collectionId: 'COL-2026-001',
      customerId: '5000100015',
      amount: 15000.00,
      date: '2026-07-30',
      paymentMethod: 'HAVALE',
      bankCode: 'AKBANK'
    };

    expect(collection.paymentMethod).toBe('HAVALE');
    expect(collection.amount).toBeGreaterThan(0);
  });

  it('should construct a valid Cheque object with due date', () => {
    const cheque: Cheque = {
      chequeId: 'CHK-1001',
      customerId: '5000100015',
      amount: 25000.00,
      dueDate: '2026-08-15',
      type: 'CEK',
      portfolio: 'PORTFOYDE'
    };

    expect(cheque.type).toBe('CEK');
    expect(cheque.dueDate).toBe('2026-08-15');
  });

  it('should construct a valid InvoiceControlReport structure', () => {
    const report: InvoiceControlReport = {
      targetDate: '2026-07-30',
      salesRepFilter: 'Tüm Temsilciler',
      isUnpaidFilterActive: false,
      totalMatchingCustomers: 1,
      unpaidCustomerCount: 0,
      totalInvoiceAmount: 50000,
      formattedTotalInvoiceAmount: '₺50.000,00',
      totalCollectionAmount: 20000,
      formattedTotalCollectionAmount: '₺20.000,00',
      totalPrevCollectionAmount: 10000,
      formattedTotalPrevCollectionAmount: '₺10.000,00',
      customerList: [
        {
          customerId: '5000100015',
          customerName: 'ATEŞ BAKKAL',
          balance: 30000,
          formattedBalance: '₺30.000,00',
          invoiceTotal: 50000,
          formattedInvoiceTotal: '₺50.000,00',
          collectionTotal: 20000,
          formattedCollectionTotal: '₺20.000,00',
          prevCollectionTotal: 10000,
          formattedPrevCollectionTotal: '₺10.000,00',
          isUnpaidOnDate: false
        }
      ]
    };

    expect(report.customerList).toHaveLength(1);
    expect(report.customerList[0].customerId).toBe('5000100015');
  });
});
