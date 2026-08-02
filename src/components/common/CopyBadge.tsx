import React, { useState } from 'react';
import './CopyBadge.css';

function fallbackCopy(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = String(text);
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const success = document.execCommand('copy');
      document.body.removeChild(textarea);
      if (success) resolve();
      else reject(new Error('execCommand failed'));
    } catch (e) {
      reject(e);
    }
  });
}

interface CopyBadgeProps {
  textToCopy?: string | number;
  label?: string;
  showLabel?: boolean;
  size?: 'small' | 'medium' | 'large';
  className?: string;
}

export default function CopyBadge({
  textToCopy,
  label = '',
  showLabel = false,
  size = 'small',
  className = ''
}: CopyBadgeProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    if (!textToCopy) return;

    const text = String(textToCopy);

    const onSuccess = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(onSuccess)
        .catch(() => fallbackCopy(text).then(onSuccess).catch(err => console.error('Copy error:', err)));
    } else {
      fallbackCopy(text).then(onSuccess).catch(err => console.error('Copy error:', err));
    }
  };

  return (
    <button 
      type="button"
      className={`copy-badge ${copied ? 'copied' : ''} copy-badge-${size} ${className}`}
      onClick={handleCopy}
      title={copied ? "Kopyalandı!" : "Kopyala"}
    >
      {showLabel && label && <span className="copy-badge-label">{label}</span>}
      {!showLabel && label}
      <span className="copy-badge-icon">{copied ? '✓' : '📋'}</span>
      {copied && <span className="copy-tooltip">Kopyalandı!</span>}
    </button>
  );
}
