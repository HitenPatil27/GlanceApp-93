import React from 'react';
import { AlertCircle, AlertTriangle, ShieldCheck, Flame, Server, Globe } from 'lucide-react';

export default function StatsCards({ briefings = [], total = 0, weights }) {
  // Compute analytics
  const criticalCount = briefings.filter(b => b.severity === 'critical').length;
  const highCount = briefings.filter(b => b.severity === 'high').length;
  const topScore = briefings.length > 0 ? briefings[0].score : 0;
  
  // Distinct regions & services
  const regions = new Set(briefings.map(b => b.region).filter(Boolean));
  const services = new Set(briefings.map(b => b.service).filter(Boolean));

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
      gap: '14px',
      marginBottom: '20px'
    }}>
      {/* Total Scored Events */}
      <div className="glass-panel" style={{ padding: '16px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Triaged Events
          </span>
          <Server size={18} color="var(--accent-cyan)" />
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
          <span style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-main)' }}>
            {total}
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>in real-time stream</span>
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--accent-cyan)', marginTop: '4px' }}>
          {services.size} services • {regions.size} regions
        </div>
      </div>

      {/* Critical Incidents */}
      <div className="glass-panel" style={{ padding: '16px 18px', borderColor: criticalCount > 0 ? 'var(--sev-critical-border)' : 'var(--border-subtle)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--sev-critical)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Critical Alerts
          </span>
          <AlertCircle size={18} color="var(--sev-critical)" />
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
          <span style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--sev-critical)' }}>
            {criticalCount}
          </span>
          {criticalCount > 0 && (
            <span className="badge badge-critical" style={{ fontSize: '0.65rem', padding: '1px 6px' }}>
              Action Required
            </span>
          )}
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
          Weight factor: {(weights?.severity * 100 || 35).toFixed(0)}% severity
        </div>
      </div>

      {/* High Severity */}
      <div className="glass-panel" style={{ padding: '16px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--sev-high)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            High Priority
          </span>
          <AlertTriangle size={18} color="var(--sev-high)" />
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
          <span style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--sev-high)' }}>
            {highCount}
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>events monitored</span>
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
          Automated Gen AI triage enabled
        </div>
      </div>

      {/* Peak Rank Score */}
      <div className="glass-panel" style={{ padding: '16px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ fontSize: '0.8rem', color: '#fbbf24', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Top Priority Score
          </span>
          <Flame size={18} color="#fbbf24" />
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
          <span className="mono gradient-text-gold" style={{ fontSize: '1.75rem', fontWeight: 800 }}>
            {topScore > 0 ? (topScore * 100).toFixed(1) : '0.0'}
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>/ 100 composite</span>
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
          Scored by multi-factor model
        </div>
      </div>
    </div>
  );
}
