---
id: TCK-349
title: "Indexer les clés étrangères nues que la mesure justifie (85 restantes)"
status: todo
phase: P3
family: technique
estimate: M
wave: 44
created: 2026-08-22
updated: 2026-08-22
depends_on: [TCK-343]
blocks: []
spec_refs:
  models:
    - docs/models-spec.md
tags: [back, postgresql, performance]
---

## Contexte

**PostgreSQL n'indexe pas automatiquement une clé étrangère, là où InnoDB le faisait.** C'est le
piège n°8 du `CLAUDE.md` racine, et la contrepartie directe d'ADR-0020 : les 164 FK du dépôt étaient
indexées gratuitement, aucune ne l'est plus.

Mesuré le 2026-08-22 sur la base semée, dans le cadre de TCK-343 : **164 FK à une colonne, dont 88
sans index utilisable** (colonne FK en première position d'un index non partiel). TCK-343 en a
traité **3** — les colonnes `agency_id` de `payouts`, `integrations` et `invitations`, justifiées par
la lecture et gardées par `AgencyIdIsIndexedTest`. **Il en reste 85.**

## ⚠ La conclusion à ne pas tirer : « il reste 85 index à créer »

Le travail de TCK-343 a surtout établi **pourquoi la plupart ne méritent rien**, et ce raisonnement
est le point de départ ici :

- **78 des 88 pointaient vers un parent en SOFT DELETE.** `User` et 27 autres modèles portent
  `deleted_at` : `->delete()` y est un `UPDATE`, et **aucun contrôle de FK ne se déclenche**. Mesuré :
  `UPDATE users SET deleted_at = now()` → 0,456 ms, plan **sans un seul nœud `Trigger`**. Leur
  `ON DELETE SET NULL` est du code mort tant que rien ne fait de suppression dure.
  *Indexer pour un `ON DELETE` qui ne se déclenche jamais, c'est payer l'écriture sans rien acheter.*
- **10 ont un parent en suppression dure**, et là le coût est réel : supprimer une ligne de
  `bank_statement_lines` coûte 1,124 ms dont **1,064 ms de contrôles de FK** (3 nœuds `Trigger`
  scannant `lease_payments`, `invoices`, `booking_payments`), ramenés à 0,597 ms avec les index.
  **Mais aucun site de suppression de `bank_statement_lines` ni de `platform_payouts` n'existe dans
  `app/`** — le gain porte sur une opération qui n'a pas lieu.

## Ce qu'il y a à faire

1. **Rejouer l'inventaire** — il se recompte, il ne se recopie pas. La requête est dans l'en-tête de
   `2026_08_22_090000_add_agency_id_indexes_on_scoped_tables.php`, et
   `AgencyIdIsIndexedTest::test_toute_colonne_agency_id_porte_un_index_utilisable` en porte la forme
   exacte pour `agency_id`.
2. **Trier par ce qui EXÉCUTE la requête, pas par ce qui la rend possible.** Une FK mérite un index
   quand une lecture chaude la filtre, ou quand son parent est réellement supprimé. Les deux se
   vérifient dans `app/`, pas dans le schéma.
3. **Mesurer avec `EXPLAIN (ANALYZE, BUFFERS)`** — et se méfier du seed, qui ne peut pas trancher
   pour deux raisons indépendantes établies par TCK-343 :
   - il est trop petit (une table de quelques milliers de lignes tient en mémoire, et PostgreSQL
     préférera un `Seq Scan` quel que soit l'index) ;
   - **il est trié.** `pg_stats` donne une corrélation de **1,0** sur `payouts.agency_id` : le seed a
     inséré agence par agence, si bien qu'un `Index Scan` y lit une tranche CONTIGUË et fabrique un
     gain qui n'existe pas en production. En cassant l'ordre physique, ce gain disparaît.

   La sortie honnête est d'extrapoler explicitement — gonfler une table à une forme réaliste, le
   DIRE, et mesurer là — comme TCK-343 l'a fait (800 000 lignes, 500 agences, ordre aléatoire).
4. **Préférer le composite quand la table se liste triée.** L'essentiel du gain mesuré par TCK-343 ne
   venait pas du filtre mais du `ORDER BY` : un index `(fk, created_at)` laisse le `LIMIT 20` de la
   pagination s'arrêter après 21 entrées au lieu de trier tout le lot. Un index ASC sert un tri DESC
   (`Index Scan Backward`) sans pénalité — le constructeur de schéma de Laravel suffit.
5. **Nommer les index explicitement.** Au-delà de 63 caractères PostgreSQL tronque avec un simple
   `NOTICE`, et c'est le `dropIndex()` d'une migration future qui casse.
6. **Dire ce que chaque index coûte** : taille (`pg_size_pretty(pg_relation_size(…))`) et fréquence
   d'écriture de la table.

## Critères d'acceptation

- [ ] L'inventaire est re-mesuré et daté, avec la commande qui l'a produit.
- [ ] Chaque index créé porte un `EXPLAIN (ANALYZE, BUFFERS)` avant/après, et la requête réelle de
      `app/` qu'il sert, citée en `fichier:ligne`.
- [ ] Chaque FK **écartée** l'est pour une raison écrite (parent en soft delete, aucune lecture
      chaude, volume négligeable) — l'absence d'index est une décision, pas un oubli.
- [ ] Si la mesure ne justifie aucun index, **aucune migration n'est écrite** et le ticket dit
      pourquoi. C'est une issue recevable.
- [ ] La migration passe `migrate` → `rollback --step=1` → `migrate` sur une base semée.

## Ce que ce ticket ne fait pas

Il ne revient pas sur les 3 index `agency_id` de TCK-343, ni sur la garde
`AgencyIdIsIndexedTest`. Il ne touche pas aux index GIN — TCK-343 a mesuré qu'aucun n'est justifié.

## Références

- `CLAUDE.md` racine, § « Migrations — les pièges PostgreSQL », piège n°8
- [TCK-343](TCK-343-index-gin-et-requetes-jsonb.md) — la mesure fondatrice et le tri des 88
- `takussan-api/database/migrations/2026_08_22_090000_add_agency_id_indexes_on_scoped_tables.php`
- [ADR-0020](../../adr/0020-postgresql-sur-tous-les-environnements.md)
