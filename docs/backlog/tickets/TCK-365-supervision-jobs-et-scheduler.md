---
id: TCK-365
title: "Supervision des jobs et du scheduler — sortir la boucle d'exploitation de son enterrement"
status: done
phase: P2
family: front
estimate: S
wave: 46
created: 2026-08-26
updated: 2026-08-27
depends_on: [TCK-357]
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [front, super-admin, observabilite, jobs]
---

## Objectif utilisateur

Celui qui exploite la plateforme trouve les jobs échoués depuis le menu, lit le payload complet de celui qui l'intéresse, et rejoue sans craindre d'avoir cliqué sur le mauvais bouton.

## Contrat de données

Endpoints existants ; un seul n'est aujourd'hui appelé par personne :

- `GET /api/admin/jobs/failed` — la liste (paginée côté API, figée à 20 côté front)
- `GET /api/admin/jobs/failed/{id}` — **le détail, jamais appelé** : c'est lui qui porte le payload complet
- `POST /api/admin/jobs/failed/{id}/retry` · `POST /api/admin/jobs/failed/retry-all` · `DELETE /api/admin/jobs/failed/{id}`
- `GET /api/admin/scheduler` — tâche, dernière exécution, durée moyenne

## Direction UX / Artistique

- **Les jobs échoués n'ont pas d'entrée de menu** : ils vivent au bas de `/super-admin/system/health`, sous les sondes. C'est la page qu'on ouvre quand quelque chose ne va pas — encore faut-il savoir qu'elle existe.
- Le payload est **tronqué à l'écran sans moyen de le déplier**, alors que l'endpoint de détail existe. Un payload tronqué est une trace inutilisable.
- `retry-all` et la purge d'un job partent **sans confirmation**, dans une console où `ConfirmActionDialog` est posé partout ailleurs sur les actions destructives.
- La table est figée à 20 lignes sans pagination : au-delà, les jobs plus anciens sont hors de portée.
- `/system/scheduler` affiche tâche / dernière exécution / durée moyenne — **pas le statut de la dernière exécution**. « Il a tourné » et « il a réussi » ne sont pas la même information.

## Contraintes strictes (métier)

- Toute action destructive ou massive (`retry-all`, suppression) passe par `ConfirmActionDialog`, avec le nombre d'éléments concernés annoncé dans la confirmation.
- Le détail d'un job n'est chargé qu'à la demande — un payload complet par ligne serait une charge inutile sur une liste.
- Le statut d'une exécution du scheduler n'est affiché que si l'API le fournit ; s'il ne l'expose pas, le ticket le constate et ouvre le besoin côté API plutôt que de l'inventer côté front.
- Aucune cadence de rafraîchissement resserrée : la page est de la supervision, pas du temps réel.

## Delta à produire

- [x] Entrée de menu dédiée aux jobs échoués (ou promotion visible depuis le groupe « Système »)
  - `SuperAdminSidebar.tsx:148`, dans les `children` du groupe « Système ». ⚠ Il a fallu **trois** portes, pas une : la tuile de file de l'accueil et le hub `/super-admin/system` pointaient encore ailleurs (cf. la revue plus bas).
- [x] Pagination de la table des jobs via le composant `Pagination`
- [x] Détail d'un job à la demande via `GET /api/admin/jobs/failed/{id}` : payload complet, exception, horodatage
- [x] Confirmation sur `retry-all` (avec le compte) et sur la suppression d'un job
- [ ] `/system/scheduler` : colonne statut de la dernière exécution ; si l'API ne l'expose pas, le constat est écrit dans les notes et un ticket API est ouvert
  - **branche « constat » prise, et c'est la bonne** : la colonne `status` existe mais `RecordScheduledTaskRun` y écrit `'finished'` **en dur** et n'écoute que `ScheduledTaskFinished`. L'exposer aurait produit un écran qui ment. Constat écrit au point 2 ci-dessous, ticket ouvert : [TCK-383](TCK-383-statut-reel-des-executions-du-scheduler.md). La case reste décochée : la colonne n'est pas livrée.
- [x] Tests : pagination, ouverture du détail, refus d'exécuter `retry-all` sans confirmation

## Critères d'acceptation

