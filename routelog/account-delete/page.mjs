import {proofFromBackup, BackupError} from './backup-proof.mjs';
import {deleteAccount} from './deletion-client.mjs';
import {languages, messages} from './text.mjs';

const get = id => document.getElementById(id);
const language = get('language');
language.value = languages.includes(navigator.language.split('-')[0]) ? navigator.language.split('-')[0] : 'en';
let proof = null;
let busy = false;
let sequence = 0;
let message = null;
let kind = '';
const framed = window.top !== window.self;

function render() {
  const text = messages[language.value];
  document.documentElement.lang = language.value;
  document.documentElement.dir = language.value === 'ar' ? 'rtl' : 'ltr';
  document.title = 'Routelog · ' + text.title;
  document.querySelectorAll('[data-text]').forEach(node => { node.textContent = text[node.dataset.text]; });
  language.setAttribute('aria-label', text.language);
  get('status').textContent = message ? text[message] : '';
  get('status').dataset.kind = kind;
  get('profile').hidden = !proof;
  get('profile-id').textContent = proof?.profileId ?? '';
  for (const id of ['backup','password','read','reset']) get(id).disabled = busy || framed;
  get('confirm').disabled = !proof || busy || framed;
  get('erase').disabled = !proof || busy || !get('confirm').checked || framed;
  get('read-form').setAttribute('aria-busy', String(busy));
  get('delete-form').setAttribute('aria-busy', String(busy));
}
function clear() {
  ++sequence;
  proof = null; message = null; kind = '';
  get('confirm').checked = false;
  get('password').value = '';
  render();
}
language.addEventListener('change', render);
get('confirm').addEventListener('change', render);
get('backup').addEventListener('change', clear);
get('password').addEventListener('input', () => {
  ++sequence; proof = null; message = null; get('confirm').checked = false; render();
});
get('reset').addEventListener('click', () => { get('backup').value = ''; clear(); });
get('read-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (busy || framed) return;
  const request = ++sequence;
  proof = null; busy = true; message = 'busyRead'; kind = '';
  get('confirm').checked = false;
  const password = get('password').value;
  const file = get('backup').files[0];
  render();
  try {
    const result = await proofFromBackup(file, password);
    if (request !== sequence) return;
    proof = result; message = 'ready';
  } catch (error) {
    if (request !== sequence) return;
    message = error instanceof BackupError ? error.code : 'invalid';
    kind = 'error';
  } finally {
    busy = false; get('password').value = ''; render();
  }
});
get('delete-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!proof || busy || framed || !get('confirm').checked) return;
  busy = true; message = 'busyDelete'; kind = '';
  const request = ++sequence;
  render();
  const result = await deleteAccount(proof);
  if (request === sequence) {
    message = result;
    kind = result === 'success' ? 'success' : 'error';
    if (result === 'success') {
      proof = null; get('backup').value = ''; get('confirm').checked = false;
    }
  }
  busy = false; render();
});
// Never retain proof/password via back-forward cache or browser storage.
window.addEventListener('pagehide', () => { get('backup').value = ''; clear(); });
if (framed) { message = 'frameBlocked'; kind = 'error'; }
render();
