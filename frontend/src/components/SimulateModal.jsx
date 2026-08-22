import React, { useState } from 'react';
import { X, Play, RefreshCw, Trash2, CheckCircle2, AlertCircle, Sparkles, Server, GitBranch, AlertOctagon } from 'lucide-react';

export default function SimulateModal({ onClose, onSimulated, onReset, apiBase = '' }) {
  const [count, setCount] = useState(15);
  const [source, setSource] = useState('all');
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  const handleSimulate = async () => {
    setLoading(true);
    setStatusMsg('');
    try {
      let url = `${apiBase}/api/events/simulate?count=${count}`;
      if (source !== 'all') {
        url += `&source=${source}`;
      }

      const res = await fetch(url, { method: 'POST' });
      if (!res.ok) throw new Error('Simulation request failed');
      const data = await res.json();
      setStatusMsg(`✅ Ingested ${data.count || count} events into the pipeline!`);
      if (onSimulated) onSimulated();
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err) {
      setStatusMsg(`❌ Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm('Clear all stored events and reset audit logs for a fresh demo run?')) return;
    setResetting(true);
    setStatusMsg('');
    try {
      const res = await fetch(`${apiBase}/api/events/reset`, { method: 'POST' });
      if (!res.ok) throw new Error('Reset failed');
      setStatusMsg('🧹 Event store and audit log cleared!');
      if (onReset) onReset();
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err) {
      setStatusMsg(`❌ Error: ${err.message}`);
    } finally {
      setResetting(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 100,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px',
      background: 'rgba(4, 7, 13, 0.82)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
    }}>
      <div 
        className="glass-panel"
        style={{
          width: '100%',
          maxWidth: '520px',
          padding: '24px',
          border: '1px solid var(--border-medium)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ padding: '6px', borderRadius: '8px', background: 'rgba(56, 189, 248, 0.15)', color: 'var(--accent-cyan)' }}>
              <Play size={18} fill="var(--accent-cyan)" />
            </div>
            <div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800 }}>Simulate Event Stream</h3>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Ingest synthetic cloud events across all 3 simulated sources
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: 'none',
              color: 'var(--text-secondary)',
              padding: '6px',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Source selector */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600, display: 'block', marginBottom: '8px' }}>
            SELECT STREAM SOURCE
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <button
              onClick={() => setSource('all')}
              style={{
                padding: '10px',
                borderRadius: '8px',
                border: source === 'all' ? '1px solid var(--accent-cyan)' : '1px solid var(--border-subtle)',
                background: source === 'all' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                color: source === 'all' ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                textAlign: 'center'
              }}
            >
              🌟 All 3 Sources (Mixed)
            </button>

            <button
              onClick={() => setSource('infra-monitor')}
              style={{
                padding: '10px',
                borderRadius: '8px',
                border: source === 'infra-monitor' ? '1px solid var(--accent-cyan)' : '1px solid var(--border-subtle)',
                background: source === 'infra-monitor' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                color: source === 'infra-monitor' ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                textAlign: 'center',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              <Server size={14} /> Infra Monitor
            </button>

            <button
              onClick={() => setSource('deploy-pipeline')}
              style={{
                padding: '10px',
                borderRadius: '8px',
                border: source === 'deploy-pipeline' ? '1px solid var(--accent-cyan)' : '1px solid var(--border-subtle)',
                background: source === 'deploy-pipeline' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                color: source === 'deploy-pipeline' ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                textAlign: 'center',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              <GitBranch size={14} /> Deploy Pipeline
            </button>

            <button
              onClick={() => setSource('error-tracker')}
              style={{
                padding: '10px',
                borderRadius: '8px',
                border: source === 'error-tracker' ? '1px solid var(--accent-cyan)' : '1px solid var(--border-subtle)',
                background: source === 'error-tracker' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                color: source === 'error-tracker' ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                textAlign: 'center',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              <AlertOctagon size={14} /> Error Tracker
            </button>
          </div>
        </div>

        {/* Batch Size Selector */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600, display: 'block', marginBottom: '8px' }}>
            BATCH SIZE
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            {[5, 15, 30, 50].map((n) => (
              <button
                key={n}
                onClick={() => setCount(n)}
                style={{
                  flex: 1,
                  padding: '8px',
                  borderRadius: '6px',
                  border: count === n ? '1px solid var(--accent-cyan)' : '1px solid var(--border-subtle)',
                  background: count === n ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                  color: count === n ? 'var(--accent-cyan)' : 'var(--text-main)',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                {n} Events
              </button>
            ))}
          </div>
        </div>

        {statusMsg && (
          <div style={{
            padding: '10px 14px',
            borderRadius: '8px',
            background: 'rgba(56, 189, 248, 0.12)',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            fontSize: '0.85rem',
            color: '#e0f2fe',
            marginBottom: '16px'
          }}>
            {statusMsg}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={handleSimulate}
            disabled={loading}
            style={{
              flex: 2,
              padding: '12px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              background: 'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: '0.9rem',
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 4px 14px rgba(37, 99, 235, 0.35)',
            }}
          >
            <Play size={16} fill="#ffffff" />
            <span>{loading ? 'Ingesting Batch...' : `Send ${count} Events`}</span>
          </button>

          <button
            onClick={handleReset}
            disabled={resetting}
            title="Reset event store and audit trail"
            style={{
              flex: 1,
              padding: '12px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              background: 'rgba(244, 63, 94, 0.1)',
              color: 'var(--sev-critical)',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: resetting ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
          >
            <Trash2 size={16} />
            <span>Reset</span>
          </button>
        </div>
      </div>
    </div>
  );
}
