---
id: TCK-1154
title: "Agenda et quittances : la branche collaborateur bornée aux agents et gestionnaires du personnel"
status: done
phase: P2
family: bug
estimate: M
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#11-gestion-des-biens"
  models:
    - "docs/models-spec.md#8-propertycollaborator"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-86--collaborateurs-co_owner-et-viewer-dun-bien"
tags: [back, calendar, receipts, collaborators, authorization, pistes]
---

## Contexte

Réf : **P86.04** du fichier de pistes, `validé` (V2 accordé : borner ou retirer ces branches change
une autorisation qu'un test épingle).

`CalendarEventCollector::scopeVisibleProperties` (agenda et flux iCalendar) et
`DocumentPdfController::authorizeReceipt` ouvraient le bien à tout collaborateur dont `accepted_at`
est posé, quel que soit son rôle et sans exiger qu'il soit du personnel : un `viewer` accepté lisait
les réservations d'un bien que `PropertyPolicy` lui refuse, et téléchargeait ses quittances.

## Décision du porteur

validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket

Choix retenu : la première voie, « borner ces deux branches aux rôles `agent` et `manager` encore
personnel de l'agence, comme `BookingStakeholders::collaboratorsOf` ». L'agenda lit les agences où
l'appelant est personnel (`MembershipCapabilityResolver::staffAgencyIds`, déjà calculées, et
réduites à l'agence du profil actif quand il y en a un) ; la quittance juge
`isStaffAt(user, agence du bail)`. L'autre voie (retirer les branches) n'est pas prise.

## Objectif utilisateur

Un collaborateur qui n'est pas du personnel de l'agence ne lit ni l'agenda ni les quittances d'un
bien qui ne lui est pas ouvert.

## Delta à produire

- [x] `scopeVisibleProperties` : branche collaborateur sous `role ∈ {agent, manager}` et
      `agency_id ∈ staffAgencyIds`.
- [x] `authorizeReceipt` : même borne, par `isStaffAt`.
- [x] Tests dans `tests/Feature/Api/CalendarTest.php` et `tests/Feature/Api/ReceiptPdfTest.php`.

## Critères d'acceptation

- [x] AC1 — `viewer` accepté (bailleur de l'agence) et agent accepté sans profil de personnel :
      `GET /api/calendar?types[]=booking` → 0 événement, quittance → 403.
- [x] AC2 — agent accepté, personnel de l'agence du bien (profils dans deux agences, sans profil
      actif) : l'événement et la quittance restent servis. Les deux tests existants, qui
      ouvraient ces gestes à un compte sans aucun profil, sont réécrits ainsi.

## Hors périmètre

- Le sens métier d'`accepted_at` (models-spec : aucun aujourd'hui).

## Notes d'implémentation

- Ablation : les deux fichiers rendus à leur état d'avant → les 2 tests AC1 rouges ; remis → verts.
