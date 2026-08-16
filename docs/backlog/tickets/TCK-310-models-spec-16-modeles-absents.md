---
id: TCK-310
title: "`docs/models-spec.md` ignore 16 modèles et documente encore un package désinstallé"
status: review
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

- [x] Documenter les 16 modèles absents dans `docs/models-spec.md`, d'après le code et les migrations
- [x] Corriger les 4 mentions de `spatie/laravel-permission` dans les deux specs
- [x] Re-mesurer et corriger le statut de convergence de `docs/sync-passes/INDEX.md`
- [x] Lancer `/sync-specs` et solder les écarts qu'il remonte
- [x] Garde CI : un modèle de premier niveau absent de `models-spec.md` fait échouer le build
- [x] Prouver la garde **par mutation** : ajouter un modèle sans le documenter, vérifier le rouge

## Critères d'acceptation

- [x] AC1 — les 62 modèles de premier niveau sont mentionnés dans `docs/models-spec.md`, ou leur
      exclusion est justifiée par écrit — **62/62, 0 exclusion** (`node scripts/check-models-spec.mjs --report`)
- [x] AC2 — aucune spec ne présente `spatie/laravel-permission` comme un mécanisme en vigueur
- [x] AC3 — chaque modèle ajouté cite les colonnes et relations que le code porte réellement — pas
      celles qu'il devrait porter
- [x] AC4 — créer un modèle sans le documenter fait échouer la CI — **prouvé par mutation**
- [x] AC5 — `docs/sync-passes/INDEX.md` reflète un état re-mesuré et daté

## Hors périmètre

- La correction du **code** pour le faire correspondre à la spec : ici c'est la spec qui a tort.
- Les documents périmés hors specs — TCK-311.

## Notes d'implémentation

**Trois choses mesurées ne correspondaient pas à l'énoncé du ticket.**

1. **Le volet spatie était déjà soldé — et l'énoncé le comptait mal.** Les 4 occurrences littérales
   de `spatie/laravel-permission` étaient toutes au passé depuis le 2026-08-15. Compter cette
   **chaîne** ratait le vrai défaut : **quatre passages décrivaient le mécanisme au présent sans
   nommer le paquet** — « Rôle spatie à assigner à l'acceptation » (§48 Invitation), « attache le
   rôle spatie scopé sur `agency_id` » (§48 Notes), « les permissions par les rôles spatie » (note
   `UserType`), et une phase 2 planifiant la « **réintroduction du trait `HasRoles`** », impossible
   puisqu'une garde CI casse sur son namespace. Les quatre sont corrigés. *Compter les occurrences
   d'un nom ne mesure pas la présence d'une idée.*

   Mesuré au passage sur `InvitationService::finalizeAccept()` : **aucun rôle n'est attaché** à
   l'acceptation d'une invitation. `Invitation.role` est un discriminant de parcours, pas une
   permission — la spec affirmait le contraire.

2. **`docs/sync-passes/INDEX.md` : 6 des 7 recommandations R1–R7 étaient déjà appliquées**, pas 5.
   Seule R7 (cas `support` manquant sur `ConversationType`) restait vivante ; elle est appliquée.
   **R4 est sans objet** : elle demandait l'unicité de `bank_statements.reference_number`, colonne
   qui n'existe pas. Quatre des sept recommandations de la passe 009 décrivaient un schéma
   **déduit du nom des modèles** — `reference_number`, `transaction_date`, `statement_date` et huit
   valeurs d'enum inventées, dont aucune n'est dans `app/Models/Enums/`. Elles se soldent en
   mesurant, pas en les exécutant.

3. **La garde ne pouvait pas chercher une sous-chaîne.** Mesuré : **13 des 62 noms de modèles sont
   sous-chaînes d'un autre** (`Payout` dans `PlatformPayout`, `Document` dans `DocumentShareLink`,
   `Task` dans `ScheduledTaskRun`…). Une recherche naïve aurait certifié documenté un cinquième de
   l'inventaire par la seule présence d'un voisin. `check-models-spec.mjs` borne donc sur les
   caractères de mot PHP de part et d'autre — `\b` de JS ne suffit pas, il ne coupe pas entre deux
   majuscules.

**Preuve de la garde, dans les deux sens :**

- **mutation** — `app/Models/MutationProbeModel.php` ajouté sans documentation → sortie 1, le modèle
  nommé. Puis `app/Models/Repor.php` — sous-chaîne de `Report`/`ReportExport`, tous deux présents
  dans la spec → sortie 1 également : la borne de mot tient.
- **ablation** — rejouée sur le `models-spec.md` d'avant le correctif (`git stash`), la garde nomme
  **exactement les 16** modèles du ticket. Un vert obtenu sans avoir rien vérifié aurait été
  indiscernable d'un vrai vert.

**Deux constats hors périmètre, relevés en mesurant, non corrigés :**

- `report_exports.archive_path` est `string` (donc `VARCHAR(255)`) et casté `encrypted`, quand
  `data_exports.archive_path` est `text` pour la même donnée. Mesuré : un chemin de 32 à 47
  caractères en clair produit **256 caractères** chiffrés. Les chemins réellement écrits
  (`reports/{report}-{id}.csv`, ≤ 27 car.) tiennent en 228 — ça passe **par marge, pas par
  construction**. Documenté tel quel dans §62 ; la correction du schéma est un autre ticket.
- `features.md` §2.2 classe « Délégation temporaire de permissions » en **P2 (à faire)** alors que
  `RoleDelegation` est livré — modèle, service, jobs, policy, tests. Non corrigé : le périmètre
  autorisé sur `features.md` se limitait aux mentions de spatie.

Deux ancres internes de `models-spec.md` restent cassées (`#13-activitylog`,
`#active-profile-context`) — antérieures à ce ticket, hors périmètre.
