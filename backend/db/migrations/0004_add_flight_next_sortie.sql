-- "Next Sortie" is a distinct field from debrief comments on the paper LOFT
-- flight record - notes for the next Training Captain about what to focus on.
ALTER TABLE flights ADD COLUMN next_sortie_notes TEXT;
