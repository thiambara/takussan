---
id: TCK-179
title: Statuts & enums côté customer — localiser les valeurs brutes (pending, in_person, residential_rent, Urgent/High/Normal/Low)
status: todo
phase: P2
family: front
estimate: S
created: 2026-05-05
updated: 2026-05-05
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#28-internationalisation--préférences
tags: [front, i18n, enums]
---

## Objectif utilisateur

Les statuts et types métier affichés au locataire doivent être en français — pas des valeurs brutes d'enum lisibles seulement par un développeur.

## Contrat de données

Findings smoke test 2026-05-05 — valeurs brutes affichées en EN ou en snake_case :

- `/app/overview/tenant` (Échéances des 30 prochains jours) : statut `pending` au lieu de « En attente / À venir ».
- Modale « Demander une visite » (combobox Type) : `in_person` au lieu de « En personne ».
- `/app/leases/[id]` (entête) : type bail rendu `Residential Rent` au lieu de « Bail d'habitation ».
- `/app/maintenance/new` (radios Priorité) : `Urgent / High / Normal / Low` au lieu de `Urgente / Élevée / Normale / Faible`. Le label parent « Priorité (Normale par défaut) » est lui en FR — donc mélange dans le même contrôle.

Tous ces écarts proviennent de composants qui rendent directement la valeur d'enum (string) au lieu de passer par un helper de traduction.

## Contraintes strictes (métier)

- La valeur stockée en DB ne change pas — on parle uniquement de l'**affichage**.
- Centraliser les libellés FR des enums dans des fichiers déjà existants (`src/lib/enums/*.ts`) ou dans la couche i18n introduite par TCK-175 — ne pas dupliquer les chaînes par composant.
- Par cohérence, les `aria-label` doivent suivre la même règle (lecture d'écran FR).

## Delta à produire

- [ ] Helper(s) de label : `bookingStatusLabel`, `visitTypeLabel`, `leaseTypeLabel`, `maintenancePriorityLabel`, `paymentStatusLabel` — chacun renvoyant la version FR depuis l'enum. Les co-localiser dans `src/lib/enums/`.
- [ ] Remplacer les renderings bruts repérés par les helpers correspondants.
- [ ] Audit grep sur `pending`, `in_person`, `residential_rent`, `Urgent` (en JSX) pour repérer les autres call-sites.
- [ ] Tests : snapshot ou render test sur chaque composant patché.

## Critères d'acceptation

- [ ] `/app/overview/tenant` affiche `À venir` / `En attente` au lieu de `pending`.
- [ ] La modale visite affiche `En personne`, `Virtuelle`, `Self-guided` (ou équivalent FR), `Hybride`.
- [ ] La fiche bail affiche `Bail d'habitation` (ou équivalent FR convenu) au lieu de `Residential Rent`.
- [ ] Les radios Priorité maintenance affichent `Urgente / Élevée / Normale / Faible`.
- [ ] Aucune valeur d'enum brute (snake_case ou EN) n'est rendue dans une page `/app/*` parcourue par un customer.

## Hors périmètre

- Localisation EN/WO (les helpers s'étendront via TCK-175).
- Persistence du choix de langue (TCK-175).

## Notes d'implémentation

_(à remplir par implementing-specs)_
