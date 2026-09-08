const pool = require('../../db/pool');
const { buildCertificatePdfBuffer } = require('./certificate');
const { logAction } = require('./audit');

// A completed Emergency Procedures check always certifies both the generic
// course and the type-specific one on the same certificate - e.g. a Fokker
// 100 pilot's EP completion ticks "Emergency Procedures Training" AND
// "Fokker 100 Emergency Procedures" together, per the operator's explicit
// example. Cabin Attendant fleet variants (CA_DASH_8/CA_FOKKER_100) train on
// the same aircraft type's procedures as their pilot counterparts, so they
// share the same label. Metro 23 has no CA variant (cabin crew don't crew
// that fleet), matching FLEET_VALUES elsewhere in this app.
const EP_FLEET_LABELS = {
  DASH_8: 'Dash 8 Emergency Procedures',
  CA_DASH_8: 'Dash 8 Emergency Procedures',
  FOKKER_100: 'Fokker 100 Emergency Procedures',
  CA_FOKKER_100: 'Fokker 100 Emergency Procedures',
  METRO_23: 'Metro 23 Emergency Procedures',
};

// Which checks.js check types get an automatic certificate filed onto the
// crew member's Documents tab the moment they're completed with a PASS
// result, per the operator's explicit request - only these four, everything
// else in checks.js is unaffected. expiryDays: null means no expiry (Life
// Jacket / Wet Drill Training never expires). documentName must match an
// option on the Documents tab's dropdown (see document-names.js) for a
// human re-filing the same kind of document later to see the same choice,
// though crew_documents.name itself is just plain text either way.
const CERTIFICATE_RULES = {
  EMERGENCY_PROCEDURES: {
    items: (fleet) => ['Emergency Procedures Training', EP_FLEET_LABELS[fleet]].filter(Boolean),
    expiryDays: 365,
    documentName: 'Emergency Procedures',
  },
  LIFE_JACKET: {
    items: () => ['Life Jacket / Wet Drill Training'],
    expiryDays: null,
    documentName: 'Wet Drill Training',
  },
  SMOKE_FIRE_TRAINING: {
    items: () => ['3 Yearly Smoke & Fire Training'],
    expiryDays: 1095,
    documentName: '3 Yearly Smoke & Fire',
  },
  F100_SLIDE_TRAINING: {
    items: () => ['F100 Slide Training'],
    expiryDays: 1095,
    documentName: 'F100 Slide Training',
  },
};

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// Called from checks.js's PATCH /:id right after a check of one of the four
// types above is completed with a PASS result. Builds the same kind of
// certificate the manual Certificate Generator produces and files it
// straight onto the crew member's Documents tab - no human involved. A
// no-op for any other check type/result, or a check with no linked crew
// member (a trainee not yet converted to crew has no Documents tab to file
// onto). Errors are the caller's responsibility to catch - this is a bonus
// side effect of completing the check, not the check completion itself, so
// a failure here should never be allowed to block the check from saving.
async function fileAutomaticCertificate(check, actingUser) {
  const rule = CERTIFICATE_RULES[check.checkType];
  if (!rule || !check.crewMemberId) return;

  const items = rule.items(check.fleet);
  const validFrom = check.completedAt || new Date();
  const validTo = rule.expiryDays ? addDays(validFrom, rule.expiryDays) : null;

  // EpChecks.jsx and SafetyEquipmentChecks.jsx never set the check's own
  // top-level assessor_name column - the assessor picked via AssessorPicker
  // is stored in details.assessor instead (alongside details.assessorId/
  // assessorArn), so that's the real source of truth here. assessorName is
  // kept as a fallback in case some other path onto these check types ever
  // does set the column directly.
  const pdfBuffer = await buildCertificatePdfBuffer({
    name: check.crewMemberName,
    items,
    validFrom,
    validTo,
    assessorName: check.details?.assessor || check.assessorName,
  });

  const fileName = `${check.crewMemberName} - ${rule.documentName} Certificate.pdf`;
  // crew_documents.file_data is always a full data URI, never bare base64 -
  // manual uploads store whatever FileReader.readAsDataURL() produces (see
  // CrewDetail.jsx readFileAsDataUrl), and the viewer (lib/pdf.js viewPdf)
  // assumes that shape (splits on the first comma) rather than checking it.
  const fileData = `data:application/pdf;base64,${pdfBuffer.toString('base64')}`;
  const { rows } = await pool.query(
    `INSERT INTO crew_documents (crew_member_id, name, file_name, file_data, uploaded_by_name)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [check.crewMemberId, rule.documentName, fileName, fileData, actingUser.name],
  );
  await logAction({
    userId: actingUser.id, action: 'CREATE', targetTable: 'crew_documents', targetId: rows[0].id,
    description: `Auto-filed "${rule.documentName}" certificate for ${check.crewMemberName}`,
  });
}

module.exports = { fileAutomaticCertificate };
