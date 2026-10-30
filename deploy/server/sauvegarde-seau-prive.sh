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
# n'est ni effacé ni écrasé. Une copie réussie pose le marqueur `jours/AAAA-MM-JJ/.complet` : un
# instantané sans marqueur est PARTIEL (copie interrompue), on ne restaure jamais depuis lui.
# Puis les instantanés de RETENTION_JOURS jours ou plus sont retirés (14 par défaut : les 14 derniers
# jours sont gardés), SAUF le plus récent instantané complet, et rien du tout s'il n'y en a aucun.
#   · Un objet effacé du seau — par la purge du Radar, un effacement de compte, ou par erreur — quitte
#     la sauvegarde au plus 14 jours après, TANT QUE LES PASSAGES RÉUSSISSENT (privacy.ts § 6 :
#     « Sauvegardes : conservées au plus 14 jours »). Après une série d'échecs, le dernier instantané
#     complet reste jusqu'au passage réussi suivant. Il se restaure jusque-là depuis un instantané
#     complet d'avant l'effacement.
#   · Un objet vivant est dans chaque instantané complet, quel que soit son âge.
#   · Une panne ne retire jamais le dernier instantané complet. C'est pourquoi la rotation est ici et
#     pas dans une règle de cycle de vie R2, qui effacerait tout 14 jours après l'arrêt du VPS.
#   · La liste des effacements (`effacements/`, ADR-0044 § B) a EN PLUS une copie jamais tournée,
#     `$CIBLE/effacements/` : identifiant et instant seulement, gardés sans limite, pour qu'une
#     restauration de base rejoue les effacements même si le préfixe a disparu du seau privé.
#   · Un instantané complet qui porte moins de la moitié des objets du précédent complet est alerté
#     (seau source vidé) : la rotation retirerait les bons instantanés en 14 jours.
#   · Sous le verrou de rétention de 7 jours de `vps-sauvegardes` (ADR-0069 § 5), RETENTION_JOURS < 8
#     est refusé par R2 à la rotation, et alerté ; au-delà de 14, privacy.ts § 6 ne tient plus (averti).
#
# Le jeton `takussan-preview-backup` lit le seau privé et écrit dans `vps-sauvegardes` ; il n'a aucun
# droit sur le seau public ni sur l'application. Il ne peut pas créer de seau : `--s3-no-check-bucket`.
#
# Secrets dans /etc/default/sauvegarde-seau-prive (mode 600), jamais dans le dépôt :
#   R2_ACCOUNT_ID, R2_BACKUP_ACCESS_KEY_ID, R2_BACKUP_SECRET_ACCESS_KEY
# Facultatifs, au même endroit : SOURCE, CIBLE, RETENTION_JOURS.
# Tout échec (configuration, copie, marqueur, rotation, retrait) est signalé sur Telegram par les
# secrets de /etc/default/seuils, s'ils existent. Un RETENTION_JOURS invalide est alerté, et le passage
# se fait quand même avec 14 : une faute de frappe n'arrête pas les sauvegardes en silence.
#
# Installé par bootstrap.sh § 8 (unités sauvegarde-seau-prive.service et .timer, qui attendent
# /usr/local/sbin/sauvegarde-seau-prive). Éprouvé par scripts/test-sauvegarde-seau-prive.sh.
#
# Usage :  sauvegarde-seau-prive                         # un passage (ce que fait le timer)
#          sauvegarde-seau-prive --essai                 # ce qui serait copié et retiré, sans rien écrire
#          sauvegarde-seau-prive --retirer-copie-plate   # un passage, puis retire l'ancienne copie unique
#                                                        # (tout ce qui est sous $CIBLE hors de jours/ et
#                                                        # de effacements/) ; une fois, 8 jours au moins
#                                                        # après le premier passage en instantanés
set -uo pipefail

[ -f /etc/default/sauvegarde-seau-prive ] && . /etc/default/sauvegarde-seau-prive
SOURCE=${SOURCE:-takussan-preview-private}
CIBLE=${CIBLE:-vps-sauvegardes/takussan-preview-private}
CIBLE=${CIBLE%/}
IMAGE=${IMAGE:-rclone/rclone:1.71}
RETENTION_JOURS=${RETENTION_JOURS:-14}
# Le jour du passage, en UTC. Ne se pose qu'à l'épreuve de la rotation (le harnais simule les jours).
JOUR=${JOUR:-$(date -u +%F)}

# alerter <message> : sur Telegram, si /etc/default/seuils le permet ; toujours au journal.
alerter() {
  echo "✗ $1" >&2
  [ -f /etc/default/seuils ] && . /etc/default/seuils
  if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ]; then
    curl -fsS -o /dev/null "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
      --data-urlencode "text=✗ $(hostname -s) : la sauvegarde du seau $SOURCE a échoué ($1) — journalctl -u sauvegarde-seau-prive" \
      || echo "⚠ alerte Telegram non envoyée" >&2
  fi
}

