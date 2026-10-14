# Ajouter une source

1. **Auditer** (docs/source_registry.json) : robots.txt, conditions, données,
   méthode (API documentée > RSS/iCal > JSON-LD > JSON public > HTML), fréquence,
   valeur attendue, difficulté. Jamais de contournement de CAPTCHA, login,
   paywall ou protection anti-bot.
2. **Échantillon réel** dans `tests/fixtures/<id>.*` (petit, anonymisé).
3. **Connecteur** `radar/connectors/<id>.py` :

```python
from ..core.connector import Connector, FetchResult
from ..core.deal import make_deal
from . import register

@register
class MySource(Connector):
    id = "my_source"            # slug stable : préfixe des deal_id
    name = "Ma source"
    family = "flash"            # cf. core/deal.FAMILIES
    tier = "FAST"               # REALTIME FAST DAILY SLOW EVENT DYNAMIC
    base_url = "https://example.ch"
    documentation = "Endpoint, limites, cadence"

    def fetch(self, ctx):
        r = ctx.get(self.base_url + "/feed.xml", conditional=True)   # ETag / 304
        if r.status_code == 304:
            return FetchResult(not_modified=True, complete=True)
        items = parse(r.text)
        return FetchResult(items=items, complete=True, empty_valid=feed_says_empty(r.text), raw=r.text[:200000])

    def normalize(self, raw, ctx):
        return make_deal(deal_id=f"{self.id}:{raw['id']}", source_id=self.id, source_type="merchant",
                         title=raw["title"], family=self.family, merchant="…",
                         current_price=raw["price"], reference_price=raw.get("old"),
                         reference_price_type="merchant_previous", source_url=raw["url"], …)
```

   Règles : ne jamais inventer un champ ; `reference_price_type` exact ;
   `empty_valid=True` seulement si la source confirme explicitement l'absence
   d'offres ; une erreur → `FetchResult(error=…)` ou exception (le runner isole).
4. **Tests** `tests/test_connectors.py` sur la fixture (parsing, prix, dates, unités).
5. **Configuration** facultative `config/sources.toml` :

```toml
[sources.my_source]
enabled = true
interval_minutes = 60
```

6. **Registre** : statut `INTEGRATED` puis `FUNCTIONAL` après 1 semaine sans
   incident ; `python -m radar u-scan --source my_source --dry-run` pour tester.

Statuts du registre : `DISCOVERED` (identifiée) · `ASSESSED` (évaluée sur
papier) · `TESTED` (sondée en réel) · `INTEGRABLE` (méthode conforme validée) ·
`INTEGRATED` (connecteur écrit) · `FUNCTIONAL` (collecte réelle réussie) ·
`MONITORED` (fonctionnelle et surveillée en production) · `PARTIAL` (couverture
incomplète) · `BLOCKED` (login, anti-bot, interdiction) · `RETIRED` (abandonnée).
