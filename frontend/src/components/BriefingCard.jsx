import {
  Server,
  GitBranch,
  AlertOctagon,
  Clock,
  MapPin,
  Sparkles,
  ChevronRight,
  Layers,
  Zap,
  FileText,
} from 'lucide-react';

function getSourceIcon(source) {
  switch (source) {
    case 'infra-monitor':
      return <Server size={13} />;
    case 'deploy-pipeline':
      return <GitBranch size={13} />;
    case 'error-tracker':
      return <AlertOctagon size={13} />;
    default:
      return <Zap size={13} />;
  }
}

function getSourceLabel(source) {
  switch (source) {
    case 'infra-monitor':
      return 'Infra Alert';
    case 'deploy-pipeline':
      return 'CI/CD Deploy';
    case 'error-tracker':
      return 'App Error';
    default:
      return source || 'unknown';
  }
}

function formatRelativeTime(isoString) {
  const parsed = new Date(isoString);
  if (Number.isNaN(parsed.getTime())) return 'unknown time';
  const diff = (Date.now() - parsed.getTime()) / 1000;
  if (diff < 60) return `${Math.floor(Math.max(diff, 0))}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

/**
 * Label the explanation by where it actually came from.
 *
 * This card used to print "Gen AI Triage Briefing • Qwen 2.5 Inference" over
 * every explanation, including the deterministic template that gets used when
 * the LLM is unreachable — so the UI claimed AI output it never received.
 */
const EXPLANATION_SOURCES = {
  genai: {
    label: 'Gen AI Triage Briefing',
    note: '• Qwen 2.5 via Hugging Face',
    color: 'var(--accent-cyan)',
    bg: 'rgba(56, 189, 248, 0.15)',
    border: 'rgba(56, 189, 248, 0.2)',
    gradient: 'linear-gradient(135deg, rgba(56, 189, 248, 0.06) 0%, rgba(168, 85, 247, 0.06) 100%)',
    Icon: Sparkles,
  },
  fallback: {
    label: 'Rule-based briefing',
    note: '• template fallback, Gen AI unavailable',
    color: 'var(--sev-medium)',
    bg: 'rgba(250, 204, 21, 0.15)',
    border: 'rgba(250, 204, 21, 0.2)',
    gradient: 'rgba(250, 204, 21, 0.04)',
    Icon: FileText,
  },
};

export default function BriefingCard({ event, onSelect }) {
  const rank = event.rank ?? 0;
  const isTopRank = rank > 0 && rank <= 3;
  const isRankOne = rank === 1;

  const score = typeof event.score === 'number' ? event.score : 0;
  const scorePct = Math.min(Math.round(score * 100), 100);
  const bd = event.score_breakdown || { severity: 0, recency: 0, frequency: 0, blast_radius: 0 };
  const meta = EXPLANATION_SOURCES[event.explanation_source] || EXPLANATION_SOURCES.fallback;
  const { Icon: SourceIcon } = meta;

  return (
    <div
      className="glass-panel-interactive"
      role="button"
      tabIndex={0}
      onClick={() => onSelect(event)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(event);
        }
      }}
      style={{
        padding: '18px 20px',
        marginBottom: '14px',
        cursor: 'pointer',
        borderLeft: isRankOne
          ? '4px solid #fbbf24'
          : event.severity === 'critical'
          ? '4px solid var(--sev-critical)'
          : event.severity === 'high'
          ? '4px solid var(--sev-high)'
          : '4px solid var(--border-subtle)',
      }}
    >
      {/* Header Row: Rank, Badges, Timestamp */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '8px',
        marginBottom: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* Rank Badge */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: '32px',
            height: '24px',
            padding: '0 8px',
            borderRadius: '6px',
            fontWeight: 800,
            fontSize: '0.8rem',
            background: isRankOne
              ? 'linear-gradient(135deg, #fbbf24 0%, #d97706 100%)'
              : isTopRank
              ? 'rgba(255, 255, 255, 0.15)'
              : 'rgba(255, 255, 255, 0.05)',
            color: isRankOne ? '#000000' : '#ffffff',
            boxShadow: isRankOne ? '0 0 12px rgba(251, 191, 36, 0.4)' : 'none',
          }}>
            #{rank || '—'}
          </div>

          {/* Severity Badge */}
          <span className={`badge badge-${event.severity}`}>
            <span
              className="pulsing-dot"
              style={{
                backgroundColor:
                  event.severity === 'critical' ? 'var(--sev-critical)' :
                  event.severity === 'high' ? 'var(--sev-high)' :
                  event.severity === 'medium' ? 'var(--sev-medium)' : 'var(--sev-low)'
              }}
            />
            {event.severity}
          </span>

          {/* Source Badge */}
          <span className="badge badge-source">
            {getSourceIcon(event.source)}
            {getSourceLabel(event.source)}
          </span>

          {/* Region / Service Badges */}
          {event.region && (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '0.75rem',
              color: 'var(--text-secondary)',
              background: 'rgba(255, 255, 255, 0.03)',
              padding: '2px 8px',
              borderRadius: '4px',
              border: '1px solid var(--border-subtle)',
            }}>
              <MapPin size={11} color="var(--accent-cyan)" />
              {event.region}
            </span>
          )}

          {event.service && (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '0.75rem',
              color: 'var(--text-secondary)',
              background: 'rgba(255, 255, 255, 0.03)',
              padding: '2px 8px',
              borderRadius: '4px',
              border: '1px solid var(--border-subtle)',
            }}>
              <Layers size={11} color="var(--accent-purple)" />
              {event.service}
            </span>
          )}
        </div>

        {/* Timestamp & Score */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            <Clock size={12} />
            <span>{formatRelativeTime(event.timestamp)}</span>
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'rgba(15, 23, 42, 0.9)',
            border: '1px solid var(--border-subtle)',
            padding: '3px 10px',
            borderRadius: 'var(--radius-sm)'
          }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>SCORE</span>
            <span className="mono" style={{
              fontWeight: 800,
              fontSize: '0.9rem',
              color: scorePct > 65 ? 'var(--sev-critical)' : scorePct > 45 ? 'var(--sev-high)' : 'var(--accent-cyan)'
            }}>
              {score.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Event Title */}
      <h3 style={{
        fontSize: '1.05rem',
        fontWeight: 700,
        marginBottom: '10px',
        color: 'var(--text-main)',
        lineHeight: 1.4,
      }}>
        {event.title}
      </h3>

      {/* Explanation Box */}
      {event.explanation ? (
        <div style={{
          background: meta.gradient,
          border: `1px solid ${meta.border}`,
          borderRadius: 'var(--radius-sm)',
          padding: '12px 14px',
          marginBottom: '12px',
          display: 'flex',
          gap: '10px',
          alignItems: 'flex-start',
        }}>
          <div style={{
            padding: '5px',
            borderRadius: '6px',
            background: meta.bg,
            color: meta.color,
            flexShrink: 0,
            display: 'flex',
          }}>
            <SourceIcon size={16} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: meta.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {meta.label}
              </span>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{meta.note}</span>
            </div>
            <p style={{ fontSize: '0.85rem', color: '#e2e8f0', lineHeight: 1.5 }}>
              {event.explanation}
            </p>
          </div>
        </div>
      ) : (
        <div style={{
          padding: '8px 12px',
          borderRadius: 'var(--radius-sm)',
          background: 'rgba(255, 255, 255, 0.02)',
          marginBottom: '12px',
          fontSize: '0.8rem',
          color: 'var(--text-muted)'
        }}>
          Generating explanation...
        </div>
      )}

      {/* Score Breakdown Footer */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '10px',
        paddingTop: '10px',
        borderTop: '1px solid rgba(255, 255, 255, 0.05)'
      }}>
        {/* Factor Pills — weighted contributions to the composite score */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>CONTRIBUTIONS:</span>

          {[
            { label: 'Sev', value: bd.severity, color: 'var(--sev-critical)' },
            { label: 'Rec', value: bd.recency, color: 'var(--accent-cyan)' },
            { label: 'Freq', value: bd.frequency, color: 'var(--sev-medium)' },
            { label: 'Blast', value: bd.blast_radius, color: 'var(--accent-purple)' },
          ].map(({ label, value, color }) => (
            <span
              key={label}
              style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', background: 'rgba(255, 255, 255, 0.04)', padding: '2px 6px', borderRadius: '4px' }}
            >
              {label} <strong style={{ color }}>{(value ?? 0).toFixed(2)}</strong>
            </span>
          ))}
        </div>

        {/* View Details Prompt */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--accent-cyan)', fontWeight: 600 }}>
          <span>Inspect Breakdown &amp; Audit</span>
          <ChevronRight size={14} />
        </div>
      </div>
    </div>
  );
}
