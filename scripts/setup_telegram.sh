#!/usr/bin/env bash
# Configure les alertes Telegram en une commande.
# Prérequis : avoir créé un bot avec @BotFather.
# Le jeton est saisi en masqué et stocké uniquement comme secret GitHub.
set -euo pipefail
REPO="${REPO:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}"
read -rsp "Collez le jeton de votre bot (fourni par @BotFather) : " TOKEN; echo
TOKEN="$(printf '%s' "$TOKEN" | tr -d '[:space:]')"

ME=$(curl -sS "https://api.telegram.org/bot${TOKEN}/getMe")
BOT=$(printf '%s' "$ME" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["result"]["username"] if d.get("ok") else "")')
if [ -z "$BOT" ]; then
  echo "❌ Jeton refusé par Telegram. Recopiez-le en entier depuis BotFather et relancez."
  exit 1
fi
echo "✅ Jeton valide pour le bot @${BOT}"

find_chat() {
  curl -sS "https://api.telegram.org/bot${TOKEN}/getUpdates" | python3 -c '
import json, sys
ids = [(u.get("message") or u.get("my_chat_member") or {}).get("chat", {}).get("id") for u in json.load(sys.stdin).get("result", [])]
ids = [i for i in ids if i]
print(ids[-1] if ids else "")'
}

CHAT=$(find_chat)
if [ -z "$CHAT" ]; then
  echo
  echo "👉 Ouvrez MAINTENANT ce lien et appuyez sur DÉMARRER (ou envoyez /start) :"
  echo "   https://t.me/${BOT}"
  echo
  echo "J'attends votre message (3 minutes maximum)…"
  for _ in $(seq 1 60); do
    sleep 3
    CHAT=$(find_chat)
    [ -n "$CHAT" ] && break
  done
fi
if [ -z "$CHAT" ]; then
  echo "❌ Toujours aucun message reçu par @${BOT}. Vérifiez que vous écrivez bien à @${BOT} (pas à BotFather), puis relancez."
  exit 1
fi
echo "✅ Message reçu, conversation identifiée."

printf '%s' "$TOKEN" | gh secret set TELEGRAM_BOT_TOKEN -R "$REPO"
printf '%s' "$CHAT"  | gh secret set TELEGRAM_CHAT_ID  -R "$REPO"
curl -fsS -o /dev/null -X POST "https://api.telegram.org/bot${TOKEN}/sendMessage" \
  -d chat_id="$CHAT" -d parse_mode=HTML \
  --data-urlencode text="✅ <b>Denner Deal Radar</b> est connecté. Les alertes arriveront ici."
gh workflow run scan.yml -R "$REPO" -f force=true
echo "OK : secrets enregistrés dans $REPO, message de test envoyé, collecte lancée."
