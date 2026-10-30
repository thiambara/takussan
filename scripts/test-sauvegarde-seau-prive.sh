#!/usr/bin/env bash
#
# test-sauvegarde-seau-prive.sh — exerce la copie nocturne du seau privé et sa rotation
# (deploy/server/sauvegarde-seau-prive.sh, TCK-2407, ADR-0029 amendé le 2026-10-30).
#
# Même raison d'être que test-release-reindex.sh : ni PHPUnit ni vitest ne lisent du shell, et
# se tromper ici est muet des deux côtés. Trop peu retirer garde pour toujours ce que la purge du
# Radar ou un effacement de compte a effacé (privacy.ts § 6 promet 14 jours) ; trop retirer fait
# perdre un objet encore vivant, et on ne le découvre qu'au jour de la restauration.
#
# Il joue le VRAI script, jamais une copie, avec un `docker` talon qui exécute les quelques
# commandes rclone du script sur un R2 simulé dans un répertoire jetable (`r2:<seau>/<clé>` →
# `$FAUX_R2/<seau>/<clé>`), et un `curl` talon qui journalise les alertes Telegram. Aucun
# conteneur, aucun réseau. Les jours se simulent par `JOUR`, que le script lit pour éprouver la
# rotation.
#
# Le dernier scénario est une ABLATION : il attend un résultat faux. S'il passe, le harnais ne
# teste rien et le script sort en rouge.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 2

SCRIPT=deploy/server/sauvegarde-seau-prive.sh
[ -f "$SCRIPT" ] || { echo "✗ $SCRIPT introuvable" >&2; exit 2; }

echecs=0
verifications=0
racine=$(mktemp -d)
trap 'rm -rf "$racine"' EXIT
export FAUX_R2="$racine/r2" JOURNAL="$racine/journal" TELEGRAM="$racine/telegram"
export R2_ACCOUNT_ID=compte-fictif R2_BACKUP_ACCESS_KEY_ID=cle-fictive R2_BACKUP_SECRET_ACCESS_KEY=secret-fictif
export TELEGRAM_BOT_TOKEN=jeton-fictif TELEGRAM_CHAT_ID=42
SOURCE_SEAU="$FAUX_R2/takussan-preview-private"
COPIE="$FAUX_R2/vps-sauvegardes/takussan-preview-private"

mkdir -p "$racine/bin"
# `docker run --rm -e … <image> <commande> <arguments>` : seules les commandes du script.
cat > "$racine/bin/docker" <<'EOF'
#!/usr/bin/env bash
echo "$*" >> "$JOURNAL"
shift
while [ $# -gt 0 ]; do
  case $1 in --rm) shift ;; -e) shift 2 ;; *) break ;; esac
done
shift
commande=$1; shift
essai=0; exclusion=""; args=()
while [ $# -gt 0 ]; do
  case $1 in
    --dry-run) essai=1; shift ;;
    --exclude) exclusion=$2; shift 2 ;;
    --stats) shift 2 ;;
    -*) shift ;;
    *) args+=("$1"); shift ;;
  esac
