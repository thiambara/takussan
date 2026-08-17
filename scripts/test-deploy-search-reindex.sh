#!/usr/bin/env bash
#
# test-deploy-search-reindex.sh — exerce le bloc « Step 6b » de scripts/deploy.sh.
#
# POURQUOI CE FICHIER EXISTE
#
# `deploy.sh` décide, à chaque déploiement, s'il faut réindexer Meilisearch et pour quels
# modèles. Cette décision n'a JAMAIS été exécutée : la chaîne de déploiement n'a pas tourné
# une seule fois (dette D-04, TCK-288). Aucune suite de tests ne touche ce fichier — ni PHPUnit
# ni vitest ne lisent du bash — et la relecture ne remplace pas une exécution : le premier
# déploiement réel de ce dépôt ne peut pas être aussi le premier essai de ce code.
#
# Se tromper ici coûte des deux côtés, et les deux coûts sont silencieux :
#   · réindexer trop → la suite a mesuré un arriéré de 3308 tâches d'indexation pour UNE
#     exécution (D-44) ; en production, c'est la file de jobs qui encaisse, pendant que
#     `/up` continue de répondre 200 ;
#   · réindexer trop peu → l'index reste sur l'ancienne forme, la recherche rend des résultats
#     faux, et rien ne rougit puisque l'application est en parfaite santé.
#
# CE QUE LE HARNAIS FAIT
#
# Il EXTRAIT le bloc du fichier réel à chaque exécution, jamais une copie : un test qui
# recopie son sujet cesse de le tester au premier écart, et c'est précisément la famille de
# défauts que les gardes de ce dépôt existent pour attraper. Si les marqueurs bougent, il
# sort en 2 plutôt que de passer sur du vide.
#
# `php` est remplacé par un talon qui capture les appels artisan. Aucun Meilisearch, aucune
# base, aucun réseau : le harnais teste la DÉCISION, pas l'indexation.
#
# Le bloc est joué sous `set -euo pipefail` — les conditions réelles de `deploy.sh` — et ce
# fichier tourne aussi bien sous bash 3.2 (macOS) que sous le bash 5 du serveur ; 3.2 est le
# plus strict des deux sur l'expansion d'un tableau vide, donc le vert local vaut pour les deux.
#
# Le dernier scénario est une ABLATION : il attend délibérément un résultat faux. S'il PASSE,
# le harnais ne teste rien et le script sort en rouge. Un test vert qui serait vert sans le
# code qu'il couvre est plus dangereux qu'un test absent — il ferme la question.
#
# Usage : scripts/test-deploy-search-reindex.sh [chemin/vers/deploy.sh]
set -uo pipefail

DEPLOY_SH="${1:-$(cd "$(dirname "$0")" && pwd)/deploy.sh}"
if [ ! -f "$DEPLOY_SH" ]; then
    echo "✗ introuvable : $DEPLOY_SH"
    exit 2
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
BLOC="$TMP/bloc-6b.sh"

# ─── Extraction du bloc réel ────────────────────────────────────────────────
awk '/^# ─── Step 6b:/{f=1} /^# ─── Step 7:/{f=0} f' "$DEPLOY_SH" > "$BLOC"
if ! grep -q 'scout:import' "$BLOC"; then
    echo "✗ HARNAIS CASSÉ : le bloc extrait de $DEPLOY_SH ne contient pas scout:import."
    echo "  Les marqueurs « # ─── Step 6b: » / « # ─── Step 7: » ont bougé. Ce script ne teste"
    echo "  plus rien tant que ce n'est pas corrigé — d'où ce rouge, plutôt qu'un vert vide."
    exit 2
fi
echo "Bloc extrait de $(basename "$DEPLOY_SH") : $(wc -l < "$BLOC" | tr -d ' ') lignes"

ECHECS=0; PASSES=0

# ─── Fabrique une release (racine, puis les modèles indexables) ─────────────
fabrique() {
    local racine="$1"; shift
    rm -rf "$racine"
    mkdir -p "$racine/takussan-api/app/Models" "$racine/takussan-api/config"
    echo "<?php return ['driver' => 'meilisearch'];" > "$racine/takussan-api/config/scout.php"
    local m
    for m in "$@"; do
        printf '<?php\nclass %s {\n  public function toSearchableArray(): array { return ["id" => $this->id]; }\n}\n' \
            "$m" > "$racine/takussan-api/app/Models/$m.php"
    done
}

