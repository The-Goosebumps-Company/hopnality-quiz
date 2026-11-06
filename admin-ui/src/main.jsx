import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
// Copied from the PowerHER admin (investec powerher/server/admin-ui), rebuilt for the hopnøsis quiz.
import { SquaresFour, EnvelopeSimple, ChartBar, UserGear, SignOut, CaretLeft, CaretRight, Warning } from 'phosphor-react';
import { api } from './api.js';
import { Login, LinkForm } from './auth.jsx';
import { MfaSetup, MfaVerify, StepUpHost } from './mfa.jsx';
import { LiveProvider, useLive, useNow } from './live.jsx';
import { LiveChip, fmt, cx } from './ui.jsx';
import Tooltip from './Tooltip.jsx';
import { Overview, Insights, Signups, Team, Account } from './pages.jsx';
import './index.css';

// Hash routes: #/overview, #/insights, #/signups, #/team, #/account,
// #/accept-invite?token=…, #/reset-password?token=…
function useRoute() {
  const read = () => {
    const [path, query = ''] = window.location.hash.replace(/^#/, '').split('?');
    return { parts: path.split('/').filter(Boolean), params: new URLSearchParams(query) };
  };
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const onHash = () => setRoute(read());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return route;
}

// Ordered by expected use (Pareto / serial position): monitor, find, follow up, analyse.
const NAV = [
  { key: 'overview', label: 'Overview', Icon: SquaresFour, count: (c) => c.finished },
  { key: 'insights', label: 'Insights', Icon: ChartBar },
  { key: 'signups', label: 'Sign-ups', Icon: EnvelopeSimple, count: (c) => c.signups, accent: true },
];

function IdleWarning() {
  const live = useLive();
  const now = useNow(10000);
  if (!live.idleExpiresAt) return null;
  const left = new Date(live.idleExpiresAt).getTime() - now;
  if (left > 5 * 60000) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-gold/30 bg-gold-soft px-4 md:px-8 py-2.5 text-sm text-gold-ink" role="alert">
      <Warning size={18} weight="fill" />
      For security you’ll be signed out {left > 60000 ? `in ${Math.ceil(left / 60000)} minutes` : 'in under a minute'} unless you’re active.
      <button className="btn btn-sm btn-outline" onClick={live.stayActive}>Stay signed in</button>
    </div>
  );
}

