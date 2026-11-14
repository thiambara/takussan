---
id: TCK-2818
title: "La fiche du bail relance un impayé avec l'aide de relance commune"
status: todo
phase: P1
family: full
estimate: S
wave: 88
created: 2026-11-14
updated: 2026-11-14
depends_on: [TCK-2645, TCK-2660, TCK-2775]
blocks: []
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#14-lease-"
tags: [front, leases, whatsapp, impayes, relance, audit-ux, app]
---

## Objectif utilisateur

Sur la fiche d'un bail en retard, l'agence relance le locataire par WhatsApp sans quitter le dossier. Le message et
le lien de paiement sont les mêmes que depuis la file « À traiter » des baux ou l'écran Impayés.

## Origine

C'est l'ex-AC7 de TCK-2645, devenu AC9 de TCK-2644 le 2026-11-14, puis sorti en ticket propre le même jour
(décision 5 b de team-lead). Il ne pouvait rester dans TCK-2644 sans dépendre de TCK-2758 : la chaîne
TCK-2644 → TCK-2758 → TCK-2639 → TCK-2644 formait un cycle.

## Contrat de données

- La relance passe par l'aide partagée de TCK-2660 (`useRelanceDUnImpaye`, `FeuilleDeRelance`), sans aucune recopie
  ([ADR-0105](../../../adr/0105-la-relance-d-un-impaye-part-du-telephone-de-l-agence.md)).
- `POST /api/lease-payments/{payment}/payment-link` crée le lien de paiement, à l'envoi.
- `POST /api/lease-payments/{payment}/reminders {channel: whatsapp}` note la relance. Cette route est au personnel
  seul (`LeasePaymentPolicy`).

## Contraintes strictes (métier)

- **Emplacement** (décision 1 a de la session, 2026-11-12) : la carte Loyer et le menu de la ligne en retard de
  l'échéancier, pour le personnel seul. Le locataire et le bailleur ne voient pas le geste.
- **Voie TCK-2775 (décision 16 b du porteur, 2026-11-14).** L'aide lit ses libellés sous `admin`, que la frontière
  i18n `(dashboard)/app/leases/[id]` ne sert pas aujourd'hui : la relance de la fiche passe par l'écran Impayés ouvert
  depuis son URL (`?tab=impayes&relance=<id d'échéance>`, TCK-2775). TCK-2758 (sortir les clés de `admin`) est
  obsolète.
- Sans téléphone connu du locataire, la règle de la file s'applique : « Copier le lien de paiement », avec la raison,
  et aucun lien `wa.me`.
- **i18n** : `fr` / `en` / `wo` (le `wo` porte le texte français tel quel), vouvoiement.

## Critères d'acceptation

- [ ] AC1 — Sur la fiche d'un bail en retard (`/app/leases/{id}`), « Relancer » produit la même URL `wa.me` que la file
  de TCK-2644, par la même aide : même texte décodé (mois, montant pénalité comprise, lien de paiement), et un
  `POST …/reminders` avec `channel: whatsapp`.
- [ ] AC2 — Le geste n'est rendu qu'au personnel qui peut noter la relance. Un test rend la fiche au locataire et au
  bailleur, et n'y trouve aucun « Relancer ».
- [ ] AC3 — Un locataire sans téléphone : « Copier le lien de paiement » et sa raison, et aucun `wa.me`.
- [ ] AC4 — Le navigateur ne lève aucun `MISSING_MESSAGE` sur la fiche quand la feuille de relance s'ouvre. Ce
  critère se vérifie au navigateur, car la suite vitest ne le voit pas.

## Hors périmètre

- La file « À traiter » (TCK-2644) et l'écran Impayés (TCK-2660).
- L'ouverture de la relance depuis l'URL de l'écran Impayés (TCK-2775).
