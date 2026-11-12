// Two-factor screens: first-time set-up (QR + key + confirm + backup codes), sign-in
// verification, and the step-up prompt used before exports and team changes.
import { useEffect, useMemo, useRef, useState } from 'react';
import qrcode from 'qrcode-generator';
import { ShieldCheck, DeviceMobile, Key, CopySimple, DownloadSimple, X } from 'phosphor-react';
import { api } from './api.js';
import { CopyButton, cx } from './ui.jsx';

// Segmented code entry: one real <input> (so paste, iOS/Android one-time-code autofill,
// screen readers and password managers all just work) laid invisibly over styled boxes.
// 6 digits as 3+3 for authenticator codes, 8 characters as 4+4 for backup codes.
function CodeInput({ value, onChange, backup, autoFocus = true, error = false, busy = false }) {
  const ref = useRef(null);
  const [focused, setFocused] = useState(false);
  const length = backup ? 8 : 6, half = length / 2;
  useEffect(() => { if (autoFocus) ref.current?.focus(); }, [backup, autoFocus]);
  useEffect(() => { if (error) ref.current?.focus(); }, [error]);
  const clean = (v) => (backup ? v.toUpperCase().replace(/[^A-Z0-9]/g, '') : v.replace(/\D/g, '')).slice(0, length);
  const toEnd = (e) => { const n = e.target.value.length; if (e.target.selectionStart !== n) e.target.setSelectionRange(n, n); };
  const chars = value.split('');
  const active = Math.min(value.length, length - 1);
  const box = (i) => {
    const ch = chars[i];
    const isActive = focused && !busy && i === active && value.length < length + (i === length - 1 ? 0 : 1);
    return (
      <span key={i} aria-hidden="true" className={cx(
        'relative grid h-14 flex-1 max-w-[3.25rem] place-items-center rounded-xl border-2 font-mono text-2xl font-semibold tabular-nums transition-all duration-150 sm:h-16 sm:text-[1.7rem]',
        backup && 'max-w-[2.6rem] text-xl sm:h-14 sm:text-xl',
        error ? 'border-danger/60 bg-danger-soft text-danger'
          : isActive ? 'border-accent bg-theme-bg-secondary shadow-[0_0_0_4px_rgba(51,125,119,.14)] -translate-y-px'
          : ch ? 'border-brand/25 bg-accent-soft/50 text-theme-text-primary'
          : 'border-theme-border-primary bg-theme-bg-tertiary text-theme-text-muted',
        busy && 'opacity-60')}>
        {ch ? <span className="animate-in zoom-in-75 fade-in duration-150">{ch}</span>
          : isActive ? <span className="h-7 w-0.5 animate-pulse rounded-full bg-accent" /> : <span className="h-1.5 w-1.5 rounded-full bg-theme-border-primary" />}
      </span>
    );
  };
  return (
    <div className={cx('relative', error && 'animate-shake')} onClick={() => ref.current?.focus()}>
      <div className="flex items-center justify-center gap-1.5 sm:gap-2">
        {Array.from({ length: half }, (_, i) => box(i))}
        <span aria-hidden="true" className="mx-0.5 h-0.5 w-3 shrink-0 rounded-full bg-theme-border-primary sm:mx-1" />
        {Array.from({ length: half }, (_, i) => box(i + half))}
      </div>
      <input ref={ref} value={value} disabled={busy}
        onChange={(e) => onChange(clean(e.target.value))} onSelect={toEnd} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        inputMode={backup ? 'text' : 'numeric'} pattern={backup ? undefined : '[0-9]*'} autoComplete={backup ? 'off' : 'one-time-code'}
        autoCapitalize={backup ? 'characters' : 'off'} spellCheck="false" maxLength={length + 2}
        aria-label={backup ? 'Backup code, 8 characters' : '6-digit code from your authenticator app'} aria-invalid={error || undefined}
        className="absolute inset-0 h-full w-full cursor-text bg-transparent text-transparent caret-transparent opacity-0 outline-none" />
    </div>
  );
}

