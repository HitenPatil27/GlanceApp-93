import React, { useState, useEffect } from 'react';
import { Sliders, Sparkles, Check, RotateCcw, Zap, AlertCircle, Info } from 'lucide-react';

export default function WeightTuner({ currentWeights, onWeightsUpdated, apiBase = '' }) {
  const [weights, setWeights] = useState({
    severity: 0.35,
    recency: 0.25,
    frequency: 0.20,
    blast_radius: 0.20,
  });

  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (currentWeights) {
      setWeights(currentWeights);
    }
  }, [currentWeights]);

  const handleChange = (key, val) => {
    setWeights(prev => ({
      ...prev,
      [key]: parseFloat(val)
    }));
  };

  // Normalization calculation
  const total = weights.severity + weights.recency + weights.frequency + weights.blast_radius || 1;
  const normSev = Math.round((weights.severity / total) * 100);
  const normRec = Math.round((weights.recency / total) * 100);
  const normFreq = Math.round((weights.frequency / total) * 100);
  const normBlast = Math.round((weights.blast_radius / total) * 100);

  const applyPreset = (preset) => {
    setWeights(preset);
  };

  const handleApply = async () => {
    setSaving(true);
    setSuccessMsg('');
    setErrorMsg('');
    try {
      const res = await fetch(`${apiBase}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          severity: weights.severity,
          recency: weights.recency,
          frequency: weights.frequency,
          blast_radius: weights.blast_radius,
        }),
      });

      if (!res.ok) throw new Error('Failed to update weights');
      const updated = await res.json();
      setWeights(updated);
      setSuccessMsg('✨ Weights applied successfully! All briefings have been re-scored and re-ranked in real time.');
      if (onWeightsUpdated) onWeightsUpdated(updated);
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      setErrorMsg(err.message || 'Error updating weights');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: '850px', margin: '0 auto' }}>
      {/* Header Banner */}
      <div className="glass-panel" style={{ padding: '24px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <div style={{
            padding: '8px',
            borderRadius: '10px',
            background: 'rgba(56, 189, 248, 0.15)',
            color: 'var(--accent-cyan)'
          }}>
            <Sliders size={22} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 800 }}>
              Operator Feedback Loop & Ranking Tuner
            </h2>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Dynamically adjust multi-factor triage weights. Re-ranks all cloud events instantly.
            </div>
          </div>
        </div>

        {/* PRD Bonus Badge */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 10px',
          borderRadius: 'var(--radius-full)',
          background: 'rgba(250, 204, 21, 0.15)',
          border: '1px solid rgba(250, 204, 21, 0.3)',
          color: '#facc15',
          fontSize: '0.75rem',
          fontWeight: 700,
          marginTop: '6px'
        }}>
          <Sparkles size={13} />
          <span>PRD Advanced / Bonus Feature Active</span>
        </div>
      </div>

      {/* Preset Strategy Buttons */}
      <div className="glass-panel" style={{ padding: '18px 20px', marginBottom: '20px' }}>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>
          Quick Strategy Presets
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={() => applyPreset({ severity: 0.35, recency: 0.25, frequency: 0.20, blast_radius: 0.20 })}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1px solid var(--border-subtle)',
              background: 'rgba(255, 255, 255, 0.04)',
              color: 'var(--text-main)',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            ⚖️ Balanced Default (35/25/20/20)
          </button>

          <button
            onClick={() => applyPreset({ severity: 0.55, recency: 0.15, frequency: 0.15, blast_radius: 0.15 })}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1px solid var(--sev-critical-border)',
              background: 'rgba(244, 63, 94, 0.1)',
              color: 'var(--sev-critical)',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            🔥 Severe Incident Focus (55% Sev)
          </button>

          <button
            onClick={() => applyPreset({ severity: 0.15, recency: 0.55, frequency: 0.15, blast_radius: 0.15 })}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              background: 'rgba(56, 189, 248, 0.1)',
              color: 'var(--accent-cyan)',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            ⚡ Real-Time Recency (55% Rec)
          </button>

          <button
            onClick={() => applyPreset({ severity: 0.20, recency: 0.10, frequency: 0.20, blast_radius: 0.50 })}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1px solid rgba(168, 85, 247, 0.3)',
              background: 'rgba(168, 85, 247, 0.1)',
              color: 'var(--accent-purple)',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            🌐 Blast Radius / Cascade (50% Blast)
          </button>
        </div>
      </div>

      {/* Normalized Distribution Visualizer */}
      <div className="glass-panel" style={{ padding: '18px 20px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
            Normalized Distribution (100% Total)
          </span>
          <span className="mono" style={{ fontSize: '0.8rem', color: 'var(--accent-cyan)' }}>
            Σ = 1.00
          </span>
        </div>

        {/* Stacked Progress Bar */}
        <div style={{
          width: '100%',
          height: '16px',
          borderRadius: '8px',
          overflow: 'hidden',
          display: 'flex',
          background: '#090d16',
          border: '1px solid var(--border-subtle)',
          marginBottom: '12px'
        }}>
          <div style={{ width: `${normSev}%`, background: 'var(--sev-critical)', transition: 'width 0.2s ease' }} title={`Severity: ${normSev}%`} />
          <div style={{ width: `${normRec}%`, background: 'var(--accent-cyan)', transition: 'width 0.2s ease' }} title={`Recency: ${normRec}%`} />
          <div style={{ width: `${normFreq}%`, background: 'var(--sev-medium)', transition: 'width 0.2s ease' }} title={`Frequency: ${normFreq}%`} />
          <div style={{ width: `${normBlast}%`, background: 'var(--accent-purple)', transition: 'width 0.2s ease' }} title={`Blast Radius: ${normBlast}%`} />
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', fontSize: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: 'var(--sev-critical)' }} />
            <span style={{ color: 'var(--text-secondary)' }}>Severity ({normSev}%)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: 'var(--accent-cyan)' }} />
            <span style={{ color: 'var(--text-secondary)' }}>Recency ({normRec}%)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: 'var(--sev-medium)' }} />
            <span style={{ color: 'var(--text-secondary)' }}>Frequency ({normFreq}%)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: 'var(--accent-purple)' }} />
            <span style={{ color: 'var(--text-secondary)' }}>Blast Radius ({normBlast}%)</span>
          </div>
        </div>
      </div>

      {/* Sliders Container */}
      <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px' }}>
        {/* Severity Slider */}
        <div style={{ marginBottom: '22px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div>
              <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--sev-critical)' }}>1. Severity Weight (w₁)</span>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Critical, High, Medium, Low severity baseline</div>
            </div>
            <span className="mono" style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--sev-critical)' }}>
              {weights.severity.toFixed(2)}
            </span>
          </div>
          <input
            type="range"
            min="0.05"
            max="1.0"
            step="0.05"
            value={weights.severity}
            onChange={(e) => handleChange('severity', e.target.value)}
          />
        </div>

        {/* Recency Slider */}
        <div style={{ marginBottom: '22px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div>
              <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--accent-cyan)' }}>2. Recency Weight (w₂)</span>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Exponential decay per minute: e^(-0.05 × age)</div>
            </div>
            <span className="mono" style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--accent-cyan)' }}>
              {weights.recency.toFixed(2)}
            </span>
          </div>
          <input
            type="range"
            min="0.05"
            max="1.0"
            step="0.05"
            value={weights.recency}
            onChange={(e) => handleChange('recency', e.target.value)}
          />
        </div>

        {/* Frequency Slider */}
        <div style={{ marginBottom: '22px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div>
              <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--sev-medium)' }}>3. Frequency Weight (w₃)</span>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Repeated alert bursts in 5-minute rolling window</div>
            </div>
            <span className="mono" style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--sev-medium)' }}>
              {weights.frequency.toFixed(2)}
            </span>
          </div>
          <input
            type="range"
            min="0.05"
            max="1.0"
            step="0.05"
            value={weights.frequency}
            onChange={(e) => handleChange('frequency', e.target.value)}
          />
        </div>

        {/* Blast Radius Slider */}
        <div style={{ marginBottom: '22px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div>
              <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--accent-purple)' }}>4. Blast Radius Weight (w₄)</span>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Cross-region and multi-service failure footprint</div>
            </div>
            <span className="mono" style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--accent-purple)' }}>
              {weights.blast_radius.toFixed(2)}
            </span>
          </div>
          <input
            type="range"
            min="0.05"
            max="1.0"
            step="0.05"
            value={weights.blast_radius}
            onChange={(e) => handleChange('blast_radius', e.target.value)}
          />
        </div>

        {/* Notification alerts */}
        {successMsg && (
          <div style={{
            padding: '12px 16px',
            borderRadius: '8px',
            background: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            color: '#34d399',
            fontSize: '0.85rem',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <Check size={16} />
            <span>{successMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div style={{
            padding: '12px 16px',
            borderRadius: '8px',
            background: 'rgba(244, 63, 94, 0.15)',
            border: '1px solid rgba(244, 63, 94, 0.3)',
            color: 'var(--sev-critical)',
            fontSize: '0.85rem',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <AlertCircle size={16} />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Action Button */}
        <button
          onClick={handleApply}
          disabled={saving}
          style={{
            width: '100%',
            padding: '14px',
            borderRadius: 'var(--radius-md)',
            border: 'none',
            background: 'linear-gradient(135deg, #0284c7 0%, #6366f1 100%)',
            color: '#ffffff',
            fontWeight: 700,
            fontSize: '1rem',
            cursor: saving ? 'not-allowed' : 'pointer',
            boxShadow: '0 4px 20px rgba(56, 189, 248, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'transform 0.15s ease, opacity 0.15s ease',
            opacity: saving ? 0.7 : 1
          }}
        >
          <Zap size={18} fill="#ffffff" />
          <span>{saving ? 'Re-Scoring All Events...' : 'Apply Weights & Re-Rank System'}</span>
        </button>
      </div>
    </div>
  );
}
