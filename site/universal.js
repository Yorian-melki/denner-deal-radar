"use strict";
// St. Gallen Deal Radar — vues universelles (#u/...). Les vues Denner V2 (#semaine…)
// restent servies par app.js, inchangées.
(function () {
  const U = { deals: [], src: null, loaded: false, view: "accueil", params: {}, limit: 50, map: null };
  const $ = (s) => document.querySelector(s);
  const DAYS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
  const VIEWS = [
    ["accueil", "🏠 Accueil"], ["top", "🏆 Top"], ["nouveautes", "🆕 Nouveautés"], ["ultra", "🚨 Ultra"],
    ["gratuit", "🎁 Gratuit"], ["antigaspi", "🥡 Anti-gaspi"], ["supermarches", "🛒 Supermarchés"],
    ["restaurants", "🍔 Restaurants"], ["tech", "💻 Tech"], ["occasion", "♻️ Occasion"],
    ["reconditionne", "🔁 Reconditionné"], ["etudiant", "🎓 Étudiant"], ["transport", "🚆 Transport"],
    ["voyage", "✈️ Voyage"], ["evenements", "🎟️ Événements"], ["cashback", "💸 Cashback"],
    ["coupons", "🏷️ Coupons"], ["records", "📉 Records"], ["anomalies", "⚡ Anomalies"],
    ["fin", "⏳ Fin bientôt"], ["historique", "🗂️ Historique"], ["favoris", "★ Favoris"],
    ["carte", "🗺️ Carte"], ["sources", "🔌 Sources"], ["sante", "🩺 Santé"],
  ];
  const FAM = {
    gratuit: ["free", "digital_free"], antigaspi: ["surplus"], supermarches: ["grocery"], restaurants: ["restaurant"],
    tech: ["tech", "flash"], occasion: ["secondhand"], reconditionne: ["refurbished"], etudiant: ["student"],
    transport: ["transport"], voyage: ["travel"], evenements: ["event"], cashback: ["cashback"], coupons: ["coupon"],
  };
  const FAMILY_LABEL = { grocery: "🛒 Supermarché", retail: "🏷️ Commerce", tech: "💻 Tech", flash: "⚡ Vente flash",
    surplus: "🥡 Anti-gaspi", free: "🎁 Gratuit", secondhand: "♻️ Occasion", refurbished: "🔁 Reconditionné",
    restaurant: "🍔 Restauration", student: "🎓 Étudiant", transport: "🚆 Transport", travel: "✈️ Voyage",
    event: "🎟️ Événement", subscription: "📱 Abonnement", cashback: "💸 Cashback", coupon: "🏷️ Coupon",
    contest: "🎲 Concours", digital_free: "🎮 Gratuit numérique", local_news: "📍 Ouverture/fermeture" };
  const REF = { merchant_previous: "ancien prix", msrp: "prix conseillé", competitor: "prix concurrent cité",
    declared_value: "valeur annoncée", market: "prix de marché", catalog: "prix catalogue",
    community_claimed: "référence communautaire", stated_percent_only: "", none: "" };
  const URG = { LOW: "", MEDIUM: "moyenne", HIGH: "haute", VERY_HIGH: "très haute", CRITICAL: "critique" };
  const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* privé */ } } };
  let favs = new Set(ls.get("ufavs", []));

  const chf = (x) => (x == null ? "—" : Number(x).toFixed(2));
  const day = (iso) => { if (!iso) return "?"; const d = new Date(iso); return `${DAYS[d.getDay()]} ${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`; };
  const hhmm = (iso) => new Date(iso).toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" });
  const ago = (iso) => { if (!iso) return "jamais"; const m = (Date.now() - new Date(iso)) / 60000; return m < 60 ? `il y a ${Math.round(m)} min` : m < 2880 ? `il y a ${Math.round(m / 60)} h` : `il y a ${Math.round(m / 1440)} j`; };
  const left = (iso) => { const h = (new Date(iso) - Date.now()) / 3600000; if (h < 0) return "terminée"; if (h < 1) return `encore ${Math.max(1, Math.round(h * 60))} min`; if (h < 48) return `encore ${Math.round(h)} h`; return `encore ${Math.round(h / 24)} j`; };
  const color = (s) => s == null ? "var(--s0)" : s >= 9 ? "var(--s9)" : s >= 8 ? "var(--s8)" : s >= 7 ? "var(--s7)" : s >= 5 ? "var(--s5)" : s >= 2.5 ? "var(--s2)" : "var(--s0)";
  const label = (s) => s == null ? "non évaluée" : s >= 9 ? "exceptionnelle" : s >= 8 ? "excellente" : s >= 7 ? "très bonne" : s >= 5 ? "correcte" : s >= 2.5 ? "faible" : "insignifiante";
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  // Statut recalculé à l'heure courante (jamais confiance aveugle dans le cache).
  function life(d) {
    if (d.lifecycle === "REMOVED") return "REMOVED";
    const now = Date.now();
    if (d.ends_at && new Date(d.ends_at) < now) return "EXPIRED";
    if (d.starts_at && new Date(d.starts_at) > now) return "UPCOMING";
    if (d.ends_at && new Date(d.ends_at) - now < 86400000) return "ENDING_SOON";
    return d.lifecycle === "LOW_STOCK" ? "LOW_STOCK" : "ACTIVE";
  }
  const isLive = (d) => !["EXPIRED", "REMOVED"].includes(d.life);

  async function load() {
    if (U.loaded) return;
    const bust = `?t=${Math.floor(Date.now() / 300000)}`;
    const [u, s] = await Promise.all([
      fetch("data/universal.json" + bust).then((r) => { U.offline = r.headers.get("X-From-Cache") === "1"; return r.json(); }),
      fetch("data/sources.json" + bust).then((r) => r.json()).catch(() => ({})),
    ]);
    U.generated = u.generated_at;
    U.deals = u.deals.map((d) => ({ ...d, life: life(d) }));
    U.src = s;
    U.loaded = true;
  }

  function buildNav() {
    const nav = $("#u-nav");
    if (nav.childElementCount) return;
    for (const [k, l] of VIEWS) { const a = el("a", null, l); a.href = `#u/${k}`; nav.append(a); }
    const srcSel = $("#u-source");
    const merchants = new Set();
    for (const d of U.deals) { if (d.merchant) merchants.add(d.merchant); }
    srcSel.append(new Option("Toutes sources", ""));
    for (const h of U.src.health || []) srcSel.append(new Option(h.name, h.id));
    const ms = $("#u-merchant");
    ms.append(new Option("Tous marchands", ""));
    for (const m of [...merchants].sort()) ms.append(new Option(m, m));
    for (const id of ["u-q", "u-source", "u-merchant", "u-scope", "u-cond", "u-minscore", "u-minconf", "u-maxprice",
      "u-mindisc", "u-urg", "u-sort", "u-hidepref", "u-free", "u-student", "u-coupon", "u-cashback", "u-dupes"]) {
      const e = $("#" + id); if (e) e.addEventListener("input", () => { U.limit = 50; render(); });
    }
  }

  function header() {
    const hs = (U.src.health || []);
    const ok = hs.filter((h) => !h.stale && h.state !== "SCRAPE_FAILURE").length;
    const live = U.deals.filter(isLive).filter((d) => !d.duplicate_of).length;
    $("#updated").textContent = `Mis à jour ${ago(U.generated)} · ${ok}/${hs.length} sources OK · ${live} offres uniques`;
    const stale = hs.filter((h) => h.stale || h.state === "SCRAPE_FAILURE");
    const b = $("#banner");
    if (U.offline) { b.hidden = false; b.textContent = `📴 Hors ligne : données du ${day(U.generated)} ${hhmm(U.generated)}. Les offres expirées depuis sont masquées.`; }
    else if (stale.length) { b.hidden = false; b.textContent = `⚠️ Sources en retard ou en panne : ${stale.map((h) => h.name).join(", ")}. Leurs dernières données valides restent affichées.`; }
    else b.hidden = true;
  }

  function filters(list) {
    const v = (id) => ($("#" + id) || {}).value || "";
    const c = (id) => !!($("#" + id) || {}).checked;
    const q = v("u-q").trim().toLowerCase();
    const minS = parseFloat(v("u-minscore")), minC = parseFloat(v("u-minconf")), maxP = parseFloat(v("u-maxprice")), minD = parseFloat(v("u-mindisc"));
    const urgRank = { LOW: 0, MEDIUM: 1, HIGH: 2, VERY_HIGH: 3, CRITICAL: 4 };
    return list.filter((d) => {
      if (!c("u-dupes") && d.duplicate_of) return false;
      if (d.eligible_home === false) return false;
      if (c("u-hidepref") && (d.tags || []).some((t) => t === "porc" || t === "fruits_de_mer")) return false;
      if (v("u-source") && d.source_id !== v("u-source")) return false;
      if (v("u-merchant") && d.merchant !== v("u-merchant")) return false;
      if (v("u-scope")) {
        const sc = d.geographic_scope_resolved || d.geographic_scope;
        if (v("u-scope") === "LOCALISH" ? !["LOCAL", "NEARBY"].includes(sc) : sc !== v("u-scope")) return false;
      }
      if (v("u-cond") && (d.condition || "new") !== v("u-cond") && !(v("u-cond") === "refurb" && String(d.condition).startsWith("refurb"))) return false;
      if (!isNaN(minS) && !(d.deal_score >= minS)) return false;
      if (!isNaN(minC) && !((d.score_confidence || 0) * 100 >= minC)) return false;
      if (!isNaN(maxP) && !(d.current_price != null && d.current_price <= maxP)) return false;
      if (!isNaN(minD) && !((d.effective_discount || 0) >= minD)) return false;
      if (v("u-urg") && urgRank[d.urgency || "LOW"] < urgRank[v("u-urg")]) return false;
      if (c("u-free") && !(d.current_price === 0 || ["free", "digital_free"].includes(d.family))) return false;
      if (c("u-student") && !d.requires_student && d.family !== "student") return false;
      if (c("u-coupon") && !d.requires_coupon && d.family !== "coupon") return false;
      if (c("u-cashback") && !d.cashback && d.family !== "cashback") return false;
      if (q && !`${d.title} ${d.merchant || ""} ${d.brand || ""} ${d.description || ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }

  function sort(list) {
    const k = ($("#u-sort") || {}).value || "score";
    const sc = (d) => (d.deal_score == null ? -1 : d.deal_score);
    const f = {
      score: (a, b) => sc(b) - sc(a) || (b.score_confidence || 0) - (a.score_confidence || 0),
      savings: (a, b) => (b.net_savings || 0) - (a.net_savings || 0),
      disc: (a, b) => (b.effective_discount ?? -1) - (a.effective_discount ?? -1),
      unit: (a, b) => (a.unit_price ?? 1e9) - (b.unit_price ?? 1e9),
      end: (a, b) => new Date(a.ends_at || 8e15) - new Date(b.ends_at || 8e15),
      rel: (a, b) => (b.personal_relevance || 0) - (a.personal_relevance || 0) || sc(b) - sc(a),
      new: (a, b) => new Date(b.first_seen_at || 0) - new Date(a.first_seen_at || 0),
      price: (a, b) => (a.current_price ?? 1e9) - (b.current_price ?? 1e9),
      anomaly: (a, b) => (b.anomaly_score || 0) - (a.anomaly_score || 0),
    }[k];
    return list.sort(f);
  }

  function select() {
    const all = U.deals, live = all.filter(isLive), now = Date.now();
    const v = U.view;
    if (FAM[v]) return { title: VIEWS.find((x) => x[0] === v)[1], list: live.filter((d) => FAM[v].includes(d.family) || (v === "etudiant" && d.requires_student)) };
    switch (v) {
      case "top": return { title: "Meilleures offres valables (toutes sources)", list: live.filter((d) => d.life !== "UPCOMING") };
      case "nouveautes": { const since = U.params.since ? new Date(U.params.since) : new Date(now - 86400000);
        return { title: `Apparues depuis ${day(since.toISOString())} ${hhmm(since.toISOString())}`, list: live.filter((d) => new Date(d.first_seen_at) >= since - 1000) }; }
      case "ultra": return { title: "Ultra deals (≥ 8/10, confiance ≥ 50 %)", list: live.filter((d) => d.deal_score >= 8 && (d.score_confidence || 0) >= 0.5) };
      case "records": return { title: "Records (meilleures notes jamais vues, même échelle absolue)", list: all.filter((d) => d.record) };
      case "anomalies": return { title: "Anomalies de prix (avec leur niveau de confiance)", list: live.filter((d) => (d.anomaly_score || 0) >= 3) };
      case "fin": return { title: "Se terminent dans les 24 h", list: live.filter((d) => d.ends_at && new Date(d.ends_at) - now < 86400000 && new Date(d.ends_at) > now) };
      case "historique": return { title: "Historique (y compris terminées)", list: all };
      case "favoris": return { title: "Mes favoris", list: all.filter((d) => favs.has(d.canonical_entity_id || d.deal_id)) };
      default: return { title: "", list: live };
    }
  }

  function render() {
    const main = $("#main");
    main.innerHTML = "";
    $("#u-controls").hidden = ["accueil", "sources", "sante", "carte"].includes(U.view);
    if (U.view === "accueil") return home(main);
    if (U.view === "sources") return sources(main);
    if (U.view === "sante") return health(main);
    if (U.view === "carte") return map(main);
    const { title, list } = select();
    const items = sort(filters(list));
    main.append(el("p", "summary muted", `${title} — ${items.length} offre(s)`));
    notice(main, items);
    grid(main, items);
  }

  function notice(main, items) {
    const scored = items.filter((d) => d.deal_score != null);
    if (scored.length && Math.max(...scored.map((d) => d.deal_score)) < 5)
      main.append(el("div", "notice", "ℹ️ Aucune offre de cette vue ne dépasse 5/10 : la note est absolue, elle n'est pas gonflée pour remplir le classement."));
  }

  function grid(main, items) {
    const g = el("div", "grid");
    for (const d of items.slice(0, U.limit)) g.append(card(d));
    main.append(g);
    if (items.length > U.limit) {
      const b = el("button", "more", `Afficher plus (${items.length - U.limit} restantes)`);
      b.onclick = () => { U.limit += 50; render(); };
      main.append(b);
    }
  }

  function home(main) {
    const live = U.deals.filter(isLive).filter((d) => !d.duplicate_of && d.eligible_home !== false);
    const hide = (d) => ($("#u-hidepref") || { checked: true }).checked && (d.tags || []).some((t) => t === "porc" || t === "fruits_de_mer");
    const sec = (t, list, link) => {
      if (!list.length) return;
      const h = el("h2", null, t); main.append(h);
      grid(main, list.slice(0, 6));
      if (link) { const a = el("a", "link", "Tout voir →"); a.href = link; main.append(a); }
    };
    const best = sort(live.filter((d) => !hide(d) && d.life !== "UPCOMING"));
    const top = best[0];
    if (top && top.deal_score != null && top.deal_score < 5) main.append(el("div", "notice", "ℹ️ Aucune offre ne dépasse 5/10 en ce moment."));
    const fam = {};
    for (const d of live) fam[d.family] = (fam[d.family] || 0) + 1;
    const p = el("p", "summary muted", Object.entries(fam).sort((a, b) => b[1] - a[1]).map(([f, n]) => `${FAMILY_LABEL[f] || f} ${n}`).join(" · "));
    main.append(p);
    sec("🚨 Ultra deals", best.filter((d) => d.deal_score >= 8 && (d.score_confidence || 0) >= 0.5), "#u/ultra");
    sec("⏳ À saisir vite", sort(live.filter((d) => ["CRITICAL", "VERY_HIGH"].includes(d.urgency) && (d.deal_score || 0) >= 5)), "#u/fin");
    sec("🎁 Gratuit", sort(live.filter((d) => ["free", "digital_free"].includes(d.family))), "#u/gratuit");
    sec("🥡 Anti-gaspi", sort(live.filter((d) => d.family === "surplus")), "#u/antigaspi");
    sec("🏆 Top toutes catégories", best, "#u/top");
    const dn = el("a", "more", "🛒 Ouvrir la vue Denner détaillée (semaine, semaine prochaine, magasins…)");
    dn.href = "#semaine"; dn.style.textAlign = "center"; main.append(dn);
  }

  function li(text, cls) { return el("li", cls, text); }

  function card(d) {
    const n = el("article", "card");
    const img = el("div", "img");
    if (d.image_url) { const i = el("img"); i.loading = "lazy"; i.alt = ""; i.src = d.image_url + (d.image_url.includes("imgix") ? "?w=180&auto=format" : ""); img.append(i); }
    else img.textContent = (FAMILY_LABEL[d.family] || "•").split(" ")[0];
    n.append(img);
    const b = el("div", "body");
    const head = el("div", "head");
    const s = el("span", "score", d.deal_score == null ? "n/é" : d.deal_score.toFixed(1));
    s.style.background = color(d.deal_score);
    head.append(s, el("span", "slabel", `${label(d.deal_score)} · confiance ${Math.round((d.score_confidence || 0) * 100)} %`));
    const key = d.canonical_entity_id || d.deal_id;
    const fav = el("button", "fav" + (favs.has(key) ? " on" : ""), favs.has(key) ? "★" : "☆");
    fav.onclick = () => { favs.has(key) ? favs.delete(key) : favs.add(key); ls.set("ufavs", [...favs]); render(); };
    head.append(fav);
    b.append(head);
    b.append(el("h3", "name", d.title));
    b.append(el("p", "sub muted", [FAMILY_LABEL[d.family], d.merchant, d.package_size || d.description].filter(Boolean).join(" · ").slice(0, 160)));
    const pr = el("div", "prices");
    if (d.current_price != null) pr.append(el("span", "now", d.current_price === 0 ? "GRATUIT" : `CHF ${chf(d.current_price)}`));
    if (d.reference_price != null) {
      const t = d.reference_price_type;
      pr.append(t === "merchant_previous" ? el("span", "was", chf(d.reference_price)) : el("span", "ref-comp", `${REF[t] || "réf."} ${chf(d.reference_price)}`));
    }
    if (d.effective_discount != null && d.current_price !== 0) pr.append(el("span", "disc", `−${Math.round(d.effective_discount)} % réels`));
    if (d.unit_price != null) pr.append(el("span", "unit", `${chf(d.unit_price)} ${d.unit || ""}`));
    b.append(pr);
    const f = el("ul", "facts");
    if (d.total_acquisition_cost != null && d.total_acquisition_cost !== d.current_price) f.append(li(`💳 Coût total ${chf(d.total_acquisition_cost)} (${(d.cost_assumptions || []).join(", ")})`));
    if (d.net_savings) f.append(li(`💰 Économie estimée ~CHF ${chf(d.net_savings)}`, "ok"));
    if (d.historical_median != null) f.append(li(`📊 Médiane observée ${chf(d.historical_median)} · plus bas ${chf(d.historical_low)} (${d.history_n} relevés)`));
    if (d.life === "UPCOMING") f.append(li(`📅 Dès ${day(d.starts_at)}`, "warn"));
    else if (d.ends_at) f.append(li(`⏳ Jusqu'au ${day(d.ends_at)} ${hhmm(d.ends_at)} · ${left(d.ends_at)}`, d.life === "ENDING_SOON" ? "warn" : ""));
    if (d.urgency && URG[d.urgency]) f.append(li(`🚦 Urgence ${URG[d.urgency]}${(d.urgency_reasons || []).length ? " — " + d.urgency_reasons.join(", ") : ""}`, ["CRITICAL", "VERY_HIGH"].includes(d.urgency) ? "bad" : "warn"));
    if (d.pickup_window) f.append(li(`🕕 Collecte ${d.pickup_window}`));
    if (d.distance_km != null && d.source_id !== "denner") f.append(li(`📍 ${d.distance_km.toFixed(1)} km du centre${d.address ? " · " + d.address : ""}`));
    const reqs = [d.requires_student && "étudiant", d.requires_account && "compte", d.requires_coupon && "code", d.requires_membership && "membre", d.requires_referral && "parrainage"].filter(Boolean);
    if (reqs.length) f.append(li(`🔐 Conditions d'accès : ${reqs.join(", ")}`, "warn"));
    for (const c of (d.conditions || []).slice(0, 2)) f.append(li(`• ${c}`));
    if (d.availability_status === "ELIGIBLE_NOT_VERIFIED") f.append(li("🏪 Éligible à St-Gall (offre nationale) — stock non vérifié"));
    if ((d.corroborated_by || []).length) f.append(li(`✔️ Confirmée par ${d.corroborated_by.length} autre(s) source(s)`, "ok"));
    if (d.possible_duplicate_of) f.append(li("≈ Doublon possible d'une autre offre (prix divergent)", "warn"));
    if (d.anomaly_score >= 3) f.append(li(`⚡ Anomalie ${d.anomaly_score}/10 (confiance ${Math.round((d.anomaly_confidence || 0) * 100)} %)${(d.anomaly_checks || []).length ? " — " + d.anomaly_checks.join(", ") : ""}`, "warn"));
    if (d.promotion_integrity === "inflated_reference" || d.promotion_integrity === "above_usual_price") f.append(li("🚩 Fausse promo probable : prix habituel ou référence gonflée", "bad"));
    if ((d.tags || []).includes("porc")) f.append(li("🐖 contient du porc", "warn"));
    if ((d.watchlists || []).length) f.append(li(`👀 Watchlist : ${d.watchlists.join(", ")}`, "ok"));
    b.append(f);
    if ((d.score_components || []).length) {
      const det = el("details", "why");
      det.append(el("summary", null, `Pourquoi ${d.deal_score == null ? "non évaluée" : d.deal_score.toFixed(1) + "/10"} ?`));
      const ul = el("ul", "facts");
      for (const [c, val] of d.score_components) ul.append(li(val == null ? c : `${c} : ${val > 0 && c.indexOf(":") < 0 ? "+" : ""}${val}`));
      if (d.score_model === "denner_v2") ul.append(li("Modèle Denner V2 (référence « statt » ou concurrente, voir onglet Denner)"));
      det.append(ul);
      b.append(det);
    }
    const a = el("a", "link", `Voir chez ${d.merchant || d.source_id} ↗`);
    a.href = d.source_url || "#"; a.target = "_blank"; a.rel = "noopener";
    b.append(a);
    n.append(b);
    return n;
  }

  function table(main, head, rows) {
    const t = el("table", "tbl");
    const tr = el("tr"); for (const h of head) tr.append(el("th", null, h)); t.append(tr);
    for (const r of rows) { const x = el("tr"); for (const c of r) { const td = el("td"); if (c instanceof Node) td.append(c); else td.textContent = c ?? "—"; x.append(td); } t.append(x); }
    main.append(t);
  }
  const pill = (txt, cls) => el("span", "pill " + (cls || ""), txt);

  function sources(main) {
    const s = U.src;
    main.append(el("h2", null, "Registre des sources"));
    const counts = s.registry_status_counts || {};
    main.append(el("p", "summary muted", Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(" · ") + " — une source découverte n'est pas une source intégrée."));
    const cls = { FUNCTIONAL: "ok", INTEGRATED: "ok", MONITORED: "ok", INTEGRABLE: "warn", TESTED: "warn", PARTIAL: "warn", BLOCKED: "bad", RETIRED: "bad" };
    table(main, ["Source", "Famille", "Statut", "Méthode", "Valeur", "Note"], (s.registry || []).map((r) =>
      [r.name, r.family, pill(r.status, cls[r.status]), r.method || "", r.expected_value ?? "", (r.status_reason || r.notes || "").slice(0, 140)]));
    main.append(el("h2", null, "Angles morts connus"));
    table(main, ["Angle mort", "Pourquoi", "Alternative"], (s.coverage_gaps || []).map((g) => [g.gap, g.reason, g.alternative || ""]));
  }

  function health(main) {
    const s = U.src;
    main.append(el("h2", null, "Connecteurs actifs"));
    table(main, ["Source", "État", "Offres", "Dernière réussite", "Fiabilité", "Latence"], (s.health || []).map((h) =>
      [h.name, pill(h.stale ? "en retard" : h.state || "?", h.stale || h.state === "SCRAPE_FAILURE" ? "bad" : h.state === "PARTIAL" ? "warn" : "ok"),
        h.items ?? "—", `${ago(h.last_success)}`, h.reliability != null ? Math.round(h.reliability * 100) + " %" : "—", h.latency_s != null ? h.latency_s + " s" : "—"]));
    const c = s.deal_counts || {};
    main.append(el("h2", null, "Offres"));
    table(main, ["Vivantes", "Uniques", "Doublons fusionnés", "Doublons possibles", "Notées"], [[c.live, c.unique, c.duplicates, c.possible_duplicates, c.scored]]);
    main.append(el("p", "muted", "Coût d'exploitation : 0 CHF/mois · 0 token LLM (Python + HTTP + règles déterministes)."));
  }

  function map(main) {
    const pts = U.deals.filter(isLive).filter((d) => d.lat != null && d.lng != null && !d.duplicate_of);
    main.append(el("p", "summary muted", `${pts.length} offre(s) géolocalisée(s). Fond de carte © OpenStreetMap.`));
    const box = el("div"); box.id = "u-map"; box.style.cssText = "height:70vh;border-radius:14px;overflow:hidden";
    main.append(box);
    const draw = () => {
      const L = window.L;
      const m = L.map(box).setView([47.4239, 9.3748], 13);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(m);
      for (const s of ((window.__DENNER_META || {}).stores || []).filter((s) => s.enabled && s.lat)) L.circleMarker([s.lat, s.lng], { radius: 6, color: "#c8102e" }).addTo(m).bindPopup(`Denner ${s.address}`);
      for (const d of pts) L.marker([d.lat, d.lng]).addTo(m).bindPopup(`<b>${(d.deal_score ?? "n/é")}</b> ${d.title.replace(/</g, "&lt;")}<br>CHF ${chf(d.current_price)}`);
    };
    if (window.L) return draw();
    const css = el("link"); css.rel = "stylesheet"; css.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css"; document.head.append(css);
    const js = el("script"); js.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"; js.onload = draw; document.head.append(js);
  }

  async function route(hash) {
    const [v, q] = hash.replace(/^#u\//, "").split("?");
    U.view = v || "accueil"; U.params = Object.fromEntries(new URLSearchParams(q || "")); U.limit = 50;
    try { await load(); } catch (e) { $("#main").textContent = "Impossible de charger les données : " + e; return; }
    buildNav(); header();
    document.querySelectorAll("#u-nav a").forEach((a) => a.classList.toggle("on", a.getAttribute("href") === `#u/${U.view}`));
    const on = document.querySelector("#u-nav a.on"); if (on) on.scrollIntoView({ block: "nearest", inline: "center" });
    render();
  }
  window.U = { route };
})();
