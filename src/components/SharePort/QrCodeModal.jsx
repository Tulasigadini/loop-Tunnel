import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { X, Copy, Check, ExternalLink, QrCode as QrIcon } from 'lucide-react';
import { SystemAPI } from '../../services/api';

export default function QrCodeModal({ url, onClose }) {
  const canvasRef = useRef(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (canvasRef.current && url) {
      QRCode.toCanvas(canvasRef.current, url, {
        width: 240,
        margin: 2,
        color: {
          dark: '#311B58',
          light: '#FFFFFF'
        }
      });
    }
  }, [url]);

  const handleCopy = async () => {
    await SystemAPI.copyText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(49, 27, 88, 0.45)',
      backdropFilter: 'blur(6px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100
    }}>
      <div style={{
        background: '#FFFFFF',
        border: '1px solid var(--border)',
        borderRadius: '20px',
        padding: '32px',
        maxWidth: '420px',
        width: '90%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        position: 'relative',
        boxShadow: 'var(--shadow-lg)'
      }}>
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            background: 'transparent',
            color: 'var(--text-dim)'
          }}
        >
          <X size={20} />
        </button>

        <div style={{
          width: '44px',
          height: '44px',
          borderRadius: '12px',
          background: '#F5EEFD',
          border: '1px solid #DDD0F5',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#7C3AED',
          marginBottom: '16px'
        }}>
          <QrIcon size={24} />
        </div>

        <h3 style={{ fontSize: '20px', fontWeight: '800', marginBottom: '6px', color: 'var(--text-main)' }}>
          Mobile QR Preview
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', marginBottom: '20px' }}>
          Scan with your phone or tablet camera to open the live site immediately without typing the URL.
        </p>

        {/* QR Code Canvas */}
        <div style={{
          padding: '12px',
          background: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-sm)',
          marginBottom: '20px'
        }}>
          <canvas ref={canvasRef} style={{ display: 'block' }} />
        </div>

        {/* URL Pill */}
        <div style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          background: '#FAF8FD',
          border: '1px solid var(--border)',
          borderRadius: '10px',
          padding: '8px 12px',
          gap: '8px',
          marginBottom: '16px'
        }}>
          <span className="font-mono" style={{
            flex: 1,
            fontSize: '12px',
            color: '#6D28D9',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            {url}
          </span>
          <button
            onClick={handleCopy}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              background: '#F5EEFD',
              border: '1px solid #DDD0F5',
              borderRadius: '6px',
              padding: '4px 10px',
              fontSize: '11px',
              fontWeight: '700',
              color: '#6D28D9'
            }}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>

        <button
          onClick={() => SystemAPI.openExternal(url)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            background: '#0D9488',
            color: '#FFFFFF',
            borderRadius: '10px',
            padding: '12px',
            fontSize: '13px',
            fontWeight: '700'
          }}
        >
          <ExternalLink size={15} />
          <span>Open in Browser</span>
        </button>
      </div>
    </div>
  );
}
