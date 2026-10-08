# Passe 011 — Rupture de convergence mesurée sur les migrations

- **Date :** 2026-10-08 22:21 (heure locale de la machine, GMT)
- **Branche :** `docs/suites-vague-73` (base `origin/dev` a60a71b7 + commit de carte d'impact 839be671)
- **Passe précédente :** [`pass-010-2026-05-04-0918`](../pass-010-2026-05-04-0918/00-summary.md)
- **Sources lues :** `docs/features.md` (sha1 `feb6a6c9`, 714 lignes) et `docs/models-spec.md`
  (sha1 `4971298a`, 3990 lignes), dernier commit qui les touche : `d1bf7330` (2026-10-08).

## Méthode — ce qui change par rapport aux passes 001 à 010

Les passes 001 à 010 comparaient les deux documents **entre eux**. La re-mesure du 2026-08-16
(TCK-310, voir `INDEX.md`) a montré ce que cela coûtait : quatre recommandations sur sept de la
passe 009 décrivaient un schéma **déduit du nom des modèles**. La passe 011 juge donc chaque
section de `models-spec.md` **contre les migrations** de `takussan-api/database/migrations/`
(209 fichiers, dont 69 datés `2026_10_*`) et contre `app/Models/` — jamais contre une intention.

Conséquence assumée : **les compteurs ne se soustraient pas à ceux de la passe 010.** Le catalogue
est passé de ~208 à 368 lignes de fonctionnalités, la spec de 39 à 87 sections, et le critère
« supporté » est désormais « supporté par ce que la spec écrit ET que la base contient ».

Conventions de cette passe :

- Côté features : ✅ = la spec décrit le support (ou la ligne n'exige aucune donnée persistée) ;
  ⚠️ = (a) support présent dans le code mais absent ou faux dans `models-spec.md`, ou (b) P3 /
  hors périmètre sans modèle, justifié ; ❌ = aucun support, ni en spec ni en code.
- Côté modèles : une unité = une section numérotée, plus tout modèle de `app/Models/` sans section.
  ✅ = conforme aux migrations ; ⚠️ = la section existe mais diverge des migrations ou d'une autre
  section ; ❌ = section qui décrit une table supprimée, ou modèle du code sans section.

## Compteurs

| Axe | Unités | ✅ | ⚠️ | ❌ |
|-----|--------|----|----|----|
| Features → Modèles | 368 lignes (59 P0, 158 P1, 112 P2, 39 P3) | 278 | 90 (64 dérives + 26 P3 justifiés) | 0 |
| Modèles → Features | 89 (87 sections + 2 modèles sans section) | 50 | 35 | 4 |
| **Total** | | **328** | **125** | **4** |

**Δ vs passe 010 (232 / 15 / 2) :** +96 / +110 / +2 — **non comparables**, voir « Méthode ».
Ce qui est comparable : les deux ❌ de la passe 010 sont résolus, et quatre ❌ nouveaux sont apparus.

**Neuf lignes P0** reposent sur une colonne que la spec n'écrit pas ou écrit fausse (détail en
`01-correlation-matrix.md`) : `features.md` l.76, 86, 111, 204, 239, 419, 420, 492, 512.

## Top 5 points critiques

1. **❌ Le courtier est décrit vivant alors que ses tables sont supprimées.** La migration
   `2026_10_07_090100_drop_broker_tables` (TCK-586, ADR-0030) supprime `broker_profiles` et
   `broker_agency_collaborations` ; `2026_10_07_090000` supprime les relations `broker_client`.
   `app/Models/` ne contient plus aucun modèle courtier. Pourtant `models-spec.md` §36 et §38 écrivent
   « le modèle, la table, la migration… VIVENT », et `features.md` §2.1 (l.472) « vivent en base ».
   ADR-0030 n'est cité par aucun des deux documents. La liste exacte des lignes à retirer est dans
   TCK-586 (« Après fusion »).
2. **❌ Deux modèles du code n'ont pas de section.** `AgencyAdminProfile` (table
   `agency_admin_profiles`, migration `2026_05_10_170000`) — profil qui porte le rôle `agency_admin`
   de la Règle 5 — et `NotificationPreference` (table `notification_preferences`,
   `2026_04_23_090000`), que l'évolution **EF3** déclare « reportée » alors qu'elle sert la ligne P1
   de `features.md` §2.3 (l.533). La garde `check-models-spec` passe sur une simple **mention** :
   c'est le plancher qu'elle annonce elle-même, et il ne suffit pas ici.
