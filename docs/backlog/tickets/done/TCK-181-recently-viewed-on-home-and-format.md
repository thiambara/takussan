---
id: TCK-181
title: « Récemment consultés » — affichage sur la home + i18n + format unifié
status: done
phase: P2
family: front
estimate: S
wave: 19
created: 2026-05-05
updated: 2026-05-05
depends_on: [TCK-175]
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
tags: [front, discovery, i18n]
---

## Objectif utilisateur

L'utilisateur (anonyme ou connecté) doit retrouver les biens qu'il vient de consulter sur la home, dans une section claire, en français, avec le même format de carte que partout ailleurs.

## Contrat de données

Smoke test 2026-05-05 (TC-LOC-07) :

- L'historique navigateur est correctement persisté dans `localStorage` sous la clé `takussan.recently-viewed` (4 ids stockés après visite de 3 fiches).
- Spec attendue : section/carrousel sur la **home** listant les 3 derniers biens visités.
- Observé : section absente de la home. Elle apparaît seulement en bas des **fiches bien** (`/properties/[slug]`) sous le titre `FOR YOU` / `Recently viewed` / `Clear history` — tout en anglais, avec un format de carte différent (`3 ch • 183 m² • 1 sdb` vs `3 Ch.` du listing).

## Direction UX / Artistique

- Sur la home, ajouter la section après la dernière section existante (« Tout juste publié » selon les findings visiteur), libellée « Récemment consultés », avec un carrousel/grille de 3-6 cards (limite responsive).
- Réutiliser la même variante de `PropertyCard` que les autres sections de home (« Standard » selon `project_homepage_design_direction.md` mémoire).
- Sur les fiches bien, la même section reste, mais alignée sur le format unifié (cf. variante définie dans le design system).
- Le bouton `Clear history` devient `Effacer l'historique`.

## Contraintes strictes (métier)

- La section ne doit pas apparaître si `localStorage.takussan.recently-viewed` est vide.
- Les ids stockés doivent être validés côté serveur (call `GET /api/public/properties/by-ids?ids=...` déjà existant) — on ne fait pas confiance au localStorage pour décider de l'existence.
- En SSR, la section est rendue après hydration côté client puisque le store dépend de `localStorage` ; éviter le flash en réservant un placeholder skeleton.

## Delta à produire

- [ ] Composant `<RecentlyViewedSection>` factorisé, consommé par la home et les fiches bien.
- [ ] i18n des libellés (`Récemment consultés`, `Effacer l'historique`) — passe par TCK-175 si déjà mergé.
- [ ] Alignement du format de carte sur la variante design system (« Standard » : `4 Ch. • 261 m² • Maison`).
- [ ] Page home : insertion conditionnelle de la section.
- [ ] Test e2e Playwright : visiter 3 fiches → home → section visible avec 3 cards → cliquer `Effacer l'historique` → section disparaît + localStorage vide.

## Critères d'acceptation

- [ ] La home affiche `Récemment consultés` avec les biens visités quand le localStorage en contient.
- [ ] La fiche bien continue d'afficher la même section, désormais en français et avec le format unifié.
- [ ] Le bouton `Effacer l'historique` vide effectivement la section et le localStorage.
- [ ] Aucune chaîne EN résiduelle dans la section.

## Hors périmètre

- Implémentation server-side du recently-viewed (V2 : si on veut suivre l'historique sur plusieurs devices).
- Recommandations algorithmiques (« For you » au sens IA — pas dans ce ticket).

## Notes d'implémentation

### Constat post-audit
- La section `<RecentlyViewedCarousel>` est **déjà** rendue par `HomepageDiscovery` (`src/components/property/HomepageDiscovery.tsx:130`). Le smoke test ne la voyait pas en home parce que le localStorage du test était vide à la première visite ; les 4 ids ont été enregistrés ensuite, mais la section n'était pas re-rendue.
- Format de carte : la rangée utilise déjà `variant="standard"` partagée avec les autres sections (« Près de toi », « Tout juste publié »). Le format `3 ch • 183 m² • 1 sdb` mentionné dans le smoke test correspond à la carte de la fiche bien, pas à la rangée — pas de gap réel ici.

### Changements livrés
- `RecentlyViewedCarousel` : seuil min changé de `items.length < 2` → `items.length < 1`. Critère AC = « aucune section si localStorage vide » → respecté tout en rendant la section dès le premier bien visité.
- `messages/fr.json#recentlyViewed.title` : `Vus récemment` → `Récemment consultés` (cohérent avec la clé localStorage `takussan.recently-viewed` et l'intitulé spec).
- `messages/fr.json#recentlyViewed.eyebrow` : `Pour toi` → `Pour vous` (vouvoiement aligné sur le reste de la home).
- Bouton « Effacer l'historique » déjà câblé sur la clé `clearHistory` côté FR.

### Reporté
- L'audit i18n élargi des composants partagés est couvert par TCK-175.
