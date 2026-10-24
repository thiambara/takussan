#!/usr/bin/env bash
# Orchestration des agents des pistes — ADR-0066 § 4 (le délégué : amendement du 2026-10-18).
#
# L'agent PROPOSE (des commits dans son arbre, un titre et un corps de PR dans son dossier de
# sortie) ; ce script VÉRIFIE (périmètre du rôle, gardes) puis PUBLIE (push, PR vers `pre-dev`).
# Rien de ce que l'agent écrit ne quitte le poste sans être passé par `verifier`.
#
# Usage, depuis le dépôt :
#   scripts/agents/pistes.sh installer [--sans-etiquettes]   # outils figés, réglages, étiquettes GitHub
#   scripts/agents/pistes.sh planifier [X Y Z [W [F [S]]]]  # launchd : explorateur toutes les X min,
#                                                   # mesureur Y, implémenteur Z, délégué W, fusionneur F,
#                                                   # superviseur S ; sans argument 30 20 5 20 10 120, W omis :
#                                                   # 20, F omis : 10, S omis : 120 (porteur, 2026-10-19 et
#                                                   # 2026-10-21) ; 1 min au moins (2026-10-21)
#   scripts/agents/pistes.sh deplanifier
# Puis, depuis n'importe où (copie figée) :
#   ~/.takussan-agents/outils/pistes.sh lancer <rôle>   # un passage, à la main ou par launchd
#   ~/.takussan-agents/outils/pistes.sh lancer implementeur <k>   # l'instance k sur
#       # INSTANCES_IMPLEMENTEUR (config.env, 1 par défaut) ; sans <k>, l'instance 1
#   ~/.takussan-agents/outils/pistes.sh lancer <rôle> --a-blanc
#       # un passage complet SANS RIEN PUBLIER (ni push, ni PR, ni fusion) ; avec
#       # PISTES_BASE_REF=<ref> il part d'une autre base que origin/pre-dev
#   ~/.takussan-agents/outils/pistes.sh fusionner   # fusionne les PR vertes (launchd, toutes les 10 min)
#   ~/.takussan-agents/outils/pistes.sh archiver [--a-blanc]   # archive les entrées closes depuis 24 h,
#       # sans modèle, par une PR vers pre-dev ; le superviseur le fait une fois par jour (2026-10-24)
#   ~/.takussan-agents/outils/pistes.sh etat
#   ~/.takussan-agents/outils/pistes.sh releve [jours]   # ce que le délégué a tranché (7 jours par défaut)
#   ~/.takussan-agents/outils/pistes.sh pause | reprendre
#   ~/.takussan-agents/outils/pistes.sh action <verbe> …   # les actions du superviseur (ou du porteur) :
#       reposer <job> | balayer | purger | pause <rôle|tous> <raison> | reprendre <rôle|tous>
#       | relancer-ci <run-id> | intermittent <run-id> <suite> | fermer <pr> <raison> | notifier <texte>
#
# Compatible bash 3.2 : launchd lance /bin/bash, celui de macOS.
set -euo pipefail
# launchd passe LANG=fr_FR.UTF-8 : sysctl écrirait alors la charge « 2,87 », qu'awk compare comme
# du TEXTE (« 2,87 » > « 12 »). Mesuré le 2026-10-15 : tous les passages s'arrêtaient pour « charge ».
export LC_NUMERIC=C

BASE="${PISTES_BASE:-$HOME/.takussan-agents}"
ROLES="explorateur mesureur implementeur delegue"
LAUNCHD=com.takussan.agents
# L'archive des entrées closes du fichier de pistes (amendement d'ADR-0066 du 2026-10-24).
ARCHIVE_PISTES=docs/plans/pistes-archive

die() {
  DETAIL="$*"
  printf '✗ %s\n' "$*" >&2
  exit 1
}
info() { printf '%s  %s\n' "$(date '+%H:%M:%S')" "$*"; }

valider_role() {
  case "${1:-}" in
    explorateur | mesureur | implementeur | delegue | superviseur) ;;
    *) die "rôle inconnu « ${1:-} » (explorateur, mesureur, implementeur, delegue, superviseur)" ;;
  esac
}

charger_config() {
  [ -f "$BASE/machine.env" ] || die "non installé : lancer « scripts/agents/pistes.sh installer » depuis le dépôt"
  # shellcheck source=/dev/null
  . "$BASE/machine.env"
  # shellcheck source=/dev/null
  . "$BASE/config.env"
  # Le délégué est venu après la création de config.env, qui n'est jamais réécrit : ses réglages
  # ont un défaut ici, qu'une ligne de config.env remplace.
  BUDGET_DELEGUE="${BUDGET_DELEGUE:-5}"
  DUREE_DELEGUE="${DUREE_DELEGUE:-1800}"
  BUDGET_SUPERVISEUR="${BUDGET_SUPERVISEUR:-10}"
  DUREE_SUPERVISEUR="${DUREE_SUPERVISEUR:-3600}"
  # Implémenteurs en parallèle (amendement d'ADR-0066 du 2026-10-21, bis).
  INSTANCES_IMPLEMENTEUR="${INSTANCES_IMPLEMENTEUR:-1}"
  case "$INSTANCES_IMPLEMENTEUR" in '' | *[!0-9]* | 0) die "INSTANCES_IMPLEMENTEUR=« $INSTANCES_IMPLEMENTEUR » : un entier, 1 au moins" ;; esac
}

# Les noms de job, de verrou, d'arbre et de sortie d'un rôle : « implementeur » pour l'instance 1,
# « implementeur-<k> » pour les suivantes. L'instance 1 garde ainsi les noms d'avant l'amendement.
noms_du_role() {
  local k=2
  printf '%s\n' "$1"
  if [ "$1" = implementeur ]; then
    while [ "$k" -le "$INSTANCES_IMPLEMENTEUR" ]; do
      printf '%s\n' "$1-$k"
      k=$((k + 1))
    done
  fi
}

# L'instance qui possède une branche d'agent : le suffixe « -<k> » après l'horodatage, 1 sans
# suffixe. Une instance au-delà du nombre courant (le porteur l'a réduit) revient à l'instance 1 :
# ses PR ne restent pas sans personne pour les réparer.
instance_de_branche() {
  local k
  k="$(printf '%s' "$1" | sed -nE 's#^agents/[a-z]+/[0-9]{8}-[0-9]{6}-([0-9]+)$#\1#p')"
  if [ -z "$k" ] || [ "$k" -gt "$INSTANCES_IMPLEMENTEUR" ]; then k=1; fi
  printf '%s' "$k"
}

# La part d'une instance : les pistes dont le numéro d'angle (P<nn>.…) vaut k−1 modulo N. Un angle
# entier va à une seule instance, et sa famille avec lui. Lit des lignes dont la Réf ouvre la ligne.
part_de_l_instance() {
  awk -v n="$INSTANCES_IMPLEMENTEUR" -v k="$INSTANCE" '
    match($0, /^P[0-9]+\./) { if ((substr($0, 2, RLENGTH - 2) + 0) % n == k - 1) print }'
}

# Valeur d'une variable de config propre au rôle : par_role BUDGET mesureur → $BUDGET_MESUREUR.
par_role() {
  local nom
  nom="$1_$(printf '%s' "$2" | tr '[:lower:]' '[:upper:]')"
  printf '%s' "${!nom:-}"
}

# ─── installer ────────────────────────────────────────────────────────────────────────────────