function NavItem({ item, current, open, counts }) {
  const active = current === item.key;
  const count = item.count && counts ? item.count(counts) : null;
  const link = (
    <a href={`#/${item.key}`} aria-current={active ? 'page' : undefined} aria-label={open ? undefined : item.label}
      className={cx('relative flex w-full items-center rounded-lg py-2 transition-colors duration-150', open ? 'gap-3 px-3' : 'justify-center px-0',
        active ? 'bg-accent-soft text-accent-strong font-semibold' : 'text-theme-text-secondary hover:bg-theme-bg-hover hover:text-theme-text-primary')}>
      <span className="relative flex shrink-0">
        <item.Icon size={20} weight={active ? 'fill' : 'regular'} />
        {!open && count > 0 && item.accent && <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-gold" />}
      </span>
      {open && (
        <span className="flex min-w-0 flex-1 items-center justify-between gap-2 text-sm">
          <span className="truncate">{item.label}</span>
          {count !== null && (
            <span className={cx('min-w-[20px] rounded-full px-1.5 py-0.5 text-center text-xs font-bold tabular-nums',
              item.accent && count > 0 ? 'bg-gold text-white' : 'bg-theme-bg-tertiary text-theme-text-muted')}>{fmt.format(count)}</span>
          )}
        </span>
      )}
    </a>
  );
  // Pulse: collapsed sidebar items get a right-hand tooltip with the label (and count).
  return open ? link : <Tooltip label={count !== null ? `${item.label} · ${fmt.format(count)}` : item.label} position="right" asChild wrapperClassName="w-full">{link}</Tooltip>;
}

function Shell({ me, current, signOut, children }) {
  const live = useLive();
  const [open, setOpen] = useState(() => { try { return localStorage.getItem('hq.sidebarOpen') !== '0'; } catch { return true; } });
  const toggle = () => setOpen((o) => { try { localStorage.setItem('hq.sidebarOpen', o ? '0' : '1'); } catch { /* ignore */ } return !o; });
  const items = me.role === 'owner' ? [...NAV, { key: 'team', label: 'Team', Icon: UserGear }] : NAV;
  return (
    <div className="flex min-h-screen w-full">
      {/* Desktop sidebar (Pulse: w-64 / w-20, p-3 nav, border-r) */}
      <aside className={cx('fixed left-0 top-0 z-30 hidden h-screen flex-col border-r border-theme-border-primary bg-theme-bg-secondary transition-all duration-300 md:flex', open ? 'w-64' : 'w-20')}>
        <a href="#/overview" className="flex items-center justify-center gap-2 border-b border-theme-border-primary p-5 no-underline">
          <img src="/assets/logo-black-gold.png" alt="hopnøsis" className={open ? "h-8 w-auto" : "h-6 w-auto"} />
          {open && <span className="text-[9px] font-semibold uppercase leading-tight tracking-[.2em] text-theme-text-muted">Quiz<br />admin</span>}
        </a>
        <nav aria-label="Main" className="flex-1 space-y-0.5 overflow-y-auto p-3 scrollbar-thin">
          {open && <p className="px-3 pb-1.5 pt-1 text-xs font-semibold uppercase tracking-wider text-theme-text-muted">What the AF are you?</p>}
          {items.map((item) => <NavItem key={item.key} item={item} current={current} open={open} counts={live.counts} />)}
        </nav>
        <div className="space-y-2 border-t border-theme-border-primary p-3">
          {open && (
            <a href="#/account" className="block rounded-lg px-3 py-2 hover:bg-theme-bg-hover no-underline">
              <p className="truncate text-sm font-semibold text-theme-text-primary">{me.name || me.email}</p>
              <p className="text-xs text-theme-text-muted">{me.role === 'owner' ? 'Owner' : 'Admin'}</p>
            </a>
          )}
          <Tooltip label={open ? '' : 'Sign out'} position="right" asChild>
            <button className={cx('flex w-full items-center rounded-lg py-2 text-sm text-theme-text-secondary hover:bg-theme-bg-hover', open ? 'gap-3 px-3' : 'justify-center')} onClick={signOut} aria-label="Sign out">
              <SignOut size={20} />{open && 'Sign out'}
            </button>
          </Tooltip>
          <Tooltip label={open ? 'Collapse sidebar' : 'Expand sidebar'} position="right" asChild>
            <button className="flex w-full items-center justify-center rounded-lg bg-theme-bg-tertiary px-3 py-2 text-theme-text-secondary hover:bg-accent hover:text-white transition" onClick={toggle} aria-label={open ? 'Collapse sidebar' : 'Expand sidebar'}>
              {open ? <CaretLeft size={18} weight="bold" /> : <CaretRight size={18} weight="bold" />}
            </button>
          </Tooltip>
        </div>
      </aside>

      <div className={cx('flex min-w-0 flex-1 flex-col transition-all duration-300', open ? 'md:ml-64' : 'md:ml-20')}>
        {/* Desktop header (Pulse: sticky, px-8 py-4, border-b) / mobile header (h-14) */}
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-theme-border-primary bg-theme-bg-secondary px-4 md:h-auto md:px-8 md:py-4">
          <div className="min-w-0">
            <p className="hidden text-[10px] font-semibold uppercase tracking-[.25em] text-theme-text-muted md:block">hopnøsis · House of Hops</p>
            <p className="truncate font-display text-lg md:text-xl text-theme-text-primary">What the AF are you? <span className="text-theme-text-muted font-normal">· quiz admin</span></p>
          </div>
          <div className="flex items-center gap-3"><LiveChip /></div>
        </header>
        <IdleWarning />
        <main className="min-w-0 flex-1 px-4 pb-24 pt-6 md:p-8" id="content">{children}</main>
      </div>

      {/* Mobile bottom nav (Pulse BottomNav: h-14, icon 22, 10px labels) */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 flex h-14 items-center justify-around border-t border-theme-border-primary bg-theme-bg-secondary px-2 md:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {[...items.slice(0, 3), { key: 'account', label: 'Account', Icon: UserGear }].map((item) => {
          const active = current === item.key;
          return (
            <a key={item.key} href={`#/${item.key}`} aria-current={active ? 'page' : undefined} className={cx('flex h-full flex-1 flex-col items-center justify-center px-1 no-underline', active ? 'text-accent-strong' : 'text-theme-text-muted')}>
              <item.Icon size={22} weight={active ? 'fill' : 'regular'} className="mb-0.5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </a>
          );
        })}
      </nav>
    </div>
  );
}

function App() {
  const route = useRoute();
  const [me, setMe] = useState(undefined);
  // After a correct password the server returns a 2FA *challenge*, not a session:
  // pending = { mfa: 'verify' | 'setup', email }. Only a passed second factor returns a user.
  const [pending, setPending] = useState(null);
  const applyAuth = (r) => {
    if (r?.user) { setPending(null); setMe(r.user); }
    else if (r?.mfa) { setMe(null); setPending({ mfa: r.mfa, ...(r.pending || {}) }); }
    else { setPending(null); setMe(null); }
  };
  useEffect(() => { api.get('me').then(applyAuth).catch(() => setMe(null)); }, []);
  useEffect(() => {
    const out = () => { api.clear(); setMe(null); setPending(null); };
    window.addEventListener('hq:signed-out', out);
    window.addEventListener('hq:mfa-required', out);
    return () => { window.removeEventListener('hq:signed-out', out); window.removeEventListener('hq:mfa-required', out); };
  }, []);
  useEffect(() => { window.scrollTo(0, 0); }, [route.parts[0]]); // eslint-disable-line react-hooks/exhaustive-deps

  const [page] = route.parts;
  const cancelSignIn = async () => { try { await api.post('mfa-cancel'); } catch { /* already gone */ } finally { api.clear(); setPending(null); setMe(null); } };
  const finished = (user) => { setPending(null); setMe(user); };
  if (page === 'accept-invite' && !pending) return <LinkForm kind="invite" token={route.params.get('token') || ''} onSignedIn={applyAuth} />;
  if (page === 'reset-password') return <LinkForm kind="reset" token={route.params.get('token') || ''} onSignedIn={applyAuth} />;
  if (me === undefined) return <div className="min-h-screen bg-theme-bg-primary" aria-busy="true"><span className="sr-only">Loading</span></div>;
  // Two-factor is mandatory and comes BEFORE any session exists.
  if (pending?.mfa === 'setup') return <MfaSetup pending={pending} onDone={finished} onCancel={cancelSignIn} />;
  if (pending?.mfa === 'verify') return <MfaVerify pending={pending} onDone={finished} onCancel={cancelSignIn} />;
  if (!me) return <Login onSignedIn={applyAuth} />;

  const current = ['insights', 'signups', 'account'].includes(page) || (page === 'team' && me.role === 'owner') ? page : 'overview';
  const signOut = async () => { try { await api.post('logout'); } finally { api.clear(); setMe(null); window.location.hash = '#/'; } };
  const body = {
    overview: <Overview />,
    insights: <Insights />,
    signups: <Signups />,
    team: <Team me={me} />,
    account: <Account me={me} signOut={signOut} />,
  }[current];

  return (
    <LiveProvider>
      <Shell me={me} current={current} signOut={signOut}>{body}</Shell>
      <StepUpHost />
    </LiveProvider>
  );
}

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);
