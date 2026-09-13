#!/usr/bin/env bash
#
# test-release-reindex.sh — exerce la décision de réindexation de takussan-api/docker/release.sh.
#
# Successeur de test-deploy-search-reindex.sh, retiré avec deploy.sh (ADR-0028). Même raison
# d'être : ni PHPUnit ni vitest ne lisent du shell, et se tromper ici est muet des deux côtés —
# trop réindexer noie Meilisearch à chaque déploiement (3308 tâches pour une exécution, D-44), trop
# peu laisse la recherche répondre sur un index périmé, application en parfaite santé.
#
# Il joue le VRAI release.sh, jamais une copie, dans un APP_ROOT jetable, avec un `php` talon qui
# journalise les appels artisan. Aucun conteneur, aucune base, aucun Meilisearch : le harnais teste
# la DÉCISION, pas l'indexation. `sh` et non `bash` : l'image exécute release.sh sous dash.
#
# Le dernier scénario est une ABLATION : il attend un résultat faux. S'il passe, le harnais ne
# teste rien et le script sort en rouge.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 2

RELEASE=takussan-api/docker/release.sh
LIB=takussan-api/docker/lib.sh
[ -f "$RELEASE" ] && [ -f "$LIB" ] || { echo "✗ $RELEASE ou $LIB introuvable" >&2; exit 2; }

echecs=0
racine=$(mktemp -d)
trap 'rm -rf "$racine"' EXIT
MARQUEUR="$racine/app/storage/app/private/.search-shape-importee"

# Un APP_ROOT minimal : deux modèles indexés, un qui ne l'est pas, l'empreinte, le volume.
fabrique() {
  rm -rf "${racine:?}/app" "${racine:?}/bin"
  mkdir -p "$racine/app/app/Models" "$racine/app/docker" "$racine/app/storage/app/private" "$racine/bin"
  cp "$LIB" "$racine/app/docker/lib.sh"
  echo 'public function toSearchableArray() {}' > "$racine/app/app/Models/Property.php"
  echo 'public function toSearchableArray() {}' > "$racine/app/app/Models/Agency.php"
  echo 'class Invoice {}' > "$racine/app/app/Models/Invoice.php"
  echo forme-1 > "$racine/app/.search-shape"
  cat > "$racine/bin/php" <<'EOF'
#!/bin/sh
echo "$*" >> "$JOURNAL"
case "$*" in *"${ECHEC_SUR:-@@jamais@@}"*) exit 1 ;; esac
exit 0
EOF
  chmod +x "$racine/bin/php"
}

# jouer [VAR=valeur…] — un passage de $script ; le journal des appels dans $racine/journal.
script=$RELEASE
jouer() {
  : > "$racine/journal"
  env SCOUT_DRIVER=meilisearch "$@" APP_ROOT="$racine/app" JOURNAL="$racine/journal" \
    PATH="$racine/bin:$PATH" sh "$script" >/dev/null 2>&1
}
imports() { grep -c '^artisan scout:import' "$racine/journal" || true; }
marqueur() { cat "$MARQUEUR" 2>/dev/null || echo absent; }
verifier() {
  if [ "$2" = "$3" ]; then echo "✓ $1"
  else echo "✗ $1 — attendu « $2 », obtenu « $3 »"; echecs=$((echecs + 1)); fi
}

fabrique; jouer
verifier "premier déploiement : importe les deux modèles indexés, et eux seuls" 2 "$(imports)"
verifier "premier déploiement : écrit le marqueur" forme-1 "$(marqueur)"

jouer
verifier "forme inchangée : aucune importation" 0 "$(imports)"

echo forme-2 > "$racine/app/.search-shape"; jouer
verifier "forme changée : réimporte tout" 2 "$(imports)"
verifier "forme changée : marqueur à jour" forme-2 "$(marqueur)"

echo forme-3 > "$racine/app/.search-shape"; jouer ECHEC_SUR=Agency
verifier "une importation échoue : le marqueur ne bouge pas" forme-2 "$(marqueur)"
jouer
verifier "après un échec : le déploiement suivant réimporte" 2 "$(imports)"

fabrique; jouer SCOUT_DRIVER=collection
verifier "SCOUT_DRIVER=collection : aucun appel scout" 0 "$(grep -c scout "$racine/journal" || true)"

fabrique; jouer ECHEC_SUR=migrate
verifier "migration en échec : release échoue, les services ne démarrent pas" 1 "$?"

fabrique; jouer ECHEC_SUR=membership:reconcile
verifier "réconciliation en échec : release continue (comme deploy.sh)" 0 "$?"

# ── ABLATION : sans l'écriture du marqueur, le second passage DOIT réimporter ──
# shellcheck disable=SC2016 # `$marqueur` est le TEXTE cherché dans release.sh, pas une variable d'ici.
sed '/> "\$marqueur"/d' "$RELEASE" > "$racine/release-ablation.sh"
script="$racine/release-ablation.sh"
fabrique; jouer; jouer
if [ "$(imports)" = 0 ]; then
  echo "✗ ablation : sans l'écriture du marqueur, le second passage n'importe toujours rien — le harnais ne teste rien"
  echecs=$((echecs + 1))
else
  echo "✓ ablation : sans le marqueur, le second passage réimporte — le harnais voit la différence"
fi

[ "$echecs" = 0 ] || { echo "✗ $echecs échec(s)"; exit 1; }
echo "✓ décision de réindexation de release.sh : 10 vérifications et une ablation"
