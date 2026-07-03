# LOFT Records

Web application for managing LOFT (Line-Oriented Flight Training) records: trainees, syllabus
progress, flight debriefs, Check-to-Line forms, and recurrent/emergency procedures checks.

See `docs/project-brief.md` for the full background and data model this was built from.

## Stack

- **Backend**: Node.js + Express + PostgreSQL (`pg` driver, hand-written SQL migrations)
- **Frontend**: React (Vite)
- **Auth**: email/password (bcrypt) + JWT session cookie

## Getting started

### Backend

```bash
cd backend
cp .env.example .env   # set DATABASE_URL and JWT_SECRET
npm install
npm run migrate
npm run seed
npm run dev             # http://localhost:4000
```

### Frontend

```bash
cd frontend
npm install
npm run dev              # http://localhost:5173
```

The frontend expects the backend at `http://localhost:4000` (see `frontend/.env.example`).

`npm run seed` creates a few staff accounts (HOTC, Examiner, Training Captain, CA Trainer,
CA Checker) all with password `password123`, plus a handful of demo trainees.

### Tests

```bash
cd backend
npm test
```

## Project structure

```
loft-records/
├── backend/         Express API, SQL migrations, seed script, tests
├── frontend/        React (Vite) app
└── docs/            Project brief and data model notes
```

## Deploying

`render.yaml` at the repo root is a [Render Blueprint](https://render.com/docs/blueprint-spec)
that provisions everything this app needs: a Postgres database, the backend as a web
service, and the frontend as a static site.

1. On [Render](https://render.com), **New > Blueprint**, and point it at this repo.
2. Render creates all three resources and asks you to confirm — accept the defaults.
3. Once the backend and frontend both have URLs, set two env vars manually (Render can't
   know these until the other service exists yet):
   - On **loft-records-backend**: set `CORS_ORIGIN` to the frontend's URL (e.g. `https://loft-records-frontend.onrender.com`).
   - On **loft-records-frontend**: set `VITE_API_URL` to the backend's URL, then trigger a manual redeploy of the frontend (Vite bakes env vars in at build time, so this won't take effect until it rebuilds).
4. The backend's start command runs migrations and the seed script automatically, so the
   initial staff logins (see below) exist as soon as it's live — no shell access needed.

The free Postgres and web service tiers work for trying this out, but free web services
spin down when idle — expect a slow first request after inactivity. Upgrade the plan in
`render.yaml` (or in the Render dashboard) once this is more than a demo.

## Roles

| Role | Access |
|---|---|
| HOTC / HOFO / Flight Ops Admin | Full access, including archived records |
| Examiner | Recurrent Sim / Emergency Procedures checks |
| Training Captain | Own flight records only (locked to others once created) |
| CA Trainer | Cabin Attendant records only |
| Trainee | Own syllabus progress, own flights (acknowledge only) |

See `docs/project-brief.md` Section 4 for the full rule set.
