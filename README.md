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
- `assets/can-*.jpg`: single-can photos pulled from the hopnosis.co.za Shopify store
- `api/`: `subscribe.php` (email sign-up), `track.php` (anonymous per-run stats), `lib.php` (shared helpers), `schema.sql`
- `deploy/`: `deploy.sh`, `server-setup.sh`, `stats.sh`, `export-subscribers.sh`
- `print/`: the A4 QR poster (`poster.html`, run `print/render.sh` to rebuild `print/out/*.pdf|png`) and QR SVGs for the poster (`?src=poster`) and the board (`?src=board`). These are not published with the site.

## Run locally
```bash
python3 -m http.server 8765 --directory quiz
```
Then open http://localhost:8765. To jump straight to a result, add `?result=classic`, `?result=mango` or `?result=lime`.

## How it works
- **Questions:** the brief's six questions, three answers each, shown in random order.
- **Scoring:** weighted, as the brief asks. Personality questions Q1, Q2, Q3 and Q5 count 2 points; occasion and channel questions Q4 and Q6 count 1 (`weight` in `data.js`). That's 10 points in all, so a three-way tie can't happen. When two flavours tie, a showdown question with just those two decides it (`showdowns`).
- **Result screen:** the archetype card, a 2–3 sentence description, **Shop** (that flavour's 6-pack), Share and Save square.
- **Under the result:**
  - **Did we nail it?** asks for their actual favourite, which is stored separately from the quiz result.
  - **Try all three** links to the mixed 6-pack.
  - **Optional research questions:** age band, city, suburb and where they'd buy. They're anonymous and skippable.
  - **The email opt-in**, kept separate.
- **Stats:** every run is one anonymous row in `results` (`api/track.php`), with no IP, name or email. It records start and finish, the flavour, the picks, the tiebreak, "Did we nail it?", the research answers, and share, shop, mixed-pack and opt-in clicks. Where there's no backend (the GitHub Pages preview), tracking does nothing.
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

`deploy/server-setup.sh` is idempotent and runs on every deploy. Once `quiz.hopnosis.co.za` resolves to the VM, it issues the Let's Encrypt certificate and switches the site to HTTPS. **Needed:** an `A` record `quiz → 154.65.107.108` in **Cloudflare**, where hopnosis.co.za's DNS lives (not Afrihost). Set it to DNS only (grey cloud). Then run `deploy/deploy.sh` again.

**Preview copy:** https://the-goosebumps-company.github.io/hopnality-quiz/ is served by GitHub Pages from the public repo, `main` branch. Don't push `deploy/` to that public repo, because it describes the server.

After the domain works:
1. Strip the Taplink page (taplink.cc/hopnosis.co.za) down to a welcome and one **"Fill in the quiz"** button pointing at the quiz URL. Add `?src=can` to the button link if we want to track it later.
2. Scan a real can and check the whole path on a phone.

## Known gaps / to do
- **Copy isn't signed off.** It still needs Kelly's personality criteria and Kayla's check. Edit `data.js` once it's approved.
- **Mango can photo** is the shop image, which still shows the old "MOJO" label. Swap in the current Mango AF shot from the 22 Oct shoot.
- **Classic can photo** is low resolution (570px). Swap it for a shoot pack shot.
- Fonts come from Google Fonts (Jost) and fall back to system fonts if they're blocked. Swap in the brand font if one exists.
- **No email capture or analytics yet.** Both wait on the open data-capture decision. Adding them will need a small backend or a form service, plus a consent line.
- Hero line uses "Even **if** you don't" (Author's Guide). The if/when wording is still open.
