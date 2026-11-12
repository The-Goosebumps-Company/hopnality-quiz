(() => {
  const H = window.HOPNALITY;
  const { flavours, questions, heroLine, signOff, handle, hashtags } = H;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const state = { step: 0, picks: [], result: null };
  const src = (new URLSearchParams(location.search).get("src") || "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32);

  // ---------- Anonymous analytics (api/track.php) ----------
  // One row per quiz run: start, finish, "Did we nail it?", insight answers, share/shop clicks.
  // No personal data. Fails silently where there's no backend (e.g. the GitHub Pages preview).
  let runId = null; // Promise<string|null>
  function api(body) {
    return fetch("api/track.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
  }
  function track(action, data = {}) {
    if (!runId) return;
    runId.then((id) => id && api({ action, id, ...data }));
  }

  // ---------- Screens ----------
  function show(name) {
    $$(".screen").forEach((s) => s.classList.toggle("is-active", s.dataset.screen === name));
    window.scrollTo(0, 0);
  }

  function shuffle(list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function renderQuestion() {
    const q = questions[state.step];
    const total = questions.length;
    const screen = $('[data-screen="question"]');
    $(".qtext", screen).textContent = q.q;
    $(".progress__bar", screen).style.width = `${((state.step + 1) / total) * 100}%`;
    $(".progress", screen).setAttribute("aria-valuenow", state.step + 1);
    $(".progress", screen).setAttribute("aria-valuemax", total);
    $(".progress__label", screen).textContent = `${state.step + 1} of ${total}`;
    $(".btn--back", screen).disabled = state.step === 0;

    const answers = $(".answers", screen);
    answers.innerHTML = "";
    shuffle(q.a).forEach(([flavour, text]) => {
      const b = document.createElement("button");
      b.className = "answer";
      b.textContent = text;
      if (state.picks[state.step] === flavour) b.classList.add("is-picked");
      b.addEventListener("click", () => pick(flavour, b));
      answers.appendChild(b);
    });
    show("question");
  }

  let locked = false;
  function pick(flavour, el) {
    if (locked) return;
    locked = true;
    el.classList.add("is-picked");
    setTimeout(() => {
      locked = false;
      state.picks[state.step] = flavour;
      if (state.step < questions.length - 1) {
        state.step++;
        renderQuestion();
      } else {
        finish();
      }
    }, 260);
  }

  // Client scoring, exactly as supplied in "UNICORN AF | DEVELOPER HANDOVER".
  // New order: original Q1–Q3, Unicorn question, original Q4–Q6.
  const PERSONALITY = [0, 1, 2, 4, 5];
  const UNICORN_QUESTION = 3;
  const ORIGINAL_Q5 = 5;
  const FALLBACK = ["classic", "mango", "lime"]; // documented fixed fallback after original Q5

  function score(picks) {
    const original = PERSONALITY.map((i) => picks[i]);
    const counts = { classic: 0, mango: 0, lime: 0 };
    original.forEach((f) => counts[f]++);

    const balanced = Object.values(counts).sort((a, b) => b - a).join("-") === "2-2-1";
    if (picks[UNICORN_QUESTION] === "unicorn" && balanced) return "unicorn";

    const tally = { classic: 0, mango: 0, lime: 0 };
    original.forEach((f) => tally[f]++);
    const extra = picks[UNICORN_QUESTION];
    if (extra !== "unicorn") tally[extra]++;
    const top = Math.max(...Object.values(tally));
    const tied = Object.keys(tally).filter((f) => tally[f] === top);
    if (tied.length === 1) return tied[0];
    if (tied.includes(picks[ORIGINAL_Q5])) return picks[ORIGINAL_Q5];
    return FALLBACK.find((f) => tied.includes(f));
  }

  // Local QA hook; never exposed on the production hostname.
  if (["localhost", "127.0.0.1"].includes(location.hostname)) window.__HOPNALITY_SCORE__ = score;

  function finish() {
    reveal(score(state.picks));
  }

  function reveal(flavour) {
    state.result = flavour;
    track("finish", { flavour, picks: state.picks.slice(0, questions.length) });
    renderResult();
    show("loading");
    setTimeout(() => {
      document.body.dataset.flavour = state.result;
      show("result");
    }, 1500);
  }

  function renderResult() {
    const f = flavours[state.result];
    const screen = $('[data-screen="result"]');
    const img = $(".card__photo img", screen);
    img.src = f.image;
    img.alt = `A can of hopnøsis ${f.name}`;
    $(".card__name", screen).textContent = f.displayName || f.name;
    $(".card__name", screen).style.setProperty("--flav", ["classic", "unicorn"].includes(state.result) ? f.theme.accent : f.theme.bg);
    $(".card__words", screen).textContent = f.archetype;
    $(".card__wink", screen).textContent = f.line;
    $(".result__about", screen).textContent = f.about;
    $(".result__eyebrow", screen).textContent = f.eyebrow || "You’re";
    const reward = $(".unicorn-reward", screen);
    reward.hidden = state.result !== "unicorn" || !H.event?.on;
    if (!reward.hidden) {
      $(".unicorn-reward__title", reward).textContent = H.unicornReward.title;
      $(".unicorn-reward__body", reward).textContent = H.unicornReward.body;
      $(".unicorn-reward__note", reward).textContent = H.unicornReward.note;
    }
    const shop = $('[data-role="shop"]', screen);
    shop.href = f.shop;
    shop.textContent = state.result === "unicorn" ? "Shop the mixed pack" : `Try your type: ${f.name} 4-pack`;
    $(".hero-line", screen).textContent = heroLine;
    resetPanels();
  }

  function start() {
    state.step = 0;
    state.picks = [];
    state.result = null;
    delete document.body.dataset.flavour;
    runId = api({ action: "start", source: src }).then((r) => (r && r.success ? r.data.id : null));
    renderQuestion();
  }

  // ---------- Result panels: Did we nail it?, Mixed AF, insights ----------
  function buildChips() {
    const ins = H.insight;
    const radio = (field, values) =>
      values.map((v) => `<button type="button" class="chip" data-value="${v}" aria-pressed="false">${v}</button>`).join("");
    $('[data-field="age_band"]').innerHTML = radio("age_band", ins.ageBands);
    $('[data-field="city"]').innerHTML = radio("city", ins.cities);
    $('[data-field="channels"]').innerHTML = ins.channels
      .map(([v, label]) => `<button type="button" class="chip" data-value="${v}" aria-pressed="false">${label}</button>`)
      .join("");
    $(".insight__title").textContent = ins.title;
    $(".mixed__line").textContent = H.mixed.line;
    const mixed = $('[data-role="mixed"]');
    mixed.textContent = H.mixed.label;
    mixed.href = H.mixed.url;
  }

  function resetPanels() {
    $$(".nail .chip").forEach((c) => c.classList.remove("is-on"));
    $(".nail .chips").hidden = false;
    $(".nail .panel__done").hidden = true;
    const ins = $(".insight");
    ins.reset();
    ins.classList.remove("is-done");
    $$(".chip", ins).forEach((c) => {
      c.classList.remove("is-on");
      c.setAttribute("aria-pressed", "false");
    });
    $(".panel__done", ins).hidden = true;
    resetJoin();
  }

  // "Did we nail it?": one tap, saved straight away.
  $$(".nail .chip").forEach((chip) =>
    chip.addEventListener("click", () => {
      $$(".nail .chip").forEach((c) => c.classList.toggle("is-on", c === chip));
      track("nail", { value: chip.dataset.nail });
      setTimeout(() => {
        $(".nail .chips").hidden = true;
        $(".nail .panel__done").hidden = false;
      }, 250);
    })
  );

  // Insight chips: single choice for age and city, multi for channels.
  document.addEventListener("click", (e) => {
    const chip = e.target.closest(".insight .chip");
    if (!chip) return;
    const group = chip.parentElement;
    const multi = group.classList.contains("chips--check");
    if (!multi) $$(".chip", group).forEach((c) => c !== chip && (c.classList.remove("is-on"), c.setAttribute("aria-pressed", "false")));
    const on = !chip.classList.contains("is-on");
    chip.classList.toggle("is-on", on);
    chip.setAttribute("aria-pressed", String(on));
  });

  function insightDone(msg) {
    const ins = $(".insight");
    ins.classList.add("is-done");
    const done = $(".panel__done", ins);
    done.textContent = msg;
    done.hidden = false;
  }

  $(".insight").addEventListener("submit", (e) => {
    e.preventDefault();
    const val = (field) => $(`[data-field="${field}"] .chip.is-on`)?.dataset.value || null;
    const channels = $$('[data-field="channels"] .chip.is-on').map((c) => c.dataset.value);
    const suburb = $('.insight input[name="suburb"]').value.trim().slice(0, 60) || null;
    const any = val("age_band") || val("city") || suburb || channels.length;
    if (!any) return insightDone("All skipped. Fair enough.");
    track("insight", { age_band: val("age_band"), city: val("city"), suburb, channels });
    insightDone("Thanks. That's genuinely useful.");
  });

  // ---------- Share card (canvas) ----------
  const imageCache = {};
  function loadImage(srcUrl) {
    if (!imageCache[srcUrl]) {
      imageCache[srcUrl] = new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = srcUrl;
      });
    }
    return imageCache[srcUrl];
  }

  function wrap(ctx, text, maxWidth) {
    const words = text.split(" ");
    const lines = [];
    let line = "";
    words.forEach((w) => {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = w;
      } else line = test;
    });
    if (line) lines.push(line);
    return lines;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawContained(ctx, img, x, y, w, h) {
    const scale = Math.min(w / img.naturalWidth, h / img.naturalHeight);
    const iw = img.naturalWidth * scale;
    const ih = img.naturalHeight * scale;
    ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
  }

  async function drawCard(format) {
    const key = state.result;
    const f = flavours[key];
    const t = f.theme;
    const W = 1080;
    const H2 = format === "story" ? 1920 : 1080;
    const FONT = '"Jost", "Futura", sans-serif';

    await Promise.all([
      document.fonts.load(`800 100px Jost`),
      document.fonts.load(`500 40px Jost`),
      document.fonts.load(`italic 400 40px Jost`),
    ]).catch(() => {});
    const img = await loadImage(f.image);

    const c = document.createElement("canvas");
    c.width = W;
    c.height = H2;
    const ctx = c.getContext("2d");
    const nameColour = key === "classic" ? t.accent : t.ink;

    ctx.fillStyle = t.bg;
    ctx.fillRect(0, 0, W, H2);
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = t.ink;

    const story = format === "story";
    const pad = story ? 90 : 70;
    const photo = story ? { x: pad, y: 250, s: W - pad * 2 } : { x: (W - 480) / 2, y: 60, s: 480 };

    if (story) {
      ctx.font = `700 40px ${FONT}`;
      ctx.letterSpacing = "8px";
      ctx.fillText("MY HOP-NALITY IS", W / 2, 180);
      ctx.letterSpacing = "0px";
    }

    ctx.save();
    roundRect(ctx, photo.x, photo.y, photo.s, photo.s, 40);
    ctx.clip();
    if (key === "unicorn") drawContained(ctx, img, photo.x, photo.y, photo.s, photo.s);
    else ctx.drawImage(img, photo.x, photo.y, photo.s, photo.s);
    ctx.restore();

    let y = photo.y + photo.s + (story ? 170 : 125);
    ctx.fillStyle = nameColour;
    ctx.font = `800 ${story ? 160 : 116}px ${FONT}`;
    ctx.fillText(f.name, W / 2, y);

    ctx.fillStyle = t.ink;
    y += story ? 90 : 66;
    ctx.font = `700 ${story ? 54 : 42}px ${FONT}`;
    ctx.fillText(f.archetype, W / 2, y);

    ctx.font = `italic 400 ${story ? 46 : 34}px ${FONT}`;
    wrap(ctx, f.line, W - pad * 2).forEach((l) => {
      y += story ? 70 : 50;
      ctx.fillText(l, W / 2, y);
    });

    // Footer
    const fy = H2 - (story ? 110 : 56);
    ctx.globalAlpha = 0.85;
    ctx.font = `500 ${story ? 34 : 28}px ${FONT}`;
    if (story) ctx.fillText(heroLine, W / 2, fy - 90);
    ctx.globalAlpha = 1;
    ctx.textAlign = "left";
    ctx.font = `700 ${story ? 52 : 40}px ${FONT}`;
    ctx.fillText("hopnøsis", pad, fy);
    ctx.textAlign = "right";
    ctx.font = `700 ${story ? 30 : 26}px ${FONT}`;
    ctx.fillText(signOff, W - pad, fy);

    return new Promise((resolve) => c.toBlob(resolve, "image/png"));
  }

  function shareText() {
    const f = flavours[state.result];
    return `I'm ${f.name}, ${f.archetype}. ${f.line} What's your hop-nality? ${location.origin}${location.pathname} ${handle} ${hashtags}`;
  }

  function download(blob, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  let toastTimer;
  function toast(msg) {
    const el = $(".toast");
    el.textContent = msg;
    el.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("is-on"), 2600);
  }

  async function share() {
    track("event", { event: "share" });
    const name = `hopnosis-${state.result}-af.png`;
    const blob = await drawCard("story");
    const file = new File([blob], name, { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text: shareText() });
      } catch (e) {
        if (e.name !== "AbortError") download(blob, name);
      }
      return;
    }
    download(blob, name);
    try {
      await navigator.clipboard.writeText(shareText());
      toast("Image saved. Caption copied.");
    } catch {
      toast("Image saved.");
    }
  }

  async function saveSquare() {
    track("event", { event: "square" });
    const blob = await drawCard("square");
    download(blob, `hopnosis-${state.result}-af-square.png`);
    toast("Square image saved.");
  }

  // ---------- Email sign-up (pattern from Pulse's contact form) ----------
  const join = $(".join");
  let joinShownAt = 0; // seconds; the server ignores sign-ups sent faster than a person could

  function joinStatus(msg, isError = false) {
    const el = $(".join__status", join);
    el.textContent = msg;
    el.classList.toggle("is-error", isError);
  }

  function resetJoin() {
    join.reset();
    join.classList.remove("is-done");
    $('input[name="email"]', join).removeAttribute("aria-invalid");
    joinStatus("");
    joinShownAt = Math.floor(Date.now() / 1000);
  }

  join.addEventListener("submit", async (e) => {
    e.preventDefault();
    const emailEl = $('input[name="email"]', join);
    const email = emailEl.value.trim();
    const consent = $('input[name="consent"]', join).checked;
    if (!emailEl.checkValidity() || !email) {
      emailEl.setAttribute("aria-invalid", "true");
      emailEl.focus();
      return joinStatus("That email doesn't look right.", true);
    }
    emailEl.removeAttribute("aria-invalid");
    if (!consent) return joinStatus("Tick the box so we're allowed to email you.", true);

    const btn = $(".join__submit", join);
    btn.disabled = true;
    joinStatus("Sending…");
    try {
      const res = await fetch("api/subscribe.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          consent: true,
          flavour: state.result,
          source: src,
          started_at: joinShownAt,
          website: $('input[name="website"]', join).value,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) throw new Error(body.message || "");
      join.classList.add("is-done");
      joinStatus("You're in. Welcome to the Hopnotised.");
      track("event", { event: "optin" });
    } catch (err) {
      joinStatus(err.message || "That didn't go through. Try again in a moment.", true);
    } finally {
      btn.disabled = false;
    }
  });

  // ---------- Wiring ----------
  $(".lede").textContent = H.welcome.body;
  // Event look (House of Hops neon, PowerHER) vs the plain hopnøsis black-and-gold.
  document.body.classList.toggle("event-look", !!H.event?.on);
  if (H.event?.on) {
    $(".event__where").textContent = H.event.where || "";
    $(".event").hidden = false;
  }
  // Optional result panels; with all off only the email sign-up remains.
  const panels = H.panels || {};
  $(".nail").hidden = panels.nail === false;
  $(".mixed").hidden = panels.mixed === false;
  $(".insight").hidden = panels.insight === false;
  buildChips();

  document.addEventListener("click", (e) => {
    const tracked = e.target.closest("[data-track]");
    if (tracked) track("event", { event: tracked.dataset.track });
    const action = e.target.closest("[data-action]")?.dataset.action;
    if (!action) return;
    if (action === "start") start();
    if (action === "back" && state.step > 0) {
      state.step--;
      renderQuestion();
    }
    if (action === "restart") start();
    if (action === "share") share();
    if (action === "save-square") saveSquare();
    if (action === "skip-insight") {
      track("insight", { skipped: true });
      insightDone("All skipped. Fair enough.");
    }
  });

  // Warm the three visible flavours. Keep Unicorn's artwork off the wire until it is earned.
  Object.entries(flavours).forEach(([key, f]) => key !== "unicorn" && loadImage(f.image));

  const params = new URLSearchParams(location.search);
  // Local QA hook: exercise the real scorer and result renderer without seven timed taps.
  const forcedPicks = params.get("picks")?.split(",");
  const localQa = ["localhost", "127.0.0.1"].includes(location.hostname);
  if (localQa && forcedPicks?.length === questions.length) {
    state.picks = forcedPicks;
    state.result = score(forcedPicks);
    renderResult();
    document.body.dataset.flavour = state.result;
    show("result");
  // Result preview hook (not tracked).
  } else {
    const forced = params.get("result");
    if (localQa && forced && flavours[forced]) {
      state.result = forced;
      renderResult();
      document.body.dataset.flavour = forced;
      show("result");
    }
  }
})();
