---
id: TCK-792
title: "Aucune impression sponsorisée n'est comptée à un robot déclaré"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-18--statistiques-boost-face-aux-robots-aux-rendus-serveur-et-aux-revalidations
tags: [back, front, boost, statistiques, pistes]
---

## Contexte

Réf : **P18.04** du fichier de pistes, `validé` (critère accordé : V7). `BoostStatsRecorder` comptait
une impression par bien sponsorisé servi, quel que soit l'agent : une recherche ou l'accueil sous
`Googlebot/2.1` comptait comme un visiteur. Un robot ne clique jamais (le clic exige un `POST` du
navigateur), et le taux de clic de la console baissait d'autant (ADR-0061 § 10). Le rendu serveur de
`/` et de `/properties` appelle l'API depuis Next : l'API n'y voyait que l'agent du serveur.

## Décision du porteur

aucune impression quand l'agent est reconnu comme robot, par une liste courte sans dépendance

## Delta à produire

- [x] `App\Support\Http\RobotUserAgent::is()` : une expression courte (`bot` en fin de mot, sauf
      `cubot` ; `crawl`, `spider`, `slurp`, aperçus de liens, navigateurs sans tête, clients HTTP en
      ligne de commande). Agent absent ou vide : pas un robot.
- [x] `CountBoostImpressions` écarte les impressions de la requête quand l'agent est un robot,
      comme il écarte déjà un 304.
- [x] Front : `apiFetch` transmet l'agent du visiteur (`User-Agent`) sur un appel serveur non
      partagé, comme il transmet déjà son IP (TCK-598). Un appel partagé ne lit rien.

## Critères d'acceptation

- [x] AC1 — `GET /api/public/properties/search` sous Googlebot sert l'emplacement et ne compte
      aucune impression ; un navigateur, ensuite, en compte une.
- [x] AC2 — Même chose pour `GET /api/public/properties/discovery` sous bingbot.
- [x] AC3 — Aucun navigateur courant n'est reconnu robot, téléphones Cubot compris.
- [x] AC4 — La recherche et l'accueil rendus côté serveur transmettent l'agent du visiteur ; un appel
      partagé n'en transmet aucun.

## Hors périmètre

- Les clics : ils exigent un `POST` du navigateur, qu'un robot n'envoie pas.
- Le comptage depuis le navigateur après affichage (l'autre option de la piste, non retenue).
- Un robot qui se déguise en navigateur : la liste ne reconnaît que ceux qui se déclarent.

## Hypothèses (mode sans humain)

- Le doute laisse compter : exclure un vrai visiteur coûte plus que compter un faux. D'où l'exception
  `cubot` (marque de téléphones Android dont l'agent contient « CUBOT ») et l'absence de `WhatsApp`,
  dont l'agent ne distingue pas sûrement l'aperçu de lien d'un navigateur intégré.
- Transmettre le `User-Agent` du visiteur ne change rien d'autre côté API : il n'est lu ailleurs que
  pour journaliser, par des appels qui ne passent pas par `apiFetch`.

## Notes d'implémentation

- Ablation API : la condition retirée du middleware → `RobotImpressionsTest` 2 rouges sur 2 ;
  l'exception `(?<!cu)` retirée → `RobotUserAgentTest` 1 rouge (Cubot) ; remises → verts.
- Ablation front : l'en-tête non posé → `api.agent-du-visiteur.test.ts` 2 rouges sur 4 ; remis → 4 verts.
