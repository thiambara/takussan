---
id: TCK-658
title: "Les encres atténuées de quatre parcours tiennent 4,5:1, sans opacité"
status: done
phase: P0
family: bug
estimate: S
wave: null
created: 2026-10-15
updated: 2026-10-15
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-7--accessibilité-du-front-wcag-22-aa
tags: [front, accessibilite, contraste, pistes]
---

## Contexte

Réf : **P07.02** du fichier de pistes (classement A4 : chaque encre revient sur son jeton
existant, sans texte ni choix de produit ; la garde relève d'A5). Plusieurs textes secondaires
sont « atténués » par une opacité posée sur un jeton qui tient déjà le seuil seul, et passent
ainsi sous 4,5:1 (WCAG 2.2 §1.4.3) :

- `text-warning/80` sur `bg-warning/10` (bannière de charte d'agence, bannière de résiliation
  anticipée) : 3,53 à 3,65:1 ;
- `text-muted-foreground/70` (préfixes « Propriétaire » et « Responsable » de la liste des biens,
  mentions « facultatif » de la demande de visite) : 2,95 à 3,03:1 ;
- `text-muted-foreground/80` (horaires de la grille de disponibilités) : 3,70:1 ;
- `text-muted-foreground/50` (jours hors du mois du calendrier) : 2,11:1.

## Objectif

Ces textes tiennent 4,5:1 dans les deux thèmes, et une encre de texte translucide neuve ne
s'ajoute plus sans qu'un test le voie.

## Delta à produire

- [x] Retirer l'opacité des sept sites : `BrandingBanner.tsx`, `EarlyTerminationBanner.tsx`,
      `ProprietaireEtResponsable.tsx` (×2), `PropertyVisitDialog.tsx` (×2), `AvailabilityGrid.tsx`,
      et la classe `outside` de `ui/calendar.tsx`.
- [x] Test : `src/test/__tests__/encre-sans-alpha.contraste.test.ts`, qui mesure chaque site sur
      son fond dans les deux thèmes, et tient un cliquet à deux sens des encres de texte
      translucides qui restent dans `src/`.

## Critères d'acceptation

- [x] AC1 — Chaque site, encre sur fond ≥ 4,5:1 en clair et en sombre (bannières sur
      `bg-warning/10` posé sur `--card` et `--background` ; le reste sur `--card`,
      `--background`, et `--popover` pour le dialogue et le calendrier).
- [x] AC2 — Le relevé des encres `text-<jeton>/NN` de `src/` (hors tests, hors
      `text-primary-foreground`) est égal, fichier par fichier, à celui que le test consigne.

## Hypothèses (mode sans humain)

- Les jours hors du mois passent en `text-muted-foreground` plein : ils restent distincts des
  jours du mois, qui sont en `text-foreground`. Les jours désactivés (`/40`) ne bougent pas :
  §1.4.3 exempte un composant inactif.
- Les préfixes de `ProprietaireEtResponsable` prennent la même encre que leur ligne ; le nom reste
  distinct par sa graisse et `text-foreground`.

## Hors périmètre

- Les autres encres translucides consignées dans le cliquet (onglets, étoiles des avis — P07.04 —,
  `MessagesPage`, `CardMeta`, `LeasesList`…), non mesurées ici.
- Le bouton de `BrandingBanner.tsx` : `text-warning` sur `hover:bg-warning/15` rend 4,23 à 4,41:1
  au survol en clair (relevé par `couples-de-contraste.ts`, non corrigé).

## Notes d'implémentation

- Rouge avant correctif : 16 échecs sur 17 (15 sites × thèmes, de 2,11 à 4,46:1, plus le relevé
  qui comptait 17 fichiers au lieu de 12). Seul vert : la grille de disponibilités en sombre.
- Ablation (les six fichiers remis à l'état d'avant, test gardé) : 16 rouges ; correctif remis :
  17 verts.
- Le lecteur statique de `couples-de-contraste.ts` ne voit ni les préfixes de
  `ProprietaireEtResponsable` ni la classe `outside` du calendrier (chaîne dans un `cn()`) : c'est
  pourquoi le test retrouve chaque site par une ancre de texte.
