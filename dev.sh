#!/usr/bin/env bash
#
# Lanceur de l'environnement de développement Takussan.
#
#   ./dev.sh              services docker + API + file de jobs + scheduler + front Next.js
#   ./dev.sh api          back seul (docker + API + file + scheduler)
#   ./dev.sh services     les conteneurs seuls, puis rend la main
#   ./dev.sh doctor       ne lance rien : diagnostique l'environnement et sort
#
# Pourquoi la file de jobs et le scheduler tournent en développement : `routes/console.php`
# planifie une vingtaine de tâches (expiration de réservations, pénalités de retard,
# relances de facture, rappels de visite, digests de notification, purges RGPD) et
# `QUEUE_CONNECTION=database` met les jobs en base au lieu de les exécuter. Sans worker,
# tout ce qui passe par `dispatch()` ne s'exécute JAMAIS en local — et l'absence ne se
# signale pas : l'écran répond 200, la ligne part en base, et rien ne la consomme.
#
# Ctrl-C arrête proprement les processus lancés ici. Les conteneurs restent debout
# (`docker compose stop` pour les coucher, `docker compose down -v` pour tout effacer).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API="$ROOT/takussan-api"
WEB="$ROOT/takussan-web"
MODE="${1:-all}"

case "$MODE" in
  all | api | services | doctor) ;;
  *)
    echo "Usage : ./dev.sh [api|services|doctor]" >&2
    echo "  (sans argument)  docker + API + file + scheduler + front" >&2
    echo "  api              docker + API + file + scheduler" >&2
    echo "  services         les conteneurs docker seuls" >&2
    echo "  doctor           diagnostic de l'environnement, ne lance rien" >&2
    exit 64
    ;;
esac

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
lien() { printf '  %-30s \033[4;36m%s\033[0m\n' "$1" "$2"; }
ok() { printf '  \033[32m✓\033[0m %s\n' "$*"; }
ko() { printf '  \033[31m✗\033[0m %s\n' "$*"; }
avert() { printf '  \033[33m!\033[0m %s\n' "$*"; }

# Valeur d'une clé dans un fichier .env. Rend la chaîne vide si absente.
# `head -1` : sur une clé écrite deux fois, phpdotenv retient la PREMIÈRE — on lit
# donc celle qui fait foi, pas la dernière du fichier.
#
# ⚠ `|| true` et `return 0` : le commentaire ci-dessus promettait « la chaîne vide si absente »,
# et le code rendait la chaîne vide ET UN CODE 1. `grep` sort en 1 quand il ne trouve rien,
# `pipefail` propage ce 1 à travers le tube, et `set -e` tue le script sur l'AFFECTATION
# (`DB_PORT_ENV="$(env_get …)"` est une commande comme une autre pour bash).
#
# Reproduit avec un `.env` de la forme de `takussan-api/.env.example` — `DB_CONNECTION=sqlite`,
# `DB_PORT` et `MEILISEARCH_HOST` en commentaire : `./dev.sh` sortait en 1 **sans imprimer une
# seule ligne**. Il n'atteignait jamais la branche `DB_CONNECTION=sqlite` écrite pour ce cas
# précis, et `./dev.sh doctor` — dont tout le contrat est de toujours répondre — ne répondait
# rien. Le mode diagnostic tombait exactement sur la configuration qu'on l'appelle diagnostiquer.
env_get() {
  local fichier="$1" cle="$2"
  [ -f "$fichier" ] || return 0
  grep -E "^${cle}=" "$fichier" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true
  return 0
}

# Premier port TCP libre à partir de $1 (balaye 50 ports).
port_libre() {
  local port=$1 limite=$(($1 + 50))
  while lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; do
    port=$((port + 1))
    if ((port > limite)); then
      echo "Aucun port libre entre $1 et $limite." >&2
      return 1
    fi
  done
  echo "$port"
}

# ───────────────────────────────────────────────────────────── prérequis
manquants=0
# `lsof` sert à `port_libre` : sans lui, tout port est déclaré libre et l'API se lie
# dans le vide. `nc` sert aux sondes. Les deux sont des prérequis réels, pas des
# commodités — leur absence produit un diagnostic FAUX, pas un diagnostic manquant.
# `curl` est dans la liste : il sert aux DEUX sondes Meilisearch (`/health` et `/keys`). Son
# absence — un conteneur de développement minimal, une image slim — fait sortir `curl` en 127,
# et la sonde imprime « Meilisearch NE RÉPOND PAS » sur une instance parfaitement saine. C'est
# le mode d'échec exact que le commentaire ci-dessous nomme, et il manquait à la liste qu'il
# justifie : *un prérequis oublié ne produit pas un diagnostic manquant, il en produit un FAUX.*
for outil in docker php composer node nc lsof curl; do
  command -v "$outil" >/dev/null 2>&1 || { ko "$outil est introuvable dans le PATH"; manquants=1; }
done
if ! docker info >/dev/null 2>&1; then
  ko "le démon docker ne répond pas — démarre Docker Desktop"
  manquants=1
fi
[ "$manquants" -eq 0 ] || exit 69

