// Opens a base64 data-URI PDF in a new tab via a Blob/object URL rather than
// navigating directly to the (potentially several-MB) data: URI itself,
// which some browsers cap or refuse for large URLs. Shared by CrewDetail's
// Documents tab and the Archive page's own Documents search, both of which
// need to view a document's PDF once fetched from the API.
export function viewPdf(dataUri) {
  const [, base64] = dataUri.split(',');
  const bytes = atob(base64);
  const array = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) array[i] = bytes.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([array], { type: 'application/pdf' }));
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
