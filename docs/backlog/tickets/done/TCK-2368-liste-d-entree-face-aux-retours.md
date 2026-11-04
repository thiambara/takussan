---
id: TCK-2368
title: "La liste d'entrée du locataire : rouverte par un état des lieux d'entrée contesté, absente d'un bail renouvelé, cochée par le seul loyer ou la seule caution"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-25
updated: 2026-10-25
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
  models:
    - "docs/models-spec.md#50-tenantonboardingchecklist-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-238--lignes-nées-au-passage-dun-statut-face-aux-transitions-de-retour-du-parent"
tags: [api, baux, etats-des-lieux, onboarding, pistes]
---

## Objectif utilisateur

La liste d'entrée du locataire (`TenantOnboardingChecklist`) dit vrai : une case cochée par un
état des lieux d'entrée qui est ensuite contesté se décoche, un locataire déjà en place ne reçoit
pas une seconde entrée à son renouvellement, et la case « premier paiement » ne se coche que par
un versement du locataire.

## Contexte

Trois pistes de l'angle 238, toutes `validé` (V7 accordé), sur la même liste et ses écrivains.

- Réf : **P238.01** — `InventoryOnboardingObserver` ne lisait que la transition vers `signed`.
  Avant (mesuré par le mesureur, db3e25230, et rejoué ici par le test de garde) : EDL d'entrée
  `pending_signature` → `signed` → `InventoryService::dispute()` → EDL `disputed`, mais
  `inventory_completed_at` toujours posé, et `tenant-onboarding:remind` → 0 rappel.
- Réf : **P238.02** — un renouvellement qui demande une signature (avenant, ou
  `lease.require_signature`) émet `LeaseActivated` à son activation (`LeaseService::completeActivation`),
  et `TenantOnboardingService::create` comme `SendTenantWelcomeNotification` ne lisaient pas
  `renewed_from_lease_id`. Avant : liste neuve pour l'enfant et une seconde
  `TenantWelcomeNotification`. Le renouvellement né `active` n'émet pas `LeaseActivated` et ne
  créait déjà rien : le test le garde quand même.
- Réf : **P238.03** — `LeasePaymentOnboardingObserver` ne filtrait pas `payment_type`. Avant : une
  ligne `deposit_refund` passée à `paid` (paiement du reversement de la caution) cochait
  `first_payment_at`.

## Décision du porteur

- P238.01 — validé — validation du porteur (2026-10-25) : à la sortie de `signed` d'un état des lieux d'entrée, la case se décoche, la liste d'entrée se rouvre et le rappel J+7 rejoue, tant qu'aucun autre état des lieux d'entrée du bail n'est signé
- P238.02 — validé — validation du porteur (2026-10-25) : un bail renouvelé (`renewed_from_lease_id` posé) ne crée ni liste d'entrée, ni rappel d'état des lieux, ni message de bienvenue
- P238.03 — validé — validation du porteur (2026-10-25) : la case « premier paiement » ne compte que les loyers et cautions versés par le locataire (`payment_type`) ; un remboursement ne la décoche pas

## Hypothèses

- P238.01 : « le rappel J+7 rejoue » vaut aussi quand un rappel est déjà parti avant la signature.
  La réouverture ajoute à `reminders_sent` une marque `{type: 'inventory_reopened', sent_at}`, et
  le rappel ne compte que les `inventory_d7` postérieurs à la dernière marque : il rejoue une fois
  par réouverture, au passage horaire suivant si la liste a plus de 7 jours. Le journal garde
  ainsi ses entrées, au lieu d'en effacer une.
- P238.01 : seule la sortie de `signed` par changement de statut est lue. Un EDL signé ne se
  supprime pas (`InventoryController`, `InventoryService` : `inventory.not_draft`).
- P238.02 : les listes déjà créées pour un bail renouvelé restent telles quelles (aucune donnée
  existante ne change en silence) ; le rappel ne les filtre pas.
- P238.03 : « loyers et cautions » = `payment_type` `rent` ou `deposit` ; les charges, pénalités et
  régularisations ne cochent pas non plus la case.

## Delta à produire

- [x] `InventoryOnboardingObserver::updated` : un EDL d'entrée dont le statut d'origine est
  `signed` et qui en sort → `TenantOnboardingService::reopenItem`, sauf si un autre EDL d'entrée du
  bail est `signed`.
- [x] `TenantOnboardingService::reopenItem` : colonne à nul, `completed_at` à nul pour un item
  requis, marque `inventory_reopened` pour l'EDL, journal `tenant_checklist_item_reopened`.
- [x] `RemindTenantOnboarding::alreadyReminded` : un rappel antérieur à la dernière réouverture ne
  compte plus.
- [x] `TenantOnboardingService::create` et `SendTenantWelcomeNotification` : rien pour un bail à
  `renewed_from_lease_id` posé.
- [x] `LeasePaymentOnboardingObserver` : seuls `rent` et `deposit` comptent, à la création comme à
  la mise à jour.
- [x] Spec : `docs/models-spec.md` § 50, ligne d'onboarding de `docs/features.md` § 1.4.
- [x] Tests : `tests/Feature/Tenant/ListeDEntreeFaceAuxRetoursTest.php`.

## Critères d'acceptation

- [x] AC1 (P238.01) — EDL d'entrée signé puis contesté → case décochée, rappel J+7 envoyé sur une
  liste de plus de 7 jours.
- [x] AC2 (P238.01) — liste fermée par l'EDL (premier paiement déjà là) → `completed_at` à nul, la
  liste revient dans `incomplete()` (file des retards de l'agence), `first_payment_at` intact.
- [x] AC3 (P238.01) — rappel parti avant la signature → un second rappel après la contestation, et
  pas de troisième au passage suivant.
- [x] AC4 (P238.01) — un autre EDL d'entrée du bail signé → la case reste cochée ; un EDL de sortie
  contesté ne touche pas la liste.
- [x] AC5 (P238.02) — renouvellement né `active` → ni liste, ni bienvenue.
- [x] AC6 (P238.02) — renouvellement `pending_signature` puis activé → ni liste, ni bienvenue, ni
  `tenant_welcomed_at` ; un bail neuf activé reçoit toujours les deux.
- [x] AC7 (P238.03) — restitution de caution payée (créée payée ou passée à `paid`), pénalité payée
  → case vide ; caution versée → case cochée ; premier loyer remboursé → case intacte.

## Notes d'implémentation

Ablation, chaque correctif retiré seul puis remis :

- réouverture retirée de l'observateur → AC1, AC2, AC3 rouges ;
- remise à zéro par la marque retirée du rappel → AC3 rouge ;
- garde « autre EDL signé » neutralisée → AC4 rouge ;
- filtre de `create` neutralisé → AC6 rouge (liste créée) ; filtre de la bienvenue neutralisé →
  AC6 rouge (bienvenue envoyée) ;
- filtre de `payment_type` neutralisé → les trois cas de AC7 « case vide » rouges.

AC5 et « caution versée » / « loyer remboursé » étaient verts avant le correctif : ce sont des
témoins (le renouvellement né `active` n'émet pas `LeaseActivated`, et rien ne décochait la case).
