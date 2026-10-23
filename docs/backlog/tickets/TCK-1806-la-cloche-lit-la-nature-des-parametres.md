---
id: TCK-1806
title: "La cloche lit la nature de chaque paramètre dans `param_types`, au lieu de la deviner"
status: todo
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#23-notifications"
  adr:
    - "docs/adr/0032-l-api-n-ecrit-plus-de-prose.md"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-164--paramètres-text-des-notifications-codées-qui-portent-un-code"
tags: [back, front, notifications, pistes]
---

## Contexte

Réf : **P164.05** du fichier de pistes, `validé` (validation en bloc du porteur, critère V6 accordé).

L'API connaît la nature de chaque paramètre d'un code (`NotificationCode::params()`,
`optionalParams()`), la cloche ne la reçoit pas : `texteNotification.ts` traduit `role` pour les
seuls codes `role_delegation.*`, `provider` pour le seul `governance.integration_changed`, un mois
pour le seul `owner_statement.available`, et une date par la forme de la valeur. Un code neuf qui
déclare un `role` ailleurs s'affiche brut à la cloche, et un `text` à forme de date y serait
reformaté.

## Décision du porteur

validé — validation en bloc du porteur (2026-10-22) : la piste telle qu'écrite, avec la recommandation du délégué quand l'entrée en porte une ; où elle laisse plusieurs voies sans recommandation, l'implémenteur retient la plus étroite et écrit son choix dans le ticket

Recommandation du délégué retenue : un champ `param_types` dans `AppNotificationResource`,
dérivé de `NotificationCode::params()` et `optionalParams()`, que `valeursDeNotification` lit pour
choisir sa branche, la forme de la valeur n'étant plus qu'un repli pour une ligne sans code connu.

## Contrat de données

- `AppNotificationResource` rend `param_types` : `{ <nom>: <nature> }` pour un code connu de
  l'enum (`params() + optionalParams()`), `null` sinon. Champ clairsemé comme les autres
  (`fields[app_notifications]=…,param_types`).
- La cloche le demande dans `CHAMPS_NOTIFICATION`.
- `valeursDeNotification` : la nature déclarée choisit la branche (`money`, `date`, `datetime`,
  `count`, `role`, `reason_code`, `provider`, `month`, `text`, `url`). Un `text` reste tel quel,
  même à forme de date.
- Repli, `param_types` absent : montant par sa forme d'objet, date par sa forme, motif par son
  nom `reason_code` (comportement d'avant pour ces branches) ; `role`, `provider` et mois restent
  bruts.

## Choix de l'implémenteur (voies laissées ouvertes)

- **Les tables de devinette se retirent** (`CODES_A_ROLE_CODE`, `CODES_A_FOURNISSEUR`,
  `PARAMS_MOIS`) : les garder doublerait les natures côté front, ce que la recommandation écarte.
  `PARAMS_NOMMES` (variantes `_unnamed`, P164.06) n'est pas une nature : il reste.
- **Pas d'amendement d'ADR-0032** dans ce ticket : `docs/adr/` est fermé à l'implémenteur, et le
  champ s'ajoute au contrat de la ressource sans en retirer rien. Le rapport de PR le signale au
  porteur.
- Le broadcast `NewNotification` ne porte pas de code : il n'est pas touché.

## Delta à produire

- [ ] `AppNotificationResource` : `param_types` dans `FIELDS` et le rendu.
- [ ] `lib/notifications.ts` : type `param_types`, champ demandé.
- [ ] `texteNotification.ts` : branche par nature, repli par forme.
- [ ] Tests API (`NotificationParamTypesTest`) et front (`NotificationRow.test.tsx`,
  `notifications-champs.test.ts`).

## Critères d'acceptation

- [ ] AC1 — l'API rend `param_types` pour un code connu (dont les paramètres facultatifs), `null`
  pour une ligne sans code ; le champ clairsemé le rend ou l'omet.
- [ ] AC2 — la cloche traduit un `role` déclaré `role` sur un code hors `role_delegation.*`.
- [ ] AC3 — un `text` à forme de date reste tel quel ; une `date` déclarée est formatée.
- [ ] AC4 — sans `param_types`, montant et date restent formatés par leur forme.

## Hors périmètre

- L'amendement d'ADR-0032 (au porteur).
- Le passage de `governance.role_capabilities_changed` en `role` (P164.04, TCK-1808).

## Notes d'implémentation
