# 01 — Matrice de corrélation features ↔ modèles

> Passe 012 — 2026-10-14 09:09. Conventions et limites : `00-summary.md`.
> Les numéros de ligne renvoient à `docs/features.md` (sha1 `291afd30`, 724 lignes) ; les « § » et
> « l. » de spec à `docs/models-spec.md` (sha1 `0c720866`, 4417 lignes). Migrations citées par leur
> nom de fichier, dans `takussan-api/database/migrations/`.

## Synthèse

- Features analysées : **379 lignes** (60 P0, 168 P1, 112 P2, 39 P3) — les 368 de la passe 011 et
  11 ajoutées par TCK-633 ; 13 des 368 ont été réécrites (TCK-633, TCK-620, TCK-632).
- Modèles analysés : **99 unités** (97 sections + `AgencyAdminProfile` et `NotificationPreference`,
  toujours sans section).
- Features : ✅ 286 — ⚠️ 93 (67 dérives + 26 P3 justifiés) — ❌ 0.
- Modèles : ✅ 57 — ⚠️ 38 — ❌ 4.

---

## A. Features → Modèles

### A.1 Décompte par section

| Section `features.md` (intertitre) | Lignes | ✅ | ⚠️ dérive | ⚠️ P3 justifié | ❌ | Lignes ajoutées | Lignes réécrites |
|---|---|---|---|---|---|---|---|
| §1.1 Gestion des biens (l.67) | 33 | 20 | 11 | 2 | 0 | 83, 84, 85, 86, 87 | 74, 81, 82 |
| §1.2 Recherche & découverte (l.107) | 31 | 24 | 6 | 1 | 0 | 116 | 115, 127 |
| §1.3 Réservations & visites (l.145) | 24 | 22 | 1 | 1 | 0 | — | — |
| §1.4 Baux (l.176) | 21 | 15 | 5 | 1 | 0 | — | — |
| §1.5 Transactions & paiements (l.204) | 26 | 16 | 9 | 1 | 0 | — | — |
| §1.6 CRM (l.237) | 18 | 14 | 3 | 1 | 0 | — | — |
| §1.7 Messagerie (l.262) | 12 | 8 | 2 | 2 | 0 | — | — |
| §1.8 Maintenance (l.281) | 20 | 12 | 6 | 2 | 0 | — | — |
| §1.9 États des lieux (l.341) | 7 | 4 | 1 | 2 | 0 | — | — |
| §1.10 Documents (l.355) | 9 | 6 | 1 | 2 | 0 | — | — |
| §1.11 Avis (l.371) | 10 | 5 | 3 | 2 | 0 | — | — |
| §1.12 Agence & équipe (l.388) | 20 | 13 | 4 | 3 | 0 | 427 | 426 |
| §2.1 Authentification (l.447) | 24 | 18 | 5 | 1 | 0 | 454 | 453, 456, 458, 465 |
| §2.1 Profils & contexte actif (l.476) | 9 | 9 | 0 | 0 | 0 | — | — |
| §2.1 Onboarding (l.494) | 10 | 9 | 1 | 0 | 0 | — | — |
| §2.2 Rôles & permissions (l.511) | 12 | 8 | 3 | 1 | 0 | 525 | — |
| §2.3 Notifications (l.532) | 14 | 12 | 2 | 0 | 0 | — | — |
| §2.4 Recherche & filtres (l.564) | 8 | 7 | 0 | 1 | 0 | — | — |
| §2.5 Reporting (l.577) | 21 | 20 | 1 | 0 | 0 | — | — |
| §2.6 Audit (l.610) | 9 | 9 | 0 | 0 | 0 | — | — |
| §2.7 Médias (l.624) | 8 | 7 | 0 | 1 | 0 | — | 634 |
| §2.8 i18n (l.637) | 8 | 5 | 1 | 2 | 0 | — | — |
| §2.9 Administration (l.655) | 20 | 18 | 2 | 0 | 0 | 660, 661 | 659 |
| §2.10 Pages légales (l.680) | 5 | 5 | 0 | 0 | 0 | — | — |
| **Total** | **379** | **286** | **67** | **26** | **0** | 11 | 13 |

Contrôle : sur `839be671`, le recomptage des lignes de priorité redonne exactement les 368 de la passe
011, section par section. À HEAD : 379 = 368 + 11.

Les P3 comptés ✅ (passe 011 → HEAD) : 97 → 102, 98 → 103, 167 → 173, 227 → 233, 228 → 234,
298 → 304, 540 → 549, 591 → 600, 592 → 601, 612 → 621, 613 → 622, 666 → 677, 667 → 678.

### A.2 Lignes ⚠️ par dérive — le support existe en base, la spec ne l'écrit pas (ou l'écrit faux)

**Les 64 de la passe 011, renumérotées.** Aucune n'est résolue ; cinq ont été réécrites sans que leur
dérive change. Le détail de chaque écart (colonnes, migration) est inchangé depuis la passe 011
(`pass-011-2026-10-08-2221/01-correlation-matrix.md`, A.2) ; la colonne « Reco » renvoie à
`03-recommendations-models-spec.md`.

