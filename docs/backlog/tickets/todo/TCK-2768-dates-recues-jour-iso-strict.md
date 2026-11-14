---
id: TCK-2768
title: "Les dates reçues refusent les formes que la règle `date` relit de travers — un jour `AAAA-MM-JJ` strict, années bornées"
status: todo
phase: P2
family: full
estimate: M
wave: 90
created: 2026-11-13
updated: 2026-11-13
depends_on: [TCK-2752]
blocks: []
spec_refs:
  features:
    - "docs/features.md#24-recherche--filtres"
  models:
    - "docs/models-spec.md#3-property"
    - "docs/models-spec.md#5-booking"
    - "docs/models-spec.md#14-lease-"
    - "docs/models-spec.md#15-leasepayment-"
    - "docs/models-spec.md#22-document-"
    - "docs/models-spec.md#25-invoice-"
    - "docs/models-spec.md#28-payout-"
tags: [back, front, validation, dates, contrat-d-entree, suite-de-tck-2752]
---

## Objectif utilisateur

Une date mal formée envoyée à l'API est refusée (422) au lieu d'être relue comme un autre jour : un bail, une
facture, une pièce ou une période de paiement ne s'écrit plus au mauvais jour.

## Contrat de données

**Constat.** La contre-vérification de 6f52ccb38 (TCK-2752, q1) l'a relevé. Ce ticket le re-mesure sur
065941306, avec la lecture des règles de `InstantRecuConvertiTest::reglesDate()`. Après TCK-2752, il reste
**41 champs de FormRequest** et **trois validations hors FormRequest** dont la règle contient `date` sans
`InstantIso`. Le rapport en comptait 29 sans en donner la liste : l'écart n'est pas expliqué, et la liste
ci-dessous fait foi. Le recensement a été fait deux fois : par la lecture de la garde, puis par un balayage du
jeton `date` sur tout `app/`, sans filtre, une fois les `$casts` retirés. Les deux listes coïncident. Ces champs visent une colonne de type `date`, ou bornent une lecture.

La règle `date` de Laravel accepte toujours, sur chacun d'eux :

- « 99999-01-01 », relu le 2009-01-01 ;
- « 10000-01-01 » ;
- « 0099-01-01 », l'an 99 ;
- « 12/11/2026 », relu le 11 décembre ;
- « 2026-W46 », « 1 Nov 2026 ».

`date_format:Y-m-d` seul refuse « 99999-01-01 », « 10000-01-01 », « 12/11/2026 » et un octet nul. Mais il
**accepte « 0099-01-01 »** et toute année à quatre chiffres, mesuré le 2026-11-13 avec
`DateTime::createFromFormat('!Y-m-d')`, comme le fait `validateDateFormat`. D'où une borne d'années en plus.

**Ce que le front envoie.** Relevé le 2026-11-13, en lecture seule, sur `takussan-web/src` et
`takussan-api/tests` :

- Tous les écrivains envoient `AAAA-MM-JJ` : `DatePicker`/`FormDatePicker` (`yyyy-MM-dd`), `<input type="date">`,
  `toISOString().slice(0, 10)`, `decalerJour`, `formatISODate`. Aucun client n'envoie `dd/MM/yyyy`.
- **Une seule exception côté front** : `published_after` reçoit un instant (`toISOString()`,
  `lib/recherches-recentes.ts:82` ; `last_viewed_at ?? created_at`, `lib/queries/saved-searches.ts:200`).
- **Une seule exception côté tests** : `ActivityLogEndpointTest` (l.147-150) envoie `filter[date_from]` et
  `filter[date_to]` en `Y-m-d H:i:s`, et `DateBoundaryFilter` le prévoit : « une date et heure passe telle quelle »
  (`normalize()`, branche `:`).
- Trois écrans relaient à l'API une valeur d'URL sans en vérifier la forme :
  - l'historique des paiements, `filter[date_from|date_to]` (`PaymentsHistoryTable.tsx:48-49`,
    `lib/finances/vue-argent.ts:66-67`, `lib/finances/depuis-les-paiements.ts:38`) ;
  - la liste des biens, `created_from|created_to` (`app/(dashboard)/app/properties/(liste)/page.tsx:129-130`) ;
  - la recherche publique, `available_from` (`lib/recherche-publique.ts:119`), recopiée aussi dans les
    critères d'une recherche sauvegardée.

**Deux familles, deux règles.**

*Famille J — un jour.* La valeur est une date de colonne `date`, ou une borne lue au jour (`startOfDay`,
`endOfDay`, `toDateString`, `whereDate`). Ces champs prennent `new JourIso` juste après `'date'`, comme
`InstantIso` dans TCK-2752. Il y en a 36 dans les FormRequests, plus `SavedSearchCriteria` :

