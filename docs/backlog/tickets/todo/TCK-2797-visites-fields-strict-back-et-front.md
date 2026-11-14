---
id: TCK-2797
title: "Visites : la réponse ne rend que les clés de `fields[property_visits]`, et le front demande ce qu'il lit"
status: todo
phase: P2
family: back
estimate: M
wave: 90
created: 2026-11-13
updated: 2026-11-14
depends_on: [TCK-2779]
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
  models:
    - "docs/models-spec.md#17-propertyvisit-"
tags: [back, front, visites, sparse-fieldsets, suite-de-tck-2779]
---

## Objectif utilisateur

Un écran qui demande quatre colonnes de visites n'en reçoit que quatre, et chaque écran demande toutes les
clés qu'il lit.

## Contrat de données

**Décision.** team-lead, 2026-11-13 : suite de TCK-2779 (option a). TCK-2779 a fermé la fuite en jugeant les
gardes sur `VisitReadContext`. Il n'a pas livré son AC1 (le filtre strict) ni la moitié de son AC7.

**Constat, relevé sur 01080e6dc pendant TCK-2779.**

- `PropertyVisitResource::toArray()` rend une liste fixe de clés, quel que soit `fields[property_visits]`. Une
  colonne hors du `SELECT` sort à `null`. La bande de semaine de « Ma journée » demande 4 clés et en reçoit 22.
- `PropertyVisit::$queryFields` ne connaît que des colonnes. Spatie refuse donc toute clé calculée :
  `fields[property_visits]=id,visitor_display` rend **400** (mesuré).
- Six appelants du front passent `fields[property_visits]` et lisent des clés qu'ils ne demandent pas. Ils
  comptent sur la liste fixe :
  - `VISIT_LIST_FIELDS` (`src/lib/queries/visits.ts`) ;
  - `VISIT_TIME_FIELDS` (`visits.ts`, par le temps et à confirmer ; repris par `src/lib/queries/accueil.ts`) ;
  - `VISIT_CLIENT_FIELDS` (`visits.ts`) ;
  - `VISITE_DE_LA_SEMAINE_FIELDS` (`src/lib/queries/journee.ts`) ;
  - `useRappelDuPersona.ts` (`id,property_id,scheduled_at,status`) ;
  - `FicheDeLaVisite.tsx` (`id,status,scheduled_at,property_id`).
- Ces appelants lisent en particulier `visitor_display` d'abord : `nomDuVisiteur` et `telephoneDuVisiteur` dans
  `components/visits/par-le-temps/pieces.tsx`. Ils lisent aussi `notes`, `report`, et des colonnes testées par
  `=== null`.
- Un filtre strict ferait passer une colonne non demandée de `null` à absente. Un test `=== null` se renverserait
  alors en silence.
- Le front lit la présence de `report` comme la garde du compte rendu (`compteRenduLisible`) et son absence de
  valeur comme « à faire » (`compteRenduAFaire`, `src/lib/visites/compte-rendu.ts`). TCK-2779 a rendu `report`
  absent quand `fields` retire `reported_at`.
- Le modèle existe : `AppNotificationResource::requestedFields()` lit `fields.app_notifications`, garde `id`, et
  rend `array_intersect_key`.

## Contraintes strictes (métier)

- **Sparse fieldsets obligatoires** (CLAUDE.md) : la réponse ne contient que `id` et les clés demandées. Sans
  `fields`, elle reste exactement celle d'aujourd'hui.
- **Une clé demandée n'ouvre aucun droit.** Les gardes de TCK-2779 restent les seules juges de chaque valeur :
  `ficheClientLisible`, `$visiteurLisible`, `outilDeLaConsole`, `adresseLisible`, `compteRenduLisible`. Elles se
  jugent sur `VisitReadContext`, jamais sur le `SELECT`.
- Les blocs de relation (`property`, `visitor`, `agent`, `customer`) suivent `include=`, pas `fields`.
- Les clés calculées (`visitor_display`, `report`, `abilities`) ne sortent que nommées dans `fields`.
- Une clé calculée qui lit des colonnes les obtient sans que l'appelant les demande. C'est le cas de `report`,
  qui lit `reported_at` et `report_*`.
- `HasQueryBuilder` est partagé par 35 modèles. Ce ticket ne le change pas.
- `fields` se lit dans la chaîne de requête (`$request->query('fields')`), pas dans `input()`.
- Back et front partent dans le **même** changement : une liste du front qui ne demande pas une clé qu'elle lit
  devient un écran vide.

## Delta à produire

- [x] Back : `PropertyVisitResource::requestedFields(Request)`, sur le modèle de `AppNotificationResource`. Elle
  garde `id` et les seules clés connues. `toArray()` rend l'intersection quand `fields[property_visits]` est posé.
- [x] Back : les noms virtuels (`visitor_display`, `report`, `abilities`) sont retirés de
  `fields[property_visits]` **avant** spatie (modèle ou contrôleur) ; spatie ne voit que des colonnes. La
  ressource les lit ensuite dans la chaîne de requête d'origine.
- [x] Back : `report` demandé ajoute au `SELECT` `reported_at`, `report_*` et `reported_by_id`. Le cas « `report`
  absent faute de `reported_at` » de TCK-2779 disparaît alors.
- [x] Front : chacun des 6 appelants demande toutes les clés qu'il lit. Les `=== null` sur une clé désormais
  absente sont relus un par un.
- [x] Tests back : complétés dans `VisitesChampsDemandesTest`.
- [x] Tests front : un test par liste. Il épingle que les clés lues par les composants sont dans la liste de
  `fields`.

## Critères d'acceptation

- [x] AC1 — `GET /api/property-visits?fields[property_visits]=id,scheduled_at,status,preferred_window` rend, pour
  chaque ligne, exactement les clés `id`, `scheduled_at`, `status` et `preferred_window`.
  *Preuve : `test_ac1_la_ligne_ne_rend_que_les_cles_demandees` (agent et bailleur).*
- [x] AC2 — `fields[property_visits]=id,visitor_display` rend 200, pas 400 ; `visitor_display` y est jugé comme
  sans `fields`.
  *Preuve : `test_ac2_visitor_display_se_demande_et_se_juge_comme_sans_fields` (valeur égale à celle sans `fields`,
  agent et bailleur, visite à fiche et demande sans fiche).*
- [x] AC3 — Sans `fields`, la réponse est identique à celle d'avant ce ticket. On le prouve par l'instantané de
  TCK-2779 : 8 lecteurs × 4 visites × (liste, liste avec `include`, détail), clés et valeurs nulles.
  *Preuve : instantané relevé avant toute modification puis après, 96 cases, fichiers JSON identiques à l'octet.*
- [x] AC4 — Les refus de TCK-2779 tiennent sous le filtre : `VisitesChampsDemandesTest` reste vert, sans
  modification de ses assertions de refus.
  *Preuve : 24 tests verts. Assertions de refus inchangées ; les `fields` du fournisseur NOMMENT désormais
  `visitor_display` et `report` (voir les notes).*
- [x] AC5 — Les 6 écrans rendent les mêmes visites qu'avant, en fidélité à 360 et 1280 : nom et téléphone du
  visiteur, rang (« 1re visite » / « revient »), compte rendu à faire.
  *Preuve : API locale, 6 personas × 5 listes du front, 0 écart entre la réponse sous `fields` et la réponse
  entière réduite aux mêmes clés. Tests d'écran sur le double strict, 9 lectures (voir les notes). Au navigateur,
  UN écran relevé : `/app/visits?vue=to_confirm` (agent) à 390 et 1280, nom et rang rendus. Les autres écrans ne
  sont pas relevés au navigateur.*
- [x] AC6 — Le nombre de requêtes d'une page de 20 visites ne dépasse pas 12. C'est le relevé de TCK-2779.
  *Preuve : `test_le_nombre_de_requetes_ne_depend_pas_de_la_taille_de_la_page`, ≤ 12 avec et sans clés calculées.*
- [x] AC7 — Vérifié par ablation (8 ablations, toutes rouges, voir les notes) :
  - une ressource qui ignore `fields` rend AC1 rouge ;
  - des noms virtuels laissés à spatie rendent AC2 rouge ;
  - chaque garde jugée sur le `SELECT` partiel rend rouge un test de refus de `VisitesChampsDemandesTest`.

## Hors périmètre

- Les autres ressources qui ignorent `fields` (bail, locataire : TCK-2780).
- Le support des champs virtuels dans `HasQueryBuilder` pour tous les modèles.
- Changer qui a droit à quoi.

## Notes d'implémentation

### Mise en œuvre (visites-2797, 2026-11-14)

**Prémisse re-mesurée** avant le code : les tests neufs d'AC1 et d'AC2 étaient rouges (22 clés rendues, 400 sur
`visitor_display`).

**Back.**

- `PropertyVisitResource::FIELDS` = `visitor_display`, `report`, `abilities` : les clés calculées.
  `requeteDesColonnes()` rend une COPIE de la requête où `fields[property_visits]` ne nomme que des colonnes, avec
  `id` toujours (sans lui, `VisitReadContext` ne relit rien), et `report` remplacé par `reported_at`, `report_*` et
  `reported_by_id`. Un nom inconnu reste à spatie, qui le refuse (400).
- `PropertyVisit::buildQuery()` l'appelle, sur le patron de `Customer::buildQuery()` et de
  `CustomerCommercialAttributes::strip()`. `PropertyVisitController` n'est pas touché.
- `toArray()` calcule la réponse entière comme avant, puis rend l'intersection avec `id`, les clés demandées et les
  blocs de relation (qui suivent `include=`). La clé demandée n'ouvre rien : le filtre ne fait que retirer.
- `reportedAtRetireParFields()` est supprimé : `report` nommé lit toujours ses colonnes.
- Le détail suit aussi `fields` : `GET /api/property-visits/{id}?fields[property_visits]=id,abilities` rend
  `abilities`. Aucun appelant du front n'en passe.

**`VisitesChampsDemandesTest`.** Sous le filtre strict, un refus sur une clé NON demandée devenait vrai sans
juger personne. Les `fields` du fournisseur `champsEtroits` nomment donc `visitor_display` et `report`, et
« le visiteur seul » nomme aussi `notes` et `metadata`. Aucun de ces ajouts ne remet au `SELECT` la colonne que
chaque cas retire. Le test du compte rendu demande `report` au lieu de `reported_at,report_outcome`. Ajouts : AC1,
les blocs de relation, `id` toujours rendu, AC2, le nom inconnu (400) et `abilities` hors détail, le détail sous
`fields`, `report: null` quand rien n'est écrit, et AC6 (≤ 12).

**Ablations** (une à la fois, md5 restauré à chaque fois) :

| ablation | rouges |
|---|---|
| la ressource ignore `fields` | 7 (dont AC1) |
| clés calculées laissées à spatie (`buildQuery` sans la copie) | 14 (dont AC2 : 400) |
| `report` sans ses colonnes | 1 |
| fiche jugée sur la ligne (`$this->customer_id`) | 3 refus du bailleur |
| `$visiteurLisible` sur la ligne | 3 refus du bailleur |
| outil de la console ouvert au bailleur | 5 (4 refus du fournisseur, AC2) |
| compte rendu ouvert au bailleur | 5 (4 refus du fournisseur, le test du compte rendu) |
| adresse jugée sur la ligne (`PropertyVisitAddressVisibilityTest`) | 2 (dont le refus sous `fields`) |

Les deux dernières ne rougissent que parce que les clés gardées sont désormais NOMMÉES : avec les `fields` d'avant,
la clé n'était plus demandée et le refus passait à vide. Une garde jugée sur le `SELECT` partiel qui FERME (le
compte rendu ou la console lus par `property_id`) rougit les jumeaux, pas les refus. C'est le sens sûr.

**Front.** Recensement complet (`rg property_visits` et `rg -l property-visits` hors tests) : 9 lectures passent
`fields[property_visits]`, pas 6. Les autres appelants visent `/slots`, `/counts`, une écriture, ou le détail sans
`fields`. Aux six du ticket s'ajoutent
`parametresDesVisitesAConfirmer` (`accueil.ts`, reprend `VISIT_TIME_FIELDS`), `fetchCustomerLinked`
(`agent-crm.ts`) et le compteur du menu (`fields=id`, ne lit que `meta`). Un seul manque : `VISIT_TIME_FIELDS`
ne demandait pas `visitor_display`, que `nomDuVisiteur` et `telephoneDuVisiteur` lisent d'abord. Sans lui, le rang
disparaissait et le bailleur perdait la carte réduite. `report` n'est lu par aucune liste. « Comptes rendus à
faire » vient de `/counts`, et `compteRenduAFaire` ne sert qu'au détail, sans `fields`. Aucun `=== null` ne porte
sur une clé non demandée : `VisitsList` teste `agent_id === null`, qui est demandé.

**Le double strict** (`src/test/visites-comme-l-api.ts`) sert les visites comme l'API (clés demandées et blocs
inclus), sous un `Proxy` qui note toute lecture d'une clé non demandée. Il est branché dans la doublure
d'`apiRequest` de six tests d'écran, avec un `afterEach` qui exige zéro lecture notée : `VisitesParLeTemps`,
`toutes-ouvre-toutes`, `MaJournee` (par le temps et la semaine), `mes-visites`, `AFaireAdmin` et `AFaireBailleur`.
`visites-champs-lus.tck-2797` couvre `VisitsList`, `useRappelDuPersona` et `fetchCustomerLinked`, et vérifie que
la liste des clés du double est celle de la ressource. « Ses visites » (`FicheDeLaVisite`) lit une `VisiteDuClient`
typée sur ses seules clés. Les ablations du front sont toutes rouges, et chacune nomme la clé :
`VISIT_TIME_FIELDS` sans `visitor_display` (42), la semaine sans `preferred_window` (10), le client sans
`cancellation_reason` (1), la liste sans `duration_minutes` (1).

**Garde `fields-demandables`.** `attributs-calcules-de-l-api.ts` enregistre `property_visits` : la garde lit
`PropertyVisitResource::FIELDS` et vérifie que `PropertyVisit::buildQuery()` appelle encore la copie.

**Écarts.** La fidélité a été relevée à 390 et 1280 (ADR-0106, brief), pas à 360, et sur un seul écran au
navigateur. Les cinq gardes en ✗ du vérificateur (`check-auth-interrupts`, `check-eslint-suppressions`,
`check-front-routes`, `check-skills-dir`, `check-skip-ci-marker`) sont vertes dans l'arbre. Elles sont en ✗
identique dans les vérifications de TCK-2629 et de TCK-2796 : c'est l'extraction, qui ne porte que
`takussan-web/src`, `scripts` et `package.json`.

**Doc.** `docs/spatie-query-builder.md` gagne une section « Visites » : les clés calculées et ce qu'elles lisent.
