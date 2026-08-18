# PNW Pathway

A student journey and requirements tracking platform for Pacific Northwest University, built as the working prototype for the ITEC 6993 IT Capstone: Applied Technology Solutions.

PNW Pathway replaces the fragmented spreadsheet-and-email process admitted students go through with a single personalized checklist (domestic and international tracks), a visual journey roadmap showing what's next and its ETA, a staff dashboard with an at-risk queue, an admissions AI assistant that answers requirement questions strictly from approved university documentation, and a "Settling In" module (cost of living, neighborhoods, transit, a budget calculator, and a second, web-search-enabled assistant) for students getting oriented to Everett, WA.

**Live demo:** https://agrawalanshu0129-dot-pnw-pathway.vercel.app/
**Demo accounts:** see [Demo accounts](#demo-accounts) below.

---

## Architecture

```
React (Vite) ──HTTPS──> Node/Express API ──> PostgreSQL (Neon)
   [Vercel]                 [Render]
```

- **Frontend:** React 18 + Vite, no external UI framework, deployed as a static site on Vercel.
- **Backend:** Node.js + Express REST API, deployed as a free web service on Render.
- **Database:** PostgreSQL, hosted on Neon's permanent free tier (chosen specifically because Render's free Postgres auto-deletes after 30 days, which would silently break this project after submission).
- **Auth:** JWT + bcrypt, role-based access control (student / staff / supervisor / admin) enforced in middleware.
- **Admissions AI assistant:** Retrieval over an approved-document set only (`backend/src/routes/ai.js`). Runs in a zero-cost citation-only fallback mode by default; if `ANTHROPIC_API_KEY` is set, it generates natural-language answers from the same retrieved passages. Deliberately never uses live web search: visa/requirements answers carry real consequences (NFR8), so this assistant is restricted to vetted content.
- **City Life assistant:** A second, separate assistant (`backend/src/routes/city.js`) for lower-stakes settling-in questions (cost of living, housing, transit, budgeting). When `ANTHROPIC_API_KEY` is set, it's allowed to use Anthropic's `web_search` tool for current information; with no key, it falls back to curated, hand-verified Everett, WA content at zero cost. Kept fully separate from the admissions assistant on purpose, so enabling web search here can never affect the safety behavior of the visa/requirements assistant.
- **Immigration/visa News (`backend/src/routes/news.js`):** treated with the same care as the admissions assistant (NFR8), not the City Life assistant, because a wrong or overconfident answer about visa policy has real consequences. When `ANTHROPIC_API_KEY` is set, web search is restricted to a fixed allowlist of official domains (USCIS, the State Department, ICE/SEVP, Study in the States, Department of Education) via the `web_search` tool's `allowed_domains`; the model is instructed to report only what changed and who it may be relevant to, never a personalized "this helps/harms you" verdict, and every response carries a non-legal-advice disclaimer pointing to ISS or an immigration attorney. Results are cached for 12 hours behind a shared cache (not per-user), so the whole deployment costs at most ~2 LLM calls/day regardless of traffic. With no key, it shows static guidance pointing directly at those same official sources rather than fabricating time-sensitive content.

This mirrors the full target architecture from the capstone's architecture deliverable (Cognito → JWT auth, RDS → Neon Postgres, S3 document store → simplified to metadata-only for the prototype, SES → simplified to no-op for the prototype). The swap points are isolated so upgrading to the full AWS services later does not require a redesign.

## Functional Requirements Implemented

