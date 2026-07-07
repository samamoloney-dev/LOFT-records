-- Medical is important enough to want at the top of the competency list
-- (Crew profile > Dates tab), alongside EP/IPC/PC/Line Check rather than
-- buried after Dangerous Goods etc. Purely a display-order change - shifts
-- every other type's sort_order up by one to make room at 0.
UPDATE competency_types SET sort_order = sort_order + 1 WHERE name != 'Medical';
UPDATE competency_types SET sort_order = 0 WHERE name = 'Medical';
