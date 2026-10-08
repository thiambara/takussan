# ADR-0052 — La fiche publique se lit dans un cache de données étiqueté par slug, et l'IP du visiteur traverse le serveur Next par la chaîne de confiance

- **Statut** : Accepté
- **Date** : 2026-10-08
- **Tickets** : [TCK-598](../backlog/tickets/TCK-598-site-public-fiche-cachable-et-confiance.md)
- **S'appuie sur** : [ADR-0026](0026-la-langue-est-un-segment-d-url-sur-la-surface-publique.md) (la
  langue est un segment d'URL), [ADR-0028](0028-auto-hebergement-conteneurise-sur-le-vps.md) (front et
  API en conteneurs sous Dokploy, `master` encore servie par Vercel jusqu'à la phase F).

## Contexte

Relu sur `dev` à `06a0f7f0` (2026-10-08) :

- **La fiche ne peut pas être mise en cache.** `PublicPropertyController::show()` incrémente
  `views_count` par `$property->increment()`, qui déclenche `updating`/`updated` et rajeunit
  `updated_at` : chaque vue vide l'étiquette `property-similar` entière et fait annoncer le bien
  « modifié » par le sitemap. Le corps dépend en outre de l'appelant : avec un jeton Bearer, les
  quatre champs de modération, l'e-mail des collaborateurs et l'original signé des photos
  apparaissent (`PropertyResource`). TCK-341 a refusé `public` et `etag` sur cette route pour ces
  raisons (`routes/api/public.php`).
- **Le HTML entier ne se met pas en cache.** La mise en page racine lit le cookie d'authentification
  (`src/app/layout.tsx`) : toute route est dynamique. Seules les **données** se cachent.
- **Tout le rendu serveur partage un seau du limiteur.** `apiFetch` n'envoie ni jeton ni
  `X-Forwarded-For` ; ses appels serveur partent avec l'IP du serveur Next, et `throttle:public-read`
  (90/min, clé `ip:{Request::ip()}`) devient un seau unique pour tous les visiteurs.
- **`apiRequest` transmet une IP falsifiable.** `resolveVisitorIp()` retient l'entrée la plus à gauche
  de `X-Forwarded-For`, celle que le client écrit. Cloudflare, devant `preview.takussan.com`, *ajoute*
  à un `X-Forwarded-For` reçu.
- **Le transport écarte probablement l'en-tête.** Le serveur Next appelle l'API par son nom public
  (`NEXT_PUBLIC_API_URL`), donc à travers Traefik, qui ne croit `X-Forwarded-For` que de Cloudflare :
  un `X-Forwarded-For` forgé par un client n'atteint pas Laravel (`docs/infra/hebergement.md`, ligne
  « IP du client jusqu'à Laravel », mesuré le 2026-09-14). Le serveur Next est un client comme un
  autre pour Traefik. **Inféré, pas mesuré** : la mesure est confiée au porteur (§ 6).
- Il n'existe ni manifeste ni service worker ; `public/` ne porte que les cinq SVG du gabarit.

## Décision

**La fiche publique se lit par un appel partagé, mis en cache de données par Next, étiqueté
`property:{slug}` et revalidé au plus tard toutes les 300 s ; l'API l'invalide par un appel signé.
Tout autre appel serveur rendu pour un visiteur transmet l'IP que la chaîne de mandataires de
confiance a établie, et le serveur Next parle à l'API par son adresse interne pour que Laravel
l'honore.**

### 1. Le cache de données de la fiche

- La fiche lit `GET /api/public/properties/{slug}` par `fetch(…, { next: { revalidate: 300, tags:
  ['property:{slug}'] } })`. **300 s est un plancher de fraîcheur, pas une promesse** : c'est le
  retard maximal d'un changement que l'appel signé n'a pas porté (photos, étiquettes, avis,
  documents, agence).
- L'appel est **partagé** : il ne lit pas les en-têtes entrants et n'en porte aucun qui soit propre
  au visiteur — ni `Authorization`, ni `X-Forwarded-For`. Seul `Accept-Language` varie, et il le doit
  (les libellés d'énumération sont traduits par l'API) : trois entrées par slug au plus.
