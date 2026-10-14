# 03 — Recommandations à `models-spec.md`

> Passe 012 — 2026-10-14 09:09. Conventions et limites : `00-summary.md`.
> Les numéros de ligne renvoient à `docs/features.md` (sha1 `291afd30`, 724 lignes) ; les « § » et
> « l. » de spec à `docs/models-spec.md` (sha1 `0c720866`, 4417 lignes). Migrations citées par leur
> nom de fichier, dans `takussan-api/database/migrations/`.
> **Chaque constat de schéma est mesuré sur une migration nommée**, jamais déduit d'un nom de modèle.
> **49 recommandations** : les 41 de la passe 011 — **aucune appliquée, même partiellement** — et 8
> nouvelles (M42 à M49). Deux constats nouveaux ne font pas de reco à part : ils amendent M4 et M23.

---

## A. M1 à M41 — reprises de la passe 011, aucune appliquée

Le texte intégral de chaque recommandation est dans
[`pass-011-2026-10-08-2221/03-recommendations-models-spec.md`](../pass-011-2026-10-08-2221/03-recommendations-models-spec.md).
Les sections §11 à §87 n'ont pas changé d'un octet depuis (décalées de +92 lignes) : ses constats
tiennent. Ce tableau donne les lignes à traiter **à HEAD** et l'état mesuré ; quatre sont
**aggravées** par le delta TCK-633 (M4, M23, M38, M40).