| ID | Requirement | Where |
|----|---|---|
| FR1 | Students create accounts and log in | `backend/src/routes/auth.js`, including self-service password reset (`POST /forgot-password`, `POST /reset-password`) |
| FR2 | Personalized checklist generated from profile via config-driven rules | `backend/src/rulesEngine.js`, `backend/src/seed/requirementTemplates.js` |
| FR3 | Students see and update item status | `backend/src/routes/students.js` (`GET/PATCH /me/checklist`) |
| FR4 | Tasks/at-risk flags generated from triggers | `backend/src/atRisk.js`, applied live in the dashboard |
| FR5 | Reminders | Deadline countdown in the student UI, plus staff-triggered reminder emails (`backend/src/routes/dashboard.js` `POST /remind`, `backend/src/email.js`) |
| FR6 | Staff dashboard, filterable, with at-risk queue | `backend/src/routes/dashboard.js`, `frontend/src/pages/StaffDashboardPage.jsx` |
| FR7 | Staff approve/return submissions | `backend/src/routes/students.js` (`PATCH /:studentId/checklist/:itemId/review`), `frontend/src/pages/StudentDetailPage.jsx` (click a student row on the dashboard) |
| FR8 | Caseload assignment (which staff member owns which student) | `backend/src/routes/assignments.js`, `frontend/src/pages/AdminConsolePage.jsx` (Caseload & Coverage) |
| FR9 | Vacation coverage: bulk-reassign a staff member's caseload | `backend/src/routes/assignments.js` (`POST /reassign`) |
| FR10 | AI assistant, approved-docs-only, cites sources, escalates | `backend/src/routes/ai.js`, `backend/src/ai/docs.js` |
| FR11 | Admin console: create/manage staff, supervisor, and admin accounts | `backend/src/routes/admin.js`, `frontend/src/pages/AdminConsolePage.jsx` (Staff Accounts) |
| NFR1 | RBAC + JWT auth | `backend/src/middleware/auth.js` |
| NFR2 | Audit logging | `audit_log` table, written on every mutating action (including both assistants); viewable by admins at Admin Console → Audit Log (`GET /api/admin/audit-log`) |
| NFR6 | Requirement rules are configuration, not code | `requirement_templates` table; edit rows, no redeploy needed |
| NFR8 | AI safety: approved sources only, cites, escalates | `backend/src/routes/ai.js` |

**Added beyond the original scope**, at the client's later request:

| Feature | Where |
|---|---|
| Journey roadmap: what's next, and its ETA | `backend/src/routes/students.js` (roadmap computed from `sort_order`), `frontend/src/components/RoadmapView.jsx` |
| City Life module: cost of living, neighborhoods, transit, budget calculator | `backend/src/city/cityDocs.js`, `backend/src/routes/city.js`, `frontend/src/pages/CityLifePage.jsx` |
| City Life assistant with live web search | `backend/src/routes/city.js` (`POST /api/city/ask`) |
| Real document uploads (passport, financial docs, etc.) | `backend/src/routes/students.js` (`POST/GET .../document`), stored as `bytea` in Postgres — no paid object-storage bucket required |
| Student dashboard: visual urgency breakdown (overdue/due-soon/on-track) + a prioritized "needs attention" list | `frontend/src/pages/StudentDashboardPage.jsx` — pure client-side view over the existing checklist data, no new endpoint |
| Immigration/visa News tab | `backend/src/routes/news.js`, `frontend/src/pages/NewsPage.jsx` — see the dedicated note below, this one has real safety framing baked in |

These were added mid-course, after the Week 4 feature freeze in the project plan. Documented here rather than silently absorbed into the original FR list, since a capstone's process record should reflect what actually happened.

**Role summary:** `staff` manage their own caseload; `supervisor` and `admin` manage everyone's caseload and can reassign it for vacation coverage; `admin` additionally manages staff/supervisor/admin accounts (student accounts remain self-service via registration).

## Repository Structure

```
pnw-pathway/
├── backend/           Express API
│   ├── db/schema.sql  Postgres schema (auto-applied on server start)
│   └── src/
│       ├── rulesEngine.js   FR2: profile -> checklist
│       ├── atRisk.js        FR4/FR6: at-risk detection
│       ├── ai/docs.js       FR10: approved document set + retrieval
│       ├── email.js         FR5: optional reminder email (Resend HTTP API)
│       ├── routes/          auth, students, dashboard, ai, assignments (FR8/FR9), admin (FR11)
│       ├── middleware/auth.js
│       └── seed/            demo data
├── frontend/          React app
│   └── src/
│       ├── pages/      Login, Onboarding, StudentChecklist, StudentDetail, StaffDashboard, AdminConsole
│       └── components/ AssistantWidget
├── render.yaml         Render deployment blueprint (backend)
└── frontend/vercel.json  Vercel deployment config (frontend)
```

## Local Development

Requires Node 18+ and a local PostgreSQL instance.

```bash
# 1. Database
createdb pnw_pathway

# 2. Backend
cd backend
cp .env.example .env        # edit DATABASE_URL if needed
npm install
npm run seed                # creates requirement templates + demo users
npm run dev                 # http://localhost:4000

# 3. Frontend (new terminal)
cd frontend
npm install
npm run dev                 # http://localhost:5173
```

## Deployment (free tier)

**1. Database — Neon**
1. Create a free account at neon.tech (no credit card).
2. Create a project, copy the connection string.

