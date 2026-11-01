# Passe 017 — Recommandations pour `docs/models-spec.md`

**Cinq recommandations nouvelles : MF1 à MF5.** Toutes décrivent du code **déjà fusionné sur `dev`**,
ou son absence. Ce sont des corrections factuelles, pas des décisions : chacune se vérifie dans une
migration, une classe ou un ticket nommés.

Soldées depuis la 016 : ME1 → ME15 (016), et C10 (013) avec ME6. Restent ouvertes, et ne sont pas
répétées ([013](../pass-013-2026-10-14-1023/03-recommendations-models-spec.md),
[014](../pass-014-2026-10-14-2220/03-recommendations-models-spec.md)) :

- C7, C8, C9 (partielle : `shareLinks()`, `Searchable`, cibles de profil), C11 → C15 ;
- C17 (partielle : Règles 2 et 4), C18 → C27 ;
- MC3.

**C13 (§40, §41) est désormais la plus coûteuse des reprises.** Elle garde deux lignes du catalogue en
⚠️ (l.232, l.234). ME7 et ME8 ont touché §41 sans la solder : `matched_payment` y a toujours deux
cibles (`BookingPayment | LeasePayment`), alors que le code rapproche aussi `Invoice` et `Payout`. Les
relations y sont écrites `matched_payment()` / `confirmed_by()`.

| ID | Section | Objet | Ticket(s) | Priorité |
|----|---------|-------|-----------|----------|
| MF1 | §108 RadarAdvertiser, §109 RadarListing | La purge est dite au présent ; elle est à venir | TCK-2391 (`todo`) | **Moyenne** — données personnelles |
| MF2 | §109 RadarListing | Relation `outreaches()`, casts des deux sources, nom de l'index GIN | TCK-2386, TCK-2387, TCK-2388 | Basse |
| MF3 | §110 RadarOutreach | `follow_up_rank` est non signé | TCK-2388 | Basse |
| MF4 | Enums | Douze enums du code absents de l'inventaire | TCK-2383 → TCK-2387 | Basse |
| MF5 | Contraintes d'unicité | Les unicités et le CHECK du Radar (facultatif) | TCK-2386 → TCK-2388 | Basse |

---

#### MF1 — §108 et §109 : une purge à venir, pas en place

**Constat.** Trois passages décrivent comme un fait la purge d'ADR-0077 §9 :

- §108, description : « Après un STOP, `phone` est purgé et `phone_hmac` […] reste » ;
- §108, ligne `phone` : « null une fois purgé (STOP) » ;
- §109, ligne `raw_text` : « purgé à `purge_at` ou dès un STOP ». Et `purged` figure parmi les
  valeurs de `stage`, sans réserve.

Dans le code fusionné :

- `RadarConsentWorkflow::stop()` pose `do_not_contact_at`, révoque les accords et ferme les annonces
  ouvertes. Son docblock dit : « **Rien n'est purgé ici** : le numéro et le texte brut partent avec
  TCK-2391 » ;
- aucun job ni commande ne lit `purge_at`, et aucun code n'écrit `stage = purged` ;
- TCK-2391 est `todo`.

C'est le défaut de ME3 (§105) et de C23 : la spec dit au présent ce qui est décidé. §105 le dit
correctement depuis ME3 (« **À venir** (TCK-2391, `todo`) »). Les sections du Radar, écrites dans la PR
de leur modèle, décrivent aussi le geste d'un ticket suivant. Sur des données personnelles, l'écart
compte plus qu'ailleurs : la spec laisse croire que la conformité d'ADR-0077 §9 est en place.

**Proposition — sur le modèle de ME3 :**

- §108, description : « Après un STOP, `phone_hmac` reste […]. **À venir** (TCK-2391, `todo`) : la
  purge de `phone`. Au 2026-10-29, un STOP pose `do_not_contact_at` sans rien effacer » ;
- §108, ligne `phone` : « null une fois purgé (STOP, **à venir**, TCK-2391) » ;
- §109, ligne `raw_text` : « purgé à `purge_at` ou dès un STOP (**à venir**, TCK-2391) » ;
- §109, ligne `stage` : ajouter « `purged` : écrit par la purge (TCK-2391, à venir) ».

À retirer dans la PR de TCK-2391, qui devra aussi lever la réserve de §105.

#### MF2 — §109 `RadarListing` : trois omissions

**Constat**, relevé sur `App\Models\RadarListing` et `2026_10_27_210000` :

- la relation **`outreaches()`** (belongsToMany `RadarOutreach`, table `radar_outreach_listing`),
  ajoutée par TCK-2388, n'est pas dans la liste du « Modèle » ;
- `source_kind` et `source_site` sont **castés** en `RadarSourceKind` et `RadarSourceSite`. La ligne du
  « Modèle » ne cite que le cast de `stage`. Les deux enums sont nommés dans leurs colonnes, sans dire
  qu'il s'agit d'un cast ;