# ───────────────────────────────────────────────────────────── dépendances PHP
# AVANT toute commande `artisan`, et c'est l'ordre qui compte.
#
# Ce bloc vivait 230 lignes plus bas, après le `key:generate` du premier démarrage. Sur un clone
# neuf — le cas EXACT pour lequel ce bloc de premier démarrage a été écrit — `vendor/autoload.php`
# n'existe pas : `artisan` meurt sur un `require` PHP, `set -euo pipefail` tue le script, et
# `./dev.sh doctor` meurt à la même ligne, sur la checkout la plus fraîche possible.
#
# *Le chemin qu'on emprunte une seule fois est celui que personne ne rejoue — et donc celui où
# un défaut d'ordonnancement vit le plus longtemps.*
# `doctor` CONSTATE, il n'amorce pas — les trois blocs qui suivent le respectent.
#
# Le contrat annoncé deux fois en tête de fichier est « ne lance rien : diagnostique et sort ».
# Une revue avait déjà relevé que `doctor` démarrait les conteneurs ; le même défaut se
# reformait ici, plus discrètement : un `composer install` de plusieurs minutes et la création
# de deux `.env` sont des ACTIONS, même si elles ne démarrent aucun serveur. Sur un clone neuf,
# `./dev.sh doctor` — la première commande qu'on tape pour comprendre où l'on en est —
# provisionnait le dépôt avant de répondre.
#
# *« Ne lance rien » ne veut pas dire « ne lance aucun serveur » : cela veut dire ne rien
# changer à l'état qu'on est venu observer.*
amorce_possible() { [ "$MODE" != "doctor" ]; }

if [ ! -d "$API/vendor" ]; then
  if amorce_possible; then
    bold "▸ composer install"
    (cd "$API" && composer install --no-interaction)
  else
    ko "takussan-api/vendor absent — 'composer install' n'a jamais tourné."
    echo "     Le diagnostic qui suit sera partiel : aucune commande artisan ne peut s'exécuter." >&2
  fi
fi

# ───────────────────────────────────────────────────────────── .env
PREMIER_DEMARRAGE=0
if [ ! -f "$API/.env" ]; then
  if amorce_possible; then
    bold "▸ Premier démarrage — création de takussan-api/.env"
    cp "$API/.env.docker" "$API/.env"
    (cd "$API" && php artisan key:generate --force >/dev/null)
    ok "takussan-api/.env créé depuis .env.docker, APP_KEY générée"
    PREMIER_DEMARRAGE=1
  else
    ko "takussan-api/.env absent — './dev.sh' le créera depuis .env.docker."
  fi
fi

# Le `.env.local` du front est provisionné ICI, symétriquement au `.env` de l'API.
#
# Le provisionnement de premier démarrage était asymétrique : le script créait
# `takussan-api/.env` depuis `.env.docker` et lançait `npm install`, mais ne créait jamais
# `takussan-web/.env.local` — qui est gitignoré, seul `.env.example` étant versionné. Sur un
# clone neuf, le front retombait donc sur le défaut codé en dur de `src/lib/api.ts`,
# `http://localhost:8002`, pendant que ce script lie l'API à `127.0.0.1:8002`. Deux origines
# distinctes pour le navigateur. Et l'avertissement de collision de port, plus haut, renvoyait
# l'utilisateur à « règle takussan-web/.env.local » — un fichier qui n'existait pas sur le
# chemin même que cet avertissement vise.
#
# *Un environnement reproductible qui n'amorce qu'une de ses deux moitiés n'est pas
# reproductible : il est reproductible pour celui qui a déjà l'autre.*
if [ ! -f "$WEB/.env.local" ] && [ -f "$WEB/.env.example" ]; then
  if amorce_possible; then
    bold "▸ Premier démarrage — création de takussan-web/.env.local"
    cp "$WEB/.env.example" "$WEB/.env.local"
    ok "takussan-web/.env.local créé depuis .env.example"
  else
    ko "takussan-web/.env.local absent — le front retomberait sur son défaut codé en dur."
  fi
fi


# ───────────────────────────────────────────────────────────── quel backing store ?
# Ce script NE FORCE PAS docker. Un poste peut très bien servir MySQL et Meilisearch
# nativement (brew) — c'était le cas de celui où ce fichier a été écrit — et cette
# installation-là marche. La question utile n'est donc pas « le .env est-il d'accord
# avec le compose ? » mais **« ce que le .env déclare répond-il, et qui répond ? »**.
#
# La première question fait rougir un environnement qui fonctionne. La seconde attrape
# le seul défaut qui coûte vraiment : un service déclaré que rien ne sert. Ce défaut
# ne se signale jamais tout seul — l'API démarre, et c'est la première requête qui
# meurt, sur une erreur de connexion qu'on impute au mauvais coupable.

