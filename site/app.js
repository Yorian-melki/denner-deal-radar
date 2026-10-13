"use strict";
// Denner Deal Radar — dashboard statique (aucune dépendance, aucun LLM).

const S = { offers: [], meta: {}, view: "nouveautes", params: {}, cat: "toutes", limit: 60 };
const $ = (s) => document.querySelector(s);
const DAYS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
const CATS = [
  ["toutes", "Toutes"], ["exceptionnelles", "🔥 Exceptionnelles"], ["nourriture", "Nourriture"],
  ["proteines", "Protéines"], ["boissons", "Boissons"], ["entretien", "Entretien"],
  ["autres", "Autres"], ["favoris", "★ Favoris"],
];
const FOOD = new Set(["proteines", "laitier_oeufs", "feculents", "fruits_legumes", "nourriture"]);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* navigation privée */ } },
};
let favs = new Set(store.get("favs", []));

const chf = (x) => (x == null ? "—" : x.toFixed(2));
const day = (iso) => { if (!iso) return "?"; const d = new Date(iso); return `${DAYS[d.getDay()]} ${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`; };
const ago = (iso) => { if (!iso) return "jamais"; const m = (Date.now() - new Date(iso)) / 60000; return m < 60 ? `il y a ${Math.round(m)} min` : m < 2880 ? `il y a ${Math.round(m / 60)} h` : `il y a ${Math.round(m / 1440)} j`; };
const left = (iso) => { const h = (new Date(iso) - Date.now()) / 3600000; if (h < 0) return "terminée"; if (h < 24) return `encore ${Math.max(1, Math.round(h))} h`; return `encore ${Math.round(h / 24)} j`; };
const scoreColor = (s) => s == null ? "var(--s0)" : s >= 9 ? "var(--s9)" : s >= 8 ? "var(--s8)" : s >= 7 ? "var(--s7)" : s >= 5 ? "var(--s5)" : s >= 2.5 ? "var(--s2)" : "var(--s0)";
const label = (s) => s == null ? "non évaluée" : s >= 9 ? "exceptionnelle" : s >= 8 ? "excellente" : s >= 7 ? "très bonne" : s >= 5 ? "correcte" : s >= 2.5 ? "faible" : "insignifiante";

function status(o) {
  if (o.withdrawn) return "withdrawn";
  const now = Date.now();
  if (o.ends_at && new Date(o.ends_at) < now) return "expired";
  if (o.starts_at && new Date(o.starts_at) > now) return "announced";
  return "active";
}

async function load() {
  const bust = `?t=${Math.floor(Date.now() / 300000)}`;
  const [o, m] = await Promise.all([fetch("data/offers.json" + bust).then((r) => r.json()), fetch("data/meta.json" + bust).then((r) => r.json())]);
  S.offers = o.offers.map((x) => ({ ...x, status: status(x) }));
  S.meta = m;
  header();
  buildControls();
  route();
}

function header() {
  const m = S.meta;
  const flags = Object.values(m.sources || {});
  const ok = flags.filter((f) => f.ok && f.complete).length;
  $("#updated").textContent = `Mis à jour ${ago(m.last_success)} · sources ${ok}/${flags.length} OK · ${m.counts?.active ?? 0} actives, ${m.counts?.announced ?? 0} annoncées`;
  const b = $("#banner");
  const lastOk = m.last_success ? (Date.now() - new Date(m.last_success)) / 3600000 : 1e9;
  if (lastOk > 14) {
    b.hidden = false;
    b.textContent = `⚠️ Données possiblement obsolètes : dernière collecte réussie ${ago(m.last_success)}. Les offres expirées sont automatiquement retirées des vues « actuelles ».`;
  } else if (m.consecutive_failures) {
    b.hidden = false;
    b.textContent = `⚠️ ${m.consecutive_failures} collecte(s) en échec — affichage du dernier relevé valide.`;
  }
}

function buildControls() {
  const chips = $("#chips");
  chips.innerHTML = "";
  for (const [k, l] of CATS) {
    const b = document.createElement("button");
    b.className = "chip" + (S.cat === k ? " on" : "");
    b.textContent = l;
    b.onclick = () => { S.cat = k; S.limit = 60; buildControls(); render(); };
    chips.append(b);
  }
  const sel = $("#store");
  if (!sel.options.length) {
    sel.append(new Option("Tous magasins", ""));
    for (const s of (S.meta.stores || []).filter((s) => s.enabled && s.active !== false)) sel.append(new Option(`${s.address || s.id}`, s.id));
  }
}

