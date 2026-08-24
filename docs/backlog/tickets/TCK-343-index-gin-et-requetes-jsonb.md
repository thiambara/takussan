---
id: TCK-343
title: "Exploiter JSONB : index GIN et requêtes sur les colonnes de propriétés"
status: done
phase: P3
family: technique
estimate: M
wave: 43
created: 2026-08-21
updated: 2026-08-22
depends_on: []
blocks: []
spec_refs:
  models:
    - docs/models-spec.md
tags: [back, postgresql, performance]
---

## Contexte

ADR-0020 a converti les **69 colonnes `json` en `jsonb`** pendant que les tables étaient vides —
la seule fenêtre où c'était un mot à changer plutôt qu'un `ALTER` sous `ACCESS EXCLUSIVE`.

**Ce ticket est la moitié qui n'a délibérément PAS été faite.** Le type est posé ; rien ne
l'exploite. Mesuré le 2026-08-21 : `whereJsonContains` = **0**, `whereJsonLength` = **0**,
`where('col->chemin')` = **0** dans tout `app/`. Le JSON est lu en bloc et casté en PHP.

*Une conversion de type sans requête qui l'emploie ne rapporte rien aujourd'hui — c'est ce qui
la rendait sûre à embarquer, et c'est ce qui rend ce ticket non urgent.*

## ⚠ Ce que la mesure a rendu — le titre de ce ticket est trompeur

**Aucun index GIN n'a été créé, et c'est le résultat, pas un abandon.** Le titre et le contexte
ci-dessus sont conservés tels qu'ils ont été écrits le 2026-08-21 : *le dépôt date ses erreurs
plutôt que de les effacer.* Voici ce que la mesure du 2026-08-22, **sur la base semée** (836 biens,
305 utilisateurs), a établi.

### 1. Il n'existe aucune requête qu'un index GIN pourrait servir

L'inventaire du 2026-08-21 a été rejoué et il tient — à **une exception près, qu'il avait manquée** :

| motif | occurrences dans `app/` |
|---|---|
| `whereJson*` | 0 |
| `DB::raw` / `whereRaw` touchant du JSON | 0 |
| `where('col->chemin')` | **1** — `EscalateUrgentMaintenanceJob.php:23` |

Cette unique occurrence est `->whereNull('metadata->escalated_at')`. **Un index GIN ne peut pas la
servir** : GIN sur `jsonb` indexe le *containment* (`@>`) et l'*existence de clé* (`?`, `?|`, `?&`),
et aucun de ces opérateurs n'exprime « cette clé est ABSENTE ».

Ce n'est pas une déduction. Un index GIN a été créé sur `maintenance_requests.metadata`, puis la
requête rejouée avec `enable_seqscan = off` pour forcer la main au planificateur : il a choisi un
B-tree sans rapport et **laissé le prédicat jsonb dans le `Filter`**, jamais en `Index Cond`.

```
->  Bitmap Index Scan on maintenance_requests_assigned_to_status_index
      Index Cond: ((status)::text = ANY ('{open,acknowledged}'::text[]))
    Filter: (… AND ((metadata -> 'escalated_at'::text) IS NULL) AND …)
```

La requête est de toute façon bornée par trois prédicats scalaires sur une table de **212 lignes**
(0,048 ms, 9 blocs) : c'est une file de travail qui reste petite par construction.

### 2. Les 4 filtrages en PHP sont tous à volume négligeable, et 2 ne sont pas convertibles

`AnnouncementResolver.php:25` (des dizaines d'annonces actives) · `FeatureFlagEvaluator.php:31-53`
(**une seule ligne** lue, pas un filtre d'ensemble) · `RemindTenantOnboarding.php:87` (boucle après
un `chunkById` déjà borné par 3 colonnes scalaires) · `PropertyResource.php:301` (documents **d'un
seul bien**). Les deux premiers ne sont pas exprimables en containment — `rollout_percentage` exige
un hash PHP par utilisateur.

**Conclusion : indexer en GIN aujourd'hui coûterait à l'écriture sur 69 colonnes sans accélérer une
seule requête.** C'est exactement ce que le point 2 de ce ticket demandait de vérifier.

### 3. La question de fidélité à l'octet est FERMÉE, sur preuve

Les trois colonnes signalées comme discutables ne demandent aucun retour à `json` :

- **`integration_webhook_logs.payload`** — la charge est **déjà détruite à l'écriture**, avant que
  `jsonb` n'intervienne : `IntegrationService.php:152-154` stocke
  `['truncated' => Str::of(json_encode(…))->limit(4000)]`. Une charge tronquée à 4000 caractères
  n'a plus aucune fidélité à préserver.
- **Aucune signature ne porte sur la colonne stockée.** Les 4 vérifications HMAC du dépôt
  (`WhatsappStatusController.php:76`, `WaveDriver.php:134`, `OrangeMoneyDriver.php:102`,
  `LemonSqueezyDriver.php:114`) calculent sur `$request->getContent()` / `$rawBody` — **le corps
  HTTP brut, au moment de la requête**. Le rejeu d'une signature depuis la base est donc
  impossible par construction, `json` ou `jsonb`.
- **`bank_statement_lines.raw_payload`** — casté `'array'` (`BankStatementLine.php:30`), écrit par
  `json_encode` (`ParseBankStatementJob.php:74`), relu comme tableau. Jamais comparé.
- **`app_notifications.delivery_attempts`** — **colonne morte** : `SmsRouterDriver.php:17` écrit
  qu'elle « n'est plus alimentée », les tentatives vivant dans la table normalisée
  `notification_delivery_attempts` (TCK-110).

### 4. Ce que la mesure a trouvé À LA PLACE — et qui est livré ici

Le vrai gisement est le **piège n°8 du `CLAUDE.md` racine** : PostgreSQL n'indexe pas les clés
étrangères, là où InnoDB le faisait. Mesuré le 2026-08-22 : **164 FK à une colonne, dont 88 sans
index utilisable.**

Mais les indexer en masse serait la même erreur que 69 index GIN. Le tri, mesuré :

- **78 des 88 pointent vers un parent en soft delete** → leur `ON DELETE` ne se déclenche jamais.
  Preuve : `UPDATE users SET deleted_at = now()` s'exécute en **0,456 ms sans un seul nœud
  `Trigger`** dans le plan.
- **10 ont un parent en suppression dure**, coût réel mais opération introuvable dans `app/`.
  Mesuré tout de même : supprimer une `bank_statement_lines` coûte 1,124 ms dont **1,064 ms de
  contrôles de FK**, ramenés à 0,597 ms avec index. *Un gain de 0,5 ms sur une opération qui
  n'existe pas ne justifie pas trois index.*
- **Les 3 colonnes `agency_id` nues** — `payouts`, `integrations`, `invitations` — se justifient
  par la **lecture** : l'agence est la frontière d'isolation, et les trois contrôleurs combinent un
  filtre par agence et `defaultSort('-created_at')`.

**Livré** : `2026_08_22_090000_add_agency_id_indexes_on_scoped_tables.php`, index composites
`(agency_id, created_at)`. Après migration, **plus aucune colonne `agency_id` du schéma n'est nue**
(21 tables vérifiées).

⚠ **Le chiffre qui le justifie est une extrapolation assumée.** Le seed ne peut pas trancher : 4
agences seulement (25 % de sélectivité) et une **corrélation physique de 1,0** sur
`payouts.agency_id` qui fabrique un faux gain — en cassant l'ordre physique, il disparaît (66 blocs
contre 64 pour un `Seq Scan`). Sur une table de forme réaliste — 800 000 lignes, 500 agences, ordre
aléatoire — le listage par défaut passe de **22,999 ms / 6068 blocs** à **0,060 ms / 27 blocs**.

**Les 85 FK sans index restantes ne sont PAS traitées ici** : elles demandent une mesure au cas par
cas, à l'échelle de production. → **TCK-349**.

## Ce que ce ticket ne fait pas

Il ne touche pas à `pg_trgm` ni à la recherche plein-texte (TCK-345), ni à pgvector (TCK-344).

## Références

- [ADR-0020](../../adr/0020-postgresql-sur-tous-les-environnements.md) §4 — la décision
- [`docs/plans/2026-08-21-recon-postgres.md`](../../plans/2026-08-21-recon-postgres.md) §F1 — l'inventaire mesuré
- `takussan-api/database/migrations/2026_08_22_090000_add_agency_id_indexes_on_scoped_tables.php` — le raisonnement complet et les mesures
- `takussan-api/tests/Feature/Database/AgencyIdIsIndexedTest.php` — la garde de propriété
