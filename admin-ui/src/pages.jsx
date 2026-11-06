// hopnøsis quiz admin pages. Overview, Insights and Sign-ups are new for the quiz; Team and
// Account are copied unchanged from the PowerHER admin (investec powerher/server/admin-ui).
import { useEffect, useState } from 'react';
import { CheckCircle, UsersThree, Target, ShareNetwork, EnvelopeSimple, DownloadSimple, UserPlus, Sparkle, Storefront, MapPin, Cake, Shuffle } from 'phosphor-react';
import { api } from './api.js';
import { useLive, useLiveApi } from './live.jsx';
import { Loader, Empty, PageHead, Card, Kpi, BarRows, Columns, ConfirmButton, CopyLink, SearchBox, Pagination, fmt, when, pct, cx } from './ui.jsx';
import { ChangePassword } from './auth.jsx';
import { MfaAccountCard } from './mfa.jsx';

const FLAVOURS = {
  classic: { label: 'Classic AF', archetype: 'The Smooth Operator', bar: 'bg-flavour-classic', dot: 'bg-flavour-classic' },
  mango: { label: 'Mango AF', archetype: 'The Main Character', bar: 'bg-flavour-mango', dot: 'bg-flavour-mango' },
  lime: { label: 'Lime AF', archetype: 'The Wild Card', bar: 'bg-flavour-lime', dot: 'bg-flavour-lime' },
};
const SOURCES = { can: 'Can QR (Taplink)', poster: 'Poster', board: 'Event board', none: 'Direct link', test: 'Test' };
const sourceLabel = (s) => SOURCES[s] || s;

// ---- Shared filters: day (SAST) and source, remembered for the browser tab --------------
const FILTER_KEY = 'hq.filters';
function useFilters() {
  const read = () => { try { return JSON.parse(sessionStorage.getItem(FILTER_KEY)) || { day: '', source: '' }; } catch { return { day: '', source: '' }; } };
  const [f, setF] = useState(read);
  useEffect(() => {
    const on = () => setF(read());
    window.addEventListener('hq:filters', on);
    return () => window.removeEventListener('hq:filters', on);
  }, []);
  const set = (next) => {
    const v = { ...f, ...next };
    try { sessionStorage.setItem(FILTER_KEY, JSON.stringify(v)); } catch { /* private mode */ }
    setF(v);
    window.dispatchEvent(new Event('hq:filters'));
  };
  const params = Object.fromEntries(Object.entries(f).filter(([, v]) => v));
  return [f, set, params];
}

function Filters({ filters, setFilters }) {
  const opts = useLiveApi('filters');
  const days = opts.data?.days || [];
  const sources = opts.data?.sources || [];
  const dayLabel = (d) => new Intl.DateTimeFormat('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${d}T12:00:00`));
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select className="input w-auto py-2" value={filters.day} onChange={(e) => setFilters({ day: e.target.value })} aria-label="Day">
        <option value="">All days</option>
        {days.map((d) => <option key={d.day} value={d.day}>{dayLabel(d.day)} · {fmt.format(d.runs)}</option>)}
      </select>
      <select className="input w-auto py-2" value={filters.source} onChange={(e) => setFilters({ source: e.target.value })} aria-label="Source">
        <option value="">All sources</option>
        {sources.map((s) => <option key={s.source} value={s.source}>{sourceLabel(s.source)} · {fmt.format(s.runs)}</option>)}
      </select>
    </div>
  );
}

function FlavourDot({ k }) {
  return <span className={cx('inline-block h-2.5 w-2.5 rounded-full ring-1 ring-black/10', FLAVOURS[k]?.dot || 'bg-theme-text-muted')} aria-hidden="true" />;
}

