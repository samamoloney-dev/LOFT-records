-- DASH_8 / FOKKER_100 mean a pilot (and the aircraft type); CA_DASH_8 /
-- CA_FOKKER_100 mean a cabin attendant rated on it. Some cabin attendant crew
-- records were stored under the plain pilot values, so a Dash 8 filter picked
-- up cabin crew while a Cabin Dash 8 filter missed most of them. Convert
-- those records, keeping fleet order and dropping any duplicate.
UPDATE crew_members cm
SET fleets = ARRAY(
  SELECT m.f
  FROM (
    SELECT
      CASE u.f
        WHEN 'DASH_8' THEN 'CA_DASH_8'::fleet
        WHEN 'FOKKER_100' THEN 'CA_FOKKER_100'::fleet
        ELSE u.f
      END AS f,
      MIN(u.ord) AS ord
    FROM unnest(cm.fleets) WITH ORDINALITY AS u(f, ord)
    GROUP BY 1
  ) m
  ORDER BY m.ord
)
WHERE cm.type = 'CABIN_ATTENDANT'
  AND cm.fleets && ARRAY['DASH_8', 'FOKKER_100']::fleet[];
