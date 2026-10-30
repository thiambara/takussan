#!/usr/bin/env bash
#
# test-sauvegarde-seau-prive.sh — exerce la copie nocturne du seau privé et sa rotation
# (deploy/server/sauvegarde-seau-prive.sh, TCK-2407, ADR-0029 amendé le 2026-10-30).
#
# Même raison d'être que test-release-reindex.sh : ni PHPUnit ni vitest ne lisent du shell, et
# se tromper ici est muet des deux côtés. Trop peu retirer garde pour toujours ce que la purge du
# Radar ou un effacement de compte a effacé (privacy.ts § 6 promet 14 jours) ; trop retirer fait
# perdre un objet encore vivant, ou la liste des effacements (ADR-0044 § B), et on ne le découvre
# qu'au jour de la restauration.
#
# Il joue le VRAI script, jamais une copie, avec un `docker` talon qui exécute les quelques
# commandes rclone du script sur un R2 simulé dans un répertoire jetable (`r2:<seau>/<clé>` →
# `$FAUX_R2/<seau>/<clé>`), et un `curl` talon qui journalise les alertes Telegram. Aucun
# conteneur, aucun réseau. Les jours se simulent par `JOUR`, que le script lit pour éprouver la
# rotation. Le talon écrit sur stderr le NOTICE que rclone 1.71 y écrit à chaque appel.
#
# Les derniers scénarios sont des ABLATIONS : chacune ôte une garde du script et attend au moins
# un rouge. Si l'une passe, le harnais ne teste pas cette garde et le script sort en rouge.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 2

SCRIPT=deploy/server/sauvegarde-seau-prive.sh
[ -f "$SCRIPT" ] || { echo "✗ $SCRIPT introuvable" >&2; exit 2; }
ORIGINAL=$SCRIPT

echecs=0
verifications=0
ablations=0
racine=$(mktemp -d)
trap 'rm -rf "$racine"' EXIT
export FAUX_R2="$racine/r2" JOURNAL="$racine/journal" TELEGRAM="$racine/telegram"
export R2_ACCOUNT_ID=compte-fictif R2_BACKUP_ACCESS_KEY_ID=cle-fictive R2_BACKUP_SECRET_ACCESS_KEY=secret-fictif
export TELEGRAM_BOT_TOKEN=jeton-fictif TELEGRAM_CHAT_ID=42
SOURCE_SEAU="$FAUX_R2/takussan-preview-private"
COPIE="$FAUX_R2/vps-sauvegardes/takussan-preview-private"
LISTE=effacements/2026-10-01/7-20261001T101500Z.json

mkdir -p "$racine/bin"
# `docker run --rm -e … <image> <commande> <arguments>` : seules les commandes du script.
# FAUX_R2_ECHEC=<commande> fait échouer cette commande ; FAUX_R2_ECHEC=copie-partielle interrompt
# la copie d'un instantané après un objet, comme rclone 1.71 (code 8, cible incomplète).
cat > "$racine/bin/docker" <<'EOF'
#!/usr/bin/env bash
echo "$*" >> "$JOURNAL"
# Le NOTICE de rclone 1.71 sur stderr, avec un nom en forme de date échue : mêlé à une liste, il
# deviendrait un instantané à retirer.
echo 'NOTICE: 2026-09-01/ Config file "/config/rclone/rclone.conf" not found - using defaults' >&2
shift
while [ $# -gt 0 ]; do
  case $1 in --rm) shift ;; -e) shift 2 ;; *) break ;; esac