function route() {
  const [v, q] = (location.hash.slice(1) || "nouveautes").split("?");
  S.view = v; S.params = Object.fromEntries(new URLSearchParams(q || "")); S.limit = 60;
  document.querySelectorAll("#tabs a").forEach((a) => a.classList.toggle("on", a.getAttribute("href") === "#" + v));
  $("#controls").hidden = ["magasins", "etat"].includes(v);
  const defSort = { fin: "end", prochaine: "score" }[v] || "score";
  if (!S.sortTouched) $("#sort").value = defSort;
  render();
}

function baseFilter(list) {
  const q = $("#q").value.trim().toLowerCase();
  const min = parseFloat($("#minscore").value);
  const st = $("#store").value;
  const hide = $("#hidepref").checked;
  const far = $("#showfar").checked;
  return list.filter((o) => {
    if (!far && o.eligible_home === false) return false;
    if (hide && (o.tags || []).some((t) => t === "porc" || t === "fruits_de_mer")) return false;
    if (!isNaN(min) && !(o.deal_score >= min)) return false;
    if (st && !(o.store_ids || []).includes(st)) return false;
    if (q && !`${o.product_name} ${o.subline || ""} ${o.brand || ""}`.toLowerCase().includes(q)) return false;
    switch (S.cat) {
      case "exceptionnelles": return o.deal_score >= 8;
      case "nourriture": return FOOD.has(o.group);
      case "proteines": return (o.tags || []).includes("proteines") || o.group === "laitier_oeufs";
      case "boissons": return o.group === "boissons";
      case "entretien": return o.group === "entretien" || o.group === "hygiene";
      case "autres": return o.group === "autres";
      case "favoris": return favs.has(o.article_id) || o.favorite;
      default: return true;
    }
  });
}

function sortList(list) {
  const k = $("#sort").value;
  const sc = (o) => (o.deal_score == null ? -1 : o.deal_score);
  const f = {
    score: (a, b) => sc(b) - sc(a) || (b.score_confidence || 0) - (a.score_confidence || 0),
    disc: (a, b) => (b.effective_discount ?? -1) - (a.effective_discount ?? -1),
    unit: (a, b) => (a.unit_price ?? 1e9) - (b.unit_price ?? 1e9),
    end: (a, b) => new Date(a.ends_at || 8e15) - new Date(b.ends_at || 8e15),
    rel: (a, b) => (b.personal_relevance || 0) - (a.personal_relevance || 0) || sc(b) - sc(a),
    price: (a, b) => (a.discounted_price ?? 1e9) - (b.discounted_price ?? 1e9),
  }[k];
  return list.sort(f);
}

function viewList() {
  const now = Date.now();
  const all = S.offers;
  const live = (o) => o.status === "active" || o.status === "announced";
  switch (S.view) {
    case "nouveautes": {
      const since = S.params.since || S.meta.last_new_at;
      const t = since ? new Date(since).getTime() - 1000 : now - 86400000;
      return { title: `Offres apparues depuis le dernier relevé avec nouveautés (${day(since)} ${since ? new Date(since).toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" }) : ""})`,
        list: all.filter((o) => live(o) && new Date(o.first_seen_at).getTime() >= t) };
    }
    case "semaine": return { title: "Meilleures offres valables maintenant", list: all.filter((o) => o.status === "active") };
    case "prochaine": return { title: "Offres annoncées, pas encore actives", list: all.filter((o) => o.status === "announced") };
    case "fin": return { title: "Offres actives qui se terminent dans les 48 h", list: all.filter((o) => o.status === "active" && new Date(o.ends_at) - now < 48 * 3600000) };
    case "30j": return { title: "Meilleures offres détectées sur 30 jours (y compris terminées)", list: all.filter((o) => new Date(o.first_seen_at) > now - 30 * 86400000) };
    case "records": return { title: "Records depuis le lancement (même échelle absolue)", list: all.filter((o) => o.record) };
    case "recherche": return { title: "Recherche", list: all };
    default: return { title: "", list: [] };
  }
}

function render() {
  const main = $("#main");
  main.innerHTML = "";
  if (S.view === "magasins") return renderStores(main);
  if (S.view === "etat") return renderState(main);
  const { title, list } = viewList();
  const items = sortList(baseFilter(list));
  const p = document.createElement("p");
  p.className = "summary muted";
  p.textContent = `${title} — ${items.length} offre(s)`;
  main.append(p);
  const scored = items.filter((o) => o.deal_score != null);
  if (scored.length && Math.max(...scored.map((o) => o.deal_score)) < 5) {
    const n = document.createElement("div");
    n.className = "notice";
    n.textContent = "ℹ️ Aucune offre de cette vue ne dépasse 5/10 : ce sont des promotions ordinaires. La note est absolue, elle n'est pas gonflée pour remplir le classement.";
    main.append(n);
  }
  const grid = document.createElement("div");
  grid.className = "grid";
  for (const o of items.slice(0, S.limit)) grid.append(card(o));
  main.append(grid);
  if (items.length > S.limit) {
    const b = document.createElement("button");
    b.className = "more";
    b.textContent = `Afficher plus (${items.length - S.limit} restantes)`;
    b.onclick = () => { S.limit += 60; render(); };
    main.append(b);
  }
}

