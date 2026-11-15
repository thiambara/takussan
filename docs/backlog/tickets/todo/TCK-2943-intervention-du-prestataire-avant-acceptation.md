---
id: TCK-2943
title: "Assistant du prestataire : l'intervention jointe porte son échéance, sa date et sa référence de signalement, les mots du locataire et un lien de détail"
status: todo
phase: P2
family: back
estimate: S
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: []
blocks: [TCK-2946]
spec_refs:
  features:
    - "docs/features.md#18-maintenance--interventions"
    - "docs/features.md#onboarding-parcours"
  models:
    - "docs/models-spec.md#21-maintenancerequest-"
    - "docs/models-spec.md#37-serviceproviderprofile-"
tags: [back, entree, prestataire, intervention, audit-ux, audit-2026-11-15]
---

## Objectif utilisateur

Le prestataire invité juge l'intervention avant de l'accepter : pour quand, signalée quand et par qui, et ce que le locataire en dit.

## Contrat de données

Écart de TCK-2613 (`[2]`, « projection minimale de l'API avant acceptation »). Relevé du 2026-11-15 : `GET /api/me/profiles/{sp}/intervention-d-origine` rend une projection minimale (photo, titre, catégorie, quartier, devis, agence).

À ajouter : `respond_by` (échéance de réponse, p. ex. « à traiter sous 48 h »), `reported_at`, `reference`, `reported_by_role` (« locataire »), `tenant_quote` (le texte du signalement), `detail_url` (la fiche de l'intervention, lisible après acceptation).

## Contraintes strictes (métier)

- **Règle d'accès changée** (le texte du locataire est une donnée personnelle, servie à un tiers avant qu'il accepte) : l'ADR s'écrit AVANT (numéro suivant libre), validé par le porteur ; il dit ce qui sort avant acceptation (jamais le nom, le téléphone ni l'adresse exacte du locataire ; le texte tel quel ou tronqué ; coordonnées masquées dans le texte, [ADR-0044](../../../adr/0044-donnees-personnelles-chiffrement-journal-d-agence-registre-des-droits.md)).
- `respond_by` vient d'une règle existante de l'agence ou de la plateforme (délai de réponse d'une intervention) ; s'il n'en existe aucune, l'ADR la pose (réglage de l'agence) au lieu d'écrire « 48 h » en dur.
- `detail_url` n'ouvre la fiche qu'après acceptation (avant : 403 sur la fiche, ce que le front sait).

## Delta à produire

- [ ] ADR « ce que le prestataire lit d'une intervention avant de l'accepter ».
- [ ] Projection étendue de `intervention-d-origine` (sparse fieldsets).
- [ ] Masquage des coordonnées dans `tenant_quote`.
- [ ] Tests : `InterventionDOrigineProjectionTest` (champs rendus, aucun nom ni téléphone du locataire, numéro de téléphone masqué dans le texte).

## Critères d'acceptation

- [ ] AC1 — Une intervention signalée par le locataire le 12 nov. (réf. INT-0042, texte « fuite sous l'évier, appelez-moi au 77 123 45 67 ») rend `reported_at`, `reference: "INT-0042"`, `reported_by_role: "tenant"`, `tenant_quote` avec le numéro masqué, et `respond_by`.
- [ ] AC2 — La réponse ne contient ni le nom, ni le téléphone, ni l'adresse exacte du locataire (test sur les clés et les valeurs).
- [ ] AC3 — Un autre prestataire que le titulaire reçoit la même réponse qu'aujourd'hui (403/404).

## Hors périmètre

- L'écran (TCK-2946).

## Notes d'implémentation

_(à remplir par implementing-specs)_
