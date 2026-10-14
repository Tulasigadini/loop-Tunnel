import React, { useState, useEffect } from 'react';
import { 
  Wifi, 
  Radio, 
  Check, 
  X, 
  CheckCircle2,
  Zap,
  ShieldCheck
} from 'lucide-react';
import { FileShareAPI } from '../../services/api';

export default function NetworkPermissionModal({ 
  isOpen, 
  onClose, 
  onAllowAndScan, 
  currentIp 
}) {
  const [selectedMode, setSelectedMode] = useState('hotspot'); // 'hotspot' or 'wifi'
  const [isEnabling, setIsEnabling] = useState(false);
  const [dontAskAgain, setDontAskAgain] = useState(false);

  if (!isOpen) return null;

  const handleAllow = async () => {
    setIsEnabling(true);
    try {
      if (selectedMode === 'hotspot') {
        await FileShareAPI.enableHotspot();
      } else {
        await FileShareAPI.enableWifi();
      }

      if (dontAskAgain) {
        localStorage.setItem('fileshare_network_prompt_pref', 'allowed');
      }

      setTimeout(() => {
        setIsEnabling(false);
        if (onAllowAndScan) onAllowAndScan(selectedMode);
        else onClose();
      }, 500);
    } catch (err) {
      console.error('Error enabling network:', err);
      setIsEnabling(false);
      onClose();
    }
  };

  const handleDecline = () => {
    if (dontAskAgain) {
      localStorage.setItem('fileshare_network_prompt_pref', 'declined');
    }
    onClose();
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(15, 23, 42, 0.65)',
      backdropFilter: 'blur(6px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '20px'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '460px',
        background: '#FFFFFF',
        borderRadius: '20px',
        boxShadow: '0 20px 40px -10px rgba(15, 23, 42, 0.3)',
        border: '1.5px solid #CCFBF1',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Top Header */}
        <div style={{
          background: 'linear-gradient(135deg, #0D9488 0%, #0F766E 100%)',
          padding: '18px 22px',
          color: '#FFFFFF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: 'rgba(255, 255, 255, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Radio size={20} color="#FFFFFF" />
            </div>
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: '800', margin: 0 }}>
                Allow Wi-Fi or Mobile Hotspot?
              </h2>
              <div style={{ fontSize: '11.5px', opacity: 0.9, marginTop: '2px' }}>
                Offline sharing • Zero internet required
              </div>
            </div>
          </div>

          <button
            onClick={handleDecline}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(255,255,255,0.8)',
              cursor: 'pointer',
              padding: '4px'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <p style={{ fontSize: '12.5px', color: '#64748B', margin: 0, lineHeight: '1.5' }}>
            Choose how you'd like to connect with nearby devices:
          </p>

          {/* Option 1: Mobile Hotspot */}
          <div 
            onClick={() => setSelectedMode('hotspot')}
            style={{
              padding: '14px 16px',
              borderRadius: '12px',
              border: selectedMode === 'hotspot' ? '2px solid #0D9488' : '1.5px solid #E2E8F0',
              background: selectedMode === 'hotspot' ? '#F0FDFA' : '#FAFAFA',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              transition: 'all 0.15s ease'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: selectedMode === 'hotspot' ? '#CCFBF1' : '#F1F5F9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: selectedMode === 'hotspot' ? '#0D9488' : '#64748B'
              }}>
                <Radio size={16} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '13px', fontWeight: '800', color: '#0F172A' }}>
                    Mobile Hotspot
                  </span>
                  <span style={{ fontSize: '10px', fontWeight: '800', background: '#DCFCE7', color: '#15803D', padding: '1px 6px', borderRadius: '4px' }}>
                    Recommended
                  </span>
                </div>
                <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
                  Turn PC into offline hotspot. Other devices connect directly.
                </div>
              </div>
            </div>

            <div style={{
              width: '18px',
              height: '18px',
              borderRadius: '50%',
              border: selectedMode === 'hotspot' ? '5px solid #0D9488' : '2px solid #CBD5E1',
              background: '#FFFFFF'
            }} />
          </div>

          {/* Option 2: Wi-Fi Adapter */}
          <div 
            onClick={() => setSelectedMode('wifi')}
            style={{
              padding: '14px 16px',
              borderRadius: '12px',
              border: selectedMode === 'wifi' ? '2px solid #0D9488' : '1.5px solid #E2E8F0',
              background: selectedMode === 'wifi' ? '#F0FDFA' : '#FAFAFA',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              transition: 'all 0.15s ease'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: selectedMode === 'wifi' ? '#CCFBF1' : '#F1F5F9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: selectedMode === 'wifi' ? '#0D9488' : '#64748B'
              }}>
                <Wifi size={16} />
              </div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: '800', color: '#0F172A' }}>
                  Wi-Fi Adapter
                </div>
                <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
                  Connect through the same Wi-Fi router.
                </div>
              </div>
            </div>

            <div style={{
              width: '18px',
              height: '18px',
              borderRadius: '50%',
              border: selectedMode === 'wifi' ? '5px solid #0D9488' : '2px solid #CBD5E1',
              background: '#FFFFFF'
            }} />
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11.5px', color: '#64748B', cursor: 'pointer', marginTop: '4px' }}>
            <input 
              type="checkbox"
              checked={dontAskAgain}
              onChange={(e) => setDontAskAgain(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            <span>Remember choice</span>
          </label>
        </div>

        {/* Action Buttons: Allow or Decline */}
        <div style={{
          padding: '14px 22px',
          background: '#F8FAFC',
          borderTop: '1px solid #E2E8F0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: '10px'
        }}>
          <button
            type="button"
            onClick={handleDecline}
            disabled={isEnabling}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              background: '#FFFFFF',
              border: '1px solid #CBD5E1',
              color: '#64748B',
              fontSize: '12.5px',
              fontWeight: '700',
              cursor: 'pointer'
            }}
          >
            Decline
          </button>

          <button
            type="button"
            onClick={handleAllow}
            disabled={isEnabling}
            style={{
              padding: '8px 20px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #0D9488 0%, #0F766E 100%)',
              border: 'none',
              color: '#FFFFFF',
              fontSize: '12.5px',
              fontWeight: '800',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 8px rgba(13, 148, 136, 0.25)'
            }}
          >
            {isEnabling ? 'Enabling...' : (
              <>
                <Check size={14} strokeWidth={2.5} />
                <span>Allow & Turn On</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
