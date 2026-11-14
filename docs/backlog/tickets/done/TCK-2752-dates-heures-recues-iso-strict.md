---
id: TCK-2752
title: "Les dates-heures reçues refusent les formes que la règle `date` relit de travers — une règle `instant` ISO 8601 stricte"
status: done
phase: P2
family: back
estimate: M
wave: 90
created: 2026-11-12
updated: 2026-11-14
depends_on: [TCK-2743]
blocks: [TCK-2768]
spec_refs:
  features:
    - "docs/features.md"
tags: [back, validation, dates, contrat-d-entree, suite-de-tck-2743]
---

## Objectif utilisateur

Une date-heure mal formée envoyée à l'API est refusée (422) au lieu d'être relue comme une autre date.

## Constat (TCK-2743, décision Q2 b du 2026-11-12)

La règle `date` de Laravel accepte des formes qu'elle relit de travers : « 99999-01-01 » (relue 2009-01-01),
« 0099-01-01 », une chaîne terminée par un octet nul. TCK-2743 convertit l'instant reçu sans changer le contrat
d'entrée ; ce ticket-ci, lui, le change.

## Delta

Une règle `instant` (ISO 8601 strict, années bornées), posée avec `date` sur chaque champ que liste la garde de
TCK-2743.

## À trancher avant le code

- L'espace à la place du `T` (« 2026-11-12 10:00 ») reste-t-il admis ? Recenser d'abord les clients qui l'envoient
  (front, seeders, tests). Le changement touche ≈ 14 routes.

- `offer_expires_at` (colonne `date`) et `expires_at` (instant) : une validité envoyée comme instant près de minuit
  (« …T00:30+01:00 ») range le 21 dans l'une et le 20 à 23:30 UTC dans l'autre (relevé de TCK-2743, lot 3). Le front
  envoie une date seule ; ce ticket tranche s'il faut refuser un instant sur `offer_expires_at` (`date_format:Y-m-d`).

## Critères d'acceptation

- [ ] AC1 — « 99999-01-01 », « 0099-01-01 » et une valeur terminée par un octet nul rendent 422 sur chaque champ de la garde.
- [ ] AC2 — les formes ISO valides (avec `Z`, avec décalage, sans décalage) restent acceptées et converties comme TCK-2743.
- [ ] AC3 — la garde de TCK-2743 rougit sur un champ date-heure reçu sans la règle `instant`.

## Notes d'implémentation

**Re-mesure de la prémisse (2026-11-13, back-4, HEAD a6027376d).** `date` accepte toujours « 99999-01-01 »
(relu 2009-01-01), « 0099-01-01 » (l'an 99), et aussi « 10000-01-01 » (relu 2000-01-01 10:00), « 12/11/2026 »
(relu le 11 décembre), « 2026-W46 », « 1 Nov 2026 », `T24:00`, `:60`. Par HTTP, `TrimStrings` retire un octet nul
FINAL (la valeur restante est juste, sans dégât) ; un octet nul INTÉRIEUR le traverse et se relit de travers :
`2026-12-01T10:00\0+05:00` passe `date` et s'écrit 05:00 UTC. C'est ce cas qui prouve AC1 par HTTP.

**Décisions (team-lead, 2026-11-13).**
1. L'espace à la place du `T` reste admis : le front l'envoie (`CouvrirUneAbsence.tsx`, fin d'absence
   `${fin} 23:59:59`), ~100 charges de tests aussi, RFC 3339 §5.6 l'autorise, et il n'est relu de travers nulle part.
2. Formes admises : `AAAA-MM-JJ` (date seule : `FinInclusive::de()`, `paid_at`, `received_at`, versements, bornes de
   rapport), puis `[T ]HH:MM`, `:SS`, fraction 1 à 6 chiffres (`toISOString()` 3, Carbon 6), zone `Z`, `±HH:MM` ou
   `±HHMM` (au plus 14 h). `T` et `Z` en majuscules. Années 1970–2100 (`InstantIso::ANNEE_MIN`/`ANNEE_MAX`) : avant
   1941 Dakar n'était pas à UTC+0 ; aucun écran ni test n'envoie hors de la plage.
3. `offer_expires_at` : option (a), `date_format:Y-m-d` (console et tunnel public). Le front n'envoie qu'une date.

**Livré.**
- `App\Rules\InstantIso` (la règle `instant` du Delta ; un objet, le dépôt n'a pas d'extension de validateur),
  libellé `validation.rules.instant` fr/en/wo (wo = texte français, wolof en pause).
- Posée juste après `'date'` sur les 41 champs que relève la garde de TCK-2743 (31 FormRequests), les deux
  branches de `StorePropertyVisitRequest` comprises. Bornes de rapport, `FINS_INCLUSIVES` et le `PATCH`
  d'intervention aussi : ces listes dispensent de la CONVERSION, pas de la forme reçue.
- Garde (AC3) : `InstantRecuConvertiTest::test_toute_date_heure_recue_porte_la_forme_iso` — chaque `date` de la
  règle d'un champ relevé a son `new InstantIso` (une règle conditionnelle le porte dans CHAQUE branche ; une règle
  en chaîne `'nullable|date'` compte zéro). Plancher > 35 champs ; lecture épinglée par
  `test_la_lecture_de_la_forme_iso_voit_chaque_branche`.
- `InstantRecu` : en-tête mis à jour (la forme est jugée par `date` ET `InstantIso`).
- **Amendement de TCK-2743** : `StaffRecordsOfferTest::test_une_validite_donnee_en_instant_avec_decalage_est_l_instant_designe`
  et `PropertyBookingRequestTest::test_une_offre_valable_jusqu_a_un_instant_avec_decalage_est_cet_instant` postaient un
  instant sur `offer_expires_at` et attendaient 201. Renommés (`…une_validite_est_un_jour_et_l_echeance_en_est_la_fin_a_dakar`,
  `…une_offre_valable_jusqu_a_un_jour_echeance_a_la_fin_de_ce_jour`) : l'instant rend 422, la date seule rend 201,
  `expires_at` est la fin de ce jour à Dakar et `offer_expires_at` le même jour. L'intention (l'échéance stockée est
  l'instant que la validité désigne) tient ; seul le cas « instant reçu » est désormais refusé.

**Tests.** `tests/Unit/Rules/InstantIsoTest.php` (51 : 16 formes admises, 34 refusées — dont les trois d'AC1, le
saut de ligne final, `+14:30`, entier, tableau — et le libellé). `tests/Feature/Validation/InstantIsoRecuTest.php`
(17, par HTTP) : AC1 sur trois écrivains sans `after:now` où la forme relue s'écrivait (tâche en `POST` et `PATCH`,
`PATCH` d'une intervention) et la branche « personnel » d'une visite (octet nul) ; AC2 sur dix formes admises et
leur instant stocké. Les tests de TCK-2743 (Z, décalage, sans décalage) restent verts.

**Ablations (15/15 rouges).** Règle retirée de `StoreTaskRequest`, `UpdateTaskRequest`,
`UpdateMaintenanceRequestRequest` (le cas « octet nul » restait d'abord vert : en 2030, hors de l'horizon d'un an,
`DansLHorizonDuPassage` le refusait seul — ramené au 2026-12-01), branche personnel puis branche visiteur de
`StorePropertyVisitRequest`, borne de `ReportExportRequest` (exception de la garde) ; dans la règle : bornes
d'années, `\z` → `$`, non-chaîne admise, borne de décalage, bornes d'heure ; dans la garde : `>= $dates` → `> 0`,
comptage des `date` neutralisé ; `date_format` → `date` sur `offer_expires_at` (console, public).

**Voisins.** Les 184 fichiers de test qui postent l'un des dix noms de champ, en 8 lots : 1848 verts. Les 9 fichiers
qui citent `offer_expires_at` : 48 verts.

**Limites.** AC1 « sur chaque champ » est tenu par la garde (présence de la règle) et par le test unitaire (la
règle refuse) ; par HTTP, quatre écrivains seulement. La garde lit par nom de champ, comme celle de TCK-2743 : une
date reçue sous un autre nom que sa colonne, ou une règle construite par une méthode, lui échappe.
