# Takussan — Rapport de manques (gap report)

> Généré le 2026-04-18 par comparaison entre le code existant et `docs/features.md` + `docs/models-spec.md`.
> Seuls les **manques** sont listés — ce qui existe déjà n'est pas répété.

---

## Légende

- 🔴 **Bloquant / P0** — requis pour que l'app soit utilisable
- 🟠 **Important / P1** — attendu dans la première version publique (MVP)
- 🟡 **V2 / P2** — amélioration significative post-lancement
- ✅ **Présent** — confirmé dans le code

---

## 1. Backend (`takussan-api`)

### 1.1 Modèles & migrations — colonnes manquantes

#### `properties` (migration + modèle)

| Colonne spec | Statut | Impact |
|---|---|---|
| `lot_position` (ex `position`) | ❌ absent | Filtre / affichage bien |
| `level` | ❌ absent | Hiérarchie immeuble |
| `admin_monitored` (ex `with_administrative_monitoring`) | ❌ absent | P3, suivi administratif |

La migration `2026_04_17_160005_create_properties_table.php` et le `$fillable` du modèle ne contiennent pas ces trois colonnes.

#### `agencies` (migration + modèle)

| Colonne spec | Statut |
|---|---|
| `settings` json | ❌ absent de la migration et du modèle |

#### `users` (modèle — relations)

Les relations suivantes sont définies dans `models-spec.md` mais absentes du modèle `User` :

| Relation | Spec |
|---|---|
| `bookings()` → hasMany Booking | ❌ |
| `booking_payments()` → hasMany BookingPayment | ❌ |
| `customers()` → hasMany Customer (via `added_by_id`) | ❌ |
| `customer_relationships()` → hasMany UserCustomerRelationship | ❌ |
| `related_customers()` → belongsToMany Customer (pivot) | ❌ |
| `received_reviews()` → morphMany Review (via `reviewable`) | ❌ |

De plus, `writtenReviews()` pointe vers `author_id` alors que la spec définit `user_id` sur `reviews`.

#### `agencies` (modèle — relations)

| Relation | Spec |
|---|---|
| `reviews()` → morphMany Review | ❌ |
| `leases()` → hasMany Lease (via `agency_id`) | ❌ |

---

### 1.2 Contrôleurs & routes manquants

#### Ressources entièrement absentes

| Ressource | Contrôleur | Routes | Priorité |
|---|---|---|---|
| **Tags** (amenities, labels CRM) | ❌ `TagController` | ❌ `GET/POST /tags`, `PUT/DELETE /tags/{tag}` | 🔴 P0 (admin config) |
| **Tasks** (CRM rappels/relances) | ❌ `TaskController` | ❌ `/tasks` CRUD | 🟠 P1 |
| **CustomerNotes** | ❌ `CustomerNoteController` | ❌ `POST /customers/{customer}/notes`, `DELETE /customer-notes/{note}` | 🟠 P1 |
| **Guarantors** (garants) | ❌ `GuarantorController` | ❌ `/guarantors` CRUD | 🟠 P1 |
| **Settings** (config plateforme/agence) | ❌ `SettingController` | ❌ `/settings` | 🟡 P2 |
| **Integrations** (passerelles, APIs tierces) | ❌ `IntegrationController` | ❌ `/integrations` | 🟡 P2 |
| **DocumentShareLinks** (partage sécurisé) | ❌ `DocumentShareLinkController` | ❌ `POST /documents/{doc}/share`, `GET /share/{token}` | 🟠 P1 |
| **PropertyPriceHistory** | ❌ `PropertyPriceHistoryController` | ❌ `GET /properties/{property}/price-history` | 🟠 P1 |

#### Actions manquantes sur ressources existantes

| Ressource | Action manquante | Spec / features.md |
|---|---|---|
| `POST /bookings/{booking}/reject` | ❌ Seuls `confirm` et `cancel` existent — `reject` est absent du contrôleur et des routes | `BookingStatus::rejected` existe en enum |
| `POST /leases/{lease}/renew` | ❌ Renouvellement de bail absent | features.md §1.4 P2 |
| `POST /leases/{lease}/payments/generate-schedule` | ❌ Génération automatique de l'échéancier de loyers | features.md §1.4 P1 |
| `GET /agencies/{agency}/reviews` | ❌ Seules les reviews de property sont exposées | features.md §1.11 |
| `POST /agencies/{agency}/reviews` | ❌ | features.md §1.11 |
| `DELETE /agencies/{agency}` | ❌ Pas de soft-delete agence | |
| `PUT /property-visits/{visit}` | ❌ Pas d'édition après création | |
| `GET /audit-log/{entity}/{id}` | ❌ Filtrage par entité absent (seul `GET /audit-log` existe) | features.md §2.6 P1 |
| `GET /dashboard/stats?role=owner` etc. | Endpoint unique — non différencié par rôle | features.md §2.5 P1 |

