import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://kpgjgbbozgmbhtysocck.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtwZ2pnYmJvemdtYmh0eXNvY2NrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxMDA4OTIsImV4cCI6MjA4NDY3Njg5Mn0.JcABMK1Tcqm1gFmI8kxthDEDsSrflx4QONXXy-hAJGg'
);

const STAGES = ['Lead', 'Contacted', 'Meeting', 'Proposal', 'Negotiation', 'Closed'];
const PROJECT_STATUSES = ['Active', 'Completed', 'On Hold'];
const WORK_TYPES = ['Strategy', 'Design', 'Creative'];
const BILLABLE_RATE = 290; // $ per hour average
const HOURS_PER_WEEK = 36; // Adjusted for PTO, etc.
const FREELANCE_DAY_RATE = 1000; // $ per day for freelancers
const WORKING_DAYS_PER_MONTH = 20;

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

// US Federal Holidays 2026 (and 2025 for edge cases)
const HOLIDAYS = [
  // 2025
  '2025-01-01', '2025-01-20', '2025-02-17', '2025-05-26', '2025-07-04',
  '2025-09-01', '2025-10-13', '2025-11-11', '2025-11-27', '2025-12-25',
  // 2026
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-05-25', '2026-07-03',
  '2026-09-07', '2026-10-12', '2026-11-11', '2026-11-26', '2026-12-25',
  // 2027
  '2027-01-01', '2027-01-18', '2027-02-15', '2027-05-31', '2027-07-05',
  '2027-09-06', '2027-10-11', '2027-11-11', '2027-11-25', '2027-12-24',
].map(d => d);

// Check if a date is a business day (weekday and not a holiday)
const isBusinessDay = (date) => {
  const day = date.getDay();
  if (day === 0 || day === 6) return false; // Weekend
  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return !HOLIDAYS.includes(dateStr);
};

// Get business days between two dates (inclusive of start, exclusive of end)
const getBusinessDaysBetween = (startDate, endDate) => {
  let count = 0;
  const current = new Date(startDate);
  while (current < endDate) {
    if (isBusinessDay(current)) count++;
    current.setDate(current.getDate() + 1);
  }
  return count;
};

// Calculate monthly revenue distribution based on business days
const calculateMonthlyRevenueByBusinessDays = (startDateStr, durationWeeks, totalValue, months) => {
  const result = {};
  const startDate = parseLocalDate(startDateStr);
  if (!startDate || !totalValue || !durationWeeks) return result;
  
  // Calculate end date (duration in weeks * 7 days)
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + (durationWeeks * 7));
  
  // Get total business days in the project
  const totalBusinessDays = getBusinessDaysBetween(startDate, endDate);
  if (totalBusinessDays === 0) return result;
  
  const revenuePerBusinessDay = totalValue / totalBusinessDays;
  
  // For each month, count business days that fall within the project period
  months.forEach(m => {
    const monthStart = new Date(m.date.getFullYear(), m.date.getMonth(), 1);
    const monthEnd = new Date(m.date.getFullYear(), m.date.getMonth() + 1, 1);
    
    // Find overlap between project period and this month
    const overlapStart = new Date(Math.max(startDate.getTime(), monthStart.getTime()));
    const overlapEnd = new Date(Math.min(endDate.getTime(), monthEnd.getTime()));
    
    if (overlapStart < overlapEnd) {
      const businessDaysInMonth = getBusinessDaysBetween(overlapStart, overlapEnd);
      if (businessDaysInMonth > 0) {
        result[m.key] = businessDaysInMonth * revenuePerBusinessDay;
      }
    }
  });
  
  return result;
};

// Parse date string as local date (not UTC) to avoid timezone shift
const parseLocalDate = (dateStr) => {
  if (!dateStr) return null;
  const [year, month, day] = dateStr.split('T')[0].split('-').map(Number);
  return new Date(year, month - 1, day);
};

// Calculate FTEs needed: weekly revenue / billable rate / 36 hours (adjusted for PTO)
const calculateFTE = (contractValue, durationWeeks) => {
  if (!contractValue || !durationWeeks) return 0;
  const weeklyRevenue = contractValue / durationWeeks;
  return weeklyRevenue / BILLABLE_RATE / HOURS_PER_WEEK;
};

// Calculate freelance FTEs from monthly budget: budget / day rate / working days
const calculateFreelanceFTE = (monthlyBudget) => {
  if (!monthlyBudget) return 0;
  return monthlyBudget / FREELANCE_DAY_RATE / WORKING_DAYS_PER_MONTH;
};

