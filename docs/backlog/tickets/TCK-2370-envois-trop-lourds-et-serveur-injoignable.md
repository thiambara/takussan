---
id: TCK-2370
title: "Envois trop lourds lisibles : 413 du proxy avec CORS et code, serveur injoignable distingué du réseau, photos une à une, photo de bien rendue depuis son envoi"
status: done
phase: P2
family: bug
estimate: M
wave: null
created: 2026-10-25
updated: 2026-10-25
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#18-maintenance--interventions"
    - "docs/features.md#19-état-des-lieux--inventaires"
    - "docs/features.md#27-médias--fichiers"
    - "docs/features.md#11-gestion-des-biens"
  adr:
    - "docs/adr/0028-auto-hebergement-conteneurise-sur-le-vps.md"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-236--réponses-derreur-sans-corps-json-lues-par-apirequest-jsonorthrow-et-les-relais-puis-rendues-comme-une-erreur-générique-ou-de-réseau"
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-237--gestes-en-deux-requêtes-dont-le-second-échec-est-avalé"
tags: [infra, image, front, maintenance, inventory, media, i18n, pistes]
---

## Objectif utilisateur

Celui qui envoie des photos ou des pièces ne lit jamais « Vérifiez votre connexion internet »
quand c'est le serveur qui refuse ou ne répond pas : un envoi trop lourd se nomme et dit quoi
changer, un serveur injoignable se dit tel, les photos d'une demande et d'un état des lieux
partent une à une sous la borne du proxy, et une photo de bien envoyée paraît dans la grille.

## Contexte

Réfs : **P236.01, P236.02, P236.03, P237.03** du fichier de pistes, `validé` par le porteur le
2026-10-25 (second tour).

- **P236.01** — le proxy de l'image (`docker/Caddyfile`) refuse en 413 tout corps annoncé au-delà
  de 26 214 400 octets, avant `php_server` : la réponse n'a ni corps JSON ni les en-têtes CORS de
  Laravel. Dans le navigateur, `fetch` rejetait en `TypeError`, rendu « Vérifiez votre connexion
  internet » ; par un relais, `ApiError(413, null)` rendait le repli générique.
