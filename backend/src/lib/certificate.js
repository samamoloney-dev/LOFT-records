const PDFDocument = require('pdfkit');
const { SKIPPERS_LOGO_DATA_URI } = require('../assets/skippersLogo');

const LOGO_BUFFER = Buffer.from(SKIPPERS_LOGO_DATA_URI.split(',')[1], 'base64');

function formatDate(d) {
  if (!d) return null;
  return new Date(d).toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Builds the same kind of certificate the manual Certificate Generator
// produces (see frontend/src/lib/printBuilders.js buildCertificateHtml),
// but rendered server-side as an actual PDF file via pdfkit (a pure-JS
// library) rather than a headless browser - lighter weight and far more
// reliable to run on Render than puppeteer, at the cost of not being a
// pixel-perfect match of the browser template. Used to auto-file a
// certificate onto a crew member's Documents tab the moment a qualifying
// check is completed (see lib/autoCertificate.js), with nobody having to
// open a print dialog.
function buildCertificatePdfBuffer({ name, items, validFrom, validTo, assessorName }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.image(LOGO_BUFFER, (doc.page.width - 150) / 2, 40, { width: 150 });
    doc.y = 210;

    doc.font('Helvetica').fontSize(14).text('This is to certify that', { align: 'center' });
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').fontSize(24).text(String(name || '').toUpperCase(), { align: 'center' });
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(14).text('Has successfully completed the following', { align: 'center' });
    doc.moveDown(1);

    doc.font('Helvetica').fontSize(13);
    for (const item of items) {
      doc.text(item, { align: 'center' });
      doc.moveDown(0.3);
    }
    doc.moveDown(1);
    doc.fontSize(12).text('Conducted by Skippers Aviation PTY LTD', { align: 'center' });

    doc.moveDown(3);
    const bottomY = doc.y;
    doc.fontSize(11);
    doc.text(`Valid From: ${formatDate(validFrom) || '-'}`, 70, bottomY);
    doc.text(`Valid To: ${validTo ? formatDate(validTo) : 'No expiry'}`, 70, bottomY + 18);

    doc.text(assessorName || ' ', 350, bottomY, { width: 180, align: 'center' });
    doc.text('Assessor', 350, bottomY + 18, { width: 180, align: 'center' });

    doc.end();
  });
}

module.exports = { buildCertificatePdfBuffer };