| Reco | Section / lignes HEAD | Statut | Mesure à HEAD |
|---|---|---|---|
| **M1** Retirer le courtier | §36 **1771-1810** (bannière « VIVENT » l.1775) ; §38 **1845-1871** ; TOC **150, 152** ; Packages **59, 67** ; §1 **288, 346 (`brokerProfile()`), 366 (`broker_profile()`)** ; §37 **1814** ; §39 **1875** ; §42 **1996** ; `CollaborationStatus` **3922** ; Règle 5 **4228-4229** ; unicités **4314, 4315, 4317** ; §9 **767** ; `RelationshipType` **3943** ; §14 **1016** (« Commission agence/courtier ») ; EF2 **4363** ; ADR-0027 cité seul **67, 1774, 4229** | ❌ non appliquée | Tout est identique. ADR-0030 : 0 citation. `app/Models/` : aucun modèle courtier ; `RelationshipType.php` : `owner_tenant`, `agent_client` seulement. |
| **M2** Section `AgencyAdminProfile` | aucune section ; mentions l.59, 365, 2382, 2903, 4225, 4260 | ❌ non appliquée | `AgencyAdminProfileStatus` : 0 occurrence. Le modèle est désormais **nommé par `features.md` l.426** (réécrite par TCK-633 : « `AgencyAdminProfile` et `OwnerProfile` »). |
| **M3** Section `NotificationPreference`, clore EF3 | EF3 **4367-4376** (« Schéma probable » l.4375) | ❌ non appliquée | Seule occurrence du nom : l.4367. `2026_04_23_090000_create_notification_preferences_table` inchangée. |
| **M4** Règle 6, Packages, `Capability` | Packages **50, 52-57** ; Règle 6 **4243-4256** (« 44 cas » l.**4253**) ; ligne d'enum `Capability` **3976** (« ≈ 30–50 entrées ») ; catalogue **3987-4010** | ❌ non appliquée — **aggravée** | `app/Models/Enums/Capability.php` compte **47** cas (46 à `839be671` + `boost.spend`, TCK-633). Le catalogue a gagné une ligne `boost.*` (l.4006) mais toujours pas `reports.view_agency`. Règle 6 et « Phase 2 … rien n'en est livré » inchangées. (Hors spec : `CLAUDE.md` racine écrit aussi « 44 cas ».) |
| **M5** §8 `PropertyCollaborator` | §8 **729-756** ; colonnes fantômes l.**741-746** ; `inviter()` l.754 | ❌ non appliquée | `is_primary` n'apparaît qu'en §9 l.768 (autre table). |
| **M6** §31 `Integration` | §31 **1622-1647** | ❌ non appliquée | `webhook_token`, `health_status` : 0. |
| **M7** §28 `Payout` | §28 **1512-1565** ; CHECK fantôme l.**1547** ; `PayoutStatus` **3962** | ❌ non appliquée | `payee_role` n'apparaît qu'en §77 (l.3267). `awaiting_approval` : 0. ⚠ Le décompte « le dépôt ne compte que quatre contraintes CHECK » est **devenu faux** : TCK-633 en ajoute quatre (`boost_products_price_check`, `property_boosts_credits_check`, `credit_lots_amounts_check`, `credit_movements_amount_check`) → **8**. La conclusion tient : aucune ne porte sur `payouts` (le docblock de `2026_10_07_200200` l.10 le dit). Reformuler sans compte. |
| **M8** §25 `Invoice` | §25 **1402-1446** (« unique » l.1415, l.1430) ; unicité **4305** | ❌ non appliquée | `credited_invoice_id`, `sequence_year` : 0. |
| **M9** §2 `Agency` + encart flottant | §2 **389-445** ; encart **3200-3204** (toujours entre §75 l.3171 et §76 l.3206) | ❌ non appliquée | Les 13 colonnes : 0 occurrence dans §2. TCK-633 a touché §2 (l.435 relation `creditLots()`, l.437-442 note « aucune colonne ajoutée à `agencies` ») sans traiter la dérive. ⚠ `features.md` l.426 (réécrite) crée l'espace « en XOF » : elle s'appuie sur `agencies.currency`, absente de §2. |
| **M10** §45 `PlatformPayout` | §45 **2099-2136** | ❌ non appliquée | `closed_by_id` : 0. |
| **M11** §67 `PropertyContactLead` | §67 **2914-2949** ; NOT NULL faux l.**2924** (`property_id`), **2926, 2927, 2929** | ❌ non appliquée | `handled_by_id` : 0 ; `channel` absent. |
| **M12** §29 `DocumentShareLink` | §29 **1566-1597** (`token` l.1575, « `token` unique » l.1587) ; unicité **4308** ; index **4168** | ❌ non appliquée | Les occurrences de `token_hash` à HEAD (l.3103, 3109, 3385, 3484, 3579, 3583) sont toutes dans §72, §81, §84, §87 — aucune dans §29. |
| **M13** Lever les bannières §76-78, §84-86 | bannières l.**3208** (§76), **3237** (§78), **3261** (§77), **3473** (§84), **3502** (§85), **3539** (§86) ; ordre 78 (3235) avant 77 (3259) | ❌ non appliquée | Identiques ; ordre toujours inversé. |
| **M14** §14 `Lease` | §14 **992-1054** ; en-tête §85 **3503-3504** (`leases.agent_id`) ; encart §82 **3390-3427** ; `LeaseStatus` **3933** | ❌ non appliquée | `late_fee_percent` : 0 ; `terminating` n'apparaît qu'en l.4236 (autre contexte). |
| **M15** §15 `LeasePayment` | §15 **1055-1094** (`late_fee` l.**1076**) | ❌ non appliquée | `late_fee_amount`, `late_fee_paid_at`, `platform_fee_pct_at_payment` : 0. |
| **M16** §6 `BookingPayment` | §6 **644-680** (colonnes fantômes l.**653** `user_id`, **660** `payment_date`, **661** `confirmed_date`) ; `User.booking_payments()` **372** | ❌ non appliquée | `payer_id` n'apparaît qu'en l.1064 (§15). |
| **M17** §7 `Customer` | §7 **681-728** | ❌ non appliquée | `agency_id` : 0 occurrence dans §7 ; `seeking_contract_type` : 0. |
| **M18** §3 `Property` | §3 **446-545** ; Packages l.**26** (`videos`, `virtual_tours`) ; jeton iCal seulement l.**3385** (§81) | ❌ non appliquée | Les 18 colonnes : 0. TCK-633 a touché §3 (l.480-484 : `featured` dérivé, `ranked_at`, `sponsored_until`, `badge`, `badge_until` ; l.533-542 relations et note Boost) sans traiter la dérive. |
| **M19** §5 `Booking` | §5 **587-643** | ❌ non appliquée | `expiry_reason` : 0 (`expired_at` n'apparaît qu'en §42 l.2008 et §66 l.2858). |
| **M20** §11 `Review` | §11 **831-866** (`user_id` l.**841**, `rating decimal(2,1)` l.**842**, `approved_by` l.**846**) | ❌ non appliquée | `author_id` n'apparaît qu'en §33 ; `reviews_author_context_uniq` : 0. |
| **M21** §21 `MaintenanceRequest` | §21 **1256-1299** | ❌ non appliquée | `quote_lines`, `access_instructions` : 0. |
| **M22** §24 `Inventory` | §24 **1363-1401** | ❌ non appliquée | `tenant_signature_data` : 0. |
| **M23** §1 `User` | §1 **284-388** ; unicité **4294** (`phone` « si non null »), **4295** (CHECK username/email) | ❌ non appliquée — **aggravée** | Les 7 colonnes et `users_phone_verified_unique` : 0. TCK-633 a ajouté en §1 six colonnes (l.308-313) et l'index partiel **du second numéro** (`users_secondary_phone_verified_unique`, l.356-359 et unicités l.**4320**) : la spec décrit maintenant correctement l'unicité partielle du numéro **secondaire** et toujours faussement celle du **principal** (l.4294) — contradiction interne visible. Nouvelle migration à citer avec l'index : `2026_10_07_150190_retirer_la_verification_des_telephones_en_doublon` (TCK-589, rattrapage qui trie avant `150200`). |
| **M24** §34 `OwnerProfile`, §35 `AgentProfile` | §34 **1702-1737** (`user_id` NOT NULL l.1710, `rib` « chiffré recommandé » l.**1713**, `tax_id` 1714, `id_document_number` 1716) ; §35 **1738-1770** (`user_id` l.1746) | ❌ non appliquée | `works_approval_threshold`, `agency_role_id` : 0. |
| **M25** §37 `ServiceProviderProfile` | §37 **1811-1844** (`user_id` l.1819, « `user_id` unique » l.**1833**) ; unicité **4316** | ❌ non appliquée | |
| **M26** §39 `ServiceProviderAgencyCollaboration` | §39 **1872-1898** (unicité l.**1891**) ; unicité **4318** | ❌ non appliquée | `sp_agency_collab_live_unique` : 0. |
| **M27** §40 `BankStatement` | §40 **1899-1947** | ❌ non appliquée | `csv_mapping`, `skipped_lines_count` : 0. |
| **M28** §48 `Invitation` | §48 **2184-2235** (`email` NOT NULL l.**2193**) | ❌ non appliquée | `invitations_email_or_phone_check` : 0. |
| **M29** §49 `AgencyUpgradeRequest` | §49 **2236-2276** (`ninea` l.**2247**, `rib_pro` l.**2248**) | ❌ non appliquée | Toujours `string`. |
| **M30** §63 `IntegrationWebhookLog` | §63 **2717-2745** (« payload brut conservé » l.**2721**, `payload` l.2732) | ❌ non appliquée | |
| **M31** §66 `RoleDelegation` | §66 **2838-2913** | ❌ non appliquée | `replaces_user_id` : 0. |
| **M32** §68 `PropertyReport` | §68 **2950-2981** (« statut ni de décision stockée » l.**2955**) | ❌ non appliquée | `reporter_fingerprint` : 0. |
| **M33** §17 `PropertyVisit` | §17 **1124-1166** (contrainte fantôme l.**1153-1155**) | ❌ non appliquée | |
| **M34** §18 `Conversation`, §20 `Message` | §18 `type` l.**1179** ; §20 `type` l.**1239** ; `ConversationType` **3950** ; `MessageType` **3952** | ❌ non appliquée | ⚠ Erreur de citation de la passe : M34 renvoyait `MessageType` à l.3558 ; la ligne était **3556** (l.3558 = `MaintenancePriority`). À HEAD : 3952. `audio` : 0 occurrence. |
| **M35** §55 `NotificationTemplate` | §55 **2448-2481** | ❌ non appliquée | Titre toujours « extension WhatsApp ». |
| **M36** Enums | tableau **3900-3986** ; périmés : `RelationshipType` **3943**, `LeaseStatus` **3933**, `PayoutStatus` **3962**, `MessageType` **3952** | ❌ non appliquée | Les **24** mêmes enums absents (recompté : `app/Models/Enums/` contre le tableau ; même liste exactement). Les 4 valeurs périmées le restent. TCK-633 a ajouté **ses** 7 enums au tableau (l.3979-3985) — preuve que le tableau est tenu pour les nouveaux, pas rattrapé pour les anciens. |
| **M37** EF2, EF3, EF8 | EF2 **4356-4366** ; EF3 **4367-4376** ; EF8 **4403-4410** | ❌ non appliquée | |
| **M38** Contraintes d'unicité | section **4288-4330** ; fausses : **4294** (phone), **4295** (CHECK), **4305** (invoices), **4308** (dsl token), **4316** (sp user_id), **4318** (sp collab), **4314, 4315, 4317** (courtier) | ❌ non appliquée — **aggravée** | Aucune des 9 lignes fausses corrigée, aucune des 5 manquantes ajoutée. TCK-633 y a **ajouté** 8 lignes (4320-4327) — la section grossit par recopie, ce que M38 proposait justement d'arrêter. |
| **M39** Index recommandés | section **4139-4187** ; `document_share_links \| token` l.**4168** ; mention TCK-310 l.4181 | ❌ non appliquée | |
| **M40** Résumé des changements | section **4012-4138** ; comptes l.**4018** (8), **4052** (22), **4077** (16), **4120** (46) | ❌ non appliquée — **aggravée** | TCK-633 ajoute un bloc **4099-4114** avec de nouveaux comptes écrits à la main (« Nouveaux modèles (10) », « +6 colonnes », « +4 colonnes », « Nouveaux enums (7) »). |
| **M41** `personal_access_tokens` | aucune section ; seule mention l.**3435** (§83, `name = impersonation`) | ❌ non appliquée | `idle_timeout_minutes`, `two_factor_verified_at` : 0. |

