# PNW Pathway

A student journey and requirements tracking platform for Pacific Northwest University, built as the working prototype for the ITEC 6993 IT Capstone: Applied Technology Solutions.

PNW Pathway replaces the fragmented spreadsheet-and-email process admitted students go through with a single personalized checklist (domestic and international tracks), a visual journey roadmap showing what's next and its ETA, a staff dashboard with an at-risk queue, an admissions AI assistant that answers requirement questions strictly from approved university documentation, and a "Settling In" module (cost of living, neighborhoods, transit, a budget calculator, and a second, web-search-enabled assistant) for students getting oriented to Everett, WA.

**Live demo:** _add your deployed Vercel URL here once deployed_
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

This mirrors the full target architecture from the capstone's architecture deliverable (Cognito → JWT auth, RDS → Neon Postgres, S3 document store → simplified to metadata-only for the prototype, SES → simplified to no-op for the prototype). The swap points are isolated so upgrading to the full AWS services later does not require a redesign.

## Functional Requirements Implemented

| ID | Requirement | Where |
|----|---|---|
| FR1 | Students create accounts and log in | `backend/src/routes/auth.js` |
| FR2 | Personalized checklist generated from profile via config-driven rules | `backend/src/rulesEngine.js`, `backend/src/seed/requirementTemplates.js` |
| FR3 | Students see and update item status | `backend/src/routes/students.js` (`GET/PATCH /me/checklist`) |
| FR4 | Tasks/at-risk flags generated from triggers | `backend/src/atRisk.js`, applied live in the dashboard |
| FR5 | Reminders | Deadline countdown surfaced in the student UI (email delivery simplified for the prototype, see Known Limitations) |
| FR6 | Staff dashboard, filterable, with at-risk queue | `backend/src/routes/dashboard.js`, `frontend/src/pages/StaffDashboardPage.jsx` |
| FR7 | Staff approve/return submissions | `backend/src/routes/students.js` (`PATCH /:studentId/checklist/:itemId/review`) |
| FR10 | AI assistant, approved-docs-only, cites sources, escalates | `backend/src/routes/ai.js`, `backend/src/ai/docs.js` |
| NFR1 | RBAC + JWT auth | `backend/src/middleware/auth.js` |
| NFR2 | Audit logging | `audit_log` table, written on every mutating action (including both assistants) |
| NFR6 | Requirement rules are configuration, not code | `requirement_templates` table; edit rows, no redeploy needed |
| NFR8 | AI safety: approved sources only, cites, escalates | `backend/src/routes/ai.js` |

**Added beyond the original scope**, at the client's later request:

| Feature | Where |
|---|---|
| Journey roadmap: what's next, and its ETA | `backend/src/routes/students.js` (roadmap computed from `sort_order`), `frontend/src/components/RoadmapView.jsx` |
| City Life module: cost of living, neighborhoods, transit, budget calculator | `backend/src/city/cityDocs.js`, `backend/src/routes/city.js`, `frontend/src/pages/CityLifePage.jsx` |
| City Life assistant with live web search | `backend/src/routes/city.js` (`POST /api/city/ask`) |

These were added mid-course, after the Week 4 feature freeze in the project plan. Documented here rather than silently absorbed into the original FR list, since a capstone's process record should reflect what actually happened.

FR8/FR9 (caseload reassignment, vacation coverage) and FR11 (admin console UI) are schema-ready (`assignments` table exists) but not yet wired to routes/UI — see Known Limitations.

## Repository Structure

```
pnw-pathway/
├── backend/           Express API
│   ├── db/schema.sql  Postgres schema (auto-applied on server start)
│   └── src/
│       ├── rulesEngine.js   FR2: profile -> checklist
│       ├── atRisk.js        FR4/FR6: at-risk detection
│       ├── ai/docs.js       FR10: approved document set + retrieval
│       ├── routes/          auth, students, dashboard, ai
│       ├── middleware/auth.js
│       └── seed/            demo data
├── frontend/          React app
│   └── src/
│       ├── pages/      Login, Onboarding, StudentChecklist, StaffDashboard
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
3. In the service's Environment tab, set `DATABASE_URL` to your Neon connection string and `PGSSL=true`. `JWT_SECRET` is auto-generated by the blueprint.
4. Deploy. First deploy also creates the schema automatically on boot.
5. Run the seed once, from the Render Shell tab: `npm run seed`.
6. Note the service URL, e.g. `https://pnw-pathway-api.onrender.com`.

**3. Frontend — Vercel**
1. Create a free account at vercel.com, connect this GitHub repo, root directory `frontend`.
2. Add an environment variable `VITE_API_URL` = your Render backend URL from step 2.6.
3. Deploy. Vercel gives you a `.vercel.app` URL — that's the link to share.

**A note on the free tier:** Render's free web service sleeps after 15 minutes of no traffic. The first request after sleeping takes 30-60 seconds to wake up; the UI shows a loading state during this, it is not broken. Neon's database similarly scales to zero when idle and wakes automatically on the next query.

## Demo Accounts

Password for all: `Demo1234!`

| Role | Email | Notes |
|---|---|---|
| Staff (ISS) | staff@pnwu.edu | Full dashboard + at-risk queue |
| Admin | admin@pnwu.edu | Same dashboard access as staff in this prototype |
| Student (int'l, self-funded) | student.intl@pnwu.edu | Priya Sharma, 10-item checklist including visa-critical items |
| Student (int'l, sponsored) | student.intl2@pnwu.edu | Wei Chen, sponsor-letter track instead of bank statement |
| Student (domestic) | student.domestic@pnwu.edu | Jordan Miller, 6-item checklist, no visa-critical items |

Or register a new student account from the login screen to see onboarding and checklist generation from scratch.

## Known Limitations (prototype scope)

These are deliberate scope decisions for a capstone prototype on free-tier infrastructure, documented here rather than hidden:

- **Document uploads are metadata-only.** Students mark items "submitted"; no actual file bytes are stored (S3 in the target architecture). Adding real uploads is an additive change (one route + a storage bucket), not a redesign.
- **Email reminders are not sent.** The due-date logic and UI countdown are real; wiring to an actual email provider (SES in the target architecture) was left out to keep the prototype free-tier and dependency-free. `backend/src/atRisk.js` already computes exactly who should be notified and why.
- **Caseload reassignment and vacation coverage (FR8/FR9)** have a schema (`assignments` table) but no route/UI yet.
- **AI assistant retrieval** uses keyword matching, not vector embeddings, to avoid a paid embeddings API. The interface (`retrieve(query, topK)` in `backend/src/ai/docs.js` and `backend/src/city/cityDocs.js`) is designed to be swapped for real embedding search without touching the routes.
- **City Life content covers Everett, WA only.** The data model (`backend/src/city/cityDocs.js`) is a flat curated set for one city; a multi-campus version would need this keyed by campus/city.
- **City Life web search costs money at scale.** Each query with `ANTHROPIC_API_KEY` set makes a live API call with web search enabled. Fine for a demo or small pilot; a production deployment would want caching and/or rate limiting per user.

## License

Student capstone project. Not affiliated with a real university system; "Pacific Northwest University" is a fictional client used for this coursework.