function Shell({ title, intro, children, onCancel, pending }) {
  return (
    <div className="grid min-h-screen place-items-center bg-theme-bg-primary px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-theme-border-primary bg-theme-bg-secondary p-8 shadow-theme-lg animate-in fade-in zoom-in-95 duration-300">
        <div className="flex items-center gap-2">
          <img src="/assets/logo-black-gold.png" alt="hopnøsis" className="h-9 w-auto" />
          <span className="text-[9px] font-semibold uppercase leading-tight tracking-[.2em] text-theme-text-muted">Hop-nality<br />quiz · admin</span>
        </div>
        <div className="mt-8 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-soft text-accent-strong"><ShieldCheck size={22} weight="duotone" /></span>
          <h1 className="text-2xl">{title}</h1>
        </div>
        {intro && <div className="mt-2 text-sm leading-relaxed text-theme-text-muted">{intro}</div>}
        {children}
        {onCancel && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-theme-border-secondary pt-4 text-xs text-theme-text-muted">
            {pending?.email && <span className="truncate">Signing in as <strong className="text-theme-text-secondary">{pending.email}</strong></span>}
            <button className="btn btn-sm btn-ghost" onClick={onCancel}>Cancel, back to sign-in</button>
          </div>
        )}
      </div>
    </div>
  );
}

function BackupCodes({ codes, onDone }) {
  const text = codes.join('\n');
  const [saved, setSaved] = useState(false);
  const blobUrl = useMemo(() => URL.createObjectURL(new Blob([`hopnøsis quiz admin backup codes\nEach code works once. Keep them somewhere safe and private.\n\n${text}\n`], { type: 'text/plain' })), [text]);
  useEffect(() => () => URL.revokeObjectURL(blobUrl), [blobUrl]);
  return (
    <div className="mt-6 space-y-4">
      <div className="rounded-xl border border-gold/40 bg-gold-soft p-4 text-sm text-gold-ink">
        <p className="font-semibold">Save these backup codes now</p>
        <p className="mt-1">If you lose your phone, each code signs you in once. They won’t be shown again.</p>
      </div>
      <ol className="grid grid-cols-2 gap-2 rounded-xl border border-theme-border-primary bg-theme-bg-tertiary p-4 font-mono text-sm">
        {codes.map((c) => <li key={c} className="tabular-nums">{c}</li>)}
      </ol>
      <div className="flex flex-wrap gap-2">
        <CopyButton text={text} label="Copy all" />
        <a className="btn btn-sm btn-ghost no-underline" href={blobUrl} download="hopnosis-admin-backup-codes.txt" onClick={() => setSaved(true)}><DownloadSimple size={14} weight="bold" />Download</a>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[#337d77]" checked={saved} onChange={(e) => setSaved(e.target.checked)} />I’ve saved my backup codes</label>
      <button className="btn btn-md btn-primary w-full" disabled={!saved} onClick={onDone}>Continue to the dashboard</button>
    </div>
  );
}

export function MfaSetup({ onDone, onCancel, pending }) {
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);   // {backupCodes, user} once enabled; the session exists from here
  const restartIfExpired = (err) => { if (err.body?.restart) onCancel(); };
  useEffect(() => { api.post('mfa-setup').then(setSetup).catch((e) => { setError(e.message); restartIfExpired(e); }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const qrSvg = (() => {
    if (!setup) return '';
    const qr = qrcode(0, 'M'); qr.addData(setup.otpauth); qr.make();
    return qr.createSvgTag({ cellSize: 5, margin: 2, scalable: true });
  })();
  const submit = async (e) => {
    e?.preventDefault(); setBusy(true); setError('');
    try { setDone(await api.post('mfa-enable', { code })); }
    catch (err) { setError(err.message); setCode(''); restartIfExpired(err); } finally { setBusy(false); }
  };
  useEffect(() => { if (code.length === 6 && !busy && setup) submit(); }, [code]); // eslint-disable-line react-hooks/exhaustive-deps
  if (done) return <Shell title="Two-factor is on" intro="You’re signed in. From now on, signing in needs your password and a code from your phone."><BackupCodes codes={done.backupCodes} onDone={() => onDone(done.user)} /></Shell>;
  return (
    <Shell title="Set up two-factor sign-in" pending={pending} onCancel={onCancel}
      intro="Your password is correct. Because this dashboard holds participants’ personal data, everyone also needs a second step: a 6-digit code from an app on your phone. Setting it up takes about a minute.">
      <ol className="mt-6 space-y-5 text-sm">
        <li className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand text-xs font-bold text-white">1</span>
          <span>Install or open an authenticator app on your phone: <strong>Google Authenticator</strong>, <strong>Microsoft Authenticator</strong>, 1Password or similar.</span></li>
        <li className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand text-xs font-bold text-white">2</span>
          <div className="min-w-0 flex-1">
            <span>In the app, tap <strong>+</strong> or <strong>Add account</strong>, then scan this QR code. Can’t scan? Choose “enter a setup key” and type the key below.</span>
            {setup ? (
              <div className="mt-3 flex flex-col items-center gap-3 rounded-xl border border-theme-border-primary bg-white p-4">
                <div className="h-44 w-44" role="img" aria-label="QR code for your authenticator app" dangerouslySetInnerHTML={{ __html: qrSvg }} />
                <div className="flex items-center gap-1 font-mono text-xs tracking-wider text-theme-text-secondary"><Key size={14} />{setup.secret}<CopyButton text={setup.secret.replace(/\s/g, '')} /></div>
              </div>
            ) : !error && <div className="mt-3 h-52 animate-pulse rounded-xl bg-theme-bg-tertiary" />}
          </div></li>
        <li className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand text-xs font-bold text-white">3</span>
          <form className="min-w-0 flex-1 space-y-3" onSubmit={submit}>
            <span>The app now shows <strong>hopnøsis admin</strong> with a 6-digit code that changes every 30 seconds. Type the current code here.</span>
            <CodeInput value={code} onChange={(v) => { setCode(v); if (error) setError(""); }} autoFocus={false} error={!!error} busy={busy} />
            {error && <p className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-danger" role="alert">{error}</p>}
            <button className="btn btn-md btn-primary w-full" disabled={busy || code.length !== 6 || !setup}>{busy ? 'Checking…' : 'Turn on two-factor'}</button>
          </form></li>
      </ol>
    </Shell>
  );
}

export function MfaVerify({ onDone, onCancel, pending }) {
  const [code, setCode] = useState('');
  const [backup, setBackup] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e?.preventDefault(); setBusy(true); setError('');
    try { onDone((await api.post('mfa-verify', { code })).user); }
    catch (err) { setError(err.message); setCode(''); if (err.body?.restart) onCancel(); } finally { setBusy(false); }
  };
  useEffect(() => { if (code.length === (backup ? 8 : 6) && !busy) submit(); }, [code]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Shell title="Two-factor verification" pending={pending} onCancel={onCancel}
      intro={backup
        ? <>Enter one of the 8-character <strong>backup codes</strong> you saved when you set up two-factor. Each code works once.</>
        : <>Password accepted. <strong>Step 2 of 2:</strong> open your authenticator app (Google or Microsoft Authenticator, 1Password…), find <strong>hopnøsis admin</strong>, and enter the 6-digit code it shows. It submits by itself.</>}>
      <form className="mt-6 space-y-4" onSubmit={submit}>
        <CodeInput value={code} onChange={(v) => { setCode(v); if (error) setError(""); }} backup={backup} error={!!error} busy={busy} />
        {error && <p className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
        <button className="btn btn-md btn-primary w-full" disabled={busy || (backup ? code.length !== 8 : code.length !== 6)}>{busy ? 'Checking…' : 'Verify'}</button>
        <button type="button" className="btn btn-sm btn-ghost w-full" onClick={() => { setBackup((b) => !b); setCode(''); setError(''); }}>
          {backup ? <><DeviceMobile size={14} />Use my authenticator app</> : <><CopySimple size={14} />Lost your phone? Use a backup code</>}
        </button>
      </form>
    </Shell>
  );
}

// Modal used before exports and team changes; resolves true when verified.
export function StepUpHost() {
  const [request, setRequest] = useState(null);
  const [code, setCode] = useState('');
  const [backup, setBackup] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.setStepUpPrompt((reason) => new Promise((resolve) => { setCode(''); setError(''); setBackup(false); setRequest({ resolve, reason }); }));
    return () => api.setStepUpPrompt(null);
  }, []);
  useEffect(() => {
    if (!request) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') close(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  const close = (ok) => { request?.resolve(ok); setRequest(null); };
  const submit = async (e) => {
    e?.preventDefault(); setBusy(true); setError('');
    try { await api.post('step-up', { code }); close(true); }
    catch (err) { setError(err.message); setCode(''); } finally { setBusy(false); }
  };
  useEffect(() => { if (request && code.length === (backup ? 8 : 6) && !busy) submit(); }, [code]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!request) return null;
  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center bg-[#0b1c29]/50 p-0 backdrop-blur-sm animate-in fade-in duration-200 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="stepup-title">
      <div className="relative w-full rounded-t-2xl border border-theme-border-primary bg-theme-bg-secondary p-6 shadow-2xl animate-in slide-in-from-bottom sm:max-w-sm sm:rounded-2xl sm:zoom-in-95 duration-200">
        <button className="absolute right-3 top-3 rounded-lg p-1.5 text-theme-text-muted hover:bg-theme-bg-hover" onClick={() => close(false)} aria-label="Cancel"><X size={18} weight="bold" /></button>
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-soft text-accent-strong"><ShieldCheck size={22} weight="duotone" /></span>
          <div className="pr-6">
            <h2 id="stepup-title" className="text-lg">Two-factor check</h2>
            <p className="text-xs text-theme-text-muted">Confirm it’s you to {request.reason || 'continue'}.</p>
          </div>
        </div>
        {backup ? (
          <p className="mt-4 text-sm text-theme-text-secondary">Enter one of your 8-character <strong>backup codes</strong>. Each code works once.</p>
        ) : (
          <ol className="mt-4 space-y-1.5 rounded-xl bg-theme-bg-tertiary p-3.5 text-sm text-theme-text-secondary">
            <li className="flex gap-2"><span className="font-semibold text-accent-strong">1</span><span>Open your <strong>authenticator app</strong> (Google or Microsoft Authenticator, 1Password…).</span></li>
            <li className="flex gap-2"><span className="font-semibold text-accent-strong">2</span><span>Find <strong>hopnøsis admin</strong>.</span></li>
            <li className="flex gap-2"><span className="font-semibold text-accent-strong">3</span><span>Type the 6-digit code below. It changes every 30 seconds.</span></li>
          </ol>
        )}
        <form className="mt-4 space-y-3" onSubmit={submit}>
          <CodeInput value={code} onChange={(v) => { setCode(v); if (error) setError(""); }} backup={backup} error={!!error} busy={busy} />
          {error && <p className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
          <button className={cx('btn btn-md btn-primary w-full')} disabled={busy || (backup ? code.length !== 8 : code.length !== 6)}>{busy ? 'Checking…' : 'Confirm'}</button>
          <button type="button" className="btn btn-sm btn-ghost w-full" onClick={() => { setBackup((b) => !b); setCode(''); }}>{backup ? 'Use my authenticator app' : 'Don’t have your phone? Use a backup code'}</button>
        </form>
        <p className="mt-3 text-center text-xs text-theme-text-muted">You won’t be asked again for 15 minutes. This extra check protects participants’ personal data.</p>
      </div>
    </div>
  );
}

export function MfaAccountCard() {
  const [status, setStatus] = useState(null);
  const [codes, setCodes] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api.get('mfa-status').then(setStatus).catch((e) => setError(e.message)); }, []);
  const regenerate = async () => {
    setError('');
    try { setCodes((await api.post('backup-codes')).backupCodes); api.get('mfa-status').then(setStatus); } catch (e) { setError(e.message); }
  };
  return (
    <div className="space-y-4 text-sm">
      {status && (
        <p className="flex items-center gap-2"><ShieldCheck size={18} weight="fill" className="text-success" />
          Two-factor is on{status.enabledAt ? ` since ${new Date(status.enabledAt).toLocaleDateString('en-ZA')}` : ''}. {status.backupCodesLeft} backup code{status.backupCodesLeft === 1 ? '' : 's'} left.</p>
      )}
      {error && <p className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-danger" role="alert">{error}</p>}
      {codes ? <BackupCodes codes={codes} onDone={() => setCodes(null)} /> : (
        <button className="btn btn-md btn-outline" onClick={regenerate}>Make new backup codes</button>
      )}
      <p className="text-xs text-theme-text-muted">New codes replace the old ones. Lost your phone? Ask an owner to reset your two-factor, then set it up again.</p>
    </div>
  );
}
