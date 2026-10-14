import React, { useState } from 'react';
import { 
  Radar, 
  RefreshCw, 
  Laptop, 
  Smartphone, 
  Monitor, 
  Wifi, 
  Check, 
  ArrowRight, 
  Radio, 
  Zap,
  Play,
  Square
} from 'lucide-react';

export default function NearbyRadar({
  peers = [],
  selectedPeer,
  onSelectPeer,
  localInfo,
  onToggleScan,
  isScanning,
  onDirectConnect,
  onOpenNetworkModal
}) {
  const [directName, setDirectName] = useState('');
  const [showDirectInput, setShowDirectInput] = useState(false);
  const [directLoading, setDirectLoading] = useState(false);
  const [directError, setDirectError] = useState('');

  const getDeviceIcon = (os, deviceType) => {
    const o = (os || '').toLowerCase();
    if (o === 'android' || o === 'ios') return Smartphone;
    if (o === 'macos' || o === 'windows' || o === 'linux') return Laptop;
    return Monitor;
  };

  const handleDirectConnectSubmit = async (e) => {
    e.preventDefault();
    const query = directName.trim();
    if (!query) return;
    setDirectError('');
    setDirectLoading(true);

    try {
      // 1. Check if a discovered peer matches this name
      const matchedPeer = peers.find(p => 
        (p.name && p.name.toLowerCase().includes(query.toLowerCase())) ||
        (p.ip && p.ip === query)
      );

      if (matchedPeer) {
        onSelectPeer(matchedPeer);
        setShowDirectInput(false);
        setDirectName('');
        return;
      }

      // 2. Connect directly by name/hostname or IP
      const parts = query.split(':');
      const target = parts[0].trim();
      const port = parts[1] ? parts[1].trim() : (localInfo?.httpPort || 53318);
      const peer = await onDirectConnect(target, port);
      if (peer) {
        onSelectPeer(peer);
        setShowDirectInput(false);
        setDirectName('');
      }
    } catch (err) {
      setDirectError(err.message || `Could not find "${query}". Check if the device is active.`);
    } finally {
      setDirectLoading(false);
    }
  };

  const ownIp = localInfo?.ip || '192.168.11.16';
  const ownName = localInfo?.deviceName || 'Satya';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      
      {/* 1. Header Toolbar with ample spacing */}
      <div style={{
        background: '#FFFFFF',
        border: '1px solid var(--border)',
        borderRadius: '16px',
        padding: '14px 18px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        boxShadow: 'var(--shadow-sm)'
      }}>
        {/* Left: Title & Clean Status (Never collides with buttons) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '10px',
            background: isScanning ? 'linear-gradient(135deg, #0D9488 0%, #0F766E 100%)' : '#F1F5F9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: isScanning ? '#FFFFFF' : '#64748B',
            boxShadow: isScanning ? '0 2px 8px rgba(13, 148, 136, 0.25)' : 'none',
            flexShrink: 0
          }}>
            <Radar size={20} className={isScanning ? 'spin' : ''} />
          </div>

          <div>
            <h3 style={{ fontSize: '15px', fontWeight: '800', color: 'var(--text-main)', margin: 0 }}>
              Nearby Device Radar
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
              <span style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: isScanning ? '#10B981' : '#94A3B8'
              }} className={isScanning ? 'pulse-live' : ''} />
              <span style={{ fontSize: '11.5px', fontWeight: '700', color: isScanning ? '#0D9488' : 'var(--text-muted)' }}>
                {isScanning ? `${peers.length} nearby found • Scanning active` : 'Radar Standby (Ready to Scan)'}
              </span>
            </div>
          </div>
        </div>

        {/* Right Buttons: Connect by Name & Start Scan */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <button
            onClick={() => setShowDirectInput(!showDirectInput)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 14px',
              borderRadius: '8px',
              background: showDirectInput ? '#F0FDFA' : '#FFFFFF',
              border: showDirectInput ? '1.5px solid #0D9488' : '1px solid var(--border)',
              color: showDirectInput ? '#0D9488' : 'var(--text-main)',
              fontSize: '12px',
              fontWeight: '700',
              cursor: 'pointer'
            }}
            title="Connect with a nearby user by typing their device name"
          >
            <Radio size={13} />
            <span>Connect by Name</span>
          </button>

          {/* Toggle Scan Button */}
          <button
            onClick={onToggleScan}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 16px',
              borderRadius: '8px',
              background: isScanning ? '#FFF1F2' : '#0D9488',
              border: isScanning ? '1.5px solid #FECDD3' : 'none',
              color: isScanning ? '#E11D48' : '#FFFFFF',
              fontSize: '12px',
              fontWeight: '800',
              boxShadow: isScanning ? 'none' : '0 2px 8px rgba(13, 148, 136, 0.25)',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            {isScanning ? (
              <>
                <Square size={12} fill="#E11D48" />
                <span>Stop Scan</span>
              </>
            ) : (
              <>
                <Play size={12} fill="#FFFFFF" />
                <span>Start Radar Scan</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Connect by Name Expandable Form */}
      {showDirectInput && (
        <form
          onSubmit={handleDirectConnectSubmit}
          style={{
            background: '#F0FDFA',
            border: '1.5px solid #99F6E4',
            borderRadius: '14px',
            padding: '14px 18px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12.5px', fontWeight: '800', color: '#0F766E' }}>
              Connect with Device by Name
            </span>
            <span style={{ fontSize: '11px', color: '#0D9488' }}>
              Enter device name (e.g. Satya-PC, Alice, or IP)
            </span>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              placeholder="e.g. Satya-PC or Alice-Laptop"
              value={directName}
              onChange={e => setDirectName(e.target.value)}
              style={{
                flex: 1,
                padding: '8px 12px',
                fontSize: '12.5px',
                border: '1px solid #99F6E4',
                borderRadius: '8px'
              }}
              autoFocus
            />
            <button
              type="submit"
              disabled={directLoading}
              style={{
                padding: '8px 18px',
                borderRadius: '8px',
                background: '#0D9488',
                color: '#FFFFFF',
                fontWeight: '800',
                fontSize: '12.5px',
                cursor: directLoading ? 'wait' : 'pointer',
                border: 'none'
              }}
            >
              {directLoading ? 'Connecting...' : 'Connect'}
            </button>
          </div>
          {directError && (
            <div style={{ fontSize: '11.5px', color: '#E11D48', fontWeight: '700' }}>
              ⚠️ {directError}
            </div>
          )}
        </form>
      )}

      {/* 2. Sonar Radar Visualizer (Only animates when isScanning is true) */}
      <div style={{
        background: 'radial-gradient(circle at center, #064E3B 0%, #042F2E 60%, #02201F 100%)',
        borderRadius: '24px',
        padding: '24px',
        position: 'relative',
        overflow: 'hidden',
        minHeight: '290px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: 'inset 0 2px 14px rgba(0,0,0,0.5), 0 4px 18px rgba(13, 148, 136, 0.15)',
        border: '1px solid #134E4A'
      }}>
        {/* Radar Crosshair lines */}
        <div style={{
          position: 'absolute',
          width: '100%',
          height: '1px',
          background: 'rgba(45, 212, 191, 0.15)',
          pointerEvents: 'none'
        }} />
        <div style={{
          position: 'absolute',
          width: '1px',
          height: '100%',
          background: 'rgba(45, 212, 191, 0.15)',
          pointerEvents: 'none'
        }} />

        {/* Radar Concentric Distance Rings */}
        <div style={{
          position: 'absolute',
          width: '90px',
          height: '90px',
          borderRadius: '50%',
          border: '1px solid rgba(45, 212, 191, 0.45)',
          pointerEvents: 'none'
        }} />
        <div style={{
          position: 'absolute',
          width: '180px',
          height: '180px',
          borderRadius: '50%',
          border: '1px dashed rgba(45, 212, 191, 0.3)',
          pointerEvents: 'none'
        }} />
        <div style={{
          position: 'absolute',
          width: '270px',
          height: '270px',
          borderRadius: '50%',
          border: '1px solid rgba(45, 212, 191, 0.2)',
          pointerEvents: 'none'
        }} />

        {/* Pulsing Ripple Wave (Only active while scanning) */}
        {isScanning && (
          <div className="radar-ripple-ring" style={{
            position: 'absolute',
            width: '180px',
            height: '180px',
            borderRadius: '50%',
            border: '2px solid rgba(45, 212, 191, 0.6)',
            pointerEvents: 'none'
          }} />
        )}

        {/* Sweeping Sonar Beam (Only active while scanning) */}
        {isScanning && (
          <div className="radar-sweep-beam" style={{
            position: 'absolute',
            width: '270px',
            height: '270px',
            borderRadius: '50%',
            background: 'conic-gradient(from 0deg, transparent 0deg, transparent 270deg, rgba(45, 212, 191, 0.38) 360deg)',
            pointerEvents: 'none'
          }} />
        )}

        {/* CENTER BEACON: YOUR DEVICE & YOUR ACTUAL IP */}
        <div style={{
          position: 'relative',
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '6px'
        }}>
          {/* Beacon Avatar */}
          <div style={{
            width: '54px',
            height: '54px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #14B8A6 0%, #0D9488 100%)',
            border: '3px solid #5EEAD4',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#FFFFFF',
            boxShadow: '0 0 25px rgba(94, 234, 212, 0.7)'
          }}>
            <Laptop size={26} />
          </div>

          {/* Prominent Own Name Badge */}
          <div style={{
            background: 'rgba(4, 47, 46, 0.95)',
            backdropFilter: 'blur(8px)',
            border: '1.5px solid #2DD4BF',
            borderRadius: '14px',
            padding: '4px 14px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            boxShadow: '0 4px 14px rgba(0, 0, 0, 0.45)',
            whiteSpace: 'nowrap'
          }}>
            <span style={{ fontSize: '12.5px', fontWeight: '800', color: '#FFFFFF', letterSpacing: '-0.2px' }}>
              {ownName}
            </span>
            <span style={{ fontSize: '10px', fontWeight: '700', color: '#5EEAD4' }}>
              Your Device (Online)
            </span>
          </div>
        </div>

        {/* Real Discovered Peers Positioned on the Radar */}
        {peers.map((peer, idx) => {
          const total = peers.length;
          const angle = (idx / total) * 2 * Math.PI - (Math.PI / 2);
          const distance = 100;
          const x = Math.cos(angle) * distance;
          const y = Math.sin(angle) * distance;
          const isSelected = selectedPeer && selectedPeer.id === peer.id;
          const IconComponent = getDeviceIcon(peer.os, peer.deviceType);

          return (
            <div
              key={peer.id}
              onClick={() => onSelectPeer(peer)}
              style={{
                position: 'absolute',
                transform: `translate(${x}px, ${y}px)`,
                zIndex: 20,
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
                transition: 'transform 0.3s ease'
              }}
              title={`Click to select ${peer.name}`}
            >
              <div style={{
                width: '42px',
                height: '42px',
                borderRadius: '50%',
                background: isSelected ? '#10B981' : '#0F172A',
                border: isSelected ? '3px solid #6EE7B7' : '2px solid #2DD4BF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#FFFFFF',
                boxShadow: isSelected ? '0 0 18px rgba(16, 185, 129, 0.95)' : '0 0 12px rgba(45, 212, 191, 0.4)'
              }}>
                <IconComponent size={20} />
              </div>
              <div style={{
                background: isSelected ? '#065F46' : 'rgba(15, 23, 42, 0.9)',
                border: isSelected ? '1px solid #34D399' : '1px solid rgba(45, 212, 191, 0.4)',
                borderRadius: '12px',
                padding: '2px 8px',
                fontSize: '10px',
                fontWeight: '700',
                color: '#FFFFFF',
                whiteSpace: 'nowrap',
                maxWidth: '90px',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {peer.name}
              </div>
            </div>
          );
        })}

        {/* Radar Controls Overlay at the bottom */}
        {!isScanning ? (
          <button
            onClick={onToggleScan}
            style={{
              position: 'absolute',
              bottom: '14px',
              background: 'linear-gradient(135deg, #0D9488 0%, #0F766E 100%)',
              border: '1.5px solid #2DD4BF',
              borderRadius: '24px',
              padding: '7px 20px',
              color: '#FFFFFF',
              fontSize: '12px',
              fontWeight: '800',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 4px 14px rgba(0,0,0,0.3)',
              zIndex: 30
            }}
          >
            <Play size={12} fill="#FFFFFF" />
            <span>Click to Scan for Nearby Users</span>
          </button>
        ) : (
          <div style={{
            position: 'absolute',
            bottom: '12px',
            background: 'rgba(4, 47, 46, 0.92)',
            border: '1px solid rgba(45, 212, 191, 0.4)',
            borderRadius: '20px',
            padding: '4px 14px',
            color: '#CCFBF1',
            fontSize: '11px',
            fontWeight: '700',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            zIndex: 30
          }}>
            <span className="pulse-live" style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#2DD4BF' }} />
            <span>Scanning local Wi-Fi / LAN for devices...</span>
            <button
              onClick={onToggleScan}
              style={{
                background: '#E11D48',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '6px',
                padding: '2px 8px',
                fontSize: '10px',
                fontWeight: '800',
                marginLeft: '4px',
                cursor: 'pointer'
              }}
            >
              Stop
            </button>
          </div>
        )}
      </div>

        {/* 3. Discovered Devices List */}
        {peers.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ fontSize: '12px', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Nearby Devices ({peers.length})
            </div>
            {peers.map((peer) => {
              const isSelected = selectedPeer && selectedPeer.id === peer.id;
              const IconComp = getDeviceIcon(peer.os, peer.deviceType);
              return (
                <div
                  key={peer.id}
                  onClick={() => onSelectPeer(peer)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    borderRadius: '12px',
                    background: isSelected ? '#F0FDFA' : '#FFFFFF',
                    border: isSelected ? '2px solid #0D9488' : '1px solid var(--border)',
                    boxShadow: isSelected ? '0 2px 10px rgba(13, 148, 136, 0.15)' : 'none',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '10px',
                      background: isSelected ? '#0D9488' : '#F1F5F9',
                      color: isSelected ? '#FFFFFF' : '#475569',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <IconComp size={20} />
                    </div>
                    <div>
                      <div style={{ fontSize: '13.5px', fontWeight: '800', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>{peer.name}</span>
                        <span style={{
                          fontSize: '9.5px',
                          textTransform: 'uppercase',
                          fontWeight: '800',
                          padding: '1px 6px',
                          borderRadius: '4px',
                          background: '#DCFCE7',
                          color: '#15803D'
                        }}>
                          {peer.os || 'Nearby'}
                        </span>
                      </div>
                      <div style={{ fontSize: '11px', color: '#0D9488', marginTop: '2px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10B981', display: 'inline-block' }} />
                        <span>{peer.mode === 'receive' || peer.status === 'ready_to_receive' ? 'Ready to Receive' : 'Online'}</span>
                      </div>
                    </div>
                  </div>

                  <div style={{
                    padding: '6px 14px',
                    borderRadius: '20px',
                    fontSize: '11.5px',
                    fontWeight: '800',
                    background: isSelected ? 'linear-gradient(135deg, #0D9488 0%, #0F766E 100%)' : '#F1F5F9',
                    color: isSelected ? '#FFFFFF' : '#0D9488',
                    border: isSelected ? 'none' : '1px solid #CCFBF1'
                  }}>
                    {isSelected ? 'Connected ✓' : 'Connect & Send →'}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{
            padding: '16px',
            borderRadius: '12px',
            background: '#F8FAFC',
            border: '1px dashed var(--border)',
            textAlign: 'center',
            fontSize: '12px',
            color: '#64748B',
            lineHeight: '1.5'
          }}>
            {isScanning ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: '#0D9488', fontWeight: '700' }}>
                <span className="pulse-live" style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#0D9488' }} />
                <span>Searching local network for SharePort devices...</span>
              </div>
            ) : (
              <div>
                Click <strong>Start Radar Scan</strong> to find devices on your Wi-Fi, or{' '}
                {onOpenNetworkModal && (
                  <button
                    onClick={onOpenNetworkModal}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#0D9488',
                      fontWeight: '800',
                      cursor: 'pointer',
                      padding: 0,
                      textDecoration: 'underline'
                    }}
                  >
                    turn on Mobile Hotspot
                  </button>
                )}
                {' '}to connect anywhere.
              </div>
            )}
          </div>
        )}

    </div>
  );
}
