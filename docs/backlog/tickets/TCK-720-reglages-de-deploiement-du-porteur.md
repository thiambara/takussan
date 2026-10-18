---
id: TCK-720
title: "Réglages de déploiement que les agents ne peuvent pas faire : jeton des accusés SMS, délai du worker, CACHE_PREFIX, image de l'API et next/image"
status: todo
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-16
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
    - docs/features.md#23-notifications
    - docs/features.md#27-médias--fichiers
  models: []
tags: [infra, dokploy, deploy, sms, media, porteur, pistes]
---

## Objectif utilisateur

Que le porteur trouve au même endroit les réglages de déploiement qui restent après la validation
des pistes du 2026-10-16, puis de celles du 2026-10-17. Les agents n'ont pas le droit d'y toucher (`deploy/`, Dokploy, image),
et sans ces réglages les correctifs du code ne suffisent pas.

## Contrat de données

Aucun endpoint ni modèle. Les clés d'environnement et leur emplacement sont décrits dans
[`docs/infra/hebergement.md`](../../infra/hebergement.md), et les drivers déclarés dans
[`docs/infra/prod-drivers.json`](../../infra/prod-drivers.json).

Sources : pistes P27.01, P27.04, P05.09, P10.10, puis P36.04 et P37.03 (2026-10-17), de
[`docs/plans/2026-10-15-pistes-d-amelioration.md`](../../plans/2026-10-15-pistes-d-amelioration.md),
où chaque constat est sourcé et daté.

## Contraintes strictes (métier)

- Aucun secret dans le dépôt, ni dans un journal, ni dans une commande où le shell le développe.
  Les valeurs se posent dans Dokploy ; le dépôt ne porte que les clés.
- Le délai du worker se règle **après** le budget de la chaîne SMS posé en code (P27.04, validé
  pour l'implémenteur) et **au-dessus** de lui : un worker plus court que la chaîne tue le job et
  le rejoue, et un fournisseur qui a déjà accepté renvoie le SMS.
- Préproduction et production partagent `redis-takussan` : deux environnements ne doivent jamais
  avoir le même préfixe de cache.

## Delta à produire

- [ ] **P27.01** — poser `SMS_WEBHOOK_URL_TOKEN` (valeur aléatoire, par environnement) dans
  Dokploy, puis vérifier qu'un SMS lié à une notification part par LAfricaMobile avec son
  `ret_url`. Le code envoie déjà sans accusé quand la clé manque, une fois la piste faite par
  l'implémenteur.
- [ ] **P27.04** — `deploy/takussan/compose.api.yml` : `--timeout` explicite sur `queue:work`,
  supérieur au budget de la chaîne et au `$timeout` des notifications SMS ; vérifier que
  `retry_after` de la connexion `database` reste au-dessus (voir aussi P05.06, déjà noté hors
  agents avec le `stop_grace_period`).
- [ ] **P05.09** — `CACHE_PREFIX` distinct par environnement déployé (préproduction, puis
  production à la phase F), et la clé ajoutée au relevé des clés de `docs/infra/hebergement.md`.
- [ ] **P10.10** — image de l'API : installer `jpegoptim`, `pngquant`, `optipng`, `gifsicle`,
  `cwebp` et `avifenc` dans `takussan-api/Dockerfile`, **ou** retirer le bloc d'optimiseurs de
  `config/media-library.php` et son commentaire `--strip-all`, qui laisse croire que l'EXIF est
  retiré. Choix à faire.
- [ ] **P10.10** — `takussan-web/next.config.ts` : `dangerouslyAllowSVG` et
  `dangerouslyAllowLocalIP` limités au développement (ou une `contentSecurityPolicy` si le SVG
  distant doit rester), et le commentaire de `deviceSizes` corrigé (`full` à 1600 px, pas
  `preview` à 800 px).
- [ ] **P10.10** — servir l'avatar par une conversion à sa taille d'affichage, plutôt que
  l'original jusqu'à 2560 px.
- [ ] **P36.04** — une fois la piste faite par l'implémenteur (un jeton d'URL par fournisseur, repli
  sur `SMS_WEBHOOK_URL_TOKEN`) : poser les trois jetons, un par fournisseur et par environnement,
  dans Dokploy, puis reporter l'URL de chacun dans le tableau de bord de son fournisseur. Le jeton
  de LAfricaMobile ne doit plus ouvrir la route d'Orange.
- [ ] **P37.03** — préproduction : poser `API_INTERNAL_URL` sur `takussan-web-preview`, après la
  mesure de D-71 (l'alias `api` doit être unique sur `dokploy-network` ; sinon le nom du
  conteneur) et le relevé d'ADR-0052 § 6 avant et après. Sans elle, les trois formulaires anonymes
  envoyés par action serveur (visite, contact d'un bien, contact d'un agent) partagent un seul seau
  de débit pour tout le site.
  *2026-10-18 : `API_INTERNAL_URL` posée par le porteur, le front redéployé en session et mesuré
  (le conteneur la lit, `/up` → `200` par `http://takussan-api-preview:8080`). Le relevé « avant »
  n'a pas été fait. Restent `VISITOR_IP_TRUSTED_HOPS=2` et le relevé « après », depuis deux
  réseaux, à faire avec la session.*
- [ ] Mettre chaque piste à `fait · TCK-720` dans le fichier de pistes une fois sa part faite.

## Critères d'acceptation

- [ ] AC1 — en préproduction, un SMS lié à une notification passe par LAfricaMobile sans
  `driver_exception_UrlGenerationException` dans `sms_attempts`.
- [ ] AC2 — la commande `queue:work` servie en préproduction porte un `--timeout` supérieur au
  budget de la chaîne SMS, relu dans la Compose déployée et pas seulement dans le dépôt.
- [ ] AC3 — les variables de la préproduction relevées dans Dokploy portent un `CACHE_PREFIX`
  propre à l'environnement.
- [ ] AC4 — une image téléversée en préproduction est optimisée (binaire présent dans l'image,
  `which jpegoptim` dans le conteneur), ou le bloc d'optimiseurs n'existe plus.
- [ ] AC5 — `next build` en mode production ne déclare plus `dangerouslyAllowSVG` ni
  `dangerouslyAllowLocalIP` sans `contentSecurityPolicy`.
- [ ] AC6 — en préproduction, un accusé posté sur la route d'Orange avec le jeton de LAfricaMobile
  est refusé, et le jeton d'Orange l'ouvre.
- [ ] AC7 — en préproduction, `API_INTERNAL_URL` est présente dans `takussan-web-preview`
  (commande de D-71, qui n'imprime que des noms), et six demandes de contact anonymes venues de
  deux visiteurs différents en dix minutes ne se refusent pas l'une l'autre.

## Hors périmètre

- Le code des pistes P27.01 et P27.04 (envoi sans `ret_url`, budget de la chaîne, `$timeout`) :
  validé pour l'implémenteur des pistes.
- La mise en ligne de la production (phase F, TCK-517).
- Le `stop_grace_period` et `DB_QUEUE_RETRY_AFTER` (P05.06), déjà notés hors agents.

## Notes d'implémentation

_(à remplir par implementing-specs)_
