import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import {
  Settings, Link as LinkIcon, Copy, Check, ExternalLink,
  Shield, Database, Lock, AlertTriangle, Square, RefreshCw, Smartphone,
  Layers, Layout, ShieldCheck, Rocket, Zap, Radio, Lightbulb, Code2, Server, SlidersHorizontal,
  Radar, Cpu, Globe, Sparkles
} from 'lucide-react';
import { TunnelAPI, SystemAPI, StorageAPI } from '../../services/api';

const ERP_LAUNCHERS = [
  // Pega Systems
  { category: 'pega', label: 'Pega PRWeb', path: '/prweb', desc: 'Standard User & Admin Portal' },
  { category: 'pega', label: 'Pega PRServlet', path: '/prweb/PRServlet', desc: 'Servlet Direct Engine' },
  { category: 'pega', label: 'Pega PRAuth (SSO)', path: '/prweb/PRAuth', desc: 'Authentication & SSO' },
  
  // SAP Enterprise
  { category: 'sap', label: 'SAP Web GUI', path: '/sap/bc/gui/sap/its/webgui', desc: 'SAP GUI for HTML' },
  { category: 'sap', label: 'SAP Fiori Launchpad', path: '/sap/bc/ui5_ui5/ui2/ushell/shells/abap/FioriLaunchpad.html', desc: 'Fiori Modern Workspace' },
  { category: 'sap', label: 'SAP NetWeaver ICF', path: '/sap/bc', desc: 'Internet Communication Framework' },

  // Oracle Enterprise
  { category: 'oracle', label: 'Oracle APEX / ORDS', path: '/ords', desc: 'REST Data Services & APEX' },
  { category: 'oracle', label: 'Oracle EBS Login', path: '/OA_HTML/AppsLocalLogin.jsp', desc: 'E-Business Suite Login' },

  // Microsoft Dynamics
  { category: 'dynamics', label: 'Business Central', path: '/BC210', desc: 'Dynamics 365 Web Client' },
  { category: 'dynamics', label: 'Dynamics NAV Web', path: '/Nav', desc: 'Classic NAV Web Client' },

  // Odoo & Frappe
  { category: 'odoo_frappe', label: 'Odoo Web Desk', path: '/web', desc: 'Main Odoo Interface' },
  { category: 'odoo_frappe', label: 'Odoo Login', path: '/web/login', desc: 'Direct Authentication' },
  { category: 'odoo_frappe', label: 'Frappe / ERPNext App', path: '/app', desc: 'ERPNext Workspace' },
  { category: 'odoo_frappe', label: 'Frappe Desk', path: '/desk', desc: 'Desk Portal Interface' },

  // OFBiz & Others
  { category: 'ofbiz_others', label: 'Apache OFBiz OrderMgr', path: '/ordermgr', desc: 'Order Management ERP' },
  { category: 'ofbiz_others', label: 'Apache OFBiz Accounting', path: '/accounting', desc: 'Financial Module' },
  { category: 'ofbiz_others', label: 'Dolibarr ERP / CRM', path: '/htdocs', desc: 'Dolibarr Main Directory' },
  { category: 'ofbiz_others', label: 'Metasfresh WebUI', path: '/webui', desc: 'Metasfresh Open Source ERP' },

  // Standard Web & Microservices
  { category: 'web', label: 'Root (/)', path: '/', desc: 'Base Homepage' },
  { category: 'web', label: 'Admin Console (/admin)', path: '/admin', desc: 'Django / Laravel / Spring Admin' },
  { category: 'web', label: 'API Root (/api)', path: '/api', desc: 'Backend REST API' },
  { category: 'web', label: 'Swagger UI (/swagger-ui.html)', path: '/swagger-ui.html', desc: 'API Documentation' },
  { category: 'web', label: 'Actuator (/actuator)', path: '/actuator', desc: 'Spring Boot Health / Metrics' }
];

