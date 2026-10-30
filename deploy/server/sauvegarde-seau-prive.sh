#!/usr/bin/env bash
# Copie nocturne du seau PRIVÉ des médias vers `vps-sauvegardes` (TCK-541, ADR-0029), en instantanés
# datés gardés RETENTION_JOURS jours (TCK-2407, ADR-0029 amendé le 2026-10-30).
#
# Depuis la bascule sur R2, les originaux des photos et toutes les pièces privées (KYC, documents,
# relevés, captures du Radar) vivent dans `takussan-preview-private`, plus sur le volume que Dokploy
# archivait. Le seau public n'est pas copié : il ne contient que des conversions (régénérables depuis
# le privé), des avatars et des logos — une perte s'y rattrape par `media:regenerate-property-conversions`.
#
# Chaque passage copie le seau entier sous `$CIBLE/jours/AAAA-MM-JJ/` (date UTC), de seau à seau chez
# Cloudflare : rien ne transite par la machine. `rclone copy`, jamais `sync` : un instantané écrit
# n'est ni effacé ni écrasé. PUIS, et seulement si la copie a réussi, les instantanés de
# RETENTION_JOURS jours ou plus sont retirés (14 par défaut : les 14 derniers jours sont gardés).
#   · Un objet effacé du seau — par la purge du Radar, un effacement de compte, ou par erreur — quitte
#     la sauvegarde 14 jours au plus tard après (privacy.ts § 6 : « Sauvegardes : conservées au plus
#     14 jours ») ; il se restaure jusque-là depuis un instantané d'avant l'effacement.
#   · Un objet vivant est dans chaque instantané, quel que soit son âge.
#   · Une copie en échec ne retire rien : une panne ne réduit jamais la sauvegarde. C'est pourquoi la
#     rotation est ici et pas dans une règle de cycle de vie R2, qui effacerait aussi VPS arrêté.
#   · Sous le verrou de rétention de 7 jours de `vps-sauvegardes` (ADR-0069 § 5), RETENTION_JOURS < 8
#     est refusé par R2 à la rotation, et alerté.
#
# Le jeton `takussan-preview-backup` lit le seau privé et écrit dans `vps-sauvegardes` ; il n'a aucun
# droit sur le seau public ni sur l'application. Il ne peut pas créer de seau : `--s3-no-check-bucket`.
#
# Secrets dans /etc/default/sauvegarde-seau-prive (mode 600), jamais dans le dépôt :
#   R2_ACCOUNT_ID, R2_BACKUP_ACCESS_KEY_ID, R2_BACKUP_SECRET_ACCESS_KEY
# Facultatifs, au même endroit : SOURCE, CIBLE, RETENTION_JOURS.
# Un échec (copie, rotation, retrait) est signalé sur Telegram par les secrets de /etc/default/seuils,
# s'ils existent.
#
# Installé par bootstrap.sh § 8 (unités sauvegarde-seau-prive.service et .timer, qui attendent
# /usr/local/sbin/sauvegarde-seau-prive). Éprouvé par scripts/test-sauvegarde-seau-prive.sh.
#
# Usage :  sauvegarde-seau-prive                         # un passage (ce que fait le timer)
#          sauvegarde-seau-prive --essai                 # ce qui serait copié et retiré, sans rien écrire
#          sauvegarde-seau-prive --retirer-copie-plate   # un passage, puis retire l'ancienne copie unique
#                                                        # (tout ce qui est sous $CIBLE hors de jours/) ;
#                                                        # une fois, 8 jours au moins après le premier
#                                                        # passage en instantanés (verrou de 7 jours)
set -uo pipefail

[ -f /etc/default/sauvegarde-seau-prive ] && . /etc/default/sauvegarde-seau-prive
SOURCE=${SOURCE:-takussan-preview-private}
CIBLE=${CIBLE:-vps-sauvegardes/takussan-preview-private}
IMAGE=${IMAGE:-rclone/rclone:1.71}
RETENTION_JOURS=${RETENTION_JOURS:-14}
# Le jour du passage, en UTC. Ne se pose qu'à l'épreuve de la rotation (le harnais simule les jours).
JOUR=${JOUR:-$(date -u +%F)}

