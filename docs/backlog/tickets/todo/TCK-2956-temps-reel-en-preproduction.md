---
id: TCK-2956
title: "Le temps réel en préproduction : un service temps-reel dans la pile de l'API, un sous-domaine en wss, ses clés et son action"
status: todo
phase: P1
family: technique
estimate: S
wave: 93
created: 2026-11-17
updated: 2026-11-17
depends_on: [TCK-2952, TCK-2953]
blocks: []
spec_refs:
  features:
    - docs/features.md#17-communication--messagerie
  models: []
tags: [infra, deploiement, dokploy, traefik, temps-reel, reverb, adr-0129, adr-0127, adr-0069]
---

## Objectif utilisateur

- **Le porteur, qui déploie** : la préproduction sert le temps réel. Le dépôt dit quel service, quel
  nom et quelles clés, et ce qui reste à faire à la main se lit dans le rapport des actions de
  déploiement.

## Contrat de données

Aucune donnée applicative. Décisions : [ADR-0129](../../../adr/0129-le-socle-temps-reel-signale-et-l-api-sert.md)
§ 5 ; [ADR-0028](../../../adr/0028-auto-hebergement-conteneurise-sur-le-vps.md) et
[ADR-0069](../../../adr/0069-deux-environnements-dokploy-configuration-hors-de-github.md) (la pile
Compose, un réseau par environnement) ; [ADR-0127](../../../adr/0127-les-actions-de-deploiement-un-fichier-par-action.md)
(les actions).

Relevé sur l'arbre du 2026-11-17 :

- **`deploy/takussan/compose.api.yml`.**
  - Un même fichier sert la préproduction et la production, sur l'ancre `x-api` (image de l'API,
    `env_file: .env`).
  - Le domaine n'y est pas : **Dokploy pose les labels Traefik depuis son onglet Domains**.
  - Deux réseaux : `dokploy-network`, partagé par toutes les piles, et `interne`, propre à la pile.
  - `REDIS_HOST` et `REDIS_PORT` sont écrits dans le fichier, comme des faits de la pile.
- **`scripts/check-reseau-par-environnement.mjs`.**
  - Il refuse l'hôte `api`. Un nom de service présent sur `dokploy-network` y désigne en effet le
    service de **chaque** environnement.
  - Il exige l'alias `${API_ALIAS…}`.
- **`scripts/check-env-production.mjs`.**
  - Sa règle 6 exige `BROADCAST_CONNECTION=null` dans le gabarit de l'API.
  - Les `REVERB_*` y sont des résidus, tenus par TCK-2953 et TCK-2952.
  - `INTERDITES_API` interdit au gabarit les clés écrites par la pile.
- **L'action** `docs/deploiement/actions/2026-11-17-poser-le-temps-reel.md` est créée par TCK-2953.
  Elle nomme `TEMPS_REEL_URL` et `TEMPS_REEL_CLE` du gabarit du front.
- `docs/infra/hebergement.md`, « Ce qui sert quoi » : `preview.api.takussan.com` est un A en DNS
  seul vers le service `api:8080`.

## Contraintes strictes (métier)

- **Le service `temps-reel`** :
  - il tourne sur l'ancre `x-api`, avec la commande `php artisan reverb:start`, en chaîne sur une
    ligne, à la manière des `queue:work` ;
  - il démarre après `release`, comme les autres ;
  - il a un healthcheck qui interroge le serveur ;
  - son `mem_limit` est relevé, pas recopié : la mesure, avec sa date, est écrite en commentaire,
    à la manière des workers ;
  - il est joignable par Traefik sur `dokploy-network` ;
  - **pas de `container_name`**.
- **L'API joint le Reverb de SA pile, jamais celui de l'autre environnement.**
  - `REVERB_HOST`, `REVERB_PORT` et `REVERB_SCHEME`, ceux de la publication de serveur à serveur,
    sont **écrits dans `compose.api.yml`**, sur le patron de `REDIS_HOST`.
  - Ils visent un nom **propre à l'environnement** (un alias à la manière d'`API_ALIAS`), jamais
    `temps-reel` seul.
  - `check-reseau-par-environnement.mjs` est étendu : il refuse `temps-reel` comme hôte, et exige
    l'alias.
  - Ces trois clés rejoignent `INTERDITES_API` du gabarit.