installer() {
  local ici depot outil claude_bin depot_gh sha
  ici="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  git -C "$ici" rev-parse --git-dir > /dev/null 2>&1 || die "« installer » se lance depuis le dépôt (scripts/agents/pistes.sh)"
  # L'arbre principal, même si l'installation se lance depuis un worktree.
  depot="$(dirname "$(git -C "$ici" rev-parse --path-format=absolute --git-common-dir)")"

  for outil in git gh node npm php composer perl shasum; do
    command -v "$outil" > /dev/null || die "outil absent : $outil"
  done
  claude_bin="${CLAUDE_BIN:-$HOME/.local/bin/claude}"
  [ -x "$claude_bin" ] || die "claude introuvable en $claude_bin (préciser CLAUDE_BIN=…)"
  gh auth status > /dev/null 2>&1 || die "gh n'est pas authentifié"
  depot_gh="$(cd "$depot" && gh repo view --json nameWithOwner --jq .nameWithOwner)"
  sha="$(git -C "$ici" rev-parse --short HEAD)"
  if [ -n "$(git -C "$ici" status --porcelain -- .)" ]; then sha="$sha+modifs"; fi

  mkdir -p "$BASE/outils" "$BASE/arbres" "$BASE/sorties" "$BASE/verrous" "$BASE/etat" "$BASE/journaux" "$BASE/env"

  # Les agents travaillent dans LEUR clone, hors de ~/Documents, jamais dans des worktrees de l'arbre
  # principal. Mesuré le 2026-10-15 au premier passage lancé par launchd : macOS refuse à un job
  # launchd la lecture de ~/Documents (« Operation not permitted » sur takussan-api/.env), alors
  # que le même script lancé d'un terminal passe. Un clone propre isole aussi les références des
  # agents de celles du porteur.
  if [ ! -d "$BASE/depot/.git" ]; then
    git clone --quiet --no-checkout "https://github.com/$depot_gh.git" "$BASE/depot"
  fi
  git -C "$BASE/depot" config user.name "$(git -C "$depot" config user.name)"
  git -C "$BASE/depot" config user.email "$(git -C "$depot" config user.email)"
  git -C "$BASE/depot" fetch --quiet origin --prune
  # Les .env se copient ICI, depuis le terminal qui y a accès : launchd ne les lirait pas.
  # Un .env modifié dans l'arbre principal n'atteint les agents qu'à la réinstallation.
  if [ -f "$depot/takussan-api/.env" ]; then cp "$depot/takussan-api/.env" "$BASE/env/takussan-api.env"; fi
  if [ -f "$depot/takussan-web/.env.local" ]; then cp "$depot/takussan-web/.env.local" "$BASE/env/takussan-web.env.local"; fi
  chmod 600 "$BASE"/env/* 2> /dev/null || true
  # Copies FIGÉES : un agent ne desserre pas, par son arbre ou par une PR fusionnée, la garde
  # qui le borne. Seule une réinstallation par le porteur les change.
  # Remplacement ATOMIQUE (copie à côté, puis `mv`) : bash lit un script au fil de son exécution,
  # et un `cp` sur place faisait lire au passage en cours la suite du NOUVEAU fichier. Relevé le
  # 2026-10-19 : « line 858: branche: unbound variable » dans le fusionneur qui tournait pendant
  # la réinstallation de 22 h 02.
  cp "$ici/garde.mjs" "$BASE/outils/garde.mjs.nouveau"
  mv -f "$BASE/outils/garde.mjs.nouveau" "$BASE/outils/garde.mjs"
  cp "$ici/pistes.sh" "$BASE/outils/pistes.sh.nouveau"
  chmod +x "$BASE/outils/pistes.sh.nouveau"
  mv -f "$BASE/outils/pistes.sh.nouveau" "$BASE/outils/pistes.sh"

  node -e '
    const [garde, node, sortie] = process.argv.slice(1);
    const hook = { type: "command", command: `"${node}" "${garde}"` };
    const reglages = { hooks: { PreToolUse: [{ matcher: "Bash|Edit|Write|MultiEdit|NotebookEdit|WebFetch", hooks: [hook] }] } };
    require("fs").writeFileSync(sortie, JSON.stringify(reglages, null, 2) + "\n");
  ' "$BASE/outils/garde.mjs" "$(command -v node)" "$BASE/outils/reglages.json"

  {
    printf '# Écrit par « pistes.sh installer » le %s — ne pas éditer, réinstaller.\n' "$(date '+%Y-%m-%d %H:%M')"
    printf 'DEPOT=%q\nCLONE=%q\nCLAUDE_BIN=%q\nGH_REPO=%q\nPATH_LANCEMENT=%q\nOUTILS_SHA=%q\n' \
      "$depot" "$BASE/depot" "$claude_bin" "$depot_gh" "$PATH" "$sha"
  } > "$BASE/machine.env"

  if [ ! -f "$BASE/config.env" ]; then
    cat > "$BASE/config.env" << 'CONFIG'
# Réglages des agents des pistes (ADR-0066). Créé une fois par « installer », jamais réécrit.
# FUSION : « manuelle » = le porteur fusionne chaque PR vers pre-dev (Q1-b, défaut) ;
#          « auto »     = le script fusionne une PR d'agent quand sa CI est verte (Q1-a).
FUSION=manuelle
# Plafond de dépense par passage (USD), transmis à claude --max-budget-usd.
BUDGET_EXPLORATEUR=8
BUDGET_MESUREUR=8
BUDGET_IMPLEMENTEUR=45
BUDGET_DELEGUE=5
# Durée maximale d'un passage (secondes) ; à l'échéance, tout le groupe de processus est tué.
DUREE_EXPLORATEUR=2700
DUREE_MESUREUR=2700
DUREE_IMPLEMENTEUR=9000
DUREE_DELEGUE=1800
# Au-delà de cette charge (moyenne à 5 min), aucun passage ne démarre. Vide = 1,5 × nombre de cœurs.
CHARGE_MAX=
# Réparations successives d'une même PR avant abandon (le porteur prend la main).
REPARATIONS_MAX=3
# PR ouvertes à la fois par rôle ; vide = 3 pour l'implémenteur, 1 pour les autres.
PR_MAX_EXPLORATEUR=
PR_MAX_MESUREUR=
PR_MAX_IMPLEMENTEUR=
# Implémenteurs en parallèle, qui se partagent les angles et les numéros de ticket ; vide = 1.
INSTANCES_IMPLEMENTEUR=
# Modèle ; vide = celui du compte.
MODELE=
CONFIG
  fi

  if [ "${1:-}" != --sans-etiquettes ]; then (
    cd "$depot"
    gh label create agent:explorateur --color 1d76db --description "PR de l'agent explorateur (ADR-0066)" --force > /dev/null
    gh label create agent:mesureur --color 5319e7 --description "PR de l'agent mesureur (ADR-0066)" --force > /dev/null
    gh label create agent:implementeur --color b60205 --description "PR de l'agent implémenteur (ADR-0066)" --force > /dev/null
    gh label create agent:delegue --color fbca04 --description "PR du délégué du porteur (ADR-0066, amendement du 2026-10-18)" --force > /dev/null
    gh label create agent:superviseur --color 0e8a16 --description "PR du superviseur des agents (ADR-0066, amendement du 2026-10-21)" --force > /dev/null
    gh label create agent:archiveur --color 006b75 --description "Archivage des pistes closes, sans modèle (ADR-0066, amendement du 2026-10-24)" --force > /dev/null
    gh label create agents:synchro --color c5def5 --description "Synchronisation dev → pre-dev (ADR-0066)" --force > /dev/null
  ); fi

  info "installé dans $BASE (outils $sha, dépôt $depot_gh)"
  if ! git -C "$depot" ls-remote --exit-code --heads origin pre-dev > /dev/null 2>&1; then
    info "⚠ la branche pre-dev n'existe pas sur origin : aucun passage ne peut aboutir avant sa création"
  fi
}

# ─── planification launchd ────────────────────────────────────────────────────────────────────

# Pose (ou remplace) un job launchd : poser_job <nom> <secondes> <argument de pistes.sh>…
poser_job() {
  local nom="$1" secondes="$2" uid plist args="" a
  shift 2
  uid="$(id -u)"
  for a in "$@"; do args="$args<string>$a</string>"; done
  plist="$HOME/Library/LaunchAgents/$LAUNCHD.$nom.plist"
  cat > "$plist.nouveau" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LAUNCHD}.${nom}</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string><string>${BASE}/outils/pistes.sh</string>${args}</array>
  <key>StartInterval</key><integer>${secondes}</integer>
  <key>RunAtLoad</key><false/>
  <key>ProcessType</key><string>Background</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>${PATH_LANCEMENT}</string>
    <key>HOME</key><string>${HOME}</string>
    <key>LANG</key><string>fr_FR.UTF-8</string>
  </dict>
  <key>StandardOutPath</key><string>${BASE}/journaux/launchd-${nom}.log</string>
  <key>StandardErrorPath</key><string>${BASE}/journaux/launchd-${nom}.log</string>
</dict>
</plist>
PLIST
  # Un job chargé dont le plist ne change pas n'est pas rechargé : décharger un job tue son passage
  # en cours, et `planifier` se relance pour ajouter un job sans toucher aux autres. Comparés après
  # normalisation : PlistBuddy et un éditeur réécrivent la mise en forme sans changer le sens.
  if [ -f "$plist" ] && launchctl print "gui/$uid/$LAUNCHD.$nom" > /dev/null 2>&1 \
    && cmp -s <(plutil -convert xml1 -o - "$plist" 2> /dev/null) <(plutil -convert xml1 -o - "$plist.nouveau"); then
    rm -f "$plist.nouveau"
    return 0
  fi
  mv -f "$plist.nouveau" "$plist"
  charger_job "$nom" "$plist"
}

# Décharge puis recharge un job. Relevé le 2026-10-21 à 20:51 : `bootstrap` juste après le
# `bootout` d'un job dont le passage tournait encore a rendu « Bootstrap failed: 5: Input/output
# error », et `planifier` s'est arrêté là : quatre jobs gardaient leur ancienne cadence. On attend
# que launchd ait déchargé le job, puis on réessaie.
charger_job() {
  local nom="$1" plist="$2" uid essai
  uid="$(id -u)"
  launchctl bootout "gui/$uid/$LAUNCHD.$nom" 2> /dev/null || true
  for essai in 1 2 3 4 5 6 7 8 9 10; do
    launchctl print "gui/$uid/$LAUNCHD.$nom" > /dev/null 2>&1 || break
    sleep 1
  done
  for essai in 1 2 3; do
    if launchctl bootstrap "gui/$uid" "$plist" 2> /dev/null; then return 0; fi
    sleep 3
  done
  die "launchd refuse de charger $nom ($plist)"
}

planifier() {
  charger_config
  [ $# -eq 0 ] || { [ $# -ge 3 ] && [ $# -le 6 ]; } || die "usage : planifier [<x> <y> <z> [w [f [s]]]]  (minutes : explorateur, mesureur, implementeur, délégué, fusionneur, superviseur ; défaut 30 20 5 20 10 120)"
  local minutes role
  # Cadences par défaut, posées par le porteur le 2026-10-19 (ADR-0066, Q2).
  [ $# -gt 0 ] || set -- 30 20 5
  [ $# -ge 4 ] || set -- "$@" 20
  [ $# -ge 5 ] || set -- "$@" 10
  # Le superviseur toutes les 2 h (porteur, 2026-10-21).
  [ $# -ge 6 ] || set -- "$@" 120
  # 1 minute au moins (le porteur, 2026-10-21) : un passage à la fois par rôle (verrou), et launchd ne
  # relance pas un job qui tourne encore ; une cadence d'une minute veut dire « repartir dès la fin ».
  local nom k plist uid
  uid="$(id -u)"
  for role in $ROLES fusionneur superviseur; do
    minutes="$1"
    shift
    case "$minutes" in '' | *[!0-9]*) die "« $minutes » n'est pas un nombre de minutes" ;; esac
    [ "$minutes" -ge 1 ] || die "$role : 1 minute au moins entre deux passages"
    if [ "$role" = fusionneur ]; then
      poser_job fusionneur $((minutes * 60)) fusionner
      info "fusionneur : toutes les $minutes min (sans modèle)"
    elif [ "$role" = implementeur ]; then
      k=1
      for nom in $(noms_du_role implementeur); do
        if [ "$k" -eq 1 ]; then poser_job "$nom" $((minutes * 60)) lancer implementeur; else poser_job "$nom" $((minutes * 60)) lancer implementeur "$k"; fi
        info "$nom : toutes les $minutes min"
        k=$((k + 1))
      done
    else
      poser_job "$role" $((minutes * 60)) lancer "$role"
      info "$role : toutes les $minutes min"
    fi
  done
  # Les instances au-delà du nombre courant : le porteur l'a réduit, leurs jobs partent.
  for plist in "$HOME/Library/LaunchAgents/$LAUNCHD".implementeur-*.plist; do
    [ -f "$plist" ] || continue
    nom="$(basename "$plist" .plist)"
    nom="${nom#"$LAUNCHD".}"
    k="${nom#implementeur-}"
    case "$k" in '' | *[!0-9]*) continue ;; esac
    [ "$k" -gt "$INSTANCES_IMPLEMENTEUR" ] || continue
    launchctl bootout "gui/$uid/$LAUNCHD.$nom" 2> /dev/null || true
    rm -f "$plist"
    info "$nom : déplanifié (INSTANCES_IMPLEMENTEUR=$INSTANCES_IMPLEMENTEUR)"
  done
}

deplanifier() {
  local job uid plist
  uid="$(id -u)"
  for job in $ROLES fusionneur superviseur; do
    launchctl bootout "gui/$uid/$LAUNCHD.$job" 2> /dev/null || true
    rm -f "$HOME/Library/LaunchAgents/$LAUNCHD.$job.plist"
  done
  for plist in "$HOME/Library/LaunchAgents/$LAUNCHD".implementeur-*.plist; do
    [ -f "$plist" ] || continue
    job="$(basename "$plist" .plist)"
    launchctl bootout "gui/$uid/$job" 2> /dev/null || true
    rm -f "$plist"
  done
  info "déplanifié (les passages en cours finissent)"
}

# ─── fusionneur ───────────────────────────────────────────────────────────────────────────────

# Essai de fusion : la PR est fusionnée avec la base COURANTE dans un arbre à part, et les gardes du
# dépôt tournent sur le résultat. Une PR verte l'est sur SA base ; deux PR vertes fusionnées coup sur
# coup peuvent se combiner en un arbre rouge sans le moindre conflit textuel. Mesuré le 2026-10-16 :
# #473 puis #467, chacune verte, ont laissé `pre-dev` avec un INDEX.md périmé, et toutes les PR
# suivantes ont hérité du rouge (ADR-0067). Rend 0 si la fusion est sûre.
# Un refus d'une PR d'agent la met à jour avec la base (`gh pr update-branch`) : sa CI rejoue alors
# l'arbre fusionné, rougit, et l'agent la répare comme toute PR rouge. La PR de synchronisation,
# dont la tête est `dev`, n'est jamais mise à jour : le refus est journalisé, le porteur tranche.
# Rend 1 pour un arbre fusionné rouge (le rapport dit pourquoi), 2 quand l'essai n'a pas pu se
# faire : réseau, arbre d'essai, ou branche déjà supprimée par une fusion. Relevé le 2026-10-19 :
# l'implémenteur essayait des PR que le fusionneur venait de fusionner, journalisait trois faux
# refus « conflit » et appelait `update-branch` sur des PR fermées.
essai_de_fusion() {
  local num="$1" tete="$2" arbre="$BASE/arbres/essai-${NOM:-fusionneur}" rapport cle g h echecs=0
  rapport="$BASE/sorties/essais/$num.txt"
  mkdir -p "$BASE/sorties/essais"
  avec_verrou_git git -C "$CLONE" fetch origin --prune --quiet || return 2
  git -C "$CLONE" rev-parse --verify --quiet "origin/$tete" > /dev/null || return 2
  cle="$(git -C "$CLONE" rev-parse "$BASE_REF") $(git -C "$CLONE" rev-parse "origin/$tete")"
  # Même base, même tête qu'un refus déjà journalisé : rien n'a changé, on ne le redit pas.
  [ "$cle" != "$(cat "$BASE/etat/essai-$num" 2> /dev/null || true)" ] || return 1
  if [ ! -d "$arbre" ]; then
    avec_verrou_git git -C "$CLONE" worktree add --quiet --detach "$arbre" "$BASE_REF" || return 2
  fi
  # Appelée derrière `||` ou `&&`, cette fonction tourne SANS `set -e` : chaque étape se vérifie.
  git -C "$arbre" merge --abort > /dev/null 2>&1 || true
  git -C "$arbre" reset --quiet --hard || return 2
  git -C "$arbre" clean -fdq || return 2
  git -C "$arbre" checkout --quiet --detach "$BASE_REF" || return 2
  {
    echo "essai de #$num ($tete) sur $BASE_REF — $(date '+%Y-%m-%d %H:%M:%S')"
    if ! git -C "$arbre" merge --no-edit --quiet "origin/$tete" 2>&1; then
      echo "✗ conflit de fusion"
      echecs=1
    else
      # `check-front-routes` (TCK-998) lit `php artisan route:list` et ÉCHOUE sans `vendor/` : sans
      # cette installation, toutes les PR étaient refusées (relevé le 2026-10-19, #724 à #734).
      # `vendor/` est ignoré par git, donc épargné par le `clean -fdq` ci-dessus : il ne se réinstalle
      # que si le `composer.lock` de l'arbre fusionné change.
      h="$(shasum "$arbre/takussan-api/composer.lock" | cut -c1-40)"
      if [ ! -f "$arbre/takussan-api/vendor/autoload.php" ] || [ "$h" != "$(cat "$BASE/etat/composer-essai-${NOM:-fusionneur}" 2> /dev/null || true)" ]; then
        if (cd "$arbre/takussan-api" && composer install --no-interaction --no-progress --quiet) > /dev/null 2>&1; then
          printf '%s' "$h" > "$BASE/etat/composer-essai-${NOM:-fusionneur}"
        else
          echo "✗ composer install dans l'arbre d'essai"
          echecs=$((echecs + 1))
        fi
      fi
      for g in "$arbre"/scripts/check-*.mjs; do
        (cd "$arbre" && node "$g") > /dev/null 2>&1 || {
          echo "✗ $(basename "$g")"
          echecs=$((echecs + 1))
        }
      done
      (cd "$arbre" && node docs/backlog/gen-index.mjs --check && node docs/backlog/check-backlog.mjs) > /dev/null 2>&1 || {
        echo "✗ gen-index --check ou check-backlog"
        echecs=$((echecs + 1))
      }
    fi
  } > "$rapport" 2>&1
  git -C "$arbre" merge --abort > /dev/null 2>&1 || true
  [ "$echecs" -gt 0 ] || return 0

  printf '%s' "$cle" > "$BASE/etat/essai-$num"
  info "#$num : fusion refusée, l'arbre fusionné avec $BASE_REF est rouge ($rapport)"
  if [ "$tete" != dev ]; then
    GH_REPO="$GH_REPO" gh pr update-branch "$num" > /dev/null 2>&1 || true
  fi
  printf '%s\t%s\t-\trefuse\t%s\t-\t-\t-\t%s\n' "$(date '+%Y-%m-%d %H:%M')" "${NOM:-fusionneur}" "$num" \
    "essai de fusion rouge : $(grep '^✗' "$rapport" | tr '\n' ' ')" >> "$BASE/journal.tsv"
  return 1
}

# Fusionne dans pre-dev, DÈS que leur CI est verte et sans conflit, les PR des agents et la PR de
# synchronisation dev → pre-dev. Aucun modèle : rien n'y décide, tout y est vérifié, et un passage
# ne coûte rien. Sans lui, une PR verte attendait le passage suivant de SON agent (jusqu'à 3 h pour
# l'explorateur), qui restait bloqué entre-temps (une PR ouverte par rôle). ADR-0066 § 4.
fusionner() {
  charger_config
  if [ -e "$BASE/PAUSE" ] || [ -e "$BASE/PAUSE-fusionneur" ] || [ "$FUSION" != auto ]; then return 0; fi
  local verrou="$BASE/verrous/fusionneur" pid
  if ! mkdir "$verrou" 2> /dev/null; then
    pid="$(cat "$verrou/pid" 2> /dev/null || true)"
    if [ -n "$pid" ] && kill -0 "$pid" 2> /dev/null; then return 0; fi
    rm -rf "$verrou"
    mkdir "$verrou"
  fi
  printf '%s' "$$" > "$verrou/pid"
  # Chemin littéral : le trap court à la sortie du SCRIPT, quand la locale `verrou` n'existe plus.
  trap 'rm -rf "$BASE/verrous/fusionneur"' EXIT

  # Le tri des rouges (amendement du 2026-10-22) : les relances finies se jugent, et pre-dev rouge
  # suspend les fusions, sauf celles qui peuvent le réparer (superviseur, synchronisation de dev).
  mkdir -p "$BASE/etat"
  noter_intermittents
  evaluer_pre_dev
  # Une PR rouge depuis plus de 2 h fait partir le superviseur (amendement du 2026-10-24).
  signaler_rouges_anciens

  local lignes num tete mergeable etiquettes
  lignes="$(GH_REPO="$GH_REPO" gh pr list --base pre-dev --state open --json number,headRefName,mergeable,labels \
    --jq '.[] | "\(.number)\t\(.headRefName)\t\(.mergeable)\t\([.labels[].name] | join(","))"')"
  [ -n "$lignes" ] || return 0
  printf '%s\n' "$lignes" | while IFS=$'\t' read -r num tete mergeable etiquettes; do
    # Seules les PR que le script a ouvertes : une PR du porteur vers pre-dev n'est jamais touchée.
    case "$tete" in
      agents/*) case ",$etiquettes," in *,agent:*) ;; *) continue ;; esac ;;
      dev) case ",$etiquettes," in *,agents:synchro,*) ;; *) continue ;; esac ;;
      *) continue ;;
    esac
    if [ -e "$BASE/etat/pre-dev-rouge" ] && [ "$tete" != dev ] && [ "${tete#agents/superviseur/}" = "$tete" ]; then continue; fi
    # Seul CONFLICTING écarte une PR. GitHub rend UNKNOWN après chaque fusion dans pre-dev et ne
    # recalcule que si on lui redemande la PR : « le tour suivant tranchera » était faux. Relevé le
    # 2026-10-20 : #782 verte à 08:37, sautée par les tours de 09:00 et 09:10, fusionnée à 09:14
    # dès qu'une lecture l'a fait recalculer. La lecture ci-dessous le déclenche, pour que la fusion
    # qui suit l'essai soit acceptée ; l'essai de fusion juge le conflit sur place.
    if [ "$mergeable" = UNKNOWN ]; then
      mergeable="$(GH_REPO="$GH_REPO" gh pr view "$num" --json mergeable --jq .mergeable 2> /dev/null || echo UNKNOWN)"
    fi
    [ "$mergeable" != CONFLICTING ] || continue
    [ "$(etat_ci "$num")" = vert ] || continue
    if [ "${tete#agents/superviseur/}" != "$tete" ] && ! sans_outils_des_agents "$tete"; then
      info "#$num (superviseur) touche les outils des agents : elle attend le porteur"
      continue
    fi
    essai_de_fusion "$num" "$tete" || continue
    if [ "$tete" = dev ]; then
      # Jamais --delete-branch ici : la tête de cette PR est dev.
      GH_REPO="$GH_REPO" gh pr merge "$num" --merge > /dev/null || continue
    else
      GH_REPO="$GH_REPO" gh pr merge "$num" --merge --delete-branch > /dev/null || continue
    fi
    info "#$num fusionnée dans pre-dev ($tete)"
    printf '%s\tfusionneur\t-\tfusionne\t%s\t-\t-\t-\t%s\n' "$(date '+%Y-%m-%d %H:%M')" "$num" "$tete" >> "$BASE/journal.tsv"
    relancer_suivant "$tete"
  done
}

# Les chemins qui bornent les agents (ceux de la garde, `BORNES` de garde.mjs). Une PR du superviseur
# qui les touche n'est jamais fusionnée par la chaîne : le porteur la lit, la fusionne, puis
# réinstalle (amendement d'ADR-0066 du 2026-10-21, « le superviseur »).
OUTILS_DES_AGENTS='^(\.agent/|\.claude/|scripts/agents/|scripts/check-pistes\.mjs$|\.github/|docs/adr/0066-)'

# Rend 0 si la branche ne touche aucun de ces chemins. Le doute (lecture impossible) rend 1.
sans_outils_des_agents() {
  local fichiers
  avec_verrou_git git -C "$CLONE" fetch origin --prune --quiet || return 1
  fichiers="$(git -C "$CLONE" diff --name-only "$BASE_REF...origin/$1")" || return 1
  ! printf '%s\n' "$fichiers" | grep -qE "$OUTILS_DES_AGENTS"
}

# Le travail d'un rôle fusionné, l'agent qui le reçoit part tout de suite au lieu d'attendre sa
# cadence (amendement d'ADR-0066 du 2026-10-18) : l'explorateur écrit des « à mesurer », le
# mesureur des « autonome » et des « à valider », le délégué des « validé (délégué) ». Les cadences
# restent, en filet. `kickstart` sans `-k` ne touche pas un passage en cours ; un job non planifié
# ne part pas, sans erreur.
relancer_suivant() {
  local suivants suivant
  case "$1" in
    agents/explorateur/*) suivants=mesureur ;;
    agents/mesureur/*) suivants="$(noms_du_role implementeur) delegue" ;;
    agents/delegue/*) suivants="$(noms_du_role implementeur)" ;;
    *) return 0 ;;
  esac
  for suivant in $suivants; do
    if launchctl kickstart "gui/$(id -u)/$LAUNCHD.$suivant" > /dev/null 2>&1; then
      info "$suivant relancé"
      printf '%s\tfusionneur\t-\trelance\t-\t-\t-\t-\t%s\n' "$(date '+%Y-%m-%d %H:%M')" "$suivant" >> "$BASE/journal.tsv"
    fi
  done
}

# Le fichier de pistes sur une référence : le fichier vivant, et son archive quand elle y existe.
# La garde lit les deux : sans l'archive, une Réf citée qui y est rangée manquerait, et la garde
# sortirait en 1, ce que `travail_disponible` prend pour un doute qui lance le modèle.
chemins_des_pistes() {
  printf '%s\n' docs/plans/2026-10-15-pistes-d-amelioration.md
  if git -C "$CLONE" cat-file -e "$1:$ARCHIVE_PISTES" 2> /dev/null; then printf '%s\n' "$ARCHIVE_PISTES"; fi
}

# Le relevé du porteur : ce que le délégué a tranché ou recommandé, lu sur origin/pre-dev. Une
# validation déléguée se reprend d'une ligne (« - Statut : » rendu au porteur) ; un désaveu
# (« - Mesure (…, humain) : désaveu de la délégation V7 — … ») lui retire toute la catégorie.
releve() {
  charger_config
  local jours="${1:-7}" depuis racine
  case "$jours" in '' | *[!0-9]*) die "« $jours » n'est pas un nombre de jours" ;; esac
  depuis="$(date -v-"${jours}"d '+%Y-%m-%d')"
  racine="$(mktemp -d)"
  git -C "$CLONE" fetch --quiet origin pre-dev
  # shellcheck disable=SC2046 # des chemins sans espace, un par ligne
  git -C "$CLONE" archive origin/pre-dev scripts/check-pistes.mjs $(chemins_des_pistes origin/pre-dev) \
    docs/backlog/tickets | tar -x -C "$racine"
  racine="$(cd "$racine" && pwd -P)"
  echo "Délégations depuis le $depuis (origin/pre-dev) :"
  CHECK_PISTES_RACINE="$racine" node "$racine/scripts/check-pistes.mjs" --delegations \
    | awk -F '\t' -v d="$depuis" 'NF == 1 || $1 >= d'
  rm -rf "$racine"
}

# ─── archiveur (amendement d'ADR-0066 du 2026-10-24, « l'archive des pistes closes ») ─────────
# Mesuré le 2026-10-24 : le fichier de pistes pesait 4,9 Mo, dont 4,4 Mo d'entrées closes, et
# 2 205 commits l'avaient touché en 7 jours ; chaque essai de fusion, conflit ou réparation
# portait sur le fichier entier. L'archiveur en sort chaque jour les entrées closes depuis 24 h,
# sans modèle : `scripts/agents/archiver-pistes.mjs` les déplace, `check-pistes --role archiveur`
# (version de BASE_REF) rejoue le déplacement depuis la base et le compare, puis une PR
# `agents/archiveur/*` (étiquette `agent:archiveur`) part vers pre-dev, que le fusionneur prend
# comme les autres. Rend 0 quand l'archivage du jour est fait (publié, rien à archiver, ou une PR
# d'archivage encore ouverte), 1 sur un échec, 2 quand il n'a pas eu lieu (pause, déjà en cours).
# Appelée derrière `||`, elle tourne sans `set -e` : chaque étape se vérifie.

archiver_pistes() {
  local verrou="$BASE/verrous/archiveur" pid statut=0
  if ! mkdir "$verrou" 2> /dev/null; then
    pid="$(cat "$verrou/pid" 2> /dev/null || true)"
    if [ -n "$pid" ] && kill -0 "$pid" 2> /dev/null; then
      info "archiveur : un archivage tourne déjà (pid $pid)"
      return 2
    fi
    rm -rf "$verrou"
    mkdir "$verrou" || return 1
  fi
  printf '%s' "$$" > "$verrou/pid"
  archiver_sous_verrou || statut=$?
  rm -rf "$verrou"
  return "$statut"
}

archiver_sous_verrou() {
  # `ROLE` local : `preparer_arbre` ne nettoie que les branches locales `agents/$ROLE/`.
  local ROLE=archiveur arbre="$BASE/arbres/archiveur" horo dossier branche lignes num tete etat_fusion resume fige corps
  if [ -e "$BASE/PAUSE" ] || [ -e "$BASE/PAUSE-archiveur" ]; then
    info "archiveur : en pause"
    return 2
  fi
  avec_verrou_git git -C "$CLONE" fetch origin --prune --quiet || return 1
  # Une PR d'archivage à la fois : la suivante déplacerait les mêmes lignes. Une PR en conflit ou
  # rouge se ferme et se regénère depuis la base du jour : le déplacement est déterministe, il n'y a
  # rien à réparer à la main.
  lignes="$(GH_REPO="$GH_REPO" gh pr list --base pre-dev --state open --label agent:archiveur \
    --json number,headRefName,mergeable --jq '.[] | "\(.number)\t\(.headRefName)\t\(.mergeable)"')" || return 1
  if [ -n "$lignes" ]; then
    IFS=$'\t' read -r num tete etat_fusion <<< "$(printf '%s\n' "$lignes" | head -n 1)"
    if [ "$etat_fusion" != CONFLICTING ] && ! en_conflit "$tete" && [ "$(etat_ci "$num")" != rouge ]; then
      info "archiveur : #$num encore ouverte, rien de plus aujourd'hui"
      return 0
    fi
    GH_REPO="$GH_REPO" gh pr close "$num" --delete-branch --comment \
      "Fermée par \`pistes.sh archiver\` : en conflit ou rouge sur \`$BASE_REF\`. L'archivage, déterministe, est regénéré depuis la base du jour." \
      > /dev/null || return 1
    info "archiveur : #$num fermée (conflit ou rouge), regénérée depuis $BASE_REF"
  fi

  horo="$(date +%Y%m%d-%H%M%S)"
  dossier="$BASE/sorties/archiveur/$horo"
  branche="agents/archiveur/$horo"
  mkdir -p "$dossier" || return 1
  avec_verrou_git preparer_arbre "$arbre" "$branche" "$BASE_REF" "$dossier" || return 1
  if [ "$(git -C "$arbre" rev-parse HEAD)" != "$(git -C "$CLONE" rev-parse "$BASE_REF")" ]; then
    info "✗ archiveur : l'arbre $arbre n'est pas sur $BASE_REF"
    return 1
  fi
  if ! (cd "$arbre" && node scripts/agents/archiver-pistes.mjs) > "$dossier/archivage.txt" 2>&1; then
    info "✗ archiveur : $(tail -n 1 "$dossier/archivage.txt")"
    return 1
  fi
  resume="$(head -n 1 "$dossier/archivage.txt")"
  if [ -z "$(git -C "$arbre" status --porcelain)" ]; then
    info "archiveur : $resume"
    return 0
  fi
  git -C "$arbre" add -A -- docs/plans/2026-10-15-pistes-d-amelioration.md "$ARCHIVE_PISTES" || return 1
  git -C "$arbre" commit --quiet -m "chore(pistes): archiver les entrées closes depuis 24 h" -m "$resume" \
    -m "Déplacement pur, sans modèle, par scripts/agents/archiver-pistes.mjs (ADR-0066, amendement du 2026-10-24)." || return 1
  # Comme pour un rôle : la garde jouée est celle de BASE_REF, et elle refuse tout ce qui n'est pas
  # le déplacement, rejoué depuis la base, des entrées closes parties du fichier vivant.
  fige="$dossier/check-pistes.mjs"
  git -C "$CLONE" show "$BASE_REF:scripts/check-pistes.mjs" > "$fige" || return 1
  if ! (cd "$arbre" && CHECK_PISTES_RACINE="$arbre" node "$fige" --role archiveur --base "$BASE_REF") > "$dossier/verif-pistes.txt" 2>&1; then
    info "✗ archiveur : check-pistes --role archiveur ($dossier/verif-pistes.txt)"
    return 1
  fi
  if [ "$A_BLANC" -eq 1 ]; then
    info "archiveur : à blanc, aurait poussé $branche — $resume"
    return 0
  fi
  corps="$dossier/pr-corps.md"
  {
    printf '%s\n\n' "Archivage quotidien du fichier de pistes, sans modèle (ADR-0066, amendement du 2026-10-24, « l'archive des pistes closes »)."
    printf '```\n%s\n```\n\n' "$(cat "$dossier/archivage.txt")"
    printf '%s\n' "Les entrées closes sur \`$BASE_REF\` depuis 24 h au moins, et que rien n'a touchées depuis, passent telles quelles dans \`$ARCHIVE_PISTES/\`. Vérifié avant push par \`scripts/agents/pistes.sh\` (outils $OUTILS_SHA) : \`check-pistes --role archiveur --base $BASE_REF\` vert, le déplacement rejoué depuis la base est identique au caractère près."
    printf '\n%s\n' '🤖 Generated with [Claude Code](https://claude.com/claude-code)'
  } > "$corps"
  git -C "$arbre" push --quiet -u origin "HEAD:refs/heads/$branche" || return 1
  num="$(GH_REPO="$GH_REPO" gh pr create --base pre-dev --head "$branche" --label agent:archiveur \
    --title "[archiveur] $resume" --body-file "$corps" | sed 's#.*/##')" || return 1
  info "archiveur : PR #$num ouverte — $resume"
  printf '%s\tarchiveur\t-\tpublie\t%s\t-\t-\t-\t%s\n' "$(date '+%Y-%m-%d %H:%M')" "$num" "$resume" >> "$BASE/journal.tsv"
}

