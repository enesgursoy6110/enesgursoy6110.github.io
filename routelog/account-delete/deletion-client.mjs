import {validProof} from './backup-proof.mjs';
import {deletionUrl, publishableKey} from './config.mjs';

// No Auth SDK/session, cookies, redirects, browser storage or automatic retries.
// Only an explicit confirmation in the page calls this operation.
export async function deleteAccount(proof, fetcher = globalThis.fetch) {
  if (!validProof(proof)) return 'wrongProof';
  try {
    const response = await fetcher(deletionUrl, {
      method: 'POST', credentials: 'omit', cache: 'no-store', redirect: 'error',
      referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(20000),
      headers: {'Content-Type':'application/json', apikey: publishableKey},
      body: JSON.stringify({action:'delete', profile_id:proof.profileId, recovery_code:proof.recoveryCode}),
    });
    const data = await response.json();
    if (response.status !== 200) return 'retry';
    if (data?.status === 'ok' && Object.keys(data).length === 1) return 'success';
    if (data?.status === 'rejected' && data.reason_code === 'invalid_recovery') return 'wrongProof';
    if (data?.status === 'rejected' && data.reason_code === 'unsupported_auth_account') return 'unsupportedAccount';
    return 'retry'; // Unexpected/proxy/upstream content is never rendered.
  } catch { return 'retry'; }
}
