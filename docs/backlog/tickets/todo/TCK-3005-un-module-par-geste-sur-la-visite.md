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

- [x] Service : `App\Services\Visit\GestesDeLaVisite` — `peutConfirmer`, `peutClore`, `peutDeclarerAbsent`, `peutAnnuler`, … (`User`, `PropertyVisit`) et les transitions correspondantes sous verrou ; reprend `ConfirmerUneVisite` et les transitions de `VisitSchedulingService`
- [x] `PropertyVisitController::complete`, `noShow`, `confirm`, `cancel` délèguent au module ; la création n'a plus qu'un chemin
- [x] `GestesParLien` et `PropertyVisitResource` (`abilities`, `can_confirm`) appellent les `peut*` du module
- [x] Front : la fiche visite décide de ses gestes par une fonction pure sur `abilities` (patron `components/leases/fiche/gestes.ts`) ; plus de `user.roles` ni de statut pour décider ; aucun geste tant qu'`abilities` manque
- [x] Tests API : `tests/Feature/Visits/GestesDeLaVisiteTest.php` (chaque geste : vrai et faux, dont un statut déjà changé sous la ligne relue) ; tests front de la fonction pure

## Critères d'acceptation

- [x] AC1 — `complete` et `noShow` relisent la visite sous verrou : un test où la visite passe `cancelled` entre la liaison de route et l'écriture rend 422 et n'écrit rien.
- [x] AC2 — `grep -n "VisitStatus::" app/Http/Controllers/Api/PropertyVisitController.php` ne montre plus d'écriture de statut.
- [x] AC3 — `abilities.complete` / `no_show` / `confirm` / `cancel` d'une visite valent faux quand le statut ne le permet plus (test API).
- [x] AC4 — La fiche visite n'affiche aucun geste qu'`abilities` refuse (test de la fonction pure + un test de rendu).

## Hors périmètre

- La règle « qui peut lire » une visite (TCK-3006).

## Notes d'implémentation

Relevé du 2026-11-27 re-mesuré sur l'arbre de la branche : `complete` et `noShow` jugeaient bien le statut sur le
modèle lié à la route, sans verrou. La création était écrite DEUX fois (la demande authentifiée de
`PropertyVisitController::store` et la demande publique), plus la planification (`createConfirmedOrFail`) : la
troisième ligne citée (`VisitSchedulingService` ~:529) est cette planification.

- **Module** : `App\Services\Visit\GestesDeLaVisite`. Gardes statiques `peutConfirmer`, `peutClore`,
  `peutDeclarerAbsent`, `peutAnnuler`, `peutDeplacer`, `peutPrendreEnCharge`, `peutAttribuer`, `peutProposerUnCreneau`
  (policy ET état). Gestes `demander`, `planifier`, `confirmer`, `proposerUnCreneau` (le report du visiteur),
  `clore`, `declarerAbsent`, `annuler`. Toutes leurs écritures se font sous verrou (bien, puis visite), et celles
  de la confirmation et de l'annulation sont PRIVÉES : il n'existe pas de second chemin d'écriture sans garde
  d'acteur. `ConfirmerUneVisite` est supprimé. `confirmOrFail`, `cancelOrFail`, `rescheduleOrFail`, `createOrFail`
  et `createConfirmedOrFail` ont quitté `VisitSchedulingService`, qui ne garde que les invariants (chevauchement,
  quota, agent libre, ordre des verrous) et le calcul des créneaux.
- **Une création** : `demander` sert les deux portes de la demande. Deux écarts restent délibérément à l'appelant :
  l'agent (le contact principal pour la porte publique, personne pour la console) et la durée par défaut (30 min
  pour la porte publique). Ils n'ont pas été unifiés : cela changerait qui reçoit l'avis de la demande.
- **`abilities`** : une clé par geste, `confirm`, `complete`, `no_show`, `cancel`, `reschedule`, `claim`, `assign`
  et `propose`, plus `manage`, `feedback_customer` et `create_customer`, qui ne changent pas. `can_confirm` en liste
  lit aussi le statut, relu par `VisitReadContext`, sans requête par ligne.
- **Gardes plus étroites que l'écriture, jamais plus larges** : `abilities` n'offre un geste que sur une visite
  `scheduled` ou `confirmed`. L'écriture garde ses refus historiques : annuler une visite `no_show` reste accepté,
  car les réponses HTTP ne changent pas. `claim` ne s'offre que sur une visite sans agent ; la reprise par un
  titulaire de `crm.assign` passe par `assign`.