#### Routes auth manquantes (P1)

| Route | Statut | Spec |
|---|---|---|
| `POST /auth/verify-phone` | ❌ | features.md §2.1 P1 |
| `POST /auth/phone/resend` | ❌ | features.md §2.1 P1 |
| `POST /auth/two-factor/enable` | ❌ | features.md §2.1 P1 |
| `POST /auth/two-factor/confirm` | ❌ | features.md §2.1 P1 |
| `POST /auth/two-factor/disable` | ❌ | features.md §2.1 P1 |
| `GET /auth/two-factor/recovery-codes` | ❌ | features.md §2.1 P1 |
| `GET /auth/sessions` | ❌ Gestion des sessions actives | features.md §2.1 P1 |
| `DELETE /auth/sessions/{id}` | ❌ | features.md §2.1 P1 |
| `GET /auth/oauth/google/redirect` | ❌ OAuth Google | features.md §2.1 P1 |
| `GET /auth/oauth/google/callback` | ❌ | features.md §2.1 P1 |

#### Routes property-media non exposées

`PropertyMediaController` existe mais aucune route n'est déclarée dans `routes/api/properties.php` pour les endpoints média :

| Route manquante |
|---|
| `POST /properties/{property}/media` (upload photo) |
| `DELETE /properties/{property}/media/{media}` |
| `PUT /properties/{property}/media/reorder` |

---

### 1.3 Services manquants

| Service | Utilité | Priorité |
|---|---|---|
| `PropertyService` | Encapsule publish/unpublish, slug, reference_number, views_count | 🔴 P0 |
| `CustomerService` | CRUD customer, liaison user, pipeline | 🟠 P1 |
| `DocumentShareLinkService` | Génération token, validation expiry, compteur downloads | 🟠 P1 |
| `NotificationService` | Dispatch notifications in-app + email selon préférences user | 🟠 P1 |
| `SearchService` | Saved searches, alertes, autocomplétion | 🟡 P2 |

---

### 1.4 Listeners / Observers manquants

Ces comportements sont définis dans `models-spec.md` comme automatiques mais aucun observer/listener n'a été créé :

| Observer | Comportement attendu |
|---|---|
| `PropertyObserver` | Crée un `PropertyPriceHistory` quand `price` change (via `updating()`) |
| `PropertyObserver` | Met à jour `Agency.properties_count`, `Agency.active_leases_count` (cache) |
| `MessageObserver` | Met à jour `Conversation.last_message_id`, `last_message_preview`, `last_message_at` |
| `FavoriteObserver` | Incrémente/décrémente `Property.favorites_count` |
| `ReviewObserver` | Met à jour `Property.reviews_count`, `Property.average_rating` ; idem Agency/User |
| `LeaseObserver` | Met à jour `Agency.active_leases_count` |
| `PropertyVisitObserver` | Met à jour `Property.visits_count` |

---

### 1.5 Jobs / Commandes planifiées manquants

| Job / Commande | Déclencheur | features.md |
|---|---|---|
| `ExpireBookings` | Cron — expire les réservations non traitées | §1.3 P2 |
| `SendSavedSearchAlerts` | Cron daily/weekly — alerte utilisateurs sur nouvelles correspondances | §1.2 P1, §2.4 P1 |
| `ApplyLatePaymentPenalties` | Cron — applique pénalités de retard sur LeasePayment | §1.4 P1 |
| `SendLeasePaymentReminders` | Cron — relances impayés J-3 / J+1 / J+7 | §1.4 P1 |
| `GenerateLeasePaymentSchedule` | À la création d'un bail actif | §1.4 P1 |

---

### 1.6 Notifications non envoyées

Le modèle `AppNotification` et le contrôleur existent, mais aucun événement Laravel ne déclenche encore la création d'une notification. D'après `features.md §2.3` (P0/P1) il manque :

- Notification à la création d'une réservation (→ bailleur/agent)
- Notification à la confirmation/annulation d'une réservation (→ client)
- Notification à l'enregistrement d'un paiement (→ client + bailleur)
- Notification sur demande de maintenance (→ agent)
- Notification sur message reçu (→ destinataire)
- Notification rappel loyer à venir (→ locataire)

---

## 2. Frontend (`takussan-web`)

Le scaffold est minimal. Seul le flux **auth + vitrine publique** est partiellement implémenté.

### 2.1 Pages implémentées (partiellement)

| Page | Statut | Notes |
|---|---|---|
| Page d'accueil publique | 🟡 partiel | Données mock (`mockData.ts`), pas encore branché sur l'API réelle |
| Fiche bien publique | 🟡 partiel | Route `/properties/[slug]` existe, galerie basique |
| Login / Register / Forgot password / Reset | ✅ | Auth flows complets |
| Vérification email | ✅ | |
| Profil utilisateur | 🟡 partiel | Formulaire de base |

