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
**Live:** https://the-goosebumps-company.github.io/hopnality-quiz/ (GitHub Pages, repo `The-Goosebumps-Company/hopnality-quiz`, `main` branch, root). Pushing to `main` redeploys within about a minute. The repo is public because the org is on the free plan.

The folder can also go on any other static host (Kelly's/company hosting, Netlify, and so on). Then:
1. Strip the Taplink page (taplink.cc/hopnosis.co.za) down to a welcome and one **"Fill in the quiz"** button pointing at the quiz URL. Add `?src=can` to the button link if we want to track it later.
2. Scan a real can and check the whole path on a phone.

## Known gaps / to do
- **Copy isn't signed off.** It still needs Kelly's personality criteria and Kayla's check. Edit `data.js` once it's approved.
- **Mango can photo** is the shop image, which still shows the old "MOJO" label. Swap in the current Mango AF shot from the 22 Oct shoot.
- **Classic can photo** is low resolution (570px). Swap it for a shoot pack shot.
- Fonts come from Google Fonts (Jost) and fall back to system fonts if they're blocked. Swap in the brand font if one exists.
- **No email capture or analytics yet.** Both wait on the open data-capture decision. Adding them will need a small backend or a form service, plus a consent line.
- Hero line uses "Even **if** you don't" (Author's Guide). The if/when wording is still open.