// Single series, one bar per flavour in its own can colour, value and share written out.
function FlavourBars({ rows, total }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  const top = rows.some((r) => r.count > 0) ? rows.reduce((b, r) => (r.count > b.count ? r : b), rows[0]).key : null;
  return (
    <ul className="space-y-4">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm mb-1.5">
            <span className="flex items-center gap-2 font-semibold"><FlavourDot k={r.key} />{r.label}
              <span className="font-normal text-theme-text-muted">· {r.archetype}</span>
              {r.key === top && <span className="tag bg-brand-soft text-brand">Leading</span>}</span>
            <span className="tabular-nums whitespace-nowrap">{fmt.format(r.count)} <span className="text-theme-text-muted">{pct(r.count, total)}%</span></span>
          </div>
          <div className="h-4 rounded-r bg-theme-bg-tertiary" aria-hidden="true">
            <span className={cx('block h-full rounded-r transition-all duration-700', FLAVOURS[r.key]?.bar)} style={{ width: `${(r.count / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function ExportButton({ kind, label, params }) {
  return <button className="btn btn-md btn-outline" onClick={() => api.download(kind, params)}><DownloadSimple size={16} weight="bold" />{label}</button>;
}

// ---- Overview ------------------------------------------------------------------------------
export function Overview() {
  const [filters, setFilters, params] = useFilters();
  const o = useLiveApi('overview', params);
  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <PageHead eyebrow="What the AF are you? · live" title="Overview" sub="Who’s taking the quiz, what they get, and what they do next. Updates every 10 seconds.">
        <Filters filters={filters} setFilters={setFilters} />
        <ExportButton kind="runs" label="Quiz data (CSV)" params={params} />
      </PageHead>
      <Loader state={o} lines={8}>{(d) => {
        const k = d.kpis;
        const finished = k.finished || 0;
        const judged = k.nail_answered - k.nail_untried;
        if (!k.started) return <Empty icon={Sparkle} title="No quiz runs yet">{filters.day || filters.source ? 'Nothing matches these filters. Try All days or All sources.' : 'Results appear here as soon as someone taps Find out.'}</Empty>;
        return (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <Kpi icon={UsersThree} label="Started" value={k.started} sub={`${fmt.format(k.tiebreaks)} needed a tiebreak`} />
              <Kpi icon={CheckCircle} label="Finished" value={finished} sub={`${pct(finished, k.started)}% completion`} help="Reached a result. Completion = finished ÷ started." />
              <Kpi icon={Target} label="Did we nail it?" value={judged ? `${pct(k.nail_right, judged)}%` : '—'} sub={`${fmt.format(k.nail_right)} of ${fmt.format(judged)} said yes`} help="Share of people whose actual favourite matched their quiz result. Excludes “Haven’t tried them yet”." />
              <Kpi icon={EnvelopeSimple} label="Email sign-ups" value={k.signups} tone="gold" sub={`${pct(k.optins, finished)}% of finishers opted in`} />
              <Kpi icon={ShareNetwork} label="Shared a result" value={k.shared} sub={`${pct(k.shared, finished)}% of finishers`} />
            </div>

            <div className="grid gap-6 lg:grid-cols-5">
              <Card className="lg:col-span-3" eyebrow="Results" title="Flavour split" help="Quiz results among people who finished." aside={<span className="text-theme-text-muted">{fmt.format(finished)} results</span>}>
                <FlavourBars rows={d.flavours} total={finished} />
              </Card>
              <Card className="lg:col-span-2" eyebrow="After the result" title="What people did next" help="Share of finishers who did each at least once.">
                <BarRows total={finished} rows={[
                  { key: 'share', label: 'Shared their card', count: k.shared },
                  { key: 'shop', label: 'Tapped Try your type (4-pack)', count: k.shop },
                  { key: 'mix', label: 'Tapped the mixed 6-pack', count: k.mix },
                  { key: 'insight', label: 'Answered the research questions', count: k.insights },
                  { key: 'optin', label: 'Joined the Hopnotised (email)', count: k.optins },
                ]} />
              </Card>
            </div>

            <Card eyebrow="Activity" title={d.series.unit === 'hour' ? 'Quizzes finished by hour (SAST)' : 'Quizzes finished by day'}>
              <Columns caption="Quizzes finished over time" points={d.series.points.map((p) => ({ key: p.label, label: p.label, tip: p.tip, value: p.finished }))} />
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card eyebrow="Accuracy" title="Did we nail it?" help="Rows: the quiz result. Columns: the flavour people said they actually prefer.">
                <NailMatrix nail={d.nail} />
              </Card>
              <Card eyebrow="Traffic" title="Where people came from">
                <BarRows total={k.started} rows={d.sources.map((s) => ({ key: s.source, label: sourceLabel(s.source), count: s.runs }))} />
                <p className="mt-3 text-xs text-theme-text-muted">Tagged by the link: can QR via Taplink, poster and board QR codes.</p>
              </Card>
            </div>

            <Card eyebrow="Live" title="Latest results">
              <ul className="divide-y divide-theme-border-secondary">
                {d.recent.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                    <span className="flex items-center gap-2"><FlavourDot k={r.flavour} /><span className="font-semibold">{FLAVOURS[r.flavour]?.label}</span>
                      {r.tiebreak && <span className="tag bg-theme-bg-tertiary text-theme-text-muted">Tiebreak</span>}
                      {r.nailed && <span className="text-theme-text-muted">· actually likes {r.nailed === 'untried' ? 'nothing yet' : FLAVOURS[r.nailed]?.label}</span>}</span>
                    <span className="flex items-center gap-2 text-xs text-theme-text-muted">
                      {r.shared && <span className="tag bg-accent-soft text-accent-strong">Shared</span>}
                      {r.shop && <span className="tag bg-accent-soft text-accent-strong">Shop</span>}
                      {r.optin && <span className="tag bg-gold-soft text-gold-ink">Signed up</span>}
                      {sourceLabel(r.source || 'none')} · {when(r.at)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </>
        );
      }}</Loader>
    </div>
  );
}

function NailMatrix({ nail }) {
  const cols = nail.actual;
  const keys = Object.keys(FLAVOURS);
  const any = cols.some((c) => c.count > 0);
  if (!any) return <Empty compact title="No answers yet">Shown under the result: “Which one’s actually your favourite?”</Empty>;
  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className="w-full min-w-[420px] text-sm">
        <thead><tr className="text-xs text-theme-text-muted"><th className="py-2 text-left font-semibold">Quiz said ↓ · Actually likes →</th>{cols.map((c) => <th key={c.key} className="py-2 px-2 text-right font-semibold">{c.label}</th>)}</tr></thead>
        <tbody className="divide-y divide-theme-border-secondary">
          {keys.map((k) => (
            <tr key={k}>
              <th scope="row" className="py-2 text-left font-normal"><span className="flex items-center gap-2"><FlavourDot k={k} />{FLAVOURS[k].label}</span></th>
              {cols.map((c) => {
                const n = nail.matrix?.[k]?.[c.key] || 0;
                return <td key={c.key} className={cx('py-2 px-2 text-right tabular-nums', c.key === k && n > 0 && 'font-bold text-accent-strong')}>{n || <span className="text-theme-text-muted">·</span>}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-theme-text-muted">Bold = the quiz got it right.</p>
    </div>
  );
}

// ---- Insights ------------------------------------------------------------------------------
export function Insights() {
  const [filters, setFilters, params] = useFilters();
  const s = useLiveApi('insights', params);
  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <PageHead eyebrow="Research questions · optional, anonymous" title="Insights" sub="Where to put hopnøsis next: who answered, where they are and where they’d buy.">
        <Filters filters={filters} setFilters={setFilters} />
      </PageHead>
      <Loader state={s} lines={8}>{(d) => (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi icon={Sparkle} label="Answered" value={d.answered} sub="at least one research question" />
            <Kpi icon={Shuffle} label="Skipped" value={d.skipped} sub="tapped Skip" />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card eyebrow="Retail preference" title="Where they’d buy or drink hopnøsis" help="Pick any, so totals can be more than the number of people.">
              {d.channels.some((c) => c.count) ? <BarRows emphasiseTop rows={d.channels} /> : <Empty compact icon={Storefront} title="No answers yet" />}
            </Card>
            <Card eyebrow="Who" title="Age">
              {d.ages.some((c) => c.count) ? <BarRows rows={d.ages} total={d.ages.reduce((a, c) => a + c.count, 0)} /> : <Empty compact icon={Cake} title="No answers yet" />}
            </Card>
            <Card eyebrow="Where" title="City">
              {d.cities.length ? <BarRows emphasiseTop rows={d.cities} total={d.cities.reduce((a, c) => a + c.count, 0)} /> : <Empty compact icon={MapPin} title="No answers yet" />}
            </Card>
            <Card eyebrow="Where" title="Top suburbs and postcodes" help="Free text, as typed. Top 15.">
              {d.suburbs.length ? <BarRows rows={d.suburbs} /> : <Empty compact icon={MapPin} title="No answers yet" />}
            </Card>
          </div>
          <Card eyebrow="The quiz" title="Which flavour each question pulls towards" help="Share of answers per question among people who finished. Useful for tuning the questions.">
            <QuestionPulls questions={d.questions} />
          </Card>
        </>
      )}</Loader>
    </div>
  );
}

function QuestionPulls({ questions }) {
  const keys = Object.keys(FLAVOURS);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-4 text-xs text-theme-text-muted">{keys.map((k) => <span key={k} className="flex items-center gap-1.5"><FlavourDot k={k} />{FLAVOURS[k].label}</span>)}</div>
      {questions.map((q, i) => {
        const total = keys.reduce((a, k) => a + (q.counts[k] || 0), 0);
        return (
          <div key={q.label} className="grid grid-cols-[minmax(0,10rem)_1fr] items-center gap-3 text-sm">
            <span className="truncate"><span className="text-theme-text-muted">Q{i + 1}</span> {q.label}</span>
            <div className="flex h-5 overflow-hidden rounded bg-theme-bg-tertiary" role="img" aria-label={keys.map((k) => `${FLAVOURS[k].label} ${pct(q.counts[k] || 0, total)}%`).join(', ')}>
              {total > 0 && keys.map((k) => {
                const p = pct(q.counts[k] || 0, total);
                return p > 0 && <span key={k} className={cx('flex items-center justify-center text-[11px] font-semibold text-flavour-ink', FLAVOURS[k].bar)} style={{ width: `${(q.counts[k] / total) * 100}%` }}>{p >= 12 ? `${p}%` : ''}</span>;
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---- Sign-ups --------------------------------------------------------------------------------
export function Signups() {
  const [filters, setFilters, params] = useFilters();
  const [q, setQ] = useState({ search: '', page: 1, perPage: 25 });
  const list = useLiveApi('signups', { ...params, ...q }, { hold: () => q.page > 1 });
  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <PageHead eyebrow="Join the Hopnotised · marketing opt-in" title="Sign-ups" sub="Emails from people who ticked “Yes, hopnøsis can email me.” Each row keeps the exact consent wording.">
        <Filters filters={filters} setFilters={setFilters} />
        <ExportButton kind="signups" label="Download CSV" params={params} />
      </PageHead>
      <Loader state={list} lines={8}>{(d) => (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi icon={EnvelopeSimple} label="Sign-ups" value={d.total} tone="gold" />
            {d.flavours.map((f) => <Kpi key={f.key} label={f.label} value={f.count} sub={FLAVOURS[f.key].archetype} />)}
          </div>
          <Card eyebrow="List" title="Email addresses" aside={<span className="text-theme-text-muted">Personal data · downloads need a fresh 2FA code</span>}>
            <SearchBox className="mb-4" value={q.search} onChange={(v) => setQ((s) => ({ ...s, search: v, page: 1 }))} placeholder="Search email" />
            <div className="overflow-x-auto rounded-xl border border-theme-border-primary scrollbar-thin">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-theme-border-primary bg-theme-bg-tertiary text-xs uppercase text-theme-text-muted">
                  <tr><th className="th">Email</th><th className="th">Quiz result</th><th className="th">Source</th><th className="th text-right">Consented</th></tr>
                </thead>
                <tbody className="divide-y divide-theme-border-secondary">
                  {d.rows.map((r) => (
                    <tr key={r.id} className="hover:bg-theme-bg-tertiary">
                      <td className="td font-semibold break-all">{r.email}</td>
                      <td className="td"><span className="flex items-center gap-2"><FlavourDot k={r.flavour} />{FLAVOURS[r.flavour]?.label || '—'}</span></td>
                      <td className="td text-theme-text-secondary">{sourceLabel(r.source || 'none')}</td>
                      <td className="td text-right text-theme-text-secondary whitespace-nowrap" title={r.consent}>{when(r.consentedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {d.rows.length === 0 && <div className="p-6"><Empty compact icon={EnvelopeSimple} title={q.search ? 'No matching emails' : 'No sign-ups yet'} /></div>}
            </div>
            <Pagination page={d.page} perPage={d.perPage} total={d.total} noun="sign-up" onPage={(p) => setQ((s) => ({ ...s, page: p }))} onPerPage={(n) => setQ((s) => ({ ...s, perPage: n, page: 1 }))} />
          </Card>
        </>
      )}</Loader>
    </div>
  );
}

// ---- Team and Account: copied unchanged from the PowerHER admin -----------------------------------
export function Team({ me }) {
  const team = useLiveApi('team');
  const [auditQ, setAuditQ] = useState({ search: '', page: 1, perPage: 25 });
  const audit = useLiveApi('audit', auditQ, { hold: () => auditQ.page > 1 });
  const [peopleQ, setPeopleQ] = useState('');
  const live = useLive();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('admin');
  const [link, setLink] = useState(null);
  const [error, setError] = useState('');
  const act = async (action, body, after) => {
    setError('');
    try { const r = await api.post(action, body); after?.(r); team.reload(); audit.reload(); } catch (err) { setError(err.message); }
  };
  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <PageHead eyebrow="Owners only" title="Team access" sub="Invite-only. Links are single use; send them directly to the person." />
      <Card eyebrow="Add someone" title="Invite a team member">
        <form className="flex flex-col gap-3 lg:flex-row" onSubmit={(e) => { e.preventDefault(); act('invite', { email, role }, (r) => { setLink({ link: r.link, note: `Invite ready for ${email.trim().toLowerCase()} · valid ${r.expiresInDays} days` }); setEmail(''); live.toast('Invite link created', 'done'); }); }}>
          <input className="input flex-1" type="email" required placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email to invite" />
          <select className="input lg:w-72" value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role">
            <option value="admin">Admin · view and export</option>
            <option value="owner">Owner · also manages access</option>
          </select>
          <button className="btn btn-md btn-primary"><UserPlus size={18} weight="bold" />Create invite link</button>
        </form>
        {error && <p className="mt-3 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
        {link && <CopyLink link={link.link} note={link.note} onClose={() => setLink(null)} />}
      </Card>
      <Loader state={team} lines={5}>{(t) => (
        <Card eyebrow="Access" title="People" aside={<span className="text-theme-text-muted">{t.users.length} account{t.users.length === 1 ? '' : 's'}</span>}>
          {t.users.length > 8 && <SearchBox className="mb-4" value={peopleQ} onChange={setPeopleQ} placeholder="Search people" />}
          <div className="overflow-x-auto rounded-xl border border-theme-border-primary scrollbar-thin">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-theme-border-primary bg-theme-bg-tertiary text-xs uppercase text-theme-text-muted">
                <tr><th className="th">Name</th><th className="th">Role</th><th className="th">Status</th><th className="th text-right">Last sign-in</th><th className="th text-right">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-theme-border-secondary">
                {t.users.filter((u) => !peopleQ || `${u.name} ${u.email} ${u.role}`.toLowerCase().includes(peopleQ.toLowerCase())).map((u) => (
                  <tr key={u.id} className="hover:bg-theme-bg-tertiary">
                    <td className="td"><span className="font-semibold">{u.name}</span>{u.id === me.id && <span className="tag ml-2 bg-theme-bg-tertiary text-theme-text-muted">You</span>}<span className="block text-xs text-theme-text-muted">{u.email}</span></td>
                    <td className="td">
                      <select className="input w-auto py-1.5" value={u.role} disabled={u.id === me.id} onChange={(e) => act('update-user', { id: u.id, role: e.target.value })} aria-label={`Role for ${u.email}`}>
                        <option value="admin">Admin</option><option value="owner">Owner</option>
                      </select>
                    </td>
                    <td className="td">{u.status === 'active' ? <span className="status-pill border-success/25 bg-success-soft text-success">Active</span> : <span className="status-pill border-theme-border-primary bg-theme-bg-tertiary text-theme-text-muted">Disabled</span>}
                      <span className={cx('block pt-1 text-xs', u.mfa ? 'text-theme-text-muted' : 'text-gold-ink')}>{u.mfa ? 'Two-factor on' : 'Two-factor not set up'}</span></td>
                    <td className="td text-right text-theme-text-secondary whitespace-nowrap">{when(u.lastLoginAt)}</td>
                    <td className="td text-right whitespace-nowrap">
                      {u.status === 'active' && <button className="btn btn-sm btn-ghost" onClick={() => act('reset-link', { id: u.id }, (r) => setLink({ link: r.link, note: `Password reset for ${u.email} · valid ${r.expiresInMinutes} minutes` }))}>Reset link</button>}
                      {u.id !== me.id && u.mfa && <ConfirmButton label="Reset 2FA" confirmLabel="Reset two-factor" onConfirm={() => act('reset-mfa', { id: u.id })} />}
                      {u.id !== me.id && (u.status === 'active'
                        ? <ConfirmButton label="Disable" confirmLabel="Disable and sign out" onConfirm={() => act('update-user', { id: u.id, status: 'disabled' })} />
                        : <button className="btn btn-sm btn-ghost" onClick={() => act('update-user', { id: u.id, status: 'active' })}>Enable</button>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {t.invites.length > 0 && (
            <div className="mt-5">
              <h3 className="text-sm font-sans font-semibold mb-2">Waiting to accept</h3>
              <ul className="space-y-2">
                {t.invites.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-3 rounded-xl border border-theme-border-secondary bg-theme-bg-tertiary px-4 py-2.5 text-sm">
                    <span>{i.email} <span className="text-theme-text-muted">· {i.role} · expires {when(i.expiresAt)}</span></span>
                    <ConfirmButton label="Revoke" confirmLabel="Revoke invite" onConfirm={() => act('revoke-invite', { id: i.id })} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}</Loader>
      <Card eyebrow="Security" title="Activity log" help="Sign-ins, exports, viewed sign-up lists and team changes.">
        <SearchBox className="mb-4" value={auditQ.search} onChange={(v) => setAuditQ((q) => ({ ...q, search: v, page: 1 }))} placeholder="Search person, action, detail or IP" />
        <Loader state={audit} lines={5}>{(a) => (
          <>
            <div className="overflow-x-auto rounded-xl border border-theme-border-primary scrollbar-thin">
              <table className="w-full min-w-[720px] text-left text-xs">
                <thead className="border-b border-theme-border-primary bg-theme-bg-tertiary uppercase text-theme-text-muted">
                  <tr><th className="th">When</th><th className="th">Who</th><th className="th">Action</th><th className="th">Detail</th><th className="th">IP</th></tr>
                </thead>
                <tbody className="divide-y divide-theme-border-secondary">
                  {a.rows.map((r, i) => (
                    <tr key={i}><td className="px-4 py-2 whitespace-nowrap text-theme-text-secondary">{when(r.at)}</td><td className="px-4 py-2">{r.email || '—'}</td><td className="px-4 py-2"><code className="rounded bg-theme-bg-tertiary px-1.5 py-0.5">{r.action}</code></td><td className="px-4 py-2">{r.detail}</td><td className="px-4 py-2 text-theme-text-muted">{r.ip}</td></tr>
                  ))}
                </tbody>
              </table>
              {a.rows.length === 0 && <div className="p-6"><Empty compact title="No matching activity" /></div>}
            </div>
            <Pagination page={a.page} perPage={a.perPage} total={a.total} noun="event" onPage={(p) => setAuditQ((q) => ({ ...q, page: p }))} onPerPage={(n) => setAuditQ((q) => ({ ...q, perPage: n, page: 1 }))} />
          </>
        )}</Loader>
      </Card>
    </div>
  );
}

export function Account({ me, signOut }) {
  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <PageHead eyebrow={me.role === 'owner' ? 'Owner' : 'Admin'} title="Your account" sub={me.email}>
        <button className="btn btn-md btn-outline md:hidden" onClick={signOut}>Sign out</button>
      </PageHead>
      {me.role === 'owner' && (
        <Card eyebrow="Owner" title="Team access">
          <p className="text-sm text-theme-text-muted mb-3">Invite people, change roles and see the activity log.</p>
          <a className="btn btn-md btn-outline no-underline" href="#/team"><UserPlus size={16} weight="bold" />Manage team</a>
        </Card>
      )}
      <Card eyebrow="Security" title="Two-factor sign-in"><MfaAccountCard /></Card>
      <Card eyebrow="Security" title="Change password"><ChangePassword /></Card>
    </div>
  );
}

