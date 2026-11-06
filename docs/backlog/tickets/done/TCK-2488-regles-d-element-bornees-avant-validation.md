---
id: TCK-2488
title: Règles d'élément `.*` — une liste hors de sa borne ne fait pas valider ses éléments un à un
status: done
phase: P3
family: technique
estimate: S
wave: 82
created: 2026-11-06
updated: 2026-11-06
depends_on: [TCK-2483]
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
    - "docs/features.md#29-administration--configuration"
  models:
    - "docs/models-spec.md#2-agency"
tags: [back, validation, form-request, robustesse, suite-tck-2483]
---

## Objectif utilisateur

Qu'un appel qui envoie une liste démesurée reçoive son 422 sur la borne de la liste, vite et en
quelques octets, au lieu de faire travailler l'API sur chaque élément d'une liste déjà refusée.

## Contrat de données

Aucun endpoint, aucune colonne, aucun code d'erreur neuf. Ce qui change, pour un corps dont une liste
dépasse sa borne : la réponse 422 ne porte plus que l'erreur de la liste (`x`), et plus celles de ses
éléments (`x.0`, `x.1`… `x.N`). Un corps valide, ou invalide pour une autre raison, rend exactement ce
qu'il rendait.

## Contraintes strictes (métier)

Constat (revue de TCK-2483, M1) : Laravel applique les règles d'élément (`x.*`, `x.*.y`) à chaque
élément reçu, **même après l'échec de `max:N` sur le parent**. Mesuré sur `settings.hidden_modules` :
20 000 éléments → 29 s de CPU et 2 Mo de 422, y compris depuis un hôte. TCK-2483 l'a corrigé pour
cette seule clé (`AgencySettings::rules($input)`) ; la revue relevait 56 autres règles `.*` dans
`app/Http/Requests` qui gardent la forme.

Décision (session, 2026-11-06) :

