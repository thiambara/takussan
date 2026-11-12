---
id: TCK-2746
title: "Modifier l'absence d'un agent pendant son retrait ou l'effacement de son compte : un interblocage possible (délégation ↔ utilisateur)"
status: done
phase: P1
family: back
estimate: S
wave: 89
created: 2026-11-12
updated: 2026-11-12
depends_on: [TCK-2744]
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md#66-roledelegation-"
tags: [back, equipe, absences, concurrence, postgresql]
---

## Objectif utilisateur

L'administrateur qui modifie l'absence d'un agent pendant qu'un collègue retire cet agent de l'agence voit ses deux
gestes aboutir, l'un après l'autre. Aujourd'hui, l'un des deux peut échouer par une erreur serveur.

## Contexte

Relevé pendant TCK-2744 (d2) le 2026-11-12, lu dans le code, **non mesuré** (une contre-vérification est en cours) :

- `AgentAbsenceService::update()` verrouille la **délégation** (`RoleDelegation … lockForUpdate`), PUIS la ligne
  `users` de l'absent (« même point de sérialisation que la déclaration »).
- `AgencyMemberRemovalService::remove()` et `AccountDeletionService::anonymize()` verrouillent la ligne `users` du
  membre, PUIS révoquent ses délégations : `RoleDelegationService::revoke()` → `transition()` verrouille la délégation.

Ces deux chemins prennent les mêmes lignes dans l'ordre inverse. Si l'absence est modifiée pendant le retrait du même
agent, PostgreSQL peut tuer l'une des deux transactions (`40P01 deadlock detected`). Le cycle existait avant TCK-2744 :
le retrait prenait déjà `users` avant les délégations.

## Recommandation

Étendre l'ordre global des verrous (`takussan-api/CLAUDE.md`, piège n° 10) : **bien → visite → utilisateur →
délégation**. Dans `AgentAbsenceService::update()`, lire `replaces_user_id` sans verrou, verrouiller la ligne `users`
de l'absent, puis la délégation, et la relire avant d'en juger l'état. La déclaration (`declare`, l. 66) verrouille
déjà `users` en premier et n'insère qu'ensuite : rien à changer.

## Delta à produire

- [ ] Mesurer d'abord : une course `update` d'absence contre `remove` du même agent sur une base jetable (harnais de
      TCK-2744), avant et après
- [ ] `AgentAbsenceService::update()` : `users` avant la délégation, relue sous verrou
- [ ] Le piège n° 10 de `takussan-api/CLAUDE.md` nomme le maillon « délégation »
- [ ] Test d'ordre `DB::listen` sur `update()`, comme `OrdreDesVerrousDuRetraitTest`

## Critères d'acceptation

- [ ] AC1 — La course est mesurée avant le correctif. Si elle ne produit aucun interblocage, le ticket se ferme
      `obsolete` avec la mesure
- [ ] AC2 — Après le correctif, 0 interblocage sur la même course
- [ ] AC3 — Le test d'ordre rougit si `update()` reprend la délégation avant `users` (ablation)
- [ ] AC4 — Les règles de `update()` sont inchangées : `agent_absence.closed`, absence déjà commencée, fin avant début

## Hors périmètre

- Les autres écrivains de délégations (`RoleDelegationService::activate`, l'expiration planifiée), à relire dans le
  même esprit mais hors de ce delta

## Notes d'implémentation

**Mesure (AC1, AC2), par la contre-vérification de TCK-2744 (verif-commercial, 2026-11-12)** : s7, modifier
l'absence de X contre retirer X, **5 interblocages sur 20** (3 côté modification, 2 côté retrait) ; s8, modifier
l'absence de X contre effacer X, **14 sur 20**. Avec le correctif (l'absent lu sans verrou, `users` verrouillé, PUIS
la délégation) : **0 sur 40** (« ok | agent_absence.closed » ou « ok | ok »). Le correctif livré est celui-là, à la
lettre : `replaces_user_id` ne change jamais, sa lecture sans verrou ne peut pas désigner un autre absent.

**Correctif** : `AgentAbsenceService::update()` verrouille l'absent avant la délégation ; le reste de la méthode
(règles, délégation de couverture verrouillée ensuite, révocation, activation) ne bouge pas. L'ordre du dépôt devient
bien → visite → utilisateur → délégation (piège n° 10 de `takussan-api/CLAUDE.md`).

**Tests** : `OrdreDesVerrousDuRetraitTest::test_modifier_une_absence_verrouille_l_absent_avant_la_delegation` (AC3 :
l'ablation qui remet la délégation avant `users` le fait rougir). AC4 : `AbsenceCoverDelegationTest` (30),
`AgentAbsenceTest` (11), `TeamHandoverAbsenceTwoFactorTest` (9), `EffacementMarquesEtDelegationsTest` (3),
`CompteBloqueNonAttribuableTest` (8), joués un à un : verts.

Harnais de course hors dépôt (jamais un test) : le `course.php` de la contre-vérification de TCK-2744, scénarios s7
et s8.
