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
  if (new URLSearchParams(location.search).has("test")) { store.set("nb.rid", "test-" + Math.random().toString(36).slice(2, 12)); history.replaceState(null, "", location.pathname); }
  let rid = store.get("nb.rid");
  if (!rid) { rid = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36)).toLowerCase(); store.set("nb.rid", rid); }
  const device = /Mobi|Android|iPhone/i.test(navigator.userAgent) ? "mobile" : "desktop";
  const qs = new URLSearchParams(location.search);
  if (qs.get("r") && !store.get("nb.ref")) store.set("nb.ref", qs.get("r").replace(/[^a-z0-9]/gi, "").slice(0, 12));
  const ss = { get(k) { try { return sessionStorage.getItem(k); } catch { return null; } }, set(k, v) { try { sessionStorage.setItem(k, v); } catch {} } };
  store.set("nb.ftop", "");
  if (qs.get("t")) ss.set("nb.ftop", qs.get("t").replace(/[^0-9-]/g, "").slice(0, 20));
  if (qs.get("r")) ss.set("nb.fref", qs.get("r").replace(/[^a-z0-9]/gi, "").slice(0, 12));
  if (qs.has("r") || qs.has("t")) history.replaceState(null, "", location.pathname);

  const ref = store.get("nb.ref") || "";
  const myCode = rid.replace(/[^a-z0-9]/g, "").slice(-7);
  let shareUrl = `${location.origin}/?r=${myCode}`;
  const friendTop = ss.get("nb.fref") === myCode ? [] : (ss.get("nb.ftop") || "").split("-").filter(Boolean).map(Number).filter((i) => window.NAMES[i]).map((i) => window.NAMES[i]);

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
    fr: { badges: [["🎯 Œil de lynx","tu as exactement le goût de la foule"],["⚖️ Équilibré","ni mouton, ni rebelle"],["🦄 Visionnaire","tu sens les tendances avant tout le monde"],["🚀 Pionnier","tu fais partie des tout premiers à voter"]], profile: "Ton profil", liveRank: "Classement en direct", iGot: "J'ai eu", played: "personnes ont déjà joué", challenge: "Défie tes potes 🔥", challengeSub: "Ils verront s'ils ont le même goût que toi", viaYou: "personnes ont joué grâce à toi", shareMsg: "Un pote lance une app de bons plans pour étudiants et hésite entre 52 noms. J'ai joué (60 s, anonyme) : mon top c'est {top} 😄 Tu votes quoi ? 👉", challenged: "⚔️ Un ami t'a défié : à la fin, tu verras si vous avez les mêmes goûts.", friendTopT: "Le top de ton ami", common: "de ses favoris, tu les as aussi choisis en duel", toDuels: "Maintenant, choisis ton préféré à chaque duel ⚔️", toRecall: "Maintenant, retrouve les noms du tout début 🧠", toListen: "Maintenant, écoute et trouve la bonne orthographe 🎧", toMeaning: "Dernière étape : devine à quoi sert le site 🤔", okGo: "Go", memIntro: "Mémorise les noms qui vont apparaître 👀", listen2: "Écoute et choisis la bonne orthographe 🎧", ready: "Ça va démarrer et aller vite.", readySub: "Prêt ?", yes: "Oui, je suis prêt", accent: "Accent de la voix", typed: "Tu as écrit" },
    de: { badges: [["🎯 Adlerauge","du hast genau den Geschmack der Masse"],["⚖️ Ausgeglichen","weder Mitläufer noch Rebell"],["🦄 Visionär","du spürst Trends vor allen anderen"],["🚀 Pionier","du gehörst zu den Allerersten"]], profile: "Dein Profil", liveRank: "Live-Ranking", iGot: "Ich bin", played: "Leute haben schon gespielt", challenge: "Fordere deine Freunde heraus 🔥", challengeSub: "Sie sehen, ob sie denselben Geschmack haben", viaYou: "Leute haben dank dir gespielt", shareMsg: "Ein Freund startet eine Deal-App für Studis und schwankt zwischen 52 Namen. Ich hab gespielt (60 Sek., anonym): mein Top ist {top} 😄 Was wählst du? 👉", challenged: "⚔️ Ein Freund hat dich herausgefordert: Am Ende siehst du, ob ihr denselben Geschmack habt.", friendTopT: "Top deines Freundes", common: "seiner Favoriten hast du im Duell auch gewählt", toDuels: "Jetzt: Wähle in jedem Duell deinen Favoriten ⚔️", toRecall: "Jetzt: Finde die Namen vom Anfang wieder 🧠", toListen: "Jetzt: Hör zu und finde die richtige Schreibweise 🎧", toMeaning: "Letzter Schritt: Rate, wofür die Seite ist 🤔", okGo: "Los", memIntro: "Merk dir die Namen, die gleich erscheinen 👀", listen2: "Hör zu und wähle die richtige Schreibweise 🎧", ready: "Gleich geht's los, und zwar schnell.", readySub: "Bereit?", yes: "Ja, bereit", accent: "Akzent der Stimme", typed: "Du hast geschrieben" },
    en: { badges: [["🎯 Eagle eye","you have exactly the crowd's taste"],["⚖️ Balanced","neither sheep nor rebel"],["🦄 Visionary","you sense trends before everyone else"],["🚀 Pioneer","you're one of the very first voters"]], profile: "Your profile", liveRank: "Live ranking", iGot: "I got", played: "people have already played", challenge: "Challenge your friends 🔥", challengeSub: "They'll see if they share your taste", viaYou: "people played thanks to you", shareMsg: "A friend is launching a student deals app and can't pick between 52 names. I played (60 s, anonymous): my top is {top} 😄 What's yours? 👉", challenged: "⚔️ A friend challenged you: at the end you'll see if you share the same taste.", friendTopT: "Your friend's top", common: "of their favourites you also picked in a duel", toDuels: "Now pick your favourite in each duel ⚔️", toRecall: "Now find the names from the very start 🧠", toListen: "Now listen and find the right spelling 🎧", toMeaning: "Last step: guess what the site is for 🤔", okGo: "Go", memIntro: "Remember the names that are about to appear 👀", listen2: "Listen and pick the right spelling 🎧", ready: "It's about to start, and it goes fast.", readySub: "Ready?", yes: "Yes, I'm ready", accent: "Voice accent", typed: "You typed" },
    es: { badges: [["🎯 Ojo de lince","tienes justo el gusto de la mayoría"],["⚖️ Equilibrado","ni oveja ni rebelde"],["🦄 Visionario","sientes las tendencias antes que nadie"],["🚀 Pionero","eres de los primeros en votar"]], profile: "Tu perfil", liveRank: "Ranking en directo", iGot: "Me salió", played: "personas ya han jugado", challenge: "Reta a tus amigos 🔥", challengeSub: "Verán si tienen el mismo gusto que tú", viaYou: "personas jugaron gracias a ti", shareMsg: "Un amigo lanza una app de ofertas para estudiantes y duda entre 52 nombres. He jugado (60 s, anónimo): mi top es {top} 😄 ¿Tú cuál votas? 👉", challenged: "⚔️ Un amigo te ha retado: al final verás si tenéis los mismos gustos.", friendTopT: "El top de tu amigo", common: "de sus favoritos también los elegiste en un duelo", toDuels: "Ahora elige tu favorito en cada duelo ⚔️", toRecall: "Ahora encuentra los nombres del principio 🧠", toListen: "Ahora escucha y encuentra la escritura correcta 🎧", toMeaning: "Último paso: adivina para qué sirve la web 🤔", okGo: "Vamos", memIntro: "Memoriza los nombres que van a aparecer 👀", listen2: "Escucha y elige la escritura correcta 🎧", ready: "Va a empezar y va rápido.", readySub: "¿Listo?", yes: "Sí, estoy listo", accent: "Acento de la voz", typed: "Has escrito" },
    it: { badges: [["🎯 Occhio di lince","hai esattamente il gusto della massa"],["⚖️ Equilibrato","né pecora né ribelle"],["🦄 Visionario","senti le tendenze prima di tutti"],["🚀 Pioniere","sei tra i primissimi a votare"]], profile: "Il tuo profilo", liveRank: "Classifica live", iGot: "Mi è uscito", played: "persone hanno già giocato", challenge: "Sfida i tuoi amici 🔥", challengeSub: "Vedranno se hanno i tuoi stessi gusti", viaYou: "persone hanno giocato grazie a te", shareMsg: "Un amico lancia un'app di offerte per studenti e non sa scegliere tra 52 nomi. Ho giocato (60 s, anonimo): il mio top è {top} 😄 Tu cosa voti? 👉", challenged: "⚔️ Un amico ti ha sfidato: alla fine vedrai se avete gli stessi gusti.", friendTopT: "Il top del tuo amico", common: "dei suoi preferiti li hai scelti anche tu in un duello", toDuels: "Ora scegli il tuo preferito in ogni duello ⚔️", toRecall: "Ora ritrova i nomi dell'inizio 🧠", toListen: "Ora ascolta e trova la grafia giusta 🎧", toMeaning: "Ultimo passo: indovina a cosa serve il sito 🤔", okGo: "Vai", memIntro: "Memorizza i nomi che stanno per apparire 👀", listen2: "Ascolta e scegli la grafia giusta 🎧", ready: "Sta per iniziare e va veloce.", readySub: "Pronto?", yes: "Sì, sono pronto", accent: "Accento della voce", typed: "Hai scritto" },
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

  // ---- goût de la foule (classement en direct) ----
  let crowd = {}, crowdTop = [], crowdN = 0, agree = 0, agreeN = 0;
  fetch("/api/results").then((r) => r.json()).then((d) => {
    crowdN = d.respondents || 0;
    for (const x of d.rows || []) if (x.duels >= 3) crowd[x.name] = x.elo;
    crowdTop = (d.rows || []).filter((x) => x.duels >= 3).slice(0, 5).map((x) => x.name);
  }).catch(() => {});

  // ---- écrans ----
  const screen = (html) => { app.innerHTML = ""; const el = $(`<section style="display:contents">${html}</section>`); app.append(...el.childNodes); window.scrollTo(0, 0); };
  const progress = (i, n) => `<div class="bar"><i style="width:${Math.round((100 * i) / n)}%"></i></div>`;
  const STEPS = 12 + 1 + 2 + 2; // duels + mémoire + écoute + sens
  let step = 0;

  function intro() {
    screen(`<div class="langs">${Object.entries(LANGS).map(([k, v]) => `<button class="lang${k === lang ? " on" : ""}" data-l="${k}">${v}</button>`).join("")}</div><div style="flex:1"></div>${friendTop.length ? `<p class="challenged">${T.challenged}</p>` : ""}<h1>${T.title}</h1><p class="muted">${T.sub}</p><div class="big">⚡️🏷️🔥</div><button id="go">${T.go}</button><div style="flex:1"></div>`);
    app.querySelectorAll("[data-l]").forEach((b) => b.onclick = () => { setLang(b.dataset.l); intro(); });
    document.getElementById("go").onclick = ready;
    fetch("/api/results").then((r) => r.json()).then((d) => { if (d.respondents >= 20) { const el = document.createElement("p"); el.className = "muted"; el.style.textAlign = "center"; el.textContent = `🔥 ${d.respondents} ${T.played}`; document.getElementById("go").before(el); } }).catch(() => {});
  }

  function ready() {
    screen(`<div style="flex:1"></div><h1 style="text-align:center">${T.ready}</h1><p class="muted" style="text-align:center;font-size:18px">${T.readySub}</p><button id="yes">${T.yes}</button><div style="flex:1"></div>`);
    document.getElementById("yes").onclick = () => {
      push("session", { start: Date.now(), ua: device, ref, code: myCode });
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

  const interstitial = (text, next) => {
    screen(`<div style="flex:1"></div><h1 class="memintro">${text}</h1><button id="okgo">${T.okGo}</button><div style="flex:1"></div>`);
    document.getElementById("okgo").onclick = next;
  };

  let memSet = [];
  function memory() {
    memSet = shuffle(NAMES).slice(0, 5);
    let i = 0;
    const show = () => {
      if (i >= memSet.length) return interstitial(T.toDuels, () => duels(0));
      const c = rnd(COLORS);
      screen(`${progress(step, STEPS)}<h2>${T.mem}</h2><div class="flash" style="background:${c}">${esc(memSet[i])}</div><p class="muted" style="text-align:center">${i + 1} / ${memSet.length}</p>`);
      i++; setTimeout(show, 1400);
    };
    show();
  }

  function duels(k, endless = false) {
    if (!endless && k >= 12) return interstitial(T.toRecall, recall);
    const [a, b] = pickPair();
    const scene = rnd(Object.keys(SCENES)), c = rnd(COLORS), t0 = performance.now();
    screen(`${endless ? "" : progress(step, STEPS)}<h2>${T.duel}${endless ? "" : ` <span class="pill">${k + 1}/12</span>`}</h2><p class="muted">${T.tap}</p>
      <div class="duel"><div class="opt" data-n="${esc(a)}">${SCENES[scene](a, c)}</div><div class="vs">VS</div><div class="opt" data-n="${esc(b)}">${SCENES[scene](b, c)}</div></div>
      ${endless ? `<button class="ghost" id="stop">${T.done}</button>` : ""}`);
    app.querySelectorAll(".opt").forEach((el) => el.onclick = () => {
      const win = el.dataset.n;
      app.querySelectorAll(".opt").forEach((o) => o.classList.add(o === el ? "win" : "lose"));
      push("duel", { a, b, win, scene, color: c, pos: win === a ? "top" : "bottom", ms: Math.round(performance.now() - t0) });
      const other = win === a ? b : a;
      if (crowd[a] != null && crowd[b] != null) { agreeN++; if (crowd[win] >= crowd[other]) agree++; }
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
    document.getElementById("nx").onclick = () => { push("recall", { seen: memSet, decoys, picked: [...picked] }); step++; interstitial(T.toListen, () => listen(0)); };
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
    if (k >= 2) return interstitial(T.toMeaning, () => meaning(0));
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

  function confetti() {
    const c = document.createElement("canvas"); c.className = "confetti"; document.body.appendChild(c);
    const x = c.getContext("2d"); c.width = innerWidth; c.height = innerHeight;
    const P = Array.from({ length: 140 }, () => ({ x: Math.random() * c.width, y: -20 - Math.random() * c.height * 0.5, r: 4 + Math.random() * 6, v: 2 + Math.random() * 4, d: Math.random() * 2 - 1, col: rnd(["#ff3d71", "#ffb800", "#7c3aed", "#00c2ff", "#22c55e"]) }));
    let t = 0; const tick = () => { x.clearRect(0, 0, c.width, c.height); for (const p of P) { p.y += p.v; p.x += p.d; x.fillStyle = p.col; x.fillRect(p.x, p.y, p.r, p.r * 0.6); } if (++t < 170) requestAnimationFrame(tick); else c.remove(); }; tick();
  }

  function end() {
    const top = Object.entries(wins).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const pct = agreeN >= 4 ? Math.round((100 * agree) / agreeN) : null;
    const badge = pct == null ? T.badges[3] : pct >= 70 ? T.badges[0] : pct >= 40 ? T.badges[1] : T.badges[2];
    screen(`<div class="badge"><div class="bt">${T.profile}</div><div class="bn">${badge[0]}</div><div class="bs">${badge[1]}${pct != null ? ` · ${pct}%` : ""}</div></div>
      <h2>${T.yourTop}</h2><div class="list">${top.map(([n, w], i) => `<div class="row"><b>${["🥇", "🥈", "🥉"][i]} ${esc(n)}</b><span class="muted">${w}</span></div>`).join("")}</div>
      <div class="cta"><h2>${T.challenge}</h2><p class="muted">${T.challengeSub}</p>
      <a id="wa" class="wa" href="#">WhatsApp</a><button class="ghost" id="sh">${T.share}</button>
      <p class="muted" id="via" style="text-align:center"></p></div>
      ${crowdN >= 20 && crowdTop.length ? `<h2>${T.liveRank}</h2><div class="list">${crowdTop.map((n, i) => `<div class="row"><b>${i + 1}. ${esc(n)}</b>${top.some(([m]) => m === n) ? "<span>⭐</span>" : ""}</div>`).join("")}</div>` : ""}
      <button class="ghost" id="more">${T.more}</button>`);
    confetti();
    shareUrl = `${location.origin}/?r=${myCode}&t=${top.map(([n]) => window.NAMES.indexOf(n)).join("-")}`;
    const msg = `${T.iGot} « ${badge[0]} » 😄 ${T.shareMsg.replace("{top}", top.map(([n]) => n).join(", "))} ${shareUrl}`;
    if (friendTop.length) {
      const common = friendTop.filter((n) => wins[n]).length;
      document.querySelector(".cta").insertAdjacentHTML("beforebegin", `<div class="row"><b>${T.friendTopT}</b><span class="muted">${friendTop.map(esc).join(", ")}</span></div><p style="text-align:center;font-weight:800">🤝 ${common}/${friendTop.length} ${T.common}</p>`);
      push("session", { friendCommon: common });
    }
    document.getElementById("wa").href = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    document.getElementById("wa").onclick = () => push("session", { shared: "whatsapp" });
    fetch(`/api/ref?c=${myCode}`).then((r) => r.json()).then((d) => { if (d.count > 0) document.getElementById("via").textContent = `🙌 ${d.count} ${T.viaYou}`; }).catch(() => {});
    document.getElementById("more").onclick = () => duels(0, true);
    document.getElementById("sh").onclick = async () => { push("session", { shared: "native" }); try { await navigator.share({ title: "Name Battle", text: msg, url: shareUrl }); } catch { try { await navigator.clipboard.writeText(`${msg}`); } catch {} } };
  }

  intro();
})();
