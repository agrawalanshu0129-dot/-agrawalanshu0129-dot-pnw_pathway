CREATE TABLE IF NOT EXISTS users (
  id              SERIAL PRIMARY KEY,
  email           TEXT UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('student', 'staff', 'supervisor', 'admin')),
  full_name       TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS students (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  population      TEXT NOT NULL CHECK (population IN ('domestic', 'international')),
  program         TEXT NOT NULL,
  country         TEXT,
  funding_type    TEXT,
  onboarded_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS requirement_templates (
  id              SERIAL PRIMARY KEY,
  code            TEXT UNIQUE NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  population      TEXT NOT NULL CHECK (population IN ('domestic', 'international', 'both')),
  funding_types   TEXT[],
  owner_office    TEXT NOT NULL,
  visa_critical   BOOLEAN NOT NULL DEFAULT false,
  days_to_complete INTEGER NOT NULL DEFAULT 30,
  sort_order      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS checklist_items (
  id                  SERIAL PRIMARY KEY,
  student_id          INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  template_id         INTEGER NOT NULL REFERENCES requirement_templates(id),
  status              TEXT NOT NULL DEFAULT 'not_started'
                        CHECK (status IN ('not_started', 'in_progress', 'submitted', 'approved', 'returned')),
  due_date            DATE NOT NULL,
  completed_at        TIMESTAMPTZ,
  reviewer_note       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(student_id, template_id)
);

CREATE TABLE IF NOT EXISTS tasks (
  id              SERIAL PRIMARY KEY,
  student_id      INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  checklist_item_id INTEGER REFERENCES checklist_items(id) ON DELETE CASCADE,
  type            TEXT NOT NULL,
  assignee_role   TEXT NOT NULL DEFAULT 'staff',
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  done_at         TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS assignments (
  id              SERIAL PRIMARY KEY,
  staff_user_id   INTEGER NOT NULL REFERENCES users(id),
  student_id      INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  is_coverage     BOOLEAN NOT NULL DEFAULT false,
  effective_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at        TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS documents (
  id                  SERIAL PRIMARY KEY,
  checklist_item_id   INTEGER NOT NULL REFERENCES checklist_items(id) ON DELETE CASCADE,
  student_id          INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  filename            TEXT NOT NULL,
  mime_type           TEXT NOT NULL,
  size_bytes          INTEGER NOT NULL,
  content             BYTEA NOT NULL,
  uploaded_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id              SERIAL PRIMARY KEY,
  actor_user_id   INTEGER REFERENCES users(id),
  action          TEXT NOT NULL,
  entity          TEXT NOT NULL,
  entity_id       INTEGER,
  detail          JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_checklist_student ON checklist_items(student_id);
CREATE INDEX IF NOT EXISTS idx_checklist_due ON checklist_items(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_documents_checklist_item ON documents(checklist_item_id);

-- City-life module: audit trail for the web-search-enabled assistant,
-- separate from the admissions assistant's audit rows (both share
-- audit_log, distinguished by action = 'city_assistant_query').
-- No new table needed beyond audit_log; kept here as a schema note.