- **L'heure n'entre pas dans `no_show`** : la fiche grise « Absent » jusqu'à l'heure de la visite (présentation),
  et l'écriture rejuge l'heure sous verrou.
- **Écarts acceptés par la session (ADR-0139)** :
  - l'échec de l'avis au visiteur ne rend plus une 500 après une confirmation déjà commise : `confirmer`
    l'attrape et le journalise, comme le faisait déjà le lot. La route rend 200 avec `sms_sent: false` ;
    par lien, la confirmation est commise et le lien consommé ;
  - `confirm` et `can_confirm` (en liste aussi) disent l'état ;
  - les destinataires des liens d'action sont filtrés par la policy.
- **Lien d'action** : `GestesParLien::attendEncore` lit `peutConfirmer` du compte (policy et état), et plus le seul
  statut. Un compte qui a perdu le droit ne reçoit plus de lien (test `EmissionDesLiensTest`). Le décor de ce test
  pose désormais `owners_confirm_visits`, comme le fait `visit.rescheduled` en choisissant ses destinataires.
- **Front** : `components/visits/fiche/gestes.ts` (`gestesDeLaVisite`). `VisitDetail` ne lit plus `user.roles` ni
  `useCan('crm.assign')`, et ne compare plus le statut pour décider d'un geste. La lecture des avis suit la présence
  de `metadata`, que l'API ne sert qu'aux outils de la console, au lieu des rôles. Les doublures des tests de la
  fiche complètent `abilities` comme l'API (`__tests__/fixtures/gestes-comme-l-api.ts`).
- **Vérifié** :
  - AC1 : rouge avant le correctif (200 au lieu de 422), puis vert.
  - Ablations rejouées et vérifiées par md5 : jugement sur le modèle passé (AC1, 2 rouges), état retiré de
    `peutClore` (2 rouges), `attendEncore` ramené au seul statut (1 rouge), `VisitDetail` d'avant (AC4, 2 rouges).
  - AC2 : `grep -n "VisitStatus::"` sur le contrôleur ne montre plus que des lectures.
  - L'ordre des verrous de clore, absent et annuler est épinglé dans `VisitAgentOverlapTest`.
- **Appelants repris** : les tests de la messagerie (`EvenementsDesObjetsTest`, `CloturesDesObjetsTest`) passent par
  `confirmer`, `proposerUnCreneau` et `annuler`, avec un acteur légitime (l'hôte du bien, le prospect). Le report de
  `VisitAgentOverlapTest` passe par sa route. Le commentaire de `PropertyVisit.php:69` est corrigé.
- **Vérification adverse (deux défauts reproduits, chacun rouge avant le correctif)** :
  - le PATCH de `scheduled_at` jugeait `visit.closed` et `visit.reschedule_inactive` sur le modèle de la route : une
    visite annulée sous la ligne recevait sa nouvelle heure (200) et l'avis `rescheduledByAgency`. Le PATCH du personnel
    est devenu le geste `GestesDeLaVisite::deplacer` : tous ses refus d'état (`visit.closed`, `visit.reschedule_inactive`
    via l'état de `peutDeplacer`, `visit.reassign_forbidden`, chevauchement, agent libre) se jugent sur la ligne relue sous
    verrou, dans l'ordre d'avant, et l'avis part après le commit. Le contrôleur délègue ;
  - `claim` et `bulk-assign` écrivaient `agent_id` sur une visite annulée sous la ligne : l'attribution rejuge
    `visit.closed` sur la ligne relue ;
  - `proposerUnCreneau` est épinglé sous verrou par un test (ablation `$fresh` → modèle de la route : rouge) ;
  - ablations rejouées, md5 vérifié : refus jugés sur le modèle de la route dans le module → 3 rouges ; rejugement de
    l'attribution retiré → 2 rouges.
- **Nom vide** : mesuré, `demander` appelé avec `visitor_name: ''` écrivait `''` (par HTTP, `ConvertEmptyStringsToNull`
  le masquait). Il écrit `null`, comme la porte publique d'avant 4e3a929f7 (test rouge avant).
- **`MesVisites` (annuler)** : la liste ne sert pas `abilities` (seuls le détail et la carte du fil, ADR-0139 § 5) ; le
  bouton reste tel quel, l'API rejuge à l'écriture.
- **Reste à la session** : `docs/adr/0072-…` nomme encore `VisitSchedulingService::createOrFail`.
