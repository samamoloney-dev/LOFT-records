-- Cabin crew flight records replace "Flight Comments"/"Next Sortie" with
-- three sections: Other Completed Tasks, Development Required, and
-- Homework (Development Required reuses debrief_comments, Homework reuses
-- next_sortie_notes - only Other Completed Tasks needs a new column).
ALTER TABLE flights ADD COLUMN other_completed_tasks TEXT;
