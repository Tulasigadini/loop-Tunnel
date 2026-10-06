import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import {
  Settings, Link as LinkIcon, Copy, Check, ExternalLink,
  Shield, Database, Lock, AlertTriangle, Square, RefreshCw, Smartphone,
  Layers, Layout, ShieldCheck, Rocket, Zap, Radio, Lightbulb, Code2, Server, SlidersHorizontal
} from 'lucide-react';
import { TunnelAPI, SystemAPI, StorageAPI } from '../../services/api';

export default function SharePortView({ tunnelState, logs, setLogs, onReplayInApiTesting }) {
  // Target Mode: 'fullstack' (Full-Stack), 'frontend' (Frontend Only), 'backend' (Backend Only)
  const [targetMode, setTargetMode] = useState('fullstack');
  const [frontendPort, setFrontendPort] = useState(3000);
  const [backendPort, setBackendPort] = useState(8000);

  // Connection Engine: 'cloudflare' (Auto High-Speed), 'localhost_run' (Fast Direct), 'serveo' (Secure Line)
  const [engine, setEngine] = useState('cloudflare');

  // Traffic Inspector toggle (Default: OFF)
  const [enableInspector, setEnableInspector] = useState(false);

  // Custom port toggles
  const [customFrontend, setCustomFrontend] = useState(false);
  const [customBackend, setCustomBackend] = useState(false);

  // Subdomain & state
  const [subdomain, setSubdomain] = useState('');
  const [copied, setCopied] = useState(false);
  const qrCanvasRef = useRef(null);

  const isConnected = tunnelState && tunnelState.status === 'CONNECTED';
  const isStarting = tunnelState && tunnelState.status === 'STARTING';
  const publicUrl = tunnelState?.publicUrl || '';

  // Load saved configurations
  useEffect(() => {
    async function load() {
      const cfg = await StorageAPI.getConfig();
      if (cfg) {
        if (cfg.default_port) setFrontendPort(cfg.default_port);
        if (cfg.last_used_subdomain) setSubdomain(cfg.last_used_subdomain);
      }
    }
    load();
  }, []);

  // Draw QR code on canvas whenever public URL is active
  useEffect(() => {
    if (qrCanvasRef.current && publicUrl) {
      QRCode.toCanvas(qrCanvasRef.current, publicUrl, {
        width: 190,
        margin: 1,
        color: {
          dark: '#0F172A',
          light: '#FFFFFF'
        }
      });
    }
  }, [publicUrl, isConnected]);

  const handleStartTunnel = async () => {
    const activePort = targetMode === 'backend' ? backendPort : frontendPort;
    const isFullstack = targetMode === 'fullstack';

    const providerMap = {
      'serveo': 'serveo',
      'localhost_run': 'localhost_run',
      'cloudflare': 'cloudflare'
    };

    await TunnelAPI.start({
      port: activePort,
      provider: providerMap[engine] || 'cloudflare',
      mode: 'fixed',
      subdomain: subdomain || `dev-app-${activePort}`,
      enableInspector,
      enableFullstack: isFullstack,
      backendPort: backendPort
    });
  };

  const handleStopTunnel = async () => {
    await TunnelAPI.stop();
  };

  const handleCopy = async () => {
    if (publicUrl) {
      await SystemAPI.copyText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div style={{
      width: '100%',
      minHeight: 'calc(100vh - 46px)',
      flex: 1,
      padding: '24px 36px',
      display: 'flex',
      flexDirection: 'column',
      gap: '20px',
      background: '#FFFFFF',
      boxSizing: 'border-box'
    }}>
      {/* 2-Column Full-Width & Full-Height Responsive Layout */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))',
        gridTemplateRows: '1fr',
        gap: '24px',
        width: '100%',
        flex: 1,
        alignItems: 'stretch'
      }}>
        {/* LEFT COLUMN: Tunnel Settings */}
        <div style={{
          background: '#FFFFFF',
          border: '1.5px solid #E2E8F0',
          borderRadius: '24px',
          padding: '32px',
          boxShadow: 'var(--shadow-sm)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: '22px',
          height: '100%',
          boxSizing: 'border-box'
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
            {/* Header with Mint Gear Badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{
                width: '52px',
                height: '52px',
                borderRadius: '50%',
                background: '#E6FAF5',
                border: '1.5px solid #A7F3D0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#10B981',
                flexShrink: 0
              }}>
                <Settings size={26} />
              </div>
              <div>
                <h2 style={{ fontSize: '22px', fontWeight: '800', color: '#0F172A', margin: 0, letterSpacing: '-0.4px' }}>
                  Tunnel Settings
                </h2>
                <p style={{ fontSize: '13.5px', color: '#64748B', margin: '3px 0 0 0' }}>
                  Configure your local server and share in seconds
                </p>
              </div>
            </div>

            {/* Target Mode Segmented Buttons */}
            <div>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: '800', color: '#0D9488', marginBottom: '8px' }}>
                Target Mode
              </label>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: '8px'
              }}>
                {[
                  { id: 'fullstack', label: 'Full-Stack', icon: Layers },
                  { id: 'frontend', label: 'Frontend Only', icon: Layout },
                  { id: 'backend', label: 'Backend Only', icon: ShieldCheck }
                ].map(item => {
                  const IconComp = item.icon;
                  const isSelected = targetMode === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setTargetMode(item.id)}
                      disabled={isConnected || isStarting}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        padding: '13px 12px',
                        borderRadius: '12px',
                        fontSize: '13px',
                        fontWeight: '700',
                        background: isSelected ? '#14B8A6' : '#FFFFFF',
                        color: isSelected ? '#FFFFFF' : '#475569',
                        border: isSelected ? '1px solid #0D9488' : '1.5px solid #E2E8F0',
                        boxShadow: isSelected ? '0 2px 8px rgba(20, 184, 166, 0.3)' : 'none',
                        cursor: (isConnected || isStarting) ? 'not-allowed' : 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <IconComp size={16} />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Ports Enclosed Box (Frontend Port & Backend Port) */}
            <div style={{
              background: '#FFFFFF',
              border: '1.5px solid #E2E8F0',
              borderRadius: '16px',
              padding: '18px 20px',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '16px'
            }}>
              {/* Frontend Port */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: '800', color: '#1E293B' }}>
                    Frontend Port
                  </label>
                  <button
                    type="button"
                    onClick={() => setCustomFrontend(!customFrontend)}
                    disabled={isConnected || isStarting || targetMode === 'backend'}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#0D9488',
                      fontSize: '11.5px',
                      fontWeight: '700',
                      cursor: 'pointer',
                      padding: 0
                    }}
                  >
                    {customFrontend ? 'Presets' : 'Custom'}
                  </button>
                </div>

                {customFrontend ? (
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <input
                      type="number"
                      min="1"
                      max="65535"
                      value={frontendPort || ''}
                      onChange={e => setFrontendPort(parseInt(e.target.value) || '')}
                      placeholder="e.g. 8080"
                      disabled={isConnected || isStarting || targetMode === 'backend'}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '10px',
                        border: '1.5px solid #CBD5E1',
                        background: '#FFFFFF',
                        color: '#0F172A',
                        fontSize: '13.5px',
                        fontWeight: '700',
                        opacity: targetMode === 'backend' ? 0.5 : 1
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setCustomFrontend(false)}
                      disabled={isConnected || isStarting || targetMode === 'backend'}
                      style={{
                        padding: '8px 10px',
                        background: '#F1F5F9',
                        border: '1px solid #E2E8F0',
                        borderRadius: '10px',
                        fontSize: '11.5px',
                        fontWeight: '700',
                        color: '#64748B',
                        cursor: 'pointer'
                      }}
                    >
                      Presets
                    </button>
                  </div>
                ) : (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    background: '#FFFFFF',
                    border: '1.5px solid #CBD5E1',
                    borderRadius: '10px',
                    padding: '3px 10px',
                    gap: '8px',
                    opacity: targetMode === 'backend' ? 0.5 : 1
                  }}>
                    <Code2 size={16} style={{ color: '#0D9488', flexShrink: 0 }} />
                    <select
                      value={frontendPort}
                      onChange={e => {
                        if (e.target.value === 'custom') {
                          setCustomFrontend(true);
                        } else {
                          setFrontendPort(parseInt(e.target.value));
                        }
                      }}
                      disabled={isConnected || isStarting || targetMode === 'backend'}
                      style={{
                        width: '100%',
                        padding: '8px 4px',
                        border: 'none',
                        background: 'transparent',
                        color: '#0F172A',
                        fontSize: '12.5px',
                        fontWeight: '700',
                        outline: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      <option value={3000}>3000 (React, Next.js, etc.)</option>
                      <option value={5173}>5173 (Vite, Vue, etc.)</option>
                      <option value={8080}>8080 (Webpack, Dev Server, etc.)</option>
                      <option value={8000}>8000 (Python, Django, etc.)</option>
                      <option value={8069}>8069 (Odoo, ERPNext, etc.)</option>
                      <option value={5000}>5000 (Flask, Express, etc.)</option>
                      <option value={4200}>4200 (Angular, etc.)</option>
                      <option value="custom">✏️ Enter Custom Port...</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Backend Port */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: '800', color: '#1E293B' }}>
                    Backend Port
                  </label>
                  <button
                    type="button"
                    onClick={() => setCustomBackend(!customBackend)}
                    disabled={isConnected || isStarting || targetMode === 'frontend'}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#8B5CF6',
                      fontSize: '11.5px',
                      fontWeight: '700',
                      cursor: 'pointer',
                      padding: 0
                    }}
                  >
                    {customBackend ? 'Presets' : 'Custom'}
                  </button>
                </div>

                {customBackend ? (
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <input
                      type="number"
                      min="1"
                      max="65535"
                      value={backendPort || ''}
                      onChange={e => setBackendPort(parseInt(e.target.value) || '')}
                      placeholder="e.g. 8000"
                      disabled={isConnected || isStarting || targetMode === 'frontend'}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '10px',
                        border: '1.5px solid #CBD5E1',
                        background: '#FFFFFF',
                        color: '#0F172A',
                        fontSize: '13.5px',
                        fontWeight: '700',
                        opacity: targetMode === 'frontend' ? 0.5 : 1
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setCustomBackend(false)}
                      disabled={isConnected || isStarting || targetMode === 'frontend'}
                      style={{
                        padding: '8px 10px',
                        background: '#F1F5F9',
                        border: '1px solid #E2E8F0',
                        borderRadius: '10px',
                        fontSize: '11.5px',
                        fontWeight: '700',
                        color: '#64748B',
                        cursor: 'pointer'
                      }}
                    >
                      Presets
                    </button>
                  </div>
                ) : (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    background: '#FFFFFF',
                    border: '1.5px solid #CBD5E1',
                    borderRadius: '10px',
                    padding: '3px 10px',
                    gap: '8px',
                    opacity: targetMode === 'frontend' ? 0.5 : 1
                  }}>
                    <Server size={16} style={{ color: '#8B5CF6', flexShrink: 0 }} />
                    <select
                      value={backendPort}
                      onChange={e => {
                        if (e.target.value === 'custom') {
                          setCustomBackend(true);
                        } else {
                          setBackendPort(parseInt(e.target.value));
                        }
                      }}
                      disabled={isConnected || isStarting || targetMode === 'frontend'}
                      style={{
                        width: '100%',
                        padding: '8px 4px',
                        border: 'none',
                        background: 'transparent',
                        color: '#0F172A',
                        fontSize: '12.5px',
                        fontWeight: '700',
                        outline: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      <option value={8000}>8000 (Python, FastAPI, etc.)</option>
                      <option value={8080}>8080 (Java, Spring Boot, etc.)</option>
                      <option value={8081}>8081 (Microservices, etc.)</option>
                      <option value={5000}>5000 (Flask, Express, etc.)</option>
                      <option value={3001}>3001 (Node.js, NestJS, etc.)</option>
                      <option value={8069}>8069 (Odoo, ERPNext, etc.)</option>
                      <option value={9090}>9090 (Spring Boot, Prometheus, etc.)</option>
                      <option value="custom">✏️ Enter Custom Port...</option>
                    </select>
                  </div>
                )}
              </div>
            </div>

            {/* Connection Engine Segmented Buttons */}
            <div>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: '800', color: '#0D9488', marginBottom: '8px' }}>
                Connection Engine
              </label>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: '8px'
              }}>
                {[
                  { id: 'cloudflare', label: 'Auto High-Speed', icon: Rocket },
                  { id: 'localhost_run', label: 'Fast Direct', icon: Zap },
                  { id: 'serveo', label: 'Secure Line', icon: Lock }
                ].map(item => {
                  const IconComp = item.icon;
                  const isSelected = engine === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setEngine(item.id)}
                      disabled={isConnected || isStarting}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        padding: '13px 12px',
                        borderRadius: '12px',
                        fontSize: '13px',
                        fontWeight: '700',
                        background: isSelected ? '#F0FDFA' : '#FFFFFF',
                        color: isSelected ? '#0D9488' : '#475569',
                        border: isSelected ? '1.5px solid #99F6E4' : '1.5px solid #E2E8F0',
                        cursor: (isConnected || isStarting) ? 'not-allowed' : 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <IconComp size={15} style={{ color: isSelected ? '#0D9488' : '#64748B' }} />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Inspector Toggle Switch */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#F8FAFC',
              border: '1.5px solid #E2E8F0',
              borderRadius: '14px',
              padding: '12px 18px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: '#E6FAF5',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#10B981'
                }}>
                  <Radio size={17} />
                </div>
                <span style={{ fontSize: '13.5px', fontWeight: '800', color: '#0F172A' }}>
                  Enable Live Traffic Inspector
                </span>
              </div>

              <label style={{ position: 'relative', display: 'inline-block', width: '42px', height: '24px' }}>
                <input
                  type="checkbox"
                  checked={enableInspector}
                  onChange={e => setEnableInspector(e.target.checked)}
                  disabled={isConnected || isStarting}
                  style={{ opacity: 0, width: 0, height: 0 }}
                />
                <span style={{
                  position: 'absolute',
                  cursor: 'pointer',
                  top: 0, left: 0, right: 0, bottom: 0,
                  backgroundColor: enableInspector ? '#10B981' : '#CBD5E1',
                  borderRadius: '24px',
                  transition: '0.2s'
                }}>
                  <span style={{
                    position: 'absolute',
                    content: '""',
                    height: '18px',
                    width: '18px',
                    left: enableInspector ? '21px' : '3px',
                    bottom: '3px',
                    backgroundColor: 'white',
                    borderRadius: '50%',
                    transition: '0.2s'
                  }} />
                </span>
              </label>
            </div>

            {/* Localhost Verification Reminder Tip */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              background: '#F0FDFA',
              border: '1.5px solid #99F6E4',
              borderRadius: '12px',
              padding: '11px 16px',
              color: '#0F766E',
              fontSize: '13px',
              fontWeight: '600'
            }}>
              <Lightbulb size={17} style={{ color: '#0D9488', flexShrink: 0 }} />
              <span>Make sure your selected ports are running in local host.</span>
            </div>
          </div>

          {/* Big Start / Stop Action Button */}
          {!isConnected ? (
            <button
              onClick={handleStartTunnel}
              disabled={isStarting}
              style={{
                width: '100%',
                padding: '15px',
                borderRadius: '14px',
                background: '#14B8A6',
                color: '#FFFFFF',
                fontSize: '16px',
                fontWeight: '800',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                border: 'none',
                cursor: isStarting ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 16px rgba(20, 184, 166, 0.35)',
                opacity: isStarting ? 0.7 : 1,
                transition: 'all 0.15s ease',
                marginTop: '10px'
              }}
            >
              {isStarting ? (
                <>
                  <RefreshCw size={20} className="spin" />
                  <span>Starting Tunnel...</span>
                </>
              ) : (
                <>
                  <Rocket size={20} />
                  <span>Start Tunnel</span>
                </>
              )}
            </button>
          ) : (
            <button
              onClick={handleStopTunnel}
              style={{
                width: '100%',
                padding: '15px',
                borderRadius: '14px',
                background: '#E11D48',
                color: '#FFFFFF',
                fontSize: '16px',
                fontWeight: '800',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(225, 29, 72, 0.35)',
                marginTop: '10px'
              }}
            >
              <Square size={18} fill="#FFFFFF" />
              <span>Stop Tunnel</span>
            </button>
          )}
        </div>

        {/* RIGHT COLUMN: Share Your App */}
        <div style={{
          background: '#FFFFFF',
          border: '1.5px solid #E2E8F0',
          borderRadius: '24px',
          padding: '32px',
          boxShadow: 'var(--shadow-sm)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: '20px',
          height: '100%',
          boxSizing: 'border-box'
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', flex: 1 }}>
            {/* Header with Lavender Link Badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{
                width: '52px',
                height: '52px',
                borderRadius: '50%',
                background: '#EDE9FE',
                border: '1.5px solid #DDD6FE',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#8B5CF6',
                flexShrink: 0
              }}>
                <LinkIcon size={26} />
              </div>
              <div>
                <h2 style={{ fontSize: '22px', fontWeight: '800', color: '#0F172A', margin: 0, letterSpacing: '-0.4px' }}>
                  Share Your App
                </h2>
                <p style={{ fontSize: '13.5px', color: '#64748B', margin: '3px 0 0 0' }}>
                  Your live public HTTPS tunnel link will appear here
                </p>
              </div>
            </div>

            {/* Public Link Dashed Container */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              background: '#FAFAFE',
              border: '2px dashed #DDD6FE',
              borderRadius: '16px',
              padding: '8px 12px',
              gap: '10px'
            }}>
              <input
                type="text"
                readOnly
                value={publicUrl || 'https://your-tunnel.shareport.app'}
                className="font-mono"
                style={{
                  flex: 1,
                  border: 'none',
                  background: 'transparent',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: publicUrl ? '#0F766E' : '#94A3B8',
                  outline: 'none',
                  padding: '8px 8px'
                }}
              />
              <button
                onClick={handleCopy}
                disabled={!publicUrl}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: publicUrl ? '#FFFFFF' : '#F1F5F9',
                  color: publicUrl ? '#7C3AED' : '#94A3B8',
                  border: publicUrl ? '1.5px solid #C4B5FD' : '1px solid #E2E8F0',
                  borderRadius: '10px',
                  padding: '8px 16px',
                  fontSize: '13px',
                  fontWeight: '700',
                  cursor: publicUrl ? 'pointer' : 'default',
                  boxShadow: publicUrl ? '0 1px 3px rgba(124, 58, 237, 0.1)' : 'none'
                }}
              >
                {copied ? <Check size={15} style={{ color: '#10B981' }} /> : <Copy size={15} />}
                <span>{copied ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>

            {/* Open In Browser Action Button */}
            <button
              onClick={() => publicUrl && SystemAPI.openExternal(publicUrl)}
              disabled={!publicUrl}
              style={{
                width: '100%',
                padding: '13px',
                borderRadius: '12px',
                background: '#F0FDF4',
                border: '1.5px solid #BBF7D0',
                color: publicUrl ? '#16A34A' : '#94A3B8',
                fontSize: '14px',
                fontWeight: '800',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                cursor: publicUrl ? 'pointer' : 'default',
                transition: 'all 0.15s ease'
              }}
            >
              <ExternalLink size={17} />
              <span>Open in Browser</span>
            </button>

            {/* Mobile QR Code Box (Dashed Purple Border - Stretches vertically) */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '28px 24px',
              background: '#FFFFFF',
              border: '2px dashed #DDD6FE',
              borderRadius: '18px',
              minHeight: '280px',
              flex: 1,
              textAlign: 'center'
            }}>
              {publicUrl ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                  <canvas ref={qrCanvasRef} style={{ borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }} />
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '13px',
                    color: '#6D28D9',
                    fontWeight: '800',
                    background: '#F5F3FF',
                    padding: '4px 12px',
                    borderRadius: '20px'
                  }}>
                    <Smartphone size={15} />
                    <span>Scan with mobile to test live</span>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '72px',
                    height: '72px',
                    borderRadius: '50%',
                    background: '#F3E8FF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#8B5CF6'
                  }}>
                    <Smartphone size={36} />
                  </div>
                  <div style={{ fontSize: '17px', fontWeight: '800', color: '#6D28D9', marginTop: '4px' }}>
                    Mobile QR Code
                  </div>
                  <p style={{ margin: 0, fontSize: '13px', color: '#64748B', maxWidth: '280px' }}>
                    Scan to open on any mobile device or external browser instantly
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Helpful Tip */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '12.5px',
            color: '#64748B',
            fontStyle: 'italic',
            padding: '4px 2px'
          }}>
            <Lightbulb size={17} style={{ color: '#8B5CF6', flexShrink: 0 }} />
            <span>Make sure your local servers are running on the selected ports.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
