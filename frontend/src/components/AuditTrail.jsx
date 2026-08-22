import React, { useState, useEffect } from 'react';
import { FileText, RefreshCw, Search, Filter, Clock, Shield } from 'lucide-react';

export default function AuditTrail({ apiBase = '' }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterAction, setFilterAction] = useState('all');
  const [searchId, setSearchId] = useState('');

  const fetchAudit = async () => {
    setLoading(true);
    try {
      let url = `${apiBase}/api/audit?limit=200`;
      if (searchId.trim()) {
        url += `&event_id=${encodeURIComponent(searchId.trim())}`;
      }
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setEntries(data);
      }
    } catch (err) {
      console.error('Error fetching audit trail', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAudit();
  }, [searchId]);

  const filteredEntries = entries.filter(e => {
    if (filterAction === 'all') return true;
    return e.action === filterAction;
  });

  const getActionBadgeClass = (action) => {
    switch (action) {
      case 'ingested': return 'badge-low';
      case 'scored': return 'badge-medium';
      case 'explained': return 'badge-high';
      case 'weights_updated': return 'badge-critical';
      default: return 'badge-source';
    }
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
      {/* Header */}
      <div className="glass-panel" style={{ padding: '22px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <FileText size={20} color="var(--accent-cyan)" />
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800 }}>System Processing Audit Trail</h2>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Append-only processing audit record satisfying compliance and transparency requirements.
            </p>
          </div>

          <button
            onClick={fetchAudit}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1px solid var(--border-subtle)',
              background: 'rgba(255, 255, 255, 0.05)',
              color: 'var(--text-main)',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <RefreshCw size={14} className={loading ? "spin-icon" : ""} />
            <span>Refresh Log</span>
          </button>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '10px', marginTop: '16px', flexWrap: 'wrap' }}>
          {/* Search by event ID */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(15, 23, 42, 0.7)',
            border: '1px solid var(--border-subtle)',
            padding: '6px 12px',
            borderRadius: '8px',
            flex: '1 1 200px'
          }}>
            <Search size={14} color="var(--text-muted)" />
            <input
              type="text"
              placeholder="Search by Event ID..."
              value={searchId}
              onChange={(e) => setSearchId(e.target.value)}
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

          {/* Action Filter */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {['all', 'ingested', 'scored', 'explained', 'served', 'weights_updated'].map(action => (
              <button
                key={action}
                onClick={() => setFilterAction(action)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  background: filterAction === action ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                  color: filterAction === action ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  cursor: 'pointer'
                }}
              >
                {action.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Audit Log Table / Stream */}
      <div className="glass-panel" style={{ padding: '16px', overflowX: 'auto' }}>
        {loading && entries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
            Loading audit entries...
          </div>
        ) : filteredEntries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
            No audit log entries matching filters.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {filteredEntries.map((entry, idx) => (
              <div 
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: '12px',
                  padding: '12px 14px',
                  borderRadius: '8px',
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid var(--border-subtle)',
                  fontSize: '0.85rem'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', flexWrap: 'wrap' }}>
                  <span className={`badge ${getActionBadgeClass(entry.action)}`}>
                    {entry.action}
                  </span>

                  {entry.event_id && (
                    <span className="mono" style={{ fontSize: '0.75rem', color: 'var(--accent-cyan)', background: 'rgba(56, 189, 248, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                      {entry.event_id}
                    </span>
                  )}

                  <span style={{ color: '#e2e8f0', wordBreak: 'break-word' }}>
                    {entry.detail}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-muted)', fontSize: '0.75rem', flexShrink: 0 }}>
                  <Clock size={12} />
                  <span className="mono">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