- **Le corps de `public.*` ne dépend plus de l'appelant** (contrainte 2 de TCK-598) : sur une route
  `public.*`, `PropertyResource` n'émet ni `collaborators`, ni champ de modération, ni original signé,
  quel que soit le jeton. Le cache partagé n'est sûr que grâce à cette règle ; l'absence de jeton
  dans l'appel en cache n'en est que la seconde ligne.
- **Le compteur de vues n'entre pas dans la lecture.** `show()` n'écrit plus. Une vue se compte par
  `POST /api/public/properties/{slug}/view`, envoyé **par le navigateur, directement à l'API** :
  l'API y voit l'IP du visiteur par sa propre chaîne (Traefik), sans transit par Next. Le compteur
  affiché peut donc avoir **jusqu'à 300 s de retard** sur la base — accepté par le porteur le
  2026-10-06.
- Le comptage passe par un seul service (`PropertyViewCounter`), une seule clé de déduplication par
  (bien, IP) commune aux deux routes qui comptent, et un incrément par le constructeur de requêtes :
  ni `updated_at`, ni événement de modèle.

### 2. L'invalidation

- Un observateur distinct de `PropertyObserver` (`PropertyPublicCacheObserver`, enregistré à côté de
  lui) met en file `RevalidatePublicPropertyPage` quand un champ servi par la fiche change, après la
  validation de la transaction. Si le slug change, l'ancien et le nouveau partent. Une vue ne
  déclenche rien (elle ne passe pas par Eloquent).
- Le job `POST`e `{"slugs": [...]}` sur `PUBLIC_CACHE_REVALIDATE_URL`, signé par HMAC-SHA256 de
  `<horodatage>.<corps>` avec `PUBLIC_CACHE_REVALIDATE_SECRET` (en-tête
  `X-Takussan-Signature: t=<horodatage>,v1=<hex>`). Le handler du front refuse une signature fausse,
  absente ou vieille de plus de 300 s (comparaison à temps constant), puis appelle
  `revalidateTag('property:{slug}', { expire: 0 })` : l'entrée expire **immédiatement**, parce qu'un
  bien qui vient de quitter le public ne doit pas être resservi.
- Le job réessaie (3 essais, attente croissante). **Sans configuration, il ne fait rien** : la
  revalidation temporelle seule s'applique. C'est le cas du développement et de tout environnement
  qui ne pose pas les clés.

### 3. Deux hébergeurs et plusieurs répliques

- **`preview` (VPS, Dokploy)** : une réplique du front, cache de données sur son système de fichiers.
  L'appel signé vise `https://preview.takussan.com/api/revalidation/fiche`. Un déploiement repart
  d'un cache vide : il remplace l'ancien.
- **Plus d'une réplique du front** : chaque instance a son cache, et l'appel signé n'en atteint qu'une.
  Les autres resservent l'ancienne fiche **jusqu'à 300 s**, y compris celle d'un bien retiré. **Passer
  le front à plus d'une réplique exige donc un `cacheHandler` partagé (Redis), décidé par un nouvel
  ADR** ; d'ici là, une réplique.
- **`master` (Vercel, jusqu'à la phase F)** : le cache de données de Vercel est commun à toutes les
  instances d'un déploiement. Mais l'API de production n'existe pas (TCK-332) : aucun émetteur, la
  revalidation temporelle seule s'applique. Le jour où elle existe, elle vise
  `https://www.takussan.com/api/revalidation/fiche`.

### 4. Le service worker

- Il ne met **jamais** en cache une navigation HTML : la mise en page racine y injecte l'utilisateur
  connecté, et ce cache resservirait ses données après la déconnexion.
- Il ne met jamais en cache une réponse à une requête qui porte `Authorization` ou un cookie, ni rien
  sous `/app`, `/admin`, `/super-admin`, ni un handler BFF `/api/*` du front, ni un `.ics`.
- Entrent seulement : les ressources statiques versionnées (`/_next/static/*`, les icônes), et les
  réponses **anonymes** de `GET <API>/api/public/properties/by-ids`, celles qui relisent les favoris
  locaux.
- La page hors ligne n'est **pas** une page mise en cache : le service worker la **construit** (texte
  du dictionnaire, trois langues, intégré à son script), et elle relit les favoris locaux depuis les
  réponses anonymes mises en cache. Elle ne passe pas par la mise en page racine.
