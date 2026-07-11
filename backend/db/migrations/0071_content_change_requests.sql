-- Generic approval queue for curriculum edits made by anyone other than
-- HOTC. When a non-HOTC editor (e.g. the new Cabin Attendant Manager role)
-- creates/updates/deletes a syllabus_items or ground_school_items row, the
-- change is queued here instead of applying immediately - see
-- backend/src/lib/approvals.js. HOTC (or Alternate, who mirrors HOTC access
-- everywhere except the Clearance Form) reviews and approves/rejects it.
CREATE TABLE content_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL CHECK (table_name IN ('syllabus_items', 'ground_school_items')),
  action TEXT NOT NULL CHECK (action IN ('CREATE', 'UPDATE', 'DELETE')),
  item_id UUID,
  proposed_data JSONB,
  previous_data JSONB,
  summary TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by_name TEXT NOT NULL,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by_name TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX content_change_requests_pending ON content_change_requests (status) WHERE status = 'PENDING';
