/**
 * Lecture des clés DÉCLARÉES d'un fichier `.env`.
 *
 * Extrait de `scripts/check-env-parity.mjs` (TCK-296) pour être partagé avec
 * `scripts/check-webhook-env-keys.mjs`. **Deux gardes qui lisent le même format
 * avec deux parseurs différents, c'est deux verdicts qui divergent le jour où
 * l'un est affiné et pas l'autre** — et le commentaire ci-dessous a coûté assez
 * cher pour ne pas être recopié.
 *
 * Une clé commentée (`# CACHE_PREFIX=`) compte comme déclarée : c'est une clé que
 * l'application connaît, laissée à sa valeur par défaut. La distinguer de l'absence
 * est justement ce qui rend la garde utile — sinon commenter une clé d'un côté
 * suffirait à la faire disparaître du contrat sans que rien ne le dise.
 *
 * @param {string} contenu
 * @returns {Map<string, {ligne: number, commentee: boolean}>}
 */
export function clefsDeclarees(contenu) {
  const out = new Map();
  contenu.split('\n').forEach((ligne, i) => {
    const m = ligne.match(/^\s*(#\s*)?([A-Z][A-Z0-9_]*)\s*=/);
    if (!m) return;
    // Une ligne commentée n'est une DÉCLARATION que si elle a la forme d'une ligne .env :
    // `# CLE=`, éventuellement suivie d'une valeur SANS espace, puis éventuellement d'un
    // commentaire en ligne introduit par `#`. Tout le reste est de la prose.
    //
    // C'est ce test-ci, et non une comparaison avec l'autre fichier, qui distingue
    //   `# CACHE_PREFIX=`                                        → déclaration
    //   `# SCOUT_QUEUE=true    # recommandé avec Meilisearch`    → déclaration
    //   `# MAIL_FROM_NAME="Takussan App"`                        → déclaration
    //   `# MEILI_MASTER_KEY=masterKey (cf. docker-compose.yml)`  → prose
    //
    // Une version précédente s'y prenait autrement : elle écartait toute clé commentée que
    // l'AUTRE fichier ne connaissait pas. C'était rouvrir exactement le trou que le docblock
    // de `check-env-parity.mjs` dénonce — `# WHATSAPP_API_TOKEN=` ajouté au seul contrat des
    // clés, oublié dans `.env.docker`, disparaissait alors en silence, et c'est le cas le plus
    // courant puisque les clés optionnelles se déclarent commentées.
    //
    // *Quand une règle et son contre-exemple se contredisent, c'est le TEST qu'il faut affiner,
    // pas la portée de la règle : élargir le contexte déplace l'erreur, il ne la retire pas.*
    //
    // ⚠ La valeur peut contenir des ESPACES, et la première version l'ignorait : elle exigeait
    // `(\S*)`, si bien que `# MAIL_FROM_NAME="Takussan App"` ou `# FOO=bar baz` retombaient en
    // prose. Deux dégâts opposés — la clé disparaissait en silence du contrat, ou, si l'autre
    // fichier la déclarait sans commentaire, la garde inventait une clé manquante et rougissait
    // à tort. On distingue donc la prose par ce qu'elle est — du texte SÉPARÉ de la valeur par
    // une espace, hors guillemets — et non par la seule présence d'une espace.
    //
    // La borne est celle de phpdotenv, et non une convention qu'on se donnerait ici : mesuré
    // avec `Dotenv::parse()`, `FOO=bar baz` est REFUSÉ (« Encountered unexpected whitespace »)
    // tandis que `FOO="bar baz"` rend `bar baz`. Une valeur non citée contenant une espace
    // n'est donc pas une déclaration que l'application saurait lire — la traiter comme de la
    // prose n'est pas une approximation, c'est le même verdict que le parseur réel.
    //
    // *Une garde qui décide de ce qu'est une déclaration doit se régler sur l'analyseur qui la
    // lira en production, pas sur l'idée qu'on s'en fait.*
    if (m[1] && !/^\s*#\s*[A-Z][A-Z0-9_]*\s*=\s*("[^"]*"|'[^']*'|\S*)\s*(#.*)?$/.test(ligne)) return;
    if (!out.has(m[2])) out.set(m[2], { ligne: i + 1, commentee: Boolean(m[1]) });
  });
  return out;
}