| Anc. | HEAD | Prio | Fonctionnalité (abrégée) | Statut HEAD | Reco qui résout |
|---|---|---|---|---|---|
| 76 | 76 | P0 | Statut du bien (… archivé) | ⚠️ inchangé | M18 |
| 80 | 80 | P1 | Visite virtuelle par lien https | ⚠️ inchangé | M18 |
| 81 | 81 | P1 | Coût d'entrée d'une location | ⚠️ **réécrite** (TCK-633 : pas de frais d'agence pour un espace particulier, total dès l'aperçu — aucune colonne nouvelle) ; dérive inchangée | M18 |
| 84 | 89 | P1 | Collaborateurs, part et permissions | ⚠️ inchangé | M5, F4 |
| 86 | 91 | P0 | Réattribuer un bien | ⚠️ inchangé | M5, F5 |
| 93 | 98 | P2 | Modération avant publication | ⚠️ inchangé | M9, M18 |
| 94 | 99 | P2 | Décision sur un signalement | ⚠️ inchangé | M18, M32 |
| 95 | 100 | P2 | Archivage en lot | ⚠️ inchangé | M18 |
| 96 | 101 | P2 | Dépublier / réattribuer en lot | ⚠️ inchangé | M5 |
| 111 | 117 | P0 | Fiche publique, contact tél. ou e-mail | ⚠️ inchangé | M11 |
| 120 | 126 | P1 | Partage attribué à sa source | ⚠️ inchangé | M11, M33 |
| 121 | 127 | P1 | Contact WhatsApp et appel | ⚠️ **réécrite** (TCK-633 : « WhatsApp vise un numéro déclaré WhatsApp ») — la partie nouvelle est soutenue (`users.phone_whatsapp` §1 l.308, `property_contacts.has_whatsapp` §88) ; `property_contact_leads.channel` toujours absent de §67 → dérive inchangée | M11 |
| 122 | 128 | P1 | Coût d'entrée sur la fiche | ⚠️ inchangé | M18 |
| 124 | 130 | P1 | Visite virtuelle sur la fiche | ⚠️ inchangé | M18 |
| 127 | 133 | P1 | Signaler, retour sur l'issue | ⚠️ inchangé | M32 |
| 154 | 160 | P2 | Expiration des demandes | ⚠️ inchangé | M19 |
| 182 | 188 | P1 | Pénalités de retard automatiques | ⚠️ inchangé | M14, M15 |
| 184 | 190 | P1 | Pénalité réglée à l'agence | ⚠️ inchangé | M15 |
| 187 | 193 | P1 | Remboursement de la caution | ⚠️ inchangé | M14 |
| 190 | 196 | P2 | Résiliation anticipée | ⚠️ inchangé | M14 |
| 193 | 199 | P2 | Donner congé | ⚠️ inchangé | M14, M36 |
| 204 | 210 | P0 | Enregistrer un paiement | ⚠️ inchangé | M16, M15 |
| 206 | 212 | P1 | Facture opposable | ⚠️ inchangé | M8, M9 |
| 208 | 214 | P1 | Reversement calculé, payé une fois | ⚠️ inchangé | M7 |
| 209 | 215 | P1 | Remboursement de caution au locataire | ⚠️ inchangé | M7 |
| 211 | 217 | P1 | Double validation des sorties d'argent | ⚠️ inchangé | M7, M9, M10 |
| 214 | 220 | P2 | Passerelle de paiement | ⚠️ inchangé | M6 |
| 217 | 223 | P2 | Supervision des paiements | ⚠️ inchangé | M30 |
| 219 | 225 | P2 | Mapping CSV des relevés | ⚠️ inchangé | M9, M27 |
| 220 | 226 | P2 | Rapprocher débits / reversements | ⚠️ inchangé | M7 |
| 239 | 245 | P0 | CRM lu par le seul personnel | ⚠️ inchangé | M17 |
| 246 | 252 | P1 | Boîte des demandes de contact | ⚠️ inchangé | M11 |
| 252 | 258 | P2 | Critères de recherche du prospect | ⚠️ inchangé | M17 |
| 268 | 274 | P2 | Accusés de lecture individuels | ⚠️ inchangé | F11 |
| 271 | 277 | P2 | Notes vocales | ⚠️ inchangé | M34 |
| 287 | 293 | P1 | Accepter / refuser une intervention | ⚠️ inchangé | M21 |
| 291 | 297 | P2 | Devis et validation | ⚠️ inchangé | M21 |
| 292 | 298 | P2 | Devis structuré | ⚠️ inchangé | M21 |
| 294 | 300 | P2 | Plafond de travaux du bailleur | ⚠️ inchangé | M24 |
| 295 | 301 | P2 | Kit d'accès au logement | ⚠️ inchangé | M21 |
| 297 | 303 | P2 | Noter le prestataire | ⚠️ inchangé | M20 |
| 344 | 350 | P2 | Signature de l'EDL par tracé | ⚠️ inchangé | M22 |
| 358 | 364 | P1 | Jeton de partage haché | ⚠️ inchangé | M12 |
| 373 | 379 | P2 | Modération des avis | ⚠️ inchangé | M20 |
| 376 | 382 | P2 | Signalement sans masquage | ⚠️ inchangé | M20 |
| 378 | 384 | P2 | Modération par l'admin de ses biens | ⚠️ inchangé | M20 |
| 419 | 425 | P0 | Suspendre l'adhésion | ⚠️ inchangé | M2 |
| 420 | 426 | P0 | Auto-création d'une agence `individual` | ⚠️ **réécrite** (TCK-633 : sans question, XOF, drapeau `host_auto_space`) ; dérive inchangée et élargie à `agencies.currency` | M2, M9 |
| 425 | 432 | P1 | Passation du portefeuille | ⚠️ inchangé | M5 |
| 427 | 434 | P1 | Retirer un agent ou un admin | ⚠️ inchangé | M2 |
| 450 | 458 | P1 | Numéro vérifié unique à un compte | ⚠️ **réécrite** (TCK-620 : code affiché hors production, derrière un drapeau de configuration — aucune colonne) ; dérive inchangée, et contradiction §1 l.356-359 / unicités l.4294 vs 4320 (voir M23) | M23, M38 |
| 456 | 464 | P1 | Sessions bornées | ⚠️ inchangé | M41 |
| 457 | 465 | P1 | Connexion par téléphone, e-mail facultatif | ⚠️ **réécrite** (TCK-620 : allumée en local et préproduction) ; dérive inchangée (CHECK l.4295) | M38 |
| 461 | 469 | P1 | Données bancaires chiffrées | ⚠️ inchangé | M24, M29 |
| 492 | 500 | P0 | Invitation par e-mail OU SMS | ⚠️ inchangé | M28 |
| 512 | 520 | P0 | Permissions granulaires | ⚠️ inchangé (écart 44/47) | M4 |
| 516 | 524 | P1 | Attribution de rôles à un profil | ⚠️ inchangé | M4, M24 |
| 518 | 527 | P1 | Éditeur de rôles personnalisés | ⚠️ inchangé | M4, F3 |
| 533 | 542 | P1 | Préférences par événement et canal | ⚠️ inchangé | M3 |
| 539 | 548 | P2 | Digest quotidien / hebdomadaire | ⚠️ inchangé | M23 |
| 582 | 591 | P2 | Performance par agent | ⚠️ inchangé | M14 |
| 637 | 646 | P2 | Devise par agence | ⚠️ inchangé | M9 |
| 660 | 671 | P2 | Intégrations tierces | ⚠️ inchangé | M6, F7 |
| 665 | 676 | P2 | Journal des webhooks entrants | ⚠️ inchangé | M30 |

**Trois lignes de plus** :

