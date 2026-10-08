import React, { useState, useEffect } from 'react';
import { Radio, Send, Home, Activity, Star, Terminal, Info, Users, ExternalLink, Copy, Check, Globe, Minus, Square, X } from 'lucide-react';
import { SystemAPI, WindowAPI } from '../services/api';
import logoImg from '../assets/logo.png';

export default function Navbar({ activeTab, setActiveTab, tunnelState }) {
  const [copied, setCopied] = useState(false);
  const [isMax, setIsMax] = useState(false);

  const isConnected = tunnelState && tunnelState.status === 'CONNECTED';

  useEffect(() => {
    WindowAPI.isMaximized().then(max => setIsMax(Boolean(max)));
    const unsubscribe = WindowAPI.onMaximizeChange(max => setIsMax(Boolean(max)));
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const handleCopyUrl = async () => {
    if (tunnelState.publicUrl) {
      await SystemAPI.copyText(tunnelState.publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const navItems = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'shareport', label: 'Tunnel Setup', icon: Radio },
    { id: 'apitesting', label: 'API Testing', icon: Send },
    { id: 'inspector', label: 'Traffic Inspector', icon: Activity },
    { id: 'profiles', label: 'Profiles', icon: Star },
    { id: 'console', label: 'Console', icon: Terminal },
    { id: 'about', label: 'About', icon: Info },
    { id: 'contributors', label: 'Contributors', icon: Users },
  ];

  return (
    <header style={{
      width: '100%',
      height: '46px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 0 0 14px',
      background: '#FFFFFF',
      borderBottom: '1px solid var(--border)',
      position: 'sticky',
      top: 0,
      zIndex: 50,
      boxShadow: 'var(--shadow-sm)',
      flexWrap: 'nowrap',
      whiteSpace: 'nowrap',
      WebkitAppRegion: 'drag',
      userSelect: 'none',
      boxSizing: 'border-box'
    }}>
      {/* Brand & Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'nowrap', flexShrink: 0 }}>
        {/* Logo + SHARE PORT text */}
        <div 
          onClick={() => setActiveTab('home')}
          title="Share Port Home"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer',
            flexShrink: 0,
            WebkitAppRegion: 'no-drag'
          }}
        >
          <img
            src={logoImg}
            alt="SharePort"
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '7px',
              display: 'block',
              objectFit: 'contain'
            }}
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
          <span style={{
            fontWeight: '800',
            fontSize: '15px',
            color: 'var(--text-main)',
            letterSpacing: '-0.3px',
            whiteSpace: 'nowrap'
          }}>
            SHARE PORT
          </span>
        </div>

        {/* Navigation Tabs (Single line, no wrap) */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: '3px', flexWrap: 'nowrap', WebkitAppRegion: 'no-drag' }}>
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '5px 11px',
                  borderRadius: '7px',
                  fontSize: '12.5px',
                  fontWeight: '600',
                  background: isActive ? '#F0FDFA' : 'transparent',
                  color: isActive ? '#0D9488' : 'var(--text-muted)',
                  border: isActive ? '1px solid #99F6E4' : '1px solid transparent',
                  position: 'relative',
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <Icon size={14} style={{ color: isActive ? '#0D9488' : '#94A3B8' }} />
                <span>{item.label}</span>
                {item.id === 'shareport' && isConnected && (
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#0D9488' }} />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Right Controls + Window Control Buttons */}
      <div style={{ display: 'flex', alignItems: 'center', height: '100%', gap: '10px', flexShrink: 0, flexWrap: 'nowrap' }}>
        {/* Status Pill */}
        <div style={{ WebkitAppRegion: 'no-drag' }}>
          {isConnected ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: '#F0FDFA',
              border: '1px solid #99F6E4',
              borderRadius: '99px',
              padding: '3px 10px',
              fontSize: '11px'
            }}>
              <div className="pulse-live" style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#0D9488' }} />
              <span style={{ fontWeight: '800', color: '#0F766E' }}>● ACTIVE TUNNEL</span>
              {tunnelState.publicUrl && (
                <button
                  onClick={handleCopyUrl}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    background: '#FFFFFF',
                    border: '1px solid #99F6E4',
                    borderRadius: '4px',
                    padding: '2px 5px',
                    fontSize: '10px',
                    fontWeight: '600',
                    color: '#0D9488',
                    marginLeft: '2px',
                    cursor: 'pointer'
                  }}
                >
                  {copied ? <Check size={10} /> : <Copy size={10} />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              )}
            </div>
          ) : (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: '#F8FAFC',
              border: '1px solid var(--border)',
              borderRadius: '99px',
              padding: '3px 10px',
              fontSize: '11px'
            }}>
              <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#94A3B8' }} />
              <span style={{ fontWeight: '700', color: 'var(--text-muted)' }}>READY / IDLE</span>
            </div>
          )}
        </div>

        {/* SharePort Link Button */}
        <button
          onClick={() => SystemAPI.openExternal('https://www.shareport.in')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            padding: '4px 10px',
            borderRadius: '7px',
            background: '#F0FDFA',
            border: '1px solid #99F6E4',
            color: '#0D9488',
            fontSize: '11px',
            fontWeight: '700',
            cursor: 'pointer',
            WebkitAppRegion: 'no-drag'
          }}
        >
          <Globe size={12} />
          <span>shareport.in</span>
        </button>

        {/* Windows Standard Title Bar Controls (Minimize, Maximize/Restore, Close) */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          height: '100%',
          borderLeft: '1px solid var(--border)',
          marginLeft: '4px',
          WebkitAppRegion: 'no-drag'
        }}>
          {/* Minimize */}
          <button
            onClick={() => WindowAPI.minimize()}
            title="Minimize"
            style={{
              width: '38px',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              transition: 'background 0.15s ease'
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#F1F5F9'; e.currentTarget.style.color = 'var(--text-main)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            <Minus size={14} />
          </button>

          {/* Maximize / Restore */}
          <button
            onClick={async () => {
              const maxed = await WindowAPI.maximize();
              setIsMax(Boolean(maxed));
            }}
            title={isMax ? "Restore" : "Maximize"}
            style={{
              width: '38px',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              transition: 'background 0.15s ease'
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#F1F5F9'; e.currentTarget.style.color = 'var(--text-main)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            {isMax ? <Copy size={12} /> : <Square size={12} />}
          </button>

          {/* Close */}
          <button
            onClick={() => WindowAPI.close()}
            title="Close"
            style={{
              width: '42px',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              transition: 'background 0.15s ease, color 0.15s ease'
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#E11D48'; e.currentTarget.style.color = '#FFFFFF'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            <X size={15} />
          </button>
        </div>
      </div>
    </header>
  );
}
