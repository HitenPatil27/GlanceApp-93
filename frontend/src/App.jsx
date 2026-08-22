import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Navbar from './components/Navbar';
import StatsCards from './components/StatsCards';
import BriefingCard from './components/BriefingCard';
import EventDetailModal from './components/EventDetailModal';
import WeightTuner from './components/WeightTuner';
import AuditTrail from './components/AuditTrail';
import ArchitectureView from './components/ArchitectureView';
import SimulateModal from './components/SimulateModal';
import { Search, AlertTriangle, RefreshCw, Zap } from 'lucide-react';

const API_BASE = ''; // uses Vite proxy in dev, same origin in prod
const POLL_INTERVAL_MS = 8000;

export default function App() {
  const [activeTab, setActiveTab] = useState('briefings'); // 'briefings' | 'tuner' | 'audit' | 'architecture'
  const [briefings, setBriefings] = useState([]);
  const [totalEvents, setTotalEvents] = useState(0);
  const [weights, setWeights] = useState(null);
  const [genai, setGenai] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [backendOnline, setBackendOnline] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSource, setSelectedSource] = useState('all');
  const [selectedSeverity, setSelectedSeverity] = useState('all');
  const [sortBy] = useState('rank'); // 'rank' | 'score' | 'newest'

  // Modals
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [showSimulateModal, setShowSimulateModal] = useState(false);

  // In-flight request, so an 8s poll that overlaps a slow response cannot
  // resolve out of order and overwrite fresher data with staler data.
  const inFlight = useRef(null);

  const fetchBriefings = useCallback(async (isBackground = false) => {
    if (inFlight.current) inFlight.current.abort();
    const controller = new AbortController();
    inFlight.current = controller;

    if (isBackground) setRefreshing(true);
    else setLoading(true);

    try {
      const [healthRes, briefingsRes] = await Promise.all([
        fetch(`${API_BASE}/api/health`, { signal: controller.signal }),
        fetch(`${API_BASE}/api/briefings?limit=50&explain_top=15`, { signal: controller.signal }),
      ]);

      setBackendOnline(healthRes.ok);
      if (healthRes.ok) {
        const health = await healthRes.json();
        setGenai(health.genai || null);
      }

      if (!briefingsRes.ok) {
        // A structured error from the API is far more actionable than a blank
        // feed, which is what the previous version silently showed.
        let detail = `HTTP ${briefingsRes.status}`;
        try {
          const body = await briefingsRes.json();
          if (body?.detail) detail = body.detail;
        } catch {
          /* non-JSON error body — keep the status code */
        }
        throw new Error(detail);
      }

      const data = await briefingsRes.json();
      setBriefings(data.briefings || []);
      setTotalEvents(data.total || 0);
      setWeights(data.weights || null);
      setErrorMsg('');
    } catch (err) {
      if (err.name === 'AbortError') return; // superseded by a newer request
      console.error('Error fetching briefings', err);
      setBackendOnline(false);
      setErrorMsg(
        err.message === 'Failed to fetch'
          ? 'Cannot reach the GlanceApp API. Is the backend running on port 8000?'
          : err.message || 'Unexpected error while loading briefings.'
      );
    } finally {
      if (inFlight.current === controller) inFlight.current = null;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchBriefings();
    return () => {
      if (inFlight.current) inFlight.current.abort();
    };
  }, [fetchBriefings]);

  // Auto-refresh poll
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => fetchBriefings(true), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchBriefings]);

  const filteredBriefings = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return briefings
      .filter(event => {
        if (q) {
          const haystack = [event.title, event.service, event.region, event.explanation]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          if (!haystack.includes(q)) return false;
        }
        if (selectedSource !== 'all' && event.source !== selectedSource) return false;
        if (selectedSeverity !== 'all' && event.severity !== selectedSeverity) return false;
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'newest') return new Date(b.timestamp) - new Date(a.timestamp);
        if (sortBy === 'score') return (b.score ?? 0) - (a.score ?? 0);
        return (a.rank ?? 0) - (b.rank ?? 0);
      });
  }, [briefings, searchQuery, selectedSource, selectedSeverity, sortBy]);

  // Keep an open detail modal in sync with each poll. Previously the modal held
  // the object captured at click time, so its score and explanation froze even
  // as the card behind it was re-ranked and upgraded to real Gen AI text.
  useEffect(() => {
    setSelectedEvent(current => {
      if (!current) return current;
      const fresh = briefings.find(b => b.id === current.id);
      return fresh ? { ...current, ...fresh } : current;
    });
  }, [briefings]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        autoRefresh={autoRefresh}
        setAutoRefresh={setAutoRefresh}
        backendOnline={backendOnline}
        totalEvents={totalEvents}
        onOpenSimulate={() => setShowSimulateModal(true)}
        onRefresh={() => fetchBriefings(true)}
        refreshing={refreshing}
      />

      <main className="app-container" style={{ flex: 1, width: '100%' }}>
        {/* Recoverable error state (PRD: "clear, recoverable error states") */}
        {errorMsg && (
          <div
            role="alert"
            className="glass-panel"
            style={{
              padding: '14px 18px',
              marginBottom: '18px',
              borderColor: 'var(--sev-critical-border)',
              background: 'var(--sev-critical-bg)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <AlertTriangle size={18} color="var(--sev-critical)" />
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--sev-critical)' }}>
                  Briefing feed degraded
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  {errorMsg}
                  {briefings.length > 0 && ' Showing the last successful snapshot.'}
                </div>
              </div>
            </div>
            <button
              onClick={() => fetchBriefings(true)}
              disabled={refreshing}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--sev-critical-border)',
                background: 'rgba(255, 255, 255, 0.06)',
                color: 'var(--text-main)',
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: refreshing ? 'not-allowed' : 'pointer',
              }}
            >
              <RefreshCw size={14} className={refreshing ? 'spin-icon' : ''} />
              <span>{refreshing ? 'Retrying...' : 'Retry now'}</span>
            </button>
          </div>
        )}

        {/* Tab 1: Briefings */}
        {activeTab === 'briefings' && (
          <div>
            <StatsCards briefings={briefings} total={totalEvents} weights={weights} genai={genai} />

            {/* Filter and Search Bar */}
            <div className="glass-panel" style={{ padding: '16px 18px', marginBottom: '20px' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'rgba(15, 23, 42, 0.7)',
                  border: '1px solid var(--border-subtle)',
                  padding: '8px 14px',
                  borderRadius: 'var(--radius-sm)',
                  flex: '1 1 240px'
                }}>
                  <Search size={16} color="var(--text-muted)" />
                  <input
                    type="text"
                    aria-label="Search incidents"
                    placeholder="Search incidents, services, regions..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-main)',
                      fontSize: '0.85rem',
                      outline: 'none',
                      width: '100%'
                    }}
                  />
                </div>

                {/* Source Filter Tabs */}
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {[
                    { id: 'all', label: 'All Sources' },
                    { id: 'infra-monitor', label: 'Infra' },
                    { id: 'deploy-pipeline', label: 'Deploys' },
                    { id: 'error-tracker', label: 'Errors' },
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setSelectedSource(tab.id)}
                      aria-pressed={selectedSource === tab.id}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '6px',
                        border: 'none',
                        background: selectedSource === tab.id ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                        color: selectedSource === tab.id ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Severity Filter */}
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {[
                    { id: 'all', label: 'All Sev' },
                    { id: 'critical', label: 'Critical' },
                    { id: 'high', label: 'High' },
                    { id: 'medium', label: 'Medium' },
                    { id: 'low', label: 'Low' },
                  ].map(sev => (
                    <button
                      key={sev.id}
                      onClick={() => setSelectedSeverity(sev.id)}
                      aria-pressed={selectedSeverity === sev.id}
                      style={{
                        padding: '6px 10px',
                        borderRadius: '6px',
                        border: 'none',
                        background: selectedSeverity === sev.id ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.04)',
                        color: sev.id === 'critical' ? 'var(--sev-critical)'
                          : sev.id === 'high' ? 'var(--sev-high)'
                          : sev.id === 'medium' ? 'var(--sev-medium)'
                          : sev.id === 'low' ? 'var(--sev-low)'
                          : 'var(--text-secondary)',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      {sev.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Briefings List */}
            {loading && briefings.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {[1, 2, 3].map(i => (
                  <div key={i} className="glass-panel" style={{ height: '140px', padding: '20px' }}>
                    <div className="skeleton" style={{ width: '40%', height: '20px', marginBottom: '14px' }} />
                    <div className="skeleton" style={{ width: '80%', height: '16px', marginBottom: '10px' }} />
                    <div className="skeleton" style={{ width: '60%', height: '14px' }} />
                  </div>
                ))}
              </div>
            ) : filteredBriefings.length === 0 ? (
              <div className="glass-panel" style={{ padding: '60px 20px', textAlign: 'center' }}>
                <div style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: 'rgba(56, 189, 248, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px',
                  color: 'var(--accent-cyan)'
                }}>
                  <Zap size={30} />
                </div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '8px' }}>
                  {briefings.length === 0 ? 'No Events in Pipeline' : 'No Events Match These Filters'}
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: '400px', margin: '0 auto 20px' }}>
                  {briefings.length === 0
                    ? 'Start by generating synthetic cloud streams to observe the multi-factor ranking and Gen AI triage in action.'
                    : `${briefings.length} event(s) are loaded but hidden by the current search or filters.`}
                </p>
                {briefings.length === 0 ? (
                  <button
                    onClick={() => setShowSimulateModal(true)}
                    style={{
                      padding: '12px 24px',
                      borderRadius: 'var(--radius-sm)',
                      border: 'none',
                      background: 'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)',
                      color: '#ffffff',
                      fontWeight: 700,
                      fontSize: '0.9rem',
                      cursor: 'pointer',
                      boxShadow: '0 4px 14px rgba(37, 99, 235, 0.4)',
                    }}
                  >
                    🚀 Ingest Demo Stream (15 Events)
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedSource('all');
                      setSelectedSeverity('all');
                    }}
                    style={{
                      padding: '10px 20px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-subtle)',
                      background: 'rgba(255, 255, 255, 0.05)',
                      color: 'var(--text-main)',
                      fontWeight: 600,
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                    }}
                  >
                    Clear all filters
                  </button>
                )}
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', padding: '0 4px' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                    SHOWING {filteredBriefings.length} OF {totalEvents} RANKED EVENTS
                  </span>
                  <span style={{ fontSize: '0.75rem', color: autoRefresh ? 'var(--accent-cyan)' : 'var(--text-muted)' }}>
                    {autoRefresh ? 'Auto-refreshed every 8s' : 'Auto-refresh paused'}
                  </span>
                </div>

                {filteredBriefings.map(event => (
                  <BriefingCard
                    key={event.id}
                    event={event}
                    onSelect={setSelectedEvent}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Weight Tuner (Operator Feedback Loop) */}
        {activeTab === 'tuner' && (
          <WeightTuner
            currentWeights={weights}
            onWeightsUpdated={(newW) => {
              setWeights(newW);
              fetchBriefings(true);
            }}
            apiBase={API_BASE}
          />
        )}

        {/* Tab 3: Audit Log */}
        {activeTab === 'audit' && <AuditTrail apiBase={API_BASE} />}

        {/* Tab 4: Architecture */}
        {activeTab === 'architecture' && <ArchitectureView />}
      </main>

      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          apiBase={API_BASE}
        />
      )}

      {showSimulateModal && (
        <SimulateModal
          onClose={() => setShowSimulateModal(false)}
          onSimulated={() => fetchBriefings(true)}
          onReset={() => fetchBriefings(true)}
          apiBase={API_BASE}
        />
      )}
    </div>
  );
}
