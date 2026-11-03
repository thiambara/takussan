---
id: TCK-639
title: "Registre de crédits : un mouvement ne se modifie que par l'action d'une clé étrangère, et les clés de TCK-633 sont indexées"
status: done
phase: P2
family: back
estimate: S
wave: null
created: 2026-10-14
updated: 2026-10-14
depends_on: [TCK-633]
blocks: []
spec_refs:
  features:
    - docs/features.md#112-agence--équipe
    - docs/features.md#29-administration--configuration
  models:
    - docs/models-spec.md#96-creditmovement-
    - docs/models-spec.md#93-propertyboost-
    - docs/models-spec.md#95-creditlot-
    - docs/models-spec.md#97-creditwelcomegrant-
tags: [back, credits, boost, adr-0061, postgresql, sync-specs]
---

## Objectif utilisateur

- **Le titulaire d'un espace, et le super-admin qui l'arbitre** : l'historique des crédits est une
  pièce opposable — ni sa ligne, ni son auteur ne s'effacent après coup par une écriture directe en
  base.

## Contrat de données

Relevé de la passe 012 de `/sync-specs` (`docs/sync-passes/pass-012-2026-10-14-0909/`, B.2 et B.7),
mesuré sur `2026_10_12_500200_create_credit_ledger_tables` et `2026_10_12_500100_create_boost_tables`.

**1. Le trigger tient moins que ce que §96 promet.** `models-spec.md` §96 annonce un registre en
ajout seul, à deux exceptions : la suppression en cascade d'un parent, et la mise à `NULL` de
`property_boost_id` / `actor_id` par `ON DELETE SET NULL`. La fonction
`credit_movements_append_only()` :

- autorise un `DELETE` dès que `pg_trigger_depth() > 1` — c'est bien l'action d'une clé étrangère
  (le trigger d'intégrité référentielle, profondeur 1, émet la suppression qui déclenche celui-ci à la
  profondeur 2) ;
- autorise un `UPDATE` qui met `property_boost_id` ou `actor_id` à `NULL` **sans condition de
  profondeur** : un `UPDATE credit_movements SET actor_id = NULL` direct passe, et efface l'auteur d'un
  octroi ou d'un retrait de super-admin.

**2. Sept clés étrangères sans index**, toutes en `nullOnDelete` : `property_boosts.boost_product_id`,
`purchased_by_id`, `cancelled_by_id` ; `credit_lots.granted_by_id` ; `credit_movements.actor_id` ;
`credit_welcome_grants.user_id`, `credit_lot_id`. Chaque suppression d'un utilisateur, d'un lot ou
d'une offre parcourt la table entière pour la mise à `NULL` (piège PostgreSQL n°8 de
`takussan-api/CLAUDE.md`).

## Contraintes strictes (métier)

- La garde reste **double** : `CreditMovement` (`updating`, `deleting` qui lèvent) pour Eloquent, le
  trigger pour tout le reste. Ce ticket ne touche que le trigger.
- Les deux chemins légitimes restent ouverts : supprimer une agence ou un lot (cascade) ; supprimer un
  utilisateur ou un boost (mise à `NULL`).
- Aucune migration existante n'est modifiée : le correctif est une migration nouvelle, avec un
  `down()` qui rend la fonction de `500200` telle quelle.
- Index créés sous leur nom explicite, conformes à la convention des migrations de TCK-633.

## Delta à produire

- [x] Migration : `2026_10_14_100000_harden_credit_movements_append_only` — `CREATE OR REPLACE
      FUNCTION credit_movements_append_only()` : la mise à `NULL` de `property_boost_id` / `actor_id`
      n'est admise qu'à `pg_trigger_depth() > 1`, comme la suppression.
- [x] Migration : `2026_10_14_100100_index_credit_and_boost_foreign_keys` — sept index, un par clé
      ci-dessus.
- [x] Tests : dans `tests/Feature/Credits/CreditSchemaTest.php` (ou une classe voisine) —
      `UPDATE` direct qui met `actor_id` à `NULL` refusé ; même chose pour `property_boost_id` ;
      suppression d'un utilisateur auteur d'un mouvement → `actor_id` à `NULL`, sans erreur ;
      suppression d'un boost → `property_boost_id` à `NULL` ; suppression d'une agence → mouvements
      supprimés en cascade ; présence des sept index (`pg_indexes`). → classe voisine
      `tests/Feature/Credits/CreditMovementForeignKeyActionsTest.php` (7 tests).
- [x] Spec : `models-spec.md` §96 (paragraphe « Trigger ») et les sections §93, §95, §97 (index).

## Critères d'acceptation

- [x] AC1 — Un `UPDATE credit_movements SET actor_id = NULL` émis directement lève `P0001` ; le test
      échoue si l'on rend la fonction de `500200` (vérifié par ablation).
- [x] AC2 — Supprimer un utilisateur auteur d'un mouvement réussit et laisse `actor_id` à `NULL` ;
      supprimer un boost laisse `property_boost_id` à `NULL` ; supprimer une agence supprime ses
      mouvements.
- [x] AC3 — Les sept index existent, chacun sur la seule colonne de sa clé.
- [x] AC4 — `php artisan migrate:rollback --step=2` puis `migrate` repassent sans erreur, et la
      fonction après rollback est celle de `500200`.

