// src/components/layout/MainLayout.tsx — Full Mobile Responsiveness & In-Frame Mobile Navigation
import React, { useState, useEffect, ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import UploadModal from '../upload/UploadModal';
import CustomerStatementModal from '../modals/CustomerStatementModal';
import { subscribeOpenCustomerModal } from '../../services/customerService';
import './MainLayout.css';

interface MainLayoutProps {
  children?: ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  const [uploadOpen, setUploadOpen]               = useState(false);
  const [isMobilePreview, setIsMobilePreview]     = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [statementCustomer, setStatementCustomer] = useState<any>(null);
  const location = useLocation();

  useEffect(() => {
    return subscribeOpenCustomerModal((customerObj) => {
      if (customerObj) {
        setStatementCustomer(customerObj);
      }
    });
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      document.documentElement.style.setProperty('--mouse-x', `${e.clientX}px`);
      document.documentElement.style.setProperty('--mouse-y', `${e.clientY}px`);
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  return (
    <div className={`layout ${isMobilePreview ? 'layout--mobile-preview' : ''}`}>
      <div className="bg-orbs">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
        <div className="orb orb-4" />
      </div>
      <Sidebar
        isOpen={mobileSidebarOpen}
        onClose={() => setMobileSidebarOpen(false)}
      />

      {mobileSidebarOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      <main className="layout__content">
        <div className="layout__page">
          <TopBar
            onUploadClick={() => setUploadOpen(true)}
            pathname={location.pathname}
            isMobilePreview={isMobilePreview}
            onToggleMobilePreview={() => setIsMobilePreview(prev => !prev)}
            onToggleMobileSidebar={() => setMobileSidebarOpen(prev => !prev)}
          />

          {isMobilePreview && (
            <div className="mobile-frame-header">
              <div className="mobile-notch-header">
                <span className="mobile-time">09:41</span>
                <span className="mobile-notch-camera" />
                <div className="mobile-status-icons">
                  <span>📶</span>
                  <span>⚡ 98%</span>
                </div>
              </div>
              <div className="mobile-frame-nav">
                <button 
                  className="mobile-frame-burger"
                  onClick={() => setMobileSidebarOpen(prev => !prev)}
                  title="Menüyü Aç"
                >
                  ☰ Menü
                </button>
                <span className="mobile-frame-title">AKGÜN DAĞITIM</span>
                <button 
                  className="mobile-frame-upload"
                  onClick={() => setUploadOpen(true)}
                  title="Dosya Yükle"
                >
                  ☁️ Yükle
                </button>
              </div>
            </div>
          )}
          {children}
          {isMobilePreview && (
            <div className="mobile-frame-footer">
              <div className="mobile-bottom-nav">
                <button className="mobile-nav-item active" onClick={() => window.scrollTo({top: 0, behavior: 'smooth'})}>
                  <span className="nav-ic">📊</span>
                  <span className="nav-lbl">Özet</span>
                </button>
                <button className="mobile-nav-item" onClick={() => setMobileSidebarOpen(true)}>
                  <span className="nav-ic">👥</span>
                  <span className="nav-lbl">Cariler</span>
                </button>
                <button className="mobile-nav-item" onClick={() => setUploadOpen(true)}>
                  <span className="nav-ic">☁️</span>
                  <span className="nav-lbl">Yükle</span>
                </button>
                <button className="mobile-nav-item" onClick={() => setMobileSidebarOpen(true)}>
                  <span className="nav-ic">☰</span>
                  <span className="nav-lbl">Menü</span>
                </button>
              </div>
              <div className="mobile-home-indicator" />
            </div>
          )}
        </div>
      </main>

      {/* Upload Modal */}
      <UploadModal
        isOpen={uploadOpen}
        onClose={() => setUploadOpen(false)}
      />

      {/* Global Customer Statement Modal */}
      {statementCustomer && (
        <CustomerStatementModal
          customer={statementCustomer}
          onClose={() => setStatementCustomer(null)}
        />
      )}
    </div>
  );
}