- **Le navigateur joint Reverb par un sous-domaine en `wss`**, publié par Traefik sur le port 443.
  - Le nom proposé est `preview.ws.takussan.com`, en DNS seul comme `preview.api.takussan.com`,
    puis `ws.takussan.com` en phase F. Il est écrit dans `docs/infra/hebergement.md`.
  - *(Décision de ce ticket : l'ADR renvoie le nom à ce document.)*
  - `TEMPS_REEL_URL` du front vaut `wss://<ce nom>`.
- **Origines admises.** L'application Reverb n'accepte de connexion que de l'origine du front de son
  environnement, dérivée de `FRONTEND_URL`, une clé déjà posée. Ce n'est pas `*`. Aucune clé neuve
  pour cela.
  - **En développement**, le front se sert sur `localhost:3000` **et** sur `127.0.0.1:3000`
    (`allowedDevOrigins`). Les deux doivent rester admis, ou la règle ne s'applique qu'hors
    `APP_ENV=local`.
  - Un refus y serait muet : le mode dégradé ne dit rien.
- **Les clés de l'API passent au gabarit.**
  - `REVERB_APP_ID`, `REVERB_APP_KEY` et `REVERB_APP_SECRET` sortent de `RESIDUS` et entrent dans
    `env.api.production.example` : vides, ce sont des secrets pour la garde.
  - Elles sont ajoutées au `cles:` de l'action de TCK-2953, qui devient l'action unique « poser le
    temps réel ».
  - Les autres `REVERB_*` restent des résidus, ou sont écrites par la pile, avec leur motif à jour.
  - La règle 6 de `check-env-production.mjs` passe de `BROADCAST_CONNECTION=null` à `reverb`, en le
    sachant, et son commentaire dit pourquoi.
- **Ce qu'aucun script ne fait est une action humaine, pas un critère de ce ticket** :
  - l'enregistrement DNS du sous-domaine ;
  - le domaine dans l'onglet Domains de Dokploy, vers `temps-reel:8080` ;
  - les clés dans l'onglet Environment, des deux applications ;
  - le relevé à l'œil sur la préproduction.
  - Tout cela s'écrit dans l'action, avec son « Comment vérifier ».
  - `takussan-api/docker/release.sh` est **relu avant** : rien de ce qu'il fait n'entre dans
    l'action.

## Delta à produire

- [ ] `deploy/takussan/compose.api.yml` :
  - le service `temps-reel` ;
  - l'alias propre à l'environnement ;
  - `REVERB_HOST`, `REVERB_PORT` et `REVERB_SCHEME` écrits dans la pile ;
  - les commentaires d'en-tête
- [ ] `config/reverb.php` (ou la configuration équivalente) : les origines admises dérivées de
      `FRONTEND_URL`
- [ ] `scripts/check-reseau-par-environnement.mjs` étendu au service `temps-reel`
- [ ] `scripts/check-env-production.mjs` :
  - les `REVERB_APP_*` sortent des résidus ;
  - les clés écrites par la pile entrent dans `INTERDITES_API` ;
  - la règle 6 passe à `reverb`
- [ ] `takussan-api/.env.example` et `takussan-api/.env.docker` : les `REVERB_APP_*` quittent la
      section « Résidus (jamais dans Dokploy) » pour une section que le gabarit porte aussi (règle 7
      de `check-env-production.mjs` : mêmes sections, même ordre)
- [ ] `deploy/takussan/env.api.production.example` : ces clés, dans cette même section, et
      `BROADCAST_CONNECTION=reverb`
- [ ] `docs/deploiement/actions/2026-11-17-poser-le-temps-reel.md` :
  - `cles:` complété ;
  - « Quoi faire » : DNS, Domains, Environment des deux applications, et l'ordre des gestes (le
    service avant les clés du front) ;
  - « Comment vérifier »
- [ ] `docs/infra/hebergement.md` :
  - une ligne « Ce qui sert quoi » pour le sous-domaine, marquée **à relever** tant que personne ne
    l'a mesuré ;
  - les clés du service dans « Les variables d'environnement, par service » ;
  - un paragraphe de runbook
- [ ] `deploy/takussan/smoke-api.sh pile` : le service `temps-reel` levé, et la preuve que l'API y
      publie

## Critères d'acceptation

- [ ] **AC1 — La pile locale le prouve.** `deploy/takussan/smoke-api.sh pile` lève `temps-reel`,
      healthy. Une notification créée dans le conteneur `api` arrive en signal à un client
      WebSocket connecté à `temps-reel`, de l'intérieur de la pile. La sortie est dans les notes.
- [ ] **AC2 — Le bon Reverb.** `check-reseau-par-environnement.mjs` rougit quand on remplace
      l'alias par `temps-reel` dans `REVERB_HOST`, et quand on retire l'alias du service. Les deux
      ablations sont constatées.
- [ ] **AC3 — Origine refusée.** Dans la pile locale, une connexion WebSocket avec un en-tête
      `Origin` étranger est refusée, et celle de `FRONTEND_URL` acceptée. Sous `./dev.sh`, le front
      servi sur `http://localhost:3000` **et** sur `http://127.0.0.1:3000` obtient
      `pusher:connection_established`.
- [ ] **AC4 — Les gardes, et leurs ablations.**
  - `check-env-production`, `check-env-parity`, `check-actions-de-deploiement` et
    `check-reseau-par-environnement` sont verts ;
  - retirer `REVERB_APP_SECRET` du `cles:` de l'action fait rougir `check-actions-de-deploiement` ;
  - remettre `BROADCAST_CONNECTION=null` au gabarit fait rougir `check-env-production`.
- [ ] **AC5 — Ce qui reste se lit.**
  `node scripts/check-actions-de-deploiement.mjs --report preview` liste l'action « poser le temps
  réel », avec toutes ses clés, en `a-faire`.
- [ ] **AC6 — Rien ne change tant que les clés ne sont pas posées.**
  - avec le gabarit tel quel, sans les clés posées, l'API démarre dans `smoke-api.sh image` ;
  - une requête qui émet un signal répond en moins d'1 s de plus qu'aujourd'hui (l'échec est
    avalé) ;
  - le front sans `TEMPS_REEL_URL` reste en mode dégradé (TCK-2954).

## Hors périmètre

- Les gestes humains (DNS, Domains, Environment) : l'action les porte, et la personne qui déploie
  les fait et écrit leur ligne d'historique.
- La production (phase F, TCK-517) : l'action y reste `a-faire`.
- Plusieurs instances de Reverb et la diffusion par Redis (`REVERB_SCALING_ENABLED`).
- La surveillance externe du sous-domaine (UptimeRobot) et `certificats.sh` : à ajouter quand le
  nom sert.

## Notes d'implémentation

_(à remplir par implementing-specs)_