- Les noms de cache portent la version du déploiement (`BUILD_SHA`, sinon l'identifiant du build) :
  un nouveau déploiement supprime les caches de l'ancien à l'activation.

### 5. L'IP du visiteur à travers le serveur Next

- **Le front établit l'IP une seule fois, par la chaîne de confiance**, jamais par l'entrée la plus à
  gauche : il retient l'entrée de rang `n − h` de `X-Forwarded-For` (n entrées, `h` =
  `VISITOR_IP_TRUSTED_HOPS`, clé serveur, défaut 1), ou la plus à gauche si la chaîne est plus courte
  que `h`. Ce sont les `h` entrées de droite que des mandataires de confiance ont ajoutées ; tout ce
  qui est à leur gauche peut venir du client.
  - **Vercel (`www`)** : `h = 1`. Vercel remplace `X-Forwarded-For` par l'IP du client (documenté par
    Vercel ; inféré, non mesuré ici).
  - **`preview` (Cloudflare → Traefik → Next)** : `h = 2`. Cloudflare ajoute l'IP du client ; Traefik,
    qui croit les plages de Cloudflare, ajoute celle du nœud Cloudflare. Next n'ajoute rien
    (`base-server.js` : `x-forwarded-for ??=`, seulement en l'absence de l'en-tête). **Inféré, à
    mesurer par le porteur (AC22).** Un client qui joint l'origine sans Cloudflare voit son
    `X-Forwarded-For` effacé par Traefik et remplacé par sa vraie IP : `h = 2` retombe alors sur
    l'unique entrée, la bonne.
  - Hors requête (build, script), rien n'est transmis.
- **`apiFetch` comme `apiRequest` la transmettent par défaut** côté serveur. Un appel **partagé** — en
  cache de données, ou exécuté dans une route revalidée (le sitemap) — le déclare explicitement
  (`partage: true`) : il ne lit pas `next/headers` et ne porte aucun en-tête propre au visiteur. Il est
  compté dans le seau du serveur front, une fois par revalidation et par URL.
- **Le serveur Next appelle l'API par son adresse interne** quand `API_INTERNAL_URL` est posée (clé
  serveur, jamais `NEXT_PUBLIC_*`) ; sinon par l'URL publique. Sur `preview`, c'est le service `api`
  sur `dokploy-network`, port 8080, dont le sous-réseau (`10.0.1.0/24`) est déjà en tête de
  `TRUSTED_PROXIES` : Laravel y honore `X-Forwarded-For`. **Aucun client extérieur ne peut emprunter
  ce chemin** : le port 8080 n'est pas publié, et Traefik, seul point d'entrée, efface tout
  `X-Forwarded-For` qui ne vient pas de Cloudflare. `TRUSTED_PROXIES` ne change pas.
