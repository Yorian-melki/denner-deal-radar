"""Analyse hors ligne, exhaustive, du test de noms (Name Battle).

Entrée : l'export anonyme https://nametest-603.pages.dev/api/export (ou un fichier JSON).
Sortie : report.md (classement automatique + incertitude + diagnostics) et results.json.

    python analyze.py                      # télécharge l'export en ligne
    python analyze.py --file export.json   # fichier local (ou simulation)
    python analyze.py --boot 1000          # plus de rééchantillonnages (plus précis, plus lent)

Principes (aucun biais connu non traité) :
  1. Qualité : chaque répondant est audité (vitesse, clics toujours au même endroit,
     mémoire « tout cocher »). Les exclusions sont listées, jamais silencieuses.
  2. Préférence : Bradley-Terry bayésien (a priori N(0, σ²) = rétrécissement des noms
     peu vus), ajusté sur TOUS les duels à la fois (ordre des votes sans effet),
     avec un paramètre d'avantage de la carte du haut estimé et retiré.
  3. Mémoire : reconnaissance corrigée par personne ET par position dans la séquence
     (primauté/récence), puis indice d' (détection du signal : reconnu vs fausse alarme).
  4. Orthographe (QCM à l'écoute) et compréhension (« bons plans ») : taux lissés.
  5. Score global = z-scores pondérés (préférence 60 %, mémoire 25 %, orthographe 10 %,
     compréhension 5 %).
  6. Incertitude totale : bootstrap sur les RÉPONDANTS (pas les votes) × poids perturbés
     (Dirichlet) → probabilité d'être n°1, rang médian, intervalle de rang à 90 %.
  7. Robustesse : fiabilité split-half, cohérence par langue / appareil / provenance,
     variante pondérée par la décision (temps de réponse), puissance (combien de
     répondants faut-il encore pour départager le haut du classement).
"""
from __future__ import annotations

import argparse, json, math, sys, urllib.request
from collections import defaultdict
from pathlib import Path

import numpy as np
from scipy.optimize import minimize
from scipy.stats import norm, spearmanr

URL = "https://nametest-603.pages.dev/api/export"
NAMES_JS = Path(__file__).resolve().parent.parent / "public" / "names.js"
WEIGHTS = {"pref": 0.60, "mem": 0.25, "spell": 0.10, "mean": 0.05}

# --------------------------------------------------------------------------- données

def load(path: str | None) -> list[dict]:
    if path:
        raw = json.loads(Path(path).read_text())
    else:
        with urllib.request.urlopen(URL, timeout=60) as r:
            raw = json.load(r)
    out = []
    for e in raw.get("events", raw if isinstance(raw, list) else []):
        d = e.get("data")
        if isinstance(d, str):
            try: d = json.loads(d)
            except Exception: d = {}
        out.append({"rid": e["rid"], "ts": e.get("ts", 0), "type": e["type"], "d": d or {}, "lang": e.get("lang") or "?", "device": e.get("device") or "?"})
    return out


def all_names() -> tuple[list[str], set[str]]:
    src = NAMES_JS.read_text()
    names = json.loads(src.split("window.NAMES = ")[1].split(";")[0])
    fav = set(json.loads(src.split("window.FAV = ")[1].split(";")[0]))
    return names, fav