### Amendements aux recommandations reprises

- **M4 — « 44 cas » → aucun nombre.** `app/Models/Enums/Capability.php` compte **47** `case` depuis
  `BoostSpend` (TCK-633). Retirer le nombre de la Règle 6 (l.4253) plutôt que le corriger : *un compte
  écrit à la main finit faux* (CLAUDE.md, J-01). Signal hors spec : le principe 1 de `CLAUDE.md` écrit
  aussi « 44 cas ».
- **M7 — ne plus compter les CHECK.** La passe 011 écrivait « le dépôt ne compte que quatre contraintes
  CHECK » ; TCK-633 en ajoute quatre (`boost_products_price_check`, `property_boosts_credits_check`,
  `credit_lots_amounts_check`, `credit_movements_amount_check`). La conclusion tient — **aucune ne porte
  sur `payouts`** — et c'est elle qu'il faut écrire, sans compte.
- **M23 — le rattrapage des doublons de téléphone.** `2026_10_07_150190_retirer_la_verification_des_telephones_en_doublon`
  précède l'index `users_phone_verified_unique` : par numéro canonique, le compte vérifié le plus
  récemment (puis l'id le plus grand) garde `phone_verified_at`, les autres le perdent ; `down()` vide.
  Quand M23 réécrit la ligne `users | phone` de « Contraintes d'unicité » (l.4294), ajouter : « les
  doublons antérieurs ont été résolus par `150190` — le plus récemment vérifié garde la vérification ».
  La contradiction est désormais **interne** : l.4320 décrit juste l'index partiel du numéro
  **secondaire**, l.4294 toujours faux celui du **principal**.
- **M34 — citation corrigée.** La passe 011 renvoyait `MessageType` à l.3558 ; c'était l.3556. À HEAD :
  l.3952.

---

## B. Nouvelles — M42 à M49

Les deux premières sont les **faux positifs de la passe 011** : §4 et §10 y étaient comptées ✅ parce
qu'aucune migration ne les avait touchées depuis leur rédaction. TCK-633 les a touchées ; relues
colonne à colonne, elles ne décrivent pas leur table.

### M42 — §4 Address : réécrire le tableau sur la table réelle — **prioritaire (sert la P0 l.74)**
**Constat.** `2026_04_17_160003_create_addresses_table` crée `label`, `street`, `neighborhood`, `city`
(NOT NULL, défaut `'Dakar'`), `region`, `country` (string(2), défaut `'SN'`), `postal_code` (string(20)),
`latitude`/`longitude` (decimal(10,7)), `metadata`, `addressable` (`morphs`). Aucune autre migration
que `2026_10_12_400100` ne touche `addresses`. Le paragraphe ajouté par TCK-633 nomme `region` ;
le tableau ne l'a pas.
**Lignes à traiter.** Tableau de §4 (l.552-571 à HEAD) ; « Résumé des changements » (`Address : +1 colonne
(neighborhood)`).
**Proposition.** Retirer `address`, `state`, `district`, `building` ; ajouter `label` (string, nullable)
et `region` (string, nullable, « nom canonique de la région, écrit par `GeoAddressCanonicalizer` ») ;
`city` → NOT NULL, défaut `'Dakar'` ; `country` → string(2), défaut `'SN'` ; `postal_code` → string(20) ;
`latitude`, `longitude` → decimal(10,7) ; dire que `addressable_*` est NOT NULL et indexé (`morphs`).

### M43 — §10 Tag : colonnes d'origine, unicité insensible à la casse, pivot
**Constat.** `2026_04_17_160004_create_tags_table` : `name` string unique, `slug` string unique, `type`
string NOT NULL indexé, `icon` nullable, `color` string(7), `description` ; pivot `taggables` : `tag_id`
FK `cascadeOnDelete`, `morphs('taggable')`, timestamps, PK `taggables_primary (tag_id, taggable_id,
taggable_type)`. `2026_08_21_130000` puis `2026_08_22_100000` : unique `tags_name_lower_unique` sur
`LOWER(name COLLATE "und-x-icu")`.
**Lignes à traiter.** Tableau de §10 (l.786-799) ; paragraphe « Pivot `taggables` » (l.818-827) ;
« Contraintes d'unicité », ligne `tags | name`.
**Proposition.** `name`, `slug` → string (255) ; `type` → NOT NULL, sans défaut, indexé ; `color` →
string(7) ; écrire `tags_name_lower_unique` en §10 et dans « Contraintes d'unicité » (« unique, casse
repliée par ICU, ADR-0025 ») ; compléter le paragraphe du pivot par ses colonnes et sa clé primaire,
avant `attached_by_id`.

