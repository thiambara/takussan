---
id: TCK-310
title: "`docs/models-spec.md` ignore 16 modèles et documente encore un package désinstallé"
status: todo
phase: P1
family: technique
estimate: M
wave: 40
created: 2026-08-16
updated: 2026-08-16
depends_on: []
blocks: []
spec_refs:
  models:
    - docs/models-spec.md#packages-transversaux
    - docs/models-spec.md#modèles-existants
    - docs/models-spec.md#nouveaux-modèles
  features:
    - docs/features.md#22-rôles--permissions
tags: [documentation, specs, models, sync-specs, dette]
---

## Objectif utilisateur

Qu'un agent ou un développeur qui consulte la source de vérité data y trouve les modèles qui
existent — au lieu de conclure de leur absence qu'ils sont à créer.

## Contrat de données

`docs/models-spec.md` est désigné source de vérité data. Mesuré le 2026-08-16 :
**16 modèles de premier niveau sur 62** n'y sont mentionnés nulle part.

```
AccountDeletionRequest   AlertRule              DataExport          FeatureFlag
IntegrationWebhookLog    KpiConfig              MaintenanceWindow   NotificationDeliveryAttempt
PropertyContactLead      PropertyReport         ReportExport        RoleDelegation
ScheduledTaskRun         ThresholdAlert         WelcomeView         WizardDraft
```

> Le **compte** de l'ardoise D-18 (16) tient à l'unité. Sa **liste**, elle, a vieilli :
> `BankStatement`, `BankStatementLine` et `PropertyPriceHistory` y figuraient et sont désormais
> documentés ; `RoleDelegation`, `WizardDraft`, `ThresholdAlert`, `WelcomeView`,
> `PropertyContactLead` et `PropertyReport` n'y figuraient pas et manquent. *Un inventaire se
> re-mesure avant d'être utilisé, jamais lu.*

De plus, `models-spec.md` et `features.md` mentionnent chacun **2 fois** `spatie/laravel-permission`,
notamment comme « package transversal » — alors que le package est **désinstallé** (TCK-278) et
qu'une garde CI casse sur ses imports.

`docs/sync-passes/INDEX.md` affiche par ailleurs un statut de convergence à vérifier : l'ardoise le
donnait faux (« R1–R7 non appliquées » alors que R1 et R2 l'étaient), sur une rupture datant de plus
de trois mois.

## Contraintes strictes (métier)

- **Ce ticket documente l'existant, il ne conçoit rien.** Chaque modèle ajouté à la spec est décrit
  d'après le code et les migrations qui existent — colonnes, relations, contraintes réelles. Aucune
  colonne « souhaitable » ne s'y glisse : ce serait fabriquer une spec que le code contredit, soit
  exactement la dette qu'on solde.
- Les mentions de `spatie/laravel-permission` se corrigent en pointant vers le mécanisme réel :
  profils polymorphes, enum `Capability` (44 cas), `MembershipCapabilityResolver` (principe n°1).
- `/sync-specs` est la voie prévue pour faire converger `features.md` et `models-spec.md` : ce
  ticket s'y appuie plutôt que de réinventer la passe.
- La spec re-diverge au premier modèle suivant si rien ne le détecte. La sortie inclut une garde.

## Delta à produire

- [ ] Documenter les 16 modèles absents dans `docs/models-spec.md`, d'après le code et les migrations
- [ ] Corriger les 4 mentions de `spatie/laravel-permission` dans les deux specs
- [ ] Re-mesurer et corriger le statut de convergence de `docs/sync-passes/INDEX.md`
- [ ] Lancer `/sync-specs` et solder les écarts qu'il remonte
- [ ] Garde CI : un modèle de premier niveau absent de `models-spec.md` fait échouer le build
- [ ] Prouver la garde **par mutation** : ajouter un modèle sans le documenter, vérifier le rouge

## Critères d'acceptation

- [ ] AC1 — les 62 modèles de premier niveau sont mentionnés dans `docs/models-spec.md`, ou leur
      exclusion est justifiée par écrit
- [ ] AC2 — aucune spec ne présente `spatie/laravel-permission` comme un mécanisme en vigueur
- [ ] AC3 — chaque modèle ajouté cite les colonnes et relations que le code porte réellement — pas
      celles qu'il devrait porter
- [ ] AC4 — créer un modèle sans le documenter fait échouer la CI
- [ ] AC5 — `docs/sync-passes/INDEX.md` reflète un état re-mesuré et daté

## Hors périmètre

- La correction du **code** pour le faire correspondre à la spec : ici c'est la spec qui a tort.
- Les documents périmés hors specs — TCK-311.

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