# Une fois par jour, au premier passage du superviseur de la journée : il passe toutes les 2 h, et
# l'archivage n'a pas d'heure. Le marqueur `etat/archive-AAAA-MM-JJ` ne se pose que sur un archivage
# fait ; un échec ou une pause se retentent au passage suivant.
archiver_du_jour() {
  local marque statut=0
  marque="$BASE/etat/archive-$(date +%Y-%m-%d)"
  [ ! -e "$marque" ] || return 0
  archiver_pistes || statut=$?
  if [ "$statut" -eq 0 ]; then
    touch "$marque"
    find "$BASE/etat" -maxdepth 1 -name 'archive-*' -mtime +7 -delete 2> /dev/null || true
  fi
  [ "$statut" -ne 1 ]
}

# ─── état ─────────────────────────────────────────────────────────────────────────────────────

# La cadence que launchd applique, lue chez lui : « 10 min » écrit en dur est resté faux après le
# passage du fusionneur à 2 min (relevé le 2026-10-21).
planification() {
  local iv
  iv="$(launchctl print "gui/$(id -u)/$LAUNCHD.$1" 2> /dev/null | sed -n 's/.*run interval = \([0-9]*\) seconds.*/\1/p' | head -n 1)"
  if [ -n "$iv" ]; then echo "  planifié (launchd, toutes les $((iv / 60)) min)"; else echo "  non planifié"; fi
}

etat() {
  charger_config
  local role uid
  uid="$(id -u)"
  if [ -e "$BASE/PAUSE" ]; then echo "⏸  PAUSE active ($BASE/PAUSE) $(head -c 160 "$BASE/PAUSE")"; fi
  for role in "$BASE"/PAUSE-*; do
    if [ -e "$role" ]; then echo "⏸  ${role##*/} : $(head -c 160 "$role")"; fi
  done
  echo "outils $OUTILS_SHA · fusion $FUSION · dépôt $GH_REPO"
  if [ -e "$BASE/etat/pre-dev-rouge" ]; then echo "🔴 pre-dev rouge depuis $(tr '\t' ' ' < "$BASE/etat/pre-dev-rouge") — fusions suspendues"; fi
  if [ -n "$(intermittents_a_traiter)" ]; then echo "⚠  tests intermittents non traités : $(intermittents_a_traiter | cut -f2 | sort -u | wc -l | tr -d ' ') run(s) ($BASE/etat/intermittents.tsv)"; fi
  for role in $(for r in $ROLES; do noms_du_role "$r"; done); do
    printf '\n%s\n' "── $role"
    planification "$role"
    if [ -d "$BASE/verrous/$role" ]; then echo "  passage en cours (pid $(cat "$BASE/verrous/$role/pid" 2> /dev/null || echo '?'))"; fi
    if [ -f "$BASE/journal.tsv" ]; then
      awk -F '\t' -v r="$role" '$2 == r' "$BASE/journal.tsv" | tail -3 | sed 's/^/  /'
    fi
  done
  printf '\n%s\n' "── fusionneur"
  planification fusionneur
  if [ -f "$BASE/journal.tsv" ]; then awk -F '\t' '$2 == "fusionneur"' "$BASE/journal.tsv" | tail -3 | sed 's/^/  /'; fi
  printf '\n%s\n' "── superviseur"
  planification superviseur
  if [ -d "$BASE/verrous/superviseur" ]; then echo "  passage en cours (pid $(cat "$BASE/verrous/superviseur/pid" 2> /dev/null || echo '?'))"; fi
  if [ -f "$BASE/journal.tsv" ]; then awk -F '\t' '$2 == "superviseur"' "$BASE/journal.tsv" | tail -3 | sed 's/^/  /'; fi
  printf '\n%s\n' "── archiveur (une fois par jour, au premier passage du superviseur)"
  if [ -f "$BASE/journal.tsv" ]; then awk -F '\t' '$2 == "archiveur"' "$BASE/journal.tsv" | tail -3 | sed 's/^/  /'; fi
  printf '\n%s\n' "── PR ouvertes vers pre-dev"
  GH_REPO="$GH_REPO" gh pr list --base pre-dev --state open --json number,title,labels \
    --jq '.[] | "  #\(.number)  \(.title)"'
}

# ─── un passage ───────────────────────────────────────────────────────────────────────────────

ROLE=""
# Le nom du passage : le rôle, ou « implementeur-<k> » pour l'instance k > 1 (verrou, arbre, sortie,
# journal). Le rôle, lui, reste celui des étiquettes, de la garde et de la définition d'agent.
NOM=""
INSTANCE=1
A_BLANC=0
BASE_REF="${PISTES_BASE_REF:-origin/pre-dev}"
MODE=""
RESULTAT="erreur"
PR=""
DETAIL=""
DEBUT=0
COUT=""
TOURS=""

journaliser() {
  local duree=$(($(date +%s) - DEBUT))
  # Une sortie par `set -e` (réseau, commande en échec) n'a pas de détail : le journal le dit.
  if [ "$RESULTAT" = erreur ] && [ -z "$DETAIL" ]; then DETAIL="sortie inattendue (commande en échec ou réseau) : voir passage.log"; fi
  printf '%s\t%s\t%s\t%s\t%s\t%ss\t%s\t%s\t%s\n' "$(date '+%Y-%m-%d %H:%M')" "$NOM" "${MODE:--}" \
    "$RESULTAT" "${PR:--}" "$duree" "${COUT:--}" "${TOURS:--}" "$DETAIL" >> "$BASE/journal.tsv"
}

fin() {
  RESULTAT="$1"
  DETAIL="$2"
  info "fin : $RESULTAT — $DETAIL"
  exit 0
}

# Verrou global court autour des opérations sur le dépôt partagé (fetch, worktree, branches) :
# trois passages simultanés se disputeraient les verrous de références de git.
# Réentrant : `recuperer`, appelé sous le verrou, fusionne la synchronisation après un essai de
# fusion qui le reprend ; sans cela il s'attendrait lui-même dix minutes, puis mourrait.
VERROU_GIT_TENU=0
avec_verrou_git() {
  if [ "$VERROU_GIT_TENU" -eq 1 ]; then
    "$@" || return $?
    return 0
  fi
  local essais=0
  until mkdir "$BASE/verrous/git" 2> /dev/null; do
    essais=$((essais + 1))
    [ "$essais" -lt 120 ] || die "verrou git tenu depuis 10 min ($BASE/verrous/git)"
    sleep 5
  done
  local statut=0
  VERROU_GIT_TENU=1
  "$@" || statut=$?
  VERROU_GIT_TENU=0
  rmdir "$BASE/verrous/git"
  return "$statut"
}

# État CI d'une PR : vert, rouge, attente. Un job en échec l'emporte sur ceux qui tournent encore :
# son verdict ne changera plus. Relevé le 2026-10-19 : #747, Gardes documentaires rouges à 23:35,
# Web CI encore en cours, classée « en attente » ; le passage de 23:40 a pris une piste neuve de
# 32 minutes et la réparation n'est partie qu'à 00:17.
etat_ci() {
  local buckets
  buckets="$(GH_REPO="$GH_REPO" gh pr checks "$1" --json bucket --jq '[.[].bucket] | join(" ")' 2> /dev/null || true)"
  case " $buckets " in
    "  ") echo attente ;;
    *" fail "*) echo rouge ;;
    *" pending "*) echo attente ;;
    *" cancel "*) echo rouge ;;
    *) echo vert ;;
  esac
}

# ─── le tri des rouges (amendement d'ADR-0066 du 2026-10-22) ──────────────────────────────────
# Relevé le 2026-10-22 : 57 réparations en un jour, dont une bonne part sur un rouge qui n'était
# pas celui de la PR réparée. De 09:32 à 12:40, pre-dev était rouge (deux PR vertes chacune, rouges
# ensemble) et toutes les PR rougissaient sur les deux mêmes tests, que chaque implémenteur
# « réparait » ; deux tests étaient intermittents ; trois PR ont été abandonnées après trois
# réparations, et deux réparations ont récrit un correctif déjà fusionné. Un rouge se trie donc,
# sans modèle, avant de coûter une réparation : base périmée, puis relance unique, puis rouge commun.

journaliser_tri() {
  printf '%s\t%s\t-\t%s\t%s\t-\t-\t-\t%s\n' "$(date '+%Y-%m-%d %H:%M')" "${NOM:-fusionneur}" "$1" "$2" \
    "$(printf '%s' "$3" | tr '\t\n' '  ' | head -c 300)" >> "$BASE/journal.tsv"
}

