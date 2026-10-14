"""Preispirat.ch — deals de la communauté suisse (flux RSS WordPress).

Deux flux publics (robots.txt : seuls /wp-admin/, /xmlrpc.php… interdits) :
``/feed/`` (30 derniers posts) et ``/cat/freebies/feed/`` (catégorie « Gratis »),
fusionnés et dédupliqués par identifiant WordPress (``guid ?p=<id>``).

Prix : ``<div>Preis: CHF x</div>`` (prix du deal) et ``<div>Zweitbester Preis:
CHF y</div>`` = deuxième meilleur prix du marché selon le comparateur Preispirat
-> ``reference_price_type="competitor"``. Catégories : « Gratis » -> free /
digital_free (prix 0), « Gutschein » -> coupon ; sinon tech / grocery / retail
selon la catégorie. Pour un gratuit, « normalerweise X Franken » (valeur énoncée
par l'auteur du post) -> ``community_claimed``. Les descriptions de posts
« Gutschein » ne sont PAS reprises (elles contiennent les codes) ; ailleurs, les
codes éventuels sont masqués.
"""
from __future__ import annotations

import html as _html
import re
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime

from ..core.connector import Connector, FetchResult
from ..core.deal import make_deal
from . import register
from ._util import text

FEEDS = ("https://www.preispirat.ch/feed/", "https://www.preispirat.ch/cat/freebies/feed/")
PRICE = re.compile(r"<div>\s*Preis:\s*CHF\s*([^<]+)</div>", re.I)
REF = re.compile(r"<div>\s*Zweitbester Preis:\s*CHF\s*([^<]+)</div>", re.I)
NORMALLY = re.compile(r"normalerweise\s+(?:CHF\s*)?(\d+(?:[.,]\d{1,2})?)(?:\.-)?\s*(?:Franken|CHF|Fr\.)", re.I)
PERCENT = re.compile(r"(?:bis zu\s+)?(\d{1,2})\s?%\s*(?:Rabatt|günstiger|off)", re.I)
MERCHANT_T = re.compile(r"\bbei\s+([A-ZÄÖÜ][\w.&'-]+(?:\s+(?:City|XXL|Shop|Outlet|Markt|Online))?)")
MERCHANT_D = re.compile(r"(?:^|[.!?]\s+|\s)(?:Bei|bei)\s+([A-ZÄÖÜ][\w.&'-]+(?:\s+[A-ZÄÖÜ][\w.&'-]+)?)\s+"
                        r"(?:gibt|findet|bekommt|erhält|könnt|kann|ist|sind|den|die|das)\b")
NOT_MERCHANT = {"uns", "bestellung", "kauf", "abholung", "anforderung", "deal", "neukunden", "anmeldung", "aktion",
                "registrierung", "eröffnung", "bezahlung", "zahlung", "lieferung"}
CODE = re.compile(r"((?:Code|Gutscheincode|Rabattcode|Promocode|Promo-Code)s?\s*[:«»\"„“”'‚‘’]?\s*)"
                  r"([A-Za-z0-9][A-Za-z0-9_-]{3,})")
UPPER_TOKEN = re.compile(r"\b(?=[A-Z0-9-]*\d)(?=[A-Z0-9-]*[A-Z])[A-Z0-9-]{5,}\b")
DIGITAL = re.compile(r"(e-?book|app\b|apps\b|play store|app store|steam|epic games|gog|prime gaming|"
                     r"spiel|game|games|hörbuch|audiobook|software|download|stream)", re.I)
TECH_CATS = {"Computer & Büro", "Home Entertainment & Foto", "Gaming & Apps", "Handy & Tablet",
             "Telefonie & Internet", "Elektronik"}
