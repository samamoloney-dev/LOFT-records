-- Item catalog for the SA 538 form (see migration 0118) - matches the
-- paper form's 7 criteria rows exactly, each a plain tick (the form has no
-- score/pass-fail per item, just a single "Completed" column).
INSERT INTO check_form_items (form_key, kind, description, sort_order) VALUES
  ('FLIGHT_STANDARDS_RECURRENT_TRAINING', 'tick', 'Flight Path Monitoring - Maintains continuous and effective monitoring of aircraft flight path, energy state, configuration and automation management throughout all phases of flight. Identifies developing deviations promptly and maintains overall situational awareness.', 0),
  ('FLIGHT_STANDARDS_RECURRENT_TRAINING', 'tick', 'Deviation Recognition - Recognises deviations from SOPs, stabilisation criteria, flight path, automation management or procedural requirements in a timely manner. Demonstrates awareness of threats, errors and undesired aircraft states.', 1),
  ('FLIGHT_STANDARDS_RECURRENT_TRAINING', 'tick', 'Judgement and Intervention - Demonstrates sound judgement regarding when intervention is required. Balances candidate learning opportunities with operational safety and simulator training objectives.', 2),
  ('FLIGHT_STANDARDS_RECURRENT_TRAINING', 'tick', 'Timeliness of Intervention - Intervenes at an appropriate stage to prevent escalation of unsafe situations or training outcomes inconsistent with company standards. Intervention is neither delayed nor unnecessarily premature.', 3),
  ('FLIGHT_STANDARDS_RECURRENT_TRAINING', 'tick', 'Application of "Taking Over" Procedure - Correctly applies company "Taking Over" procedures using standard phraseology and positive transfer of control techniques. Maintains clarity, professionalism and aircraft safety during all interventions.', 4),
  ('FLIGHT_STANDARDS_RECURRENT_TRAINING', 'tick', 'Situational Awareness - Maintains awareness of simulator progress, candidate workload, aircraft state and training objectives throughout the exercise.', 5),
  ('FLIGHT_STANDARDS_RECURRENT_TRAINING', 'tick', 'Threat and Error Management (TEM) - Identifies operational threats and manages candidate errors appropriately while reinforcing TEM principles during training activities.', 6);
