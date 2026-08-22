import React from 'react';
import { Layers, Brain, Award, Cloud, Smartphone, CheckCircle, ArrowRight, ShieldCheck, User } from 'lucide-react';

export default function ArchitectureView() {
  return (
    <div style={{ maxWidth: '960px', margin: '0 auto' }}>
      {/* Header */}
      <div className="glass-panel" style={{ padding: '24px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <div style={{
            padding: '8px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #0284c7 0%, #6366f1 100%)',
            color: '#ffffff'
          }}>
            <Layers size={22} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 800 }}>
              GlanceApp 93 — System Architecture & Skill Ownership
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Built according to the 6-hour hackathon PRD with clear team domain ownership: Cloud, Gen-AI, Mobile, Ranking.
            </p>
          </div>
        </div>
      </div>

      {/* 4 Skill Ownership Cards Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '16px',
        marginBottom: '24px'
      }}>
        {/* 1. Gen AI */}
        <div className="glass-panel" style={{ padding: '20px', borderTop: '3px solid var(--accent-cyan)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Brain size={20} color="var(--accent-cyan)" />
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--accent-cyan)' }}>
                1. Gen AI Module
              </h3>
            </div>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#38bdf8', background: 'rgba(56, 189, 248, 0.15)', padding: '2px 8px', borderRadius: '4px' }}>
              Hiten Patil
            </span>
          </div>
          <ul style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '8px', paddingLeft: '18px' }}>
            <li>Hugging Face Inference API client with Qwen 2.5-72B Instruct</li>
            <li>Role-tailored prompt engineering generating concise 1-2 sentence operator briefings</li>
            <li>MD5 content-hash caching layer preventing redundant LLM calls</li>
            <li>Deterministic template fallback ensuring zero failure during network degradation</li>
          </ul>
        </div>

        {/* 2. Ranking */}
        <div className="glass-panel" style={{ padding: '20px', borderTop: '3px solid #fbbf24' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Award size={20} color="#fbbf24" />
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fbbf24' }}>
                2. Ranking Engine
              </h3>
            </div>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#fbbf24', background: 'rgba(251, 191, 36, 0.15)', padding: '2px 8px', borderRadius: '4px' }}>
              Hiten Patil
            </span>
          </div>
          <ul style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '8px', paddingLeft: '18px' }}>
            <li>Composite formula: <code>w₁·Sev + w₂·Rec + w₃·Freq + w₄·Blast</code></li>
            <li>Exponential decay recency scoring (<code>λ = 0.05 / min</code>)</li>
            <li>Cross-region & multi-service blast radius impact computation</li>
            <li><strong>PRD Bonus:</strong> Runtime Operator Feedback loop (POST /api/feedback) with instant re-ranking</li>
          </ul>
        </div>

        {/* 3. Cloud */}
        <div className="glass-panel" style={{ padding: '20px', borderTop: '3px solid var(--accent-blue)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Cloud size={20} color="var(--accent-blue)" />
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--accent-blue)' }}>
                3. Cloud & Backend
              </h3>
            </div>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#60a5fa', background: 'rgba(96, 165, 250, 0.15)', padding: '2px 8px', borderRadius: '4px' }}>
              Shivam Chaudhry
            </span>
          </div>
          <ul style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '8px', paddingLeft: '18px' }}>
            <li>FastAPI asynchronous REST engine with high-throughput batch ingestion</li>
            <li>Production Dockerfile & multi-stage container optimization</li>
            <li>Docker Compose orchestration & Render/Railway deployment manifests</li>
            <li>Thread-safe memory store & append-only audit trail logger</li>
          </ul>
        </div>

        {/* 4. Mobile */}
        <div className="glass-panel" style={{ padding: '20px', borderTop: '3px solid var(--accent-purple)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Smartphone size={20} color="var(--accent-purple)" />
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--accent-purple)' }}>
                4. Mobile UI & UX
              </h3>
            </div>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#c084fc', background: 'rgba(192, 132, 252, 0.15)', padding: '2px 8px', borderRadius: '4px' }}>
              Prateek Singh
            </span>
          </div>
          <ul style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '8px', paddingLeft: '18px' }}>
            <li>Responsive React SPA with mobile bottom navigation bar</li>
            <li>Live incident cards with rank badges and factor breakdown mini-bars</li>
            <li>Interactive weight tuner with real-time normalization visualizer</li>
            <li>Live search, multi-source filters, and detailed audit inspect modal</li>
          </ul>
        </div>
      </div>

      {/* End-to-End Pipeline Diagram Card */}
      <div className="glass-panel" style={{ padding: '22px' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShieldCheck size={18} color="var(--accent-cyan)" />
          <span>End-to-End Data Pipeline Flow</span>
        </h3>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '12px',
          alignItems: 'center',
          textAlign: 'center',
          background: 'rgba(15, 23, 42, 0.7)',
          padding: '18px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)'
        }}>
          <div style={{ padding: '12px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '8px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Step 1</div>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)', marginTop: '4px' }}>3 Event Streams</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '2px' }}>Infra, Deploy, Error</div>
          </div>

          <div style={{ padding: '12px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '8px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Step 2</div>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--accent-cyan)', marginTop: '4px' }}>Ingestion & Store</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '2px' }}>FastAPI + Audit Log</div>
          </div>

          <div style={{ padding: '12px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '8px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Step 3</div>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#fbbf24', marginTop: '4px' }}>Ranking Engine</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '2px' }}>4-Factor Model</div>
          </div>

          <div style={{ padding: '12px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '8px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Step 4</div>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--accent-purple)', marginTop: '4px' }}>Gen AI Explainer</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '2px' }}>Hugging Face Qwen</div>
          </div>

          <div style={{ padding: '12px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '8px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Step 5</div>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#34d399', marginTop: '4px' }}>Mobile Operator UI</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '2px' }}>React Briefings</div>
          </div>
        </div>
      </div>
    </div>
  );
}
