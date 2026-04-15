# Backlog — 12 ⚠️ post-convergence

> **Date de génération :** 2026-04-14
> **Source d'audit :** [`pass-006-2026-04-14-2047/00-summary.md`](../sync-passes/pass-006-2026-04-14-2047/00-summary.md) (lignes 43–62)
> **Convergence actuelle :** 191 ✅ / 12 ⚠️ / 0 ❌ — statut confirmé en passes 007 et 008.

Ce document transforme les **12 ⚠️ restants** de la corrélation `features.md` ↔ `models-spec.md` en tickets actionnables. Aucun n'est bloquant pour le MVP : chacun est soit applicatif pur, soit couvert par une évolution future (EF2 / EF5 / EF9), soit un report P3 assumé.

## Critères de convergence (rappel)

1. ✅ Aucun ❌ dans les deux sens.
2. ✅ Les ⚠️ restants sont **justifiés** (applicatif, EF, ou P3 infra).
3. ✅ Deux passes consécutives sans recommandation actionnable (passes 007 & 008).

Le backlog ci-dessous ne modifie **ni** `features.md` **ni** `models-spec.md` : il vit en parallèle dans `docs/backlog/`. Tant qu'aucun ticket n'est fusionné dans les sources, la convergence reste valide.

## Récapitulatif

| ID | Titre | Phase | Famille | Estim. | Dépendances |
|----|-------|-------|---------|--------|-------------|
| TCK-001 | Comparateur de biens côte à côte | P2 | Applicatif front | S | — |
| TCK-002 | Passerelle de paiement (Wave / Orange Money / Stripe) | P2 | Applicatif back | L | `Integration` #31, décision produit |
| TCK-003 | Rapprochement bancaire semi-automatique | P2 | Applicatif back | M | `BookingPayment`, `LeasePayment` |
| TCK-004 | Campagnes email / SMS ciblées | P3 | Applicatif back | M | Provider mail/SMS, `Customer.pipeline_stage` |
| TCK-005 | Commissions automatiques par agent | EF2 → P3 | Évolution future | L | Bloqué — déclencheur produit |
| TCK-006 | Accusés de lecture individuels (> 5 participants) | EF5 → P2 | Évolution future | S | Bloqué — déclencheur produit |
| TCK-007 | Conversion multi-devises avec taux | EF9 → P3 | Évolution future | M | Bloqué — déclencheur produit |
| TCK-008 | Annulation booking avec remboursement partiel | P3 | Applicatif back | M | `BookingPayment.refund_amount`, barème produit |
| TCK-009 | Export comptable FEC | P3 | Applicatif back | M | `Invoice`, `Payout`, permission `accounting.export` |
| TCK-010 | Recherche vocale / langage naturel | P3 | Applicatif full-stack | M | Web Speech API, LLM externe |
| TCK-011 | Traduction automatique des contenus | P3 | Applicatif back | M | Service externe, cache Redis |
| TCK-012 | Recherche sémantique par embeddings | P3 | Infra lourde | XL | Décision archi (pgvector / managed) |

Légende estimation : **S** ≤ 2 j · **M** 3–5 j · **L** 6–10 j · **XL** > 10 j.

---

## Famille A — Applicatifs P2

### TCK-001 — Comparateur de biens côte à côte

- **Source :** `features.md §1.2 P2` (ligne 108).
- **Justification ⚠️ (passe 006) :** « Applicatif (sélection multiple front, pas de persistance) ».
- **Objectif fonctionnel :** permettre à un visiteur connecté de sélectionner jusqu'à 4 biens depuis les résultats de recherche et de les afficher côte à côte sur un écran dédié, avec comparaison visuelle des caractéristiques clés (prix, surface, chambres, amenités, localisation).
- **Critères d'acceptation :**
  - Un bouton « Comparer » apparaît sur chaque `PropertyCard` des résultats de recherche.
  - L'état de sélection est porté par un signal Angular (`selectedProperties: Signal<Property[]>`), persistant uniquement dans le `sessionStorage` du navigateur.
  - Limite stricte à **4 biens** maximum ; au-delà, le 5ᵉ remplace le plus ancien avec un `MessageService.add({severity:'info'})`.
  - Une barre flottante en bas de page affiche le compteur et un bouton « Voir la comparaison » dès 2 biens sélectionnés.
  - La page `/comparer` affiche un tableau responsive (1 colonne par bien) avec lignes : photo principale, prix, type, surface, chambres, salles de bain, amenités (intersection/différences surlignées), adresse, agent.
  - Un bouton « Retirer » par colonne met à jour l'état et redirige vers `/search-results` si ≤ 1 bien.
