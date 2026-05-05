---
id: TCK-164
title: "Home publique — cohérence sections, cards et format adresse"
status: review
phase: P2
family: front
estimate: M
created: 2026-05-05
updated: 2026-05-05
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
    - docs/features.md#11-gestion-des-biens
tags: [front, bug, p2, smoke-test-2026-05-05, home, cards, visiteur-anonyme]
---

## Objectif utilisateur

Un visiteur arrivant sur la home perçoit les 4 sections (Près de toi / Pour ton prochain logement / Sélection de la semaine / Tout juste publié) comme distinctes : pas de doublons croisés, format de carte cohérent d'une section à l'autre, et adresse correctement composée sur chaque carte.

## Contrat de données

Aucune nouvelle API. Les sections appellent déjà :
- `/api/public/properties/search?city=Dakar` (Près de toi)
- `/api/public/properties/search?contract_type=rent` (Pour ton prochain logement)
- `/api/public/properties?featured=true` (Sélection de la semaine)
- `/api/public/properties?sort=created_desc` (Tout juste publié)

À régler côté front : déduplication entre sections + uniformisation de la composition `Address.to_display`.

## Direction UX / Artistique

- Référence : memory `project_homepage_design_direction.md` qui mentionne 4 variantes de cartes (Standard / Listing / Cover / Compact). Choisir une convention claire par section et la documenter dans le composant.
- Format adresse uniforme : `Quartier, Ville` (ne pas afficher `Région` quand elle est identique à `Ville` — ne plus produire `"Amitié, Dakar, Dakar, SN"`).
- Conserver la palette / typographie posée par TCK-129 (Ancrage Local Contemporain).

## Contraintes strictes (métier)

- Ne pas modifier le contrat de l'API publique.
- La déduplication se fait sur `id` côté client uniquement (pas de logique métier déplacée).
- Conserver les performances : éviter de fetcher plus de biens que nécessaire pour dédupliquer (over-fetch contrôlé : par ex. demander +N et trim après dédup).

## Delta à produire

- [ ] Helper de déduplication inter-sections : un bien apparu dans la section précédente est exclu de la suivante (ordre d'affichage = ordre d'évaluation).
- [ ] Choisir un mapping section → variante de carte cohérent (ex. Standard partout, sauf "Sélection de la semaine" en Cover) et l'appliquer.
- [ ] Helper `formatAddressShort(address, { withRegion: false })` qui produit `Quartier, Ville` et omet la région si égale à la ville. À brancher partout (cards home + listing + fiche bien banner et section Emplacement).
- [ ] Tests visuels (snapshot ou screenshot) sur la home pour figer le rendu.

## Critères d'acceptation

- [ ] Sur la home, aucun bien n'apparaît dans deux sections différentes simultanément.
- [ ] Les cards d'une même section utilisent toutes la même variante (Standard / Cover / Compact).
- [ ] Sur la fiche `/properties/maison-de-standing-a-amitie-…`, l'adresse affichée est `Amitié, Dakar` (et non `Amitié, Dakar, Dakar, SN`).
- [ ] Aucune régression sur le listing `/properties` (le format adresse y est aussi corrigé si concerné).

## Hors périmètre

- Refonte complète des variantes de cartes (TCK-129 a déjà posé le design system).
- Personnalisation de la home selon profil connecté (visiteur anonyme uniquement ici).
- Modification du modèle `Address` côté backend.

## Notes d'implémentation

- Variantes par section : déjà conformes au design system TCK-129
  (Standard / Listing / Cover / Compact). Aucune modif visuelle requise.
- Déduplication inter-sections : nouveau helper `lib/dedupeBy.ts`
  (`dedupeAcross`, `excludeSeen`) — pure function, dédup sur `id`,
  ordre = ordre d'évaluation des rangées. Branché dans
  `HomepageDiscovery` avec un sur-échantillonnage modéré (rent +20 %,
  featured +20 %, latest +40 %) pour éviter qu'un retrait ne laisse une
  rangée vide.
- Adresse courte : nouveau `lib/format/address.ts#formatAddressShort`
  qui produit `Quartier, Ville` et n'ajoute la région/le pays qu'en
  opt-in (option `withRegion` filtre déjà la région == ville). Tests
  dans `lib/__tests__/address.test.ts`.
- `PropertyHeader` (banner fiche bien) et `PropertyLocationMap`
  (section Emplacement) consomment maintenant le helper avec fallback
  sur l'ancien `location.full` côté backend si tout part en vrille.
- Cards listing/popover utilisaient déjà `[quarter, city]` — pas de
  changement nécessaire (vérifié grep).
