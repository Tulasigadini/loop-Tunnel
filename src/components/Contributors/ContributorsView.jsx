import React, { useState } from 'react';
import { Users, Bug, Shield, CheckCircle2, Search, ExternalLink, Mail, Sparkles, Award } from 'lucide-react';
import { SystemAPI } from '../../services/api';

export default function ContributorsView({ setActiveTab }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');

  const contributors = [
    {
      id: 'joi-sai',
      name: 'Joi Sai',
      initials: 'JS',
      role: 'Strategic QA & Systems Lead',
      categories: ['strategic', 'qa'],
      badges: [
        { label: 'Strategic', type: 'strategic' },
        { label: 'Lead QA', type: 'qa' }
      ],
      description: 'Steered overall test planning and validation methodology for SHARE PORT. Drove high-impact test scenarios verifying core tunnel resilience under complex networking environments.',
      highlights: [
        'Strategic test architecture & validation matrices',
        'Subdomain routing stability & multi-process QA'
      ]
    },
    {
      id: 'nanditha',
      name: 'Nanditha',
      initials: 'N',
      role: 'Lead Quality Assurance (QA)',
      categories: ['qa', 'strategic'],
      badges: [
        { label: 'Quality Assurance', type: 'qa' },
        { label: 'Strategic', type: 'strategic' }
      ],
      description: 'Led quality assurance sweeps across API testing flows, responsive UI states, and mobile QR code previews on real iOS and Android physical devices.',
      highlights: [
        'Cross-device QR inspection & mobile browser validation',
        'User journey verification & UX consistency QA'
      ]
    },
    {
      id: 'purushotham',
      name: 'Purushotham',
      initials: 'P',
      role: 'Strategic QA & Bug Hunter',
      categories: ['strategic', 'bugfinder', 'qa'],
      badges: [
        { label: 'Strategic QA', type: 'strategic' },
        { label: 'Bug Finder', type: 'bugfinder' }
      ],
      description: 'Combined strategic QA architecture with sharp exploratory testing to isolate critical edge cases in local port forwarding, timeout scenarios, and payload throughput.',
      highlights: [
        'Identified edge-case packet drops & reconnect bugs',
        'Stress-tested high-concurrency tunnel sessions'
      ]
    },
    {
      id: 'lokesh',
      name: 'Lokesh',
      initials: 'L',
      role: 'Senior Bug Finder & QA Specialist',
      categories: ['bugfinder', 'qa'],
      badges: [
        { label: 'Bug Finder', type: 'bugfinder' },
        { label: 'QA Specialist', type: 'qa' }
      ],
      description: 'Tenacious bug hunter who rigorously scrutinized network edge cases, request header serialization, and traffic inspector rendering glitches under heavy loads.',
      highlights: [
        'Discovered traffic inspector parsing anomalies',
        'Validated Windows socket binding recoveries'
      ]
    },
    {
      id: 'harsha',
      name: 'Harsha',
      initials: 'H',
      role: 'Strategic Advisory & QA',
      categories: ['strategic', 'qa'],
      badges: [
        { label: 'Strategic', type: 'strategic' },
        { label: 'Quality Assurance', type: 'qa' }
      ],
      description: 'Offered pivotal product strategy insights and developer workflow audits, ensuring SHARE PORT remains effortless for both beginner and senior backend developers.',
      highlights: [
        'Workflow optimization & strategic release testing',
        'Full-stack integration verification (React + FastAPI)'
      ]
    },
    {
      id: 'hema-satish',
      name: 'Hema Satish',
      initials: 'HS',
      role: 'Lead Bug Hunter & Stability QA',
      categories: ['bugfinder', 'qa'],
      badges: [
        { label: 'Bug Finder', type: 'bugfinder' },
        { label: 'Stability QA', type: 'qa' }
      ],
      description: 'Instrumental in tracking down tricky concurrency race conditions, sudden process crash vectors, and port re-allocation failures during rapid start/stop cycles.',
      highlights: [
        'Caught rapid restart race conditions in tunnel daemon',
        'Hardened desktop client crash prevention'
      ]
    },
    {
      id: 'sesank',
      name: 'Sesank',
      initials: 'S',
      role: 'Strategic QA & Performance Tester',
      categories: ['strategic', 'qa'],
      badges: [
        { label: 'Strategic QA', type: 'strategic' },
        { label: 'Performance', type: 'qa' }
      ],
      description: 'Specialized in performance benchmarking, measuring response latency overhead, and evaluating memory footprints under sustained long-running webhook tunnel sessions.',
      highlights: [
        'Benchmark throughput and latency overhead checks',
        'Webhook delivery validation (Stripe, Razorpay, GitHub)'
      ]
    },
    {
      id: 'manaswi',
      name: 'Manaswi',
      initials: 'M',
      role: 'Quality Assurance & UI/UX Validator',
      categories: ['qa'],
      badges: [
        { label: 'Quality Assurance', type: 'qa' },
        { label: 'UI/UX QA', type: 'core' }
      ],
      description: 'Meticulously audited desktop and web interface responsiveness, interactive states, dark/light contrast accessibility, and seamless one-click copying mechanisms.',
      highlights: [
        'UI polish, button states, and layout accessibility',
        'Live status pill & visual feedback verification'
      ]
    },
    {
      id: 'imran',
      name: 'Imran',
      initials: 'I',
      role: 'Bug Finder & Network Edge Tester',
      categories: ['bugfinder', 'qa'],
      badges: [
        { label: 'Bug Finder', type: 'bugfinder' },
        { label: 'Network Edge', type: 'qa' }
      ],
      description: 'Discovered and diagnosed intricate SSL certificate handshake edge cases, cross-network NAT traversal glitches, and automatic tunnel reconnection behaviors after internet dropouts.',
      highlights: [
        'Handled internet dropout re-connection loop fixes',
        'SSL certificate error isolation & gateway stability'
      ]
    },
    {
      id: 'bhavani',
      name: 'Bhavani',
      initials: 'B',
      role: 'Quality Assurance & Feature Testing',
      categories: ['qa', 'strategic'],
      badges: [
        { label: 'Quality Assurance', type: 'qa' },
        { label: 'Feature QA', type: 'strategic' }
      ],
      description: 'Executed end-to-end regression test suites for API testing collections, cURL code generation, and multi-port custom configurations across diverse web stacks.',
      highlights: [
        'API collection runner & response inspector testing',
        'Multi-environment compatibility (Node, Python, Go)'
      ]
    },
    {
      id: 'koti',
      name: 'Koti',
      initials: 'K',
      role: 'Core Bug Hunter & Tunnel QA',
      categories: ['bugfinder', 'qa'],
      badges: [
        { label: 'Bug Finder', type: 'bugfinder' },
        { label: 'Tunnel QA', type: 'qa' }
      ],
      description: 'Tested extreme boundary conditions including locked port recovery, simultaneous multi-window processes, and rapid port switching stability without orphan daemons.',
      highlights: [
        'Eliminated orphan tunnel daemon background processes',
        'Boundary condition stress tests & port freeing'
      ]
    }
  ];

  const filteredContributors = contributors.filter(c => {
    const q = searchQuery.trim().toLowerCase();
    const matchesQuery = !q ||
      c.name.toLowerCase().includes(q) ||
      c.role.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q) ||
      c.highlights.some(h => h.toLowerCase().includes(q));

    const matchesFilter = activeFilter === 'all' || c.categories.includes(activeFilter);

    return matchesQuery && matchesFilter;
  });

  return (
    <div className="fluid-container" style={{ maxWidth: '100%', background: '#FFFFFF', padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header Banner */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '20px' }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#F0FDFA', border: '1px solid #99F6E4', color: '#0D9488', fontSize: '11px', fontWeight: '800', padding: '4px 12px', borderRadius: '20px', marginBottom: '8px' }}>
            <Award size={13} />
            <span>THE PEOPLE BEHIND SHARE PORT</span>
          </div>
          <h1 style={{ fontSize: '26px', fontWeight: '800', color: 'var(--text-main)', margin: 0 }}>
            Contributors & QA Champions
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
            Celebrating our strategic QA leads, thorough quality testers, and elite bug finders who made SHARE PORT solid.
          </p>
        </div>

        {/* Quick Summary Pill */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <div style={{ background: '#F8FAFC', border: '1px solid var(--border)', padding: '10px 18px', borderRadius: '12px', textAlign: 'center' }}>
            <div style={{ fontSize: '18px', fontWeight: '800', color: '#0D9488' }}>11</div>
            <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)' }}>Core Contributors</div>
          </div>
          <div style={{ background: '#F8FAFC', border: '1px solid var(--border)', padding: '10px 18px', borderRadius: '12px', textAlign: 'center' }}>
            <div style={{ fontSize: '18px', fontWeight: '800', color: '#0D9488' }}>100+</div>
            <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)' }}>Bugs Resolved</div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div style={{
        background: '#FFFFFF',
        border: '1px solid var(--border)',
        borderRadius: '14px',
        padding: '12px 18px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        boxShadow: 'var(--shadow-sm)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '240px' }}>
          <Search size={16} style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search contributor by name, role, or skill..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              border: 'none',
              outline: 'none',
              fontSize: '13.5px',
              fontFamily: 'inherit',
              color: 'var(--text-main)',
              background: 'transparent'
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {[
            { id: 'all', label: 'All Contributors (11)' },
            { id: 'strategic', label: 'Strategic QA' },
            { id: 'qa', label: 'Quality Assurance' },
            { id: 'bugfinder', label: 'Bug Finders' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveFilter(tab.id)}
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '12.5px',
                fontWeight: '700',
                cursor: 'pointer',
                background: activeFilter === tab.id ? '#F0FDFA' : '#FFFFFF',
                color: activeFilter === tab.id ? '#0D9488' : 'var(--text-muted)',
                border: activeFilter === tab.id ? '1px solid #99F6E4' : '1px solid var(--border)',
                transition: 'all 0.15s ease'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Contributors Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
        gap: '18px'
      }}>
        {filteredContributors.map(c => (
          <div
            key={c.id}
            className="sp-card"
            style={{
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '14px',
              background: '#FFFFFF',
              borderRadius: '16px',
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow-sm)'
            }}
          >
            <div>
              {/* Card Top: Avatar + Name + Title */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                <div style={{
                  width: '46px',
                  height: '46px',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, #F0FDFA 0%, #CCFBF1 100%)',
                  border: '1.5px solid #99F6E4',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '18px',
                  fontWeight: '800',
                  color: '#0D9488',
                  flexShrink: 0
                }}>
                  {c.initials}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ fontSize: '17px', fontWeight: '800', color: 'var(--text-main)', margin: '0 0 2px 0' }}>
                    {c.name}
                  </h3>
                  <div style={{ fontSize: '12.5px', fontWeight: '700', color: '#0D9488', margin: '0 0 6px 0' }}>
                    {c.role}
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {c.badges.map((b, bIdx) => {
                      let bg = '#EFF6FF';
                      let color = '#1D4ED8';
                      let border = '#BFDBFE';
                      if (b.type === 'strategic') {
                        bg = '#F0FDF4'; color = '#15803D'; border = '#BBF7D0';
                      } else if (b.type === 'bugfinder') {
                        bg = '#FFFBEB'; color = '#B45309'; border = '#FDE68A';
                      } else if (b.type === 'core') {
                        bg = '#F5F3FF'; color = '#6D28D9'; border = '#DDD6FE';
                      }
                      return (
                        <span
                          key={bIdx}
                          style={{
                            fontSize: '10.5px',
                            fontWeight: '700',
                            padding: '2px 8px',
                            borderRadius: '5px',
                            background: bg,
                            color: color,
                            border: `1px solid ${border}`
                          }}
                        >
                          {b.label}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Card Bio */}
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.5', margin: '14px 0 0 0' }}>
                {c.description}
              </p>
            </div>

            {/* Highlights bullets */}
            <div style={{
              background: '#F8FAFC',
              border: '1px solid var(--border)',
              borderRadius: '10px',
              padding: '10px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              fontSize: '11.5px',
              color: 'var(--text-muted)'
            }}>
              {c.highlights.map((h, hIdx) => (
                <div key={hIdx} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle2 size={13} style={{ color: '#0D9488', flexShrink: 0 }} />
                  <span>{h}</span>
                </div>
              ))}
            </div>
          </div>
        ))}

        {filteredContributors.length === 0 && (
          <div style={{
            gridColumn: '1 / -1',
            textAlign: 'center',
            padding: '40px 20px',
            background: '#F8FAFC',
            border: '1px dashed var(--border)',
            borderRadius: '12px',
            color: 'var(--text-muted)'
          }}>
            <p style={{ margin: 0, fontWeight: '600' }}>No contributors found matching "{searchQuery}"</p>
          </div>
        )}
      </div>

      {/* Footer Banner */}
      <div style={{
        marginTop: '12px',
        background: '#FFFFFF',
        border: '1px solid var(--border)',
        borderRadius: '16px',
        padding: '20px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px',
        boxShadow: 'var(--shadow-sm)'
      }}>
        <div>
          <h4 style={{ fontSize: '15px', fontWeight: '800', color: 'var(--text-main)', margin: '0 0 4px 0' }}>
            Want to contribute or report an issue?
          </h4>
          <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', margin: 0 }}>
            Send us feedback, edge cases, or QA reports directly to help refine SHARE PORT.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => SystemAPI.openExternal("mailto:ibm.145285366@gmail.com?subject=SHARE%20PORT%20Bug%20Report%20%2F%20Contribution")}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              borderRadius: '8px',
              background: '#0D9488',
              color: '#FFFFFF',
              fontSize: '12px',
              fontWeight: '700',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            <Mail size={13} />
            <span>Send QA / Bug Report</span>
          </button>

          <button
            onClick={() => SystemAPI.openExternal("https://www.shareport.in/contributors")}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              borderRadius: '8px',
              background: '#F0FDFA',
              border: '1px solid #99F6E4',
              color: '#0D9488',
              fontSize: '12px',
              fontWeight: '700',
              cursor: 'pointer'
            }}
          >
            <ExternalLink size={13} />
            <span>View on Web</span>
          </button>
        </div>
      </div>
    </div>
  );
}
