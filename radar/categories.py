"""Classification en groupes du dashboard et étiquettes alimentaires.

Les étiquettes « porc » / « fruits_de_mer » sont des heuristiques sur le nom
allemand : elles servent de filtres, jamais à supprimer une offre. En cas de
doute on pose « porc_possible » plutôt qu'une affirmation.
"""
from __future__ import annotations

import re

# Catégorie native Denner (_tracking_item_category2) -> groupe
NATIVE = {
    "fleisch/wurst/fisch": "proteines",
    "milch/käse/eier": "laitier_oeufs",
    "früchte und gemüse": "fruits_legumes",
    "brot/backwaren": "feculents",
    "tiefkühlprodukte": "nourriture",
    "fertigprodukte": "nourriture",
    "schokolade/süsses": "nourriture",
    "snack/apero": "nourriture",
    "kaffee/tee/kakao": "boissons",
    "getränke/säfte": "boissons",
    "bier": "boissons",
    "wein/champagner": "boissons",
    "pflege/kosmetik": "hygiene",
    "waschen/haushalt": "entretien",
}
WINE = re.compile(r"^(rot|weiss|rosé|schaum|süss|dessert)wein|^rosé|champagner|prosecco", re.I)

KW = [  # (regex sur nom+sous-titre, groupe) — testés dans l'ordre
    (r"(wau wau|hundefutter|katzenfutter|tierfutter|whiskas|felix|pedigree|\bhunde|\bkatzen)", "autres"),
    (r"(sauce|bouillon|suppe|aromat|würfel|fond\b|gewürz|streuer)", "nourriture"),
    (r"\b(wasch|reinig|spül|entkalk|wc-|abfluss|weichspül|putz|müllbe|kehricht|haushaltpapier|toilettenpapier|küchenrolle|alufolie|frischhalte)", "entretien"),
    (r"(shampoo|dusch|deo|zahn|creme|lotion|rasier|coloration|haar|kosmetik|windel|binden|tampon|seife|nivea|garnier|gillette)", "hygiene"),
    (r"(tiernahrung|batterie|kerze|schnittblumen|blumenstrauss|\bblumen\b|pflanze|zigarett|tabak|grill-?kohle)", "autres"),
    (r"\b(bier|wein|prosecco|champagner|sekt|cola|limonade|eistee|saft|nektar|mineral|wasser\b|sirup|energy|kaffee|espresso|tee\b|kakao|whisky|vodka|gin\b|rum\b|likör|aperitif)", "boissons"),
    (r"(eier\b|milch|joghurt|jogurt|quark|käse|mozzarella|butter|rahm|skyr|hüttenkäse|cottage|raclette|fondue|feta|mascarpone|ricotta)", "laitier_oeufs"),
    (r"(poulet|huhn|hähnchen|truten|pute|rind|kalb|lamm|hackfleisch|steak|schnitzel|filet|braten|wurst|schinken|speck|salami|fleisch|thon|lachs|fisch|forelle|barsch|crevette|tofu|bresaola)", "proteines"),
    (r"(reis\b|risotto|pasta|spaghetti|penne|fusilli|nudel|teigwaren|ravioli|tortelloni|gnocchi|kartoffel|brot|toast|mehl|haferflocken|müesli|muesli|couscous|polenta|bulgur|linsen|kichererbsen|bohnen)", "feculents"),
    (r"(apfel|äpfel|birne|banane|trauben|mango|orange|clementin|mandarin|zitrone|kiwi|beeren|erdbeer|quitten|ananas|melone|salat|tomate|gurke|zucchetti|zucchini|karotte|rüebli|zwiebel|lauch|kohl|broccoli|blumenkohl|peperoni|aubergine|pilze|champignon|spinat|gemüse|früchte|avocado|fenchel|kürbis)", "fruits_legumes"),
]

