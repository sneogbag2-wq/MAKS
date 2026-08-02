import React, { useState, useEffect } from 'react';
import { getActiveCustomerCountSync, subscribeDataChange } from '../../services/customerService';
import './TopBar.css';

interface TopBarProps {
  onUploadClick: () => void;
  pathname: string;
  isMobilePreview: boolean;
  onToggleMobilePreview: () => void;
  onToggleMobileSidebar: () => void;
}

export default function TopBar({
  onUploadClick,
  pathname,
  isMobilePreview,
  onToggleMobilePreview,
  onToggleMobileSidebar
}: TopBarProps) {
  const [activeCount, setActiveCount] = useState(() => getActiveCustomerCountSync());

  useEffect(() => {
    const unsub = subscribeDataChange(() => {
      setActiveCount(getActiveCustomerCountSync());
    });
    return unsub;
  }, []);

  return (
    <div className="visionos-header-banner animate-fadeIn">
      {/* Sol: Logo/Icon + Başlık + Subtitle */}
      <div className="vh-banner-left">
        <button className="vh-burger-btn" onClick={onToggleMobileSidebar} title="Menü">
          ☰
        </button>
        <div className="vh-banner-icon">
          <i className="fa-solid fa-building-columns" style={{ color: '#60A5FA' }} />
        </div>
        <div className="vh-banner-text">
          <div className="vh-banner-title-row">
            <h1 className="vh-banner-title">AKGÜN Finans & Operasyon Paneli</h1>
            <span className="vh-banner-tag">{activeCount || 0} Aktif Cari</span>
          </div>
          <p className="vh-banner-sub">Keşan Efes Pilsen Bayi • Anlık Finansal Durum & Risk Yönetimi</p>
        </div>
      </div>

      {/* Sağ: Aksiyon Butonları (Mobil Test, Bildirimler, Dosya Yükle, Avatar, Arşiv Modu) */}
      <div className="vh-banner-right">
        {/* Mobil Test Tuşu */}
        <button
          className={`vh-btn vh-btn-mobile ${isMobilePreview ? 'vh-btn-mobile--active' : ''}`}
          onClick={onToggleMobilePreview}
          title={isMobilePreview ? 'Masaüstü görünümüne geç' : 'Mobil görünümünü canlı test et'}
        >
          <span className="vh-btn-icon">
            {isMobilePreview ? <i className="fa-solid fa-desktop" /> : <i className="fa-solid fa-mobile-screen-button" />}
          </span>
          <span className="vh-btn-text">{isMobilePreview ? 'Masaüstü' : 'Mobil Test'}</span>
        </button>

        {/* Bildirim */}
        <button className="vh-btn vh-btn-icon-only" title="Bildirimler" id="topbar-notifications">
          <i className="fa-solid fa-bell" />
          <span className="vh-notification-dot" />
        </button>

        {/* Dosya Yükle — Ana VisionOS CTA */}
        <button
          id="topbar-upload-btn"
          className="vh-btn vh-btn-upload-cta"
          onClick={onUploadClick}
          title="Excel dosyası yükle"
        >
          <i className="fa-solid fa-cloud-arrow-up" />
          <span>Dosya Yükle</span>
        </button>

        {/* Kullanıcı avatarı */}
        <div className="vh-avatar" title="Kullanıcı">
          A
        </div>

        {/* Arşiv Modu Rozeti */}
        <div className="vh-badge-compact">
          <span className="vh-badge-dot" /> Arşiv Modu (IndexedDB)
        </div>
      </div>
    </div>
  );
}
