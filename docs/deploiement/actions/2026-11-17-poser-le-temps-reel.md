---
titre: "Poser le temps réel : clés REVERB_APP_* et BROADCAST_CONNECTION de l'API, sous-domaine wss du service temps-reel, puis clés TEMPS_REEL_* du front"
type: cle-env
tickets: [TCK-2953, TCK-2956]
cles: [REVERB_APP_ID, REVERB_APP_KEY, REVERB_APP_SECRET, BROADCAST_CONNECTION, TEMPS_REEL_URL, TEMPS_REEL_CLE]
creee: 2026-11-17
preview: a-faire
production: a-faire
---

## Quoi faire

<!-- TCK-2956 : le serveur et l'API (étapes A à E), AVANT les clés du front (TCK-2953, plus bas). -->

### TCK-2956 — le serveur `temps-reel` et l'API, d'abord

Le service `temps-reel` (Reverb, sur l'image de l'API) est dans `deploy/takussan/compose.api.yml` : le déploiement
qui porte TCK-2956 le crée tout seul, aucun geste pour cela. `takussan-api/docker/release.sh` relu : il ne touche
pas au temps réel, rien de ce qui suit n'y a sa place. Ce qu'aucun script ne fait :

**A. Les clés de l'API, dans l'onglet Environment du Compose** (`takussan-api-preview`, puis `takussan-api-production`
en phase F). Section « 19. Temps réel » du gabarit `deploy/takussan/env.api.production.example` :

- `REVERB_APP_ID=takussan` (pas un secret) ;
- `REVERB_APP_KEY` : `openssl rand -hex 16`, **propre à l'environnement**. Elle est publique (elle part dans chaque
  page, c'est aussi `TEMPS_REEL_CLE` du front) ;
- `REVERB_APP_SECRET` : `openssl rand -hex 32`, propre à l'environnement, **jamais ailleurs que dans cet onglet** ;
- `BROADCAST_CONNECTION=reverb` (était `null`).

Les tirer dans le fichier de l'environnement hors du dépôt (`~/Sauvegardes/`, mode `600`, runbook de
`docs/infra/hebergement.md`, « Passer d'un gabarit à un environnement »), jamais dans un terminal qui les affiche ;
comparer par `comparer-config-env.php --contre-courant` (étape 3 du même runbook) avant de coller.
Le même onglet sert l'API, qui signe, et `temps-reel`, qui vérifie : rien d'autre à accorder.

- ⚠ **Ne PAS poser `REVERB_HOST`, `REVERB_PORT` ni `REVERB_SCHEME`** : `compose.api.yml` les écrit (l'alias
  `${API_ALIAS}-temps-reel`, le Reverb de CETTE pile), et l'onglet ne peut pas les changer.
- ⚠ **Jamais `BROADCAST_CONNECTION=reverb` sans les trois `REVERB_APP_*`.** Mesuré le 2026-11-18 : sur une image
  antérieure à TCK-2956, des clés ABSENTES font tomber toute commande et toute requête de l'API (`TypeError` du
  client Pusher au démarrage) — le `migrate` du release compris. Les trois ensemble, ou rien.
- Tant que `REVERB_APP_KEY` manque, `temps-reel` refuse de démarrer et le dit dans son journal (« REVERB_APP_KEY
  absente ou vide ») : c'est l'état attendu entre le déploiement de TCK-2956 et ce geste, sans effet sur l'API.

**B. Redéployer** l'environnement (bouton *Deploy*, ou un push sur `preview`).

**C. Le DNS** (Cloudflare, zone `takussan.com`) : un enregistrement `A` `preview.ws` → `178.18.247.62`, **en DNS
seul** (nuage gris), comme `preview.api`. En phase F : `ws` → la même adresse. Le nom est fixé par
`docs/infra/hebergement.md` (« Ce qui sert quoi »).

**D. Le domaine, dans l'onglet Domains du Compose** : hôte `preview.ws.takussan.com`, service **`temps-reel`**,
port **`8080`**, chemin `/`, HTTPS avec Let's Encrypt. Redéployer : Dokploy pose les labels Traefik au déploiement.
Traefik relaie la mise à niveau WebSocket sans réglage de plus.