GROCERY_CATS = {"Lebensmittel & Getränke", "Lebensmittel", "Getränke", "Essen & Trinken", "Drogerie & Kosmetik"}
IGNORED_CATS = {"frontpagepromo"}
STORE_NAMES = ("Coop City", "Coop", "Migros", "Denner", "Lidl", "Aldi", "Jumbo", "Interdiscount", "Fust",
               "Nettoshop", "Conforama", "DayDeal", "Digitec", "Galaxus", "Brack", "Amazon", "AliExpress",
               "Manor", "Ochsner Sport", "MediaMarkt", "Media Markt", "IKEA", "Orell Füssli", "Ex Libris",
               "Microspot", "Melectronics", "Steg", "Landi", "Hornbach", "Bauhaus", "Ackermann", "DeubaXXL",
               "Google Play", "Apple", "Steam", "Epic Games", "Zalando", "Decathlon", "Qoqa", "QoQa")


def chf(s: str | None) -> float | None:
    """'83.90' -> 83.9 ; '104.-' -> 104 ; "1'498.-" -> 1498."""
    if not s:
        return None
    s = s.strip().replace("'", "").replace("’", "").replace(",", ".")
    s = re.sub(r"\.[-–]$", "", s)
    m = re.match(r"\d+(?:\.\d{1,2})?", s)
    return float(m.group(0)) if m else None


def parse_rss(xml: str) -> list[dict]:
    root = ET.fromstring(xml)
    ch = root.find("channel")
    if ch is None:
        raise ValueError("RSS sans <channel>")
    out = []
    for it in ch.findall("item"):
        guid = it.findtext("guid") or ""
        m = re.search(r"[?&]p=(\d+)", guid)
        if not m:
            continue
        out.append({"id": m.group(1), "title": _html.unescape((it.findtext("title") or "").strip()),
                    "link": (it.findtext("link") or "").strip(), "pubDate": (it.findtext("pubDate") or "").strip(),
                    "categories": [c.text.strip() for c in it.findall("category") if c.text],
                    "description": it.findtext("description") or ""})
    return out


def merchant_of(title: str, desc_text: str) -> str | None:
    """Marchand nommé dans le titre (« … bei Jumbo ») ou la description (« Bei Fust gibt es… »)."""
    for src in (title, desc_text):
        for name in STORE_NAMES:
            if re.search(r"\bbei\s+" + re.escape(name) + r"\b", src, re.I):
                return name
    m = MERCHANT_T.search(title)
    if m and m.group(1).lower() not in NOT_MERCHANT:
        return m.group(1)
    for m in MERCHANT_D.finditer(desc_text):
        if m.group(1).split()[0].lower() not in NOT_MERCHANT:
            return m.group(1)
    for name in STORE_NAMES:
        if re.search(r"\b" + re.escape(name) + r"\b", title):
            return name
    return None


def redact_codes(s: str) -> str:
    """Masque les codes promo ; les jetons MAJUSCULES+chiffres ne sont masqués que si
    le texte parle de code (sinon ce sont des références produit, ex. SM-X520)."""
    if not re.search(r"code", s, re.I):
        return s
    s = CODE.sub(lambda m: m.group(1) + "[code masqué]", s)
    return UPPER_TOKEN.sub("[code masqué]", s)


def family_of(cats: list[str], title: str, desc_text: str) -> str:
    cs = set(cats)
    if "Gratis" in cs:
        return "digital_free" if ("Gaming & Apps" in cs or "Bücher, eBooks und Filme" in cs
                                  or DIGITAL.search(title)) else "free"
    if "Gutschein" in cs:
        return "coupon"
    if cs & TECH_CATS:
        return "tech"
    if cs & GROCERY_CATS:
        return "grocery"
    return "retail"


