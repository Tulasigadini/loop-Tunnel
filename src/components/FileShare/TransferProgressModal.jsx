import React from 'react';
import { 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Loader2, 
  FolderOpen, 
  File, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Zap, 
  Clock, 
  HardDrive, 
  Check 
} from 'lucide-react';

export default function TransferProgressModal({
  transferState,
  onCancel,
  onClose,
  onOpenFolder,
  onOpenFile
}) {
  if (!transferState || transferState.status === 'idle') return null;

  const {
    role = 'sender', // 'sender' or 'receiver'
    status = 'transferring', // 'waiting_acceptance', 'transferring', 'completed', 'declined', 'cancelled', 'error'
    peer,
    sender,
    fileName,
    fileIndex = 0,
    totalFiles = 1,
    fileBytes = 0,
    fileSize = 0,
    totalBytesTransferred = 0,
    totalSize = 0,
    percent = 0,
    speedMbps = '0.0',
    etaSeconds = 0,
    completedFiles = [],
    saveDir,
    reason,
    error,
    durationMs = 0
  } = transferState;

  const targetPeer = role === 'sender' ? peer : sender;
  const isSender = role === 'sender';

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatEta = (seconds) => {
    if (!seconds || seconds <= 0) return 'Calculating...';
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
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
          maxWidth: '540px',
          background: '#FFFFFF',
          borderRadius: '24px',
          boxShadow: '0 24px 48px -12px rgba(15, 23, 42, 0.35)',
          border: '1px solid var(--border)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Header Bar */}
        <div style={{
          padding: '18px 24px',
          background: status === 'completed' 
            ? 'linear-gradient(135deg, #059669 0%, #047857 100%)'
            : status === 'declined' || status === 'error' || status === 'cancelled'
            ? 'linear-gradient(135deg, #E11D48 0%, #BE123C 100%)'
            : 'linear-gradient(135deg, #0D9488 0%, #0F766E 100%)',
          color: '#FFFFFF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: 'rgba(255, 255, 255, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              {isSender ? <ArrowUpRight size={20} /> : <ArrowDownLeft size={20} />}
            </div>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: '800', margin: 0 }}>
                {status === 'waiting_acceptance' && 'Connecting to Receiver...'}
                {status === 'transferring' && (isSender ? `Sending to ${targetPeer?.name || 'Peer'}` : `Receiving from ${targetPeer?.name || 'Peer'}`)}
                {status === 'completed' && 'Transfer Completed! 🎉'}
                {status === 'declined' && 'Connection Declined'}
                {status === 'cancelled' && 'Transfer Cancelled'}
                {status === 'error' && 'Transfer Error'}
              </h3>
              <div style={{ fontSize: '11.5px', opacity: 0.9, marginTop: '2px' }}>
                Offline Direct LAN • Zero Internet Required
              </div>
            </div>
          </div>

          <div style={{
            fontSize: '11px',
            fontWeight: '800',
            textTransform: 'uppercase',
            padding: '3px 8px',
            borderRadius: '6px',
            background: 'rgba(255, 255, 255, 0.2)'
          }}>
            {isSender ? 'SENDER' : 'RECEIVER'}
          </div>
        </div>

        {/* Content Body */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* 1. STATE: WAITING FOR ACCEPTANCE */}
          {status === 'waiting_acceptance' && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              gap: '16px',
              padding: '16px 0'
            }}>
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: '#F0FDFA',
                border: '2px solid #99F6E4',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#0D9488'
              }}>
                <Loader2 size={32} className="spin" />
              </div>
              <div>
                <h4 style={{ fontSize: '16px', fontWeight: '800', color: 'var(--text-main)', margin: 0 }}>
                  Waiting for {targetPeer?.name || 'Receiver'} to accept...
                </h4>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '6px 0 0 0', maxWidth: '380px' }}>
                  A connection request prompt has been sent to their screen with Accept and Decline buttons.
                </p>
              </div>

              <div style={{
                background: '#F8FAFC',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                padding: '10px 16px',
                fontSize: '12px',
                fontWeight: '600',
                color: 'var(--text-muted)'
              }}>
                Sending {totalFiles} {totalFiles === 1 ? 'file' : 'files'} ({formatBytes(totalSize)})
              </div>

              <button
                onClick={onCancel}
                style={{
                  padding: '9px 20px',
                  borderRadius: '10px',
                  background: '#F1F5F9',
                  color: 'var(--text-muted)',
                  fontSize: '12.5px',
                  fontWeight: '700',
                  border: '1px solid var(--border)',
                  cursor: 'pointer'
                }}
              >
                Cancel Request
              </button>
            </div>
          )}

          {/* 2. STATE: TRANSFERRING */}
          {status === 'transferring' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Individual File Progress */}
              <div style={{
                background: '#F0FDFA',
                border: '1px solid #99F6E4',
                borderRadius: '12px',
                padding: '12px 14px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                    <File size={16} color="#0D9488" style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: '13px', fontWeight: '700', color: '#0F766E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {fileName || 'Streaming file...'}
                    </span>
                  </div>
                  <span style={{ fontSize: '12px', fontWeight: '800', color: '#0D9488', flexShrink: 0 }}>
                    {fileSize > 0 ? `${formatBytes(fileBytes)} / ${formatBytes(fileSize)}` : formatBytes(fileBytes)}
                  </span>
                </div>
                {/* Individual file progress mini bar */}
                <div style={{ width: '100%', height: '6px', background: '#CCFBF1', borderRadius: '99px', overflow: 'hidden' }}>
                  <div style={{
                    width: fileSize > 0 ? `${Math.min(100, Math.round((fileBytes * 100) / fileSize))}%` : `${percent}%`,
                    height: '100%',
                    background: '#0D9488',
                    borderRadius: '99px',
                    transition: 'width 0.2s ease'
                  }} />
                </div>
              </div>

              {/* Overall Transfer Progress */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)' }}>
                    Overall: File {fileIndex} of {totalFiles}
                  </span>
                  <span style={{ fontSize: '16px', fontWeight: '800', color: '#0D9488' }}>
                    {percent}%
                  </span>
                </div>
                <div style={{
                  width: '100%',
                  height: '10px',
                  background: '#E2E8F0',
                  borderRadius: '99px',
                  overflow: 'hidden'
                }}>
                  <div
                    className="progress-shimmer"
                    style={{
                      width: `${percent}%`,
                      height: '100%',
                      borderRadius: '99px',
                      transition: 'width 0.25s ease-out'
                    }}
                  />
                </div>
              </div>

              {/* Stats Grid: Speed, Transferred, ETA */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '10px',
                background: '#F8FAFC',
                border: '1px solid var(--border)',
                borderRadius: '14px',
                padding: '12px 16px'
              }}>
                <div>
                  <div style={{ fontSize: '10.5px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    Speed
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: '800', color: '#0D9488', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Zap size={13} />
                    <span>{speedMbps} MB/s</span>
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '10.5px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    Transferred
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-main)', marginTop: '2px' }}>
                    {formatBytes(totalBytesTransferred)} / {formatBytes(totalSize)}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '10.5px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    ETA Remaining
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-main)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Clock size={13} />
                    <span>{formatEta(etaSeconds)}</span>
                  </div>
                </div>
              </div>

              {/* Cancel Button */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
                <button
                  onClick={onCancel}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    background: '#FFF1F2',
                    border: '1px solid #FECDD3',
                    color: '#E11D48',
                    fontSize: '12px',
                    fontWeight: '700',
                    cursor: 'pointer'
                  }}
                >
                  Cancel Transfer
                </button>
              </div>
            </div>
          )}

          {/* 3. STATE: COMPLETED */}
          {status === 'completed' && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              gap: '16px',
              padding: '10px 0'
            }}>
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: '#DCFCE7',
                border: '2px solid #86EFAC',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#16A34A'
              }}>
                <CheckCircle2 size={36} />
              </div>

              <div>
                <h4 style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-main)', margin: 0 }}>
                  {isSender ? 'All files delivered successfully!' : 'All files received and saved!'}
                </h4>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                  Transferred {formatBytes(totalSize)} in {(durationMs / 1000).toFixed(1)}s over local Wi-Fi.
                </p>
              </div>

              {/* Completed Files List */}
              {completedFiles.length > 0 && (
                <div style={{
                  width: '100%',
                  maxHeight: '140px',
                  overflowY: 'auto',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  padding: '8px'
                }}>
                  {completedFiles.map((file, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 10px',
                        borderRadius: '6px',
                        background: idx % 2 === 0 ? '#F8FAFC' : '#FFFFFF',
                        fontSize: '12px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                        <Check size={14} color="#16A34A" />
                        <span style={{ fontWeight: '600', color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {file.name}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {formatBytes(file.size)}
                        </span>
                        {file.path && onOpenFile && (
                          <button
                            onClick={() => onOpenFile(file.path)}
                            style={{
                              background: '#F0FDFA',
                              border: '1px solid #99F6E4',
                              color: '#0D9488',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontSize: '10px',
                              fontWeight: '700'
                            }}
                          >
                            Open
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '12px', width: '100%', marginTop: '6px' }}>
                {!isSender && (
                  <button
                    onClick={() => onOpenFolder(saveDir || transferState?.savedPath || '')}
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      padding: '11px 18px',
                      borderRadius: '12px',
                      background: '#F0FDFA',
                      border: '1px solid #99F6E4',
                      color: '#0D9488',
                      fontSize: '13px',
                      fontWeight: '700',
                      cursor: 'pointer'
                    }}
                  >
                    <FolderOpen size={16} />
                    <span>Open Received Folder</span>
                  </button>
                )}

                <button
                  onClick={onClose}
                  style={{
                    flex: 1,
                    padding: '11px 18px',
                    borderRadius: '12px',
                    background: '#0D9488',
                    color: '#FFFFFF',
                    fontSize: '13px',
                    fontWeight: '800',
                    boxShadow: '0 4px 12px rgba(13, 148, 136, 0.25)'
                  }}
                >
                  Done
                </button>
              </div>
            </div>
          )}

          {/* 4. STATE: DECLINED */}
          {status === 'declined' && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              gap: '16px',
              padding: '12px 0'
            }}>
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: '#FFF1F2',
                border: '2px solid #FECDD3',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#E11D48'
              }}>
                <XCircle size={36} />
              </div>
              <div>
                <h4 style={{ fontSize: '17px', fontWeight: '800', color: '#991B1B', margin: 0 }}>
                  Connection Request Declined
                </h4>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '6px 0 0 0', maxWidth: '360px' }}>
                  {reason || `${targetPeer?.name || 'The receiver'} declined to accept the incoming transfer.`}
                </p>
              </div>
              <button
                onClick={onClose}
                style={{
                  padding: '10px 24px',
                  borderRadius: '10px',
                  background: '#0F172A',
                  color: '#FFFFFF',
                  fontWeight: '700',
                  fontSize: '13px'
                }}
              >
                Dismiss
              </button>
            </div>
          )}

          {/* 5. STATE: CANCELLED OR ERROR */}
          {(status === 'cancelled' || status === 'error') && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              gap: '16px',
              padding: '12px 0'
            }}>
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: '#FFF1F2',
                border: '2px solid #FECDD3',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#E11D48'
              }}>
                <AlertCircle size={36} />
              </div>
              <div>
                <h4 style={{ fontSize: '17px', fontWeight: '800', color: 'var(--text-main)', margin: 0 }}>
                  {status === 'cancelled' ? 'Transfer Was Cancelled' : 'Transfer Failed'}
                </h4>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '6px 0 0 0', maxWidth: '360px' }}>
                  {error || reason || 'The transfer session was terminated.'}
                </p>
              </div>
              <button
                onClick={onClose}
                style={{
                  padding: '10px 24px',
                  borderRadius: '10px',
                  background: '#0F172A',
                  color: '#FFFFFF',
                  fontWeight: '700',
                  fontSize: '13px'
                }}
              >
                Close
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
