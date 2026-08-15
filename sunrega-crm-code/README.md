# Sunrega Solar CRM

A single-page CRM built for Sunrega Solar — leads, projects, quotations, and team management for a solar EPC business.

## Features
- **Leads pipeline** — Kanban board across New → Contacted → Survey Scheduled → Quotation Sent → Negotiation → Won/Lost
- **Quotation maker** — builds Basic vs Premium quotations matching Sunrega's format, with print-to-PDF
- **Project execution tracker** — milestones, TAT, and payment schedules
- **Team management**
- **Central database (Supabase)** — connect a free Supabase project so the CRM works from any device, anywhere, with shared live data across your whole team
- **Installable** — add to home screen on any phone for an app-like experience
- **Backup/restore** — export/import all data as JSON

## Setup
1. Open `index.html` in any browser (or host this repo on GitHub Pages / Netlify).
2. Go to **Settings → Central database** and follow the steps to connect a free Supabase project.
3. Share the Supabase Project URL + anon key with your team so everyone syncs to the same data.

## Hosting on GitHub Pages
Settings → Pages → Deploy from branch → `main` → `/ (root)`. The site will be live at:
`https://abhishekarya48-jpg.github.io/sunregaa/`
