---
id: TCK-2954
title: "Le client temps réel du front : une connexion par session, deux hooks, et un mode dégradé qui garde la justesse"
status: todo
phase: P1
family: front
estimate: M
wave: 93
created: 2026-11-17
updated: 2026-11-17
depends_on: [TCK-2952, TCK-2953]
blocks: [TCK-2955]
spec_refs:
  features:
    - docs/features.md#17-communication--messagerie
  models: []
tags: [front, temps-reel, reverb, echo, react-query, impersonation, adr-0129]
---

## Objectif utilisateur

- **Toute personne dans `/app`** : un écran apprend qu'un objet a changé dès qu'il change. Si la
  connexion tombe, il reste juste, simplement moins vite. Hors connexion temps réel, rien ne change
  par rapport à aujourd'hui.

## Contrat de données

Décisions : [ADR-0129](../../../adr/0129-le-socle-temps-reel-signale-et-l-api-sert.md) § 4 (le
client), § 5 (les clés du front, amendé le 2026-11-17).

Endpoints et canaux consommés, tous livrés par TCK-2952 :

- `POST /api/broadcasting/auth` : autorisation d'un canal, avec le jeton Sanctum d'`AuthContext`.
  ⚠ Le chemin commence par `/api` : c'est `apiRequest` qui l'atteint, pas le BFF Next.
- Canaux privés `private-sujet.{type}.{id}` et `private-utilisateur.{id}` ; canal de présence
  `presence-sujet.{type}.{id}`, dont un membre ne porte que `{id}`.
- Un seul événement, `signal`, de forme `{subject, event, cursor}`. `cursor` est une chaîne
  ISO 8601 UTC à la microseconde, comparable comme une chaîne.
- Sur `utilisateur.{id}`, le `subject` est l'objet qui a changé (`conversation:42`), ou
  `utilisateur:{id}`. On s'abonne donc à **son** canal personnel, et on trie par `event`
  (règle de TCK-2952).

Configuration, posée par TCK-2953 :

- `TEMPS_REEL_URL` (origine WebSocket) et `TEMPS_REEL_CLE` (clé publique Reverb) sont des clés
  **d'exécution**.
  - Elles sont lues par le seul module de configuration publique, `src/lib/config-publique.ts`
    (ADR-0069 § 3), et transmises au navigateur avec les autres.
  - Ce ticket les ajoute au type fermé de ce module, et amende `scripts/check-front-env-keys.mjs`
    en le sachant : la clé publique de Reverb n'est pas un secret.
  - **Aucune `NEXT_PUBLIC_*`.**
  - `docker/demarrer.mjs` ne les exige pas.

Relevé du 2026-11-17, ce que le mode dégradé doit retrouver :

- le fil ouvert est relu toutes les 3 s (`lib/queries/conversations.ts`) ;
- la liste toutes les 10 s (`conversations-list.ts`) ;
- les compteurs de non-lus aux cadences `CADENCE_NON_LUS_*` (`chat-widget/useUnreadCount.ts`,
  `layout/AnnonceDesNonLus.tsx`) ;
- les notifications toutes les 30 s (`notifications/useNotifications.ts`).

## Direction UX / Artistique

- **Invisible quand tout va bien.** Aucun voyant « connecté » dans la coque. Le temps réel se
  remarque à ce que l'écran se met à jour, pas à un indicateur.
- **Discret quand ça va mal.** Le mode dégradé n'affiche aucune erreur ni aucun toast : l'écran
  continue de se mettre à jour au rythme d'aujourd'hui.

## Contraintes strictes (métier)

- **Une seule connexion par onglet**, ouverte par la coque de `/app` (ADR-0129 § 4). Aucune page
  publique, ni `/super-admin`, ni `/auth`, n'en ouvre.
