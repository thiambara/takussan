# Passe 017 — Matrice de corrélation (différentielle)

**Périmètre.** Cette matrice ne contient que les unités re-mesurées :

- les lignes de `features.md` ajoutées ou modifiées depuis la passe 016, et les 14 lignes du Radar ;
- les sections de `models-spec.md` modifiées depuis la passe 016, ou visées par une migration
  ajoutée depuis.

**Toute autre unité garde son statut de la [matrice 013](../pass-013-2026-10-14-1023/01-correlation-matrix.md)**,
corrigé par les matrices [014](../pass-014-2026-10-14-2220/01-correlation-matrix.md),
[015](../pass-015-2026-10-19-2229/01-correlation-matrix.md) et
[016](../pass-016-2026-10-27-1455/01-correlation-matrix.md).

Les numéros de ligne sont ceux de `features.md` sha1 `22abd00a`. Le statut « 016 » d'une ligne
modifiée est celui de son ancien numéro (colonne « ex- »).

## Synthèse

| Axe | ✅ | ⚠️ | ❌ | Δ vs 016 |
|-----|----|----|----|----------|
| Features → Modèles (413 lignes) | 340 | 72 | 1 | +8 / −7 / 0 (l.752 et six lignes du Radar ⚠️ → ✅ ; l.223 neuve ✅) |
| Modèles → Features (111 sections) | 88 | 23 | 0 | +15 / −10 / 0 (13 ⚠️ → ✅ ; 5 neuves : 2 ✅, 3 ⚠️) |

## A. Features → Modèles — lignes re-mesurées

### A.1 — Lignes modifiées ou ajoutées hors Radar

| L. | ex- | Prio | § | Statut 016 | Statut 017 | Support mesuré | Reco |
|---|---|---|---|---|---|---|---|
| 221 | 221 | P1 | §1.5 | ✅ | ✅ | La pénalité réglée, ligne propre du reversement : §15 `late_fee_payout_id` et ses trois copies figées (P206.01), désormais décrites | FE4 soldée |
| 223 | — | P1 | §1.5 | — (neuve) | ✅ | Constaté : §28 `refunded_payment_*`. Reprise au net, imputée au suivant, reliquat reporté : §107. Copie figée des lignes : pivots de §28 (TCK-2017). La ligne ne promet pas le solde à la main, que §107 dit décidé et non livré : c'est cohérent | FE4 soldée |
| 233 | 232 | P2 | §1.5 | ✅ | ✅ | Ligne en doublon marquée : §41 `duplicate_of_line_id` (TCK-1919) | FE5 soldée |
| 234 | 233 | P2 | §1.5 | ⚠️ (C13) | ⚠️ (C13) | Le virement de clôture de la plateforme : §45 `bank_statement_line_id`, unique partiel, et §41 le dit. Mais C13 reste : §41 limite `matched_payment` à `BookingPayment \| LeasePayment`, alors que le code rapproche aussi `Invoice` et `Payout`, ce qui est l'objet même de la ligne | C13 |
| 284 | 283 | P2 | §1.7 | ✅ (signal FE3) | ✅ | Le « pas encore » est retiré et TCK-2191 est cité. Aucun schéma | FE3 soldée |
| 518 | 517 | P0 | §2.1 | ✅ | ✅ | Trois essais du rappel : §48 `reminder_attempts` (TCK-2155) | FE5 soldée |
| 684 | 683 | P1 | §2.9 | ✅ | ✅ | Anciens noms : §90 et §91 `former_names` | FE5 soldée |
| 752 | 751 | P1 | §2.11 | ⚠️ (FE1) | **✅** | Le plafond par usage et le coupe-circuit sont réglables en console (§103). Le global et le plafond par agence vivent en configuration, comme §103 le dit désormais (ME15). La ligne dit exactement cet état | FE1 soldée |

**Prose re-lue :**

- **§2.11, « un contenu externe est une donnée »** : conforme à `ExternalContentPolicy` (TCK-2398).
  FE2 soldée.
- **§2.12, six règles neuves**, toutes conformes au schéma ou à la configuration :
  - version des clauses : §110 `clauses_version` ;
  - prise en charge de 10 minutes : §108 `claimed_by_id`, `claimed_at`, `claim_expires_at`
    (`AdvertiserClaim::DURATION_MINUTES`) ;
  - réponse classée par l'IA, motif écrit contre un verdict discordant : §111 `ai_verdict`,
    `confirmed_by_id`, `confirmation_reason` ;
  - STOP définitif : §108 `do_not_contact_at`, §111 `revoked_at`, §109 `stage = do_not_contact` ;
  - relances : §110 `follow_up_of_id`, `follow_up_rank`, avec `config('radar.follow_ups')` (`after_days`
    3, `max` 2).
- **§2.12, règle ancienne « Les photos ne sont téléchargées qu'à la publication »** : **démentie par
  TCK-2387**. `SourcePhotoFingerprinter` télécharge chaque photo source pour en calculer l'empreinte
  dHash, puis la jette sans rien écrire (§109 `source_photo_hashes`). → FF1.

