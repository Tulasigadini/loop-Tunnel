import React, { useState, useEffect } from 'react';
import { Star, Play, Trash2, Plus, Globe, Check } from 'lucide-react';
import { StorageAPI, TunnelAPI } from '../../services/api';

export default function ProfilesView({ onLaunchProfile }) {
  const [profiles, setProfiles] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newProfile, setNewProfile] = useState({ name: '', port: 3000, subdomain: '', mode: 'fixed', provider: 'cloudflare' });

  useEffect(() => {
    async function load() {
      const cfg = await StorageAPI.getConfig();
      if (cfg) {
        let proList = cfg.saved_profiles || [];
        if (proList.length === 0 && cfg.port_subdomain_map) {
          proList = Object.entries(cfg.port_subdomain_map).map(([p, sub]) => ({
            name: `Port ${p} (${sub})`,
            port: parseInt(p),
            subdomain: sub,
            mode: 'fixed',
            provider: 'cloudflare'
          }));
        }
        setProfiles(proList);
      }
    }
    load();
  }, []);

  const handleSaveNew = async () => {
    if (!newProfile.name || !newProfile.port) return;
    const updated = [...profiles.filter(p => p.name !== newProfile.name), newProfile];
    setProfiles(updated);
    await StorageAPI.setConfig('saved_profiles', updated);
    setShowAddModal(false);
    setNewProfile({ name: '', port: 3000, subdomain: '', mode: 'fixed', provider: 'cloudflare' });
  };

  const handleDelete = async (name) => {
    const updated = profiles.filter(p => p.name !== name);
    setProfiles(updated);
    await StorageAPI.setConfig('saved_profiles', updated);
  };

  return (
    <div className="fluid-container">
      <div className="sp-card" style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: '800', color: 'var(--text-main)' }}>Saved Port Profiles</h2>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Quick-launch mapped ports and subdomains with a single click</p>
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              borderRadius: '8px',
              background: '#0D9488',
              color: '#FFFFFF',
              fontSize: '13px',
              fontWeight: '700'
            }}
          >
            <Plus size={15} />
            <span>Add Profile</span>
          </button>
        </div>

        {/* Profile Cards Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
          {profiles.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-dim)', gridColumn: '1/-1' }}>
              No saved profiles yet. Click "Add Profile" or launch a tunnel in Share Port with fixed subdomains.
            </div>
          ) : (
            profiles.map(p => (
              <div
                key={p.name}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  background: '#FAF8FD',
                  gap: '16px'
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '15px', fontWeight: '800', color: 'var(--text-main)' }}>{p.name}</span>
                    <span style={{ fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '4px', background: '#EDE6FA', color: '#6D28D9' }}>
                      Port {p.port}
                    </span>
                  </div>

                  <div className="font-mono" style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                    {p.subdomain ? `${p.subdomain}.shareport.link` : '(Random Edge URL)'}
                  </div>

                  <div style={{ fontSize: '12px', color: 'var(--text-dim)', textTransform: 'capitalize' }}>
                    Engine: Auto High-Speed • Mode: {p.mode || 'fixed'}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
                  <button
                    onClick={() => onLaunchProfile(p)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 14px',
                      borderRadius: '6px',
                      background: '#7C3AED',
                      color: '#FFFFFF',
                      fontSize: '12px',
                      fontWeight: '700'
                    }}
                  >
                    <Play size={12} fill="#FFFFFF" />
                    <span>Launch</span>
                  </button>

                  <button
                    onClick={() => handleDelete(p.name)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      background: 'transparent',
                      color: 'var(--text-dim)',
                      fontSize: '12px',
                      padding: '4px 8px'
                    }}
                  >
                    <Trash2 size={13} />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Add Profile Modal */}
      {showAddModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(49, 27, 88, 0.4)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100
        }}>
          <div style={{
            background: '#FFFFFF',
            border: '1px solid var(--border)',
            borderRadius: '16px',
            padding: '28px',
            width: '440px',
            boxShadow: 'var(--shadow-lg)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <h3 style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-main)', margin: 0 }}>Create Port Profile</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-main)' }}>Profile Name</label>
              <input
                type="text"
                placeholder="e.g. My Next.js Frontend"
                value={newProfile.name}
                onChange={e => setNewProfile({ ...newProfile, name: e.target.value })}
                style={{ padding: '8px 12px', fontSize: '13px', border: '1px solid var(--border)' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-main)' }}>Local Port</label>
                <input
                  type="number"
                  value={newProfile.port}
                  onChange={e => setNewProfile({ ...newProfile, port: parseInt(e.target.value) || 3000 })}
                  style={{ padding: '8px 12px', fontSize: '13px', border: '1px solid var(--border)' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-main)' }}>Engine</label>
                <select
                  value={newProfile.provider}
                  onChange={e => setNewProfile({ ...newProfile, provider: e.target.value })}
                  style={{ padding: '8px 12px', fontSize: '13px', border: '1px solid var(--border)' }}
                >
                  <option value="cloudflare">Auto High-Speed</option>
                  <option value="serveo">Fast Direct</option>
                  <option value="localhost_run">Secure Line</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-main)' }}>Subdomain (Optional)</label>
              <input
                type="text"
                placeholder="my-cool-app"
                value={newProfile.subdomain}
                onChange={e => setNewProfile({ ...newProfile, subdomain: e.target.value })}
                style={{ padding: '8px 12px', fontSize: '13px', border: '1px solid var(--border)' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '12px' }}>
              <button
                onClick={() => setShowAddModal(false)}
                style={{ padding: '8px 16px', borderRadius: '8px', background: '#F5EEFD', color: '#6D28D9', fontSize: '12px', fontWeight: '700' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveNew}
                style={{ padding: '8px 16px', borderRadius: '8px', background: '#7C3AED', color: '#FFFFFF', fontSize: '12px', fontWeight: '700' }}
              >
                Save Profile
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