| FormRequest (sous `app/Http/Requests/`) | Champs |
|---|---|
| `Api/Admin/ClosePlatformPayoutPeriodRequest` | `period_end` |
| `Api/Admin/IndexPaymentSupervisionRequest` | `filter.from`, `filter.to` |
| `Api/Admin/RadarObservatoryRequest` | `filter.since`, `filter.until` |
| `Api/IndexCalendarRequest` | `start_date`, `end_date` |
| `Api/PreparePayoutRequest` | `period_start`, `period_end` |
| `Api/ShowExportRequest` | `from`, `to` |
| `Api/StoreBookingRequest` | `start_date`, `end_date` |
| `Api/StoreDocumentRequest`, `UploadDocumentVersionRequest` | `expiry_date` (×2) |
| `Api/StoreInvoiceRequest` | `issue_date`, `due_date` |
| `Api/StoreLeasePaymentRequest` | `period_start`, `period_end`, `due_date` |
| `Api/StoreLeaseRequest`, `RenewLeaseRequest` | `start_date`, `end_date` (×2) |
| `Api/StorePayoutRequest` | `period_start`, `period_end` |
| `Api/StorePropertyRequest`, `UpdatePropertyRequest`, `Public/SearchPublicPropertyRequest` | `available_from` (×3) |
| `Maintenance/SubmitQuoteRequest` | `valid_until` |
| `Public/BookingRequestPublicPropertyRequest` | `start_date`, `end_date` |
| `RequestEarlyTerminationRequest`, `ReviewRentRequest` | `effective_date` (×2) |
| `Search/SearchQueryRequest` | `filter.date_from`, `filter.date_to` |
| `app/Support/SavedSearchCriteria.php` (hors FormRequest) | `*.available_from` |

*Famille I — un jour ou un instant.* La valeur borne une colonne `datetime`, et un instant y est admis
aujourd'hui (front ou tests). Ces champs prennent `new InstantIso` (TCK-2752), qui admet aussi une date seule.
Il y en a 5, plus le filtre partagé :

| Où | Champs | Pourquoi un instant |
|---|---|---|
| `Api/IndexAuditLogRequest` | `from`, `to` | lus par `DateBoundaryFilter::normalize()` |
| `Audit/ExportActivityLogRequest` | `filter.date_from`, `filter.date_to` | mêmes bornes que la liste, par `DateBoundaryFilter` |
| `Public/SearchPublicPropertyRequest` | `published_after` | le front envoie `toISOString()` (TCK-2496) |
| `app/Http/Filters/DateBoundaryFilter::exiger` (hors FormRequest) | toutes les bornes qui passent par lui : journal, audit croisé, fiche utilisateur, biens, commissions, interventions, modération des agences, historique des paiements | sa branche `:` ; `ActivityLogEndpointTest` |

*Les deux à la fois — `app/Http/Filters/RangeFilter`* (hors FormRequest). C'est le filtre générique
`filter[<colonne>_min|_max]` de `HasQueryBuilder`. Il juge la valeur selon le cast de la colonne, et il a déjà
une branche `:` pour un horodatage. Sa règle suit donc ce cast : `new JourIso` pour une colonne `date` ou
`immutable_date`, `new InstantIso` pour une colonne `datetime`.

Les lecteurs de `MapPublicPropertyRequest`, `PriceDistributionRequest` et `SuggestRequest` reprennent les règles de
`SearchPublicPropertyRequest` : ils suivent sans changement.

## Contraintes strictes (métier)

- **Le contrat d'entrée se resserre, il ne change pas de sens.** Toute valeur `AAAA-MM-JJ` acceptée aujourd'hui
  dans la plage retenue (1970 au plafond tranché) reste acceptée sur ces 41 champs et dans les trois validations hors FormRequest. Sur
  la famille I, tout instant que `InstantIso` admet reste accepté.
- **Le plancher est celui d'`InstantIso`** (`ANNEE_MIN` = 1970), lu par référence et jamais recopié. Aucune des
  colonnes visées ne porte une date de naissance ni une date historique.
