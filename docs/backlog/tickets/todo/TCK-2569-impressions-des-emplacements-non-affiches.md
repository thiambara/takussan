---
id: TCK-2569
title: Un emplacement sponsorisé servi mais non affiché compte encore une impression
status: todo
phase: P1
family: back
estimate: M
wave: 85
created: 2026-11-09
updated: 2026-11-16
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  models: []
tags: [back, front, boost, mesure, audit-ux]
---

## Re-vérification du 2026-11-16 (sur dev @ 9112194ec)

**Verdict : bloqué sur une décision du porteur — défaut toujours vrai.** Rien n'a été livré
(`git log --grep=TCK-2569` : la création seule).

- L'API compte à l'émission : `takussan-api/app/Http/Middleware/CountBoostImpressions.php`
  (`deferImpressions()` puis `BoostStatsRecorder::commitImpressions(VisitorFingerprint::of(…))`, toute
  réponse < 400 hors 304 et robots), branché sur la recherche publique (`routes/api/public.php:52-60`).
- Le front retire toujours : `takussan-web/src/components/property/liste/emplacements.ts:82-90`
  (`suiteDesPages`), appelé par `PropertiesDiscoveryPage.tsx:310-315`.
- L'écart est borné : la déduplication par visiteur et par bien sur 30 min (TCK-708) fait qu'un doublon
  d'un bien déjà compté dans la fenêtre ne recompte pas.
- Reste : amendement d'ADR-0061, puis l'option retenue, et un test qui rougit si l'on recompte à
  l'émission (ablation).

**Décision attendue du porteur** : **(a)** le front déclare les emplacements insérés (route publique
groupée, non bloquante, robots exclus ; `BoostStatsRecorder` quitte la recherche), ou **(b)** l'API
cesse de servir l'emplacement de tête quand des places réservées ouvrent la page 1 (cas 1 seulement :
le doublon entre pages reste au front) ? Et que deviennent les statistiques passées ?

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
(`docs/features.md`, contrat de `sponsored` ; code : `CountBoostImpressions` +
`BoostStatsRecorder`, dédupliqué par visiteur et par bien sur 30 min depuis TCK-708). Un emplacement servi puis retiré compte donc une
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
