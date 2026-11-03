---
id: TCK-1908
title: "Le motif d'un changement de prix est traduit sur la fiche publique, plus jamais en code brut"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  models:
    - "docs/models-spec.md#26-propertypricehistory-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-196--cas-denum-déclarés-que-rien-nécrit-mais-que-des-filtres-compteurs-transitions-ou-libellés-lisent"
tags: [web, i18n, pistes]
---

## Contexte

Réf : **P196.02** du fichier de pistes, `validé (délégué)` (V7 accordé).

La fiche publique d'un bien rend le motif d'un changement de prix tel que l'API l'émet
(`PropertyPriceHistory.tsx:65`, `{item.reason}`) : sur une base seedée
(`PropertyPriceHistorySeeder.php:41`, 584 lignes avec motif sur la base de dev), le visiteur lit
`market_adjustment`. Les libellés `property.priceChangeReasons.*` existent déjà en `fr`, `en` et
`wo`, et la liste de l'équipe (`PropertyPriceHistoryList.tsx`) les lit.

## Décision du porteur (déléguée)

traduire le motif sur la fiche publique (`PropertyPriceHistory.tsx:65`) par les clés existantes `property.priceChangeReasons.*`, sur le modèle de `PropertyPriceHistoryList.tsx` (ensemble des codes nommés, code brut en repli pour un code inconnu), sans clé neuve ; garde : un test de `PropertyPriceHistory` qui rend `market_adjustment` et refuse le code brut à l'écran ; reste : recevoir le motif à l'édition du prix, ou retirer son affichage et marquer `PriceChangeReason` réservé, au porteur

## Reste à faire

recevoir le motif à l'édition du prix, ou retirer son affichage et marquer `PriceChangeReason` réservé, au porteur

## Objectif

Le visiteur de la fiche publique lit le motif d'un changement de prix dans sa langue.

## Delta à produire

- [x] L'ensemble des codes nommés de `PriceChangeReason` passe dans `@/lib/enums/property`
  (`priceChangeReasonValues`, `isNamedPriceChangeReason`), module sans dépendance, lu par la liste
  de l'équipe et par la fiche publique.
- [x] `PropertyPriceHistory` traduit le motif par `property.priceChangeReasons.*`, code brut en
  repli pour un code inconnu. Aucune clé neuve.

## Critères d'acceptation

- [x] AC1 — Rendu avec `market_adjustment` en `fr`, la fiche affiche « Ajustement au marché » et
  jamais le code.
- [x] AC2 — En `en`, le motif suit la langue (`negotiation` → « Negotiation »).
- [x] AC3 — Un code inconnu reste affiché tel quel.

## Hors périmètre

- Recevoir le motif à l'édition du prix, ou retirer son affichage : au porteur (voir « Reste à
  faire »).

## Notes d'implémentation

- **Pourquoi un module partagé** : l'ensemble vivait dans `PropertyPriceHistoryList.tsx`, marqué
  `'use client'` ; `PropertyPriceHistory.tsx` ne l'est pas, et une valeur importée d'un module
  client depuis un composant serveur arrive en référence client, pas en tableau.
- **Ablation** : correctif de `PropertyPriceHistory.tsx` retiré → AC1 et AC2 rouges (le code brut
  s'affiche, libellé introuvable), AC3 vert ; remis → 3 tests verts
  (`PropertyPriceHistory.motif.tck-1908.test.tsx`).
