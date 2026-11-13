---
id: TCK-2792
title: "Cartes du téléphone : le lien seul d'une carte (le nom, le titre) a une zone de frappe d'au moins 24 px"
status: todo
phase: P2
family: front
estimate: S
wave: 90
created: 2026-11-13
updated: 2026-11-13
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
    - "docs/features.md#13-réservations-courte-durée--visites"
tags: [front, accessibilite, cible-tactile, mobile, suite-de-tck-2660, audit-ux, app]
---

## Objectif utilisateur

Au téléphone, l'agent qui touche le nom d'un locataire ou le titre d'une visite dans une carte ouvre la fiche du premier
coup, sans viser une ligne de texte de 19 à 21 px.

## Contrat de données

Aucun. Aucun endpoint, aucune donnée : la zone de frappe d'un lien qui existe déjà.

## Direction UX / Artistique

**Le constat, mesuré le 2026-11-13 à 360 px** (HEAD 7641542ea, lecture seule, `fr-FR`, personas admin, agent, locataire,
propriétaire, prestataire et client de la démo, première page de chaque liste). Relevé en re-vérifiant TCK-2660.

| Liste (route, persona) | Carte (`data-slot`) | Lien seul | Hauteur | Zone de frappe |
|---|---|---|---|---|
| Impayés (`/app/agency/finances?tab=impayes`, admin) | `carte-impaye` | nom du locataire, `admin/finances/impayes/CarteDImpaye.tsx` | **18,8 px** | la boîte du lien seule |
| Visites (`/app/visits`, admin et agent) | `carte-du-jour` | titre de la visite, `visits/par-le-temps/cartes.tsx` | **21 px** | la boîte du lien seule |
| Visites (`/app/visits`, admin et agent) | `carte-demande` | titre de la demande, même fichier | **21 px** | la boîte du lien seule |
| Ma journée (`/app`, agent) | `carte-visite` | titre de la visite, `journee/Chronologie.tsx` | **20,6 px** | la boîte du lien seule |

**Le patron qui marche est déjà dans le dépôt** : un lien étiré par un pseudo-élément absolu sur la tête de la carte, ou sur
la carte entière. Mesuré le même jour : `carte-d-attente` des baux (zone de 40 px), `ligne-de-bail` du bailleur (97,8),
`carte-de-file` de la maintenance (187,5), les cartes de `/app/customers` (96). Les bailleurs (`/app/owners`), les
prestataires (`/app/maintenance/providers`) et le pipeline (`/app/crm/pipeline`, agent) n'ont aucune cible sous 24 px.
`docs/design-guidelines.md`, « La zone tactile élargie par pseudo-élément », et `LigneDeListe` (« la ligne entière est la
cible ») disent la même chose : la taille dessinée ne change pas, c'est la zone qui grandit. L'apparence de la carte reste
celle de la maquette (ADR-0106, exception (1)).

**Ce que ce ticket N'EST PAS : une non-conformité WCAG 2.5.8.** Les quatre liens tiennent le critère par son exception
d'espacement : un cercle de 24 px centré sur chacun ne touche aucune autre cible (la plus proche est à 40,4 px du centre
pour les impayés, 56,5 pour les visites, 62,8 pour Ma journée). Le plancher de 24 px est une règle du projet,
l'alignement sur les cartes voisines, et le confort du pouce.

## Contraintes strictes (métier)

- La destination, le libellé et le texte accessible de chaque lien ne changent pas.
- Une zone élargie ne recouvre aucune autre cible de la carte : les gestes (« Relancer sur WhatsApp », « Appeler »,
  « Itinéraire », la case de sélection de la file de relance de TCK-2682) restent atteignables et gardent leurs 44 px.
- Aucun écart de pixel neuf contre les références gelées des fiches de fidélité déjà posées (TCK-2660, TCK-2587).

## Delta à produire

- [ ] Impayés : la zone de frappe du nom du locataire dans la carte du téléphone.
- [ ] Visites : la zone de frappe du titre dans les cartes « du jour » et « demande ».
- [ ] Ma journée : la zone de frappe du titre de la carte de visite.
- [ ] Tests : un par carte, qui échoue si la zone retombe à la boîte du texte.

## Critères d'acceptation

- [ ] AC1 — À 360 px, pour chacune des quatre cartes du tableau, la zone de frappe du lien seul mesure au moins 24 px de haut
  et de large. La zone de frappe est la boîte du lien, ou la boîte que couvre son pseudo-élément absolu (le lien étiré
  compte). `document.elementFromPoint` rend le lien (ou un de ses descendants) aux quatre coins de cette zone, à 1 px du bord.
- [ ] AC2 — Dans ces mêmes cartes, chaque geste rend toujours son propre bouton ou lien à son centre (`elementFromPoint`) et
  mesure toujours 44 px de haut.
- [ ] AC3 — Un relevé à 360 px des listes du tableau et de celles déjà conformes (baux, `/app/customers`, maintenance,
  bailleurs, prestataires, pipeline) ne trouve aucun lien seul de carte dont la zone de frappe fasse moins de 24 px.
- [ ] AC4 — Les fiches de fidélité de TCK-2660 et TCK-2587 ne gagnent aucun écart à 390 × 844.

## Hors périmètre

- Les petits liens **hors carte** des pages d'accueil (17 à 20 px, de 41 à 138 px de large, relevés sur `/app` pour
  l'admin, l'agent, le locataire, le propriétaire et le prestataire) : un autre motif, qui demande son propre relevé.
- Relever le plancher à 44 px sous le pouce pour ces liens : décision à prendre à part, pas dans ce ticket.
- Le bureau (≥ 1024 px) : les tables y ont leurs propres cibles.
- **Non mesuré** : au-delà de la première page de chaque liste, les états vides, et les personas qui n'ouvrent pas ces
  listes. `/app/crm` et `/app/payments` redirigent vers `/app/customers` et l'onglet des encaissements : ils ne comptent
  pas comme des listes de plus.

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
