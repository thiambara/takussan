---
id: TCK-2767
title: "POST /api/leases juge l'autorisation avant la validation — un appelant qui ne peut pas ouvrir de bail sur ce bien reçoit 403, plus le détail des règles"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-11-13
updated: 2026-11-14
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
tags: [api, autorisation, baux, verification-adverse]
---

## Contexte

La vérification adverse de TCK-2643 (lots 1 à 3, réserve r5, 2026-11-13) a relevé un ordre de jugement.

- `StoreLeaseRequest::authorize()` rend `true`. Les `rules()` se jugent donc **avant** toute autorisation.
- L'autorisation vit après, dans `LeaseController::store()` (`abort_if($property === null, 403)`) puis dans `LeaseService::create()` (`createOn`, puis le locataire et le garant).
- TCK-1068 a retiré les `exists:` : il n'y a **pas d'oracle d'existence**. Un bien absent et un bien d'une autre agence rendent la même réponse.
- Il reste qu'un appelant **sans droit sur le bien** reçoit, pour un corps invalide, un **422 avec le détail des règles du bail**, et non le 403 qu'il recevrait avec un corps valide. Sa réponse dépend de son corps, pas de son droit.

Le même motif est décrit, pour tout le dépôt, au « piège 2 » de `takussan-api/CLAUDE.md`. Ce ticket ne traite que la création de bail.

## Reproduction (base de test, jamais la démo)

Une sonde PHPUnit jetable, écrite pendant la vérification, puis supprimée.

- L'agent de l'agence A envoie `POST /api/leases` avec le bien d'une agence B, un locataire de A et `late_fee_percent: 99` (hors borne). Réponse : **422**, erreur sur `late_fee_percent`.
- Même corps avec un `property_id` absent de la base : **422**, même erreur. Pas d'oracle, mais pas de 403 non plus.
- Même appel avec un corps valide : **403** dans les deux cas, et aucun bail créé.
- `GET /api/leases/defaults` répond déjà 403 au même appelant pour le même bien (matrice curl de la vérification : bien d'une autre agence, absent, `abc` ou `0` → 403). La lecture et l'écriture d'un même droit ne répondent pas pareil.

## Delta à produire

- **`StoreLeaseRequest::authorize()`** juge `createOn` sur le bien désigné **avant** `rules()`.
  - Un `property_id` non entier, absent ou d'une autre agence → `false`, donc 403. Même réponse dans les trois cas : la propriété de TCK-1068 tient.
  - Le locataire, le garant et la réservation restent jugés dans `LeaseService::create()`, après la validation. Leur refus est déjà le même pour un absent et pour un tiers.
- **`LeaseController::store()`** et **`LeaseService::create()`** gardent leur `abort_unless` : la défense en profondeur ne bouge pas. Un autre appelant de `create()` (le renouvellement, une réservation) n'est pas couvert par le FormRequest.

## Critères d'acceptation

- [x] **AC1.** L'agent de A, sur un bien de B, avec un corps invalide : **403**, aucune clé `errors` dans la réponse.
- [x] **AC2.** Même appel avec un `property_id` absent, puis avec `"abc"` : **403**, corps identique à AC1.
- [x] **AC3.** Un client et un prestataire, sur n'importe quel bien, avec un corps invalide : **403**.
- [x] **AC4.** L'agent de A, sur un bien de A, avec un corps invalide : **422** sur le champ en faute, comme aujourd'hui.
- [x] **AC5.** Les tests existants de la création de bail restent verts sans réécriture de leurs attentes, sauf celles qui figeaient un 422 pour un appelant sans droit. Chacune de celles-ci est nommée dans la PR.

Chaque AC se vérifie par ablation : un `authorize()` rendu à `true` doit faire rougir AC1 à AC3, et pas AC4.

## Hors périmètre

- Les autres FormRequest qui rendent `true` (le « piège 2 », pour tout le dépôt).
- Le locataire et le garant tiers : déjà 403 après la validation, sans oracle.

## Notes d'implémentation (2026-11-14)

- **Prémisse re-mesurée sur HEAD (e798d91d0)** : `StoreLeaseRequest::authorize()` rendait `true`, aucun autre chemin (middleware, policy de route) ne jugeait le bien avant `rules()`.
- **`StoreLeaseRequest::authorize()`** résout le bien (`filter_var` entier ≥ 1, puis `find`) et délègue à `LeasePolicy::createOn` — la forme exacte de `LeaseDefaultsRequest`. Le bien résolu sert aussi à `propertyAgencyId()` (règle `PersonnelDeLAgence`), qui ne relit plus la base.
- **Inchangés** : `abort_if` de `LeaseController::store()` et `abort_unless(createOn)` de `LeaseService::create()` (défense en profondeur), le locataire, le garant et la réservation jugés après la validation.
- **Décision hors ticket** : un `property_id` sous forme de tableau, ou `0`, rend aussi le refus d'un bien tiers (403) ; testé avec les cas absent, `abc` et manquant.

**Preuves** — `tests/Feature/Lease/CreationDeBailAutoriseAvantDeValiderTest.php` :
- AC1 `test_ac1_…` ; AC2 `test_ac2_…` (absent, `abc`, `0`, tableau, manquant : corps identique au bien tiers) ; AC3 `test_ac3_…` (client sans profil et prestataire, sur un bien de A et de B) ; AC4 `test_ac4_…` (+ le bailleur du bien garde son 422).
- Ablations : `authorize()` → `true` : AC1, AC2, AC3 rouges, AC4 vert ; `authorize()` → bien trouvé sans `createOn` : mêmes rouges, AC4 vert. Fichier restauré, md5 vérifié.
- AC5 : 29 fichiers (les 26 qui postent sur `/api/leases`, plus `LeaseDefaultsTest` et `AuthorizationPrecedesValidationTest`), 431 tests, 2 rouges, exactement les deux attentes qui figeaient un 422 pour un appelant sans droit, toutes deux dans `tests/Feature/Api/LeaseExistenceOracleTest.php` :
  1. `test_hors_agence_un_client_ou_un_garant_absent_ne_se_distingue_pas_d_un_tiers` : le premier `assertSame(422, …)` (compte sans droit, `type` invalide) devient 403 ; l'égalité tiers/absent tient.
  2. `test_un_identifiant_non_entier_reste_refuse_en_422`, renommé `…_pour_qui_a_le_droit_sur_le_bien` : `property_id: abc` d'un compte sans droit → 403 sans `errors` ; le bailleur sur son bien, avec `tenant_id`, `guarantor_id` et `booking_id` non entiers → 422 sur ces trois champs.

- 2026-11-14 — passé done : AC1-AC5 cochés avec preuve, commit ee5324269 (test `CreationDeBailAutoriseAvantDeValiderTest` au HEAD).
