import React, { useState, useEffect } from 'react';
import { 
  Share2, 
  Wifi, 
  WifiOff, 
  Upload, 
  FileText, 
  Film, 
  Image as ImageIcon, 
  Archive, 
  FileCode, 
  File, 
  Trash2, 
  CheckCircle2, 
  Send, 
  FolderOpen, 
  Laptop, 
  Smartphone, 
  User, 
  Copy, 
  Check, 
  Edit3, 
  History, 
  AlertCircle,
  HardDriveDownload,
  ShieldCheck,
  Zap,
  Info,
  Radio,
  Layers,
  Sparkles,
  Lock,
  ArrowRight,
  ArrowLeft,
  X,
  Play,
  Square,
  RefreshCw,
  Download
} from 'lucide-react';
import NearbyRadar from './NearbyRadar';
import IncomingRequestModal from './IncomingRequestModal';
import TransferProgressModal from './TransferProgressModal';
import NetworkPermissionModal from './NetworkPermissionModal';
import { FileShareAPI, SystemAPI } from '../../services/api';

export default function FileShareView() {
  const [localInfo, setLocalInfo] = useState({
    ip: '192.168.11.16',
    deviceName: 'Satya',
    httpPort: 53318,
    udpPort: 53317,
    downloadDir: 'Downloads/SharePort_Received'
  });

  // Primary Mode: null (default selection screen), 'send', or 'receive'
  const [mode, setMode] = useState(null);

  const [isEditingName, setIsEditingName] = useState(false);
  const [deviceNameInput, setDeviceNameInput] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [copiedIp, setCopiedIp] = useState(false);
  const [showNetworkModal, setShowNetworkModal] = useState(false);
  const [networkToast, setNetworkToast] = useState(null);

  // Peers & Connection
  const [peers, setPeers] = useState([]);
  const [selectedPeer, setSelectedPeer] = useState(null); // When in Send mode
  const [connectedPeer, setConnectedPeer] = useState(null); // Active connection on either side

  // Staged files to send
  const [stagedFiles, setStagedFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);

  // Modals & Active Transfer States
  const [incomingRequest, setIncomingRequest] = useState(null);
  const [activeTransfer, setActiveTransfer] = useState(null);

  // Transfer History
  const [transferHistory, setTransferHistory] = useState(() => {
    try {
      const saved = localStorage.getItem('shareport_fileshare_history');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const saveHistory = (item) => {
    setTransferHistory(prev => {
      const updated = [item, ...prev.slice(0, 49)];
      try {
        localStorage.setItem('shareport_fileshare_history', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
  };

  // Initialize service & load local info (Radar stays on standby until mode is selected)
  useEffect(() => {
    async function init() {
      const info = await FileShareAPI.getLocalInfo();
      if (info) {
        setLocalInfo(info);
        setDeviceNameInput(info.deviceName || 'Satya');
      }
    }
    init();

    // Event Subscriptions
    const unsubPeers = FileShareAPI.onPeersUpdated((updatedPeers) => {
      setPeers(updatedPeers || []);
    });

    const unsubConnected = FileShareAPI.onPeerConnected((peer) => {
      setConnectedPeer(peer);
    });

    const unsubDisconnected = FileShareAPI.onPeerDisconnected(() => {
      setConnectedPeer(null);
      setSelectedPeer(null);
    });

    const unsubIncoming = FileShareAPI.onIncomingRequest((req) => {
      setIncomingRequest(req);
    });

    const unsubWaiting = FileShareAPI.onSenderWaitingAcceptance((info) => {
      setActiveTransfer({
        role: 'sender',
        status: 'waiting_acceptance',
        peer: info.peer,
        files: info.files,
        totalSize: info.totalSize,
        totalFiles: info.totalFiles,
        percent: 0,
        speedMbps: '0.0'
      });
    });

    const unsubStarted = FileShareAPI.onTransferStarted((info) => {
      setActiveTransfer(prev => ({
        ...prev,
        ...info,
        status: 'transferring',
        percent: 0,
        speedMbps: '0.0',
        totalBytesTransferred: 0
      }));
    });

    const unsubProgress = FileShareAPI.onTransferProgress((p) => {
      setActiveTransfer(prev => {
        const current = prev || {
          role: p.isReceiver ? 'receiver' : 'sender',
          status: 'transferring',
          transferId: p.transferId,
          peer: { name: p.senderName || 'Sender' },
          totalFiles: p.totalFiles || 1,
          totalSize: p.fileTotalBytes || 0
        };
        const totalSent = p.totalBytesSent || p.totalBytesTransferred || (p.fileBytesSent || 0);
        const overallSize = p.totalBytes || current.totalSize || p.fileTotalBytes || 0;
        const calcPercent = overallSize > 0 ? Math.min(100, Math.round((totalSent * 100) / overallSize)) : (p.percent || 0);
        return {
          ...current,
          status: 'transferring',
          fileName: p.fileName,
          fileIndex: p.fileIndex || 1,
          totalFiles: p.totalFiles || current.totalFiles || 1,
          fileBytes: p.fileBytesSent || 0,
          fileSize: p.fileTotalBytes || p.fileSize || 0,
          totalBytesTransferred: totalSent,
          totalSize: overallSize,
          percent: calcPercent,
          speedMbps: p.speed ? (p.speed / (1024 * 1024)).toFixed(1) : (p.speedMbps || '0.0')
        };
      });
    });

    const unsubCompleted = FileShareAPI.onTransferCompleted((result) => {
      let resolvedDir = result.saveDir;
      if (!resolvedDir && result.savedPath) {
        const lastSlash = Math.max(result.savedPath.lastIndexOf('\\'), result.savedPath.lastIndexOf('/'));
        resolvedDir = lastSlash > 0 ? result.savedPath.substring(0, lastSlash) : result.savedPath;
      }
      if (!resolvedDir) resolvedDir = localInfo.downloadDir;

      setActiveTransfer(prev => ({
        ...prev,
        status: 'completed',
        completedFiles: result.files || [],
        saveDir: resolvedDir,
        savedPath: result.savedPath,
        totalSize: result.totalBytes || result.totalSize,
        totalFiles: result.totalFiles || 1
      }));

      saveHistory({
        id: result.transferId,
        role: result.isReceiver ? 'receiver' : 'sender',
        peerName: result.isReceiver ? 'Sender' : (selectedPeer?.name || 'Receiver'),
        filesCount: result.totalFiles || stagedFiles.length || 1,
        totalSize: result.totalBytes || result.totalSize || totalStagedSize,
        timestamp: Date.now(),
        status: 'completed'
      });
    });

    const unsubDeclined = FileShareAPI.onTransferDeclined((info) => {
      setActiveTransfer(prev => ({
        ...prev,
        status: 'declined',
        reason: info.reason || 'Transfer was declined.'
      }));
    });

    const unsubCancelled = FileShareAPI.onTransferCancelled((info) => {
      setActiveTransfer(prev => ({
        ...prev,
        status: 'cancelled',
        reason: info.reason || 'Transfer was cancelled.'
      }));
    });

    const unsubError = FileShareAPI.onTransferError((info) => {
      setActiveTransfer(prev => ({
        ...prev,
        status: 'error',
        error: info.message || info.error || 'Transfer failed.'
      }));
    });

    return () => {
      if (unsubPeers) unsubPeers();
      if (unsubConnected) unsubConnected();
      if (unsubDisconnected) unsubDisconnected();
      if (unsubIncoming) unsubIncoming();
      if (unsubWaiting) unsubWaiting();
      if (unsubStarted) unsubStarted();
      if (unsubProgress) unsubProgress();
      if (unsubCompleted) unsubCompleted();
      if (unsubDeclined) unsubDeclined();
      if (unsubCancelled) unsubCancelled();
      if (unsubError) unsubError();
    };
  }, []);

  // Update mode in backend when mode changes
  const handleSelectMode = async (newMode) => {
    setMode(newMode);
    if (!newMode) {
      // Returned to menu: stop discovery and clear selections
      setIsScanning(false);
      setSelectedPeer(null);
      setConnectedPeer(null);
      await FileShareAPI.setMode('standby');
      await FileShareAPI.stopDiscovery();
      return;
    }

    await FileShareAPI.setMode(newMode);
    await FileShareAPI.startDiscovery();
    setIsScanning(true);

    if (newMode === 'receive') {
      setSelectedPeer(null);
      setStagedFiles([]);
    }
    await FileShareAPI.scanRadar();
  };

  const handleToggleScan = async () => {
    if (isScanning) {
      setIsScanning(false);
      await FileShareAPI.stopDiscovery();
    } else {
      setIsScanning(true);
      await FileShareAPI.startDiscovery();
      await FileShareAPI.scanRadar();
    }
  };

  const handleSaveDeviceName = async () => {
    if (!deviceNameInput.trim()) return;
    const updated = await FileShareAPI.setDeviceName(deviceNameInput.trim());
    setLocalInfo(prev => ({ ...prev, deviceName: updated }));
    setIsEditingName(false);
  };

  const handleCopyIp = async () => {
    const fullAddr = `${localInfo.ip}:${localInfo.httpPort}`;
    await SystemAPI.copyText(fullAddr);
    setCopiedIp(true);
    setTimeout(() => setCopiedIp(false), 2000);
  };

  const handleConnectPeer = async (peer) => {
    setSelectedPeer(peer);
    setConnectedPeer(peer);
    await FileShareAPI.connectPeer(peer);
  };

  const handleDisconnect = async () => {
    if (selectedPeer || connectedPeer) {
      await FileShareAPI.disconnectPeer(selectedPeer || connectedPeer);
    }
    setSelectedPeer(null);
    setConnectedPeer(null);
  };

  const handlePickFiles = async () => {
    try {
      const picked = await FileShareAPI.pickFiles();
      if (picked && picked.length > 0) {
        setStagedFiles(prev => {
          const existingPaths = new Set(prev.map(f => f.path));
          const uniqueNew = picked.filter(f => !existingPaths.has(f.path));
          return [...prev, ...uniqueNew];
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDropFiles = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const dropped = Array.from(e.dataTransfer.files).map(f => ({
        path: f.path || f.name,
        name: f.name,
        size: f.size,
        ext: f.name.split('.').pop().toLowerCase()
      }));

      setStagedFiles(prev => {
        const existingPaths = new Set(prev.map(f => f.path));
        const uniqueNew = dropped.filter(f => !existingPaths.has(f.path));
        return [...prev, ...uniqueNew];
      });
    }
  };

  const handleRemoveStagedFile = (idx) => {
    setStagedFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const handleClearStagedFiles = () => {
    setStagedFiles([]);
  };

  const handleSendFiles = async () => {
    const target = selectedPeer || connectedPeer;
    if (!target) {
      alert('Please select a nearby receiver on the radar first!');
      return;
    }
    if (!stagedFiles || stagedFiles.length === 0) {
      alert('Please select at least one file to send.');
      return;
    }

    try {
      await FileShareAPI.sendFiles(target, stagedFiles);
    } catch (err) {
      alert(`Transfer failed: ${err.message}`);
    }
  };

  const handleAcceptIncoming = async (transferId, customSaveDir) => {
    const req = incomingRequest;
    setIncomingRequest(null);
    setActiveTransfer({
      role: 'receiver',
      status: 'transferring',
      transferId: transferId,
      peer: { name: req?.senderName || 'Sender', ip: req?.senderIp || '' },
      totalFiles: req?.totalFiles || (req?.files ? req.files.length : 1),
      totalSize: req?.totalSize || 0,
      percent: 0,
      speedMbps: '0.0',
      totalBytesTransferred: 0,
      saveDir: customSaveDir || localInfo.downloadDir
    });
    await FileShareAPI.respondToRequest(transferId, true, customSaveDir);
  };

  const handleDeclineIncoming = async (transferId) => {
    setIncomingRequest(null);
    await FileShareAPI.respondToRequest(transferId, false);
  };

  const handleCancelActiveTransfer = async () => {
    if (activeTransfer?.transferId) {
      await FileShareAPI.cancelTransfer(activeTransfer.transferId);
    }
    setActiveTransfer(null);
  };

  const handleCloseActiveTransfer = () => {
    setActiveTransfer(null);
    setStagedFiles([]);
  };

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const totalStagedSize = stagedFiles.reduce((acc, f) => acc + (f.size || 0), 0);

  const getFileBadgeColor = (fileName) => {
    const ext = (fileName || '').split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(ext)) return { bg: '#FDF4FF', text: '#A21CAF', border: '#F0ABFC', icon: ImageIcon };
    if (['mp4', 'mkv', 'mov', 'avi', 'webm'].includes(ext)) return { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE', icon: Film };
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return { bg: '#FEF3C7', text: '#B45309', border: '#FDE68A', icon: Archive };
    if (['js', 'jsx', 'ts', 'tsx', 'py', 'html', 'css', 'json', 'cpp', 'java'].includes(ext)) return { bg: '#F0FDFA', text: '#0F766E', border: '#99F6E4', icon: FileCode };
    if (['pdf', 'doc', 'docx', 'txt', 'md'].includes(ext)) return { bg: '#FFF1F2', text: '#BE123C', border: '#FECDD3', icon: FileText };
    return { bg: '#F8FAFC', text: '#475569', border: '#E2E8F0', icon: File };
  };

  const activeConnectedTarget = selectedPeer || connectedPeer;

  return (
    <div style={{
      width: '100%',
      minHeight: '100%',
      background: '#F8FAFC',
      padding: 'clamp(14px, 2vw, 24px)',
      display: 'flex',
      flexDirection: 'column',
      gap: '20px',
      boxSizing: 'border-box'
    }}>

      {/* 1. TOP HEADER BAR: Device Identity & Folder */}
      <div style={{
        background: '#FFFFFF',
        border: '1px solid var(--border)',
        borderRadius: '18px',
        padding: '14px 22px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '14px',
        boxShadow: 'var(--shadow-sm)'
      }}>
        {/* Left: Branding & Device Name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #0D9488 0%, #0F766E 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#FFFFFF',
            boxShadow: '0 2px 8px rgba(13, 148, 136, 0.3)',
            flexShrink: 0
          }}>
            <Share2 size={22} />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-main)', margin: 0, letterSpacing: '-0.3px' }}>
                Offline File Sharing
              </h2>
              <span style={{
                background: '#DCFCE7',
                color: '#15803D',
                fontSize: '10px',
                fontWeight: '800',
                padding: '2px 8px',
                borderRadius: '6px',
                border: '1px solid #BBF7D0',
                letterSpacing: '0.4px'
              }}>
                100% OFFLINE
              </span>
            </div>

            {/* Editable Device Name */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Device:</span>
              {isEditingName ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <input
                    type="text"
                    value={deviceNameInput}
                    onChange={(e) => setDeviceNameInput(e.target.value)}
                    style={{
                      padding: '2px 8px',
                      fontSize: '12px',
                      fontWeight: '700',
                      border: '1.5px solid #0D9488',
                      borderRadius: '6px',
                      background: '#FFFFFF',
                      outline: 'none',
                      width: '130px'
                    }}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveDeviceName();
                      if (e.key === 'Escape') setIsEditingName(false);
                    }}
                  />
                  <button
                    onClick={handleSaveDeviceName}
                    style={{
                      background: '#0D9488',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '3px 8px',
                      fontSize: '11px',
                      fontWeight: '700',
                      cursor: 'pointer'
                    }}
                  >
                    Save
                  </button>
                </div>
              ) : (
                <div 
                  onClick={() => setIsEditingName(true)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    cursor: 'pointer',
                    padding: '1px 6px',
                    borderRadius: '6px',
                    transition: 'background 0.15s ease'
                  }}
                  title="Click to rename your device"
                >
                  <span style={{ fontSize: '13px', fontWeight: '800', color: 'var(--text-main)' }}>
                    {localInfo.deviceName}
                  </span>
                  <Edit3 size={12} color="#0D9488" />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: IP Address pill & Received Files */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div 
            onClick={handleCopyIp}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              background: '#F0FDFA',
              border: '1px solid #99F6E4',
              borderRadius: '10px',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
            title="Click to copy your offline address"
          >
            <Wifi size={14} color="#0D9488" />
            <span style={{ fontSize: '12px', fontWeight: '700', color: '#0F766E', fontFamily: 'monospace' }}>
              {localInfo.ip}:{localInfo.httpPort}
            </span>
            {copiedIp ? <Check size={13} color="#10B981" /> : <Copy size={13} color="#0D9488" />}
          </div>

          <button
            onClick={() => FileShareAPI.openFolder(localInfo.downloadDir)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 14px',
              background: '#FFFFFF',
              border: '1px solid var(--border)',
              borderRadius: '10px',
              color: 'var(--text-main)',
              fontSize: '12px',
              fontWeight: '700',
              cursor: 'pointer',
              boxShadow: 'var(--shadow-sm)'
            }}
          >
            <FolderOpen size={15} color="#0D9488" />
            <span>Received Files</span>
          </button>
        </div>
      </div>

      {/* 2. DEFAULT CHOICE SCREEN: Display Send & Receive options when no mode is selected */}
      {mode === null ? (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '24px',
          padding: '40px 20px',
          minHeight: '440px'
        }}>
          <div style={{ textAlign: 'center', maxWidth: '540px' }}>
            <h2 style={{ fontSize: '26px', fontWeight: '800', color: '#0F172A', margin: '0 0 8px 0', letterSpacing: '-0.5px' }}>
              What would you like to do?
            </h2>
            <p style={{ fontSize: '14px', color: '#64748B', margin: 0 }}>
              Choose whether you want to send files to a nearby device or receive files from someone on the same Wi-Fi or Hotspot.
            </p>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '20px',
            width: '100%',
            maxWidth: '780px'
          }}>
            {/* LARGE SELECTION CARD 1: SEND FILES */}
            <div
              onClick={() => handleSelectMode('send')}
              className="sp-card-interactive"
              style={{
                background: '#FFFFFF',
                border: '2px solid #99F6E4',
                borderRadius: '24px',
                padding: '32px 28px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '22px',
                boxShadow: '0 8px 24px rgba(13, 148, 136, 0.08)',
                transition: 'all 0.22s cubic-bezier(0.16, 1, 0.3, 1)'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.borderColor = '#0D9488';
                e.currentTarget.style.boxShadow = '0 16px 32px rgba(13, 148, 136, 0.18)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.borderColor = '#99F6E4';
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(13, 148, 136, 0.08)';
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{
                  width: '60px',
                  height: '60px',
                  borderRadius: '18px',
                  background: 'linear-gradient(135deg, #0D9488 0%, #0F766E 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#FFFFFF',
                  boxShadow: '0 6px 16px rgba(13, 148, 136, 0.3)'
                }}>
                  <Send size={28} />
                </div>

                <div>
                  <h3 style={{ fontSize: '22px', fontWeight: '800', color: '#0F172A', margin: '0 0 6px 0' }}>
                    Send Files
                  </h3>
                  <p style={{ fontSize: '13px', color: '#64748B', lineHeight: '1.5', margin: 0 }}>
                    Scan radar for nearby laptops or computers and send photos, 4K videos, documents, or entire folders offline.
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '11px', fontWeight: '700', padding: '3px 8px', borderRadius: '6px', background: '#F0FDFA', color: '#0F766E' }}>
                    Nearby Radar
                  </span>
                  <span style={{ fontSize: '11px', fontWeight: '700', padding: '3px 8px', borderRadius: '6px', background: '#F0FDFA', color: '#0F766E' }}>
                    Fast Offline Transfer
                  </span>
                </div>
              </div>

              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 18px',
                background: '#0D9488',
                color: '#FFFFFF',
                borderRadius: '12px',
                fontSize: '13.5px',
                fontWeight: '800',
                boxShadow: '0 2px 8px rgba(13, 148, 136, 0.25)'
              }}>
                <span>Choose to Send</span>
                <ArrowRight size={16} />
              </div>
            </div>

            {/* LARGE SELECTION CARD 2: RECEIVE FILES */}
            <div
              onClick={() => handleSelectMode('receive')}
              className="sp-card-interactive"
              style={{
                background: '#FFFFFF',
                border: '2px solid #FED7AA',
                borderRadius: '24px',
                padding: '32px 28px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '22px',
                boxShadow: '0 8px 24px rgba(234, 88, 12, 0.08)',
                transition: 'all 0.22s cubic-bezier(0.16, 1, 0.3, 1)'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.borderColor = '#EA580C';
                e.currentTarget.style.boxShadow = '0 16px 32px rgba(234, 88, 12, 0.18)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.borderColor = '#FED7AA';
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(234, 88, 12, 0.08)';
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{
                  width: '60px',
                  height: '60px',
                  borderRadius: '18px',
                  background: 'linear-gradient(135deg, #FF6B4A 0%, #EA580C 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#FFFFFF',
                  boxShadow: '0 6px 16px rgba(234, 88, 12, 0.3)'
                }}>
                  <Download size={28} />
                </div>

                <div>
                  <h3 style={{ fontSize: '22px', fontWeight: '800', color: '#0F172A', margin: '0 0 6px 0' }}>
                    Receive Files
                  </h3>
                  <p style={{ fontSize: '13px', color: '#64748B', lineHeight: '1.5', margin: 0 }}>
                    Make your device visible on radar as <strong>"{localInfo.deviceName}"</strong> so a sender can connect and transfer files to you.
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '11px', fontWeight: '700', padding: '3px 8px', borderRadius: '6px', background: '#FFF0EB', color: '#C2410C' }}>
                    100% Offline
                  </span>
                  <span style={{ fontSize: '11px', fontWeight: '700', padding: '3px 8px', borderRadius: '6px', background: '#FFF0EB', color: '#C2410C' }}>
                    Accept / Decline Prompt
                  </span>
                </div>
              </div>

              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 18px',
                background: 'linear-gradient(135deg, #FF6B4A 0%, #EA580C 100%)',
                color: '#FFFFFF',
                borderRadius: '12px',
                fontSize: '13.5px',
                fontWeight: '800',
                boxShadow: '0 2px 8px rgba(234, 88, 12, 0.25)'
              }}>
                <span>Choose to Receive</span>
                <ArrowRight size={16} />
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* MODE ACTIVE TOOLBAR: Back button + Mode tabs */
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          width: '100%'
        }}>
          {/* Back to Choice Menu */}
          <button
            onClick={() => handleSelectMode(null)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              borderRadius: '10px',
              background: '#FFFFFF',
              border: '1px solid var(--border)',
              color: 'var(--text-main)',
              fontSize: '12.5px',
              fontWeight: '700',
              cursor: 'pointer',
              boxShadow: 'var(--shadow-sm)'
            }}
          >
            <ArrowLeft size={15} />
            <span>← Change Mode (Back to Menu)</span>
          </button>

          {/* Quick Segmented Mode Switcher */}
          <div style={{
            display: 'flex',
            background: '#E2E8F0',
            borderRadius: '12px',
            padding: '3px',
            gap: '3px'
          }}>
            <button
              onClick={() => handleSelectMode('send')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 16px',
                borderRadius: '9px',
                background: mode === 'send' ? '#0D9488' : 'transparent',
                color: mode === 'send' ? '#FFFFFF' : '#475569',
                fontSize: '12px',
                fontWeight: '800',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <Send size={13} />
              <span>Send Files</span>
            </button>
            <button
              onClick={() => handleSelectMode('receive')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 16px',
                borderRadius: '9px',
                background: mode === 'receive' ? '#EA580C' : 'transparent',
                color: mode === 'receive' ? '#FFFFFF' : '#475569',
                fontSize: '12px',
                fontWeight: '800',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <Download size={13} />
              <span>Receive Files</span>
            </button>
          </div>
        </div>
      )}

      {/* 3. RECEIVE MODE VIEW (Only active when Receive is chosen) */}
      {mode === 'receive' && (
        <div style={{
          background: '#FFFFFF',
          border: '1.5px solid #FED7AA',
          borderRadius: '20px',
          padding: '36px 24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          gap: '20px',
          boxShadow: 'var(--shadow-sm)',
          minHeight: '380px'
        }}>
          {/* Animated Receiving Radar Wave */}
          <div style={{ position: 'relative', width: '130px', height: '130px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="pulse-live" style={{
              position: 'absolute',
              width: '130px',
              height: '130px',
              borderRadius: '50%',
              background: 'rgba(255, 107, 74, 0.15)',
              border: '2px solid rgba(255, 107, 74, 0.4)'
            }} />
            <div className="pulse-live" style={{
              position: 'absolute',
              width: '95px',
              height: '95px',
              borderRadius: '50%',
              background: 'rgba(255, 107, 74, 0.25)',
              border: '2px solid rgba(255, 107, 74, 0.6)'
            }} />
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #FF6B4A 0%, #EA580C 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#FFFFFF',
              boxShadow: '0 4px 16px rgba(234, 88, 12, 0.4)',
              zIndex: 10
            }}>
              <Laptop size={32} />
            </div>
          </div>

          <div>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 12px',
              borderRadius: '20px',
              background: '#FFF0EB',
              border: '1px solid #FED7AA',
              color: '#EA580C',
              fontSize: '12px',
              fontWeight: '800',
              marginBottom: '10px'
            }}>
              <span className="pulse-live" style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#EA580C' }} />
              Ready to Receive Files
            </div>

            <h3 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-main)', margin: '0 0 6px 0' }}>
              Visible as "{localInfo.deviceName}"
            </h3>
            <p style={{ fontSize: '13.5px', color: 'var(--text-muted)', margin: 0, maxWidth: '440px' }}>
              Keep this screen open. Tell the sender to click <strong>Send Files</strong> and select <strong>{localInfo.deviceName}</strong> on their radar.
            </p>
          </div>

          {/* Connected Sender Banner if someone connected */}
          {connectedPeer ? (
            <div style={{
              background: '#F0FDF4',
              border: '1.5px solid #86EFAC',
              borderRadius: '16px',
              padding: '14px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              maxWidth: '460px',
              gap: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', textAlign: 'left' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#16A34A' }} />
                <div>
                  <div style={{ fontSize: '14px', fontWeight: '800', color: '#166534' }}>
                    Connected with {connectedPeer.name}
                  </div>
                  <div style={{ fontSize: '11.5px', color: '#15803D' }}>
                    Ready to receive incoming transfers
                  </div>
                </div>
              </div>

              <button
                onClick={handleDisconnect}
                style={{
                  padding: '6px 14px',
                  borderRadius: '8px',
                  background: '#FFFFFF',
                  border: '1px solid #F87171',
                  color: '#DC2626',
                  fontSize: '12px',
                  fontWeight: '700',
                  cursor: 'pointer'
                }}
              >
                Disconnect
              </button>
            </div>
          ) : (
            <div style={{
              background: '#F8FAFC',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '10px 18px',
              fontSize: '12px',
              color: 'var(--text-muted)'
            }}>
              Listening on Wi-Fi / Hotspot port {localInfo.httpPort} • No internet required
            </div>
          )}
        </div>
      )}

      {/* 4. SEND MODE VIEW (Only active when Send is chosen) */}
      {mode === 'send' && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '20px',
          width: '100%'
        }}>
          {/* Left Column: Nearby Radar Scanning & Selection */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <NearbyRadar
              peers={peers}
              selectedPeer={selectedPeer}
              onSelectPeer={handleConnectPeer}
              localInfo={localInfo}
              onToggleScan={handleToggleScan}
              isScanning={isScanning}
              onDirectConnect={async (ip, port) => {
                const p = await FileShareAPI.directConnect(ip, port);
                if (p) handleConnectPeer(p);
                return p;
              }}
              onOpenNetworkModal={() => setShowNetworkModal(true)}
            />
          </div>

          {/* Right Column: Connection Status & File Staging */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            
            {/* Target Receiver Card with Connected / Disconnect State */}
            <div style={{
              background: '#FFFFFF',
              border: activeConnectedTarget ? '1.5px solid #10B981' : '1px solid var(--border)',
              borderRadius: '16px',
              padding: '16px 20px',
              boxShadow: activeConnectedTarget ? '0 4px 14px rgba(16, 185, 129, 0.12)' : 'var(--shadow-sm)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '12px',
                  background: activeConnectedTarget ? '#ECFDF5' : '#F1F5F9',
                  border: activeConnectedTarget ? '1px solid #A7F3D0' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: activeConnectedTarget ? '#059669' : '#64748B',
                  flexShrink: 0
                }}>
                  <Laptop size={22} />
                </div>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: '800', color: activeConnectedTarget ? '#059669' : 'var(--text-muted)', textTransform: 'uppercase' }}>
                    {activeConnectedTarget ? 'CONNECTED RECEIVER' : 'TARGET RECEIVER'}
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: '800', color: 'var(--text-main)', marginTop: '2px' }}>
                    {activeConnectedTarget ? activeConnectedTarget.name : 'No device selected'}
                  </div>
                  <div style={{ fontSize: '11.5px', color: activeConnectedTarget ? '#10B981' : 'var(--text-muted)', marginTop: '1px' }}>
                    {activeConnectedTarget ? '● Connected & Ready to Receive' : 'Select a device on the radar to connect'}
                  </div>
                </div>
              </div>

              {activeConnectedTarget ? (
                <button
                  onClick={handleDisconnect}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '8px',
                    background: '#FFF1F2',
                    border: '1px solid #FECDD3',
                    color: '#E11D48',
                    fontSize: '12px',
                    fontWeight: '700',
                    cursor: 'pointer'
                  }}
                >
                  Disconnect
                </button>
              ) : (
                <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                  Select peer on radar ←
                </span>
              )}
            </div>

            {/* File Drop & Browse Area */}
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDropFiles}
              style={{
                background: isDragging ? '#F0FDFA' : '#FFFFFF',
                border: isDragging ? '2px dashed #0D9488' : '1.5px dashed #CBD5E1',
                borderRadius: '18px',
                padding: '24px 20px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                gap: '12px',
                boxShadow: 'var(--shadow-sm)',
                transition: 'all 0.15s ease'
              }}
            >
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '14px',
                background: '#F0FDFA',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#0D9488'
              }}>
                <Upload size={24} />
              </div>

              <div>
                <h4 style={{ fontSize: '15px', fontWeight: '800', color: 'var(--text-main)', margin: '0 0 4px 0' }}>
                  Drop files here to share offline
                </h4>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                  Select multiple files at once (hold Ctrl / Shift to pick many) or drag & drop
                </p>
              </div>

              <button
                onClick={handlePickFiles}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '9px 20px',
                  borderRadius: '10px',
                  background: '#0D9488',
                  color: '#FFFFFF',
                  fontSize: '13px',
                  fontWeight: '700',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(13, 148, 136, 0.25)'
                }}
              >
                <Upload size={14} />
                <span>Browse & Select Multiple Files</span>
              </button>
            </div>

            {/* Staged Files List with Individual File Sizes & Total Overall Size */}
            {stagedFiles.length > 0 && (
              <div style={{
                background: '#FFFFFF',
                border: '1px solid var(--border)',
                borderRadius: '16px',
                padding: '16px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                boxShadow: 'var(--shadow-sm)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: '800', color: 'var(--text-main)' }}>
                      Files to Send ({stagedFiles.length})
                    </span>
                    <span style={{ fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '6px', background: '#F0FDFA', color: '#0F766E' }}>
                      {formatBytes(totalStagedSize)}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      onClick={handlePickFiles}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '4px 10px',
                        borderRadius: '8px',
                        background: '#F0FDFA',
                        border: '1px solid #99F6E4',
                        color: '#0D9488',
                        fontSize: '11.5px',
                        fontWeight: '700',
                        cursor: 'pointer'
                      }}
                      title="Add more files to this transfer batch"
                    >
                      <Upload size={12} />
                      <span>+ Add More Files</span>
                    </button>
                    <button
                      onClick={handleClearStagedFiles}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#E11D48',
                        fontSize: '11.5px',
                        fontWeight: '700',
                        cursor: 'pointer'
                      }}
                    >
                      Clear All
                    </button>
                  </div>
                </div>

                {/* Individual File Items */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '180px', overflowY: 'auto' }}>
                  {stagedFiles.map((file, idx) => {
                    const badge = getFileBadgeColor(file.name);
                    const FileIconComp = badge.icon;
                    return (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 12px',
                          background: '#F8FAFC',
                          borderRadius: '8px',
                          border: '1px solid var(--border)'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                          <div style={{
                            width: '26px',
                            height: '26px',
                            borderRadius: '6px',
                            background: badge.bg,
                            border: `1px solid ${badge.border}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: badge.text,
                            flexShrink: 0
                          }}>
                            <FileIconComp size={14} />
                          </div>
                          <span style={{ fontSize: '12.5px', fontWeight: '700', color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {file.name}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                          {/* Individual File Size Display */}
                          <span style={{ fontSize: '11.5px', fontWeight: '700', color: 'var(--text-muted)' }}>
                            {formatBytes(file.size)}
                          </span>
                          <button
                            onClick={() => handleRemoveStagedFile(idx)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#94A3B8',
                              cursor: 'pointer',
                              padding: '2px'
                            }}
                            title="Remove file"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Big Send Action Button */}
                <button
                  onClick={handleSendFiles}
                  disabled={!activeConnectedTarget || stagedFiles.length === 0}
                  style={{
                    width: '100%',
                    padding: '12px 20px',
                    borderRadius: '12px',
                    background: activeConnectedTarget ? 'linear-gradient(135deg, #0D9488 0%, #0F766E 100%)' : '#E2E8F0',
                    color: activeConnectedTarget ? '#FFFFFF' : '#94A3B8',
                    fontSize: '14px',
                    fontWeight: '800',
                    border: 'none',
                    cursor: activeConnectedTarget ? 'pointer' : 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    boxShadow: activeConnectedTarget ? '0 4px 14px rgba(13, 148, 136, 0.3)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <Send size={16} />
                  <span>
                    {activeConnectedTarget
                      ? `Send ${stagedFiles.length} ${stagedFiles.length === 1 ? 'File' : 'Files'} (${formatBytes(totalStagedSize)}) to ${activeConnectedTarget.name}`
                      : 'Select a Device on Radar to Send'}
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODALS */}
      {incomingRequest && (
        <IncomingRequestModal
          request={incomingRequest}
          onAccept={handleAcceptIncoming}
          onDecline={handleDeclineIncoming}
          onPickFolder={() => FileShareAPI.pickFolder()}
        />
      )}

      <TransferProgressModal
        transferState={activeTransfer}
        onCancel={handleCancelActiveTransfer}
        onClose={handleCloseActiveTransfer}
        onOpenFolder={(f) => FileShareAPI.openFolder(f || localInfo.downloadDir)}
        onOpenFile={(f) => FileShareAPI.openFile(f)}
      />

      <NetworkPermissionModal
        isOpen={showNetworkModal}
        onClose={() => setShowNetworkModal(false)}
        localInfo={localInfo}
        onScanReady={handleToggleScan}
      />
    </div>
  );
}
