#!/usr/bin/env bash
# Orchestration des trois agents des pistes — ADR-0066 § 4.
#
# L'agent PROPOSE (des commits dans son arbre, un titre et un corps de PR dans son dossier de
# sortie) ; ce script VÉRIFIE (périmètre du rôle, gardes) puis PUBLIE (push, PR vers `pre-dev`).
# Rien de ce que l'agent écrit ne quitte le poste sans être passé par `verifier`.
#
# Usage, depuis le dépôt :
#   scripts/agents/pistes.sh installer            # outils figés, réglages, étiquettes GitHub
#   scripts/agents/pistes.sh planifier X Y Z      # launchd : explorateur toutes les X min, mesureur Y, implémenteur Z
#   scripts/agents/pistes.sh deplanifier
# Puis, depuis n'importe où (copie figée) :
#   ~/.takussan-agents/outils/pistes.sh lancer <rôle>   # un passage, à la main ou par launchd
#   ~/.takussan-agents/outils/pistes.sh lancer <rôle> --a-blanc
#       # un passage complet SANS RIEN PUBLIER (ni push, ni PR, ni fusion) ; avec
#       # PISTES_BASE_REF=<ref> il part d'une autre base que origin/pre-dev
#   ~/.takussan-agents/outils/pistes.sh etat
#   ~/.takussan-agents/outils/pistes.sh pause | reprendre
#
# Compatible bash 3.2 : launchd lance /bin/bash, celui de macOS.
set -euo pipefail

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
  printf '%s' "${!nom}"
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

  mkdir -p "$BASE/outils" "$BASE/arbres" "$BASE/sorties" "$BASE/verrous" "$BASE/etat" "$BASE/journaux"
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
    printf 'DEPOT=%q\nCLAUDE_BIN=%q\nGH_REPO=%q\nPATH_LANCEMENT=%q\nOUTILS_SHA=%q\n' \
      "$depot" "$claude_bin" "$depot_gh" "$PATH" "$sha"
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
BUDGET_IMPLEMENTEUR=20
# Durée maximale d'un passage (secondes) ; à l'échéance, tout le groupe de processus est tué.
DUREE_EXPLORATEUR=2700
DUREE_MESUREUR=2700
DUREE_IMPLEMENTEUR=5400
# Au-delà de cette charge (moyenne à 5 min), aucun passage ne démarre. Vide = 1,5 × nombre de cœurs.
CHARGE_MAX=
# Réparations successives d'une même PR avant abandon (le porteur prend la main).
REPARATIONS_MAX=3
# Modèle ; vide = celui du compte.
MODELE=
CONFIG
  fi

  (
    cd "$depot"
    gh label create agent:explorateur --color 1d76db --description "PR de l'agent explorateur (ADR-0066)" --force > /dev/null
    gh label create agent:mesureur --color 5319e7 --description "PR de l'agent mesureur (ADR-0066)" --force > /dev/null
    gh label create agent:implementeur --color b60205 --description "PR de l'agent implémenteur (ADR-0066)" --force > /dev/null
    gh label create agents:synchro --color c5def5 --description "Synchronisation dev → pre-dev (ADR-0066)" --force > /dev/null
  )

  info "installé dans $BASE (outils $sha, dépôt $depot_gh)"
  if ! git -C "$depot" ls-remote --exit-code --heads origin pre-dev > /dev/null 2>&1; then
    info "⚠ la branche pre-dev n'existe pas sur origin : aucun passage ne peut aboutir avant sa création"
  fi
}

# ─── planification launchd ────────────────────────────────────────────────────────────────────

