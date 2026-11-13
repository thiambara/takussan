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

- [x] Impayés : la zone de frappe du nom du locataire dans la carte du téléphone.
  - Preuve (2026-11-13) : `lien-etire.tck-2792` (impayés) vert ; ablations : lien sans `after:`, tête sans `relative`, case sans `relative z-10` → rouges.
- [x] Visites : la zone de frappe du titre dans les cartes « du jour » et « demande ».
  - Preuve (2026-11-13) : `lien-etire.tck-2792` (visites) vert ; ablations : tête « du jour » sans `relative`, lien « demande » sans `after:` → rouges.
- [x] Ma journée : la zone de frappe du titre de la carte de visite.
  - Preuve (2026-11-13) : `lien-etire.tck-2792` (journée) vert ; ablations : tête sans `relative`, zone posée sur la carte entière (gestes recouverts) → rouges.
- [x] Tests : un par carte, qui échoue si la zone retombe à la boîte du texte.
  - Preuve (2026-11-13) : trois fichiers `lien-etire.tck-2792.test.tsx` et l'assertion partagée `src/test/lien-etire.ts` ; 7 ablations, 7 rouges, fichiers rendus sur md5.

## Critères d'acceptation

- [x] AC1 — À 360 px, pour chacune des quatre cartes du tableau, la zone de frappe du lien seul mesure au moins 24 px de haut
  et de large. La zone de frappe est la boîte du lien, ou la boîte que couvre son pseudo-élément absolu (le lien étiré
  compte). `document.elementFromPoint` rend le lien (ou un de ses descendants) aux quatre coins de cette zone, à 1 px du bord.
  - Preuve (2026-11-13) : à 360, admin et agent : impayés 16 liens étirés, région ≥ 43 × 294 ; visites « du jour » 5 (≥ 91,3), « demande » 4 (≥ 98) ; Ma journée 2 (≥ 89) ; `elementFromPoint` rend le lien aux quatre coins de chaque région (0 échec). Sur HEAD, le même relevé donnait 18,8 px, non étirés.
- [x] AC2 — Dans ces mêmes cartes, chaque geste rend toujours son propre bouton ou lien à son centre (`elementFromPoint`) et
  mesure toujours 44 px de haut.
  - Preuve (2026-11-13) : mêmes relevés : chaque geste rend lui-même à son centre (0 échec sur 32 + 23 + 6), tous à 44 px.
- [x] AC3 — Un relevé à 360 px des listes du tableau et de celles déjà conformes (baux, `/app/customers`, maintenance,
  bailleurs, prestataires, pipeline) ne trouve aucun lien seul de carte dont la zone de frappe fasse moins de 24 px.
  - Preuve (2026-11-13) : baux (`carte-d-attente` 40 px, `ligne-de-bail` 96), `/app/customers` (95), maintenance (186), bailleurs (105) étirés ; prestataires et pipeline sans lien seul de carte sous 24 px. Aux coins du bas, maintenance tombe sur un second lien étiré vers la même fiche, et les bailleurs sur une `section` : non modifiés ici, région au-dessus de 24 px.
- [x] AC4 — Les fiches de fidélité de TCK-2660 et TCK-2587 ne gagnent aucun écart à 390 × 844.
  - Preuve (2026-11-13) : avant (HEAD) / après, relevés `fidelite releve` à 390 × 844 à deux minutes d'écart puis `fidelite compare` : impayés 59 conformes · 0 écart · 0 % pixels ; visites 60 · 0 · 0 % ; Ma journée 51 · 0 · 0 %. Le correctif ne change aucun pixel au repos : aucune fiche ne peut gagner d'écart.

## Hors périmètre

- Les petits liens **hors carte** des pages d'accueil (17 à 20 px, de 41 à 138 px de large, relevés sur `/app` pour
  l'admin, l'agent, le locataire, le propriétaire et le prestataire) : un autre motif, qui demande son propre relevé.
- Relever le plancher à 44 px sous le pouce pour ces liens : décision à prendre à part, pas dans ce ticket.
- Le bureau (≥ 1024 px) : les tables y ont leurs propres cibles.
- **Non mesuré** : au-delà de la première page de chaque liste, les états vides, et les personas qui n'ouvrent pas ces
  listes. `/app/crm` et `/app/payments` redirigent vers `/app/customers` et l'onglet des encaissements : ils ne comptent
  pas comme des listes de plus.

## Notes d'implémentation

- Patron recopié des cartes de baux et de clients : la tête de la carte en `relative`, le lien en
  `after:absolute after:inset-0`, l'anneau de focus devenu `focus-visible:underline` (l'anneau d'un lien étiré ne
  cernerait que le texte). Sur la carte d'impayé, la case de la file de relance (TCK-2682), dans la tête, passe en
  `relative z-10` au-dessus de la zone ; les gestes restent sous la tête, hors de la zone.
- `CarteProchaine` (visites) n'est pas touchée : son titre en `text-titre-court` dépasse 24 px, et la photo, au-dessus,
  est déjà un lien de 128 px vers la même fiche.
- La zone d'un lien étiré est la boîte de REMPLISSAGE du bloc positionné : mesurer la boîte de bordure fait tomber les
  coins sur la bordure d'une carte (relevé du `ligne-de-bail`, corrigé dans la sonde).
- Mesures et journaux : scratchpad de back-3, `verif2660/` (`region.mjs`, `region2.log`, `ab/`).
