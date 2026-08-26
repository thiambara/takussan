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

_(à remplir par implementing-specs)_