| Anc. | HEAD | Prio | Fonctionnalité (abrégée) | Statut HEAD | Reco |
|---|---|---|---|---|---|
| 74 | 74 | P0 | Adresse géolocalisée, référentiel région/ville/quartier | ⚠️ **nouvelle** — réécrite par TCK-633. Le neuf est exact (§89-91, FK de §4) ; mais §4 `Address` ne décrit pas la table : `region` absente du tableau (il écrit `state`, inexistante), `latitude`/`longitude` en `decimal(10,7)` et non `(10,8)`/`(11,8)` — `2026_04_17_160003_create_addresses_table` | M42 |
| 448 | 456 | P0 | Vérification de l'e-mail ; compte ouvert par téléphone | ⚠️ **nouvelle** — réécrite par TCK-632. Le compte né par téléphone n'a ni e-mail ni `username` ; « Contraintes d'unicité » écrit un CHECK `username` ou `email` qu'aucune migration ne crée et qui l'interdirait | M23, M38 |
| — | 86 | P1 | Publier exige un contact joignable | ⚠️ **ajoutée** par TCK-633. Les colonnes du publieur sont exactes en §1 (`phone_whatsapp`, `terms_accepted_at`, `terms_version`, `2026_10_12_300100`) ; mais « le contact principal » se résout sur `property_collaborators.is_primary`, absent de §8 | M5, F5, F16 |

**67 lignes ⚠️ par dérive, dont 11 P0** : 74, 76, 91, 117, 210, 245, 425, 426, 456, 500, 520.

### A.3 Lignes ⚠️ P3 justifiées (26) — inchangées