- **Le plafond : tranché par le porteur le 2026-11-13, option (b), 2199, plancher 1970.** La demande était 2100, comme `InstantIso::ANNEE_MAX`. Mais
  aucune règle ne borne aujourd'hui la durée d'un bail : `StoreLeaseRequest` et `RenewLeaseRequest` acceptent
  un `end_date` en 2125. Un bail emphytéotique (jusqu'à 99 ans) signé en 2026 finit après 2100, et un
  `expiry_date` de pièce peut suivre ce bail. 2100 refuserait une valeur juste, admise aujourd'hui.
  - (a) 2100 pour tous : une seule borne avec `InstantIso`, mais une régression sur les baux longs.
  - (b) **Recommandé** : `JourIso::ANNEE_MAX` = 2199, avec un plancher partagé. Le plafond n'est pas ce qui
    protège : une faute de frappe à cinq chiffres (« 20266 ») est déjà refusée par la forme `\d{4}`, et une
    faute à quatre chiffres (« 2062 ») passe sous n'importe quel plafond. Le plafond ne sert qu'à écarter
    l'absurde.

  Une borne de recherche hors de la plage retenue rend 422, et c'est voulu.
- **Les règles relatives restent** (`after_or_equal:today`, `after:start_date`, `before_or_equal:now`…) : la règle
  de forme s'ajoute, elle ne remplace rien.
- **Les liens publics ne pourrissent pas** (TCK-335). Une recherche publique partagée ou sauvegardée dont
  `available_from` serait refusé par l'API ne doit pas afficher « 0 bien trouvé » par un 422. Une forme
  `AAAA-MM-JJ` ne suffit pas : « 2026-02-30 » ou « 1960-01-01 » ont la forme et rendent 422. Le front écarte
  donc avant l'appel toute valeur que `JourIso` refuserait (jour inexistant, année hors de la plage), comme si
  elle était absente. Il applique le même filtre avant d'enregistrer une recherche
  (`POST` des recherches sauvegardées, validé par `SavedSearchCriteria`). L'API, elle, refuse.

## Delta à produire

**API**

- [ ] `App\Rules\JourIso` (`ValidationRule`) :
  - admet une chaîne `AAAA-MM-JJ` exactement (`\A\d{4}-\d{2}-\d{2}\z`) ;
  - le jour doit exister (`checkdate`) ;
  - l'année doit être dans [`InstantIso::ANNEE_MIN`, `JourIso::ANNEE_MAX`], le plafond tranché plus haut (2100
    s'il est égal à `InstantIso::ANNEE_MAX`, qu'il lit alors par référence) ;
  - `null` n'est pas jugé ici (`nullable` en répond) ; toute autre valeur, ou une chaîne qui n'est pas un jour,
    échoue sur `validation.rules.jour`.
- [ ] Le libellé `validation.rules.jour` en `fr`, `en` et `wo` (wo = texte français, wolof en pause).
  `LangGroupParity` reste vert.
- [ ] Famille J : `new JourIso` posé juste après `'date'` sur les 36 champs de FormRequest et dans
  `SavedSearchCriteria`. Les deux règles en chaîne (`'nullable|date'` de `available_from` et de `published_after`
  dans `SearchPublicPropertyRequest`) sont réécrites en tableau. Le commentaire TCK-335 est gardé et complété.
- [ ] Famille I : `new InstantIso` posé juste après `'date'` sur `IndexAuditLogRequest` (`from`, `to`),
  `ExportActivityLogRequest` (`filter.date_from`, `filter.date_to`), `published_after`, et dans
  `DateBoundaryFilter::exiger` (`['string', 'date', new InstantIso]`). Le docblock de `DateBoundaryFilter` dit les
  formes admises.
- [ ] `RangeFilter` : `['string', 'date', $isTimestamp ? new InstantIso : new JourIso]`. Son docblock dit les
  deux formes.
- [ ] **Garde** (dans `tests/Unit/Architecture/InstantRecuConvertiTest.php`, ou un fichier frère qui réutilise sa
  lecture des règles) : `test_aucune_date_recue_n_est_nue`.
  - Pour **tout** champ que `reglesDate()` relève dans `app/Http/Requests`, quelle que soit sa colonne, chaque
    `date` de l'expression a son `new JourIso` ou son `new InstantIso`, dans chaque branche.
  - La lecture ignore aujourd'hui les champs dont la règle porte `date_format`. Cela reste vrai : un champ en
    `date_format:Y-m-d` n'est pas une `date` nue.
  - Hors de `app/Http/Requests`, la garde ne lit que des **tableaux de règles** : la valeur d'une clé de règle
    (`'champ' => [...]`, `"filter.{$x}" => [...]`, `$attribute.'.x' => [...]`), qu'elle soit écrite sur une ligne
    ou sur plusieurs, et les arguments de `Validator::make`. Un `'date'` trouvé là porte l'une des deux règles.
  - Elle ne lit **pas** les listes de colonnes : `$casts`, et `$fillable`, où `'date'` est un nom de colonne
    (`PropertyBoostDailyStat`, `PlatformMetricDaily`). Ces deux cas sont épinglés comme « pas une règle » dans
    le test de lecture, pour qu'une garde qui les lirait rougisse.
  - Elle épingle les trois occurrences d'aujourd'hui : `DateBoundaryFilter`, `RangeFilter`, `SavedSearchCriteria`.
  - Planchers de non-vacuité : plus de 75 champs relevés dans les FormRequests (41 nouveaux et 41 de TCK-2752),
    et au moins 3 occurrences hors FormRequest.
  - Un test de lecture épingle les formes : un champ en `'nullable|date'` compte zéro, une branche conditionnelle
    sans la règle rougit, et `date_format` est ignoré.
