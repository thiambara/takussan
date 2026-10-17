#!/usr/bin/env bash
# Orchestration des trois agents des pistes — ADR-0066 § 4.
#
# L'agent PROPOSE (des commits dans son arbre, un titre et un corps de PR dans son dossier de
# sortie) ; ce script VÉRIFIE (périmètre du rôle, gardes) puis PUBLIE (push, PR vers `pre-dev`).
# Rien de ce que l'agent écrit ne quitte le poste sans être passé par `verifier`.
#
# Usage, depuis le dépôt :
#   scripts/agents/pistes.sh installer [--sans-etiquettes]   # outils figés, réglages, étiquettes GitHub
#   scripts/agents/pistes.sh planifier X Y Z      # launchd : explorateur toutes les X min, mesureur Y, implémenteur Z
#   scripts/agents/pistes.sh deplanifier
# Puis, depuis n'importe où (copie figée) :
#   ~/.takussan-agents/outils/pistes.sh lancer <rôle>   # un passage, à la main ou par launchd
#   ~/.takussan-agents/outils/pistes.sh lancer <rôle> --a-blanc
#       # un passage complet SANS RIEN PUBLIER (ni push, ni PR, ni fusion) ; avec
#       # PISTES_BASE_REF=<ref> il part d'une autre base que origin/pre-dev
#   ~/.takussan-agents/outils/pistes.sh fusionner   # fusionne les PR vertes (launchd, toutes les 10 min)
#   ~/.takussan-agents/outils/pistes.sh etat
#   ~/.takussan-agents/outils/pistes.sh pause | reprendre
#
# Compatible bash 3.2 : launchd lance /bin/bash, celui de macOS.
set -euo pipefail
# launchd passe LANG=fr_FR.UTF-8 : sysctl écrirait alors la charge « 2,87 », qu'awk compare comme
# du TEXTE (« 2,87 » > « 12 »). Mesuré le 2026-10-15 : tous les passages s'arrêtaient pour « charge ».
export LC_NUMERIC=C

BASE="${PISTES_BASE:-$HOME/.takussan-agents}"
ROLES="explorateur mesureur implementeur"
LAUNCHD=com.takussan.agents

die() {
  DETAIL="$*"
  printf '✗ %s\n' "$*" >&2
  exit 1
}
info() { printf '%s  %s\n' "$(date '+%H:%M:%S')" "$*"; }

valider_role() {
  case "${1:-}" in
    explorateur | mesureur | implementeur) ;;
    *) die "rôle inconnu « ${1:-} » (explorateur, mesureur, implementeur)" ;;
  esac
}