- **Modèles concernés :** aucun. Lecture seule depuis `Property`, ses médias et son adresse via les endpoints existants.
- **Dépendances :** aucune (pas de nouveau provider ni d'intégration).
- **Hors périmètre :**
  - Pas de persistance serveur de la sélection.
  - Pas de partage de comparaison par URL (hors scope — sinon promouvoir en P2+).
  - Pas d'export PDF de la comparaison.
- **Estimation :** **S** — purement Angular, composants existants réutilisables, pas de migration.

### TCK-002 — Intégration passerelle de paiement

- **Source :** `features.md §1.5 P2` (ligne 160).
- **Justification ⚠️ (passe 006) :** « Applicatif (service externe, traçabilité via `PaymentMethod`) ».
- **Objectif fonctionnel :** permettre à un client de payer en ligne un acompte de réservation ou une échéance de bail via une passerelle tierce (Wave, Orange Money, Stripe), avec retour automatique du statut dans `BookingPayment` / `LeasePayment`.
- **Critères d'acceptation :**
  - Une agence peut configurer son provider via le modèle `Integration` (#31) déjà créé, avec `provider` ∈ {`wave`, `orange_money`, `stripe`} et `credentials` chiffrées.
  - Un endpoint `POST /api/payments/{payment}/checkout` retourne une URL de redirection provider-agnostic.
  - Un webhook `POST /api/payments/webhooks/{provider}` reçoit la confirmation, vérifie la signature, et met à jour `BookingPayment.status` (ou `LeasePayment.status`) avec le reçu provider stocké dans `PaymentMethod`.
  - Un écran back-office affiche les tentatives de paiement et leur statut (`pending`, `succeeded`, `failed`, `refunded`).
  - Les tests couvrent au moins un provider avec un fake et les 3 états de webhook.
  - Les erreurs provider sont journalisées via `spatie/laravel-activitylog` sur le payment concerné.
- **Modèles concernés :** `Integration` (#31, existant), `PaymentMethod` (existant), `BookingPayment`, `LeasePayment`. Aucun nouveau modèle.
- **Dépendances :**
  - **Décision produit requise** : provider par défaut à implémenter en premier (Wave / Orange Money / Stripe). Recommandation technique : Stripe (SDK mûr, sandbox gratuit) en premier si marché régional mixte, Wave si focus Sénégal/Côte d'Ivoire.
  - Le ticket ne couvre qu'**un seul** provider — les suivants seront des tickets dérivés TCK-002b, 002c.
- **Hors périmètre :**
  - Pas de gestion des abonnements récurrents (out-of-scope MVP).
  - Pas de 3DS manuel — délégué au provider.
- **Estimation :** **L** — intégration externe, webhooks, sécurité signatures, retry logic.

### TCK-003 — Rapprochement bancaire semi-automatique

- **Source :** `features.md §1.5 P2` (ligne 161).
- **Justification ⚠️ (passe 006) :** « Applicatif (import CSV, pas de modèle dédié) ».
- **Objectif fonctionnel :** permettre à un administrateur d'importer un relevé bancaire CSV et de le rapprocher automatiquement des `BookingPayment` / `LeasePayment` en attente, avec une étape de validation manuelle des écarts.
- **Critères d'acceptation :**
  - Un endpoint `POST /api/reconciliation/import` accepte un fichier CSV avec mapping configurable des colonnes (date, montant, libellé, référence).
  - Le service `BankReconciliationService` propose pour chaque ligne un match heuristique basé sur `BookingPayment.amount`, `BookingPayment.paid_at` (tolérance ±2 jours), et `BookingPayment.reference`.
  - Un écran d'arbitrage affiche les 3 catégories : **matchées automatiquement**, **propositions à valider**, **sans correspondance**.
  - L'administrateur peut valider, rejeter ou matcher manuellement chaque ligne.
  - Les lignes validées déclenchent la mise à jour de `BookingPayment.status = paid` + journalisation dans `activity_log`.
  - Le CSV source est stocké via `spatie/laravel-medialibrary` sur un modèle `ReconciliationBatch` léger (juste `imported_at`, `imported_by_id`, `file`, `stats_json`) **ou** en tant que pièce jointe de l'agence via `Setting`. Décision : réutiliser `Setting` (scope agency) pour éviter un nouveau modèle.
- **Modèles concernés :** `BookingPayment`, `LeasePayment`, `Setting` (pour historique imports). **Aucun nouveau modèle** — c'est le cœur de la justification ⚠️.
- **Dépendances :** aucune externe.
- **Hors périmètre :**
  - Pas de connexion API bancaire directe (PSD2 hors scope).
  - Pas de matching ML — heuristique déterministe uniquement.
- **Estimation :** **M** — parseur CSV + heuristique + UI d'arbitrage.

### TCK-004 — Campagnes email / SMS ciblées

- **Source :** `features.md §1.6 P3` (ligne 183). _Noté P3 dans `features.md` mais P2 dans la table passe 006 ligne 55 — la source fait foi : **P3**._
- **Justification ⚠️ (passe 006) :** « Applicatif (jobs Laravel, pas de modèle dédié) ».
- **Objectif fonctionnel :** permettre à un agent de créer une campagne ciblée (email ou SMS) à partir d'un segment de `Customer` filtré par `pipeline_stage` et tags, avec envoi différé via jobs Laravel.
- **Critères d'acceptation :**
  - Un écran « Nouvelle campagne » permet de choisir le canal (`email` | `sms`), le template (Mailable ou string), et un filtre sur `Customer` (`pipeline_stage @in`, tags, dernière interaction).
  - Un bouton « Prévisualiser » affiche le nombre de destinataires matchés et les 5 premiers.
  - Un bouton « Envoyer » dispatche `SendCampaignEmailJob` ou `SendCampaignSmsJob` par batch de 50 avec throttling provider.
  - Les envois sont loggués dans `activity_log` avec sujet = `Campaign` (léger modèle pivot `Campaign` minimal : `name`, `channel`, `template`, `filter_json`, `sent_at`, `sent_by_id`, `recipient_count`) **si** le produit valide ce nouveau modèle ; sinon, journalisation pure via `activity_log`.
  - Décision par défaut : **pas** de nouveau modèle, journalisation seule. Un modèle `Campaign` pourra être ajouté ultérieurement si besoin de reporting.
  - Unsubscribe obligatoire en pied d'email (lien `GET /unsubscribe/{token}`).
- **Modèles concernés :** `Customer`, `Customer.pipeline_stage` (existant), `activity_log` (spatie). Aucun nouveau modèle en première itération.
- **Dépendances :**
  - **Décision produit requise** : provider email (Mailgun / SendGrid / SES) et provider SMS (Twilio / Africa's Talking / MSG91).
  - Recommandation : réutiliser le provider email actuel de Laravel (configurable via `MAIL_MAILER`) et Twilio pour SMS par simplicité.
- **Hors périmètre :**
  - Pas d'A/B testing.
  - Pas de tracking d'ouverture/clic (nécessiterait un modèle `CampaignEvent`).
  - Pas de planification différée — envoi immédiat seulement.
- **Estimation :** **M** — jobs, throttling, UI segment + preview.

---

## Famille B — Évolutions futures à promouvoir

> Les 3 tickets ci-dessous sont **bloqués par un déclencheur produit**. Ils ne doivent pas être planifiés tant que le déclencheur correspondant n'est pas observé. Cependant, les spécifications minimales sont figées ici pour permettre un démarrage rapide le jour où le produit débloque.

### TCK-005 — Commissions automatiques par agent (EF2)

- **Source :** `features.md §1.5 P3` (ligne 163) · `models-spec.md §Évolutions futures EF2` (lignes 1650–1659).
- **Justification ⚠️ (passe 006) :** « EF2 — modèle `Commission` différé (déclencheur : demande agence) ».
- **Statut :** 🚫 **bloqué par déclencheur produit.**
- **Déclencheurs formels (models-spec.md:1656-1659) :**
  - Besoin de ventiler une commission entre plusieurs bénéficiaires (agence + agent + courtier externe).
  - Besoin de tracker les versements échelonnés d'une commission.
  - Besoin de générer des états comptables de commissions pour l'agence.
- **Objectif fonctionnel :** remplacer les colonnes plates `Lease.commission_amount` / `commission_rate` par un modèle `Commission` polymorphe lié à `Lease` ou `Booking`, avec ventilation multi-bénéficiaires et versements échelonnés.
- **Modèle cible pressenti :**
  - `commissions(id, commissionable_type, commissionable_id, beneficiary_type, beneficiary_id, amount, rate, status, paid_at, timestamps)`
  - Enum `CommissionStatus` : `pending`, `partial`, `paid`, `cancelled`.
- **Critères d'acceptation (à affiner au déblocage) :**
  - Migration des `commission_amount` existants vers une ligne `Commission` unique par bail/booking.
  - Écran d'édition permettant d'ajouter plusieurs bénéficiaires avec pourcentage ou montant fixe (total = 100%).
  - Dashboard agent affichant les commissions dues / encaissées.
  - Export comptable (lien avec TCK-009).
- **Features débloquées au déblocage :** la ligne `features.md §1.5 P3` passe de ⚠️ à ✅.
- **Dépendances :** migration des données existantes, coordination avec TCK-009 (FEC).
- **Hors périmètre :** la règle métier de calcul (pourcentage de quoi ?) reste à définir par le produit au moment du déblocage.
- **Estimation :** **L** — nouveau modèle + migration + UI + lien comptabilité.
- **Post-déblocage :** une passe `/sync-specs` doit être lancée après merge pour acter la résolution.

### TCK-006 — Accusés de lecture individuels > 5 participants (EF5)

- **Source :** `features.md §1.7 P2` (ligne 196) · `models-spec.md §Évolutions futures EF5` (lignes 1677–1683).
- **Justification ⚠️ (passe 006) :** « EF5 — table `message_reads` différée (déclencheur conservé) ».
- **Statut :** 🚫 **bloqué par déclencheur produit.**
- **Déclencheur formel (models-spec.md:1683) :** apparition de conversations à > 5 participants (canaux support multi-agents, groupes d'équipe agence).
- **Objectif fonctionnel :** passer du système actuel (`conversation_participant.last_read_at` comparé à `message.created_at`) à un suivi fin par message × utilisateur, affichant des avatars de lecture sous chaque message dans les conversations de groupe étendues.
- **Modèle cible pressenti :** `message_reads(message_id, user_id, read_at, unique(message_id, user_id))`.
- **Critères d'acceptation (à affiner au déblocage) :**
  - Activation conditionnelle : le fin-grained read tracking n'est activé que si `conversation.participants_count > 5`.
  - Un job `MarkMessagesAsReadJob` insère les enregistrements en batch à chaque ouverture de conversation.
  - Le payload WebSocket des nouveaux messages inclut la liste des lecteurs courants pour permettre le rendu temps réel.
  - Migration rétroactive : pour les conversations existantes, initialiser `message_reads` à partir de `last_read_at`.
- **Features débloquées :** `features.md §1.7 P2` ligne 196 passe de ⚠️ à ✅.
- **Dépendances :** broadcast WebSocket existant, pas de provider externe.
- **Hors périmètre :** lecture fine pour conversations ≤ 5 participants (reste sur `last_read_at`).
- **Estimation :** **S** — schéma simple, logique conditionnelle, tests.
- **Post-déblocage :** passe `/sync-specs`.

### TCK-007 — Conversion multi-devises avec taux (EF9)

- **Source :** `features.md §2.8 P3` (ligne 383) · `models-spec.md §Évolutions futures EF9` (lignes 1705–1711).
- **Justification ⚠️ (passe 006) :** « EF9 — modèle `ExchangeRate` différé (déclencheur : première transaction hors devise de base) ».
- **Statut :** 🚫 **bloqué par déclencheur produit.**
- **Déclencheur formel (models-spec.md:1711) :** première transaction devant être réglée dans une devise différente de celle du bail / de l'annonce (ex: bail en XOF payé en EUR).
- **Objectif fonctionnel :** ajouter un modèle `ExchangeRate` historisé pour permettre la conversion automatique entre devises lors d'un paiement, avec affichage systématique du taux appliqué et de la date de référence sur les quittances et factures.
- **Modèle cible pressenti (models-spec.md:1709) :**
  - `exchange_rates(id, base_currency, target_currency, rate, valid_from, valid_to, source, timestamps)`
  - Source possible : API externe (openexchangerates, BCEAO) ou saisie manuelle.
- **Critères d'acceptation (à affiner au déblocage) :**
  - Commande `php artisan exchange-rates:refresh` qui pull les taux quotidiens depuis la source configurée.
  - Un paiement effectué dans une devise ≠ `Lease.currency` stocke `paid_amount_original`, `paid_currency`, `exchange_rate_id`, `converted_amount` sur `BookingPayment` / `LeasePayment` (à ajouter en même temps).
  - Les quittances PDF affichent « X EUR (≡ Y XOF au taux du JJ/MM/AAAA, source: …) ».
  - Fallback manuel : si la commande échoue, un écran admin permet la saisie.
- **Features débloquées :** `features.md §2.8 P3` ligne 383 passe de ⚠️ à ✅.
- **Dépendances :** choix source de taux, ajustement de `BookingPayment` / `LeasePayment`.
- **Hors périmètre :** trading / hedging, audit de change, taux intraday.
- **Estimation :** **M** — nouveau modèle + colonnes ajoutées sur payments + commande + UI admin.
- **Post-déblocage :** passe `/sync-specs`.

---

## Famille C — Reports P3 applicatifs

### TCK-008 — Annulation booking avec remboursement partiel

- **Source :** `features.md §1.3 P3` (ligne 127).
- **Justification ⚠️ (passe 006) :** « Report futur — colonne `refund_amount` déjà prête sur `BookingPayment` ».
- **Objectif fonctionnel :** permettre à un agent ou à un client d'annuler une réservation et de déclencher un remboursement partiel automatique selon un barème configurable (% remboursé en fonction du délai avant la date prévue).
- **Critères d'acceptation :**
  - Un nouveau service `BookingCancellationService` calcule le montant remboursable en fonction de `Booking.start_date - now()` et d'un barème stocké dans `Setting` (scope agency, key `booking.refund_policy`).
  - L'endpoint `POST /api/bookings/{booking}/cancel` applique l'annulation : statut `Booking.status = cancelled`, et crée une entrée de remboursement sur `BookingPayment` avec `refund_amount` et `refunded_at`.
  - Le barème par défaut : > 30 j → 100%, 15–30 j → 75%, 7–14 j → 50%, < 7 j → 0%.
  - Les trois rôles (client, agent, admin) peuvent initier l'annulation avec des permissions distinctes.
  - Une notification est envoyée au client et au bailleur via `AppNotification`.
  - Journalisation `activity_log` avec `properties = { refund_amount, policy_applied }`.
- **Modèles concernés :** `Booking`, `BookingPayment.refund_amount` (existant), `Setting` (nouveau scope), `AppNotification`. Aucun nouveau modèle.
- **Dépendances :**
  - **Décision produit requise** : validation du barème par défaut et possibilité de l'overrider par agence.
  - Coordination avec TCK-002 si remboursement passe par provider (sinon manuel).
- **Hors périmètre :**
  - Remboursement automatique via provider (délégué à TCK-002).
  - Politique spéciale « force majeure » — override manuel hors scope.
- **Estimation :** **M** — service + calcul + UI confirmation + notif.

### TCK-009 — Export comptable FEC

- **Source :** `features.md §1.5 P3` (ligne 164).
- **Justification ⚠️ (passe 006) :** « Applicatif (export à partir de `Invoice` + `Payout`) ».
- **Objectif fonctionnel :** générer un export comptable au format FEC (Fichier des Écritures Comptables, norme française 18 colonnes) sur une période donnée, à partir des factures (`Invoice`) et reversements (`Payout`) d'une agence.
- **Critères d'acceptation :**
  - Endpoint `GET /api/exports/fec?agency_id=&from=&to=&format=csv|xml`, protégé par permission `accounting.export`.
  - Le service `FecExportService` itère sur `Invoice` (débit client) et `Payout` (crédit bailleur) et produit les 18 colonnes FEC : `JournalCode`, `JournalLib`, `EcritureNum`, `EcritureDate`, `CompteNum`, `CompteLib`, `CompAuxNum`, `CompAuxLib`, `PieceRef`, `PieceDate`, `EcritureLib`, `Debit`, `Credit`, `EcritureLet`, `DateLet`, `ValidDate`, `Montantdevise`, `Idevise`.
  - Le fichier généré passe la validation officielle FEC (tabulation obligatoire, encodage ISO-8859-15, CRLF).
  - Un aperçu HTML du contenu est affiché avant téléchargement.
  - Les tests couvrent un jeu de données minimal avec 2 factures + 1 reversement.
- **Modèles concernés :** `Invoice`, `Payout`, `Agency`. Aucun nouveau modèle. Mapping des comptes comptables dans `Setting` (`scope=agency`, `key=accounting.chart`).
- **Dépendances :** mapping initial des comptes comptables par agence (saisie manuelle par le client).
- **Hors périmètre :**
  - Pas d'import FEC inverse.
  - Pas de bilan/compte de résultat — export brut uniquement.
- **Estimation :** **M** — format contraint, parsing/validation, permission.

### TCK-010 — Recherche vocale / langage naturel

- **Source :** `features.md §1.2 P3` (ligne 111).
- **Justification ⚠️ (passe 006) :** « Applicatif (frontend + API externe) ».
- **Objectif fonctionnel :** permettre à un visiteur de dicter une requête en langage naturel (« appartement 2 chambres à Dakar sous 500 000 ») et de la transformer en filtres structurés via un LLM externe.
- **Critères d'acceptation :**
  - Un bouton micro dans la barre de recherche `SearchBar` démarre l'enregistrement via `Web Speech API` (navigateur).
  - Le transcript textuel est envoyé à `POST /api/search/parse` qui retourne une structure `{ city, type, bedrooms, max_price, min_surface, … }` compatible avec les filtres existants.
  - Le backend appelle un LLM externe avec un prompt structuré et parse la réponse JSON.
  - En cas d'échec ou d'ambiguïté, le client affiche le transcript brut pour édition manuelle.
  - Fallback : si le navigateur ne supporte pas Web Speech API, le bouton est masqué.
- **Modèles concernés :** aucun. Lecture seule sur `Property`.
- **Dépendances :**
  - **Décision produit requise** : choix du LLM externe (OpenAI GPT-4o, Claude Haiku, Gemini Flash). Recommandation technique : Claude Haiku 4.5 — rapide et bon marché pour parsing structuré.
  - Stockage de la clé dans `Integration` avec `provider = 'llm_search_parser'`.
- **Hors périmètre :**
  - Pas de dialogue multi-tours.
  - Pas de TTS (réponse vocale).
- **Estimation :** **M** — front Web Speech + endpoint parse + prompt engineering.

### TCK-011 — Traduction automatique des contenus

- **Source :** `features.md §2.8 P3` (ligne 384).
- **Justification ⚠️ (passe 006) :** « Applicatif (service externe) ».
- **Objectif fonctionnel :** traduire automatiquement les contenus utilisateurs (descriptions de biens, avis, messages) entre FR / EN / WO, avec cache Redis pour éviter les appels répétés.
- **Critères d'acceptation :**
  - Un trait `HasAutoTranslation` appliqué sur `Property`, `Review`, et optionnellement `Message` expose une méthode `translatedTo(string $locale): string`.
  - Un service `TranslationService` appelle un provider externe (DeepL / Google Translate) et met le résultat en cache Redis avec la clé `translate:{source_hash}:{target_locale}` (TTL 30 jours).
  - L'invalidation est automatique sur `updated` du modèle source.
  - Un paramètre agence `Setting` `i18n.auto_translate_enabled` permet d'activer/désactiver par agence.
  - Les API JSON retournent un champ additionnel `translations: { en: "…", wo: "…" }` uniquement si le header `Accept-Language` le demande et que l'agence l'a activé.
- **Modèles concernés :** `Property`, `Review`, `Message`, `Setting` (config), `Integration` (clé API provider). Aucun nouveau modèle.
- **Dépendances :**
  - **Décision produit requise** : DeepL (meilleur FR/EN, pas de Wolof) vs Google Translate (supporte Wolof en bêta) vs combo (Google pour WO, DeepL sinon).
- **Hors périmètre :**
  - Pas de post-édition humaine.
  - Pas de traduction des templates Laravel `lang/` (ceux-ci restent localisés manuellement).
- **Estimation :** **M** — trait, cache, config par agence, tests.

---

## Famille D — Report P3 infra lourde

### TCK-012 — Recherche sémantique par embeddings

- **Source :** `features.md §2.4 P3` (ligne 335).
- **Justification ⚠️ (passe 006) :** « Report futur — nécessite pgvector ou service dédié ».
- **Objectif fonctionnel :** permettre une recherche qui comprend l'intention (« maison familiale calme proche école ») plutôt que les mots-clés exacts, via des embeddings vectoriels indexés et comparés par similarité cosinus.
- **Statut :** ⚠️ **décision architecturale requise avant estimation fine.**
- **Décision architecturale requise :**

  | Option | Avantages | Inconvénients |
  |--------|-----------|---------------|
  | **A. pgvector local** | Pas de service externe, transactions DB natives, backup unifié | Nécessite PostgreSQL (migration si actuellement MySQL), indexation lente sur gros volumes, maintenance extension |
  | **B. Service managé** (Pinecone, Weaviate, Qdrant Cloud) | Scaling automatique, APIs mûres, features avancées (hybrid, rerank) | Coût récurrent, dépendance tierce, synchronisation à gérer |
  | **C. Hybride Scout + rerank** | Réutilise l'existant (Scout + Meilisearch), rerank via LLM sur top-N | Qualité intermédiaire, latence rerank, complexité front |

- **Critères d'acceptation (post-décision) :**
  - Nouvelle route `GET /api/search/semantic?q=…` parallèle à la recherche full-text existante.
  - Indexation déclenchée sur `Property::created/updated` via un job `EmbedPropertyJob` qui appelle le provider d'embeddings choisi.
  - Top-20 résultats avec score de similarité ≥ 0.7.
  - A/B test possible côté front : toggle « recherche classique » / « recherche IA ».
  - Documentation du coût estimé par 1000 requêtes.
- **Modèles concernés :** `Property` (colonne `embedding vector(1536)` si pgvector, ou stockage externe sinon), `Setting` (provider + clés).
- **Dépendances :**
  - **Décision produit + architecture** avant tout démarrage.
  - Fournisseur d'embeddings : OpenAI `text-embedding-3-small`, Cohere `embed-multilingual`, ou modèle local `bge-m3`.
  - Potentielle migration MySQL → PostgreSQL si option A choisie (impact énorme sur tout le projet — à bien peser).
- **Hors périmètre :**
  - Recherche d'images par embeddings (scope dédié).
  - Reconstruction de l'index historique — première version sur biens actifs seulement.
- **Estimation :** **XL** — l'estimation fine n'est possible qu'après le choix d'option. Option C est la moins coûteuse mais la moins puissante ; option A implique potentiellement une migration SGBD.

---

## Annexe — Rappel des déclencheurs EF

Extrait de `docs/models-spec.md §Évolutions futures` (lignes 1650–1711) :

| EF | Modèle | Déclencheur formel |
|----|--------|---------------------|
| EF2 | `Commission` | Ventilation multi-bénéficiaires OU versements échelonnés OU états comptables de commissions (models-spec.md:1656-1659) |
| EF5 | `message_reads` | Conversations à > 5 participants (models-spec.md:1683) |
| EF9 | `ExchangeRate` | Première transaction dans une devise différente du bail / de l'annonce (models-spec.md:1711) |

**Règle opérationnelle :** tant qu'aucun de ces déclencheurs n'est observé en production, les tickets TCK-005 / TCK-006 / TCK-007 restent en attente et ne doivent pas être planifiés.

---

## Décisions laissées ouvertes

Ces points doivent être tranchés par le produit avant démarrage des tickets concernés :

| Ticket | Décision en attente | Recommandation technique |
|--------|---------------------|--------------------------|
| TCK-002 | Provider paiement prioritaire | Stripe (SDK mûr) en premier, Wave en second pour le marché régional |
| TCK-004 | Providers email + SMS | Mailer Laravel actuel + Twilio |
| TCK-008 | Barème de remboursement par défaut | 30j/15j/7j → 100/75/50/0 % |
| TCK-010 | LLM parsing langage naturel | Claude Haiku 4.5 |
| TCK-011 | Provider traduction | Combo DeepL (FR/EN) + Google (WO) |
| TCK-012 | Architecture vectorielle | À arbitrer — aucune recommandation automatique |