# ─── Joue un scénario ───────────────────────────────────────────────────────
# $1 nom · $2 SCOUT_DRIVER · $3 PREVIOUS_RELEASE ("" = premier déploiement)
# $4 modèles dont l'import est attendu, triés, séparés d'espaces ("-" = aucun)
scenario() {
    local nom="$1" driver="$2" prev="$3" attendu="$4"
    local appels="$TMP/appels.txt"
    SORTIE="$TMP/sortie.txt"
    : > "$appels"

    mkdir -p "$TMP/bin"
    cat > "$TMP/bin/php" <<STUB
#!/usr/bin/env bash
echo "\$*" >> "$appels"
exit 0
STUB
    chmod +x "$TMP/bin/php"

    mkdir -p "$TMP/shared"
    echo "SCOUT_DRIVER=$driver" > "$TMP/shared/.env"

    (
        set -euo pipefail                      # les conditions réelles de deploy.sh
        export PATH="$TMP/bin:$PATH"
        SHARED_DIR="$TMP/shared"
        PREVIOUS_RELEASE="$prev"
        log() { echo "$*"; }
        cd "$TMP/release/takussan-api"          # le cwd posé par deploy.sh avant cette étape
        # shellcheck disable=SC1090
        source "$BLOC"
    ) > "$SORTIE" 2>&1
    local code=$?

    local obtenu
    obtenu=$(grep 'scout:import' "$appels" 2>/dev/null | sed 's/.*Models\\//' | sort | tr '\n' ' ' | sed 's/ $//')
    [ -z "$obtenu" ] && obtenu="-"
    [ -z "$attendu" ] && attendu="-"

    if [ "$code" -ne 0 ]; then
        echo "✗ $nom — le bloc est SORTI en $code sous set -e :"
        sed 's/^/      /' "$SORTIE"
        ECHECS=$((ECHECS+1)); return
    fi
    if [ "$obtenu" = "$attendu" ]; then
        echo "✓ $nom — imports : $obtenu"
        PASSES=$((PASSES+1))
    else
        echo "✗ $nom — attendu « $attendu », obtenu « $obtenu »"
        sed 's/^/      /' "$SORTIE"
        ECHECS=$((ECHECS+1))
    fi
}

echo
echo "── 1. Forme inchangée : un déploiement de routine ne réindexe RIEN"
fabrique "$TMP/release" Property Customer User
fabrique "$TMP/prev"    Property Customer User
scenario "forme inchangée" meilisearch "$TMP/prev" "-"

echo
echo "── 2. Un seul modèle change : lui seul (c'est tout l'objet du bloc)"
fabrique "$TMP/release" Property Customer User
fabrique "$TMP/prev"    Property Customer User
echo "// la forme de Customer a bougé" >> "$TMP/release/takussan-api/app/Models/Customer.php"
scenario "Customer seul modifié" meilisearch "$TMP/prev" "Customer"

echo
echo "── 3. config/scout.php change : tous, puisqu'il gouverne tous les index"
fabrique "$TMP/release" Property Customer User
fabrique "$TMP/prev"    Property Customer User
echo "// nouveaux ranking rules" >> "$TMP/release/takussan-api/config/scout.php"
scenario "config/scout.php modifié" meilisearch "$TMP/prev" "Customer Property User"

echo
echo "── 4. Premier déploiement (PREVIOUS_RELEASE vide) : tout importer"
fabrique "$TMP/release" Property Customer User
scenario "premier déploiement" meilisearch "" "Customer Property User"

echo
echo "── 4b. PREVIOUS_RELEASE pointe un répertoire absent : tout importer"
fabrique "$TMP/release" Property Customer User
scenario "release précédente absente" meilisearch "$TMP/nexiste-pas" "Customer Property User"

echo
echo "── 5. Modèle indexable NOUVEAU, absent de la release précédente : lui seul"
fabrique "$TMP/release" Property Customer User Message
fabrique "$TMP/prev"    Property Customer User
scenario "nouveau modèle Message" meilisearch "$TMP/prev" "Message"

echo
echo "── 6. Driver non-meilisearch (preview) : le bloc entier est sauté"
fabrique "$TMP/release" Property Customer User
fabrique "$TMP/prev"    Property Customer User
echo "// changé" >> "$TMP/release/takussan-api/config/scout.php"
scenario "driver collection" collection "$TMP/prev" "-"

echo
echo "── 7. Aucun modèle indexable trouvé : un AVERTISSEMENT, pas un silence"
rm -rf "$TMP/release"
mkdir -p "$TMP/release/takussan-api/app/Models" "$TMP/release/takussan-api/config"
echo "<?php return [];" > "$TMP/release/takussan-api/config/scout.php"
fabrique "$TMP/prev" Property
scenario "zéro modèle indexable" meilisearch "$TMP/prev" "-"
if grep -q 'no Searchable model found' "$SORTIE"; then
    echo "  ✓ l'avertissement est émis — le jour où les modèles quittent app/Models, on l'apprend"
    PASSES=$((PASSES+1))
else
    echo "  ✗ AUCUN avertissement : la détection serait muette sur son propre échec"
    ECHECS=$((ECHECS+1))
fi

echo
echo "── 8. Ablation : ce harnais sait-il ÉCHOUER ? (attente volontairement fausse)"
fabrique "$TMP/release" Property Customer User
fabrique "$TMP/prev"    Property Customer User
AVANT=$ECHECS
scenario "[ablation] forme inchangée, mais on attend Property" meilisearch "$TMP/prev" "Property"
if [ "$ECHECS" -gt "$AVANT" ]; then
    echo "  ✓ le harnais rougit quand il doit — les ✓ ci-dessus valent donc quelque chose"
    ECHECS=$((ECHECS-1))   # cet échec EST le résultat attendu
    PASSES=$((PASSES+1))
else
    echo "  ✗ le harnais passe sur une attente fausse : il ne teste rien"
    ECHECS=$((ECHECS+1))
fi

echo
echo "═══ $PASSES passés, $ECHECS échoués"
[ "$ECHECS" -eq 0 ]