- **Deux primitives seulement, que tout écran réutilise** :
  - une primitive d'abonnement, qui rappelle l'écran à chaque signal (`useSignal` dans l'ADR). Elle
    vise soit un sujet (`sujet.{type}.{id}`), soit le canal personnel de la session, filtré par
    codes d'événement ;
  - une primitive qui invalide les requêtes React Query nommées à chaque signal d'un sujet
    (`useSujetEnDirect` dans l'ADR).
  - Leur forme interne, leurs fichiers et leurs noms de composants sont libres.
- **Un signal n'est jamais une donnée.** Le client ne lit que `subject`, `event` et `cursor`, et
  n'affiche rien qui en vienne. Il relit l'objet par l'API.
  - Un signal dont le `cursor` est inférieur ou égal au dernier vu pour ce couple
    `(subject, event)` est ignoré.
  - Un `subject` mal formé est ignoré, sans erreur affichée.
- **Mode dégradé, trois états** (ADR-0129 § 4) :
  - **connexion tenue** : chaque relecture périodique de la liste ci-dessus passe à une relecture
    de sécurité de 60 s ;
  - **connexion perdue ou jamais établie** : les intervalles d'aujourd'hui, chacun le sien ;
  - **à la reconnexion** : une relecture immédiate de chaque sujet auquel l'onglet est abonné.
  - Ce ticket fournit le moyen de choisir l'intervalle selon l'état. Le branchement des écrans de
    la messagerie et des notifications est fait par TCK-2955.
- **Sans `TEMPS_REEL_URL`, comportement identique à aujourd'hui** :
  - aucune connexion n'est tentée et aucun script de connexion n'est chargé ;
  - les intervalles restent ceux d'aujourd'hui ;
  - aucune requête vers `/api/broadcasting/auth`.
- **Coupé pendant une impersonation.** Quand le relais d'impersonation est actif
  (`relaisImpersonationActif()`, `src/lib/impersonation.ts`), aucune connexion n'est ouverte et
  aucune autorisation n'est demandée. L'opérateur ne paraît pas présent, n'émet aucun message
  éphémère, et l'écran tourne en mode dégradé.
- **La session suit `AuthContext`.**
  - Une connexion s'ouvre avec le jeton courant.
  - Elle est fermée à `logout()`, et rouverte à `openSession()` avec le nouveau jeton.
  - Une session ne garde jamais les abonnements de la précédente.
- **Dépendances** : `laravel-echo` et `pusher-js` (ADR-0129, Conséquences), versions épinglées par
  le lock. Le code de connexion n'est chargé que si `TEMPS_REEL_URL` est posée.

## Delta à produire

- [ ] Lecture de `TEMPS_REEL_URL` et `TEMPS_REEL_CLE` par `config-publique.ts`, transmises au
      navigateur ; `check-front-env-keys.mjs` amendé, avec son en-tête
- [ ] Le fournisseur temps réel dans la coque de `/app`, et les deux primitives
- [ ] Le moyen, pour une requête existante, de choisir son intervalle selon l'état de la connexion
      (tenue → 60 s, sinon l'intervalle d'aujourd'hui)
- [ ] La relecture des sujets ouverts à la reconnexion
- [ ] La coupure sous impersonation et sans clé
- [ ] Les tests, sur un faux Echo injecté (aucun serveur réel)

## Critères d'acceptation

- [ ] **AC1 — Signal reçu.** Avec le faux Echo, un signal sur un sujet abonné invalide exactement
      les requêtes nommées pour ce sujet, et aucune autre. Un signal d'un autre sujet n'invalide
      rien.
- [ ] **AC2 — `cursor` respecté.** Un signal plus ancien ou égal au dernier vu n'invalide rien. Le
      test rougit si la comparaison est retirée.
- [ ] **AC3 — Les trois états du mode dégradé.**
  - connexion tenue : la requête témoin est à 60 s ;
  - connexion perdue : elle revient à son intervalle d'aujourd'hui (3 s pour le fil) ;
  - reconnexion : une relecture immédiate de chaque sujet abonné, constatée par le compte des
    appels du faux client API.
  - Chaque état a son test.
- [ ] **AC4 — Sans clé, rien ne change.** `TEMPS_REEL_URL` absente :
  - aucun constructeur Echo n'est appelé ;
  - aucun appel à `/api/broadcasting/auth` ;
  - les intervalles valent ceux d'aujourd'hui ;
  - le module de connexion n'est pas importé (vérifié par un espion sur l'import dynamique, ou
    équivalent).
- [ ] **AC5 — Coupé sous impersonation, preuve par ablation.** Relais actif : aucune connexion,
      aucune autorisation, intervalles d'aujourd'hui. Retirer la condition d'impersonation fait
      rougir le test.
- [ ] **AC6 — La session ne fuit pas.** Après `logout()` puis `openSession()` d'un autre compte,
      aucun abonnement du premier ne subsiste dans le faux Echo, et l'autorisation porte le
      nouveau jeton.
- [ ] **AC7 — Les gardes du front.**
  - `npm run lint`, `npx tsc --noEmit`, les tests touchés et `check-front-env-keys` sont verts ;
  - `npm run check:i18n` aussi : aucun texte neuf n'est attendu.
  - Remettre une lecture de `process.env.NEXT_PUBLIC_TEMPS_REEL_URL` fait rougir
    `check-front-env-keys`.

## Hors périmètre

- Brancher les écrans de la messagerie et des notifications : TCK-2955.
- La présence et « en train d'écrire » dans le fil : TCK-2955. Ce ticket rend possible l'abonnement
  à un canal de présence, sans interface.
- Le serveur Reverb, ses clés et sa préproduction : TCK-2953, TCK-2956.
- Un voyant d'état de connexion.

## Notes d'implémentation

_(à remplir par implementing-specs)_
