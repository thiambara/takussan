---
id: TCK-366
title: "Annonces cross-tenant — éditer une annonce existante"
status: todo
phase: P2
family: front
estimate: S
wave: 46
created: 2026-08-26
updated: 2026-08-26
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#23-notifications
    - docs/features.md#29-administration--configuration
  models: []
tags: [front, super-admin, annonces]
---

## Objectif utilisateur

Le super-admin corrige une annonce diffusée — une faute, une date, un ciblage trop large — au lieu de la désactiver et d'en republier une autre.

## Contrat de données

- `PATCH /api/admin/announcements/{announcement}` **existe côté API et n'a aucun appelant côté front.** `patchAdminAnnouncement` est la seule fonction de requête orpheline de `src/lib/queries/super-admin.ts` sur environ quatre-vingt-dix.
- `GET /api/admin/announcements`, `POST /api/admin/announcements`, `POST /api/admin/announcements/{announcement}/deactivate` sont déjà consommés.

## Direction UX / Artistique

- La console sait créer et désactiver ; elle ne sait pas modifier. Le formulaire de création existe déjà et porte les mêmes champs — c'est un mode d'édition qui manque, pas un écran.
- Le ciblage (rôles, agences) se saisit aujourd'hui en **listes d'identifiants séparés par des virgules** (`12,18`). C'est acceptable pour créer vite ; c'est hostile pour relire ce qui a été ciblé. À l'édition surtout, le ciblage doit être lisible sans décodage.
- Une annonce déjà diffusée qu'on modifie doit le dire : l'écran distingue « brouillon » de « en cours de diffusion ».

## Contraintes strictes (métier)

- Éditer une annonce active ne la republie pas et ne réarme pas le `dismissal` déjà posé par les utilisateurs, sauf si l'API en décide autrement — comportement à constater, pas à supposer.
- Les trois langues d'une annonce restent éditables ensemble ; on ne publie pas une correction en français seulement.
- Le ciblage par agence reste borné à des agences existantes.

## Delta à produire

- [ ] Mode édition sur le formulaire d'annonce existant, câblé sur `patchAdminAnnouncement`
- [ ] Distinction visible brouillon / en diffusion
- [ ] Ciblage rôles et agences rendu lisible en lecture (au minimum : noms résolus plutôt que des identifiants nus)
- [ ] Tests : édition d'une annonce active, édition d'un brouillon, ciblage préservé après édition

## Critères d'acceptation

- [ ] AC1 — une annonce existante peut être modifiée depuis `/super-admin/announcements` sans être désactivée puis recréée
- [ ] AC2 — `grep -rn 'patchAdminAnnouncement' takussan-web/src` renvoie au moins un appelant hors de `src/lib/queries/`
- [ ] AC3 — le ciblage (rôles, agences) est restitué **et préservé** après une édition qui ne le touche pas, vérifié par un test sur la charge utile émise
- [ ] AC4 — `npm run lint`, `npx tsc --noEmit`, `npm run test` passent

## Hors périmètre

- Le canal de diffusion et le `dismissal` côté utilisateur.
- La planification d'une annonce dans le futur.
- Le ciblage par segment.

## Notes d'implémentation

**Front seul — l'API n'a pas bougé.** `PATCH /api/admin/announcements/{announcement}` existe
(`routes/api/admin.php:192`), le contrôleur, `UpdateAnnouncementRequest` et le proxy BFF
`src/app/api/super-admin/[...path]/route.ts` (qui exporte déjà `PATCH`) aussi. La chaîne était
complète de bout en bout ; il ne manquait que l'appelant.

**Ce que la mesure a rendu, contre ce que le ticket demandait de constater :**

- **Éditer ne republie pas et ne réarme aucun `dismissal`.** `AnnouncementController::update()`
  fait un simple `$announcement->update(...)` ; les fermetures sont des lignes
  `announcement_dismissals` sur `(announcement_id, user_id)` qu'aucun code de la mise à jour ne
  touche, et `AnnouncementResolver::activeFor()` les exclut toujours. Constaté dans le code, pas
  supposé.
- **Un effet de bord réel, non couvert par le ticket** : `AnnouncementResolver::dismiss()` refuse
  de créer une fermeture quand `severity === critical && is_active`. Faire passer une annonce
  vivante en `critical` par l'édition la rend donc *non fermable* pour la suite — les fermetures
  déjà posées, elles, restent valides.
- **`ends_at` porte `after:starts_at` même en PATCH.** Un PATCH partiel qui enverrait `ends_at`
  sans `starts_at` serait refusé (`starts_at` absent → la règle compare à `null`). L'écran émet
  toujours la charge complète, ce qui contourne le piège sans le corriger.
- **Deux des slugs de rôle qui circulent dans le front ne ciblent personne.** `tenant` et
  `customer` (présents dans `superAdmin.pages.users.roles`) ne font pas partie des six valeurs que
  `User::profileTypes()` peut rendre, or `matches()` intersecte le segment avec elle. Le champ
  libre séparé par des virgules les acceptait en silence. La liste de cases à cocher est écrite
  sur les six vraies valeurs.

**Trois décisions non évidentes :**

1. **`draft` = « `is_active` faux », et c'est tout ce que la base permet.** Il n'existe aucune
   colonne d'état : les quatre états affichés (`draft` / `scheduled` / `live` / `expired`) sont
   `scopeCurrentlyVisible()` décomposé. Rien ne distingue un brouillon jamais diffusé d'une
   annonce désactivée après coup — l'écran ne prétend pas le contraire.
2. **Le ciblage par agence est recopié tel quel dans le formulaire, jamais résolu-puis-réémis.**
   La liste d'agences est paginée à 100 ; un identifiant hors de cette page est conservé et rendu
   en pastille `Agence #{id}`. Une résolution qui aurait perdu l'inconnu aurait rétréci la cible en
   silence — c'est exactement le cas que l'ablation a servi à vérifier (le test AC3 rougit quand on
   filtre un identifiant hors page).
3. **`isoToLocalInput()` remplace `toISOString().slice(0, 16)` pour remplir les champs de date.**
   `toPayload` relit la valeur avec `new Date(...)`, qui l'interprète en heure locale : rendre de
   l'UTC dans le champ décalait la date à chaque aller-retour d'édition.

**Au passage, dans le même fichier** : la pastille de sévérité affichait le slug brut
(`announcement.severity`) alors que `superAdmin.announcements.severities.*` existait depuis
TCK-292 ; et les quatre couleurs Tailwind brutes du panneau de composition (`bg-white`,
`ring-stone-200`, `text-stone-950`, `text-stone-500`) sont passées en jetons — TCK-358 fait la
même conversion sur la même branche d'intégration.
