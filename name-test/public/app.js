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
  const LANGS = { fr: "🇫🇷 FR", de: "🇩🇪 DE", en: "🇬🇧 EN", es: "🇪🇸 ES", it: "🇮🇹 IT" };
  const L = store.get("nb.lang") || (navigator.language || "en").slice(0, 2);
  let lang = LANGS[L] ? L : "en";
  const DICT = {
    fr: { title: "Aide-nous à choisir le nom de notre app 🔥", sub: "Une app qui trouve les meilleurs bons plans de ta ville. 60 secondes, anonyme, aucune inscription.", go: "C'est parti", mem: "Mémorise ces noms 👀", duel: "Lequel tu choisirais ?", tap: "Touche ton préféré", recall: "Lesquels as-tu vus au tout début ?", recallSub: "Touche tous ceux que tu reconnais", next: "Suivant", listen: "Écoute et écris le nom 🎧", replay: "Écouter", meaning: "Avec ce nom, ce site sert à…", mOpts: { deals: "Trouver des bons plans", games: "Jouer à des jeux", travel: "Réserver des voyages", bank: "Une banque / finance", food: "Commander à manger" }, done: "Merci ! 🙌", yourTop: "Ton top", more: "Encore des duels", share: "Partager le test", city: "Zürich", tag: "Les meilleurs bons plans de ta ville", app: "Bons plans · Étudiants", notif: "−58 % sur les AirPods, encore 2 h", skip: "Passer" },
    de: { title: "Hilf uns, den Namen unserer App zu wählen 🔥", sub: "Eine App, die die besten Deals deiner Stadt findet. 60 Sekunden, anonym, ohne Anmeldung.", go: "Los geht's", mem: "Merk dir diese Namen 👀", duel: "Welchen würdest du wählen?", tap: "Tippe auf deinen Favoriten", recall: "Welche hast du ganz am Anfang gesehen?", recallSub: "Tippe alle an, die du wiedererkennst", next: "Weiter", listen: "Hör zu und schreib den Namen 🎧", replay: "Anhören", meaning: "Mit diesem Namen ist die Seite für…", mOpts: { deals: "Schnäppchen finden", games: "Games spielen", travel: "Reisen buchen", bank: "Bank / Finanzen", food: "Essen bestellen" }, done: "Danke! 🙌", yourTop: "Deine Top", more: "Mehr Duelle", share: "Test teilen", city: "Zürich", tag: "Die besten Deals deiner Stadt", app: "Deals · Studis", notif: "−58 % auf AirPods, noch 2 Std.", skip: "Überspringen" },
    en: { title: "Help us pick our app's name 🔥", sub: "An app that finds the best deals in your city. 60 seconds, anonymous, no sign-up.", go: "Let's go", mem: "Remember these names 👀", duel: "Which one would you pick?", tap: "Tap your favourite", recall: "Which ones did you see at the very start?", recallSub: "Tap all you recognise", next: "Next", listen: "Listen and type the name 🎧", replay: "Listen", meaning: "With this name, the site is for…", mOpts: { deals: "Finding bargains", games: "Playing games", travel: "Booking travel", bank: "A bank / finance", food: "Ordering food" }, done: "Thanks! 🙌", yourTop: "Your top", more: "More duels", share: "Share the test", city: "Zürich", tag: "The best deals in your city", app: "Deals · Students", notif: "−58% on AirPods, 2 h left", skip: "Skip" },
    es: { title: "Ayúdanos a elegir el nombre de nuestra app 🔥", sub: "Una app que encuentra las mejores ofertas de tu ciudad. 60 segundos, anónimo, sin registro.", go: "Vamos", mem: "Memoriza estos nombres 👀", duel: "¿Cuál elegirías?", tap: "Toca tu favorito", recall: "¿Cuáles viste al principio?", recallSub: "Toca todos los que reconozcas", next: "Siguiente", listen: "Escucha y escribe el nombre 🎧", replay: "Escuchar", meaning: "Con este nombre, la web sirve para…", mOpts: { deals: "Encontrar chollos", games: "Jugar a juegos", travel: "Reservar viajes", bank: "Un banco / finanzas", food: "Pedir comida" }, done: "¡Gracias! 🙌", yourTop: "Tu top", more: "Más duelos", share: "Compartir el test", city: "Zürich", tag: "Las mejores ofertas de tu ciudad", app: "Ofertas · Estudiantes", notif: "−58 % en AirPods, quedan 2 h", skip: "Saltar" },
    it: { title: "Aiutaci a scegliere il nome della nostra app 🔥", sub: "Un'app che trova le migliori offerte della tua città. 60 secondi, anonimo, senza registrazione.", go: "Iniziamo", mem: "Memorizza questi nomi 👀", duel: "Quale sceglieresti?", tap: "Tocca il tuo preferito", recall: "Quali hai visto all'inizio?", recallSub: "Tocca tutti quelli che riconosci", next: "Avanti", listen: "Ascolta e scrivi il nome 🎧", replay: "Ascolta", meaning: "Con questo nome, il sito serve a…", mOpts: { deals: "Trovare offerte", games: "Giocare", travel: "Prenotare viaggi", bank: "Una banca / finanza", food: "Ordinare cibo" }, done: "Grazie! 🙌", yourTop: "Il tuo top", more: "Altri duelli", share: "Condividi il test", city: "Zürich", tag: "Le migliori offerte della tua città", app: "Offerte · Studenti", notif: "−58% sugli AirPods, ancora 2 h", skip: "Salta" },
  };
  const EXTRA = {
    fr: { memIntro: "Mémorise les noms qui vont apparaître 👀", listen2: "Écoute et choisis la bonne orthographe 🎧", ready: "Ça va démarrer et aller vite.", readySub: "Prêt ?", yes: "Oui, je suis prêt", accent: "Accent de la voix", typed: "Tu as écrit" },
    de: { memIntro: "Merk dir die Namen, die gleich erscheinen 👀", listen2: "Hör zu und wähle die richtige Schreibweise 🎧", ready: "Gleich geht's los, und zwar schnell.", readySub: "Bereit?", yes: "Ja, bereit", accent: "Akzent der Stimme", typed: "Du hast geschrieben" },
    en: { memIntro: "Remember the names that are about to appear 👀", listen2: "Listen and pick the right spelling 🎧", ready: "It's about to start, and it goes fast.", readySub: "Ready?", yes: "Yes, I'm ready", accent: "Voice accent", typed: "You typed" },
    es: { memIntro: "Memoriza los nombres que van a aparecer 👀", listen2: "Escucha y elige la escritura correcta 🎧", ready: "Va a empezar y va rápido.", readySub: "¿Listo?", yes: "Sí, estoy listo", accent: "Acento de la voz", typed: "Has escrito" },
    it: { memIntro: "Memorizza i nomi che stanno per apparire 👀", listen2: "Ascolta e scegli la grafia giusta 🎧", ready: "Sta per iniziare e va veloce.", readySub: "Pronto?", yes: "Sì, sono pronto", accent: "Accento della voce", typed: "Hai scritto" },
  };
  let T = { ...DICT[lang], ...EXTRA[lang] };
  const setLang = (l) => { lang = l; T = { ...DICT[l], ...EXTRA[l] }; store.set("nb.lang", l); };

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
  const COLORS = ["#ef4444", "#f97316", "#8b5cf6", "#0ea5e9", "#10b981", "#ec4899", "#2563eb", "#d946ef"];
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
    screen(`<div class="langs">${Object.entries(LANGS).map(([k, v]) => `<button class="lang${k === lang ? " on" : ""}" data-l="${k}">${v}</button>`).join("")}</div><div style="flex:1"></div><h1>${T.title}</h1><p class="muted">${T.sub}</p><div class="big">⚡️🏷️🔥</div><button id="go">${T.go}</button><div style="flex:1"></div>`);
    app.querySelectorAll("[data-l]").forEach((b) => b.onclick = () => { setLang(b.dataset.l); intro(); });
    document.getElementById("go").onclick = ready;
  }

  function ready() {
    screen(`<div style="flex:1"></div><h1 style="text-align:center">${T.ready}</h1><p class="muted" style="text-align:center;font-size:18px">${T.readySub}</p><button id="yes">${T.yes}</button><div style="flex:1"></div>`);
    document.getElementById("yes").onclick = () => {
      push("session", { start: Date.now(), ua: device });
      screen(`<div style="flex:1"></div><h1 class="memintro">${T.memIntro}</h1><div style="flex:1"></div>`);
      let n = 3;
      const tick = () => {
        if (n === 0) return memory();
        screen(`<div style="flex:1"></div><div class="count">${n}</div><div style="flex:1"></div>`);
        n--; setTimeout(tick, 750);
      };
      setTimeout(tick, 2200);
    };
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
  const ACCENTS = { "fr-FR": "🇫🇷 FR", "de-DE": "🇩🇪 DE", "en-GB": "🇬🇧 UK", "en-US": "🇺🇸 US", "es-ES": "🇪🇸 ES", "it-IT": "🇮🇹 IT" };
  const DEFAULT_ACCENT = { fr: "fr-FR", de: "de-DE", en: "en-GB", es: "es-ES", it: "it-IT" };
  let accent = store.get("nb.accent") || DEFAULT_ACCENT[lang];
  if (!ACCENTS[accent]) accent = DEFAULT_ACCENT[lang];
  const QUALITY = /premium|enhanced|natural|neural|siri|google|online/i;
  const pickVoice = (loc) => {
    const vs = (canSpeak && speechSynthesis.getVoices()) || [];
    const base = loc.slice(0, 2);
    const exact = vs.filter((v) => v.lang.replace("_", "-").toLowerCase() === loc.toLowerCase());
    const close = exact.length ? exact : vs.filter((v) => v.lang.toLowerCase().startsWith(base));
    return close.sort((a, b) => (QUALITY.test(b.name) ? 1 : 0) - (QUALITY.test(a.name) ? 1 : 0))[0] || null;
  };
  if (canSpeak) { try { speechSynthesis.getVoices(); speechSynthesis.onvoiceschanged = () => {}; } catch {} }
  const RULES = [["prix","pri"],["prix","pree"],["prix","priks"],["cent","sent"],["cent","sant"],["gratis","grati"],["gratis","grattis"],["loot","lute"],["loot","lout"],
    ["gem","jem"],["x","ks"],["ee","i"],["y","ie"],["ck","k"],["ou","u"],["er","eur"],["ea","ee"],["oo","ou"],["ss","s"],["s","z"],["o","oh"],["a","ah"],["u","oo"],["i","ee"]];
  const spellings = (name) => {
    const low = name.toLowerCase(), cap = (w) => w[0].toUpperCase() + w.slice(1), lowNames = new Set(NAMES.map((n) => n.toLowerCase()));
    const out = new Set();
    for (const [a, b] of shuffle(RULES)) { if (low.includes(a)) { const v = low.replace(a, b); if (v !== low && !lowNames.has(v)) out.add(v); } if (out.size >= 6) break; }
    for (const [a, b] of RULES) { const x = [...out][0]; if (out.size >= 3 || !x) break; if (x.includes(a)) out.add(x.replace(a, b)); }
    return shuffle([low, ...shuffle([...out]).slice(0, 3)]).map(cap);
  };
  function listen(k) {
    if (k >= 2) return meaning(0);
    const name = rnd(NAMES);
    let voiceName = "";
    // Enregistrements neuronaux (Piper, pré-générés) ; voix du navigateur seulement en secours.
    const tts = () => { try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(name); const v = pickVoice(accent); if (v) { u.voice = v; voiceName = "browser:" + v.name; } u.lang = accent; u.rate = 0.85; speechSynthesis.speak(u); } catch {} };
    let audio = null;
    const say = () => {
      if (audio) { audio.pause(); }
      audio = new Audio(`/audio/${accent}/${name.toLowerCase()}.m4a`);
      voiceName = "piper:" + accent;
      audio.play().catch(() => tts());
    };
    screen(`${progress(step, STEPS)}<h2>${T.listen2}</h2>
      <p class="muted">${T.accent}</p><div class="accents">${Object.entries(ACCENTS).map(([k, v]) => `<button class="lang${k === accent ? " on" : ""}" data-a="${k}">${v}</button>`).join("")}</div>
      <button id="pl">🔊 ${T.replay}</button>
      <div class="list">${spellings(name).map((w) => `<button class="ghost" data-w="${esc(w)}">${esc(w)}</button>`).join("")}</div>
      <input id="in" hidden><button id="nx" hidden></button><button class="ghost" id="sk">${T.skip}</button>`);
    app.querySelectorAll("[data-a]").forEach((b) => b.onclick = () => { accent = b.dataset.a; store.set("nb.accent", accent); app.querySelectorAll("[data-a]").forEach((x) => x.classList.toggle("on", x === b)); say(); });
    document.getElementById("pl").onclick = say;
    const inp = document.getElementById("in"), echo = document.getElementById("echo");
    inp.oninput = () => { echo.textContent = inp.value ? `${T.typed} : ${inp.value}` : ""; };
    const go = (choice) => { if (choice) push("spell", { name, typed: choice, mode: "mcq", accent, voice: voiceName.slice(0, 60) }); step++; listen(k + 1); };
    app.querySelectorAll("[data-w]").forEach((b) => b.onclick = () => go(b.dataset.w));
    document.getElementById("sk").onclick = () => go(null);
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