const ERP_CATEGORIES = [
  { id: 'all', label: 'All ERPs' },
  { id: 'pega', label: 'Pega' },
  { id: 'sap', label: 'SAP' },
  { id: 'oracle', label: 'Oracle' },
  { id: 'dynamics', label: 'MS Dynamics' },
  { id: 'odoo_frappe', label: 'Odoo & Frappe' },
  { id: 'ofbiz_others', label: 'OFBiz / Dolibarr' },
  { id: 'web', label: 'Web & APIs' }
];

export default function SharePortView({ tunnelState, logs, setLogs }) {
  // Target Mode: 'fullstack' (Full-Stack), 'frontend' (Frontend Only), 'backend' (Backend Only)
  const [targetMode, setTargetMode] = useState('fullstack');
  const [frontendPort, setFrontendPort] = useState(3000);
  const [backendPort, setBackendPort] = useState(8000);

  // Connection Engine: 'cloudflare' (Auto High-Speed), 'localhost_run' (Fast Direct), 'serveo' (Secure Line)
  const [engine] = useState('cloudflare');

  // Traffic Inspector toggle (Default: ON)
  const [enableInspector, setEnableInspector] = useState(true);

  // Custom port toggles
  const [customFrontend, setCustomFrontend] = useState(false);
  const [customBackend, setCustomBackend] = useState(false);

  // Active port detection state (Manual on-demand scan)
  const [activePorts, setActivePorts] = useState([]);
  const [isScanning, setIsScanning] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);

  // ERP Launcher & custom path states
  const [selectedErpCategory, setSelectedErpCategory] = useState('all');
  const [customLauncherPath, setCustomLauncherPath] = useState('');

  // Subdomain & state
  const [subdomain, setSubdomain] = useState('');
  const [copied, setCopied] = useState(false);
  const qrCanvasRef = useRef(null);

  const isConnected = tunnelState && tunnelState.status === 'CONNECTED';
  const isStarting = tunnelState && tunnelState.status === 'STARTING';
  const publicUrl = tunnelState?.publicUrl || '';

  // Manual scan running ports on the user's machine on demand
  const handleScanPorts = async () => {
    setIsScanning(true);
    try {
      const found = await SystemAPI.scanPorts();
      setActivePorts(found || []);
      setHasScanned(true);
    } catch (e) {
      console.warn('Failed to scan active ports:', e);
    } finally {
      setIsScanning(false);
    }
  };

  // Helper to open public URL with deep-link ERP paths
  const handleLaunchPath = (path) => {
    if (!publicUrl) return;
    const cleanBase = publicUrl.replace(/\/+$/, '');
    const cleanPath = path ? (path.startsWith('/') ? path : '/' + path) : '';
    SystemAPI.openExternal(cleanBase + cleanPath);
  };

  // Load saved configurations without auto-scanning
  useEffect(() => {
    async function load() {
      const cfg = await StorageAPI.getConfig();
      if (cfg) {
        if (cfg.default_port) setFrontendPort(cfg.default_port);
        if (cfg.last_used_subdomain) setSubdomain(cfg.last_used_subdomain);
        if (cfg.default_engine) {
          setEngine(cfg.default_engine);
        } else {
          setEngine('cloudflare');
        }
      }
    }
    load();
    // Intentionally no auto-scan on mount: User clicks button on demand
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
          justifyContent: 'flex-start',
          gap: '20px',
          boxSizing: 'border-box'
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
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
                  Universal support for Pega PRWeb, ERPs, and any server port
                </p>
              </div>
            </div>

            {/* On-Demand Port Scanner (Informational Only) */}
            <div style={{
              background: '#F8FAFC',
              border: '1.5px solid #E2E8F0',
              borderRadius: '16px',
              padding: '16px 18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{
                    width: '30px',
                    height: '30px',
                    borderRadius: '8px',
                    background: '#E0F2FE',
                    color: '#0284C7',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <Radar size={17} className={isScanning ? 'spin' : ''} />
                  </div>
                  <div>
                    <span style={{ fontSize: '13.5px', fontWeight: '800', color: '#0F172A' }}>
                      Port Availability Scanner
                    </span>
                    <span style={{ fontSize: '11px', color: '#64748B', marginLeft: '6px' }}>
                      (Know which ports are running)
                    </span>
                  </div>
                  {hasScanned && activePorts.length > 0 && (
                    <span style={{
                      background: '#DCFCE7',
                      color: '#15803D',
                      fontSize: '11px',
                      fontWeight: '800',
                      padding: '2px 8px',
                      borderRadius: '12px'
                    }}>
                      {activePorts.length} running
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleScanPorts}
                  disabled={isScanning || isConnected || isStarting}
                  style={{
                    background: '#0284C7',
                    border: 'none',
                    borderRadius: '9px',
                    padding: '7px 14px',
                    fontSize: '12px',
                    fontWeight: '700',
                    color: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    cursor: (isScanning || isConnected || isStarting) ? 'not-allowed' : 'pointer',
                    boxShadow: '0 2px 4px rgba(2, 132, 199, 0.25)',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <RefreshCw size={13} className={isScanning ? 'spin' : ''} />
                  <span>{isScanning ? 'Scanning Ports...' : 'Scan Running Ports'}</span>
                </button>
              </div>

              {isScanning ? (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '12px',
                  color: '#0284C7',
                  background: '#F0F9FF',
                  padding: '8px 12px',
                  borderRadius: '8px'
                }}>
                  <RefreshCw size={13} className="spin" />
                  <span>Scanning localhost for active servers and ERP instances (Pega, SAP, Oracle, Odoo, Frappe, etc.)...</span>
                </div>
              ) : hasScanned ? (
                activePorts.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {activePorts.map(item => (
                        <div
                          key={item.port}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            background: '#F0FDF4',
                            color: '#166534',
                            border: '1.5px solid #BBF7D0',
                            borderRadius: '8px',
                            padding: '6px 12px',
                            fontSize: '12px',
                            fontWeight: '700',
                            cursor: 'default',
                            userSelect: 'text'
                          }}
                        >
                          <span style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: '#16A34A',
                            boxShadow: '0 0 0 2px rgba(22, 163, 74, 0.25)',
                            flexShrink: 0
                          }} />
                          <span style={{ color: '#0F172A', fontWeight: '800' }}>Port {item.port}</span>
                          <span style={{ opacity: 0.85, fontSize: '11px', fontWeight: '600' }}>({item.label})</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize: '11.5px', color: '#64748B' }}>
                      ℹ️ Informational only: Detected running ports on your machine are shown above. Enter or select your desired port in the Target Port settings below.
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: '12px', color: '#64748B', background: '#F1F5F9', padding: '8px 12px', borderRadius: '8px' }}>
                    No running servers detected on common ports. If your server or ERP is running, verify its port or enter the custom port number directly below.
                  </div>
                )
              ) : (
                <div style={{ fontSize: '12px', color: '#64748B', background: '#F8FAFC', border: '1px dashed #CBD5E1', padding: '8px 12px', borderRadius: '8px' }}>
                  💡 Click <strong>"Scan Running Ports"</strong> above to see which local ports and ERP servers are currently running on your machine.
                </div>
              )}
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
                    Primary Server Port
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
                    {customFrontend ? 'Presets' : '✏️ Custom Port'}
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
                      placeholder="e.g. 8080 or any port"
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
                      <option value={8080}>8080 (Pega PRWeb / Tomcat / Java)</option>
                      <option value={8069}>8069 (Odoo ERP)</option>
                      <option value={8000}>8000 (Frappe / ERPNext / Django)</option>
                      <option value={50000}>50000 (SAP NetWeaver / SAP Web GUI)</option>
                      <option value={7001}>7001 (Oracle WebLogic / EBS / APEX)</option>
                      <option value={7080}>7080 (MS Dynamics 365 / Business Central)</option>
                      <option value={8088}>8088 (Apache OFBiz ERP)</option>
                      <option value={8085}>8085 (Metasfresh ERP)</option>
                      <option value={9080}>9080 (Pega PRPC / IBM WebSphere)</option>
                      <option value={80}>80 (HTTP / Dolibarr / Apache / Nginx)</option>
                      <option value={3000}>3000 (React / Next.js / Node.js)</option>
                      <option value={5173}>5173 (Vite / Vue / Svelte)</option>
                      <option value={4200}>4200 (Angular)</option>
                      <option value={5000}>5000 (Flask / Express / Python)</option>
                      <option value={8081}>8081 (Microservices / Spring Boot)</option>
                      <option value={9090}>9090 (Spring Boot Actuator / Prometheus)</option>
                      <option value={3001}>3001 (NestJS / Backend API)</option>
                      <option value={8443}>8443 (HTTPS Enterprise Tomcat)</option>
                      <option value="custom">✏️ Enter Custom Port (1-65535)...</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Backend Port */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: '800', color: '#1E293B' }}>
                    Secondary / API Port
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
                    {customBackend ? 'Presets' : '✏️ Custom Port'}
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
                      <option value={8000}>8000 (Frappe / ERPNext / Django / Python)</option>
                      <option value={8080}>8080 (Pega PRWeb / Tomcat / Java)</option>
                      <option value={8069}>8069 (Odoo ERP)</option>
                      <option value={50000}>50000 (SAP NetWeaver / SAP Web GUI)</option>
                      <option value={7001}>7001 (Oracle WebLogic / EBS / APEX)</option>
                      <option value={7080}>7080 (MS Dynamics 365 / Business Central)</option>
                      <option value={8088}>8088 (Apache OFBiz ERP)</option>
                      <option value={8085}>8085 (Metasfresh ERP)</option>
                      <option value={9080}>9080 (Pega PRPC / IBM WebSphere)</option>
                      <option value={80}>80 (HTTP / Dolibarr / Apache / Nginx)</option>
                      <option value={8081}>8081 (Microservices / Spring Boot)</option>
                      <option value={5000}>5000 (Flask / Express / Python)</option>
                      <option value={3001}>3001 (Node.js / NestJS)</option>
                      <option value={9090}>9090 (Spring Boot / Prometheus)</option>
                      <option value={8443}>8443 (HTTPS Enterprise Tomcat)</option>
                      <option value="custom">✏️ Enter Custom Port (1-65535)...</option>
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
                <div>
                  <span style={{ fontSize: '13.5px', fontWeight: '800', color: '#0F172A' }}>
                    Enable Live Traffic Inspector
                  </span>
                  <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: '#64748B' }}>
                    Inspect requests, cookies, and headers in real-time
                  </p>
                </div>
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
              <span>Make sure your local server (Pega, Odoo, Frappe, etc.) is running on your selected port.</span>
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
                marginTop: '16px'
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
                marginTop: '16px'
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', flex: 1 }}>
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

            {/* 1-Click ERP & Technology Launchers + Custom Path */}
            {publicUrl && (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                background: '#F8FAFC',
                border: '1.5px solid #E2E8F0',
                borderRadius: '16px',
                padding: '14px 16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
                  <div style={{ fontSize: '12.5px', fontWeight: '800', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>🚀</span>
                    <span>1-Click ERP & Technology Launchers:</span>
                  </div>
                  <span style={{ fontSize: '11px', color: '#0D9488', fontWeight: '700' }}>
                    Universal ERP & Port Support
                  </span>
                </div>

                {/* ERP Category Filter Tabs */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {ERP_CATEGORIES.map(cat => {
                    const isSelected = selectedErpCategory === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setSelectedErpCategory(cat.id)}
                        style={{
                          padding: '3px 9px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: '700',
                          border: isSelected ? '1px solid #0D9488' : '1px solid #E2E8F0',
                          background: isSelected ? '#0D9488' : '#FFFFFF',
                          color: isSelected ? '#FFFFFF' : '#64748B',
                          cursor: 'pointer',
                          transition: 'all 0.1s ease'
                        }}
                      >
                        {cat.label}
                      </button>
                    );
                  })}
                </div>

                {/* Launchers Button Chips */}
                <div style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '6px',
                  maxHeight: '130px',
                  overflowY: 'auto',
                  paddingRight: '2px'
                }}>
                  {ERP_LAUNCHERS
                    .filter(item => selectedErpCategory === 'all' || item.category === selectedErpCategory)
                    .map(item => (
                      <button
                        key={item.path}
                        type="button"
                        onClick={() => handleLaunchPath(item.path)}
                        title={`${item.label} (${item.path}): ${item.desc}`}
                        style={{
                          background: '#FFFFFF',
                          border: '1px solid #CBD5E1',
                          borderRadius: '8px',
                          padding: '5px 9px',
                          fontSize: '11.5px',
                          fontWeight: '700',
                          color: '#0F172A',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                          transition: 'all 0.1s ease'
                        }}
                      >
                        <ExternalLink size={11} style={{ color: '#0D9488' }} />
                        <span>{item.label}</span>
                        <span style={{ fontSize: '10px', color: '#64748B', fontFamily: 'monospace' }}>{item.path}</span>
                      </button>
                    ))}
                </div>

                {/* Custom Deep-Link ERP Path Launcher */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: '#FFFFFF',
                  border: '1.5px solid #CBD5E1',
                  borderRadius: '10px',
                  padding: '3px 6px',
                  marginTop: '2px'
                }}>
                  <span style={{ fontSize: '12px', color: '#94A3B8', paddingLeft: '6px', fontFamily: 'monospace', fontWeight: '700' }}>
                    /
                  </span>
                  <input
                    type="text"
                    placeholder="Enter any custom ERP path (e.g. /my-erp/login, /console)..."
                    value={customLauncherPath}
                    onChange={e => setCustomLauncherPath(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && customLauncherPath.trim()) {
                        handleLaunchPath(customLauncherPath.trim());
                      }
                    }}
                    style={{
                      flex: 1,
                      border: 'none',
                      outline: 'none',
                      fontSize: '12px',
                      fontWeight: '600',
                      color: '#0F172A',
                      background: 'transparent'
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => customLauncherPath.trim() && handleLaunchPath(customLauncherPath.trim())}
                    disabled={!customLauncherPath.trim()}
                    style={{
                      background: customLauncherPath.trim() ? '#0D9488' : '#F1F5F9',
                      color: customLauncherPath.trim() ? '#FFFFFF' : '#94A3B8',
                      border: 'none',
                      borderRadius: '7px',
                      padding: '5px 12px',
                      fontSize: '11.5px',
                      fontWeight: '700',
                      cursor: customLauncherPath.trim() ? 'pointer' : 'default',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <span>Launch</span>
                    <ExternalLink size={11} />
                  </button>
                </div>
              </div>
            )}

            {/* Mobile QR Code Box */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '24px 20px',
              background: '#FFFFFF',
              border: '2px dashed #DDD6FE',
              borderRadius: '18px',
              minHeight: '240px',
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
                    width: '64px',
                    height: '64px',
                    borderRadius: '50%',
                    background: '#F3E8FF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#8B5CF6'
                  }}>
                    <Smartphone size={32} />
                  </div>
                  <div style={{ fontSize: '16px', fontWeight: '800', color: '#6D28D9', marginTop: '4px' }}>
                    Mobile QR Code
                  </div>
                  <p style={{ margin: 0, fontSize: '12.5px', color: '#64748B', maxWidth: '280px' }}>
                    Scan to open on any mobile device or external browser instantly
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Enterprise Compatibility Assurance Badge */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: '10px',
            padding: '8px 12px',
            fontSize: '11.5px',
            color: '#475569'
          }}>
            <Sparkles size={15} style={{ color: '#0D9488', flexShrink: 0 }} />
            <span>
              <strong>100% Universal Compatibility:</strong> Pega PRWeb, Odoo, Frappe, Spring Boot, Node, and any server port.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
