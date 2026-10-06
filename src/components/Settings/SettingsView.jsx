import React, { useState, useEffect } from 'react';
import { Settings, Save, Trash2, RefreshCw, Check, ShieldCheck, Globe, Cpu } from 'lucide-react';
import { StorageAPI, SystemAPI } from '../../services/api';

export default function SettingsView() {
  const [config, setConfig] = useState({
    default_engine: 'cloudflare',
    default_port: 3000,
    subdomain_mode: 'fixed',
    auto_copy_url: true,
    enable_inspector: true,
    port_subdomain_map: {}
  });
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [updateStatus, setUpdateStatus] = useState(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  useEffect(() => {
    async function load() {
      const cfg = await StorageAPI.getConfig();
      if (cfg) setConfig(cfg);
    }
    load();
  }, []);

  const handleSave = async () => {
    for (const [k, v] of Object.entries(config)) {
      await StorageAPI.setConfig(k, v);
    }
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  const handleDeletePortMapping = async (portKey) => {
    const updatedMap = { ...config.port_subdomain_map };
    delete updatedMap[portKey];
    setConfig({ ...config, port_subdomain_map: updatedMap });
    await StorageAPI.setConfig('port_subdomain_map', updatedMap);
  };

  return (
    <div style={{ maxWidth: '840px', margin: '0 auto', padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: '28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
        <div>
          <h2 style={{ fontSize: '22px', fontWeight: '800', color: 'var(--text-main)' }}>Preferences & Configuration</h2>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Manage default tunnel engines and saved fixed subdomain mappings</p>
        </div>

        <button
          onClick={handleSave}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: savedSuccess ? '#0F766E' : '#0D9488',
            color: '#fff',
            padding: '10px 18px',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: '700'
          }}
        >
          {savedSuccess ? <Check size={16} /> : <Save size={16} />}
          <span>{savedSuccess ? 'Saved' : 'Save Changes'}</span>
        </button>
      </div>

      {/* General Settings */}
      <div className="sp-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: '800', color: 'var(--text-main)' }}>Default Tunnel Settings</h3>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase' }}>
              Default Engine
            </label>
            <select
              value={config.default_engine || 'cloudflare'}
              onChange={(e) => setConfig({ ...config, default_engine: e.target.value })}
              style={{ width: '100%', padding: '10px 14px', fontSize: '13px', border: '1px solid var(--border)' }}
            >
              <option value="cloudflare">Auto High-Speed (Recommended)</option>
              <option value="serveo">Fast Direct Relay</option>
              <option value="localhost_run">Secure Edge Line</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase' }}>
              Default Local Port
            </label>
            <input
              type="number"
              value={config.default_port || 3000}
              onChange={(e) => setConfig({ ...config, default_port: parseInt(e.target.value) || 3000 })}
              style={{ width: '100%', padding: '10px 14px', fontSize: '13px', border: '1px solid var(--border)' }}
            />
          </div>
        </div>

        {/* Toggles */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '8px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: 'var(--text-main)', cursor: 'pointer', fontWeight: '600' }}>
            <input
              type="checkbox"
              checked={Boolean(config.auto_copy_url)}
              onChange={(e) => setConfig({ ...config, auto_copy_url: e.target.checked })}
            />
            <span>Auto-copy public link to clipboard upon tunnel startup</span>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: 'var(--text-main)', cursor: 'pointer', fontWeight: '600' }}>
            <input
              type="checkbox"
              checked={Boolean(config.enable_inspector)}
              onChange={(e) => setConfig({ ...config, enable_inspector: e.target.checked })}
            />
            <span>Enable Live HTTP Traffic Inspector proxy by default</span>
          </label>
        </div>
      </div>

      {/* Port to Subdomain Mappings */}
      <div className="sp-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: '800', color: 'var(--text-main)' }}>Fixed Subdomain Mappings</h3>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
          Fixed subdomains automatically remembered for each local development port.
        </p>

        {Object.keys(config.port_subdomain_map || {}).length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '13px' }}>
            No mapped ports yet. Subdomains are automatically saved when you start a tunnel.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {Object.entries(config.port_subdomain_map).map(([port, slug]) => (
              <div
                key={port}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  background: '#FAF8FD',
                  borderRadius: '8px',
                  border: '1px solid var(--border)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '11px', fontWeight: '800', padding: '2px 8px', borderRadius: '4px', background: '#EDE6FA', color: '#6D28D9' }}>
                    Port {port}
                  </span>
                  <span className="font-mono" style={{ color: 'var(--text-main)', fontSize: '13px' }}>{slug}.shareport.link</span>
                </div>
                <button
                  onClick={() => handleDeletePortMapping(port)}
                  style={{ background: 'transparent', color: 'var(--text-dim)' }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
