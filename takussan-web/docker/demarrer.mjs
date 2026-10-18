// Le point d'entrée de l'image du front — ADR-0069 § 3. Le `CMD` du Dockerfile le lance À LA
// PLACE de `server.js`, qu'il importe une fois la configuration vérifiée.
//
// L'image ne porte plus d'environnement : l'origine de l'API, celle du site et celle des médias se
// lisent à l'exécution (`src/lib/config-publique.ts`). La protection d'ADR-0028 § 3, qui refusait
// le BUILD sans elles, passe donc ici : le conteneur REFUSE DE DÉMARRER. Sans `SITE_URL`, une
// préproduction déclarerait ses pages canoniques en production (ADR-0026) ; sans `MEDIA_URL`, le
// loader rendrait chaque photo en pleine taille. Les deux sans rien casser de visible — c'est
// pourquoi on ne sert rien du tout. Swarm, qui ne bascule que sur un conteneur sain, garde alors
// l'ancien.
//
// ⚠ Une ORIGINE seule : ni barre finale, ni chemin. Le loader compare `url.origin` à `MEDIA_URL`,
// et un chemin de base serait recopié devant chaque URL du sitemap.
//
// Du JavaScript nu, sans dépendance : il tourne avant tout le reste, dans l'image standalone.

const CLES = ['API_URL', 'SITE_URL', 'MEDIA_URL'];

/** Les messages d'erreur de la configuration, un par clé fautive. Vide si tout tient. */
function erreursDeConfiguration(env) {
  const erreurs = [];
  for (const cle of CLES) {
    const valeur = env[cle]?.trim();
    if (!valeur) {
      erreurs.push(`✗ ${cle} manquante (ADR-0069 § 3) : à poser dans Dokploy, sur le service.`);
      continue;
    }
    let url;
    try {
      url = new URL(valeur);
    } catch {
      erreurs.push(`✗ ${cle} = « ${valeur} » n'est pas une URL absolue (schéma compris).`);
      continue;
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      erreurs.push(`✗ ${cle} = « ${valeur} » : seuls http et https sont servis.`);
    } else if (url.origin !== valeur) {
      erreurs.push(
        `✗ ${cle} = « ${valeur} » : attendu une ORIGINE seule, sans barre finale ni chemin — « ${url.origin} ».`,
      );
    }
  }
  return erreurs;
}

const erreurs = erreursDeConfiguration(process.env);
if (erreurs.length > 0) {
  for (const erreur of erreurs) console.error(erreur);
  console.error('Le front ne démarre pas sans sa configuration (ADR-0069 § 3).');
  process.exit(1);
}

await import('./server.js');
