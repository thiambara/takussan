---
id: TCK-2849
title: "API : le bailleur d'un bien d'agence confirme une visite ou propose un autre créneau quand l'agence le lui confie (réglage, ADR-0112)"
status: todo
phase: P1
family: back
estimate: S
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: []
blocks: [TCK-2869]
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md#17-propertyvisit-"
    - "docs/models-spec.md#2-agency"
tags: [back, visites, bailleur, accueil, audit-ux, app]
---

## Objectif utilisateur

Le bailleur à qui son agence confie ses visites confirme, ou déplace, la visite de son bien depuis son accueil, sans appeler l'agent.

## Contrat de données

Relevé le 2026-11-15 (`dev` 8c60f4c58) :

- `PropertyVisitController::confirm` → `abort_code_unless(agitPourLeBien(...), 403, 'visit.staff_only')` ; `PropertyVisitPolicy::agitPourLeBien` réserve tout geste d'écriture d'une visite d'un bien d'agence au personnel actif (TCK-590, passe 3 B2″).
- La confirmation accepte déjà `scheduled_at` (autre créneau, TCK-2624).
- Décision 7 (TCK-2624) : seul l'hôte confirme — la maquette `app-accueil` e2 dessine pourtant « Autre créneau » + « Confirmer » chez le bailleur.

Décision : [ADR-0112](../../../adr/0112-le-bailleur-confirme-les-visites-quand-l-agence-le-lui-confie.md) (**Proposé — à valider par le porteur avant tout code**).

## Contraintes strictes (métier)

- ADR-0112 § 1 à § 5, sans exception : réglage d'agence faux par défaut ; bailleur **actif** seulement ; confirmer ou proposer un autre créneau, rien d'autre ; agent attribué notifié ; journal au nom du bailleur.
- Le réglage s'écrit par un administrateur de l'agence seulement (capacité des réglages de l'agence) et se lit dans la ressource de l'agence.
- La capacité « peut confirmer » est rendue avec la visite (champ `can.confirm` ou équivalent existant) pour que l'écran n'affiche jamais un geste qui rendra 403.
- Aucun changement pour un bien sans agence (l'hôte confirme déjà).

## Delta à produire

- [ ] Faire valider ADR-0112 par le porteur (statut « Accepté ») — sinon le ticket passe `blocked`.
- [ ] Migration : le réglage d'agence (booléen, défaut `false`), son `down()`.
- [ ] Écriture du réglage (FormRequest des réglages de l'agence) et lecture dans la ressource.
- [ ] Branche de `PropertyVisitPolicy::agitPourLeBien` limitée à `confirm` (avec ou sans `scheduled_at`).
- [ ] Notification de l'agent attribué ; entrée de journal.
- [ ] Tests `OwnerConfirmsAgencyVisitTest` : réglage faux → 403 `visit.staff_only` (inchangé) ; vrai + bailleur actif → 200 et SMS ; vrai + bailleur `blocked` → 403 ; vrai → `cancel` et `complete` toujours 403 ; autre créneau posé ; agent notifié.

## Critères d'acceptation

- [ ] AC1 — Réglage faux : le bailleur actif d'un bien de l'agence reçoit 403 `visit.staff_only` sur `confirm` (régression gardée).
- [ ] AC2 — Réglage vrai : même appel → 200, la visite passe `confirmed`, le SMS part au visiteur, l'agent attribué reçoit une notification qui nomme le bailleur.
- [ ] AC3 — Réglage vrai, `confirm` avec `scheduled_at` : la visite passe au nouveau créneau, avec la garde de chevauchement de l'agent.
- [ ] AC4 — Réglage vrai, bailleur `blocked` ou d'un autre bien : 403.
- [ ] AC5 — Ablation : retirer la condition « profil actif » de la branche fait rougir AC4.

## Hors périmètre

- L'écran de l'accueil du bailleur : TCK-2869. L'interrupteur dans les réglages de l'agence : un AC de TCK-2869 si la page des réglages le permet sans autre maquette.

## Notes d'implémentation

_(à remplir par implementing-specs)_
