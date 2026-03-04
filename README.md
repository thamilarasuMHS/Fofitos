# Fofitos Recipe Nutrition Calculator & Scoring

Internal tool for nutrition calculation, scoring, and PDF export with RBAC (Admin, Manager, Dietician, Chef).

## Stack

- React, TypeScript, Tailwind CSS, Vite
- Supabase (Auth, Postgres, RLS, Storage)
- PDF export (jsPDF)

## Local Development (PostgreSQL via Supabase Local)

Uses **Supabase local** (Docker) for development — same stack as production, only env vars differ.

### Prerequisites

- Node.js 18+
- Docker Desktop (required for `supabase start`)
- Supabase CLI: `npm install -g supabase` (optional; can use npx)

### Quick Start

1. **Start local Supabase**
   ```bash
   npx supabase start
   ```
   Wait for services. Note the API URL and `anon` key if they differ from defaults.

2. **Apply migrations & seed**
   ```bash
   npx supabase db reset
   ```

3. **Configure env**
   - Copy `.env.example` to `.env`
   - Local defaults: `VITE_SUPABASE_URL=http://127.0.0.1:54321` and the default anon key in `.env.example`
   - If `supabase start` printed different values, use those

4. **Run the app**
   ```bash
   npm run dev
   ```

5. **First admin user**
   - Sign up via the app
   - Open Supabase Studio: http://127.0.0.1:54323
   - Go to Table Editor → `profiles` → set your user’s `role` to `admin`

### npm Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run supabase:start` | Start local Supabase (Docker) |
| `npm run supabase:stop` | Stop local Supabase |
| `npm run supabase:status` | Show local Supabase status |
| `npm run supabase:db:reset` | Reset DB and apply migrations |

### Local Services

- **API**: http://127.0.0.1:54321
- **Studio**: http://127.0.0.1:54323
- **Inbucket** (emails): http://127.0.0.1:54324

## Production (Supabase Cloud)

1. Create a Supabase project at [supabase.com](https://supabase.com)
2. Link and push migrations:
   ```bash
   npx supabase link --project-ref YOUR_PROJECT_REF
   npx supabase db push
   ```
3. Set production env vars in your hosting platform:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

## Build

```bash
npm run build
```

Output: `dist/`
