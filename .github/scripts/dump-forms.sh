#!/usr/bin/env bash
# Temporary: prints what the shared check-form catalogue contains on a freshly
# migrated database, as workflow annotations, so Part 135 content can be
# written against the real structure. Read-only.
set -u
Q() { psql "$DATABASE_URL" -At -F ' | ' -c "$1"; }
join() { awk 'BEGIN{ORS="%0A"}1'; }
echo "::notice title=forms-summary::$(Q "SELECT form_key, COALESCE(fleet::text,'-'), kind, ipc_only, count(*) FROM check_form_items WHERE archived = false AND syllabus_id IS NULL GROUP BY 1,2,3,4 ORDER BY 1,2,3,4" | join)"
n=0
for k in $(Q "SELECT DISTINCT form_key FROM check_form_items WHERE archived = false AND syllabus_id IS NULL ORDER BY 1"); do
  n=$((n+1))
  body=$(Q "SELECT COALESCE(fleet::text,'-'), COALESCE(section,'-'), kind, ipc_only, description, COALESCE(mos,'') FROM check_form_items WHERE form_key = '$k' AND archived = false AND syllabus_id IS NULL ORDER BY fleet NULLS FIRST, sort_order" | join | cut -c1-7000)
  echo "::notice title=form-$k::$body"
done