done
shift
commande=$1; shift
essai=0; exclusions=(); args=()
while [ $# -gt 0 ]; do
  case $1 in
    --dry-run) essai=1; shift ;;
    --exclude) exclusions+=("$2"); shift 2 ;;
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
    if [ "${FAUX_R2_ECHEC:-}" = copie-partielle ] && [[ $cible == */jours/* ]]; then
      premier=$(cd "$source" && find . -type f | sort | head -1)
      mkdir -p "$cible/$(dirname "$premier")"; cp "$source/$premier" "$cible/$premier"
      echo "ERROR : Cancelling sync due to fatal error"; exit 8
    fi
    [ "$essai" = 1 ] || { mkdir -p "$cible"; cp -R "$source/." "$cible/"; }
    echo "Transferred:   	    $n / $n, 100%" ;;
  lsf)
    cible=$(chemin "${args[0]}")
    if [ -f "$cible" ]; then basename "$cible"; exit 0; fi
    [ -d "$cible" ] || { echo "ERROR : directory not found" >&2; exit 3; }
    for d in "$cible"/*/; do [ -d "$d" ] && echo "$(basename "$d")/"; done ;;
  touch)
    cible=$(chemin "${args[0]}")
    [ "$essai" = 1 ] || { mkdir -p "$(dirname "$cible")"; : > "$cible"; } ;;
  purge)
    [ "$essai" = 1 ] || rm -rf "$(chemin "${args[0]}")" ;;
  delete)
    dossier=$(chemin "${args[0]}")
    [ "$essai" = 1 ] && exit 0
    find "$dossier" -type f | while read -r f; do
      relatif=/${f#"$dossier"/}; garde=0
      for x in ${exclusions[@]+"${exclusions[@]}"}; do
        [[ $relatif == "${x%\*\*}"* ]] && garde=1
      done
      [ "$garde" = 1 ] || rm -f "$f"
    done ;;
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
  echo '{"user_id":7}' > "$SOURCE_SEAU/$LISTE"
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
objets_du_jour() { find "$COPIE/jours/$1" -type f ! -name .complet 2>/dev/null | wc -l | tr -d ' '; }
present() { [ -f "$1" ] && echo present || echo absent; }
dossier() { [ -d "$1" ] && echo present || echo absent; }
partout() { find "$COPIE" -name "$1" -type f 2>/dev/null | wc -l | tr -d ' '; }
alertes() { wc -l < "$TELEGRAM" | tr -d ' '; }
non_nul() { [ "$1" -ne 0 ] && echo 1 || echo 0; }
jours_d_octobre() { local d; for d in $(seq "$1" "$2"); do printf '2026-10-%02d\n' "$d"; done; }

# ── AC1 : un objet effacé quitte la sauvegarde au plus tard à J+13 ──
scenario_effacement() {
  fabrique
  passer 2026-10-01; local code=$?
  verifier "premier passage : sort en 0" 0 "$code"
  verifier "premier passage : l'instantané porte les trois objets et son marqueur" "3 present" \
    "$(objets_du_jour 2026-10-01) $(present "$COPIE/jours/2026-10-01/.complet")"
  # Effacée par la purge le 2026-10-02, avant le passage de la nuit.
  rm "$SOURCE_SEAU/radar/captures/annonce.png"
  local jour
  for jour in $(jours_d_octobre 2 14); do passer "$jour" || { verifier "passage du $jour" 0 "$?"; return; }; done
  verifier "J+12 : la capture effacée se restaure encore depuis l'instantané du 2026-10-01" present \
    "$(present "$COPIE/jours/2026-10-01/radar/captures/annonce.png")"
  passer 2026-10-15
  verifier "J+13 : la capture effacée n'est plus nulle part dans la sauvegarde" 0 "$(partout annonce.png)"
}

# ── AC2 : un objet vivant et inchangé reste, même md5 ──
scenario_vivant() {
  verifier "14 instantanés gardés, celui du jour compris" 14 "$(instantanes)"
  verifier "le plus ancien gardé est celui du 2026-10-02" present "$(present "$COPIE/jours/2026-10-02/1082/photo.jpg")"
  local jour
  for jour in $(jours_d_octobre 16 30); do passer "$jour"; done
  verifier "AC2 : la photo inchangée depuis 29 jours est dans le dernier instantané, même md5" \
    "$(empreinte "$SOURCE_SEAU/1082/photo.jpg")" "$(empreinte "$COPIE/jours/2026-10-30/1082/photo.jpg" 2>/dev/null)"
  verifier "toujours 14 instantanés après 30 jours" 14 "$(instantanes)"
  verifier "aucune alerte sur des passages réussis" 0 "$(alertes)"
}

# ── I1 : la liste des effacements a une copie jamais tournée (ADR-0044 § B) ──
scenario_liste_des_effacements() {
  fabrique
  passer 2026-10-01
  verifier "la liste des effacements est copiée hors des instantanés" present "$(present "$COPIE/$LISTE")"
  # Le préfixe disparaît du seau privé (VPS compromis, erreur d'exploitation) le 2026-10-02.
  rm -rf "$SOURCE_SEAU/effacements"
  local jour
  for jour in $(jours_d_octobre 2 30); do passer "$jour"; done
  verifier "J+28 : plus aucun instantané ne porte la liste effacée" 0 "$(find "$COPIE/jours" -path '*effacements*' -type f | wc -l | tr -d ' ')"
  verifier "J+28 : la copie jamais tournée la porte toujours" present "$(present "$COPIE/$LISTE")"
  verifier "un préfixe effacements/ absent du seau n'est pas un échec" 0 "$(alertes)"
  mkdir -p "$SOURCE_SEAU/effacements/2026-10-31"; echo '{"user_id":8}' > "$SOURCE_SEAU/effacements/2026-10-31/8-x.json"
  passer 2026-10-31
  verifier "un effacement neuf rejoint la copie jamais tournée" "present present" \
    "$(present "$COPIE/effacements/2026-10-31/8-x.json") $(present "$COPIE/$LISTE")"
}

# ── I2 : une copie interrompue laisse un instantané PARTIEL, sans marqueur ──
scenario_copie_partielle() {
  fabrique
  passer 2026-10-01
  FAUX_R2_ECHEC=copie-partielle passer 2026-10-02; local code=$?
  verifier "copie interrompue : code non nul, une alerte" "1 1" "$(non_nul "$code") $(alertes)"
  verifier "copie interrompue : l'instantané du jour est partiel et sans marqueur" "1 absent" \
    "$(objets_du_jour 2026-10-02) $(present "$COPIE/jours/2026-10-02/.complet")"
  verifier "copie interrompue : l'instantané de la veille garde son marqueur" present \
    "$(present "$COPIE/jours/2026-10-01/.complet")"
  passer 2026-10-02
  verifier "second passage réussi du même jour : l'instantané devient complet" "3 present" \
    "$(objets_du_jour 2026-10-02) $(present "$COPIE/jours/2026-10-02/.complet")"
}

# ── I2 : la rotation ne compte que les jours complets, et ne retire jamais le dernier ──
scenario_dernier_complet() {
  fabrique
  passer 2026-10-01
  local jour
  for jour in $(jours_d_octobre 2 20); do FAUX_R2_ECHEC=copie-partielle passer "$jour"; done
  verifier "dix-neuf copies interrompues : le 2026-10-01, seul complet et échu, reste" "present present" \
    "$(present "$COPIE/jours/2026-10-01/1082/photo.jpg") $(present "$COPIE/jours/2026-10-01/radar/captures/annonce.png")"
  verifier "dix-neuf copies interrompues : les partiels échus sont retirés" "absent present" \
    "$(dossier "$COPIE/jours/2026-10-06") $(dossier "$COPIE/jours/2026-10-07")"
  passer 2026-10-21
  verifier "le premier passage réussi retire l'ancien complet échu" absent \
    "$(present "$COPIE/jours/2026-10-01/1082/photo.jpg")"
}

# ── I3 et AC3 : une configuration fautive est alertée, et n'arrête pas la copie ──
scenario_retention_invalide() {
  local valeur code
  for valeur in 14j 0 abc -3 '14 '; do
    fabrique; RETENTION_JOURS=$valeur passer 2026-10-01; code=$?
    verifier "RETENTION_JOURS=« $valeur » : sort en 2, une alerte, la copie est faite quand même" "2 1 3 present" \
      "$code $(alertes) $(objets_du_jour 2026-10-01) $(present "$COPIE/jours/2026-10-01/.complet")"
  done
  fabrique
  for valeur in $(jours_d_octobre 1 15); do RETENTION_JOURS=14j passer "$valeur"; done
  verifier "RETENTION_JOURS invalide : la rotation se fait avec 14" "14 absent" \
    "$(instantanes) $(present "$COPIE/jours/2026-10-01/1082/photo.jpg")"
}

# ── M3 : --retirer-copie-plate refuse une CIBLE à la racine du seau ──
scenario_cible_racine() {
  fabrique
  mkdir -p "$FAUX_R2/vps-sauvegardes/serveur-postgres"; echo dump > "$FAUX_R2/vps-sauvegardes/serveur-postgres/d.sql.gz"
  CIBLE=vps-sauvegardes passer 2026-10-20 --retirer-copie-plate; local code=$?
  verifier "--retirer-copie-plate, CIBLE à la racine : refusé en 2, le dump reste" "2 present" \
    "$code $(present "$FAUX_R2/vps-sauvegardes/serveur-postgres/d.sql.gz")"
  CIBLE=vps-sauvegardes/ passer 2026-10-20 --retirer-copie-plate; code=$?
  verifier "--retirer-copie-plate, CIBLE « vps-sauvegardes/ » : refusé en 2" 2 "$code"
}

# ── M4 : le stderr de rclone n'entre pas dans la liste des instantanés ──
scenario_stderr() {
  fabrique
  passer 2026-10-01; passer 2026-10-20
  verifier "un nom écrit sur stderr par rclone n'est jamais retiré" 0 "$(grep -c 'purge .*2026-09-01' "$JOURNAL" || true)"
}

scenario_effacement
scenario_vivant
scenario_liste_des_effacements
scenario_copie_partielle
scenario_dernier_complet
scenario_retention_invalide
scenario_cible_racine
scenario_stderr

# ── AC3 : un échec est alerté sur Telegram ──
fabrique; passer 2026-10-01
SOURCE=takussan-seau-inexistant passer 2026-10-20; code=$?
verifier "copie en échec : code non nul, une alerte" "1 1" "$(non_nul "$code") $(alertes)"
verifier "copie en échec : l'alerte nomme le seau et l'échec" 1 \
  "$(grep -c 'takussan-seau-inexistant.*a échoué' "$TELEGRAM" || true)"
verifier "copie en échec : le dernier instantané complet, échu, reste" present \
  "$(present "$COPIE/jours/2026-10-01/1082/photo.jpg")"

fabrique; passer 2026-10-01
FAUX_R2_ECHEC=purge passer 2026-10-20; code=$?
verifier "rotation en échec : code non nul, une alerte, l'instantané du jour écrit" "1 1 present" \
  "$(non_nul "$code") $(alertes) $(present "$COPIE/jours/2026-10-20/.complet")"

fabrique; passer 2026-10-01
FAUX_R2_ECHEC=lsf passer 2026-10-20; code=$?
verifier "lecture R2 en échec : code non nul, une alerte" "1 1" "$(non_nul "$code") $(alertes)"

fabrique; FAUX_R2_ECHEC="touch" passer 2026-10-01; code=$?
verifier "marqueur en échec : code non nul, une alerte" "1 1" "$(non_nul "$code") $(alertes)"

fabrique; R2_ACCOUNT_ID='' passer 2026-10-01; code=$?
verifier "secret absent : sort en 2, une alerte" "2 1" "$code $(alertes)"
fabrique; passer 2026/10/01; code=$?
verifier "JOUR mal formé : sort en 2, une alerte" "2 1" "$code $(alertes)"
fabrique; RETENTION_JOURS=30 passer 2026-10-01; code=$?
verifier "RETENTION_JOURS=30 : accepté, averti au journal, sans alerte" "0 1 0" \
  "$code $(grep -c 'privacy.ts' "$racine/sortie" || true) $(alertes)"
fabrique; passer 2026-10-01 --inconnu; code=$?
verifier "argument inconnu : refusé en 2, rien d'écrit" "2 0" "$code $(partout photo.jpg)"

# ── --essai : rien ne s'écrit, la rotation se dit au conditionnel ──
fabrique; passer 2026-10-01; passer 2026-10-02
avant=$(cd "$FAUX_R2" && find . -type f | sort)
passer 2026-10-20 --essai; code=$?
verifier "--essai : sort en 0" 0 "$code"
verifier "--essai : le R2 n'a pas changé" "$avant" "$(cd "$FAUX_R2" && find . -type f | sort)"
verifier "--essai : la rotation passe --dry-run et se dit au conditionnel" "1 1" \
  "$(grep -c ' purge .*--dry-run' "$JOURNAL" || true) $(grep -c 'serait retiré' "$racine/sortie" || true)"

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

# ── --retirer-copie-plate : l'ancienne copie (TCK-541) part, instantanés et liste restent ──
plate() {
  fabrique
  mkdir -p "$COPIE/1082" "$COPIE/radar/captures" "$COPIE/effacements/2026-09-30"
  echo ancienne > "$COPIE/1082/photo.jpg"; echo ancienne > "$COPIE/radar/captures/purgee.png"
  echo '{"user_id":3}' > "$COPIE/effacements/2026-09-30/3-x.json"
}
scenario_plate() {
  plate; passer 2026-10-20 --retirer-copie-plate --essai
  verifier "--retirer-copie-plate --essai : l'ancienne copie reste" present "$(present "$COPIE/radar/captures/purgee.png")"
  plate; passer 2026-10-20 --retirer-copie-plate; local code=$?
  verifier "--retirer-copie-plate : sort en 0" 0 "$code"
  verifier "--retirer-copie-plate : l'ancienne copie est retirée" "absent absent" \
    "$(present "$COPIE/radar/captures/purgee.png") $(present "$COPIE/1082/photo.jpg")"
  verifier "--retirer-copie-plate : la liste des effacements reste, ancienne comme neuve" "present present" \
    "$(present "$COPIE/effacements/2026-09-30/3-x.json") $(present "$COPIE/$LISTE")"
  verifier "--retirer-copie-plate : l'instantané du jour est complet" "3 present" \
    "$(objets_du_jour 2026-10-20) $(present "$COPIE/jours/2026-10-20/.complet")"
}
scenario_plate
plate; SOURCE=takussan-seau-inexistant passer 2026-10-20 --retirer-copie-plate
verifier "--retirer-copie-plate après une copie en échec : rien n'est retiré, alerte" "present 1" \
  "$(present "$COPIE/radar/captures/purgee.png") $(alertes)"
plate; FAUX_R2_ECHEC=delete passer 2026-10-20 --retirer-copie-plate; code=$?
verifier "--retirer-copie-plate en échec : code non nul, une alerte" "1 1" "$(non_nul "$code") $(alertes)"

# ── ABLATIONS : chaque garde ôtée doit rougir son scénario ──
# ablation <nom> <expression sed> <scénario>
ablation() {
  local nom=$1 expression=$2 scenario=$3 avant=$echecs vus=$verifications
  ablations=$((ablations + 1))
  sed "$expression" "$ORIGINAL" > "$racine/ablation.sh"
  if cmp -s "$ORIGINAL" "$racine/ablation.sh"; then
    echo "✗ ablation « $nom » : le motif ne touche plus $ORIGINAL — le harnais ne sait plus l'ôter"
    echecs=$((avant + 1)); return
  fi
  SCRIPT="$racine/ablation.sh"
  "$scenario" > "$racine/ablation.log" 2>&1
  SCRIPT=$ORIGINAL
  if [ "$echecs" = "$avant" ]; then
    echo "✗ ablation « $nom » : $scenario reste vert sans la garde — le harnais ne la teste pas"
    echecs=$((avant + 1))
  else
    echo "✓ ablation « $nom » : $scenario rougit"
    echecs=$avant
  fi
  verifications=$vus
}
ablation "sans la rotation" 's/^retirer_les_instantanes_echus; code_rotation=\$?$/code_rotation=0/' scenario_effacement
ablation "sans la copie jamais tournée de la liste" 's/^rclone copy "r2:\$SOURCE\/effacements".*$/code_effacements=0/' scenario_liste_des_effacements
ablation "sans le marqueur" 's/^    rclone touch /    true /' scenario_copie_partielle
ablation "sans la garde du dernier complet" 's/\[ "\$nom" = "\$dernier_complet" \]/false/' scenario_dernier_complet
ablation "sans l'alerte d'une rétention invalide" 's/^  alerter "RETENTION_JOURS invalide/  : "RETENTION_JOURS invalide/' scenario_retention_invalide
ablation "sans la garde de la racine du seau" 's/^if \[ "\$retirer_plate" = 1 \] && ! /if false \&\& ! /' scenario_cible_racine
ablation "stderr mêlé à la liste" 's/--dirs-only "r2:\$CIBLE\/jours\/" 2>"\$erreurs"/--dirs-only "r2:$CIBLE\/jours\/" 2>\&1/' scenario_stderr
ablation "le retrait emporte la liste" 's/ --exclude "\/effacements\/\*\*"//' scenario_plate

[ "$echecs" = 0 ] || { echo "✗ $echecs échec(s) sur $verifications vérifications"; exit 1; }
echo "✓ sauvegarde-seau-prive.sh : $verifications vérifications et $ablations ablations"
