// src/components/upload/UploadModal.tsx — v2 Çoklu Dosya + Otomatik Eşleştirme + Arşiv Log
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { getAllFileTypes, FileTypeConfig } from '../../config/fileTypes';
import { processFile } from '../../services/uploadService';
import { detectFileType } from '../../utils/fileTypeDetector';
import { getUploadLog, getArchiveSummary, getStorageUsage } from '../../services/archiveService';
import { resetAndClearArchive } from '../../services/customerService';
import { isAdminAuthenticated, authenticateAdmin, subscribeAdminAuthChange } from '../../services/customRulesService';
import './UploadModal.css';

const ALL_FILE_TYPES = getAllFileTypes();

const emptyZoneStates = (): Record<string, any> =>
  Object.fromEntries(
    ALL_FILE_TYPES.map((ft) => [ft.key, { file: null, status: 'idle', error: null, warnings: [], stats: null }])
  );

const FILE_TYPE_LABELS: Record<string, string> = {
  MUSTERI_MASTER:  'Müşteri Master',
  SATIS:           'Satış Faturaları',
  SATIN_ALMA:      'Satın Alma',
  NAKIT_TAHSILAT:  'Nakit Tahsilat',
  HAVALE_TAHSILAT: 'Havale Tahsilat',
  CEK:             'Çek Riski',
  SENET:           'Senet Riski',
};

const TABS = [
  { id: 'upload', label: '☁️ Yükle' },
  { id: 'log',    label: '📋 Arşiv Geçmişi' },
];

