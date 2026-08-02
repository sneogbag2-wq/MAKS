export interface Attachment {
  fileName: string;
  mimeType: string;
  base64?: string;
  textContent?: string;
  displayContent?: string;
  isImage?: boolean;
  isPdf?: boolean;
  isExcel?: boolean;
  rowCount?: number;
}

export interface AiToolCall {
  toolName: string;
  args?: Record<string, any>;
}

export interface AiMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: AiToolCall[];
  attachments?: Attachment[];
  timestamp: string;
  isStreaming?: boolean;
  isError?: boolean;
}

export interface ToolDeclaration {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface InvoiceControlCustomer {
  customerId: string;
  customerName: string;
  signName?: string;
  salesRep?: string;
  salesRepName?: string;
  balance: number;
  formattedBalance: string;
  averageVadeDays?: number;
  invoiceTotal: number;
  formattedInvoiceTotal: string;
  collectionTotal: number;
  formattedCollectionTotal: string;
  prevCollectionTotal: number;
  formattedPrevCollectionTotal: string;
  isUnpaidOnDate: boolean;
}

export interface InvoiceControlReport {
  targetDate: string;
  salesRepFilter: string;
  isUnpaidFilterActive: boolean;
  totalMatchingCustomers: number;
  unpaidCustomerCount: number;
  totalInvoiceAmount: number;
  formattedTotalInvoiceAmount: string;
  totalCollectionAmount: number;
  formattedTotalCollectionAmount: string;
  totalPrevCollectionAmount: number;
  formattedTotalPrevCollectionAmount: string;
  customerList: InvoiceControlCustomer[];
  customers?: InvoiceControlCustomer[];
}
