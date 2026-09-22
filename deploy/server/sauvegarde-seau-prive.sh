#!/usr/bin/env bash
# Copie nocturne du seau PRIVÉ des médias vers `vps-sauvegardes` (TCK-541, ADR-0029).
#
# Depuis la bascule sur R2, les originaux des photos et toutes les pièces privées (KYC, documents,
# relevés) vivent dans `takussan-preview-private`, plus sur le volume que Dokploy archivait. Le seau
# public n'est pas copié : il ne contient que des conversions (régénérables depuis le privé), des
# avatars et des logos — une perte s'y rattrape par `media:regenerate-property-conversions`.
#
# `rclone copy`, jamais `sync` : un objet supprimé du seau (par erreur, ou par un défaut) RESTE dans la
# sauvegarde. C'est une copie incrémentale — seuls les objets neufs ou modifiés voyagent — et elle se
# fait côté serveur, de seau à seau chez Cloudflare : rien ne transite par la machine.
#
# Le jeton `takussan-preview-backup` lit le seau privé et écrit dans `vps-sauvegardes` ; il n'a aucun
# droit sur le seau public ni sur l'application. Il ne peut pas créer de seau : `--s3-no-check-bucket`.
#
# Secrets dans /etc/default/sauvegarde-seau-prive (mode 600), jamais dans le dépôt :
#   R2_ACCOUNT_ID, R2_BACKUP_ACCESS_KEY_ID, R2_BACKUP_SECRET_ACCESS_KEY
# Un échec est signalé sur Telegram par les secrets de /etc/default/seuils, s'ils existent.
#
# Installé par bootstrap.sh § 8 (unités sauvegarde-seau-prive.service et .timer, qui attendent
# /usr/local/sbin/sauvegarde-seau-prive).
#
# Usage :  sauvegarde-seau-prive            # un passage (ce que fait le timer)
#          sauvegarde-seau-prive --essai    # ce qui serait copié, sans rien écrire
set -uo pipefail

[ -f /etc/default/sauvegarde-seau-prive ] && . /etc/default/sauvegarde-seau-prive
SOURCE=${SOURCE:-takussan-preview-private}
CIBLE=${CIBLE:-vps-sauvegardes/takussan-preview-private}
IMAGE=${IMAGE:-rclone/rclone:1.71}

for v in R2_ACCOUNT_ID R2_BACKUP_ACCESS_KEY_ID R2_BACKUP_SECRET_ACCESS_KEY; do
  [ -n "${!v:-}" ] || { echo "✗ $v absente de /etc/default/sauvegarde-seau-prive" >&2; exit 2; }
done

essai=()
[ "${1:-}" = "--essai" ] && essai=(--dry-run)

sortie=$(docker run --rm \
  -e RCLONE_CONFIG_R2_TYPE=s3 \
  -e RCLONE_CONFIG_R2_PROVIDER=Cloudflare \
  -e RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_BACKUP_ACCESS_KEY_ID" \
  -e RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_BACKUP_SECRET_ACCESS_KEY" \
  -e RCLONE_CONFIG_R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com" \
  -e RCLONE_CONFIG_R2_REGION=auto \
  "$IMAGE" copy "r2:$SOURCE" "r2:$CIBLE" \
  --s3-no-check-bucket --stats 24h -v "${essai[@]}" 2>&1)
code=$?
# Le bilan seulement : une ligne par objet copié rendrait le journal illisible au premier passage.
grep -E "^Transferred:|^Checks:|^Errors:|^Elapsed time:|ERROR|nothing to transfer" <<<"$sortie" | tail -6

if [ $code -ne 0 ]; then
  [ -f /etc/default/seuils ] && . /etc/default/seuils
  if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ]; then
    curl -fsS -o /dev/null "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
      --data-urlencode "text=✗ $(hostname -s) : la sauvegarde du seau $SOURCE a échoué (code $code) — journalctl -u sauvegarde-seau-prive" \
      || echo "⚠ alerte Telegram non envoyée" >&2
  fi
  exit $code
fi