const STATUS_META: Record<string, { icon: string | null; cls: string; label: string }> = {
  idle:        { icon: null,   cls: 'idle',        label: 'Boş'        },
  detecting:   { icon: '🔍',   cls: 'detecting',   label: 'Analiz...'  },
  selected:    { icon: '📄',   cls: 'selected',    label: 'Seçildi'    },
  processing:  { icon: '⟳',   cls: 'processing',  label: 'İşleniyor'  },
  success:     { icon: '✓',    cls: 'success',     label: 'Yüklendi'   },
  error:       { icon: '✕',    cls: 'error',       label: 'Hata'       },
};

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function UploadModal({ isOpen, onClose }: UploadModalProps) {
  const [isAdmin, setIsAdmin] = useState(isAdminAuthenticated());
  const [zoneStates, setZoneStates] = useState<Record<string, any>>(emptyZoneStates);

  useEffect(() => {
    return subscribeAdminAuthChange(() => setIsAdmin(isAdminAuthenticated()));
  }, []);

  const [isUploading, setIsUploading] = useState(false);
  const [globalDrag, setGlobalDrag] = useState(false);
  const [activeTab, setActiveTab] = useState('upload');
  const [uploadLog, setUploadLog] = useState<any[]>([]);
  const [archiveSummary, setArchiveSummary] = useState<any>(null);
  const [storageBytes, setStorageBytes] = useState(0);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [pendingUnmatched, setPendingUnmatched] = useState<File[]>([]);
  const [showAdminAuthModal, setShowAdminAuthModal] = useState(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [adminAuthError, setAdminAuthError] = useState('');
  const [pendingAdminAction, setPendingAdminAction] = useState<string | null>(null);
  const globalInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !isUploading) onClose(); };
    if (isOpen) window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [isOpen, isUploading, onClose]);

  const refreshArchiveData = useCallback(async () => {
    setUploadLog(await getUploadLog());
    setArchiveSummary(await getArchiveSummary());
    setStorageBytes(await getStorageUsage());
  }, []);

  useEffect(() => {
    if (isOpen) {
      setZoneStates(emptyZoneStates());
      setPendingUnmatched([]);
      setIsUploading(false);
      setActiveTab('upload');
      setClearConfirm(false);
      refreshArchiveData();
    }
  }, [isOpen, refreshArchiveData]);

  const assignFiles = useCallback(async (files: File[]) => {
    const unmatched: File[] = [];

    for (const file of files) {
      if (!file.name.match(/\.(xlsx|xls)$/i)) continue;

      const { key } = await detectFileType(file);

      if (key) {
        setZoneStates((prev) => ({
          ...prev,
          [key]: { file, status: 'selected', error: null, warnings: [], stats: null },
        }));
      } else {
        unmatched.push(file);
      }
    }

    if (unmatched.length) setPendingUnmatched((prev) => [...prev, ...unmatched]);
  }, []);

  const handleGlobalDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current += 1;
    setGlobalDrag(true);
  };

  const handleGlobalDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) { dragCounter.current = 0; setGlobalDrag(false); }
  };

  const handleGlobalDragOver = (e: React.DragEvent) => e.preventDefault();

  const handleGlobalDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setGlobalDrag(false);
    const files = Array.from(e.dataTransfer.files);
    await assignFiles(files);
  };

  const handleGlobalInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    e.target.value = '';
    await assignFiles(files);
  };

  const handleZoneFileChange = useCallback((key: string, file: File | null) => {
    if (!file) {
      setZoneStates((prev) => ({
        ...prev,
        [key]: { file: null, status: 'idle', error: null, warnings: [], stats: null },
      }));
      return;
    }
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      setZoneStates((prev) => ({
        ...prev,
        [key]: { ...prev[key], error: 'Sadece .xlsx veya .xls kabul edilir.' },
      }));
      return;
    }
    setZoneStates((prev) => ({
      ...prev,
      [key]: { file, status: 'selected', error: null, warnings: [], stats: null },
    }));
  }, []);

  const assignUnmatched = useCallback((file: File, key: string) => {
    setPendingUnmatched((prev) => prev.filter((f) => f !== file));
    handleZoneFileChange(key, file);
  }, [handleZoneFileChange]);

  const selectedCount = ALL_FILE_TYPES.filter((ft) => zoneStates[ft.key]?.file).length;

  const handleAdminSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (authenticateAdmin(adminPasswordInput)) {
      setShowAdminAuthModal(false);
      setAdminPasswordInput('');
      setAdminAuthError('');
      const action = pendingAdminAction;
      setPendingAdminAction(null);
      if (action === 'upload') {
        setTimeout(() => handleUpload(), 100);
      } else if (action === 'clear') {
        setTimeout(() => handleClearArchive(), 100);
      }
    } else {
      setAdminAuthError('Hatalı Yetki Şifresi!');
    }
  };

  const handleUpload = async () => {
    if (selectedCount === 0 || isUploading) return;
    if (!isAdminAuthenticated()) {
      setPendingAdminAction('upload');
      setShowAdminAuthModal(true);
      return;
    }
    setIsUploading(true);

    const orderedKeys = ALL_FILE_TYPES.map((ft) => ft.key);

    for (const key of orderedKeys) {
      const zone = zoneStates[key];
      if (!zone?.file) continue;

      setZoneStates((prev) => ({
        ...prev,
        [key]: { ...prev[key], status: 'processing', error: null },
      }));

      try {
        const { success, result, error } = await processFile(zone.file, key, () => {});

        if (success) {
          const stats =
            result?.stats ?? (result?.records ? { written: result.records.length } : {});
          const notifSummary = result?.notificationSummary || null;
          setZoneStates((prev) => ({
            ...prev,
            [key]: { ...prev[key], status: 'success', warnings: result?.warnings || [], stats, notificationSummary: notifSummary },
          }));
        } else {
          setZoneStates((prev) => ({
            ...prev,
            [key]: { ...prev[key], status: 'error', error: error || 'Dosya işlenirken hata oluştu.' },
          }));
        }
      } catch (err: any) {
        setZoneStates((prev) => ({
          ...prev,
          [key]: { ...prev[key], status: 'error', error: err.message || 'Beklenmeyen hata' },
        }));
      }
    }
    setIsUploading(false);
    refreshArchiveData();
  };

  const handleReset = () => {
    setZoneStates(emptyZoneStates());
    setPendingUnmatched([]);
    setIsUploading(false);
  };

  const handleClearArchive = () => {
    if (!isAdminAuthenticated()) {
      setPendingAdminAction('clear');
      setShowAdminAuthModal(true);
      return;
    }
    if (!clearConfirm) {
      setClearConfirm(true);
      return;
    }
    resetAndClearArchive();
    setClearConfirm(false);
    refreshArchiveData();
    handleReset();
  };

  if (!isOpen) return null;

  const doneCount = ALL_FILE_TYPES.filter((ft) => zoneStates[ft.key]?.status === 'success').length;
  const hasError = ALL_FILE_TYPES.some((ft) => zoneStates[ft.key]?.status === 'error');

  return (
    <div
      className="upload-overlay"
      onClick={(e) => { if (e.target === e.currentTarget && !isUploading) onClose(); }}
      onDragEnter={handleGlobalDragEnter}
      onDragLeave={handleGlobalDragLeave}
      onDragOver={handleGlobalDragOver}
      onDrop={handleGlobalDrop}
    >
      <div className={`upload-modal${globalDrag ? ' upload-modal--dragging' : ''}`}>

        <div className="upload-modal__header">
          <div className="upload-modal__title-group">
            <div className="upload-modal__icon"><span>☁️</span></div>
            <div>
              <div className="upload-modal__title"><span>Veri Yönetimi</span></div>
              <div className="upload-modal__subtitle">
                {archiveSummary ? (
                  <span>
                    {archiveSummary.customers} müşteri ·
                    {archiveSummary.satisRecords} fatura ·
                    {archiveSummary.collectionRecords} tahsilat arşivde
                  </span>
                ) : (
                  <span>Tüm dosyaları tek seferde seç veya sürükle — otomatik eşleşir</span>
                )}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {isAdmin && (
              clearConfirm ? (
                <button
                  type="button"
                  className="upload-modal__btn-danger"
                  onClick={handleClearArchive}
                  title="Emin misiniz? Tekrar tıklayın"
                >
                  <span>⚠ Emin misiniz?</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="upload-modal__btn-ghost"
                  onClick={handleClearArchive}
                  title="Tüm arşivi sıfırla"
                  disabled={isUploading}
                >
                  <span>🗑 Arşivi Temizle</span>
                </button>
              )
            )}
            <button
              type="button"
              className="upload-modal__close"
              onClick={() => { setClearConfirm(false); onClose(); }}
              disabled={isUploading}
              title="Kapat"
              id="upload-modal-close"
            >
              <span>✕</span>
            </button>
          </div>
        </div>

        <div className="upload-modal__tabs">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`upload-modal__tab${activeTab === tab.id ? ' upload-modal__tab--active' : ''}`}
              onClick={() => { setActiveTab(tab.id); setClearConfirm(false); }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'upload' && (<>

        <div
          className={`upload-modal__dropzone${globalDrag ? ' upload-modal__dropzone--active' : ''}`}
          onClick={() => !isUploading && globalInputRef.current?.click()}
        >
          <input
            ref={globalInputRef}
            type="file"
            accept=".xlsx,.xls"
            multiple
            style={{ display: 'none' }}
            onChange={handleGlobalInputChange}
          />
          <div className="upload-modal__dropzone-inner">
            <div className="upload-modal__dropzone-icon">
              {globalDrag ? '📂' : '☁️'}
            </div>
            <div className="upload-modal__dropzone-text">
              <strong>{globalDrag ? 'Dosyaları bırak!' : 'Tüm dosyaları buraya sürükle'}</strong>
              <span>veya tıklayarak seç — birden fazla seçebilirsin</span>
            </div>
            <div className="upload-modal__dropzone-hint">
              <span className="upload-modal__dropzone-chip">xlsx</span>
              <span className="upload-modal__dropzone-chip">xls</span>
              <span>otomatik eşleştirilir</span>
            </div>
          </div>
        </div>

        {pendingUnmatched.length > 0 && (
          <div className="upload-modal__unmatched">
            <div className="upload-modal__unmatched-title">
              ⚠ {pendingUnmatched.length} dosya otomatik tanımlanamadı — lütfen türünü seç:
            </div>
            {pendingUnmatched.map((file, i) => (
              <UnmatchedRow
                key={i}
                file={file}
                onAssign={(key) => assignUnmatched(file, key)}
                occupiedKeys={ALL_FILE_TYPES
                  .filter((ft) => zoneStates[ft.key]?.file)
                  .map((ft) => ft.key)}
              />
            ))}
          </div>
        )}

        <div className="upload-modal__zones">
          {ALL_FILE_TYPES.map((ft) => (
            <SlotRow
              key={ft.key}
              fileType={ft}
              state={zoneStates[ft.key]}
              isUploading={isUploading}
              onChange={handleZoneFileChange}
            />
          ))}
        </div>

        </>)}

        {activeTab === 'log' && (
          <ArchiveLogPanel
            log={uploadLog}
            summary={archiveSummary}
            storageBytes={storageBytes}
          />
        )}

        {activeTab === 'upload' && <div className="upload-modal__footer">
          <div className="upload-modal__stats">
            {isUploading ? (
              <span key="uploading-stat">
                <span className="animate-spin">⟳</span> İşleniyor — {doneCount}/{selectedCount} tamamlandı
              </span>
            ) : doneCount > 0 && !hasError ? (
              <span key="done-stat" style={{ color: 'var(--success)' }}>
                ✓ {doneCount} dosya başarıyla yüklendi
              </span>
            ) : selectedCount > 0 ? (
              <span key="sel-stat">
                <strong style={{ color: 'var(--accent-primary)' }}>{selectedCount}</strong> dosya hazır
              </span>
            ) : (
              <span key="empty-stat" style={{ color: 'var(--text-dim)' }}>Dosya seçilmedi</span>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            {selectedCount > 0 && !isUploading && (
              <button
                key="btn-reset"
                type="button"
                className="upload-modal__btn-secondary"
                onClick={handleReset}
              >
                <span>↺ Temizle</span>
              </button>
            )}
            <button
              key="btn-submit"
              id="upload-modal-submit"
              type="button"
              className="upload-modal__submit"
              onClick={handleUpload}
              disabled={selectedCount === 0 || isUploading}
            >
              {isUploading ? (
                <span key="uploading"><span className="animate-spin">⟳</span> İşleniyor…</span>
              ) : (
                <span key="idle">
                  ☁️ {selectedCount > 0 ? `${selectedCount} Dosyayı Yükle` : 'Dosya Seçin'}
                </span>
              )}
            </button>
          </div>
        </div>}
      </div>
    </div>
  );
}

