import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Trash2, ArrowDown } from 'lucide-react';
import { TunnelAPI } from '../../services/api';

export default function ConsoleView() {
  const [logs, setLogs] = useState([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const bottomRef = useRef(null);

  useEffect(() => {
    async function load() {
      const initialLogs = await TunnelAPI.getConsoleLogs();
      if (initialLogs) setLogs(initialLogs);
    }
    load();

    const unsubscribe = TunnelAPI.onConsoleLog((item) => {
      setLogs(prev => [...prev.slice(-499), item]);
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const handleClear = async () => {
    await TunnelAPI.clearConsoleLogs();
    setLogs([]);
  };

  return (
    <div className="fluid-container">
      <div className="sp-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', minHeight: '600px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#F5EEFD', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7C3AED' }}>
              <Terminal size={18} />
            </div>
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: '800', color: 'var(--text-main)' }}>Tunnel Engine Console</h2>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Live stdout/stderr stream from background tunnel process</span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-main)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
              />
              <span>Auto-scroll</span>
            </label>

            <button
              onClick={handleClear}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '6px',
                background: '#F5EEFD',
                border: '1px solid #DDD0F5',
                color: '#6D28D9',
                fontSize: '12px',
                fontWeight: '600'
              }}
            >
              <Trash2 size={13} />
              <span>Clear Console</span>
            </button>
          </div>
        </div>

        {/* Playful Amethyst Terminal Box */}
        <div style={{
          flex: 1,
          background: '#24103A',
          borderRadius: '10px',
          padding: '16px',
          overflowY: 'auto',
          minHeight: '480px',
          fontFamily: 'JetBrains Mono, Consolas, monospace',
          fontSize: '12px',
          color: '#F5EEFD',
          lineHeight: '1.6',
          border: '1px solid #DDD0F5'
        }}>
          {logs.length === 0 ? (
            <div style={{ color: '#D8CCE8', display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 0' }}>
              <span>Engine idle. Console logs will appear here when you launch a tunnel.</span>
            </div>
          ) : (
            logs.map(item => (
              <div key={item.id} style={{ display: 'flex', gap: '10px', wordBreak: 'break-all' }}>
                <span style={{ color: '#C084FC', userSelect: 'none', minWidth: '70px' }}>[{item.time}]</span>
                <span style={{ color: '#EDE6FA' }}>{item.text}</span>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}