# Les tests rouges d'un run, une ligne « <job>\t<test> » chacun : PHPUnit (`N) Tests\…::test`, dans
# la seule liste des échecs et des erreurs), Vitest (`FAIL <fichier>`, et l'erreur non gérée qui
# rougit un run aux tests tous verts), les `✗` des gardes. Un job rouge sans rien de tout cela rend
# « (sans test nommé) ». Lu une fois par tentative : le journal d'un run fini ne change plus.
tests_rouges() {
  local run="$1" tentative="${2:-}" cache
  if [ -z "$tentative" ]; then
    tentative="$(GH_REPO="$GH_REPO" gh run view "$run" --json attempt --jq .attempt 2> /dev/null || echo 0)"
  fi
  mkdir -p "$BASE/etat/tests"
  cache="$BASE/etat/tests/$run-$tentative"
  if [ ! -s "$cache" ]; then
    GH_REPO="$GH_REPO" gh run view "$run" --log-failed 2> /dev/null | perl -ne '
      s/\e\[[0-9;]*m//g;
      chomp;
      my ($job, undef, $l) = split /\t/, $_, 3;
      next unless defined $l;
      $l =~ s/^\S+ //;
      $vu{$job} //= 0;
      my $t;
      if ($l =~ /^There (?:was|were) \d+ (\w+)/) { $php{$job} = ($1 =~ /^(?:failure|error)s?$/); next }
      if ($php{$job} && $l =~ /^\d+\) (Tests\\\S+)/) { $t = $1 }
      elsif ($l =~ /^\s*FAIL\s+(\S+\.(?:test|spec)\.[cm]?[jt]sx?)(?:\s|$)/) { $t = $1 }
      elsif ($l =~ /(?:Uncaught Exception|Unhandled Rejection)/) { $nongere{$job} = 1; next }
      elsif ($nongere{$job} && $l =~ /^(\w*Error: .{0,80})/) { $t = "erreur non gérée : $1"; $nongere{$job} = 0 }
      elsif ($l =~ /^(✗ .{0,200})/) { $t = $1 }
      next unless defined $t;
      $vu{$job}++;
      print "$job\t$t\n" unless $deja{"$job\t$t"}++;
      END { for (sort keys %vu) { print "$_\t(sans test nommé)\n" unless $vu{$_} } }' > "$cache.tmp" || true
    mv "$cache.tmp" "$cache"
  fi
  cat "$cache"
}

# Le fichier d'un test nommé par tests_rouges, vide quand il ne se déduit pas (une garde, une erreur
# non gérée) : une PR qui touche ce fichier a peut-être causé le rouge, il n'est pas « commun ».
fichier_du_test() {
  case "$1" in
    'Tests\'*) printf 'takussan-api/tests/%s.php' "$(printf '%s' "${1%%::*}" | sed -e 's#^Tests\\##' -e 's#\\#/#g')" ;;
    src/*) printf 'takussan-web/%s' "$1" ;;
  esac
}

# Fusionne la base dans la branche d'une PR, sans arbre ni modèle (`merge-tree`, `commit-tree`), et
# la pousse : la CI repart sur la base du jour. Un re-run ne suffit pas, il rejoue la ref de fusion
# calculée à son déclenchement. Rend 1 sur un conflit, qui revient à la réparation.
rafraichir() {
  local num="$1" tete="$2" arbre_fusionne commit
  arbre_fusionne="$(git -C "$CLONE" merge-tree --write-tree "origin/$tete" "$BASE_REF")" || return 1
  commit="$(git -C "$CLONE" commit-tree "$arbre_fusionne" -p "origin/$tete" -p "$BASE_REF" \
    -m "Merge $BASE_REF dans $tete" \
    -m "Rafraîchie sans modèle par pistes.sh : le run rouge précédait la dernière fusion dans $BASE_REF.")" || return 1
  git -C "$CLONE" push --quiet origin "$commit:refs/heads/$tete" || return 1
  printf '%s' "$commit" > "$BASE/etat/rafraichi-$num"
}

# Fait partir le superviseur hors de sa cadence, une fois par cause (sa clé) : un rouge commun ou
# un pre-dev rouge se répare une seule fois, sur pre-dev, au lieu d'une fois par PR.
appeler_superviseur() {
  local cle="$1" raison="$2"
  [ ! -e "$BASE/etat/appel-superviseur-$cle" ] || return 0
  touch "$BASE/etat/appel-superviseur-$cle"
  if launchctl kickstart "gui/$(id -u)/$LAUNCHD.superviseur" > /dev/null 2>&1; then
    info "superviseur appelé : $raison"
    journaliser_tri appel-superviseur - "$raison"
  fi
}

# ─── le rouge d'une branche, toutes têtes confondues (amendement d'ADR-0066 du 2026-10-24) ─────
# Relevé le 2026-10-24 sur #1469, rouge de 14:34 à 16:30 sans que rien ne vise son test : les checks
# de la tête courante ne disent rien quand la CI de cette tête est en cours (après un rafraîchissement)
# ou que la PR est en conflit. La réparation de 15:21 a reçu « Checks rouges : » vide, le run rouge
# ayant fini 14 s avant ; le superviseur de 14:55 a vu la CI « en cours ». Le rouge se lit donc sur
# les runs CONCLUS de la branche, quelle que soit leur tête.

# Au-delà, une PR rouge est confiée au superviseur, qui part hors de sa cadence.
ROUGE_ANCIEN_S="${ROUGE_ANCIEN_S:-7200}"

# Pour chaque workflow de la branche, son dernier verdict conclu (un run en cours, annulé ou sauté ne
# dit rien) ; s'il est rouge, une ligne « <début>|<run>|<tentative>|<workflow>|<sha>|<fin> ». <run> est
# ce dernier run rouge et <fin> l'heure où il a conclu ; <début> est l'heure où a conclu le PREMIER
# run rouge de la série (les runs rouges qui se suivent sans vert entre eux), en secondes. Un
# rafraîchissement ne remet donc pas l'âge à zéro, un vert si. Sort en 1 si gh ne répond pas.
rouge_conclu() {
  GH_REPO="$GH_REPO" gh run list --branch "$1" --limit 50 \
    --json databaseId,workflowName,status,conclusion,attempt,headSha,createdAt,updatedAt \
    --jq '[.[] | select(.status == "completed" and (.conclusion == "success" or .conclusion == "failure"
          or .conclusion == "timed_out" or .conclusion == "startup_failure"))]
      | group_by(.workflowName)[] | sort_by(.createdAt) | reverse
      | select(.[0].conclusion != "success")
      | . as $g
      | (([range(0; $g | length) | select($g[.].conclusion == "success")] | .[0]) // ($g | length)) as $n
      | $g[0:$n] as $s
      | "\($s[-1].updatedAt | fromdateiso8601)|\($s[0].databaseId)|\($s[0].attempt)|\($s[0].workflowName)|\($s[0].headSha)|\($s[0].updatedAt | fromdateiso8601)"' \
    2> /dev/null
}

# Une heure de `date +%s` : « HH:MM » le jour même, « JJ/MM HH:MM » sinon.
heure_de() {
  if [ "$(date -r "$1" +%F)" = "$(date +%F)" ]; then date -r "$1" '+%H:%M'; else date -r "$1" '+%d/%m %H:%M'; fi
}

# Les lignes de rouge_conclu, lisibles par un agent : le run, puis ses tests rouges.
rouge_conclu_lisible() {
  local debut run tentative wf sha fin
  while IFS='|' read -r debut run tentative wf sha fin; do
    [ -n "$run" ] || continue
    printf -- '- %s, run %s (tête %s), conclu rouge à %s, rouge depuis %s — tests :\n' \
      "$wf" "$run" "${sha:0:8}" "$(heure_de "$fin")" "$(heure_de "$debut")"
    # `sed -n` lit tout : un `head` fermerait le tube, et pipefail ferait échouer le message entier.
    tests_rouges "$run" "$tentative" | tr '\t' ' ' | sed -n '1,20s/^/    · /p'
  done <<< "$1"
  return 0
}

# Une PR « en réparation » : sa tête porte, après la tête <rouge> du dernier run rouge conclu, au
# moins un commit qui n'est PAS une fusion (une réparation poussée, par un agent ou en session), et
# la CI de cette tête n'a pas conclu. Sans cela, le superviseur réparerait en même temps que
# l'implémenteur, sur un correctif déjà en vol. Un rafraîchissement (une fusion seule) ne protège
# PAS : c'est le masquage que l'amendement du 2026-10-24 corrige. Les commits se lisent sur la
# première ligne parentale : ceux de pre-dev qu'une fusion apporte ne comptent pas. Une tête sans
# aucun run (un commit qui ne déclenche rien) n'est pas protégée : elle le serait pour toujours.
# Relevé : #1469, rouge sur f38288b5 (une fusion), réparée par 450e334cb poussé à 16:30.
en_reparation() {
  local rouge="$1" tete="$2" sha
  sha="$(git -C "$CLONE" rev-parse --verify --quiet "origin/$tete")" || return 1
  [ -n "$(git -C "$CLONE" rev-list --first-parent --no-merges "$rouge..$sha" 2> /dev/null)" ] || return 1
  [ "$(GH_REPO="$GH_REPO" gh run list --commit "$sha" --json status \
    --jq 'any(.[]; .status != "completed")' 2> /dev/null)" = true ]
}

# Le passage vivant, autre que celui-ci, qui répare la PR <n°> : son nom sur la sortie, et 0 ; 1 si
# aucun. Chaque passage écrit dans `verrous/<nom>/reparation` les PR qu'il peut réparer : celle de
# son mode réparation, ou, pour le superviseur, la liste de ses rouges anciens. Le fichier part avec
# le verrou. Relevé le 2026-10-24 sur #1491 : l'implémenteur la réparait depuis 19:29, sans rien
# avoir poussé, quand le fusionneur a appelé le superviseur à 19:35 ; le superviseur a poussé sa
# réparation à 19:38, et le commit de l'implémenteur, le même correctif, est resté sans objet.
# `en_reparation` ne voit qu'une réparation POUSSÉE ; celle-ci voit une réparation en cours.
reparation_vivante() {
  local f nom pid
  for f in "$BASE"/verrous/*/reparation; do
    [ -f "$f" ] || continue
    nom="$(basename "$(dirname "$f")")"
    [ "$nom" != "${NOM:-}" ] || continue
    pid="$(cat "$BASE/verrous/$nom/pid" 2> /dev/null || true)"
    { [ -n "$pid" ] && kill -0 "$pid" 2> /dev/null; } || continue
    if grep -qxF "$1" "$f"; then
      printf '%s' "$nom"
      return 0
    fi
  done
  return 1
}

# Les PR d'agents vers pre-dev rouges depuis ROUGE_ANCIEN_S au moins, l'âge compté depuis le premier
# run rouge conclu de la branche, hors PR en réparation (en_reparation, jugée sur la tête du dernier
# run rouge conclu) et hors PR qu'un autre passage répare en ce moment (reparation_vivante) : une
# ligne « <n°>|<branche>|<début> » chacune.
rouges_anciens() {
  local maintenant lignes num tete conclus debut dernier
  maintenant="$(date +%s)"
  lignes="$(GH_REPO="$GH_REPO" gh pr list --base pre-dev --state open --json number,headRefName \
    --jq '.[] | select(.headRefName | startswith("agents/")) | "\(.number)|\(.headRefName)"' 2> /dev/null)" || return 0
  avec_verrou_git git -C "$CLONE" fetch origin --prune --quiet || true
  while IFS='|' read -r num tete; do
    [ -n "$num" ] || continue
    if reparation_vivante "$num" > /dev/null; then continue; fi
    conclus="$(rouge_conclu "$tete")" || continue
    [ -n "$conclus" ] || continue
    debut="$(printf '%s\n' "$conclus" | cut -d '|' -f 1 | sort -n | sed -n 1p)"
    [ $((maintenant - debut)) -ge "$ROUGE_ANCIEN_S" ] || continue
    dernier="$(printf '%s\n' "$conclus" | sort -t '|' -k 6,6n | sed -n '$p' | cut -d '|' -f 5)"
    if en_reparation "$dernier" "$tete"; then continue; fi
    printf '%s|%s|%s\n' "$num" "$tete" "$debut"
  done <<< "$lignes"
}

# Le fusionneur (toutes les 10 min) fait partir le superviseur dès qu'une PR franchit le seuil, une
# fois par PR et par série rouge (la clé porte son début).
signaler_rouges_anciens() {
  local num tete debut
  while IFS='|' read -r num tete debut; do
    [ -n "$num" ] || continue
    appeler_superviseur "rouge-ancien-$num-$debut" "PR #$num rouge depuis $(heure_de "$debut"), plus de $((ROUGE_ANCIEN_S / 3600)) h"
  done <<< "$(rouges_anciens)"
}

# Le message du superviseur : les PR de rouges_anciens, avec leur dernier run rouge conclu et ses
# tests. Leurs numéros vont dans <sortie>/rouges-anciens.txt : ce sont les seules PR qu'il peut
# réparer sur leur propre branche (reparation_du_superviseur).
rouges_anciens_du_passage() {
  local sortie="$1" num tete debut
  : > "$sortie/rouges-anciens.txt"
  while IFS='|' read -r num tete debut; do
    [ -n "$num" ] || continue
    printf '%s\n' "$num" >> "$sortie/rouges-anciens.txt"
    printf '  · #%s — rouge depuis %s (%s) :\n' "$num" "$(heure_de "$debut")" "$tete"
    rouge_conclu_lisible "$(rouge_conclu "$tete" || true)" | sed 's/^/    /'
  done <<< "$(rouges_anciens)"
  if [ ! -s "$sortie/rouges-anciens.txt" ]; then printf '  · aucune\n'; fi
}

# Une réparation morte sur une panne d'API ou de réseau ne compte pas (amendement du 2026-10-24) :
# elle n'a rien poussé, et rien jugé de la PR. Relevé le 2026-10-24, réparation 1/3 de #1469 : claude
# sorti en 1 après 11 tours, `is_error: true`, `terminal_reason: "api_error"`, résultat « API Error:
# Can't reach the API server — check your internet or DNS (ENOTFOUND) », et pourtant comptée.
# Détection ÉTROITE : `is_error` ET, soit un résultat qui commence par « API Error » ou nomme une
# panne de réseau (ENOTFOUND, EAI_AGAIN, ECONNREFUSED, ECONNRESET, ETIMEDOUT, « Could not resolve
# host », « Can't reach the API server »), soit aucun tour de travail (`num_turns` à 0). Le reste
# compte toujours : budget dépassé, durée atteinte, claude.json illisible ou absent, échec de l'agent.
# Rend 0 en écrivant le résultat de claude quand elle reconnaît la panne.
panne_d_api() {
  node -e '
    let r;
    try { r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")) } catch { process.exit(1) }
    if (r === null || r.is_error !== true) process.exit(1);
    const res = typeof r.result === "string" ? r.result : "";
    const reseau = /^API Error\b|\b(ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT)\b|Could not resolve host|reach the API server/;
    if (reseau.test(res) || r.num_turns === 0) { process.stdout.write(res.slice(0, 160) || "aucun tour"); process.exit(0) }
    process.exit(1);
  ' "$1"
}

# Le superviseur répare une PR rouge depuis plus de 2 h sur SA branche (amendement du 2026-10-24) :
# il part de la tête de la PR, commite son correctif par-dessus et écrit le numéro dans
# pr-reparee.txt. Les bornes se vérifient ici, pas chez l'agent :
#   - la PR est dans la liste de CE passage (rouges-anciens.txt) ;
#   - elle est ouverte, vise pre-dev, et sa tête est une branche d'agent ;
#   - HEAD descend de la tête de la PR, sans commit de fusion : son diff est origin/<tête>..HEAD ;
#   - ce diff ne touche ni le fichier de pistes, ni les outils des agents (le fusionneur fusionnerait
#     la PR sans que le porteur la lise).
# Le passage devient alors une réparation de cette PR : vérifiée depuis sa tête, poussée en avance
# rapide, jamais forcée. Une réparation de l'implémenteur poussée entre-temps la fait refuser.
reparation_du_superviseur() {
  local num lu tete fichiers qui
  num="$(head -n 1 "$sortie/pr-reparee.txt" | tr -dc '0-9')"
  [ -n "$num" ] || fin refuse "pr-reparee.txt sans numéro de PR"
  grep -qxF "$num" "$sortie/rouges-anciens.txt" 2> /dev/null \
    || fin refuse "#$num n'est pas dans la liste des PR rouges depuis plus de $((ROUGE_ANCIEN_S / 3600)) h de ce passage"
  lu="$(GH_REPO="$GH_REPO" gh pr view "$num" --json state,baseRefName,headRefName \
    --jq '"\(.state)|\(.baseRefName)|\(.headRefName)"' 2> /dev/null)" || fin refuse "#$num illisible"
  case "$lu" in
    "OPEN|pre-dev|agents/"*) tete="${lu##*|}" ;;
    *) fin refuse "#$num : seule une PR ouverte d'agent vers pre-dev se répare ainsi ($lu)" ;;
  esac
  # Le passage du superviseur dure ; une réparation de l'implémenteur a pu partir entre-temps.
  if qui="$(reparation_vivante "$num")"; then fin refuse "#$num : $qui la répare en ce moment"; fi
  avec_verrou_git git -C "$CLONE" fetch origin --prune --quiet
  git -C "$arbre" merge-base --is-ancestor "origin/$tete" HEAD \
    || fin refuse "#$num : HEAD ne descend pas de la tête de la PR ($tete)"
  [ -z "$(git -C "$arbre" rev-list --merges "origin/$tete..HEAD")" ] \
    || fin refuse "#$num : commit de fusion sur la tête de la PR (le rafraîchissement et les conflits sont au tri et à l'implémenteur)"
  fichiers="$(git -C "$arbre" diff --name-only "origin/$tete" HEAD)" || fin refuse "#$num : diff illisible"
  if printf '%s\n' "$fichiers" | grep -qE "$OUTILS_DES_AGENTS|^docs/plans/2026-10-15-pistes-d-amelioration\\.md\$|^$ARCHIVE_PISTES/"; then
    fin refuse "#$num : le correctif touche le fichier de pistes ou les outils des agents (ta propre PR, qui attend le porteur)"
  fi
  MODE=reparation
  PR="$num"
  branche="$tete"
  depart="origin/$tete"
  info "superviseur : réparation de #$PR sur sa branche ($tete)"
}

