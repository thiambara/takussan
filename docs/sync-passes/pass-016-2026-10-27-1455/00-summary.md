# Passe 016 — Passe différentielle après le socle IA (ADR-0076, TCK-2383 → TCK-2385, TCK-2396 → TCK-2401)

- **Date :** 2026-10-27 14:55 (heure locale de la machine)
- **Branche :** `docs/sync-specs-socle-ia`, partie de `dev` `9b39627a0` (fusion de #1572, lot 0 du socle IA).
- **Passe précédente :** [`pass-015-2026-10-19-2229`](../pass-015-2026-10-19-2229/00-summary.md) (commit `3278b6617`).
- **Sources lues :**
  - `docs/features.md` : sha1 `6c7fa86e`, 816 lignes, **412 lignes de fonctionnalité** (015 : `3ddd893f`, 728 lignes, 383) ;
  - `docs/models-spec.md` : sha1 `e5711a1d`, 5535 lignes, **106 sections** (015 : `16524856`, 5183, 100) ;
  - les **27 migrations** ajoutées depuis la passe 015, lues dans le code (pas en base : la base de dev
    n'a pas été migrée par cette passe) ;
  - le code du socle IA (`AiGateway`, `AiErrorCode`, `RunAiEvaluation`, `AiEvaluationRun`, `AiBudget`,
    `ExternalContentPolicy`, routes `admin-ai`) et les notes d'implémentation de TCK-2383 → TCK-2385,
    TCK-2396 → TCK-2401.

## Méthode — différentielle, comme la 014 et la 015

Depuis la passe 015, en huit jours :

- **`features.md`** a reçu 29 lignes et en a modifié 20, plus trois passages de prose (§1.8 demandeur au bail fini, §2.1 onboarding, §2.3 émetteur WhatsApp) :
  - §2.11 Socle IA (5 lignes) et §2.12 Radar (14 lignes), neuves ;
  - dix lignes neuves ailleurs (§1.4, §1.6, §1.7, §1.12, §2.2, §2.3, §2.5, §2.6) ;
  - FA1, FA3 (013), FB8 (013) et FD1 (015) appliquées.
- **`models-spec.md`** a reçu six sections (§101 `OwnerStatementSnapshot`, §102 → §106 le socle IA) et
  appliqué C1 → C5, C16 (013, TCK-1012) et MD1 → MD7 (015). Vingt-sept autres sections, les paquets,
  les tables du framework et les règles ont été retouchés par les tickets fusionnés.
- **Le code** a reçu 27 migrations. Trois ne touchent que des données. Des 24 qui touchent le
  schéma, **dix ont leur trace dans la spec, quatorze non** (dont la dernière du socle IA,
  `stop_reason`).

Cette passe re-mesure ces unités, et seulement elles. Toute autre unité garde le jugement de la passe
015 (donc de la 013), sans relecture. Les compteurs restent comparables.

**Le Radar (§2.12) est compté ⚠️ justifié, pas ❌.** À la lettre, ses 14 lignes n'ont aucun modèle :
ce serait ❌. Mais ADR-0077 est accepté, ses dix tickets (TCK-2386 → TCK-2395) sont `todo`, et l'ADR
exige que chaque section de `models-spec.md` arrive **dans la PR du modèle** (`check-models-spec`).
Le classement tient tant que ces tickets sont ouverts ; une PR du Radar fusionnée sans sa section le
ferait passer ❌.

## Compteurs

| Axe | Unités | ✅ | ⚠️ | ❌ |
|-----|--------|----|----|----|
| Features → Modèles | 412 lignes | 332 | 79 | 1 |
| Modèles → Features | 106 sections | 73 | 33 | 0 |
| **Total** | | **405** | **112** | **1** |

**Δ vs passe 015 (384 / 98 / 1) : +21 / +14 / 0.** Les mouvements :

- **Features :**
  - trois lignes passent de ⚠️ à ✅ : l.91 (FA1), l.227 et l.228 (FA3) ;
  - 29 lignes neuves : 14 ✅ (dont l.748-750 et l.752 du socle IA), 1 ⚠️ (l.751, budgets) et
    14 ⚠️ justifiés (Radar) ;
  - le ❌ reste : les notifications push (l.559, ex-l.545).
- **Modèles :**
  - **huit sections passent de ⚠️ à ✅** : §1, §2, §6, §7, §12, §13, §34, §98 (C1 → C5, C16, MD1, MD3, MD4) ;
  - **sept passent de ✅ à ⚠️** : §11, §28, §45, §48, §86, §90, §91. Six le sont par une migration
    fusionnée sans la spec, la septième (§86) par un « pas encore » que le code a rattrapé ;
  - six neuves : §101, §102, §103 ✅ ; §104, §105, §106 ⚠️.

## Top 5 points critiques

1. **Le journal des appels IA (§104) ne décrit plus sa table.** La colonne `stop_reason` (TCK-2399,
   `2026_10_27_100050`) manque. `error_code` est dit « nom de l'exception » alors qu'il porte un code
   `ai.*` (`AiErrorCode`). Rien ne dit qu'une réponse tronquée ou filtrée s'écrit `failed_over`,
   payée et hors cache. §106 a le même défaut sur `error_code`. → ME1, ME2.
2. **Les sorties d'argent ont avancé sans la spec : deux tables et quatorze colonnes, en cinq migrations.**
   - `payout_clawbacks` et `payout_clawback_imputations` (TCK-2151) n'ont pas de section ; §101 les
     cite en passant.
   - `payouts.refunded_payment_*` (le `Payout` « constaté », TCK-2052) et `payouts.clawback_amount`
     manquent à §28, ainsi que la copie des lignes sur les deux pivots (TCK-2017).
   - Côté loyers, quatre colonnes `late_fee_payout_*` (P206.01) et `late_fee_refund_amount` (P206.04)
     manquent à §15.
   - `features.md` §1.5 ne dit ni la reprise au bailleur, ni le constaté.

   → ME4, ME5, FE4.
3. **Huit autres migrations sont absentes de la spec** :
   - `lease_payments.marked_paid_at` (TCK-1342) ;
   - `guarantors.agency_id` (TCK-1993) : la §27 juge encore l'agence par l'auteur ;
   - rapprochement bancaire de `platform_payouts` (TCK-1421) ;
   - `bank_statement_lines.duplicate_of_line_id` (TCK-1919) ;
   - l'unicité élargie des avis (TCK-2062) : la §11 justifie encore l'ancienne ;
   - `former_names` des villes et des quartiers (TCK-1080, TCK-1169) ;
   - `invitations.reminder_attempts` (TCK-2155).

   → ME4, ME6 → ME11.
4. **Trois textes disent « pas encore » d'un comportement livré :**
   - `features.md` l.283 : « la règle n'est pas appliquée », alors qu'elle l'est depuis TCK-2191 ;
   - §86 : « compte encore `status = published` », corrigé par TCK-2087 ;
   - Règle 1 : `User::customer()`, retirée par TCK-2372 que la §1 décrit.

   Et un texte dit au présent ce qui n'existe pas : §105, l'effacement d'`input_snapshot` par la purge du
   Radar (TCK-2391, `todo`). → FE3, ME12, ME13, ME3.
5. **❌ inchangé : les notifications push (l.559, P1).** FB1 (013) reste hors des lots, à la demande
   du porteur (TCK-1012).

## Évolution depuis la passe 015

| | Passe 015 | Passe 016 |
|---|---|---|
| Features ✅ / ⚠️ / ❌ | 315 / 67 / 1 | **332 / 79 / 1** |
| Modèles ✅ / ⚠️ / ❌ | 69 / 31 / 0 | **73 / 33 / 0** |
| Recommandations ouvertes | 18 F + 34 actions M | **19 F + 36 actions M** (14 reprises + FE1 → FE5 ; 21 reprises + ME1 → ME15) |

**Résolues depuis la 015 :**

- **Côté catalogue** :
  - FA1 et FA3 (013), par TCK-1012 ;
  - FB8 (013), par TCK-1703 : la prose de l'onboarding dit les statuts réels de chaque profil ;
  - FD1 (015) : l.486 et l.641.
- **Côté spec** :
  - C1 → C5 et C16 (013), par TCK-1012 ;
  - MD1 → MD6 (015), par `8307c7ce4` ;
  - MD7 (015), par la livraison de TCK-997, TCK-999 et TCK-1000 : `pending_owner_profile_id` existe
    (`2026_10_25_120000`), et la §3 dit fait ce qui l'est.
- **Partiellement** :
  - C9 (§22) : la collection `versions` est décrite (TCK-2300), mais `shareLinks()`, `Searchable` et
    les cibles manquent toujours ;
  - C17 : la Règle 3 est réécrite, les Règles 2 et 4 non, et la Règle 1 a pris un défaut neuf (ME13).

**Ouvertes, inchangées :**

- côté catalogue : FB1, FA2, FA4 → FA7, FB2 → FB7, FB9 (013), FD2 (015) ;
- côté spec : C7, C8, C9 (partiel), C10, C11 → C15, C17 (partiel), C18 → C27 (013) et MC3 (014).
  C10 se joint désormais à ME6 (§27).

**Nouvelles :** FE1 → FE5 ; ME1 → ME15.

## Statut de convergence

**Rompue.** Un ❌ reste côté catalogue (l.559). Des recommandations actionnables restent des deux
côtés. Les nouvelles sont **toutes factuelles** : elles décrivent du code déjà fusionné, sauf
l'alternative (b) de FE1 et FB1, qui restent des décisions du porteur.

**Le défaut que la passe 015 mesurait s'est aggravé**, malgré l'application de ses recommandations :

- 015 : sept tickets en cinq jours fusionnés sans trace dans la spec ;
- 016 : **quatorze migrations de schéma en huit jours**.

Les tickets du socle IA écrivent pourtant leur section dans la PR (TCK-2383, TCK-2384). La différence
tient en une ligne : un ticket qui **crée** une table a une case « section `models-spec.md` » ; un
ticket qui **ajoute une colonne** n'en a pas. Même TCK-2399 renvoie sa colonne à « `/sync-specs`
après fusion ».

La recommandation de la 015 tient donc, précisée : une garde qui, pour toute migration ajoutée,
vérifie que chaque colonne ou table qu'elle crée est **nommée** dans `models-spec.md`. C'est un
plancher, du même ordre que `check-models-spec`.

## Limites de cette passe, dites explicitement

- **Différentielle** :
  - 49 lignes et 38 sections re-mesurées ;
  - les 363 autres lignes et les 68 autres sections gardent le jugement de la 015 sans relecture.
- Les migrations sont lues dans leur code, **pas en base** : types et index sont ceux que les
  migrations déclarent.
- Les comportements du socle IA (bascule, codes, budgets, évaluation) sont lus dans le code et les
  notes des tickets, pas rejoués.
- Les deux tables `payout_clawbacks*` n'ont pas de modèle Eloquent. Elles ne comptent donc pas comme
  « sections manquantes » (pas de ❌) : elles sont rattachées à la §28, qui passe ⚠️.
- La file `long` et le `worker-long` (ADR-0078, TCK-2397, TCK-2401) n'appellent aucune recommandation.
  `features.md` l.695 dit « âge de la file, battement des workers » sans nommer de file, et reste
  vraie. La table `jobs` (« Tables du framework ») est partagée par `database-long` sans qu'aucune
  colonne change.
