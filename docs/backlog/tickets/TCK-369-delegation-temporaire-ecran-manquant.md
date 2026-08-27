---
id: TCK-369
title: "Délégation temporaire de rôles — l'écran que TCK-108 n'a pas livré"
status: todo
phase: P2
family: front
estimate: M
wave: 47
created: 2026-08-26
updated: 2026-08-26
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#22-rôles--permissions
    - docs/features.md#112-agence--équipe
  models:
    - docs/models-spec.md#1-user
tags: [front, admin, permissions, delegation, dette-ac]
---

## Objectif utilisateur

L'admin d'agence dont un collaborateur part en congé délègue son rôle à un autre membre sur une période bornée, et voit à tout moment quelles délégations sont programmées, actives ou expirées.

## Contexte — pourquoi ce ticket existe alors que TCK-108 est `done`

[TCK-108](TCK-108-permission-temporary-delegation.md) est marqué `done` en vague 12. Son
« Delta à produire » listait pourtant quatre lignes de front :

> - [ ] Page Settings → Équipe → Délégations (liste + création + révocation)
> - [ ] Composants formulaire (user picker, role select, date range)
> - [ ] Hook fetch + mutation côté frontend
> - [ ] i18n fr/en/wo (`role_delegations.*`)

Mesuré le 2026-08-26 : aucune des quatre n'existe.

```
$ grep -rl "role-delegations" takussan-web/src        → (aucun résultat)
$ grep -rl "role_delegations" takussan-web/src takussan-web/messages → (aucun résultat)
```

Le backend, lui, est complet : `Api\Permissions\RoleDelegationController` sert
`index` / `store` / `destroy` sur `agencies/{agency}/role-delegations`.

**La cause est dans les critères d'acceptation, pas dans le travail.** Les dix AC de TCK-108
(AC1→AC10) portent toutes sur le modèle, le job, les policies et les codes de retour. *Aucune
ne mentionne un écran.* Le ticket pouvait donc être coché en entier sans qu'une ligne de front
soit écrite — et il l'a été.

*Un critère d'acceptation qu'une livraison incomplète coche aussi n'accepte rien.* La question
à poser à chaque AC, avant de l'écrire, est celle-là — et c'est pourquoi les AC des tickets de
cette vague demandent, quand c'est possible, une **vérification par ablation** : la preuve
qu'un test sait échouer.

## Contrat de données

Aucun endpoint à créer.

- `GET /api/agencies/{agency}/role-delegations`
- `POST /api/agencies/{agency}/role-delegations`
- `DELETE /api/agencies/{agency}/role-delegations/{delegation}`

Les statuts (`scheduled`, `active`, `expired`, `revoked`) et les règles de validation sont
posés par TCK-108 — les lire dans le code, ne pas les redéfinir ici.

## Direction UX / Artistique

`/admin/roles` est le bon foyer : c'est là qu'un rôle se définit, c'est là qu'on comprend ce
qu'on délègue. La délégation est une *dérogation dans le temps*, pas une variante de rôle : elle
se lit en lignes datées, pas en cases à cocher.

Une délégation programmée, une délégation active et une délégation expirée n'ont pas le même
poids visuel : l'active se distingue, l'expirée s'efface sans disparaître. Le formulaire tient
en trois champs — qui, quel rôle, jusqu'à quand.

## Contraintes strictes (métier)

- Les gestes sont gardés par **capacité**, jamais par type de profil : deux `agency_admin` de
  la même agence peuvent porter des rôles différents depuis TCK-279.
- Les refus déjà servis en 422 par le backend (rôle non délégable, auto-délégation, durée
  > 12 mois) se préviennent à l'écran quand c'est possible, et s'affichent lisiblement sinon.
  **Ne jamais les réimplémenter comme garde** — la policy décide.
- La révocation est immédiate et prend effet dans la requête courante (AC4 de TCK-108).
- Écran réservé aux agences `standard` : la route entre dans `PRO_ROUTES` et
  `scripts/check-pro-routes.mjs` exige la garde SSR correspondante.

## Delta à produire

- [ ] Requêtes et mutations pour les trois endpoints
- [ ] Section « délégations » sur `/admin/roles`
- [ ] Formulaire de création (membre, rôle, période)
- [ ] Révocation avec confirmation
- [ ] Entrée dans `PRO_ROUTES` + garde SSR si la section ouvre une route propre
- [ ] i18n fr/en/wo, les trois locales dans le même commit
- [ ] Tests couvrant la création, la révocation, et le rendu des trois statuts

## Critères d'acceptation

- [ ] AC1 — une délégation créée depuis l'écran apparaît en `scheduled` sans rechargement
- [ ] AC2 — les trois statuts se distinguent visuellement, et l'un d'eux au moins est éprouvé
      par un test qui **échouerait** si les trois rendaient pareil
- [ ] AC3 — la révocation retire la délégation de la liste et un test le vérifie
- [ ] AC4 — un 422 du backend (auto-délégation, durée excessive) s'affiche en clair et non en
      erreur générique