3. **⚠️ `models-spec.md` se contredit sur les rôles personnalisés.** La Règle 6 (« NON
   IMPLÉMENTÉE », « vérifié le 2026-08-12 ») et l'en-tête « Phase 2 (TCK-279, `todo` — rien n'en est
   livré) » disent que `agency_roles`, `agency_role_capabilities` et `agency_role_id` n'existent pas.
   Ils existent : migrations `2026_08_16_120000` à `120400` (`agency_role_id` NOT NULL sur les profils
   agent, admin d'agence et bailleur) et `2026_08_17_090000` à `090200` (collaborations prestataire).
   §66 dit déjà l'inverse de la Règle 6. Le « 44 cas » de `Capability` est aussi périmé :
   `app/Models/Enums/Capability.php` en compte **46**.
4. **⚠️ Les sorties d'argent (TCK-594) ne sont décrites qu'en entrées minimales.** §28 `Payout` ignore
   `payee_role`, `approved_by_id`, `approved_at`, `processed_by_id`, `payout_method_id`,
   `service_provider_bill_id`, `bank_statement_line_id`, `bank_reconciled_at`, et décrit une contrainte
   « lease_id ou booking_id » qu'**aucune migration ne crée** (mesuré par TCK-594 et par cette passe :
   le dépôt ne compte que quatre contraintes CHECK). §25 `Invoice` ignore l'avoir et la numérotation
   par agence et par an ; §2 `Agency` ignore treize colonnes ; §45 `PlatformPayout` ignore la
   séparation des gestes. Ce sont les supports des lignes P1 « facture opposable » et « double
   validation » de §1.5.
5. **⚠️ Les items `/sync-specs` délégués par la vague n'ont pas été appliqués.** TCK-504 :
   `property_collaborators.is_primary`, son index unique partiel
   `property_collaborators_one_primary_per_property` et sa contrainte « principal ⇒ rôle agent »
   (migration `2026_10_08_120000_add_is_primary_to_property_collaborators`) — et §8 décrit six
   colonnes qui n'existent pas. TCK-293 : `integrations.webhook_token_hash` et `webhook_token`
   (`2026_10_08_120000_add_webhook_token_to_integrations_table`). TCK-590 : §67. TCK-602 : §29
   (`token_hash`). Et la ligne P0 « le CRM de l'agence n'est lu que par son personnel » repose sur
   `customers.agency_id`, que §7 n'écrit pas.

## Évolution depuis la passe 010

**Résolus (8) :** les deux ❌ de la passe 010 (`BankStatement`, `BankStatementLine`, §40-41) ; R3, R5,
R6 (avec un schéma mesuré, pas celui que la passe 009 avait déduit) ; R7 (`ConversationType`) ; R4
**sans objet** (la colonne visée n'existe pas). Mesure du 2026-08-16, reprise dans `INDEX.md`.

**Items délégués à `/sync-specs` par les tickets depuis, et leur sort :**

| Ticket | Item | État mesuré |
|--------|------|-------------|
| TCK-565, TCK-576 | Documenter les deux champs de recherche de §1.7 | ✅ appliqué (`features.md` l.267) — la règle de joignabilité, elle, ne l'est pas |
| TCK-588 | Amender §12 `AppNotification` (`code`, `params`, `target`) | ✅ appliqué |
| TCK-601 | Spec et features après fusion | ✅ appliqué pour §13, §42, §79 et `features.md` §1.12, §2.1, §2.6, §2.9 — ⚠️ pas pour §34 et §49 (colonnes chiffrées) |
| TCK-586 | Retirer le courtier des deux documents | ⚠️ partiel : `features.md` l.84 appliquée ; §36, §38, `broker_client`, l.472 de features non |
| TCK-504 | `is_primary` et colonnes d'acceptation de §8 | ❌ non appliqué |
| TCK-293 | `webhook_token_hash` / `webhook_token` | ❌ non appliqué |
| TCK-590 | Dérive de §67 (`agency_id`, `property_id` nullable) et colonnes de la boîte des demandes | ❌ non appliqué |
| TCK-594 | Contrainte de §28 inexistante ; trois entrées minimales (§76-78) ; colonnes d'`agencies` | ❌ non appliqué (les entrées minimales sont exactes, mais leur bannière dit « description complète par `/sync-specs` ») |
| TCK-595, TCK-602 | Entrées minimales §84-86, `leases.agent_id` | ⚠️ entrées exactes au regard des migrations ; `leases.agent_id` n'est écrit que dans l'en-tête de §85, pas dans §14 |

**Subsistent :** 90 ⚠️ côté features (dont 64 dérives à résorber dans `models-spec.md`), 35 ⚠️ et
4 ❌ côté modèles. Recommandations : 13 côté features (`02-recommendations-features.md`), 41 côté
modèles (`03-recommendations-models-spec.md`).

## Statut de convergence

**Rompue.** Quatre ❌ côté modèles, et des recommandations actionnables des deux côtés. La passe 012
n'a de sens qu'après application d'au moins M1 à M6 de `03-recommendations-models-spec.md`.

## Limites de cette passe, dites explicitement

- Les colonnes ont été relevées par lecture des migrations, **pas** sur une base migrée : une colonne
  posée par un `DB::statement` non lu ici peut manquer. Aucun test, aucune base, aucun réseau.
- Les sections qui ne sont touchées par aucune migration postérieure à leur rédaction ont été prises
  pour conformes sans relecture colonne à colonne (§16, §19, §22, §23, §26, §27, §30, §32, §33,
  §41, §43-44, §46-47, §50-51, §54, §56-62, §64-65, §69-71).
- Le stockage de trois comportements n'a pas été mesuré, et ils sont comptés ✅ sans preuve de
  colonne : le verrou de compte (§2.1 l.458), l'acompte « remboursement à traiter » (§1.3 l.151), le
  motif de suspension d'une agence (§2.9 l.655).
