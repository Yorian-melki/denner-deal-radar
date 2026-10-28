(() => {
  "use strict";
  const NAMES = window.NAMES;
  const $ = (h) => { const d = document.createElement("div"); d.innerHTML = h.trim(); return d.firstChild; };
  const app = document.getElementById("app");
  const rnd = (a) => a[Math.floor(Math.random() * a.length)];
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // ---- identité anonyme de l'appareil (aucun login, aucune donnée perso) ----
  const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
  let rid = store.get("nb.rid");
  if (!rid) { rid = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36)).toLowerCase(); store.set("nb.rid", rid); }
  const device = /Mobi|Android|iPhone/i.test(navigator.userAgent) ? "mobile" : "desktop";

  // ---- langue ----
  const L = (navigator.language || "en").slice(0, 2);
  const lang = ["fr", "de"].includes(L) ? L : "en";
  const T = {
    fr: { title: "Aide-nous à choisir le nom de notre app 🔥", sub: "Une app qui trouve les meilleurs bons plans de ta ville. 60 secondes, anonyme, aucune inscription.", go: "C'est parti", mem: "Mémorise ces noms 👀", duel: "Lequel tu choisirais ?", tap: "Touche ton préféré", recall: "Lesquels as-tu vus au tout début ?", recallSub: "Touche tous ceux que tu reconnais", next: "Suivant", listen: "Écoute et écris le nom 🎧", replay: "Réécouter", meaning: "Avec ce nom, ce site sert à…", mOpts: { deals: "Trouver des bons plans", games: "Jouer à des jeux", travel: "Réserver des voyages", bank: "Une banque / finance", food: "Commander à manger" }, done: "Merci ! 🙌", yourTop: "Ton top", more: "Encore des duels", share: "Partager le test", city: "Zürich", tag: "Die besten Deals deiner Stadt", app: "Bons plans · Étudiants", notif: "−58 % sur les AirPods, encore 2 h", skip: "Passer" },
    de: { title: "Hilf uns, den Namen unserer App zu wählen 🔥", sub: "Eine App, die die besten Deals deiner Stadt findet. 60 Sekunden, anonym, ohne Anmeldung.", go: "Los geht's", mem: "Merk dir diese Namen 👀", duel: "Welchen würdest du wählen?", tap: "Tippe auf deinen Favoriten", recall: "Welche hast du ganz am Anfang gesehen?", recallSub: "Tippe alle an, die du wiedererkennst", next: "Weiter", listen: "Hör zu und schreib den Namen 🎧", replay: "Nochmal hören", meaning: "Mit diesem Namen ist die Seite für…", mOpts: { deals: "Schnäppchen finden", games: "Games spielen", travel: "Reisen buchen", bank: "Bank / Finanzen", food: "Essen bestellen" }, done: "Danke! 🙌", yourTop: "Deine Top", more: "Mehr Duelle", share: "Test teilen", city: "Zürich", tag: "Die besten Deals deiner Stadt", app: "Deals · Studis", notif: "−58 % auf AirPods, noch 2 Std.", skip: "Überspringen" },
    en: { title: "Help us pick our app's name 🔥", sub: "An app that finds the best deals in your city. 60 seconds, anonymous, no sign-up.", go: "Let's go", mem: "Remember these names 👀", duel: "Which one would you pick?", tap: "Tap your favourite", recall: "Which ones did you see at the very start?", recallSub: "Tap all you recognise", next: "Next", listen: "Listen and type the name 🎧", replay: "Replay", meaning: "With this name, the site is for…", mOpts: { deals: "Finding bargains", games: "Playing games", travel: "Booking travel", bank: "A bank / finance", food: "Ordering food" }, done: "Thanks! 🙌", yourTop: "Your top", more: "More duels", share: "Share the test", city: "Zürich", tag: "The best deals in your city", app: "Deals · Students", notif: "−58% on AirPods, 2 h left", skip: "Skip" },
  }[lang];

  // ---- envoi des réponses (par lots, survit à la fermeture de l'onglet) ----
  let queue = [];
  const push = (type, data) => { queue.push({ type, data }); if (queue.length >= 5) flush(); };
  const flush = () => {
    if (!queue.length) return;
    const body = JSON.stringify({ rid, lang, device, events: queue.splice(0) });
    try { if (!navigator.sendBeacon("/api/event", new Blob([body], { type: "application/json" }))) throw 0; }
    catch { fetch("/api/event", { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true }).catch(() => {}); }
  };
  addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && flush());

  // ---- mises en scène (même style pour les deux côtés d'un duel = équitable) ----
  const COLORS = ["#ef4444", "#f97316", "#8b5cf6", "#0ea5e9", "#10b981", "#ec4899", "#111827", "#2563eb"];
  const SCENES = {
    web: (n, c) => `<div class="web"><div class="top" style="background:${c}"><span class="logo">${esc(n)}</span><span class="nav">${T.city} ▾</span></div><div class="hero"><b>${esc(n)} ${T.city}</b><span>${T.tag}</span></div></div>`,
    app: (n, c) => `<div class="app"><div class="icon" style="background:${c}">${esc(n[0])}</div><div><div class="t">${esc(n)}</div><div class="s">${T.app} · ★ 4.8</div></div></div>`,
    sign: (n, c) => `<div class="sign" style="background:${c}"><div class="n">${esc(n)}</div><div class="c">${T.city}</div></div>`,
    notif: (n, c) => `<div class="notif"><div class="dot" style="background:${c}"></div><div><div class="h">${esc(n)}</div><div class="m">${T.notif}</div></div></div>`,
  };

  // ---- sélection des paires : priorité aux noms les moins vus sur cet appareil ----
  const seen = JSON.parse(store.get("nb.seen") || "{}");
  const pairsDone = new Set(JSON.parse(store.get("nb.pairs") || "[]"));
  const wins = JSON.parse(store.get("nb.wins") || "{}");
  const save = () => { store.set("nb.seen", JSON.stringify(seen)); store.set("nb.pairs", JSON.stringify([...pairsDone])); store.set("nb.wins", JSON.stringify(wins)); };
  const pickPair = () => {
    const by = shuffle(NAMES).sort((a, b) => (seen[a] || 0) - (seen[b] || 0));
    const a = by[0];
    const b = by.slice(1).find((x) => !pairsDone.has([a, x].sort().join("|"))) || by[1];
    return Math.random() < 0.5 ? [a, b] : [b, a];
  };

  // ---- écrans ----
  const screen = (html) => { app.innerHTML = ""; const el = $(`<section style="display:contents">${html}</section>`); app.append(...el.childNodes); window.scrollTo(0, 0); };
  const progress = (i, n) => `<div class="bar"><i style="width:${Math.round((100 * i) / n)}%"></i></div>`;
  const STEPS = 12 + 1 + 2 + 2; // duels + mémoire + écoute + sens
  let step = 0;

  function intro() {
    screen(`<div style="flex:1"></div><h1>${T.title}</h1><p class="muted">${T.sub}</p><div class="big">⚡️🦊🏷️</div><button id="go">${T.go}</button><div style="flex:1"></div>`);
    document.getElementById("go").onclick = () => { push("session", { start: Date.now(), ua: device }); memory(); };
  }

  let memSet = [];
  function memory() {
    memSet = shuffle(NAMES).slice(0, 5);
    let i = 0;
    const show = () => {
      if (i >= memSet.length) return duels(0);
      const c = rnd(COLORS);
      screen(`${progress(step, STEPS)}<h2>${T.mem}</h2><div class="flash" style="background:${c}">${esc(memSet[i])}</div><p class="muted" style="text-align:center">${i + 1} / ${memSet.length}</p>`);
      i++; setTimeout(show, 1400);
    };
    show();
  }

  function duels(k, endless = false) {
    if (!endless && k >= 12) return recall();
    const [a, b] = pickPair();
    const scene = rnd(Object.keys(SCENES)), c = rnd(COLORS), t0 = performance.now();
    screen(`${endless ? "" : progress(step, STEPS)}<h2>${T.duel}</h2><p class="muted">${T.tap}</p>
      <div class="duel"><div class="opt" data-n="${esc(a)}">${SCENES[scene](a, c)}</div><div class="vs">VS</div><div class="opt" data-n="${esc(b)}">${SCENES[scene](b, c)}</div></div>
      ${endless ? `<button class="ghost" id="stop">${T.done}</button>` : ""}`);
    app.querySelectorAll(".opt").forEach((el) => el.onclick = () => {
      const win = el.dataset.n;
      app.querySelectorAll(".opt").forEach((o) => o.classList.add(o === el ? "win" : "lose"));
      push("duel", { a, b, win, scene, ms: Math.round(performance.now() - t0) });
      seen[a] = (seen[a] || 0) + 1; seen[b] = (seen[b] || 0) + 1; wins[win] = (wins[win] || 0) + 1;
      pairsDone.add([a, b].sort().join("|")); save();
      if (!endless) step++;
      setTimeout(() => duels(k + 1, endless), 380);
    });
    if (endless) document.getElementById("stop").onclick = () => { flush(); end(); };
  }

  function recall() {
    const decoys = shuffle(NAMES.filter((n) => !memSet.includes(n))).slice(0, 5);
    const all = shuffle([...memSet, ...decoys]);
    const picked = new Set();
    screen(`${progress(step, STEPS)}<h2>${T.recall}</h2><p class="muted">${T.recallSub}</p><div class="grid">${all.map((n) => `<div class="chip" data-n="${esc(n)}">${esc(n)}</div>`).join("")}</div><button id="nx">${T.next}</button>`);
    app.querySelectorAll(".chip").forEach((el) => el.onclick = () => { const n = el.dataset.n; picked.has(n) ? picked.delete(n) : picked.add(n); el.classList.toggle("on"); });
    document.getElementById("nx").onclick = () => { push("recall", { seen: memSet, decoys, picked: [...picked] }); step++; listen(0); };
  }

  const canSpeak = "speechSynthesis" in window;
  function listen(k) {
    if (!canSpeak || k >= 2) return meaning(0);
    const name = rnd(NAMES);
    const say = () => { try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(name); u.lang = { fr: "fr-FR", de: "de-DE", en: "en-US" }[lang]; u.rate = 0.9; speechSynthesis.speak(u); } catch {} };
    screen(`${progress(step, STEPS)}<h2>${T.listen}</h2><button class="ghost" id="pl">🔊 ${T.replay}</button><input id="in" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="…"><button id="nx">${T.next}</button><button class="ghost" id="sk">${T.skip}</button>`);
    setTimeout(say, 250);
    document.getElementById("pl").onclick = say;
    const go = (skipped) => { if (!skipped) push("spell", { name, typed: document.getElementById("in").value.slice(0, 40) }); step++; listen(k + 1); };
    document.getElementById("nx").onclick = () => go(false);
    document.getElementById("sk").onclick = () => go(true);
    document.getElementById("in").onkeydown = (e) => e.key === "Enter" && go(false);
  }

  function meaning(k) {
    if (k >= 2) { flush(); return end(); }
    const name = rnd(NAMES), opts = shuffle(Object.keys(T.mOpts));
    screen(`${progress(step, STEPS)}<div class="opt" style="cursor:default">${SCENES.sign(name, rnd(COLORS))}</div><h2>${T.meaning}</h2><div class="list">${opts.map((o) => `<button class="ghost" data-o="${o}">${T.mOpts[o]}</button>`).join("")}</div>`);
    app.querySelectorAll("[data-o]").forEach((el) => el.onclick = () => { push("meaning", { name, answer: el.dataset.o }); step++; meaning(k + 1); });
  }

  function end() {
    const top = Object.entries(wins).sort((a, b) => b[1] - a[1]).slice(0, 3);
    screen(`<h1>${T.done}</h1><h2>${T.yourTop}</h2><div class="list">${top.map(([n, w], i) => `<div class="row"><b>${["🥇", "🥈", "🥉"][i]} ${esc(n)}</b><span class="muted">${w}</span></div>`).join("")}</div>
      <button id="more">${T.more}</button><button class="ghost" id="sh">${T.share}</button>`);
    document.getElementById("more").onclick = () => duels(0, true);
    document.getElementById("sh").onclick = async () => { const url = location.origin; try { await navigator.share({ title: "Name Battle", text: T.title, url }); } catch { try { await navigator.clipboard.writeText(url); } catch {} } };
  }

  intro();
})();
