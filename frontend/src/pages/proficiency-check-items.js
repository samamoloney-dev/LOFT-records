// Part 121 Proficiency Check / IPC and Proficiency Check content, transcribed
// from SA_489 (Proficiency Check) and SA_492 (IPC and Proficiency Check).
// The two forms share the same Recurrent Training header items and Flight
// Component (Sch.2) sections - SA_492 additionally has a Knowledge/Ground
// Component (Sch.5) and two extra items in section 3.4 for instrument work.

export const RECURRENT_TRAINING_ITEMS = [
  { description: 'UPRT (N/A M23) Upset Awareness', mos: '121.12 20(4a)' },
  { description: 'UPRT (N/A M23) Upset Prevention', mos: '121.12 20(4b)' },
  { description: 'UPRT (N/A M23) Upset Recovery', mos: '121.12 20(4c)' },
  { description: 'Major System Failure - As per Recurrent Training Manual', mos: '121.12 20(5)' },
  { description: 'System failure with checklist procedure (Refer Major System)', mos: '121.12 20(5)' },
];

// Knowledge requirements (Ground Component, Sch.5) - IPC and Proficiency
// Check only.
export const KNOWLEDGE_ITEMS = [
  { description: 'Privileges and limitations of the instrument rating and each endorsement assessed', mos: '2(a)' },
  { description: 'Proficiency check requirements', mos: '2(b)' },
  { description: 'IFR flight and approach recency requirements', mos: '2(c)' },
  { description: 'Aircraft instrument requirements', mos: '2(d)' },
  { description: 'Interpreting operational and meteorological information', mos: '2(e)' },
  { description: 'Take-off minima', mos: '2(f)' },
  { description: 'Holding and alternate requirements', mos: '2(g)' },
  { description: 'IFR procedures for all airspace classifications', mos: '2(h)' },
  { description: 'Departure and approach instrument procedures', mos: '2(i)' },
  { description: 'Operations below LSALT and MSA for day and night operations', mos: '2(j)' },
  { description: 'GNSS and PBN standards', mos: '2(k)' },
  { description: 'Circling approaches (N/A for SIM)', mos: '2(l)' },
  { description: 'Adverse weather operations', mos: '2(m)' },
  { description: 'ERSA normal and emergency procedures', mos: '2(n)' },
  { description: 'IFR Planning', mos: '2(o)' },
];

// Flight Component (Sch.2) - shared by both forms. ipcOnlyItems in 3.4 are
// only shown for the IPC and Proficiency Check variant.
export const FLIGHT_COMPONENT_SECTIONS = [
  {
    section: '3.1 Pre-flight',
    items: [
      { description: 'Plan an IFR flight', mos: 'CIR.1' },
      { description: 'Perform pre-flight actions and procedures', mos: 'C2.1, C4.1' },
    ],
  },
  {
    section: '3.2 Ground ops, take-off, departure and climb',
    items: [
      { description: 'Complete all relevant checks and procedures', mos: 'CIR.1, IFF.1' },
      { description: 'Plan, brief and conduct take-off and departure procedures', mos: 'CIR.2' },
      { description: 'Conduct instrument departure - published if available or ATC cleared if available', mos: 'CIR.3 or CIR.4' },
      { description: 'Rejected Take-Off (PIC only)', mos: '121.12.22' },
    ],
  },
  {
    section: '3.3 En route cruise',
    items: [
      { description: 'Navigate aircraft en route using ground and satellite navigation systems', mos: 'CIR.5' },
      { description: 'Perform Navigation systems integrity checks', mos: 'CIR.5' },
      { description: 'Identify and avoid hazardous weather conditions', mos: 'CIR.5' },
    ],
  },
  {
    section: '3.4 Test specific activities and manoeuvres',
    ipcOnlyItems: [
      { description: 'Perform full and limited panel instrument flying', mos: 'IFF.2, IFL.1, IFL.2' },
      { description: 'Using full and limited instrument panels, recover from at least 2 unusual attitudes', mos: 'IFF.3, IFL.3' },
    ],
    items: [
      { description: 'Conduct instrument departure OEI - FAIL V1 - V2', mos: 'CIR.4, 121.12.22' },
      { description: 'Conduct instrument approach OEI - 3D', mos: 'CIR.9, 121.12.22' },
      { description: 'Conduct instrument missed approach OEI from minima', mos: 'CIR.9, CIR.10, 121.12.22' },
      { description: 'OEI Landing', mos: '121.12.22' },
      { description: 'TCAS', mos: '121.12.22' },
    ],
  },
  {
    section: '3.5 Descent and arrival',
    items: [
      { description: 'Perform a descent or published arrival procedure to an aerodrome', mos: 'CIR.6' },
      { description: 'Track to holding fix and conduct a holding pattern or sector 3 procedure', mos: 'CIR.7, IAP2.3' },
      { description: '2D, prepare for approach', mos: 'IAP2.1, IAP2.2' },
      { description: '2D, conduct approach', mos: 'IAP3.1, IAP3.2, 121.12.22' },
      { description: '3D, prepare for approach', mos: 'CIR.8, IAP3.4, 121.12.22' },
      { description: '3D, conduct approach', mos: 'IAP2.5 or IAP3.5' },
      { description: 'Conduct missed approach', mos: 'CIR.7' },
    ],
  },
  {
    section: '3.6 Circuit, approach and landing',
    items: [
      { description: 'Perform after-landing actions and procedures', mos: 'A4.1' },
    ],
  },
  {
    section: '3.7 Shut down and post-flight',
    items: [
      { description: 'Park, shut down secure aircraft and complete post-flight administration', mos: 'C2.3' },
    ],
  },
  {
    section: '3.8 General requirements',
    items: [
      { description: 'Maintain effective lookout', mos: 'NTS1.1' },
      { description: 'Maintain situational awareness', mos: 'NTS1.2' },
      { description: 'Assess situations and make decisions', mos: 'NTS1.3' },
      { description: 'Set priorities and manage tasks', mos: 'NTS1.4' },
      { description: 'Maintain effective communications and interpersonal relationships', mos: 'NTS1.5' },
      { description: 'Recognise and manage threats', mos: 'NTS2.1' },
      { description: 'Recognise and manage errors', mos: 'NTS2.2' },
      { description: 'Recognise and manage undesired states', mos: 'NTS2.3' },
      { description: 'Use correct radio procedures', mos: 'CIR' },
      { description: 'Manage relevant aircraft systems', mos: 'CIR' },
      { description: 'Manage fuel system and monitor fuel plan and usage', mos: 'CIR.5' },
    ],
  },
];
