# hopnøsis hop-nality quiz

**"What the AF are you?"**: plain HTML, CSS and JavaScript with no build step, plus a small PHP and MariaDB API for sign-ups and anonymous stats.
- **Client brief (source of truth):** `../context/creative-brief-nov-2026.md`
- **Copy:** `../context/hopnality-quiz-copy.md` (v0.2; our drafted lines are marked for sign-off)
- **Background:** `../context/hopnality-quiz.md`

## Files
- `index.html`: all four screens (welcome, question, loading, result)
- `data.js`: **all copy, scoring and shop links**. Edit this to change wording.
- `app.js`: quiz flow, scoring, and share-card image generation (canvas)
- `styles.css`: themes per flavour (Classic black/gold, Mango orange, Lime green)
- `assets/can-*`: the three shop can photos plus the client-supplied Unicorn AF artwork
- `api/`: `subscribe.php` (email sign-up), `track.php` (anonymous per-run stats), `lib.php` (shared helpers), `schema.sql`
- `deploy/`: `deploy.sh`, `server-setup.sh`, `stats.sh`, `export-subscribers.sh`
- `print/`: the A4 QR poster (`poster.html`, run `print/render.sh` to rebuild `print/out/*.pdf|png`) and QR SVGs for the poster (`?src=poster`) and the board (`?src=board`). These are not published with the site.

## Run locally
```bash
python3 -m http.server 8765 --directory quiz
```
Then open http://localhost:8765. To jump straight to a result, add `?result=classic`, `?result=mango`, `?result=lime` or `?result=unicorn`.