export default function CRMDashboard() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [masterTab, setMasterTab] = useState('pipeline');
  const [prospects, setProspects] = useState([]);
  const [projects, setProjects] = useState([]);
  const [settings, setSettings] = useState({ monthlyTargets: {}, currentStaff: 0, plannedHires: {}, freelanceBudget: {} });
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
  const [showWeighted, setShowWeighted] = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [importPreview, setImportPreview] = useState(null);
  const [showProspectImport, setShowProspectImport] = useState(false);
  const [prospectImportPreview, setProspectImportPreview] = useState(null);

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
    const settingsObj = { monthlyTargets: {}, currentStaff: 0, plannedHires: {}, freelanceBudget: {} };
    data?.forEach(row => {
      if (row.setting_key === 'monthlyTargets') settingsObj.monthlyTargets = row.setting_value || {};
      if (row.setting_key === 'currentStaff') settingsObj.currentStaff = row.setting_value?.value || 0;
      if (row.setting_key === 'plannedHires') settingsObj.plannedHires = row.setting_value || {};
      if (row.setting_key === 'freelanceBudget') settingsObj.freelanceBudget = row.setting_value || {};
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
  
  const formatDate = (dateStr) => {
    const date = parseLocalDate(dateStr);
    return date ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';
  };
  
  const formatMonthYear = (dateStr) => {
    const date = parseLocalDate(dateStr);
    return date ? date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '—';
  };
  
  const daysSince = (dateStr) => {
    const date = parseLocalDate(dateStr);
    if (!date) return 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.floor((today - date) / (1000 * 60 * 60 * 24));
  };
  
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
      staffing_fte: prospect.staffing_fte, lead_source: prospect.lead_source || 'new'
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
      hires: settings.plannedHires[m.key] || 0,
      freelanceBudget: settings.freelanceBudget[m.key] || 0,
      freelanceFTE: calculateFreelanceFTE(settings.freelanceBudget[m.key] || 0)
    }));

    // Add committed revenue and FTEs from projects (using business days)
    projects.filter(p => p.status === 'Active').forEach(p => {
      if (!p.start_date || !p.contract_value) return;
      
      // If there are manual overrides, use those
      if (p.monthly_revenue && Object.keys(p.monthly_revenue).length > 0) {
        Object.entries(p.monthly_revenue).forEach(([monthKey, revenue]) => {
          const monthIndex = months.findIndex(m => m.key === monthKey);
          if (monthIndex !== -1) {
            months[monthIndex].committedRevenue += revenue;
            // Calculate FTE proportionally
            const totalValue = Object.values(p.monthly_revenue).reduce((sum, v) => sum + v, 0);
            const fteTotal = p.staffing_fte != null ? p.staffing_fte : calculateFTE(p.contract_value, p.duration || 1) * (p.duration || 1) / 4;
            months[monthIndex].committedFTE += fteTotal * (revenue / totalValue);
          }
        });
      } else {
        // Use business days calculation
        const monthlyRevenue = calculateMonthlyRevenueByBusinessDays(p.start_date, p.duration || 1, p.contract_value, MONTHS);
        const totalFTE = p.staffing_fte != null ? p.staffing_fte : calculateFTE(p.contract_value, p.duration || 1) * (p.duration || 1) / 4;
        const totalRevenue = Object.values(monthlyRevenue).reduce((sum, v) => sum + v, 0) || 1;
        
        Object.entries(monthlyRevenue).forEach(([monthKey, revenue]) => {
          const monthIndex = months.findIndex(m => m.key === monthKey);
          if (monthIndex !== -1) {
            months[monthIndex].committedRevenue += revenue;
            months[monthIndex].committedFTE += totalFTE * (revenue / totalRevenue);
          }
        });
      }
    });

    // Add pipeline revenue and FTEs from prospects (using business days)
    prospects.filter(p => p.stage !== 'Closed').forEach(p => {
      if (!p.start_date || !p.budget) return;
      const probability = (p.probability || 50) / 100;
      
      // If there are manual overrides, use those
      if (p.monthly_revenue && Object.keys(p.monthly_revenue).length > 0) {
        Object.entries(p.monthly_revenue).forEach(([monthKey, revenue]) => {
          const monthIndex = months.findIndex(m => m.key === monthKey);
          if (monthIndex !== -1) {
            months[monthIndex].pipelineRevenue += revenue;
            months[monthIndex].pipelineRevenueWeighted += revenue * probability;
            // Calculate FTE proportionally
            const totalValue = Object.values(p.monthly_revenue).reduce((sum, v) => sum + v, 0);
            const fteTotal = p.staffing_fte != null ? p.staffing_fte : calculateFTE(p.budget, p.duration || 1) * (p.duration || 1) / 4;
            months[monthIndex].pipelineFTE += fteTotal * (revenue / totalValue);
            months[monthIndex].pipelineFTEWeighted += fteTotal * (revenue / totalValue) * probability;
          }
        });
      } else {
        // Use business days calculation
        const monthlyRevenue = calculateMonthlyRevenueByBusinessDays(p.start_date, p.duration || 1, p.budget, MONTHS);
        const totalFTE = p.staffing_fte != null ? p.staffing_fte : calculateFTE(p.budget, p.duration || 1) * (p.duration || 1) / 4;
        const totalRevenue = Object.values(monthlyRevenue).reduce((sum, v) => sum + v, 0) || 1;
        
        Object.entries(monthlyRevenue).forEach(([monthKey, revenue]) => {
          const monthIndex = months.findIndex(m => m.key === monthKey);
          if (monthIndex !== -1) {
            months[monthIndex].pipelineRevenue += revenue;
            months[monthIndex].pipelineRevenueWeighted += revenue * probability;
            months[monthIndex].pipelineFTE += totalFTE * (revenue / totalRevenue);
            months[monthIndex].pipelineFTEWeighted += totalFTE * (revenue / totalRevenue) * probability;
          }
        });
      }
    });

    // Calculate cumulative available staff (full-time + freelance)
    let cumulativeHires = 0;
    months.forEach(m => {
      cumulativeHires += m.hires;
      m.fullTimeStaff = settings.currentStaff + cumulativeHires;
      m.availableStaff = m.fullTimeStaff + m.freelanceFTE;
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

  // CSV Import from Financial Model
  const parseFinancialModelCSV = (csvText) => {
    // Parse CSV handling quoted fields with commas
    const parseCSVLine = (line) => {
      const result = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        if (line[i] === '"') { inQuotes = !inQuotes; }
        else if (line[i] === ',' && !inQuotes) { result.push(current); current = ''; }
        else { current += line[i]; }
      }
      result.push(current);
      return result;
    };

    const lines = csvText.replace(/\r/g, '').split('\n');
    const rows = lines.map(l => parseCSVLine(l));
    
    // Find the header row (has "Job Number", "Client", "Project Name", "SOW")
    let headerIdx = -1;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i][0] && rows[i][0].trim() === 'Job Number') { headerIdx = i; break; }
    }
    if (headerIdx === -1) return { error: 'Could not find header row with "Job Number". Check CSV format.' };

    // Month column mapping - find columns for 2026 months
    const header = rows[headerIdx];
    const monthMap = {};
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthAliases = { 'April': 'Apr', 'June': 'Jun', 'July': 'Jul' };
    
    header.forEach((h, idx) => {
      if (!h) return;
      const clean = h.trim();
      // Match patterns like "Jan 26", "Feb 26", "April 26", "Aug 2026", etc.
      for (const mName of monthNames) {
        if (clean.startsWith(mName) && (clean.includes('26') || clean.includes('2026'))) {
          monthMap[mName] = idx;
          return;
        }
      }
      // Check aliases
      for (const [alias, mName] of Object.entries(monthAliases)) {
        if (clean.startsWith(alias) && (clean.includes('26') || clean.includes('2026'))) {
          monthMap[mName] = idx;
          return;
        }
      }
    });

    // Parse project rows (rows after header until blank/TOTAL)
    const imported = [];
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      const client = (row[1] || '').trim();
      const projectName = (row[2] || '').trim();
      const sowRaw = (row[3] || '').trim();
      
      // Stop at empty rows or TOTAL
      if (!client || client === 'TOTAL') break;
      
      // Parse SOW value
      const sow = parseFloat(sowRaw.replace(/[$,]/g, '')) || 0;
      
      // Parse monthly revenue for 2026
      const monthlyRevenue = {};
      let totalRev2026 = 0;
      for (const [month, col] of Object.entries(monthMap)) {
        const val = (row[col] || '').replace(/[$,]/g, '').trim();
        const num = parseFloat(val) || 0;
        if (num > 0) {
          monthlyRevenue[month] = num;
          totalRev2026 += num;
        }
      }
      
      if (totalRev2026 === 0) continue;
      
      // Determine start/end months and duration
      const activeMonths = monthNames.filter(m => monthlyRevenue[m]);
      const startMonth = activeMonths[0];
      const endMonth = activeMonths[activeMonths.length - 1];
      const startIdx = monthNames.indexOf(startMonth);
      const endIdx = monthNames.indexOf(endMonth);
      const numMonths = endIdx - startIdx + 1;
      const durationWeeks = Math.round(numMonths * 4.33);
      
      // Start date = first day of start month 2026
      const startDate = `2026-${String(startIdx + 1).padStart(2, '0')}-01`;
      
      imported.push({
        company: client,
        project_name: projectName,
        sow_value: sow,
        contract_value: totalRev2026,
        start_date: startDate,
        duration: durationWeeks,
        start_month: startMonth,
        end_month: endMonth,
        monthly_detail: monthlyRevenue,
        status: 'Active'
      });
    }
    
    return { projects: imported };
  };

  const handleImportCSV = async (file) => {
    const text = await file.text();
    const result = parseFinancialModelCSV(text);
    if (result.error) {
      alert(result.error);
      return;
    }
    setImportPreview(result.projects);
  };

  const handleConfirmImport = async () => {
    if (!importPreview) return;
    setSyncing(true);
    
    for (const proj of importPreview) {
      // Check if project already exists (match on company + project name)
      const existing = projects.find(p => 
        p.company.toLowerCase() === proj.company.toLowerCase() && 
        p.project_name && proj.project_name && 
        p.project_name.toLowerCase() === proj.project_name.toLowerCase()
      );
      
      const data = {
        company: proj.company,
        project_name: proj.project_name,
        contract_value: proj.contract_value,
        start_date: proj.start_date,
        duration: proj.duration,
        status: proj.status,
        user_id: session.user.id
      };
      
      if (existing) {
        await supabase.from('projects').update(data).eq('id', existing.id);
      } else {
        await supabase.from('projects').insert(data);
      }
    }
    
    await loadProjects();
    setImportPreview(null);
    setShowImport(false);
    setSyncing(false);
  };

  // Prospect CSV Import - handles financial model weighted detail format
  const parseProspectCSV = (csvText) => {
    const parseCSVLine = (line) => {
      const result = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        if (line[i] === '"') { inQuotes = !inQuotes; }
        else if (line[i] === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
        else { current += line[i]; }
      }
      result.push(current.trim());
      return result;
    };

    const lines = csvText.replace(/\r/g, '').split('\n');
    const rows = lines.map(l => parseCSVLine(l));
    
    // Find the header row - look for "Client" in first column
    let headerIdx = -1;
    for (let i = 0; i < rows.length; i++) {
      const firstCell = (rows[i][0] || '').toLowerCase().trim();
      if (firstCell === 'client') {
        headerIdx = i;
        break;
      }
    }
    
    if (headerIdx === -1) return { error: 'Could not find header row with "Client". Check CSV format.' };
    
    const header = rows[headerIdx].map(h => (h || '').toLowerCase().replace(/[^a-z0-9%]/g, ''));
    
    // Map columns for financial model format
    const colMap = {};
    header.forEach((h, i) => {
      if (h === 'client') colMap.company = i;
      if (h.includes('project') && h.includes('name')) colMap.project_name = i;
      if (h.includes('sow') || h === 'nysow') colMap.budget = i;
      if (h.includes('probable') || h === 'probable') colMap.probability = i;
      if (h === 'weeks') colMap.duration = i;
      if (h.includes('kick') || h.includes('off') || h.includes('start')) colMap.start_date = i;
    });
    
    // If no project_name found, try column 1
    if (colMap.project_name === undefined && colMap.company === 0) {
      colMap.project_name = 1;
    }
    
    // If no budget found, try column 2 (NY SOW position)
    if (colMap.budget === undefined) {
      colMap.budget = 2;
    }
    
    // If no probability found, try column 4 (% Probable position)
    if (colMap.probability === undefined) {
      colMap.probability = 4;
    }
    
    // If no duration found, try column 5 (Weeks position)
    if (colMap.duration === undefined) {
      colMap.duration = 5;
    }
    
    // If no start_date found, try column 7 (Kick Off position)
    if (colMap.start_date === undefined) {
      colMap.start_date = 7;
    }
    
    const imported = [];
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      const company = (row[colMap.company] || '').trim();
      
      // Skip empty rows
      if (!company) continue;
      
      // Stop at TOTAL or LEADS section headers
      if (company.toUpperCase() === 'TOTAL' || company.toUpperCase() === 'LEADS') break;
      
      const projectName = colMap.project_name !== undefined ? (row[colMap.project_name] || '').trim() : '';
      
      // Skip if no project name (likely a section divider)
      if (!projectName) continue;
      
      const budgetRaw = colMap.budget !== undefined ? (row[colMap.budget] || '') : '';
      const budget = parseFloat(budgetRaw.replace(/[$,]/g, '')) || 0;
      
      // Skip if no budget
      if (budget === 0) continue;
      
      const probRaw = colMap.probability !== undefined ? (row[colMap.probability] || '') : '';
      const probability = parseInt(probRaw.replace('%', '')) || 50;
      
      const durationRaw = colMap.duration !== undefined ? (row[colMap.duration] || '') : '';
      const duration = parseInt(durationRaw) || 12;
      
      // Parse start date - could be "Feb 17", "March", "Feb 2", etc.
      let startDateRaw = colMap.start_date !== undefined ? (row[colMap.start_date] || '').trim() : '';
      let startDate = '';
      if (startDateRaw) {
        // Parse month names and convert to 2026 date
        const monthMap = { 'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04', 'may': '05', 'jun': '06', 
                          'jul': '07', 'aug': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12' };
        const monthMatch = startDateRaw.toLowerCase().match(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/);
        if (monthMatch) {
          const month = monthMap[monthMatch[1]];
          const dayMatch = startDateRaw.match(/\d+/);
          const day = dayMatch ? dayMatch[0].padStart(2, '0') : '01';
          startDate = `2026-${month}-${day}`;
        }
      }
      
      imported.push({
        company,
        project_name: projectName,
        contact: '',
        budget,
        probability,
        duration,
        stage: 'Proposal',
        start_date: startDate,
        work_type: '',
        lead_source: 'new'
      });
    }
    
    if (imported.length === 0) {
      return { error: 'No valid prospects found. Check that your CSV has Client, Project Name, SOW, % Probable, Weeks, and Kick Off columns.' };
    }
    
    return { prospects: imported };
  };

  const handleProspectImportCSV = async (file) => {
    const text = await file.text();
    const result = parseProspectCSV(text);
    if (result.error) {
      alert(result.error);
      return;
    }
    setProspectImportPreview(result.prospects);
  };

  const handleConfirmProspectImport = async () => {
    if (!prospectImportPreview) return;
    setSyncing(true);
    
    for (const p of prospectImportPreview) {
      const existing = prospects.find(ex => 
        ex.company.toLowerCase() === p.company.toLowerCase() && 
        ex.project_name && p.project_name && 
        ex.project_name.toLowerCase() === p.project_name.toLowerCase()
      );
      
      const data = {
        company: p.company,
        project_name: p.project_name,
        contact: p.contact,
        budget: p.budget,
        probability: p.probability,
        duration: p.duration,
        stage: p.stage || 'Lead',
        start_date: p.start_date || null,
        work_type: p.work_type,
        lead_source: p.lead_source,
        last_engagement: new Date().toISOString().split('T')[0],
        user_id: session.user.id
      };
      
      if (existing) {
        await supabase.from('prospects').update(data).eq('id', existing.id);
      } else {
        await supabase.from('prospects').insert(data);
      }
    }
    
    await loadProspects();
    setProspectImportPreview(null);
    setShowProspectImport(false);
    setSyncing(false);
  };

  if (loading) return <div style={styles.authContainer}><div style={styles.authBox}><h1 style={styles.logo}>Pipeline</h1><p style={styles.authText}>Loading...</p></div></div>;
  if (!session) return <AuthScreen />;

  const projectionData = getProjectionData();
  const maxRevenue = Math.max(...projectionData.map(m => m.committedRevenue + (showWeighted ? m.pipelineRevenueWeighted : m.pipelineRevenue)), ...projectionData.map(m => m.target), 1);
  const maxFTE = Math.max(...projectionData.map(m => Math.max(m.availableStaff, m.committedFTE + (showWeighted ? m.pipelineFTEWeighted : m.pipelineFTE))), 1);

  // Sorted lists (alphabetically by company)
  const sortedProspects = [...prospects].sort((a, b) => (a.company || '').localeCompare(b.company || ''));
  const sortedProjects = [...projects].sort((a, b) => (a.company || '').localeCompare(b.company || ''));

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
        <button onClick={() => setMasterTab('ops-dashboard')} style={{...styles.masterTab, ...(masterTab === 'ops-dashboard' ? styles.masterTabActive : {})}}>Ops Dashboard</button>
        <button onClick={() => setMasterTab('settings')} style={{...styles.masterTab, ...(masterTab === 'settings' ? styles.masterTabActive : {})}}>Settings</button>
        <button onClick={() => setMasterTab('assumptions')} style={{...styles.masterTabSmall, ...(masterTab === 'assumptions' ? styles.masterTabActive : {})}}>?</button>
      </div>

      {/* PIPELINE TAB */}
      {masterTab === 'pipeline' && (
        <>
          <nav style={styles.nav}>
            <div style={styles.navLinks}>
              {['pipeline', 'list', 'monthly', 'projections', 'insights'].map(v => (
                <button key={v} onClick={() => setView(v)} style={{...styles.navLink, ...(view === v ? styles.navLinkActive : {})}}>{v.charAt(0).toUpperCase() + v.slice(1)}</button>
              ))}
            </div>
            <div style={styles.navActions}>
              <button onClick={() => setShowProspectImport(true)} style={styles.actionButton}>Import</button>
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
                      {sortedProspects.filter(p => p.stage === stage).map(prospect => (
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
                    <th style={styles.th}>Company</th><th style={styles.th}>Project</th><th style={styles.th}>Type</th><th style={styles.th}>Budget</th>
                    <th style={styles.th}>Duration</th><th style={styles.th}>Prob.</th><th style={styles.th}>Start</th><th style={styles.th}>FTEs</th><th style={styles.th}>Stage</th><th style={styles.th}>Last Contact</th>
                  </tr></thead>
                  <tbody>
                    {sortedProspects.map(prospect => {
                      const autoFTE = calculateFTE(prospect.budget, prospect.duration);
                      const displayFTE = prospect.staffing_fte != null ? prospect.staffing_fte : autoFTE;
                      return (
                        <tr key={prospect.id} style={styles.tr} onClick={() => setSelectedProspect(prospect)}>
                          <td style={styles.td}>{prospect.company}</td>
                          <td style={styles.td}>{prospect.project_name || '—'}</td>
                          <td style={styles.tdSecondary}>{parseWorkTypes(prospect.work_type).join(', ') || '—'}</td>
                          <td style={styles.td}>{formatCurrency(prospect.budget)}</td>
                          <td style={styles.tdSecondary}>{prospect.duration || 1}wk</td>
                          <td style={styles.td}>{prospect.probability || 50}%</td>
                          <td style={styles.tdSecondary}>{formatDate(prospect.start_date)}</td>
                          <td style={styles.td}>{displayFTE.toFixed(1)}</td>
                          <td style={styles.td}>{prospect.stage}</td>
                          <td style={{...styles.td, ...(daysSince(prospect.last_engagement) > 7 ? { fontWeight: 700 } : {})}}>{formatDate(prospect.last_engagement)} ({daysSince(prospect.last_engagement)}d)</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {view === 'monthly' && (
              <MonthlyEditableTable 
                items={sortedProspects.filter(p => p.stage !== 'Closed')} 
                type="prospect"
                months={MONTHS}
                formatCurrency={formatCurrency}
                onUpdate={async (id, monthlyRevenue, newTotal) => {
                  setSyncing(true);
                  await supabase.from('prospects').update({ monthly_revenue: monthlyRevenue, budget: newTotal }).eq('id', id);
                  await loadProspects();
                  setSyncing(false);
                }}
              />
            )}

            {view === 'projections' && (
              <div style={styles.projectionsView}>
                <div style={styles.projectionHeader}>
                  <h2 style={styles.projectionTitle}>Weighted Pipeline Revenue</h2>
                </div>
                <div style={styles.chartContainer}>
                  <div style={styles.chartYAxis}><span>{formatCurrency(maxRevenue)}</span><span>{formatCurrency(maxRevenue / 2)}</span><span>$0</span></div>
                  <div style={styles.chart}>
                    {projectionData.map((month, idx) => {
                      const pipeline = month.pipelineRevenueWeighted;
                      return (
                        <div key={idx} style={styles.chartBar}>
                          <div style={styles.chartBarStack}>
                            <div style={{...styles.chartBarSegment, height: `${maxRevenue ? (pipeline / maxRevenue) * 100 : 0}%`, backgroundColor: '#999'}} />
                          </div>
                          <div style={styles.chartBarLabel}>{month.label}</div>
                          {pipeline > 0 && <div style={styles.chartBarValue}>{formatCurrency(pipeline)}</div>}
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
                  <h3 style={styles.insightTitle}>Pipeline by Lead Source</h3>
                  {(() => {
                    const newRevenue = prospects.filter(p => p.stage !== 'Closed' && (p.lead_source === 'new' || !p.lead_source)).reduce((sum, p) => sum + (p.budget || 0), 0);
                    const organicRevenue = prospects.filter(p => p.stage !== 'Closed' && p.lead_source === 'organic').reduce((sum, p) => sum + (p.budget || 0), 0);
                    const total = newRevenue + organicRevenue;
                    return (
                      <div style={styles.barChart}>
                        <div style={styles.barRow}>
                          <span style={styles.barLabel}>New</span>
                          <div style={styles.barTrack}><div style={{...styles.barFill, width: `${total ? (newRevenue / total) * 100 : 0}%`}} /></div>
                          <span style={styles.barValue}>{formatCurrency(newRevenue)}</span>
                        </div>
                        <div style={styles.barRow}>
                          <span style={styles.barLabel}>Organic</span>
                          <div style={styles.barTrack}><div style={{...styles.barFill, width: `${total ? (organicRevenue / total) * 100 : 0}%`, backgroundColor: '#666'}} /></div>
                          <span style={styles.barValue}>{formatCurrency(organicRevenue)}</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
                <div style={styles.insightCard}>
                  <h3 style={styles.insightTitle}>Pipeline by Work Type</h3>
                  {(() => {
                    // Calculate revenue split equally among selected work types
                    const workTypeRevenue = { Strategy: 0, Design: 0, Creative: 0 };
                    prospects.filter(p => p.stage !== 'Closed').forEach(p => {
                      const types = parseWorkTypes(p.work_type);
                      if (types.length > 0) {
                        const revenuePerType = (p.budget || 0) / types.length;
                        types.forEach(t => {
                          if (workTypeRevenue[t] !== undefined) {
                            workTypeRevenue[t] += revenuePerType;
                          }
                        });
                      }
                    });
                    const total = Object.values(workTypeRevenue).reduce((sum, v) => sum + v, 0);
                    return (
                      <div style={styles.barChart}>
                        {WORK_TYPES.map(type => (
                          <div key={type} style={styles.barRow}>
                            <span style={styles.barLabel}>{type}</span>
                            <div style={styles.barTrack}><div style={{...styles.barFill, width: `${total ? (workTypeRevenue[type] / total) * 100 : 0}%`, backgroundColor: type === 'Strategy' ? '#000' : type === 'Design' ? '#666' : '#999'}} /></div>
                            <span style={styles.barValue}>{formatCurrency(workTypeRevenue[type])}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
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
              {['list', 'monthly', 'projections'].map(v => (
                <button key={v} onClick={() => setProjectView(v)} style={{...styles.navLink, ...(projectView === v ? styles.navLinkActive : {})}}>{v.charAt(0).toUpperCase() + v.slice(1)}</button>
              ))}
            </div>
            <div style={styles.navActions}>
              <button onClick={() => setShowImport(true)} style={styles.actionButton}>Import</button>
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
                    <th style={styles.th}>Company</th><th style={styles.th}>Project</th><th style={styles.th}>Type</th>
                    <th style={styles.th}>Contract Value</th><th style={styles.th}>Duration</th><th style={styles.th}>Start</th><th style={styles.th}>FTEs</th><th style={styles.th}>Status</th>
                  </tr></thead>
                  <tbody>
                    {sortedProjects.map(project => {
                      const autoFTE = calculateFTE(project.contract_value, project.duration);
                      const displayFTE = project.staffing_fte != null ? project.staffing_fte : autoFTE;
                      return (
                        <tr key={project.id} style={styles.tr} onClick={() => setSelectedProject(project)}>
                          <td style={styles.td}>{project.company}</td>
                          <td style={styles.td}>{project.project_name || '—'}</td>
                          <td style={styles.tdSecondary}>{parseWorkTypes(project.work_type).join(', ') || '—'}</td>
                          <td style={styles.td}>{formatCurrency(project.contract_value)}</td>
                          <td style={styles.tdSecondary}>{project.duration || 1}wk</td>
                          <td style={styles.tdSecondary}>{formatDate(project.start_date)}</td>
                          <td style={styles.td}>{displayFTE.toFixed(1)}</td>
                          <td style={{...styles.td, fontWeight: project.status === 'Active' ? 700 : 400}}>{project.status}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {projectView === 'monthly' && (
              <MonthlyEditableTable 
                items={sortedProjects.filter(p => p.status === 'Active')} 
                type="project"
                months={MONTHS}
                formatCurrency={formatCurrency}
                onUpdate={async (id, monthlyRevenue, newTotal) => {
                  setSyncing(true);
                  await supabase.from('projects').update({ monthly_revenue: monthlyRevenue, contract_value: newTotal }).eq('id', id);
                  await loadProjects();
                  setSyncing(false);
                }}
              />
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

      {/* Import Modal */}
      {showImport && (
        <div style={styles.overlay} onClick={() => { setShowImport(false); setImportPreview(null); }}>
          <div style={{...styles.sidebar, maxWidth: '700px', width: '700px'}} onClick={e => e.stopPropagation()}>
            <div style={styles.sidebarHeader}>
              <h2 style={styles.sidebarTitle}>Import Financial Model</h2>
              <button onClick={() => { setShowImport(false); setImportPreview(null); }} style={styles.closeButton}>×</button>
            </div>
            <div style={{...styles.sidebarContent, overflow: 'auto'}}>
              {!importPreview ? (
                <div style={{padding: '40px', textAlign: 'center', border: '2px dashed #ccc', cursor: 'pointer', margin: '20px'}} onClick={() => document.getElementById('csv-upload').click()}>
                  <input id="csv-upload" type="file" accept=".csv" style={{display: 'none'}} onChange={(e) => { if (e.target.files[0]) handleImportCSV(e.target.files[0]); }} />
                  <p style={{fontSize: '16px', fontWeight: 600, marginBottom: '8px'}}>Drop CSV or click to upload</p>
                  <p style={{fontSize: '13px', color: '#666'}}>Export your financial model as CSV (Committed Detail tab)</p>
                </div>
              ) : (
                <div style={{padding: '20px'}}>
                  <p style={{fontSize: '14px', marginBottom: '16px'}}>Found <strong>{importPreview.length} projects</strong> to import:</p>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Company</th>
                        <th style={styles.th}>Project</th>
                        <th style={styles.th}>2026 Revenue</th>
                        <th style={styles.th}>Duration</th>
                        <th style={styles.th}>Start</th>
                        <th style={styles.th}>Match</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importPreview.map((proj, i) => {
                        const existing = projects.find(p => 
                          p.company.toLowerCase() === proj.company.toLowerCase() && 
                          p.project_name && proj.project_name && 
                          p.project_name.toLowerCase() === proj.project_name.toLowerCase()
                        );
                        return (
                          <tr key={i} style={styles.tr}>
                            <td style={styles.td}>{proj.company}</td>
                            <td style={styles.td}>{proj.project_name}</td>
                            <td style={{...styles.td, textAlign: 'right'}}>{formatCurrency(proj.contract_value)}</td>
                            <td style={{...styles.td, textAlign: 'center'}}>{proj.duration}wk</td>
                            <td style={{...styles.td, textAlign: 'center'}}>{proj.start_month} '26</td>
                            <td style={{...styles.td, textAlign: 'center', color: existing ? '#c90' : '#060'}}>{existing ? 'Update' : 'New'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div style={{display: 'flex', gap: '12px', marginTop: '24px', justifyContent: 'flex-end'}}>
                    <button onClick={() => setImportPreview(null)} style={styles.actionButton}>Back</button>
                    <button onClick={handleConfirmImport} style={styles.actionButtonPrimary}>
                      {syncing ? 'Importing...' : `Import ${importPreview.length} Projects`}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Prospect Import Modal */}
      {showProspectImport && (
        <div style={styles.overlay} onClick={() => { setShowProspectImport(false); setProspectImportPreview(null); }}>
          <div style={{...styles.sidebar, maxWidth: '700px', width: '700px'}} onClick={e => e.stopPropagation()}>
            <div style={styles.sidebarHeader}>
              <h2 style={styles.sidebarTitle}>Import Prospects</h2>
              <button onClick={() => { setShowProspectImport(false); setProspectImportPreview(null); }} style={styles.closeButton}>×</button>
            </div>
            <div style={{...styles.sidebarContent, overflow: 'auto'}}>
              {!prospectImportPreview ? (
                <div style={{padding: '40px', textAlign: 'center', border: '2px dashed #ccc', cursor: 'pointer', margin: '20px'}} onClick={() => document.getElementById('prospect-csv-upload').click()}>
                  <input id="prospect-csv-upload" type="file" accept=".csv" style={{display: 'none'}} onChange={(e) => { if (e.target.files[0]) handleProspectImportCSV(e.target.files[0]); }} />
                  <p style={{fontSize: '16px', fontWeight: 600, marginBottom: '8px'}}>Drop CSV or click to upload</p>
                  <p style={{fontSize: '13px', color: '#666'}}>CSV should have columns: Company, Project, Budget, Probability, Duration, Stage</p>
                </div>
              ) : (
                <div style={{padding: '20px'}}>
                  <p style={{fontSize: '14px', marginBottom: '16px'}}>Found <strong>{prospectImportPreview.length} prospects</strong> to import:</p>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Company</th>
                        <th style={styles.th}>Project</th>
                        <th style={styles.th}>Budget</th>
                        <th style={styles.th}>Prob.</th>
                        <th style={styles.th}>Stage</th>
                        <th style={styles.th}>Match</th>
                      </tr>
                    </thead>
                    <tbody>
                      {prospectImportPreview.map((p, i) => {
                        const existing = prospects.find(ex => 
                          ex.company.toLowerCase() === p.company.toLowerCase() && 
                          ex.project_name && p.project_name && 
                          ex.project_name.toLowerCase() === p.project_name.toLowerCase()
                        );
                        return (
                          <tr key={i} style={styles.tr}>
                            <td style={styles.td}>{p.company}</td>
                            <td style={styles.td}>{p.project_name || '—'}</td>
                            <td style={{...styles.td, textAlign: 'right'}}>{formatCurrency(p.budget)}</td>
                            <td style={{...styles.td, textAlign: 'center'}}>{p.probability}%</td>
                            <td style={styles.td}>{p.stage}</td>
                            <td style={{...styles.td, textAlign: 'center', color: existing ? '#c90' : '#060'}}>{existing ? 'Update' : 'New'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div style={{display: 'flex', gap: '12px', marginTop: '24px', justifyContent: 'flex-end'}}>
                    <button onClick={() => setProspectImportPreview(null)} style={styles.actionButton}>Back</button>
                    <button onClick={handleConfirmProspectImport} style={styles.actionButtonPrimary}>
                      {syncing ? 'Importing...' : `Import ${prospectImportPreview.length} Prospects`}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MASTER INSIGHTS TAB */}
      {masterTab === 'ops-dashboard' && (
        <>
          <nav style={styles.nav}>
            <div style={styles.navLinks}>
              <span style={styles.navLabel}>Ops Dashboard</span>
            </div>
            <div style={styles.navActions}>
              <div style={styles.projectionToggle}>
                <button onClick={() => setShowWeighted(false)} style={{...styles.toggleButton, ...(!showWeighted ? styles.toggleButtonActive : {})}}>Committed Only</button>
                <button onClick={() => setShowWeighted(true)} style={{...styles.toggleButton, ...(showWeighted ? styles.toggleButtonActive : {})}}>Weighted Pipeline</button>
              </div>
            </div>
          </nav>

          <main style={styles.main}>
            {/* Ops Meeting Agenda */}
            {(() => {
              const WEEKLY_RUN_RATE = 25000;
              const DEFAULT_PROJECT_WEEKS = 12;
              const MAX_NEW_PROJECTS_PER_2_WEEKS = 2; // Capacity constraint
              const currentMonth = projectionData[0];
              const next3Months = projectionData.slice(0, 3);
              const following3Months = projectionData.slice(3, 6);
              
              // Current month committed gap
              const currentMonthCommittedGap = currentMonth.target - currentMonth.committedRevenue;
              
              // Helper function to calculate gap analysis for a 3-month period
              // Uses WEIGHTED pipeline values (not just 90%+)
              const calculateGapAnalysis = (months, periodLabel) => {
                // Calculate revenue per month (committed + weighted pipeline)
                const monthlyData = months.map(m => {
                  // Weighted pipeline (all prospects weighted by probability)
                  const weightedPipeline = prospects
                    .filter(p => p.stage !== 'Closed')
                    .reduce((pSum, p) => {
                      if (!p.start_date || !p.budget) return pSum;
                      const prob = (p.probability || 50) / 100;
                      const monthlyRevenue = calculateMonthlyRevenueByBusinessDays(p.start_date, p.duration || 1, p.budget, MONTHS);
                      return pSum + (monthlyRevenue[m.key] || 0) * prob;
                    }, 0);
                  const totalRevenue = m.committedRevenue + weightedPipeline;
                  const gap = m.target - totalRevenue;
                  return { month: m, totalRevenue, weightedPipeline, gap };
                });
                
                const totalRevenue = monthlyData.reduce((sum, d) => sum + d.totalRevenue, 0);
                const totalTarget = months.reduce((sum, m) => sum + m.target, 0);
                const totalGap = totalTarget - totalRevenue;
                
                // Calculate weeks needed to fill EACH month's gap
                let totalWeeksNeeded = 0;
                const monthGapDetails = monthlyData.map(d => {
                  const weeksNeeded = d.gap > 0 ? Math.ceil(d.gap / WEEKLY_RUN_RATE) : 0;
                  totalWeeksNeeded += weeksNeeded;
                  return { month: d.month.label.split(' ')[0], gap: d.gap, weeksNeeded };
                });
                
                // Convert total weeks to projects (12 weeks each)
                const projectsNeeded = totalWeeksNeeded > 0 ? Math.ceil(totalWeeksNeeded / DEFAULT_PROJECT_WEEKS) : 0;
                
                // Capacity constraint: 2 new projects per 2 weeks = 1 per week
                // 3 months = ~13 weeks, so max ~13 new project starts, but constrained to 2 per 2 weeks = ~6 projects
                const weeksInPeriod = 13; // ~3 months
                const maxProjectsCanStart = Math.floor(weeksInPeriod / 2) * MAX_NEW_PROJECTS_PER_2_WEEKS;
                const capacityConstrained = projectsNeeded > maxProjectsCanStart;
                
                // Calculate required start date to fill gap
                const periodStart = months[0]?.date;
                const requiredStartDate = periodStart ? new Date(periodStart) : null;
                
                // Staffing gaps (using weighted FTE)
                const staffingGaps = months.map(m => {
                  const weightedPipelineFTE = prospects
                    .filter(p => p.stage !== 'Closed')
                    .reduce((pSum, p) => {
                      if (!p.start_date || !p.budget) return pSum;
                      const prob = (p.probability || 50) / 100;
                      const monthlyRevenue = calculateMonthlyRevenueByBusinessDays(p.start_date, p.duration || 1, p.budget, MONTHS);
                      const totalRev = Object.values(monthlyRevenue).reduce((s, v) => s + v, 0) || 1;
                      const totalFTE = p.staffing_fte != null ? p.staffing_fte : calculateFTE(p.budget, p.duration || 1) * (p.duration || 1) / 4;
                      const monthRev = monthlyRevenue[m.key] || 0;
                      return pSum + totalFTE * (monthRev / totalRev) * prob;
                    }, 0);
                  const neededFTE = m.committedFTE + weightedPipelineFTE;
                  return { month: m.label, gap: neededFTE - m.availableStaff };
                });
                
                return { totalRevenue, totalTarget, totalGap, projectsNeeded, totalWeeksNeeded, monthGapDetails, requiredStartDate, staffingGaps, periodLabel, capacityConstrained, maxProjectsCanStart };
              };
              
              const first90 = calculateGapAnalysis(next3Months, 'Current 90 Days');
              const second90 = calculateGapAnalysis(following3Months, 'Following 90 Days');
              
              // Find prospects that need to start in next 3 months to contribute
              const prospectsNeedingToStart = prospects
                .filter(p => {
                  if (p.stage === 'Closed') return false;
                  if (!p.start_date) return false;
                  const startDate = new Date(p.start_date);
                  const threeMonthsOut = new Date();
                  threeMonthsOut.setMonth(threeMonthsOut.getMonth() + 3);
                  return startDate <= threeMonthsOut;
                })
                .sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
              
              const formatStartDate = (date) => {
                if (!date) return '—';
                return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              };

              return (
                <div style={styles.agendaSection}>
                  <h2 style={styles.agendaTitle}>Ops Meeting Agenda</h2>
                  
                  {/* Current Situation */}
                  <div style={{...styles.agendaCard, marginBottom: '24px'}}>
                    <h3 style={styles.agendaCardTitle}>Current Situation</h3>
                    <div style={styles.agendaGrid}>
                      <div style={styles.agendaItem}>
                        <span style={styles.agendaLabel}>Current Month Gap (Committed vs Target)</span>
                        <span style={{...styles.agendaValue, color: currentMonthCommittedGap <= 0 ? '#060' : '#c00'}}>
                          {formatCurrency(currentMonthCommittedGap > 0 ? -currentMonthCommittedGap : Math.abs(currentMonthCommittedGap))}
                        </span>
                      </div>
                      <div style={styles.agendaItem}>
                        <span style={styles.agendaLabel}>Current 90-Day Gap (Committed + Weighted)</span>
                        <span style={{...styles.agendaValue, color: first90.totalGap <= 0 ? '#060' : '#c00'}}>
                          {formatCurrency(first90.totalGap > 0 ? -first90.totalGap : Math.abs(first90.totalGap))}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Gap Analysis - Two periods side by side */}
                  <div style={styles.agendaGrid}>
                    {[first90, second90].map((period, idx) => (
                      <div key={idx} style={styles.agendaCard}>
                        <h3 style={styles.agendaCardTitle}>{period.periodLabel}</h3>
                        <div style={styles.agendaItem}>
                          <span style={styles.agendaLabel}>Gap (Committed + Weighted Pipeline)</span>
                          <span style={{...styles.agendaValue, color: period.totalGap <= 0 ? '#060' : '#c00'}}>
                            {formatCurrency(period.totalGap > 0 ? -period.totalGap : Math.abs(period.totalGap))}
                          </span>
                        </div>
                        <div style={styles.agendaItem}>
                          <span style={styles.agendaLabel}>Monthly Gaps</span>
                          <div style={styles.staffingGapList}>
                            {period.monthGapDetails.map((mg, i) => (
                              <span key={i} style={{...styles.staffingGapItem, color: mg.gap > 0 ? '#c00' : '#060'}}>
                                {mg.month}: {formatCurrency(mg.gap > 0 ? -mg.gap : Math.abs(mg.gap))}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div style={styles.agendaItem}>
                          <span style={styles.agendaLabel}>New Work Needed ($25K/wk × 12wk projects)</span>
                          <span style={{...styles.agendaValue, color: period.projectsNeeded > 0 ? '#c00' : '#060'}}>
                            {period.projectsNeeded > 0 ? `${period.projectsNeeded} project${period.projectsNeeded > 1 ? 's' : ''} (${period.totalWeeksNeeded} weeks)` : 'None'}
                          </span>
                          {period.capacityConstrained && (
                            <span style={{fontSize: '12px', color: '#c00', display: 'block', marginTop: '4px'}}>
                              ⚠️ Exceeds capacity (max {period.maxProjectsCanStart} project starts in 90 days)
                            </span>
                          )}
                        </div>
                        {period.projectsNeeded > 0 && (
                          <div style={styles.agendaItem}>
                            <span style={styles.agendaLabel}>Required Start Date</span>
                            <span style={{...styles.agendaValue, fontSize: '16px'}}>
                              By {formatStartDate(period.requiredStartDate)}
                            </span>
                          </div>
                        )}
                        <div style={styles.agendaItem}>
                          <span style={styles.agendaLabel}>Staffing Gaps (FTEs Needed - Available)</span>
                          <div style={styles.staffingGapList}>
                            {period.staffingGaps.map((sg, i) => (
                              <span key={i} style={{...styles.staffingGapItem, color: sg.gap > 0 ? '#c00' : '#060'}}>
                                {sg.month.split(' ')[0]}: {sg.gap > 0 ? '+' : ''}{sg.gap.toFixed(1)}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {/* Prospects Needing to Start */}
                  {prospectsNeedingToStart.length > 0 && (
                    <div style={{...styles.agendaCard, marginTop: '24px'}}>
                      <h3 style={styles.agendaCardTitle}>Prospects to Close (Starting in Next 3 Months)</h3>
                      <table style={{...styles.table, marginTop: '12px'}}>
                        <thead>
                          <tr>
                            <th style={styles.th}>Company</th>
                            <th style={styles.th}>Project</th>
                            <th style={styles.th}>Budget</th>
                            <th style={styles.th}>Prob.</th>
                            <th style={styles.th}>Weighted</th>
                            <th style={styles.th}>Start</th>
                            <th style={styles.th}>Stage</th>
                          </tr>
                        </thead>
                        <tbody>
                          {prospectsNeedingToStart.map(p => {
                            const prob = p.probability || 50;
                            const weighted = (p.budget || 0) * (prob / 100);
                            return (
                              <tr key={p.id} style={styles.tr}>
                                <td style={styles.td}>{p.company}</td>
                                <td style={styles.td}>{p.project_name || '—'}</td>
                                <td style={{...styles.td, textAlign: 'right'}}>{formatCurrency(p.budget)}</td>
                                <td style={{...styles.td, textAlign: 'center'}}>{prob}%</td>
                                <td style={{...styles.td, textAlign: 'right'}}>{formatCurrency(weighted)}</td>
                                <td style={styles.td}>{formatDate(p.start_date)}</td>
                                <td style={styles.td}>{p.stage}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* 3-Month Revenue Detail */}
            <div style={styles.threeMonthSection}>
              <h2 style={styles.projectionTitle}>Next 3 Months Detail</h2>
              <div style={styles.threeMonthGrid}>
                {projectionData.slice(0, 3).map((month, idx) => {
                  const pipeline = showWeighted ? month.pipelineRevenueWeighted : 0;
                  const committedGap = month.target - month.committedRevenue;
                  const totalGap = month.target - (month.committedRevenue + pipeline);
                  return (
                    <div key={idx} style={styles.threeMonthCard}>
                      <h3 style={styles.threeMonthTitle}>{month.label}</h3>
                      <div style={styles.threeMonthRow}>
                        <span style={styles.threeMonthLabel}>Target</span>
                        <span style={styles.threeMonthValue}>{formatCurrency(month.target)}</span>
                      </div>
                      <div style={styles.threeMonthRow}>
                        <span style={styles.threeMonthLabel}>Committed</span>
                        <span style={styles.threeMonthValue}>{formatCurrency(month.committedRevenue)}</span>
                      </div>
                      <div style={styles.threeMonthRow}>
                        <span style={styles.threeMonthLabel}>Gap (Target - Committed)</span>
                        <span style={{...styles.threeMonthValue, color: committedGap <= 0 ? '#060' : '#c00', fontWeight: 600}}>
                          {formatCurrency(-committedGap)}
                        </span>
                      </div>
                      {showWeighted && (
                        <>
                          <div style={styles.threeMonthDivider} />
                          <div style={styles.threeMonthRow}>
                            <span style={styles.threeMonthLabel}>Committed + Weighted</span>
                            <span style={styles.threeMonthValue}>{formatCurrency(month.committedRevenue + pipeline)}</span>
                          </div>
                          <div style={styles.threeMonthRow}>
                            <span style={styles.threeMonthLabel}>Gap (Target - Total)</span>
                            <span style={{...styles.threeMonthValue, color: totalGap <= 0 ? '#060' : '#c00', fontWeight: 600}}>
                              {formatCurrency(-totalGap)}
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
              {/* Quarter Summary */}
              {(() => {
                const q1Data = projectionData.slice(0, 3);
                const qTarget = q1Data.reduce((sum, m) => sum + m.target, 0);
                const qCommitted = q1Data.reduce((sum, m) => sum + m.committedRevenue, 0);
                const qPipeline = showWeighted ? q1Data.reduce((sum, m) => sum + m.pipelineRevenueWeighted, 0) : 0;
                const qCommittedGap = qTarget - qCommitted;
                const qTotalGap = qTarget - (qCommitted + qPipeline);
                return (
                  <div style={{...styles.threeMonthCard, marginTop: '16px', backgroundColor: '#f5f5f5'}}>
                    <h3 style={styles.threeMonthTitle}>Quarter Total</h3>
                    <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px'}}>
                      <div>
                        <div style={styles.threeMonthRow}><span style={styles.threeMonthLabel}>Target</span><span style={styles.threeMonthValue}>{formatCurrency(qTarget)}</span></div>
                      </div>
                      <div>
                        <div style={styles.threeMonthRow}><span style={styles.threeMonthLabel}>Committed</span><span style={styles.threeMonthValue}>{formatCurrency(qCommitted)}</span></div>
                      </div>
                      <div>
                        <div style={styles.threeMonthRow}><span style={styles.threeMonthLabel}>Gap</span><span style={{...styles.threeMonthValue, color: qCommittedGap <= 0 ? '#060' : '#c00', fontWeight: 600}}>{formatCurrency(-qCommittedGap)}</span></div>
                      </div>
                    </div>
                    {showWeighted && (
                      <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #ddd'}}>
                        <div>
                          <div style={styles.threeMonthRow}><span style={styles.threeMonthLabel}>+ Weighted</span><span style={styles.threeMonthValue}>{formatCurrency(qPipeline)}</span></div>
                        </div>
                        <div>
                          <div style={styles.threeMonthRow}><span style={styles.threeMonthLabel}>Total</span><span style={styles.threeMonthValue}>{formatCurrency(qCommitted + qPipeline)}</span></div>
                        </div>
                        <div>
                          <div style={styles.threeMonthRow}><span style={styles.threeMonthLabel}>Gap</span><span style={{...styles.threeMonthValue, color: qTotalGap <= 0 ? '#060' : '#c00', fontWeight: 600}}>{formatCurrency(-qTotalGap)}</span></div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Revenue Chart */}
            <div style={{...styles.projectionsView, marginTop: '48px'}}>
              <div style={styles.projectionHeader}>
                <h2 style={styles.projectionTitle}>Revenue vs Target</h2>
              </div>
              <div style={styles.chartLegend}>
                <div style={styles.legendItem}><div style={{...styles.legendColor, backgroundColor: '#000'}} /><span>Committed</span></div>
                {showWeighted && <div style={styles.legendItem}><div style={{...styles.legendColor, backgroundColor: '#999'}} /><span>Pipeline</span></div>}
                <div style={styles.legendItem}><div style={{...styles.legendColor, backgroundColor: 'transparent', border: '2px solid #c00'}} /><span>Target</span></div>
              </div>
              <div style={styles.chartContainer}>
                <div style={styles.chartYAxis}><span>{formatCurrency(maxRevenue)}</span><span>{formatCurrency(maxRevenue / 2)}</span><span>$0</span></div>
                <div style={styles.chart}>
                  {projectionData.map((month, idx) => {
                    const pipeline = showWeighted ? month.pipelineRevenueWeighted : 0;
                    const total = month.committedRevenue + pipeline;
                    return (
                      <div key={idx} style={styles.chartBar}>
                        <div style={styles.chartBarStack}>
                          {showWeighted && <div style={{...styles.chartBarSegment, height: `${maxRevenue ? (pipeline / maxRevenue) * 100 : 0}%`, backgroundColor: '#999'}} />}
                          <div style={{...styles.chartBarSegment, height: `${maxRevenue ? (month.committedRevenue / maxRevenue) * 100 : 0}%`, backgroundColor: '#000'}} />
                        </div>
                        {month.target > 0 && (
                          <div style={{...styles.targetLine, bottom: `${(month.target / maxRevenue) * 100}%`}}>
                            <span style={styles.targetLineLabel}>{formatCurrency(month.target)}</span>
                          </div>
                        )}
                        <div style={styles.chartBarLabel}>{month.label}</div>
                        {total > 0 && <div style={styles.chartBarValue}>{formatCurrency(total)}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div style={styles.projectionSummary}>
                <div style={styles.projectionSummaryItem}><span style={styles.projectionSummaryLabel}>12-Month Total</span><span style={styles.projectionSummaryValue}>{formatCurrency(projectionData.reduce((sum, m) => sum + m.committedRevenue + (showWeighted ? m.pipelineRevenueWeighted : 0), 0))}</span></div>
                <div style={styles.projectionSummaryItem}><span style={styles.projectionSummaryLabel}>12-Month Target</span><span style={styles.projectionSummaryValue}>{formatCurrency(annualTarget)}</span></div>
                <div style={styles.projectionSummaryItem}><span style={styles.projectionSummaryLabel}>Gap</span><span style={{...styles.projectionSummaryValue, color: projectionData.reduce((sum, m) => sum + m.committedRevenue + (showWeighted ? m.pipelineRevenueWeighted : 0), 0) >= annualTarget ? '#060' : '#c00'}}>{formatCurrency(projectionData.reduce((sum, m) => sum + m.committedRevenue + (showWeighted ? m.pipelineRevenueWeighted : 0), 0) - annualTarget)}</span></div>
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
                <div style={styles.legendItem}><div style={{...styles.legendColor, backgroundColor: 'transparent', border: '2px solid #060'}} /><span>Staff + Freelance</span></div>
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
                <div style={styles.projectionSummaryItem}><span style={styles.projectionSummaryLabel}>Avg Freelance FTEs</span><span style={styles.projectionSummaryValue}>{(MONTHS.reduce((sum, m) => sum + calculateFreelanceFTE(settings.freelanceBudget[m.key] || 0), 0) / 12).toFixed(1)}</span></div>
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
                    <th style={styles.th}>Staff</th>
                    <th style={styles.th}>Freelance</th>
                    <th style={styles.th}>Staffing Gap</th>
                  </tr></thead>
                  <tbody>
                    {projectionData.map((month, idx) => {
                      const pipeline = showWeighted ? month.pipelineRevenueWeighted : month.pipelineRevenue;
                      const pipelineFTE = showWeighted ? month.pipelineFTEWeighted : month.pipelineFTE;
                      const total = month.committedRevenue + pipeline;
                      const revenueGap = total - month.target;
                      const neededFTE = month.committedFTE + pipelineFTE;
                      const staffingGap = neededFTE - month.availableStaff;
                      return (
                        <tr key={idx} style={styles.tr}>
                          <td style={styles.td}>{month.label}</td>
                          <td style={styles.td}>{formatCurrency(month.target)}</td>
                          <td style={styles.td}>{formatCurrency(month.committedRevenue)}</td>
                          <td style={styles.tdSecondary}>{formatCurrency(pipeline)}</td>
                          <td style={styles.td}>{formatCurrency(total)}</td>
                          <td style={{...styles.td, color: revenueGap >= 0 ? '#060' : '#c00', fontWeight: 600}}>{formatCurrency(revenueGap)}</td>
                          <td style={styles.td}>{neededFTE.toFixed(1)}</td>
                          <td style={styles.td}>{month.fullTimeStaff.toFixed(1)}</td>
                          <td style={styles.td}>{month.freelanceFTE.toFixed(1)}</td>
                          <td style={{...styles.td, color: staffingGap > 0 ? '#c00' : '#060', fontWeight: 600}}>{staffingGap > 0 ? '+' : ''}{staffingGap.toFixed(1)}</td>
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

      {/* ASSUMPTIONS TAB */}
      {masterTab === 'assumptions' && (
        <main style={styles.main}>
          <div style={styles.assumptionsPage}>
            <h2 style={styles.assumptionsTitle}>Calculation Assumptions</h2>
            
            <div style={styles.assumptionSection}>
              <h3 style={styles.assumptionSectionTitle}>Revenue & Billing</h3>
              <ul style={styles.assumptionList}>
                <li><strong>Billable Rate:</strong> $290/hour</li>
                <li><strong>Hours per Week:</strong> 36 hours (adjusted for PTO)</li>
                <li><strong>Freelance Day Rate:</strong> $1,000/day</li>
                <li><strong>Working Days per Month:</strong> 20 (average)</li>
              </ul>
            </div>
            
            <div style={styles.assumptionSection}>
              <h3 style={styles.assumptionSectionTitle}>Revenue Allocation</h3>
              <ul style={styles.assumptionList}>
                <li><strong>Method:</strong> Revenue is distributed proportionally across business days</li>
                <li><strong>Business Days:</strong> Weekdays (Mon-Fri) excluding US federal holidays</li>
                <li><strong>Example:</strong> A $500K project over 10 weeks allocates ~$10K per business day to each month based on overlap</li>
              </ul>
            </div>
            
            <div style={styles.assumptionSection}>
              <h3 style={styles.assumptionSectionTitle}>FTE Calculations</h3>
              <ul style={styles.assumptionList}>
                <li><strong>Formula:</strong> FTEs = Weekly Revenue ÷ $290/hour ÷ 36 hours</li>
                <li><strong>Example:</strong> $25K/week ÷ $290 ÷ 36 = 2.4 FTEs</li>
                <li><strong>Freelance FTEs:</strong> Monthly Budget ÷ $1,000/day ÷ 20 working days</li>
              </ul>
            </div>
            
            <div style={styles.assumptionSection}>
              <h3 style={styles.assumptionSectionTitle}>Gap Analysis</h3>
              <ul style={styles.assumptionList}>
                <li><strong>Default Project Assumption:</strong> $25K/week run rate, 12 weeks duration ($300K total)</li>
                <li><strong>Projects Needed:</strong> Calculated to fill the gap in EACH month individually, not just quarterly totals</li>
                <li><strong>Weighted Pipeline:</strong> All prospects are weighted by their probability % in gap calculations</li>
                <li><strong>Capacity Constraint:</strong> Max 2 new projects can start every 2 weeks (~6 per quarter)</li>
                <li><strong>Staffing Gap:</strong> FTEs Needed − Available Staff (positive = need more people)</li>
              </ul>
            </div>
            
            <div style={styles.assumptionSection}>
              <h3 style={styles.assumptionSectionTitle}>Pipeline Views</h3>
              <ul style={styles.assumptionList}>
                <li><strong>Committed:</strong> Only active projects (no prospects)</li>
                <li><strong>Weighted Pipeline:</strong> Prospect budget × probability %</li>
                <li><strong>Monthly View:</strong> Shows weighted values for prospects (hover for full amount)</li>
                <li><strong>Work Type Revenue Split:</strong> If multiple types selected, revenue splits equally between them</li>
              </ul>
            </div>
            
            <div style={styles.assumptionSection}>
              <h3 style={styles.assumptionSectionTitle}>US Federal Holidays (2026)</h3>
              <ul style={styles.assumptionList}>
                <li>New Year's Day (Jan 1), MLK Day (Jan 19), Presidents Day (Feb 16)</li>
                <li>Memorial Day (May 25), Independence Day observed (Jul 3), Labor Day (Sep 7)</li>
                <li>Columbus Day (Oct 12), Veterans Day (Nov 11), Thanksgiving (Nov 26), Christmas (Dec 25)</li>
              </ul>
            </div>
          </div>
        </main>
      )}

      {showForm && <ProspectForm prospect={editingProspect} onSave={handleSaveProspect} onCancel={() => { setShowForm(false); setEditingProspect(null); }} />}
      {showProjectForm && <ProjectForm project={editingProject} onSave={handleSaveProject} onCancel={() => { setShowProjectForm(false); setEditingProject(null); }} />}
      {showEngagementForm && selectedProspect && <EngagementForm onSave={(eng) => handleAddEngagement(selectedProspect.id, eng)} onCancel={() => setShowEngagementForm(false)} />}
    </div>
  );
}

// Helper function to calculate auto-distributed monthly revenue
function calculateAutoMonthlyRevenue(item, months, type) {
  const totalValue = type === 'project' ? (item.contract_value || 0) : (item.budget || 0);
  const durationWeeks = item.duration || 1;
  
  if (!item.start_date || !totalValue) return {};
  
  return calculateMonthlyRevenueByBusinessDays(item.start_date, durationWeeks, totalValue, months);
}

function MonthlyEditableTable({ items, type, months, formatCurrency, onUpdate }) {
  const [editingCell, setEditingCell] = useState(null);
  const [editValue, setEditValue] = useState('');

  const getMonthlyValue = (item, monthKey) => {
    // If there's an override, use it
    if (item.monthly_revenue && item.monthly_revenue[monthKey] !== undefined) {
      return item.monthly_revenue[monthKey];
    }
    // Otherwise calculate auto value
    const autoValues = calculateAutoMonthlyRevenue(item, months, type);
    return autoValues[monthKey] || 0;
  };

  const getWeightedValue = (item, value) => {
    if (type === 'project') return value;
    const prob = (item.probability || 50) / 100;
    return value * prob;
  };

  const getTotalFromMonthly = (item) => {
    let total = 0;
    months.forEach(m => {
      total += getMonthlyValue(item, m.key);
    });
    return total;
  };

  const handleCellClick = (itemId, monthKey, currentValue) => {
    setEditingCell({ itemId, monthKey });
    setEditValue(Math.round(currentValue).toString());
  };

  const handleCellBlur = async (item) => {
    if (!editingCell) return;
    
    const newValue = parseFloat(editValue) || 0;
    const currentMonthlyRevenue = item.monthly_revenue || {};
    
    // Create new monthly revenue object with the override
    const newMonthlyRevenue = { ...currentMonthlyRevenue };
    
    // Get all current values (auto + overrides)
    months.forEach(m => {
      if (newMonthlyRevenue[m.key] === undefined) {
        const autoValues = calculateAutoMonthlyRevenue(item, months, type);
        if (autoValues[m.key]) {
          newMonthlyRevenue[m.key] = autoValues[m.key];
        }
      }
    });
    
    // Apply the new value
    newMonthlyRevenue[editingCell.monthKey] = newValue;
    
    // Calculate new total
    const newTotal = Object.values(newMonthlyRevenue).reduce((sum, val) => sum + (val || 0), 0);
    
    await onUpdate(item.id, newMonthlyRevenue, Math.round(newTotal));
    setEditingCell(null);
    setEditValue('');
  };

  const handleKeyDown = (e, item) => {
    if (e.key === 'Enter') {
      handleCellBlur(item);
    } else if (e.key === 'Escape') {
      setEditingCell(null);
      setEditValue('');
    }
  };

  const isOverridden = (item, monthKey) => {
    return item.monthly_revenue && item.monthly_revenue[monthKey] !== undefined;
  };

  // Calculate column totals (weighted for prospects)
  const columnTotals = {};
  const columnTotalsWeighted = {};
  months.forEach(m => {
    columnTotals[m.key] = items.reduce((sum, item) => sum + getMonthlyValue(item, m.key), 0);
    columnTotalsWeighted[m.key] = items.reduce((sum, item) => sum + getWeightedValue(item, getMonthlyValue(item, m.key)), 0);
  });
  const grandTotal = Object.values(columnTotals).reduce((sum, val) => sum + val, 0);
  const grandTotalWeighted = Object.values(columnTotalsWeighted).reduce((sum, val) => sum + val, 0);

  return (
    <div style={styles.monthlyTableContainer}>
      <div style={styles.monthlyTableWrapper}>
        <table style={styles.monthlyTable}>
          <thead>
            <tr>
              <th style={styles.monthlyThFixed}>Client</th>
              <th style={styles.monthlyThProject}>Project</th>
              {type === 'prospect' && <th style={styles.monthlyTh}>Prob.</th>}
              <th style={styles.monthlyTh}>{type === 'prospect' ? 'Weighted' : 'Total'}</th>
              {months.map(m => (
                <th key={m.key} style={styles.monthlyTh}>{m.label.split(' ')[0]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map(item => {
              const itemTotal = getTotalFromMonthly(item);
              const itemTotalWeighted = type === 'prospect' ? itemTotal * ((item.probability || 50) / 100) : itemTotal;
              const prob = item.probability || 50;
              
              return (
                <tr key={item.id}>
                  <td style={styles.monthlyTdFixed}>{item.company}</td>
                  <td style={styles.monthlyTdProject}>{item.project_name || '—'}</td>
                  {type === 'prospect' && <td style={{...styles.monthlyTd, textAlign: 'center', fontWeight: 600}}>{prob}%</td>}
                  <td style={styles.monthlyTdTotal}>{formatCurrency(itemTotalWeighted)}</td>
                  {months.map(m => {
                    const value = getMonthlyValue(item, m.key);
                    const weightedValue = getWeightedValue(item, value);
                    const isEditing = editingCell?.itemId === item.id && editingCell?.monthKey === m.key;
                    const hasOverride = isOverridden(item, m.key);
                    
                    return (
                      <td 
                        key={m.key} 
                        style={{
                          ...styles.monthlyTd,
                          ...(hasOverride ? styles.monthlyTdOverride : {}),
                          ...(value === 0 ? styles.monthlyTdZero : {})
                        }}
                        onClick={() => handleCellClick(item.id, m.key, value)}
                      >
                        {isEditing ? (
                          <input
                            type="number"
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onBlur={() => handleCellBlur(item)}
                            onKeyDown={e => handleKeyDown(e, item)}
                            style={styles.monthlyInput}
                            autoFocus
                          />
                        ) : (
                          type === 'prospect' && value > 0 
                            ? <span title={`Full: ${formatCurrency(value)}`}>{formatCurrency(weightedValue)}</span>
                            : (value > 0 ? formatCurrency(value) : '—')
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={styles.monthlyTotalRow}>
              <td style={styles.monthlyTdFixed}>Total</td>
              <td style={styles.monthlyTdProject}></td>
              {type === 'prospect' && <td style={styles.monthlyTd}></td>}
              <td style={styles.monthlyTdTotal}>{formatCurrency(type === 'prospect' ? grandTotalWeighted : grandTotal)}</td>
              {months.map(m => (
                <td key={m.key} style={styles.monthlyTdTotal}>{formatCurrency(type === 'prospect' ? columnTotalsWeighted[m.key] : columnTotals[m.key])}</td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      <p style={styles.monthlyHint}>Click any cell to edit. {type === 'prospect' && 'Values shown are weighted by probability. '}Overridden values shown in bold.</p>
    </div>
  );
}

function SettingsPanel({ settings, onSave, formatCurrency }) {
  const [monthlyTargets, setMonthlyTargets] = useState(settings.monthlyTargets || {});
  const [currentStaff, setCurrentStaff] = useState(settings.currentStaff || 0);
  const [plannedHires, setPlannedHires] = useState(settings.plannedHires || {});
  const [freelanceBudget, setFreelanceBudget] = useState(settings.freelanceBudget || {});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMonthlyTargets(settings.monthlyTargets || {});
    setCurrentStaff(settings.currentStaff || 0);
    setPlannedHires(settings.plannedHires || {});
    setFreelanceBudget(settings.freelanceBudget || {});
  }, [settings]);

  const handleSaveAll = async () => {
    setSaving(true);
    await onSave('monthlyTargets', monthlyTargets);
    await onSave('currentStaff', { value: currentStaff });
    await onSave('plannedHires', plannedHires);
    await onSave('freelanceBudget', freelanceBudget);
    setSaving(false);
  };

  const annualTarget = MONTHS.reduce((sum, m) => sum + (monthlyTargets[m.key] || 0), 0);
  const totalHires = MONTHS.reduce((sum, m) => sum + (plannedHires[m.key] || 0), 0);
  const totalFreelanceBudget = MONTHS.reduce((sum, m) => sum + (freelanceBudget[m.key] || 0), 0);

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

        {/* Freelance Budget */}
        <div style={styles.settingsSection}>
          <h3 style={styles.insightTitle}>Monthly Freelance Budget</h3>
          <p style={styles.settingsSubtitle}>Total Annual Budget: {formatCurrency(totalFreelanceBudget)} (at $1,000/day = {(totalFreelanceBudget / FREELANCE_DAY_RATE / WORKING_DAYS_PER_MONTH).toFixed(1)} avg FTEs/month)</p>
          <div style={styles.monthGrid}>
            {MONTHS.map(month => (
              <div key={month.key} style={styles.monthInputGroup}>
                <label style={styles.formLabel}>{month.label}</label>
                <input
                  type="number"
                  value={freelanceBudget[month.key] || ''}
                  onChange={e => setFreelanceBudget({ ...freelanceBudget, [month.key]: Number(e.target.value) || 0 })}
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
  const autoFTE = prospect ? calculateFTE(prospect.budget, prospect.duration) : 0;
  const [form, setForm] = useState(prospect ? { ...prospect, project_name: prospect.project_name || '', work_type: prospect.work_type || '', last_engagement: prospect.last_engagement || new Date().toISOString().split('T')[0], start_date: prospect.start_date || '', duration: prospect.duration || 1, probability: prospect.probability || 50, staffing_fte: prospect.staffing_fte, lead_source: prospect.lead_source || 'new' } : { project_name: '', company: '', contact: '', linkedin: '', title: '', work_type: '', budget: 0, stage: 'Lead', last_engagement: new Date().toISOString().split('T')[0], context: '', start_date: '', duration: 1, probability: 50, staffing_fte: null, lead_source: 'new' });
  const selectedWorkTypes = form.work_type ? form.work_type.split(',').map(t => t.trim()).filter(Boolean) : [];
  const toggleWorkType = (type) => { const newTypes = selectedWorkTypes.includes(type) ? selectedWorkTypes.filter(t => t !== type) : [...selectedWorkTypes, type]; setForm({ ...form, work_type: newTypes.join(',') }); };
  
  const calculatedFTE = calculateFTE(form.budget, form.duration);
  
  const handleSubmit = (e) => { 
    e.preventDefault(); 
    onSave({ 
      ...form, 
      budget: Number(form.budget), 
      duration: Number(form.duration), 
      probability: Number(form.probability), 
      start_date: form.start_date || null,
      staffing_fte: form.staffing_fte !== null && form.staffing_fte !== '' ? Number(form.staffing_fte) : null,
      lead_source: form.lead_source
    }); 
  };

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
          <div style={styles.formGroup}><label style={styles.formLabel}>Project Name</label><input type="text" value={form.project_name || ''} onChange={e => setForm({ ...form, project_name: e.target.value })} placeholder="e.g. Website Redesign" style={styles.input} /></div>
          <div style={styles.formRow}>
            <div style={styles.formGroup}><label style={styles.formLabel}>Contact Name</label><input type="text" value={form.contact} onChange={e => setForm({ ...form, contact: e.target.value })} style={styles.input} required /></div>
            <div style={styles.formGroup}><label style={styles.formLabel}>Title / Role</label><input type="text" value={form.title || ''} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. VP of Engineering" style={styles.input} /></div>
          </div>
          <div style={styles.formGroup}><label style={styles.formLabel}>Company</label><input type="text" value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} style={styles.input} required /></div>
          <div style={styles.formRow}>
            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Work Type</label>
              <div style={styles.workTypeSelector}>
                {WORK_TYPES.map(type => <button key={type} type="button" onClick={() => toggleWorkType(type)} style={{...styles.workTypeButton, ...(selectedWorkTypes.includes(type) ? styles.workTypeButtonActive : {})}}>{type}</button>)}
              </div>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Lead Source</label>
              <div style={styles.workTypeSelector}>
                <button type="button" onClick={() => setForm({ ...form, lead_source: 'new' })} style={{...styles.workTypeButton, ...(form.lead_source === 'new' ? styles.workTypeButtonActive : {})}}>New</button>
                <button type="button" onClick={() => setForm({ ...form, lead_source: 'organic' })} style={{...styles.workTypeButton, ...(form.lead_source === 'organic' ? styles.workTypeButtonActive : {})}}>Organic</button>
              </div>
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
            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Staffing (FTEs) <span style={styles.autoLabel}>Auto: {calculatedFTE.toFixed(1)}</span></label>
              <input type="number" step="0.1" min="0" value={form.staffing_fte !== null ? form.staffing_fte : ''} onChange={e => setForm({ ...form, staffing_fte: e.target.value })} placeholder={calculatedFTE.toFixed(1)} style={styles.input} />
            </div>
            <div style={styles.formGroup}><label style={styles.formLabel}>Stage</label><select value={form.stage} onChange={e => setForm({ ...form, stage: e.target.value })} style={styles.select}>{STAGES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
          </div>
          <div style={styles.formGroup}><label style={styles.formLabel}>Last Engagement</label><input type="date" value={form.last_engagement} onChange={e => setForm({ ...form, last_engagement: e.target.value })} style={styles.input} /></div>
          <div style={styles.formGroup}><label style={styles.formLabel}>Context & Notes</label><textarea value={form.context || ''} onChange={e => setForm({ ...form, context: e.target.value })} style={styles.textarea} rows={3} placeholder="Key interests, how you met, decision-making process, etc." /></div>
          <div style={styles.formActions}><button type="button" onClick={onCancel} style={styles.actionButton}>Cancel</button><button type="submit" style={styles.actionButtonPrimary}>Save</button></div>
        </form>
      </div>
    </div>
  );
}

function ProjectForm({ project, onSave, onCancel }) {
  const [form, setForm] = useState(project ? { ...project, project_name: project.project_name || '', work_type: project.work_type || '', start_date: project.start_date || '', duration: project.duration || 1, status: project.status || 'Active', staffing_fte: project.staffing_fte } : { project_name: '', company: '', contact: '', linkedin: '', title: '', work_type: '', contract_value: 0, start_date: '', duration: 1, status: 'Active', context: '', staffing_fte: null });
  const selectedWorkTypes = form.work_type ? form.work_type.split(',').map(t => t.trim()).filter(Boolean) : [];
  const toggleWorkType = (type) => { const newTypes = selectedWorkTypes.includes(type) ? selectedWorkTypes.filter(t => t !== type) : [...selectedWorkTypes, type]; setForm({ ...form, work_type: newTypes.join(',') }); };
  
  const calculatedFTE = calculateFTE(form.contract_value, form.duration);
  
  const handleSubmit = (e) => { 
    e.preventDefault(); 
    onSave({ 
      ...form, 
      contract_value: Number(form.contract_value), 
      duration: Number(form.duration), 
      start_date: form.start_date || null,
      staffing_fte: form.staffing_fte !== null && form.staffing_fte !== '' ? Number(form.staffing_fte) : null
    }); 
  };

  return (
    <div style={styles.overlay} onClick={onCancel}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <h2 style={styles.modalTitle}>{project ? 'Edit Project' : 'New Project'}</h2>
        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.formGroup}><label style={styles.formLabel}>Project Name</label><input type="text" value={form.project_name || ''} onChange={e => setForm({ ...form, project_name: e.target.value })} placeholder="e.g. Website Redesign" style={styles.input} /></div>
          <div style={styles.formRow}>
            <div style={styles.formGroup}><label style={styles.formLabel}>Company</label><input type="text" value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} style={styles.input} required /></div>
            <div style={styles.formGroup}><label style={styles.formLabel}>Contact Name</label><input type="text" value={form.contact || ''} onChange={e => setForm({ ...form, contact: e.target.value })} style={styles.input} /></div>
          </div>
          <div style={styles.formRow}>
            <div style={styles.formGroup}><label style={styles.formLabel}>Title / Role</label><input type="text" value={form.title || ''} onChange={e => setForm({ ...form, title: e.target.value })} style={styles.input} /></div>
            <div style={styles.formGroup}><label style={styles.formLabel}>LinkedIn</label><input type="url" value={form.linkedin || ''} onChange={e => setForm({ ...form, linkedin: e.target.value })} style={styles.input} /></div>
          </div>
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Work Type</label>
            <div style={styles.workTypeSelector}>
              {WORK_TYPES.map(type => <button key={type} type="button" onClick={() => toggleWorkType(type)} style={{...styles.workTypeButton, ...(selectedWorkTypes.includes(type) ? styles.workTypeButtonActive : {})}}>{type}</button>)}
            </div>
          </div>
          <div style={styles.formDivider} />
          <div style={styles.formRow}>
            <div style={styles.formGroup}><label style={styles.formLabel}>Contract Value</label><input type="number" value={form.contract_value} onChange={e => setForm({ ...form, contract_value: e.target.value })} style={styles.input} /></div>
            <div style={styles.formGroup}><label style={styles.formLabel}>Status</label><select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} style={styles.select}>{PROJECT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
          </div>
          <div style={styles.formRow}>
            <div style={styles.formGroup}><label style={styles.formLabel}>Start Date</label><input type="date" value={form.start_date || ''} onChange={e => setForm({ ...form, start_date: e.target.value })} style={styles.input} /></div>
            <div style={styles.formGroup}><label style={styles.formLabel}>Duration (weeks)</label><input type="number" min="1" value={form.duration} onChange={e => setForm({ ...form, duration: e.target.value })} style={styles.input} /></div>
          </div>
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Staffing (FTEs) <span style={styles.autoLabel}>Auto: {calculatedFTE.toFixed(1)}</span></label>
            <input type="number" step="0.1" min="0" value={form.staffing_fte !== null ? form.staffing_fte : ''} onChange={e => setForm({ ...form, staffing_fte: e.target.value })} placeholder={calculatedFTE.toFixed(1)} style={styles.input} />
          </div>
          <div style={styles.formGroup}><label style={styles.formLabel}>Context & Notes</label><textarea value={form.context || ''} onChange={e => setForm({ ...form, context: e.target.value })} style={styles.textarea} rows={3} /></div>
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
  masterTabs: { display: 'flex', borderBottom: '1px solid #000' },
  masterTab: { padding: '16px 32px', fontSize: '14px', fontWeight: 700, background: 'none', border: 'none', borderBottom: '3px solid transparent', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'inherit', color: '#666' },
  masterTabActive: { color: '#000', borderBottomColor: '#000', backgroundColor: '#f9f9f9' },
  nav: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 32px', borderBottom: '1px solid #ddd' },
  navLinks: { display: 'flex' },
  navLink: { background: 'none', border: 'none', borderBottom: '2px solid transparent', padding: '16px 24px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#666', fontFamily: 'inherit' },
  navLinkActive: { color: '#000', borderBottomColor: '#000' },
  navLabel: { padding: '16px 24px', fontSize: '13px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#000' },
  navActions: { display: 'flex', gap: '12px', alignItems: 'center' },
  actionButton: { padding: '8px 16px', fontSize: '12px', background: 'none', border: '1px solid #000', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'inherit' },
  actionButtonPrimary: { padding: '8px 16px', fontSize: '12px', background: '#000', color: '#fff', border: '1px solid #000', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'inherit' },
  statsBar: { display: 'flex', alignItems: 'center', padding: '20px 32px', borderBottom: '1px solid #ddd', gap: '32px' },
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
  projectionsView: { maxWidth: '1200px' },
  projectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' },
  projectionTitle: { fontSize: '18px', fontWeight: 700, margin: 0 },
  projectionToggle: { display: 'flex', border: '1px solid #000' },
  toggleButton: { padding: '8px 16px', fontSize: '12px', background: 'none', border: 'none', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'inherit' },
  toggleButtonActive: { backgroundColor: '#000', color: '#fff' },
  chartLegend: { display: 'flex', gap: '24px', marginBottom: '16px' },
  legendItem: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' },
  legendColor: { width: '16px', height: '16px' },
  chartContainer: { display: 'flex', gap: '16px', marginBottom: '32px' },
  chartYAxis: { display: 'flex', flexDirection: 'column', justifyContent: 'space-between', fontSize: '11px', color: '#666', textAlign: 'right', paddingBottom: '24px', minWidth: '80px' },
  chart: { flex: 1, display: 'flex', gap: '8px', alignItems: 'flex-end', height: '300px', borderBottom: '1px solid #000', borderLeft: '1px solid #000', paddingLeft: '8px', position: 'relative' },
  chartBar: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', position: 'relative' },
  chartBarStack: { flex: 1, width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' },
  chartBarSegment: { width: '100%', transition: 'height 0.3s' },
  chartBarLabel: { fontSize: '10px', marginTop: '8px', color: '#666' },
  chartBarValue: { fontSize: '9px', color: '#999', marginTop: '2px' },
  targetLine: { position: 'absolute', left: 0, right: 0, height: '2px', backgroundColor: '#c00', zIndex: 10 },
  targetLineLabel: { position: 'absolute', right: '100%', top: '-8px', marginRight: '4px', fontSize: '9px', color: '#c00', fontWeight: 600, whiteSpace: 'nowrap' },
  availableStaffLine: { position: 'absolute', left: 0, right: 0, height: '2px', backgroundColor: '#060', zIndex: 10 },
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
  authText: { fontSize: '13px', color: '#666' },
  // Monthly editable table styles
  monthlyTableContainer: { width: '100%' },
  monthlyTableWrapper: { overflowX: 'auto', border: '1px solid #000' },
  monthlyTable: { width: '100%', borderCollapse: 'collapse', minWidth: '1400px' },
  monthlyTh: { padding: '12px 8px', borderBottom: '2px solid #000', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700, textAlign: 'right', whiteSpace: 'nowrap', backgroundColor: '#f9f9f9' },
  monthlyThFixed: { padding: '12px 16px', borderBottom: '2px solid #000', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700, textAlign: 'left', position: 'sticky', left: 0, backgroundColor: '#f9f9f9', minWidth: '140px', zIndex: 2 },
  monthlyThProject: { padding: '12px 16px', borderBottom: '2px solid #000', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700, textAlign: 'left', backgroundColor: '#f9f9f9', minWidth: '180px' },
  monthlyTd: { padding: '10px 8px', borderBottom: '1px solid #eee', fontSize: '13px', textAlign: 'right', cursor: 'pointer', transition: 'background 0.15s' },
  monthlyTdFixed: { padding: '10px 16px', borderBottom: '1px solid #eee', fontSize: '13px', fontWeight: 500, position: 'sticky', left: 0, backgroundColor: '#fff', minWidth: '140px', zIndex: 1 },
  monthlyTdProject: { padding: '10px 16px', borderBottom: '1px solid #eee', fontSize: '13px', color: '#666', minWidth: '180px' },
  monthlyTdTotal: { padding: '10px 8px', borderBottom: '1px solid #eee', fontSize: '13px', fontWeight: 700, textAlign: 'right', backgroundColor: '#f9f9f9' },
  monthlyTdOverride: { fontWeight: 700, backgroundColor: '#fffde7' },
  monthlyTdZero: { color: '#ccc' },
  monthlyTotalRow: { backgroundColor: '#f0f0f0' },
  monthlyInput: { width: '80px', padding: '4px 8px', fontSize: '13px', border: '2px solid #000', textAlign: 'right', fontFamily: 'inherit', outline: 'none' },
  monthlyHint: { fontSize: '11px', color: '#666', marginTop: '12px', fontStyle: 'italic' },
  // Ops Dashboard Agenda styles
  agendaSection: { marginBottom: '48px', padding: '24px', border: '2px solid #000', backgroundColor: '#f9f9f9' },
  agendaTitle: { fontSize: '20px', fontWeight: 700, marginTop: 0, marginBottom: '24px', textTransform: 'uppercase', letterSpacing: '0.05em' },
  agendaGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '24px' },
  agendaCard: { backgroundColor: '#fff', padding: '20px', border: '1px solid #ddd' },
  agendaCardTitle: { fontSize: '14px', fontWeight: 700, marginTop: 0, marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.05em' },
  agendaItem: { marginBottom: '12px' },
  agendaLabel: { fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' },
  agendaValue: { fontSize: '20px', fontWeight: 700 },
  staffingGapList: { display: 'flex', gap: '16px', marginTop: '4px' },
  staffingGapItem: { fontSize: '14px', fontWeight: 600 },
  // 3-month detail styles
  threeMonthSection: { marginBottom: '48px' },
  threeMonthGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px' },
  threeMonthCard: { padding: '20px', border: '1px solid #000' },
  threeMonthTitle: { fontSize: '16px', fontWeight: 700, marginTop: 0, marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.05em' },
  threeMonthRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' },
  threeMonthLabel: { fontSize: '12px', color: '#666' },
  threeMonthValue: { fontSize: '14px', fontWeight: 500 },
  threeMonthDivider: { height: '1px', backgroundColor: '#ddd', margin: '12px 0' },
  // Small tab button for assumptions
  masterTabSmall: { padding: '8px 12px', border: 'none', background: 'none', fontSize: '14px', fontWeight: 500, cursor: 'pointer', borderBottom: '2px solid transparent', color: '#666' },
  // Assumptions page styles
  assumptionsPage: { maxWidth: '800px', margin: '0 auto' },
  assumptionsTitle: { fontSize: '24px', fontWeight: 700, marginBottom: '32px', textTransform: 'uppercase', letterSpacing: '0.05em' },
  assumptionSection: { marginBottom: '32px', padding: '20px', border: '1px solid #ddd', backgroundColor: '#fafafa' },
  assumptionSectionTitle: { fontSize: '14px', fontWeight: 700, marginTop: 0, marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' },
  assumptionList: { margin: 0, paddingLeft: '20px', lineHeight: '1.8', fontSize: '14px' }
};