- **P236.02** — `useUploadMaintenancePhotos` et `useUploadInventoryRoomPhotos` mettaient tout le
  lot (jusqu'à 20 photos) dans un seul `FormData` : 19 photos réduites dépassent la borne du proxy.
  Les sélecteurs de la demande neuve et des photos « avant » prenaient tout, sans borne dite.
- **P236.03** — tout `TypeError` de `fetch` devenait `errors.api.network`, alors que la même panne
  par un relais disait « serveur » (`upstream_unavailable`).
- **P237.03** — `PropertyMediaPanel` relisait la liste après un envoi réussi, et rendait `[]` si
  la relecture échouait : la ligne passait à « envoyée » sans photo dans la grille.

## Décision du porteur

- **P236.01** :
  > validation du porteur (2026-10-25) : Caddy pose les en-têtes CORS de l'API et un corps `{code: payload_too_large}` sur son 413 ; le front ajoute `payload_too_large` à `CODES_ERREUR_API` avec un libellé qui dit quoi changer ; `smoke-api.sh image` envoie 26 Mio avec un `Origin` et exige l'en-tête
- **P236.02** :
  > validation du porteur (2026-10-25) : ces photos partent une à une, comme la clôture (TCK-2330), et la borne de 20 est annoncée au sélecteur de la demande neuve et des photos « avant »
- **P236.03** :
  > validation du porteur (2026-10-25) : `messageErreurApi` distingue « serveur injoignable » d'une absence de réseau (`navigator.onLine`), avec un libellé neuf
- **P237.03** :
  > validation du porteur (2026-10-25) : la photo envoyée est rendue depuis la réponse de l'envoi, sans dépendre de la relecture

## Hypothèses

- **Les en-têtes du 413 sont ceux que Laravel pose avec une seule origine permise** (fruitcake :
  `Access-Control-Allow-Origin` = `FRONTEND_URL` sans écho de l'`Origin`, sans `Vary`, plus
  `Access-Control-Allow-Credentials: true`), lus de `FRONTEND_URL` dans l'environnement du
  conteneur (`env_file: .env` de `compose.api.yml`), avec le même défaut que `config/cors.php`
  (`http://localhost:3000`). Ils sont posés sur **tout chemin** et non sur les seuls `paths` de
  `config/cors.php` : recopier la liste dans le `Caddyfile` en ferait une seconde à tenir, et le
  corps de ce 413 ne porte que le code.
- **Le code se reconnaît au statut 413 comme au corps** : un relais qui recopie un corps vide
  (`kyc/upload`) ne laisse que le statut. La prose localisée de Laravel sur son propre 413
  (`http.payload_too_large`) garde la priorité, comme toute prose.
- **Le libellé nomme la borne (25 Mo)** : c'est la borne du proxy, déjà dite « 25 Mio » dans
  `borne-du-corps.ts`.
- **« Serveur injoignable » vaut aussi sans `navigator`** (action serveur, relais) : un `TypeError`
  du `fetch` de Next vers l'API n'est pas le réseau de l'utilisateur. Un délai dépassé
  (`TimeoutError`, TCK-1295) garde le libellé réseau : la décision ne porte que sur le `TypeError`.
- **La borne de 20 est tenue au sélecteur, pas seulement annoncée** : envoyées une à une, les
  photos ne sont plus bornées par le `max:20` de l'API, qui juge chaque requête. Une sélection de
  plus de 20 photos est refusée entière et dite, comme `MediaDropzone` et le devis (TCK-1889).
- **Arrêt au premier échec, comme la clôture** : une photo jointe sort de la sélection (photos
  « avant », état des lieux), si bien que réessayer n'envoie que le reste. La demande neuve, qui
  mène à sa fiche, garde son avertissement persistant (TCK-2146), sans compte des photos jointes.
- **L'état des lieux dit la raison de l'échec** (`messageErreurApi`, repli `uploadFailed`) : c'est
  l'un des trois écrans que P236.01 cite.
- **L'envoi d'une photo de bien rend les médias créés** : l'API les rendait déjà
  (`PropertyMediaController::store`, `201 {data: [...]}`), l'action les jetait. Le filtre
  `knownIdsRef`, qui ne servait qu'à la relecture, disparaît avec elle.

## Delta à produire

- [x] `takussan-api/docker/Caddyfile` : en-têtes CORS, `Content-Type: application/json` et corps
      `{"code":"payload_too_large"}` sur le 413 de `@trop_gros`.
- [x] `deploy/takussan/smoke-api.sh image` : `verifier_refus_trop_gros_lisible` (26 Mio avec un
      `Origin`, 413, en-têtes CORS, corps).
- [x] `src/lib/api.ts` : codes `payload_too_large` et `server_unreachable` ; `codeErreur` rend
      `payload_too_large` sur un 413 sans prose ; `messageErreurApi` lit `navigator.onLine`.
- [x] Clés `errors.api.payloadTooLarge` et `errors.api.serverUnreachable` en `fr`, `en`, `wo` (le
      `wo` porte le français).
- [x] `MaintenanceForm`, `MaintenanceGallery` (photos « avant »), `InventoryDetail` : une photo
      par appel, arrêt au premier échec ; borne de 20 annoncée et tenue aux deux sélecteurs.
- [x] `uploadPropertyPhotos` et `uploadPropertyPhotosAction` rendent les médias créés ;
      `PropertyMediaPanel` les rend sans relire la liste.

## Critères d'acceptation

- [x] AC1 (P236.01) — `smoke-api.sh image` : un corps de 26 Mio envoyé avec un `Origin` rend 413,
      `Access-Control-Allow-Origin` = `FRONTEND_URL`, `Access-Control-Allow-Credentials: true`,
      `Content-Type: application/json` et `{"code":"payload_too_large"}`. Sur l'image
      précédente, l'étape rougit sur l'en-tête.
- [x] AC2 (P236.01) — `messageErreurApi` sur `ApiError(413, {code: 'payload_too_large'})` et sur
      `ApiError(413, null)` rend « L'envoi dépasse 25 Mo : envoyez moins de fichiers à la fois, ou
      des fichiers plus légers. » ; la prose de Laravel sur son 413 l'emporte.
- [x] AC3 (P236.03) — un `TypeError` en ligne, ou sans `navigator`, rend « Le serveur est
      injoignable pour le moment. Réessayez dans un instant. » ; hors ligne, le libellé réseau.
- [x] AC4 (P236.02) — demande neuve, photos « avant » et état des lieux : 19 photos choisies →
      19 appels d'une photo chacun, aucun appel à plusieurs photos.
- [x] AC5 (P236.02) — le deuxième envoi échoue : aucun envoi suivant ; aux photos « avant » et à
      l'état des lieux, réessayer n'envoie que les photos non jointes.
- [x] AC6 (P236.02) — la borne de 20 se lit sous les sélecteurs de la demande neuve et des photos
      « avant » ; 21 photos choisies sont refusées et dites, et rien ne part.
- [x] AC7 (P237.03) — un envoi réussi dont la relecture échouerait montre la photo dans la grille,
      depuis la réponse de l'envoi, et la liste n'est pas relue.

## Hors périmètre

- Les en-têtes CORS d'un 502 ou d'un 503 du mandataire devant l'API (Traefik), et ce que rend une
  erreur fatale de PHP hors de la pile des middlewares (P236.03, non vérifiables depuis le poste).
- Un envoi `chunked`, sans `Content-Length`, que seul `request_body` borne, sans 413 (Caddyfile).
- Le compte des photos jointes dans l'avertissement de la demande neuve.

## Notes d'implémentation

- **Image** : construite en local sous `ghcr.io/thiambara/takussan-api:local-l38` (jamais poussée),
  `TAG=local-l38 deploy/takussan/smoke-api.sh image` vert de bout en bout. Ablation : la seule
  étape neuve jouée sur l'image précédente (`local-l27`, même Caddyfile qu'avant ce ticket) rougit
  sur « le 413 du proxy n'a pas l'en-tête Access-Control-Allow-Origin » (le 413 y est déjà).
- **`header @trop_gros` avant `respond`** : `static_response` ne pose son `Content-Type` que s'il
  n'y en a pas, et l'ordre des directives de Caddy place `header` avant `respond`. Le serveur de
  la sonde tourne sans l'entrypoint : Caddy répond avant PHP, `APP_KEY` est inutile.
- **Ablations du front** : la ligne `413` de `codeErreur` retirée → les deux tests de libellé de
  P236.01 rouges ; la lecture de `navigator.onLine` retirée → les deux tests « injoignable » rouges ;
  les trois écrans de photos rendus à leur version d'avant → les dix tests de P236.02 rouges ; le
  seul retrait de la photo jointe de la sélection supprimé → les tests de reprise rouges (et ceux
  du compte, qui attendent le bouton vide) ; l'ancien `PropertyMediaPanel` remis → le test de
  P237.03 rouge (ligne `done`, aucune tuile).
- `useApiForm.test.tsx` attendait « connexion » pour tout `TypeError` : le cas se fait hors ligne,
  et un second cas fixe « serveur injoignable » en ligne.
- `InventoryDetail` perd un `onClick` asynchrone : `eslint-suppressions.json` est élagué d'une
  entrée `no-misused-promises`, sans quoi `npm run lint` sort en 2.
