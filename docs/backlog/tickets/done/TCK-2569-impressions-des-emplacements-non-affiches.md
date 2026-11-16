---
id: TCK-2569
title: Un emplacement sponsorisé servi mais non affiché compte encore une impression
status: done
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

## Décision du porteur (2026-11-16)

**Option (a)** : c'est **le front qui déclare** ce qu'il affiche réellement — seuls les emplacements
effectivement rendus et visibles comptent une impression ; l'API ne compte plus une impression au
simple service d'un emplacement. Les **statistiques passées sont gardées** telles quelles, sans
réécriture rétroactive. ADR-0061 est amendé (section « Amendement du 2026-11-16 (TCK-2569) »), avec
la bascule au déploiement de ce ticket.

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

1. [x] Sur la première page avec des places réservées en tête, l'emplacement de tête non inséré ne
   compte aucune impression ; les emplacements insérés en comptent une chacun.
2. [x] Sur la suite continue, un emplacement retiré pour doublon ne compte aucune impression.
3. [x] Une régression qui recompterait à l'émission rougit un test (vérifié par ablation).
4. [x] Aucun contact ni identifiant de bien non public ne transite par l'appel de déclaration.

## Livré (2026-11-16)

- L'API ne compte plus au service : appels retirés de `PropertySearchService` et de
  `HomepageDiscoveryService`, middleware `boost.impressions` (`CountBoostImpressions`) supprimé. La
  rangée vedette de l'accueil bascule aussi : la décision vise tout emplacement servi.
- Déclaration : `POST /api/public/properties/sponsored-impressions` (`PublicSponsoredImpressionController`),
  `slugs[]` en formulaire (requête simple, sans pré-vérification CORS), 24 au plus, 204 toujours,
  filtre `public()` + vedette active, robots exclus, déduplication 30 min reprise par
  `BoostStatsRecorder::declared()`, limiteur `public-sponsored-impressions`, rangée `PUBLIC` dans
  `PlatformAnyRouteExempt` (garde 2FA), `AucunGuardTokenTest` et `IpRateLimitKeyTest`.
- Front : `components/boost/impressions-affichees.ts` — la CELLULE rendue déclare (seuil 0,5
  d'`IntersectionObserver`, une fois par bien et par document, lot à 1 s ou à `pagehide`) ; branché
  sur `CelluleDeLaListe` (`PropertiesDiscoveryPage`) et sur la rangée d'emplacements de `PropertyRow`.
- AC1 et AC2 : `PropertiesDiscoveryPage.impressions.test.tsx` (tête retirée sous places réservées,
  doublon retiré : aucune déclaration ; témoin : tête insérée déclarée) — ablation « déclarer depuis
  `sponsored` de la réponse » : 2 rouges. Le doublon est joué sur une page ; la règle entre pages est celle de
  `suiteDesPages` (`suite-des-pages.test.ts`), et une cellule non montée ne déclare rien.
- Déploiement : `docs/deploiement/actions/2026-11-16-dater-la-bascule-des-impressions-sponsorisees.md`
  (vérifier l'appel réel du navigateur, écrire la date de bascule dans ADR-0061).
- AC3 : `SponsoredImpressionsTest::test_la_recherche_qui_sert_un_emplacement_ne_compte_aucune_impression`
  — ablation « recompter dans `PropertySearchService` » : rouge.
- AC4 : seuls des slugs d'emplacements servis transitent (aucun contact) ; un bien non public rend le
  même 204 vide qu'un slug inconnu et ne compte rien
  (`test_un_bien_non_public_ou_inconnu_ne_compte_rien_et_ne_fuit_pas`) — ablation de `public()` :
  rouge. Robots : ablation de l'exclusion, 2 rouges dans `RobotImpressionsTest`.

