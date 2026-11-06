import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { api } from './api.js';
import { HandWaving, CheckCircle, Info, X } from 'phosphor-react';

// Live layer, copied from the PowerHER admin. PowerHER pushes changes over its own WebSocket
// server; the quiz admin has no socket, so it polls the cheap `pulse` endpoint every 10 s
// (only while the tab is visible). A changed `version` makes every mounted view reload silently.
// Pause buffers updates until resumed.
const LiveContext = createContext(null);
const POLL_MS = 10000;

export function LiveProvider({ children }) {
  const [state, setState] = useState({ version: null, counts: null, status: 'connecting', checkedAt: null, idleExpiresAt: null, transport: 'poll' });
  const [toasts, setToasts] = useState([]);
  const [isPaused, setPaused] = useState(false);
  const [waiting, setWaiting] = useState(0);
  const paused = useRef(false);
  const previous = useRef(null);
  const timer = useRef(null);

  const toast = useCallback((text, tone = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t.slice(-3), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), TOAST_MS);
  }, []);

  // Fetch counts + version; announce new sign-ups and finished quizzes.
  const pull = useCallback(async () => {
    try {
      const p = await api.get('pulse', undefined, { background: true });
      const before = previous.current;
      if (before) {
        const done = p.counts.finished - before.finished, signups = p.counts.signups - before.signups;
        if (paused.current) { if (p.version !== state.version) setWaiting((w) => w + Math.max(1, done + signups)); return; }
        if (signups > 0) toast(signups === 1 ? 'New email sign-up' : `${signups} new email sign-ups`, 'lead');
        else if (done > 0) toast(done === 1 ? 'Someone just found their flavour' : `${done} more quizzes finished`, 'done');
      }
      if (paused.current) return;
      previous.current = p.counts;
      setState((s) => ({ ...s, version: p.version, counts: p.counts, checkedAt: Date.now(), idleExpiresAt: p.idleExpiresAt, status: 'live' }));
    } catch (err) {
      if (err.status !== 401) setState((s) => ({ ...s, status: 'offline' }));
    }
  }, [toast]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    pull();
    timer.current = setInterval(() => { if (document.visibilityState === 'visible') pull(); }, POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') pull(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(timer.current); document.removeEventListener('visibilitychange', onVisible); };
  }, [pull]);

  const stayActive = useCallback(async () => {
    const me = await api.get('me');
    setState((s) => ({ ...s, idleExpiresAt: me.idleExpiresAt }));
  }, []);

  const togglePause = useCallback(() => {
    paused.current = !paused.current;
    setPaused(paused.current);
    if (paused.current) setState((s) => ({ ...s, status: 'paused' }));
    else { setWaiting(0); pull(); }
  }, [pull]);

  const refreshNow = useCallback(() => pull(), [pull]);

  return (
    <LiveContext.Provider value={{ ...state, paused: isPaused, waiting, togglePause, refreshNow, toast, stayActive }}>
      {children}
      <Toasts toasts={toasts} dismiss={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />
    </LiveContext.Provider>
  );
}

// Pulse toast anatomy: accent bar, icon chip, eyebrow, headline, life bar.
const TOAST_MS = 6000;
const TONES = {
  lead: { eyebrow: 'Sign-up', bar: 'bg-gold', chip: 'bg-gold-soft text-gold-ink', Icon: HandWaving },
  done: { eyebrow: 'Quiz finished', bar: 'bg-accent', chip: 'bg-accent-soft text-accent-strong', Icon: CheckCircle },
  info: { eyebrow: 'Update', bar: 'bg-brand', chip: 'bg-brand-soft text-brand', Icon: Info },
};
function Toasts({ toasts, dismiss }) {
  return (
    <div className="fixed z-[90] flex flex-col gap-2.5 left-4 right-4 bottom-4 sm:left-auto sm:bottom-auto sm:top-5 sm:right-5" role="status" aria-live="polite">
      {toasts.map((t) => {
        const tone = TONES[t.tone] || TONES.info;
        return (
          <div key={t.id} className="relative flex items-start gap-3 overflow-hidden rounded-[14px] border border-theme-border-primary bg-white/95 backdrop-blur py-3.5 pl-4 pr-3 shadow-toast sm:min-w-[340px] sm:max-w-[430px] animate-in fade-in slide-in-from-right-6 duration-300">
            <span className={`absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-r ${tone.bar}`} aria-hidden="true" />
            <span className={`grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] ${tone.chip}`}><tone.Icon size={18} weight="duotone" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[.11em] text-theme-text-muted">{tone.eyebrow}</p>
              <p className="text-sm font-semibold leading-snug text-theme-text-primary">{t.text}</p>
            </div>
            <button className="grid h-7 w-7 place-items-center rounded-md text-theme-text-muted hover:bg-theme-bg-hover" onClick={() => dismiss(t.id)} aria-label="Dismiss"><X size={14} weight="bold" /></button>
            <span className={`absolute bottom-0 left-4 right-4 h-0.5 origin-left animate-lifebar ${tone.bar}`} style={{ animationDuration: `${TOAST_MS}ms` }} aria-hidden="true" />
          </div>
        );
      })}
    </div>
  );
}

export const useLive = () => useContext(LiveContext);

// Loads an API action and reloads it silently whenever live data changes.
// `hold()` returning true parks a background result in `pending` instead of
// swapping it in (so a list doesn't move while someone is reading it).
export function useLiveApi(action, params = null, { hold } = {}) {
  const live = useLive();
  const key = JSON.stringify(params);
  const [state, setState] = useState({ data: null, error: null, loading: true, updatedAt: null, pending: null });
  const first = useRef(true);
  const holdRef = useRef(hold);
  holdRef.current = hold;
  const load = useCallback((background) => {
    if (!background) setState((s) => ({ ...s, loading: true }));
    api.get(action, params || undefined, { background })
      .then((data) => setState((s) => (background && s.data && holdRef.current?.()
        ? { ...s, pending: data }
        : { data, error: null, loading: false, updatedAt: Date.now(), pending: null })))
      .catch((error) => setState((s) => (background && s.data ? { ...s, loading: false } : { data: null, error, loading: false, updatedAt: null, pending: null })));
  }, [action, key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { first.current = true; load(false); }, [load]);
  useEffect(() => {
    if (!live?.version) return;
    if (first.current) { first.current = false; return; }
    load(true);
  }, [live?.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const applyPending = useCallback(() => setState((s) => (s.pending ? { ...s, data: s.pending, pending: null, updatedAt: Date.now() } : s)), []);
  return { ...state, reload: () => load(false), applyPending };
}

// Remembers which ids were on screen; ids that appear later are "new" for ~8 s.
export function useNewIds(rows) {
  const seen = useRef(null);
  const [fresh, setFresh] = useState(() => new Set());
  useEffect(() => {
    if (!rows) return;
    const ids = rows.map((r) => r.id);
    if (seen.current === null) { seen.current = new Set(ids); return; }
    const added = ids.filter((id) => !seen.current.has(id));
    ids.forEach((id) => seen.current.add(id));
    if (added.length) {
      setFresh((f) => new Set([...f, ...added]));
      setTimeout(() => setFresh((f) => { const n = new Set(f); added.forEach((id) => n.delete(id)); return n; }), 8000);
    }
  }, [rows]);
  return fresh;
}

// "12 s ago" that keeps itself current.
export function useNow(intervalMs = 15000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), intervalMs); return () => clearInterval(t); }, [intervalMs]);
  return now;
}
export function ago(ms, now = Date.now()) {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s} s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}
