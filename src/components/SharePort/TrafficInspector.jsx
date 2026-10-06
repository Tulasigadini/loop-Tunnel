import React, { useState } from 'react';
import { Activity, Trash2, Search, ArrowUpRight, Copy, Check, Play, RefreshCw, ChevronRight } from 'lucide-react';
import { InspectorAPI, SystemAPI } from '../../services/api';

export default function TrafficInspector({ logs, setLogs, onReplayInApiTesting }) {
  const [selectedLog, setSelectedLog] = useState(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [detailTab, setDetailTab] = useState('request'); // request, response, curl
  const [copied, setCopied] = useState(false);

  const filteredLogs = logs.filter(log => {
    if (!searchFilter) return true;
    const q = searchFilter.toLowerCase();
    return (
      (log.path && log.path.toLowerCase().includes(q)) ||
      (log.method && log.method.toLowerCase().includes(q)) ||
      (log.status && String(log.status).includes(q))
    );
  });

  const handleClear = async () => {
    await InspectorAPI.clearLogs();
    setLogs([]);
    setSelectedLog(null);
  };

  const getMethodBadgeClass = (method) => {
    switch (method?.toUpperCase()) {
      case 'GET': return 'badge-method-get';
      case 'POST': return 'badge-method-post';
      case 'PUT': return 'badge-method-put';
      case 'DELETE': return 'badge-method-delete';
      case 'PATCH': return 'badge-method-patch';
      default: return 'badge-method-get';
    }
  };

  const getStatusBadgeClass = (status) => {
    if (!status) return 'badge-status-4xx';
    if (status >= 200 && status < 300) return 'badge-status-2xx';
    if (status >= 300 && status < 400) return 'badge-status-3xx';
    return 'badge-status-4xx';
  };

  const generateCurl = (log) => {
    if (!log) return '';
    let cmd = `curl -X ${log.method} "http://localhost:${log.port || 3000}${log.path}"`;
    if (log.reqHeaders) {
      Object.entries(log.reqHeaders).forEach(([k, v]) => {
        if (!['host', 'content-length'].includes(k.toLowerCase())) {
          cmd += ` \\\n  -H "${k}: ${v}"`;
        }
      });
    }
    if (log.reqBody) {
      cmd += ` \\\n  -d '${log.reqBody.replace(/'/g, "'\\''")}'`;
    }
    return cmd;
  };

  const handleCopy = async (text) => {
    await SystemAPI.copyText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="sp-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
      {/* Header Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            background: '#F5EEFD',
            border: '1px solid #DDD0F5',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#7C3AED'
          }}>
            <Activity size={18} />
          </div>
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: '800', color: 'var(--text-main)' }}>Live Traffic Inspector</h3>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              {logs.length} request{logs.length === 1 ? '' : 's'} recorded
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Search bar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: '#FFFFFF',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            padding: '6px 12px'
          }}>
            <Search size={14} style={{ color: 'var(--text-dim)' }} />
            <input
              type="text"
              placeholder="Filter path, method..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-main)',
                fontSize: '12px',
                width: '160px',
                padding: 0
              }}
            />
          </div>

          <button
            onClick={handleClear}
            disabled={logs.length === 0}
            title="Clear all logs"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: '#F5EEFD',
              border: '1px solid #DDD0F5',
              borderRadius: '8px',
              padding: '6px 12px',
              color: '#6D28D9',
              fontSize: '12px',
              fontWeight: '600',
              opacity: logs.length === 0 ? 0.5 : 1
            }}
          >
            <Trash2 size={13} />
            <span>Clear</span>
          </button>
        </div>
      </div>

      {/* Main Container: Split or Table */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: selectedLog ? '1fr 1fr' : '1fr',
        gap: '16px',
        alignItems: 'start'
      }}>
        {/* Table List */}
        <div style={{
          border: '1px solid var(--border)',
          borderRadius: '10px',
          overflow: 'hidden',
          background: '#FFFFFF'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: '#FAF8FD', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                <th style={{ padding: '10px 12px', fontWeight: '700' }}>Time</th>
                <th style={{ padding: '10px 12px', fontWeight: '700' }}>Method</th>
                <th style={{ padding: '10px 12px', fontWeight: '700' }}>Path</th>
                <th style={{ padding: '10px 12px', fontWeight: '700' }}>Status</th>
                <th style={{ padding: '10px 12px', fontWeight: '700' }}>Duration</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-dim)' }}>
                    No HTTP traffic captured yet. Make a request to your local tunnel to inspect.
                  </td>
                </tr>
              ) : (
                filteredLogs.map(log => {
                  const isSelected = selectedLog && selectedLog.id === log.id;
                  return (
                    <tr
                      key={log.id}
                      onClick={() => setSelectedLog(log)}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        background: isSelected ? '#F5EEFD' : 'transparent',
                        cursor: 'pointer',
                        transition: 'background 0.1s'
                      }}
                    >
                      <td style={{ padding: '10px 12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {log.timestamp}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span className={`badge-method ${getMethodBadgeClass(log.method)} font-mono`} style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: '800' }}>
                          {log.method}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: '600', color: 'var(--text-main)', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {log.path}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span className={`badge-status ${getStatusBadgeClass(log.status)}`} style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '11px' }}>
                          {log.status || '---'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {log.durationMs}ms
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onReplayInApiTesting) onReplayInApiTesting(log);
                          }}
                          title="Replay in API Testing"
                          style={{
                            background: '#F5EEFD',
                            border: '1px solid #DDD0F5',
                            borderRadius: '4px',
                            padding: '4px 8px',
                            color: '#6D28D9',
                            fontSize: '11px',
                            fontWeight: '700',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <Play size={10} fill="#6D28D9" />
                          <span>Replay</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Detail Panel */}
        {selectedLog && (
          <div style={{
            border: '1px solid var(--border)',
            borderRadius: '10px',
            background: '#FFFFFF',
            display: 'flex',
            flexDirection: 'column',
            maxHeight: '560px',
            overflow: 'hidden'
          }}>
            {/* Drawer Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              borderBottom: '1px solid var(--border)',
              background: '#FAF8FD'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className={`badge-method ${getMethodBadgeClass(selectedLog.method)} font-mono`} style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: '800' }}>
                  {selectedLog.method}
                </span>
                <span style={{ fontWeight: '700', fontSize: '13px', color: 'var(--text-main)' }}>
                  {selectedLog.path}
                </span>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                style={{ background: 'transparent', color: 'var(--text-dim)', fontSize: '14px', fontWeight: '700' }}
              >
                ✕
              </button>
            </div>

            {/* Sub-tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: '#FFFFFF' }}>
              {['request', 'response', 'curl'].map(t => (
                <button
                  key={t}
                  onClick={() => setDetailTab(t)}
                  style={{
                    padding: '8px 16px',
                    fontSize: '12px',
                    fontWeight: '700',
                    textTransform: 'capitalize',
                    background: detailTab === t ? '#F5EEFD' : 'transparent',
                    color: detailTab === t ? '#6D28D9' : 'var(--text-muted)',
                    borderBottom: detailTab === t ? '2px solid #7C3AED' : '2px solid transparent'
                  }}
                >
                  {t === 'curl' ? 'cURL Command' : t}
                </button>
              ))}
            </div>

            {/* Tab Contents */}
            <div style={{ padding: '14px', overflowY: 'auto', flex: 1 }}>
              {detailTab === 'request' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <span style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Request Headers</span>
                    <div style={{ marginTop: '6px', background: '#FAF8FD', border: '1px solid var(--border)', borderRadius: '6px', padding: '8px' }}>
                      {selectedLog.reqHeaders && Object.keys(selectedLog.reqHeaders).length > 0 ? (
                        Object.entries(selectedLog.reqHeaders).map(([k, v]) => (
                          <div key={k} style={{ display: 'flex', gap: '8px', fontSize: '11px', padding: '2px 0' }}>
                            <span style={{ color: '#6D28D9', fontWeight: '700' }}>{k}:</span>
                            <span className="font-mono" style={{ color: 'var(--text-main)', wordBreak: 'break-all' }}>{String(v)}</span>
                          </div>
                        ))
                      ) : (
                        <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>No headers captured</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <span style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Request Payload</span>
                    <pre className="font-mono" style={{
                      marginTop: '6px',
                      background: '#FAF8FD',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      padding: '8px',
                      fontSize: '11px',
                      color: 'var(--text-main)',
                      overflowX: 'auto',
                      whiteSpace: 'pre-wrap'
                    }}>
                      {selectedLog.reqBody || '(Empty body)'}
                    </pre>
                  </div>
                </div>
              )}

              {detailTab === 'response' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <span style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Response Headers</span>
                    <div style={{ marginTop: '6px', background: '#FAF8FD', border: '1px solid var(--border)', borderRadius: '6px', padding: '8px' }}>
                      {selectedLog.resHeaders && Object.keys(selectedLog.resHeaders).length > 0 ? (
                        Object.entries(selectedLog.resHeaders).map(([k, v]) => (
                          <div key={k} style={{ display: 'flex', gap: '8px', fontSize: '11px', padding: '2px 0' }}>
                            <span style={{ color: '#6D28D9', fontWeight: '700' }}>{k}:</span>
                            <span className="font-mono" style={{ color: 'var(--text-main)', wordBreak: 'break-all' }}>{String(v)}</span>
                          </div>
                        ))
                      ) : (
                        <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>No response headers</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Response Body</span>
                      <button
                        onClick={() => handleCopy(selectedLog.resBody)}
                        style={{ background: 'transparent', color: copied ? '#6D28D9' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: '600' }}
                      >
                        {copied ? <Check size={12} /> : <Copy size={12} />}
                        <span>Copy</span>
                      </button>
                    </div>
                    <pre className="font-mono" style={{
                      background: '#FAF8FD',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      padding: '8px',
                      fontSize: '11px',
                      color: 'var(--text-main)',
                      overflowX: 'auto',
                      maxHeight: '220px',
                      whiteSpace: 'pre-wrap'
                    }}>
                      {selectedLog.resBody || '(Empty response body)'}
                    </pre>
                  </div>
                </div>
              )}

              {detailTab === 'curl' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-muted)' }}>Command Line Replay</span>
                    <button
                      onClick={() => handleCopy(generateCurl(selectedLog))}
                      style={{ background: 'transparent', color: copied ? '#6D28D9' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: '600' }}
                    >
                      {copied ? <Check size={12} /> : <Copy size={12} />}
                      <span>Copy cURL</span>
                    </button>
                  </div>
                  <pre className="font-mono" style={{
                    background: '#FAF8FD',
                    border: '1px solid #DDD0F5',
                    borderRadius: '6px',
                    padding: '10px',
                    fontSize: '11px',
                    color: '#6D28D9',
                    overflowX: 'auto',
                    whiteSpace: 'pre-wrap'
                  }}>
                    {generateCurl(selectedLog)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
