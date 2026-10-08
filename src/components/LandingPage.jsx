import React from 'react';
import { ShieldCheck, ArrowRight, Zap, Shield, Smartphone, Globe, Code2, Server, Users, Award } from 'lucide-react';
import logoImg from '../assets/logo.png';

export default function LandingPage({ setActiveTab, tunnelState }) {
  const isConnected = tunnelState && tunnelState.status === 'CONNECTED';

  return (
    <div style={{
      width: '100%',
      minHeight: '100%',
      background: '#FFFFFF',
      padding: '32px 48px',
      display: 'flex',
      flexDirection: 'column',
      gap: '32px',
      boxSizing: 'border-box'
    }}>
      {/* 1. HERO BANNER: Full-Width with Big Logo and Single-Line Title */}
      <div style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '24px',
        borderBottom: '1px solid #F1F5F9',
        paddingBottom: '24px'
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <h1 style={{
            fontSize: '30px',
            fontWeight: '800',
            color: '#0F172A',
            letterSpacing: '-0.8px',
            lineHeight: '1.2',
            margin: 0
          }}>
            Built for Developers Who Value <span style={{ color: '#0D9488' }}>Speed & Freedom</span>
          </h1>
        </div>

        {/* Live Tunnel Status Badge */}
        <div style={{
          background: '#F0FDF4',
          border: '1px solid #BBF7D0',
          borderRadius: '16px',
          padding: '14px 22px',
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          boxShadow: '0 2px 10px rgba(16, 185, 129, 0.08)'
        }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            background: '#DCFCE7',
            border: '1px solid #86EFAC',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#16A34A',
            flexShrink: 0
          }}>
            <ShieldCheck size={28} />
          </div>
          <div>
            <div style={{ fontSize: '10px', fontWeight: '800', color: '#16A34A', textTransform: 'uppercase', letterSpacing: '0.6px', display: 'flex', alignItems: 'center', gap: '5px' }}>
              TUNNEL STATUS <span style={{ fontSize: '7px' }}>●</span>
            </div>
            <div style={{ fontSize: '16px', fontWeight: '800', color: '#0F172A', marginTop: '2px' }}>
              {isConnected ? `Port ${tunnelState.localPort} Live` : 'Ready to Connect'}
            </div>
          </div>
        </div>
      </div>

      {/* 2. THE TWO SERVICE CARDS: Full Page Width */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))',
        gap: '24px',
        width: '100%'
      }}>
        {/* CARD 1: SHARE PORT (Pastel Mint, Horizontal Layout) */}
        <div
          onClick={() => setActiveTab('shareport')}
          className="sp-card-interactive"
          style={{
            padding: '28px 36px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#CFF5E5',
            border: '1.5px solid #A4EDD0',
            borderRadius: '24px',
            cursor: 'pointer',
            transition: 'all 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
            minHeight: '140px',
            gap: '24px',
            boxShadow: '0 4px 18px rgba(16, 185, 129, 0.08)'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-3px)';
            e.currentTarget.style.boxShadow = '0 12px 26px rgba(16, 185, 129, 0.18)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 18px rgba(16, 185, 129, 0.08)';
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '22px' }}>
            {/* 3D-styled Transmitter Icon */}
            <div style={{
              width: '80px',
              height: '80px',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              filter: 'drop-shadow(0 6px 12px rgba(13, 148, 136, 0.22))'
            }}>
              <svg width="78" height="78" viewBox="0 0 92 92" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M16 28C30 14 62 14 76 28" stroke="#0D9488" strokeWidth="6" strokeLinecap="round" opacity="0.9" />
                <path d="M26 38C36 28 56 28 66 38" stroke="#0D9488" strokeWidth="6" strokeLinecap="round" />
                <rect x="20" y="50" width="52" height="34" rx="16" fill="url(#transmitter-grad-lp)" />
                <path d="M20 66C20 75 27 84 36 84H56C65 84 72 75 72 66V68C72 77 65 84 56 84H36C27 84 20 77 20 68V66Z" fill="#0F766E" opacity="0.6" />
                <path d="M24 67C30 60 36 74 46 67C56 60 62 74 68 67" stroke="#E6FFFA" strokeWidth="5" strokeLinecap="round" />
                <defs>
                  <linearGradient id="transmitter-grad-lp" x1="20" y1="50" x2="72" y2="84" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#14B8A6" />
                    <stop offset="1" stopColor="#0D9488" />
                  </linearGradient>
                </defs>
              </svg>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <h2 style={{ fontSize: '28px', fontWeight: '800', color: '#0F172A', margin: 0, letterSpacing: '-0.5px' }}>
                Share Port
              </h2>
              <p style={{ fontSize: '14px', fontWeight: '600', color: '#334155', margin: 0 }}>
                Share your local apps in one click 🚀
              </p>
              <div style={{ display: 'flex', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11px', fontWeight: '700', padding: '3px 8px', borderRadius: '6px', background: 'rgba(255,255,255,0.7)', color: '#0F766E' }}>
                  Instant HTTPS
                </span>
                <span style={{ fontSize: '11px', fontWeight: '700', padding: '3px 8px', borderRadius: '6px', background: 'rgba(255,255,255,0.7)', color: '#0F766E' }}>
                  Mobile QR
                </span>
                <span style={{ fontSize: '11px', fontWeight: '700', padding: '3px 8px', borderRadius: '6px', background: 'rgba(255,255,255,0.7)', color: '#0F766E' }}>
                  Any Port 1-65535
                </span>
              </div>
            </div>
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: '#0D9488',
            color: '#FFFFFF',
            padding: '10px 18px',
            borderRadius: '12px',
            fontSize: '13px',
            fontWeight: '700',
            boxShadow: '0 2px 8px rgba(13, 148, 136, 0.3)',
            flexShrink: 0
          }}>
            <span>Launch Tunnel</span>
            <ArrowRight size={15} />
          </div>
        </div>

        {/* CARD 2: API TESTING (Pastel Lavender, Horizontal Layout) */}
        <div
          onClick={() => setActiveTab('apitesting')}
          className="sp-card-interactive"
          style={{
            padding: '28px 36px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#E5DCFD',
            border: '1.5px solid #D1C5FB',
            borderRadius: '24px',
            cursor: 'pointer',
            transition: 'all 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
            minHeight: '140px',
            gap: '24px',
            boxShadow: '0 4px 18px rgba(124, 58, 237, 0.08)'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-3px)';
            e.currentTarget.style.boxShadow = '0 12px 26px rgba(124, 58, 237, 0.18)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 18px rgba(124, 58, 237, 0.08)';
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '22px' }}>
            {/* 3D-styled Purple Paper Plane Icon */}
            <div style={{
              width: '80px',
              height: '80px',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              filter: 'drop-shadow(0 6px 14px rgba(109, 40, 217, 0.25))'
            }}>
              <svg width="78" height="78" viewBox="0 0 94 94" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M78 18L18 50L42 62L78 18Z" fill="url(#plane-wing-grad-lp)" />
                <path d="M78 18L42 62L50 80L78 18Z" fill="#7C3AED" />
                <path d="M42 62L48 72L50 59L42 62Z" fill="#5B21B6" opacity="0.65" />
                <path d="M78 18L26 47L42 62L78 18Z" fill="url(#plane-light-grad-lp)" opacity="0.75" />
                <defs>
                  <linearGradient id="plane-wing-grad-lp" x1="18" y1="18" x2="78" y2="62" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#A78BFA" />
                    <stop offset="1" stopColor="#8B5CF6" />
                  </linearGradient>
                  <linearGradient id="plane-light-grad-lp" x1="26" y1="18" x2="78" y2="62" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#DDD6FE" />
                    <stop offset="1" stopColor="#A78BFA" stopOpacity="0" />
                  </linearGradient>
                </defs>
              </svg>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <h2 style={{ fontSize: '28px', fontWeight: '800', color: '#0F172A', margin: 0, letterSpacing: '-0.5px' }}>
                API Testing
              </h2>
              <p style={{ fontSize: '14px', fontWeight: '600', color: '#334155', margin: 0 }}>
                Test APIs without CORS headaches 🎯
              </p>
              <div style={{ display: 'flex', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11px', fontWeight: '700', padding: '3px 8px', borderRadius: '6px', background: 'rgba(255,255,255,0.7)', color: '#6D28D9' }}>
                  Zero CORS
                </span>
                <span style={{ fontSize: '11px', fontWeight: '700', padding: '3px 8px', borderRadius: '6px', background: 'rgba(255,255,255,0.7)', color: '#6D28D9' }}>
                  Postman Collections
                </span>
                <span style={{ fontSize: '11px', fontWeight: '700', padding: '3px 8px', borderRadius: '6px', background: 'rgba(255,255,255,0.7)', color: '#6D28D9' }}>
                  Assertions & Runner
                </span>
              </div>
            </div>
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: '#7C3AED',
            color: '#FFFFFF',
            padding: '10px 18px',
            borderRadius: '12px',
            fontSize: '13px',
            fontWeight: '700',
            boxShadow: '0 2px 8px rgba(124, 58, 237, 0.3)',
            flexShrink: 0
          }}>
            <span>Open Studio</span>
            <ArrowRight size={15} />
          </div>
        </div>
      </div>

      {/* 3. QUICK CONNECT LOCAL SERVER PRESETS (Using available space) */}
      <div style={{
        background: '#F8FAFC',
        border: '1px solid #E2E8F0',
        borderRadius: '20px',
        padding: '24px 32px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        width: '100%',
        boxSizing: 'border-box'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#0F172A', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Zap size={18} style={{ color: '#0D9488' }} />
              <span>Universal Technology & Port Standards</span>
            </h3>
            <p style={{ fontSize: '13px', color: '#64748B', margin: '4px 0 0 0' }}>
              Tunneling works seamlessly with any port and technology across all development environments:
            </p>
          </div>
          <span style={{ fontSize: '12px', fontWeight: '700', color: '#0D9488', background: '#F0FDFA', border: '1px solid #99F6E4', padding: '4px 10px', borderRadius: '20px' }}>
            Universal Framework Compatibility
          </span>
        </div>

        <div className="marquee-container" style={{ width: '100%', overflow: 'hidden', padding: '4px 0' }}>
          <div className="marquee-track">
            {[
              { name: 'React / Next.js', port: '3000', desc: 'Node.js, Vite, Webpack, etc.', color: '#0D9488', bg: '#F0FDFA', border: '#99F6E4' },
              { name: 'Vue / Svelte / Astro', port: '5173', desc: 'Nuxt, SolidJS, Remix, etc.', color: '#0D9488', bg: '#F0FDFA', border: '#99F6E4' },
              { name: 'Python / FastAPI', port: '8000', desc: 'Django, Tornado, Uvicorn, etc.', color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' },
              { name: 'Java / Spring Boot', port: '8080', desc: 'Pega, Tomcat, Kotlin, etc.', color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' },
              { name: 'Odoo / ERPNext', port: '8069', desc: 'Frappe, OpenERP, CRM, etc.', color: '#EA580C', bg: '#FFF7ED', border: '#FED7AA' },
              { name: 'Flask / Express', port: '5000', desc: 'Koa, NestJS, Sanic, etc.', color: '#0D9488', bg: '#F0FDFA', border: '#99F6E4' },
              { name: 'Ruby on Rails / Go', port: '3001', desc: 'Golang, Gin, Fiber, Rust, etc.', color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' },
              { name: 'ASP.NET / Docker', port: '5001', desc: 'C#, .NET Core, Microservices, etc.', color: '#0284C7', bg: '#F0F9FF', border: '#BAE6FD' },
              { name: 'More Technologies', port: 'More', desc: 'PHP, Laravel, Rust, GraphQL, etc.', color: '#0D9488', bg: '#F0FDFA', border: '#99F6E4' },
              // Duplicate set for seamless continuous marquee loop
              { name: 'React / Next.js', port: '3000', desc: 'Node.js, Vite, Webpack, etc.', color: '#0D9488', bg: '#F0FDFA', border: '#99F6E4' },
              { name: 'Vue / Svelte / Astro', port: '5173', desc: 'Nuxt, SolidJS, Remix, etc.', color: '#0D9488', bg: '#F0FDFA', border: '#99F6E4' },
              { name: 'Python / FastAPI', port: '8000', desc: 'Django, Tornado, Uvicorn, etc.', color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' },
              { name: 'Java / Spring Boot', port: '8080', desc: 'Pega, Tomcat, Kotlin, etc.', color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' },
              { name: 'Odoo / ERPNext', port: '8069', desc: 'Frappe, OpenERP, CRM, etc.', color: '#EA580C', bg: '#FFF7ED', border: '#FED7AA' },
              { name: 'Flask / Express', port: '5000', desc: 'Koa, NestJS, Sanic, etc.', color: '#0D9488', bg: '#F0FDFA', border: '#99F6E4' },
              { name: 'Ruby on Rails / Go', port: '3001', desc: 'Golang, Gin, Fiber, Rust, etc.', color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' },
              { name: 'ASP.NET / Docker', port: '5001', desc: 'C#, .NET Core, Microservices, etc.', color: '#0284C7', bg: '#F0F9FF', border: '#BAE6FD' },
              { name: 'More Technologies', port: 'More', desc: 'PHP, Laravel, Rust, GraphQL, etc.', color: '#0D9488', bg: '#F0FDFA', border: '#99F6E4' }
            ].map((item, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  padding: '12px 16px',
                  background: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  borderRadius: '12px',
                  textAlign: 'left',
                  cursor: 'default',
                  userSelect: 'none',
                  minWidth: '220px',
                  width: '220px',
                  flexShrink: 0,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '11px', fontWeight: '800', color: item.color, background: item.bg, border: `1px solid ${item.border}`, padding: '2px 7px', borderRadius: '6px' }}>
                    {item.port === 'More' ? 'Port More' : `Port ${item.port}`}
                  </span>
                  <span style={{ fontSize: '10.5px', color: '#94A3B8' }}>Preset</span>
                </div>
                <span style={{ fontSize: '13px', fontWeight: '800', color: '#0F172A', marginTop: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {item.name}
                </span>
                <span style={{ fontSize: '11px', color: '#64748B', lineHeight: '1.3', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {item.desc}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 4. PRODUCTIVITY & ARCHITECTURAL PILLARS (Using bottom space) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: '20px',
        width: '100%',
        paddingBottom: '16px'
      }}>
        <div style={{
          background: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '16px',
          padding: '20px 24px',
          display: 'flex',
          gap: '16px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
        }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '12px',
            background: '#F0FDFA',
            border: '1px solid #99F6E4',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#0D9488',
            flexShrink: 0
          }}>
            <Shield size={22} />
          </div>
          <div>
            <h4 style={{ fontSize: '15px', fontWeight: '800', color: '#0F172A', margin: 0 }}>
              100% Local & Private
            </h4>
            <p style={{ fontSize: '13px', color: '#64748B', margin: '4px 0 0 0', lineHeight: '1.4' }}>
              Your source code and databases stay strictly on your local PC. Direct tunnel line with zero tracking or remote data storage.
            </p>
          </div>
        </div>

        <div style={{
          background: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '16px',
          padding: '20px 24px',
          display: 'flex',
          gap: '16px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
        }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '12px',
            background: '#F5F3FF',
            border: '1px solid #DDD6FE',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#7C3AED',
            flexShrink: 0
          }}>
            <Globe size={22} />
          </div>
          <div>
            <h4 style={{ fontSize: '15px', fontWeight: '800', color: '#0F172A', margin: 0 }}>
              Zero CORS Restrictions
            </h4>
            <p style={{ fontSize: '13px', color: '#64748B', margin: '4px 0 0 0', lineHeight: '1.4' }}>
              Test local microservices, webhooks, and third-party APIs without browser cross-origin policy issues or preflight errors.
            </p>
          </div>
        </div>

        <div style={{
          background: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '16px',
          padding: '20px 24px',
          display: 'flex',
          gap: '16px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
        }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '12px',
            background: '#F0FDFA',
            border: '1px solid #99F6E4',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#0D9488',
            flexShrink: 0
          }}>
            <Smartphone size={22} />
          </div>
          <div>
            <h4 style={{ fontSize: '15px', fontWeight: '800', color: '#0F172A', margin: 0 }}>
              Real Mobile Device QA
            </h4>
            <p style={{ fontSize: '13px', color: '#64748B', margin: '4px 0 0 0', lineHeight: '1.4' }}>
              Scan the generated QR code directly with your phone camera to instantly test responsive mobile UX and OAuth flows on physical devices.
            </p>
          </div>
        </div>
      </div>

      {/* 5. CONTRIBUTORS & COMMUNITY BANNER */}
      <div style={{
        background: 'linear-gradient(135deg, #F0FDFA 0%, #FFFFFF 100%)',
        border: '1.5px solid #99F6E4',
        borderRadius: '20px',
        padding: '24px 32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '20px',
        boxShadow: '0 4px 18px rgba(13, 148, 136, 0.08)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '14px',
            background: '#CCFBF1',
            border: '1px solid #99F6E4',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#0D9488',
            flexShrink: 0
          }}>
            <Users size={24} />
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: '800', color: '#0D9488', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
              OUR COMMUNITY & QA CHAMPIONS
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#0F172A', margin: '2px 0 0 0' }}>
              Built & Tested with 11 Extraordinary Contributors
            </h3>
            <p style={{ fontSize: '13px', color: '#64748B', margin: '4px 0 0 0' }}>
              Honoring our Strategic QA leads, Bug Finders & Quality Testers: Joi Sai, Nanditha, Purushotham, Lokesh, Harsha, Hema Satish, Sesank, Manaswi, Imran, Bhavani, and Koti.
            </p>
          </div>
        </div>

        <button
          onClick={() => setActiveTab('contributors')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            background: '#0D9488',
            color: '#FFFFFF',
            padding: '10px 20px',
            borderRadius: '10px',
            fontSize: '13px',
            fontWeight: '700',
            border: 'none',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            boxShadow: '0 2px 8px rgba(13, 148, 136, 0.25)'
          }}
        >
          <span>View Contributors Page</span>
          <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}
