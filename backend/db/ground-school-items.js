// Ground School courses/exams a pilot trainee must complete before going
// to the simulator for a type rating, transcribed from SA_632 Dash 8 Pilot
// Training Checklist. No phase or role-scope concept - all of this happens
// before Phase 1 of line training.

function item(category, description, notes) {
  return { category, description, notes: notes || null, required: true };
}

const DASH_8 = [
  // Admin
  item('Admin', 'Ground School Course Setup'),
  item('Admin', 'Induction Courses Completed'),
  item('Admin', 'Operations Manuals Issued'),
  item('Admin', 'QRH issued'),
  item('Admin', 'Pilot training manual issued'),
  item('Admin', 'Uniforms & PPE'),

  // Course
  item('Course', 'CAO 20.11 Theory'),
  item('Course', 'CAO 20.11 Practical'),
  item('Course', 'CAO 20.11 Wet Drill'),
  item('Course', 'Maintenance Authority / Part 42 Exam'),
  item('Course', 'First Aid', 'Metro pilots only. Provider: Medic One'),
  item('Course', 'Human Factors & Non-Technical Skills', 'Provider: HFTS'),
  item('Course', 'Dangerous Goods Awareness', 'Provider: Airsafe'),

  // Memos
  item('Memos', 'Read and understood the last 6 months of Skippers Memos', 'Signed by candidate'),

  // Observation Flights
  item('Observation Flights', 'Observation Flight 1', 'Minimum 2 required'),
  item('Observation Flights', 'Observation Flight 2', 'Minimum 2 required'),

  // Dash 8 Ground School - Module CBT
  item('Dash 8 Ground School (Module CBT)', 'Aircraft General & doors'),
  item('Dash 8 Ground School (Module CBT)', 'Electrical System'),
  item('Dash 8 Ground School (Module CBT)', 'Lighting'),
  item('Dash 8 Ground School (Module CBT)', 'Warning Systems'),
  item('Dash 8 Ground School (Module CBT)', 'Fuel System'),
  item('Dash 8 Ground School (Module CBT)', 'Auxiliary Power Unit'),
  item('Dash 8 Ground School (Module CBT)', 'Power Plant & Propellers'),
  item('Dash 8 Ground School (Module CBT)', 'Fire Protection'),
  item('Dash 8 Ground School (Module CBT)', 'Pressurisation, Pneumatics & Air Conditioning'),
  item('Dash 8 Ground School (Module CBT)', 'Ice & Rain Protection'),
  item('Dash 8 Ground School (Module CBT)', 'Hydraulic Systems'),
  item('Dash 8 Ground School (Module CBT)', 'Landing Gear & Brakes'),
  item('Dash 8 Ground School (Module CBT)', 'Flight Controls'),
  item('Dash 8 Ground School (Module CBT)', 'Flight Instruments & Avionics'),
  item('Dash 8 Ground School (Module CBT)', 'Oxygen'),
  item('Dash 8 Ground School (Module CBT)', 'EGPWS'),
  item('Dash 8 Ground School (Module CBT)', 'TCAS'),

  // Dash 8 Ground School - instructor-led modules
  item('Dash 8 Ground School (Instructor-led)', 'Weight & Balance'),
  item('Dash 8 Ground School (Instructor-led)', 'Performance'),
  item('Dash 8 Ground School (Instructor-led)', 'Phase 1', '100% pass mark'),
  item('Dash 8 Ground School (Instructor-led)', 'Limitations', '100% pass mark'),

  // Pre-Simulator Assessment
  item('Pre-Simulator Assessment', 'Complete cockpit setup'),
  item('Pre-Simulator Assessment', 'Complete TOLD card'),
  item('Pre-Simulator Assessment', 'Brief take-off, approach and landing'),
  item('Pre-Simulator Assessment', 'Use checklist'),
  item('Pre-Simulator Assessment', 'Engine start procedure'),
  item('Pre-Simulator Assessment', 'Taxi procedure'),
  item('Pre-Simulator Assessment', 'Line up and take-off procedure'),
  item('Pre-Simulator Assessment', 'Climb, cruise and descent procedure'),
  item('Pre-Simulator Assessment', 'Shutdown procedure'),
  item('Pre-Simulator Assessment', 'FMS use', 'If applicable'),
  item('Pre-Simulator Assessment', 'Emergency procedures/Phase ones'),
];

const ITEMS_BY_FLEET = {
  DASH_8,
};

function itemsForFleet(fleet) {
  return ITEMS_BY_FLEET[fleet] || [];
}

module.exports = { ITEMS_BY_FLEET, itemsForFleet };
