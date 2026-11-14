---
id: TCK-2818
title: "La fiche du bail relance un impayé avec l'aide de relance commune"
status: done
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

Sur la fiche d'un bail en retard, l'admin d'agence relance le locataire par WhatsApp en un geste : « Relancer » mène
à l'écran Impayés, qui ouvre la relance de cette échéance (TCK-2775). Le message et le lien de paiement sont les mêmes
que depuis la file « À traiter » des baux ou l'écran Impayés, car c'est la même feuille.

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

- [x] AC1 — Sur la fiche d'un bail en retard (`/app/leases/{id}`), « Relancer » (carte Loyer, et menu de la ligne en
  retard de l'échéancier) est un lien vers `/app/agency/finances?tab=impayes&relance=<échéance>&bail=<bail>`. Cette
  adresse ouvre la feuille de TCK-2660, qui produit la même URL `wa.me` que la file de TCK-2644 : même texte décodé
  (mois, montant pénalité comprise, lien de paiement), et un `POST …/reminders` avec `channel: whatsapp`. La fiche
  ne compose ni n'envoie rien elle-même.
  *Preuve* : `takussan-web/src/components/leases/__tests__/relance-de-la-fiche.tck-2818.test.tsx` (« AC1 », le lien
  de la carte et du menu) ; `takussan-web/src/components/admin/finances/impayes/__tests__/relance-de-l-adresse.tck-2775.test.tsx`,
  bloc « TCK-2818 AC1 » (cette adresse → `wa.me`, texte, `POST …/payment-link` puis `…/reminders {channel: whatsapp}`).
- [x] AC2 — Le geste n'est rendu qu'à l'admin d'agence qui ouvre l'écran Impayés (`/app/agency/finances` dans ses pages
  d'administration, `pages-admin.ts`), pour un bail de son agence et une échéance en retard (`is_overdue`). Un test
  rend la fiche au locataire, au bailleur, à l'admin d'une autre agence et sans pages fournies, et n'y trouve aucun
  « Relancer ».
  *Preuve* : même fichier, bloc « AC2 » ; ablations (locataire, accès, agence, retard) toutes rouges.
- [x] AC3 — Un locataire sans téléphone : « Copier le lien de paiement » et sa raison sur la carte Loyer, le lien n'est
  créé qu'au clic, et aucun `wa.me` ; le menu de la ligne garde « Copier le lien de paiement », sans « Relancer ».
  *Preuve* : même fichier, bloc « AC3 » ; ablation de `joignable` rouge.
- [x] AC4 — Le navigateur ne lève aucun `MISSING_MESSAGE` sur la fiche (390 et 1280), et le lien « Relancer » de la
  fiche ouvre la feuille de relance sur l'écran Impayés. Ce critère se vérifie au navigateur, car la suite vitest ne
  le voit pas.
  *Preuve* (2026-11-14, persona `admin`, CDP, 390 et 1280) : « Relancer » sur la carte Loyer, 0 `MISSING_MESSAGE`,
  0 clé en clair, 0 écriture au chargement ; le clic ouvre la feuille sur `/app/agency/finances` (« Ouvrir WhatsApp »,
  « Copier »), toujours sans écriture ni exception.

## Hors périmètre

- La file « À traiter » (TCK-2644) et l'écran Impayés (TCK-2660).
- L'ouverture de la relance depuis l'URL de l'écran Impayés (TCK-2775).

## Notes

- **Ticket réécrit pour la voie TCK-2775 (2026-11-14).** L'objectif, l'AC1, l'AC2 et l'AC4 décrivaient une feuille de
  relance montée sur la fiche. La décision 16 b du porteur fait passer la relance par l'écran Impayés ouvert depuis son
  adresse : la fiche n'a pas de feuille à elle, elle y mène. C'est un delta de ticket, pas de spec.
- **Qui voit « Relancer » (option a de team-lead).** L'écran Impayés est réservé à l'admin (`pages-admin.ts`,
  `exige: { role: 'admin' }`) : le geste suit `useAccesAdmin()` (le chemin `/app/agency/finances` figure dans ses
  pages), le bail est de son agence (`lease.agency_id === user.agency_id`), et le lecteur n'est pas le locataire. Un
  agent ou un bailleur qui gère le bail ne voit pas de lien mort. Sans fournisseur de pages : rien (fail-closed).
- **Quelle échéance.** `is_overdue` (la règle de l'écran). La pénalité seule restée due sur un loyer payé (TCK-2778)
  n'est pas un impayé de l'écran : la fiche ne la relance pas.
- Implémentation : `takussan-web/src/components/leases/fiche/RelanceDuLoyer.tsx` (`useRelanceDeLaFiche`,
  `RelancerLeLoyer`), branché dans `CartesDuBail.tsx`, `LeaseSchedule.tsx` et `LeaseDetail.tsx`.

- 2026-11-14 : clôturé — jugé au HEAD 0053d0bbd, tous les AC tenus avec preuve (verdict de clôture 2026-11-14-b).
