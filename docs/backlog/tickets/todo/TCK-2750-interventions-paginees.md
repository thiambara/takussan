---
id: TCK-2750
title: "« Interventions » se pagine — les factures des prestataires au-delà des 20 premières deviennent visibles"
status: todo
phase: P1
family: front
estimate: S
wave: 90
created: 2026-11-12
updated: 2026-11-12
depends_on: [TCK-2677]
blocks: []
spec_refs:
  features:
    - "docs/features.md"
tags: [front, finances, argent, pagination, suite-de-tck-2677]
---

## Objectif utilisateur

L'administrateur voit TOUTES les factures des prestataires dans le registre « Interventions » d'« Argent ».

## Constat (TCK-2677, relevé du 2026-11-12)

`useServiceProviderBills` lit `per_page=20` sans page suivante : la base de démo porte 37 factures, 17 ne se
voient pas — avant comme après TCK-2677 (défaut hérité de l'ancien onglet `bills`).

## Delta

La même pagination que les autres registres d'« Argent ».

## Critères d'acceptation

- [x] AC1 — avec 37 factures, les 37 sont atteignables depuis le registre (au bureau et au téléphone).
  Preuve : `ServiceProviderBillsTable.tck-2750.test.tsx` (page 1 : 20 lignes, « Suivant » écrit `?page=2` ; page 2 : les 17 dernières) ;
  relevé sur la base de démo (agence 1, 37 factures) le 2026-11-14 : à 390, « Page 1 sur 2 · 37 résultats » et « Suivant » sous la table ;
  `?tab=interventions&page=2` rend #25… à 390 et à 1280, quand la page 1 finit sur #26.
- [x] AC2 — le compte affiché est `meta.total`, pas la longueur de la page.
  Preuve : le même test (« 37 résultats » sur une page de 20, « 20 résultats » absent) ; ablation : sans la pagination, 4 tests sur 5 rougissent.
- [x] AC3 — changer de filtre revient à la première page.
  Preuve : `interventions-paginees.tck-2750.test.tsx` (changer d'onglet depuis `page=2` réécrit l'adresse sans `page`, le mois gardé) ;
  le prestataire pagine par `?factures_page=`, que la liste voisine ne lit pas (`ServiceProviderBillsTable.tck-2750.test.tsx`).

## Notes d'implémentation (TCK-2750)

- **L'agence** : la page et la densité vivent dans l'adresse (`?page=`, `?per_page=` à 10, 20 ou 50), avec
  `PropertyPagination`, comme « Factures » et « Reversements ». Changer d'onglet ou de mois réécrit l'adresse sans `page`.
- **Le prestataire** : la page vit dans `?factures_page=` (décision de la session, 2026-11-14). Sur `/app/maintenance`,
  son registre se pose sous la liste des interventions, qui lit déjà `?page=` : avec son propre paramètre, chacune
  pagine seule, et la page survit au retour arrière et au rechargement.
- Non traité, comme pour les registres voisins : une `?page=` au-delà de la dernière rend l'état vide.