def tables(ev: list[dict]):
    duels, recalls, spells, means, sessions = [], [], [], [], defaultdict(dict)
    views = {}
    meta = {}
    k = defaultdict(int)
    for e in ev:
        r, d = e["rid"], e["d"]
        meta.setdefault(r, {"lang": e["lang"], "device": e["device"]})
        if d.get("country"): meta[r]["country"] = d["country"]
        if e["type"] == "view":
            views[r] = {"inApp": d.get("inApp", "?"), "ref": d.get("ref", ""), "country": d.get("country", "?")}
        elif e["type"] == "duel" and d.get("a") and d.get("b") and d.get("win") in (d.get("a"), d.get("b")):
            duels.append({"rid": r, "a": d["a"], "b": d["b"], "top_won": int(d["win"] == d["a"]), "ms": d.get("ms"),
                          "scene": d.get("scene"), "idx": k[r], "endless": bool(d.get("endless"))}); k[r] += 1
        elif e["type"] == "recall" and isinstance(d.get("seen"), list) and isinstance(d.get("decoys"), list) and isinstance(d.get("picked"), list):
            recalls.append({"rid": r, **{x: d[x] for x in ("seen", "decoys", "picked")}})
        elif e["type"] == "spell" and d.get("name"):
            spells.append({"rid": r, "name": d["name"], "ok": int(str(d.get("typed", "")).lower() == d["name"].lower()), "accent": d.get("accent", "?")})
        elif e["type"] == "meaning" and d.get("name"):
            means.append({"rid": r, "name": d["name"], "answer": d.get("answer")})
        elif e["type"] == "session":
            for x in ("ref", "shared", "start", "friendCommon"):
                if d.get(x) not in (None, ""): sessions[r][x] = d[x]
    seen_by = {x["rid"]: set(x["seen"]) for x in recalls}
    for d in duels:
        sb = seen_by.get(d["rid"], set()); d["fam"] = int(d["a"] in sb) - int(d["b"] in sb)
    tables.views = views
    return duels, recalls, spells, means, sessions, meta

# --------------------------------------------------------------------------- qualité

def audit(duels, recalls):
    per = defaultdict(lambda: {"ms": [], "top": 0, "n": 0})
    for d in duels:
        p = per[d["rid"]]; p["n"] += 1; p["top"] += d["top_won"]
        if isinstance(d["ms"], (int, float)): p["ms"].append(d["ms"])
    flags = {}
    for r, p in per.items():
        f = []
        if len(p["ms"]) >= 4 and float(np.median(p["ms"])) < 450: f.append("trop rapide")
        if p["n"] >= 8 and (p["top"] / p["n"] >= 0.95 or p["top"] / p["n"] <= 0.05): f.append("toujours la même position")
        if f: flags[r] = f
    mem_bad = set()
    for x in recalls:
        if len(x["picked"]) >= 9 or (x["decoys"] and sum(n in x["picked"] for n in x["decoys"]) / len(x["decoys"]) >= 0.8):
            mem_bad.add(x["rid"])
    return flags, mem_bad, per

# --------------------------------------------------------------------------- préférence

def fit_bt(duels, names, idx, weights=None, sigma=1.0):
    """MAP Bradley-Terry : P(haut gagne) = σ(s_haut − s_bas + β). A priori s ~ N(0, σ²)."""
    if not duels: return np.zeros(len(names)), 0.0, np.full(len(names), np.nan)
    I = np.array([idx[d["a"]] for d in duels]); J = np.array([idx[d["b"]] for d in duels])
    Y = np.array([d["top_won"] for d in duels], float)
    Fm = np.array([d.get("fam", 0) for d in duels], float)
    W = np.ones(len(duels)) if weights is None else np.asarray(weights, float)
    n = len(names)

    def f(x):
        s, b, gm = x[:n], x[n], x[n + 1]
        z = s[I] - s[J] + b + gm * Fm
        p = 1 / (1 + np.exp(-z))
        ll = np.sum(W * (Y * np.log(p + 1e-12) + (1 - Y) * np.log(1 - p + 1e-12)))
        g = W * (Y - p)
        gs = np.bincount(I, g, n) - np.bincount(J, g, n)
        return -(ll - np.sum(s ** 2) / (2 * sigma ** 2)), -np.concatenate([gs - s / sigma ** 2, [g.sum(), np.sum(g * Fm)]])

    res = minimize(f, np.zeros(n + 2), jac=True, method="L-BFGS-B")
    s, b = res.x[:n], res.x[n]; fit_bt.familiarity = res.x[n + 1]
    p = 1 / (1 + np.exp(-(s[I] - s[J] + b + res.x[n + 1] * Fm))); w = W * p * (1 - p)
    info = np.bincount(I, w, n) + np.bincount(J, w, n) + 1 / sigma ** 2
    return s - s.mean(), b, 1 / np.sqrt(info)

