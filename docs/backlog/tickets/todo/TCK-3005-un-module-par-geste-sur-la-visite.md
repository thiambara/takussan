---
id: TCK-3005
title: "Un module porte chaque geste de la visite (créer, confirmer, clore, absent, annuler) sous verrou ; la fiche lit ses gestes, état compris"
status: todo
phase: P2
family: full
estimate: M
wave: 99
created: 2026-11-27
updated: 2026-11-27
depends_on: []
blocks: [TCK-3006]
spec_refs:
  features: ["docs/features.md#13-réservations-courte-durée--visites"]
  models: []
tags: [back, front, visites, gestes, architecture, adr-0139]
---

## Objectif utilisateur

L'agent qui clôt une visite ou la déclare « absent » obtient le même résultat, quel que soit l'écran ou le lien d'action, même si un collègue agit sur la même visite au même moment.

## Contrat de données

Relevé du 2026-11-27 (`dev` 4e3a929f7), vérifié :

- `PropertyVisitController::complete` (~:720-745) et `noShow` (~:755-775) jugent le statut sur le modèle lié à la route et l'écrivent sans verrou ; `cancel` et `confirm` passent par `VisitSchedulingService::cancelOrFail` / `confirmOrFail`, sous `lockForUpdate`.
- La création est écrite trois fois (`PropertyVisitController` ~:464, `Public/PublicPropertyController` ~:951, `VisitSchedulingService` ~:529).
- `Services/Pont/GestesParLien.php:124` recopie la précondition `status === Scheduled`.
- `PropertyVisitResource` sert `abilities` (policy seule : « le statut n'y entre pas », ~:242) ; `VisitDetail.tsx:119-141` refait le statut, `canClaim` et `isManager` restent sur `user.roles`.

## Contraintes strictes (métier)

- ADR-0139 : `abilities` de la visite = policy **et** état ; le front ne recalcule ni capacité ni statut pour décider d'un geste.
- Chaque transition rejuge la précondition sur la ligne relue **sous verrou** (patron `cancelOrFail`) ; l'avis (SMS, notification) part après la transaction.
- Les codes d'erreur existants (`visit.cannot_complete`, `visit.cannot_mark_no_show`, `visit.staff_only`, …) et les réponses HTTP ne changent pas.
- Le contact du client (`ContactGestureService::touchCustomer`) et les avis existants sont conservés.

## Delta à produire

- [ ] Service : `App\Services\Visit\GestesDeLaVisite` — `peutConfirmer`, `peutClore`, `peutDeclarerAbsent`, `peutAnnuler`, … (`User`, `PropertyVisit`) et les transitions correspondantes sous verrou ; reprend `ConfirmerUneVisite` et les transitions de `VisitSchedulingService`
- [ ] `PropertyVisitController::complete`, `noShow`, `confirm`, `cancel` délèguent au module ; la création n'a plus qu'un chemin
- [ ] `GestesParLien` et `PropertyVisitResource` (`abilities`, `can_confirm`) appellent les `peut*` du module
- [ ] Front : la fiche visite décide de ses gestes par une fonction pure sur `abilities` (patron `components/leases/fiche/gestes.ts`) ; plus de `user.roles` ni de statut pour décider ; aucun geste tant qu'`abilities` manque
- [ ] Tests API : `tests/Feature/Visits/GestesDeLaVisiteTest.php` (chaque geste : vrai et faux, dont un statut déjà changé sous la ligne relue) ; tests front de la fonction pure

## Critères d'acceptation

- [ ] AC1 — `complete` et `noShow` relisent la visite sous verrou : un test où la visite passe `cancelled` entre la liaison de route et l'écriture rend 422 et n'écrit rien.
- [ ] AC2 — `grep -n "VisitStatus::" app/Http/Controllers/Api/PropertyVisitController.php` ne montre plus d'écriture de statut.
- [ ] AC3 — `abilities.complete` / `no_show` / `confirm` / `cancel` d'une visite valent faux quand le statut ne le permet plus (test API).
- [ ] AC4 — La fiche visite n'affiche aucun geste qu'`abilities` refuse (test de la fonction pure + un test de rendu).

## Hors périmètre

- La règle « qui peut lire » une visite (TCK-3006).

## Notes d'implémentation