### M44 — §96 CreditMovement : dire ce que le trigger tolère vraiment
**Constat.** `2026_10_12_500200_create_credit_ledger_tables`, fonction `credit_movements_append_only()` :
un `DELETE` passe dès que `pg_trigger_depth() > 1` (toute suppression issue d'un trigger, pas seulement
d'une cascade de FK) ; un `UPDATE` passe dès qu'il ne change que `property_boost_id` et/ou `actor_id`
**vers `NULL`**, d'où qu'il vienne — la fonction ne distingue pas l'action `ON DELETE SET NULL` d'un
`UPDATE` direct.
**Ligne à traiter.** Paragraphe « Trigger » de §96 (l.3860-3864).
**Proposition.** Remplacer « la mise à `NULL` … par `ON DELETE SET NULL` » par « toute mise à `NULL` de
`property_boost_id` / `actor_id` — c'est ce qui laisse passer `ON DELETE SET NULL`, et un `UPDATE` direct
qui ne ferait que cela passe aussi » ; et « la suppression en cascade » par « toute suppression émise
depuis un trigger (`pg_trigger_depth() > 1`), dont la cascade ». La garde du modèle (`updating`,
`deleting`) reste la première ligne pour Eloquent.

### M45 — §3 et §92-93 : la conversion des `featured` hérités (`500400`)
**Constat.** `2026_10_12_500400_seed_boost_catalogue_and_convert_featured` exécute `BoostProductSeeder`
**et** `LegacyFeaturedConversion` : tout bien `featured = true` sans Vedette vivante reçoit une Vedette
**offerte** de 30 jours (`offered`, prix 0, `offer_reason` = « ADR-0061 : mise en avant antérieure
convertie en Vedette offerte », `boost_product_id` = l'offre 30 jours) et `sponsored_until` ; un bien
sans agence perd `featured` (écrit à `false` en SQL direct). La spec ne dit que « catalogue initial posé
par `500400` » et affirme que `featured` est écrit par `BoostLifecycle::project()` **seul**.
**Lignes à traiter.** §3, ligne `featured` (l.480) ; en-têtes de §92 (l.3711) et §93 (l.3738).
**Proposition.** §3 : « écrit par `BoostLifecycle::project()` — et une fois par la migration `500400`
(conversion des mises en avant antérieures) ». §92/§93 : « `500400` pose le catalogue et convertit les
`featured` hérités en Vedettes offertes de 30 jours ; un bien sans espace perd sa mise en avant ».

### M46 — §30 Setting et §58 FeatureFlag : les deux `spec_refs` de TCK-633 non appliqués
**Constat.** TCK-633 cite §30 et §58 dans ses `spec_refs` ; le delta ne touche ni l'une ni l'autre.
`App\Domain\Settings\EditablePlatformSettings` ajoute six clés de catégorie `boost` (ADR-0061 §6) :
`credits.welcome_amount` 500, `credits.welcome_validity_days` 180, `credits.expiry_notice_days` 7,
`boost.bump_cooldown_hours` 24, `boost.sponsored_slots_per_page` 3, `boost.reserved_top_results` 2 ;
§97 n'en nomme que deux. `App\Domain\Features\Flag` gagne `media_watermark` (éteint faute de ligne,
jamais exposé au client) et `host_auto_space` (ligne posée allumée par `2026_10_12_300000`, retirée
par `down()` seulement si aucun opérateur ne l'a touchée — `updated_by_id` nul).
**Proposition.** §30 : une phrase « Clés de crédits et de boost : voir ADR-0061 §6 » avec la liste des
six clés ; §58 : une phrase « Le catalogue (`Flag`) compte aujourd'hui `media_watermark` et
`host_auto_space` ; ce dernier est posé allumé par la migration `2026_10_12_300000` » — sans tableau de
valeurs, qui se lit dans le code.

### M47 — §89, §92, §93 : renvois « § » ambigus
**Constat.** « mention due … (§3) » (§89), « Badge 7 jours : 10 (§6) » (§92), « … ne l'est pas, §4 »
(§93) désignent ADR-0062 §3, ADR-0061 §6 et ADR-0061 §4 ; dans `models-spec.md`, « §3 », « §6 » et
« §4 » sont Property, BookingPayment et Address.
**Proposition.** Écrire « ADR-0062 §3 », « ADR-0061 §6 », « ADR-0061 §4 ».

### M48 — Rangement et compte du résumé
**Constat.** (a) §88-97 sont rangées sous « Modèles documentés a posteriori ✅ (TCK-310) », dont l'en-tête
dit « Ces seize modèles … n'avaient jamais été écrits ici » : ce sont des modèles neufs (même défaut pour
§73-87). (b) « Nouveaux enums (46) » n'a pas suivi les sept enums du bloc TCK-633.
**Proposition.** (a) Ouvrir un titre « Modèles ajoutés depuis TCK-310 » (TOC et corps) pour §73-97 ;
(b) retirer le nombre de l'en-tête ou y renvoyer au bloc TCK-633. Priorité basse.

### M49 — Comportements FK : les deux `restrictOnDelete` du référentiel
**Constat.** `2026_10_12_400000` pose `restrictOnDelete` sur `geo_cities.geo_region_id` et
`geo_neighborhoods.geo_city_id` : une région ou une ville référencée ne se supprime pas ; les adresses,
elles, sont en `nullOnDelete` (`400100`). Le tableau « Comportements FK » n'en dit rien.
**Proposition.** Ajouter `geo_cities.geo_region_id`, `geo_neighborhoods.geo_city_id` aux exemples de
`restrictOnDelete`, et `addresses.geo_city_id`, `addresses.geo_neighborhood_id` à ceux de la FK
optionnelle. Priorité basse.

---

## Résumé des actions

| ID | Section | Priorité |
|----|---------|----------|
| M1 | Retirer le courtier (§36, §38 et 20 renvois) | **Haute — ❌** |
| M2 | Section `AgencyAdminProfile` | **Haute — ❌** |
| M3 | Section `NotificationPreference`, clore EF3 | **Haute — ❌** |
| M4 | Règle 6, Packages, `Capability` (47 cas) | Haute — faux, aggravé |
| M5 | §8 `PropertyCollaborator` (`is_primary`) | Haute — P0 l.91 |
| M6 | §31 `Integration` | Moyenne |
| M7 | §28 `Payout` (sans compte de CHECK) | Haute — P1 argent |
| M8 | §25 `Invoice` | Haute — P1 argent |
| M9 | §2 `Agency` (dont `currency`, l.426) | Haute — P0 l.426 |
| M10 | §45 `PlatformPayout` | Moyenne |
| M11 | §67 `PropertyContactLead` | Haute — P0 l.117 |
| M12 | §29 `DocumentShareLink` | Moyenne |
| M13 | Bannières §76-78, §84-86 | Basse |
| M14 | §14 `Lease` | Moyenne |
| M15 | §15 `LeasePayment` | Moyenne |
| M16 | §6 `BookingPayment` | Haute — P0 l.210 |
| M17 | §7 `Customer` (`agency_id`) | Haute — P0 l.245 |
| M18 | §3 `Property` | Haute — P0 l.76 |
| M19-M22 | §5, §11, §21, §24 | Moyenne |
| M23 | §1 `User` (+ amendement `150190`) | Haute — P0 l.456 |
| M24-M35 | Profils, collaborations, relevés, invitations, journaux… | Moyenne (M28 : **Haute — P0 l.500**) |
| M36-M41 | Enums, EF, unicités, index, résumé, `personal_access_tokens` | Moyenne |
| M42 | §4 `Address` réécrite sur la table | **Haute — P0 l.74** |
| M43 | §10 `Tag` : colonnes d'origine, unicité, pivot | Moyenne |
| M44 | §96 `CreditMovement` : ce que le trigger tolère | Moyenne — garantie surévaluée |
| M45 | §3, §92-93 : conversion des `featured` hérités | Moyenne |
| M46 | §30, §58 : clés de boost et drapeaux (`spec_refs` de TCK-633) | Basse |
| M47 | §89, §92, §93 : renvois « § » ambigus | Basse |
| M48 | Rangement de §73-97 et compte du résumé | Basse |
| M49 | Comportements FK : `restrictOnDelete` du référentiel | Basse |
