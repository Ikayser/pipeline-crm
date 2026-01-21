import React, { useState, useEffect } from 'react';

const STAGES = ['Lead', 'Contacted', 'Meeting', 'Proposal', 'Negotiation', 'Closed'];
const WORK_TYPES = ['Consulting', 'Development', 'Design', 'Strategy', 'Training', 'Other'];

const initialProspects = [
  {
    id: 1,
    company: 'Acme Corp',
    contact: 'Sarah Chen',
    workType: 'Consulting',
    budget: 50000,
    stage: 'Proposal',
    lastEngagement: '2026-01-15',
    engagements: [
      { date: '2026-01-10', type: 'Email', note: 'Initial outreach' },
      { date: '2026-01-15', type: 'Call', note: 'Discussed project scope' }
    ],
    context: 'Interested in Q2 digital transformation. Decision maker is VP of Ops.'
  },
  {
    id: 2,
    company: 'Nebula Industries',
    contact: 'Marcus Webb',
    workType: 'Development',
    budget: 120000,
    stage: 'Meeting',
    lastEngagement: '2026-01-18',
    engagements: [
      { date: '2026-01-18', type: 'Meeting', note: 'Discovery call completed' }
    ],
    context: 'Looking to rebuild their customer portal. Timeline: 6 months.'
  },
  {
    id: 3,
    company: 'Flux Design Co',
    contact: 'Elena Varga',
    workType: 'Strategy',
    budget: 25000,
    stage: 'Lead',
    lastEngagement: '2026-01-12',
    engagements: [],
    context: 'Met at conference. Expressed interest in brand strategy work.'
  }
];

