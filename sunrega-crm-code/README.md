# Sunrega Solar CRM — React + Supabase

The original single-file prototype has been migrated to a Vite/React application. It includes a dashboard, lead pipeline, project tracker, quotations, team management, responsive forms, Supabase CRUD, Realtime refreshes, and a localStorage fallback for development.

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

The app works without environment variables in local demo mode. To enable shared cloud data:

1. Create a project at Supabase.
2. Run `supabase/schema.sql` in its SQL Editor.
3. Put the project URL and public anon key in `.env.local`.
4. Restart the dev server.

Never expose a Supabase `service_role` key in this frontend. The included RLS policies are deliberately open for a prototype; add Supabase Auth and organization-scoped policies before a public production launch.

## Commands

- `npm run dev` — local development server
- `npm run build` — production build
- `npm run preview` — preview the production build