| Anc. → HEAD | Statut |
|---|---|
| 99 → 104 · 100 → 105 · 137 → 143 · 168 → 174 · 229 → 235 · 254 → 260 · 272 → 278 · 273 → 279 · 299 → 305 · 300 → 306 · 346 → 352 · 347 → 353 · 362 → 368 · 363 → 369 · 379 → 385 · 380 → 386 · 434 → 441 · 466 → 474 · 521 → 530 · 566 → 575 · 626 → 635 · 638 → 647 · 639 → 648 | ⚠️ P3 inchangé (23 lignes, toutes `[=]`) |
| 195 → **201** (« Espace locataire dédié ») | ⚠️ P3 inchangé — F8 non appliquée |
| 432 → **439** (« Multi-branches ») | ⚠️ P3 inchangé — EF7 l.4395 |
| 433 → **440** (« Absence datée d'un agent ») | ⚠️ P3 inchangé — F13 / M31 / M37 non appliquées |

### A.4 Les 23 lignes ajoutées ou réécrites par TCK-633, TCK-620, TCK-632 — jugées une à une

Format : ligne HEAD · priorité · nature (A = ajoutée, R = réécrite) · verdict · support (§ et migration).
Les lignes « héritées » portent une dérive déjà nommée par la passe 011, que le delta n'a ni créée ni
résorbée.

### §1.1 Gestion des biens

| L. | Prio | Nat. | Verdict | Support mesuré |
|---|---|---|---|---|
| 74 | P0 | R | ⚠️ **dérive (nouvelle)** | Le neuf est juste : référentiel §89-91 (`2026_10_12_400000`), `addresses.geo_city_id` / `geo_neighborhood_id` §4 (`400100`), proposition `pending` §91 `status`/`created_by_id`. **Mais §4 écrit faux ce que la ligne manipule** : la « région » choisie est stockée en `addresses.region` (`2026_04_17_160003`), que le tableau de §4 n'a pas (il écrit `state`, inexistante) — alors que le paragraphe « Référentiel » ajouté par le delta, et ADR-0062 §4, nomment bien `region` ; « latitude / longitude » sont `decimal(10,7)`, §4 écrit `(10,8)` / `(11,8)`. → M42 |
| 81 | P1 | R | ⚠️ dérive (héritée) | Le neuf (« pas de frais d'agence pour un espace particulier », total dès l'aperçu) ne demande que `agencies.kind` (§2, exact). La dérive de la passe 011 reste : `deposit_months`, `advance_months`, `agency_fee_months`, `monthly_charges` absents de §3 (`2026_10_08_100000_add_entry_cost…`). Reco 011 |
| 82 | P1 | R | ✅ | §10 `status` (`ReferentialStatus`), `created_by_id`, pivot `taggables.attached_by_id`, `visiblesSurUneFiche()` ; `feature` fondu dans `amenity` — `2026_10_12_400200`, `400300`. Les écarts de §10 (M43) ne touchent pas les colonnes que la ligne exige. « Traduite » : le front possède le texte (principe 5), aucune colonne attendue |
| 83 | P1 | A | ✅ | `properties.currency` (`Currency`, défaut `XOF`) §3 ; `StorePropertyRequest::prepareForValidation()` force `XOF` |
| 84 | P1 | A | ✅ | `bedrooms`, `bathrooms`, `floor_number`, `parking_spaces`, `year_built` décrits en §3 ; listes = interface |
| 85 | P1 | A | ✅ | §88 `property_contacts` (`2026_10_12_300200`) : `label` string(60), `phone` string(30), `has_whatsapp`, `position` ; plafond 3 applicatif (`ReplacePropertyContactsRequest`, `max:3`), dit en §88 |
| 86 | P1 | A | ⚠️ dérive (héritée) | Données du publieur exactes en §1 : `phone_verified_at`, `phone_whatsapp`, `terms_accepted_at`, `terms_version` (`2026_10_12_300100`). Mais « le contact principal » est résolu par `PrimaryPropertyContact` : agent **désigné** (`property_collaborators.is_primary`), à défaut le plus anciennement invité, à défaut le titulaire. `is_primary` est absent de §8 (`2026_10_08_120000_add_is_primary…`) — dérive 011 (TCK-504). Voir aussi F16 |
| 87 | P1 | A | ✅ | §92 `boost_products`, §93 `property_boosts` (`500100`, `500500`) : `kind` bump/featured/badge, `variant` urgent/price_drop, `paused`/`remaining_seconds`, `refunded`/`refunded_credits` ; §3 `ranked_at`, `sponsored_until`, `badge`, `badge_until` (`500300`) ; dépense §95-96 (`500200`) ; délai de Remontée = réglage `boost.bump_cooldown_hours` dans `settings` (§30, générique — M46) |

### §1.2 Recherche & découverte publique

| L. | Prio | Nat. | Verdict | Support mesuré |
|---|---|---|---|---|
| 115 | P0 | R | ✅ | Ville/quartier du référentiel : §89-91 et FK de §4 ; filtres sur `bedrooms`, `area`, `price`, `contract_type`, `type` décrits en §3 ; reste = interface. *(Le départage des villes homonymes par la région, livré par TCK-635 depuis la passe 011, n'est pas dans la ligne — F15.)* |
| 116 | P1 | A | ✅ | §3 `featured` (dérivé), `sponsored_until` ; §93 ; impressions/clics §94 (`500100`) ; réglages `boost.sponsored_slots_per_page`, `boost.reserved_top_results` dans `settings` (§30 — M46) |
| 127 | P1 | R | ⚠️ dérive (héritée) | Le neuf est juste : `users.phone_whatsapp`, `secondary_phone_whatsapp` (§1) et `property_contacts.has_whatsapp` (§88). Dérive 011 inchangée : `property_contact_leads.channel` absent de §67 (`2026_10_07_150000`), et « le contact affiché » repose sur `is_primary` (§8) |

### §1.12 Agence & équipe

| L. | Prio | Nat. | Verdict | Support mesuré |
|---|---|---|---|---|
| 426 | P0 | R | ⚠️ dérive (héritée) | `agencies.kind`, `name`, `settings.primary_city`, `currency` ; drapeau `host_auto_space` (ligne de `feature_flags` posée **allumée** par `2026_10_12_300000`). Dérive 011 inchangée : `AgencyAdminProfile` sans section ; `agencies.currency` absent de §2. Formulation du drapeau ambiguë → F14 |
| 427 | P1 | A | ✅ | §95 `credit_lots` (lots datés, `expires_at`, `expiry_notice_sent_at`, ordre de consommation), §96 `credit_movements`, §97 `credit_welcome_grants` (unicité `phone_hash` et `agency_id`, `500200` + `500500`), capacité `boost.spend` (catalogue `Capability`) |

### §2.1 Authentification & comptes

| L. | Prio | Nat. | Verdict | Support mesuré |
|---|---|---|---|---|
| 453 | P0 | R | ✅ | Ajout purement de navigation (redirections) ; aucune donnée |
| 454 | P1 | A | ✅ | §1 `secondary_phone` string(30), `secondary_phone_verified_at`, `secondary_phone_whatsapp` défaut faux, `phone_whatsapp` nullable, index partiel `users_secondary_phone_verified_unique` (`2026_10_12_300100`) — exact |
| 456 | P0 | R | ⚠️ **dérive (nouvelle)** | TCK-632 n'ajoute aucune colonne (`email` nullable, `email_verified_at` sont en §1). Mais la ligne décrit désormais le compte **ouvert par téléphone, sans e-mail** : « Contraintes d'unicité » écrit toujours `CHECK (username IS NOT NULL OR email IS NOT NULL)`, **qu'aucune migration ne crée** (seul CHECK sur un e-mail du dépôt : `2026_10_07_150300_add_phone_to_invitations…`) et qui interdirait ce compte. Racine = dérive 011 de l.457 (ancienne numérotation) ; la ligne devient ⚠️ parce qu'elle l'expose |
| 458 | P1 | R | ⚠️ dérive (héritée) | L'ajout TCK-620 / ADR-0060 est un drapeau de **configuration** (`config('auth.otp_preview.enabled')`), aucune donnée — juste. Dérive 011 inchangée : « un numéro vérifié n'appartient qu'à un compte » repose sur `users_phone_verified_unique` (`2026_10_07_150200_make_email_nullable…`, précédé depuis la passe 011 du rattrapage `2026_10_07_150190_retirer_la_verification_des_telephones_en_doublon`), que « Contraintes d'unicité » écrit `phone unique si non null` (M23, et son amendement) |
| 465 | P1 | R | ⚠️ dérive (héritée) | Ajout TCK-620 = configuration, juste. Dérive 011 inchangée (contrainte « username ou email » inexistante) |

### §2.2 Rôles & permissions

| L. | Prio | Nat. | Verdict | Support mesuré |
|---|---|---|---|---|
| 525 | P0 | A | ✅ | Navigation d'administration dérivée du profil actif et des capacités : aucune donnée persistée nouvelle |

### §2.7 Médias & fichiers

| L. | Prio | Nat. | Verdict | Support mesuré |
|---|---|---|---|---|
| 634 | P2 | R | ✅ | Drapeau `media_watermark` (`App\Domain\Features\Flag`, éteint en l'absence de ligne) sur §58 `feature_flags` |

### §2.9 Administration & configuration

| L. | Prio | Nat. | Verdict | Support mesuré |
|---|---|---|---|---|
| 659 | P0 | R | ✅ | §10 `status`, `created_by_id` ; fusion sans `merged_into_id` (source supprimée) — décrit ; `400200`, `400300` |
| 660 | P1 | A | ✅ | §91 `status`, `merged_into_id` (FK auto-référente `nullOnDelete`), `renamed_at`, unicité partielle du nom (`400000`) |
| 661 | P1 | A | ✅ | Réglages dans `settings` (§30, générique — M46) ; octroi/retrait §95 `granted_by_id`, `reason`, §96 `admin_debit` ; annulation §93 `cancelled`, `cancel_reason`, `cancelled_by_id`, `refunded_credits` ; offerte §93 `offered`, `offer_reason` ; statistiques §94 |

Hors tableau, non compté : le paragraphe `individual` de §1.12 (l.395, « la monétisation passe par les
crédits de boost de l'espace », ADR-0061), cohérent avec §95-97.

---

## B. Modèles → Features

### B.1 ❌ (4) — les quatre de la passe 011, aucune résolue

| Unité | Où à HEAD | Constat | Mesure |
|---|---|---|---|
| §36 `BrokerProfile` | l.1771-1810 | Décrit une table **supprimée** ; la bannière l.1774-1780 dit toujours « VIVENT » | `2026_10_07_090100_drop_broker_tables` ; aucun modèle courtier dans `app/Models/` |
| §38 `BrokerAgencyCollaboration` | l.1845-1871 | idem | idem |
| `AgencyAdminProfile` | — (mentions l.59, 365, 2382, 2903, 4225, 4260) | Modèle du code **sans section** — et désormais nommé par `features.md` l.426 | `2026_05_10_170000_create_agency_admin_profiles_table` |
| `NotificationPreference` | — (EF3 l.4367) | Modèle du code **sans section** | `2026_04_23_090000_create_notification_preferences_table` |

Relevé exhaustif « modèle de `app/Models/` sans `### N. Nom` » à HEAD : ces deux-là seulement
(`Activity` est décrit dans §13, `Bases/AbstractModel` est abstrait). Les dix modèles de TCK-633 ont
chacun leur section.

### B.2 ⚠️ (38)

**Les 35 de la passe 011, toutes inchangées** (détail de chaque écart : passe 011, B.2) :

| § | Modèle | Lignes HEAD | Touchée depuis ? |
|---|---|---|---|
| 1 | User | 284-388 | **oui** (TCK-633 : +6 colonnes, index du 2ᵉ numéro) — écart principal inchangé, contradiction interne ajoutée (M23) |
| 2 | Agency | 389-445 | **oui** (TCK-633 : relation `creditLots`, note) — 13 colonnes toujours absentes |
| 3 | Property | 446-545 | **oui** (TCK-633 : 4 colonnes de boost, `featured` dérivé) — 18 colonnes toujours absentes |
| 5 | Booking | 587-643 | non |
| 6 | BookingPayment | 644-680 | non |
| 7 | Customer | 681-728 | non |
| 8 | PropertyCollaborator | 729-756 | non |
| 9 | UserCustomerRelationship | 757-781 (`broker_client` l.767) | non |
| 11 | Review | 831-866 | non |
| 14 | Lease | 992-1054 | non |
| 15 | LeasePayment | 1055-1094 | non |
| 17 | PropertyVisit | 1124-1166 | non |
| 18 | Conversation | 1167-1201 | non |
| 20 | Message | 1228-1255 | non |
| 21 | MaintenanceRequest | 1256-1299 | non |
| 24 | Inventory | 1363-1401 | non |
| 25 | Invoice | 1402-1446 | non |
| 28 | Payout | 1512-1565 | non |
| 29 | DocumentShareLink | 1566-1597 | non |
| 31 | Integration | 1622-1647 | non |
| 34 | OwnerProfile | 1702-1737 | non |
| 35 | AgentProfile | 1738-1770 | non |
| 37 | ServiceProviderProfile | 1811-1844 | non |
| 39 | ServiceProviderAgencyCollaboration | 1872-1898 | non |
| 40 | BankStatement | 1899-1947 | non |
| 45 | PlatformPayout | 2099-2136 | non |
| 48 | Invitation | 2184-2235 | non |
| 49 | AgencyUpgradeRequest | 2236-2276 | non |
| 52 | AgencyRole | 2353-2395 | non (contredite par Règle 6 l.4243 et Packages l.50) |
| 53 | AgencyRoleCapability | 2396-2418 | non |
| 55 | NotificationTemplate | 2448-2481 | non |
| 63 | IntegrationWebhookLog | 2717-2745 | non |
| 66 | RoleDelegation | 2838-2913 | non |
| 67 | PropertyContactLead | 2914-2949 | non |
| 68 | PropertyReport | 2950-2981 | non |

**Trois de plus :**

| § | Modèle | Lignes HEAD | Écart | Features servies |
|---|---|---|---|---|
| 4 | Address | 546-586 | **Re-jugée (✅ à la passe 011, comptée sans relecture).** Quatre colonnes décrites n'existent pas (`address`, `state`, `district`, `building`) ; `label` et `region` absentes ; `city` NOT NULL défaut `'Dakar'`, `country` string(2) défaut `'SN'`, `postal_code` string(20), `latitude`/`longitude` decimal(10,7). Les deux FK de TCK-633 sont exactes — `2026_04_17_160003`, `2026_10_12_400100` | §1.1, §1.2 |
| 10 | Tag | 782-830 | **Re-jugée (✅ à la passe 011, comptée sans relecture).** `name`/`slug` string(255) et non (100) ; `type` NOT NULL indexé ; `color` string(7) ; unicité insensible à la casse `tags_name_lower_unique` non écrite ; pivot `taggables` réduit à `attached_by_id`. Les ajouts de TCK-633 (`status`, `created_by_id`, `attached_by_id`, `icon`) sont exacts — `2026_04_17_160004`, `2026_08_22_100000`, `2026_10_12_400200`, `400300` | §1.1, §2.9 |
| 96 | CreditMovement | 3839-3873 | Colonnes exactes ; le trigger `credit_movements_append_only()` tolère plus que les « deux exceptions » écrites : toute suppression émise depuis un trigger, et tout `UPDATE` qui met `property_boost_id` ou `actor_id` à `NULL`, y compris direct — `2026_10_12_500200` | §1.12, §2.9 |

### B.3 ✅ (57)

§12, §13 (dont `Activity`), §16, §19, §22, §23, §26, §27, §30, §32, §33, §41-44, §46, §47, §50, §51,
§54, §56-62, §64, §65, §69-87 — **48**, dont §4 et §10 sortis (re-jugés ⚠️) — et neuf des dix sections
de TCK-633 : §88, §89, §90, §91, §92, §93, §94, §95, §97.

Sections TCK-633, relues colonne à colonne contre leurs migrations (détail plus bas) :

#### §88 PropertyContact — ✅
Migration `2026_10_12_300200_create_property_contacts_table`. `property_id` `unsignedBigInteger` NOT NULL,
FK `property_contacts_property_fk` `cascadeOnDelete` ✓ ; `label` string(60) nullable ✓ ; `phone` string(30)
NOT NULL ✓ ; `has_whatsapp` boolean défaut faux ✓ ; `position` `unsignedSmallInteger` défaut 0 ✓ ;
timestamps ✓ ; index `property_contacts_property_position_idx (property_id, position)` ✓ (couvre la FK).
Modèle : `fillable` = les 5 colonnes, casts `has_whatsapp` boolean, `position` integer, `property()` ✓.
Inverse `Property::contacts()` `orderBy('position')` ✓. Aucun trait (ni soft delete, ni journal) — la
spec n'en revendique aucun ✓. Sert l.85.

#### §89 GeoRegion — ✅
`2026_10_12_400000`. `code` string(8) unique `geo_regions_code_unique` ✓ ; `slug` string(80) unique
`geo_regions_slug_unique` ✓ ; `name` string(120) ✓ ; `latitude`/`longitude` decimal(10,7) nullable ✓ ;
timestamps ✓. Modèle : casts `decimal:7`, `cities()` ✓. 14 fichiers dans `database/data/geo/regions/`,
commande `geo:sync-referential` (`GeoSyncReferential`) et `GeoReferentialSeeder` existent ✓.
Remarque : « mention due là où le référentiel est servi (§3) » vise ADR-0062 §3, se lit models-spec §3 (M47).
Sert l.74, 115, 660.

#### §90 GeoCity — ✅
`geo_region_id` `foreignId` NOT NULL, FK `geo_cities_region_fk` **`restrictOnDelete`** ✓ ; `slug` string(120),
`name` string(120) ✓ ; lat/long decimal(10,7) ✓ ; unique `geo_cities_region_slug_unique` ✓ ; unique
`geo_cities_region_name_ci_unique (geo_region_id, LOWER(name COLLATE "und-x-icu"))` ✓ (expression rendue
par `CaseInsensitive::sql()`, vérifiée : `LOWER(%s COLLATE "und-x-icu")`) ; index
`geo_cities_name_ci_idx` ✓. Modèle : `region()`, `neighborhoods()` ✓. Sert l.74, 115.

#### §91 GeoNeighborhood — ✅
`geo_city_id` FK `geo_neighborhoods_city_fk` `restrictOnDelete` ✓ ; `slug` string(140) ✓ ; `name`
string(120) ✓ ; lat/long ✓ ; `status` string(16) défaut `approved` ✓ ; `origin` string(16) défaut
`dataset` ✓ ; `osm_ref` string(32) nullable ✓ ; `created_by_id` FK `geo_neighborhoods_created_by_fk`
`nullOnDelete` ✓ ; `merged_into_id` FK auto-référente `geo_neighborhoods_merged_into_fk` `nullOnDelete` ✓ ;
`renamed_at` ✓ ; unique `geo_neighborhoods_city_slug_unique` ✓ ; unique partiel
`geo_neighborhoods_city_name_ci_unique … WHERE status <> 'rejected' AND merged_into_id IS NULL` ✓ ;
index `geo_neighborhoods_status_city_idx (status, geo_city_id)`, `…_created_by_idx`, `…_merged_into_idx` ✓.
Modèle : casts `ReferentialStatus`, `GeoNeighborhoodOrigin`, `renamed_at` ; `$attributes` = défauts ;
`NOM_MAX = 120`, `SAUTS_MAX = 5`, `canonique()`, `scopeVisiblesPour()`, `slugLibre()` ; relations
`city()`, `createdBy()`, `mergedInto()`, `addresses()` ✓. Sert l.74, 115, 660.

#### §92 BoostProduct — ✅ (remarques M45, M47)
`2026_10_12_500100`. `kind` string(20) NOT NULL ✓ ; `variant` string(20) nullable ✓ ; `duration_days`
`unsignedSmallInteger` défaut 0 ✓ ; `price_credits` `unsignedInteger` NOT NULL sans défaut ✓ + CHECK
`boost_products_price_check (price_credits >= 0)` ✓ ; `is_active` défaut vrai ✓ ; `sort_order` défaut 0 ✓ ;
unique `boost_products_offer_unique (kind, variant, duration_days) NULLS NOT DISTINCT` ✓.
Catalogue (`BoostProductSeeder::CATALOGUE`, posé par `500400`) : bump 0 j 5 ; featured 7/15/30 j
20/35/60 ; badge `urgent` et `price_drop` 7 j 10 — conforme au texte et à ADR-0061 §6 ✓.
Modèle : casts `BoostKind`, `BoostBadge`, entiers, booléen ; aucune relation ✓.
Remarques : « (§6) » vise ADR-0061 §6 (M47) ; `500400` exécute aussi `LegacyFeaturedConversion` (M45).
Sert l.87, 661.

#### §93 PropertyBoost — ✅ (remarques M45, M47)
`500100` + CHECK `500500`. `property_id` FK `property_boosts_property_fk` cascade ✓ ; `agency_id` FK
`property_boosts_agency_fk` cascade ✓ ; `boost_product_id` nullable FK `property_boosts_product_fk`
`nullOnDelete` ✓ ; `kind` string(20), `variant` string(20) nullable ✓ ; `price_credits` `unsignedInteger`
NOT NULL ✓ ; `duration_days` `unsignedSmallInteger` NOT NULL **sans défaut** ✓ ; `starts_at` NOT NULL ✓ ;
`ends_at` nullable ✓ ; `status` string(20) NOT NULL sans défaut ✓ ; `remaining_seconds` nullable ✓ ;
`paused_at`, `ended_at` ✓ ; `offered` défaut faux ✓ ; `offer_reason`, `cancel_reason` text ✓ ;
`purchased_by_id`, `cancelled_by_id` FK users `nullOnDelete` ✓ (noms `property_boosts_purchased_by_fk`,
`property_boosts_cancelled_by_fk` non cités — sans conséquence) ; `refunded_credits` nullable ✓ ;
CHECK `property_boosts_credits_check` ✓ ; index `…_property_kind_status_idx`, `…_status_ends_at_idx`,
`…_agency_idx` ✓. Remontée née close (`ends_at = ended_at = now()`, `Ended`) vérifiée dans
`BoostPurchaseService` ✓. Modèle : casts enum/entiers/dates, `property()->withTrashed()`, `agency()`,
`product()`, `dailyStats()` ✓.
Remarques : la conversion des anciens `featured` (M45) ; « (…, §4) » vise ADR-0061 §4 (M47).
Sert l.87, 116, 661.

#### §94 PropertyBoostDailyStat — ✅
`property_boost_id` FK `property_boost_daily_stats_boost_fk` cascade ✓ ; `date` date NOT NULL ✓ ;
`impressions`, `clicks` `unsignedInteger` défaut 0 ✓ ; timestamps ✓ ; unique
`property_boost_daily_stats_boost_date_unique` ✓ (couvre la FK). Modèle : casts `date`, entiers ;
aucune relation ✓. Sert l.116, 661 (« statistiques »).

#### §95 CreditLot — ✅
`500200`. `agency_id` FK `credit_lots_agency_fk` cascade ✓ ; `origin` string(20) ✓ ; `initial_amount`,
`remaining_amount` `unsignedInteger` NOT NULL ✓ ; `expires_at` nullable ✓ ; `granted_by_id` FK
`credit_lots_granted_by_fk` `nullOnDelete` ✓ ; `reason` text ✓ ; `expiry_notice_sent_at` ✓ ; CHECK
`credit_lots_amounts_check` (texte exact) ✓ ; index `credit_lots_agency_expires_idx` ✓.
Modèle : `scopeSpendable()` (restant > 0, non expiré), `scopeInConsumptionOrder()`
(`expires_at ASC NULLS LAST`, `created_at`, `id`) ✓, relations ✓. `Agency::creditLots()` ✓.
Sert l.427, 661.

#### §96 CreditMovement — ⚠️ (M44)
Colonnes toutes exactes : `agency_id` cascade, `credit_lot_id` cascade, `type` string(20), `amount`
integer NOT NULL + CHECK `credit_movements_amount_check (amount <> 0)`, `property_boost_id` et `actor_id`
`nullOnDelete`, `reason` text, `created_at` `useCurrent()` NOT NULL, pas d'`updated_at` ✓ ; index
`credit_movements_agency_id_idx (agency_id, id)`, `…_lot_idx`, `…_boost_idx` ✓ ; trigger
`credit_movements_append_only_trg` / fonction `credit_movements_append_only()` ✓ ; modèle
`UPDATED_AT = null`, `getDates()` filtré, `updating`/`deleting` qui lèvent ✓ ; « seul modèle du dépôt »
vérifié (`grep UPDATED_AT = null` : un seul fichier) ✓.
**Écart :** la spec écrit « deux exceptions structurelles : la suppression **en cascade** d'un parent
(`pg_trigger_depth() > 1`), et la mise à `NULL` … **par `ON DELETE SET NULL`** ». La fonction est plus
large : (a) **toute** suppression émise depuis un trigger (profondeur > 1) passe, pas seulement la
cascade de FK ; (b) **tout** `UPDATE` qui met `property_boost_id` ou `actor_id` à `NULL` passe, y compris
un `UPDATE credit_movements SET actor_id = NULL` direct — la fonction ne peut pas distinguer l'action
référentielle. La garantie écrite est plus forte que celle que la base tient. Sert l.427, 661.

#### §97 CreditWelcomeGrant — ✅
`500200` + `500500`. `phone_hash` string(64) unique `credit_welcome_grants_phone_hash_unique` ✓ ;
`agency_id` nullable FK `credit_welcome_grants_agency_fk` `nullOnDelete`, unique
`credit_welcome_grants_agency_unique` (`500500`) ✓ ; `user_id` FK `…_user_fk` `nullOnDelete` ✓ ;
`credit_lot_id` FK `…_lot_fk` `nullOnDelete` ✓ ; `granted_at` NOT NULL ✓ ; timestamps ✓. Réglages
`credits.welcome_amount` 500 / `credits.welcome_validity_days` 180 = `EditablePlatformSettings` ✓ ;
`insertOrIgnore` dans `WelcomeCreditService` ✓. Modèle : `fillable` 5 colonnes, cast `granted_at`,
aucune relation ✓. Sert l.427, 661.

> Sur les 48 sections antérieures à TCK-633, celles qu'aucune migration n'a touchées depuis leur
> rédaction restent comptées conformes sans relecture colonne à colonne — c'est la limite qui a laissé
> passer §4 et §10 à la passe 011. Voir « Limites » dans `00-summary.md`.

### B.4 Sections existantes touchées par TCK-633 — le delta et ce qu'il laisse

### 2.2 Colonnes et règles ajoutées aux sections existantes

#### §1 User — delta exact
`2026_10_12_300100` : `phone_whatsapp` boolean nullable sans défaut ✓ ; `secondary_phone` string(30)
nullable ✓ ; `secondary_phone_verified_at` timestamp nullable ✓ ; `secondary_phone_whatsapp` boolean
défaut faux ✓ ; `terms_accepted_at` ✓ ; `terms_version` string(40) ✓ ; index unique partiel
`users_secondary_phone_verified_unique … WHERE secondary_phone_verified_at IS NOT NULL AND deleted_at IS NULL` ✓.
Modèle : `fillable` ajoute **seulement** `phone_whatsapp`, `secondary_phone_whatsapp` (la spec dit
`secondary_phone` et `terms_*` non assignables : exact) ; casts booléens/dates ✓ ; `booted()::updating`
remet `phone_whatsapp` à `null` quand `phone` change sans réponse ✓ ; `numeroPrincipalPublic()`,
`numeroSecondairePublic()` ✓ ; `NumeroPublieVerifieTest.php` existe ✓.
Migration de données du delta non décrite : `2026_10_07_150190_retirer_la_verification_des_telephones_en_doublon`
(rattrapage avant `users_phone_verified_unique` : par numéro canonique, le compte vérifié le plus
récemment garde `phone_verified_at`). Elle relève de M23 de la passe 011 (M23).

#### §2 Agency — delta exact
Aucune migration sur `agencies` ✓ ; `creditLots()` ✓ ; `#[ObservedBy([AgencyBoostObserver::class])]`
(`updated()`) ✓ ; `lockForUpdate()->firstOrFail()` dans `CreditLedger` ✓.

#### §3 Property — delta exact, une affirmation fausse
`2026_10_12_500300` : `ranked_at`, `sponsored_until`, `badge_until` timestamp nullable ✓ ; `badge`
string(20) nullable ✓ ; index `properties_ranked_at_idx` ✓ ; rattrapage `ranked_at = published_at` ✓.
Modèle : casts (`badge` → `BoostBadge`) ✓ ; `saving` (pose `ranked_at` à une (re)publication) ✓ ;
`replicating` remet à zéro les 4 projections et `ranked_at` ✓ ; `contacts()`, `boosts()`,
`tagsVisibles()` ✓ ; document de recherche `ranked_at ?? published_at` ✓ ; `UpdatePropertyRequest`
(`App\Http\Requests\UpdatePropertyRequest`) : `'featured' => ['prohibited']` ✓ ; `StorePropertyRequest`
n'a pas de règle `featured` (donc écarté par `validated()`) ✓.
**Faux :** « `featured` … écrit par `BoostLifecycle::project()` **seul** ». `LegacyFeaturedConversion`,
exécuté par la migration `500400`, écrit `properties.featured = false` et `sponsored_until` en SQL direct,
et `replicating` le remet à faux (ce dernier est dit plus bas). → M45.
*Hors delta, observé en passant :* la liste « Scopes » de §3 annonce `featured()`, `rent()`, `sale()`,
`published()` ; `Property.php` n'a que `scopeOfPublicAgency`, `scopePublic`, `scopeAvailable`,
`scopePublicPortfolio`, `scopeWithHostCalendar`, `scopeRoots` — déjà le cas à `839be671`. Laissé à la
re-mesure de la passe 011.

#### §4 Address — ⚠️ (relu parce que le delta l'a touché)
Delta exact : `geo_city_id` / `geo_neighborhood_id` `foreignId` nullable, FK `addresses_geo_city_fk` /
`addresses_geo_neighborhood_fk` `nullOnDelete`, index `addresses_geo_city_idx` /
`addresses_geo_neighborhood_idx` (`2026_10_12_400100`) ✓ ; `Address::booted()::saving` →
`GeoAddressCanonicalizer::canoniser()` ✓ ; `geoCity()`, `geoNeighborhood()` ✓ ; `fillable` ✓.
**Le reste du tableau ne correspond pas à la table** (`2026_04_17_160003_create_addresses_table`, seule
autre migration à toucher `addresses`) :

| Colonne spec | Réalité |
|---|---|
| `address` string nullable | **n'existe pas** |
| `state` string nullable « Région / État » | **n'existe pas** — la colonne est `region` string nullable |
| `district` string nullable | **n'existe pas** |
| `building` string nullable | **n'existe pas** |
| — | `label` string nullable **absente de la spec** (fillable du modèle) |
| — | `region` string nullable **absente du tableau**, alors que le paragraphe « Référentiel » ajouté par le delta la nomme |
| `city` string **nullable**, défaut null | string **NOT NULL**, défaut `'Dakar'` |
| `country` string nullable | string(**2**) NOT NULL, défaut `'SN'` |
| `postal_code` string | string(**20**) |
| `latitude` decimal(10,8), `longitude` decimal(11,8) | **decimal(10,7)** l'une et l'autre |
| `addressable_*` | `morphs()` : NOT NULL + index composite (non dit) |

#### §10 Tag — ⚠️ (relu parce que le delta l'a touché)
Delta exact : `status` string(16) défaut `approved`, index `tags_status_idx` ✓ ; `created_by_id` FK
`tags_created_by_id_fk` `nullOnDelete`, index `tags_created_by_id_idx` ✓ ; fusion `feature` → `amenity`
non défaite par `down()` ✓ ; `TagType::Feature` subsiste ✓ ; `icon` string nullable ✓ ; modèle : `fillable`,
`$attributes`, cast `ReferentialStatus`, `createdBy()`, `scopeVisiblesSurUneFiche()` ✓ ; pivot
`taggables.attached_by_id` FK `taggables_attached_by_id_fk` `nullOnDelete`, sans index ✓.
**Écarts sur les colonnes d'origine** (`2026_04_17_160004_create_tags_table`) :
- `name` : string (255) unique, **pas** string(100) ; s'y ajoute l'unique insensible à la casse
  `tags_name_lower_unique` sur `LOWER(name COLLATE "und-x-icu")` (`2026_08_21_130000`, recréé par
  `2026_08_22_100000`) — ni §10 ni « Contraintes d'unicité » ne le disent ;
- `slug` : string (255) unique, pas string(100) ;
- `type` : string **NOT NULL sans défaut**, indexé (`$table->index('type')`) ; la spec écrit
  nullable / null ;
- `color` : string(**7**), pas string(20) ;
- pivot `taggables` : seule `attached_by_id` est décrite ; la table porte `tag_id` (FK `cascadeOnDelete`),
  `taggable_type` / `taggable_id` (`morphs`, indexés), timestamps, et la clé primaire
  `taggables_primary (tag_id, taggable_id, taggable_type)`.

#### Enums et catalogue `Capability` — exacts
`ReferentialStatus` (approved, pending, rejected), `GeoNeighborhoodOrigin` (dataset, user), `BoostKind`
(bump, featured, badge), `BoostBadge` (urgent, price_drop), `BoostStatus` (active, paused, ended,
cancelled, refunded ; `live()`), `CreditLotOrigin` (welcome, admin_grant, refund, purchase),
`CreditMovementType` (grant, spend, refund, expire, admin_debit) : valeurs identiques aux fichiers
`app/Models/Enums/*.php` ✓. `boost.spend` = `Capability::BoostSpend` ✓. `Capability` compte désormais
**47 cas** (`grep -c "case "`) ; la Règle 6 écrit « 44 cas » (M4). La fourchette « ≈ 30–50 » de
« Packages » et du tableau des enums tient encore.


### B.5 Enums — hors compteurs

- **24 enums de `app/Models/Enums/` absents du tableau des enums** — exactement la liste de la passe
  011 (recomptée à HEAD). Les sept enums de TCK-633 y sont, valeurs exactes : le tableau est tenu pour
  les nouveaux, pas rattrapé pour les anciens.
- **4 enums aux valeurs périmées**, inchangés : `RelationshipType` l.3943 (`broker_client`),
  `LeaseStatus` l.3933 (manque `terminating`), `PayoutStatus` l.3962 (manque `awaiting_approval`),
  `MessageType` l.3952 (manque `audio`).
- `Capability` compte **47** cas (`boost.spend` ajouté) ; la Règle 6 écrit toujours « 44 ».
- Aucun enum du tableau n'est absent du code.

### B.6 Tables et données des migrations récentes que la spec ne décrit pas

| Migration | Objet | Décrit ? |
|---|---|---|
| `2026_10_07_150190_retirer_la_verification_des_telephones_en_doublon` | données : `users.phone_verified_at` remis à `null` sur les doublons vérifiés | **non** (M23) |
| `2026_10_12_300000_enable_host_auto_space_flag` | données : ligne `feature_flags` `host_auto_space` posée **allumée** (`insertOrIgnore`), `down()` ne la retire que si `updated_by_id` est nul | **non** — §58 ne nomme aucun drapeau (M46) |
| `2026_10_12_500400_seed_boost_catalogue_and_convert_featured` | données : catalogue **et** conversion des `featured` hérités en Vedettes offertes de 30 jours | à moitié (M45) |
| `2026_04_17_160003` (relue) | colonnes `label`, `region` d'`addresses` | **non** (M42) |
| `2026_04_17_160004` (relue) | colonnes du pivot `taggables` | **non** (M43) |
| toutes les autres du delta | tables et colonnes | oui, exactement |

### B.7 Observation hors spec — clés étrangères sans index

Clés étrangères du delta **sans index** et sans justification écrite (piège PostgreSQL n°8, que la
migration de `taggables` applique pourtant explicitement) : `property_boosts.boost_product_id`,
`purchased_by_id`, `cancelled_by_id` ; `credit_lots.granted_by_id` ; `credit_movements.actor_id` ;
`credit_welcome_grants.user_id`, `credit_lot_id`. Une suppression d'utilisateur fait un `SET NULL` sur
chacune. À trancher par ticket (mesure, puis index ou justification), pas dans la spec.
