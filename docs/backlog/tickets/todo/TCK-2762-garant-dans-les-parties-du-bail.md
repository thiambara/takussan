---
id: TCK-2762
title: "Fiche du bail : le garant parmi les parties (bureau) et « Garant (n) » au dossier (téléphone), sa gestion en feuille"
status: todo
phase: P1
family: front
estimate: M
wave: 89
created: 2026-11-12
updated: 2026-11-12
depends_on: [TCK-2645]
blocks: []
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
  models:
    - "docs/models-spec.md#27-guarantor-"
tags: [front, leases, audit-ux, app]
---

## Objectif utilisateur

Sur la fiche d'un bail, on voit le garant là où l'on voit les autres personnes du bail. Au bureau, c'est une ligne de la carte « Parties » ; au téléphone, c'est la ligne « Garant (n) » du dossier. On l'ajoute ou on le modifie sans quitter la fiche.

## Contrat de données

Ce ticket est le suivi de la question 5 de TCK-2645 (team-lead, 2026-11-12 : « (a) ici + ticket de suivi »).

- La maquette de référence est `?p=app-baux&a=a`, écran 1 « Fiche — dossier du bail » :
  - au bureau, la carte « Parties » porte « Ousmane Seck · Garant · pièce d'identité reçue » (icône `shield-check`, chevron) ;
  - au téléphone, le dossier porte la ligne « Garant (1) · Ousmane Seck · pièce d'identité reçue ».
- La fiche de fidélité est `docs/qa/audit-ux-2026-11/fidelite/TCK-2645.json` (écart « garant », accepté pour TCK-2645).

Relevé du 2026-11-12 : la fiche livrée par TCK-2645 garde `GuarantorSection`, une carte « Garants » à part qui contient l'ajout, la liste et l'état vide. Cette carte est absente de la maquette, et le garant manque à la carte « Parties ». Les garants se lisent par `GET /api/leases/{id}/guarantors` ; l'ajout et la modification suivent `abilities.update`.

## Delta à produire

- Au bureau, chaque garant devient une ligne de « Parties » sous l'agent responsable. Elle porte une icône `shield-check`, le nom, « Garant · <état de la pièce> » et un chevron qui ouvre la feuille du garant.
- Au téléphone, le dossier gagne la ligne « Garant (n) », dont le détail donne le premier garant et l'état de sa pièce. Elle ouvre la même feuille.
- La feuille du garant (`FeuilleDuBas`) reprend ce que fait `GuarantorSection` : voir, ajouter et modifier selon `abilities.update`.
- La carte « Garants » quitte la fiche.

## Critères d'acceptation

- [ ] AC1 — Un bail avec un garant : la ligne figure dans « Parties » au bureau et dans « Garant (1) » au dossier du téléphone. Sans garant, aucune ligne ne s'affiche, et l'ajout reste offert à qui a `abilities.update`.
- [ ] AC2 — L'ajout et la modification passent par la feuille. La liste se relit après l'enregistrement. Un lecteur sans `abilities.update` voit le garant, sans geste d'écriture.
- [ ] AC3 — Fidélité : l'écart « garant » de `TCK-2645.json` est levé (a-1 téléphone et bureau).

## Hors périmètre

- Les pièces du garant : `GuarantorSection` n'en a jamais eu (prémisse re-mesurée par TCK-2645).