# Relance une fois les jobs rouges d'un run à sa première tentative, et garde ses tests rouges pour
# juger, à la fin de la relance, s'ils étaient intermittents (noter_intermittents). Rend 0 si le run
# a été relancé.
relancer_une_fois() {
  local run="$1" origine="$2"
  [ ! -e "$BASE/etat/relance-auto-$run" ] || return 1
  touch "$BASE/etat/relance-auto-$run"
  { printf '%s\n' "$origine"; tests_rouges "$run" 1; } > "$BASE/etat/intermittent-attente-$run"
  if ! GH_REPO="$GH_REPO" gh run rerun "$run" --failed > /dev/null 2>&1; then
    rm -f "$BASE/etat/intermittent-attente-$run"
    return 1
  fi
}

# Le tri d'une PR rouge, sans conflit. Pose TRI à `rafraichie`, `relancee`, `gelee` ou `reparer`,
# et ROUGES_COMMUNS à ce qui rougit aussi ailleurs. Seul `reparer` coûte une réparation.
#   1. Base périmée : le run a démarré avant une fusion que la branche n'a pas → la base est fusionnée
#      dans la branche, UNE fois par PR (une PR gelée, toujours : sa cause était ailleurs). Une fois
#      par tête jusqu'au 2026-10-24 : #1469, rafraîchie à 14:47 pour un rouge qui ne venait pas de
#      la base, a relancé 30 min de CI pour rien ; la seconde fois, le rouge passe aux étapes 2 et 3.
#   2. Première tentative : les jobs rouges sont relancés, une fois par run.
#   3. Rouge confirmé : ses tests rejoignent le registre (etat/rouges/<n°>) ; un test qui rougit aussi
#      sur une autre PR ouverte ou sur pre-dev, dans un fichier que la PR ne touche pas, est commun.
#      Tout commun → la PR est gelée, et le superviseur appelé pour le réparer une fois, sur pre-dev.
trier_rouge() {
  local num="$1" tete="$2" runs run tentatives="" tentative debut=0 d derniere tete_sha ids cle
  local ouvertes fichiers id chemin ou f propres=0 communs="" relance=0
  TRI=reparer
  ROUGES_COMMUNS=""
  [ "$A_BLANC" -eq 0 ] || return 0
  runs="$(GH_REPO="$GH_REPO" gh pr checks "$num" --json bucket,link \
    --jq '.[] | select(.bucket == "fail" or .bucket == "cancel") | .link' 2> /dev/null \
    | sed -nE 's#.*/actions/runs/([0-9]+)/.*#\1#p' | sort -u || true)"
  [ -n "$runs" ] || return 0
  tete_sha="$(git -C "$CLONE" rev-parse "origin/$tete" 2> /dev/null)" || return 0

  for run in $runs; do
    d="$(GH_REPO="$GH_REPO" gh run view "$run" --json createdAt,attempt --jq '"\(.createdAt | fromdateiso8601) \(.attempt)"' 2> /dev/null || echo '0 0')"
    tentatives="$tentatives $run:${d#* }"
    d="${d%% *}"
    if [ "$debut" -eq 0 ] || [ "$d" -lt "$debut" ]; then debut="$d"; fi
  done

  # 1. Base périmée.
  derniere="$(git -C "$CLONE" log --format=%ct "origin/$tete..$BASE_REF" 2> /dev/null | sort -n | tail -1)"
  if [ -n "$derniere" ] && [ "$debut" -gt 0 ] && [ "$derniere" -gt "$debut" ] \
    && { [ ! -e "$BASE/etat/rafraichi-$num" ] || [ -e "$BASE/etat/gele-$num" ]; } \
    && avec_verrou_git rafraichir "$num" "$tete"; then
    TRI=rafraichie
    info "PR #$num : run rouge antérieur à la dernière fusion dans $BASE_REF, base fusionnée dans la branche"
    journaliser_tri tri-rafraichie "$num" "run antérieur à la dernière fusion dans $BASE_REF"
    return 0
  fi

  # 2. Relance unique.
  for run in $tentatives; do
    tentative="${run#*:}"
    run="${run%%:*}"
    [ "$tentative" = 1 ] || continue
    if relancer_une_fois "$run" "$num	$tete"; then relance=1; fi
  done
  if [ "$relance" -eq 1 ]; then
    TRI=relancee
    info "PR #$num : jobs rouges relancés une fois avant toute réparation"
    journaliser_tri tri-relancee "$num" "première tentative rouge, relancée"
    return 0
  fi

  # 3. Rouge confirmé : registre, puis rouge commun.
  mkdir -p "$BASE/etat/rouges"
  ids="$(for run in $tentatives; do tests_rouges "${run%%:*}" "${run#*:}"; done | sort -u)"
  { printf '%s\n' "$tete_sha"; printf '%s\n' "$ids"; } > "$BASE/etat/rouges/$num"
  ouvertes="$(GH_REPO="$GH_REPO" gh pr list --base pre-dev --state open --json number --jq '.[].number' 2> /dev/null || true)"
  fichiers="$(git -C "$CLONE" diff --name-only "$BASE_REF...origin/$tete" 2> /dev/null || true)"
  while IFS= read -r id; do
    [ -n "$id" ] || continue
    case "$id" in *'(sans test nommé)')
      propres=$((propres + 1))
      continue
      ;;
    esac
    chemin="$(fichier_du_test "${id#*	}")"
    if [ -n "$chemin" ] && printf '%s\n' "$fichiers" | grep -qxF "$chemin"; then
      propres=$((propres + 1))
      continue
    fi
    ou=""
    for f in "$BASE"/etat/rouges/*; do
      cle="${f##*/}"
      [ "$cle" != "$num" ] || continue
      if [ "$cle" != pre-dev ] && ! printf '%s\n' "$ouvertes" | grep -qxF "$cle"; then continue; fi
      if tail -n +2 "$f" | grep -qxF -- "$id"; then
        case "$cle" in pre-dev) ou="$ou pre-dev" ;; *) ou="$ou #$cle" ;; esac
      fi
    done
    if [ -n "$ou" ]; then
      communs="$communs- ${id#*	} (job ${id%%	*}), rouge aussi sur$ou
"
      printf '%s\t#%s\t%s\t%s\n' "$(date '+%Y-%m-%d %H:%M')" "$num" "$id" "$ou" >> "$BASE/etat/rouges-communs.tsv"
    else
      propres=$((propres + 1))
    fi
  done <<< "$ids"
  ROUGES_COMMUNS="$communs"
  if [ -n "$communs" ]; then
    appeler_superviseur "commun-$(printf '%s' "$communs" | sed 's/, rouge aussi sur.*//' | sort | shasum | cut -c1-12)" \
      "rouge commun à plusieurs PR ($(printf '%s' "$communs" | wc -l | tr -d ' ') test(s), PR #$num)"
  fi
  if [ -n "$communs" ] && [ "$propres" -eq 0 ]; then
    touch "$BASE/etat/gele-$num"
    TRI=gelee
    info "PR #$num : tous ses tests rouges rougissent aussi ailleurs, réparation gelée"
    journaliser_tri tri-gelee "$num" "rouge commun : $(printf '%s' "$communs" | tr '\n' ' ')"
    return 0
  fi
  rm -f "$BASE/etat/gele-$num"
}

# L'état de pre-dev, lu sur les runs de ses push (api-ci, web-ci) : écrit etat/pre-dev-rouge quand
# le dernier verdict d'un workflow est rouge, et l'efface sinon. Une première tentative rouge est
# relancée une fois ; un rouge confirmé rejoint le registre (etat/rouges/pre-dev) et appelle le
# superviseur. Un run en cours ou annulé ne dit rien : le verdict est celui d'avant.
evaluer_pre_dev() {
  local wf lignes run statut conclusion tentative rouge=0 ids="" raison=""
  for wf in api-ci.yml web-ci.yml; do
    lignes="$(GH_REPO="$GH_REPO" gh run list --workflow "$wf" --branch pre-dev --event push --limit 10 \
      --json databaseId,status,conclusion,attempt \
      --jq '.[] | "\(.databaseId)|\(.status)|\(.conclusion)|\(.attempt)"' 2> /dev/null)" || return 0
    # « | » et non une tabulation : `read` fond deux tabulations de suite, et la conclusion d'un run
    # en cours est vide (la tentative glissait d'un champ).
    while IFS='|' read -r run statut conclusion tentative; do
      [ -n "$run" ] || continue
      case "$statut:$conclusion" in
        completed:success) break ;;
        completed:failure | completed:timed_out | completed:startup_failure)
          rouge=1
          if [ "$tentative" = 1 ] && relancer_une_fois "$run" "pre-dev	pre-dev"; then
            info "pre-dev : $wf rouge à sa première tentative (run $run), relancé une fois"
            journaliser_tri tri-relancee pre-dev "$wf, run $run"
          elif [ ! -e "$BASE/etat/intermittent-attente-$run" ]; then
            ids="$ids$(tests_rouges "$run" "$tentative")
"
            raison="$raison $wf (run $run)"
            appeler_superviseur "pre-dev-$run" "pre-dev rouge : $wf, run $run"
          fi
          break
          ;;
        completed:*) continue ;;
        *)
          # Une relance en cours tient le rouge qu'elle vérifie ; un premier passage, rien encore.
          if [ "${tentative:-1}" -gt 1 ]; then
            rouge=1
            break
          fi
          ;;
      esac
    done <<< "$lignes"
  done
  if [ "$rouge" -eq 0 ]; then
    if [ -e "$BASE/etat/pre-dev-rouge" ]; then
      info "pre-dev est vert : les fusions reprennent"
      journaliser_tri pre-dev-vert pre-dev "les fusions reprennent"
    fi
    rm -f "$BASE/etat/pre-dev-rouge" "$BASE/etat/rouges/pre-dev"
    return 0
  fi
  mkdir -p "$BASE/etat/rouges"
  if [ -n "$raison" ]; then
    { git -C "$CLONE" rev-parse "$BASE_REF" 2> /dev/null || echo -; printf '%s' "$ids" | sort -u; } > "$BASE/etat/rouges/pre-dev"
  fi
  # Écrit au premier rouge, et réécrit quand une relance en cours devient un rouge confirmé : c'est
  # là que le porteur est prévenu.
  if [ ! -e "$BASE/etat/pre-dev-rouge" ] || { [ -n "$raison" ] && grep -q 'relance en cours' "$BASE/etat/pre-dev-rouge"; }; then
    printf '%s\t%s\n' "$(date '+%Y-%m-%d %H:%M')" "${raison:-relance en cours}" > "$BASE/etat/pre-dev-rouge"
    info "pre-dev rouge :${raison:- relance en cours} — seules les PR du superviseur et la synchronisation se fusionnent"
    journaliser_tri pre-dev-rouge pre-dev "${raison:-relance en cours} : fusions suspendues"
    if [ -n "$raison" ]; then prevenir_porteur "pre-dev rouge :$raison — fusions suspendues, superviseur appelé"; fi
  fi
}

# Une relance automatique finie : verte, ses tests étaient intermittents (etat/intermittents.tsv,
# que le superviseur traite) ; rouge, le rouge était réel et la réparation suit son cours.
noter_intermittents() {
  local f run lu statut conclusion origine id
  for f in "$BASE"/etat/intermittent-attente-*; do
    [ -e "$f" ] || continue
    run="${f##*-}"
    lu="$(GH_REPO="$GH_REPO" gh run view "$run" --json status,conclusion --jq '"\(.status)\t\(.conclusion)"' 2> /dev/null)" || continue
    IFS=$'\t' read -r statut conclusion <<< "$lu"
    [ "$statut" = completed ] || continue
    if [ "$conclusion" = success ]; then
      origine="$(head -1 "$f")"
      tail -n +2 "$f" | while IFS= read -r id; do
        if [ -n "$id" ]; then printf '%s\t%s\t%s\t%s\n' "$(date '+%Y-%m-%d %H:%M')" "$run" "$origine" "$id" >> "$BASE/etat/intermittents.tsv"; fi
      done
      info "run $run vert à sa relance : intermittent noté ($(tail -n +2 "$f" | cut -f2 | tr '\n' ' '))"
      journaliser_tri intermittent "${origine%%	*}" "run $run : $(tail -n +2 "$f" | cut -f2 | tr '\n' ' ')"
      appeler_superviseur "intermittent-$run" "test intermittent (run $run)"
    fi
    rm -f "$f"
  done
}

