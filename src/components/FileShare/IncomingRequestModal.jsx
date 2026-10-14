import React, { useState, useEffect } from 'react';
import { 
  Download, 
  X, 
  Check, 
  FileText, 
  Film, 
  Image as ImageIcon, 
  Archive, 
  FileCode, 
  File, 
  Folder, 
  HardDrive, 
  Laptop, 
  Smartphone, 
  Clock, 
  FolderOpen 
} from 'lucide-react';

export default function IncomingRequestModal({
  request,
  onAccept,
  onDecline,
  onPickFolder
}) {
  const [saveDir, setSaveDir] = useState(request?.saveDir || '');
  const [secondsRemaining, setSecondsRemaining] = useState(60);

  useEffect(() => {
    if (request?.saveDir) setSaveDir(request.saveDir);
  }, [request?.saveDir]);

  // Audio Chime notification using Web Audio API (smooth, offline, zero assets needed)
  useEffect(() => {
    if (!request) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.12); // A5
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.5);
      }
    } catch (e) {}
  }, [request?.transferId]);

  // Auto decline countdown timer - ONLY active when a real request is presented!
  useEffect(() => {
    if (!request || !request.transferId) return;

    setSecondsRemaining(60); // Reset timer to full 60 seconds whenever request arrives

    const timer = setInterval(() => {
      setSecondsRemaining(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          if (onDecline) onDecline(request.transferId);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [request?.transferId]);

  if (!request) return null;

  const { files = [], totalSize = 0, totalFiles = 0, transferId } = request;
  const senderDisplayName = request.senderName || request.sender?.name || 'Nearby Device';
  const senderDisplayIp = request.senderIp || request.sender?.ip || '';

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (fileName) => {
    const ext = (fileName || '').split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(ext)) return ImageIcon;
    if (['mp4', 'mkv', 'mov', 'avi', 'webm'].includes(ext)) return Film;
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return Archive;
    if (['js', 'jsx', 'ts', 'tsx', 'py', 'html', 'css', 'json', 'cpp', 'java'].includes(ext)) return FileCode;
    if (['pdf', 'doc', 'docx', 'txt', 'md'].includes(ext)) return FileText;
    return File;
  };

  const handleBrowseFolder = async () => {
    if (onPickFolder) {
      const chosen = await onPickFolder();
      if (chosen) setSaveDir(chosen);
    }
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
      <div 
        className="modal-animate-in"
        style={{
          width: '100%',
          maxWidth: '520px',
          background: '#FFFFFF',
          borderRadius: '24px',
          boxShadow: '0 20px 40px -10px rgba(15, 23, 42, 0.3)',
          border: '1.5px solid #CCFBF1',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Top Header */}
        <div style={{
          background: 'linear-gradient(135deg, #0D9488 0%, #0F766E 100%)',
          padding: '20px 24px',
          color: '#FFFFFF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: 'rgba(255, 255, 255, 0.18)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backdropFilter: 'blur(4px)'
            }}>
              <Download size={22} color="#FFFFFF" />
            </div>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: '800', margin: 0, letterSpacing: '-0.3px' }}>
                Incoming File Transfer
              </h2>
              <div style={{ fontSize: '12px', opacity: 0.9, marginTop: '2px' }}>
                Peer wants to share offline files directly with you
              </div>
            </div>
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            background: 'rgba(255,255,255,0.2)',
            padding: '4px 10px',
            borderRadius: '20px',
            fontSize: '11px',
            fontWeight: '700'
          }}>
            <Clock size={12} />
            <span>{secondsRemaining}s</span>
          </div>
        </div>

        {/* Sender Device Card */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div style={{
            background: '#F8FAFC',
            border: '1px solid var(--border)',
            borderRadius: '16px',
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '44px',
                height: '44px',
                borderRadius: '50%',
                background: '#E0F2FE',
                color: '#0284C7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: '800',
                fontSize: '16px'
              }}>
                <Laptop size={22} />
              </div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: '800', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>{senderDisplayName}</span>
                  <span style={{
                    fontSize: '10px',
                    fontWeight: '800',
                    textTransform: 'uppercase',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: '#DCFCE7',
                    color: '#15803D'
                  }}>
                    Sender
                  </span>
                </div>
                <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px', fontFamily: 'monospace' }}>
                  Direct LAN • {files.length} {files.length === 1 ? 'file' : 'files'}
                </div>
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '14px', fontWeight: '800', color: '#0D9488' }}>
                {formatBytes(totalSize)}
              </div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                {totalFiles} {totalFiles === 1 ? 'file' : 'files'}
              </div>
            </div>
          </div>

          {/* Files List Preview */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Files to Receive ({files.length})
            </div>
            <div style={{
              maxHeight: '150px',
              overflowY: 'auto',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '6px'
            }}>
              {files.map((file, idx) => {
                const IconComponent = getFileIcon(file.name);
                return (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      background: idx % 2 === 0 ? '#F8FAFC' : '#FFFFFF',
                      fontSize: '12.5px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <IconComponent size={16} color="#0D9488" style={{ flexShrink: 0 }} />
                      <span style={{ fontWeight: '600', color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {file.name}
                      </span>
                    </div>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600', flexShrink: 0, marginLeft: '10px' }}>
                      {formatBytes(file.size)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Destination Folder Selector */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            background: '#F0FDFA',
            border: '1px solid #99F6E4',
            borderRadius: '12px',
            padding: '10px 14px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '11.5px', fontWeight: '700', color: '#0F766E' }}>
                Save Location:
              </span>
              <button
                onClick={handleBrowseFolder}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: '#FFFFFF',
                  border: '1px solid #99F6E4',
                  borderRadius: '6px',
                  padding: '3px 8px',
                  fontSize: '11px',
                  fontWeight: '700',
                  color: '#0D9488'
                }}
              >
                <FolderOpen size={12} />
                <span>Change Folder</span>
              </button>
            </div>
            <div style={{ fontSize: '11.5px', color: 'var(--text-main)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              📁 {saveDir || 'Default: Downloads/SharePort_Received'}
            </div>
          </div>

          {/* Action Buttons: Accept & Decline */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 2fr',
            gap: '12px',
            marginTop: '6px'
          }}>
            <button
              onClick={() => onDecline(transferId)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '12px 18px',
                borderRadius: '12px',
                background: '#FFF1F2',
                border: '1px solid #FECDD3',
                color: '#E11D48',
                fontWeight: '700',
                fontSize: '13.5px',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <X size={16} />
              <span>Decline</span>
            </button>

            <button
              onClick={() => onAccept(transferId, saveDir)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '12px 20px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #0D9488 0%, #0F766E 100%)',
                color: '#FFFFFF',
                fontWeight: '800',
                fontSize: '14px',
                boxShadow: '0 4px 14px rgba(13, 148, 136, 0.35)',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <Check size={18} strokeWidth={2.5} />
              <span>Accept & Receive</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