# echouer <étape> <code> : l'alerte, puis la sortie avec le code de rclone.
echouer() {
  alerter "$1, code $2"
  exit "$2"
}

for v in R2_ACCOUNT_ID R2_BACKUP_ACCESS_KEY_ID R2_BACKUP_SECRET_ACCESS_KEY; do
  [ -n "${!v:-}" ] || echouer "$v absente de /etc/default/sauvegarde-seau-prive" 2
done
[[ $JOUR =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || echouer "JOUR doit être au format AAAA-MM-JJ (« $JOUR »)" 2
sortie_finale=0
if ! [[ $RETENTION_JOURS =~ ^[1-9][0-9]*$ ]]; then
  alerter "RETENTION_JOURS invalide (« $RETENTION_JOURS ») : passage fait avec 14, corriger /etc/default/sauvegarde-seau-prive"
  RETENTION_JOURS=14
  sortie_finale=2
elif [ "$RETENTION_JOURS" -gt 14 ]; then
  echo "⚠ RETENTION_JOURS=$RETENTION_JOURS : au-delà de 14, privacy.ts § 6 (« au plus 14 jours ») ne tient plus" >&2
fi

essai=()
retirer_plate=0
for argument in "$@"; do
  case $argument in
    --essai) essai=(--dry-run) ;;
    --retirer-copie-plate) retirer_plate=1 ;;
    *) echo "✗ argument inconnu : $argument (--essai, --retirer-copie-plate)" >&2; exit 2 ;;
  esac
done
# `rclone delete` sous la racine d'un seau effacerait tout ce qu'il porte hors de jours/ : dumps,
# configuration de Dokploy, archives. Le retrait exige une CIBLE de la forme <seau>/<préfixe>.
if [ "$retirer_plate" = 1 ] && ! [[ $CIBLE =~ ^[^/]+/.+ ]]; then
  echo "✗ --retirer-copie-plate refusé : CIBLE « $CIBLE » est la racine d'un seau, pas <seau>/<préfixe>" >&2
  exit 2
fi

erreurs=$(mktemp)
trap 'rm -f "$erreurs"' EXIT

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

