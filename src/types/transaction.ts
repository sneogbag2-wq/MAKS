export type TransactionType = 'SATIS' | 'TAHSILAT' | 'HIZMET_IADE' | 'VIRMAN_BORC' | 'VIRMAN_ALACAK' | 'DEVIR_BORC' | 'DEVIR_ALACAK' | 'CEK' | 'SENET';

export interface SalesInvoice {
  id?: string;
  invoiceId?: string;
  customerId: string;
  customerName?: string;
  amount: number;
  invoiceDate: string;
  dueDate?: string;
  eDocumentNo?: string;
  description?: string;
  status?: string;
  type?: string;
}

export interface Collection {
  id?: string;
  collectionId?: string;
  customerId: string;
  customerName?: string;
  amount: number;
  date: string;
  paymentMethod?: string;
  bankCode?: string;
  eDocumentNo?: string;
  description?: string;
  status?: string;
  type?: string;
}

export interface CreditNote {
  id?: string;
  creditNoteId?: string;
  customerId: string;
  customerName?: string;
  amount: number;
  date: string;
  eDocumentNo?: string;
  description?: string;
  status?: string;
  type?: string;
}

export interface Cheque {
  id?: string;
  chequeId?: string;
  customerId: string;
  customerName?: string;
  signName?: string;
  salesRep?: string;
  amount: number;
  issueDate?: string;
  dueDate: string;
  docNo?: string;
  bankName?: string;
  type?: 'CEK' | 'SENET' | string;
  status?: string;
  portfolio?: string;
}

export interface TransactionRow {
  id: string;
  date: string;
  type: string;
  docNo: string;
  debit: number;
  credit: number;
  balance: number;
  description: string;
  _originalIndex?: number;
}