for v in R2_ACCOUNT_ID R2_BACKUP_ACCESS_KEY_ID R2_BACKUP_SECRET_ACCESS_KEY; do
  [ -n "${!v:-}" ] || { echo "✗ $v absente de /etc/default/sauvegarde-seau-prive" >&2; exit 2; }
done
[[ $RETENTION_JOURS =~ ^[1-9][0-9]*$ ]] || { echo "✗ RETENTION_JOURS doit être un entier positif (« $RETENTION_JOURS »)" >&2; exit 2; }
[[ $JOUR =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || { echo "✗ JOUR doit être au format AAAA-MM-JJ (« $JOUR »)" >&2; exit 2; }

essai=()
retirer_plate=0
for argument in "$@"; do
  case $argument in
    --essai) essai=(--dry-run) ;;
    --retirer-copie-plate) retirer_plate=1 ;;
    *) echo "✗ argument inconnu : $argument (--essai, --retirer-copie-plate)" >&2; exit 2 ;;
  esac
done

rclone() {
  docker run --rm \
    -e RCLONE_CONFIG_R2_TYPE=s3 \
    -e RCLONE_CONFIG_R2_PROVIDER=Cloudflare \
    -e RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_BACKUP_ACCESS_KEY_ID" \
    -e RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_BACKUP_SECRET_ACCESS_KEY" \
    -e RCLONE_CONFIG_R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com" \
    -e RCLONE_CONFIG_R2_REGION=auto \
    "$IMAGE" "$@" --s3-no-check-bucket ${essai[@]+"${essai[@]}"}
}

# echouer <étape> <code> : l'alerte Telegram, puis la sortie avec le code de rclone.
echouer() {
  [ -f /etc/default/seuils ] && . /etc/default/seuils
  if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ]; then
    curl -fsS -o /dev/null "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
      --data-urlencode "text=✗ $(hostname -s) : la sauvegarde du seau $SOURCE a échoué ($1, code $2) — journalctl -u sauvegarde-seau-prive" \
      || echo "⚠ alerte Telegram non envoyée" >&2
  fi
  exit "$2"
}

# Jours depuis le 1970-01-01 d'une date AAAA-MM-JJ, en bash seul : `date -d` n'existe pas hors de GNU.
numero_du_jour() {
  local a m j
  IFS=- read -r a m j <<<"$1"
  a=$((10#$a)); m=$((10#$m)); j=$((10#$j))
  if [ "$m" -le 2 ]; then a=$((a - 1)); m=$((m + 12)); fi
  echo $((365 * a + a / 4 - a / 100 + a / 400 + (153 * (m - 3) + 2) / 5 + j - 719469))
}

# Retire les instantanés datés d'au moins RETENTION_JOURS jours. Tout autre préfixe sous jours/ (un
# nom qui n'est pas une date, une date future) reste en place.
retirer_les_instantanes_echus() {
  local liste code limite nom
  liste=$(rclone lsf --dirs-only "r2:$CIBLE/jours/" 2>&1); code=$?
  # 3 : « directory not found », un --essai avant le tout premier instantané.
  [ $code -eq 3 ] && return 0
  [ $code -eq 0 ] || { echo "$liste"; return $code; }
  limite=$(( $(numero_du_jour "$JOUR") - RETENTION_JOURS ))
  for nom in $liste; do
    nom=${nom%/}
    [[ $nom =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || continue
    [ "$(numero_du_jour "$nom")" -le "$limite" ] || continue
    echo "instantané $nom retiré (plus de $RETENTION_JOURS jours)"
    rclone purge "r2:$CIBLE/jours/$nom" || return $?
  done
}

sortie=$(rclone copy "r2:$SOURCE" "r2:$CIBLE/jours/$JOUR" --stats 24h -v 2>&1)
code=$?
# Le bilan seulement : une ligne par objet copié rendrait le journal illisible.
grep -E "^Transferred:|^Checks:|^Errors:|^Elapsed time:|ERROR|nothing to transfer" <<<"$sortie" | tail -6
[ $code -eq 0 ] || echouer "copie vers $CIBLE/jours/$JOUR" $code

retirer_les_instantanes_echus || echouer "rotation des instantanés" $?

if [ "$retirer_plate" = 1 ]; then
  echo "retrait de l'ancienne copie unique : $CIBLE hors de jours/"
  rclone delete "r2:$CIBLE" --exclude "/jours/**" -v || echouer "retrait de l'ancienne copie" $?
fi
exit 0