function SlotRow({ fileType, state, isUploading, onChange }: { fileType: FileTypeConfig; state: any; isUploading: boolean; onChange: (key: string, file: File | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { file, status = 'idle', error, warnings = [], stats } = state || {};
  const sm = STATUS_META[status] || STATUS_META.idle;

  const handleSlotDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isUploading) return;
    const f = e.dataTransfer.files[0];
    if (f) onChange(fileType.key, f);
  };

  const handleSlotClick = () => {
    if (isUploading || status === 'processing') return;
    inputRef.current?.click();
  };

  return (
    <div
      className={`upload-slot upload-slot--${sm.cls}${file ? ' upload-slot--filled' : ''}`}
      style={{ '--slot-color': fileType.color, '--slot-alpha': fileType.colorAlpha } as React.CSSProperties}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onDrop={handleSlotDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onChange(fileType.key, f);
          e.target.value = '';
        }}
      />

      <div className="upload-slot__type-icon">
        <span>{fileType.icon}</span>
      </div>

      <div className="upload-slot__type-label">{fileType.label}</div>

      <div className="upload-slot__file-area">
        {file ? (
          <span className="upload-slot__filename" title={file.name}>
            📎 {file.name}
            <span className="upload-slot__filesize">
              ({(file.size / 1024).toFixed(0)} KB)
            </span>
          </span>
        ) : (
          <span className="upload-slot__placeholder">{fileType.description}</span>
        )}
        {error && <span className="upload-slot__error">⚠ {error}</span>}
        {status === 'success' && stats && <SlotStats stats={stats} notificationSummary={state?.notificationSummary} />}
        {warnings.length > 0 && (
          <span className="upload-slot__warn">⚡ {warnings.length} uyarı</span>
        )}
      </div>

      <div className={`upload-slot__badge upload-slot__badge--${sm.cls}`}>
        {sm.icon && <span>{sm.icon}</span>}
        <span>{sm.label}</span>
      </div>

      {status !== 'processing' && status !== 'success' && (
        <button
          type="button"
          className="upload-slot__pick-btn"
          onClick={handleSlotClick}
          title={file ? 'Değiştir' : 'Dosya seç'}
        >
          {file ? '↩' : '+'}
        </button>
      )}

      {file && status !== 'processing' && (
        <button
          type="button"
          className="upload-slot__remove-btn"
          onClick={(e) => { e.stopPropagation(); onChange(fileType.key, null); }}
          title="Kaldır"
        >
          ✕
        </button>
      )}
    </div>
  );
}