- [ ] **Le test d'activité qui poste un instant** (`ActivityLogEndpointTest`, l.147-150) reste vert sans
  changement : c'est la preuve que la famille I garde l'instant.
- [ ] **Les voisins** : les tests qui postent l'un de ces champs (`start_date`, `end_date`, `period_start`,
  `period_end`, `due_date`, `issue_date`, `expiry_date`, `available_from`, `valid_until`, `effective_date`, `from`,
  `to`, `since`, `until`, `date_from`, `date_to`). Un test qui poste un objet Carbon non converti, sérialisé en
  instant par `postJson`, ou un instant, sur un champ de la famille J, poste désormais `toDateString()`. C'est un
  changement du contrat de test, comme les deux tests renommés par TCK-2752. Chaque changement est nommé dans
  les notes.
- [ ] **Mesure avant fusion, sans écrire** : sur la base de démo et sur la préproduction, compter les recherches
  sauvegardées dont `criteria` porte un `available_from` que `JourIso` refuserait (forme, jour inexistant, année
  hors de la plage). Si le compte n'est pas nul, s'arrêter et le signaler à la session avant de fusionner : une relecture rendrait 422.

**Front**

- [ ] La recherche publique ne relaie à l'API un `available_from`, lu dans l'URL ou dans les critères d'une
  recherche sauvegardée, que si l'API l'accepterait : forme `AAAA-MM-JJ`, jour qui existe, année dans la plage
  retenue. Sinon la valeur est traitée comme absente : la recherche s'affiche sans ce critère, sans erreur. Le
  même filtre s'applique avant d'enregistrer une recherche.

**Tests**

- [ ] `tests/Unit/Rules/JourIsoTest.php` :
  - admis : un jour ordinaire, le 29 février d'une année bissextile, `1970-01-01`, le 31 décembre de l'année plafond ;
  - refusés : « 99999-01-01 », « 10000-01-01 », « 0099-01-01 », « 1969-12-31 », le 1er janvier qui suit l'année plafond, « 12/11/2026 »,
    « 2026-11-12T10:00:00Z », « 2026-11-12 10:00 », « 2026-W46 », « 1 Nov 2026 », « 2026-02-30 », « 2026-1-5 »,
    un octet nul intérieur, un saut de ligne final, un entier, un tableau ;
  - le libellé.
- [ ] `tests/Feature/Validation/JourIsoRecuTest.php`, par HTTP, sur des écrivains **sans** borne relative, où la
  forme relue s'écrivait vraiment :
  - `POST /api/leases` (`start_date` = « 99999-01-01 » puis « 12/11/2026 ») : 422, aucun bail créé ;
  - `POST /api/invoices` (`issue_date`) : 422 ;
  - `POST /api/documents` (`expiry_date`) : 422 ;
  - `POST /api/leases/{lease}/payments` (`period_start`) : 422 ;
  - les mêmes avec `AAAA-MM-JJ` : la réponse attendue, et le jour stocké est celui envoyé ;
  - une lecture : `GET /api/calendar` avec `start_date=12/11/2026` rend 422.
- [ ] `RangeFilter`, par HTTP : `filter[<colonne date>_min]=12/11/2026` rend 422, et `=2026-11-12` rend 200.
  Sur une colonne `datetime`, `filter[<colonne>_max]=2026-11-12 10:00` rend 200.
- [ ] Famille I, par HTTP : `GET /api/activity-log?filter[date_from]=12/11/2026` rend 422.
  `filter[date_from]=2026-11-12 10:00:00` rend 200 (le test existant). `published_after=99999-01-01` rend 422,
  et un instant `toISOString()` passé rend 200.
- [ ] Front : un test de la fonction qui construit l'appel de la recherche publique, et de celle qui enregistre une
  recherche. `12/11/2026`, `2026-02-30` et `1960-01-01` ne sont pas envoyés ; `2026-11-12` l'est.
