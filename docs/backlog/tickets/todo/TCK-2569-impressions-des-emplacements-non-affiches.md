---
id: TCK-2569
title: Un emplacement sponsorisé servi mais non affiché compte encore une impression
status: todo
phase: P1
family: back
estimate: M
wave: 85
created: 2026-11-09
updated: 2026-11-09
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  models: []
tags: [back, front, boost, mesure, audit-ux]
---

## Objectif utilisateur

Le propriétaire ou l'agence qui paie une mise en avant lit, dans ses statistiques, le nombre de fois
où son bien a **réellement été montré** comme sponsorisé, pas le nombre de fois où l'API l'a proposé.

## Constat

Depuis TCK-2500 (amendement d'ADR-0061 du 2026-11-09, § « À l'affichage »), le front n'insère pas
tous les emplacements que l'API sert :

- sur la première page, quand des places réservées « En vedette » ouvrent la liste, l'emplacement
  de tête (`position` 0) n'est pas inséré ;
- quand « Voir N biens de plus » met des pages bout à bout, un emplacement dont le bien est déjà
  affiché plus haut est retiré.

L'impression, elle, se compte **côté API, au moment où l'emplacement est servi**
(`docs/features.md`, contrat de `sponsored`). Un emplacement servi puis retiré compte donc une
impression qui n'a pas eu lieu. L'écart est connu et écrit dans l'ADR ; il n'est pas corrigé.

## Delta attendu

Que le compte des impressions porte sur ce que l'écran a affiché. La forme est à décider avant
l'implémentation (amendement d'ADR-0061) : le front déclare les emplacements effectivement
insérés (un appel groupé, sans bloquer l'affichage), ou l'API cesse de servir ce que le front
retirerait (ce qui suppose qu'elle connaisse les places réservées et la suite continue).

## Critères d'acceptation

1. Sur la première page avec des places réservées en tête, l'emplacement de tête non inséré ne
   compte aucune impression ; les emplacements insérés en comptent une chacun.
2. Sur la suite continue, un emplacement retiré pour doublon ne compte aucune impression.
3. Une régression qui recompterait à l'émission rougit un test (vérifié par ablation).
4. Aucun contact ni identifiant de bien non public ne transite par l'appel de déclaration.