- [x] AC1 — les jobs échoués sont atteignables depuis la barre latérale, sans passer par `/system/health`
  - l'implémenteur l'avait déclaré **non exécuté** (aucune vérification, rien qui garde l'entrée de menu). Il l'est maintenant : un test exige le lien vers la bonne destination **et** un libellé résolu (`withIntl` monte le vrai `fr.json`, donc un `labelKey` mal orthographié rendrait la clé brute sans rien casser, comme en production). Ablation : ligne de menu retirée → 1 rouge. Toujours **aucune** vérification navigateur.
- [x] AC2 — le payload complet d'un job est consultable ; **le test vérifie qu'un payload plus long que la troncature d'affichage est intégralement rendu** (un test sur un payload court cocherait aussi le comportement actuel)
  - liste : 1024 caractères ; détail : ~4060, assérés à l'**égalité exacte** plus un marqueur de fin. Le test vérifie aussi que `fetchFailedJob` n'est **pas** appelée avant le clic.
- [x] AC3 — `retry-all` et la suppression ouvrent une confirmation qui annonce le nombre d'éléments concernés ; annuler n'émet aucune requête
  - le compte annoncé est `meta.total`, pas la longueur de la page : `retry-all` porte sur la file entière.
- [x] AC4 — au-delà de 20 jobs échoués, les suivants sont atteignables
  - ⚠ **cet AC était FAUX à la mesure au moment de la revue**, et son test ne pouvait pas le voir : il mocke l'API et vérifie que le front demande `page: 2`. Le tri `orderByDesc('failed_at')` n'avait **aucun** départ-égalité sur une colonne `timestamp(0)` : 200 jobs échoués dans la même seconde, lus sur 10 pages, rendaient **197 identifiants distincts sur 200** — 3 vus deux fois, 3 jamais atteignables, reproduit 4 fois sur 4. Corrigé (`->orderByDesc('id')`) et gardé par un test **non mocké** contre PostgreSQL qui lit les 10 pages et compte les identifiants distincts.
- [ ] AC5 — `npm run lint`, `npx tsc --noEmit`, `npm run test` passent
  - **reste décochée** — l'implémenteur l'avait lui-même déclarée non exécutée. `npm run lint` (0 erreur au moment de la mesure), `npx tsc --noEmit` (sortie vide), `npm run check:i18n` et les douze gardes `scripts/check-*.mjs` sont verts ; `npm run test` **en entier** ne l'a été par personne — rituel de fin de branche de la session.

## Hors périmètre

- Le déclenchement manuel d'une tâche planifiée (« lancer maintenant ») : aucun endpoint ne l'expose, cela relève d'une décision côté API.
- Les sondes de santé elles-mêmes, dont les libellés relèvent de TCK-364.
- Toute modification du fonctionnement de la file de jobs côté back.

## Notes d'implémentation

### Ce que la mesure a contredit dans ce ticket

1. **« Le payload est tronqué à l'écran »** — la troncature n'est PAS à l'écran, elle est **côté
   serveur** : `FailedJobService::present($job, truncate: true)` coupe `payload` **et** `exception`
   à 1024 caractères (1021 + `...`) pour la liste, et `find()` les rend entiers pour le détail. Un
   « déplier » sur la ligne déjà reçue n'aurait donc jamais rendu que la troncature — seul l'appel
   à `GET /api/admin/jobs/failed/{id}` porte la trace. Le `max-w-xl truncate` du front, lui, ne
   coupait qu'un texte déjà coupé.

2. **Le statut du scheduler : la donnée n'existe pas, et l'exposer serait un mensonge.**
   `scheduled_task_runs` **a** une colonne `status` — mais `RecordScheduledTaskRun` y écrit
   `'finished'` **en dur**, et n'écoute que `ScheduledTaskFinished`, que `ScheduleRunCommand`
   dispatche **avant** le contrôle du code de sortie. `ScheduledTaskFailed` et
   `ScheduledTaskSkipped` n'ont aucun écouteur. Une exécution en échec est enregistrée `finished`
   comme une réussie. Conformément à la contrainte du ticket, rien n'a été inventé côté front :
   le besoin est ouvert en **[TCK-383](TCK-383-statut-reel-des-executions-du-scheduler.md)**.

3. **Corollaire non prévu : la colonne « Durée moyenne » de `/system/scheduler` est toujours vide.**
   Le même listener écrit `'duration_ms' => null` alors que `ScheduledTaskFinished::$runtime` porte
   la durée. `avg()` d'une colonne toujours nulle rend `null` : l'écran rend `—` pour chaque tâche
   depuis l'origine. Repris dans TCK-383 — ce n'est pas un état vide, c'est une mesure jetée.

4. **`retry-all` a une borne dure côté API** que le front n'annonçait nulle part :
   `FailedJobService::BULK_RETRY_LIMIT = 500`, au-delà de laquelle le service rend un **409**. La
   confirmation le dit maintenant, dans le même texte que le compte.

### Décisions

- **La table déménage** de `system-health` vers `/super-admin/system/jobs`, avec son entrée de menu
  sous « Système ». `system-health` garde les sondes et les trois compteurs de file, et la tuile
  « Échecs 24h » devient le lien vers la nouvelle page — c'est la porte qu'on pousse quand on
  regarde la santé et qu'on voit un nombre non nul.
- **Le compte annoncé dans la confirmation de `retry-all` est `meta.total`**, pas la longueur de la
  page courante : `retry-all` porte sur la file entière, annoncer 20 sur une file de 300 serait une
  confirmation qui ment.
- **Le rejeu d'un job unique reste sans confirmation.** La contrainte vise « toute action
  destructive ou massive » ; un rejeu unitaire n'est ni l'un ni l'autre, et le passer sous
  `ConfirmActionDialog` (qui exige de retaper une phrase) rendrait l'action la plus courante de la
  page plus coûteuse que la purge.
- **Cadence à 60 s** sur la nouvelle page, contre 30 s sur `system-health` : un refetch au milieu de
  la lecture d'un payload réordonne les lignes sous le curseur.

### Gotcha de test

`react-query` v5 passe un **second argument** (le contexte de mutation) au `mutationFn` :
`expect(deleteFailedJob).toHaveBeenCalledWith(1)` échoue sur un appel pourtant juste. Asserter
`mock.calls[0][0]`.

### Vérification par ablation

Les deux AC qui pouvaient être cochées par le comportement d'avant ont été éprouvées en cassant
l'implémentation : détail rendant le payload tronqué à 1024, et `Pagination` retirée. Les deux tests
correspondants rougissent (`2 failed | 5 passed`), puis reverdissent une fois l'ablation annulée
(`7 passed`).

### Ce que la revue adverse a trouvé, et ce qui a été corrigé (2026-08-27)

La revue a **refusé** : l'écran neuf était bon et ses tests tenaient l'ablation, mais **le
déménagement était à moitié fait** et deux défauts d'API rendaient faux ce que le ticket promet.
Onze défauts, **dix corrigés**, chacun prouvé par ablation (rouge sans le correctif, md5 identique
après restauration).

- **Deux portes menaient encore à la page vidée.** La tuile « jobs échoués » de l'accueil et le
  badge de la barre latérale pointaient sur `/super-admin/system/health`, page d'où ce ticket vient
  de retirer la table — et le hub `/super-admin/system` ne listait pas la page neuve. Pire : deux
  tests **verts** verrouillaient ces cibles périmées (`toEqual` sur la liste des liens). *Un test
  vert qui défend une porte cassée* — corrigés dans le même geste que les liens.
- **Une liste qui rendait 500 sur du texte accentué.** `substr($payload, 0, 1021)` coupait en
  **octets** : une coupe au milieu d'une séquence UTF-8 rend la chaîne invalide et `JsonResponse`
  lève `Malformed UTF-8 characters` — **toute** la liste en 500, pas la seule ligne fautive.
  Mesuré : 3 décalages d'origine sur 6 produisaient un 500. Or `exception` porte des traces de pile
  brutes, et dans un dépôt francophone un message accentué de plus de 1024 octets est le cas
  **normal**. C'est la page qu'on ouvre pendant un incident. Corrigé en `mb_strlen`/`mb_substr`.
- **Le tri sans départ-égalité** qui rendait AC4 faux (cf. AC4 ci-dessus).
- **Trois mutations sans `onError`** : avec `retry-all` en échec, le dialogue restait ouvert et
  l'écran muet — l'opérateur retapait la phrase et recliquait indéfiniment. `DELETE` sur un job déjà
  supprimé rendait 200 et écrivait une entrée d'audit là où `retry()` et `find()` rendent 404.
  `per_page` n'était ni validé ni borné (`?per_page=100000` rendait tout). Et 33 clés i18n mortes
  ont été retirées, après vérification qu'aucune composition **dynamique** de clé ne les atteignait.

**Ce qui reste ouvert :** [TCK-383](TCK-383-statut-reel-des-executions-du-scheduler.md) porte le
statut réel des exécutions **et** la durée moyenne jetée à l'écriture. Le sous-titre du hub système
dit encore « les trois écrans techniques » alors qu'il en liste quatre — une clé × 3 locales, hors
du périmètre de clés autorisé au correcteur. Aucune vérification navigateur.
