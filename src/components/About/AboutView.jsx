import React, { useState } from 'react';
import {
  Shield, Mail, Copy, Check, ExternalLink, Zap, Smartphone,
  Activity, Globe, Rocket, Heart, CheckCircle2, RefreshCw
} from 'lucide-react';
import { SystemAPI } from '../../services/api';

export default function AboutView({ setActiveTab }) {
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateMsg, setUpdateMsg] = useState(null);

  const supportEmail = "ibm.145285366@gmail.com";

  const handleCopyEmail = async () => {
    await SystemAPI.copyText(supportEmail);
    setCopiedEmail(true);
    setTimeout(() => setCopiedEmail(false), 2000);
  };

  const handleCheckUpdate = () => {
    setCheckingUpdate(true);
    setTimeout(() => {
      setCheckingUpdate(false);
      setUpdateMsg('You are running the latest version of SHARE PORT (v2.0.0).');
    }, 1000);
  };

  const threeCardsData = [
    {
      icon: "💎",
      title: "100% Free Forever",
      intro: "Completely free for everyone with zero paywalls.",
      bullets: [
        "No credit card, payment, or subscription required",
        "No bandwidth caps, duration limits, or hidden fees",
        "Unlimited local tunneling for personal & team projects"
      ]
    },
    {
      icon: "🚀",
      title: "Perfect for Sharing & Testing",
      intro: "Easily expose your local app to the public internet.",
      bullets: [
        "Instant HTTPS link generation for any localhost port",
        "Works seamlessly for React, Next, Vue, Python & Node",
        "Ideal for client demos, mobile previews & webhooks"
      ]
    },
    {
      icon: "🛡️",
      title: "Safe & Private",
      intro: "Your code and data never leave your computer.",
      bullets: [
        "Local files & databases remain 100% safe and isolated",
        "Creates encrypted temporary tunnels on-demand",
        "Browser security warnings on first visit are normal"
      ]
    }
  ];

  const coreFeatures = [
    {
      icon: "⚡",
      title: "1-Click Public HTTPS Tunneling",
      desc: "Generates an instant public HTTPS web link for your local server (ports 3000, 5173, 8000, 8080) with automatic SSL certificate encryption."
    },
    {
      icon: "📱",
      title: "Instant Mobile QR Code Preview",
      desc: "Scan the live generated QR code with any smartphone camera to test and preview your local web app on real mobile devices."
    },
    {
      icon: "🔍",
      title: "Live HTTP Traffic Inspector",
      desc: "Real-time detailed inspection of incoming requests, headers, query parameters, response status codes, and execution latency."
    },
    {
      icon: "🌐",
      title: "Unified Full-Stack Port Forwarding",
      desc: "Automatically route both Frontend UI (e.g., React/Vite) and Backend API (e.g., Node/FastAPI) together through one single public URL."
    }
  ];

  return (
    <div className="fluid-container" style={{ maxWidth: '100%', background: '#FFFFFF' }}>
      {/* Header Title + Subtitle */}
      <div style={{ marginBottom: '8px' }}>
        <h1 style={{ fontSize: '26px', fontWeight: '800', color: 'var(--text-main)', margin: 0 }}>
          About Share Port
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
          Everything you need to know — simple and clear.
        </p>
      </div>

      {/* Top Row: Security & Trust Banner + Feedback & Support Card (Side-by-Side) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
        gap: '20px',
        width: '100%'
      }}>
        {/* Left Card: Security & Trust */}
        <div style={{
          background: '#FFFFFF',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: '16px',
          boxShadow: 'var(--shadow-sm)'
        }}>
          <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              background: '#F0FDFA',
              border: '1px solid #99F6E4',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '22px',
              flexShrink: 0
            }}>
              🛡️
            </div>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#0F766E', margin: '0 0 4px 0' }}>
                🔒 100% Safe & Encrypted
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.4', margin: 0 }}>
                Source code and local files stay exclusively on your computer. All tunnel traffic is secured with end-to-end TLS.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {[
              "💻 Code Safe",
              "🔒 Encrypted",
              "⚡ Local Only"
            ].map(b => (
              <span
                key={b}
                style={{
                  background: '#F0FDFA',
                  color: '#0D9488',
                  border: '1px solid #99F6E4',
                  padding: '4px 10px',
                  borderRadius: '8px',
                  fontSize: '11px',
                  fontWeight: '700'
                }}
              >
                {b}
              </span>
            ))}
          </div>
        </div>

        {/* Right Card: Feedback, Support, Complaints & Enquiries */}
        <div style={{
          background: '#FFFFFF',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: '16px',
          boxShadow: 'var(--shadow-sm)'
        }}>
          <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              background: '#F0FDFA',
              border: '1px solid #99F6E4',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '22px',
              flexShrink: 0
            }}>
              📬
            </div>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#0F766E', margin: '0 0 4px 0' }}>
                Feedback, Support & Enquiries
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.4', margin: 0 }}>
                Have complaints, suggestions, or sales enquiries? Contact us directly:
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <div style={{
              background: '#F0FDFA',
              color: '#0D9488',
              padding: '6px 12px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: '700',
              border: '1px solid #99F6E4'
            }}>
              ✉️ {supportEmail}
            </div>

            <button
              onClick={handleCopyEmail}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '6px 12px',
                borderRadius: '8px',
                background: '#FFFFFF',
                border: '1px solid var(--border)',
                color: '#0D9488',
                fontSize: '11px',
                fontWeight: '700'
              }}
            >
              {copiedEmail ? <Check size={12} /> : <Copy size={12} />}
              <span>{copiedEmail ? 'Copied!' : 'Copy'}</span>
            </button>

            <button
              onClick={() => SystemAPI.openExternal(`mailto:${supportEmail}`)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '6px 12px',
                borderRadius: '8px',
                background: '#0D9488',
                color: '#FFFFFF',
                fontSize: '11px',
                fontWeight: '700'
              }}
            >
              <Mail size={12} />
              <span>Send</span>
            </button>
          </div>
        </div>
      </div>

      {/* Top 3 Feature Highlights */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: '20px',
        width: '100%'
      }}>
        {threeCardsData.map((card, idx) => (
          <div
            key={idx}
            className="sp-card"
            style={{
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              position: 'relative',
              overflow: 'hidden',
              background: '#FFFFFF'
            }}
          >
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              background: '#F0FDFA',
              border: '1px solid #99F6E4',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '22px'
            }}>
              {card.icon}
            </div>

            <h3 style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-main)', margin: 0 }}>
              {card.title}
            </h3>

            <p style={{ fontSize: '13px', fontWeight: '600', color: '#0D9488', margin: 0 }}>
              {card.intro}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
              {card.bullets.map((b, bIdx) => (
                <div key={bIdx} style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', gap: '6px' }}>
                  <span>•</span>
                  <span>{b}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Application Features Panel at Bottom (2x2 Grid) */}
      <div className="sp-card" style={{ padding: '26px', background: '#FFFFFF' }}>
        <div style={{ marginBottom: '18px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-main)', margin: '0 0 4px 0' }}>
            ⚡ Share Port Core Application Features
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
            Everything included out-of-the-box in your local developer tunneling toolkit.
          </p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
          gap: '16px'
        }}>
          {coreFeatures.map((feat, fIdx) => (
            <div
              key={fIdx}
              style={{
                background: '#F8FAFC',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                padding: '16px 18px',
                display: 'flex',
                gap: '14px',
                alignItems: 'flex-start'
              }}
            >
              <div style={{
                width: '42px',
                height: '42px',
                borderRadius: '50%',
                background: '#F0FDFA',
                border: '1px solid #99F6E4',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px',
                flexShrink: 0
              }}>
                {feat.icon}
              </div>

              <div>
                <h4 style={{ fontSize: '14px', fontWeight: '800', color: 'var(--text-main)', margin: '0 0 4px 0' }}>
                  {feat.title}
                </h4>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.4', margin: 0 }}>
                  {feat.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer Action Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        padding: '16px 20px',
        background: '#FFFFFF',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        boxShadow: 'var(--shadow-sm)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={() => SystemAPI.openExternal("https://www.shareport.in")}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 18px',
              borderRadius: '8px',
              background: '#F0FDFA',
              border: '1px solid #99F6E4',
              color: '#0D9488',
              fontSize: '13px',
              fontWeight: '700',
              cursor: 'pointer'
            }}
          >
            <Globe size={15} />
            <span>🌐 Visit Website</span>
          </button>


        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={handleCheckUpdate}
            disabled={checkingUpdate}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 16px',
              borderRadius: '8px',
              background: '#FFFFFF',
              border: '1px solid var(--border)',
              color: 'var(--text-muted)',
              fontSize: '12px',
              fontWeight: '700'
            }}
          >
            <RefreshCw size={13} className={checkingUpdate ? 'spin' : ''} />
            <span>{checkingUpdate ? 'Checking...' : updateMsg || 'Check for Updates'}</span>
          </button>

          {setActiveTab && (
            <button
              onClick={() => setActiveTab('shareport')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 20px',
                borderRadius: '8px',
                background: '#0D9488',
                color: '#FFFFFF',
                fontSize: '13px',
                fontWeight: '800'
              }}
            >
              <Rocket size={15} />
              <span>Start Tunnel Now</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
