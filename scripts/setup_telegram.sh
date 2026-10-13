#!/usr/bin/env bash
# Configure les alertes Telegram en une commande.
# Prérequis : avoir créé un bot avec @BotFather et lui avoir envoyé /start.
# Le jeton est saisi en masqué et stocké uniquement comme secret GitHub.
set -euo pipefail
REPO="${REPO:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}"
read -rsp "Collez le jeton de votre bot (fourni par @BotFather) : " TOKEN; echo
CHAT=$(curl -fsS "https://api.telegram.org/bot${TOKEN}/getUpdates" | python3 -c '
import json, sys
ids = [(u.get("message") or u.get("my_chat_member") or {}).get("chat", {}).get("id") for u in json.load(sys.stdin).get("result", [])]
ids = [i for i in ids if i]
print(ids[-1] if ids else "")')
if [ -z "$CHAT" ]; then
  echo "Aucun message reçu par le bot : ouvrez-le dans Telegram, envoyez /start, puis relancez ce script."
  exit 1
fi
printf '%s' "$TOKEN" | gh secret set TELEGRAM_BOT_TOKEN -R "$REPO"
printf '%s' "$CHAT"  | gh secret set TELEGRAM_CHAT_ID  -R "$REPO"
curl -fsS -o /dev/null -X POST "https://api.telegram.org/bot${TOKEN}/sendMessage" \
  -d chat_id="$CHAT" -d parse_mode=HTML \
  --data-urlencode text="✅ <b>Denner Deal Radar</b> est connecté. Les alertes arriveront ici."
gh workflow run scan.yml -R "$REPO" -f force=true
echo "OK : secrets enregistrés dans $REPO, message de test envoyé, collecte lancée."
