// src/parsers/columnMappings.ts
// Karar #10: Dosya bazında sütun adı eşleme config.
// Dinamik fuzzy matching YAPILMAZ — sabit config.

export const COLUMN_MAPS: Record<string, Record<string, string>> = {
  MUSTERI_MASTER: {
    customerId:       'Müşteri',
    salesManagerName: 'Dist Satış Şefi Adı',
    salesRepName:     'Satış Temsilcisi Adı',
    salesChannel:     'Satış Kanalı Tanımı',
    volumeSegment:    'Müşteri Hacim Segmenti',
    signName:         'Tabela Adı',
    customerName:     'Müşteri Adı',
    province:         'İl',
    district:         'İlçe',
    shippingAddress:  'Sevk Adresi',
    phone:            'Telefon',
    customerStatus:   'Müşteri Durumu',
    workPeriod:       'Çalışma Dönemi',
    creditLimit:      'Kredi Limiti',
  },
  SATIS: {
    customerId:    'Cari Kodu 2',
    invoiceId:     'Fatura No',
    invoiceDate:   'Fatura Tarihi',
    amount:        'Satış Tutarı',
    eDocumentNo:   'EDOCUMENTNO',
    type:          'Tip',
    status:        'Fatura Durum',
    _customerName: 'Cari Adı',
  },
  SATIN_ALMA: {
    customerId:    'Cari Kodu2',
    invoiceId:     'Fatura No',
    invoiceDate:   'Fatura Tarihi',
    amount:        'Tutar',
    type:          'Tip',
    eDocumentNo:   'EDOCUMENTNO',
    status:        'Fatura Durum',
    invoiceType:   'Fatura Tipi',
    salesRepId:    'Satış Per. No',
  },
  NAKIT_TAHSILAT: {
    customerId:    'Cari Kodu 2',
    collectionId:  'Belge Numarası',
    date:          'Fatura Tarihi',
    amount:        'Tutar',
    kasaKodu:      'Kasa Kodu',
    bankKodu:      'Banka Kodu',
    status:        'Kayıt Tipi',
  },
  HAVALE_TAHSILAT: {
    customerId:    'Cari Kodu 2',
    collectionId:  'Belge Numarası',
    date:          'Fatura Tarihi',
    amount:        'Tutar',
    kasaKodu:      'Kasa Kodu',
    bankKodu:      'Banka Kodu',
    status:        'Kayıt Tipi',
  },
  CEK: {
    customerId:   'Cari Kodu 2',
    docNo:        'Belge Numarası',
    subNo:        'Çek No',
    date:         'Fatura Tarihi',
    dueDate:      'Vade Tarihi',
    amount:       'Tutar',
    bankName:     'Banka Adı',
    accountNo:    'Çek Hesap No',
    status:       'Kayıt Tipi',
    _customerName: 'Cari Adı',
  },
  SENET: {
    customerId:   'Cari Kodu 2',
    docNo:        'Belge Numarası',
    subNo:        'Senet No',
    date:         'Fatura Tarihi',
    dueDate:      'Vade Tarihi',
    amount:       'Tutar',
    description:  'Açıklama',
    status:       'Kayıt Tipi',
    _customerName: 'Cari Adı',
  },
};

/**
 * Ham satırdan belirli bir alanı okur (sütun adı eşleme ile)
 * @param row - Excel satırı
 * @param fileTypeKey - FILE_TYPES key
 * @param fieldKey - COLUMN_MAPS field key
 * @returns
 */
export function getField(row: Record<string, any>, fileTypeKey: string, fieldKey: string): any {
  const col = COLUMN_MAPS[fileTypeKey]?.[fieldKey];
  if (!col) return undefined;
  return row[col];
}