PORK = re.compile(r"(salchich|salam|schwein|speck|schinken|rollschinkli|salami|prosciutto|serrano|jamón|jamon|coppa|pancetta|mortadella|cervelat|klöpfer|lardo|kassler|spareribs|chorizo|landjäger|bratwurst|cipollata|schüblig|wienerli|frankfurter|saucisson|salsiccia|leberwurst|fleischkäse|nierstück|kotelett|rippli|guanciale|culatello|lyoner|bauernbratwurst)", re.I)
NOT_PORK = re.compile(r"(poulet|truten|pute|rind|kalb|lamm|geflügel|vegan|vegetar|veggie|halal|bresaola|thon|lachs|fisch)", re.I)
MAYBE_PORK = re.compile(r"(wurst|aufschnitt|apéro mischplatte|apero mischplatte|platte|terrine|pastete|hackfleisch gemischt|gemischt)", re.I)
SEAFOOD = re.compile(r"(crevette|garnele|scampi|shrimp|muschel|moule|calamar|tintenfisch|oktopus|krake|hummer|languste|krabbe|surimi|meeresfrüchte|frutti di mare|jakobsmuschel|austern)", re.I)
FISH = re.compile(r"(thon|lachs|fisch|forelle|barsch|schlemmerfilet|seelachs|kabeljau|dorsch|hering|sardine|makrele|pangasius|zander|egli|sushi)", re.I)
PROTEIN = re.compile(r"(poulet|huhn|hähnchen|truten|pute|rind|kalb|lamm|hackfleisch|steak|schnitzel|eier\b|quark|skyr|hüttenkäse|cottage|thon|lachs|fisch|tofu|protein|linsen|kichererbsen|bohnen|bresaola|joghurt nature|griechisch)", re.I)


NON_PROTEIN = re.compile(r"(sauce|bouillon|suppe|aromat|würfel|spätzle|müesli|muesli|knusper|riegel)", re.I)


def classify(name: str, subline: str, native: str) -> tuple[str, list[str]]:
    text = f"{name} {subline}"
    nat = (native or "").strip().lower()
    group = NATIVE.get(nat)
    if group is None and WINE.search(nat or ""):
        group = "boissons"
    if group in (None, "nourriture") or nat == "sonstiges":
        for rx, g in KW:
            if re.search(rx, text, re.I):
                group = g
                break
    if group is None:
        # « Sonstiges » regroupe surtout de l'épicerie (55 alim. / 3 non-alim. au 13.10.2026).
        group = "nourriture" if nat == "sonstiges" or _looks_food(text) else "autres"

    tags: list[str] = []
    food = group in ("proteines", "laitier_oeufs", "feculents", "fruits_legumes", "nourriture")
    if food:
        tags.append("nourriture")
        no_pork = re.search(r"ohne\s+schwein|schweinefleischfrei|halal", text, re.I)
        explicit = re.search(r"schwein", text, re.I) and not no_pork
        if explicit or (PORK.search(text) and not NOT_PORK.search(text) and not no_pork):
            tags.append("porc")
        elif MAYBE_PORK.search(text) and not NOT_PORK.search(text) and group == "proteines":
            tags.append("porc_possible")
        if SEAFOOD.search(text):
            tags.append("fruits_de_mer")
        if FISH.search(text):
            tags.append("poisson")
        if (PROTEIN.search(text) or group == "proteines") and group != "nourriture" or \
                (group == "nourriture" and PROTEIN.search(text) and not NON_PROTEIN.search(text)):
            tags.append("proteines")
    return group, tags


def _looks_food(text: str) -> bool:
    return bool(re.search(r"(sauce|gewürz|öl\b|essig|zucker|honig|konfitüre|schokolade|chips|nüsse|snack|suppe|bouillon|pizza|glace|kekse|biscuit|riegel)", text, re.I))


GROUP_LABELS = {
    "proteines": "Protéines (viande, poisson)",
    "laitier_oeufs": "Laitiers & œufs",
    "feculents": "Féculents",
    "fruits_legumes": "Fruits & légumes",
    "nourriture": "Autre nourriture",
    "boissons": "Boissons",
    "entretien": "Entretien",
    "hygiene": "Hygiène & soins",
    "autres": "Autres",
}
