---
id: TCK-360
title: "Console super-admin — refondre l'accueil autour des files d'attente, et supprimer le doublon /system"
status: done
phase: P2
family: front
estimate: M
wave: 46
created: 2026-08-26
updated: 2026-08-27
depends_on: [TCK-357]
blocks: []
spec_refs:
  features:
    - docs/features.md#25-reporting--tableaux-de-bord
    - docs/features.md#29-administration--configuration
    - docs/features.md#26-audit--traçabilité
  models: []
tags: [front, super-admin, dashboard, navigation]
---

## Objectif utilisateur

Le super-admin qui ouvre la console voit d'abord **ce qui l'attend** — dossiers KYC, signalements, demandes d'upgrade, jobs échoués — au lieu d'un mur de huit nombres sans ordre ni destination.

## Contrat de données

Endpoints déjà existants, tous consommés ailleurs dans la console :

- `GET /api/admin/system/metrics` — les huit métriques actuelles
- `GET /api/admin/kyc`, `GET /api/admin/moderation`, `GET /api/admin/agency-upgrade-requests/pending-count`, `GET /api/admin/jobs/failed` — les comptes de files
- `GET /api/admin/audit` — les dernières entrées

Si un compte de file n'est pas obtenable sans charger la page complète de résultats, un endpoint de comptage dédié est à ouvrir côté API — à décider à l'implémentation, en réutilisant le patron de `agency-upgrade-requests/pending-count`.

## Direction UX / Artistique

- **Inverser la page.** En haut : les files, en lignes cliquables portant leur compte, chacune menant à la vue filtrée correspondante. Ensuite les métriques, chacune avec un delta sur 30 jours et un lien vers la liste filtrée. En bas : les dernières entrées d'audit.
- Une métrique sans tendance et sans destination n'est pas un tableau de bord, c'est un affichage. Chaque tuile doit répondre à « et alors ? ».
- **Les badges de file doivent exister ailleurs que sur un seul menu.** Aujourd'hui `agency-upgrade-requests` est la seule entrée de la barre latérale qui porte un compte ; le mécanisme `badgeKey` de `SuperAdminSidebar` a été écrit générique exactement pour ça (TCK-268).
- `/super-admin/system` réaffiche **exactement** la même grille de huit tuiles que l'accueil, plus quatre boutons. Deux pages qui affichent la même chose sont une page : `/system` devient un index de ses trois sous-pages, ou disparaît au profit du groupe de menu existant.

## Contraintes strictes (métier)

- Aucune file affichée sans lien vers la vue filtrée qui permet de la traiter.
- Les comptes de files se rafraîchissent sans devenir un cron serré : cadence alignée sur celle déjà retenue pour le badge d'upgrade (60 s), invalidation immédiate après une décision.
- Une file vide s'affiche comme une file vide — pas masquée : l'absence de dossier en attente est une information.
- Le delta d'une métrique n'est affiché que si la période de comparaison est réellement disponible ; jamais de tendance inventée à partir d'un seul point.

## Delta à produire

- [x] Section « files d'attente » sur `/super-admin` : KYC, modération, demandes d'upgrade, jobs échoués — compte + lien filtré
- [x] Métriques rendues via `StatCard` (TCK-357) avec delta 30 jours et lien vers la vue filtrée
- [x] Section « activité récente » : 5 dernières entrées d'audit + lien vers `/super-admin/audit`
- [x] Badges `badgeKey` de la barre latérale étendus à KYC et modération
- [x] `/super-admin/system` : suppression de la grille dupliquée, page réduite à un index (ou supprimée si le groupe de menu suffit)
- [x] Tests : rendu des files (peuplée / vide), présence des liens filtrés, absence de delta quand la période manque

## Critères d'acceptation

- [x] AC1 — depuis `/super-admin`, chacune des quatre files est atteignable **en un clic** vers sa vue déjà filtrée
- [x] AC2 — la grille de huit tuiles n'apparaît plus qu'à un seul endroit de la console
- [x] AC3 — les entrées KYC et modération de la barre latérale portent un compte, avec la même cadence que l'existant
- [x] AC4 — une file vide reste affichée, avec un libellé qui dit qu'elle est vide
- [x] AC5 — aucun delta n'est rendu lorsque l'API ne fournit pas de point de comparaison (vérifié par un test sur une réponse sans historique)
- [ ] AC6 — `npm run lint`, `npx tsc --noEmit`, `npm run test` passent
  - **décochée après relecture.** `npm run lint` (0 erreur, 36 avertissements préexistants) et `npx tsc --noEmit` (aucune sortie) sont exécutés ; `npm run test` **en entier** ne l'a été par personne — c'est le rituel de fin de branche de la session. Joué à la place : `src/app` + `src/components` + `src/lib` + `src/i18n`, soit 185 fichiers / 1227 tests, tous verts.

## Hors périmètre

- Les graphiques de `/super-admin/reports` : TCK-361.
- Le panneau de décision KYC : TCK-362.
- La palette et les primitives : TCK-357, TCK-358.

## Notes d'implémentation

**Trois affirmations du ticket ont été re-mesurées, et une était fausse.**

1. *« Si un compte de file n'est pas obtenable sans charger la page complète, un endpoint de
   comptage dédié est à ouvrir côté API. »* — **Inutile, mesuré.** Les trois files sans endpoint
   dédié (`kyc`, `moderation`, `jobs/failed`) passent toutes par `Controller::paginated()`, donc
   par `App\Http\Responses\PaginationMeta`, dont `total` est une des quatre clés canoniques
   garanties (TCK-304). Une page d'UN élément rend le compte sans charger la file. Aucun endpoint
   n'a été ouvert.

