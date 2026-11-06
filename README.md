# hopnøsis hop-nality quiz

A static site with plain HTML, CSS and JavaScript. There's no build step, no backend and no database.
Brief: `../context/hopnality-quiz.md`. Copy source: `../context/hopnality-quiz-copy.md` (v0.1, not signed off).

## Files
- `index.html`: all four screens (welcome, question, loading, result)
- `data.js`: **all copy, scoring and shop links**. Edit this to change wording.
- `app.js`: quiz flow, scoring, and share-card image generation (canvas)
- `styles.css`: themes per flavour (Classic black/gold, Mango orange, Lime green)
- `assets/can-*.jpg`: single-can photos pulled from the hopnosis.co.za Shopify store

## Run locally
```bash
python3 -m http.server 8765 --directory quiz
```
Then open http://localhost:8765. To jump straight to a result, add `?result=classic`, `?result=mango` or `?result=lime`.

## How it works
- There are seven questions with three answers each, shown in random order. Each answer adds a point to one flavour.
- The highest score wins. The only possible tie is 3-3-1. When that happens, a "Tiebreak" question with only the two tied flavours decides it (`showdowns` in `data.js`).
- **Shop** links to that flavour's 6-pack page (`hopnosis.co.za/products/<flavour>-af-6-pack`).
- **Share** builds a 1080×1920 story image. On phones it opens the native share sheet. On desktop it downloads the image and copies the caption.
- **Save square image** builds a 1080×1080 image.

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
