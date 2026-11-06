import { useEffect, useState } from 'react';
import { api } from './api.js';
import { Field } from './ui.jsx';

function AuthShell({ title, intro, children }) {
  return (
    <div className="grid min-h-screen place-items-center bg-theme-bg-primary px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-theme-border-primary bg-theme-bg-secondary p-8 shadow-theme-lg animate-in fade-in zoom-in-95 duration-300">
        <div className="flex items-center gap-2">
          <img src="/assets/logo-black-gold.png" alt="hopnøsis" className="h-9 w-auto" />
          <span className="text-[9px] font-semibold uppercase leading-tight tracking-[.2em] text-theme-text-muted">What the AF<br />quiz · admin</span>
        </div>
        <h1 className="mt-8 text-3xl">{title}</h1>
        {intro && <p className="mt-1 text-sm text-theme-text-muted">{intro}</p>}
        {children}
      </div>
    </div>
  );
}

const POLICY = 'At least 8 characters, with uppercase, lowercase and a number.';

export function Login({ onSignedIn }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try { onSignedIn(await api.post('login', { email, password })); }
    catch (err) {
      const mins = err.body?.retry_after_seconds ? Math.ceil(err.body.retry_after_seconds / 60) : 0;
      setError(mins ? `${err.message} Try again in about ${mins} minute${mins === 1 ? '' : 's'}.` : err.message);
    } finally { setBusy(false); }
  };
  return (
    <AuthShell title="Sign in" intro="Admin access to assessment responses.">
      <form onSubmit={submit} className="mt-6 space-y-5">
        <Field label="Email"><input className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Password"><input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        {error && <p className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
        <button className="btn btn-md btn-primary w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="text-xs text-theme-text-muted">Forgot your password? Ask an owner for a reset link.</p>
      </form>
    </AuthShell>
  );
}

// Shared by invite acceptance and password reset: validate the link, then set a password.
export function LinkForm({ kind, token, onSignedIn }) {
  const invite = kind === 'invite';
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => {
    api.get(invite ? 'invite-info' : 'reset-info', { token }).then(setInfo).catch((err) => setError(err.message));
  }, [token, invite]);

  const submit = async (e) => {
    e.preventDefault(); setError('');
    if (password !== confirm) { setError('The passwords don’t match.'); return; }
    setBusy(true);
    try {
      if (invite) { const r = await api.post('accept-invite', { token, name, password }); window.location.hash = '#/overview'; onSignedIn(r); }
      else { await api.post('reset-password', { token, password }); setDone(true); }
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  if (done) {
    return (
      <AuthShell title="Password updated" intro="All other sessions were signed out.">
        <a className="btn btn-md btn-primary w-full" href="#/">Sign in</a>
      </AuthShell>
    );
  }
  return (
    <AuthShell title={invite ? 'Set up your account' : 'Choose a new password'}
      intro={info ? `${invite ? 'Invited' : 'Account'}: ${info.email}${invite ? ` (${info.role})` : ''}` : ''}>
      {!info && !error && <p className="text-sm text-theme-text-muted">Checking your link…</p>}
      {!info && error && <><p className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">{error}</p><p className="text-xs text-theme-text-muted">Ask an owner for a new link.</p></>}
      {info && (
        <form onSubmit={submit} className="mt-6 space-y-5">
          {invite && <Field label="Your name"><input className="input" autoComplete="name" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} /></Field>}
          <Field label="Password" hint={POLICY}><input className="input" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          <Field label="Confirm password"><input className="input" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
          {error && <p className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
          <button className="btn btn-md btn-primary w-full" disabled={busy}>{busy ? 'Saving…' : invite ? 'Create account' : 'Save password'}</button>
        </form>
      )}
    </AuthShell>
  );
}

export function ChangePassword() {
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState({ ok: '', error: '' });
  const submit = async (e) => {
    e.preventDefault();
    if (password !== confirm) { setMsg({ ok: '', error: 'The new passwords don’t match.' }); return; }
    try { await api.post('change-password', { current, password }); setMsg({ ok: 'Password changed. Other sessions were signed out.', error: '' }); setCurrent(''); setPassword(''); setConfirm(''); }
    catch (err) { setMsg({ ok: '', error: err.message }); }
  };
  return (
    <form onSubmit={submit} className="max-w-md space-y-5">
      <Field label="Current password"><input className="input" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} /></Field>
      <Field label="New password" hint={POLICY}><input className="input" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
      <Field label="Confirm new password"><input className="input" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
      {msg.error && <p className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">{msg.error}</p>}
      {msg.ok && <p className="rounded-lg border border-success/25 bg-success-soft px-3 py-2 text-sm text-success" role="status">{msg.ok}</p>}
      <button className="btn btn-md btn-primary w-full">Change password</button>
    </form>
  );
}
