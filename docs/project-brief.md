# LOFT Training Records System — Project Brief

**Purpose:** Replace paper-based LOFT (Line-Oriented Flight Training) records with a
secure, role-based web application. This document is the starting brief for building
the real, persistent version of the prototype developed in Claude chat.

---

## 1. Tech Stack Recommendation

| Layer | Suggestion | Why |
|---|---|---|
| Frontend | React (or keep it simple with server-rendered HTML if preferred) | Matches the existing prototype's component structure |
| Backend | Node.js (Express or Fastify) | Straightforward to pair with Claude Code, good ecosystem |
| Database | PostgreSQL | Relational data (trainees → flights → checks), needs integrity and audit trail |
| Auth | Email/password with hashed credentials (bcrypt) + session tokens, or SSO if your organisation has one | Replaces the demo PIN system |
| Hosting | Vercel/Render (app) + managed Postgres (Supabase, Neon, or RDS) | Low-maintenance, reliable backups |

*Claude Code can help you pick and swap any of these — this is a starting point, not fixed.*

---

## 2. Project Structure (proposed)

```
loft-records/
├── backend/
│   ├── src/
│   │   ├── routes/          # trainees, flights, checks, staff, auth
│   │   ├── models/          # DB schema/ORM models
│   │   ├── middleware/       # auth, role permission checks
│   │   └── server.js
│   ├── migrations/           # DB schema versioning
│   └── tests/
├── frontend/
│   ├── src/
│   │   ├── pages/            # Trainee list, Syllabus, Flights, CTL, Checks, Archive, Staff
│   │   ├── components/
│   │   └── api/               # calls to backend
│   └── tests/
├── docs/
│   └── data-model.md          # this document's data model section, expanded
└── README.md
```

---

## 3. Core Data Model

### `users` (staff/access accounts)
| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| name | text | |
| role | enum | HOTC, HOFO, Flight Ops Admin, Examiner, Training Captain, CA Trainer, CC |
| fleet_access | enum/array | Dash 8, Fokker 100, Metro 23, All (role-dependent) |
| email | text | login |
| password_hash | text | |
| created_at | timestamp | |

### `trainees`
| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| first_name / last_name | text | |
| type | enum | Pilot / Cabin Attendant |
| role | enum | Captain, First Officer, Cabin Attendant |
| fleet | enum | Dash 8, Fokker 100, Metro 23, CA–Dash 8, CA–Fokker 100 |
| phase | enum | current syllabus phase |
| archived | boolean | set true on CTL completion |
| archived_at | timestamp | |

### `syllabus_items`
| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| fleet | enum | |
| role_scope | enum | Captain-only, FO-only, Both |
| phase | integer | 1, 2, 3 |
| description | text | |
| required | boolean | drives the "what's required to complete this phase" indicator |

### `syllabus_progress`
| trainee_id | syllabus_item_id | completed_at | signed_off_by |

### `flights` (LOFT flight records)
| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| trainee_id | uuid | FK |
| training_captain_id | uuid | FK — only this user may edit |
| date | date | |
| sector_details | jsonb | |
| loft_performance_rating | text | |
| debrief_comments | text | |
| locked | boolean | true once TC finalises |
| acknowledged_by_trainee | boolean | |
| acknowledged_at | timestamp | |
| hours | numeric | feeds the running total |

### `check_to_line_forms` (CTL)
| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| trainee_id | uuid | FK, one-to-one with archiving |
| fleet | enum | |
| sector_details | jsonb | |
| assessment_items | jsonb | per-fleet checklist, ✓/✗ only (no N/A per your last change) |
| approaches | jsonb | up to 2, with type |
| overall_result | enum | Pass / Fail |
| overall_score | integer | 1–5 |
| assessor_signature / candidate_signature | text/image | |
| completed_at | timestamp | triggers archive |

### `checks` (Recurrent Sim + Emergency Procedures)
| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| trainee_id (or staff_id) | uuid | recurrent checks apply to qualified line staff, not just trainees |
| check_type | enum | Recurrent Simulator, Emergency Procedures |
| fleet | enum | Dash 8, Fokker 100, Metro 23 — Recurrent Sim is fleet-specific |
| applies_to | enum | Pilot / Cabin Attendant — Emergency Procedures has separate pilot/CA forms |
| due_date | date | for due-date tracking |
| completed_at | timestamp | |
| result | text | |
| completed_by | uuid | FK to users (HOTC/HOFO/Flight Ops Admin/Examiner) |

### `audit_log`
| id | user_id | action | target_table | target_id | timestamp |

---

## 4. Role & Access Rules (carried over from the prototype)

- **Training Captain**: can only edit flight records where they are the named TC. Not even HOTC can override this lock.
- **Trainee**: can acknowledge their own flight debrief (checkbox + timestamp, then locked).
- **HOTC / HOFO / Alternate / Examiner**: can access and complete Recurrent Sim and Emergency Procedures checks.
- **Flight Ops Admin**: cannot conduct any checking (excluded from every check type, Ground Instructor Competency Check, and survey fill) - retains every other admin capability (archiving, editing records, assigning checks, etc).
- **Emergency Procedures checkAccess tick (Staff page)**: means that staff member can teach and check the Emergency Procedures course for both pilots and cabin attendants.
- **CA Trainer**: manages Cabin Attendant records only, cannot create/view Pilot records.
- **Archived records**: visible only to HOTC, HOFO, Flight Ops Admin.

---

## 5. Known Fixes Carried Over From Prototype Feedback
These were mid-fix in the last chat — worth confirming they're addressed in the real build:
- Syllabus tab should show what's required to complete each phase.
- Acknowledging a flight must not erase flight data.
- Selecting a LOFT performance rating must not erase flight data.
- Running total hours should accumulate automatically per trainee.
- CTL form: remove non-technical skills (NTS) scoring section.
- CTL form: fix checkboxes (✓/✗ not registering).
- CTL form: remove N/A / not-assessed option — binary only.

---

## 6. Open Questions to Confirm Before/During Build
- Does your organisation have an existing SSO/identity provider, or should this use standalone email/password accounts?
- Any regulatory retention period for training/check records (affects backup/archival policy)?
- Should there be email/notification alerts for upcoming due dates on Recurrent/Emergency checks?
- Any requirement for exporting records to PDF for regulator audits (beyond the existing CTL text export)?

---

## 7. Suggested First Steps in Claude Code
1. Scaffold backend + Postgres schema from Section 3.
2. Build auth and role middleware (Section 4).
3. Recreate the frontend screens from the prototype, wired to real API calls instead of in-memory state.
4. Migrate the fixes in Section 5 as you build, rather than porting the bugs forward.
5. Seed a small test dataset (a few trainees across fleets) to validate flows end-to-end before going live.