- [ ] **Ablations**, chacune rouge, puis restaurée et vérifiée par md5 :
  - la règle retirée d'un champ de la famille J sans test HTTP (par exemple `RadarObservatoryRequest.filter.since`),
    qui fait rougir la garde ;
  - `JourIso` retiré de `StoreLeaseRequest.start_date`, qui fait rougir le test HTTP ;
  - dans la règle : borne d'années retirée, `\z` remplacé par `$`, `checkdate` retiré, non-chaîne admise ;
  - `InstantIso` retiré de `DateBoundaryFilter::exiger`, puis `JourIso` retiré de `RangeFilter` ;
  - dans la garde : la lecture hors FormRequest neutralisée ;
  - le filtre du front réduit à la seule forme `AAAA-MM-JJ` (le test sur `2026-02-30` doit rougir).

## Critères d'acceptation

- [ ] **AC1** — Sur chaque champ de la famille J, « 99999-01-01 », « 0099-01-01 », « 12/11/2026 » et un instant
  (« 2026-11-12T10:00:00Z ») rendent 422. Par HTTP sur les quatre écrivains nommés et le calendrier ; partout
  ailleurs, par la garde (présence de la règle) et par le test unitaire (la règle refuse).
- [ ] **AC2** — Sur chaque champ de la famille I, sur chaque borne qui passe par `DateBoundaryFilter`, et sur
  `RangeFilter` (selon le cast de la colonne),
  « 99999-01-01 » et « 12/11/2026 » rendent 422. Une date seule et un instant ISO restent admis
  (`ActivityLogEndpointTest` reste vert sans changement).
- [ ] **AC3** — Toute valeur `AAAA-MM-JJ` d'un jour qui existe, d'une année de 1970 au plafond retenu, reste
  acceptée, et le jour stocké est celui
  envoyé. Aucun écran du front ne voit un refus neuf sur un parcours de saisie.
- [ ] **AC4** — La garde rougit sur une `date` nue : ni `JourIso` ni `InstantIso`, dans un FormRequest, quelle que
  soit la colonne, ou dans un tableau de règles hors FormRequest. Prouvé par ablation.
- [ ] **AC5** — Un lien de recherche publique dont `available_from` vaut « 12/11/2026 » ou « 2026-02-30 » affiche
  les résultats sans ce critère, et non une erreur ni « 0 bien trouvé ».
- [ ] **AC6** — La mesure des recherches sauvegardées est écrite dans les notes, avec la base, la date et le
  compte. Un compte non nul a été signalé avant la fusion.

## Hors périmètre

- **Les champs déjà en `date_format:Y-m-d`** : `offer_expires_at`, `starts_on`/`ends_on` d'indisponibilité,
  `date` de créneau de visite, `expires_at` KYC, les bornes de `BoostStats`, de disponibilité publique et de
  rapprochement bancaire. Ils refusent déjà les formes relues de travers. Ils acceptent « 0099-01-01 », mais la
  plupart sont bornés par `after:today` ou une borne haute. Les passer à `JourIso` serait un ticket à part,
  s'il est voulu.
- **Les bornes de rapport** (`GrowthReporting`, `RevenueReporting`, `ReportExport`) : déjà sous `InstantIso`
  (TCK-2752).
- **Un retour lisible sur les écrans du personnel** qui relaient une valeur d'URL tapée à la main (historique des
  paiements, liste des biens) : une valeur mal formée y rend désormais 422 au lieu d'un mauvais jour.
  L'affichage de ce refus n'est pas traité ici.
- **Le fuseau de `DateBoundaryFilter::normalize()`** (`Carbon::parse` sans fuseau de Dakar) et le nom de fichier
  de l'export d'activité, qui recopie la borne telle quelle : ni l'un ni l'autre ne change ici.
- **Une date reçue sous un autre nom que sa colonne, ou une règle construite par une méthode** : la garde lit par
  nom de champ et par jeton, comme celles de TCK-2743 et TCK-2752.

## Notes d'implémentation

_2026-11-13, sur `feat/audit-ux-app-lot-2` (relevé sur d23dde767)._

**Prémisse re-mesurée.** Le recensement tient : 41 champs `date` nus dans les FormRequests (36 jours, 5 instants)
et 3 occurrences hors FormRequest (`DateBoundaryFilter::exiger`, `RangeFilter`, `SavedSearchCriteria`). Avant la
règle, le test HTTP rendait 20 rouges : « 99999-01-01 », « 0099-01-01 », « 12/11/2026 » et un instant passaient
sur les quatre écrivains et le calendrier.

**Ce qui est posé.**

- `App\Rules\JourIso` : `\A(\d{4})-(\d{2})-(\d{2})\z`, `checkdate`, années de `InstantIso::ANNEE_MIN` (lu par
  référence) à `JourIso::ANNEE_MAX`. `estAdmis()` est statique, pour qu'un lecteur hors validation l'emploie.
