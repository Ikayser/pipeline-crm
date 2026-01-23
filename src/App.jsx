import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://kpgjgbbozgmbhtysocck.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtwZ2pnYmJvemdtYmh0eXNvY2NrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxMDA4OTIsImV4cCI6MjA4NDY3Njg5Mn0.JcABMK1Tcqm1gFmI8kxthDEDsSrflx4QONXXy-hAJGg'
);

const STAGES = ['Lead', 'Contacted', 'Meeting', 'Proposal', 'Negotiation', 'Closed'];
const PROJECT_STATUSES = ['Active', 'Completed', 'On Hold'];
const WORK_TYPES = ['Strategy', 'Design'];
const BILLABLE_RATE = 290; // $ per hour average

// Generate next 12 months starting from current month
const getNext12Months = () => {
  const months = [];
  const today = new Date();
  for (let i = 0; i < 12; i++) {
    const date = new Date(today.getFullYear(), today.getMonth() + i, 1);
    months.push({
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      label: date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      date
    });
  }
  return months;
};

const MONTHS = getNext12Months();

// Calculate FTEs needed: weekly revenue / billable rate / 40 hours
const calculateFTE = (contractValue, durationWeeks) => {
  if (!contractValue || !durationWeeks) return 0;
  const weeklyRevenue = contractValue / durationWeeks;
  return weeklyRevenue / BILLABLE_RATE / 40;
};

