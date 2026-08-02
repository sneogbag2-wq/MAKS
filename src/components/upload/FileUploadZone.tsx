// src/components/upload/FileUploadZone.tsx
import React, { useState, useRef, useCallback } from 'react';
import './FileUploadZone.css';
import { FileTypeConfig } from '../../config/fileTypes';

const STATUS_LABELS: Record<string, { icon: string; text: string; cls: string }> = {
  idle:       { icon: '⊕', text: 'Boş',       cls: 'idle'       },
  selected:   { icon: '📄', text: 'Seçildi',   cls: 'selected'   },
  processing: { icon: '⟳', text: 'İşleniyor', cls: 'processing' },
  success:    { icon: '✓',  text: 'Yüklendi',  cls: 'success'    },
  error:      { icon: '✕',  text: 'Hata',      cls: 'error'      },
};

export interface FileZoneState {
  file?: File | null;
  status?: 'idle' | 'selected' | 'processing' | 'success' | 'error';
  error?: string | null;
  warnings?: string[];
  stats?: Record<string, any> | null;
}

interface FileUploadZoneProps {
  fileType: FileTypeConfig;
  state?: FileZoneState;
  onChange: (key: string, file: File | null, errorMsg?: string) => void;
}

export default function FileUploadZone({ fileType, state, onChange }: FileUploadZoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { file, status = 'idle', error, warnings = [], stats } = state || {};

  const handleFile = useCallback(
    (f: File) => {
      if (!f) return;
      if (!f.name.match(/\.(xlsx|xls)$/i)) {
        onChange(fileType.key, null, 'Sadece .xlsx veya .xls dosyaları kabul edilir.');
        return;
      }
      onChange(fileType.key, f);
    },
    [fileType.key, onChange]
  );

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (status === 'processing') return;
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (status === 'processing') return;
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };

  const handleZoneClick = () => {
    if (status === 'processing') return;
    if (inputRef.current) {
      inputRef.current.click();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    e.target.value = '';
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(fileType.key, null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const statusInfo = STATUS_LABELS[status] || STATUS_LABELS.idle;

  const zoneClass = [
    'upload-zone',
    dragOver ? 'upload-zone--dragover' : '',
    file && status === 'idle' ? 'upload-zone--has-file' : '',
    status === 'processing' ? 'upload-zone--processing' : '',
    status === 'success' ? 'upload-zone--success' : '',
    status === 'error' ? 'upload-zone--error' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={zoneClass}
      style={{
        '--zone-color':       fileType.color,
        '--zone-color-alpha': fileType.colorAlpha,
      } as React.CSSProperties}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleZoneClick}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        style={{ display: 'none' }}
        onChange={handleInputChange}
      />

      <div className="upload-zone__content">
        <div className="upload-zone__icon-wrap">
          <span>{fileType.icon}</span>
        </div>

        <div className="upload-zone__info">
          <div className="upload-zone__label"><span>{fileType.label}</span></div>
          {file ? (
            <span key="file-info" className="upload-zone__filename">
              📎 {file.name} ({(file.size / 1024).toFixed(1)} KB)
            </span>
          ) : (
            <p key="desc-info" className="upload-zone__desc">
              <span>{fileType.description} — tıkla veya sürükle</span>
            </p>
          )}
        </div>

        <div className={`upload-zone__badge upload-zone__badge--${statusInfo.cls}`}>
          <span>{statusInfo.icon}</span>
          <span>{statusInfo.text}</span>
        </div>

        {file && status !== 'processing' ? (
          <button
            key="remove-btn"
            type="button"
            className="upload-zone__remove"
            onClick={handleRemove}
            title="Kaldır"
          >
            ✕
          </button>
        ) : null}
      </div>

      {error ? (
        <div key="err" className="upload-zone__error-msg">
          <span>⚠ {error}</span>
        </div>
      ) : null}

      {warnings.length > 0 ? (
        <div key="warn" className="upload-zone__warnings">
          {warnings.map((w, i) => (
            <div key={i}><span>⚡ {w}</span></div>
          ))}
        </div>
      ) : null}

      {status === 'success' && stats ? (
        <div key="stats" className="upload-zone__stats">
          {stats.total !== undefined ? <div><span>Toplam satır: </span><strong>{stats.total}</strong></div> : null}
          {stats.cancelledRemoved > 0 ? <div><span>CANCELLED çift çıkarıldı: </span><strong>{stats.cancelledRemoved}</strong></div> : null}
          {stats.efesRemoved > 0 ? <div><span>EFES satırı çıkarıldı: </span><strong>{stats.efesRemoved}</strong></div> : null}
          {stats.written !== undefined ? <div><span>İşlenen kayıt: </span><strong>{stats.written}</strong></div> : null}
          {stats.purchaseWritten !== undefined ? <div><span>Satın alma: </span><strong>{stats.purchaseWritten}</strong></div> : null}
          {stats.creditNotesWritten !== undefined ? <div><span>Alacak dekontu: </span><strong>{stats.creditNotesWritten}</strong></div> : null}
        </div>
      ) : null}
    </div>
  );
}