function UnmatchedRow({ file, onAssign, occupiedKeys }: { file: File; onAssign: (key: string) => void; occupiedKeys: string[] }) {
  return (
    <div className="upload-unmatched-row">
      <span className="upload-unmatched-row__name" title={file.name}>
        📎 {file.name}
      </span>
      <select
        className="upload-unmatched-row__select"
        defaultValue=""
        onChange={(e) => { if (e.target.value) onAssign(e.target.value); }}
      >
        <option value="" disabled>Tür seçin…</option>
        {ALL_FILE_TYPES.map((ft) => (
          <option
            key={ft.key}
            value={ft.key}
            disabled={occupiedKeys.includes(ft.key)}
          >
            {ft.icon} {ft.label}{occupiedKeys.includes(ft.key) ? ' (dolu)' : ''}
          </option>
        ))}
      </select>
    </div>
  );
}

function SlotStats({ stats, notificationSummary }: { stats: any; notificationSummary?: any }) {
  const parts: string[] = [];
  if (notificationSummary?.added > 0) parts.push(`+${notificationSummary.added} yeni ekleme`);
  if (notificationSummary?.skippedDuplicate > 0) parts.push(`🛡️ ${notificationSummary.skippedDuplicate} mükerrer (görmezden gelindi)`);
  if (notificationSummary?.cancelledRemoved > 0) parts.push(`✕ ${notificationSummary.cancelledRemoved} iptal (ters işlem)`);
  if (notificationSummary?.matchedCount > 0) parts.push(`✅ ${notificationSummary.matchedCount} Çek/Senet ÖDENDİ`);

  if (parts.length === 0) {
    if (stats?.written !== undefined) parts.push(`${stats.written} kayıt işlendi`);
    if (stats?.total !== undefined) parts.push(`${stats.total} satır`);
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
      {parts.map((p, idx) => (
        <span key={idx} className="upload-slot__stats" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#2563eb', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
          {p}
        </span>
      ))}
    </div>
  );
}

