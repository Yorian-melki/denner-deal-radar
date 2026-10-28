// Masque les cartes dont la date de fin publiée est déjà passée (la page statique
// peut être servie quelques heures avant la prochaine reconstruction). Fichier
// externe (pas de script inline : CSP). Ne modifie pas le DOM des cartes (pas de
// conflit d'hydratation) : ajoute une feuille de style qui les cache.
(function () {
  try {
    var now = Date.now(), sel = [];
    var cards = document.querySelectorAll("[data-ends]");
    for (var i = 0; i < cards.length; i++) {
      var v = cards[i].getAttribute("data-ends");
      var t = Date.parse(v);
      if (t && t < now) sel.push('[data-ends="' + v.replace(/["\\]/g, "") + '"]');
    }
    if (!sel.length) return;
    var s = document.createElement("style");
    s.textContent = sel.join(",") + "{display:none!important}";
    document.head.appendChild(s);
  } catch (e) {}
})();