function li(text, cls) { const e = document.createElement("li"); e.textContent = text; if (cls) e.className = cls; return e; }

function card(o) {
  const n = document.getElementById("card").content.firstElementChild.cloneNode(true);
  const img = n.querySelector("img");
  if (o.image_url) img.src = o.image_url + (o.image_url.includes("imgix") ? "?w=180&auto=format" : "");
  else n.querySelector(".img").textContent = "🛒";
  const s = n.querySelector(".score");
  s.textContent = o.deal_score == null ? "n/é" : o.deal_score.toFixed(1);
  s.style.background = scoreColor(o.deal_score);
  n.querySelector(".slabel").textContent = `${label(o.deal_score)} · confiance ${o.score_confidence_label || "?"}`;
  const fav = n.querySelector(".fav");
  const isFav = favs.has(o.article_id);
  fav.textContent = isFav ? "★" : "☆";
  fav.classList.toggle("on", isFav);
  fav.onclick = () => { favs.has(o.article_id) ? favs.delete(o.article_id) : favs.add(o.article_id); store.set("favs", [...favs]); render(); };
  n.querySelector(".name").textContent = o.product_name;
  n.querySelector(".sub").textContent = o.subline || o.package_size || "";
  const pr = n.querySelector(".prices");
  const add = (html, cls) => { const e = document.createElement("span"); e.className = cls; e.textContent = html; pr.append(e); };
  if (o.discounted_price != null) add(`CHF ${chf(o.discounted_price)}`, "now");
  if (o.regular_price != null) {
    if (o.reference_price_type === "competitor_comparison") add(`prix concurrent cité ${chf(o.regular_price)}`, "ref-comp");
    else add(chf(o.regular_price), "was");
  }
  if (o.effective_discount != null) {
    const shown = o.discount_percentage ?? o.stated_discount_pct;
    add(shown != null && Math.abs(shown - o.effective_discount) >= 1 ? `−${Math.round(o.effective_discount)} % retenus (${Math.round(shown)} % affichés)` : `−${Math.round(o.effective_discount)} %`, "disc");
  } else if (o.stated_discount_pct) add(`−${o.stated_discount_pct} % annoncés`, "disc");
  if (o.unit_price != null) add(`${chf(o.unit_price)} ${o.unit_price_unit}`, "unit");
  const f = n.querySelector(".facts");
  const st = o.status;
  if (st === "announced") f.append(li(`📅 Dès ${day(o.starts_at)} jusqu'au ${day(o.ends_at)}`, "warn"));
  else if (st === "active") f.append(li(`⏳ ${day(o.starts_at)} → ${day(o.ends_at)} · ${left(o.ends_at)}`));
  else if (st === "withdrawn") f.append(li("🚫 Retirée du site avant sa fin", "bad"));
  else f.append(li(`Terminée le ${day(o.ends_at)}`, "bad"));
  for (const c of (o.conditions || []).slice(0, 3)) f.append(li(`• ${c}`));
  if (o.availability_confidence === "store_verified") f.append(li(`✅ Vue en magasin (${(o.store_ids || []).join(", ")})`, "ok"));
  else if (o.eligible_home) f.append(li(`🏪 Éligible dans les ${(S.meta.stores || []).filter((s) => s.enabled && s.active !== false).length} Denner de St-Gall (${o.geographic_scope === "national" ? "offre nationale" : "offre régionale"}) — stock non vérifié`));
  else f.append(li("⛔ Non disponible en Suisse alémanique", "bad"));
  for (const t of (o.score_notes || []).slice(0, 2)) f.append(li(`ℹ️ ${t}`, "muted"));
  if ((o.tags || []).includes("porc") || (o.tags || []).includes("porc_possible")) f.append(li((o.tags || []).includes("porc") ? "🐖 contient du porc" : "🐖 porc possible", "warn"));
  const a = n.querySelector(".link");
  a.href = o.source_url || "https://www.denner.ch/de/aktionen";
  return n;
}

