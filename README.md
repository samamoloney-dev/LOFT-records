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

## Roles

| Role | Access |
|---|---|
| HOTC / HOFO / Flight Ops Admin | Full access, including archived records |
| Examiner | Recurrent Sim / Emergency Procedures checks |
| Training Captain | Own flight records only (locked to others once created) |
| CA Trainer | Cabin Attendant records only |
| Trainee | Own syllabus progress, own flights (acknowledge only) |

See `docs/project-brief.md` Section 4 for the full rule set.
