# Passe 015 — Passe différentielle après ADR-0070 (TCK-953 → TCK-956)

- **Date :** 2026-10-19 22:29 (heure locale de la machine)
- **Branche :** `docs/sync-specs-adr-0070`, partie de `pre-dev` `cb2713f11` (fusion de #738, TCK-956).
- **Passe précédente :** [`pass-014-2026-10-14-2220`](../pass-014-2026-10-14-2220/00-summary.md)
- **Sources lues :**
  - `docs/features.md` : sha1 `3ddd893f`, 728 lignes (014 : `3c3c46ff`, 725) ;
  - `docs/models-spec.md` : sha1 `16524856`, 5183 lignes, 100 sections (014 : `1bc37a5c`, 5124, 99) ;
  - la base de dev, **migrée pendant la passe** : les trois migrations d'ADR-0070 étaient en attente
    et ont été appliquées. Aucune autre migration n'est en attente ;
  - le code des onze migrations ajoutées depuis la passe 014.

## Méthode — différentielle, comme la 014

Depuis la passe 014 (commit `1c2a97c0b`, 2026-10-14) :

- **`features.md`** a reçu trois lignes (l.92-94 : TCK-997, TCK-999, TCK-1000) et appliqué FC2 et
  FC3. Toutes les lignes qui suivent sont décalées de **+3** : l'ancienne l.671 est la l.674.
- **`models-spec.md`** :
  - a appliqué MC1 et MB13 (§30, TCK-651) et MC2 (rôles personnalisés) ;
  - décrit TCK-942 (§93, et une §100 neuve) ;
  - a réécrit `Property.user_id` (§3, TCK-997).
- **Le code** a reçu onze migrations. **Aucune n'a touché la spec** :
  - les trois d'ADR-0070 (§7, §27, §34) ;
  - les huit de TCK-799, 802, 862, 863, 873, 891, 921 et 942. Seule TCK-942 a été écrite dans la spec.

Cette passe re-mesure ces unités contre la base, et seulement elles. Toute autre unité reprend le
jugement de la passe 014 (donc de la 013), sans relecture. Les compteurs restent comparables.

## Compteurs

| Axe | Unités | ✅ | ⚠️ | ❌ |
|-----|--------|----|----|----|
| Features → Modèles | 383 lignes | 315 | 67 | 1 |
| Modèles → Features | 100 sections | 69 | 31 | 0 |
| **Total** | | **384** | **98** | **1** |

**Δ vs passe 014 (384 / 94 / 1) : 0 / +4 / 0.** Les mouvements :

- **Features :**
  - l.674 passe de ⚠️ à ✅ : la route brute refuse la portée `global` depuis TCK-651 (FC1 soldée) ;
  - l.92 et l.94, neuves, sont ✅ ;
  - l.93, neuve, est ⚠️ et c'est justifié : la colonne qu'elle demande est décrite mais pas migrée,
    TCK-1000 étant `todo`.
- **Modèles :**
  - §30 passe de ⚠️ à ✅ (MC1, MB13) ;
  - §100, neuve, est ✅ ;
  - **cinq sections passent de ✅ à ⚠️** : §6, §7, §15, §34, §69. La cause est la même partout : des
    migrations fusionnées sans que la spec suive. Trois de ces écarts viennent d'ADR-0070, les autres
    de tickets de performance et de notification.

## Top 5 points critiques

1. **ADR-0070 n'est pas dans la spec** (§7, §27, §34). Quatre colonnes y restent décrites en clair
   (`string`, `decimal(14,2)`), alors qu'elles sont en `text` chiffré en base. Rien n'y est dit :
   - des masques `id_number_masked` et `monthly_income_masked` ;
   - des lectures `customers/{id}/sensitive` et `guarantors/{id}/sensitive` ;
   - de `customers.json` dans l'export.

   Un lecteur de la spec écrirait un `fields[customers]=…,id_number` qui rend 400. → MD1, MD2, MD3.
2. **Six migrations hors ADR-0070 sont absentes de la spec**, chacune fusionnée avec ses tests :
   - `customers.locale` (TCK-921) ;
   - `lease_payments.refund_amount` (TCK-873) ;
   - `app_notification_id` devenu nullable (TCK-799) ;
   - cinq index (TCK-802, 862, 863, 891).

   → MD1, MD4, MD5, MD6, MD7.
3. **La §3 décrit au présent un comportement non livré.** `pending_owner_profile_id` est marqué ➕
   (« colonne ajoutée » selon la légende), mais il n'existe pas en base. La prose de `user_id` décrit
   trois voies de réécriture dont deux n'existent pas encore (TCK-997, 999 et 1000 sont `todo`).
   → MD7.
4. **❌ inchangé : les notifications push (l.545, ex-l.542, P1).** FB1 (013) n'est pas traitée.
5. **`features.md` ne dit pas l'extension d'ADR-0070.** La l.473 limite le chiffrement et la lecture
   réservée aux « profils et demandes de passage en agence » : elle ne mentionne ni la pièce du
   locataire, ni celle de la caution, ni les revenus. La ligne est vraie mais incomplète. → FD1, FD2.

## Évolution depuis la passe 014

| | Passe 014 | Passe 015 |
|---|---|---|
| Features ✅ / ⚠️ / ❌ | 312 / 67 / 1 | **315 / 67 / 1** |
| Modèles ✅ / ⚠️ / ❌ | 72 / 27 / 0 | **69 / 31 / 0** |
| Recommandations ouvertes | 19 F + 29 actions M | **18 F + 34 actions M** (16 + FD1, FD2 ; C1-C5, C7-C27, MC3 + MD1 à MD7) |

**Résolues depuis la 014 :**

- **FC1 et MC1** : par TCK-651 (ADR-0065). Les réglages métier à repli global sont entrés au
  catalogue, et la route brute rend 422 `setting.global_not_writable` en portée `global` (mesuré :
  `SettingController.php:49, 98`, `UpdateSettingRequest.php:61`). La §30 le dit, et la l.674 est
  désormais vraie telle qu'écrite.
- **MB13 (013)** : la §30 nomme les deux catalogues (`EditablePlatformSettings`,
  `EditableBusinessEnums`). C'est une partie seulement de l'action C18, qui reste ouverte pour ses
  trois autres sections (§21, §39, §51/§48).
- **FC2, FC3 et MC2** : les écrans renommés par ADR-0064 sont corrigés des deux côtés.

**Ouvertes, inchangées :**
- côté catalogue : FB1, FA1-FA7, FB2-FB9 ;
- côté spec : C1-C5, C7-C27 et MC3. Aucune section visée n'a été modifiée ; §27 reste ⚠️ pour C10
  (013) en plus de MD2.

**Nouvelles :** FD1, FD2 ; MD1 à MD7.

## Statut de convergence

**Rompue.** Un ❌ reste côté catalogue (l.545, les notifications push), et des recommandations actionnables restent des deux
côtés. Les nouvelles sont toutes **rédactionnelles** : le schéma et le code sont en avance sur la
spec, jamais l'inverse, sauf pour la §3 (MD7). Le chemin le plus court vers la convergence sur cet
axe :

1. appliquer MD1 à MD7 et FD1 en un seul lot ;
2. ajouter à `scripts/check-models-spec.mjs`, ou à une garde sœur, la vérification qu'une migration
   ajoutée ou modifiée cite un ticket que la spec mentionne. C'est le défaut que cette passe mesure :
   sept tickets fusionnés en cinq jours sans trace dans la spec.

## Limites de cette passe, dites explicitement

- **Différentielle** :
  - 8 lignes et 11 sections re-mesurées ;
  - les 375 autres lignes et les 89 autres sections reprennent le jugement de la 014 sans relecture.
- Une omission d'index dans une liste d'index qui se présente comme complète est comptée ⚠️ (mineur),
  comme la passe 013 comptait une donnée rangée hors colonne, et comme son action C20 (« un index
  omis par section »). C'est ce qui fait passer §6 en ⚠️.
- La base de dev a été migrée pendant la passe. Les types d'ADR-0070 sont lus **après** migration ;
  avant, les colonnes étaient encore en `varchar` et en `numeric`.
- Les comportements (masques, lectures claires, export) sont lus dans le code et les tests de
  TCK-953 à TCK-956, pas rejoués par cette passe.