@register
class Preispirat(Connector):
    id = "preispirat"
    name = "Preispirat (communauté)"
    family = "retail"
    tier = "FAST"
    window_ttl_hours = 168   # flux limité aux éléments les plus récents
    interval_minutes = 45
    base_url = "https://www.preispirat.ch"
    documentation = "RSS /feed/ + /cat/freebies/feed/ ; prix + 'Zweitbester Preis' (concurrent)"

    def fetch(self, ctx):
        seen: dict[str, dict] = {}
        warnings, ok, not_mod = [], 0, 0
        for url in FEEDS:
            try:
                r = ctx.get(url, conditional=True, headers={"Accept": "application/rss+xml, application/xml"})
                if r.status_code == 304:
                    not_mod += 1
                    continue
                items = parse_rss(r.text)
            except Exception as e:  # noqa: BLE001
                warnings.append(f"{url}: {type(e).__name__}: {e}"[:200])
                continue
            ok += 1
            for it in items:
                if it["id"] in seen:   # même post dans les deux flux : union des catégories
                    seen[it["id"]]["categories"] = sorted(set(seen[it["id"]]["categories"]) | set(it["categories"]))
                else:
                    seen[it["id"]] = {**it, "_feed": url}
        if not_mod == len(FEEDS):
            return FetchResult(not_modified=True, complete=True)
        if not ok and not not_mod:
            return FetchResult(error="; ".join(warnings), warnings=warnings)
        # Un flux 304 + l'autre lu : collecte partielle (les posts du flux 304 ne sont pas relus).
        return FetchResult(items=list(seen.values()), window=True, complete=(ok == len(FEEDS)), warnings=warnings,
                           raw=list(seen.values()))

    def normalize(self, it, ctx):
        tz = ctx.cfg.tz
        cats = [c for c in it.get("categories", []) if c not in IGNORED_CATS]
        desc_html = it.get("description") or ""
        desc_text = text(re.sub(r"<div>\s*(?:Zweitbester )?Preis:.*?</div>", " ", desc_html, flags=re.S))
        title = it["title"]
        fam = family_of(cats, title, desc_text)
        price, ref = chf((PRICE.search(desc_html) or [None, None])[1]), chf((REF.search(desc_html) or [None, None])[1])
        ref_type, note = None, None
        pct = None
        if fam in ("free", "digital_free"):
            price = 0.0 if price is None else price
            m = NORMALLY.search(desc_text)
            if ref is None and m:
                ref, ref_type = chf(m.group(1)), "community_claimed"
                note = "valeur habituelle énoncée dans le post Preispirat"
        if ref is not None and ref_type is None:
            ref_type, note = "competitor", "deuxième meilleur prix du marché (comparateur Preispirat)"
        if price is None and ref is None:
            m = PERCENT.search(title)
            pct = float(m.group(1)) if m and not re.search(r"bis zu", m.group(0), re.I) else None
            ref_type = "stated_percent_only" if pct else None
        if ref is not None and price is not None and ref <= price:
            ref, ref_type, note = None, None, None   # pas d'économie : pas de référence trompeuse
        try:
            pub = parsedate_to_datetime(it["pubDate"]).astimezone(tz).isoformat() if it.get("pubDate") else None
        except (TypeError, ValueError):
            pub = None
        img = re.search(r'<img[^>]+src="([^"]+)"', desc_html)
        is_coupon = fam == "coupon"
        return make_deal(
            deal_id=f"{self.id}:{it['id']}", source_id=self.id, source_type="community", source_offer_id=it["id"],
            source_url=it.get("link") or f"{self.base_url}/?p={it['id']}", title=title,
            description=None if is_coupon else (redact_codes(desc_text)[:300] or None),
            merchant=merchant_of(title, desc_text), category=", ".join(cats) or None, family=fam,
            offer_type={"coupon": "coupon", "free": "freebie", "digital_free": "freebie"}.get(fam, "community_deal"),
            current_price=price, reference_price=ref, reference_price_type=ref_type, reference_note=note,
            discount_percentage=pct, published_at=pub, image_url=img.group(1) if img else None,
            requires_coupon=True if is_coupon else None,
            geographic_scope="ONLINE" if fam in ("digital_free", "coupon") else "NATIONAL",
            access="PUBLIC", feed=it.get("_feed"))

