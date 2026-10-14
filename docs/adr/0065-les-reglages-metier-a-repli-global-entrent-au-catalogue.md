# ADR-0065 — Les réglages métier à repli global entrent au catalogue de la plateforme ; la route brute des paramètres n'écrit plus la portée `global`

- **Statut** : Accepté
- **Date** : 2026-10-14
- **Tickets** : TCK-651
- **Amende** : [ADR-0064](0064-l-administration-d-agence-vit-dans-app.md) §1 (la ligne
  `/admin/settings` → `/super-admin/settings/global`)

## Contexte

Mesuré sur `dev` `53b3d2ee` le 2026-10-14, en appliquant la recommandation FC1 de la passe
`/sync-specs` 014 :

- **La table `settings` a deux voies d'écriture en portée `global`.** Le catalogue
  (`EditablePlatformSettings`, `PATCH /api/admin/settings`, `PlatformSettingService::bulkUpdate`) :
  typé, validé, journalisé (`super_admin_setting_updated`). Et la route brute
  (`/api/settings`, `SettingController`), servie dans la console par
  `/super-admin/settings/global` depuis TCK-648 : elle refuse en 422 les clés du catalogue et
  `enum.*` (`managedByCatalogue`, TCK-600), et écrit **toute autre** clé — valeur libre, sans
  journal, `updated_by_id` pour seule trace.
- **Trois lecteurs, et trois seulement, lisent la table** : `PlatformSettingService` (le catalogue),
  `BusinessEnumService` (`enum.*`) et `App\Support\ScopedSetting`. Ce dernier sert cinq clés **hors
  de tout catalogue**, avec un repli : la ligne de l'agence, sinon la **ligne globale**, sinon le
  défaut du service (TCK-600, verif-600 H1) :

  | Clé | Lecteur | Défaut |
  |---|---|---|
  | `invoice.reminder_offsets_days` | `OverdueReminderService` | `[3, 7, 15]` |
  | `lease.rent_review_max_pct` | `RentReviewService` | `20` |
  | `lease.early_termination_penalty_months` | `EarlyTerminationService` | `2` |
  | `lease.require_signature` | `LeaseRenewalService` | `false` |
  | `late_fees.cap_percent` | `LateFeeCalculator` | aucun plafond |

- **Leur valeur globale ne s'écrit donc que par la route brute** — sans règle (un plafond de
  révision à `"abc"` passe et le lecteur retombe en silence sur son défaut), sans journal, alors que
  ces cinq valeurs règlent des montants et des délais pour toutes les agences qui n'en posent pas.
  `docs/features.md` §2.9 l.671 promet le contraire : « seules des clés lues par l'application,
  écrites par une seule voie validée et journalisée ».
- **Toute autre clé globale que la route brute écrit n'a aucun lecteur** : un réglage sans effet,
  qui se donne l'apparence d'en avoir un.
- La passe 014 avait conclu l'inverse (« ces clés ne sont lues par aucun code ») et recommandé de
  fermer la route brute en `global` : fait tel quel, cela aurait supprimé le seul réglage de ces
  cinq défauts. Le correctif est daté dans la passe.

## Décision

**Une clé de portée `global` que le code lit s'écrit par un catalogue, et seulement par lui. La route
brute `/api/settings` ne fait plus que la portée `agency`.**

1. **Les cinq clés entrent dans `EditablePlatformSettings`**, catégorie `rentals`, avec leur type,
   leurs règles et leur défaut — **le défaut du catalogue est la constante du service**, référencée,
   jamais recopiée. Elles s'éditent dans les « Paramètres plateforme » de `/super-admin/settings`,
   avec la journalisation et la garde de second facteur du catalogue.
2. **Leurs lecteurs gardent le repli par agence** : la ligne de l'agence, sinon
   `PlatformSettingService::getValue('<clé>')` (la ligne globale, sinon le défaut du catalogue).
   L'appel est littéral, ce qui les met sous la garde `check-platform-catalogue-readers.mjs`.
3. **La route brute refuse toute écriture en portée `global`** (`store`, `update`, `destroy`), pour
   tout appelant, super-admin compris : 422 `setting.global_not_writable`. La portée `agency`
   reste ouverte (admin de l'agence, ou profil plateforme sous second facteur). La lecture
   (`index`) ne change pas.
4. **`/super-admin/settings/global` disparaît** (amende ADR-0064 §1) : son seul objet était
   d'écrire la portée globale par la route brute. Sans redirection, comme le reste d'ADR-0064.

## Conséquences

- l.671 de `features.md` devient vraie telle qu'elle est écrite.
- Un réglage d'agence de ces cinq clés ne se pose toujours **que par l'API** : aucun écran ne
  l'offre (il n'y en avait pas avant non plus). Hors périmètre.
- Les lignes globales hors catalogue déjà écrites restent en base, sans lecteur ni chemin
  d'écriture. Aucune production ne tourne sur cette API (D-04) : aucun nettoyage n'est prévu.
- L'éditeur du catalogue apprend trois types de champ : booléen, décimal (vide = aucun plafond)
  et liste d'entiers.
- Le coût : une clé métier neuve à repli global passe désormais par le catalogue, c'est-à-dire par
  une entrée typée et ses traductions.

## Application

- `takussan-api/app/Domain/Settings/EditablePlatformSettings.php` — les cinq entrées.
- `takussan-api/app/Support/ScopedSetting.php` et les cinq lecteurs.
- `takussan-api/app/Http/Requests/Api/StoreSettingRequest.php`, `UpdateSettingRequest.php`,
  `SettingController::destroy` — le refus de la portée `global`.
- `scripts/check-platform-catalogue-readers.mjs` — chaque clé du catalogue a son `getValue` littéral.
- Tests : `GenericSettingsCatalogueBypassTest`, `ScopedSettingReadersTest`, `PlatformSettingTest`.