**2. Backend — Render**
1. Create a free account at render.com, connect this GitHub repo.
2. New → Blueprint → select this repo (Render reads `render.yaml` automatically), or create a Web Service manually with root directory `backend`.
3. In the service's Environment tab, set `DATABASE_URL` to your Neon connection string and `PGSSL=true`. `JWT_SECRET` is auto-generated by the blueprint. Optionally set `ANTHROPIC_API_KEY` (enables the LLM-generated assistant answers and City Life web search) and/or `RESEND_API_KEY` (enables real reminder emails) — both are zero-cost, zero-setup fallbacks when left unset.
4. Deploy. First deploy also creates the schema automatically on boot.
5. Seed the database: Render's free plan has no Shell/One-Off Jobs access, so `npm run seed` can't be run manually there. Instead, set `RUN_SEED_ON_BOOT=true` in the Environment tab (triggers a redeploy that seeds automatically), then unset it once you see "Seed complete" in the Logs tab — the seed is upsert-only, so it's harmless to leave on, but there's no reason to keep re-running it. (If you're on a paid plan with Shell access, `npm run seed` from the Shell tab works too.)
6. Note the service URL, e.g. `https://pnw-pathway-api.onrender.com`.

**3. Frontend — Vercel**
1. Create a free account at vercel.com, connect this GitHub repo, root directory `frontend`.
2. Add an environment variable `VITE_API_URL` = your Render backend URL from step 2.6.
3. Deploy. Vercel gives you a `.vercel.app` URL — that's the link to share.

**A note on the free tier:** Render's free web service sleeps after 15 minutes of no traffic. The first request after sleeping takes 30-60 seconds to wake up; the UI shows a loading state during this, it is not broken. Neon's database similarly scales to zero when idle and wakes automatically on the next query.

## CI/CD

- GitHub Actions workflow: `.github/workflows/ci.yml`
  - Runs backend install + unit tests (`npm test`)
  - Runs frontend install + production build (`npm run build`)
- Vercel continues to provide automatic preview/production deployments from GitHub pushes on the frontend app.

## Demo Accounts

Password for all: `Demo1234!`

| Role | Email | Notes |
|---|---|---|
| Staff (ISS) | staff@pnwu.edu | Dashboard + at-risk queue, own caseload only |
| Supervisor | supervisor@pnwu.edu | Dashboard for all students, Caseload &amp; Coverage (assign/reassign) |
| Admin | admin@pnwu.edu | Everything supervisor has, plus Admin Console (create/manage staff accounts) |
| Student (int'l, self-funded) | student.intl@pnwu.edu | Priya Sharma, 10-item checklist including visa-critical items |
| Student (int'l, sponsored) | student.intl2@pnwu.edu | Wei Chen, sponsor-letter track instead of bank statement |
| Student (domestic) | student.domestic@pnwu.edu | Jordan Miller, 6-item checklist, no visa-critical items |

Or register a new student account from the login screen to see onboarding and checklist generation from scratch.

## Known Limitations (prototype scope)

These are deliberate scope decisions for a capstone prototype on free-tier infrastructure, documented here rather than hidden:

- **Document uploads are stored in Postgres, not object storage.** Files (PDF/PNG/JPG, up to 5MB) are stored as `bytea` rows rather than in S3, to avoid a paid bucket dependency for the prototype. Fine at capstone/pilot scale; a production deployment with many large files would want to move to real object storage (the upload/download routes in `backend/src/routes/students.js` are the only place that would need to change).
- **Email (reminders and password-reset links) uses the same optional-key pattern as the AI assistants.** `backend/src/email.js` sends real email via Resend's HTTP API when `RESEND_API_KEY` is set; with no key, it logs what would have been sent instead (zero cost, zero setup) -- which means self-service password reset only actually delivers once that key is configured; until then the reset link is visible in the server logs. Staff trigger reminder sends manually from the At-Risk Queue (`POST /api/dashboard/remind`) rather than on an automatic schedule, since the prototype has no background job runner.
- **AI assistant retrieval** uses keyword matching, not vector embeddings, to avoid a paid embeddings API. The interface (`retrieve(query, topK)` in `backend/src/ai/docs.js` and `backend/src/city/cityDocs.js`) is designed to be swapped for real embedding search without touching the routes.
- **City Life content covers Everett, WA only.** The data model (`backend/src/city/cityDocs.js`) is a flat curated set for one city; a multi-campus version would need this keyed by campus/city.
- **City Life web search is rate-limited, not cached.** Each query with `ANTHROPIC_API_KEY` set makes a live API call with web search enabled; capped at 20 live queries per user per day (`backend/src/routes/city.js`, tracked via `audit_log`) to bound cost, degrading gracefully to the free curated fallback once over the limit rather than erroring. A production deployment at real scale would additionally want response caching.

## License

Student capstone project. Not affiliated with a real university system; "Pacific Northwest University" is a fictional client used for this coursework.