function renderStores(main) {
  const stores = S.meta.stores || [];
  const eligible = S.offers.filter((o) => o.status === "active" && o.eligible_home);
  const h = document.createElement("div");
  h.innerHTML = `<p class="summary muted">Denner ne publie aucune donnée de stock ou d'assortiment par succursale. Une offre nationale est donc <b>supposée</b> disponible dans chaque magasin, jamais <b>vérifiée</b> — sauf saisie manuelle.</p>`;
  main.append(h);
  const t = document.createElement("table");
  t.className = "tbl";
  t.innerHTML = "<tr><th>Succursale</th><th>Type</th><th>Offres vérifiées</th><th>Offres supposées</th></tr>";
  for (const s of stores) {
    const verified = eligible.filter((o) => o.availability_confidence === "store_verified" && (o.store_ids || []).includes(s.id)).length;
    const presumed = s.enabled && s.active !== false ? eligible.filter((o) => o.availability_confidence === "national_eligible").length : 0;
    const tr = document.createElement("tr");
    const state = s.active === false ? '<span class="pill bad">fermé ?</span>' : s.enabled ? '<span class="pill ok">suivi</span>' : '<span class="pill">voisin, désactivé</span>';
    tr.innerHTML = `<td><b></b><br><span class="muted"></span> ${state}</td><td></td><td>${verified}</td><td>${presumed}</td>`;
    tr.querySelector("b").textContent = s.address || s.id;
    tr.querySelector(".muted").textContent = `${s.zip || ""} ${s.city || ""} · ${s.id}${s.distance_km != null ? " · " + s.distance_km + " km" : ""}`;
    tr.children[1].textContent = s.channel || "?";
    t.append(tr);
  }
  main.append(t);
  if ((S.meta.store_history || []).length) {
    const h2 = document.createElement("h2"); h2.textContent = "Changements détectés"; main.append(h2);
    const ul = document.createElement("ul");
    for (const c of S.meta.store_history) ul.append(li(`${c.at.slice(0, 10)} · ${c.type} · ${c.store} ${c.address || c.new || ""}`));
    main.append(ul);
  }
}

function renderState(main) {
  const m = S.meta;
  const sec = (title) => { const h = document.createElement("h2"); h.textContent = title; main.append(h); };
  sec("Collecte");
  const p = document.createElement("p");
  p.textContent = `Dernier succès : ${m.last_success || "jamais"} (${ago(m.last_success)}) · dernière tentative : ${m.last_attempt || "?"} · échecs consécutifs : ${m.consecutive_failures || 0}`;
  main.append(p);
  const t = document.createElement("table");
  t.className = "tbl";
  t.innerHTML = "<tr><th>Flux API</th><th>État</th><th>Offres</th></tr>";
  for (const [k, v] of Object.entries(m.sources || {})) {
    const tr = document.createElement("tr");
    const pill = v.ok && v.complete && !v.anomalous ? '<span class="pill ok">OK</span>' : v.ok ? '<span class="pill warn">partiel</span>' : '<span class="pill bad">échec</span>';
    tr.innerHTML = `<td></td><td>${pill}</td><td>${v.received}/${v.total ?? "?"}</td>`;
    tr.children[0].textContent = k;
    t.append(tr);
  }
  main.append(t);
  sec("Couverture");
  const c = document.createElement("table");
  c.className = "tbl";
  c.innerHTML = "<tr><th>Famille d'offres</th><th>Statut</th><th>Détail</th></tr>";
  const cls = { "récupéré": "ok", "surveillé": "ok", "partiel": "warn", "impossible": "bad" };
  for (const r of m.coverage || []) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td></td><td><span class="pill ${cls[r.status] || ""}"></span></td><td class="muted"></td>`;
    tr.children[0].textContent = r.family; tr.querySelector(".pill").textContent = r.status; tr.children[2].textContent = r.detail;
    c.append(tr);
  }
  main.append(c);
  const a = m.audit || {};
  sec("Audit pages officielles");
  main.append(li(a.checked ? `${a.checked} · ${a.ok ? "aucune offre manquante" : (a.missing || []).length + " offre(s) visibles sur denner.ch absentes de l'API"}` : "pas encore effectué"));
  sec("Échelle de notation (fixe)");
  main.append(li((m.scoring_curve || []).map(([x, y]) => `${x} % → ${y}`).join(" · ")));
  main.append(li("Référence concurrente (« Konkurrenzvergleich ») : réduction recalculée en supposant un prix Denner habituel 20 % plus bas. Aucune référence vérifiable → non évaluée."));
}

window.addEventListener("hashchange", route);
for (const id of ["q", "minscore", "store", "hidepref", "showfar"]) $("#" + id).addEventListener("input", () => { S.limit = 60; render(); });
$("#sort").addEventListener("input", () => { S.sortTouched = true; render(); });
load().catch((e) => { $("#main").textContent = "Impossible de charger les données : " + e; });
