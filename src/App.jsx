import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import LandingPage from './components/LandingPage';
import SharePortView from './components/SharePort/SharePortView';
import TrafficInspector from './components/SharePort/TrafficInspector';
import ApiTestingView from './components/ApiTesting/ApiTestingView';
import ProfilesView from './components/Profiles/ProfilesView';
import ConsoleView from './components/Console/ConsoleView';
import AboutView from './components/About/AboutView';
import { TunnelAPI, InspectorAPI } from './services/api';

export default function App() {
  const [activeTab, setActiveTab] = useState('home'); // home, shareport, apitesting, inspector, profiles, console, about
  const [tunnelState, setTunnelState] = useState({
    status: 'STOPPED',
    publicUrl: '',
    localPort: 3000,
    provider: 'cloudflare',
    mode: 'fixed',
    subdomain: '',
    error: ''
  });
  const [inspectorLogs, setInspectorLogs] = useState([]);

  useEffect(() => {
    async function init() {
      const status = await TunnelAPI.getStatus();
      if (status) setTunnelState(status);

      const logs = await InspectorAPI.getLogs();
      if (logs) setInspectorLogs(logs);
    }
    init();

    const unsubscribeTunnel = TunnelAPI.onStatusChange((updated) => {
      setTunnelState(updated);
    });

    const unsubscribeInspector = InspectorAPI.onNewLog((newLog) => {
      setInspectorLogs(prev => [newLog, ...prev.slice(0, 199)]);
    });

    return () => {
      if (unsubscribeTunnel) unsubscribeTunnel();
      if (unsubscribeInspector) unsubscribeInspector();
    };
  }, []);

  return (
    <div style={{ minHeight: '100vh', width: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-app)' }}>
      {/* Top Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        tunnelState={tunnelState}
      />

      {/* Main Full-Width Content Router with page scrolling enabled */}
      <main style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column' }}>
        {activeTab === 'home' && (
          <LandingPage
            setActiveTab={setActiveTab}
            tunnelState={tunnelState}
          />
        )}

        {activeTab === 'shareport' && (
          <SharePortView
            tunnelState={tunnelState}
            logs={inspectorLogs}
            setLogs={setInspectorLogs}
          />
        )}

        {activeTab === 'apitesting' && (
          <ApiTestingView />
        )}

        {activeTab === 'inspector' && (
          <div className="fluid-container" style={{ width: '100%' }}>
            <TrafficInspector
              logs={inspectorLogs}
              setLogs={setInspectorLogs}
            />
          </div>
        )}

        {activeTab === 'profiles' && (
          <ProfilesView
            onLaunchProfile={(p) => {
              setActiveTab('shareport');
            }}
          />
        )}

        {activeTab === 'console' && (
          <ConsoleView />
        )}

        {activeTab === 'about' && (
          <AboutView setActiveTab={setActiveTab} />
        )}
      </main>
    </div>
  );
}
