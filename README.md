# Pipeline — Business Tracker

A minimal, Swiss design-inspired CRM for tracking prospects, engagements, and pipeline value.

## Features

- **Pipeline view**: Kanban board with 6 conversion stages
- **List view**: Sortable table of all prospects
- **Insights**: Pipeline analytics and follow-up reminders
- **Engagement tracking**: Log calls, emails, meetings, LinkedIn touches
- **Import/Export**: CSV import (including LinkedIn exports) and export
- **Persistent storage**: Data saved in browser localStorage

## Deploy to Vercel (Recommended)

### Option A: Deploy via GitHub

1. Push this folder to a GitHub repository
2. Go to [vercel.com](https://vercel.com) and sign in with GitHub
3. Click "New Project" → Import your repository
4. Vercel auto-detects Vite — just click "Deploy"
5. Your app is live at `https://your-project.vercel.app`

### Option B: Deploy via CLI

```bash
# Install Vercel CLI
npm install -g vercel

# From this directory, run:
vercel

# Follow the prompts — done!
```

## Deploy to Netlify

1. Push this folder to a GitHub repository
2. Go to [netlify.com](https://netlify.com) and sign in
3. Click "Add new site" → "Import an existing project"
4. Connect your repo, set build command to `npm run build` and publish directory to `dist`
5. Click "Deploy"

## Run Locally

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build
```

## Importing LinkedIn Contacts

1. Go to LinkedIn → Settings → Data Privacy → Get a copy of your data
2. Request your connections data (CSV format)
3. In the app, click "Import CSV" and select the downloaded file
4. Contacts will be added as new leads

## Data Storage

Data is stored in your browser's localStorage. To sync across devices, you'd need to add a backend (Supabase, Firebase, etc.) — let me know if you'd like help with that.

---

Built with React + Vite