export default function CRMDashboard() {
  const [prospects, setProspects] = useState(() => {
    const saved = localStorage.getItem('crm-prospects');
    return saved ? JSON.parse(saved) : initialProspects;
  });
  const [view, setView] = useState('pipeline');
  const [selectedProspect, setSelectedProspect] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingProspect, setEditingProspect] = useState(null);
  const [showEngagementForm, setShowEngagementForm] = useState(false);

  useEffect(() => {
    localStorage.setItem('crm-prospects', JSON.stringify(prospects));
  }, [prospects]);

  const formatCurrency = (num) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(num);
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const daysSince = (dateStr) => {
    const diff = new Date() - new Date(dateStr);
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  };

  const totalPipeline = prospects.reduce((sum, p) => sum + p.budget, 0);
  const stageBreakdown = STAGES.map(stage => ({
    stage,
    count: prospects.filter(p => p.stage === stage).length,
    value: prospects.filter(p => p.stage === stage).reduce((sum, p) => sum + p.budget, 0)
  }));

  const needsAttention = prospects.filter(p => daysSince(p.lastEngagement) > 7);

  const handleSaveProspect = (prospect) => {
    if (prospect.id) {
      setProspects(prospects.map(p => p.id === prospect.id ? prospect : p));
    } else {
      setProspects([...prospects, { ...prospect, id: Date.now(), engagements: [] }]);
    }
    setShowForm(false);
    setEditingProspect(null);
  };

  const handleDeleteProspect = (id) => {
    setProspects(prospects.filter(p => p.id !== id));
    setSelectedProspect(null);
  };

  const handleAddEngagement = (prospectId, engagement) => {
    setProspects(prospects.map(p => {
      if (p.id === prospectId) {
        return {
          ...p,
          engagements: [...p.engagements, engagement],
          lastEngagement: engagement.date
        };
      }
      return p;
    }));
    setShowEngagementForm(false);
  };

  const handleImportCSV = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const lines = text.split('\n');
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
      
      const newProspects = lines.slice(1).filter(line => line.trim()).map((line, idx) => {
        const values = line.match(/(".*?"|[^,]+)/g)?.map(v => v.replace(/"/g, '').trim()) || [];
        const row = {};
        headers.forEach((h, i) => row[h] = values[i] || '');
        
        return {
          id: Date.now() + idx,
          company: row['company'] || row['organization'] || 'Unknown',
          contact: `${row['first name'] || row['firstname'] || ''} ${row['last name'] || row['lastname'] || ''}`.trim() || row['name'] || 'Unknown',
          workType: 'Other',
          budget: 0,
          stage: 'Lead',
          lastEngagement: new Date().toISOString().split('T')[0],
          engagements: [],
          context: row['position'] || row['title'] || ''
        };
      });
      
      setProspects([...prospects, ...newProspects]);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleExportCSV = () => {
    const headers = ['Company', 'Contact', 'Work Type', 'Budget', 'Stage', 'Last Engagement', 'Context'];
    const rows = prospects.map(p => [
      p.company, p.contact, p.workType, p.budget, p.stage, p.lastEngagement, p.context
    ]);
    const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'prospects.csv';
    a.click();
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <h1 style={styles.logo}>Pipeline</h1>
          <span style={styles.tagline}>Business Tracker</span>
        </div>
        <div style={styles.headerRight}>
          <span style={styles.date}>{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
        </div>
      </header>

      {/* Navigation */}
      <nav style={styles.nav}>
        <div style={styles.navLinks}>
          {['pipeline', 'list', 'insights'].map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                ...styles.navLink,
                ...(view === v ? styles.navLinkActive : {})
              }}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
        <div style={styles.navActions}>
          <label style={styles.importLabel}>
            Import CSV
            <input type="file" accept=".csv" onChange={handleImportCSV} style={{ display: 'none' }} />
          </label>
          <button onClick={handleExportCSV} style={styles.actionButton}>Export</button>
          <button onClick={() => { setEditingProspect(null); setShowForm(true); }} style={styles.actionButtonPrimary}>+ New Prospect</button>
        </div>
      </nav>

      {/* Stats Bar */}
      <div style={styles.statsBar}>
        <div style={styles.stat}>
          <span style={styles.statLabel}>Total Pipeline</span>
          <span style={styles.statValue}>{formatCurrency(totalPipeline)}</span>
        </div>
        <div style={styles.statDivider} />
        <div style={styles.stat}>
          <span style={styles.statLabel}>Prospects</span>
          <span style={styles.statValue}>{prospects.length}</span>
        </div>
        <div style={styles.statDivider} />
        <div style={styles.stat}>
          <span style={styles.statLabel}>Needs Follow-up</span>
          <span style={styles.statValue}>{needsAttention.length}</span>
        </div>
      </div>

      {/* Main Content */}
      <main style={styles.main}>
        {view === 'pipeline' && (
          <div style={styles.pipelineView}>
            <div style={styles.pipelineGrid}>
              {stageBreakdown.map(({ stage, count, value }) => (
                <div key={stage} style={styles.pipelineColumn}>
                  <div style={styles.pipelineHeader}>
                    <span style={styles.stageName}>{stage}</span>
                    <span style={styles.stageCount}>{count}</span>
                  </div>
                  <div style={styles.stageValue}>{formatCurrency(value)}</div>
                  <div style={styles.pipelineCards}>
                    {prospects.filter(p => p.stage === stage).map(prospect => (
                      <div
                        key={prospect.id}
                        style={{
                          ...styles.prospectCard,
                          ...(daysSince(prospect.lastEngagement) > 7 ? styles.prospectCardStale : {})
                        }}
                        onClick={() => setSelectedProspect(prospect)}
                      >
                        <div style={styles.cardCompany}>{prospect.company}</div>
                        <div style={styles.cardContact}>{prospect.contact}</div>
                        <div style={styles.cardMeta}>
                          <span>{prospect.workType}</span>
                          <span>{formatCurrency(prospect.budget)}</span>
                        </div>
                        <div style={styles.cardEngagement}>
                          {daysSince(prospect.lastEngagement)}d ago
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {view === 'list' && (
          <div style={styles.listView}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Company</th>
                  <th style={styles.th}>Contact</th>
                  <th style={styles.th}>Type</th>
                  <th style={styles.th}>Budget</th>
                  <th style={styles.th}>Stage</th>
                  <th style={styles.th}>Last Contact</th>
                </tr>
              </thead>
              <tbody>
                {prospects.map(prospect => (
                  <tr
                    key={prospect.id}
                    style={styles.tr}
                    onClick={() => setSelectedProspect(prospect)}
                  >
                    <td style={styles.td}>{prospect.company}</td>
                    <td style={styles.td}>{prospect.contact}</td>
                    <td style={styles.td}>{prospect.workType}</td>
                    <td style={styles.td}>{formatCurrency(prospect.budget)}</td>
                    <td style={styles.td}>{prospect.stage}</td>
                    <td style={{
                      ...styles.td,
                      ...(daysSince(prospect.lastEngagement) > 7 ? { fontWeight: 700 } : {})
                    }}>
                      {formatDate(prospect.lastEngagement)} ({daysSince(prospect.lastEngagement)}d)
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {view === 'insights' && (
          <div style={styles.insightsView}>
            <div style={styles.insightsGrid}>
              <div style={styles.insightCard}>
                <h3 style={styles.insightTitle}>Pipeline by Stage</h3>
                <div style={styles.barChart}>
                  {stageBreakdown.map(({ stage, value }) => (
                    <div key={stage} style={styles.barRow}>
                      <span style={styles.barLabel}>{stage}</span>
                      <div style={styles.barTrack}>
                        <div
                          style={{
                            ...styles.barFill,
                            width: `${totalPipeline ? (value / totalPipeline) * 100 : 0}%`
                          }}
                        />
                      </div>
                      <span style={styles.barValue}>{formatCurrency(value)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={styles.insightCard}>
                <h3 style={styles.insightTitle}>Needs Attention</h3>
                <p style={styles.insightSubtitle}>No contact in 7+ days</p>
                {needsAttention.length === 0 ? (
                  <p style={styles.emptyState}>All prospects contacted recently</p>
                ) : (
                  <div style={styles.attentionList}>
                    {needsAttention.map(p => (
                      <div
                        key={p.id}
                        style={styles.attentionItem}
                        onClick={() => setSelectedProspect(p)}
                      >
                        <span style={styles.attentionCompany}>{p.company}</span>
                        <span style={styles.attentionDays}>{daysSince(p.lastEngagement)} days</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={styles.insightCard}>
                <h3 style={styles.insightTitle}>Work Type Breakdown</h3>
                <div style={styles.typeList}>
                  {WORK_TYPES.map(type => {
                    const count = prospects.filter(p => p.workType === type).length;
                    const value = prospects.filter(p => p.workType === type).reduce((sum, p) => sum + p.budget, 0);
                    if (count === 0) return null;
                    return (
                      <div key={type} style={styles.typeRow}>
                        <span style={styles.typeName}>{type}</span>
                        <span style={styles.typeCount}>{count}</span>
                        <span style={styles.typeValue}>{formatCurrency(value)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Prospect Detail Sidebar */}
      {selectedProspect && (
        <div style={styles.overlay} onClick={() => setSelectedProspect(null)}>
          <div style={styles.sidebar} onClick={e => e.stopPropagation()}>
            <div style={styles.sidebarHeader}>
              <h2 style={styles.sidebarTitle}>{selectedProspect.company}</h2>
              <button onClick={() => setSelectedProspect(null)} style={styles.closeButton}>×</button>
            </div>
            
            <div style={styles.sidebarContent}>
              <div style={styles.detailSection}>
                <label style={styles.detailLabel}>Contact</label>
                <p style={styles.detailValue}>{selectedProspect.contact}</p>
              </div>
              
              <div style={styles.detailRow}>
                <div style={styles.detailSection}>
                  <label style={styles.detailLabel}>Work Type</label>
                  <p style={styles.detailValue}>{selectedProspect.workType}</p>
                </div>
                <div style={styles.detailSection}>
                  <label style={styles.detailLabel}>Budget</label>
                  <p style={styles.detailValue}>{formatCurrency(selectedProspect.budget)}</p>
                </div>
              </div>

              <div style={styles.detailSection}>
                <label style={styles.detailLabel}>Stage</label>
                <div style={styles.stageSelector}>
                  {STAGES.map(stage => (
                    <button
                      key={stage}
                      onClick={() => {
                        const updated = { ...selectedProspect, stage };
                        setSelectedProspect(updated);
                        setProspects(prospects.map(p => p.id === updated.id ? updated : p));
                      }}
                      style={{
                        ...styles.stageButton,
                        ...(selectedProspect.stage === stage ? styles.stageButtonActive : {})
                      }}
                    >
                      {stage}
                    </button>
                  ))}
                </div>
              </div>

              <div style={styles.detailSection}>
                <label style={styles.detailLabel}>Context & Notes</label>
                <p style={styles.detailValue}>{selectedProspect.context || '—'}</p>
              </div>

              <div style={styles.detailSection}>
                <div style={styles.engagementHeader}>
                  <label style={styles.detailLabel}>Engagement History</label>
                  <button onClick={() => setShowEngagementForm(true)} style={styles.smallButton}>+ Add</button>
                </div>
                {selectedProspect.engagements.length === 0 ? (
                  <p style={styles.emptyState}>No engagements recorded</p>
                ) : (
                  <div style={styles.engagementList}>
                    {[...selectedProspect.engagements].reverse().map((eng, idx) => (
                      <div key={idx} style={styles.engagementItem}>
                        <div style={styles.engagementDate}>{formatDate(eng.date)}</div>
                        <div style={styles.engagementType}>{eng.type}</div>
                        <div style={styles.engagementNote}>{eng.note}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div style={styles.sidebarFooter}>
              <button
                onClick={() => { setEditingProspect(selectedProspect); setShowForm(true); setSelectedProspect(null); }}
                style={styles.actionButton}
              >
                Edit
              </button>
              <button
                onClick={() => handleDeleteProspect(selectedProspect.id)}
                style={styles.deleteButton}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New/Edit Prospect Form */}
      {showForm && (
        <ProspectForm
          prospect={editingProspect}
          onSave={handleSaveProspect}
          onCancel={() => { setShowForm(false); setEditingProspect(null); }}
        />
      )}

      {/* Add Engagement Form */}
      {showEngagementForm && selectedProspect && (
        <EngagementForm
          onSave={(eng) => handleAddEngagement(selectedProspect.id, eng)}
          onCancel={() => setShowEngagementForm(false)}
        />
      )}
    </div>
  );
}

function ProspectForm({ prospect, onSave, onCancel }) {
  const [form, setForm] = useState(prospect || {
    company: '',
    contact: '',
    workType: 'Consulting',
    budget: 0,
    stage: 'Lead',
    lastEngagement: new Date().toISOString().split('T')[0],
    context: ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({ ...form, budget: Number(form.budget) });
  };

  return (
    <div style={styles.overlay} onClick={onCancel}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <h2 style={styles.modalTitle}>{prospect ? 'Edit Prospect' : 'New Prospect'}</h2>
        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.formRow}>
            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Company</label>
              <input
                type="text"
                value={form.company}
                onChange={e => setForm({ ...form, company: e.target.value })}
                style={styles.input}
                required
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Contact</label>
              <input
                type="text"
                value={form.contact}
                onChange={e => setForm({ ...form, contact: e.target.value })}
                style={styles.input}
                required
              />
            </div>
          </div>

          <div style={styles.formRow}>
            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Work Type</label>
              <select
                value={form.workType}
                onChange={e => setForm({ ...form, workType: e.target.value })}
                style={styles.select}
              >
                {WORK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Estimated Budget</label>
              <input
                type="number"
                value={form.budget}
                onChange={e => setForm({ ...form, budget: e.target.value })}
                style={styles.input}
              />
            </div>
          </div>

          <div style={styles.formRow}>
            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Stage</label>
              <select
                value={form.stage}
                onChange={e => setForm({ ...form, stage: e.target.value })}
                style={styles.select}
              >
                {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Last Engagement</label>
              <input
                type="date"
                value={form.lastEngagement}
                onChange={e => setForm({ ...form, lastEngagement: e.target.value })}
                style={styles.input}
              />
            </div>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Context & Notes</label>
            <textarea
              value={form.context}
              onChange={e => setForm({ ...form, context: e.target.value })}
              style={styles.textarea}
              rows={3}
            />
          </div>

          <div style={styles.formActions}>
            <button type="button" onClick={onCancel} style={styles.actionButton}>Cancel</button>
            <button type="submit" style={styles.actionButtonPrimary}>Save</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EngagementForm({ onSave, onCancel }) {
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    type: 'Email',
    note: ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(form);
  };

  return (
    <div style={styles.overlay} onClick={onCancel}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <h2 style={styles.modalTitle}>Log Engagement</h2>
        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.formRow}>
            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Date</label>
              <input
                type="date"
                value={form.date}
                onChange={e => setForm({ ...form, date: e.target.value })}
                style={styles.input}
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Type</label>
              <select
                value={form.type}
                onChange={e => setForm({ ...form, type: e.target.value })}
                style={styles.select}
              >
                {['Email', 'Call', 'Meeting', 'LinkedIn', 'Other'].map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Note</label>
            <textarea
              value={form.note}
              onChange={e => setForm({ ...form, note: e.target.value })}
              style={styles.textarea}
              rows={2}
            />
          </div>
          <div style={styles.formActions}>
            <button type="button" onClick={onCancel} style={styles.actionButton}>Cancel</button>
            <button type="submit" style={styles.actionButtonPrimary}>Save</button>
          </div>
        </form>
      </div>
    </div>
  );
}

const styles = {
  container: {
    fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    fontSize: '14px',
    lineHeight: 1.5,
    color: '#000',
    backgroundColor: '#fff',
    minHeight: '100vh',
    letterSpacing: '-0.01em'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    padding: '24px 32px',
    borderBottom: '1px solid #000'
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '16px'
  },
  logo: {
    fontSize: '24px',
    fontWeight: 700,
    margin: 0,
    letterSpacing: '-0.02em'
  },
  tagline: {
    fontSize: '12px',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    color: '#666'
  },
  headerRight: {},
  date: {
    fontSize: '12px',
    color: '#666'
  },
  nav: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0 32px',
    borderBottom: '1px solid #000'
  },
  navLinks: {
    display: 'flex'
  },
  navLink: {
    background: 'none',
    border: 'none',
    borderBottom: '2px solid transparent',
    padding: '16px 24px',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: '#666',
    fontFamily: 'inherit'
  },
  navLinkActive: {
    color: '#000',
    borderBottomColor: '#000'
  },
  navActions: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center'
  },
  importLabel: {
    padding: '8px 16px',
    fontSize: '12px',
    border: '1px solid #000',
    cursor: 'pointer',
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
  },
  actionButton: {
    padding: '8px 16px',
    fontSize: '12px',
    background: 'none',
    border: '1px solid #000',
    cursor: 'pointer',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    fontFamily: 'inherit'
  },
  actionButtonPrimary: {
    padding: '8px 16px',
    fontSize: '12px',
    background: '#000',
    color: '#fff',
    border: '1px solid #000',
    cursor: 'pointer',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    fontFamily: 'inherit'
  },
  statsBar: {
    display: 'flex',
    alignItems: 'center',
    padding: '20px 32px',
    borderBottom: '1px solid #000',
    gap: '32px'
  },
  stat: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
  },
  statLabel: {
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    color: '#666'
  },
  statValue: {
    fontSize: '24px',
    fontWeight: 700,
    letterSpacing: '-0.02em'
  },
  statDivider: {
    width: '1px',
    height: '40px',
    backgroundColor: '#ddd'
  },
  main: {
    padding: '32px'
  },
  pipelineView: {},
  pipelineGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(6, 1fr)',
    gap: '1px',
    backgroundColor: '#000'
  },
  pipelineColumn: {
    backgroundColor: '#fff',
    padding: '16px',
    minHeight: '400px'
  },
  pipelineHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '4px'
  },
  stageName: {
    fontSize: '12px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
  },
  stageCount: {
    fontSize: '11px',
    color: '#666'
  },
  stageValue: {
    fontSize: '16px',
    fontWeight: 500,
    marginBottom: '16px',
    paddingBottom: '16px',
    borderBottom: '1px solid #eee'
  },
  pipelineCards: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  prospectCard: {
    padding: '12px',
    border: '1px solid #ddd',
    cursor: 'pointer',
    transition: 'border-color 0.15s'
  },
  prospectCardStale: {
    borderColor: '#000',
    borderWidth: '2px'
  },
  cardCompany: {
    fontWeight: 700,
    marginBottom: '2px'
  },
  cardContact: {
    fontSize: '12px',
    color: '#666',
    marginBottom: '8px'
  },
  cardMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '11px',
    color: '#666'
  },
  cardEngagement: {
    fontSize: '10px',
    color: '#999',
    marginTop: '8px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
  },
  listView: {
    overflowX: 'auto'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse'
  },
  th: {
    textAlign: 'left',
    padding: '12px 16px',
    borderBottom: '2px solid #000',
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    fontWeight: 700
  },
  tr: {
    cursor: 'pointer',
    transition: 'background 0.15s'
  },
  td: {
    padding: '12px 16px',
    borderBottom: '1px solid #eee'
  },
  insightsView: {},
  insightsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '24px'
  },
  insightCard: {
    border: '1px solid #000',
    padding: '24px'
  },
  insightTitle: {
    fontSize: '14px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginTop: 0,
    marginBottom: '16px'
  },
  insightSubtitle: {
    fontSize: '12px',
    color: '#666',
    marginBottom: '16px'
  },
  barChart: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px'
  },
  barRow: {
    display: 'grid',
    gridTemplateColumns: '80px 1fr 80px',
    alignItems: 'center',
    gap: '12px'
  },
  barLabel: {
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
  },
  barTrack: {
    height: '8px',
    backgroundColor: '#eee'
  },
  barFill: {
    height: '100%',
    backgroundColor: '#000',
    transition: 'width 0.3s'
  },
  barValue: {
    fontSize: '12px',
    textAlign: 'right'
  },
  attentionList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  attentionItem: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 0',
    borderBottom: '1px solid #eee',
    cursor: 'pointer'
  },
  attentionCompany: {
    fontWeight: 500
  },
  attentionDays: {
    fontSize: '12px',
    color: '#666'
  },
  typeList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  typeRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 40px 80px',
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: '1px solid #eee'
  },
  typeName: {
    fontSize: '13px'
  },
  typeCount: {
    fontSize: '12px',
    color: '#666',
    textAlign: 'center'
  },
  typeValue: {
    fontSize: '12px',
    textAlign: 'right'
  },
  emptyState: {
    fontSize: '13px',
    color: '#666',
    fontStyle: 'italic'
  },
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
    display: 'flex',
    justifyContent: 'flex-end',
    zIndex: 1000
  },
  sidebar: {
    width: '400px',
    backgroundColor: '#fff',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    borderLeft: '1px solid #000'
  },
  sidebarHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '24px',
    borderBottom: '1px solid #000'
  },
  sidebarTitle: {
    fontSize: '20px',
    fontWeight: 700,
    margin: 0
  },
  closeButton: {
    background: 'none',
    border: 'none',
    fontSize: '24px',
    cursor: 'pointer',
    padding: 0,
    lineHeight: 1
  },
  sidebarContent: {
    flex: 1,
    padding: '24px',
    overflowY: 'auto'
  },
  detailSection: {
    marginBottom: '20px'
  },
  detailRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px'
  },
  detailLabel: {
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    color: '#666',
    display: 'block',
    marginBottom: '4px'
  },
  detailValue: {
    fontSize: '14px',
    margin: 0
  },
  stageSelector: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px'
  },
  stageButton: {
    padding: '6px 12px',
    fontSize: '11px',
    background: 'none',
    border: '1px solid #ddd',
    cursor: 'pointer',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    fontFamily: 'inherit'
  },
  stageButtonActive: {
    backgroundColor: '#000',
    color: '#fff',
    borderColor: '#000'
  },
  engagementHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px'
  },
  smallButton: {
    padding: '4px 8px',
    fontSize: '11px',
    background: 'none',
    border: '1px solid #000',
    cursor: 'pointer',
    fontFamily: 'inherit'
  },
  engagementList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px'
  },
  engagementItem: {
    paddingBottom: '12px',
    borderBottom: '1px solid #eee'
  },
  engagementDate: {
    fontSize: '11px',
    color: '#666'
  },
  engagementType: {
    fontSize: '12px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
  },
  engagementNote: {
    fontSize: '13px',
    marginTop: '4px'
  },
  sidebarFooter: {
    display: 'flex',
    gap: '12px',
    padding: '24px',
    borderTop: '1px solid #000'
  },
  deleteButton: {
    padding: '8px 16px',
    fontSize: '12px',
    background: 'none',
    border: '1px solid #000',
    cursor: 'pointer',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    fontFamily: 'inherit',
    color: '#666'
  },
  modal: {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    backgroundColor: '#fff',
    border: '1px solid #000',
    padding: '32px',
    width: '500px',
    maxWidth: '90vw',
    maxHeight: '90vh',
    overflowY: 'auto'
  },
  modalTitle: {
    fontSize: '18px',
    fontWeight: 700,
    marginTop: 0,
    marginBottom: '24px'
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px'
  },
  formRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px'
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
  },
  formLabel: {
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    color: '#666'
  },
  input: {
    padding: '10px 12px',
    fontSize: '14px',
    border: '1px solid #000',
    fontFamily: 'inherit',
    outline: 'none'
  },
  select: {
    padding: '10px 12px',
    fontSize: '14px',
    border: '1px solid #000',
    fontFamily: 'inherit',
    outline: 'none',
    backgroundColor: '#fff'
  },
  textarea: {
    padding: '10px 12px',
    fontSize: '14px',
    border: '1px solid #000',
    fontFamily: 'inherit',
    outline: 'none',
    resize: 'vertical'
  },
  formActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    marginTop: '8px'
  }
};
