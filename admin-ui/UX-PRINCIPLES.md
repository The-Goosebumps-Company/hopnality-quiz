# Admin dashboard: UX principles applied

Sources read (Nov 2026):
- lawsofux.com (all 29 laws)
- Nielsen Norman Group:
  - [10 usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/)
  - [response time limits](https://www.nngroup.com/articles/response-times-3-important-limits/)
  - [dashboards and preattentive processing](https://www.nngroup.com/articles/dashboards-preattentive/)
  - [data tables](https://www.nngroup.com/articles/data-tables/)
- [IBM Carbon data table usage](https://carbondesignsystem.com/components/data-table/usage/)

| Principle | Decision in this dashboard |
|---|---|
| Visibility of system status (Nielsen 1) | Sidebar live chip: *Live · updated 5 s ago*, *Paused*, *Reconnecting…* (with Retry), *Offline*. Background refreshes are silent; only first loads show skeletons. |
| User control and freedom (Nielsen 3) | Pause/resume live updates. The detail panel closes with Esc or ✕ and keeps the list's scroll and filters. |
| Error prevention (Nielsen 5) | Confirm before disabling a person or revoking an invite. The last owner can't be demoted or disabled (server rule). |
| Recognition over recall (Nielsen 6, working memory) | Active filters show as removable chips. Filters and the open record live in the URL hash, so Back works. |
| Flexibility and efficiency (Nielsen 7, Flow) | `/` focuses search and `Esc` closes the panel. Column headers sort. |
| Aesthetic and minimalist design (Nielsen 8, Occam, cognitive load) | Four headline numbers. Every chart answers one question. No pies, gauges or 3D (NN/g preattentive). |
| Error recovery and help (Nielsen 9–10) | Plain-language errors with a next step. A "?" on each metric explains how it's calculated. |
| Jakob's Law, mental models | Conventional admin layout: left sidebar, search top-left, sortable table, side detail panel. |
| Hick's Law, Pareto, serial position | Four nav items, ordered by how often they'll be used (Overview, Submissions, Leads, Answers), plus Team for owners. Completed is the first KPI and Asked for assistance the last. |
| Doherty threshold (400 ms), 0.1/1/10 s limits | Skeleton placeholders. Live polling never blocks the UI. Sorting and filtering are server-side, so pages stay fast as data grows. |
| Selective attention, change blindness | Changed KPI values get a brief highlight and a "+N" chip. New rows are tinted with a "New" label that fades after about 8 s. |
| Von Restorff | New leads use the gold accent plus a "New" label (never colour alone). Motion is off under `prefers-reduced-motion`. |
| Don't reorder under the reader (NN/g tables, live-data practice) | While someone is scrolled down, has the panel open or is past page 1, new rows queue behind a "3 new · Show" bar instead of shifting the list. |
| Notifications vs silent updates | Toasts only for actionable events (a new assistance request, new completions). KPIs and charts update silently. |
| Common region, proximity, chunking | Cards group by job: right now, trend, funnel, scores. Each label sits next to its value. |
| Table conventions (NN/g, Carbon) | Name first, numbers right-aligned with tabular figures, header stays visible while scrolling, 44px rows, row hover, pagination at the bottom. |
| Zeigarnik, peak-end | Pending invites stay visible. Invite and reset end on a clear success state with a copy button. |
| Fitts's Law | Controls at least 40px tall. Primary actions sit next to what they affect. Whole table rows are clickable. |
| Postel's Law | Search trims and ignores case. Email addresses are normalised to lowercase. |