### A.2 — §2.12 Radar, re-classé ligne à ligne

| L. | Prio | Statut 016 | Statut 017 | Support mesuré | Ticket |
|---|---|---|---|---|---|
| 778 | P1 | ⚠️ justifié | **✅** | §109 `source_kind` (`url`, `text`, `captures`), `source_url`, `raw_text`, collection `radar_captures`. Plusieurs URL : `config('radar.intake.max_urls')`. Lecture refusée : codes de `UrlFetcher` (SSRF, `robots.txt`) | TCK-2386 `done` |
| 779 | P1 | ⚠️ justifié | **✅** | §109 `extracted`, un champ = `{value, confidence, evidence, flags}`. Quartier : `RadarNeighborhoodMatcher`. Nature et indices : §108 `nature`, `nature_signals`. L'enum `RadarConfidence` manque à l'inventaire (MF4) | TCK-2386 `done` |
| 780 | P1 | ⚠️ justifié | **✅** | Corriger : marque `corrected`. Valider, doublon, écarter : §109 `stage` (`reviewed`, `duplicate`, `discarded`), `stage_reason`, `duplicate_of_listing_id`, `duplicate_of_property_id`. Rapprochements : `matches`, `source_photo_hashes` (`RadarMatcher`) | TCK-2387 `done` |
| 781 | P1 | ⚠️ justifié | **✅** | Une fiche par numéro : §108, `phone` et `phone_hmac` uniques. Annonces, messages et accords : relations `listings`, `outreaches` et `consents`. Prise en charge : les trois colonnes de claim | TCK-2388 `done` |
| 782 | P1 | ⚠️ justifié | **✅** | §110 : `salutation`, `summary`, `message` (texte exact du lien `wa.me`), `clauses_version`, `channel = whatsapp_manual`, chaîne de relances | TCK-2388 `done` |
| 783 | P1 | ⚠️ justifié | **✅** | §111 `capture_hashes`, `transcript`, `ai_verdict` (classes de `RadarConsentVerification` : `consent`, `refusal`, `stop`, `question`, `ambiguous`). Confirmation humaine : `confirmed_by_id`, `confirmed_at`. Issue sans capture : §110 `outcome` (`recordOutcome`) | TCK-2388 `done` |
| 784 | P1 | ⚠️ justifié | ⚠️ justifié | §109 `property_id` et §108 `user_id` existent déjà, mais aucun geste « Publier pour lui » | TCK-2389 `todo` |
| 785 | P1 | ⚠️ justifié | ⚠️ justifié | `RadarConsentProof::otp` est déclaré, sans parcours | TCK-2390 `todo` |
| 786 | P1 | ⚠️ justifié | ⚠️ justifié (partiel) | Livré : STOP → `do_not_contact_at`, accords révoqués, annonces ouvertes `do_not_contact`. Pas livré : le retrait du public, et la révocation d'un accord publié | TCK-2391 `todo` |
| 787 | P1 | ⚠️ justifié | ⚠️ justifié | §109 `purge_at` (collecte + 90 jours) et §108 `phone_hmac` existent, mais aucune purge ne s'exécute. La spec la décrit pourtant au présent (MF1) | TCK-2391 `todo` |
| 788 | P2 | ⚠️ justifié | ⚠️ justifié | — | TCK-2392 `todo` |
| 789 | P2 | ⚠️ justifié | ⚠️ justifié | — | TCK-2393 `todo` |
| 790 | P2 | ⚠️ justifié | ⚠️ justifié | — | TCK-2394 `todo` |
| 791 | P3 | ⚠️ justifié | ⚠️ justifié | `RadarConsentProof::provider_message` et §111 `provider_message_id` sont déclarés, sans canal | TCK-2395 `todo` |

### Lignes non re-mesurées citées

| L. | Statut | Note |
|---|---|---|
| 232 (ex-231) | ⚠️ | Rapprochement semi-automatique : C13, inchangée |
| 560 (ex-559) | ❌ | Notifications push : FB1, inchangée |

## B. Modèles → Features — sections re-mesurées

