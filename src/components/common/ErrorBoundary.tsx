// src/components/common/ErrorBoundary.tsx
import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '40px', background: '#1e2235', color: '#f1f5f9', borderRadius: '16px', margin: '40px', border: '1px solid #ef4444' }}>
          <h2 style={{ color: '#ef4444', marginBottom: '12px' }}>Uygulamada Bir Hata Oluştu ⚠️</h2>
          <p style={{ marginBottom: '16px', color: '#94a3b8' }}>Hata detayı aşağıdadır:</p>
          <pre style={{ background: '#0f1117', padding: '16px', borderRadius: '8px', overflowX: 'auto', color: '#f87171', fontSize: '0.85rem' }}>
            {this.state.error?.toString()}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: '20px', padding: '10px 20px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
          >
            Sayfayı Yenile
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
