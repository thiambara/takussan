# Passe 015 — Recommandations pour `docs/models-spec.md`

**Sept recommandations nouvelles : MD1 à MD7.** MC1 et MC2 (014) sont soldées, et MB13 (013)
l'est par TCK-651. MB13 n'est qu'une partie de C18, qui reste ouverte. MC3 et les 26 actions C1-C5,
C7-C27 (013) restent ouvertes et ne sont pas répétées
([texte intégral 013](../pass-013-2026-10-14-1023/03-recommendations-models-spec.md),
[014](../pass-014-2026-10-14-2220/03-recommendations-models-spec.md)).

| ID | Section | Objet | Priorité |
|----|---------|-------|----------|
| MD1 | §7 Customer | `id_number` chiffré (ADR-0070), colonne `locale`, index `user_id` | **Moyenne** — un lecteur de la spec écrit un `fields` qui rend 400 |
| MD2 | §27 Guarantor | `id_number` et `monthly_income` chiffrés, masques, lecture claire | **Moyenne** |
| MD3 | §34 OwnerProfile | `monthly_income` chiffré, quatrième colonne sensible | **Moyenne** |
| MD4 | §15 LeasePayment, §6 BookingPayment | `refund_amount` ; index `transaction_id` | Basse |
| MD5 | §61 ScheduledTaskRun | Index de la dernière exécution | Basse |
| MD6 | §69 NotificationDeliveryAttempt | `app_notification_id` nullable | Basse |
| MD7 | §3 Property | Ce qui est décrit avant d'être livré ; index de l'ordre public | **Moyenne** — la légende fait lire ➕ comme existant |

---

#### MD1 — §7 `Customer`

**Constat, mesuré sur la base migrée :**

- `customers.id_number` est en `text`, avec un cast `encrypted` (`2026_10_19_100000`, TCK-953). La
  spec écrit `string`.
- La colonne `locale` string(5) nullable (`2026_10_18_163900`, TCK-921) est absente. Elle donne la
  langue des messages d'un client sans compte, sinon le repli est `fr` (`ContactSansCompte::fromCustomer()`).
- L'index `customers_user_id_index` (`2026_10_18_050000`, TCK-862) n'est pas dans la ligne
  « Index ».

**Proposition :**

- Ligne `id_number` : « text (cast `encrypted`) | oui | null | Numéro de pièce d'identité —
  **chiffré** (TCK-953, ADR-0070) ».
- Nouvelle ligne `locale` après `emergency_contact_phone` : « string(5) | oui | null | Langue des
  messages d'un client sans compte (`fr`, `en`, `wo`) ; sans valeur, `fr` (TCK-921) | ➕ ».
- Ligne « Index » : ajouter `customers_user_id_index (user_id)`, lu à chaque `/api/auth/me` par
  `HasProfiles::hasActiveTenantLease()` (TCK-862).
- Nouveau paragraphe « **Données sensibles** (ADR-0070) », sur le modèle de §34. Il dit que
  `id_number` (`Customer::SENSITIVE`) :
  - est absent de toute sérialisation par défaut (`$hidden`) ;
  - est hors de `$queryFields` : `fields[customers]=…,id_number` rend 400 ;
  - ne sort que par trois voies :
    - masqué, par `CustomerResource` (`id_number_masked`, quatre derniers caractères) ;
    - en clair, par `GET /api/customers/{id}/sensitive` : admin de l'agence de la fiche et
      super-admin, second facteur récent, consultation journalisée (surface `customer_sensitive`) ;
    - par l'export du droit d'accès de l'utilisateur lié (`customers.json`, colonnes d'identité
      seules).
  - Une fiche sans agence n'est lisible en clair que par le super-admin (`Gate::before`).

#### MD2 — §27 `Guarantor`

**Constat.** `id_number` et `monthly_income` sont en `text`, avec un cast `encrypted`
(`2026_10_19_110000`, TCK-954). La spec écrit `string` et `decimal(14,2)`. Le `down()` de la
migration rend `numeric(14,2)` par `USING`.

**Proposition :**

- Les deux lignes passent en « text (cast `encrypted`) », avec la mention « chiffré (TCK-954,
  ADR-0070) ». La description de `monthly_income` garde « montant XOF ».
- Nouveau paragraphe « **Données sensibles** ». Il dit que `Guarantor::SENSITIVE` est `$hidden`, et
  que ces deux colonnes ne sortent que par :
  - `GuarantorController::format`, masquées : `id_number_masked` (quatre derniers caractères) et
    `monthly_income_masked` (`••••` ou `null`, sans rien révéler du montant) ;
  - `GET /api/guarantors/{id}/sensitive`, en clair. L'agence du sujet est celle de l'auteur
    (`GuarantorPolicy::agencyOf`, par `addedBy`). La lecture demande un second facteur récent et est
    journalisée (surface `guarantor_sensitive`).
- À appliquer dans le même mouvement que C10 (013), qui réécrit déjà les traits et les relations de
  cette section.

#### MD3 — §34 `OwnerProfile`

**Constat.** `monthly_income` est en `text`, avec un cast `encrypted` (`2026_10_19_120000`, TCK-956),
et entre dans `OwnerProfile::SENSITIVE`. La spec écrit `decimal(14,2)`, et son paragraphe « Données
sensibles » ne cite que trois colonnes.

**Proposition :**

- Ligne `monthly_income` : « text (cast `encrypted`) | oui | null | Revenus mensuels déclarés (XOF)
  — chiffré (TCK-956, ADR-0070) ».
- Paragraphe « Données sensibles » :
  - « `rib`, `tax_id` et `id_document_number` » devient « `rib`, `tax_id`, `id_document_number` et
    `monthly_income` » ;
  - ajouter que `OwnerProfileResource` rend le revenu par `monthly_income_masked` (`••••` ou
    `null`), et que `GET /api/owners/{id}/sensitive` le rend en nombre.

#### MD4 — §15 `LeasePayment` et §6 `BookingPayment`

**Constat :**

- `lease_payments.refund_amount` decimal(14,2) nullable (`2026_10_18_070000`, TCK-873) est absente de
  §15. `HasPaymentAttributes::paidAmount()` en déduit le montant reçu d'une échéance `refunded`.
- Les index `lease_payments_transaction_id_idx` et `booking_payments_transaction_id_idx`
  (`2026_10_18_080000`, TCK-891) manquent aux deux lignes « Index ». Ils servent la recherche du
  payable de chaque webhook entrant (`PaymentGatewayService::paymentsForEvent()`).

**Proposition :**

- §15 : ajouter la ligne `refund_amount` (« Montant remboursé, comme `booking_payments.refund_amount`
  (TCK-873) | ➕ »). Compléter la ligne « Index » par `lease_payments_transaction_id_idx
  (transaction_id)`.
- §6 : compléter la ligne « Index » par `booking_payments_transaction_id_idx (transaction_id)` (TCK-891).

#### MD5 — §61 `ScheduledTaskRun`

**Proposition.** Ajouter à « Index : `task` » la ligne
`scheduled_task_runs_task_last_run_idx (task, last_run_at DESC, id DESC)`. C'est la dernière
exécution par tâche, que lit `ScheduledTaskInspector` (TCK-802). L'index `task` reste.

#### MD6 — §69 `NotificationDeliveryAttempt`

**Constat.** `app_notification_id` est nullable depuis `2026_10_17_160000` (TCK-799) : un SMS envoyé
sans notification (contact sans compte, code de signature de bail) écrit aussi sa tentative. La clé
étrangère et son `cascadeOnDelete` restent. Le `down()` supprime d'abord les tentatives sans
notification.

**Proposition :**

- Colonne `app_notification_id` : Nullable « oui », et description « Notification acheminée, nulle
  pour un SMS envoyé hors notification (TCK-799) (`cascadeOnDelete`) ».
- Description de la section : « Une ligne par tentative d'acheminement SMS/WhatsApp, d'une
  notification ou d'un envoi direct ».

#### MD7 — §3 `Property` : la cible et l'état

**Constat :**

- `pending_owner_profile_id` est marqué ➕, ce que la légende lit « colonne ajoutée ». Il n'existe
  pas en base : TCK-1000 est `todo`.
- La prose de `user_id` décrit au présent :
  - « le bailleur désigné à la saisie » (TCK-997, `todo` ; aucune requête de bien ne lit de profil
    de bailleur) ;
  - trois voies de réécriture, dont deux non livrées (TCK-999, TCK-1000).
- Indépendamment : l'index partiel `properties_public_ranked_order_idx (ranked_at DESC NULLS LAST,
  id DESC) WHERE visibility = 'public' AND NOT is_test` (`2026_10_18_050100`, TCK-863) n'est pas
  décrit. La ligne `ranked_at` ne cite que `properties_ranked_at_idx`.

**Proposition — au choix du porteur :**

- **(a) Marquer la cible.** Suffixer `pending_owner_profile_id` de « — **à venir** (TCK-1000), non
  migrée au 2026-10-19 ». Dans `user_id`, distinguer ce qui est livré (la passation, TCK-603) de ce
  qui est décidé (TCK-997, 999, 1000). Retirer ces marques à la fusion de chaque ticket.
- **(b) Laisser en l'état** jusqu'à la fusion de TCK-1000. La spec redeviendra juste d'elle-même ; la
  §3 reste ⚠️ jusque-là.

(a) est recommandée. C'est le même défaut que C23 (013) : la légende confond « à créer » et
« existe ». La spec est le document où l'on vient lire l'état.

Dans les deux cas, ajouter à la ligne `ranked_at` : « ; l'ordre du catalogue public se lit par
`properties_public_ranked_order_idx` (`ranked_at DESC NULLS LAST, id DESC`, partiel sur
`scopePublic()`, TCK-863) ».