## How it works
- **Questions:** the client brief's six questions stay verbatim. The Unicorn handover inserts one supplied four-answer question after original Q3, making seven questions; answers are shuffled.
- **Scoring:** original Q1–Q5 count one point each. New Q4 adds a regular flavour point or sets the Unicorn candidate flag. Unicorn requires that flag plus a 2–2–1 split across the original five personality answers. Otherwise the regular high score wins; a tie uses original Q5, then Classic → Mango → Lime as the fixed fallback. Original Q6/new Q7 is analytics-only.
- **Result screen:** the archetype card, a 2–3 sentence description, **Try your type** (that flavour's 4-pack, The Quartet), Share and Save square.
- **Under the result:**
  - **Did we nail it?** asks for their actual favourite, which is stored separately from the quiz result.
  - **Try all three** links to the mixed 6-pack.
  - **Optional research questions:** age band, city, suburb and where they'd buy. They're anonymous and skippable.
  - **The email opt-in**, kept separate.
- **Stats:** every run is one anonymous row in `results` (`api/track.php`), with no IP, name or email. It records start and finish, the result (including Unicorn AF), all seven picks, "Did we nail it?", the research answers, and share, shop, mixed-pack and opt-in clicks. Where there's no backend (the GitHub Pages preview), tracking does nothing.
- **Share** builds a 1080×1920 story image. On phones it opens the native share sheet. On desktop it downloads the image and copies the caption.
- **Save square image** builds a 1080×1080 image.

## Email sign-up ("Join the Hopnotised")
On the result screen, people can leave an email address and tick a consent box. The box is never pre-ticked.
- **What happens on submit:** the form sends `{email, consent, flavour, source, started_at, website}` to `api/subscribe.php`. That stores one row per email in `subscribers`, along with the exact consent wording, the time (UTC), the IP address and the browser. If the same email signs up again, its consent record is updated. `source` comes from `?src=` on the quiz link, for example `?src=can`.
- **Abuse protection,** borrowed from Pulse's public contact form:
  - a hidden `website` honeypot and a 2-second minimum before submitting. Bots get a normal "You're in" response and nothing is stored.
  - 40 requests per IP every 5 minutes. That's generous on purpose, because a venue's Wi-Fi puts everyone behind one IP.
  - only same-origin JSON requests are accepted.
  - there's no CAPTCHA, and no email is sent for each sign-up.
- **Wording:** the consent text lives in two places, `index.html` and `CONSENT_TEXT` in `api/subscribe.php`. Change both together.
- **Export:** `deploy/export-subscribers.sh > ~/Downloads/hopnosis-subscribers.csv`. Use `--count` to get just the numbers. The file holds personal data, so don't commit it.
- **Not built yet:** unsubscribing is handled by whatever tool sends the emails later. Import from the CSV, and remove anyone who unsubscribes from the database too.
- **Preview copy:** the sign-up form only works on the server. On the GitHub Pages copy it shows "That didn't go through".

## Admin for Kelly (`/admin`)
`https://quiz.hopnosis.co.za/admin/` is a dashboard **reused from the PowerHER admin** (`investec powerher/server`). The code was copied, not shared at runtime: it runs on the quiz's own database, PHP pool and user, and never touches PowerHER's.
- **Copied:**
  - `api/lib/admin_auth.php` and `api/lib/mfa.php`: invite-only accounts, password policy plus the breached-password check, lockouts, mandatory TOTP 2FA (a password alone only earns a 2FA challenge), step-up 2FA for exports and team changes, and the audit log.
  - The React/Vite/Tailwind UI in `admin-ui/`: sign-in, 2FA, Team, Account, and the KPI, chart and table components.
- **Changed:**
  - The `hq_*` helpers (`api/lib/core.php`) replace PowerHER's.
  - Its own cookies (`__Host-hq_admin` and `__Host-hq_mfa`).
  - An `admin_rate_limits` table.
  - The WebSocket live layer became 10-second polling.
  - hopnøsis branding.
- **Pages:**
  - **Overview:** completion, flavour split, "Did we nail it?" matrix, click-throughs, sources, activity by hour or day, latest results.
  - **Insights:** where they'd buy, age, city, suburbs, and which flavour each question pulls towards.
  - **Sign-ups:** the email list and a CSV download (needs a fresh 2FA code).
  - **Team and Account.**
  - Every page filters by day (SAST) and source.
- **API:** `api/admin.php?action=…`, the same flow as PowerHER's `admin-api.php`. Data queries are in `api/lib/admin_data.php`.
- **First owner** (on the server, after deploying):
  ```bash
  ssh powerher 'sudo -u hopnosis php /var/www/quiz.hopnosis.co.za/current/bin/invite-owner.php kelly@theliquidcollective.co.za'
  ```
  Send Kelly the printed link (valid 7 days). She chooses a password and scans the 2FA QR code with an authenticator app. After that she invites the others from the Team page.
- **Build:** `deploy/deploy.sh` builds `admin-ui` from the deployed commit into `release/admin`. Locally: `cd admin-ui && npm ci && npx vite build`.
- **Server setup:** adds a `data_key` to `settings.php` (encrypts 2FA secrets), the admin CSP (same as PowerHER's), and denies `/api/lib/` and `/bin/`.

## Numbers
```bash
deploy/stats.sh               # completion, flavour split, nail-it hit rate, shares/clicks, opt-in rate, age, city, channels
deploy/stats.sh 2026-11-07    # one day (UTC)
deploy/stats.sh --csv > runs.csv
```

## Deploy
**Production: https://quiz.hopnosis.co.za** runs on the PowerHER Xneelo VM (`154.65.107.108`), set up the same way as Pulse's staging and production:
- **Folders:** `/var/www/quiz.hopnosis.co.za/` holds `releases/<timestamp>`, a `current` symlink, and `shared/` (`config`, `data`, `backups`).
- **Kept apart from PowerHER:**
  - its own `hopnosis` Linux user
  - its own PHP-FPM pool (`hopnosis-quiz`), using `open_basedir` to limit it to its own folder
  - its own vhost file named after the domain, and its own logs (`hopnosis-quiz-*.log`)
  - its own `hopnosis` database and DB user on the shared MariaDB
  - hourly encrypted backups

```bash
deploy/deploy.sh            # deploy HEAD (committed files only)
deploy/deploy.sh releases   # list releases, * = live
deploy/deploy.sh rollback   # flip back to the previous release
```
You need Tailscale switched on and the `powerher` SSH host (see the PowerHER runbook). Only `index.html`, `styles.css`, `data.js`, `app.js`, `assets/` and `api/` are published.

`deploy/server-setup.sh` is idempotent and runs on every deploy.
- **DNS:** `A quiz → 154.65.107.108`, DNS only (grey cloud), in the **Cloudflare** zone (account "Moniquehoffman@gmail.com's Account"). Added on 6 Nov. hopnosis.co.za's DNS is on Cloudflare, not Afrihost.
- **HTTPS:** Let's Encrypt, issued 6 Nov and renewed automatically by certbot's timer. HTTP redirects to HTTPS, and HSTS is on.

**Preview copy:** https://the-goosebumps-company.github.io/hopnality-quiz/ is served by GitHub Pages from the public repo, `main` branch. Don't push `deploy/` to that public repo, because it describes the server.

After the domain works:
1. Strip the Taplink page (taplink.cc/hopnosis.co.za) down to a welcome and one **"Fill in the quiz"** button pointing at the quiz URL. Add `?src=can` to the button link if we want to track it later.
2. Scan a real can and check the whole path on a phone.

## Known gaps / to do
- **Copy isn't signed off.** It still needs Kelly's personality criteria and Kayla's check. Edit `data.js` once it's approved.
- **Mango can photo** is the shop image, which still shows the old "MOJO" label. Swap in the current Mango AF shot from the 22 Oct shoot.
- **Classic can photo** is low resolution (570px). Swap it for a shoot pack shot.
- Fonts come from Google Fonts (Jost) and fall back to system fonts if they're blocked. Swap in the brand font if one exists.
- **Unicorn reward redemption is not defined.** The client handover asks QA to test duplicate QR redemption, but does not define the QR, staff scanner, redemption authority or failure states. The event reward copy is live for Unicorn results; a secure single-use redemption flow needs that product decision.
- Hero line uses "Even **if** you don't" (Author's Guide). The if/when wording is still open.
