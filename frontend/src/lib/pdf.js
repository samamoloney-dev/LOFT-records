// Opens a base64 data-URI PDF in a new tab via a Blob/object URL rather than
// navigating directly to the (potentially several-MB) data: URI itself,
// which some browsers cap or refuse for large URLs. Shared by CrewDetail's
// Documents tab and the Archive page's own Documents search, both of which
// need to view a document's PDF once fetched from the API.
export function viewPdf(dataUri) {
  viewFile(dataUri, 'application/pdf');
}

// Only these kinds of file are ever opened in a browser tab. The type comes from
// the uploaded file's own header, which an uploader controls - a file labelled
// text/html or image/svg+xml would otherwise run as part of this site (a blob:
// address shares the site's origin) with the viewer's access. Anything else is
// handed over as a plain download instead of being displayed.
export const SAFE_VIEW_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp'];
export function safeViewType(type) {
  const t = String(type || '').toLowerCase();
  return SAFE_VIEW_TYPES.includes(t) ? t : 'application/octet-stream';
}

// Same, for any base64 data-URI file (PDF or JPEG) - the type is read from the
// data URI itself, falling back to the one given.
export function viewFile(dataUri, fallbackType = 'application/pdf') {
  const [header, base64] = dataUri.split(',');
  const type = safeViewType((/^data:([^;]+);/.exec(header) || [])[1] || fallbackType);
  const bytes = atob(base64);
  const array = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) array[i] = bytes.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([array], { type }));
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
