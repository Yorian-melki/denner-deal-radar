// Le seul JavaScript du site (≈ 9 Ko, sans dépendance, CSP script-src 'self').
// Tout fonctionne sans lui : il ne fait qu'améliorer. Aucune donnée personnelle,
// aucun cookie ; localStorage pour le choix publicitaire (13 mois), la Merkliste et la date de
// la dernière visite (« neu ») — jamais envoyés.
(function () {
  "use strict";
  var d = document;
  function $$(sel, root) { return Array.prototype.slice.call((root || d).querySelectorAll(sel)); }
  function zurich(date) {
    try {
      var p = {};
      new Intl.DateTimeFormat("de-CH", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
        .formatToParts(date).forEach(function (x) { p[x.type] = x.value; });
      return { day: p.year + "-" + p.month + "-" + p.day, hour: Number(p.hour) };
    } catch (e) { return { day: date.toISOString().slice(0, 10), hour: date.getHours() }; }
  }

  // 1. Cartes expirées (page servie avant la prochaine reconstruction) : grisées, « abgelaufen »
  //    à la place de la date — jamais masquées (pas de saut de mise en page, compteurs justes).
  //    Vitrine : une action en magasin est grisée à 18:00 son dernier jour. Page deal expirée :
  //    le bloc prix et le bouton sont remplacés par l'avis d'expiration (filet de sécurité du cache).
  function markExpired() {
    var now = new Date(), z = zurich(now), gone = (d.documentElement.lang || "de").slice(0, 2);
    var label = { de: "abgelaufen", fr: "terminée", en: "ended" }[gone] || "abgelaufen";
    function mark(el) {
      el.setAttribute("data-gone", "");
      var date = el.querySelector("[data-date]");
      if (date) date.textContent = label;
    }
    $$("li.card[data-ends]").forEach(function (el) {
      var t = Date.parse(el.getAttribute("data-ends"));
      if (t && t < now.getTime()) mark(el);
    });
    $$("[data-showcase] [data-store-end]").forEach(function (el) {
      var end = new Date(el.getAttribute("data-store-end"));
      if (!isNaN(end) && zurich(end).day === z.day && z.hour >= 18) mark(el);
    });
    $$("article.deal[data-ends]").forEach(function (el) {
      var t = Date.parse(el.getAttribute("data-ends"));
      if (!t || t >= now.getTime()) return;
      var buy = el.querySelector(".deal-buy");
      if (!buy) return;
      el.setAttribute("data-gone", "");
      var p = d.createElement("p");
      p.className = "deal-gone";
      p.textContent = el.getAttribute("data-gone-text") || label;
      buy.querySelectorAll(".deal-actions, .deal-saving").forEach(function (x) { x.remove(); });
      buy.insertBefore(p, buy.firstChild);
    });
  }

  // 2. Puce active visible au chargement (sans faire défiler la page).
  function centerChip() {
    $$("[data-chips]").forEach(function (nav) {
      var a = nav.querySelector('[aria-current="page"]');
      if (!a || nav.scrollWidth <= nav.clientWidth) return;
      nav.scrollLeft = Math.max(0, a.offsetLeft - (nav.clientWidth - a.offsetWidth) / 2);
    });
  }

  // 3. Partage : UN bouton — feuille native si disponible, sinon copie du lien (« Link kopiert »).
  function share() {
    $$("[data-share-url]").forEach(function (box) {
      var url = box.getAttribute("data-share-url"), title = box.getAttribute("data-share-title"), text = box.getAttribute("data-share-text");
      var btn = box.querySelector("[data-share]"), status = box.querySelector(".share-status");
      if (!btn || (!navigator.share && !navigator.clipboard)) return;
      btn.hidden = false;
      btn.addEventListener("click", function () {
        if (navigator.share) { navigator.share({ title: title, text: text, url: url }).catch(function () {}); return; }
        navigator.clipboard.writeText(url).then(function () { if (status) status.textContent = box.getAttribute("data-copied") || ""; }, function () {});
      });
    });
  }

  // 4. Compteur de clics sortants, anonyme : seulement l'id du deal et la page.
  //    Programme et caractère publicitaire sont déduits côté serveur, jamais envoyés.
  //    Seulement si le stockage existe (<html data-clicks="1">, CLICKS_BINDING=1 au build) :
  //    sinon aucune requête, aucune invocation de Function pour rien.
  d.addEventListener("click", function (e) {
    var a = e.target && e.target.closest ? e.target.closest("a[data-deal]") : null;
    if (!a || !navigator.sendBeacon || d.documentElement.getAttribute("data-clicks") !== "1") return;
    try {
      navigator.sendBeacon("/api/click", new Blob([JSON.stringify({ deal: a.getAttribute("data-deal"), page: location.pathname })], { type: "text/plain" }));
    } catch (err) {}
  });

  // 5. Langue : le lien statique mène déjà à la page équivalente ; on garde aussi ?… et #….
  d.addEventListener("click", function (e) {
    var a = e.target && e.target.closest ? e.target.closest("a[data-lang]") : null;
    if (!a || a.getAttribute("aria-current") || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
    if (location.search || location.hash) { e.preventDefault(); location.assign(a.getAttribute("href") + location.search + location.hash); }
  });

  // 6. Menu de ville : Échap et clic extérieur le referment.
  d.addEventListener("keydown", function (e) { if (e.key === "Escape") $$("details.city-menu[open]").forEach(function (x) { x.open = false; x.querySelector("summary").focus(); }); });
  d.addEventListener("click", function (e) { $$("details.city-menu[open]").forEach(function (x) { if (!x.contains(e.target)) x.open = false; }); });

  // 7. Consentement publicité (bannière maison) : rien n'est chargé sans « Akzeptieren ».
  var KEY = "consent.ads.v1", MAX_AGE = 395 * 24 * 3600 * 1000;
  function stored() {
    try {
      var v = JSON.parse(localStorage.getItem(KEY) || "null");
      if (v && (v.c === "granted" || v.c === "denied") && typeof v.t === "number" && Date.now() - v.t < MAX_AGE) return v.c;
    } catch (e) {}
    return null;
  }
  function loadAds() {
    var slots = $$("[data-ad-client]");
    if (!slots.length) return;
    var client = slots[0].getAttribute("data-ad-client");
    if (!/^ca-pub-\d{10,20}$/.test(client)) return;
    if (!d.getElementById("adsbygoogle-js")) {
      var s = d.createElement("script");
      s.id = "adsbygoogle-js"; s.async = true; s.crossOrigin = "anonymous";
      s.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + encodeURIComponent(client);
      d.head.appendChild(s);
    }
    slots.forEach(function (el) {
      var slot = el.getAttribute("data-ad-slot");
      if (!/^\d{1,20}$/.test(slot) || el.querySelector("ins")) return;
      var ins = d.createElement("ins");
      ins.className = "adsbygoogle"; ins.style.display = "block"; ins.style.minHeight = "250px";
      ins.setAttribute("data-ad-client", client); ins.setAttribute("data-ad-slot", slot); ins.setAttribute("data-ad-format", "rectangle");
      el.appendChild(ins);
      try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {}
    });
  }
  function consent() {
    var banner = d.querySelector("[data-consent-banner]");
    var choice = stored();
    if (choice === "granted") loadAds();
    if (!banner) return;
    if (choice === null) banner.hidden = false;
    $$("[data-consent]", banner).forEach(function (b) {
      b.addEventListener("click", function () {
        var c = b.getAttribute("data-consent");
        try { localStorage.setItem(KEY, JSON.stringify({ c: c, t: Date.now() })); } catch (e) {}
        banner.hidden = true;
        if (c === "granted") loadAds();
      });
    });
    $$("[data-consent-open]").forEach(function (el) {
      el.addEventListener("click", function (e) {
        e.preventDefault();
        var was = stored();
        try { localStorage.removeItem(KEY); } catch (err) {}
        if (was === "granted") location.reload(); // décharge les scripts publicitaires
        else { banner.hidden = false; var b = banner.querySelector("button"); if (b) b.focus(); }
      });
    });
  }

  // 8. Ancien lien deal sorti du budget de redirections (round 4, item 28) : la 404 des pages deal
  //    lit sa cible dans /s/moved.<hash>.json (même origine) et y mène, sinon la 404 reste.
  function moved() {
    var m = d.querySelector("main[data-moved]"), p = location.pathname.match(/^\/(de|fr|en)\/deal\/([a-z0-9-]+)\/?$/);
    if (!m || !p || !window.fetch) return;
    var h = p[2].slice(p[2].lastIndexOf("-") + 1);
    fetch(m.getAttribute("data-moved")).then(function (r) { return r.ok ? r.json() : {}; }).then(function (map) {
      var t = map[h];
      if (typeof t === "string" && /^\/%\//.test(t)) location.replace(t.replace("%", p[1]) + location.search + location.hash);
    }).catch(function () {});
  }

  // 9. Merkliste et « neu seit deinem letzten Besuch » (rétention, 06.11) : tout reste sur l'appareil
  //    (localStorage « list.v1 », « visit.v1 »), rien n'est envoyé ; sans stockage, rien ne s'affiche.
  var LIST = "list.v1", VISIT = "visit.v1";
  function load(k, def) { try { var v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? def : v; } catch (e) { return def; } }
  function store(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function storageOk() { try { localStorage.setItem("t.v1", "1"); localStorage.removeItem("t.v1"); return true; } catch (e) { return false; } }
  function lang() { var l = (d.documentElement.lang || "de").slice(0, 2); return /^(de|fr|en)$/.test(l) ? l : "de"; }
  function items() { var l = load(LIST, []); return Array.isArray(l) ? l.filter(function (x) { return x && typeof x.s === "string" && /^[a-z0-9-]{1,120}$/.test(x.s); }) : []; }
  function has(s) { return items().some(function (x) { return x.s === s; }); }
  function money(v, cur) {
    try { return new Intl.NumberFormat(lang() === "fr" ? "fr-CH" : "de-CH", { style: "currency", currency: cur || "CHF" }).format(v); } catch (e) { return (cur || "CHF") + " " + v.toFixed(2); }
  }
  function sync() {
    var n = items().length;
    $$("[data-save]").forEach(function (b) { b.setAttribute("aria-pressed", has(b.getAttribute("data-save")) ? "true" : "false"); });
    $$("[data-list-count]").forEach(function (x) { x.textContent = n ? String(n) : ""; });
  }
  function toggle(s, item) {
    var l = items(), i = -1;
    l.forEach(function (x, k) { if (x.s === s) i = k; });
    if (i >= 0) l.splice(i, 1); else if (item) { item.s = s; item.a = Date.now(); l.unshift(item); }
    store(LIST, l.slice(0, 200));
  }
  function saver() {
    $$("button[data-save]").forEach(function (b) {
      b.hidden = false;
      b.addEventListener("click", function (e) {
        e.preventDefault(); e.stopPropagation();
        var it = {};
        try { it = JSON.parse(b.getAttribute("data-item") || "{}"); } catch (err) {}
        toggle(b.getAttribute("data-save"), it); sync();
      });
    });
    sync();
  }
  function visits() {
    var now = Date.now(), v = load(VISIT, null), since = 0;
    if (v && typeof v.last === "number") since = now - v.last > 1800000 ? v.last : (typeof v.prev === "number" ? v.prev : 0);
    store(VISIT, { last: now, prev: since });
    if (!since) return;
    $$("li.card[data-seen]").forEach(function (x) { if (Date.parse(x.getAttribute("data-seen")) > since) x.setAttribute("data-new", ""); });
  }
  function el(tag, cls, text) { var x = d.createElement(tag); if (cls) x.className = cls; if (text != null) x.textContent = text; return x; }
  function render() {
    var root = d.querySelector("[data-list-root]");
    if (!root) return;
    var L = function (k) { return root.getAttribute("data-l-" + k) || ""; };
    var all = items(), now = Date.now();
    if (!all.length) return;
    root.textContent = "";
    var groups = {}, order = [], lines = [], ended = 0;
    all.forEach(function (x) { var m = typeof x.m === "string" && x.m ? x.m : L("unknown"); if (!groups[m]) { groups[m] = []; order.push(m); } groups[m].push(x); });
    order.forEach(function (m) {
      var g = groups[m], sum = 0, cur = "CHF", sec = el("section", "list-store"), ul = el("ul", "sib-list");
      ul.setAttribute("role", "list");
      lines.push(m + ":");
      g.forEach(function (x) {
        var gone = typeof x.e === "string" && Date.parse(x.e) < now;
        if (gone) ended++;
        if (typeof x.p === "number" && !gone) { sum += x.p; cur = x.c || cur; }
        var li = el("li", gone ? "gone" : null), a = el("a"), title = String(x.t || x.s).slice(0, 160);
        a.href = "/" + lang() + "/deal/" + x.s;
        a.appendChild(el("span", "sib-price", typeof x.p === "number" ? money(x.p, x.c) : "–"));
        a.appendChild(el("span", "sib-label", title + (x.u ? " · " + x.u : "") + (gone ? " · " + L("ended") : "")));
        var del = el("button", "list-del", "×");
        del.type = "button"; del.setAttribute("aria-label", L("remove") + ": " + title);
        del.addEventListener("click", function () { toggle(x.s); sync(); if (items().length) render(); else location.reload(); });
        li.appendChild(a); li.appendChild(del); ul.appendChild(li);
        lines.push("- " + title + (typeof x.p === "number" ? " (" + money(x.p, x.c) + ")" : ""));
      });
      sec.appendChild(el("h2", null, m));
      sec.appendChild(el("p", "section-note", L("items").replace("{n}", g.length) + (sum ? " · " + L("total").replace("{sum}", money(sum, cur)) : "")));
      sec.appendChild(ul);
      root.appendChild(sec);
    });
    var bar = el("p", "list-actions"), share = el("button", "btn btn-secondary", L("share")), status = el("span", "share-status");
    share.type = "button"; status.setAttribute("role", "status");
    share.addEventListener("click", function () {
      var text = L("share-head") + "\n\n" + lines.join("\n") + "\n\n" + location.origin + "/" + lang() + "/st-gallen";
      if (navigator.share) navigator.share({ text: text }).catch(function () {});
      else if (navigator.clipboard) navigator.clipboard.writeText(text).then(function () { status.textContent = L("copied"); }, function () {});
    });
    bar.appendChild(share);
    if (ended) {
      var clr = el("button", "btn btn-secondary", L("clear"));
      clr.type = "button";
      clr.addEventListener("click", function () { store(LIST, items().filter(function (x) { return !(typeof x.e === "string" && Date.parse(x.e) < Date.now()); })); sync(); if (items().length) render(); else location.reload(); });
      bar.appendChild(clr);
    }
    bar.appendChild(status);
    root.appendChild(bar);
  }
  function retention() { if (!storageOk()) return; visits(); saver(); render(); }

  function init() { moved(); markExpired(); centerChip(); share(); consent(); retention(); }
  if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", init); else init();
})();
