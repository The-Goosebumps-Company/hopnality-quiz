(() => {
  const { flavours, questions, showdowns, heroLine, signOff, hashtags } = window.HOPNALITY;
  const $ = (sel, root = document) => root.querySelector(sel);

  // showdown: key into `showdowns` while the tie-break question is on screen, else null.
  const state = { step: 0, picks: [], result: null, showdown: null };

  // ---------- Screens ----------
  function show(name) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("is-active", s.dataset.screen === name));
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
    const q = state.showdown ? showdowns[state.showdown] : questions[state.step];
    const total = questions.length;
    const screen = $('[data-screen="question"]');
    $(".qtext", screen).textContent = q.q;
    $(".progress__bar", screen).style.width = `${state.showdown ? 100 : ((state.step + 1) / total) * 100}%`;
    $(".progress", screen).setAttribute("aria-valuenow", state.step + 1);
    $(".progress__label", screen).textContent = state.showdown ? "Tiebreak" : `${state.step + 1} of ${total}`;
    $(".btn--back", screen).disabled = state.step === 0 && !state.showdown;

    const answers = $(".answers", screen);
    answers.innerHTML = "";
    shuffle(q.a).forEach(([flavour, text]) => {
      const b = document.createElement("button");
      b.className = "answer";
      b.textContent = text;
      if (!state.showdown && state.picks[state.step] === flavour) b.classList.add("is-picked");
      b.addEventListener("click", () => pick(flavour, b));
      answers.appendChild(b);
    });
    show("question");
    $(".qtext", screen).focus?.();
  }

  let locked = false;
  function pick(flavour, el) {
    if (locked) return;
    locked = true;
    el.classList.add("is-picked");
    setTimeout(() => {
      locked = false;
      if (state.showdown) {
        state.showdown = null;
        reveal(flavour);
        return;
      }
      state.picks[state.step] = flavour;
      if (state.step < questions.length - 1) {
        state.step++;
        renderQuestion();
      } else {
        finish();
      }
    }, 260);
  }

  // Returns the flavours with the top score: one winner, or the two tied at 3-3-1.
  function leaders(picks) {
    const tally = { classic: 0, mango: 0, lime: 0 };
    picks.forEach((f) => tally[f]++);
    const top = Math.max(...Object.values(tally));
    return Object.keys(tally).filter((f) => tally[f] === top);
  }

  function finish() {
    const top = leaders(state.picks);
    if (top.length === 1) return reveal(top[0]);
    state.showdown = top.sort().join("-");
    renderQuestion();
  }

  function reveal(flavour) {
    state.result = flavour;
    renderResult();
    show("loading");
    setTimeout(() => {
      document.body.dataset.flavour = state.result;
      resetJoin();
      show("result");
    }, 1500);
  }

  function renderResult() {
    const f = flavours[state.result];
    const screen = $('[data-screen="result"]');
    const img = $(".card__photo img", screen);
    img.src = f.image;
    img.alt = `A can of hopnøsis ${f.name}`;
    $(".card__name", screen).textContent = f.name;
    $(".card__name", screen).style.setProperty("--flav", state.result === "classic" ? f.theme.accent : f.theme.bg);
    $(".card__words", screen).textContent = f.words;
    $(".card__wink", screen).textContent = f.wink;
    $(".result__about", screen).textContent = f.about;
    const shop = $('[data-role="shop"]', screen);
    shop.href = f.shop;
    shop.textContent = `Shop ${f.name}`;
    $(".hero-line", screen).textContent = heroLine;
  }

  function restart() {
    state.step = 0;
    state.picks = [];
    state.result = null;
    state.showdown = null;
    delete document.body.dataset.flavour;
    renderQuestion();
  }

  // ---------- Share card (canvas) ----------
  const imageCache = {};
  function loadImage(src) {
    if (!imageCache[src]) {
      imageCache[src] = new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = src;
      });
    }
    return imageCache[src];
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

  async function drawCard(format) {
    const key = state.result;
    const f = flavours[key];
    const t = f.theme;
    const W = 1080;
    const H = format === "story" ? 1920 : 1080;
    const FONT = '"Jost", "Futura", sans-serif';

    await Promise.all([
      document.fonts.load(`800 100px Jost`),
      document.fonts.load(`500 40px Jost`),
      document.fonts.load(`italic 400 40px Jost`),
    ]).catch(() => {});
    const img = await loadImage(f.image);

    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d");
    const nameColour = key === "classic" ? t.accent : t.ink;

    ctx.fillStyle = t.bg;
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = t.ink;

    const story = format === "story";
    const pad = story ? 90 : 70;
    const photo = story ? { x: pad, y: 250, s: W - pad * 2 } : { x: (W - 520) / 2, y: 70, s: 520 };

    if (story) {
      ctx.font = `700 40px ${FONT}`;
      ctx.letterSpacing = "8px";
      ctx.fillText("MY HOP-NALITY IS", W / 2, 180);
      ctx.letterSpacing = "0px";
    }

    ctx.save();
    roundRect(ctx, photo.x, photo.y, photo.s, photo.s, 40);
    ctx.clip();
    ctx.drawImage(img, photo.x, photo.y, photo.s, photo.s);
    ctx.restore();

    let y = photo.y + photo.s + (story ? 170 : 130);
    ctx.fillStyle = nameColour;
    ctx.font = `800 ${story ? 160 : 120}px ${FONT}`;
    ctx.fillText(f.name, W / 2, y);

    ctx.fillStyle = t.ink;
    y += story ? 90 : 70;
    ctx.font = `500 ${story ? 52 : 42}px ${FONT}`;
    ctx.fillText(f.words, W / 2, y);

    ctx.font = `italic 400 ${story ? 46 : 36}px ${FONT}`;
    const winkLines = wrap(ctx, f.wink, W - pad * 2);
    winkLines.forEach((l) => {
      y += story ? 70 : 54;
      ctx.fillText(l, W / 2, y);
    });

    // Footer
    const fy = H - (story ? 110 : 60);
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
    return `I'm ${f.name}. ${f.wink} What's your hop-nality? ${location.origin}${location.pathname} ${hashtags}`;
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
    const blob = await drawCard("square");
    download(blob, `hopnosis-${state.result}-af-square.png`);
    toast("Square image saved.");
  }

  // ---------- Wiring ----------
  document.addEventListener("click", (e) => {
    const action = e.target.closest("[data-action]")?.dataset.action;
    if (!action) return;
    if (action === "start") renderQuestion();
    if (action === "back" && state.showdown) {
      state.showdown = null;
      renderQuestion();
    } else if (action === "back" && state.step > 0) {
      state.step--;
      renderQuestion();
    }
    if (action === "restart") restart();
    if (action === "share") share();
    if (action === "save-square") saveSquare();
  });

  // ---------- Email sign-up (pattern from Pulse's contact form) ----------
  const join = $(".join");
  let joinShownAt = 0; // seconds; the server ignores sign-ups sent faster than a person could
  const src = (new URLSearchParams(location.search).get("src") || "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32);

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
    } catch (err) {
      joinStatus(err.message || "That didn't go through. Try again in a moment.", true);
    } finally {
      btn.disabled = false;
    }
  });

  // Warm the can images so the result card is instant.
  Object.values(flavours).forEach((f) => loadImage(f.image));

  // Test hook: ?result=lime jumps straight to a result screen.
  const forced = new URLSearchParams(location.search).get("result");
  if (forced && flavours[forced]) {
    state.result = forced;
    renderResult();
    document.body.dataset.flavour = forced;
    resetJoin();
    show("result");
  }
})();
