/** Network data arrives only through messages and is rendered with textContent. */
export function getNetworkHistoryHtml(nonce: string): string {
	return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<title>RestCraft Network History</title>
<style nonce="${nonce}">
body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); margin: 20px; }
header { display: flex; align-items: center; gap: 20px; }
h1 { font-size: 20px; } button, input { font: inherit; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-contrastBorder, transparent); padding: 8px; }
button { cursor: pointer; } button:hover { background: var(--vscode-list-hoverBackground); } button:focus-visible, input:focus-visible { outline: 1px solid var(--vscode-focusBorder); }
main { display: grid; grid-template-columns: minmax(240px, 35%) minmax(0, 1fr); gap: 20px; }
#calls { display: flex; flex-direction: column; gap: 4px; } #calls button { text-align: left; white-space: pre-wrap; overflow-wrap: anywhere; }
#calls button[aria-pressed="true"] { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
pre { white-space: pre-wrap; overflow-wrap: anywhere; font-family: var(--vscode-editor-font-family); }
#filter { width: 100%; box-sizing: border-box; margin-bottom: 12px; }
.request-heading { color: var(--vscode-charts-blue, #3794ff); }
.response-heading { color: var(--vscode-charts-green, #89d185); }
.hint { color: var(--vscode-descriptionForeground); } h2 { font-size: 16px; }
@media (max-width: 650px) { main { grid-template-columns: 1fr; } }
</style></head><body>
<header><h1>Network History</h1><button id="clear">Clear history</button></header>
<p class="hint">Last 100 calls this session, including OAuth exchanges. Uses the Redact Sensitive Content In Network Log setting for new calls. Existing entries keep their captured redaction. Clearing history does not clear Output.</p>
<main><section aria-label="Network calls"><input id="filter" type="search" placeholder="Filter method, URL, or status" aria-label="Filter calls"><div id="calls"></div></section>
<section aria-label="Call details"><p id="summary" role="status">Send a request to start recording network history.</p><h2 class="request-heading">Request</h2><pre id="request"></pre><h2 class="response-heading">Response</h2><pre id="response"></pre></section></main>
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
let entries = [];
let selected;
const calls = document.getElementById('calls');
const filter = document.getElementById('filter');
function render() {
 const focusedId = document.activeElement && document.activeElement.dataset.id;
 calls.replaceChildren();
 const query = filter.value.toLowerCase();
 const matches = entries.filter(e => (e.method + ' ' + e.url + ' ' + e.status).toLowerCase().includes(query));
 if (!entries.some(e => e.id === selected)) selected = entries[0]?.id;
 for (const e of matches) {
  const button = document.createElement('button');
  button.dataset.id = String(e.id);
  button.setAttribute('aria-pressed', String(e.id === selected));
  button.textContent = '#' + e.id + ' ' + e.method + ' ' + e.url + '\\n' + e.status + (e.durationMs === undefined ? '' : ' · ' + e.durationMs + ' ms');
  button.addEventListener('click', () => { selected = e.id; render(); });
  calls.append(button);
  if (focusedId === String(e.id)) button.focus();
 }
 if (!matches.length) calls.textContent = entries.length ? 'No matching calls.' : 'No recorded calls.';
 const e = entries.find(e => e.id === selected);
 document.getElementById('summary').textContent = e ? '#' + e.id + ' · ' + e.started + ' · ' + e.status + ' · ' + (e.redacted ? 'Redaction enabled' : 'Redaction disabled') : 'Send a request to start recording network history.';
 document.getElementById('request').textContent = e?.request ?? '';
 document.getElementById('response').textContent = e ? (e.response ?? 'Waiting for response…') : '';
}
filter.addEventListener('input', render);
document.getElementById('clear').addEventListener('click', () => vscode.postMessage({ type: 'clear' }));
window.addEventListener('message', event => {
 if (event.data.type === 'history' && Array.isArray(event.data.entries)) { entries = event.data.entries; render(); }
});
vscode.postMessage({ type: 'ready' });
</script></body></html>`;
}