# La PR dev → pre-dev, quand dev a des commits que pre-dev n'a pas. Une seule à la fois.
synchroniser_pre_dev() {
  local retard num
  retard="$(git -C "$CLONE" rev-list --count "$BASE_REF"..origin/dev)"
  [ "$retard" -gt 0 ] || return 0
  num="$(GH_REPO="$GH_REPO" gh pr list --base pre-dev --head dev --state open --json number --jq '.[0].number // empty')"
  if [ -z "$num" ]; then
    GH_REPO="$GH_REPO" gh pr create --base pre-dev --head dev --label agents:synchro \
      --title "chore(pre-dev): synchroniser avec dev ($retard commits)" \
      --body "$(printf '%s\n\n%s\n\n%s' "\`dev\` a $retard commits que \`pre-dev\` n'a pas. Ouverte par \`scripts/agents/pistes.sh\` (ADR-0066 § 4)." \
        "Les agents partent de \`origin/pre-dev\` : tant qu'elle n'est pas fusionnée, ils travaillent sur un arbre en retard sur \`dev\`." \
        '🤖 Generated with [Claude Code](https://claude.com/claude-code)')" > /dev/null
    info "PR de synchronisation dev → pre-dev ouverte ($retard commits)"
  elif [ "$FUSION" = auto ] && [ "$(etat_ci "$num")" = vert ] && essai_de_fusion "$num" dev; then
    if GH_REPO="$GH_REPO" gh pr merge "$num" --merge > /dev/null 2>&1; then
      info "synchronisation #$num fusionnée"
      git -C "$CLONE" fetch origin --prune --quiet
    fi
  fi
}

recuperer() {
  git -C "$CLONE" fetch origin --prune --quiet
  git -C "$CLONE" rev-parse --verify --quiet "$BASE_REF" > /dev/null || die "$BASE_REF n'existe pas"
  if [ "$A_BLANC" -eq 0 ]; then synchroniser_pre_dev; fi
}

preparer_arbre() {
  local arbre="$1" branche="$2" depart="$3" sortie="$4"
  if [ ! -d "$arbre" ]; then
    git -C "$CLONE" worktree add --quiet --detach "$arbre" "$depart"
  fi
  # Ce qu'un passage interrompu a laissé se sauve avant la remise à zéro, jamais ne se perd.
  if [ -n "$(git -C "$arbre" status --porcelain)" ]; then
    git -C "$arbre" diff HEAD > "$sortie/reliquat.diff" || true
    git -C "$arbre" status --porcelain > "$sortie/reliquat.status" || true
    info "reliquat d'un passage précédent sauvé dans $sortie"
  fi
  git -C "$arbre" reset --quiet --hard
  git -C "$arbre" clean -fdq
  git -C "$arbre" switch --quiet --force-create "$branche" "$depart"
  # Les branches locales d'agent restées d'un passage refusé : leur correctif est dans leur sortie.
  git -C "$CLONE" for-each-ref --format='%(refname:short)' "refs/heads/agents/$ROLE/" | while read -r b; do
    [ "$b" = "$branche" ] || git -C "$CLONE" branch -D --quiet "$b" 2> /dev/null || true
  done
}

installer_dependances() {
  local arbre="$1" h
  h="$(shasum "$arbre/takussan-api/composer.lock" | cut -c1-40)"
  if [ ! -d "$arbre/takussan-api/vendor" ] || [ "$h" != "$(cat "$BASE/etat/composer-$NOM" 2> /dev/null || true)" ]; then
    (cd "$arbre/takussan-api" && composer install --no-interaction --no-progress --quiet)
    printf '%s' "$h" > "$BASE/etat/composer-$NOM"
  fi
  h="$(shasum "$arbre/takussan-web/package-lock.json" | cut -c1-40)"
  if [ ! -d "$arbre/takussan-web/node_modules" ] || [ "$h" != "$(cat "$BASE/etat/npm-$NOM" 2> /dev/null || true)" ]; then
    (cd "$arbre/takussan-web" && npm ci --silent --no-audit --no-fund)
    printf '%s' "$h" > "$BASE/etat/npm-$NOM"
  fi
  # Copies posées par « installer », jamais de lien vers l'arbre principal (illisible sous launchd).
  if [ -f "$BASE/env/takussan-api.env" ]; then cp "$BASE/env/takussan-api.env" "$arbre/takussan-api/.env"; fi
  if [ -f "$BASE/env/takussan-web.env.local" ]; then cp "$BASE/env/takussan-web.env.local" "$arbre/takussan-web/.env.local"; fi
}

# Lance claude sous une durée bornée ; à l'échéance, TOUT le groupe de processus est tué (les
# processus de test survivent sinon au parent).
lancer_claude() {
  local duree="$1"
  shift
  perl -e '
    my $duree = shift;
    my $pid = fork; die "fork: $!" unless defined $pid;
    if (!$pid) { setpgrp(0, 0); exec @ARGV or die "exec: $!"; }
    local $SIG{ALRM} = sub { kill "TERM", -$pid; sleep 15; kill "KILL", -$pid; exit 124 };
    alarm $duree;
    waitpid($pid, 0);
    my $statut = $?;
    alarm 0;
    kill "TERM", -$pid;
    exit($statut & 127 ? 128 + ($statut & 127) : $statut >> 8);
  ' "$duree" "$@"
}

verifier() {
  local arbre="$1" sortie="$2" depart="$3"
  local fige="$sortie/check-pistes.mjs"
  local echecs=0

  if [ -n "$(git -C "$arbre" status --porcelain)" ]; then
    git -C "$arbre" status --porcelain > "$sortie/non-commite.txt"
    info "✗ l'agent a laissé des modifications non commitées (non-commite.txt)"
    return 1
  fi
  if [ "$ROLE" = superviseur ]; then
    # Le superviseur n'a pas de pistes : il ne touche ni leur fichier, qui est aux autres rôles, ni
    # leur archive, qui est à l'archiveur.
    if git -C "$arbre" diff --name-only "$depart" HEAD | grep -qE "^(docs/plans/2026-10-15-pistes-d-amelioration\\.md|$ARCHIVE_PISTES/)"; then
      info "✗ le superviseur a touché le fichier de pistes"
      echecs=$((echecs + 1))
    fi
  else
    # La garde de périmètre jouée est celle d'origin/pre-dev, pas celle de la branche de l'agent.
    git -C "$CLONE" show "$BASE_REF:scripts/check-pistes.mjs" > "$fige"
    if ! (cd "$arbre" && CHECK_PISTES_RACINE="$arbre" node "$fige" --role "$ROLE" --base "$BASE_REF") > "$sortie/verif-pistes.txt" 2>&1; then
      info "✗ check-pistes --role $ROLE (verif-pistes.txt)"
      echecs=$((echecs + 1))
    fi
  fi
  if [ "$ROLE" = implementeur ] || [ "$ROLE" = superviseur ]; then
    local g php
    for g in "$arbre"/scripts/check-*.mjs; do
      if ! (cd "$arbre" && node "$g") >> "$sortie/verif-gardes.txt" 2>&1; then
        info "✗ $(basename "$g")"
        echecs=$((echecs + 1))
      fi
    done
    # `--check` : la source du backlog se rend sans erreur (id dupliqué, statut inconnu), et rien
    # n'est écrit dans l'arbre vérifié.
    if ! (cd "$arbre" && node docs/backlog/gen-index.mjs --check && node docs/backlog/check-backlog.mjs) >> "$sortie/verif-gardes.txt" 2>&1; then
      info "✗ index ou backlog (verif-gardes.txt)"
      echecs=$((echecs + 1))
    fi
    # Deux instances qui numérotent chacune « le plus grand vu, plus un » se donnent le même numéro,
    # et la seconde PR fusionnée rougit check-backlog (id en double). Chaque instance a sa classe
    # de numéros modulo N : la règle de ses instructions, vérifiée ici sur les tickets ajoutés.
    if [ "$INSTANCES_IMPLEMENTEUR" -gt 1 ]; then
      local hors
      hors="$(git -C "$arbre" diff --name-only --diff-filter=A "$depart" HEAD -- docs/backlog/tickets \
        | sed -nE 's#^docs/backlog/tickets/TCK-0*([0-9]+)-.*#\1#p' \
        | awk -v n="$INSTANCES_IMPLEMENTEUR" -v k="$INSTANCE" '($1 + 0) % n != k - 1 { printf "TCK-%s ", $1 }')"
      if [ -n "$hors" ]; then
        printf 'tickets hors de la classe de l'"'"'instance %s sur %s (numéro modulo %s = %s) : %s\n' \
          "$INSTANCE" "$INSTANCES_IMPLEMENTEUR" "$INSTANCES_IMPLEMENTEUR" "$((INSTANCE - 1))" "$hors" > "$sortie/verif-instance.txt"
        info "✗ numéros de ticket hors de la classe de l'instance (verif-instance.txt)"
        echecs=$((echecs + 1))
      fi
    fi
    php="$(git -C "$arbre" diff --name-only --diff-filter=AM "$depart" HEAD -- 'takussan-api/*.php' | sed 's#^takussan-api/##' | tr '\n' ' ')"
    if [ -n "$php" ]; then
      # shellcheck disable=SC2086 # liste de fichiers, découpée à dessein
      if ! (cd "$arbre/takussan-api" && ./vendor/bin/pint --test $php) > "$sortie/verif-pint.txt" 2>&1; then
        info "✗ Pint (verif-pint.txt)"
        echecs=$((echecs + 1))
      fi
    fi
  fi
  [ "$echecs" -eq 0 ]
}

# 2. Les PR du rôle, de la plus ancienne à la plus récente. Une verte se fusionne ; une rouge ou
# en conflit se répare, la plus ancienne d'abord ; une en attente de CI occupe une place. Un
# passage neuf part seulement s'il reste une place : l'implémenteur n'attend plus la CI de sa PR
# précédente pour prendre la piste suivante (ADR-0066 § 4).
# Lit et écrit les variables du passage (MODE, PR, branche, depart, ci, conflit, reparations),
# déclarées par lancer() : bash les voit par portée dynamique.
# Conflit textuel entre la tête d'une PR et la base, calculé sur place : `merge-tree --write-tree`
# (git ≥ 2.38) ne touche ni arbre de travail ni index. Sort en 1 sur un conflit.
en_conflit() {
  local statut=0
  git -C "$CLONE" rev-parse --verify --quiet "origin/$1" > /dev/null || return 1
  git -C "$CLONE" merge-tree --write-tree "$BASE_REF" "origin/$1" > /dev/null 2>&1 || statut=$?
  [ "$statut" -eq 1 ]
}

etat_des_pr() {
  local pr_max lignes num tete etat_fusion ci_pr conflit_pr essai qui ouvertes=0 fusionnees=0 abandons=""
  pr_max="$(par_role PR_MAX "$ROLE")"
  if [ -z "$pr_max" ]; then
    if [ "$ROLE" = implementeur ]; then pr_max=3; else pr_max=1; fi
  fi
  lignes="$(GH_REPO="$GH_REPO" gh pr list --base pre-dev --state open --label "agent:$ROLE" \
    --json number,headRefName,mergeable --jq 'sort_by(.number) | .[] | "\(.number)\t\(.headRefName)\t\(.mergeable)"')"
  MODE=nouveau
  while IFS=$'\t' read -r num tete etat_fusion; do
    [ -n "$num" ] || continue
    # Une PR d'une autre instance compte dans le plafond, qui est celui du rôle, mais c'est son
    # instance qui la fusionne, la réconcilie ou la répare : deux réparations de la même PR à la
    # fois écriraient chacune sur la branche de l'autre.
    if [ "$(instance_de_branche "$tete")" != "$INSTANCE" ]; then
      ouvertes=$((ouvertes + 1))
      continue
    fi
    # Le superviseur peut la réparer en ce moment (une PR rouge depuis plus de 2 h) : ni tri, ni
    # seconde réparation, qui écriraient sous la sienne.
    if qui="$(reparation_vivante "$num")"; then
      info "#$num : $qui la répare en ce moment, rien ici"
      ouvertes=$((ouvertes + 1))
      continue
    fi
    ci_pr="$(etat_ci "$num")"
    conflit_pr=non
    # GitHub rend UNKNOWN après chaque fusion dans pre-dev, tant qu'on ne lui a pas redemandé, et
    # le fusionneur relance un rôle juste après une fusion : il ne voyait presque jamais
    # CONFLICTING. Relevé le 2026-10-19 : #739 en conflit, CI verte, classée « CI en cours » à
    # chaque passage pendant deux heures. Sans verdict de GitHub, le conflit se calcule ici.
    if [ "$etat_fusion" = CONFLICTING ]; then
      conflit_pr=oui
    elif [ "$etat_fusion" != MERGEABLE ] && en_conflit "$tete"; then
      conflit_pr=oui
    fi
    # Un rouge se trie avant de coûter une réparation (amendement du 2026-10-22), même sur une PR
    # abandonnée : un rafraîchissement ou une relance peut la sauver sans modèle.
    TRI=reparer
    ROUGES_COMMUNS=""
    if [ "$conflit_pr" = non ] && [ "$ci_pr" = rouge ]; then
      trier_rouge "$num" "$tete"
      if [ "$TRI" != reparer ]; then
        ouvertes=$((ouvertes + 1))
        continue
      fi
    fi
    if [ "$conflit_pr" = non ] && [ "$ci_pr" != rouge ]; then
      essai=3
      # pre-dev rouge : rien ne s'y fusionne que ce qui peut le réparer (le fusionneur, ci-dessus).
      if [ "$ci_pr" = vert ] && [ "$FUSION" = auto ] && [ "$A_BLANC" -eq 0 ] && [ ! -e "$BASE/etat/pre-dev-rouge" ]; then
        essai=0
        essai_de_fusion "$num" "$tete" || essai=$?
      fi
      if [ "$essai" -eq 0 ]; then
        GH_REPO="$GH_REPO" gh pr merge "$num" --merge --delete-branch > /dev/null 2>&1 || true
        # Le fusionneur a pu passer entre-temps ; un refus (mergeable pas encore recalculé) attend.
        if [ "$(GH_REPO="$GH_REPO" gh pr view "$num" --json state --jq .state)" = MERGED ]; then
          info "PR #$num fusionnée dans pre-dev"
          relancer_suivant "$tete"
          fusionnees=1
          continue
        fi
      fi
      if [ "$essai" -ne 1 ]; then
        ouvertes=$((ouvertes + 1))
        continue
      fi
      # CI verte, arbre fusionné rouge : la PR se répare au lieu d'attendre une CI déjà finie. Le
      # rapport de l'essai dit si c'est un conflit ou une garde, et le message de réparation le
      # porte, puisqu'aucun check GitHub n'est rouge.
      if grep -q '^✗ conflit de fusion' "$BASE/sorties/essais/$num.txt" 2> /dev/null; then
        conflit_pr=oui
      else
        ci_pr="rouge sur l'arbre fusionné avec $BASE_REF ($(grep '^✗' "$BASE/sorties/essais/$num.txt" 2> /dev/null | tr '\n' ' '))"
      fi
    fi
    ouvertes=$((ouvertes + 1))
    if [ "$conflit_pr" = oui ] && [ "$ci_pr" != rouge ] && [ "$A_BLANC" -eq 0 ] \
      && reconcilier_index "$num" "$tete" "$arbre" "$sortie/reconciliation-$num"; then
      continue
    fi
    [ "$MODE" = nouveau ] || continue
    reparations="$(cat "$BASE/etat/reparations-$ROLE-$num" 2> /dev/null || echo 0)"
    if [ "$reparations" -ge "$REPARATIONS_MAX" ]; then
      abandons="$abandons #$num"
      continue
    fi
    MODE=reparation
    PR="$num"
    branche="$tete"
    ci="$ci_pr"
    conflit="$conflit_pr"
    communs="$ROUGES_COMMUNS"
  done <<< "$lignes"
  if [ -n "$abandons" ]; then info "PR abandonnées après $REPARATIONS_MAX réparations, le porteur prend la main :$abandons"; fi
  if [ "$fusionnees" -eq 1 ]; then avec_verrou_git recuperer; fi
  if [ "$MODE" = reparation ]; then
    printf '%s' "$((reparations + 1))" > "$BASE/etat/reparations-$ROLE-$PR"
    depart="origin/$branche"
  elif [ "$ouvertes" -ge "$pr_max" ]; then
    if [ -n "$abandons" ]; then fin abandon "$ouvertes PR ouvertes sur $pr_max, dont abandonnées :$abandons"; fi
    fin attente "$ouvertes PR ouvertes sur $pr_max : CI en cours"
  fi
}

# Une PR en conflit sur le seul index du backlog se réconcilie sans modèle : l'index est GÉNÉRÉ.
# Deux PR de l'implémenteur ouvertes ensemble ajoutaient chacune un ticket, et le compte « Done — N »
# d'INDEX.md changeait dans les deux : la seconde à fusionner entrait toujours en conflit, sans que
# rien n'y soit à décider. Tout autre conflit revient au modèle (réparation).
# Depuis ADR-0067, INDEX.md n'est plus versionné : une PR ouverte avant que la base le retire entre
# en conflit « modifié / supprimé », et se réconcilie en le retirant à son tour.
reconcilier_index() {
  local num="$1" b="$2" arbre="$3" sortie="$4" conflits
  mkdir -p "$sortie"
  avec_verrou_git preparer_arbre "$arbre" "$b" "origin/$b" "$sortie" || return 1
  if ! git -C "$arbre" merge --no-edit --quiet "$BASE_REF" > /dev/null 2>&1; then
    conflits="$(git -C "$arbre" diff --name-only --diff-filter=U)"
    if [ "$conflits" != docs/backlog/INDEX.md ]; then
      git -C "$arbre" merge --abort 2> /dev/null || true
      return 1
    fi
    if git -C "$arbre" cat-file -e "$BASE_REF:docs/backlog/INDEX.md" 2> /dev/null; then
      if ! (cd "$arbre" && node docs/backlog/gen-index.mjs > /dev/null); then
        git -C "$arbre" merge --abort 2> /dev/null || true
        return 1
      fi
      git -C "$arbre" add docs/backlog/INDEX.md
    else
      git -C "$arbre" rm --quiet --cached docs/backlog/INDEX.md
    fi
    git -C "$arbre" commit --no-edit --quiet || return 1
  fi
  [ "$(git -C "$arbre" rev-list --count "origin/$b..HEAD")" -gt 0 ] || return 1
  installer_dependances "$arbre"
  if ! verifier "$arbre" "$sortie" "$(git -C "$arbre" merge-base HEAD "$BASE_REF")"; then return 1; fi
  git -C "$arbre" push --quiet origin "HEAD:refs/heads/$b" || return 1
  info "PR #$num : index du backlog réconcilié avec $BASE_REF, sans modèle"
}

# 2 bis. Un passage neuf sans rien à prendre s'arrête AVANT le modèle (amendement d'ADR-0066 du
# 2026-10-18). Mesuré du 2026-10-17 au 2026-10-18 : 74 passages vides du mesureur et 37 de
# l'implémenteur, chacun lançant le modèle pour lire une liste vide, 34 USD en deux jours. La liste
# se lit ici sur la version de BASE_REF du fichier de pistes et de sa garde. Pour l'implémenteur,
# une piste que cite une PR ouverte est prise : une liste où toutes le sont est vide aussi. Le doute
# (une lecture qui échoue) laisse partir le modèle, qui sait trancher.
travail_disponible() {
  local racine liste corps refs pris ref reste=0
  # La garde, le fichier et les tickets : la garde sort en 1 si un `fait · TCK-NNN` ne trouve pas
  # son ticket, et le doute laisserait partir le modèle à chaque passage. Chemin RÉEL : la garde ne
  # s'exécute que si son chemin d'appel est le sien (`/var` → `/private/var` sous macOS), et sinon
  # sort en 0 sans rien écrire — une liste vide qui arrêterait le rôle pour toujours. D'où aussi la
  # preuve, par `--report`, qu'elle a lu le fichier.
  mkdir -p "$sortie/base"
  racine="$(cd "$sortie/base" && pwd -P)"
  # shellcheck disable=SC2046 # des chemins sans espace, un par ligne
  git -C "$CLONE" archive "$BASE_REF" scripts/check-pistes.mjs $(chemins_des_pistes "$BASE_REF") \
    docs/backlog/tickets | tar -x -C "$racine" || return 0
  CHECK_PISTES_RACINE="$racine" node "$racine/scripts/check-pistes.mjs" --report | grep -q ' entrées, ' || return 0
  case "$ROLE" in
    explorateur) liste="$(CHECK_PISTES_RACINE="$racine" node "$racine/scripts/check-pistes.mjs" --angles-a-faire)" || return 0 ;;
    mesureur) liste="$(CHECK_PISTES_RACINE="$racine" node "$racine/scripts/check-pistes.mjs" --liste "à mesurer")" || return 0 ;;
    delegue) liste="$(CHECK_PISTES_RACINE="$racine" node "$racine/scripts/check-pistes.mjs" --a-deleguer)" || return 0 ;;
    implementeur)
      liste="$(CHECK_PISTES_RACINE="$racine" node "$racine/scripts/check-pistes.mjs" --liste "validé" \
        && CHECK_PISTES_RACINE="$racine" node "$racine/scripts/check-pistes.mjs" --liste "retenu · autonome")" || return 0
      if [ "$INSTANCES_IMPLEMENTEUR" -gt 1 ]; then
        liste="$(printf '%s\n' "$liste" | part_de_l_instance)"
        if [ -z "$liste" ]; then fin rien "sans modèle : rien à prendre dans la part de l'instance $INSTANCE sur $INSTANCES_IMPLEMENTEUR"; fi
      fi
      corps="$(GH_REPO="$GH_REPO" gh pr list --base pre-dev --state open --json title,body \
        --jq '.[] | "\(.title) \(.body // "")"')" || return 0
      pris="$(printf '%s\n' "$corps" | grep -oE 'P[0-9]+\.[0-9]+' | sort -u || true)"
      refs="$(printf '%s\n' "$liste" | cut -f1 | grep -E '^P[0-9]+\.[0-9]+$' || true)"
      for ref in $refs; do
        if ! printf '%s\n' "$pris" | grep -qxF "$ref"; then reste=$((reste + 1)); fi
      done
      if [ -n "$refs" ] && [ "$reste" -eq 0 ]; then
        fin rien "sans modèle : $(printf '%s\n' "$refs" | wc -l | tr -d ' ') piste(s) à prendre, toutes citées par une PR ouverte"
      fi
      ;;
  esac
  if [ -z "$liste" ]; then fin rien "sans modèle : rien à prendre sur $BASE_REF"; fi
}

# Entretien du dossier des agents. Relevé le 2026-10-21 : 23 Go, dont 8 Go de cache de `next dev`
# dans l'arbre de l'explorateur, et 6,3 Go de copies `base/` (620, une par passage, ~11 Mo de
# tickets chacune) que rien ne supprimait ; des serveurs d'un passage du 2026-10-16 tournaient encore.

# Au-delà, le cache de `next dev` d'un arbre est vidé au début du passage (il se reconstruit seul).
NEXT_CACHE_MAX_KO="${NEXT_CACHE_MAX_KO:-2097152}"
# Les dossiers de passage plus vieux que ce nombre de jours sont purgés.
SORTIES_JOURS="${SORTIES_JOURS:-7}"

# Les serveurs qu'un passage lance en arrière-plan (`next dev`, `php -S`, Chrome headless) quittent le
# groupe de processus de claude : le TERM de `lancer_claude` ne les atteint pas. On les retrouve par
# leur ligne de commande ou leur répertoire courant, sous l'arbre ou les sorties du rôle. Un seul
# passage par rôle (verrou) : rien d'autre n'y vit. La collecte se fait depuis `/`, et le script
# lui-même est exclu, pour ne pas se compter.
balayer_processus() {
  local pids
  pids="$(cd / && {
    pgrep -f -- "$BASE/arbres/$NOM/" || true
    pgrep -f -- "$BASE/sorties/$NOM/" || true
    lsof -a -d cwd -Fpn 2> /dev/null | awk -v a="$BASE/arbres/$NOM" -v s="$BASE/sorties/$NOM/" '
      /^p/ { p = substr($0, 2) }
      /^n/ { n = substr($0, 2); if (n == a || index(n, a "/") == 1 || index(n, s) == 1) print p }'
  } | sort -u | grep -vx "$$" || true)"
  BALAYES=0
  if [ -z "$pids" ]; then return 0; fi
  BALAYES="$(printf '%s\n' "$pids" | wc -l | tr -d ' ')"
  # shellcheck disable=SC2086 # une liste de pid, à découper
  kill $pids 2> /dev/null || true
  sleep 5
  # shellcheck disable=SC2086
  kill -9 $pids 2> /dev/null || true
  info "processus laissés sous l'arbre ou les sorties de $NOM arrêtés : $(printf '%s\n' "$pids" | wc -l | tr -d ' ')"
}

# En début de passage, sous verrou : les restes d'un passage précédent, les vieux dossiers de
# passage du rôle et un cache de `next dev` trop gros.
entretenir() {
  local arbre="$1" sortie="$2" cache ko
  balayer_processus
  find "$BASE/sorties/$NOM" -mindepth 1 -maxdepth 1 -type d -mtime +"$SORTIES_JOURS" ! -path "$sortie" -exec rm -rf {} + 2> /dev/null || true
  cache="$arbre/takussan-web/.next/dev/cache"
  if [ -d "$cache" ]; then
    ko="$(du -sk "$cache" | cut -f1)"
    if [ "$ko" -gt "$NEXT_CACHE_MAX_KO" ]; then
      rm -rf "$cache"
      info "cache de next dev vidé ($((ko / 1024)) Mo)"
    fi
  fi
}

lancer() {
  ROLE="$1"
  valider_role "$ROLE"
  charger_config
  INSTANCE="${2:-1}"
  case "$INSTANCE" in '' | *[!0-9]* | 0) die "instance « $INSTANCE » : un entier, 1 au moins" ;; esac
  if [ "$INSTANCE" -gt 1 ]; then
    [ "$ROLE" = implementeur ] || die "seul l'implémenteur a plusieurs instances"
    [ "$INSTANCE" -le "$INSTANCES_IMPLEMENTEUR" ] || die "instance $INSTANCE au-delà de INSTANCES_IMPLEMENTEUR=$INSTANCES_IMPLEMENTEUR"
    NOM="$ROLE-$INSTANCE"
  else
    NOM="$ROLE"
  fi
  DEBUT="$(date +%s)"
  local horo sortie arbre verrou
  horo="$(date +%Y%m%d-%H%M%S)"
  sortie="$BASE/sorties/$NOM/$horo"
  arbre="$BASE/arbres/$NOM"
  verrou="$BASE/verrous/$NOM"
  mkdir -p "$sortie"
  exec >> "$sortie/passage.log" 2>&1
  trap journaliser EXIT

  # 1. Arrêts préalables, avant toute dépense.
  # Le superviseur passe sous SA pause (il doit pouvoir la lever), jamais sous celle du porteur.
  if [ -e "$BASE/PAUSE" ] && ! { [ "$ROLE" = superviseur ] && pause_du_superviseur "$BASE/PAUSE"; }; then
    fin pause "fichier PAUSE présent"
  fi
  if [ -e "$BASE/PAUSE-$ROLE" ]; then fin pause "PAUSE-$ROLE : $(head -c 150 "$BASE/PAUSE-$ROLE" | tr '\n' ' ')"; fi
  if ! mkdir "$verrou" 2> /dev/null; then
    local pid
    pid="$(cat "$verrou/pid" 2> /dev/null || true)"
    if [ -n "$pid" ] && kill -0 "$pid" 2> /dev/null; then fin occupe "passage précédent en cours (pid $pid)"; fi
    rm -rf "$verrou"
    mkdir "$verrou"
  fi
  printf '%s' "$$" > "$verrou/pid"
  # La copie `base/` de `travail_disponible` ne sert qu'à lire la liste : elle part avec le passage.
  trap 'balayer_processus; rm -rf "$sortie/base" "$verrou"; journaliser' EXIT
  entretenir "$arbre" "$sortie"

  local charge max
  charge="$(sysctl -n vm.loadavg | awk '{print $3}' | tr ',' '.')"
  max="${CHARGE_MAX:-$(($(sysctl -n hw.ncpu) * 3 / 2))}"
  # Le superviseur part sous la charge : c'est une des choses qu'il doit voir.
  if [ "$ROLE" != superviseur ] && awk -v c="$charge" -v m="$max" 'BEGIN { exit !(c > m) }'; then fin charge "charge $charge > $max"; fi

  avec_verrou_git recuperer

  # L'archivage quotidien du fichier de pistes, sans modèle (amendement d'ADR-0066 du 2026-10-24) :
  # au premier passage du superviseur de la journée, avant son modèle.
  if [ "$ROLE" = superviseur ] && [ "$A_BLANC" -eq 0 ]; then
    archiver_du_jour || info "archiveur : en échec, retenté au prochain passage du superviseur"
  fi

  # 2. Les PR du rôle (etat_des_pr).
  local branche depart ci="" conflit="" communs="" reparations=0
  if [ "$ROLE" = superviseur ]; then
    # Il n'a ni pistes ni PR à réparer : chaque passage relève l'état et part de la base.
    MODE=surveillance
    branche="agents/$ROLE/$horo"
    depart="$BASE_REF"
  else
    etat_des_pr
    # Ce que ce passage répare, pour les autres (reparation_vivante).
    if [ "$MODE" = reparation ]; then printf '%s\n' "$PR" > "$verrou/reparation"; fi
    if [ "$MODE" = nouveau ]; then
      branche="agents/$ROLE/$horo"
      # Le suffixe de l'instance, que lit instance_de_branche : sans lui, une PR de l'instance 2 est
      # lue comme de l'instance 1, qui ne peut pas la réparer (verif-instance rouge). Le
      # 2026-10-21, 78946f2e4 avait remonté cette ligne dans la branche du superviseur (#949).
      if [ "$INSTANCE" -gt 1 ]; then branche="$branche-$INSTANCE"; fi
      depart="$BASE_REF"
      travail_disponible
    fi
  fi

  # 3. L'arbre du rôle.
  avec_verrou_git preparer_arbre "$arbre" "$branche" "$depart" "$sortie"
  installer_dependances "$arbre"
  local sha_pre_dev
  sha_pre_dev="$(git -C "$CLONE" rev-parse --short "$BASE_REF")"

  # 4. L'agent.
  local message autres
  autres="$(GH_REPO="$GH_REPO" gh pr list --base pre-dev --state open --json number,title,body \
    --jq '.[] | "- #\(.number) \(.title)\n  \((.body // "") | split("\n") | map(select(test("^(Réfs|Angle) :"))) | join(" "))"')"
  message="Passage du $(date '+%Y-%m-%d %H:%M'), rôle $ROLE, mode $MODE.
Base du passage : $BASE_REF = $sha_pre_dev (partout où tes instructions écrivent origin/pre-dev, c'est elle). Ta branche : $branche. Dossier de rapport : $sortie.

PR ouvertes vers pre-dev (ce qu'elles citent est pris) :
${autres:-(aucune)}"
  if [ "$ROLE" = superviseur ]; then
    message="$message

Dossier des agents : $BASE (\$PISTES_BASE). Outils installés : $OUTILS_SHA. Cadences : le StartInterval des plists $HOME/Library/LaunchAgents/$LAUNCHD.*.plist.

Rouges triés par pistes.sh (superviseur.md, « Les rouges que le tri te laisse ») :
- pre-dev : $(if [ -e "$BASE/etat/pre-dev-rouge" ]; then printf 'ROUGE depuis %s — fusions suspendues' "$(tr '\t' ' ' < "$BASE/etat/pre-dev-rouge")"; else printf 'vert'; fi)
$(if [ -s "$BASE/etat/rouges/pre-dev" ]; then tail -n +2 "$BASE/etat/rouges/pre-dev" | sed 's/^/  · /'; fi)
- rouges communs à plusieurs PR, 24 dernières heures :
$(awk -F '\t' -v d="$(date -v-1d '+%Y-%m-%d %H:%M')" '$1 >= d { print "  · " $0 }' "$BASE/etat/rouges-communs.tsv" 2> /dev/null | tail -20)
- tests intermittents non traités :
$(intermittents_a_traiter | sed 's/^/  · /')
- PR rouges depuis plus de $((ROUGE_ANCIEN_S / 3600)) h (l'âge court depuis le premier run rouge conclu de la branche, toutes têtes confondues) :
$(rouges_anciens_du_passage "$sortie")"
  fi
  # Les rouges anciens que ce passage peut réparer, pour les autres (reparation_vivante).
  if [ "$ROLE" = superviseur ] && [ -s "$sortie/rouges-anciens.txt" ]; then
    cp "$sortie/rouges-anciens.txt" "$verrou/reparation"
  fi
  # La part d'une instance ne vaut que pour l'implémenteur : reçue par le délégué, elle lui a fait
  # écarter les angles impairs (2026-10-21, P103.*, P111.02, P111.04).
  if [ "$ROLE" = implementeur ] && [ "$INSTANCES_IMPLEMENTEUR" -gt 1 ]; then
    message="$message

Instance $INSTANCE sur $INSTANCES_IMPLEMENTEUR (implementeur.md, « Plusieurs instances ») : tu ne prends que les pistes P<nn>.… dont le numéro d'angle nn vaut $((INSTANCE - 1)) modulo $INSTANCES_IMPLEMENTEUR, et chaque ticket neuf prend le plus petit numéro au-dessus du plus grand vu qui vaut $((INSTANCE - 1)) modulo $INSTANCES_IMPLEMENTEUR."
  fi
  if [ "$MODE" = reparation ]; then
    local checks dernier
    checks="$(GH_REPO="$GH_REPO" gh pr checks "$PR" --json name,bucket,link --jq '.[] | select(.bucket == "fail" or .bucket == "cancel") | "- \(.name) : \(.link)"' 2> /dev/null || true)"
    # Le dernier run rouge CONCLU de la branche, toutes têtes confondues (amendement du 2026-10-24) :
    # quand la CI de la tête tourne encore, ou que la PR est en conflit, c'est le seul rouge connu.
    if dernier="$(rouge_conclu "$branche")"; then
      if [ -n "$dernier" ]; then
        dernier="$(rouge_conclu_lisible "$dernier")"
      else
        dernier="(aucun : le dernier verdict conclu de chaque workflow de ta branche est vert)"
      fi
    else
      dernier="(illisible : gh run list a échoué)"
      if [ -s "$BASE/etat/rouges/$PR" ]; then
        dernier="$dernier ; registre du tri, tête $(head -c 8 "$BASE/etat/rouges/$PR") :
$(tail -n +2 "$BASE/etat/rouges/$PR" | tr '\t' ' ' | sed 's/^/    · /')"
      fi
    fi
    message="$message

RÉPARATION de ta PR #$PR (tentative $((reparations + 1))/$REPARATIONS_MAX) : CI $ci, conflit $conflit.
Checks rouges de la tête courante :
${checks:-(aucun : la CI de la tête est en cours, ou la PR est en conflit — le dernier run rouge conclu ci-dessous reste à réparer)}

Dernier run rouge conclu de ta branche, toutes têtes confondues (commun.md, « Mode réparation ») :
$dernier"
    if [ -n "$communs" ]; then
      message="$message

Ces tests rougissent AUSSI sur d'autres PR ou sur pre-dev, dans des fichiers que ta PR ne touche pas : ne les répare pas ici, le superviseur les répare une fois, sur pre-dev. Répare le reste.
$communs"
    fi
  fi
  message="$message

Suis tes instructions d'agent, en commençant par .agent/agents/pistes/commun.md."

  local args statut=0
  args=(-p "$message" --agent "pistes-$ROLE" --setting-sources project
    --settings "$BASE/outils/reglages.json" --permission-mode bypassPermissions --strict-mcp-config
    --max-budget-usd "$(par_role BUDGET "$ROLE")" --output-format json)
  if [ -n "${MODELE:-}" ]; then args+=(--model "$MODELE"); fi
  info "agent pistes-$ROLE lancé ($MODE, branche $branche)"
  (
    cd "$arbre"
    export PISTES_ROLE="$ROLE" PISTES_ARBRE="$arbre" PISTES_SORTIE="$sortie" PISTES_DEPOT="$DEPOT" \
      PISTES_JOURNAL="$BASE/journaux/garde.tsv" PISTES_BASE="$BASE"
    lancer_claude "$(par_role DUREE "$ROLE")" "$CLAUDE_BIN" "${args[@]}" < /dev/null > "$sortie/claude.json" 2> "$sortie/claude.err"
  ) || statut=$?
  COUT="$(node -e 'try { const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); process.stdout.write(String(r.total_cost_usd ?? "")) } catch {}' "$sortie/claude.json")"
  TOURS="$(node -e 'try { const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); process.stdout.write(String(r.num_turns ?? "")) } catch {}' "$sortie/claude.json")"
  if [ "$statut" -eq 124 ]; then fin delai "durée maximale atteinte ; l'arbre est laissé tel quel, sauvé au prochain passage"; fi
  if [ "$statut" -ne 0 ]; then
    # La réparation rendue l'est REPARATIONS_MAX fois au plus par PR : une détection trop large ne
    # ferait pas tourner une PR sans fin.
    local panne rendues
    if [ "$MODE" = reparation ] && panne="$(panne_d_api "$sortie/claude.json")"; then
      rendues="$(cat "$BASE/etat/reparations-rendues-$ROLE-$PR" 2> /dev/null || echo 0)"
      if [ "$rendues" -lt "$REPARATIONS_MAX" ]; then
        printf '%s' "$reparations" > "$BASE/etat/reparations-$ROLE-$PR"
        printf '%s' "$((rendues + 1))" > "$BASE/etat/reparations-rendues-$ROLE-$PR"
        fin erreur "claude sorti en $statut sur une panne d'API ou de réseau (« $panne ») : réparation de #$PR non comptée"
      fi
    fi
    fin erreur "claude sorti en $statut (claude.err)"
  fi
  if [ "$ROLE" = superviseur ] && [ -s "$sortie/pr-reparee.txt" ]; then reparation_du_superviseur; fi

  # 5. Rien à proposer ?
  local avance
  avance="$(git -C "$arbre" rev-list --count "$depart..HEAD")"
  if [ "$avance" -eq 0 ]; then
    if [ -n "$(git -C "$arbre" status --porcelain)" ]; then fin refuse "modifications non commitées, aucun commit"; fi
    if [ "$ROLE" = superviseur ]; then
      if [ ! -s "$sortie/rapport.md" ]; then fin erreur "rapport.md absent"; fi
      fin surveille "$(head -n 1 "$sortie/rapport.md" | head -c 200)"
    fi
    if [ -f "$sortie/rien.txt" ]; then fin rien "$(head -c 200 "$sortie/rien.txt" | tr '\n' ' ')"; fi
    fin rien "aucun commit, sans rien.txt"
  fi

  # 6. Vérification, puis publication. La réparation d'une PR par le superviseur se vérifie depuis la
  # tête de la PR : depuis la base, le diff porterait aussi le lot de l'implémenteur.
  local depart_verifie
  if [ "$ROLE" = superviseur ] && [ "$MODE" = reparation ]; then
    depart_verifie="$depart"
  else
    depart_verifie="$(git -C "$arbre" merge-base HEAD "$BASE_REF")"
  fi
  if ! verifier "$arbre" "$sortie" "$depart_verifie"; then
    git -C "$arbre" format-patch --quiet -o "$sortie/patchs" "$(git -C "$arbre" merge-base HEAD "$BASE_REF")..HEAD" || true
    fin refuse "vérification rouge — rien n'est poussé ; correctifs dans $sortie/patchs"
  fi
  # Le titre ne sert qu'à créer la PR : une réparation ne le demande pas (commun.md, « Mode
  # réparation »), et l'exiger refusait toute réparation juste — 9 refus du 2026-10-17 au 2026-10-20,
  # dont les trois de #815.
  if [ ! -s "$sortie/pr-corps.md" ]; then fin refuse "pr-corps.md absent"; fi
  # Le superviseur publie en mode `surveillance` : seule une réparation commente une PR existante.
  # Avant le 2026-10-22, la création était réservée à `nouveau` : le passage du superviseur de 01:21
  # a poussé sa branche, puis commenté la PR « $PR » vide, et gh est sorti en « could not determine
  # current branch » : aucune PR, le correctif n'a atteint le porteur que par le rapport.
  if [ "$MODE" != reparation ] && [ ! -s "$sortie/pr-titre.txt" ]; then fin refuse "pr-titre.txt absent"; fi

  local pied verifs="" controle corps="$sortie/pr-corps-publie.md"
  if [ "$ROLE" = implementeur ]; then verifs=", gardes du dépôt, index du backlog et Pint verts"; fi
  controle="\`check-pistes --role $ROLE --base $BASE_REF\` vert$verifs"
  if [ "$ROLE" = superviseur ]; then controle="gardes du dépôt, index du backlog et Pint verts, fichier de pistes intouché"; fi
  pied="$(printf '%s\n' '' '---' \
    "Vérifié avant push par \`scripts/agents/pistes.sh\` (outils $OUTILS_SHA) : $controle." \
    "Passage $horo · $(($(date +%s) - DEBUT)) s · ${COUT:-?} USD · ${TOURS:-?} tours · arbre de départ \`$sha_pre_dev\`." \
    '' '🤖 Generated with [Claude Code](https://claude.com/claude-code)')"
  { sed '/Generated with \[Claude Code\]/d' "$sortie/pr-corps.md"; printf '%s\n' "$pied"; } > "$corps"

  if [ "$A_BLANC" -eq 1 ]; then
    fin a-blanc "aurait poussé $branche ($avance commits) et publié « $(head -n 1 "$sortie/pr-titre.txt" 2> /dev/null || echo "réparation de #$PR") » ; corps dans $corps"
  fi
  # Jamais forcé : une branche de PR que quelqu'un a poussée entre-temps refuse, sans rien perdre.
  git -C "$arbre" push --quiet -u origin "HEAD:refs/heads/$branche" \
    || fin erreur "push de $branche refusé (la branche a bougé pendant le passage ?) ; commits dans l'arbre $arbre"
  if [ "$MODE" != reparation ]; then
    PR="$(GH_REPO="$GH_REPO" gh pr create --base pre-dev --head "$branche" --label "agent:$ROLE" \
      --title "$(head -n 1 "$sortie/pr-titre.txt")" --body-file "$corps" | sed 's#.*/##')"
    if [ "$ROLE" = superviseur ]; then notifier "PR #$PR ouverte : $(head -n 1 "$sortie/pr-titre.txt")"; fi
    fin publie "PR #$PR ouverte"
  fi
  GH_REPO="$GH_REPO" gh pr comment "$PR" --body-file "$corps" > /dev/null
  if [ "$ROLE" = superviseur ]; then notifier "PR #$PR réparée par le superviseur, sur sa branche"; fi
  fin repare "PR #$PR : réparation poussée"
}

# ─── actions du superviseur ───────────────────────────────────────────────────────────────────
#
# Amendement d'ADR-0066 du 2026-10-21, « le superviseur ». Le superviseur agit sur l'état des agents
# par ces verbes, et par rien d'autre : la garde lui refuse `launchctl` hors lecture, `kill`,
# `gh run rerun`, et toute écriture shell dans $BASE. Chaque verbe vérifie ses bornes ICI, dans
# l'outil installé qu'aucun agent ne modifie, écrit une ligne au journal et, quand il change quelque
# chose, prévient le porteur. Le porteur peut s'en servir à la main.

# Une pause posée par le superviseur commence par « superviseur » ; celle du porteur (`pause`) est
# un fichier vide, ou de sa main.
pause_du_superviseur() {
  [ "$(head -c 11 "$1" 2> /dev/null)" = superviseur ]
}

journaliser_action() {
  printf '%s\tsuperviseur\t-\taction\t-\t-\t-\t-\t%s\n' "$(date '+%Y-%m-%d %H:%M')" "$(printf '%s' "$*" | tr '\t\n' '  ' | head -c 300)" >> "$BASE/journal.tsv"
}

# Notification macOS (2a du porteur, 2026-10-21 : seulement quand le superviseur a corrigé ou mis en
# pause quelque chose). Le texte passe en argument, jamais dans le source AppleScript.
notifier() {
  journaliser_action "notification : $*"
  prevenir_porteur "$*"
}

prevenir_porteur() {
  osascript -e 'on run argv' -e 'display notification (item 1 of argv) with title "Takussan · superviseur" sound name "Glass"' \
    -e 'end run' "$*" > /dev/null 2>&1 || true
}

# Les noms de passage : un par arbre de rôle (les arbres d'essai du fusionneur n'en sont pas).
noms_de_passage() {
  local a n
  for a in "$BASE"/arbres/*; do
    [ -d "$a" ] || continue
    n="${a##*/}"
    case "$n" in essai-* | superviseur) continue ;; esac
    printf '%s\n' "$n"
  done
}

# Prend le verrou d'un passage le temps d'une action : un passage en cours le tient, et l'action
# l'épargne ; un passage qui voudrait partir pendant l'action trouve le verrou pris et s'arrête en
# « occupé ». Rend 1 si un passage vivant tient le verrou.
prendre_verrou() {
  local v="$BASE/verrous/$1" pid
  if ! mkdir "$v" 2> /dev/null; then
    pid="$(cat "$v/pid" 2> /dev/null || true)"
    if [ -n "$pid" ] && kill -0 "$pid" 2> /dev/null; then return 1; fi
    rm -rf "$v"
    mkdir "$v" || return 1
  fi
  printf '%s' "$$" > "$v/pid"
}

action_reposer() {
  local job="${1:-}" plist intervalle uid
  uid="$(id -u)"
  case "$job" in
    '' | *[!a-z0-9-]*) die "reposer <job> : explorateur, mesureur, implementeur[-k], delegue, fusionneur" ;;
    superviseur) die "le superviseur ne se repose pas lui-même" ;;
  esac
  plist="$HOME/Library/LaunchAgents/$LAUNCHD.$job.plist"
  [ -f "$plist" ] || die "$job : aucun plist ($plist) — le porteur le pose par « planifier »"
  intervalle="$(/usr/libexec/PlistBuddy -c 'Print :StartInterval' "$plist")"
  # Décharger un job tue son passage en cours : on le laisse finir.
  if launchctl print "gui/$uid/$LAUNCHD.$job" > /dev/null 2>&1; then
    prendre_verrou "$job" || die "$job : un passage est en cours, il n'est pas interrompu ; réessayer à un passage suivant"
    charger_job "$job" "$plist"
    rm -rf "$BASE/verrous/$job"
  else
    charger_job "$job" "$plist"
  fi
  launchctl print "gui/$uid/$LAUNCHD.$job" 2> /dev/null | grep -q "run interval = $intervalle seconds" \
    || die "$job rechargé, mais launchd ne rend pas la cadence de $intervalle s"
  info "$job rechargé, toutes les $((intervalle / 60)) min"
  notifier "job $job rechargé (toutes les $((intervalle / 60)) min)"
}

action_balayer() {
  local n total=0
  for n in $(noms_de_passage); do
    if ! prendre_verrou "$n"; then
      info "$n : passage en cours, épargné"
      continue
    fi
    NOM="$n" balayer_processus
    rm -rf "$BASE/verrous/$n"
    total=$((total + BALAYES))
  done
  journaliser_action "balayer : $total processus visés"
  if [ "$total" -gt 0 ]; then notifier "$total processus orphelins arrêtés"; fi
  info "balayage fini ($total processus visés)"
}

action_purger() {
  local n avant apres cache
  avant="$(du -sk "$BASE" | cut -f1)"
  for n in $(noms_de_passage); do
    prendre_verrou "$n" || { info "$n : passage en cours, épargné"; continue; }
    find "$BASE/sorties/$n" -mindepth 1 -maxdepth 1 -type d -mtime +"$SORTIES_JOURS" -exec rm -rf {} + 2> /dev/null || true
    cache="$BASE/arbres/$n/takussan-web/.next/dev/cache"
    if [ -d "$cache" ] && [ "$(du -sk "$cache" | cut -f1)" -gt "$NEXT_CACHE_MAX_KO" ]; then rm -rf "$cache"; fi
    rm -rf "$BASE/verrous/$n"
  done
  find "$BASE/sorties/essais" -type f -mtime +"$SORTIES_JOURS" -delete 2> /dev/null || true
  apres="$(du -sk "$BASE" | cut -f1)"
  journaliser_action "purger : $(((avant - apres) / 1024)) Mo libérés"
  if [ "$((avant - apres))" -gt 102400 ]; then notifier "$(((avant - apres) / 1024)) Mo libérés dans le dossier des agents"; fi
  info "$(((avant - apres) / 1024)) Mo libérés ($((apres / 1024)) Mo restent)"
}

fichier_de_pause() {
  case "${1:-}" in
    tous) printf '%s' "$BASE/PAUSE" ;;
    explorateur | mesureur | implementeur | delegue | fusionneur) printf '%s' "$BASE/PAUSE-$1" ;;
    *) die "rôle « ${1:-} » : explorateur, mesureur, implementeur, delegue, fusionneur ou tous" ;;
  esac
}

action_pause() {
  local f raison="${2:-}"
  f="$(fichier_de_pause "${1:-}")"
  [ "${#raison}" -ge 10 ] || die "pause $1 « <raison> » : la raison dit la cause établie (10 caractères au moins)"
  if [ -e "$f" ] && ! pause_du_superviseur "$f"; then
    info "${f##*/} : déjà posée par le porteur, laissée telle quelle"
    return 0
  fi
  printf 'superviseur %s : %s\n' "$(date '+%Y-%m-%d %H:%M')" "$raison" > "$f"
  journaliser_action "pause $1 : $raison"
  notifier "pause $1 : $raison"
  info "${f##*/} posée"
}

action_reprendre() {
  local f
  f="$(fichier_de_pause "${1:-}")"
  [ -e "$f" ] || { info "${f##*/} : aucune pause"; return 0; }
  pause_du_superviseur "$f" || die "${f##*/} est une pause du porteur : elle ne se lève que par lui"
  rm -f "$f"
  journaliser_action "reprise $1"
  notifier "reprise $1"
  info "${f##*/} levée"
}

action_relancer_ci() {
  local run="${1:-}" lu branche conclusion
  case "$run" in '' | *[!0-9]*) die "relancer-ci <run-id>" ;; esac
  [ ! -e "$BASE/etat/relance-ci-$run" ] || die "le run $run a déjà été relancé une fois : la cause n'est pas passagère"
  lu="$(GH_REPO="$GH_REPO" gh run view "$run" --json headBranch,conclusion --jq '"\(.headBranch)\t\(.conclusion)"')" || die "run $run illisible"
  IFS=$'\t' read -r branche conclusion <<< "$lu"
  case "$branche" in pre-dev | agents/*) ;; *) die "run $run sur « $branche » : seuls pre-dev et les branches d'agents" ;; esac
  case "$conclusion" in failure | cancelled | timed_out | startup_failure) ;; *) die "run $run : conclusion « $conclusion », rien à relancer" ;; esac
  GH_REPO="$GH_REPO" gh run rerun "$run" --failed
  touch "$BASE/etat/relance-ci-$run"
  journaliser_action "relancer-ci $run ($branche, $conclusion)"
  notifier "CI relancée : run $run ($branche)"
  info "run $run relancé ($branche)"
}

# Les tests intermittents notés (noter_intermittents) que le superviseur n'a pas encore traités :
# un run se marque traité par `action intermittent <run> "<suite>"`.
intermittents_a_traiter() {
  [ -f "$BASE/etat/intermittents.tsv" ] || return 0
  awk -F '\t' 'NR == FNR { traite[$2] = 1; next } !($2 in traite)' \
    "$BASE/etat/intermittents-traites.tsv" "$BASE/etat/intermittents.tsv" 2> /dev/null \
    || cat "$BASE/etat/intermittents.tsv"
}

action_intermittent() {
  local run="${1:-}" suite="${2:-}"
  case "$run" in '' | *[!0-9]*) die "intermittent <run-id> \"<suite donnée>\"" ;; esac
  [ "${#suite}" -ge 10 ] || die "intermittent $run « <suite> » : la PR de correctif, ou pourquoi il n'y en a pas (10 caractères au moins)"
  grep -q "	$run	" "$BASE/etat/intermittents.tsv" 2> /dev/null || die "run $run : aucun test intermittent noté sous ce run"
  printf '%s\t%s\t%s\n' "$(date '+%Y-%m-%d %H:%M')" "$run" "$suite" >> "$BASE/etat/intermittents-traites.tsv"
  journaliser_action "intermittent $run traité : $suite"
  info "run $run : intermittent traité ($suite)"
}

# Ferme une PR du superviseur devenue sans objet (amendement d'ADR-0066 du 2026-10-22, bis) : #1097
# est restée onze heures en conflit, redondante avec un correctif arrivé par une autre PR, sans
# qu'aucun verbe ne puisse la fermer. Seulement les siennes : ouvertes, vers pre-dev, tête
# agents/superviseur/*.
action_fermer() {
  local num="${1:-}" raison="${2:-}" lu etat base tete
  case "$num" in '' | *[!0-9]*) die "fermer <pr> \"<raison>\"" ;; esac
  [ "${#raison}" -ge 10 ] || die "fermer $num « <raison> » : pourquoi la PR n'a plus d'objet (10 caractères au moins)"
  lu="$(GH_REPO="$GH_REPO" gh pr view "$num" --json state,baseRefName,headRefName --jq '"\(.state)|\(.baseRefName)|\(.headRefName)"')" || die "PR #$num illisible"
  IFS='|' read -r etat base tete <<< "$lu"
  [ "$etat" = OPEN ] || die "#$num : état « $etat », rien à fermer"
  [ "$base" = pre-dev ] || die "#$num vise « $base » : seules les PR vers pre-dev"
  case "$tete" in agents/superviseur/?*) ;; *) die "#$num a pour tête « $tete » : le superviseur ne ferme que ses propres PR (agents/superviseur/*)" ;; esac
  GH_REPO="$GH_REPO" gh pr close "$num" --delete-branch --comment "Fermée par le superviseur : $raison" > /dev/null
  journaliser_action "fermer #$num ($tete) : $raison"
  notifier "PR #$num fermée : $raison"
  info "#$num fermée ($tete)"
}

action() {
  charger_config
  local verbe="${1:-}"
  shift || true
  case "$verbe" in
    reposer) action_reposer "$@" ;;
    balayer) action_balayer ;;
    purger) action_purger ;;
    pause) action_pause "$@" ;;
    reprendre) action_reprendre "$@" ;;
    relancer-ci) action_relancer_ci "$@" ;;
    intermittent) action_intermittent "$@" ;;
    fermer) action_fermer "$@" ;;
    notifier) [ -n "${1:-}" ] || die "notifier <texte>"; notifier "$*" ;;
    *) die "action <verbe> : reposer, balayer, purger, pause, reprendre, relancer-ci, intermittent, fermer, notifier" ;;
  esac
}

case "${1:-}" in
  installer) installer "${2:-}" ;;
  planifier) shift; planifier "$@" ;;
  deplanifier) deplanifier ;;
  lancer)
    # lancer <rôle> [<k>] [--a-blanc]
    instance=1
    for a in "${@:3}"; do
      case "$a" in
        --a-blanc) A_BLANC=1 ;;
        *) instance="$a" ;;
      esac
    done
    lancer "${2:-}" "$instance"
    ;;
  etat) etat ;;
  releve) releve "${2:-}" ;;
  fusionner) fusionner ;;
  archiver)
    charger_config
    for a in "${@:2}"; do
      case "$a" in
        --a-blanc) A_BLANC=1 ;;
        *) die "usage : archiver [--a-blanc]" ;;
      esac
    done
    statut=0
    archiver_pistes || statut=$?
    [ "$statut" -ne 1 ] || die "archivage en échec (journal ci-dessus, et $BASE/sorties/archiveur/)"
    ;;
  pause) mkdir -p "$BASE" && touch "$BASE/PAUSE" && info "pause : aucun passage ne démarre (« reprendre » pour lever)" ;;
  reprendre) rm -f "$BASE/PAUSE" && info "reprise" ;;
  action) shift; action "$@" ;;
  *) sed -n '2,31p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac
