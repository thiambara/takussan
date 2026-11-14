---
id: TCK-2779
title: "GET /api/property-visits respecte `fields[property_visits]`, et ne rend chaque colonne sensible qu'au lecteur qui la lit"
status: done
phase: P2
family: back
estimate: M
wave: 90
created: 2026-11-13
updated: 2026-11-14
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
  models:
    - "docs/models-spec.md#17-propertyvisit-"
tags: [back, visites, sparse-fieldsets, confidentialite, suite-de-tck-2585]
---

## Objectif utilisateur

Un écran qui demande quatre colonnes de visites n'en reçoit que quatre. Aucun lecteur ne reçoit le téléphone,
l'e-mail, la fiche client ou les notes d'une visite qu'il n'a pas à lire, même quand ces champs ne lui sont pas
demandés.

## Contrat de données

**Décision.** Porteur, 2026-11-13, liste du soir n° 23 : ticket de suivi. Relevé par terrain-10 sur b7ada07ad.

**Constat, relu sur l'arbre du 2026-11-13.**

- La bande de semaine de « Ma journée » (b7ada07ad) demande
  `fields[property_visits]=id,scheduled_at,status,preferred_window` et reçoit 22 clés par visite.
- `PropertyVisit::buildQuery()` passe bien `fields` à spatie, qui restreint le `SELECT`. Mais
  `PropertyVisitResource::toArray()` rend une liste fixe de clés, sans lire `fields`.
- Ces clés vont de `visitor_name`, `visitor_phone`, `visitor_email`, `customer_id`, `cancellation_reason`,
  `feedback` et `rating` jusqu'à `visitor_display`, `notes` et `metadata` (sous `outilDeLaConsole`).
- Deux sortes de clés coexistent :
  - une colonne hors du `SELECT` sort à `null`, ce qui gonfle la réponse sans rien révéler ;
  - une clé **calculée** ne dépend pas du `SELECT` et peut sortir remplie : `visitor_display`, l'adresse sous
    `include=property` (`adresseLisible`), et les blocs `visitor` et `customer` sous `include=`.
- Le modèle existe déjà : `AppNotificationResource::requestedFields()` lit `fields.app_notifications`, garde `id`,
  et rend `array_intersect_key`.

**Endpoint touché :** `GET /api/property-visits`, et `GET /api/property-visits/{visit}` qui rend la même ressource.

## Contraintes strictes (métier)

- **Règle « sparse fieldsets obligatoires »** (CLAUDE.md) : la réponse ne contient que `id` et les clés demandées
  dans `fields[property_visits]`. Sans `fields`, elle reste celle d'aujourd'hui.
- **Une clé demandée n'ouvre aucun droit.** Les gardes d'aujourd'hui restent les seules juges de chaque valeur :
  `visiteurLisible` (nom, téléphone et e-mail du visiteur), `$fiche` (`customer_id`, bloc `customer`),
  `outilDeLaConsole` (`notes`, `metadata`) et `adresseLisible`. Demander `visitor_phone` ne le rend pas à un
  lecteur à qui la garde le refuse.
- **Une clé calculée suit la même règle** : `visitor_display` et l'adresse ne sortent que demandées, puis jugées.
- Les gardes ne se jugent pas sur le `SELECT` partiel. Si une garde lit une colonne que `fields` a retirée
  (`property_id`, `visitor_id`, `agent_id`…), elle la relit, comme `ficheJugeable()` de TCK-2759 r3. Un `fields`
  étroit ne doit ni ouvrir ni fermer un droit.
- Les colonnes que lit le front pour une vue se listent par la vue. Les appelants du front qui ne passent pas
  `fields` aujourd'hui ne sont pas changés par ce ticket.

## Delta à produire

- [ ] `PropertyVisitResource::requestedFields(Request)` : lecture de `fields.property_visits`, qui garde `id`
  et ne retient que les clés connues. `toArray()` rend l'intersection.
- [x] Les gardes qui lisent une colonne absente du `SELECT` la relisent, au plus une requête par page, en passant
  par `VisitReadContext::prime`.
- [x] Inventaire, écrit dans les notes du ticket, de chaque clé de la ressource × chaque lecteur. Les lecteurs sont
  le personnel de l'agence du bien, l'agent assigné, le bailleur du bien, le bailleur parti, le visiteur, le
  client de la fiche et le super-admin. Pour chaque case : rendu, `null`, ou absent. Le tableau est mesuré, pas
  déduit.
- [x] Tests `VisitesChampsDemandesTest` (sauf le premier point, qui suit AC1) :
  - un `fields` étroit rend exactement `id` plus les clés demandées ;
  - pour chaque lecteur, chaque clé sensible demandée explicitement sort `null` ou absente quand la garde la
    refuse ;
  - un `fields` qui retire `property_id` ne change aucun verdict.

## Critères d'acceptation

- [ ] AC1 — `GET /api/property-visits?fields[property_visits]=id,scheduled_at,status,preferred_window` rend, pour
  chaque ligne, exactement les clés `id`, `scheduled_at`, `status` et `preferred_window`.
- [x] AC2 — Pour un lecteur à qui `visiteurLisible` refuse la visite, `fields[property_visits]=id,visitor_name,visitor_phone,visitor_email,visitor_display`
  rend ces clés à `null`, ou absentes. Le test épingle la valeur, pas seulement la présence de la clé.
- [x] AC3 — Même chose pour `customer_id` (hors `$fiche`), et pour `notes` et `metadata` (hors outil de la console).
- [x] AC4 — Un lecteur qui a droit au téléphone du visiteur le reçoit quand il le demande, y compris sous un
  `fields` qui ne contient ni `property_id` ni `visitor_id`.
- [x] AC5 — Sans `fields`, la réponse est identique à celle d'avant le ticket, pour chacun des lecteurs de
  l'inventaire. C'est l'instantané des clés et des valeurs nulles.
- [x] AC6 — Le nombre de requêtes d'une page de 20 visites sous un `fields` étroit ne dépasse pas celui d'aujourd'hui
  sans `fields`.
- [ ] AC7 — Vérifié par ablation. Une ressource qui ignore `fields` rend AC1 rouge. Une garde jugée sur le `SELECT`
  partiel rend AC4 ou AC2 rouge.

## Hors périmètre

- Les autres ressources qui ignorent `fields` (un balayage général serait un autre ticket). Pour le bail et le
  locataire, voir TCK-2780.
- Changer qui a droit à quoi : ce ticket rend la réponse fidèle aux gardes d'aujourd'hui, il ne les redéfinit pas.

## Notes d'implémentation

### Mise en œuvre (back-3, 2026-11-13, sur 01080e6dc)

**La fuite, mesurée avant le correctif.** Le bailleur d'un bien d'agence, sous un `fields[property_visits]` sans
`customer_id`, recevait `visitor_name`, `visitor_phone` et `visitor_email` du client de l'agence ; sous
`include=visitor&fields[property_visits]=id,visitor_id`, le bloc `visitor` (e-mail, téléphone). Cause :
`ficheClientLisible` et `$visiteurLisible` lisaient `customer_id` sur la ligne rendue, et une colonne absente du
`SELECT` se lisait « visite sans fiche », donc ouverte. `compteRenduLisible` lisait `property_id` : fermé à tort
pour le personnel (clé `report` absente) sous un `fields` sans `property_id`.

**Ce qui change.**

- `PropertyVisitResource::identiteRelue()` : la fiche, le visiteur, l'agence du bien et `property_live` (bien
  présent et hors corbeille) relus par `VisitReadContext`, déjà chargé pour la page par les autres règles de la
  ressource. `ficheClientLisible`, `$visiteurLisible` et `compteRenduLisible` se jugent dessus. Une visite absente de
  la base se juge sur ses colonnes si elle les porte toutes, sinon tout se ferme.
- `VisitReadContext` lit `properties.id` et `properties.deleted_at` dans sa requête existante (`property_live`) :
  un bien à la corbeille ferme la fiche et le compte rendu, comme le faisait la relation `property` nulle.
- `report` est absent quand `fields[property_visits]` a retiré `reported_at` du `SELECT` : `report: null` se
  lirait « compte rendu à faire » (`compteRenduAFaire` du front). Les deux conditions vont ensemble : un geste
  rend sa visite sans `fields` (`report: null`, comme avant), le détail charge la visite entière.
- `PropertyVisitController::index` ne pose plus `visits.property_agencies` (lu sur `property_id`, vide sous un
  `fields` étroit) : une requête de moins par page.

**AC5 — instantané avant/après.** 8 lecteurs (agent assigné, collègue du personnel, bailleur, visiteur, client de
la fiche, super-admin, bailleur d'une autre agence, propriétaire d'un bien sans agence) × 4 visites (fiche liée au
compte du visiteur, fiche sans compte, demande sans fiche, bien sans agence) × liste, liste avec
`include=property,agent,visitor,customer`, détail : **96 cases sans `fields`, toutes identiques** (clés et
valeurs nulles). Seuls changent la fuite `include=visitor` du bailleur (bloc rendu → `null`) et le nombre de
requêtes.

**AC6.** Page de 20 visites, agent : 13 requêtes avant (avec ou sans `fields`), 12 après. Le test épingle qu'une
page de 1 et une page de 20 coûtent autant, et qu'un `fields` étroit ne coûte pas plus que sans `fields`.

**Inventaire mesuré** (liste avec `include=property,agent,visitor,customer`, sans `fields`, après correctif —
identique à avant). R = rendu, n = `null`, — = clé absente, R+adr = bloc avec adresse.

Visite sur fiche liée au compte du visiteur :

| lecteur | visitor_name/phone/email | customer_id | visitor_display | notes, metadata | report | visitor | customer | property |
|---|---|---|---|---|---|---|---|---|
| personnel (collègue) | R | R | R | R | n | R | R | R+adr |
| agent assigné | R | R | R | R | n | R | R | R+adr |
| bailleur | n | n | n | — | — | n | n | R+adr |
| visiteur (compte de la fiche) | R | R | n | — | — | R | R | R+adr |
| super-admin | R | R | R | R | n | R | R | R+adr |

Visite sur fiche sans compte de visiteur : le client de la fiche lit tout à `n` (ni fiche ni visiteur), `notes`,
`metadata` et `report` absents ; personnel, agent et super-admin comme ci-dessus (bloc `visitor` à `n`, pas de
compte). Demande sans fiche : le bailleur lit `visitor_*` et `visitor_display` (carte réduite) ; `customer_id` à
`n` pour tous. Bien sans agence : le propriétaire lit tout, `report` absent ; le visiteur lit `visitor_*`.
Le bailleur d'une autre agence ne voit aucune de ces visites. **Le bailleur parti n'est pas mesuré** ici : il
relève de `ProprietaireHorsConsole` (TCK-2585), que ce ticket ne touche pas.

**Vérification.** `VisitesChampsDemandesTest` : 16 tests verts (refus du bailleur sur 4 formes de `fields` étroits
— sans `customer_id`, sans `property_id`, sans `visitor_id`, le visiteur seul —, `include=visitor,customer`,
le compte rendu, le bien à la corbeille, la réponse d'un geste ; chacun avec son jumeau qui y a droit). 18
fichiers voisins verts (189 tests), 7 d'entre eux rejoués sur le code final (79 tests). Six ablations de
sécurité, toutes rouges : fiche jugée sur la ligne (3 rouges), `$visiteurLisible` sur la ligne (3), compte rendu
sans le contrôle du personnel (4), `report` sans la garde de `fields` (1), `property_live` retiré de la fiche (1)
puis du compte rendu (1). Une ablation reste verte, et ce n'est pas une garde : juger `report` sur les seuls
attributs (sans regarder `fields`) ne rougit pas le test du geste, la visite planifiée revenant avec `reported_at`
dans ses attributs. La garde de `fields` est gardée par précaution pour les gestes qui rendraient un modèle neuf.

**AC7 à moitié.** La garde jugée sur le `SELECT` partiel rougit AC2 et AC4 (ci-dessus) ; l'ablation « une
ressource qui ignore `fields` rend AC1 rouge » suit AC1 dans TCK-2797.

**Écart n° 1 — AC1 et le premier point du delta ne sont pas livrés** (filtre strict des clés) : option (a)
validée par team-lead le 2026-11-13, repris par [TCK-2797](TCK-2797-visites-fields-strict-back-et-front.md). Spatie refuse aujourd'hui
`fields[property_visits]=…,visitor_display` (400 mesuré), et les listes du front (`VISIT_TIME_FIELDS`,
`VISIT_LIST_FIELDS`, `VISIT_CLIENT_FIELDS`, `VISITE_DE_LA_SEMAINE_FIELDS`) lisent `visitor_display`, `notes`,
`report` et des colonnes non demandées, dont `=== null` basculerait en absent. Le filtre demande de retirer les
noms calculés avant spatie et de mettre à jour ces appelants dans le même changement.
