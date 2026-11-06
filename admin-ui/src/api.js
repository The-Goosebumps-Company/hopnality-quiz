// Copied from the PowerHER admin. Thin client for /api/admin.php. Keeps the CSRF token from `me`/`login` in memory.
// Background calls (live polling, automatic refreshes) send X-Background so they
// don't keep an unattended session alive.
// Security flows handled here:
//  - 401 with {mfa}: the session still needs two-factor → 'hq:mfa-required' event.
//  - 403 with {stepUp}: a sensitive action needs a fresh 2FA code → ask via the registered
//    step-up prompt, then retry the request once.
let csrf = '';
let stepUpPrompt = null;
// Plain-language reason shown in the two-factor check ("Confirm it's you to …").
const STEP_UP_REASONS = {
  invite: 'invite someone to the dashboard',
  'update-user': 'change someone’s access',
  'reset-link': 'create a password reset link',
  'reset-mfa': 'reset someone’s two-factor',
  'backup-codes': 'make new backup codes',
};

export class ApiError extends Error {
  constructor(message, status, body) { super(message); this.status = status; this.body = body; }
}

async function call(action, { method = 'GET', params = {}, body, background = false, retried = false } = {}) {
  const query = new URLSearchParams({ action, ...params }).toString();
  const headers = {};
  if (method === 'POST') Object.assign(headers, { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf });
  if (background) headers['X-Background'] = '1';
  let res;
  try {
    res = await fetch(`/api/admin.php?${query}`, { method, credentials: 'same-origin', cache: 'no-store', headers, body: method === 'POST' ? JSON.stringify(body || {}) : undefined });
  } catch {
    throw new ApiError('Can’t reach the server. Check your connection.', 0, null);
  }
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON error page */ }
  if (!res.ok) {
    if (res.status === 401 && data?.mfa) window.dispatchEvent(new CustomEvent('hq:mfa-required', { detail: data.mfa }));
    else if (res.status === 401 && !['login', 'mfa-setup', 'mfa-enable', 'mfa-verify', 'mfa-cancel', 'step-up'].includes(action)) window.dispatchEvent(new Event('hq:signed-out'));
    if (res.status === 403 && data?.stepUp && !retried && !background && stepUpPrompt) {
      const ok = await stepUpPrompt(STEP_UP_REASONS[action]);
      if (ok) return call(action, { method, params, body, background, retried: true });
    }
    throw new ApiError(data?.error || 'Something went wrong. Please try again.', res.status, data);
  }
  if (data && typeof data.csrf === 'string') csrf = data.csrf;
  return data;
}

// Exports are plain downloads: confirm a fresh step-up first, then navigate.
async function download(kind, params = {}) {
  const status = await call('step-up-status');
  if (!status.active) {
    if (!stepUpPrompt || !(await stepUpPrompt(kind === 'signups' ? 'download the email sign-ups' : 'download the quiz data'))) return;
  }
  window.location.href = `/api/admin.php?${new URLSearchParams({ action: 'export', kind, ...params, csrf })}`;
}

export const api = {
  get: (action, params, opts = {}) => call(action, { params, ...opts }),
  post: (action, body) => call(action, { method: 'POST', body }),
  download,
  setStepUpPrompt: (fn) => { stepUpPrompt = fn; },
  clear: () => { csrf = ''; },
};
