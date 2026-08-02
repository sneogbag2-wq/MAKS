export interface Customer {
  customerId: string;
  customerName: string;
  signName?: string;
  salesRep?: string;
  salesRepName?: string;
  province?: string;
  district?: string;
  address?: string;
  phone?: string;
  taxNo?: string;
  taxOffice?: string;
  status?: string;
  creditLimit?: number;
  divisions?: Record<string, any>;
  balance?: number;
  cekSenet?: number;
  toplamRisk?: number;
  averageVade?: number;
}

export interface CustomerMaster {
  customerId: string;
  customerName: string;
  signName?: string;
  salesRepName?: string;
  province?: string;
  district?: string;
  phone?: string;
  address?: string;
  taxNo?: string;
  taxOffice?: string;
  creditLimit?: number;
  divisions?: Record<string, any>;
}

export interface AgingBucket {
  range: string;
  amount: number;
  count: number;
}

export interface CustomerAgingResult {
  buckets: Record<string, number>;
  totalOverdue: number;
  totalReceivable: number;
  averageVade: number;
}