# Le `.env` de la racine, s'il existe, surcharge les ports du compose — on n'en lit que
# les clés `TAKUSSAN_*`, et SEULEMENT elles.
#
# La version précédente faisait `set -a; . "$ROOT/.env"; set +a` : elle exportait donc **toute**
# clé du fichier dans l'environnement du processus, et `php artisan` hérite de cet
# environnement. Or `Dotenv::createImmutable` de Laravel n'écrase JAMAIS une variable déjà
# présente : un `.env` de racine définissant `DB_DATABASE` ou `APP_ENV` — ce qui arrive dès que
# quelqu'un copie un `.env` d'API à la racine du dépôt — prenait silencieusement le pas sur
# `takussan-api/.env`, et `php artisan migrate --seed --force` partait sur une AUTRE base. Le
# contrôle de cohérence quelques lignes plus bas ne compare que `TAKUSSAN_DB_PORT` à `DB_PORT` :
# il n'aurait rien vu.
#
# Ce fichier n'a qu'un seul rôle documenté — surcharger les ports publiés par le compose. On lit
# donc exactement ce rôle, et rien de plus. *La portée d'un fichier de configuration, c'est ce
# qu'on lui laisse atteindre, pas ce que sa documentation lui assigne.*
if [ -f "$ROOT/.env" ]; then
  while IFS= read -r ligne; do
    case "$ligne" in
      TAKUSSAN_[A-Z_]*=*) export "${ligne%%=*}=$(printf '%s' "${ligne#*=}" | tr -d '"'"'"'')" ;;
    esac
  done < "$ROOT/.env"

  # Ce qui a été IGNORÉ est nommé : un fichier dont la moitié des lignes n'a aucun effet doit
  # le dire, sinon on l'édite en croyant agir.
  ignorees="$(grep -cE '^[A-Z_]+=' "$ROOT/.env" 2>/dev/null || true)"
  retenues="$(grep -cE '^TAKUSSAN_[A-Z_]+=' "$ROOT/.env" 2>/dev/null || true)"
  if [ "${ignorees:-0}" -gt "${retenues:-0}" ]; then
    avert ".env de la racine : $((ignorees - retenues)) clé(s) hors TAKUSSAN_* ignorée(s)."
    avert "  Ce fichier ne sert qu'à surcharger les ports du compose. La configuration de"
    avert "  l'API se règle dans takussan-api/.env — et elle seule."
  fi
fi

DB_PORT_ENV="$(env_get "$API/.env" DB_PORT)"
MEILI_HOST_ENV="$(env_get "$API/.env" MEILISEARCH_HOST)"

# Le `.env` vise-t-il les conteneurs de ce dépôt ? On le déduit du port de la base :
# c'est le seul service dont le port ne peut pas être partagé par accident.
VISE_DOCKER=0
if [ "$DB_PORT_ENV" = "${TAKUSSAN_DB_PORT:-3307}" ]; then VISE_DOCKER=1; fi

# Un `.env` de racine qui SURCHARGE un port est une intention explicite de viser les conteneurs.
# S'il désaccorde avec `takussan-api/.env`, c'est une faute de frappe, pas un choix — et la faire
# basculer silencieusement en mode « services externes » est le pire des traitements : aucun
# conteneur n'est démarré, un seul avertissement passe, puis `migrate` meurt sur une connexion
# refusée sans que le désaccord soit jamais nommé.
#
# `takussan-api/.env.docker` et `docker-compose.yml` promettent tous deux que « ./dev.sh le
# vérifie et refuse de démarrer sur un désaccord ». Cette promesse n'était tenue par rien.
if [ "$VISE_DOCKER" = "0" ] && [ -n "${TAKUSSAN_DB_PORT:-}" ] && [ -n "$DB_PORT_ENV" ]; then
  bold "▸ Ports incohérents"
  ko "le .env de la racine publie MariaDB sur ${TAKUSSAN_DB_PORT}, takussan-api/.env lit DB_PORT=${DB_PORT_ENV}."
  echo "     Le .env de la racine surcharge un port du compose : c'est une intention de viser" >&2
  echo "     les conteneurs. Aligne DB_PORT dans takussan-api/.env, ou retire la surcharge." >&2
  echo "     (Sans ce refus, aucun conteneur n'aurait été démarré et 'migrate' serait mort sur" >&2
  echo "      une connexion refusée, sans que le désaccord soit jamais nommé.)" >&2
  exit 78
fi

# `doctor` est EXCLU, et l'oubli n'était pas anodin.
#
# L'en-tête et l'usage promettent tous deux « ne lance rien : diagnostique et sort ». Sans cette
# condition, `doctor` tombait dans la branche ci-dessous, démarrait quatre conteneurs, puis
# attendait leur santé — et sortait en 75 si l'un d'eux ne venait pas, AVANT d'avoir imprimé la
# moindre ligne de diagnostic. Le seul mode dont le contrat est de toujours produire une réponse
# était celui qui pouvait n'en produire aucune, exactement dans le cas où on l'appelle.
#
# Un mode « diagnostic » qui modifie l'état qu'il observe n'est pas un diagnostic.
if [ "$MODE" != "doctor" ] && { [ "$VISE_DOCKER" = "1" ] || [ "$MODE" = "services" ]; }; then
  bold "▸ Services docker (MariaDB, Meilisearch, Redis, Mailpit)"
  docker compose -f "$ROOT/docker-compose.yml" up -d

  # On attend la SANTÉ, pas le démarrage : un conteneur « Up » dont MariaDB initialise
  # encore son volume refuse les connexions, et `php artisan migrate` échoue sur une
  # course qu'on rejoue trois fois avant de comprendre.
  # On COMPTE les `healthy`, on ne se contente pas de l'absence de mauvaise nouvelle.
  #
  # La version précédente décidait par un `*)` attrape-tout : toute chaîne d'états ne contenant
  # ni `starting` ni `unhealthy` valait succès. Or `docker compose ps` ne liste QUE les
  # conteneurs démarrés et rend une colonne `Health` VIDE pour un conteneur `created` ou
  # `restarting` : `"healthy healthy healthy "` — trois services, un absent — tombait dans le
  # `*)`, et le script annonçait « les quatre services répondent » avant d'aller migrer contre
  # une base qui pouvait être justement celle qui manquait.
  #
  # *Une garde qui conclut par défaut atteste de ce qu'elle n'a pas vu, pas de ce qu'elle a vu.*
  # ⚠ `|| echo 4` ne marche PAS ici, et c'était le correctif de la revue précédente.
  # `grep -c .` sur une entrée vide imprime `0` **et** sort en 1 : le `||` s'ajoute au lieu de
  # se substituer, et `ATTENDUS` valait la chaîne de trois caractères "0\n4". Chaque tour de
  # boucle mourait alors sur « integer expression expected », les 120 s s'écoulaient, et le
  # script sortait en 75 en annonçant « 0/0\n4 sains ». Le repli ne pouvait jamais s'appliquer.
  #
  # *Un `|| valeur-de-repli` ne remplace la sortie que si la commande n'a rien imprimé.*
  ATTENDUS=$(docker compose -f "$ROOT/docker-compose.yml" config --services 2>/dev/null | grep -c . || true)
  case "$ATTENDUS" in ''|*[!0-9]*|0) ATTENDUS=4 ;; esac
  printf '  attente de la santé des %s services' "$ATTENDUS"
  SANTE_OK=0
  for _ in $(seq 1 60); do
    etats="$(docker compose -f "$ROOT/docker-compose.yml" ps --format '{{.Health}}' 2>/dev/null | tr '\n' ' ')"
    sains=$(printf '%s' "$etats" | tr ' ' '\n' | grep -cx 'healthy' || true)
    case "$etats" in
      *unhealthy*) printf '\n'; ko "un service est unhealthy — 'docker compose ps' pour le détail"; exit 75 ;;
    esac
    if [ "${sains:-0}" -ge "$ATTENDUS" ]; then
      printf '\n'; ok "les $ATTENDUS services répondent"; SANTE_OK=1; break
    fi
    printf '.'; sleep 2
  done
  # L'épuisement de la boucle est un ÉCHEC, pas une sortie normale. Sans ce test, les 120 s
  # s'écoulaient et le script continuait jusqu'à `migrate` — qui échouait sur un « Connection
  # refused » imputé à la migration. C'est exactement la cause mal attribuée que l'attente
  # existe pour supprimer : elle la reproduisait en la déplaçant de trois lignes.
  if [ "$SANTE_OK" != "1" ]; then
    printf '\n'
    ko "les services ne sont pas prêts après 120 s (${sains:-0}/$ATTENDUS sains) — rien n'a été lancé."
    echo "     'docker compose logs --tail=40' dira lequel bloque." >&2
    echo "     Une première création du volume MariaDB peut dépasser ce délai : relancer suffit." >&2
    exit 75
  fi
elif [ "$MODE" = "doctor" ] && [ "$VISE_DOCKER" = "1" ]; then
  # Le `.env` vise bien les conteneurs — on REGARDE leur état sans y toucher. Sans cette
  # branche, `doctor` tombait dans le `else` ci-dessous et affirmait que le `.env` visait des
  # services externes : un diagnostic qui se trompe est pire qu'un diagnostic absent.
  bold "▸ Services docker (observés, pas démarrés — 'doctor' ne lance rien)"
  etats="$(docker compose -f "$ROOT/docker-compose.yml" ps --format '{{.Service}} {{.State}} {{.Health}}' 2>/dev/null || true)"
  if [ -z "$etats" ]; then
    ko "aucun conteneur du dépôt n'est démarré — './dev.sh services' les lève"
  else
    printf '%s\n' "$etats" | while IFS= read -r ligne; do
      case "$ligne" in
        *healthy*) [ "${ligne#*unhealthy}" = "$ligne" ] && ok "$ligne" || ko "$ligne" ;;
        *running*) avert "$ligne (pas encore healthy)" ;;
        *) ko "$ligne" ;;
      esac
    done
  fi
elif [ ! -f "$API/.env" ]; then
  # PAS de `ok` ici : il n'y a pas de `.env` à décrire.
  #
  # Cette branche affichait un ✓ vert — « takussan-api/.env vise des services HORS de ce
  # docker-compose (DB sur :?) » — deux lignes sous le ✗ rouge qui venait d'annoncer le fichier
  # absent. Le `:?` était le seul aveu, au milieu d'une affirmation présentée comme un constat.
  # Le cas se produit exactement sur `./dev.sh doctor` d'un clone neuf, c'est-à-dire dans le
  # scénario que plusieurs commentaires de ce fichier citent comme motif d'existence.
  #
  # *Une valeur par défaut (`${x:-?}`) suffit à faire passer une phrase, jamais à la rendre
  # vraie : elle habille l'ignorance en mesure.*
  bold "▸ Services"
  ko "aucun takussan-api/.env — rien à sonder, et rien à en déduire."
  echo "     './dev.sh' le créera depuis .env.docker (et visera alors les conteneurs du dépôt)." >&2