planifier() {
  charger_config
  [ $# -eq 3 ] || die "usage : planifier <x> <y> <z>  (minutes : explorateur, mesureur, implementeur)"
  local minutes role plist secondes uid
  uid="$(id -u)"
  for role in $ROLES; do
    minutes="$1"
    shift
    case "$minutes" in '' | *[!0-9]*) die "« $minutes » n'est pas un nombre de minutes" ;; esac
    [ "$minutes" -ge 10 ] || die "$role : 10 minutes au moins entre deux passages"
    secondes=$((minutes * 60))
    plist="$HOME/Library/LaunchAgents/$LAUNCHD.$role.plist"
    cat > "$plist" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LAUNCHD}.${role}</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string><string>${BASE}/outils/pistes.sh</string><string>lancer</string><string>${role}</string></array>
  <key>StartInterval</key><integer>${secondes}</integer>
  <key>RunAtLoad</key><false/>
  <key>ProcessType</key><string>Background</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>${PATH_LANCEMENT}</string>
    <key>HOME</key><string>${HOME}</string>
    <key>LANG</key><string>fr_FR.UTF-8</string>
  </dict>
  <key>StandardOutPath</key><string>${BASE}/journaux/launchd-${role}.log</string>
  <key>StandardErrorPath</key><string>${BASE}/journaux/launchd-${role}.log</string>
</dict>
</plist>
PLIST
    launchctl bootout "gui/$uid/$LAUNCHD.$role" 2> /dev/null || true
    launchctl bootstrap "gui/$uid" "$plist"
    info "$role : toutes les $minutes min"
  done
}