- [ ] AC5 — `grep -rl "role_delegations" takussan-web/messages` retourne les **trois** locales
- [ ] AC6 — un `agency_admin` sans la capacité requise ne voit pas le bouton de création, et
      `useCan` n'est pas la seule garde (la policy répond 403 : le vérifier)
- [ ] AC7 — `npm run lint`, `npx tsc --noEmit`, `npm run test` passent

## Hors périmètre

- Toute modification du backend : il est livré et éprouvé par TCK-108.
- La délégation multi-agence, la délégation de capacités atomiques et le workflow
  d'approbation — explicitement hors périmètre de TCK-108, et rien ne les a redemandés depuis.
- Rouvrir TCK-108 : son statut reste `done` pour la part backend qu'il a effectivement livrée.

## Notes d'implémentation

**Quatre mesures ont contredit ce ticket. Elles gouvernent le code livré.**

1. **AC1 est faux tel qu'écrit.** « Une délégation créée apparaît en `scheduled` » n'a pas de
   condition dans l'AC ; le backend en a une. `RoleDelegationService::create()` pose `Active` dès
   que `starts_at` est nul ou déjà passé, `Scheduled` sinon. L'écran affiche donc **le statut que
   la réponse 201 porte**, jamais une supposition — et un test éprouve les deux branches. Cocher
   AC1 littéralement aurait voulu dire afficher « Programmée » sur des droits déjà accordés.

2. **Il y a quatre statuts, pas trois** (`scheduled`, `active`, `expired`, `revoked`). Les quatre
   sont rendus, et distincts deux à deux.

3. **`sort=` et `fields[]` ne sont pas refusés par cet endpoint — ils sont ignorés, et `sort=`
   casse l'ordre.** `RoleDelegationController::index` ne déclare ni `allowedSorts` ni
   `allowedFields` ; spatie n'exécute alors jamais ses contrôles (`ensureAllSortsExist()` n'est
   appelée que depuis `allowedSorts()`). Mesuré sur trois délégations de dates distinctes :

   ```
   GET …/role-delegations                  → ids 3,2,1   (le -created_at du contrôleur)
   GET …/role-delegations?sort=-created_at → ids 1,2,3   ← l'ordre est PERDU, sans erreur
   GET …/role-delegations?fields[…]=id     → 19 clés     ← le champ est IGNORÉ
   ```

   Appliquer la règle « sparse fieldsets obligatoires » ici aurait donc **dé-trié la liste** tout
   en donnant l'illusion d'un fieldset. Le module de requêtes n'envoie que `per_page`, et un test
   fige cette forme d'URL.

4. **AC3 contredit la direction UX du même ticket.** « La révocation retire la délégation de la
   liste » face à « l'expirée s'efface sans disparaître ». Le backend tranche : `DELETE` rend
   **200 avec la ligne passée à `revoked`**, `revoked_at` et `revoked_by` renseignés — il
   n'efface pas. La ligne reste donc affichée, estompée, et quitte les délégations *en vigueur*
   (plus de bouton de révocation, plus de badge actif). La faire disparaître effacerait à l'écran
   une trace d'audit que la base garde.

**Un cinquième point n'était dans aucun AC, et c'est le plus coûteux.**
`HasProfiles::hasActiveAgencyDelegation()` exige `status = active` **ET** `ends_at > now()` : les
droits tombent à la seconde où `ends_at` passe. La colonne `status`, elle, n'est réécrite que par
`ProcessRoleDelegationsJob`, toutes les 5 minutes. Pendant cette fenêtre l'API sert
`status: "active"` pour une délégation qui n'accorde plus rien. L'écran rend donc le **statut
effectif** (`statutEffectif()`), qui relit la condition de la policy sur les mêmes données. La
symétrie inverse n'est délibérément pas faite : un `scheduled` dont le `starts_at` est passé
n'accorde toujours rien, « Programmée » y est exact.

**Le bouton est gardé par `team.assign_role`, et ce n'est pas ce que la policy demande.** Le
catalogue `Capability` n'a aucun cas `delegations.*` ; `RoleDelegationPolicy` garde par TYPE de
profil (`isAgencyAdminAt`). L'écran et le serveur ne posent donc pas la même question, et c'est le
serveur qui décide. Avec deux autres mesures — deux des trois rôles délégables n'accordent
strictement rien, et un délégant peut accorder plus qu'il ne détient — cela fait l'objet de
**[TCK-395](TCK-395-delegation-role-delegue-sans-rapport-avec-les-capacites.md)**.

**Pas de nouvelle route.** La section vit sous `/admin/roles`, déjà dans `PRO_ROUTES` et déjà
gardée en SSR par `ensureStandardAgencyOrRedirect`. Une entrée de plus n'aurait rien gardé.

**Les libellés `role_label` / `status_label` de `RoleDelegationResource` ne sont pas affichés** —
ils sont en français en dur dans le PHP (principe non négociable n°5). Ils sont volontairement
présents dans le double de test : sans eux, le test qui vérifie qu'on ne les rend pas ne
prouverait rien.

**Dix ablations ont été jouées**, chacune faisant rougir le test qu'elle vise et lui seul.


## Reprise après revue adverse — 2026-08-27

La revue a rendu **« accepté avec réserves »** : les 8 AC exécutés, les 10 ablations rejouées ou
inventées confirmées, et le versant droits sondé sain par 9 sondes PHPUnit hors dépôt (expiration
appliquée à la lecture, révocation immédiate, frontière d'agence tenue dans les deux sens, chaîne
de délégations refusée). **Deux réserves ont été levées ; toutes deux portaient sur l'HORLOGE, et
la seconde était un vrai défaut de droits.**

### 1. Les fixtures pourrissaient par l'horloge — et le correctif a d'abord pourri lui aussi

`statutEffectif()` compare `ends_at` à `Date.now()`, et les fixtures portaient des dates en dur
(`'2026-12-31T23:59:59+00:00'`). Mesuré par la revue, **code de production intact** : reculer cette
seule date d'un an rendait **5 rouges sur 12** ; les reculer toutes, **9 sur 57**. Ces tests
seraient devenus rouges le 2027-01-01 sur un dépôt que personne n'aurait touché — et ce jour-là ils
auraient accusé le dernier commit venu.

Les deux fichiers de test n'ont plus aucune date en dur : les décalages sont exprimés par rapport à
l'instant du test (`enJours(120)`, `dans(-30)`, `saisieDans(160)` pour les `<input type="date">`).

**Et la première version du correctif ne suffisait pas.** L'ablation qui le vérifie — avancer
l'horloge de test d'un an avec `vi.setSystemTime`, sans toucher au code de production — a rendu
**3 rouges** : le tableau `LES_QUATRE` était construit au CHARGEMENT du module, donc calé sur
`Date.now()` à l'import et non sur l'instant du test. *Une date relative évaluée trop tôt est une
date en dur qui s'ignore.* C'est désormais une fonction, `lesQuatre()`.

Preuve dans les deux sens, même harnais d'horloge :

| Fichier de fixtures | Horloge +1 an | Horloge +10 ans |
|---|---|---|
| version d'origine (dates en dur) | **5 rouges / 12** | — |
| version corrigée | **13 verts / 13** | **13 verts / 13** |

### 2. L'horloge du navigateur pouvait retirer le bouton de révocation d'une délégation vivante

Le défaut : le bouton « Révoquer » était offert sur le statut **effectif**, calculé en comparant
`ends_at` à l'horloge du NAVIGATEUR. Un poste dont l'horloge avance — dérive, fuseau mal réglé,
machine virtuelle réveillée — franchit `ends_at` avant le serveur. La ligne passait à « Expirée »
en avance et **le bouton disparaissait**, alors que `hasActiveAgencyDelegation` évalue
`ends_at > now()` avec l'horloge SERVEUR et que le DELETE aurait été accepté.

**C'est une délégation qui accorde encore des droits et qu'on ne peut plus retirer parce qu'on
croit qu'elle est finie** — sur l'écran prévu pour ça, et sur l'action qui y est l'action d'urgence.
Le test livré au premier tour figeait ce comportement, bouton absent compris.

Ce qui est OFFERT se décide désormais sur `delegation.status`, la valeur que rend la même machine
que celle qui arbitre le DELETE. Ce qui est AFFICHÉ — estompage et badge « Expirée » — reste sur le
statut effectif : annoncer « Active » sur des droits peut-être éteints serait le mensonge inverse,
et il est pire.

**Le geste de trop ne coûte rien, le geste manquant n'a aucun recours.**
`RoleDelegationService::revoke()` sort en tête si la ligne n'est ni `Active` ni `Scheduled` : la
révocation est idempotente. C'est ce qui rend l'asymétrie du correctif légitime — on ne symétrise
pas deux erreurs dont les coûts diffèrent d'un ordre de grandeur.

Couvert par un test dédié (« garde « Révoquer » quand le SERVEUR dit encore active, même si
l'horloge locale a franchi ends_at », `ends_at` à −30 s, l'ordre de grandeur d'une dérive
ordinaire). **Ablation A9** — revenir à `estDelegationRevocable(statut)` : **1 rouge, celui-là et
lui seul**, md5 du fichier restauré à l'identique.

### Ce qui reste ouvert

- **[TCK-395](TCK-395-delegation-role-delegue-sans-rapport-avec-les-capacites.md)** — inchangé, et
  c'est le point le plus lourd du lot : une délégation `agency_admin` accorde un droit de policy
  que le modèle de capacités ne voit jamais passer, et déléguer `agent` ou `owner` n'accorde
  **rien** nulle part. Confirmé par exécution (sonde P9), pas par lecture.
- **Aucune vérification NAVIGATEUR** n'a été faite : le rendu réel des quatre variantes de badge en
  thème clair et sombre, et le comportement d'`<input type="date">` hors jsdom, restent non vus.
- La revue signale aussi une ligne `active` tombée hors de la page 1 (`per_page: 100`, sans
  pagination) qui deviendrait invisible donc non révocable. C'est la convention en vigueur de
  l'écran (`agency-roles.ts:72` fait pareil) et ce n'est pas ticketé.