# Jours depuis le 1970-01-01 d'une date AAAA-MM-JJ, en bash seul : `date -d` n'existe pas hors de GNU.
numero_du_jour() {
  local a m j
  IFS=- read -r a m j <<<"$1"
  a=$((10#$a)); m=$((10#$m)); j=$((10#$j))
  if [ "$m" -le 2 ]; then a=$((a - 1)); m=$((m + 12)); fi
  echo $((365 * a + a / 4 - a / 100 + a / 400 + (153 * (m - 3) + 2) / 5 + j - 719469))
}

# est_complet <jour> : 0 si l'instantané porte son marqueur, 1 sinon, autre code si R2 ne répond pas.
est_complet() {
  local trouve code
  trouve=$(rclone lsf --files-only "r2:$CIBLE/jours/$1/.complet" 2>"$erreurs"); code=$?
  [ $code -eq 3 ] && return 1  # « directory not found »
  [ $code -eq 0 ] || { cat "$erreurs" >&2; return $code; }
  [ "$trouve" = .complet ]
}

# Retire les instantanés datés d'au moins RETENTION_JOURS jours, sauf le plus récent instantané
# complet ; ne retire rien si aucun ne l'est. Tout autre préfixe sous jours/ (un nom qui n'est pas une
# date, une date future) reste en place.
retirer_les_instantanes_echus() {
  local liste code limite aujourdhui nom i dates=() dernier_complet=""
  liste=$(rclone lsf --dirs-only "r2:$CIBLE/jours/" 2>"$erreurs"); code=$?
  # 3 : « directory not found », un --essai avant le tout premier instantané.
  [ $code -eq 3 ] && return 0
  [ $code -eq 0 ] || { cat "$erreurs" >&2; return $code; }
  aujourdhui=$(numero_du_jour "$JOUR")
  limite=$((aujourdhui - RETENTION_JOURS))
  for nom in $liste; do
    nom=${nom%/}
    [[ $nom =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || continue
    [ "$(numero_du_jour "$nom")" -le "$aujourdhui" ] || continue
    dates+=("$nom")
  done
  # rclone liste dans l'ordre des noms, donc des dates : le plus récent complet se cherche à rebours.
  for ((i = ${#dates[@]} - 1; i >= 0; i--)); do
    est_complet "${dates[i]}"; code=$?
    [ $code -eq 0 ] && { dernier_complet=${dates[i]}; break; }
    [ $code -eq 1 ] || return $code
  done
  if [ -z "$dernier_complet" ]; then
    echo "⚠ aucun instantané complet sous $CIBLE/jours/ : rien n'est retiré" >&2
    return 0
  fi
  for nom in ${dates[@]+"${dates[@]}"}; do
    [ "$(numero_du_jour "$nom")" -le "$limite" ] || continue
    if [ "$nom" = "$dernier_complet" ]; then
      echo "instantané $nom gardé malgré son âge : c'est le plus récent instantané complet"
      continue
    fi
    if [ ${#essai[@]} -gt 0 ]; then echo "instantané $nom serait retiré (plus de $RETENTION_JOURS jours)"
    else echo "instantané $nom retiré (plus de $RETENTION_JOURS jours)"; fi
    rclone purge "r2:$CIBLE/jours/$nom" || return $?
  done
}

# nombre_d_objets <jour> : le compte d'objets de l'instantané, marqueur compris.
nombre_d_objets() {
  local json code
  json=$(rclone size --json "r2:$CIBLE/jours/$1" 2>"$erreurs"); code=$?
  [ $code -eq 0 ] || { cat "$erreurs" >&2; return $code; }
  sed -n 's/.*"count":\([0-9]*\).*/\1/p' <<<"$json"
}

# Comme fraicheur-sauvegardes.sh : un instantané complet qui porte moins de la moitié des objets du
# précédent complet (seau source vidé, par erreur ou par un VPS compromis) est alerté. La copie
# « réussit » à vide et la rotation retirerait les bons instantanés en 14 jours : l'alerte laisse ce
# temps pour agir. Une alerte par chute : le lendemain, le précédent complet est déjà le petit.
comparer_au_precedent() {
  local liste code nom i dates=() precedent="" avant apres
  liste=$(rclone lsf --dirs-only "r2:$CIBLE/jours/" 2>"$erreurs"); code=$?
  [ $code -eq 0 ] || { cat "$erreurs" >&2; return $code; }
  for nom in $liste; do
    nom=${nom%/}
    [[ $nom =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || continue
    [ "$(numero_du_jour "$nom")" -lt "$(numero_du_jour "$JOUR")" ] && dates+=("$nom")
  done
  for ((i = ${#dates[@]} - 1; i >= 0; i--)); do
    est_complet "${dates[i]}"; code=$?
    [ $code -eq 0 ] && { precedent=${dates[i]}; break; }
    [ $code -eq 1 ] || return $code
  done
  [ -n "$precedent" ] || return 0
  avant=$(nombre_d_objets "$precedent") || return $?
  apres=$(nombre_d_objets "$JOUR") || return $?
  echo "instantané $JOUR : $apres objets ; précédent complet ($precedent) : $avant"
  if [ $((apres * 2)) -lt "$avant" ]; then
    alerter "instantané $JOUR : $apres objets, moins de la moitié des $avant du $precedent — seau source vidé ? Les bons instantanés partent dans $RETENTION_JOURS jours"
  fi
}

sortie=$(rclone copy "r2:$SOURCE" "r2:$CIBLE/jours/$JOUR" --stats 24h -v 2>&1)
code_copie=$?
# Le bilan seulement : une ligne par objet copié rendrait le journal illisible.
grep -E "^Transferred:|^Checks:|^Errors:|^Elapsed time:|ERROR|nothing to transfer" <<<"$sortie" | tail -6

# Le marqueur ne s'écrit qu'une fois par jour : sous le verrou de 7 jours, le réécrire serait refusé.
if [ $code_copie -eq 0 ]; then
  est_complet "$JOUR"; code=$?
  if [ $code -eq 1 ]; then
    rclone touch "r2:$CIBLE/jours/$JOUR/.complet" || echouer "marqueur de copie complète de $JOUR" $?
  elif [ $code -ne 0 ]; then
    echouer "lecture du marqueur de $JOUR" $code
  fi
  if [ ${#essai[@]} -eq 0 ]; then
    comparer_au_precedent || echouer "comparaison au précédent instantané" $?
  fi
fi

# La liste des effacements, jamais tournée (ADR-0044 § B). 3 : le préfixe n'existe pas encore.
rclone copy "r2:$SOURCE/effacements" "r2:$CIBLE/effacements" 2>"$erreurs"; code_effacements=$?
[ $code_effacements -eq 3 ] && code_effacements=0
[ $code_effacements -eq 0 ] || cat "$erreurs" >&2

# La rotation se fait même après une copie en échec : le dernier instantané complet ne part jamais.
retirer_les_instantanes_echus; code_rotation=$?
[ $code_copie -eq 0 ] || echouer "copie vers $CIBLE/jours/$JOUR, instantané partiel sans marqueur" $code_copie
[ $code_effacements -eq 0 ] || echouer "copie de la liste des effacements" $code_effacements
[ $code_rotation -eq 0 ] || echouer "rotation des instantanés" $code_rotation

if [ "$retirer_plate" = 1 ]; then
  echo "retrait de l'ancienne copie unique : $CIBLE hors de jours/ et de effacements/"
  rclone delete "r2:$CIBLE" --exclude "/jours/**" --exclude "/effacements/**" -v \
    || echouer "retrait de l'ancienne copie" $?
fi
exit $sortie_finale
