---
id: TCK-2753
title: "Retirer un bailleur de l'agence : décider ce que le départ veut dire, puis le servir"
status: todo
phase: P1
family: back
estimate: M
wave: 90
created: 2026-11-12
updated: 2026-11-12
depends_on: [TCK-2641]
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md#34-ownerprofile-"
tags: [back, owners, team, decision, audit-ux]
---

## Objectif utilisateur

L'admin d'agence met fin au mandat d'un bailleur depuis sa fiche (« Retirer de l'agence ») et sait, avant d'agir, ce qu'il advient de ses biens, de ses baux en cours et de l'argent encore à lui verser.

## Constat (relevé le 2026-11-12, pendant TCK-2641)

- TCK-2641 demandait « Retirer de l'agence » sur la fiche du bailleur, par `DELETE /api/agencies/{agency}/members/{user}` (AC7), au motif que la page Équipe portait ce geste.
- **Elle ne le porte pas pour un bailleur.** `AgencyMemberRemovalService::remove()` refuse un utilisateur qui n'est pas du personnel : 422 `agency_member.not_staff` (TCK-591 §8, testé par `AgencyMemberRemovalTest`). Le front ne propose « Retirer » qu'à une ligne du personnel (`isAgencyStaffRow`, TCK-591 AC23).
- Aujourd'hui, pour un bailleur, il existe seulement la suspension et la réactivation (`POST …/team/{user}/suspend|reactivate`, TCK-587) : le profil passe `blocked`, et le compte ne bouge pas.
- La fiche de TCK-2641 porte donc « Suspendre l'accès » / « Réactiver », sans « Retirer » (décision du 2026-11-12, relayée par team-lead).

## Ce qui est à décider (porteur), avant tout code

1. **Les biens du bailleur** : restent-ils dans l'agence (archivés ? sans titulaire ?), partent-ils avec lui, ou le départ est-il refusé tant qu'il en reste ?
2. **Les baux en cours** : bloquent-ils le départ (comme le portefeuille non vide d'un agent, `agency_member.portfolio_not_empty`), ou se poursuivent-ils jusqu'à leur terme ?
3. **L'argent** : un reste à verser non nul (`remaining_to_pay`) bloque-t-il le départ, ou faut-il un dernier reversement ?
4. **Le profil** : supprimé, `inactive`, ou `blocked` définitif ? Que garde-t-on pour le journal et les relevés passés ?
5. **Le geste** : endpoint dédié (`DELETE /api/owners/{ownerProfile}` ?), capacité (`owners.update`, `team.remove`, ou une nouvelle), double authentification (comme la suspension, TCK-1203).

Ces choix sont structurels : ils s'écrivent en ADR avant l'implémentation.

## Delta à produire (après décision)

- [ ] ADR du départ d'un bailleur.
- [ ] Endpoint, policy et journal d'activité.
- [ ] « Retirer de l'agence » sur la fiche `/app/owners/[id]` (TCK-2641), séparé et destructif, qui dit son effet avant d'agir.
- [ ] Tests : refus selon les règles décidées, effet sur biens, baux et argent, journal.

## Critères d'acceptation

- [ ] AC1 — L'ADR tranche les cinq questions ci-dessus.
- [ ] AC2 — Depuis la fiche, « Retirer de l'agence » envoie l'appel décidé après confirmation et double authentification, et l'effet annoncé est celui que la base montre ensuite.

## Hors périmètre

- La suspension et la réactivation : TCK-2641.

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
