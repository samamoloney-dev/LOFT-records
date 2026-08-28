// Thin wrapper around Resend (https://resend.com) - the operator's chosen
// provider for the automated competency digest email (see lib/digest.js).
// Requires RESEND_API_KEY (and, for anything beyond Resend's own sandbox
// sender, a verified sending domain/address in DIGEST_FROM_EMAIL) to be set
// as real environment variables on the backend service - neither is set by
// this codebase itself, since they're the operator's own account
// credentials. Until they are, sendEmail logs a clear warning and no-ops
// rather than crashing the scheduled job or the server.
let resendClient = null;
function getClient() {
  if (!process.env.RESEND_API_KEY) return null;
  if (!resendClient) {
    // Lazy require - keeps 'resend' an optional-in-practice dependency for
    // any environment that never sets RESEND_API_KEY (e.g. local dev).
    const { Resend } = require('resend');
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

async function sendEmail({ to, subject, html }) {
  const client = getClient();
  if (!client) {
    console.warn('[email] RESEND_API_KEY not set - skipping send:', subject);
    return { skipped: true };
  }
  const from = process.env.DIGEST_FROM_EMAIL || 'Flight Standards System <onboarding@resend.dev>';
  return client.emails.send({ from, to, subject, html });
}

module.exports = { sendEmail };