done
[ "${FAUX_R2_ECHEC:-}" = "$commande" ] && { echo "ERROR : échec simulé de $commande"; exit 1; }
chemin() { local c=${1#r2:}; echo "$FAUX_R2/${c%/}"; }
case $commande in
  copy)
    source=$(chemin "${args[0]}"); cible=$(chemin "${args[1]}")
    [ -d "$source" ] || { echo "ERROR : directory not found"; exit 3; }
    n=$(find "$source" -type f | wc -l | tr -d ' ')
    [ "$essai" = 1 ] || { mkdir -p "$cible"; cp -R "$source/." "$cible/"; }
    echo "Transferred:   	    $n / $n, 100%" ;;
  lsf)
    dossier=$(chemin "${args[0]}")
    [ -d "$dossier" ] || { echo "ERROR : directory not found" >&2; exit 3; }
    for d in "$dossier"/*/; do [ -d "$d" ] && echo "$(basename "$d")/"; done ;;
  purge)
    dossier=$(chemin "${args[0]}")
    [ "$essai" = 1 ] || rm -rf "$dossier" ;;
  delete)
    dossier=$(chemin "${args[0]}")
    [ "$exclusion" = "/jours/**" ] || { echo "ERROR : exclusion inattendue « $exclusion »"; exit 9; }
    [ "$essai" = 1 ] || find "$dossier" -type f ! -path "$dossier/jours/*" -delete ;;
  *) echo "ERROR : commande rclone inattendue $commande"; exit 9 ;;
esac
EOF
cat > "$racine/bin/curl" <<'EOF'
#!/usr/bin/env bash
echo "$*" >> "$TELEGRAM"
EOF
chmod +x "$racine/bin/docker" "$racine/bin/curl"

empreinte() { if command -v md5sum >/dev/null; then md5sum < "$1" | cut -d' ' -f1; else md5 -q "$1"; fi; }

# Un seau privé : une photo, une capture du Radar, un objet de la liste des effacements.
fabrique() {
  rm -rf "${racine:?}/r2" "$JOURNAL" "$TELEGRAM"
  mkdir -p "$SOURCE_SEAU/1082" "$SOURCE_SEAU/radar/captures" "$SOURCE_SEAU/effacements/2026-10-01"
  head -c 4096 /dev/urandom > "$SOURCE_SEAU/1082/photo.jpg"
  head -c 2048 /dev/urandom > "$SOURCE_SEAU/radar/captures/annonce.png"
  echo '{"user_id":7}' > "$SOURCE_SEAU/effacements/2026-10-01/7-20261001T101500Z.json"
  : > "$TELEGRAM"; : > "$JOURNAL"
}

# passer <jour> [arguments du script…] — les variables d'environnement se posent devant l'appel.
passer() {
  local jour=$1; shift
  JOUR=$jour PATH="$racine/bin:$PATH" bash "$SCRIPT" "$@" > "$racine/sortie" 2>&1
}

verifier() {
  verifications=$((verifications + 1))
  if [ "$2" = "$3" ]; then
    echo "✓ $1"
  else
    echo "✗ $1 — attendu « $2 », obtenu « $3 »"
    sed 's/^/    | /' "$racine/sortie"
    echecs=$((echecs + 1))
  fi
}

instantanes() { find "$COPIE/jours" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l | tr -d ' '; }
present() { [ -f "$1" ] && echo present || echo absent; }
partout() { find "$COPIE" -name "$1" -type f 2>/dev/null | wc -l | tr -d ' '; }
alertes() { wc -l < "$TELEGRAM" | tr -d ' '; }
jours_d_octobre() { local d; for d in $(seq "$1" "$2"); do printf '2026-10-%02d\n' "$d"; done; }

# ── AC1 et AC2 : un objet effacé quitte la sauvegarde, un objet vivant y reste ──
scenario_effacement() {
  fabrique
  passer 2026-10-01; local code=$?
  verifier "premier passage : sort en 0" 0 "$code"
  verifier "premier passage : l'instantané du jour porte les trois objets" 3 \
    "$(find "$COPIE/jours/2026-10-01" -type f | wc -l | tr -d ' ')"
  # Effacée par la purge le 2026-10-02, avant le passage de la nuit.
  rm "$SOURCE_SEAU/radar/captures/annonce.png"
  local jour
  for jour in $(jours_d_octobre 2 14); do passer "$jour" || { verifier "passage du $jour" 0 "$?"; return; }; done
  verifier "J+12 : la capture effacée se restaure encore depuis l'instantané du 2026-10-01" present \
    "$(present "$COPIE/jours/2026-10-01/radar/captures/annonce.png")"
  passer 2026-10-15
  verifier "J+13 : la capture effacée n'est plus nulle part dans la sauvegarde" 0 "$(partout annonce.png)"
}

scenario_effacement
verifier "14 instantanés gardés, celui du jour compris" 14 "$(instantanes)"
verifier "le plus ancien gardé est celui du 2026-10-02" present "$(present "$COPIE/jours/2026-10-02/1082/photo.jpg")"
for jour in $(jours_d_octobre 16 30); do passer "$jour"; done
verifier "AC2 : la photo inchangée depuis 29 jours est dans le dernier instantané, même md5" \
  "$(empreinte "$SOURCE_SEAU/1082/photo.jpg")" "$(empreinte "$COPIE/jours/2026-10-30/1082/photo.jpg" 2>/dev/null)"
verifier "AC2 : la liste des effacements est dans le dernier instantané" present \
  "$(present "$COPIE/jours/2026-10-30/effacements/2026-10-01/7-20261001T101500Z.json")"
verifier "toujours 14 instantanés après 30 jours" 14 "$(instantanes)"
verifier "aucune alerte sur des passages réussis" 0 "$(alertes)"

# ── AC3 : un échec est alerté sur Telegram, et ne retire rien ──
fabrique; passer 2026-10-01
SOURCE=takussan-seau-inexistant passer 2026-10-20; code=$?
verifier "copie en échec : le script ne sort pas en 0" 1 "$([ "$code" -ne 0 ] && echo 1 || echo 0)"
verifier "copie en échec : une alerte Telegram" 1 "$(alertes)"
verifier "copie en échec : l'alerte nomme le seau et l'échec" 1 \
  "$(grep -c 'takussan-seau-inexistant.*a échoué' "$TELEGRAM" || true)"
verifier "copie en échec : aucune rotation tentée" 0 "$(grep -c ' purge ' "$JOURNAL" || true)"
verifier "copie en échec : l'instantané échu du 2026-10-01 reste" present \
  "$(present "$COPIE/jours/2026-10-01/1082/photo.jpg")"

fabrique; passer 2026-10-01
FAUX_R2_ECHEC=purge passer 2026-10-20; code=$?
verifier "rotation en échec : le script ne sort pas en 0" 1 "$([ "$code" -ne 0 ] && echo 1 || echo 0)"
verifier "rotation en échec : une alerte Telegram" 1 "$(alertes)"
verifier "rotation en échec : l'instantané du jour est écrit" present \
  "$(present "$COPIE/jours/2026-10-20/1082/photo.jpg")"

fabrique; passer 2026-10-01
FAUX_R2_ECHEC=lsf passer 2026-10-20; code=$?
verifier "liste des instantanés en échec : le script ne sort pas en 0, alerte" "1 1" \
  "$([ "$code" -ne 0 ] && echo 1 || echo 0) $(alertes)"

# ── --essai : rien ne s'écrit, rien ne se retire ──
fabrique; passer 2026-10-01
avant=$(cd "$FAUX_R2" && find . -type f | sort)
passer 2026-10-20 --essai; code=$?
verifier "--essai : sort en 0" 0 "$code"
verifier "--essai : le R2 n'a pas changé" "$avant" "$(cd "$FAUX_R2" && find . -type f | sort)"
verifier "--essai : la rotation passe --dry-run" 1 "$(grep -c ' purge .*--dry-run' "$JOURNAL" || true)"

# ── seuls les préfixes en forme de date se retirent ──
fabrique
mkdir -p "$COPIE/jours/notes" "$COPIE/jours/2027-01-01" "$COPIE/jours/2026-10-01-1"
echo note > "$COPIE/jours/notes/lisez-moi.txt"; echo futur > "$COPIE/jours/2027-01-01/x"
echo manuel > "$COPIE/jours/2026-10-01-1/x"
passer 2026-10-20
verifier "un préfixe qui commence par une date échue sans en être une n'est pas retiré" present \
  "$(present "$COPIE/jours/2026-10-01-1/x")"
verifier "un préfixe qui n'est pas une date n'est jamais retiré" present "$(present "$COPIE/jours/notes/lisez-moi.txt")"
verifier "un instantané daté dans le futur n'est pas retiré" present "$(present "$COPIE/jours/2027-01-01/x")"

# ── la rétention se règle ──
fabrique
for jour in $(jours_d_octobre 1 5); do RETENTION_JOURS=3 passer "$jour"; done
verifier "RETENTION_JOURS=3 : trois instantanés, du 2026-10-03 au 2026-10-05" "3 present absent" \
  "$(instantanes) $(present "$COPIE/jours/2026-10-03/1082/photo.jpg") $(present "$COPIE/jours/2026-10-02/1082/photo.jpg")"
# Le compte des jours franchit le mois et l'année : 2026-12-28 et après restent, 2026-12-27 part.
fabrique
for jour in 2026-12-20 2026-12-27 2026-12-28 2027-01-01 2027-01-10; do passer "$jour"; done
verifier "rotation au passage d'année : gardés depuis le 2026-12-28, retirés avant" "absent absent present 3" \
  "$(present "$COPIE/jours/2026-12-20/1082/photo.jpg") $(present "$COPIE/jours/2026-12-27/1082/photo.jpg") $(present "$COPIE/jours/2026-12-28/1082/photo.jpg") $(instantanes)"
for valeur in 0 abc -3; do
  fabrique; RETENTION_JOURS=$valeur passer 2026-10-01; code=$?
  verifier "RETENTION_JOURS=$valeur : refusé en 2, rien d'écrit" "2 0" "$code $(partout photo.jpg)"
done
fabrique; passer 2026-10-01 --inconnu; code=$?
verifier "argument inconnu : refusé en 2, rien d'écrit" "2 0" "$code $(partout photo.jpg)"
fabrique; passer 2026/10/01; code=$?
verifier "JOUR mal formé : refusé en 2" 2 "$code"

# ── --retirer-copie-plate : l'ancienne copie (TCK-541) part, les instantanés restent ──
plate() {
  fabrique
  mkdir -p "$COPIE/1082" "$COPIE/radar/captures"
  echo ancienne > "$COPIE/1082/photo.jpg"; echo ancienne > "$COPIE/radar/captures/purgee.png"
}
plate; passer 2026-10-20 --retirer-copie-plate --essai
verifier "--retirer-copie-plate --essai : l'ancienne copie reste" present "$(present "$COPIE/radar/captures/purgee.png")"
plate; passer 2026-10-20 --retirer-copie-plate; code=$?
verifier "--retirer-copie-plate : sort en 0" 0 "$code"
verifier "--retirer-copie-plate : l'ancienne copie est retirée" "absent absent" \
  "$(present "$COPIE/radar/captures/purgee.png") $(present "$COPIE/1082/photo.jpg")"
verifier "--retirer-copie-plate : l'instantané du jour est complet" 3 \
  "$(find "$COPIE/jours/2026-10-20" -type f | wc -l | tr -d ' ')"
plate; SOURCE=takussan-seau-inexistant passer 2026-10-20 --retirer-copie-plate
verifier "--retirer-copie-plate après une copie en échec : rien n'est retiré, alerte" "present 1" \
  "$(present "$COPIE/radar/captures/purgee.png") $(alertes)"
plate; FAUX_R2_ECHEC=delete passer 2026-10-20 --retirer-copie-plate; code=$?
verifier "--retirer-copie-plate en échec : le script ne sort pas en 0, alerte" "1 1" \
  "$([ "$code" -ne 0 ] && echo 1 || echo 0) $(alertes)"

# ── ABLATION : sans la rotation, l'objet effacé DOIT rester dans la sauvegarde ──
sed '/^retirer_les_instantanes_echus /d' "$SCRIPT" > "$racine/sans-rotation.sh"
if cmp -s "$SCRIPT" "$racine/sans-rotation.sh"; then
  echo "✗ ablation : l'appel de la rotation est introuvable dans $SCRIPT — le harnais ne sait plus l'ôter"
  echecs=$((echecs + 1))
else
  SCRIPT="$racine/sans-rotation.sh"
  echecs_avant=$echecs verifications_avant=$verifications
  scenario_effacement > "$racine/ablation" 2>&1
  verifications=$verifications_avant
  if [ "$(partout annonce.png)" = 0 ]; then
    echo "✗ ablation : sans la rotation, la capture effacée a quand même disparu — le harnais ne teste rien"
    echecs=$((echecs_avant + 1))
  else
    echo "✓ ablation : sans la rotation, la capture effacée reste dans la sauvegarde — le harnais voit la différence"
    echecs=$echecs_avant
  fi
fi

[ "$echecs" = 0 ] || { echo "✗ $echecs échec(s) sur $verifications vérifications"; exit 1; }
echo "✓ sauvegarde-seau-prive.sh : $verifications vérifications et une ablation"