| § | Modèle | Statut 016 | Statut 017 | Mesure | Features |
|---|---|---|---|---|---|
| 3 | Property | ⚠️ (mineur) | ⚠️ (mineur) | ME14 appliquée : la FK et l'index de `pending_owner_profile_id` sont nommés, et la redite des « trois voies » est retirée. Reste C19 : `bedrooms` est décrit `integer`, alors que la base a `unsignedTinyInteger` ; même écart pour `floor_number` et `total_floors` (`unsignedSmallInteger`) | l.92-94 |
| 11 | Review | ⚠️ | **✅** | ME9 appliquée : `reviews_author_subject_context_uniq`, la migration dans l'encadré, le tableau des unicités | §1.11 |
| 15 | LeasePayment | ⚠️ | **✅** | ME4 appliquée : six colonnes, index, encadré, absence de relation dite | l.191, 221, 228 |
| 27 | Guarantor | ⚠️ | **✅** (note) | ME6 et C10 appliquées : `agency_id` et sa reprise, `agencyOf`, relations mesurées, aucun média, aucun accesseur. Note : `phone` est écrit `string` (base : `string(30)`), sans effet | l.190, 202, 486 |
| 28 | Payout | ⚠️ | **✅** | ME5 appliquée : `refunded_payment_*`, `clawback_amount`, copies des pivots, `refundedPayment()` | l.221, 223 |
| 41 | BankStatementLine | ⚠️ | ⚠️ | ME8 appliquée : `duplicate_of_line_id`, index, et le paragraphe sur `PlatformPayout`. C13 reste : `matched_payment` à deux cibles au lieu de quatre, relations écrites `matched_payment()` / `confirmed_by()` | l.232, 233, 234 |
| 45 | PlatformPayout | ⚠️ | **✅** | ME7 appliquée : deux colonnes, unique partiel, tableau des unicités | l.234 |
| 48 | Invitation | ⚠️ (mineur) | **✅** | ME11 appliquée | l.518 |
| 69 | NotificationDeliveryAttempt | ⚠️ (mineur) | **✅** | ME14 appliquée : index `(agency_id, created_at)` | prose §2.3 |
| 86 | PlatformMetricDaily | ⚠️ (mineur) | **✅** | ME12 appliquée | reporting plateforme |
| 90 | GeoCity | ⚠️ | **✅** | ME10 appliquée | l.684 |
| 91 | GeoNeighborhood | ⚠️ | **✅** | ME10 appliquée | l.684 |
| 103 | AiUsageSetting | ✅ (note) | ✅ | ME15 appliquée : les plafonds global et par agence sont dits en configuration | l.752 |
| 104 | AiCall | ⚠️ | **✅** | ME1 appliquée : `stop_reason`, `error_code` en code `ai.*`, sens élargi de `failed_over` | l.752, 753 |
| 105 | AiSuggestion | ⚠️ (mineur) | **✅** | ME3 appliquée : « À venir (TCK-2391, `todo`) » | l.753 |
| 106 | AiEvaluationRun | ⚠️ | **✅** | ME2 appliquée | l.750 |
| 107 | PayoutClawback | — (neuve) | ✅ | Conforme à `2026_10_24_050000` : 17 colonnes, 3 index, unique de la paire, FK `cascadeOnDelete` / `nullOnDelete`. Le solde à la main est dit « décidé, pas livré », ce qui est exact | l.223 |
| 108 | RadarAdvertiser | — (neuve) | **⚠️ (mineur)** | Colonnes, uniques et index conformes à `2026_10_27_200000` et `2026_10_28_100000` ; casts et relations conformes au modèle. Mais la description (« Après un STOP, `phone` est purgé ») et la ligne `phone` (« null une fois purgé (STOP) ») disent au présent une purge non livrée : TCK-2391 est `todo`, et `RadarConsentWorkflow::stop()` dit « Rien n'est purgé ici » | l.779, 781, 786 |
| 109 | RadarListing | — (neuve) | **⚠️ (mineur)** | Colonnes, unique, CHECK et index conformes aux trois migrations. Trois écarts : (a) `raw_text` est dit « purgé à `purge_at` ou dès un STOP », et `stage = purged` est listé, alors qu'aucun code n'écrit ni l'un ni l'autre (TCK-2391) ; (b) la relation `outreaches()` (belongsToMany via `radar_outreach_listing`) manque, comme les casts de `source_kind` et `source_site` ; (c) l'index GIN n'est pas nommé (`radar_listings_photo_hashes_gin`) | l.778, 779, 780 |
| 110 | RadarOutreach | — (neuve) | **⚠️ (mineur)** | Colonnes, FK, unique et index partiel conformes à `2026_10_28_100100` et `2026_10_28_100200` ; relations et casts conformes. Un écart : `follow_up_rank` est écrit `smallint`, alors que la base a `unsignedSmallInteger` | l.781, 782 |
| 111 | RadarConsent | — (neuve) | ✅ | Conforme à `2026_10_28_100300` : 16 colonnes, deux FK `restrictOnDelete`, quatre index ; `scopeValid()`, `forceFill` et la collection `radar_consent_captures` conformes au modèle | l.781, 783 |

**Sections transversales :**

- **Paquets** : `laravel/ai` est décrit (ME15). Conforme.
- **Règle 1** : ME13 appliquée. C17 reste ouverte pour les Règles 2 et 4.
- **Contraintes d'unicité** : les lignes `reviews`, `platform_payouts` et `payout_clawback_imputations`
  sont exactes. Les unicités du Radar n'y sont pas (`radar_advertisers` ×2, `radar_listings`,
  `radar_outreaches`, la clé composite de `radar_outreach_listing`), ni le CHECK
  `radar_listings_dup_one_chk`. Le tableau se dit « extrait, pas inventaire », donc c'est facultatif.
  → MF5.
- **Enums** : les quatre lignes de TCK-2388 sont exactes. **Douze enums du code manquent** : six
  `Ai*` et six `Radar*`. → MF4.
- **Migrations** : les 8 du Radar ont leur trace dans la spec (8 sur 8). Les 16 que la 016 relevait
  sans trace ou avec un index omis sont toutes citées.
