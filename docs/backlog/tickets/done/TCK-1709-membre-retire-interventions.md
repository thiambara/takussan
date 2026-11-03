---
id: TCK-1709
title: "Le membre retiré n'est plus donneur d'ordre des interventions sur les biens qu'il a saisis"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features: ["docs/features.md#112-agence--équipe"]
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-153--ce-que-le-retrait-en-leave_unassigned-laisse-au-nom-du-retiré-et-ce-qui-le-lit-encore"
tags: [back, agence, autorisation, maintenance, pistes]
---

## Objectif utilisateur

L'agent retiré en `leave_unassigned` ne lit plus, ne pilote plus et ne tranche plus les devis des
interventions sur les biens d'agence qu'il avait saisis.

Réf : **P153.03**.

## Décision du porteur

- P153.03 : validé — validation en bloc du porteur (2026-10-22) : la piste telle qu'écrite, avec la recommandation du délégué quand l'entrée en porte une ; où elle laisse plusieurs voies sans recommandation, l'implémenteur retient la plus étroite et écrit son choix dans le ticket

Critères accordés : V2, et V1 par `decideQuote`.

**Choix de l'implémenteur** : « même règle que P153.01 », donc celle de TCK-1705 — sur un bien
d'agence, l'auteur (`user_id`) ne vaut titre que s'il détient un profil de **tout statut**
(bailleur, agent, admin) dans l'agence. Le bailleur suspendu reste donneur d'ordre pour lire ;
`principalWrites` lui retire déjà les gestes (TCK-1146). Qui tranche à la place du bailleur
(angle 160) n'est pas touché.

## Delta à produire

- [x] `MaintenanceRequestPolicy::authorHolds` (et `isMemberOf`) : la branche du titulaire de
  `isPrincipalFor` passe par elle.
- [x] `decideQuote` en `awaiting_owner` exige aussi `authorHolds` avant `landlordWrites`.
- [x] `MaintenanceRequestResource` mémorise l'appartenance par requête (`$memberOf`), comme
  l'agence du personnel (TCK-900) : aucune requête de plus par ligne.
- [x] Test : `MembreRetireInterventionsTest` (2 cas).

## Critères d'acceptation

- [x] AC1 — agent auteur retiré : `view`, `update`, `actAsPrincipal`, `decideQuote` faux (dont en `awaiting_owner`) ; `GET /api/maintenance-requests/{id}` → 403.
- [x] AC2 — témoin : le bailleur auteur garde les trois et tranche en `awaiting_owner`.

## Hors périmètre

- Qui tranche à la place du bailleur (angle 160).

## Notes d'implémentation

- Ablation : policy remise → AC1 rouge ; seule la condition `authorHolds` de `decideQuote` retirée
  → AC1 rouge sur `awaiting_owner`. Remis → 2/2.
- Trois fixtures prenaient pour propriétaire un compte sans profil dans l'agence du bien
  (`MigratedAuthorizationRulesTest`, `MaintenancePrincipalFieldsTest` ×2) : elles lui donnent un
  profil de bailleur.
- Fusion avec `pre-dev` (2026-10-23, réparation de #1200) : TCK-1720 (P160.02) y a posé une règle
  plus étroite, `BailleurDuBien::est` (profil propriétaire dans l'agence), aux deux endroits où ce
  ticket mettait `authorHolds`. Elle couvre l'agent retiré (ni bailleur, ni personnel) : elle est
  gardée, et `authorHolds`, `isMemberOf` et le `$memberOf` de la ressource, devenus morts, sont
  retirés. `MembreRetireInterventionsTest` reste vert sur la règle fusionnée.
