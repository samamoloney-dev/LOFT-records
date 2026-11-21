const crypto = require('crypto');
const { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');

// Where uploaded documents (crew documents, staff documents, auto-generated
// certificates) are kept. When S3 is configured the file goes to a private S3
// bucket and the database row only holds its key; otherwise the file is stored
// in the database as before, so nothing depends on S3 being switched on.
//
// Settings (Render environment variables):
//   S3_BUCKET   the bucket name - setting this switches S3 on
//   S3_REGION   defaults to ap-southeast-2 (Sydney)
//   AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY   read by the AWS SDK itself
//
// The bucket stays private: files are only ever read here, after the route has
// checked who is asking, and handed back to the app as a data URI exactly as the
// database copy was - so the screens needed no change.
const DATA_URI = /^data:([^;,]+);base64,(.*)$/s;

let client = null;
function bucket() { return process.env.S3_BUCKET || ''; }
function region() { return process.env.S3_REGION || 'ap-southeast-2'; }
function isConfigured() { return !!bucket(); }
function getClient() {
  if (!client) client = new S3Client({ region: region() });
  return client;
}

function safeName(fileName) {
  return String(fileName || 'file').replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80) || 'file';
}

function parseDataUri(dataUri) {
  const m = DATA_URI.exec(dataUri || '');
  if (!m) return null;
  return { contentType: m[1].toLowerCase(), buffer: Buffer.from(m[2], 'base64') };
}

async function putBuffer(key, buffer, contentType) {
  await getClient().send(new PutObjectCommand({
    Bucket: bucket(), Key: key, Body: buffer, ContentType: contentType, ServerSideEncryption: 'AES256',
  }));
}

// Stores one uploaded file. Returns { storageKey, fileData } for the row's two
// columns: the S3 key (and no data) when S3 took it, or the data URI (and no
// key) when S3 is off or briefly unavailable - an upload is never lost.
async function saveFile(prefix, fileName, dataUri) {
  if (!isConfigured()) return { storageKey: null, fileData: dataUri };
  const parsed = parseDataUri(dataUri);
  if (!parsed) return { storageKey: null, fileData: dataUri };
  const key = `${prefix}/${crypto.randomUUID()}/${safeName(fileName)}`;
  try {
    await putBuffer(key, parsed.buffer, parsed.contentType);
    return { storageKey: key, fileData: null };
  } catch (err) {
    console.error('S3 upload failed - keeping the file in the database instead:', err.name, err.message);
    return { storageKey: null, fileData: dataUri };
  }
}

// The file as a data URI, from S3 when the row has a key, otherwise from the
// database copy.
async function loadFileData(row) {
  const key = row.storage_key || row.storageKey;
  if (!key) return row.file_data ?? row.fileData ?? null;
  const out = await getClient().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  const bytes = Buffer.from(await out.Body.transformToByteArray());
  return `data:${out.ContentType || 'application/octet-stream'};base64,${bytes.toString('base64')}`;
}

// Used by the copy-across job to confirm an uploaded object really is there and
// the right size before the database copy is allowed to be cleared.
async function objectSize(key) {
  const head = await getClient().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
  return Number(head.ContentLength);
}

module.exports = { isConfigured, bucket, region, saveFile, loadFileData, parseDataUri, putBuffer, objectSize, safeName, getClient };