# --------------------------------------------------------------------------- mémoire

def memory(recalls, names):
    """Reconnaissance corrigée par personne et par position (0–4) dans la séquence flashée."""
    if not recalls: return {n: np.nan for n in names}, {}
    pos_hit = defaultdict(list)
    for x in recalls:
        pk = set(x["picked"])
        for i, n in enumerate(x["seen"]): pos_hit[i].append(int(n in pk))
    g_hit = np.mean([v for l in pos_hit.values() for v in l])
    pos_eff = {i: np.mean(v) - g_hit for i, v in pos_hit.items()}
    g_fa = np.mean([int(n in set(x["picked"])) for x in recalls for n in x["decoys"]]) if any(x["decoys"] for x in recalls) else 0.2
    H, HN, F, FN = defaultdict(float), defaultdict(int), defaultdict(float), defaultdict(int)
    for x in recalls:
        pk = set(x["picked"])
        ph = np.mean([n in pk for n in x["seen"]]) if x["seen"] else g_hit
        pf = np.mean([n in pk for n in x["decoys"]]) if x["decoys"] else g_fa
        for i, n in enumerate(x["seen"]):
            H[n] += int(n in pk) - (ph - g_hit) - pos_eff.get(i, 0); HN[n] += 1
        for n in x["decoys"]:
            F[n] += int(n in pk) - (pf - g_fa); FN[n] += 1
    clip = lambda v: min(0.99, max(0.01, v))
    dp = {}
    for n in names:
        if HN[n] == 0: dp[n] = np.nan; continue
        h = clip((H[n] + 0.5) / (HN[n] + 1)); f = clip((F[n] + 0.5) / (FN[n] + 1)) if FN[n] else clip(g_fa)
        dp[n] = norm.ppf(h) - norm.ppf(f)
    return dp, {"hit": g_hit, "fa": g_fa, "position_effect": pos_eff}


def rate(rows, names, key="ok"):
    acc = defaultdict(lambda: [0, 0])
    for r in rows: acc[r["name"]][0] += r[key]; acc[r["name"]][1] += 1
    return {n: ((acc[n][0] + 1) / (acc[n][1] + 2) if acc[n][1] else np.nan) for n in names}, {n: acc[n][1] for n in names}

# --------------------------------------------------------------------------- score global

def zscore(v: dict, names):
    a = np.array([v.get(n, np.nan) for n in names], float)
    ok = ~np.isnan(a)
    if ok.sum() < 2: return np.zeros(len(names))
    z = np.zeros(len(names)); z[ok] = (a[ok] - a[ok].mean()) / (a[ok].std() or 1)
    return z


def composite(pref, mem, spell, mean, names, w=WEIGHTS):
    return (w["pref"] * zscore(pref, names) + w["mem"] * zscore(mem, names)
            + w["spell"] * zscore(spell, names) + w["mean"] * zscore(mean, names))


def compute(duels, recalls, spells, means, names, idx, dweights=None):
    s, b, se = fit_bt(duels, names, idx, dweights)
    pref = {n: s[i] for i, n in enumerate(names)}
    mem, base = memory(recalls, names)
    spell, _ = rate(spells, names)
    meanr, _ = rate([{**m, "ok": int(m["answer"] == "deals")} for m in means], names)
    return pref, se, b, mem, base, spell, meanr

