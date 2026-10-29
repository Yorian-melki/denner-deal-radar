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
