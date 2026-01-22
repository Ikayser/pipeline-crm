# Pipeline — Business Tracker (with Supabase)

A minimal, Swiss design-inspired CRM with cloud sync and user authentication.

## Features

- **User authentication**: Sign up / sign in with email
- **Cloud sync**: Data stored in Supabase (PostgreSQL)
- **Row-level security**: Each user only sees their own data
- **Pipeline view**: Kanban board with 6 conversion stages
- **List view**: Sortable table of all prospects
- **Insights**: Pipeline analytics and follow-up reminders
- **Engagement tracking**: Log calls, emails, meetings, LinkedIn touches
- **Import/Export**: CSV import (including LinkedIn exports) and export

## Setup

Your Supabase project is already configured. Just deploy!

## Deploy to Vercel

1. Push this folder to GitHub
2. Go to [vercel.com](https://vercel.com) → Import your repo
3. Deploy

## Run Locally

```bash
npm install
npm run dev
```

## Adding Team Members

1. Have them visit your deployed app URL
2. They click "Sign Up" and create an account
3. They'll have their own private prospect list

## Sharing Data Between Team Members (Future)

Currently, each user has their own private data. To share data across a team, you'd need to:

1. Add a `team_id` column to the prospects table
2. Update the Row Level Security policies
3. Add team invite functionality

Let me know if you'd like help implementing team sharing!

---

Built with React + Vite + Supabase