- **Plafond : 2199, décision du porteur du 2026-11-13 (option b, plancher 1970)** (baux emphytéotiques de 99 ans, cf.
  « Contraintes strictes »). C'est une seule constante côté API, et une côté front (`ANNEE_MAX_DE_L_API` de
  `src/lib/jour-de-l-api.ts`). Un test de parité lit la constante PHP depuis le test front : changer l'une sans
  l'autre fait rougir le test.
- Libellé `validation.rules.jour` en `fr`/`en`/`wo` (wo = français), avec `:min` et `:max`.
- Famille J sur 36 champs et `SavedSearchCriteria`. Famille I sur `IndexAuditLogRequest` (`from`, `to`),
  `ExportActivityLogRequest` (`filter.date_from`, `filter.date_to`), `published_after` et `DateBoundaryFilter`.
  `RangeFilter` suit le cast de la colonne. Les deux règles en chaîne de `SearchPublicPropertyRequest` sont
  réécrites en tableau, et le commentaire TCK-335 est gardé.
- Garde `InstantRecuConvertiTest::test_aucune_date_recue_n_est_nue`, plus son test de lecture des formes. Elle lit
  tout `app/` : la valeur d'un `=>` et chaque branche d'un `?:`. Elle exclut `$fillable`, les arguments d'`upsert`,
  `in_array` et `return`. Elle épingle les trois occurrences hors FormRequest et exige plus de 80 tableaux de
  règles relevés. Mes blocs y sont marqués TCK-2768, car le fichier est partagé avec TCK-2743 et TCK-2752.
- Front : `estUnJourDeLApi()` dans `src/lib/jour-de-l-api.ts`.
  - `parametresDeRecherche` écarte un `available_from` refusé (étape 4 de son docblock). Le rendu serveur, le
    client et `/map` passent tous par lui.
  - `SEARCH_FILTER_KEYS.available_from.lire` rend `undefined` sur une valeur refusée. Aucune puce ne s'affiche,
    et `filtersToCriteria` ne l'enregistre pas.
  - Le rejeu d'une recherche sauvegardée passe par `/properties?…`, donc par le même filtre.

**Tests.**

- `tests/Unit/Rules/JourIsoTest.php` : 29 verts.
- `tests/Feature/Validation/JourIsoRecuTest.php` :
  - quatre écrivains × quatre formes, puis le jour stocké ;
  - un bail jusqu'en 2125 accepté ;
  - le calendrier ;
  - le journal (`filter[date_from]` et `from`) ;
  - `published_after` ;
  - `RangeFilter` sur une colonne `date` (`/api/admin/payouts`) et sur un horodatage (`/api/contact-leads`).
- La garde et son test de lecture.
- Front : `src/lib/__tests__/recherche-publique.jour-admis.tck-2768.test.ts`, 4 verts. Il couvre la règle, la
  requête, le critère enregistré et la parité des bornes avec le PHP.
- `ActivityLogEndpointTest` est vert **sans changement**, ce qui prouve que la famille I garde l'instant.

**Voisins.** Côté API, 254 fichiers de test qui postent ou lisent l'un des champs ont été joués en 11 lots par
`creneau.sh` : environ 2 490 tests, tous verts. **Aucun test voisin n'a eu à changer** : aucun ne postait un
Carbon, un instant ou une forme relue sur un champ de la famille J. Les tests de parité de `lang` et
`BaseFormRequestNormalizationTest` sont verts. Côté front : les 41 fichiers de test qui importent l'un des modules
touchés (`jour-de-l-api`, `recherche-publique`, `types/search`, `SaveSearchButton`) ou nomment `available_from`,
plus `useSearch*`, sont verts : 620 tests. ESLint passe sur les quatre fichiers. `tsc --noEmit` ne signale qu'une
erreur, dans `.next/types/validator.ts` : c'est un artefact périmé de `next dev` qui vise
`app/owners/page.js`, déplacé sous `(liste)`, et ce n'est pas ce ticket.

**Ablations** (chacune rouge, puis restaurée et vérifiée par md5) :

- Dans la règle :
  - bornes retirées : 3 rouges ;
  - `\z` remplacé par `$` : 1 rouge ;
  - `checkdate` retiré : 3 rouges ;
  - non-chaîne admise : 2 rouges.
- Placement de la règle :
  - `JourIso` retiré de `RadarObservatoryRequest.filter.since` : la garde rougit ;
  - `JourIso` retiré de `StoreLeaseRequest.start_date` : 4 rouges HTTP ;
  - `InstantIso` retiré de `DateBoundaryFilter` : rouge ;
  - règle retirée de `RangeFilter` : rouge ;
  - branche horodatage de `RangeFilter` passée à `JourIso` : rouge ;
  - `IndexAuditLogRequest.from` : rouge ;
  - `published_after` : rouge.
