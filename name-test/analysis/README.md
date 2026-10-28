# Analyse hors ligne du test de noms

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python analyze.py            # télécharge https://nametest-603.pages.dev/api/export
```

Produit `report.md` (classement automatique, probabilité d'être n°1, intervalles de rang,
qualité des données, robustesse) et `results.json`. Méthode détaillée en tête de `analyze.py`.
Validé sur simulation (300 répondants, 10 % de tricheurs, biais de position) :
30/30 tricheurs détectés, corrélation avec la vérité 0,96, fiabilité 0,91, vrai n°1 retrouvé.
