// Every check form that carries the line "Check conducted IAW specific
// Instructor Reference Documents <ref>". The reference (DOC###) is set per
// form on Edit Forms, and starts as the placeholder "DOC###" until the
// operator confirms the real document numbers.
const PLACEHOLDER = 'DOC###';

const REFERENCE_DOC_FORMS = [
  { key: 'EMERGENCY_PROCEDURES', label: 'Emergency Procedures' },
  { key: 'LIFE_JACKET', label: 'Life Jacket Training (wet drill)' },
  { key: 'SMOKE_FIRE_TRAINING', label: '3 Yearly Smoke & Fire' },
  { key: 'F100_SLIDE_TRAINING', label: 'F100 Slide Training' },
  { key: 'IPC', label: 'IPC' },
  { key: 'PC', label: 'Proficiency Check' },
  { key: 'PILOT_LINE_CHECK', label: 'Pilot Line Check' },
  { key: 'CABIN_ATTENDANT_LINE_CHECK', label: 'Cabin Attendant Line Check' },
  { key: 'CHECK_TO_LINE_PILOT', label: 'Check to Line - Pilot' },
  { key: 'CHECK_TO_LINE_CABIN_ATTENDANT', label: 'Check to Line - Cabin Attendant' },
  { key: 'CAPTAIN_IN_TRAINING_PRELIMINARY', label: 'Captain in Training - Preliminary' },
  { key: 'CAPTAIN_IN_TRAINING_FINAL', label: 'Captain in Training - Final' },
  { key: 'UPGRADE_TRAINING_CAPTAIN', label: 'Training Captain Upgrade' },
  { key: 'UPGRADE_CHECK_CAPTAIN', label: 'Check Captain Upgrade' },
  { key: 'UPGRADE_TRAINING_CABIN_ATTENDANT', label: 'Training Cabin Attendant Upgrade' },
  { key: 'UPGRADE_CHECK_CABIN_ATTENDANT', label: 'Check Cabin Attendant Upgrade' },
  { key: 'FLIGHT_STANDARDS_RECURRENT_TRAINING', label: 'Flight Standards Pilot Recurrent Training (SA 538)' },
  { key: 'GROUND_INSTRUCTOR_COMPETENCY', label: 'Ground Instructor Competency Check' },
  { key: 'PERSONNEL_AIR_COMPETENCY', label: 'Personnel (Air) Competency Check' },
  { key: 'LANDING_ASSESSMENT', label: 'Initial Take-Off & Landing Assessment' },
];

const FORM_KEYS = REFERENCE_DOC_FORMS.map((f) => f.key);

module.exports = { PLACEHOLDER, REFERENCE_DOC_FORMS, FORM_KEYS };