- Dans la garde :
  - lecture hors FormRequest neutralisée : rouge ;
  - ternaire non lu : 2 rouges ;
  - compte des formes neutralisé : le test de lecture rougit ;
  - `'nullable|date'` remis en chaîne : la garde rougit.
- Au front :
  - filtre réduit à la seule forme : 3 rouges, dont `2026-02-30` ;
  - jour réel retiré, bornes gardées : 3 rouges ;
  - `parametresDeRecherche` sans filtre : 1 rouge ;
  - `lire` nu : 1 rouge ;
  - plafond du front à 2100 : 2 rouges (la règle et la parité).

**AC6 : mesure des recherches sauvegardées** (lecture seule, transaction `READ ONLY`, script
`JourIso::estAdmis`).

- Base de démo `takussan` (PostgreSQL :5433), le 2026-11-13 : 57 recherches sauvegardées, **0** portent
  `available_from`, donc **0** seraient refusées.
- La préproduction est mesurée par la session, pas ici.

**Limites.**

- Le plafond (2199) est tranché par le porteur le 2026-11-13. Le changer, c'est changer deux constantes, que lie un test.
- La garde lit par nom de champ et par jeton. Une règle construite par une méthode lui échappe, comme pour
  TCK-2743 et TCK-2752.
- Un écran du personnel qui relaie à la main une date d'URL mal formée rend désormais 422 au lieu d'un mauvais jour
  (hors périmètre).
- Au front, seul `available_from` est filtré : c'est le seul jour qu'une URL publique porte jusqu'à l'API.

### Reprise r1 et q1 (vérification de 7981e617d, 2026-11-13)

**r1 : `date_format:Y-m-d` échappait à la règle et à la garde.** Ce format refuse les formes relues de travers, mais
admet toute année à quatre chiffres. Mesuré par la vérification : `POST /api/properties/{id}/unavailabilities` avec
`starts_on=0001-01-01` → 201, écrit tel quel.

- **20 règles reçoivent `new JourIso` juste après le format** : les 19 des FormRequests (dont le versement
  `paid_at`, construit dans une variable locale) et `filter.day` de `PropertyVisit`.
  - Écrivains : indisponibilité (`starts_on`, `ends_on`), offre (`offer_expires_at`, publique et du personnel),
    pièce KYC (`expires_at`), versement de commission (`paid_at`), visite publique (`date`).
  - Lectures : créneaux de visite, disponibilité publique, indisponibilités, relevés bancaires, tableau de bord
    IA, statistiques de boost, `filter[day]` des visites.
- **Prémisse différente sur `paid_at`.** L'an 1 n'y était pas écrit : le service le refuse par
  `commission.paid_before_earned`, et `earned_at` est NOT NULL. Il passait la validation et atteignait le service.
  Il est désormais refusé à la validation, sur `paid_at`.
- **La garde lit maintenant `date_format`.**
  - L'élément `'date_format:Y-m-d'` exige `new JourIso`, et `InstantIso` seul ne suffit pas : c'est un jour.
  - Un tableau posé dans une variable (`$paidAt = [...]`) est lu. Une déclaration de propriété (`$fillable`,
    `$guarded`) ne l'est pas.
  - Une règle en chaîne `'…|date_format:Y-m-d'` rougit.
  - Les deux `date_format:Y-m` (des mois : `CommissionSummaryRequest.month`, `ShowTeamPerformanceRequest.period`)
    sont épinglés dans `FORMATS_HORS_JOUR`. Tout autre `date_format` neuf rougit jusqu'à ce qu'on décide de sa forme.
  - Nouveau plancher : au moins 19 tableaux en `date_format:Y-m-d` lus.
  - La clé `'date_format'` du mappage CSV bancaire n'est pas lue comme une règle.
- **Test HTTP** : `tests/Feature/Validation/JourIsoFormatRecuTest.php`, 8 tests.
  - Indisponibilité : l'an 1 et 1969 rendent 422, rien n'est écrit, et un jour admis est relu.
  - Solde de commissions (`/api/commissions/settle`) : l'an 1 et 1969 rendent 422 sur `paid_at`.
  - Offre publique : 9999-12-31 et 2200-01-01 rendent 422, rien n'est écrit, et un jour admis est relu.
  - Pièce KYC : 9999 et 2200 rendent 422, un jour admis passe.