1. **UN mécanisme commun aux FormRequest**, pas un correctif par requête : pour une clé `x.*…` dont le
   parent `x` porte `array` et `max:N`, les règles d'élément ne sont pas appliquées quand la valeur
   reçue dépasse N ; le parent rend alors son 422 seul. Deux autres refus d'office du parent, relevés
   au recensement, suivent la même règle (écart écrit au brief) : `array:k1,…,kN` reçu avec une clé
   hors liste (`UpdateMeRequest`, `navigation.personas` : sinon des milliers de personas inconnues
   font juger chacune) et `prohibited` reçu non vide (`hidden_modules` d'une agence `individual`,
   qu'exige le point 3).
2. Ne retirer une règle d'élément **que lorsque le parent échoue de toute façon** : la réponse reste
   un 422, et `validated()` d'un corps valide est inchangé. Un parent qui porte un `exclude*` n'entre
   pas dans le mécanisme (il peut ne pas être jugé).
3. Le cas particulier `AgencySettings::rules($input)` passe sur ce mécanisme s'il le couvre — y
   compris l'agence `individual`, où `settings.hidden_modules` est `prohibited`.
4. **Aucune borne métier inventée** : un parent `.*` sans `max:` est listé ici, pas borné. Les bornes
   se proposent en suite.

## Delta à produire

- [x] `App\Support\ReglesDElementBornees::retirer(array $rules, array $data): array` — fonction pure :
      pour chaque préfixe générique d'une clé (`a.*.b.*.c` → `a`, `a.*.b`), lit les instances du
      parent dans `$data` ; si l'une est refusée d'office par les règles du parent, la clé est retirée.
- [x] `App\Http\Requests\Concerns\BorneLesReglesDElement` — trait qui surcharge `validationRules()`
      du FormRequest et passe ses règles par la fonction, sur `validationData()`.
- [x] `BaseFormRequest` porte le trait ; les FormRequest qui étendent encore `FormRequest` en direct
      (TCK-730) et portent une règle `.*` bornée le portent aussi.
- [x] `AgencySettings::rules()` perd son paramètre `$input` et sa condition ;
      `AgencyUpdateRequest` cesse de lui passer les `settings` reçus.
- [x] Tests : `tests/Unit/Support/ReglesDElementBorneesTest.php` (la fonction) ;
      `tests/Feature/Validation/ReglesDElementBorneesTest.php` (un échantillon par HTTP, et le
      recensement de toutes les FormRequest).

## Critères d'acceptation

- [x] AC1 — Fonction : une clé `x.*` est retirée quand `x` porte `max:N` et reçoit N+1 éléments, et
      gardée à N éléments, à `null`, absente ou non tableau. Même chose pour chaque préfixe d'une clé
      à plusieurs `.*`, et pour les clés `x.*.y`. Idem pour `array:k…` reçu avec une clé hors liste,
      et `prohibited` reçu non vide. Un parent sans borne, ou qui porte un `exclude*`, ne retire rien.
- [x] AC2 — Échantillon HTTP, une requête par famille (base / directe ; liste de scalaires ; liste
      d'objets `x.*.y` ; `.*` imbriqué) : N+1 éléments invalides → 422 dont `errors` n'a QUE la clé du
      parent ; N éléments dont un invalide → l'erreur d'élément est encore rendue.
- [x] AC3 — `settings.hidden_modules` : les deux tests de TCK-2483 (`test_une_liste_hors_borne_ne_valide_pas_ses_elements`,
      standard ET `individual`, et `test_une_liste_dans_sa_borne_valide_encore_ses_elements`) restent
      verts une fois `AgencySettings::rules($input)` retiré.
- [x] AC4 — Recensement : un test parcourt toutes les FormRequest concrètes de `app/Http/Requests`,
      joue leurs `rules()`, et pour chaque clé `.*` dont tous les préfixes sont bornés, vérifie PAR LA
      REQUÊTE ELLE-MÊME (son `validationRules()` sur un corps hors borne) que la clé tombe. Une clé
      `.*` à parent non borné qui n'est pas dans la liste figée rougit ; une entrée de la liste qui
      n'a plus la forme rougit (liste expirante). Une requête dont `rules()` ne se joue pas hors
      contexte est listée nommément, et sa source ne porte aucune clé `.*`.
- [x] AC5 — Ablations : retirer le trait de `BaseFormRequest`, puis d'une requête directe, puis
      neutraliser la fonction → les tests ci-dessus rougissent ; restauré → verts.
- [ ] AC6 — Suites par la CI.

## Hors périmètre

- ~~**Les parents `.*` sans borne**~~ — **bornés par la revue adverse** (§ Revue adverse ci-dessous,
  décision de la session : pas de liste expirante). Relevé d'origine (29 clés, 22 parents) : `StoreAgentHandoverRequest` `successors` (+ `exists` par élément) ;
  `SyncCapabilitiesRequest` `capabilities` ; `Store/UpdateAlertRuleRequest` `channels`,
  `recipients.emails`, `recipients.webhooks` ; `Store/UpdateAnnouncementRequest` `segment.roles`,
  `segment.agency_ids` (+ `exists` par élément) ; `UpdateFeatureFlagRequest` `segments.roles`,
  `segments.agency_ids` ; `UpdateRadarCrawlSourceRequest` `start_urls` ; `IndexCalendarRequest`
  `property_ids`, `types` ; `UpdateAvailabilityServiceProviderProfileRequest` `available_slots` ;
  `UpdateSpecializationAgentProfileRequest` `intervention_zones` ;
  `UpdateTradesServiceProviderProfileRequest` et `InviteServiceProviderRequest` `trades`,
  `intervention_zones` ; `ReorderPropertyMediaRequest` `order` ; `SyncPropertyTagRequest` `tag_ids` ;
  `AttachCustomerTagsRequest` `tags` ; `RefundDepositRequest` `attachments`.
- ~~Le validateur ad hoc de `PlatformSettingService`~~ — traité en suite de la revue adverse
  (§ Revue adverse, « currency.supported »).
- Passer les FormRequest directes sur `BaseFormRequest` (TCK-730).

## Notes d'implémentation

**Relevé (2026-11-06)**, par appel réel de `rules()` de chaque FormRequest concrète, hors contexte
(route et compte nuls) : 322 FormRequest, **103 clés `.*`** — 74 dont tous les préfixes sont bornés
(33 requêtes), 29 à parent sans borne (22 parents, 18 requêtes, liste en Hors périmètre). Le chiffre
de la revue (« 56 ») venait d'un `grep` des sources ; le relevé joue les règles, clés construites et
traits compris. 7 requêtes ne se jouent pas sans route ni compte (bien de route, agence du compte,
nom de route) : aucune ne porte de clé `.*` (source et traits), le recensement le vérifie.

**Mécanisme.** `App\Support\ReglesDElementBornees::retirer($rules, $data)` (pure) + trait
`App\Http\Requests\Concerns\BorneLesReglesDElement`, qui surcharge `validationRules()` — le seul point
où le FormRequest passe ses règles au validateur, après `prepareForValidation()`. Un trait et non le
seul `BaseFormRequest` : **7 requêtes directes** (TCK-730) portent des clés bornées (UpdateMe,
InventoryStore/Update, SubmitQuote, PropertyBulkArchive/Assign/Visibility) ; elles le portent aussi.

**Écarts à la décision.**
- Deux refus d'office du parent en plus de `array`+`max:N` (écrits au § Contraintes) : `array:clés`
  avec une clé hors liste — sans lui, `navigation.personas` de `PATCH /api/me` (tout compte connecté)
  reste non borné : des milliers de personas inconnues étaient jugées chacune ; et `prohibited` non
  vide — sans lui, retirer `AgencySettings::rules($input)` faisait régresser le cas `individual` de
  TCK-2483 (ablation A4 : il rougit).
- `list` compte comme `array` (`navigation.personas.*.epingles` porte `list` + `max:5`, sans `array`).
- Une clé à plusieurs `.*` est jugée sur CHAQUE préfixe ; pour un préfixe générique, une seule
  instance refusée suffit à retirer la clé pour toutes : la requête échoue de toute façon sur elle.
  Les erreurs d'élément des AUTRES instances ne sont alors plus rendues — seul effet observable hors
  de la liste fautive.
- Un parent qui porte `exclude*` n'entre pas dans le mécanisme (il peut ne pas être jugé).

**Sûreté (le parent échoue vraiment).** Le recensement ne se contente pas de vérifier que la clé
tombe : pour chacune des 74 clés et chacun de ses parents, il construit le corps hors borne et vérifie
que `Validator::make` sur la seule règle du parent ÉCHOUE — sinon retirer la règle d'élément laisserait
passer des éléments. Et sur un corps vide, la clé reste (le mécanisme ne retire pas trop).

**AgencySettings.** `rules()` perd `$input`, sa condition et la clé `max` du catalogue ;
`AgencyUpdateRequest` appelle `AgencySettings::rules()`. Les deux tests hors borne de TCK-2483
(standard, individual) et celui dans la borne restent verts. Coordination avec `suites-agence`
(TCK-2487 touchait le même fichier) : leur hunk commité d'abord (a9327a64c), puis le mien par chemin.

**Ablations** (script unique mutation → tests → restauration, `git status` propre ensuite) :
témoin 31/31 vert · A1 trait retiré de `BaseFormRequest` → 4 rouges (HTTP de base, recensement,
hidden_modules standard + individual) · A2 trait retiré de `PropertyBulkArchiveRequest` → 2 rouges
(HTTP directe, recensement) · A3 fonction neutralisée → 13 rouges · A4 refus `prohibited` retiré →
2 rouges (unitaire, hidden_modules individual) · A5 refus `array:clés` retiré → 3 rouges (unitaire,
HTTP navigation, recensement) · A6 un seul préfixe jugé → 3 rouges · restauré 31/31.

**Tests joués** (2026-11-06, 8 cœurs) : `impacted-tests --connus` sélectionne ~760 classes (le trait
est sur `BaseFormRequest` : presque toute la suite) — au-delà de 9 min, donc remplacé par 136 classes
ciblées (toute classe qui asserte une erreur d'élément indexée, `tests/Feature/Validation/*`, et celles
des endpoints à listes bornées), en trois lots : 553 + 438 + 839 tests verts (241 s, 226 s, 388 s ;
load 6,70/6,24/4,49 puis 5,26/5,27/4,46 puis 4,65/4,58/4,32). Gardes du dépôt : aucune rouge. Pint
propre.

**Suites proposées** : borner les 22 parents du Hors périmètre (une borne métier chacun ; priorité aux
deux qui font une requête SQL par élément : `successors.*` et `segment.agency_ids.*`) ; appliquer la
fonction aux deux validateurs ad hoc (`JugeLaLigneDeReglageDAgence`, `PlatformSettingService`), où
`currency.supported` n'a pas de `max:`.

Commits : 5f5e385b9 (ticket), be3de102c (mécanisme), f6a85b734 (AgencySettings).

## Revue adverse (2026-11-06)

**I1 (important) — le recensement ne voyait pas les clés `.*` posées sous condition de l'entrée.**
`UpdateNotificationPreferencesRequest` ne pose `preferences.*` que si le corps porte `preferences` ;
le recensement jouait `rules()` sur un corps vide. Mesuré par la revue : `PATCH
/api/me/notification-preferences`, tout compte connecté, 5000 éléments → 15 000 erreurs, 1,26 Mo,
4,8 s. Correctif : le recensement relève les clés `.*` écrites en littéral dans la source (classe,
parents jusqu'à `BaseFormRequest`, traits ; hors `messages()`/`attributes()`), joue `rules()` aussi
sur un corps DÉCLENCHEUR qui porte le premier parent de chacune (à `[]`), et une clé littérale
qu'aucun des deux ne rend rougit (test `…ecrite_dans_la_source_est_jouee…`). Le premier passage a
révélé, outre `preferences.*` ×3, le validateur ad hoc `JugeLaLigneDeReglageDAgence` (`value.*`,
`Validator::make` dans un trait de requête) : il passe désormais lui aussi par
`ReglesDElementBornees::retirer()` (test HTTP `POST /api/settings`, 11 décalages invalides → une
seule erreur), et le recensement accepte une clé littérale non jouée seulement dans un porteur qui
appelle lui-même la fonction.

**Bornes (décision de la session) : `NON_BORNES` disparaît, toute clé `.*` a un parent borné**
(test `toute_cle_d_element_a_des_parents_bornes`). (a) liste fermée → borne calculée depuis la
source ; (b) borne technique ≥ 10× le plus grand envoi légitime relevé dans `takussan-web/src` ;
(c) aucun appelant ni limite → 1000. Chaque borne (b)/(c) porte son relevé en commentaire d'une ligne.

| Requête | Parent | Borne | Fam. | Source de la borne |
|---|---|---|---|---|
| `UpdateNotificationPreferencesRequest` | `preferences` | `count(EVENTS) × count(CHANNELS)` | a | `PreferenceResolver` ; la matrice envoie une cellule à la fois |
| `SyncCapabilitiesRequest` | `capabilities` | `count(Capability::cases())` | a | l'enum |
| `StoreAgentHandoverRequest` | `successors` | `count(AgentPortfolio::TRANSFERABLE)` | a | catégories transférables (l'`after()` garde l'erreur `successors.{inconnue}`) |
| `Store/UpdateAlertRuleRequest` | `channels` | `count(AlertRuleRequest::CHANNELS)` | a | constante neuve, lue aussi par `Rule::in` |
| `IndexCalendarRequest` | `types` | `count(CalendarEventCollector::TYPES)` | a | le collecteur |
| `UpdateRadarCrawlSourceRequest` | `start_urls` | `10 × RadarStartUrls::maxCount()` | b | au-delà de `maxCount()`, le refus codé `start_urls_too_many` de `passedValidation()` reste |
| `UpdateAvailabilityServiceProviderProfileRequest` | `available_slots` | 500 | b | `AvailabilityGrid.tsx` : 7 jours × 3 périodes = 21 |
| `UpdateTradesServiceProviderProfileRequest`, `InviteServiceProviderRequest` | `trades` | 100 | b | `TradesMultiSelect` : 7 métiers |
| `Store/UpdateAnnouncementRequest` | `segment.roles` | 100 | b | 5 cases (`announcements.tsx`) ; `profileTypes()` ≤ 7 slugs |
| `UpdateFeatureFlagRequest` | `segments.roles` | 100 | b | saisie libre ; `profileTypes()` ≤ 7 slugs |
| `SyncPropertyTagRequest` | `tag_ids` | 500 | b | le formulaire coche parmi tous les équipements (35 au jeu de démo) |
| `AttachCustomerTagsRequest` | `tags` | 100 | b | `CustomerTagPicker` envoie une étiquette |
| `ReorderPropertyMediaRequest` | `order` | 1000 | b | aucun plafond de photos par bien (lots de 20 ; 6 au plus au jeu de démo) |
| `Store/UpdateAnnouncementRequest` | `segment.agency_ids` | 1000 | b | sélection multiple paginée, sans limite (une requête `exists` par élément) |
| `Store/UpdateAlertRuleRequest` | `recipients.emails`, `recipients.webhooks` | 1000 | b | saisie libre par virgules, sans limite (un envoi HTTP par webhook) |
| `UpdateSpecializationAgentProfileRequest`, `UpdateTradesServiceProviderProfileRequest`, `InviteServiceProviderRequest` | `intervention_zones` | 1000 | b | saisie libre, sans limite d'interface |
| `UpdateFeatureFlagRequest` | `segments.agency_ids` | 1000 | c | le front ne fait que renvoyer la liste posée |
| `IndexCalendarRequest` | `property_ids` | 1000 | c | aucun appelant (le front envoie `property_id`) ; en GET, `max_input_vars` = 1000 coupe déjà |
| `RefundDepositRequest` | `attachments` | 1000 | c | aucun appelant (le front envoie `uploads[]`) |

Deux requêtes directes nouvellement bornées portent le trait `BorneLesReglesDElement` :
`StoreAgentHandoverRequest`, `AttachCustomerTagsRequest`.

**Tests** (`tests/Feature/Validation/ReglesDElementBorneesTest.php`) : un échantillon HTTP par
famille — (a) préférences (borne + 1 → seul `preferences` ; la matrice entière → 200), (b) ordre des
photos, (c) agences d'un drapeau ; bornes LUES dans les règles, jamais recopiées — et le
recensement. Rouge avant : 5 échecs (32 clés non bornées, dont `preferences.*` ×3 ; les trois HTTP ;
`value.*` inaperçue).

**Ablations** (`abl-2488-corr.sh`, mutation → tests → restauration ; `git status` ensuite : rien de
laissé) : témoin 11/11 · A1 borne des préférences retirée → 2 rouges (HTTP (a), parents bornés) ·
A2 corps déclencheur neutralisé → 1 rouge (clés de la source jouées) · A3 = A1 + A2, la situation de
la revue → 2 rouges · A4 lecture de la source neutralisée + préférences sans borne → seul le test
HTTP (a) rougit (le croisement avec la source est ce qui rend le recensement sensible) · A5
validateur ad hoc sans la fonction → 2 rouges · A6 borne (b) `order` retirée → 2 rouges · A7 trait
retiré d'`AttachCustomerTagsRequest` → 1 rouge · A8 borne (a) `capabilities` retirée → 1 rouge ·
A9 borne (c) `segments.agency_ids` retirée → 2 rouges · restauré 11/11.

**Tests joués** (2026-11-06, 8 cœurs, load 2,1 à 2,5) : 113 classes qui frappent les endpoints
touchés ou leurs requêtes, plus les 7 autres de `tests/Feature/Validation/`, en quatre lots :
338 + 336 + 325 + 87 tests verts (123 s, 146 s, 106 s, 19 s). Pint propre, gardes du dépôt vertes.

Commit : 5c0aa8106.

**Suite de la revue — `currency.supported` (`PlatformSettingService`).** Dernière liste dont les
éléments sont jugés sans borne : (a) liste fermée → `max:count(EditablePlatformSettings::CURRENCIES)`.
`PlatformSettingService::validateKey()` passe ses règles par `ReglesDElementBornees::retirer()`, comme
`JugeLaLigneDeReglageDAgence`. Deux tests au recensement : HTTP `PATCH /api/admin/settings` (devises
hors borne → une seule erreur ; dans la borne, l'élément invalide est encore jugé) et
`tout_reglage_editable_dont_les_elements_sont_juges_a_une_borne` (toute définition du catalogue qui
porte `item_rules` a un parent borné). Rouge avant : 2 échecs. Ablations (`abl-2488-corr2.sh`) :
borne retirée → 2 rouges ; fonction retirée du service → 1 rouge ; restauré vert. Tests joués : le
lot de 73 classes ci-dessus (TCK-2487), 632 verts. Commit : 279e99386.

⚠ Relevé en passant, non corrigé (hors de ce lot) : l'`after()` de `validateKey()` fait
`array_map('strtoupper', $value)` sur `currency.supported` ; un élément non scalaire (`[["x"]]`)
lèverait une `TypeError` (500) au lieu d'un 422 — à vérifier.