- Sur ce chemin interne, le front envoie aussi `X-Forwarded-Host`, `X-Forwarded-Proto` et
  `X-Forwarded-Port`, **dérivés de l'URL publique et identiques pour tous** : sans eux, les URL que
  Laravel fabrique depuis la requête (`route()`, le lien d'un document publié) désigneraient l'hôte
  interne. Ils ne fragmentent aucun cache.

### 6. Ce qui reste à mesurer, et par qui

L'IP que Laravel voit sur le chemin serveur Next → API est **inférée, pas mesurée**. Le porteur la
mesure sur `preview`, **avant** de poser `API_INTERNAL_URL` et `VISITOR_IP_TRUSTED_HOPS` puis
**après** (AC22 de TCK-598), en chargeant `/fr/properties` depuis deux réseaux, puis :

```bash
ssh root@178.18.247.62 'docker exec $(docker ps -qf name=takussan-api-preview-4iza80-api-1) php artisan tinker --execute="foreach ([\"<IP A>\", \"<IP B>\", \"178.18.247.62\"] as \$ip) echo \$ip, \" \", Illuminate\Support\Facades\RateLimiter::attempts(md5(\"public-read\".\"ip:\".\$ip)), PHP_EOL;"'
```

Attendu après : un compte positif pour A et pour B, celui de l'IP du VPS inchangé par ces rendus ; et
un `X-Forwarded-For` forgé par A ne change pas sa clé. Si la mesure contredit `h = 2`, c'est `h` qui
change, pas la règle.

## Conséquences

- La fiche ne coûte plus un aller-retour à l'API par visite : une par revalidation et par langue.
  Le compteur de vues affiché a jusqu'à 300 s de retard.
- Le sitemap n'annonce plus « modifié » un bien seulement vu, et la vue d'un bien ne vide plus les
  biens similaires de tous les autres.
- Deux clés d'environnement côté API (`PUBLIC_CACHE_REVALIDATE_URL`, `PUBLIC_CACHE_REVALIDATE_SECRET`)
  et trois côté front (`PUBLIC_CACHE_REVALIDATE_SECRET`, `API_INTERNAL_URL`,
  `VISITOR_IP_TRUSTED_HOPS`), toutes serveur. Le secret est le même des deux côtés.
- **Interdit** : plus d'une réplique du front sans `cacheHandler` partagé ; un `Authorization` ou un
  `X-Forwarded-For` dans l'appel en cache de la fiche ; une IP lue à gauche de `X-Forwarded-For` ;
  un service worker qui met en cache une navigation ou une réponse authentifiée.
- **Écarté** :
  - *Le cache HTML de la page entière (ISR)* : il exige de retirer la lecture du cookie de la mise en
    page racine. Limite d'architecture, hors de TCK-598.
  - *`Cache-Control: public` sur la réponse de l'API, servi par Cloudflare* : `preview.api` est en
    DNS seul, le serveur Next n'émet pas de requête conditionnelle (`fetch` de Next 16), et
    l'invalidation d'un CDN demande une API tierce.
  - *Compter la vue depuis le serveur Next* : il faudrait transmettre l'IP, refaire le comptage à
    chaque rendu, et le compteur reviendrait dans le chemin de la page.
  - *Croire `CF-Connecting-IP`* : un client qui joint l'origine sans Cloudflare l'écrit lui-même.
  - *Faire croire Traefik au serveur Next* : il faudrait que Traefik fasse confiance à l'IP sortante
    du VPS, que tout conteneur du serveur partage.
  - *`next-pwa` / Workbox* : une dépendance pour quelques règles qui tiennent dans un fichier, et dont
    le précache par défaut met en cache des navigations.

## Application

- API : `App\Services\Property\PropertyViewCounter`, `PublicPropertyController::view()` et
  `::show()`, `App\Observers\PropertyPublicCacheObserver`,
  `App\Jobs\Property\RevalidatePublicPropertyPage`, `config/services.php` (`public_cache`),
  `PropertyResource` (règle des routes `public.*`).
- Front : `src/lib/api.ts` (`resolveVisitorIp`, `partage`, `API_INTERNAL_URL`),
  `src/lib/queries/public-property.ts`, `src/app/api/revalidation/fiche/route.ts`,
  `src/app/sw.js/route.ts`, `src/app/manifest.ts`.
- Tests : `tests/Feature/Public/PropertyCollaboratorsNotExposedTest.php`,
  `PublicPropertyViewCounterTest`, `PropertyPublicCacheObserverTest`,
  `PublicReadLimiterPerVisitorTest` ; côté front, les tests de `lib/api.ts`, du handler de
  revalidation et du service worker.
- Mesure de bout en bout : § 6, confiée au porteur.