2. *« /super-admin/system réaffiche exactement la même grille de huit tuiles »* — **vrai**, les
   deux pages montaient `<SystemMetricsGrid />`. La page est devenue un index de ses trois
   sous-pages + les paramètres ; elle n'est pas supprimée parce que la barre latérale l'affiche
   comme parent d'un groupe et que son `href` doit mener quelque part.

3. *« Aucune file affichée sans lien vers la vue filtrée qui permet de la traiter »* — le lien
   seul ne suffisait pas. Trois des quatre destinations ouvraient sur « tout » : le filtre de
   `agency-upgrade-requests` et d'`agencies` étaient des `useState` locaux, sans lecture de l'URL.
   Ils sont désormais **amorcés** par `?status=…` (amorce seule : le filtre reste local ensuite,
   comme `role` sur la page utilisateurs depuis TCK-243). Sans ça, le compte affiché n'aurait pas
   été celui qu'on trouve en cliquant.
   ⚠ **Correction du 2026-08-27 :** une amorce avait aussi été posée sur `status` d'`users`. Elle a
   été **retirée** après la revue — `grep -rn 'users?status=' src/` → 0 : aucun producteur n'existe
   dans le dépôt, la tuile qui devait la nourrir a été inversée en `usersTotal` en cours de route,
   et il restait du code mort sous un commentaire qui décrivait un mécanisme supprimé.

**Le delta a demandé une extension de l'API — et surtout une décision sur ce qui n'en aura jamais.**
`/api/admin/system/metrics` ne portait aucun point de comparaison. Le bloc `trend.previous` en
apporte un, **et seulement pour les métriques reconstructibles depuis une date** : `agencies_total`,
`users_total`, `revenue_platform_total_paid`. Les cinq autres tuiles dérivent d'un **statut
courant** (vérifiée / active / suspendue, utilisateurs actifs, biens publiés / en modération) : la
ligne ne garde aucune trace de son statut d'il y a trente jours. Une clé absente est le contrat
« pas de période de comparaison », et le front ne rend alors aucun delta (AC5). Deux gardes
supplémentaires côté API : un point de comparaison à zéro est omis (la variation vaudrait l'âge de
la plateforme), et le revenu n'en reçoit aucun tant qu'un encaissement `paid` porte un `paid_at`
nul, car il manquerait du seul côté « avant ».

**La tuile « utilisateurs actifs » est devenue « utilisateurs ».** Les deux nombres restent
affichés — `active` est passé en précision — mais c'est le total qui prend la grande typographie,
parce que c'est le seul des deux qui puisse porter une tendance.

**Les comptes de file ont un seul point de déclaration**, `src/lib/queries/super-admin-queues.ts` :
l'accueil et la barre latérale sont montés en même temps sur `/super-admin` et partagent donc la
même clé de cache — un nombre, une requête, et un badge qui ne peut pas diverger de la ligne d'en
face. L'invalidation immédiate après décision est acquise sans nouveau câblage : les clés sont
préfixées par celles qu'invalident déjà les écrans de décision (`['super-admin', 'moderation']`).

**Vérification.** Les gardes de l'AC5 et de l'AC4 ont été éprouvées **par ablation** (guards
retirés → 2 tests backend et 4 tests front rougissent). ⚠ **Aucune vérification navigateur n'a été
faite** : la console exige une session super-admin, hors de portée d'un agent délégué borné à
600 s par commande. Les AC d'interface sont couvertes par le rendu Testing Library, pas par un
écran.

### Revue adverse et correctifs (2026-08-27)

La revue a **accepté** : les six AC vérifiés par exécution, six ablations sur huit attrapées, rien
du travail de TCK-358 perdu dans `SystemMetricsGrid.tsx`, et les quatre clés i18n supprimées sans
site d'appel restant. Cinq défauts, aucun bloquant. **Quatre corrigés, un renvoyé en ticket :**

- **Deux mutants survivants tués.** L'amorce `?status=` de `/agencies` n'était couverte par aucun
  test alors que deux tuiles y mènent : jumeau de `status-seed.test.tsx` écrit (ablation :
  2 rouges sur 3). Les gardes `previous === 0` et `periodDays === undefined` de `SystemMetricsGrid`
  se supprimaient sans faire rougir quoi que ce soit : deux tests ajoutés, chacun prouvé en rejouant
  sa mutation. *En les écrivant, une affirmation du commentaire s'est révélée fausse — next-intl ne
  rend pas la clé quand un paramètre manque, il rend le paramètre vide.*
- **Code mort supprimé** sur `/users` (cf. la correction du point 3 ci-dessus).
- **Un chiffre faux dans le seul endroit qui explique la décision** : le docblock de
  `SystemMetricsController` écrivait « trois des huit métriques » puis en énumérait six. Corrigé
  à **cinq**, la valeur que portent le ticket, le commit et le docblock du front.

**Ce qui reste ouvert :** la tuile « Vérifiées » lie vers `/super-admin/agencies` **non filtré** —
le même href, au caractère près, que « Agences (total) ». Le lien filtré n'est pas constructible :
mesuré par exécution, `filter[is_verified]=1` est **ignoré en silence** par
`AgencyModerationController::index()`, qui n'emprunte pas `HasQueryBuilder` et lit ses filtres un
par un (8 agences rendues avec le filtre comme sans, sur un jeu de 3 vérifiées / 5 non).
⚠ `Agency::$requestFilterable` **contient** `is_verified` : qui s'arrête à cette ligne conclut que
le filtre existe. → [TCK-390](TCK-390-agences-filtre-is-verified.md).

**Non couvert :** aucune vérification navigateur. AC1 et AC4 reposent sur le rendu Testing Library,
pas sur un écran — la console exige une session super-admin derrière un layout serveur.
