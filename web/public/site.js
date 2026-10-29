// Le seul JavaScript du site (≈ 3 Ko, sans dépendance, CSP script-src 'self').
// Tout fonctionne sans lui : il ne fait qu'améliorer. Aucune donnée personnelle,
// aucun cookie ; localStorage seulement pour le choix publicitaire (13 mois).
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

  // 1. Cartes expirées (page servie avant la prochaine reconstruction) ; vitrine :
  //    une action en magasin disparaît à 18:00 son dernier jour (plus achetable « maintenant »).
  function hideExpired() {
    var now = new Date(), z = zurich(now);
    $$("[data-ends]").forEach(function (el) {
      var t = Date.parse(el.getAttribute("data-ends"));
      if (t && t < now.getTime()) el.hidden = true;
    });
    $$("[data-showcase] [data-store-end]").forEach(function (el) {
      var end = new Date(el.getAttribute("data-store-end"));
      if (!isNaN(end) && zurich(end).day === z.day && z.hour >= 18) el.hidden = true;
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

  // 3. Partage : feuille native si disponible, sinon copie du lien ; WhatsApp reste le repli sans JS.
  function share() {
    $$("[data-share-url]").forEach(function (box) {
      var url = box.getAttribute("data-share-url"), title = box.getAttribute("data-share-title"), text = box.getAttribute("data-share-text");
      var native = box.querySelector('[data-share="native"]'), copy = box.querySelector('[data-share="copy"]');
      var wa = box.querySelector('[data-share="whatsapp"]'), status = box.querySelector(".share-status");
      if (navigator.share && native) {
        native.hidden = false; if (wa) wa.hidden = true;
        native.addEventListener("click", function () { navigator.share({ title: title, text: text, url: url }).catch(function () {}); });
      } else if (navigator.clipboard && copy) {
        copy.hidden = false;
        copy.addEventListener("click", function () {
          navigator.clipboard.writeText(url).then(function () { if (status) status.textContent = box.getAttribute("data-copied") || ""; }, function () {});
        });
      }
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

  function init() { hideExpired(); centerChip(); share(); consent(); }
  if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", init); else init();
})();