# --------------------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--file"); ap.add_argument("--boot", type=int, default=400); ap.add_argument("--out", default=str(Path(__file__).resolve().parent))
    a = ap.parse_args()
    rng = np.random.default_rng(7)
    ev = load(a.file); names, fav = all_names(); idx = {n: i for i, n in enumerate(names)}
    duels, recalls, spells, means, sessions, meta = tables(ev)
    flags, mem_bad, per = audit(duels, recalls)
    ok_r = lambda r: r not in flags
    D = [d for d in duels if ok_r(d["rid"]) and d["a"] in idx and d["b"] in idx]
    Rc = [x for x in recalls if ok_r(x["rid"]) and x["rid"] not in mem_bad]
    S = [x for x in spells if ok_r(x["rid"]) and x["name"] in idx]
    M = [x for x in means if ok_r(x["rid"]) and x["name"] in idx]
    resp = sorted({d["rid"] for d in D} | {x["rid"] for x in Rc} | {x["rid"] for x in S})
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    if not resp:
        (out / "report.md").write_text("# Name Battle — rapport\n\nAucune réponse exploitable pour l'instant.\n"); print("aucune donnée"); return

    pref, se, beta, mem, base, spell, meanr = compute(D, Rc, S, M, names, idx)
    score = composite(pref, mem, spell, meanr, names)

    # --- incertitude : bootstrap répondants × poids perturbés
    by = defaultdict(lambda: {"D": [], "R": [], "S": [], "M": []})
    for d in D: by[d["rid"]]["D"].append(d)
    for x in Rc: by[x["rid"]]["R"].append(x)
    for x in S: by[x["rid"]]["S"].append(x)
    for x in M: by[x["rid"]]["M"].append(x)
    keys = list(by)
    ranks = np.zeros((a.boot, len(names)), int); pref_ranks = np.zeros((a.boot, len(names)), int)
    for t in range(a.boot):
        pick = rng.choice(len(keys), len(keys), replace=True)
        bD, bR, bS, bM = [], [], [], []
        for p in pick: g = by[keys[p]]; bD += g["D"]; bR += g["R"]; bS += g["S"]; bM += g["M"]
        bp, _, _, bm, _, bs, bme = compute(bD, bR, bS, bM, names, idx)
        w = dict(zip(WEIGHTS, rng.dirichlet(np.array(list(WEIGHTS.values())) * 40)))
        sc = composite(bp, bm, bs, bme, names, w)
        ranks[t] = np.argsort(np.argsort(-sc)) + 1
        pref_ranks[t] = np.argsort(np.argsort(-np.array([bp[n] for n in names]))) + 1
    p1 = (ranks == 1).mean(0); p3 = (ranks <= 3).mean(0)
    med = np.median(ranks, 0); lo = np.percentile(ranks, 5, 0); hi = np.percentile(ranks, 95, 0)
    pp1 = (pref_ranks == 1).mean(0)

    # --- robustesse
    half = rng.permutation(keys); h1, h2 = set(half[: len(half) // 2]), set(half[len(half) // 2:])
    s1 = fit_bt([d for d in D if d["rid"] in h1], names, idx)[0]; s2 = fit_bt([d for d in D if d["rid"] in h2], names, idx)[0]
    rho_half = spearmanr(s1, s2).correlation if len(D) > 20 else float("nan")
    reliab = 2 * rho_half / (1 + rho_half) if rho_half == rho_half and rho_half > -1 else float("nan")
    seg = {}
    for label, keyf in (("langue", lambda r: meta.get(r, {}).get("lang", "?")), ("appareil", lambda r: meta.get(r, {}).get("device", "?")),
                        ("provenance", lambda r: "via partage" if sessions.get(r, {}).get("ref") else "directe")):
        groups = defaultdict(list)
        for d in D: groups[keyf(d["rid"])].append(d)
        for gname, gd in groups.items():
            if len({d["rid"] for d in gd}) < 15: continue
            gs = fit_bt(gd, names, idx)[0]
            seg[f"{label} = {gname}"] = {"n": len({d["rid"] for d in gd}), "rho": spearmanr(gs, [pref[n] for n in names]).correlation, "top": names[int(np.argmax(gs))]}
    med_ms = {r: float(np.median(p["ms"])) for r, p in per.items() if p["ms"]}
    dw = [min(2.0, max(0.5, med_ms.get(d["rid"], 1500) / d["ms"])) if isinstance(d["ms"], (int, float)) and d["ms"] > 0 else 1.0 for d in D]
    s_dec = fit_bt(D, names, idx, dw)[0]; rho_dec = spearmanr(s_dec, [pref[n] for n in names]).correlation
    fatigue = []
    for k in range(0, 12, 3):
        sub = [d for d in D if k <= d["idx"] < k + 3]
        if sub: fatigue.append((f"duels {k+1}-{k+3}", round(100 * np.mean([d["top_won"] for d in sub])), round(float(np.median([d["ms"] for d in sub if isinstance(d["ms"], (int, float))] or [0])))))
    exposure = np.bincount([idx[d["a"]] for d in D] + [idx[d["b"]] for d in D], minlength=len(names))
    order = np.argsort(-score)
    best = order[0]; gap = score[order[0]] - score[order[1]] if len(order) > 1 else 0
    n_now = len(resp)
    # puissance : l'écart de préférence n°1–n°2 devient significatif quand 1.96·SE_diff < écart ; SE ∝ 1/√n
    pi = sorted(range(len(names)), key=lambda i: -pref[names[i]])[:2]
    diff = pref[names[pi[0]]] - pref[names[pi[1]]]; se_diff = math.hypot(se[pi[0]], se[pi[1]])
    need = math.ceil(n_now * (1.96 * se_diff / diff) ** 2) if diff > 0 else None

    # --- rapport
    L = []
    L.append("# Name Battle — rapport d'analyse automatique\n")
    L.append(f"**Répondants exploitables : {n_now}** · duels valides : {len(D)} · rééchantillonnages : {a.boot}\n")
    win = names[best]
    verdict = "🏆 **Gagnant robuste**" if p1[best] >= 0.8 else ("🥇 **En tête, mais pas encore certain**" if p1[best] >= 0.4 else "⚖️ **Pas encore de gagnant clair**")
    L.append(f"## Verdict\n{verdict} : **{win}** — probabilité d'être n°1 : **{100*p1[best]:.0f} %** (n°1 en préférence pure : {100*pp1[best]:.0f} %).")
    if need and need > 20 * n_now:
        L.append(f"En préférence pure, {names[pi[0]]} et {names[pi[1]]} sont quasiment à égalité : même beaucoup plus de votes ne les départageront pas nettement. Le score global les départage avec la mémoire, l'orthographe et la compréhension.")
    elif need and need > n_now:
        L.append(f"Pour départager n°1 et n°2 en préférence avec 95 % de confiance : ≈ **{need} répondants** (aujourd'hui {n_now}).")
    L.append("")
    L.append("## Classement (score global, incertitude complète)\n")
    L.append("| # | Nom | Score | P(n°1) | P(top 3) | Rang médian [90 %] | Préférence (Elo ± IC95) | Mémoire d' | Orthographe | Compréhension | Duels |")
    L.append("|---|---|---|---|---|---|---|---|---|---|---|")
    for r, i in enumerate(order, 1):
        n = names[i]; elo = 1500 + 173.7 * pref[n]; ci = 1.96 * 173.7 * se[i]
        f = lambda v, pct=False: "–" if v != v else (f"{100*v:.0f} %" if pct else f"{v:.2f}")
        L.append(f"| {r} | {n}{' ★' if n in fav else ''} | {score[i]:+.2f} | {100*p1[i]:.0f} % | {100*p3[i]:.0f} % | {med[i]:.0f} [{lo[i]:.0f}–{hi[i]:.0f}] | {elo:.0f} ± {ci:.0f} | {f(mem[n])} | {f(spell[n], True)} | {f(meanr[n], True)} | {exposure[i]} |")
    L.append("\n## Qualité des données\n")
    L.append(f"- Répondants écartés : **{len(flags)}** ({', '.join(sorted({x for v in flags.values() for x in v})) or 'aucun'}) ; écartés de la mémoire seulement (tout coché) : {len(mem_bad)}.")
    L.append(f"- Biais de la carte du haut : **{100/(1+math.exp(-beta)):.0f} %** de victoires toutes choses égales (50 % = aucun biais) — corrigé dans le modèle.")
    fam = getattr(fit_bt, "familiarity", 0.0)
    L.append(f"- Effet de familiarité (nom vu à l'étape mémoire puis en duel) : **{100/(1+math.exp(-fam)) - 50:+.1f} pts** de victoire — corrigé dans le modèle.")
    L.append(f"- Mémoire moyenne : {100*base.get('hit', float('nan')):.0f} % reconnus, {100*base.get('fa', float('nan')):.0f} % fausses alarmes ; effet de position dans la séquence : " + ", ".join(f"{k+1}e {100*v:+.0f} pts" for k, v in sorted(base.get('position_effect', {}).items())) + " (corrigé).")
    L.append(f"- Exposition par nom : min {exposure.min()}, médiane {int(np.median(exposure))}, max {exposure.max()} duels.")
    L.append(f"- Fatigue / habituation (part haut %, temps médian ms) : " + " · ".join(f"{a} : {b} %, {c} ms" for a, b, c in fatigue))
    V = getattr(tables, "views", {})
    started = {r for r, x in sessions.items() if x.get("start")}
    finished = {x["rid"] for x in means}
    L.append("\n## Entonnoir et canaux\n")
    L.append(f"- Ouvertures : {len(V)} · ont commencé : {len(started)} · ont fini : {len(finished)} · duels bonus joués : {sum(d['endless'] for d in duels)}.")
    ch = defaultdict(lambda: [0, 0, 0])
    for r, x in V.items(): c = ch[x["inApp"]]; c[0] += 1; c[1] += r in started; c[2] += r in finished
    if ch: L.append("- Par canal (ouvert → commencé → fini) : " + " · ".join(f"{k} {a}→{b}→{c}" for k, (a, b, c) in sorted(ch.items(), key=lambda t: -t[1][0])))
    co = defaultdict(int)
    for r in resp: co[meta.get(r, {}).get("country", "?")] += 1
    if co: L.append("- Par pays (répondants) : " + ", ".join(f"{k} {v}" for k, v in sorted(co.items(), key=lambda t: -t[1])))
    L.append("\n## Robustesse\n")
    L.append(f"- Fiabilité (split-half, Spearman-Brown) : **{reliab:.2f}** (≥ 0,8 = classement stable ; plus de répondants l'augmente).")
    L.append(f"- Variante pondérée par la décision (choix rapides = préférence plus nette) : corrélation de rang avec le modèle principal {rho_dec:.2f}.")
    for k, v in seg.items(): L.append(f"- Segment {k} (n = {v['n']}) : corrélation avec le global {v['rho']:.2f}, n°1 du segment : {v['top']}.")
    if not seg: L.append("- Segments : pas encore assez de répondants par langue / appareil / provenance (≥ 15 requis).")
    L.append("\n## Méthode\n" + __doc__.split("Principes")[1])
    (out / "report.md").write_text("\n".join(L))
    (out / "results.json").write_text(json.dumps({"respondents": n_now, "ranking": [{"name": names[i], "score": float(score[i]), "p1": float(p1[i]), "p3": float(p3[i]), "rank_median": float(med[i]), "rank_90": [float(lo[i]), float(hi[i])]} for i in order]}, ensure_ascii=False, indent=1))
    print("\n".join(L[:8]))


if __name__ == "__main__":
    main()