deplanifier() {
  local role uid
  uid="$(id -u)"
  for role in $ROLES; do
    launchctl bootout "gui/$uid/$LAUNCHD.$role" 2> /dev/null || true
    rm -f "$HOME/Library/LaunchAgents/$LAUNCHD.$role.plist"
  done
  info "déplanifié (les passages en cours finissent)"
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
avec_verrou_git() {
  local essais=0
  until mkdir "$BASE/verrous/git" 2> /dev/null; do
    essais=$((essais + 1))
    [ "$essais" -lt 120 ] || die "verrou git tenu depuis 10 min ($BASE/verrous/git)"
    sleep 5
  done
  local statut=0
  "$@" || statut=$?
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
  retard="$(git -C "$DEPOT" rev-list --count "$BASE_REF"..origin/dev)"
  [ "$retard" -gt 0 ] || return 0
  num="$(GH_REPO="$GH_REPO" gh pr list --base pre-dev --head dev --state open --json number --jq '.[0].number // empty')"
  if [ -z "$num" ]; then
    GH_REPO="$GH_REPO" gh pr create --base pre-dev --head dev --label agents:synchro \
      --title "chore(pre-dev): synchroniser avec dev ($retard commits)" \
      --body "$(printf '%s\n\n%s\n\n%s' "\`dev\` a $retard commits que \`pre-dev\` n'a pas. Ouverte par \`scripts/agents/pistes.sh\` (ADR-0066 § 4)." \
        "Les agents partent de \`origin/pre-dev\` : tant qu'elle n'est pas fusionnée, ils travaillent sur un arbre en retard sur \`dev\`." \
        '🤖 Generated with [Claude Code](https://claude.com/claude-code)')" > /dev/null
    info "PR de synchronisation dev → pre-dev ouverte ($retard commits)"
  elif [ "$FUSION" = auto ] && [ "$(etat_ci "$num")" = vert ]; then
    if GH_REPO="$GH_REPO" gh pr merge "$num" --merge > /dev/null 2>&1; then
      info "synchronisation #$num fusionnée"
      git -C "$DEPOT" fetch origin --prune --quiet
    fi
  fi
}

recuperer() {
  git -C "$DEPOT" fetch origin --prune --quiet
  git -C "$DEPOT" rev-parse --verify --quiet "$BASE_REF" > /dev/null || die "$BASE_REF n'existe pas"
  if [ "$A_BLANC" -eq 0 ]; then synchroniser_pre_dev; fi
}

preparer_arbre() {
  local arbre="$1" branche="$2" depart="$3" sortie="$4"
  if [ ! -d "$arbre" ]; then
    git -C "$DEPOT" worktree add --quiet --detach "$arbre" "$depart"
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
  git -C "$DEPOT" for-each-ref --format='%(refname:short)' "refs/heads/agents/$ROLE/" | while read -r b; do
    [ "$b" = "$branche" ] || git -C "$DEPOT" branch -D --quiet "$b" 2> /dev/null || true
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
  # Copies, jamais de lien : un lien ferait lire à l'arbre de l'agent l'état de l'arbre principal.
  local f
  for f in takussan-api/.env takussan-web/.env.local; do
    if [ -f "$DEPOT/$f" ]; then cp -p "$DEPOT/$f" "$arbre/$f"; fi
  done
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
  git -C "$DEPOT" show "$BASE_REF:scripts/check-pistes.mjs" > "$fige"
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
    # `--check` : gen-index sans option RÉÉCRIT l'index, et l'arbre vérifié changerait sous nos pieds.
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
  charge="$(sysctl -n vm.loadavg | awk '{print $3}')"
  max="${CHARGE_MAX:-$(($(sysctl -n hw.ncpu) * 3 / 2))}"
  if awk -v c="$charge" -v m="$max" 'BEGIN { exit !(c > m) }'; then fin charge "charge $charge > $max"; fi

  avec_verrou_git recuperer

  # 2. L'état de la PR du rôle : au plus une ouverte.
  local pr_json branche depart ci conflit mergeable reparations
  pr_json="$(GH_REPO="$GH_REPO" gh pr list --base pre-dev --state open --label "agent:$ROLE" \
    --json number,headRefName,mergeable,url --jq '.[0] // empty')"
  MODE=nouveau
  if [ -n "$pr_json" ]; then
    PR="$(printf '%s' "$pr_json" | node -e 'process.stdout.write(String(JSON.parse(require("fs").readFileSync(0)).number))')"
    branche="$(printf '%s' "$pr_json" | node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0)).headRefName)')"
    mergeable="$(printf '%s' "$pr_json" | node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0)).mergeable)')"
    ci="$(etat_ci "$PR")"
    conflit=non
    if [ "$mergeable" = CONFLICTING ]; then conflit=oui; fi
    if [ "$ci" = attente ] && [ "$conflit" = non ]; then fin attente "PR #$PR : CI en cours"; fi
    if [ "$ci" = vert ] && [ "$conflit" = non ]; then
      if [ "$FUSION" != auto ]; then fin attente "PR #$PR verte, en attente de fusion par le porteur"; fi
      if [ "$A_BLANC" -eq 1 ]; then fin a-blanc "aurait fusionné la PR #$PR"; fi
      GH_REPO="$GH_REPO" gh pr merge "$PR" --merge --delete-branch > /dev/null
      info "PR #$PR fusionnée dans pre-dev"
      PR=""
      avec_verrou_git recuperer
    else
      MODE=reparation
      reparations="$(cat "$BASE/etat/reparations-$ROLE-$PR" 2> /dev/null || echo 0)"
      if [ "$reparations" -ge "$REPARATIONS_MAX" ]; then
        fin abandon "PR #$PR : $reparations réparations sans vert — le porteur prend la main"
      fi
      printf '%s' "$((reparations + 1))" > "$BASE/etat/reparations-$ROLE-$PR"
      depart="origin/$branche"
    fi
  fi
  if [ "$MODE" = nouveau ]; then
    branche="agents/$ROLE/$horo"
    depart="$BASE_REF"
  fi

  # 3. L'arbre du rôle.
  avec_verrou_git preparer_arbre "$arbre" "$branche" "$depart" "$sortie"
  installer_dependances "$arbre"
  local sha_pre_dev
  sha_pre_dev="$(git -C "$DEPOT" rev-parse --short "$BASE_REF")"

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
  installer) installer ;;
  planifier) shift; planifier "$@" ;;
  deplanifier) deplanifier ;;
  lancer)
    if [ "${3:-}" = --a-blanc ]; then A_BLANC=1; fi
    lancer "${2:-}"
    ;;
  etat) etat ;;
  pause) mkdir -p "$BASE" && touch "$BASE/PAUSE" && info "pause : aucun passage ne démarre (« reprendre » pour lever)" ;;
  reprendre) rm -f "$BASE/PAUSE" && info "reprise" ;;
  *) sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac
