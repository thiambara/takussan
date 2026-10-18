#!/usr/bin/env bash
# Épreuve de l'image de la base (TCK-930) : elle ARCHIVE, elle SAUVEGARDE, et elle se RESTAURE à un
# instant choisi. Sans R2 : WAL-G écrit dans un volume local (`WALG_FILE_PREFIX`), le même code
# d'archivage et de restauration que contre le seau.
#
#   deploy/postgres/epreuve.sh <image>
#
# Déroulé, dans des conteneurs et des volumes jetables nommés `epreuve-walg-<pid>-*` :
#   0. WAL-G vérifie un certificat TLS public (les autorités sont dans l'image) ;
#   1. une base A démarre sur l'image, avec son archivage ;
#   2. pgvector se crée (l'image n'a rien perdu de l'officielle) ;
#   3. une sauvegarde de base (`backup-push`), une ligne « avant », l'INSTANT VISÉ, une ligne
#      « après », puis un changement de segment, attendu jusqu'à son archivage ;
#   4. une base B vierge se reconstruit depuis l'archive seule (`backup-fetch` puis rejeu des
#      journaux jusqu'à l'instant visé) ;
#   5. B porte « avant » et pas « après ».
# Sort en 0 seulement si tout cela est vrai. Ne touche à aucun autre conteneur ni volume.
set -euo pipefail

IMAGE=${1:?usage : epreuve.sh <image>}
N=epreuve-walg-$$
A=$N-a B=$N-b ARCHIVE=$N-archive DONNEES_B=$N-donnees-b
MDP=epreuve

nettoyer() {
  docker rm -f "$A" "$B" >/dev/null 2>&1 || true
  docker volume rm "$ARCHIVE" "$DONNEES_B" >/dev/null 2>&1 || true
}
trap nettoyer EXIT

echouer() { echo "✗ $1" >&2; docker logs --tail 30 "$2" >&2 2>&1 || true; exit 1; }

# psql_dans <conteneur> <sql> : une valeur, sans en-tête.
psql_dans() { docker exec "$1" psql -U postgres -d postgres -Atc "$2"; }

attendre_pret() {
  for _ in $(seq 90); do
    if docker exec "$1" pg_isready -U postgres -q 2>/dev/null \
      && [ "$(psql_dans "$1" 'select 1' 2>/dev/null || true)" = 1 ]; then return 0; fi
    sleep 1
  done
  echouer "$1 ne répond pas" "$1"
}

echo "── 0. TLS : WAL-G vérifie un certificat public"
# L'archive locale de cette épreuve ne passe pas par TLS : sans ce contrôle, une image sans
# autorités de certification y est verte et n'archive rien sur R2 (TCK-930, 2026-10-18). Un point
# d'accès S3 public et de faux identifiants : avec les autorités, R2 ou S3 répond une erreur
# d'accès ; sans elles, la requête meurt sur `x509`.
tls=$(docker run --rm -e WALG_S3_PREFIX=s3://takussan-epreuve-tls -e AWS_ACCESS_KEY_ID=epreuve \
  -e AWS_SECRET_ACCESS_KEY=epreuve -e AWS_REGION=us-east-1 -e WALG_S3_MAX_RETRIES=0 \
  -e AWS_ENDPOINT=https://s3.amazonaws.com --entrypoint wal-g "$IMAGE" st ls 2>&1 || true)
if grep -qiE 'x509|certificate' <<<"$tls"; then
  echo "✗ TLS : $(grep -iE 'x509|certificate' <<<"$tls" | head -1 | cut -c1-200)" >&2; exit 1
fi
grep -qiE 'InvalidAccessKeyId|AccessDenied|status code: 40[0-9]|NoSuchBucket' <<<"$tls" \
  || { echo "✗ TLS : réponse inattendue du point d'accès public : $(tail -1 <<<"$tls" | cut -c1-200)" >&2; exit 1; }
echo "   certificat vérifié ($(grep -oiE 'InvalidAccessKeyId|AccessDenied|NoSuchBucket|status code: 40[0-9]' <<<"$tls" | head -1))"

docker volume create "$ARCHIVE" >/dev/null
docker volume create "$DONNEES_B" >/dev/null
# L'archive appartient à l'utilisateur postgres de l'image (uid 999), comme le seau à son jeton.
docker run --rm -u 0 -v "$ARCHIVE:/archive" --entrypoint chown "$IMAGE" -R postgres:postgres /archive

echo "── 1. base A, archivage vers le volume $ARCHIVE"
docker run -d --name "$A" -e POSTGRES_PASSWORD=$MDP -e WALG_FILE_PREFIX=/archive \
  -v "$ARCHIVE:/archive" "$IMAGE" >/dev/null
attendre_pret "$A"
[ "$(psql_dans "$A" 'show archive_mode')" = on ] || echouer "archive_mode n'est pas on" "$A"
[ "$(psql_dans "$A" 'show archive_timeout')" = 5min ] || echouer "archive_timeout n'est pas 5min" "$A"
echo "   archive_mode=on, archive_timeout=5min, $(docker exec "$A" wal-g --version | head -1)"

echo "── 2. pgvector"
psql_dans "$A" "create extension vector; select '[1,2]'::vector <-> '[1,3]'::vector" >/dev/null \
  || echouer "pgvector ne se crée pas" "$A"
echo "   extension vector $(psql_dans "$A" "select extversion from pg_extension where extname='vector'")"

echo "── 3. sauvegarde de base, puis « avant », instant visé, « après »"
psql_dans "$A" "create table temoin (etiquette text primary key, ecrite timestamptz not null default clock_timestamp())" >/dev/null
docker exec -u postgres -e PGHOST=/var/run/postgresql -e PGUSER=postgres "$A" \
  sh -c 'wal-g backup-push "$PGDATA"' >/dev/null 2>&1 || echouer "backup-push a échoué" "$A"
psql_dans "$A" "insert into temoin (etiquette) values ('avant')" >/dev/null
sleep 2
VISE=$(psql_dans "$A" "select to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS.US') || '+00'")
sleep 2
psql_dans "$A" "insert into temoin (etiquette) values ('apres')" >/dev/null
segment=$(psql_dans "$A" "select pg_walfile_name(pg_current_wal_lsn())")
psql_dans "$A" "select pg_switch_wal()" >/dev/null
for _ in $(seq 60); do
  archive=$(psql_dans "$A" "select coalesce(last_archived_wal, '') from pg_stat_archiver")
  [ -n "$archive" ] && [[ ! "$archive" < "$segment" ]] && break
  sleep 1
done
[[ ! "${archive:-}" < "$segment" ]] || echouer "le segment $segment n'a pas été archivé (dernier : ${archive:-aucun})" "$A"
echo "   instant visé $VISE ; segment $segment archivé ; $(psql_dans "$A" 'select archived_count from pg_stat_archiver') segments, $(psql_dans "$A" 'select failed_count from pg_stat_archiver') échec"
docker rm -f "$A" >/dev/null

echo "── 4. base B, reconstruite depuis l'archive seule"
docker run --rm -u postgres -e WALG_FILE_PREFIX=/archive -v "$ARCHIVE:/archive" \
  -v "$DONNEES_B:/var/lib/postgresql/data" --entrypoint sh "$IMAGE" -c "
    set -e
    wal-g backup-fetch /var/lib/postgresql/data LATEST
    printf '%s\n' \"restore_command = '/usr/local/bin/wal-g wal-fetch %f %p'\" \
      \"recovery_target_time = '$VISE'\" \"recovery_target_action = 'promote'\" \
      >> /var/lib/postgresql/data/postgresql.auto.conf
    touch /var/lib/postgresql/data/recovery.signal" >/dev/null 2>&1 \
  || { echo "✗ backup-fetch a échoué" >&2; exit 1; }
# archive_mode=off : B ne doit pas écrire sa propre chronologie dans l'archive de A.
docker run -d --name "$B" -e WALG_FILE_PREFIX=/archive -v "$ARCHIVE:/archive" \
  -v "$DONNEES_B:/var/lib/postgresql/data" "$IMAGE" postgres -c archive_mode=off >/dev/null
attendre_pret "$B"
for _ in $(seq 60); do
  [ "$(psql_dans "$B" 'select pg_is_in_recovery()')" = f ] && break
  sleep 1
done
[ "$(psql_dans "$B" 'select pg_is_in_recovery()')" = f ] || echouer "B est resté en récupération" "$B"

echo "── 5. ce que B porte"
lignes=$(psql_dans "$B" "select string_agg(etiquette, ',' order by etiquette) from temoin")
echo "   temoin : $lignes"
[ "$lignes" = avant ] || echouer "attendu « avant » seul à l'instant visé, lu « $lignes »" "$B"
echo "✓ archivage, sauvegarde de base et restauration à $VISE éprouvés sur $IMAGE"