export default function CRMDashboard() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [masterTab, setMasterTab] = useState('pipeline');
  const [prospects, setProspects] = useState([]);
  const [projects, setProjects] = useState([]);
  const [settings, setSettings] = useState({ monthlyTargets: {}, currentStaff: 0, plannedHires: {} });
  const [view, setView] = useState('pipeline');
  const [projectView, setProjectView] = useState('list');
  const [selectedProspect, setSelectedProspect] = useState(null);
  const [selectedProject, setSelectedProject] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [editingProspect, setEditingProspect] = useState(null);
  const [editingProject, setEditingProject] = useState(null);
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
    if (session) {
      loadProspects();
      loadProjects();
      loadSettings();
    }
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

  const loadProjects = async () => {
    const { data: projectsData, error: projectsError } = await supabase
      .from('projects').select('*').order('start_date', { ascending: true });
    if (projectsError) { console.error('Error loading projects:', projectsError); return; }
    setProjects(projectsData || []);
  };

  const loadSettings = async () => {
    const { data, error } = await supabase.from('settings').select('*');
    if (error) { console.error('Error loading settings:', error); return; }
    const settingsObj = { monthlyTargets: {}, currentStaff: 0, plannedHires: {} };
    data?.forEach(row => {
      if (row.setting_key === 'monthlyTargets') settingsObj.monthlyTargets = row.setting_value || {};
      if (row.setting_key === 'currentStaff') settingsObj.currentStaff = row.setting_value?.value || 0;
      if (row.setting_key === 'plannedHires') settingsObj.plannedHires = row.setting_value || {};
    });
    setSettings(settingsObj);
  };

  const saveSettings = async (key, value) => {
    setSyncing(true);
    const { data: existing } = await supabase.from('settings').select('id').eq('setting_key', key).eq('user_id', session.user.id).single();
    if (existing) {
      await supabase.from('settings').update({ setting_value: value }).eq('id', existing.id);
    } else {
      await supabase.from('settings').insert({ user_id: session.user.id, setting_key: key, setting_value: value });
    }
    await loadSettings();
    setSyncing(false);
  };

  const formatCurrency = (num) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(num || 0);
  const formatDate = (dateStr) => !dateStr ? '—' : new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const formatMonthYear = (dateStr) => !dateStr ? '—' : new Date(dateStr).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  const daysSince = (dateStr) => !dateStr ? 0 : Math.floor((new Date() - new Date(dateStr)) / (1000 * 60 * 60 * 24));
  const parseWorkTypes = (workTypeStr) => !workTypeStr ? [] : workTypeStr.split(',').map(t => t.trim()).filter(Boolean);

  const totalPipeline = prospects.reduce((sum, p) => sum + (p.budget || 0), 0);
  const weightedPipeline = prospects.reduce((sum, p) => sum + ((p.budget || 0) * (p.probability || 50) / 100), 0);
  const totalCommitted = projects.filter(p => p.status === 'Active').reduce((sum, p) => sum + (p.contract_value || 0), 0);
  const annualTarget = MONTHS.reduce((sum, m) => sum + (settings.monthlyTargets[m.key] || 0), 0);
  
  const stageBreakdown = STAGES.map(stage => ({
    stage, count: prospects.filter(p => p.stage === stage).length,
    value: prospects.filter(p => p.stage === stage).reduce((sum, p) => sum + (p.budget || 0), 0)
  }));
  const needsAttention = prospects.filter(p => daysSince(p.last_engagement) > 7);

  // Handlers for prospects
  const handleSaveProspect = async (prospect) => {
    setSyncing(true);
    const data = {
      project_name: prospect.project_name, company: prospect.company, contact: prospect.contact, title: prospect.title, linkedin: prospect.linkedin,
      work_type: prospect.work_type, budget: prospect.budget, stage: prospect.stage, last_engagement: prospect.last_engagement,
      context: prospect.context, start_date: prospect.start_date, duration: prospect.duration, probability: prospect.probability,
      staffing_fte: prospect.staffing_fte
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

  const handleConvertToProject = async (prospect) => {
    setSyncing(true);
    const projectData = {
      user_id: session.user.id,
      project_name: prospect.project_name || prospect.company,
      company: prospect.company,
      contact: prospect.contact,
      title: prospect.title,
      linkedin: prospect.linkedin,
      work_type: prospect.work_type,
      contract_value: prospect.budget,
      start_date: prospect.start_date,
      duration: prospect.duration,
      status: 'Active',
      context: prospect.context,
      prospect_id: prospect.id,
      staffing_fte: prospect.staffing_fte
    };
    await supabase.from('projects').insert(projectData);
    await supabase.from('prospects').update({ stage: 'Closed' }).eq('id', prospect.id);
    await loadProspects();
    await loadProjects();
    setSelectedProspect(null);
    setSyncing(false);
  };

  // Handlers for projects
  const handleSaveProject = async (project) => {
    setSyncing(true);
    const data = {
      project_name: project.project_name, company: project.company, contact: project.contact, title: project.title, linkedin: project.linkedin,
      work_type: project.work_type, contract_value: project.contract_value, start_date: project.start_date,
      duration: project.duration, status: project.status, context: project.context, staffing_fte: project.staffing_fte
    };
    if (project.id) {
      await supabase.from('projects').update(data).eq('id', project.id);
    } else {
      await supabase.from('projects').insert({ ...data, user_id: session.user.id });
    }
    await loadProjects();
    setShowProjectForm(false); setEditingProject(null); setSyncing(false);
  };

  const handleDeleteProject = async (id) => {
    setSyncing(true);
    await supabase.from('projects').delete().eq('id', id);
    await loadProjects();
    setSelectedProject(null); setSyncing(false);
  };

  const handleUpdateProjectStatus = async (project, newStatus) => {
    setSyncing(true);
    await supabase.from('projects').update({ status: newStatus }).eq('id', project.id);
    await loadProjects();
    setSelectedProject({ ...project, status: newStatus }); setSyncing(false);
  };

  // Projection calculations with staffing
  const getProjectionData = () => {
    const today = new Date();
    const months = MONTHS.map(m => ({ 
      ...m,
      committedRevenue: 0, pipelineRevenue: 0, pipelineRevenueWeighted: 0,
      committedFTE: 0, pipelineFTE: 0, pipelineFTEWeighted: 0,
      target: settings.monthlyTargets[m.key] || 0,
      hires: settings.plannedHires[m.key] || 0
    }));

    // Add committed revenue and FTEs from projects
    projects.filter(p => p.status === 'Active').forEach(p => {
      if (!p.start_date || !p.contract_value) return;
      const startDate = new Date(p.start_date);
      const durationWeeks = p.duration || 1;
      const weeklyRevenue = p.contract_value / durationWeeks;
      const weeklyFTE = p.staffing_fte != null ? p.staffing_fte / (durationWeeks / 4) : calculateFTE(p.contract_value, durationWeeks);
      
      for (let week = 0; week < durationWeeks; week++) {
        const revenueDate = new Date(startDate);
        revenueDate.setDate(revenueDate.getDate() + (week * 7));
        const monthKey = `${revenueDate.getFullYear()}-${String(revenueDate.getMonth() + 1).padStart(2, '0')}`;
        const monthIndex = months.findIndex(m => m.key === monthKey);
        if (monthIndex !== -1) {
          months[monthIndex].committedRevenue += weeklyRevenue;
          months[monthIndex].committedFTE += weeklyFTE / 4; // Convert weekly to monthly
        }
      }
    });

    // Add pipeline revenue and FTEs from prospects
    prospects.filter(p => p.stage !== 'Closed').forEach(p => {
      if (!p.start_date || !p.budget) return;
      const startDate = new Date(p.start_date);
      const durationWeeks = p.duration || 1;
      const probability = (p.probability || 50) / 100;
      const weeklyRevenue = p.budget / durationWeeks;
      const weeklyFTE = p.staffing_fte != null ? p.staffing_fte / (durationWeeks / 4) : calculateFTE(p.budget, durationWeeks);
      
      for (let week = 0; week < durationWeeks; week++) {
        const revenueDate = new Date(startDate);
        revenueDate.setDate(revenueDate.getDate() + (week * 7));
        const monthKey = `${revenueDate.getFullYear()}-${String(revenueDate.getMonth() + 1).padStart(2, '0')}`;
        const monthIndex = months.findIndex(m => m.key === monthKey);
        if (monthIndex !== -1) {
          months[monthIndex].pipelineRevenue += weeklyRevenue;
          months[monthIndex].pipelineRevenueWeighted += weeklyRevenue * probability;
          months[monthIndex].pipelineFTE += weeklyFTE / 4;
          months[monthIndex].pipelineFTEWeighted += (weeklyFTE / 4) * probability;
        }
      }
    });

    // Calculate cumulative available staff
    let cumulativeHires = 0;
    months.forEach(m => {
      cumulativeHires += m.hires;
      m.availableStaff = settings.currentStaff + cumulativeHires;
    });

    return months;
  };

  const handleExportCSV = () => {
    const headers = ['Project Name', 'Company', 'Contact', 'Title', 'LinkedIn', 'Work Type', 'Budget', 'Stage', 'Last Engagement', 'Start Date', 'Duration', 'Probability', 'Staffing FTE', 'Context'];
    const rows = prospects.map(p => [p.project_name || '', p.company, p.contact, p.title || '', p.linkedin || '', p.work_type || '', p.budget, p.stage, p.last_engagement, p.start_date || '', p.duration || 1, p.probability || 50, p.staffing_fte || '', p.context]);
    const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'prospects.csv'; a.click();
  };

  const handleExportProjectsCSV = () => {
    const headers = ['Project Name', 'Company', 'Contact', 'Title', 'Work Type', 'Contract Value', 'Start Date', 'Duration (weeks)', 'Status', 'Staffing FTE', 'Context'];
    const rows = projects.map(p => [p.project_name || '', p.company, p.contact || '', p.title || '', p.work_type || '', p.contract_value, p.start_date || '', p.duration || 1, p.status, p.staffing_fte || '', p.context || '']);
    const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'projects.csv'; a.click();
  };

  if (loading) return <div style={styles.authContainer}><div style={styles.authBox}><h1 style={styles.logo}>Pipeline</h1><p style={styles.authText}>Loading...</p></div></div>;
  if (!session) return <AuthScreen />;

  const projectionData = getProjectionData();
  const maxRevenue = Math.max(...projectionData.map(m => m.committedRevenue + (showWeighted ? m.pipelineRevenueWeighted : m.pipelineRevenue)), ...projectionData.map(m => m.target), 1);
  const maxFTE = Math.max(...projectionData.map(m => Math.max(m.availableStaff, m.committedFTE + (showWeighted ? m.pipelineFTEWeighted : m.pipelineFTE))), 1);

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

      {/* Master Tabs */}
      <div style={styles.masterTabs}>
        <button onClick={() => setMasterTab('pipeline')} style={{...styles.masterTab, ...(masterTab === 'pipeline' ? styles.masterTabActive : {})}}>Pipeline</button>
        <button onClick={() => setMasterTab('projects')} style={{...styles.masterTab, ...(masterTab === 'projects' ? styles.masterTabActive : {})}}>Projects</button>
        <button onClick={() => setMasterTab('master-insights')} style={{...styles.masterTab, ...(masterTab === 'master-insights' ? styles.masterTabActive : {})}}>Master Insights</button>
        <button onClick={() => setMasterTab('settings')} style={{...styles.masterTab, ...(masterTab === 'settings' ? styles.masterTabActive : {})}}>Settings</button>
      </div>

      {/* PIPELINE TAB */}
      {masterTab === 'pipeline' && (
        <>
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
                          <div style={styles.cardCompany}>{prospect.project_name || prospect.company}</div>
                          {prospect.project_name && <div style={styles.cardContact}>{prospect.company}</div>}
                          <div style={styles.cardContact}>{prospect.contact}</div>
                          {prospect.title && <div style={styles.cardTitle}>{prospect.title}</div>}
                          <div style={styles.cardMeta}><span>{parseWorkTypes(prospect.work_type).join(' + ') || '—'}</span><span>{formatCurrency(prospect.budget)}</span></div>
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
                    <th style={styles.th}>Prob.</th><th style={styles.th}>FTEs</th><th style={styles.th}>Start</th><th style={styles.th}>Duration</th><th style={styles.th}>Stage</th><th style={styles.th}>Last Contact</th>
                  </tr></thead>
                  <tbody>
                    {prospects.map(prospect => {
                      const autoFTE = calculateFTE(prospect.budget, prospect.duration);
                      const displayFTE = prospect.staffing_fte != null ? prospect.staffing_fte : autoFTE;
                      return (
                        <tr key={prospect.id} style={styles.tr} onClick={() => setSelectedProspect(prospect)}>
                          <td style={styles.td}>{prospect.project_name || '—'}</td>
                          <td style={styles.td}>{prospect.company}</td>
                          <td style={styles.td}>{prospect.contact}{prospect.linkedin && <a href={prospect.linkedin} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={styles.tableLinkIcon}>↗</a>}</td>
                          <td style={styles.tdSecondary}>{parseWorkTypes(prospect.work_type).join(', ') || '—'}</td>
                          <td style={styles.td}>{formatCurrency(prospect.budget)}</td>
                          <td style={styles.td}>{prospect.probability || 50}%</td>
                          <td style={styles.td}>{displayFTE.toFixed(1)}</td>
                          <td style={styles.tdSecondary}>{formatDate(prospect.start_date)}</td>
                          <td style={styles.tdSecondary}>{prospect.duration || 1}wk</td>
                          <td style={styles.td}>{prospect.stage}</td>
                          <td style={{...styles.td, ...(daysSince(prospect.last_engagement) > 7 ? { fontWeight: 700 } : {})}}>{formatDate(prospect.last_engagement)} ({daysSince(prospect.last_engagement)}d)</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {view === 'projections' && (
              <div style={styles.projectionsView}>
                <div style={styles.projectionHeader}>
                  <h2 style={styles.projectionTitle}>Pipeline Revenue Projections</h2>
                  <div style={styles.projectionToggle}>
                    <button onClick={() => setShowWeighted(false)} style={{...styles.toggleButton, ...(!showWeighted ? styles.toggleButtonActive : {})}}>Estimated</button>
                    <button onClick={() => setShowWeighted(true)} style={{...styles.toggleButton, ...(showWeighted ? styles.toggleButtonActive : {})}}>Weighted</button>
                  </div>
                </div>
                <div style={styles.chartContainer}>
                  <div style={styles.chartYAxis}><span>{formatCurrency(maxRevenue)}</span><span>{formatCurrency(maxRevenue / 2)}</span><span>$0</span></div>
                  <div style={styles.chart}>
                    {projectionData.map((month, idx) => {
                      const pipeline = showWeighted ? month.pipelineRevenueWeighted : month.pipelineRevenue;
                      return (
                        <div key={idx} style={styles.chartBar}>
                          <div style={styles.chartBarStack}>
                            <div style={{...styles.chartBarSegment, height: `${maxRevenue ? (pipeline / maxRevenue) * 100 : 0}%`, backgroundColor: '#999'}} />
                          </div>
                          <div style={styles.chartBarLabel}>{month.label}</div>
                        </div>
                      );
                    })}
                  </div>
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
                          <span style={styles.attentionCompany}>{p.project_name || p.company}</span>
                          <span style={styles.attentionDays}>{daysSince(p.last_engagement)} days</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </main>
        </>
      )}

      {/* PROJECTS TAB */}
      {masterTab === 'projects' && (
        <>
          <nav style={styles.nav}>
            <div style={styles.navLinks}>
              {['list', 'projections'].map(v => (
                <button key={v} onClick={() => setProjectView(v)} style={{...styles.navLink, ...(projectView === v ? styles.navLinkActive : {})}}>{v.charAt(0).toUpperCase() + v.slice(1)}</button>
              ))}
            </div>
            <div style={styles.navActions}>
              <button onClick={handleExportProjectsCSV} style={styles.actionButton}>Export</button>
              <button onClick={() => { setEditingProject(null); setShowProjectForm(true); }} style={styles.actionButtonPrimary}>+ New Project</button>
            </div>
          </nav>

          <div style={styles.statsBar}>
            <div style={styles.stat}><span style={styles.statLabel}>Active Projects</span><span style={styles.statValue}>{projects.filter(p => p.status === 'Active').length}</span></div>
            <div style={styles.statDivider} />
            <div style={styles.stat}><span style={styles.statLabel}>Committed Revenue</span><span style={styles.statValue}>{formatCurrency(totalCommitted)}</span></div>
            <div style={styles.statDivider} />
            <div style={styles.stat}><span style={styles.statLabel}>Total Projects</span><span style={styles.statValue}>{projects.length}</span></div>
          </div>

          <main style={styles.main}>
            {projectView === 'list' && (
              <div style={styles.listView}>
                <table style={styles.table}>
                  <thead><tr>
                    <th style={styles.th}>Project</th><th style={styles.th}>Company</th><th style={styles.th}>Contact</th><th style={styles.th}>Type</th>
                    <th style={styles.th}>Contract Value</th><th style={styles.th}>FTEs</th><th style={styles.th}>Start</th><th style={styles.th}>Duration</th><th style={styles.th}>Status</th>
                  </tr></thead>
                  <tbody>
                    {projects.map(project => {
                      const autoFTE = calculateFTE(project.contract_value, project.duration);
                      const displayFTE = project.staffing_fte != null ? project.staffing_fte : autoFTE;
                      return (
                        <tr key={project.id} style={styles.tr} onClick={() => setSelectedProject(project)}>
                          <td style={styles.td}>{project.project_name || '—'}</td>
                          <td style={styles.td}>{project.company}</td>
                          <td style={styles.td}>{project.contact || '—'}</td>
                          <td style={styles.tdSecondary}>{parseWorkTypes(project.work_type).join(', ') || '—'}</td>
                          <td style={styles.td}>{formatCurrency(project.contract_value)}</td>
                          <td style={styles.td}>{displayFTE.toFixed(1)}</td>
                          <td style={styles.tdSecondary}>{formatDate(project.start_date)}</td>
                          <td style={styles.tdSecondary}>{project.duration || 1}wk</td>
                          <td style={{...styles.td, fontWeight: project.status === 'Active' ? 700 : 400}}>{project.status}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {projectView === 'projections' && (
              <div style={styles.projectionsView}>
                <div style={styles.projectionHeader}>
                  <h2 style={styles.projectionTitle}>Committed Revenue (Weekly Recognition)</h2>
                </div>
                <div style={styles.chartContainer}>
                  <div style={styles.chartYAxis}><span>{formatCurrency(maxRevenue)}</span><span>{formatCurrency(maxRevenue / 2)}</span><span>$0</span></div>
                  <div style={styles.chart}>
                    {projectionData.map((month, idx) => (
                      <div key={idx} style={styles.chartBar}>
                        <div style={styles.chartBarStack}>
                          <div style={{...styles.chartBarSegment, height: `${maxRevenue ? (month.committedRevenue / maxRevenue) * 100 : 0}%`, backgroundColor: '#000'}} />
                        </div>
                        <div style={styles.chartBarLabel}>{month.label}</div>
                        {month.committedRevenue > 0 && <div style={styles.chartBarValue}>{formatCurrency(month.committedRevenue)}</div>}
                      </div>
                    ))}
                  </div>
                </div>
                <div style={styles.projectionSummary}>
                  <div style={styles.projectionSummaryItem}><span style={styles.projectionSummaryLabel}>12-Month Committed</span><span style={styles.projectionSummaryValue}>{formatCurrency(projectionData.reduce((sum, m) => sum + m.committedRevenue, 0))}</span></div>
                </div>
              </div>
            )}
          </main>
        </>
      )}

      {/* SETTINGS TAB */}
      {masterTab === 'settings' && (
        <SettingsPanel settings={settings} onSave={saveSettings} formatCurrency={formatCurrency} />
      )}

      {/* MASTER INSIGHTS TAB */}
      {masterTab === 'master-insights' && (
        <>
          <nav style={styles.nav}>
            <div style={styles.navLinks}>
              <span style={styles.navLabel}>Combined Revenue & Staffing View</span>
            </div>
            <div style={styles.navActions}>
              <div style={styles.projectionToggle}>
                <button onClick={() => setShowWeighted(false)} style={{...styles.toggleButton, ...(!showWeighted ? styles.toggleButtonActive : {})}}>Estimated Pipeline</button>
                <button onClick={() => setShowWeighted(true)} style={{...styles.toggleButton, ...(showWeighted ? styles.toggleButtonActive : {})}}>Weighted Pipeline</button>
              </div>
            </div>
          </nav>

          <div style={styles.statsBar}>
            <div style={styles.stat}><span style={styles.statLabel}>Committed Revenue</span><span style={styles.statValue}>{formatCurrency(totalCommitted)}</span></div>
            <div style={styles.statDivider} />
            <div style={styles.stat}><span style={styles.statLabel}>{showWeighted ? 'Weighted' : 'Total'} Pipeline</span><span style={styles.statValue}>{formatCurrency(showWeighted ? weightedPipeline : totalPipeline)}</span></div>
            <div style={styles.statDivider} />
            <div style={styles.stat}><span style={styles.statLabel}>Annual Target</span><span style={styles.statValue}>{formatCurrency(annualTarget)}</span></div>
            <div style={styles.statDivider} />
            <div style={styles.stat}><span style={styles.statLabel}>Current Staff</span><span style={styles.statValue}>{settings.currentStaff}</span></div>
          </div>

          <main style={styles.main}>
            {/* Revenue Chart */}
            <div style={styles.projectionsView}>
              <div style={styles.projectionHeader}>
                <h2 style={styles.projectionTitle}>Revenue vs Target</h2>
              </div>
              <div style={styles.chartLegend}>
                <div style={styles.legendItem}><div style={{...styles.legendColor, backgroundColor: '#000'}} /><span>Committed</span></div>
                <div style={styles.legendItem}><div style={{...styles.legendColor, backgroundColor: '#999'}} /><span>Pipeline</span></div>
                <div style={styles.legendItem}><div style={{...styles.legendColor, backgroundColor: 'transparent', border: '2px solid #c00'}} /><span>Target</span></div>
              </div>
              <div style={styles.chartContainer}>
                <div style={styles.chartYAxis}><span>{formatCurrency(maxRevenue)}</span><span>{formatCurrency(maxRevenue / 2)}</span><span>$0</span></div>
                <div style={styles.chart}>
                  {projectionData.map((month, idx) => {
                    const pipeline = showWeighted ? month.pipelineRevenueWeighted : month.pipelineRevenue;
                    const total = month.committedRevenue + pipeline;
                    return (
                      <div key={idx} style={styles.chartBar}>
                        <div style={styles.chartBarStack}>
                          <div style={{...styles.chartBarSegment, height: `${maxRevenue ? (pipeline / maxRevenue) * 100 : 0}%`, backgroundColor: '#999'}} />
                          <div style={{...styles.chartBarSegment, height: `${maxRevenue ? (month.committedRevenue / maxRevenue) * 100 : 0}%`, backgroundColor: '#000'}} />
                        </div>
                        {month.target > 0 && <div style={{...styles.targetLine, bottom: `${(month.target / maxRevenue) * 100}%`}} />}
                        <div style={styles.chartBarLabel}>{month.label}</div>
                        {total > 0 && <div style={styles.chartBarValue}>{formatCurrency(total)}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div style={styles.projectionSummary}>
                <div style={styles.projectionSummaryItem}><span style={styles.projectionSummaryLabel}>12-Month Total</span><span style={styles.projectionSummaryValue}>{formatCurrency(projectionData.reduce((sum, m) => sum + m.committedRevenue + (showWeighted ? m.pipelineRevenueWeighted : m.pipelineRevenue), 0))}</span></div>
                <div style={styles.projectionSummaryItem}><span style={styles.projectionSummaryLabel}>12-Month Target</span><span style={styles.projectionSummaryValue}>{formatCurrency(annualTarget)}</span></div>
                <div style={styles.projectionSummaryItem}><span style={styles.projectionSummaryLabel}>Gap</span><span style={{...styles.projectionSummaryValue, color: projectionData.reduce((sum, m) => sum + m.committedRevenue + (showWeighted ? m.pipelineRevenueWeighted : m.pipelineRevenue), 0) >= annualTarget ? '#060' : '#c00'}}>{formatCurrency(projectionData.reduce((sum, m) => sum + m.committedRevenue + (showWeighted ? m.pipelineRevenueWeighted : m.pipelineRevenue), 0) - annualTarget)}</span></div>
              </div>
            </div>

            {/* Staffing Chart */}
            <div style={{...styles.projectionsView, marginTop: '48px'}}>
              <div style={styles.projectionHeader}>
                <h2 style={styles.projectionTitle}>Staffing: Available vs Needed</h2>
              </div>
              <div style={styles.chartLegend}>
                <div style={styles.legendItem}><div style={{...styles.legendColor, backgroundColor: '#000'}} /><span>Committed FTEs</span></div>
                <div style={styles.legendItem}><div style={{...styles.legendColor, backgroundColor: '#999'}} /><span>Pipeline FTEs</span></div>
                <div style={styles.legendItem}><div style={{...styles.legendColor, backgroundColor: 'transparent', border: '2px solid #060'}} /><span>Available Staff</span></div>
              </div>
              <div style={styles.chartContainer}>
                <div style={styles.chartYAxis}><span>{maxFTE.toFixed(1)}</span><span>{(maxFTE / 2).toFixed(1)}</span><span>0</span></div>
                <div style={styles.chart}>
                  {projectionData.map((month, idx) => {
                    const pipelineFTE = showWeighted ? month.pipelineFTEWeighted : month.pipelineFTE;
                    return (
                      <div key={idx} style={styles.chartBar}>
                        <div style={styles.chartBarStack}>
                          <div style={{...styles.chartBarSegment, height: `${maxFTE ? (pipelineFTE / maxFTE) * 100 : 0}%`, backgroundColor: '#999'}} />
                          <div style={{...styles.chartBarSegment, height: `${maxFTE ? (month.committedFTE / maxFTE) * 100 : 0}%`, backgroundColor: '#000'}} />
                        </div>
                        <div style={{...styles.availableStaffLine, bottom: `${(month.availableStaff / maxFTE) * 100}%`}} />
                        <div style={styles.chartBarLabel}>{month.label}</div>
                        <div style={styles.chartBarValue}>{(month.committedFTE + pipelineFTE).toFixed(1)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div style={styles.projectionSummary}>
                <div style={styles.projectionSummaryItem}><span style={styles.projectionSummaryLabel}>Current Staff</span><span style={styles.projectionSummaryValue}>{settings.currentStaff}</span></div>
                <div style={styles.projectionSummaryItem}><span style={styles.projectionSummaryLabel}>Planned Hires (12mo)</span><span style={styles.projectionSummaryValue}>{MONTHS.reduce((sum, m) => sum + (settings.plannedHires[m.key] || 0), 0)}</span></div>
                <div style={styles.projectionSummaryItem}><span style={styles.projectionSummaryLabel}>End of Year Staff</span><span style={styles.projectionSummaryValue}>{projectionData[11]?.availableStaff || settings.currentStaff}</span></div>
              </div>
            </div>

            {/* Monthly Breakdown Table */}
            <div style={{marginTop: '48px'}}>
              <h3 style={styles.insightTitle}>Monthly Breakdown</h3>
              <div style={styles.listView}>
                <table style={styles.table}>
                  <thead><tr>
                    <th style={styles.th}>Month</th>
                    <th style={styles.th}>Target</th>
                    <th style={styles.th}>Committed</th>
                    <th style={styles.th}>Pipeline</th>
                    <th style={styles.th}>Total</th>
                    <th style={styles.th}>Gap</th>
                    <th style={styles.th}>FTEs Needed</th>
                    <th style={styles.th}>Staff Available</th>
                    <th style={styles.th}>Staffing Gap</th>
                  </tr></thead>
                  <tbody>
                    {projectionData.map((month, idx) => {
                      const pipeline = showWeighted ? month.pipelineRevenueWeighted : month.pipelineRevenue;
                      const pipelineFTE = showWeighted ? month.pipelineFTEWeighted : month.pipelineFTE;
                      const total = month.committedRevenue + pipeline;
                      const revenueGap = total - month.target;
                      const neededFTE = month.committedFTE + pipelineFTE;
                      const staffingGap = month.availableStaff - neededFTE;
                      return (
                        <tr key={idx} style={styles.tr}>
                          <td style={styles.td}>{month.label}</td>
                          <td style={styles.td}>{formatCurrency(month.target)}</td>
                          <td style={styles.td}>{formatCurrency(month.committedRevenue)}</td>
                          <td style={styles.tdSecondary}>{formatCurrency(pipeline)}</td>
                          <td style={styles.td}>{formatCurrency(total)}</td>
                          <td style={{...styles.td, color: revenueGap >= 0 ? '#060' : '#c00', fontWeight: 600}}>{formatCurrency(revenueGap)}</td>
                          <td style={styles.td}>{neededFTE.toFixed(1)}</td>
                          <td style={styles.td}>{month.availableStaff}</td>
                          <td style={{...styles.td, color: staffingGap >= 0 ? '#060' : '#c00', fontWeight: 600}}>{staffingGap >= 0 ? '+' : ''}{staffingGap.toFixed(1)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </main>
        </>
      )}

      {/* Prospect Sidebar */}
      {selectedProspect && (
        <div style={styles.overlay} onClick={() => setSelectedProspect(null)}>
          <div style={styles.sidebar} onClick={e => e.stopPropagation()}>
            <div style={styles.sidebarHeader}>
              <h2 style={styles.sidebarTitle}>{selectedProspect.project_name || selectedProspect.company}</h2>
              <button onClick={() => setSelectedProspect(null)} style={styles.closeButton}>×</button>
            </div>
            <div style={styles.sidebarContent}>
              <div style={styles.detailSection}><label style={styles.detailLabel}>Company</label><p style={styles.detailValue}>{selectedProspect.company}</p></div>
              <div style={styles.detailSection}><label style={styles.detailLabel}>Contact</label><p style={styles.detailValue}>{selectedProspect.contact}</p>{selectedProspect.title && <p style={styles.detailValueSecondary}>{selectedProspect.title}</p>}</div>
              {selectedProspect.linkedin && <div style={styles.detailSection}><label style={styles.detailLabel}>LinkedIn</label><a href={selectedProspect.linkedin} target="_blank" rel="noopener noreferrer" style={styles.linkedInLink}>View Profile →</a></div>}
              <div style={styles.detailRow}>
                <div style={styles.detailSection}><label style={styles.detailLabel}>Work Type</label><p style={styles.detailValue}>{parseWorkTypes(selectedProspect.work_type).join(' + ') || '—'}</p></div>
                <div style={styles.detailSection}><label style={styles.detailLabel}>Budget</label><p style={styles.detailValue}>{formatCurrency(selectedProspect.budget)}</p></div>
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
                <label style={styles.detailLabel}>Staffing (FTEs)</label>
                <p style={styles.detailValue}>{selectedProspect.staffing_fte != null ? selectedProspect.staffing_fte.toFixed(1) : calculateFTE(selectedProspect.budget, selectedProspect.duration).toFixed(1)} {selectedProspect.staffing_fte == null && <span style={styles.autoLabel}>(auto)</span>}</p>
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
              <button onClick={() => handleConvertToProject(selectedProspect)} style={styles.actionButton}>Convert to Project</button>
              <button onClick={() => handleDeleteProspect(selectedProspect.id)} style={styles.deleteButton}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Project Sidebar */}
      {selectedProject && (
        <div style={styles.overlay} onClick={() => setSelectedProject(null)}>
          <div style={styles.sidebar} onClick={e => e.stopPropagation()}>
            <div style={styles.sidebarHeader}>
              <h2 style={styles.sidebarTitle}>{selectedProject.project_name || selectedProject.company}</h2>
              <button onClick={() => setSelectedProject(null)} style={styles.closeButton}>×</button>
            </div>
            <div style={styles.sidebarContent}>
              <div style={styles.detailSection}><label style={styles.detailLabel}>Company</label><p style={styles.detailValue}>{selectedProject.company}</p></div>
              <div style={styles.detailSection}><label style={styles.detailLabel}>Contact</label><p style={styles.detailValue}>{selectedProject.contact || '—'}</p>{selectedProject.title && <p style={styles.detailValueSecondary}>{selectedProject.title}</p>}</div>
              {selectedProject.linkedin && <div style={styles.detailSection}><label style={styles.detailLabel}>LinkedIn</label><a href={selectedProject.linkedin} target="_blank" rel="noopener noreferrer" style={styles.linkedInLink}>View Profile →</a></div>}
              <div style={styles.detailRow}>
                <div style={styles.detailSection}><label style={styles.detailLabel}>Work Type</label><p style={styles.detailValue}>{parseWorkTypes(selectedProject.work_type).join(' + ') || '—'}</p></div>
                <div style={styles.detailSection}><label style={styles.detailLabel}>Contract Value</label><p style={styles.detailValue}>{formatCurrency(selectedProject.contract_value)}</p></div>
              </div>
              <div style={styles.detailRow}>
                <div style={styles.detailSection}><label style={styles.detailLabel}>Start Date</label><p style={styles.detailValue}>{formatMonthYear(selectedProject.start_date)}</p></div>
                <div style={styles.detailSection}><label style={styles.detailLabel}>Duration</label><p style={styles.detailValue}>{selectedProject.duration || 1} week{(selectedProject.duration || 1) !== 1 ? 's' : ''}</p></div>
              </div>
              <div style={styles.detailSection}>
                <label style={styles.detailLabel}>Staffing (FTEs)</label>
                <p style={styles.detailValue}>{selectedProject.staffing_fte != null ? selectedProject.staffing_fte.toFixed(1) : calculateFTE(selectedProject.contract_value, selectedProject.duration).toFixed(1)} {selectedProject.staffing_fte == null && <span style={styles.autoLabel}>(auto)</span>}</p>
              </div>
              <div style={styles.detailSection}>
                <label style={styles.detailLabel}>Weekly Revenue</label>
                <p style={styles.detailValue}>{formatCurrency((selectedProject.contract_value || 0) / (selectedProject.duration || 1))}</p>
              </div>
              <div style={styles.detailSection}>
                <label style={styles.detailLabel}>Status</label>
                <div style={styles.stageSelector}>
                  {PROJECT_STATUSES.map(status => <button key={status} onClick={() => handleUpdateProjectStatus(selectedProject, status)} style={{...styles.stageButton, ...(selectedProject.status === status ? styles.stageButtonActive : {})}}>{status}</button>)}
                </div>
              </div>
              <div style={styles.detailSection}><label style={styles.detailLabel}>Context & Notes</label><p style={styles.detailValue}>{selectedProject.context || '—'}</p></div>
            </div>
            <div style={styles.sidebarFooter}>
              <button onClick={() => { setEditingProject(selectedProject); setShowProjectForm(true); setSelectedProject(null); }} style={styles.actionButton}>Edit</button>
              <button onClick={() => handleDeleteProject(selectedProject.id)} style={styles.deleteButton}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {showForm && <ProspectForm prospect={editingProspect} onSave={handleSaveProspect} onCancel={() => { setShowForm(false); setEditingProspect(null); }} />}
      {showProjectForm && <ProjectForm project={editingProject} onSave={handleSaveProject} onCancel={() => { setShowProjectForm(false); setEditingProject(null); }} />}
      {showEngagementForm && selectedProspect && <EngagementForm onSave={(eng) => handleAddEngagement(selectedProspect.id, eng)} onCancel={() => setShowEngagementForm(false)} />}
    </div>
  );
}

function SettingsPanel({ settings, onSave, formatCurrency }) {
  const [monthlyTargets, setMonthlyTargets] = useState(settings.monthlyTargets || {});
  const [currentStaff, setCurrentStaff] = useState(settings.currentStaff || 0);
  const [plannedHires, setPlannedHires] = useState(settings.plannedHires || {});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMonthlyTargets(settings.monthlyTargets || {});
    setCurrentStaff(settings.currentStaff || 0);
    setPlannedHires(settings.plannedHires || {});
  }, [settings]);

  const handleSaveAll = async () => {
    setSaving(true);
    await onSave('monthlyTargets', monthlyTargets);
    await onSave('currentStaff', { value: currentStaff });
    await onSave('plannedHires', plannedHires);
    setSaving(false);
  };

  const annualTarget = MONTHS.reduce((sum, m) => sum + (monthlyTargets[m.key] || 0), 0);
  const totalHires = MONTHS.reduce((sum, m) => sum + (plannedHires[m.key] || 0), 0);

  return (
    <main style={styles.main}>
      <div style={styles.settingsContainer}>
        <div style={styles.settingsHeader}>
          <h2 style={styles.projectionTitle}>Settings</h2>
          <button onClick={handleSaveAll} style={styles.actionButtonPrimary} disabled={saving}>{saving ? 'Saving...' : 'Save All'}</button>
        </div>

        {/* Current Staff */}
        <div style={styles.settingsSection}>
          <h3 style={styles.insightTitle}>Current Billable Staff</h3>
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Number of FTEs</label>
            <input 
              type="number" 
              value={currentStaff} 
              onChange={e => setCurrentStaff(Number(e.target.value))} 
              style={{...styles.input, width: '120px'}} 
              min="0"
              step="0.5"
            />
          </div>
        </div>

        {/* Monthly Targets */}
        <div style={styles.settingsSection}>
          <h3 style={styles.insightTitle}>Monthly Revenue Targets</h3>
          <p style={styles.settingsSubtitle}>Annual Target: {formatCurrency(annualTarget)}</p>
          <div style={styles.monthGrid}>
            {MONTHS.map(month => (
              <div key={month.key} style={styles.monthInputGroup}>
                <label style={styles.formLabel}>{month.label}</label>
                <input
                  type="number"
                  value={monthlyTargets[month.key] || ''}
                  onChange={e => setMonthlyTargets({ ...monthlyTargets, [month.key]: Number(e.target.value) || 0 })}
                  style={styles.input}
                  placeholder="0"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Planned Hires */}
        <div style={styles.settingsSection}>
          <h3 style={styles.insightTitle}>Planned Hires by Month</h3>
          <p style={styles.settingsSubtitle}>Total Planned Hires: {totalHires} → End of Year Staff: {currentStaff + totalHires}</p>
          <div style={styles.monthGrid}>
            {MONTHS.map(month => (
              <div key={month.key} style={styles.monthInputGroup}>
                <label style={styles.formLabel}>{month.label}</label>
                <input
                  type="number"
                  value={plannedHires[month.key] || ''}
                  onChange={e => setPlannedHires({ ...plannedHires, [month.key]: Number(e.target.value) || 0 })}
                  style={styles.input}
                  placeholder="0"
                  min="0"
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
: 'width 0.3s' },
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
  autoLabel: { fontSize: '10px', color: '#999', fontWeight: 400 },
  settingsContainer: { maxWidth: '800px' },
  settingsHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' },
  settingsSection: { marginBottom: '48px', padding: '24px', border: '1px solid #000' },
  settingsSubtitle: { fontSize: '12px', color: '#666', marginBottom: '16px' },
  monthGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' },
  monthInputGroup: { display: 'flex', flexDirection: 'column', gap: '4px' },
  authContainer: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif', backgroundColor: '#fff' },
  authBox: { width: '320px', padding: '48px 32px', border: '1px solid #000' },
  authTagline: { fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#666', marginTop: '8px', marginBottom: '32px' },
  authForm: { display: 'flex', flexDirection: 'column', gap: '16px' },
  authError: { fontSize: '13px', color: '#c00', margin: 0 },
  authMessage: { fontSize: '13px', color: '#060', margin: 0 },
  authToggle: { marginTop: '24px', background: 'none', border: 'none', fontSize: '12px', color: '#666', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit' },
  authText: { fontSize: '13px', color: '#666' }
};