**E. Vérifier le serveur** (« Comment vérifier », points 1 à 3) **avant** de passer aux clés du front.

### TCK-2953 — les clés du front, en dernier

Le front se branche au serveur WebSocket du temps réel par deux clés d'exécution
([ADR-0129](../../adr/0129-le-socle-temps-reel-signale-et-l-api-sert.md) § 5, amendé le 2026-11-17) — jamais
des `NEXT_PUBLIC_*`. **Vides, rien ne casse** : le front reste en mode dégradé (relecture périodique). C'est
l'état livré par TCK-2953, et le seul juste tant que le serveur n'existe pas.

⚠ **Ne PAS les poser avant que le service `temps-reel` de TCK-2956 réponde** sur son sous-domaine : une
`TEMPS_REEL_URL` qui vise un serveur absent fait tenter au navigateur une connexion qui échoue à chaque page.

1. Attendre que TCK-2956 soit déployé dans l'environnement : service `temps-reel` sain, sous-domaine servi en
   `wss://`, clés `REVERB_*` posées dans l'onglet Environment de l'API.
2. Dans l'onglet Environment de Dokploy de l'application du front (`takussan-web-preview`, puis
   `takussan-web-production` en phase F) :
   - `TEMPS_REEL_URL` : l'origine WebSocket publique du service, schéma `wss://`, sans chemin ;
   - `TEMPS_REEL_CLE` : la valeur **exacte** de `REVERB_APP_KEY` de l'API du même environnement — la clé
     publique, **jamais** `REVERB_APP_SECRET` (elle part en clair dans chaque page).
3. Redéployer le front (les clés se lisent à l'exécution : un redémarrage suffit, aucune reconstruction).

## Comment vérifier

<!-- TCK-2956 : points 1 à 4, le serveur ; les deux derniers, ceux de TCK-2953, le front. -->

1. **Le service est sain**, sur le serveur : `docker ps --filter name=temps-reel --format '{{.Names}} {{.Status}}'`
   → `Up … (healthy)` ; son journal ne porte pas « REVERB_APP_KEY absente ». Depuis le conteneur `api` de la
   même pile : `docker exec <api> curl -sS http://takussan-api-preview-temps-reel:8080/up` → `{"health":"OK"}` —
   la preuve que l'alias que vise `REVERB_HOST` répond. Relever `docker stats --no-stream` du conteneur et le reporter
   en commentaire de `mem_limit` dans `compose.api.yml` (relevé du 2026-11-18 fait sur une autre image).
2. **Le sous-domaine sert** : `curl -sS https://preview.ws.takussan.com/up` → `{"health":"OK"}`, certificat
   Let's Encrypt valide (`curl` sans `-k`).
3. **Les origines** — depuis le poste, Node 24 (`WebSocket` natif) ; `<CLE>` = `REVERB_APP_KEY`, publique :

   ```bash
   node -e 'const [u,o]=process.argv.slice(1); const w=new WebSocket(u,{headers:{Origin:o}}); w.onmessage=e=>{console.log(o,"→",e.data);process.exit(0)}; setTimeout(()=>process.exit(2),5000)' \
     wss://preview.ws.takussan.com/app/<CLE> https://preview.takussan.com     # → pusher:connection_established
   # même commande avec https://autre.example                                  # → pusher:error 4009 « Origin not allowed »
   ```

   Un 4009 sur l'origine du front : `FRONTEND_URL` de l'API ne vaut pas `https://preview.takussan.com`.
4. **L'API publie dans SON Reverb** : aucune ligne `[temps-reel] signal non émis` au journal de l'`api` après une
   action qui notifie (`docker logs --since 10m <api> | grep -c 'signal non émis'` → `0`), et le compteur du jour
   reste nul : `docker exec <api> php artisan tinker --execute='echo Cache::get("temps-reel:echecs:".now()->format("Y-m-d"), 0);'`.
- Une page de l'espace connecté ouvre une connexion `wss://…/app/<TEMPS_REEL_CLE>` (onglet Réseau, filtre WS)
  qui reçoit `pusher:connection_established`.
- Une notification créée pour l'utilisateur connecté fait bouger la cloche sans rechargement.

## Historique
