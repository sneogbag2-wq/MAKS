// src/config/fileTypes.ts
// Her dosya tipi için merkezi konfigürasyon.
// Panel ve WhatsApp bot bu config'i kullanarak dosya tiplerini tanır.

export interface FileTypeConfig {
  key: string;
  label: string;
  description: string;
  color: string;
  colorAlpha: string;
  icon: string;
  collection: string | string[];
  mode: 'upsert' | 'append';
  requiredColumns: string[];
  parserKey: string;
  uploadFirst?: boolean;
  uploadFirstWarning?: string;
}

export const FILE_TYPES: Record<string, FileTypeConfig> = {
  MUSTERI_MASTER: {
    key: 'MUSTERI_MASTER',
    label: 'Müşteri Master',
    description: 'Cari açılış ve güncelleme kaynağı',
    color: '#3b82f6',
    colorAlpha: 'rgba(59,130,246,0.12)',
    icon: '👤',
    collection: 'customers',
    mode: 'upsert',
    requiredColumns: ['Müşteri', 'Müşteri Adı', 'Tabela Adı'],
    parserKey: 'customerMaster',
    uploadFirst: true,
    uploadFirstWarning: 'Müşteri Master dosyası diğer dosyalardan önce yüklenmeli.',
  },
  SATIS: {
    key: 'SATIS',
    label: 'Satış Faturaları',
    description: 'Satış listesi (sales_invoices)',
    color: '#10b981',
    colorAlpha: 'rgba(16,185,129,0.12)',
    icon: '🧾',
    collection: 'sales_invoices',
    mode: 'append',
    requiredColumns: ['Fatura No', 'Fatura Tarihi', 'Cari Kodu 2', 'Satış Tutarı', 'EDOCUMENTNO'],
    parserKey: 'sales',
  },
  SATIN_ALMA: {
    key: 'SATIN_ALMA',
    label: 'Satın Alma',
    description: 'purchase_invoices + customer_credit_notes',
    color: '#f59e0b',
    colorAlpha: 'rgba(245,158,11,0.12)',
    icon: '🛒',
    collection: ['purchase_invoices', 'customer_credit_notes'],
    mode: 'append',
    requiredColumns: ['Fatura No', 'Fatura Tarihi', 'Cari Kodu2', 'Tutar', 'Tip'],
    parserKey: 'purchase',
  },
  NAKIT_TAHSILAT: {
    key: 'NAKIT_TAHSILAT',
    label: 'Nakit Tahsilat',
    description: 'Nakit + Kredi Kartı tahsilatları',
    color: '#8b5cf6',
    colorAlpha: 'rgba(139,92,246,0.12)',
    icon: '💵',
    collection: 'collections',
    mode: 'append',
    requiredColumns: ['Belge Numarası', 'Fatura Tarihi', 'Cari Kodu 2', 'Tutar', 'Kayıt Tipi'],
    parserKey: 'collection',
  },
  HAVALE_TAHSILAT: {
    key: 'HAVALE_TAHSILAT',
    label: 'Havale Tahsilat',
    description: 'Banka/havale tahsilatları',
    color: '#14b8a6',
    colorAlpha: 'rgba(20,184,166,0.12)',
    icon: '🏦',
    collection: 'collections',
    mode: 'append',
    requiredColumns: ['Belge Numarası', 'Fatura Tarihi', 'Cari Kodu 2', 'Tutar', 'Kayıt Tipi'],
    parserKey: 'collection',
  },
  CEK: {
    key: 'CEK',
    label: 'Çek Listesi',
    description: 'Alınan müşteri çekleri',
    color: '#ec4899',
    colorAlpha: 'rgba(236,72,153,0.12)',
    icon: '🎟️',
    collection: 'cheques',
    mode: 'append',
    requiredColumns: ['Belge Numarası', 'Fatura Tarihi', 'Cari Kodu 2', 'Tutar', 'Vade Tarihi'],
    parserKey: 'chequeSenet',
  },
  SENET: {
    key: 'SENET',
    label: 'Senet Listesi',
    description: 'Alınan müşteri senetleri',
    color: '#6366f1',
    colorAlpha: 'rgba(99,102,241,0.12)',
    icon: '📄',
    collection: 'cheques',
    mode: 'append',
    requiredColumns: ['Belge Numarası', 'Fatura Tarihi', 'Cari Kodu 2', 'Tutar', 'Vade Tarihi'],
    parserKey: 'chequeSenet',
  },
};

export const FILE_TYPE_ORDER: string[] = [
  'MUSTERI_MASTER',
  'SATIS',
  'SATIN_ALMA',
  'NAKIT_TAHSILAT',
  'HAVALE_TAHSILAT',
  'CEK',
  'SENET',
];

export const getFileType = (key: string): FileTypeConfig | undefined => FILE_TYPES[key];
export const getAllFileTypes = (): FileTypeConfig[] => FILE_TYPE_ORDER.map((k) => FILE_TYPES[k]);
