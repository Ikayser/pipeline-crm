import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://kpgjgbbozgmbhtysocck.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtwZ2pnYmJvemdtYmh0eXNvY2NrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxMDA4OTIsImV4cCI6MjA4NDY3Njg5Mn0.JcABMK1Tcqm1gFmI8kxthDEDsSrflx4QONXXy-hAJGg'
);

const STAGES = ['Lead', 'Contacted', 'Meeting', 'Proposal', 'Negotiation', 'Closed'];
const WORK_TYPES = ['Strategy', 'Design'];

export default function CRMDashboard() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [prospects, setProspects] = useState([]);
  const [view, setView] = useState('pipeline');
  const [selectedProspect, setSelectedProspect] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingProspect, setEditingProspect] = useState(null);
  const [showEngagementForm, setShowEngagementForm] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showWeighted, setShowWeighted] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) loadProspects();
  }, [session]);

  const loadProspects = async () => {
    setSyncing(true);
    const { data: prospectsData, error: prospectsError } = await supabase
      .from('prospects').select('*').order('created_at', { ascending: false });
    if (prospectsError) { console.error('Error loading prospects:', prospectsError); setSyncing(false); return; }
    const { data: engagementsData } = await supabase.from('engagements').select('*').order('date', { ascending: true });
    const prospectsWithEngagements = prospectsData.map(prospect => ({
      ...prospect,
      engagements: engagementsData?.filter(e => e.prospect_id === prospect.id) || []
    }));
    setProspects(prospectsWithEngagements);
    setSyncing(false);
  };

  const formatCurrency = (num) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(num);
  const formatDate = (dateStr) => !dateStr ? '—' : new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const formatMonthYear = (dateStr) => !dateStr ? '—' : new Date(dateStr).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  const daysSince = (dateStr) => !dateStr ? 0 : Math.floor((new Date() - new Date(dateStr)) / (1000 * 60 * 60 * 24));
  const parseWorkTypes = (workTypeStr) => !workTypeStr ? [] : workTypeStr.split(',').map(t => t.trim()).filter(Boolean);

  const totalPipeline = prospects.reduce((sum, p) => sum + (p.budget || 0), 0);
  const weightedPipeline = prospects.reduce((sum, p) => sum + ((p.budget || 0) * (p.probability || 50) / 100), 0);
  const stageBreakdown = STAGES.map(stage => ({
    stage, count: prospects.filter(p => p.stage === stage).length,
    value: prospects.filter(p => p.stage === stage).reduce((sum, p) => sum + (p.budget || 0), 0)
  }));
  const needsAttention = prospects.filter(p => daysSince(p.last_engagement) > 7);

  const handleSaveProspect = async (prospect) => {
    setSyncing(true);
    const data = {
      project_name: prospect.project_name, company: prospect.company, contact: prospect.contact, title: prospect.title, linkedin: prospect.linkedin,
      work_type: prospect.work_type, budget: prospect.budget, stage: prospect.stage, last_engagement: prospect.last_engagement,
      context: prospect.context, start_date: prospect.start_date, duration: prospect.duration, probability: prospect.probability
    };
    if (prospect.id) {
      await supabase.from('prospects').update(data).eq('id', prospect.id);
    } else {
      await supabase.from('prospects').insert({ ...data, user_id: session.user.id });
    }
    await loadProspects();
    setShowForm(false); setEditingProspect(null); setSyncing(false);
  };

  const handleDeleteProspect = async (id) => {
    setSyncing(true);
    await supabase.from('prospects').delete().eq('id', id);
    await loadProspects();
    setSelectedProspect(null); setSyncing(false);
  };

  const handleUpdateStage = async (prospect, newStage) => {
    setSyncing(true);
    await supabase.from('prospects').update({ stage: newStage }).eq('id', prospect.id);
    await loadProspects();
    setSelectedProspect({ ...prospect, stage: newStage }); setSyncing(false);
  };

  const handleAddEngagement = async (prospectId, engagement) => {
    setSyncing(true);
    await supabase.from('engagements').insert({ prospect_id: prospectId, date: engagement.date, type: engagement.type, note: engagement.note });
    await supabase.from('prospects').update({ last_engagement: engagement.date }).eq('id', prospectId);
    await loadProspects();
    setShowEngagementForm(false); setSyncing(false);
  };

  const handleExportCSV = () => {
    const headers = ['Project Name', 'Company', 'Contact', 'Title', 'LinkedIn', 'Work Type', 'Budget', 'Stage', 'Last Engagement', 'Start Date', 'Duration', 'Probability', 'Context'];
    const rows = prospects.map(p => [p.project_name || '', p.company, p.contact, p.title || '', p.linkedin || '', p.work_type || '', p.budget, p.stage, p.last_engagement, p.start_date || '', p.duration || 1, p.probability || 50, p.context]);
    const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'prospects.csv'; a.click();
  };

  const getProjectionData = () => {
    const today = new Date();
    const months = [];
    for (let i = 0; i < 12; i++) {
      const date = new Date(today.getFullYear(), today.getMonth() + i, 1);
      months.push({ date, label: date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }), strategy: 0, design: 0, strategyWeighted: 0, designWeighted: 0 });
    }
    prospects.forEach(p => {
      if (!p.start_date || !p.budget) return;
      const startDate = new Date(p.start_date);
      const durationWeeks = p.duration || 1;
      const durationMonths = Math.ceil(durationWeeks / 4);
      const monthlyRevenue = p.budget / durationMonths;
      const monthlyRevenueWeighted = (p.budget * (p.probability || 50) / 100) / durationMonths;
      const workTypes = parseWorkTypes(p.work_type);
      for (let i = 0; i < durationMonths; i++) {
        const revenueMonth = new Date(startDate.getFullYear(), startDate.getMonth() + i, 1);
        const monthIndex = months.findIndex(m => m.date.getMonth() === revenueMonth.getMonth() && m.date.getFullYear() === revenueMonth.getFullYear());
        if (monthIndex !== -1) {
          const typeCount = workTypes.length || 1;
          if (workTypes.includes('Strategy') || workTypes.length === 0) { months[monthIndex].strategy += monthlyRevenue / typeCount; months[monthIndex].strategyWeighted += monthlyRevenueWeighted / typeCount; }
          if (workTypes.includes('Design')) { months[monthIndex].design += monthlyRevenue / typeCount; months[monthIndex].designWeighted += monthlyRevenueWeighted / typeCount; }
        }
      }
    });
    return months;
  };
  if (loading) return <div style={styles.authContainer}><div style={styles.authBox}><h1 style={styles.logo}>Pipeline</h1><p style={styles.authText}>Loading...</p></div></div>;
  if (!session) return <AuthScreen />;

  const projectionData = getProjectionData();
  const maxProjection = Math.max(...projectionData.map(m => showWeighted ? (m.strategyWeighted + m.designWeighted) : (m.strategy + m.design)), 1);

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <h1 style={styles.logo}>Pipeline</h1>
          <span style={styles.tagline}>Business Tracker</span>
          {syncing && <span style={styles.syncIndicator}>Syncing...</span>}
        </div>
        <div style={styles.headerRight}>
          <span style={styles.userEmail}>{session.user.email}</span>
          <button onClick={() => supabase.auth.signOut()} style={styles.signOutButton}>Sign Out</button>
        </div>
      </header>

      <nav style={styles.nav}>
        <div style={styles.navLinks}>
          {['pipeline', 'list', 'projections', 'insights'].map(v => (
            <button key={v} onClick={() => setView(v)} style={{...styles.navLink, ...(view === v ? styles.navLinkActive : {})}}>{v.charAt(0).toUpperCase() + v.slice(1)}</button>
          ))}
        </div>
        <div style={styles.navActions}>
          <button onClick={handleExportCSV} style={styles.actionButton}>Export</button>
          <button onClick={() => { setEditingProspect(null); setShowForm(true); }} style={styles.actionButtonPrimary}>+ New Prospect</button>
        </div>
      </nav>

      <div style={styles.statsBar}>
        <div style={styles.stat}><span style={styles.statLabel}>Total Pipeline</span><span style={styles.statValue}>{formatCurrency(totalPipeline)}</span></div>
        <div style={styles.statDivider} />
        <div style={styles.stat}><span style={styles.statLabel}>Weighted Pipeline</span><span style={styles.statValue}>{formatCurrency(weightedPipeline)}</span></div>
        <div style={styles.statDivider} />
        <div style={styles.stat}><span style={styles.statLabel}>Prospects</span><span style={styles.statValue}>{prospects.length}</span></div>
        <div style={styles.statDivider} />
        <div style={styles.stat}><span style={styles.statLabel}>Needs Follow-up</span><span style={styles.statValue}>{needsAttention.length}</span></div>
      </div>

      <main style={styles.main}>
        {view === 'pipeline' && (
          <div style={styles.pipelineGrid}>
            {stageBreakdown.map(({ stage, count, value }) => (
              <div key={stage} style={styles.pipelineColumn}>
                <div style={styles.pipelineHeader}><span style={styles.stageName}>{stage}</span><span style={styles.stageCount}>{count}</span></div>
                <div style={styles.stageValue}>{formatCurrency(value)}</div>
                <div style={styles.pipelineCards}>
                  {prospects.filter(p => p.stage === stage).map(prospect => (
                    <div key={prospect.id} style={{...styles.prospectCard, ...(daysSince(prospect.last_engagement) > 7 ? styles.prospectCardStale : {})}} onClick={() => setSelectedProspect(prospect)}>
                      <div style={styles.cardCompany}>{prospect.project_name || prospect.company}</div>{prospect.project_name && <div style={styles.cardContact}>{prospect.company}</div>}
                      <div style={styles.cardContact}>{prospect.contact}</div>
                      {prospect.title && <div style={styles.cardTitle}>{prospect.title}</div>}
                      <div style={styles.cardMeta}><span>{parseWorkTypes(prospect.work_type).join(' + ') || '—'}</span><span>{formatCurrency(prospect.budget || 0)}</span></div>
                      {prospect.probability && <div style={styles.cardProbability}>{prospect.probability}% likely</div>}
                      <div style={styles.cardEngagement}>{daysSince(prospect.last_engagement)}d ago</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {view === 'list' && (
          <div style={styles.listView}>
            <table style={styles.table}>
              <thead><tr>
                <th style={styles.th}>Project</th><th style={styles.th}>Company</th><th style={styles.th}>Contact</th><th style={styles.th}>Type</th><th style={styles.th}>Budget</th>
                <th style={styles.th}>Prob.</th><th style={styles.th}>Start</th><th style={styles.th}>Duration</th><th style={styles.th}>Stage</th><th style={styles.th}>Last Contact</th>
              </tr></thead>
              <tbody>
                {prospects.map(prospect => (
                  <tr key={prospect.id} style={styles.tr} onClick={() => setSelectedProspect(prospect)}>
                    <td style={styles.td}>{prospect.project_name || '—'}</td><td style={styles.td}>{prospect.company}</td>
                    <td style={styles.td}>{prospect.contact}{prospect.linkedin && <a href={prospect.linkedin} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={styles.tableLinkIcon}>↗</a>}</td>
                    <td style={styles.tdSecondary}>{parseWorkTypes(prospect.work_type).join(', ') || '—'}</td>
                    <td style={styles.td}>{formatCurrency(prospect.budget || 0)}</td>
                    <td style={styles.td}>{prospect.probability || 50}%</td>
                    <td style={styles.tdSecondary}>{formatDate(prospect.start_date)}</td>
                    <td style={styles.tdSecondary}>{prospect.duration || 1}wk</td>
                    <td style={styles.td}>{prospect.stage}</td>
                    <td style={{...styles.td, ...(daysSince(prospect.last_engagement) > 7 ? { fontWeight: 700 } : {})}}>{formatDate(prospect.last_engagement)} ({daysSince(prospect.last_engagement)}d)</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {view === 'projections' && (
          <div style={styles.projectionsView}>
            <div style={styles.projectionHeader}>
              <h2 style={styles.projectionTitle}>Revenue Projections</h2>
              <div style={styles.projectionToggle}>
                <button onClick={() => setShowWeighted(false)} style={{...styles.toggleButton, ...(!showWeighted ? styles.toggleButtonActive : {})}}>Estimated</button>
                <button onClick={() => setShowWeighted(true)} style={{...styles.toggleButton, ...(showWeighted ? styles.toggleButtonActive : {})}}>Weighted</button>
              </div>
            </div>
            <div style={styles.chartLegend}>
              <div style={styles.legendItem}><div style={{...styles.legendColor, backgroundColor: '#000'}} /><span>Strategy</span></div>
              <div style={styles.legendItem}><div style={{...styles.legendColor, backgroundColor: '#666'}} /><span>Design</span></div>
            </div>
            <div style={styles.chartContainer}>
              <div style={styles.chartYAxis}><span>{formatCurrency(maxProjection)}</span><span>{formatCurrency(maxProjection / 2)}</span><span>$0</span></div>
              <div style={styles.chart}>
                {projectionData.map((month, idx) => {
                  const strategyVal = showWeighted ? month.strategyWeighted : month.strategy;
                  const designVal = showWeighted ? month.designWeighted : month.design;
                  const total = strategyVal + designVal;
                  return (
                    <div key={idx} style={styles.chartBar}>
                      <div style={styles.chartBarStack}>
                        <div style={{...styles.chartBarSegment, height: `${maxProjection ? (designVal / maxProjection) * 100 : 0}%`, backgroundColor: '#666'}} />
                        <div style={{...styles.chartBarSegment, height: `${maxProjection ? (strategyVal / maxProjection) * 100 : 0}%`, backgroundColor: '#000'}} />
                      </div>
                      <div style={styles.chartBarLabel}>{month.label}</div>
                      {total > 0 && <div style={styles.chartBarValue}>{formatCurrency(total)}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
            <div style={styles.projectionSummary}>
              <div style={styles.projectionSummaryItem}><span style={styles.projectionSummaryLabel}>12-Month {showWeighted ? 'Weighted' : 'Estimated'}</span><span style={styles.projectionSummaryValue}>{formatCurrency(projectionData.reduce((sum, m) => sum + (showWeighted ? m.strategyWeighted + m.designWeighted : m.strategy + m.design), 0))}</span></div>
              <div style={styles.projectionSummaryItem}><span style={styles.projectionSummaryLabel}>Strategy</span><span style={styles.projectionSummaryValue}>{formatCurrency(projectionData.reduce((sum, m) => sum + (showWeighted ? m.strategyWeighted : m.strategy), 0))}</span></div>
              <div style={styles.projectionSummaryItem}><span style={styles.projectionSummaryLabel}>Design</span><span style={styles.projectionSummaryValue}>{formatCurrency(projectionData.reduce((sum, m) => sum + (showWeighted ? m.designWeighted : m.design), 0))}</span></div>
            </div>
          </div>
        )}

        {view === 'insights' && (
          <div style={styles.insightsGrid}>
            <div style={styles.insightCard}>
              <h3 style={styles.insightTitle}>Pipeline by Stage</h3>
              <div style={styles.barChart}>
                {stageBreakdown.map(({ stage, value }) => (
                  <div key={stage} style={styles.barRow}>
                    <span style={styles.barLabel}>{stage}</span>
                    <div style={styles.barTrack}><div style={{...styles.barFill, width: `${totalPipeline ? (value / totalPipeline) * 100 : 0}%`}} /></div>
                    <span style={styles.barValue}>{formatCurrency(value)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={styles.insightCard}>
              <h3 style={styles.insightTitle}>Needs Attention</h3>
              <p style={styles.insightSubtitle}>No contact in 7+ days</p>
              {needsAttention.length === 0 ? <p style={styles.emptyState}>All prospects contacted recently</p> : (
                <div style={styles.attentionList}>
                  {needsAttention.map(p => (
                    <div key={p.id} style={styles.attentionItem} onClick={() => setSelectedProspect(p)}>
                      <span style={styles.attentionCompany}>{p.company}</span>
                      <span style={styles.attentionDays}>{daysSince(p.last_engagement)} days</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={styles.insightCard}>
              <h3 style={styles.insightTitle}>Work Type Breakdown</h3>
              <div style={styles.typeList}>
                {WORK_TYPES.map(type => {
                  const typeProspects = prospects.filter(p => parseWorkTypes(p.work_type).includes(type));
                  const count = typeProspects.length;
                  const value = typeProspects.reduce((sum, p) => sum + ((p.budget || 0) / (parseWorkTypes(p.work_type).length || 1)), 0);
                  if (count === 0) return null;
                  return <div key={type} style={styles.typeRow}><span style={styles.typeName}>{type}</span><span style={styles.typeCount}>{count}</span><span style={styles.typeValue}>{formatCurrency(value)}</span></div>;
                })}
              </div>
            </div>
            <div style={styles.insightCard}>
              <h3 style={styles.insightTitle}>Probability Distribution</h3>
              <div style={styles.typeList}>
                {[{ label: 'High (75-100%)', min: 75, max: 100 }, { label: 'Medium (50-74%)', min: 50, max: 74 }, { label: 'Low (25-49%)', min: 25, max: 49 }, { label: 'Very Low (0-24%)', min: 0, max: 24 }].map(({ label, min, max }) => {
                  const filtered = prospects.filter(p => (p.probability || 50) >= min && (p.probability || 50) <= max);
                  if (filtered.length === 0) return null;
                  return <div key={label} style={styles.typeRow}><span style={styles.typeName}>{label}</span><span style={styles.typeCount}>{filtered.length}</span><span style={styles.typeValue}>{formatCurrency(filtered.reduce((sum, p) => sum + (p.budget || 0), 0))}</span></div>;
                })}
              </div>
            </div>
          </div>
        )}
      </main>

      {selectedProspect && (
        <div style={styles.overlay} onClick={() => setSelectedProspect(null)}>
          <div style={styles.sidebar} onClick={e => e.stopPropagation()}>
            <div style={styles.sidebarHeader}>
              <h2 style={styles.sidebarTitle}>{selectedProspect.project_name || selectedProspect.company}</h2>
              <button onClick={() => setSelectedProspect(null)} style={styles.closeButton}>×</button>
            </div>
            <div style={styles.sidebarContent}>
              <div style={styles.detailSection}><label style={styles.detailLabel}>Company</label><p style={styles.detailValue}>{selectedProspect.company}</p></div><div style={styles.detailSection}><label style={styles.detailLabel}>Contact</label><p style={styles.detailValue}>{selectedProspect.contact}</p>{selectedProspect.title && <p style={styles.detailValueSecondary}>{selectedProspect.title}</p>}</div>
              {selectedProspect.linkedin && <div style={styles.detailSection}><label style={styles.detailLabel}>LinkedIn</label><a href={selectedProspect.linkedin} target="_blank" rel="noopener noreferrer" style={styles.linkedInLink}>View Profile →</a></div>}
              <div style={styles.detailRow}>
                <div style={styles.detailSection}><label style={styles.detailLabel}>Work Type</label><p style={styles.detailValue}>{parseWorkTypes(selectedProspect.work_type).join(' + ') || '—'}</p></div>
                <div style={styles.detailSection}><label style={styles.detailLabel}>Budget</label><p style={styles.detailValue}>{formatCurrency(selectedProspect.budget || 0)}</p></div>
              </div>
              <div style={styles.detailRow}>
                <div style={styles.detailSection}><label style={styles.detailLabel}>Probability</label><p style={styles.detailValue}>{selectedProspect.probability || 50}%</p></div>
                <div style={styles.detailSection}><label style={styles.detailLabel}>Weighted Value</label><p style={styles.detailValue}>{formatCurrency((selectedProspect.budget || 0) * (selectedProspect.probability || 50) / 100)}</p></div>
              </div>
              <div style={styles.detailRow}>
                <div style={styles.detailSection}><label style={styles.detailLabel}>Start Date</label><p style={styles.detailValue}>{formatMonthYear(selectedProspect.start_date)}</p></div>
                <div style={styles.detailSection}><label style={styles.detailLabel}>Duration</label><p style={styles.detailValue}>{selectedProspect.duration || 1} week{(selectedProspect.duration || 1) !== 1 ? 's' : ''}</p></div>
              </div>
              <div style={styles.detailSection}>
                <label style={styles.detailLabel}>Stage</label>
                <div style={styles.stageSelector}>
                  {STAGES.map(stage => <button key={stage} onClick={() => handleUpdateStage(selectedProspect, stage)} style={{...styles.stageButton, ...(selectedProspect.stage === stage ? styles.stageButtonActive : {})}}>{stage}</button>)}
                </div>
              </div>
              <div style={styles.detailSection}><label style={styles.detailLabel}>Context & Notes</label><p style={styles.detailValue}>{selectedProspect.context || '—'}</p></div>
              <div style={styles.detailSection}>
                <div style={styles.engagementHeader}><label style={styles.detailLabel}>Engagement History</label><button onClick={() => setShowEngagementForm(true)} style={styles.smallButton}>+ Add</button></div>
                {(!selectedProspect.engagements || selectedProspect.engagements.length === 0) ? <p style={styles.emptyState}>No engagements recorded</p> : (
                  <div style={styles.engagementList}>
                    {[...selectedProspect.engagements].reverse().map((eng, idx) => (
                      <div key={idx} style={styles.engagementItem}><div style={styles.engagementDate}>{formatDate(eng.date)}</div><div style={styles.engagementType}>{eng.type}</div><div style={styles.engagementNote}>{eng.note}</div></div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div style={styles.sidebarFooter}>
              <button onClick={() => { setEditingProspect(selectedProspect); setShowForm(true); setSelectedProspect(null); }} style={styles.actionButton}>Edit</button>
              <button onClick={() => handleDeleteProspect(selectedProspect.id)} style={styles.deleteButton}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {showForm && <ProspectForm prospect={editingProspect} onSave={handleSaveProspect} onCancel={() => { setShowForm(false); setEditingProspect(null); }} />}
      {showEngagementForm && selectedProspect && <EngagementForm onSave={(eng) => handleAddEngagement(selectedProspect.id, eng)} onCancel={() => setShowEngagementForm(false)} />}
    </div>
  );
}

function AuthScreen() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setMessage(''); setLoading(true);
    if (isSignUp) {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) setError(error.message); else setMessage('Check your email for the confirmation link.');
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    }
    setLoading(false);
  };

  return (
    <div style={styles.authContainer}>
      <div style={styles.authBox}>
        <h1 style={styles.logo}>Pipeline</h1>
        <p style={styles.authTagline}>Business Tracker</p>
        <form onSubmit={handleSubmit} style={styles.authForm}>
          <div style={styles.formGroup}><label style={styles.formLabel}>Email</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} style={styles.input} required /></div>
          <div style={styles.formGroup}><label style={styles.formLabel}>Password</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} style={styles.input} required minLength={6} /></div>
          {error && <p style={styles.authError}>{error}</p>}
          {message && <p style={styles.authMessage}>{message}</p>}
          <button type="submit" style={styles.actionButtonPrimary} disabled={loading}>{loading ? 'Loading...' : (isSignUp ? 'Sign Up' : 'Sign In')}</button>
        </form>
        <button onClick={() => { setIsSignUp(!isSignUp); setError(''); setMessage(''); }} style={styles.authToggle}>{isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}</button>
      </div>
    </div>
  );
}

function ProspectForm({ prospect, onSave, onCancel }) {
  const [form, setForm] = useState(prospect ? { ...prospect, project_name: prospect.project_name || '', work_type: prospect.work_type || '', last_engagement: prospect.last_engagement || new Date().toISOString().split('T')[0], start_date: prospect.start_date || '', duration: prospect.duration || 1, probability: prospect.probability || 50 } : { project_name: '', company: '', contact: '', linkedin: '', title: '', work_type: '', budget: 0, stage: 'Lead', last_engagement: new Date().toISOString().split('T')[0], context: '', start_date: '', duration: 1, probability: 50 });
  const selectedWorkTypes = form.work_type ? form.work_type.split(',').map(t => t.trim()).filter(Boolean) : [];
  const toggleWorkType = (type) => { const newTypes = selectedWorkTypes.includes(type) ? selectedWorkTypes.filter(t => t !== type) : [...selectedWorkTypes, type]; setForm({ ...form, work_type: newTypes.join(',') }); };
  const handleSubmit = (e) => { e.preventDefault(); onSave({ ...form, budget: Number(form.budget), duration: Number(form.duration), probability: Number(form.probability), start_date: form.start_date || null }); };

  return (
    <div style={styles.overlay} onClick={onCancel}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <h2 style={styles.modalTitle}>{prospect ? 'Edit Prospect' : 'New Prospect'}</h2>
        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.formSection}>
            <label style={styles.formSectionLabel}>LinkedIn Profile</label>
            <div style={styles.linkedInInputWrapper}>
              <input type="url" value={form.linkedin || ''} onChange={e => setForm({ ...form, linkedin: e.target.value })} placeholder="https://linkedin.com/in/username" style={styles.input} />
              {form.linkedin && <a href={form.linkedin} target="_blank" rel="noopener noreferrer" style={styles.linkedInPreviewLink}>Open →</a>}
            </div>
          </div>
          <div style={styles.formDivider} />
          <div style={styles.formRow}>
            <div style={styles.formGroup}><label style={styles.formLabel}>Contact Name</label><input type="text" value={form.contact} onChange={e => setForm({ ...form, contact: e.target.value })} style={styles.input} required /></div>
            <div style={styles.formGroup}><label style={styles.formLabel}>Title / Role</label><input type="text" value={form.title || ''} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. VP of Engineering" style={styles.input} /></div>
          </div>
          <div style={styles.formGroup}><label style={styles.formLabel}>Project Name</label><input type="text" value={form.project_name || ''} onChange={e => setForm({ ...form, project_name: e.target.value })} placeholder="e.g. Website Redesign" style={styles.input} /></div>
          <div style={styles.formGroup}><label style={styles.formLabel}>Company</label><input type="text" value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} style={styles.input} required /></div>
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Work Type</label>
            <div style={styles.workTypeSelector}>
              {WORK_TYPES.map(type => <button key={type} type="button" onClick={() => toggleWorkType(type)} style={{...styles.workTypeButton, ...(selectedWorkTypes.includes(type) ? styles.workTypeButtonActive : {})}}>{type}</button>)}
            </div>
          </div>
          <div style={styles.formDivider} />
          <div style={styles.formRow}>
            <div style={styles.formGroup}><label style={styles.formLabel}>Estimated Budget</label><input type="number" value={form.budget} onChange={e => setForm({ ...form, budget: e.target.value })} style={styles.input} /></div>
            <div style={styles.formGroup}><label style={styles.formLabel}>Probability (%)</label><input type="number" min="0" max="100" value={form.probability} onChange={e => setForm({ ...form, probability: e.target.value })} style={styles.input} /></div>
          </div>
          <div style={styles.formRow}>
            <div style={styles.formGroup}><label style={styles.formLabel}>Likely Start Date</label><input type="date" value={form.start_date || ''} onChange={e => setForm({ ...form, start_date: e.target.value })} style={styles.input} /></div>
            <div style={styles.formGroup}><label style={styles.formLabel}>Duration (weeks)</label><input type="number" min="1" value={form.duration} onChange={e => setForm({ ...form, duration: e.target.value })} style={styles.input} /></div>
          </div>
          <div style={styles.formRow}>
            <div style={styles.formGroup}><label style={styles.formLabel}>Stage</label><select value={form.stage} onChange={e => setForm({ ...form, stage: e.target.value })} style={styles.select}>{STAGES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
            <div style={styles.formGroup}><label style={styles.formLabel}>Last Engagement</label><input type="date" value={form.last_engagement} onChange={e => setForm({ ...form, last_engagement: e.target.value })} style={styles.input} /></div>
          </div>
          <div style={styles.formGroup}><label style={styles.formLabel}>Context & Notes</label><textarea value={form.context || ''} onChange={e => setForm({ ...form, context: e.target.value })} style={styles.textarea} rows={3} placeholder="Key interests, how you met, decision-making process, etc." /></div>
          <div style={styles.formActions}><button type="button" onClick={onCancel} style={styles.actionButton}>Cancel</button><button type="submit" style={styles.actionButtonPrimary}>Save</button></div>
        </form>
      </div>
    </div>
  );
}

function EngagementForm({ onSave, onCancel }) {
  const [form, setForm] = useState({ date: new Date().toISOString().split('T')[0], type: 'Email', note: '' });
  const handleSubmit = (e) => { e.preventDefault(); onSave(form); };
  return (
    <div style={styles.overlay} onClick={onCancel}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <h2 style={styles.modalTitle}>Log Engagement</h2>
        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.formRow}>
            <div style={styles.formGroup}><label style={styles.formLabel}>Date</label><input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} style={styles.input} /></div>
            <div style={styles.formGroup}><label style={styles.formLabel}>Type</label><select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} style={styles.select}>{['Email', 'Call', 'Meeting', 'LinkedIn', 'Other'].map(t => <option key={t} value={t}>{t}</option>)}</select></div>
          </div>
          <div style={styles.formGroup}><label style={styles.formLabel}>Note</label><textarea value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} style={styles.textarea} rows={2} /></div>
          <div style={styles.formActions}><button type="button" onClick={onCancel} style={styles.actionButton}>Cancel</button><button type="submit" style={styles.actionButtonPrimary}>Save</button></div>
        </form>
      </div>
    </div>
  );
}

const styles = {
  container: { fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif', fontSize: '14px', lineHeight: 1.5, color: '#000', backgroundColor: '#fff', minHeight: '100vh', letterSpacing: '-0.01em' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '24px 32px', borderBottom: '1px solid #000' },
  headerLeft: { display: 'flex', alignItems: 'baseline', gap: '16px' },
  logo: { fontSize: '24px', fontWeight: 700, margin: 0, letterSpacing: '-0.02em' },
  tagline: { fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#666' },
  syncIndicator: { fontSize: '11px', color: '#666', marginLeft: '16px' },
  headerRight: { display: 'flex', alignItems: 'center', gap: '16px' },
  userEmail: { fontSize: '12px', color: '#666' },
  signOutButton: { padding: '6px 12px', fontSize: '11px', background: 'none', border: '1px solid #ddd', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'inherit' },
  nav: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 32px', borderBottom: '1px solid #000' },
  navLinks: { display: 'flex' },
  navLink: { background: 'none', border: 'none', borderBottom: '2px solid transparent', padding: '16px 24px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#666', fontFamily: 'inherit' },
  navLinkActive: { color: '#000', borderBottomColor: '#000' },
  navActions: { display: 'flex', gap: '12px', alignItems: 'center' },
  actionButton: { padding: '8px 16px', fontSize: '12px', background: 'none', border: '1px solid #000', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'inherit' },
  actionButtonPrimary: { padding: '8px 16px', fontSize: '12px', background: '#000', color: '#fff', border: '1px solid #000', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'inherit' },
  statsBar: { display: 'flex', alignItems: 'center', padding: '20px 32px', borderBottom: '1px solid #000', gap: '32px' },
  stat: { display: 'flex', flexDirection: 'column', gap: '4px' },
  statLabel: { fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#666' },
  statValue: { fontSize: '24px', fontWeight: 700, letterSpacing: '-0.02em' },
  statDivider: { width: '1px', height: '40px', backgroundColor: '#ddd' },
  main: { padding: '32px' },
  pipelineGrid: { display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '1px', backgroundColor: '#000' },
  pipelineColumn: { backgroundColor: '#fff', padding: '16px', minHeight: '400px' },
  pipelineHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' },
  stageName: { fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' },
  stageCount: { fontSize: '11px', color: '#666' },
  stageValue: { fontSize: '16px', fontWeight: 500, marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid #eee' },
  pipelineCards: { display: 'flex', flexDirection: 'column', gap: '8px' },
  prospectCard: { padding: '12px', border: '1px solid #ddd', cursor: 'pointer', transition: 'border-color 0.15s' },
  prospectCardStale: { borderColor: '#000', borderWidth: '2px' },
  cardCompany: { fontWeight: 700, marginBottom: '2px' },
  cardContact: { fontSize: '12px', color: '#666', marginBottom: '2px' },
  cardTitle: { fontSize: '11px', color: '#999', marginBottom: '8px' },
  cardMeta: { display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#666' },
  cardProbability: { fontSize: '10px', color: '#999', marginTop: '4px' },
  cardEngagement: { fontSize: '10px', color: '#999', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' },
  listView: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '12px 16px', borderBottom: '2px solid #000', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 },
  tr: { cursor: 'pointer', transition: 'background 0.15s' },
  td: { padding: '12px 16px', borderBottom: '1px solid #eee' },
  tdSecondary: { padding: '12px 16px', borderBottom: '1px solid #eee', color: '#666', fontSize: '13px' },
  tableLinkIcon: { marginLeft: '6px', color: '#000', textDecoration: 'none', fontSize: '11px' },
  projectionsView: { maxWidth: '1000px' },
  projectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' },
  projectionTitle: { fontSize: '18px', fontWeight: 700, margin: 0 },
  projectionToggle: { display: 'flex', border: '1px solid #000' },
  toggleButton: { padding: '8px 16px', fontSize: '12px', background: 'none', border: 'none', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'inherit' },
  toggleButtonActive: { backgroundColor: '#000', color: '#fff' },
  chartLegend: { display: 'flex', gap: '24px', marginBottom: '16px' },
  legendItem: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' },
  legendColor: { width: '16px', height: '16px' },
  chartContainer: { display: 'flex', gap: '16px', marginBottom: '32px' },
  chartYAxis: { display: 'flex', flexDirection: 'column', justifyContent: 'space-between', fontSize: '11px', color: '#666', textAlign: 'right', paddingBottom: '24px' },
  chart: { flex: 1, display: 'flex', gap: '8px', alignItems: 'flex-end', height: '300px', borderBottom: '1px solid #000', borderLeft: '1px solid #000', paddingLeft: '8px' },
  chartBar: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%' },
  chartBarStack: { flex: 1, width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' },
  chartBarSegment: { width: '100%', transition: 'height 0.3s' },
  chartBarLabel: { fontSize: '10px', marginTop: '8px', color: '#666' },
  chartBarValue: { fontSize: '9px', color: '#999', marginTop: '2px' },
  projectionSummary: { display: 'flex', gap: '32px', padding: '24px', border: '1px solid #000' },
  projectionSummaryItem: { display: 'flex', flexDirection: 'column', gap: '4px' },
  projectionSummaryLabel: { fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#666' },
  projectionSummaryValue: { fontSize: '20px', fontWeight: 700 },
  insightsGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '24px' },
  insightCard: { border: '1px solid #000', padding: '24px' },
  insightTitle: { fontSize: '14px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 0, marginBottom: '16px' },
  insightSubtitle: { fontSize: '12px', color: '#666', marginBottom: '16px' },
  barChart: { display: 'flex', flexDirection: 'column', gap: '12px' },
  barRow: { display: 'grid', gridTemplateColumns: '80px 1fr 80px', alignItems: 'center', gap: '12px' },
  barLabel: { fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' },
  barTrack: { height: '8px', backgroundColor: '#eee' },
  barFill: { height: '100%', backgroundColor: '#000', transition: 'width 0.3s' },
  barValue: { fontSize: '12px', textAlign: 'right' },
  attentionList: { display: 'flex', flexDirection: 'column', gap: '8px' },
  attentionItem: { display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #eee', cursor: 'pointer' },
  attentionCompany: { fontWeight: 500 },
  attentionDays: { fontSize: '12px', color: '#666' },
  typeList: { display: 'flex', flexDirection: 'column', gap: '8px' },
  typeRow: { display: 'grid', gridTemplateColumns: '1fr 40px 80px', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #eee' },
  typeName: { fontSize: '13px' },
  typeCount: { fontSize: '12px', color: '#666', textAlign: 'center' },
  typeValue: { fontSize: '12px', textAlign: 'right' },
  emptyState: { fontSize: '13px', color: '#666', fontStyle: 'italic' },
  overlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.3)', display: 'flex', justifyContent: 'flex-end', zIndex: 1000 },
  sidebar: { width: '400px', backgroundColor: '#fff', height: '100%', display: 'flex', flexDirection: 'column', borderLeft: '1px solid #000' },
  sidebarHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '24px', borderBottom: '1px solid #000' },
  sidebarTitle: { fontSize: '20px', fontWeight: 700, margin: 0 },
  closeButton: { background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', padding: 0, lineHeight: 1 },
  sidebarContent: { flex: 1, padding: '24px', overflowY: 'auto' },
  detailSection: { marginBottom: '20px' },
  detailRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' },
  detailLabel: { fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#666', display: 'block', marginBottom: '4px' },
  detailValue: { fontSize: '14px', margin: 0 },
  detailValueSecondary: { fontSize: '13px', margin: 0, marginTop: '2px', color: '#666' },
  linkedInLink: { fontSize: '13px', color: '#000', textDecoration: 'none', borderBottom: '1px solid #000', paddingBottom: '1px' },
  stageSelector: { display: 'flex', flexWrap: 'wrap', gap: '8px' },
  stageButton: { padding: '6px 12px', fontSize: '11px', background: 'none', border: '1px solid #ddd', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'inherit' },
  stageButtonActive: { backgroundColor: '#000', color: '#fff', borderColor: '#000' },
  engagementHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' },
  smallButton: { padding: '4px 8px', fontSize: '11px', background: 'none', border: '1px solid #000', cursor: 'pointer', fontFamily: 'inherit' },
  engagementList: { display: 'flex', flexDirection: 'column', gap: '12px' },
  engagementItem: { paddingBottom: '12px', borderBottom: '1px solid #eee' },
  engagementDate: { fontSize: '11px', color: '#666' },
  engagementType: { fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' },
  engagementNote: { fontSize: '13px', marginTop: '4px' },
  sidebarFooter: { display: 'flex', gap: '12px', padding: '24px', borderTop: '1px solid #000' },
  deleteButton: { padding: '8px 16px', fontSize: '12px', background: 'none', border: '1px solid #000', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'inherit', color: '#666' },
  modal: { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', backgroundColor: '#fff', border: '1px solid #000', padding: '32px', width: '500px', maxWidth: '90vw', maxHeight: '90vh', overflowY: 'auto' },
  modalTitle: { fontSize: '18px', fontWeight: 700, marginTop: 0, marginBottom: '24px' },
  form: { display: 'flex', flexDirection: 'column', gap: '16px' },
  formRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' },
  formGroup: { display: 'flex', flexDirection: 'column', gap: '4px' },
  formSection: { marginBottom: '8px' },
  formSectionLabel: { fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px', display: 'block' },
  formDivider: { height: '1px', backgroundColor: '#ddd', margin: '16px 0' },
  linkedInInputWrapper: { display: 'flex', gap: '8px', alignItems: 'center' },
  linkedInPreviewLink: { fontSize: '12px', color: '#000', textDecoration: 'none', whiteSpace: 'nowrap', padding: '10px 12px', border: '1px solid #000' },
  formLabel: { fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#666' },
  input: { padding: '10px 12px', fontSize: '14px', border: '1px solid #000', fontFamily: 'inherit', outline: 'none', flex: 1 },
  select: { padding: '10px 12px', fontSize: '14px', border: '1px solid #000', fontFamily: 'inherit', outline: 'none', backgroundColor: '#fff' },
  textarea: { padding: '10px 12px', fontSize: '14px', border: '1px solid #000', fontFamily: 'inherit', outline: 'none', resize: 'vertical' },
  formActions: { display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' },
  workTypeSelector: { display: 'flex', gap: '8px' },
  workTypeButton: { padding: '10px 20px', fontSize: '12px', background: 'none', border: '1px solid #ddd', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'inherit' },
  workTypeButtonActive: { backgroundColor: '#000', color: '#fff', borderColor: '#000' },
  authContainer: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif', backgroundColor: '#fff' },
  authBox: { width: '320px', padding: '48px 32px', border: '1px solid #000' },
  authTagline: { fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#666', marginTop: '8px', marginBottom: '32px' },
  authForm: { display: 'flex', flexDirection: 'column', gap: '16px' },
  authError: { fontSize: '13px', color: '#c00', margin: 0 },
  authMessage: { fontSize: '13px', color: '#060', margin: 0 },
  authToggle: { marginTop: '24px', background: 'none', border: 'none', fontSize: '12px', color: '#666', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit' },
  authText: { fontSize: '13px', color: '#666' }
};
