---
id: TCK-2166
title: "L'effacement du seul administrateur, ou de l'administrateur principal, ne laisse plus une agence sans administrateur"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
    - "docs/features.md#21-authentification--comptes"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-204--travail-dun-agent-laissé-à-son-compte-effacé"
tags: [back, account, agency, pistes]
---

## Objectif utilisateur

Une agence ne se retrouve jamais sans administrateur parce que le sien a effacé son compte : elle
est fermée si personne n'y reste, le titre d'administrateur principal passe à un autre
administrateur s'il y en a un, et sinon le compte doit d'abord en nommer un.

## Contexte

Réf : **P204.02** du fichier de pistes, `validé`. Le retrait refuse l'administrateur principal et
le dernier administrateur (`AgencyMemberRemovalService`), l'effacement ne lisait ni l'un ni
l'autre : mesuré, agence à 0 admin actif, `primary_admin_id` sur le compte effacé, agence `active`.

## Décision du porteur

> validation du porteur (2026-10-24) : espace `individual`, ou agence sans autre membre actif : l'agence passe `inactive` à l'exécution ; s'il existe un autre administrateur, `primary_admin_id` lui passe à l'exécution ; du personnel mais aucun autre administrateur : une obligation que le compte lève lui-même en promouvant un membre

## Hypothèses (mode sans humain)

- Agences visées : celles où le compte a un profil d'admin actif, ou dont il est `primary_admin_id`.
- « Membre actif » : la règle de `MembershipCapabilityResolver::isMemberAt()` — profil actif
  d'agent, d'admin ou de bailleur.
- « Un autre administrateur » : un `AgencyAdminProfile` actif d'un autre compte ; le titre passe au
  plus ancien profil (plus petit identifiant).
- Un admin qui n'est pas principal, avec un autre admin dans l'agence : rien ne change.
- L'obligation, de type `agency_admin_succession` (`id` = l'agence), suit la forme des autres
  (libellé rendu par l'API, `lang/*/account.php`, que le front affiche tel quel ; `wo` en français).
- À l'exécution, une succession redevenue due pendant la grâce (l'autre admin retiré entre-temps)
  ne bloque plus rien : elle est journalisée (`agency.admin_erased`, `outcome = succession`), comme
  les deux autres issues.

## Delta à produire

- [x] `App\Services\Account\ErasedAgencyAdmin` (`plan`, `successionsDue`, `settle`).
- [x] `collectOpenObligations()` : obligation `agency_admin_succession`.
- [x] `anonymize()` : `settle()` avant la fin des profils.
- [x] Libellé de l'obligation (`fr`, `en`, `wo`) et type TS côté front.
- [x] Test : `EffacementAdminDAgenceTest` (5 cas).

## Critères d'acceptation

- [x] AC1 — Espace `individual` (avec un bailleur) : aucune obligation, agence `inactive` après l'exécution.
- [x] AC2 — Agence sans autre membre : `inactive` après l'exécution.
- [x] AC3 — Admin principal avec un autre admin : `primary_admin_id` passe à l'autre, agence `active`.
- [x] AC4 — Admin principal seul admin avec un agent : obligation sur l'agence, la demande lève 422.
- [x] AC5 — Admin non principal à côté du principal : rien ne change.

## Hors périmètre

- Un geste neuf de promotion : le compte lève l'obligation par les gestes d'équipe existants.

## Notes d'implémentation

- Ablation : `settle()` et la boucle d'obligation retirés → 4 rouges sur 5 (AC5 garde l'absence d'effet) ; remis → vert.