charger_config() {
  [ -f "$BASE/machine.env" ] || die "non installé : lancer « scripts/agents/pistes.sh installer » depuis le dépôt"
  # shellcheck source=/dev/null
  . "$BASE/machine.env"
  # shellcheck source=/dev/null
  . "$BASE/config.env"
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
  cp "$ici/garde.mjs" "$BASE/outils/garde.mjs"
  cp "$ici/pistes.sh" "$BASE/outils/pistes.sh"
  chmod +x "$BASE/outils/pistes.sh"

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
# Durée maximale d'un passage (secondes) ; à l'échéance, tout le groupe de processus est tué.
DUREE_EXPLORATEUR=2700
DUREE_MESUREUR=2700
DUREE_IMPLEMENTEUR=9000
# Au-delà de cette charge (moyenne à 5 min), aucun passage ne démarre. Vide = 1,5 × nombre de cœurs.
CHARGE_MAX=
# Réparations successives d'une même PR avant abandon (le porteur prend la main).
REPARATIONS_MAX=3
# PR ouvertes à la fois par rôle ; vide = 3 pour l'implémenteur, 1 pour les autres.
PR_MAX_EXPLORATEUR=
PR_MAX_MESUREUR=
PR_MAX_IMPLEMENTEUR=
# Modèle ; vide = celui du compte.
MODELE=
CONFIG
  fi

  if [ "${1:-}" != --sans-etiquettes ]; then (
    cd "$depot"
    gh label create agent:explorateur --color 1d76db --description "PR de l'agent explorateur (ADR-0066)" --force > /dev/null
    gh label create agent:mesureur --color 5319e7 --description "PR de l'agent mesureur (ADR-0066)" --force > /dev/null
    gh label create agent:implementeur --color b60205 --description "PR de l'agent implémenteur (ADR-0066)" --force > /dev/null
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
  cat > "$plist" << PLIST
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
  launchctl bootout "gui/$uid/$LAUNCHD.$nom" 2> /dev/null || true
  launchctl bootstrap "gui/$uid" "$plist"
}

planifier() {
  charger_config
  [ $# -eq 3 ] || die "usage : planifier <x> <y> <z>  (minutes : explorateur, mesureur, implementeur)"
  local minutes role
  for role in $ROLES; do
    minutes="$1"
    shift
    case "$minutes" in '' | *[!0-9]*) die "« $minutes » n'est pas un nombre de minutes" ;; esac
    [ "$minutes" -ge 5 ] || die "$role : 5 minutes au moins entre deux passages"
    poser_job "$role" $((minutes * 60)) lancer "$role"
    info "$role : toutes les $minutes min"
  done
  poser_job fusionneur 600 fusionner
  info "fusionneur : toutes les 10 min (sans modèle)"
}

deplanifier() {
  local job uid
  uid="$(id -u)"
  for job in $ROLES fusionneur; do
    launchctl bootout "gui/$uid/$LAUNCHD.$job" 2> /dev/null || true
    rm -f "$HOME/Library/LaunchAgents/$LAUNCHD.$job.plist"
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
essai_de_fusion() {
  local num="$1" tete="$2" arbre="$BASE/arbres/essai-${ROLE:-fusionneur}" rapport cle g echecs=0
  rapport="$BASE/sorties/essais/$num.txt"
  mkdir -p "$BASE/sorties/essais"
  avec_verrou_git git -C "$CLONE" fetch origin --prune --quiet || return 1
  cle="$(git -C "$CLONE" rev-parse "$BASE_REF") $(git -C "$CLONE" rev-parse "origin/$tete")"
  # Même base, même tête qu'un refus déjà journalisé : rien n'a changé, on ne le redit pas.
  [ "$cle" != "$(cat "$BASE/etat/essai-$num" 2> /dev/null || true)" ] || return 1
  if [ ! -d "$arbre" ]; then
    avec_verrou_git git -C "$CLONE" worktree add --quiet --detach "$arbre" "$BASE_REF" || return 1
  fi
  # Appelée derrière `||` ou `&&`, cette fonction tourne SANS `set -e` : chaque étape se vérifie.
  git -C "$arbre" merge --abort > /dev/null 2>&1 || true
  git -C "$arbre" reset --quiet --hard || return 1
  git -C "$arbre" clean -fdq || return 1
  git -C "$arbre" checkout --quiet --detach "$BASE_REF" || return 1
  {
    echo "essai de #$num ($tete) sur $BASE_REF — $(date '+%Y-%m-%d %H:%M:%S')"
    if ! git -C "$arbre" merge --no-edit --quiet "origin/$tete" 2>&1; then
      echo "✗ conflit de fusion"
      echecs=1
    else
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
  printf '%s\t%s\t-\trefuse\t%s\t-\t-\t-\t%s\n' "$(date '+%Y-%m-%d %H:%M')" "${ROLE:-fusionneur}" "$num" \
    "essai de fusion rouge : $(grep '^✗' "$rapport" | tr '\n' ' ')" >> "$BASE/journal.tsv"
  return 1
}

# Fusionne dans pre-dev, DÈS que leur CI est verte et sans conflit, les PR des agents et la PR de
# synchronisation dev → pre-dev. Aucun modèle : rien n'y décide, tout y est vérifié, et un passage
# ne coûte rien. Sans lui, une PR verte attendait le passage suivant de SON agent (jusqu'à 3 h pour
# l'explorateur), qui restait bloqué entre-temps (une PR ouverte par rôle). ADR-0066 § 4.
fusionner() {
  charger_config
  if [ -e "$BASE/PAUSE" ] || [ "$FUSION" != auto ]; then return 0; fi
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
    # UNKNOWN juste après une autre fusion : GitHub recalcule, le tour suivant tranchera.
    [ "$mergeable" = MERGEABLE ] || continue
    [ "$(etat_ci "$num")" = vert ] || continue
    essai_de_fusion "$num" "$tete" || continue
    if [ "$tete" = dev ]; then
      # Jamais --delete-branch ici : la tête de cette PR est dev.
      GH_REPO="$GH_REPO" gh pr merge "$num" --merge > /dev/null || continue
    else
      GH_REPO="$GH_REPO" gh pr merge "$num" --merge --delete-branch > /dev/null || continue
    fi
    info "#$num fusionnée dans pre-dev ($tete)"
    printf '%s\tfusionneur\t-\tfusionne\t%s\t-\t-\t-\t%s\n' "$(date '+%Y-%m-%d %H:%M')" "$num" "$tete" >> "$BASE/journal.tsv"
  done
}

# ─── état ─────────────────────────────────────────────────────────────────────────────────────

etat() {
  charger_config
  local role uid
  uid="$(id -u)"
  if [ -e "$BASE/PAUSE" ]; then echo "⏸  PAUSE active ($BASE/PAUSE)"; fi
  echo "outils $OUTILS_SHA · fusion $FUSION · dépôt $GH_REPO"
  for role in $ROLES; do
    printf '\n%s\n' "── $role"
    if launchctl print "gui/$uid/$LAUNCHD.$role" > /dev/null 2>&1; then echo "  planifié (launchd)"; else echo "  non planifié"; fi
    if [ -d "$BASE/verrous/$role" ]; then echo "  passage en cours (pid $(cat "$BASE/verrous/$role/pid" 2> /dev/null || echo '?'))"; fi
    if [ -f "$BASE/journal.tsv" ]; then
      awk -F '\t' -v r="$role" '$2 == r' "$BASE/journal.tsv" | tail -3 | sed 's/^/  /'
    fi
  done
  printf '\n%s\n' "── fusionneur"
  if launchctl print "gui/$uid/$LAUNCHD.fusionneur" > /dev/null 2>&1; then echo "  planifié (launchd, 10 min)"; else echo "  non planifié"; fi
  if [ -f "$BASE/journal.tsv" ]; then awk -F '\t' '$2 == "fusionneur"' "$BASE/journal.tsv" | tail -3 | sed 's/^/  /'; fi
  printf '\n%s\n' "── PR ouvertes vers pre-dev"
  GH_REPO="$GH_REPO" gh pr list --base pre-dev --state open --json number,title,labels \
    --jq '.[] | "  #\(.number)  \(.title)"'
}

# ─── un passage ───────────────────────────────────────────────────────────────────────────────

ROLE=""
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
  printf '%s\t%s\t%s\t%s\t%s\t%ss\t%s\t%s\t%s\n' "$(date '+%Y-%m-%d %H:%M')" "$ROLE" "${MODE:--}" \
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

# État CI d'une PR : vert, rouge, attente.
etat_ci() {
  local buckets
  buckets="$(GH_REPO="$GH_REPO" gh pr checks "$1" --json bucket --jq '[.[].bucket] | join(" ")' 2> /dev/null || true)"
  case " $buckets " in
    "  ") echo attente ;;
    *" pending "*) echo attente ;;
    *" fail "* | *" cancel "*) echo rouge ;;
    *) echo vert ;;
  esac
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
  if [ ! -d "$arbre/takussan-api/vendor" ] || [ "$h" != "$(cat "$BASE/etat/composer-$ROLE" 2> /dev/null || true)" ]; then
    (cd "$arbre/takussan-api" && composer install --no-interaction --no-progress --quiet)
    printf '%s' "$h" > "$BASE/etat/composer-$ROLE"
  fi
  h="$(shasum "$arbre/takussan-web/package-lock.json" | cut -c1-40)"
  if [ ! -d "$arbre/takussan-web/node_modules" ] || [ "$h" != "$(cat "$BASE/etat/npm-$ROLE" 2> /dev/null || true)" ]; then
    (cd "$arbre/takussan-web" && npm ci --silent --no-audit --no-fund)
    printf '%s' "$h" > "$BASE/etat/npm-$ROLE"
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
  # La garde de périmètre jouée est celle d'origin/pre-dev, pas celle de la branche de l'agent.
  git -C "$CLONE" show "$BASE_REF:scripts/check-pistes.mjs" > "$fige"
  if ! (cd "$arbre" && CHECK_PISTES_RACINE="$arbre" node "$fige" --role "$ROLE" --base "$BASE_REF") > "$sortie/verif-pistes.txt" 2>&1; then
    info "✗ check-pistes --role $ROLE (verif-pistes.txt)"
    echecs=$((echecs + 1))
  fi
  if [ "$ROLE" = implementeur ]; then
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
etat_des_pr() {
  local pr_max lignes num tete etat_fusion ci_pr conflit_pr ouvertes=0 fusionnees=0 abandons=""
  pr_max="$(par_role PR_MAX "$ROLE")"
  if [ -z "$pr_max" ]; then
    if [ "$ROLE" = implementeur ]; then pr_max=3; else pr_max=1; fi
  fi
  lignes="$(GH_REPO="$GH_REPO" gh pr list --base pre-dev --state open --label "agent:$ROLE" \
    --json number,headRefName,mergeable --jq 'sort_by(.number) | .[] | "\(.number)\t\(.headRefName)\t\(.mergeable)"')"
  MODE=nouveau
  while IFS=$'\t' read -r num tete etat_fusion; do
    [ -n "$num" ] || continue
    ci_pr="$(etat_ci "$num")"
    conflit_pr=non
    if [ "$etat_fusion" = CONFLICTING ]; then conflit_pr=oui; fi
    if [ "$conflit_pr" = non ] && [ "$ci_pr" != rouge ]; then
      if [ "$ci_pr" = vert ] && [ "$FUSION" = auto ] && [ "$A_BLANC" -eq 0 ] && essai_de_fusion "$num" "$tete"; then
        GH_REPO="$GH_REPO" gh pr merge "$num" --merge --delete-branch > /dev/null 2>&1 || true
        # Le fusionneur a pu passer entre-temps ; un refus (mergeable pas encore recalculé) attend.
        if [ "$(GH_REPO="$GH_REPO" gh pr view "$num" --json state --jq .state)" = MERGED ]; then
          info "PR #$num fusionnée dans pre-dev"
          fusionnees=1
          continue
        fi
      fi
      ouvertes=$((ouvertes + 1))
      continue
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

lancer() {
  ROLE="$1"
  valider_role "$ROLE"
  charger_config
  DEBUT="$(date +%s)"
  local horo sortie arbre verrou
  horo="$(date +%Y%m%d-%H%M%S)"
  sortie="$BASE/sorties/$ROLE/$horo"
  arbre="$BASE/arbres/$ROLE"
  verrou="$BASE/verrous/$ROLE"
  mkdir -p "$sortie"
  exec >> "$sortie/passage.log" 2>&1
  trap journaliser EXIT

  # 1. Arrêts préalables, avant toute dépense.
  if [ -e "$BASE/PAUSE" ]; then fin pause "fichier PAUSE présent"; fi
  if ! mkdir "$verrou" 2> /dev/null; then
    local pid
    pid="$(cat "$verrou/pid" 2> /dev/null || true)"
    if [ -n "$pid" ] && kill -0 "$pid" 2> /dev/null; then fin occupe "passage précédent en cours (pid $pid)"; fi
    rm -rf "$verrou"
    mkdir "$verrou"
  fi
  printf '%s' "$$" > "$verrou/pid"
  trap 'rm -rf "$verrou"; journaliser' EXIT

  local charge max
  charge="$(sysctl -n vm.loadavg | awk '{print $3}' | tr ',' '.')"
  max="${CHARGE_MAX:-$(($(sysctl -n hw.ncpu) * 3 / 2))}"
  if awk -v c="$charge" -v m="$max" 'BEGIN { exit !(c > m) }'; then fin charge "charge $charge > $max"; fi

  avec_verrou_git recuperer

  # 2. Les PR du rôle (etat_des_pr).
  local branche depart ci="" conflit="" reparations=0
  etat_des_pr
  if [ "$MODE" = nouveau ]; then
    branche="agents/$ROLE/$horo"
    depart="$BASE_REF"
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
  if [ "$MODE" = reparation ]; then
    message="$message

RÉPARATION de ta PR #$PR (tentative $((reparations + 1))/$REPARATIONS_MAX) : CI $ci, conflit $conflit.
Checks rouges :
$(GH_REPO="$GH_REPO" gh pr checks "$PR" --json name,bucket,link --jq '.[] | select(.bucket == "fail" or .bucket == "cancel") | "- \(.name) : \(.link)"' 2> /dev/null || true)"
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
      PISTES_JOURNAL="$BASE/journaux/garde.tsv"
    lancer_claude "$(par_role DUREE "$ROLE")" "$CLAUDE_BIN" "${args[@]}" < /dev/null > "$sortie/claude.json" 2> "$sortie/claude.err"
  ) || statut=$?
  COUT="$(node -e 'try { const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); process.stdout.write(String(r.total_cost_usd ?? "")) } catch {}' "$sortie/claude.json")"
  TOURS="$(node -e 'try { const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); process.stdout.write(String(r.num_turns ?? "")) } catch {}' "$sortie/claude.json")"
  if [ "$statut" -eq 124 ]; then fin delai "durée maximale atteinte ; l'arbre est laissé tel quel, sauvé au prochain passage"; fi
  if [ "$statut" -ne 0 ]; then fin erreur "claude sorti en $statut (claude.err)"; fi

  # 5. Rien à proposer ?
  local avance
  avance="$(git -C "$arbre" rev-list --count "$depart..HEAD")"
  if [ "$avance" -eq 0 ]; then
    if [ -n "$(git -C "$arbre" status --porcelain)" ]; then fin refuse "modifications non commitées, aucun commit"; fi
    if [ -f "$sortie/rien.txt" ]; then fin rien "$(head -c 200 "$sortie/rien.txt" | tr '\n' ' ')"; fi
    fin rien "aucun commit, sans rien.txt"
  fi

  # 6. Vérification, puis publication.
  if ! verifier "$arbre" "$sortie" "$(git -C "$arbre" merge-base HEAD "$BASE_REF")"; then
    git -C "$arbre" format-patch --quiet -o "$sortie/patchs" "$(git -C "$arbre" merge-base HEAD "$BASE_REF")..HEAD" || true
    fin refuse "vérification rouge — rien n'est poussé ; correctifs dans $sortie/patchs"
  fi
  if [ ! -s "$sortie/pr-titre.txt" ] || [ ! -s "$sortie/pr-corps.md" ]; then fin refuse "pr-titre.txt ou pr-corps.md absent"; fi

  local pied verifs="" corps="$sortie/pr-corps-publie.md"
  if [ "$ROLE" = implementeur ]; then verifs=", gardes du dépôt, index du backlog et Pint verts"; fi
  pied="$(printf '%s\n' '' '---' \
    "Vérifié avant push par \`scripts/agents/pistes.sh\` (outils $OUTILS_SHA) : \`check-pistes --role $ROLE --base $BASE_REF\` vert$verifs." \
    "Passage $horo · $(($(date +%s) - DEBUT)) s · ${COUT:-?} USD · ${TOURS:-?} tours · arbre de départ \`$sha_pre_dev\`." \
    '' '🤖 Generated with [Claude Code](https://claude.com/claude-code)')"
  { sed '/Generated with \[Claude Code\]/d' "$sortie/pr-corps.md"; printf '%s\n' "$pied"; } > "$corps"

  if [ "$A_BLANC" -eq 1 ]; then
    fin a-blanc "aurait poussé $branche ($avance commits) et publié « $(head -n 1 "$sortie/pr-titre.txt") » ; corps dans $corps"
  fi
  git -C "$arbre" push --quiet -u origin "HEAD:refs/heads/$branche"
  if [ "$MODE" = nouveau ]; then
    PR="$(GH_REPO="$GH_REPO" gh pr create --base pre-dev --head "$branche" --label "agent:$ROLE" \
      --title "$(head -n 1 "$sortie/pr-titre.txt")" --body-file "$corps" | sed 's#.*/##')"
    fin publie "PR #$PR ouverte"
  fi
  GH_REPO="$GH_REPO" gh pr comment "$PR" --body-file "$corps" > /dev/null
  fin repare "PR #$PR : réparation poussée"
}

case "${1:-}" in
  installer) installer "${2:-}" ;;
  planifier) shift; planifier "$@" ;;
  deplanifier) deplanifier ;;
  lancer)
    if [ "${3:-}" = --a-blanc ]; then A_BLANC=1; fi
    lancer "${2:-}"
    ;;
  etat) etat ;;
  fusionner) fusionner ;;
  pause) mkdir -p "$BASE" && touch "$BASE/PAUSE" && info "pause : aucun passage ne démarre (« reprendre » pour lever)" ;;
  reprendre) rm -f "$BASE/PAUSE" && info "reprise" ;;
  *) sed -n '2,21p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac
