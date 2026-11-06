// Shared UI, built from Pulse's component recipes (spacing, radii, type scale,
// table/card/tile anatomy) with hopnøsis brand tokens (copied from the PowerHER admin). See UX-PRINCIPLES.md.
import { useEffect, useRef, useState } from 'react';
import { Question, WarningCircle, CheckCircle, Copy, Check, ArrowsClockwise, Pause, Play, X, MagnifyingGlass, CaretLeft, CaretRight } from 'phosphor-react';
import { useLive, useNow, ago } from './live.jsx';
import { Odometer } from './odometer.jsx';
import Tooltip from './Tooltip.jsx';

export const fmt = new Intl.NumberFormat('en-ZA');
const dateFmt = new Intl.DateTimeFormat('en-ZA', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Johannesburg' });
const toDate = (iso) => new Date(iso.endsWith('Z') ? iso : iso + 'Z');
export const when = (iso) => (iso ? dateFmt.format(toDate(iso)) : '—');
export const ms = (iso) => (iso ? toDate(iso).getTime() : 0);
export const pct = (n, of) => (of ? Math.round((n / of) * 100) : 0);
export const cx = (...c) => c.filter(Boolean).join(' ');

// ---- Loading, empty, error ------------------------------------------------------------

export function Skeleton({ lines = 3, className = '' }) {
  return (
    <div className={cx('space-y-3 animate-pulse', className)} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => <div key={i} className="h-4 rounded bg-theme-bg-tertiary" style={{ width: `${92 - i * 12}%` }} />)}
    </div>
  );
}

export function Loader({ state, lines = 4, children }) {
  if (state.error && !state.data) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-danger/30 bg-danger-soft p-4 text-danger" role="alert">
        <WarningCircle size={22} weight="fill" className="shrink-0" />
        <div>
          <p className="font-semibold">Couldn’t load this</p>
          <p className="text-sm mt-1">{state.error.message}</p>
          <button className="btn btn-sm btn-outline mt-3" onClick={state.reload}><ArrowsClockwise size={14} weight="bold" />Try again</button>
        </div>
      </div>
    );
  }
  if (!state.data) return <><span className="sr-only">Loading</span><Skeleton lines={lines} /></>;
  return children(state.data);
}

export function Empty({ icon: Icon, title, children, compact }) {
  return (
    <div className={cx('text-center animate-in fade-in duration-200', compact ? 'rounded-xl border border-theme-border-secondary bg-theme-bg-tertiary px-4 py-8' : 'rounded-xl border border-theme-border-primary bg-theme-bg-secondary p-16')}>
      {Icon && <Icon size={compact ? 32 : 64} weight="duotone" className="mx-auto mb-4 text-theme-text-muted" />}
      <h3 className={cx(compact ? 'text-base' : 'text-xl mb-2', 'text-theme-text-primary')}>{title}</h3>
      {children && <p className="text-sm text-theme-text-muted mt-1">{children}</p>}
    </div>
  );
}

// ---- Page structure ---------------------------------------------------------------------

// Pulse list-page header: eyebrow, h1 text-3xl, description, actions on the right.
export function PageHead({ eyebrow, title, sub, children }) {
  return (
    <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="text-2xl sm:text-3xl text-theme-text-primary mb-1">{title}</h1>
        {sub && <p className="text-sm text-theme-text-muted">{sub}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">{children}</div>}
    </div>
  );
}

export function Card({ eyebrow, title, help, aside, className = '', children }) {
  return (
    <section className={cx('card min-w-0', className)}>
      {(title || aside) && (
        <header className="card-head">
          <div className="min-w-0">
            {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
            <h2 className="card-title flex items-center gap-1.5">{title}{help && <Help text={help} />}</h2>
          </div>
          {aside && <div className="shrink-0 text-xs">{aside}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Help({ text }) {
  return (
    <Tooltip label={text} asChild>
      <span tabIndex={0} role="note" aria-label={text} className="inline-flex text-theme-text-muted hover:text-accent cursor-help">
        <Question size={15} weight="bold" />
      </span>
    </Tooltip>
  );
}

// ---- KPI tile (Pulse OperatorStatCard anatomy) ---------------------------------------
// When the value changes live it tints briefly and shows +N (change-blindness guard).
export function Kpi({ icon: Icon, label, value, display, sub, help, tone = 'accent' }) {
  const prev = useRef(value);
  const [bump, setBump] = useState(null);
  useEffect(() => {
    if (typeof value === 'number' && typeof prev.current === 'number' && value !== prev.current) {
      setBump(value - prev.current);
      const t = setTimeout(() => setBump(null), 4000);
      prev.current = value;
      return () => clearTimeout(t);
    }
    prev.current = value;
  }, [value]);
  const toneText = { accent: 'text-accent', gold: 'text-gold', brand: 'text-brand' }[tone];
  return (
    <div className={cx('rounded-xl border px-4 py-3 transition-colors duration-700', bump ? 'border-accent/40 bg-accent-soft' : 'border-theme-border-primary bg-theme-bg-secondary', tone === 'gold' && !bump && 'border-t-2 border-t-gold')}>
      <div className="flex items-center gap-2 mb-1">
        {Icon && <Icon size={16} weight="duotone" className={toneText} />}
        <p className="text-xs text-theme-text-muted">{label}</p>
        {help && <Help text={help} />}
      </div>
      <p className="flex items-baseline gap-2">
        <span className="text-2xl font-bold text-theme-text-primary tabular-nums">
          {typeof value === 'number' ? <Odometer value={value} text={display ?? fmt.format(value)} /> : (display ?? value ?? '—')}
        </span>
        {bump > 0 && <span className="rounded-full border border-accent/30 bg-theme-bg-secondary px-1.5 py-0.5 text-[11px] font-semibold text-accent-strong" aria-label={`up ${bump}`}>+{fmt.format(bump)}</span>}
      </p>
      {sub && <p className="text-xs text-theme-text-muted mt-0.5">{sub}</p>}
    </div>
  );
}

// ---- Charts (single series; values always written; peak emphasised with a label) ----

export function BarRows({ rows, total, caption, emphasiseTop = false, valueFormat }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  const top = emphasiseTop && rows.some((r) => r.count > 0) ? rows.reduce((b, r, i) => (r.count > rows[b].count ? i : b), 0) : -1;
  return (
    <table className="w-full text-sm border-collapse">
      {caption && <caption className="sr-only">{caption}</caption>}
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.key ?? r.label} className="group">
            <th scope="row" className="w-[42%] py-1.5 pr-3 text-left font-normal text-theme-text-primary align-middle">
              {r.label}
              {i === top && <span className="tag ml-2 bg-brand-soft text-brand">Most common</span>}
              {r.note && <span className="text-theme-text-muted">{r.note}</span>}
            </th>
            <td className="w-[40%] py-1.5 align-middle border-l border-theme-border-secondary" aria-hidden="true">
              <span className={cx('block h-3.5 min-w-[2px] rounded-r transition-all duration-500', i === top ? 'bg-brand' : 'bg-accent group-hover:bg-accent-strong')} style={{ width: `${(r.count / max) * 100}%` }} />
            </td>
            <td className="py-1.5 pl-3 text-right whitespace-nowrap tabular-nums align-middle">
              {valueFormat ? valueFormat(r) : fmt.format(r.count)}
              {total ? <span className="inline-block min-w-[3em] text-theme-text-muted"> {pct(r.count, total)}%</span> : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Columns({ points, caption, unit = '' }) {
  const max = Math.max(1, ...points.map((p) => p.value));
  const peak = points.reduce((b, p, i) => (p.value > points[b].value ? i : b), 0);
  return (
    <div>
      <table className="sr-only"><caption>{caption}</caption><tbody>{points.map((p) => <tr key={p.key ?? p.label}><th>{p.label}</th><td>{p.value}</td></tr>)}</tbody></table>
      <div className="grid h-64 items-end gap-1.5 pt-6" style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))`, background: 'repeating-linear-gradient(to top, var(--border-secondary) 0 1px, transparent 1px 64px)' }} aria-hidden="true">
        {points.map((p, i) => (
          <Tooltip key={p.key ?? p.label} label={`${p.tip ?? p.label}: ${fmt.format(p.value)}${unit}`} asChild>
          <div className="group flex h-full flex-col items-center">
            <div className="flex w-full flex-1 items-end justify-center">
              <span className="relative block w-[min(24px,70%)] rounded-t bg-accent transition-all duration-500 group-hover:bg-accent-strong" style={{ height: `${(p.value / max) * 100}%` }}>
                {i === peak && p.value > 0 && <span className="absolute bottom-full left-1/2 mb-1 -translate-x-1/2 text-xs font-semibold tabular-nums text-theme-text-primary">{fmt.format(p.value)}</span>}
              </span>
            </div>
            <span className="mt-1.5 w-full border-t border-theme-border-primary pt-1 text-center text-[11px] text-theme-text-muted">{p.label}</span>
          </div>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}

export function Funnel({ steps }) {
  const first = steps[0]?.count || 0;
  return (
    <ol className="space-y-3">
      {steps.map((s, i) => {
        const drop = i > 0 && steps[i - 1].count ? steps[i - 1].count - s.count : 0;
        const last = i === steps.length - 1;
        return (
          <li key={s.label}>
            <div className="flex justify-between text-sm mb-1">
              <span className={last ? 'font-semibold' : ''}>{s.label}</span>
              <span className="tabular-nums">{fmt.format(s.count)} <span className="text-theme-text-muted">{pct(s.count, first)}%</span></span>
            </div>
            <div className="h-3.5 rounded-r bg-theme-bg-tertiary" aria-hidden="true">
              <span className={cx('block h-full rounded-r transition-all duration-500', last ? 'bg-brand' : 'bg-accent')} style={{ width: `${first ? (s.count / first) * 100 : 0}%` }} />
            </div>
            {drop > 0 && <p className="text-xs text-theme-text-muted mt-1">−{fmt.format(drop)} didn’t continue</p>}
          </li>
        );
      })}
    </ol>
  );
}

// ---- Status ---------------------------------------------------------------------------

export function StatusPill({ status, lastPage }) {
  return status === 'complete'
    ? <span className="status-pill border-success/25 bg-success-soft text-success"><CheckCircle size={13} weight="fill" />Complete</span>
    : <span className="status-pill border-theme-border-primary bg-theme-bg-tertiary text-theme-text-secondary">In progress<span className="font-normal text-theme-text-muted">· {lastPage}</span></span>;
}

export function AssistTag({ value }) {
  if (value !== 'Yes' && value !== 'I’d like more info') return <span className="text-theme-text-muted">{value || '—'}</span>;
  return <span className="status-pill border-gold/40 bg-gold-soft text-gold-ink">{value === 'Yes' ? 'Wants help' : 'Wants info'}</span>;
}

export function LiveChip({ compact }) {
  const live = useLive();
  const now = useNow(5000);
  const label = {
    live: `Live · ${live.checkedAt ? ago(live.checkedAt, now) : 'connected'}`,
    connecting: 'Connecting…',
    paused: live.waiting ? `Paused · ${live.waiting} waiting` : 'Paused',
    reconnecting: 'Reconnecting…',
    offline: 'Offline',
  }[live.status] || live.status;
  const dot = { live: 'bg-accent animate-live-pulse', paused: 'bg-theme-text-muted', reconnecting: 'bg-gold', connecting: 'bg-gold', offline: 'bg-danger' }[live.status] || 'bg-theme-text-muted';
  const canRetry = live.status === 'offline' || live.status === 'reconnecting';
  return (
    <div className={cx('inline-flex items-center gap-2 rounded-lg border border-theme-border-primary bg-theme-bg-secondary pl-3 pr-1 py-1 text-xs', compact && 'border-0 pl-1')}>
      <span className={cx('h-2 w-2 shrink-0 rounded-full', dot)} aria-hidden="true" />
      <Tooltip label="Checks for new results every 10 seconds while this tab is open" position="bottom" asChild>
        <span role="status" tabIndex={0} className="font-medium text-theme-text-secondary whitespace-nowrap">{label}</span>
      </Tooltip>
      <Tooltip label={canRetry ? 'Retry now' : live.paused ? 'Resume live updates' : 'Pause live updates'} position="bottom" asChild>
      <button className="btn btn-sm btn-ghost px-2" onClick={canRetry ? live.refreshNow : live.togglePause} aria-pressed={!canRetry ? live.paused : undefined}
        aria-label={canRetry ? 'Retry connection' : live.paused ? 'Resume live updates' : 'Pause live updates'}>
        {canRetry ? <ArrowsClockwise size={14} weight="bold" /> : live.paused ? <Play size={14} weight="bold" /> : <Pause size={14} weight="bold" />}
      </button>
      </Tooltip>
    </div>
  );
}

// ---- Forms and actions -----------------------------------------------------------------

export function Field({ label, hint, children }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-sm font-semibold text-theme-text-primary">{label}</span>
      {children}
      {hint && <span className="block text-xs text-theme-text-muted">{hint}</span>}
    </label>
  );
}

export function ConfirmButton({ label, confirmLabel, onConfirm }) {
  const [asking, setAsking] = useState(false);
  if (!asking) return <button className="btn btn-sm btn-ghost" onClick={() => setAsking(true)}>{label}</button>;
  return (
    <span className="inline-flex gap-1 animate-in fade-in duration-150">
      <button className="btn btn-sm btn-danger" onClick={() => { setAsking(false); onConfirm(); }}>{confirmLabel}</button>
      <button className="btn btn-sm btn-ghost" onClick={() => setAsking(false)}>Cancel</button>
    </span>
  );
}

export function CopyButton({ text, label }) {
  const [done, setDone] = useState(false);
  return (
    <Tooltip label={done ? 'Copied' : 'Copy to clipboard'} asChild>
    <button type="button" className="btn btn-sm btn-ghost px-1.5" aria-label={label || `Copy ${text}`} onClick={async (e) => {
      e.stopPropagation();
      try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* blocked */ }
    }}>{done ? <Check size={14} weight="bold" className="text-success" /> : <Copy size={14} weight="bold" />}{label && <span>{done ? 'Copied' : label}</span>}</button>
    </Tooltip>
  );
}

export function CopyLink({ link, note, onClose }) {
  return (
    <div className="mt-4 rounded-xl border border-success/25 bg-success-soft p-4 animate-in fade-in slide-in-from-top-1 duration-200">
      <div className="flex items-start justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-success"><CheckCircle size={18} weight="fill" />{note}</p>
        {onClose && <button className="btn btn-sm btn-ghost px-1.5" onClick={onClose} aria-label="Dismiss"><X size={14} weight="bold" /></button>}
      </div>
      <div className="mt-3 flex gap-2">
        <input readOnly value={link} onFocus={(e) => e.target.select()} aria-label="One-time link" className="input font-mono text-xs" />
        <CopyButton text={link} label="Copy" />
      </div>
      <p className="mt-2 text-xs text-theme-text-muted">Shown once. Send it to the person directly; it only works for their email address.</p>
    </div>
  );
}

// ---- Search + pagination (shared by every list) -----------------------------------------

// Debounced search box (Pulse search recipe). Commits after 300 ms or on Enter.
export function SearchBox({ value, onChange, placeholder, inputRef, className = '' }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  useEffect(() => {
    if (text.trim() === value) return undefined;
    const t = setTimeout(() => onChange(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <form role="search" className={cx('relative flex-1', className)} onSubmit={(e) => { e.preventDefault(); onChange(text.trim()); }}>
      <MagnifyingGlass size={20} weight="bold" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-theme-text-muted" />
      <input ref={inputRef} type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="input pl-10 pr-9" />
      {text && <button type="button" onClick={() => { setText(''); onChange(''); }} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-theme-text-muted hover:bg-theme-bg-hover" aria-label="Clear search"><X size={14} weight="bold" /></button>}
    </form>
  );
}

// Numbered pagination with range summary and page size (NN/g: at the bottom of the table).
export function Pagination({ page, perPage, total, onPage, onPerPage, noun = 'result' }) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  const from = total ? (page - 1) * perPage + 1 : 0, to = Math.min(total, page * perPage);
  const nums = [];
  for (let p = 1; p <= pages; p++) if (p === 1 || p === pages || Math.abs(p - page) <= 1) nums.push(p); else if (nums[nums.length - 1] !== '…') nums.push('…');
  return (
    <div className="mt-4 flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <p className="text-theme-text-muted" aria-live="polite">
        {total ? <>Showing <span className="font-semibold text-theme-text-primary tabular-nums">{fmt.format(from)}–{fmt.format(to)}</span> of <span className="font-semibold text-theme-text-primary tabular-nums">{fmt.format(total)}</span> {noun}{total === 1 ? '' : 's'}</> : `No ${noun}s`}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        {onPerPage && (
          <label className="flex items-center gap-2 text-theme-text-muted">Per page
            <select className="input w-auto py-1.5" value={perPage} onChange={(e) => onPerPage(Number(e.target.value))}>{[25, 50, 100].map((n) => <option key={n}>{n}</option>)}</select>
          </label>
        )}
        {pages > 1 && (
          <nav className="flex items-center gap-1" aria-label="Pagination">
            <button className="btn btn-sm btn-outline px-2" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><CaretLeft size={14} weight="bold" /></button>
            {nums.map((n, i) => n === '…'
              ? <span key={`e${i}`} className="px-1 text-theme-text-muted">…</span>
              : <button key={n} onClick={() => onPage(n)} aria-current={n === page ? 'page' : undefined}
                  className={cx('h-8 min-w-[2rem] rounded-lg px-2 text-sm font-semibold tabular-nums transition', n === page ? 'bg-brand text-white' : 'border border-theme-border-primary bg-theme-bg-secondary hover:border-accent')}>{fmt.format(n)}</button>)}
            <button className="btn btn-sm btn-outline px-2" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><CaretRight size={14} weight="bold" /></button>
          </nav>
        )}
      </div>
    </div>
  );
}
