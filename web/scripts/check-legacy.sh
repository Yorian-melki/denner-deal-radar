#!/usr/bin/env bash
# Contrôle en ligne des anciens liens deal (round 4, item 1), après déploiement :
#  - 20 anciens slugs × 3 langues répondent 301, jamais depuis le cache (pas de « cf-cache-status: HIT ») ;
#  - chaque Location répond 200 ;
#  - aucune page servie ne contient « doubleclick ».
# Usage : scripts/check-legacy.sh https://savradar.pages.dev [out/_redirects]
set -euo pipefail
ORIGIN="${1:-https://savradar.pages.dev}"
REDIRECTS="${2:-out/_redirects}"
fail=0
# Les 3 slugs du constat d'origine d'abord, puis les premiers du fichier généré.
slugs=()
while IFS= read -r x; do slugs+=("$x"); done < <( { printf '%s\n' swisscom-blue-mobile-s-aktionspreis-ui09jp finish-geschirrspulcaps-ultra-all-in-1-u9ah2d coca-cola-classic-1rnj95b; \
  grep -E '^/de/deal/[^ ]+ ' "$REDIRECTS" | awk '{print $1}' | sed 's#^/de/deal/##'; } | awk '!seen[$0]++' | head -20)
for s in "${slugs[@]}"; do
  # Slug du constat sorti du budget de règles (MAX_LEGACY_LINES, plus récents d'abord ; round 4,
  # item 28 ouvert) : signalé, pas un échec — seules les règles réellement émises sont contrôlées.
  # Hors budget : le repli JS de la 404 (round 4, item 28) doit connaître le slug et mener à une page 200.
  if [ -f "$REDIRECTS" ] && ! grep -q "^/de/deal/$s " "$REDIRECTS"; then
    for l in de fr en; do
      moved=$(curl -sS --max-time 20 "$ORIGIN/$l/deal/$s" | grep -o 'data-moved="[^"]*"' | head -1 | cut -d'"' -f2 || true)
      if [ -z "$moved" ]; then echo "ÉCHEC repli $l/$s : pas de data-moved sur la 404"; fail=1; continue; fi
      target=$(curl -sS --max-time 20 "$ORIGIN$moved" | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{const m=JSON.parse(s);const h=process.argv[1];const t=m[h.slice(h.lastIndexOf("-")+1)];process.stdout.write(t?t.replace("%",process.argv[2]):"")})' "$s" "$l")
      if [ -z "$target" ]; then echo "ÉCHEC repli $l/$s : absent de $moved"; fail=1; continue; fi
      tcode=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "$ORIGIN$target")
      if [ "$tcode" != "200" ]; then echo "ÉCHEC repli $l/$s → $target : $tcode"; fail=1; else echo "repli JS : $l/$s → $target"; fi
    done
    continue
  fi
  for l in de fr en; do
    h=$(curl -sS -o /dev/null -D - --max-time 20 "$ORIGIN/$l/deal/$s" || true)
    code=$(printf '%s' "$h" | awk 'NR==1{print $2}')
    loc=$(printf '%s' "$h" | tr -d '\r' | awk 'tolower($1)=="location:"{print $2}')
    hit=$(printf '%s' "$h" | tr -d '\r' | awk 'tolower($1)=="cf-cache-status:"{print $2}')
    if [ "$code" != "301" ] || [ "$hit" = "HIT" ]; then echo "ÉCHEC $l/$s : $code ${hit:-}"; fail=1; continue; fi
    case "$loc" in http*) target="$loc" ;; *) target="$ORIGIN$loc" ;; esac
    body=$(curl -sS --max-time 20 -w '\n%{http_code}' "$target")
    tcode=$(printf '%s' "$body" | tail -n1)
    if [ "$tcode" != "200" ]; then echo "ÉCHEC $l/$s → $loc : $tcode"; fail=1; fi
    if printf '%s' "$body" | grep -qi doubleclick; then echo "ÉCHEC doubleclick dans $loc"; fail=1; fi
  done
done
echo "anciens liens contrôlés : ${#slugs[@]} × 3"
exit $fail