## Hors périmètre

- Une garde du même type sur les autres registres du dépôt.
- L'audit des clés étrangères non indexées hors du lot TCK-633.

## Notes d'implémentation

**Fichiers.** `takussan-api/database/migrations/2026_10_14_100000_harden_credit_movements_append_only.php`,
`2026_10_14_100100_index_credit_and_boost_foreign_keys.php`,
`takussan-api/tests/Feature/Credits/CreditMovementForeignKeyActionsTest.php` (classe voisine plutôt
que `CreditSchemaTest`, pour ne pas croiser d'autres branches), `docs/models-spec.md` §93, §95, §96,
§97.

**Décisions.**

- La condition ajoutée à la fonction : `NEW.x IS DISTINCT FROM OLD.x AND (NEW.x IS NOT NULL OR
  pg_trigger_depth() <= 1)` pour `property_boost_id` et `actor_id`. Le reste de la fonction est
  inchangé. Le trigger n'est pas recréé : il appelle la fonction par son nom.
- Limite écrite dans le docblock et dans §96 : la profondeur dit « émis par un trigger », pas « émis
  par une clé étrangère ». Aucun autre trigger du dépôt n'écrit `credit_movements` (relevé :
  `500200` est la seule migration qui crée une fonction ou un trigger).
- **Les suppressions des tests passent par `DB::table()->delete()`.** `User`, `Agency` et `Property`
  sont en `SoftDeletes`, et l'effacement d'un compte est une anonymisation
  (`AccountDeletionService::anonymize()` → `$user->delete()`, suppression douce) ; `app/` ne contient
  aucun `forceDelete`. Aucune voie applicative ne déclenche donc aujourd'hui l'`ON DELETE SET NULL`
  vers `users` : seule la suppression réelle de la ligne l'exerce, et c'est elle que les tests jouent.
- Un test de plus que le Delta : un **bien** supprimé emporte son boost en cascade, qui détache le
  mouvement à la profondeur 3 — le seuil doit être `> 1`, pas `= 2`.
- Index : noms `<table>_<court>_idx` comme ceux de TCK-633, sans `CONCURRENTLY` (tables nées le
  2026-10-12, API jamais servie en production). **Relevé `pg_indexes` avant écriture** (base de
  scratch migrée jusqu'à `500500`) : 13 index sur les quatre tables, **aucun** n'a l'une des sept
  colonnes en tête ; les trois autres clés `nullOnDelete` du lot sont déjà servies
  (`credit_movements_boost_idx`, `credit_movements_lot_idx`, `credit_welcome_grants_agency_unique`).
  Rien n'a donc été dédoublé.
- Écart de prémisse, sans effet (phrase retirée du Contrat depuis) : le Contrat disait que la migration de `taggables` du même lot
  applique le piège n°8 ; `2026_10_12_400300` dit l'inverse (« Pas d'index : aucune lecture ne part
  de cette colonne »). Le docblock de `100100` explique pourquoi le cas diffère ici : la lecture qui
  coûte est celle du moteur à la mise à NULL.

**Mesures (2026-10-14, `uptime` 6 à 17 de charge, 8 cœurs).**

- `php artisan test tests/Feature/Credits/` : **40 passed (187 assertions)**, 12,3 s ;
  `tests/Feature/Boost/` : **71 passed (333 assertions)**, 28,1 s. Pint propre, toutes les
  `scripts/check-*.mjs` vertes.
- **Ablation 1 (AC1)** — `return;` en tête de `up()` de `100000`, la fonction de `500200` reste en
  place : `un update direct ne met pas l auteur a null` et `… ne detache pas le boost` **échouent**
  (« credit_movements a accepté une mise à NULL directe »), 2 failed / 5 passed. Restauré.
- **Ablation 2 (correctif trop strict)** — `OR pg_trigger_depth() <= 1` remplacé par `OR TRUE` (mise
  à NULL refusée à toute profondeur) : les trois tests de suppression d'auteur, de boost et de bien
  **échouent**, 3 failed / 4 passed. Le test de l'agence reste vert : la cascade supprime les
  mouvements, la mise à NULL ne les trouve plus — il garde la cascade, pas le seuil. Restauré.
- **Ablation 3 (AC3)** — un index retiré de `100100` : `index manquants : credit_movements_actor_idx`.
  Restauré (fichier comparé octet pour octet à la sauvegarde).
- **AC4** — sur une base **dédiée** `takussan_tck639` (même serveur, port 5433, `--locale=C`), pour
  ne pas inscrire dans `takussan` partagée deux migrations que les autres arbres n'ont pas :
  `md5(prosrc)` de `credit_movements_append_only` après `500200` seul =
  `de7394bc99b283b2fa005219159b4b3c` ; après `migrate` = `8b7e54ea…` et 7 index ; après
  `migrate:rollback --step=2` = **`de7394bc99b283b2fa005219159b4b3c`** (identique) et 0 index ; puis
  `migrate` repasse. Commande : `DB_DATABASE=takussan_tck639 php artisan migrate:rollback --step=2
  --force`. La base de scratch a été supprimée ensuite.