else
  bold "▸ Services"
  ok "takussan-api/.env vise des services HORS de ce docker-compose (DB sur :${DB_PORT_ENV:-?})"
  echo "     Les conteneurs du dépôt ne sont pas démarrés. Pour basculer dessus :"
  echo "       cp takussan-api/.env.docker takussan-api/.env && php artisan key:generate"
  echo "     Pour lancer les conteneurs sans changer de .env :  ./dev.sh services"
fi

# ───────────────────────────────────────────────────────────── joignabilité
# Chaque service déclaré est SONDÉ. Un service injoignable ne fait pas échouer le
# démarrage — il se peut qu'on travaille exprès sans lui — mais il est nommé, avec la
# commande qui le répare. Le silence serait le seul vrai défaut.
NB_INJOIGNABLES=0
sonde_tcp() {
  local libelle="$1" hote="$2" port="$3"
  [ -n "$port" ] || return 0
  # `-w` et non `-G` : `-G conntimeout` est un drapeau BSD/macOS. Sur Linux (netcat-openbsd),
  # nc rend une erreur d'usage — avalée par le 2>/dev/null — donc CHAQUE sonde échouait et un
  # environnement parfaitement sain était déclaré injoignable. Le développeur partait déboguer
  # ce qui marchait : exactement la cause mal imputée que ce bloc existe pour supprimer.
  # `-w` existe dans les deux implémentations.
  if nc -z -w 2 "$hote" "$port" >/dev/null 2>&1; then
    ok "$libelle répond sur $hote:$port"
  else
    ko "$libelle NE RÉPOND PAS sur $hote:$port (déclaré dans takussan-api/.env)"
    NB_INJOIGNABLES=$((NB_INJOIGNABLES + 1))
  fi
}

echo
# Toute cette section lit `takussan-api/.env`. Sans lui, chaque sonde compare des chaînes vides
# et rend un diagnostic sur un fichier qui n'existe pas — « MAIL_MAILER= » et le reste. On dit
# donc ce qu'on ne peut pas mesurer, plutôt que de mesurer le vide.
if [ ! -f "$API/.env" ]; then
  bold "▸ Ce que takussan-api/.env déclare"
  ko "fichier absent — aucune sonde n'est possible. Lance './dev.sh' pour le créer."
  echo
else
bold "▸ Ce que takussan-api/.env déclare, et qui répond"
DB_CONNECTION_ENV="$(env_get "$API/.env" DB_CONNECTION)"
if [ "$DB_CONNECTION_ENV" = "sqlite" ]; then
  avert "DB_CONNECTION=sqlite — la production tourne sur MariaDB."
  avert "  Les quatre pièges MySQL documentés dans CLAUDE.md sont INVISIBLES sur SQLite."
else
  sonde_tcp "Base ($DB_CONNECTION_ENV)" "$(env_get "$API/.env" DB_HOST)" "$DB_PORT_ENV"
fi

SCOUT_ENV="$(env_get "$API/.env" SCOUT_DRIVER)"
if [ "$SCOUT_ENV" = "meilisearch" ] && [ -n "$MEILI_HOST_ENV" ]; then
  # DEUX sondes, parce que « répond » et « accepte la clé » sont deux faits distincts et que
  # la version précédente n'en mesurait qu'un tout en annonçant les deux.
  #
  # `GET /health` de Meilisearch est **non authentifié** : le header `Authorization` était donc
  # simplement ignoré par le serveur. Vérifié sur l'instance qui tourne — `/health` rend 200 avec
  # une clé délibérément fausse, et 200 sans aucune clé. `./dev.sh doctor` imprimait « accepte la
  # clé » en vert sur une `MEILISEARCH_KEY` erronée, et le développeur partait déboguer des 403
  # de Scout contre un diagnostic qui venait de certifier son identifiant.
  #
  # `GET /keys` discrimine : 200 avec la vraie clé, 403 sinon. C'est lui qui atteste.
  #
  # *Une sonde qui n'exerce pas l'autorisation ne dit rien de l'autorisation — et le dire quand
  # même est pire que se taire, parce qu'on écarte une piste juste.*
  if ! curl -fsS -m 3 "$MEILI_HOST_ENV/health" >/dev/null 2>&1; then
    ko "Meilisearch NE RÉPOND PAS sur $MEILI_HOST_ENV"
    NB_INJOIGNABLES=$((NB_INJOIGNABLES + 1))
  elif curl -fsS -m 3 -H "Authorization: Bearer $(env_get "$API/.env" MEILISEARCH_KEY)" \
      "$MEILI_HOST_ENV/keys" >/dev/null 2>&1; then
    ok "Meilisearch répond sur $MEILI_HOST_ENV et accepte MEILISEARCH_KEY"
  else
    ko "Meilisearch répond sur $MEILI_HOST_ENV mais REFUSE MEILISEARCH_KEY (403 sur /keys)"
    echo "     Scout rendra des 403 à l'indexation comme à la recherche. La clé est celle du" >&2
    echo "     conteneur : MEILI_MASTER_KEY dans docker-compose.yml." >&2
    NB_INJOIGNABLES=$((NB_INJOIGNABLES + 1))
  fi
elif [ "$SCOUT_ENV" = "collection" ]; then
  avert "SCOUT_DRIVER=collection — la CI et la production indexent sur Meilisearch."
  avert "  Le driver 'collection' filtre en PHP : il ne prouve rien de la vraie recherche."
fi

if [ "$(env_get "$API/.env" CACHE_STORE)" = "redis" ] || [ "$(env_get "$API/.env" QUEUE_CONNECTION)" = "redis" ]; then
  sonde_tcp "Redis" "$(env_get "$API/.env" REDIS_HOST)" "$(env_get "$API/.env" REDIS_PORT)"
elif [ "$VISE_DOCKER" = "1" ]; then
  # Le compose démarre Redis, mais `.env.docker` s'aligne sur la production, qui est en
  # `database`. Aucun driver ne s'y connecte donc — et sans cette branche, personne ne
  # l'apprenait : le conteneur tournait, la sonde était sautée, et le service passait pour
  # « en service » parce qu'il était « démarré ». Ce sont deux choses différentes, et c'est
  # précisément la confusion que ce script existe pour dissiper.
  sonde_tcp "Redis" "$(env_get "$API/.env" REDIS_HOST)" "$(env_get "$API/.env" REDIS_PORT)"
  avert "  … mais CACHE_STORE=$(env_get "$API/.env" CACHE_STORE) et QUEUE_CONNECTION=$(env_get "$API/.env" QUEUE_CONNECTION) :"
  avert "  aucun driver ne consomme Redis. Il est là pour rendre servable le \`CACHE_STORE=redis\`"
  avert "  de .env.example, et pour le jour où la production bascule."
fi

if [ "$(env_get "$API/.env" MAIL_MAILER)" = "smtp" ]; then
  sonde_tcp "SMTP" "$(env_get "$API/.env" MAIL_HOST)" "$(env_get "$API/.env" MAIL_PORT)"
else
  avert "MAIL_MAILER=$(env_get "$API/.env" MAIL_MAILER) — les ~24 tâches planifiées qui envoient"
  avert "  du courrier n'aboutiront nulle part de consultable. Mailpit : MAIL_MAILER=smtp."
fi

if [ "$NB_INJOIGNABLES" -gt 0 ]; then
  echo
  avert "$NB_INJOIGNABLES service(s) déclaré(s) mais injoignable(s) — l'API va démarrer quand même,"
  avert "  et c'est la première requête qui les touche qui échouera."
fi
fi  # fin de « takussan-api/.env existe-t-il ? »

if [ "$MODE" = "services" ]; then
  echo
  lien "Mailpit (courrier de dev)" "http://localhost:${TAKUSSAN_MAILPIT_UI_PORT:-8026}"
  lien "Meilisearch" "http://127.0.0.1:${TAKUSSAN_MEILI_PORT:-7701}"
  echo "  MariaDB 127.0.0.1:${TAKUSSAN_DB_PORT:-3307} · Redis 127.0.0.1:${TAKUSSAN_REDIS_PORT:-6380}"
  exit 0
fi

# ───────────────────────────────────────────────────────────── doctor
if [ "$MODE" = "doctor" ]; then
  echo
  bold "▸ Diagnostic"
  (cd "$ROOT" && node scripts/check-env-parity.mjs) || true
  echo
  bold "▸ Base de données"
  if (cd "$API" && php artisan migrate:status >/dev/null 2>&1); then
    en_attente="$(cd "$API" && php artisan migrate:status 2>/dev/null | grep -c "Pending" || true)"
    if [ "${en_attente:-0}" -gt 0 ]; then
      avert "$en_attente migration(s) en attente — 'php artisan migrate'"
    else
      ok "migrations à jour"
    fi
  else
    avert "la base ne répond pas ou n'a jamais été migrée — 'php artisan migrate --seed'"
  fi
  echo
  bold "▸ Front"
  if [ -d "$WEB/node_modules" ]; then ok "takussan-web/node_modules présent"; else avert "takussan-web : 'npm install' n'a jamais tourné"; fi
  echo
  exit 0
fi

# La condition porte sur l'ÉTAT DE LA BASE, pas sur l'existence du `.env`.
#
# Elle portait sur `PREMIER_DEMARRAGE`, qui vaut 1 uniquement quand `.env` n'existait pas — et
# le `.env` venait d'être créé quelques lignes plus haut. Si ce premier `migrate --seed`
# échouait (base pas encore prête, téléchargement média coupé, Ctrl-C), le `.env` existait
# désormais : au relancement, la condition était fausse, le bloc sauté, et le développeur
# obtenait une application qui démarre sur une base VIDE sans que rien ne le signale. Réparer
# exigeait de connaître la commande manuelle que ce script existe pour ne pas avoir à connaître.
#
# `migrate` est idempotent : le rejouer ne coûte rien. Le `--seed`, lui, ne part que sur une
# base réellement vierge — on ne veut pas re-semer par-dessus des données de travail.
BASE_VIERGE=0
if ! (cd "$API" && php artisan migrate:status >/dev/null 2>&1); then
  # Pas de table `migrations` du tout : base neuve, ou jamais migrée.
  BASE_VIERGE=1
else
  # Migrée mais sans aucun utilisateur : un `--seed` interrompu laisse exactement cet état.
  #
  # FAIL-CLOSED, et la version précédente ne l'était pas. Elle comparait
  # `tinker … | tr -dc '0-9'` à `"0"` : n'importe quel chiffre parasite dans la sortie — une
  # dépréciation, une bannière PsySH — ou n'importe quel échec de la commande rendait autre
  # chose que `"0"`, donc « base peuplée », donc pas de seed. Le développeur obtenait une
  # application qui tourne sur une base vide, sans un mot. C'est le défaut que le commentaire
  # au-dessus prétendait fermer.
  #
  # On isole donc la DERNIÈRE ligne (`tinker` peut préluder), on exige qu'elle soit un entier,
  # et **on tient l'échec de la commande pour « vierge »** — se tromper vers un `migrate --seed`
  # de trop coûte des minutes ; se tromper vers l'absence de seed coûte une session de débogage
  # sur une base vide. Le `2>&1` remplace le `2>/dev/null` : quand ça casse, on veut savoir.
  #
  # ⚠ Le `|| true` FINAL est ce qui rend la branche de repli ci-dessous atteignable, et sa
  # première version ne l'avait pas. Sous `set -euo pipefail`, un `tinker` qui sort non nul
  # (exception dans un provider, PsySH indisponible, install `--no-dev`) propage son code à
  # travers le tube, la substitution en hérite, et `set -e` tue le script **sur l'affectation
  # elle-même** : le `if [ -z "$compte" ]` juste en dessous n'était jamais atteint. Et comme le
  # `2>&1` est capturé DANS la substitution, rien ne s'affichait — `./dev.sh` sortait en 1 en
  # silence après la bannière des services.
  #
  # *Le correctif d'une mort silencieuse en avait réintroduit une, trois lignes plus haut que
  # celle qu'il fermait.* Un repli n'est un repli que si le chemin qui y mène existe.
  # ⚠ On EXIGE une ligne qui soit exactement un entier — on ne la NETTOIE pas.
  #
  # La version précédente passait la dernière ligne à `tr -dc '0-9'`, qui *retire* ce qui n'est
  # pas un chiffre au lieu de *refuser* la ligne. Or `echo` n'émet pas de retour à la ligne :
  # tout ce que PHP écrit ensuite se colle au compte, sur la même ligne. `0` suivi de
  # `PHP Deprecated: … on line 42` devient `042` — qui n'est pas `-eq 0`, donc « base peuplée »,
  # donc pas de seed, en silence. Vérifié.
  #
  # *Nettoyer une valeur douteuse, c'est fabriquer une valeur sûre à partir de rien.* On lit
  # donc la ligne telle quelle, et tout ce qui n'est pas `^[0-9]+$` est refusé.
  #
  # ⚠⚠ MAIS LE DOUTE NE MÈNE PAS AU SEED ICI, et la version précédente l'y menait — en se
  # réclamant du « fail-closed », ce qui était une erreur de raisonnement, pas de code.
  #
  # On n'atteint cette branche QUE si `migrate:status` a réussi : le schéma existe. Semer n'y
  # est donc pas l'option prudente, c'est l'option DESTRUCTRICE — 38 seeders rejoués sur des
  # données vivantes dupliquent ~450 biens, ou avortent à mi-course sur l'unicité d'un e-mail
  # déjà semé, laissant la base à moitié peuplée. Le commentaire précédent chiffrait ce risque
  # à « quelques minutes » ; c'est faux, et c'est ce chiffrage qui rendait le choix évident
  # dans le mauvais sens.
  #
  # Le fail-closed juste : **schéma absent → semer** (rien à détruire) ; **schéma présent et
  # compte illisible → NE PAS semer, et le dire fort**. La direction prudente n'est pas la même
  # des deux côtés de cette condition — c'est précisément pourquoi elle se décide ici, et non
  # une fois pour toutes.
  sortie="$( (cd "$API" && php artisan tinker --execute='echo \App\Models\User::count();' 2>&1) || true )"
  compte="$(printf '%s' "$sortie" | tail -1 | tr -d '[:space:]')"
  case "$compte" in
    ''|*[!0-9]*)
      avert "COMPTE D'UTILISATEURS ILLISIBLE sur une base déjà migrée — aucun seed ne sera lancé."
      avert "  Semer par défaut ici rejouerait 38 seeders sur des données peut-être vivantes."
      [ -n "$compte" ] && avert "  Dernière ligne de tinker : ${compte:0:70}"
      avert "  Si la base est bien vide : 'php artisan migrate:fresh --seed' à la main." ;;
    *) [ "$compte" -eq 0 ] && BASE_VIERGE=1 ;;
  esac
fi

if [ "$BASE_VIERGE" = "1" ]; then
  bold "▸ Migrations + jeu de démonstration"
  echo "  (première fois : quelques minutes — SEED_DOWNLOAD_MEDIA télécharge les photos)"
  (cd "$API" && php artisan migrate --seed --force)
else
  # Migrations en attente sur une base déjà peuplée : on les passe, sans re-semer.
  if (cd "$API" && php artisan migrate:status 2>/dev/null | grep -q Pending); then
    bold "▸ Migrations en attente"
    (cd "$API" && php artisan migrate --force)
  fi
fi

# ───────────────────────────────────────────────────────────── API + file + scheduler
API_PORT="$(port_libre 8002)"
if [ "$API_PORT" != "8002" ]; then
  # 8002 est codé en dur côté front (`NEXT_PUBLIC_API_URL`) : un décalage silencieux
  # donnerait un front qui ne parle à rien. On le dit, fort.
  avert "port 8002 occupé → API sur $API_PORT. Le front pointe NEXT_PUBLIC_API_URL sur 8002 :"
  avert "règle takussan-web/.env.local ou libère 8002, sinon le front ne joindra pas l'API."
fi

(cd "$API" && exec php artisan serve --host=127.0.0.1 --port="$API_PORT") &
API_PID=$!
# L'ordre est une PRIORITÉ STRICTE : Laravel ne sert `default` que si `notifications-urgent`
# est vide. C'est voulu — la file urgente est alimentée par un seul site
# (`UrgentMaintenanceCreatedNotification`), donc son volume ne peut pas affamer les autres.
# Le jour où une file urgente devient volumineuse, la réponse n'est pas de la déclasser mais
# de lui donner son propre worker.
#
# --queue : les MÊMES files que la production, dans le même ordre de priorité. Sans
# lui, le worker ne consomme que `default` et les jobs poussés sur `media`,
# `notifications-urgent` et `reconciliation` restent en base sans jamais s'exécuter —
# le développeur voit un 200, aucune erreur, et un filigrane qui n'apparaît jamais.
# C'est le défaut corrigé en production dans `scripts/server-setup.sh` ; il vivait ici
# aussi. `scripts/check-queues.mjs` surveille désormais les DEUX consommateurs.
#
# --tries=1 : chaque job porte son propre `tries`/`backoff`. Laisser le worker
# retenter par-dessus doublerait silencieusement les tentatives — et un rappel de
# paiement envoyé deux fois est un défaut visible par l'utilisateur final.
(cd "$API" && exec php artisan queue:work --queue=notifications-urgent,default,media,reconciliation --tries=1) &
QUEUE_PID=$!
(cd "$API" && exec php artisan schedule:work) &
SCHEDULE_PID=$!

trap 'kill "$API_PID" "$QUEUE_PID" "$SCHEDULE_PID" 2>/dev/null || true' EXIT INT TERM
sleep 1

WEB_PORT=""
if [ "$MODE" = "all" ]; then
  WEB_PORT="$(port_libre 3000)"
  [ "$WEB_PORT" != "3000" ] && avert "port 3000 occupé → front sur $WEB_PORT (pense à SANCTUM_STATEFUL_DOMAINS)"
fi

echo
bold "▸ Takussan — environnement de développement"
[ -n "$WEB_PORT" ] && lien "Front (Next.js)" "http://localhost:$WEB_PORT"
lien "API (Laravel)" "http://127.0.0.1:$API_PORT/api"
lien "Filament (admin)" "http://127.0.0.1:$API_PORT/admin"
lien "Mailpit (courrier de dev)" "http://localhost:${TAKUSSAN_MAILPIT_UI_PORT:-8026}"
lien "Meilisearch" "http://127.0.0.1:${TAKUSSAN_MEILI_PORT:-7701}"
echo "  MariaDB 127.0.0.1:${TAKUSSAN_DB_PORT:-3307} · Redis 127.0.0.1:${TAKUSSAN_REDIS_PORT:-6380}"
echo "  File de jobs (queue:work) et scheduler (schedule:work) actifs"
echo

if [ "$MODE" = "api" ]; then
  wait "$API_PID"
  exit 0
fi

if [ ! -d "$WEB/node_modules" ]; then
  bold "▸ npm install (takussan-web)"
  (cd "$WEB" && npm install)
fi

cd "$WEB"
# PAS de `exec` : il remplacerait l'image du shell et DÉTRUIRAIT le trap EXIT posé plus haut.
# Quand le serveur Next s'arrête seul (plantage, erreur fatale), `php artisan serve`,
# `queue:work` et `schedule:work` survivraient alors, re-parentés à init — et le `./dev.sh`
# suivant trouverait 8002 occupé, basculerait l'API sur 8003, et le front (dont
# NEXT_PUBLIC_API_URL est codé sur 8002) parlerait au serveur orphelin périmé.
#
# Ctrl-C fonctionnait malgré `exec` parce que SIGINT frappe le groupe de processus entier —
# pas grâce au trap. La sortie propre du serveur, elle, n'était couverte par rien.
npx next dev --port "$WEB_PORT"