- l'index GIN de `source_photo_hashes` porte un nom, **`radar_listings_photo_hashes_gin`**, que la
  ligne ne donne pas (« Index GIN `jsonb_path_ops` »).

**Proposition :**

- ajouter `belongsToMany outreaches` (table `radar_outreach_listing`) aux relations ;
- ajouter « `source_kind` en `RadarSourceKind`, `source_site` en `RadarSourceSite` » aux casts ;
- nommer l'index dans la ligne `source_photo_hashes`.

#### MF3 — §110 `RadarOutreach` : le rang est non signé

**Constat.** `follow_up_rank` est un `unsignedSmallInteger` (`2026_10_28_100100`). La spec écrit
`smallint`. C'est le même écart que C19 (013) sur §3, et la spec écrit ailleurs « unsigned smallint »
(§3 `deposit_months`) ou `unsignedSmallInteger` (§48 `reminder_attempts`).

**Proposition.** Type de la ligne `follow_up_rank` : `unsignedSmallInteger`.

#### MF4 — L'inventaire des enums : douze absents

**Constat.** Le tableau « Nouveaux enums » se dit relevé contre `app/Models/Enums/` et invite à
l'inventaire par `ls`. Douze fichiers du code n'y ont aucune ligne, tous ajoutés depuis le 2026-10-27 :

- **socle IA** (TCK-2383 → TCK-2385) : `AiCallOutcome`, `AiDataClass`, `AiEvaluationStatus`,
  `AiModelRole`, `AiRefusalReason`, `AiSuggestionDecision`. Leurs valeurs sont décrites dans les
  colonnes de §102 → §106, pas dans l'inventaire ;
- **Radar** (TCK-2386, TCK-2387) :
  - `RadarAdvertiserNature` : `probable_owner`, `probable_intermediary`, `agency`, `unknown` → §108 `nature` ;
  - `RadarListingStage` : les douze valeurs de §109 `stage` ;
  - `RadarSourceKind` : `url`, `text`, `captures` → §109 `source_kind` ;
  - `RadarSourceSite` : `coinafrique`, `expat_dakar`, `facebook`, `whatsapp`, `other` → §109 `source_site` ;
  - `RadarDiscardReason` : `not_real_estate`, `out_of_scope`, `no_longer_available`,
    `unusable_source`, `other`. Pas de cast : c'est le suffixe de `stage_reason` (`radar.discard.<motif>`) ;
  - `RadarConfidence` : `high`, `medium`, `low`. Pas de cast : la `confidence` de chaque champ de §109
    `extracted`, que la spec ne détaille pas.

TCK-2388 a écrit ses quatre enums dans l'inventaire, TCK-2386 et TCK-2387 non. L'inventaire du Radar
est donc à moitié tenu.

**Proposition.** Ajouter les douze lignes au tableau, avec leur colonne « Utilisé par » (le cast, ou à
défaut le lecteur). Pour la §109, préciser que `extracted.*.confidence` prend les valeurs de
`RadarConfidence`.

#### MF5 — Contraintes d'unicité : le Radar (facultatif)

**Constat.** Le tableau se dit « extrait, pas inventaire ». Les PR de la 016 y ont pourtant ajouté
leurs lignes (`platform_payouts`, `payout_clawback_imputations`, `reviews`). Le Radar n'y figure pas :

- `radar_advertisers_phone_unique (phone)`. Une colonne nullable : plusieurs annonceurs purgés
  peuvent porter un `phone` nul ;
- `radar_advertisers_phone_hmac_unique (phone_hmac)` ;
- `radar_listings_fingerprint_unique (content_fingerprint)` ;
- `radar_outreaches_follow_up_unique (follow_up_of_id)`. Une colonne nullable : seuls les messages
  initiaux sont nuls, ce qui est voulu ;
- la clé primaire composite `radar_outreach_listing_pk` ;
- le CHECK `radar_listings_dup_one_chk`.

**Proposition.** Ajouter ces lignes, la condition « `NULL` admis » dite pour les deux colonnes
nullables, avec un renvoi aux §108 → §110. Facultatif : chaque section porte déjà ses contraintes.

---

**Sans recommandation, dit explicitement :**

- **§107 `PayoutClawback`** : conforme à sa migration. Le solde à la main est dit « décidé, pas livré »,
  ce qui est exact.
- **§111 `RadarConsent`** : conforme à sa migration et à son modèle.
- **§108, nom de la FK `radar_advertisers_user_fk`** : non cité, comme la plupart des FK de la spec.
  Pas de recommandation.
- **La garde des migrations** proposée par la 016 (toute colonne ou table qu'une migration ajoutée
  crée doit être **nommée** dans `models-spec.md`) n'existe toujours pas. Les huit migrations du Radar
  ont pourtant toutes leur trace. Elle reste utile comme plancher, sans urgence nouvelle.