### 2.2 Pages entièrement manquantes

#### Vitrine publique (P0 / P1)

| Page | Priorité |
|---|---|
| Résultats de recherche avec filtres + tri | 🔴 P0 |
| Formulaire de contact sur fiche bien | 🟠 P1 |
| Recherche par carte interactive | 🟠 P1 |
| Biens similaires / suggestions | 🟡 P2 |

#### Dashboard — Agent / Admin agence (P0 / P1)

| Page | Priorité |
|---|---|
| Liste des biens (portefeuille) | 🔴 P0 |
| Créer / éditer un bien | 🔴 P0 |
| Détail bien (statut, médias, collaborateurs) | 🔴 P0 |
| Liste des clients (CRM) | 🔴 P0 |
| Fiche client (notes, docs, historique) | 🟠 P1 |
| Réservations (liste + détail + workflow) | 🟠 P1 |
| Baux (liste + création + détail + paiements) | 🟠 P1 |
| État des lieux (création + signature) | 🟠 P1 |
| Maintenance (liste + assignation) | 🟠 P1 |
| Messagerie (conversations + messages) | 🟠 P1 |
| Documents (upload + partage) | 🟠 P1 |
| Journal d'audit | 🟠 P1 |
| Dashboard stats agence | 🟠 P1 |

#### Dashboard — Locataire / Customer (P1)

| Page | Priorité |
|---|---|
| Mes réservations | 🟠 P1 |
| Mon bail actif (échéancier, quittances) | 🟠 P1 |
| Favoris | 🟠 P1 |
| Mes demandes de maintenance | 🟠 P1 |
| Mes documents | 🟠 P1 |
| Messagerie | 🟠 P1 |
| Notifications | 🟠 P1 |
| Recherches sauvegardées | 🟠 P1 |

#### Dashboard — Super admin (P0)

| Page | Priorité |
|---|---|
| Gestion des agences | 🔴 P0 |
| Gestion des utilisateurs | 🔴 P0 |
| Gestion des tags/amenités | 🔴 P0 |
| Gestion des rôles et permissions | 🟠 P1 |
| Configuration globale (Settings) | 🟡 P2 |
| Intégrations tierces | 🟡 P2 |

### 2.3 Infrastructure frontend manquante

| Élément | Statut |
|---|---|
| Client API typé (toutes les ressources) | 🟡 Seules `properties` et `auth` ont des hooks |
| Gestion d'état global (ex: auth, notifications) | 🟡 Partiel (auth uniquement via iron-session) |
| Internationalisation i18n (FR / EN / WO) | ❌ Absent |
| Composants UI design system (basé sur `docs/design-guidelines.md`) | ❌ Absent |
| Gestion des médias / upload | ❌ Absent |
| Temps réel (WebSocket / SSE pour messagerie + notifs) | ❌ Absent |

---

## 3. Résumé chiffré

| Catégorie | Présent | Manquant |
|---|---|---|
| Modèles Eloquent | 33/33 | 0 modèle — mais ~10 colonnes manquantes |
| Enums PHP | 45/45 | 0 |
| Migrations | 33/33 | 0 migration — mais colonnes manquantes dans 2 |
| Contrôleurs API | 20/28 | 8 contrôleurs (Tags, Tasks, CustomerNotes, Guarantors, Settings, Integrations, DocumentShareLinks, PropertyPriceHistory) |
| Routes API | ~75% | ~20 routes manquantes (reject, renew, price-history, media, auth P1, reviews agence) |
| Services | 7/12 | 5 services (Property, Customer, Document, Notification, Search) |
| Observers / Listeners | 0/7 | 7 observers |
| Jobs planifiés | 0/5 | 5 jobs |
| Pages frontend | ~5/50 | ~45 pages |

---

## 4. Prochaines étapes suggérées

1. **Colonnes manquantes** : ajouter `lot_position`, `level`, `admin_monitored` à la migration properties + `settings` à agencies (nouvelle migration `alter table`).
2. **Relations User/Agency** : compléter les relations manquantes dans les modèles.
3. **Contrôleurs manquants** : priorité Tags (P0 admin), Guarantors et CustomerNotes (P1 CRM), puis TaskController.
4. **Actions manquantes** : `reject` sur Booking, `renew` sur Lease, endpoints media de Property.
5. **Observers** : `PropertyObserver` (price history + counts) et `MessageObserver` (cache conversation) sont les plus critiques.
6. **Jobs** : `GenerateLeasePaymentSchedule` bloque le flux bail complet ; `ApplyLatePaymentPenalties` et `SendLeasePaymentReminders` débloquent la facturation.
7. **Frontend** : commencer par les pages dashboard Agent (portefeuille + CRM) en branchant les hooks API sur les vraies endpoints.