**q1 : le rejeu des recherches sauvegardées.** `PropertySearchService::buildFilter`, que suivent l'alerte e-mail
(`alertMatches`) et le compte de résultats (`search`), n'applique `available_from` que si `JourIso::estAdmis()` l'admet.
Une valeur ancienne (« 99999-01-01 », « 12/11/2026 ») est ignorée, comme au front, au lieu d'être relue en 2009 ou au
11 décembre. Test : `tests/Feature/Search/AlerteRejoueeJourIsoTest.php` (5 valeurs refusées, plus un jour admis
rejoué tel quel). `FiltresDeLaCarte` n'est pas touché : la carte ne reçoit que des valeurs validées
(`MapPublicPropertyRequest` hérite de `SearchPublicPropertyRequest`).

**Ablations** (chacune rouge, puis restaurée et vérifiée par md5) :

- Écrivains : `JourIso` retiré de l'indisponibilité, de l'offre publique, de la pièce KYC et de `paid_at`. Chaque
  fois, 2 rouges HTTP.
- Garde :
  - `JourIso` retiré de `PropertyVisit.filter.day`, de `BoostStatsRequest.from` et de `paid_at` (variable locale) ;
  - `JourIso` remplacé par `InstantIso` sur la pièce KYC ;
  - un `Y-m` passé en `Y-m-d` sans `JourIso`.
- Lecture de la garde :
  - `date_format` non lu, qui fait aussi rougir le plancher du test principal ;
  - `InstantIso` admis après `date_format:Y-m-d` ;
  - affectation à une variable non lue ;
  - déclaration de propriété lue ;
  - règle en chaîne `date_format` non vue ;
  - formats hors jour non relevés.
- q1 : le rejeu sans `JourIso::estAdmis` rend 5 rouges.

**Reste.** `date_format:Y-m` (les mois) admet encore l'an 1. Ces champs ne sont lus qu'au mois et ne s'écrivent nulle
part, d'où l'épingle plutôt qu'une règle.

### Reprise q2 : écrans de la console qui relaient une date lue dans l'URL

**Ce qui change pour l'utilisateur.** Depuis la règle, un favori ou un lien copié qui porte une date mal formée
(« 12/11/2026 », « 2026-02-30 », « 0001-01-01 ») recevait un 422, et l'écran affichait une liste vide sans rien
dire. Désormais, chaque écran ignore la borne que l'API refuserait et reprend son défaut, comme la recherche publique
écarte un `available_from` refusé. Le seul juge est `jourDeLApiOuRien()` (`src/lib/jour-de-l-api.ts`, la règle de
`JourIso` au front). `estMois()` borne les années de la même façon.

| Écran | Paramètres d'URL | Avant | Test |
|---|---|---|---|
| Journal d'activité (`AuditTrail`) | `from`, `to` | forme seule : « 2026-02-30 » partait | `AuditTrail.jour-admis.tck-2768.test.tsx` |
| Historique des paiements (`PaymentsHistoryTable`) | `date_from`, `date_to` | relayés tels quels | `PaymentsHistoryTable.jour-admis.tck-2768.test.tsx` |
| « Argent », registre des encaissements (`bornesDesEncaissements`), et son lien d'export qui en dérive | `date_from`, `date_to`, `period` | relayés tels quels ; « 0001-01 » donnait `0001-01-01` | `lib/finances/__tests__/jour-admis.tck-2768.test.ts` |
| Liste des biens (`/app/properties`) | `created_from`, `created_to` | relayés tels quels | `properties/(liste)/__tests__/bornes-de-creation.tck-2768.test.tsx` |
| Agenda (`CalendarPage`) | `date` | jour réel, sans borne d'années | `CalendarPage.jour-admis.tck-2768.test.tsx` |
| Le mois (`estMois`) : « Argent » `period`, commissions `mois`, rapprochement `period`, fiche du bailleur | `period`, `mois` | forme seule : « 0001-01 » admis | `lib/finances/__tests__/jour-admis.tck-2768.test.ts` (`estMois`, `moisAffiche`, `vueDesCommissions`) |

**Ce qui n'a pas de test d'écran.** Le rapprochement (`ResteARapprocher`) et la fiche du bailleur
(`owners/[id]`) n'ont rien à eux : ils lisent `period` par `estMois` seul. Ils sont couverts par le test d'`estMois`,
pas par un rendu de l'écran.

**Écartés après lecture :**

- `ExportForm` lit un formulaire, pas l'URL.
- La console super-admin des agences tient ses dates en état, pas dans l'URL.
- Les visites (`MesVisites`, `par-le-temps`), la journée et la boîte des demandes posent des bornes calculées.
- La route `/api/export/[entity]` relaie l'URL que l'écran a construite à partir de ses paramètres, désormais
  filtrés.