function ArchiveLogPanel({ log, summary, storageBytes }: { log: any[]; summary: any; storageBytes: number }) {
  const formatBytes = (b: number) => {
    if (b < 1024)         return `${b} B`;
    if (b < 1024 * 1024)  return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(2)} MB`;
  };

  const formatDate = (iso: string) => {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('tr-TR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch { return iso; }
  };

  return (
    <div className="archive-log">
      {summary && (
        <div className="archive-log__summary">
          <div className="archive-log__stat-card">
            <span className="archive-log__stat-value">{summary.customers}</span>
            <span className="archive-log__stat-label">Müşteri</span>
          </div>
          <div className="archive-log__stat-card">
            <span className="archive-log__stat-value">{summary.satisRecords}</span>
            <span className="archive-log__stat-label">
              Satış Faturası<br />
              <small>({summary.satisDays} gün)</small>
            </span>
          </div>
          <div className="archive-log__stat-card">
            <span className="archive-log__stat-value">{summary.collectionRecords}</span>
            <span className="archive-log__stat-label">
              Tahsilat<br />
              <small>({summary.collectionDays} gün)</small>
            </span>
          </div>
          <div className="archive-log__stat-card">
            <span className="archive-log__stat-value">{formatBytes(storageBytes)}</span>
            <span className="archive-log__stat-label">Depolama</span>
          </div>
        </div>
      )}

      <div className="archive-log__title">
        <span>📋 Yükleme Geçmişi</span>
        <span className="archive-log__count">{log.length} kayıt</span>
      </div>

      {log.length === 0 ? (
        <div className="archive-log__empty">
          <span>📂</span>
          <span>Henüz yükleme yapılmadı</span>
        </div>
      ) : (
        <div className="archive-log__list">
          {log.map((entry) => (
            <div key={entry.id} className="archive-log__entry">
              <div className="archive-log__entry-top">
                <span className="archive-log__entry-type">
                  {FILE_TYPE_LABELS[entry.fileType] || entry.fileType}
                </span>
                <span className="archive-log__entry-date">{formatDate(entry.uploadedAt)}</span>
              </div>
              <div className="archive-log__entry-file" title={entry.filename}>
                📎 {entry.filename}
                {entry.filesize > 0 && (
                  <span style={{ color: 'var(--text-dim)', marginLeft: '6px' }}>
                    ({(entry.filesize / 1024).toFixed(0)} KB)
                  </span>
                )}
              </div>
              {(entry.mergeResult?.added > 0 || entry.mergeResult?.skippedDuplicate > 0 || entry.mergeResult?.cancelledRemoved > 0) && (
                <div className="archive-log__entry-merge">
                  {entry.mergeResult.added > 0 && (
                    <span className="archive-log__badge archive-log__badge--added">+{entry.mergeResult.added} yeni</span>
                  )}
                  {entry.mergeResult.skippedDuplicate > 0 && (
                    <span className="archive-log__badge archive-log__badge--updated">🛡️ {entry.mergeResult.skippedDuplicate} mükerrer (atlandı)</span>
                  )}
                  {entry.mergeResult.cancelledRemoved > 0 && (
                    <span className="archive-log__badge archive-log__badge--cancelled">✕ {entry.mergeResult.cancelledRemoved} iptal silindi</span>
                  )}
                </div>
              )}
              {entry.stats && (
                <div className="archive-log__entry-stats">
                  {entry.stats.total !== undefined && <span>{entry.stats.total} satır okundu</span>}
                  {entry.stats.written !== undefined && <span>→ {entry.stats.written} kayıt işlendi</span>}
                  {entry.stats.cancelledRemoved > 0 && <span>· {entry.stats.cancelledRemoved} iptal filtresi</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
