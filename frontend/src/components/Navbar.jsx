import {
  Radio,
  Sliders,
  FileText,
  Layers,
  RefreshCw,
  Play,
  Activity,
  Pause,
} from 'lucide-react';

const TABS = [
  { id: 'briefings', label: 'Live Briefings', shortLabel: 'Briefings', Icon: Radio },
  { id: 'tuner', label: 'Weight Tuner', shortLabel: 'Weights', Icon: Sliders, badge: 'BONUS' },
  { id: 'audit', label: 'Audit Trail', shortLabel: 'Audit', Icon: FileText },
  { id: 'architecture', label: 'Architecture', shortLabel: 'Architecture', Icon: Layers },
];

export default function Navbar({
  activeTab,
  setActiveTab,
  autoRefresh,
  setAutoRefresh,
  backendOnline,
  totalEvents,
  onOpenSimulate,
  onRefresh,
  refreshing,
}) {
  return (
    <>
      {/* Top Header */}
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: 'rgba(8, 11, 17, 0.85)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <div style={{
          maxWidth: '1280px',
          margin: '0 auto',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px'
        }}>
          {/* Logo & Status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #0284c7 0%, #6366f1 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 20px rgba(56, 189, 248, 0.4)',
              flexShrink: 0,
            }}>
              <Activity size={22} color="#ffffff" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h1 style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.03em' }}>
                  GlanceApp <span style={{ color: 'var(--accent-cyan)' }}>93</span>
                </h1>
                <span style={{
                  fontSize: '0.65rem',
                  padding: '2px 7px',
                  borderRadius: '999px',
                  background: 'rgba(56, 189, 248, 0.15)',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                  color: 'var(--accent-cyan)',
                  fontWeight: 700,
                }}>
                  MOBILE MVP
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                <span
                  className="pulsing-dot"
                  style={{
                    backgroundColor: backendOnline ? '#10b981' : '#f43f5e',
                    boxShadow: backendOnline ? '0 0 8px #10b981' : '0 0 8px #f43f5e',
                    flexShrink: 0,
                  }}
                />
                <span>{backendOnline ? 'Cloud Engine Online' : 'API Unreachable'}</span>
                <span>•</span>
                <span>{totalEvents} events in memory</span>
              </div>
            </div>
          </div>

          {/* Desktop Navigation Tabs */}
          <nav className="desktop-nav" style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'rgba(15, 23, 42, 0.8)',
            padding: '4px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)'
          }}>
            {TABS.map(({ id, label, Icon, badge }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                aria-current={activeTab === id ? 'page' : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 14px',
                  borderRadius: '8px',
                  border: 'none',
                  background: activeTab === id ? 'rgba(56, 189, 248, 0.18)' : 'transparent',
                  color: activeTab === id ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                  fontWeight: activeTab === id ? 600 : 500,
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                <Icon size={16} />
                <span>{label}</span>
                {badge && (
                  <span style={{
                    fontSize: '0.65rem',
                    padding: '1px 5px',
                    borderRadius: '4px',
                    background: 'rgba(250, 204, 21, 0.2)',
                    color: '#fde047',
                    fontWeight: 700,
                  }}>{badge}</span>
                )}
              </button>
            ))}
          </nav>

          {/* Quick Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Manual refresh. `onRefresh` used to be passed in by App and never
                wired to anything, so pausing the poll left no way to refresh. */}
            <button
              onClick={onRefresh}
              disabled={refreshing}
              title="Refresh briefings now"
              aria-label="Refresh briefings now"
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '8px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
                background: 'rgba(255, 255, 255, 0.04)',
                color: 'var(--text-secondary)',
                cursor: refreshing ? 'not-allowed' : 'pointer',
              }}
            >
              <RefreshCw size={14} className={refreshing ? 'spin-icon' : ''} />
            </button>

            {/* Auto refresh toggle */}
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              aria-pressed={autoRefresh}
              title={autoRefresh ? 'Auto-refresh active (every 8s)' : 'Auto-refresh paused'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
                background: autoRefresh ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.04)',
                color: autoRefresh ? '#34d399' : 'var(--text-muted)',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {autoRefresh ? <Radio size={14} /> : <Pause size={14} />}
              <span className="hide-on-mobile">{autoRefresh ? 'Live Poll' : 'Paused'}</span>
            </button>

            {/* Simulate Batch Trigger */}
            <button
              onClick={onOpenSimulate}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 14px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                background: 'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)',
                color: '#ffffff',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(37, 99, 235, 0.35)',
                transition: 'transform 0.15s ease, box-shadow 0.15s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              <Play size={15} fill="#ffffff" />
              <span className="hide-on-mobile">Simulate Streams</span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Navigation Bar */}
      <div className="mobile-bottom-nav" style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 60,
        background: 'rgba(8, 11, 17, 0.95)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTop: '1px solid var(--border-subtle)',
        display: 'flex',
        justifyContent: 'space-around',
        padding: '8px 4px',
      }}>
        {TABS.map(({ id, shortLabel, Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            aria-current={activeTab === id ? 'page' : undefined}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              background: 'none',
              border: 'none',
              color: activeTab === id ? 'var(--accent-cyan)' : 'var(--text-muted)',
              fontSize: '0.7rem',
              fontWeight: 600,
              cursor: 'pointer',
              padding: '4px 12px',
            }}
          >
            <Icon size={20} />
            <span>{shortLabel}</span>
          </button>
        ))}
      </div>
    </>
  );
}
