# 01 — Matrice de corrélation features ↔ modèles

> Passe 010 — 2026-05-04 09:18 UTC
> Sources inchangées depuis pass-009 — la matrice ci-dessous est strictement identique.

## Synthèse

- Total features analysées : **~208** (`docs/features.md`)
- Total modèles analysés : **39** (`docs/models-spec.md`)
- ✅ : 232 — ⚠️ : 15 — ❌ : 2

## Features → Modèles (extrait — points d'attention)

| Section features.md | Modèles supportants | Statut |
|---------------------|---------------------|--------|
| §1.1 P0–P1 (Catalogue, Annonces) | Property, PropertyMedia, PropertyAddress, Agency | ✅ |
| §1.2 P0–P1 (Recherche, SavedSearch) | Property + indexes, SavedSearch | ✅ |
| §1.3 P0–P1 (Réservations, Paiements) | Booking, BookingPayment | ✅ |
| §1.4 P0–P1 (Locations, Quittances) | Lease, LeasePayment, LeaseEvent | ✅ |
| §1.5 P0 (Comptabilité interne) | Invoice, BookingPayment, LeasePayment | ✅ |
| §1.5 P2 « Rapprochement bancaire » | **BankStatement / BankStatementLine — ABSENTS de la spec** | ⚠️ feature/✅ code |
| §1.5 P2 « Passerelle paiement » | Integration | ⚠️ partiel |
| §1.6 P0–P1 (Notifications) | AppNotification, NotificationPreference | ✅ |
| §1.7 P0–P1 (Messagerie) | Conversation, ConversationParticipant, Message, MessageAttachment, MessageReadReceipt | ✅ |
| §1.8 P0–P1 (Maintenance) | MaintenanceRequest, MaintenanceIntervention | ✅ |
| §1.9 P1 (États des lieux) | LeaseInventory, LeaseInventoryItem, LeaseInventoryItemMedia | ✅ |
| §1.10 P1 (Documents/Contrats) | Document, DocumentSignature | ✅ |
| §1.11 P1 (Avis/Reviews) | Review | ✅ |
| §1.12 (Marketing/CRM) | — | ⚠️ P3 hors périmètre |
| §2.1 P0–P2 (Profils & contexte actif) | User, OwnerProfile, AgentProfile, BrokerProfile, ServiceProviderProfile, BrokerAgencyCollaboration, ServiceProviderAgencyCollaboration | ✅ |
| §2.2 (Rôles & permissions) | spatie/laravel-permission (teams=Agency) + rôle `admin` global | ✅ |
| §2.3 P0–P1 (Notifications utilisateur) | AppNotification, NotificationPreference | ✅ |
| §2.4 P0–P1 (Recherche cross-entity) | Property + filtres Spatie | ✅ |
| §2.5 (Reporting) | — (requêtes ad-hoc) | ⚠️ applicatif pur |
| §2.6 (Audit) | ActivityLog (spatie) | ✅ |
| §2.7 (Sécurité 2FA, Sessions) | User.two_factor_*, Sanctum tokens | ✅ |
| §2.8 (Onboarding multi-tenant) | Agency, Branch | ✅ |
| §2.9 (i18n / FX) | Currency enum, locale fields | ✅ |

## Modèles → Features (extrait — points d'attention)

| Modèle (`models-spec.md`) | Features qui l'utilisent | Statut |
|---------------------------|--------------------------|--------|
| User | §2.1, §2.2, §2.7 | ✅ |
| Agency, Branch | §2.8, §2.2 | ✅ |
| OwnerProfile, AgentProfile, BrokerProfile, ServiceProviderProfile | §2.1 | ✅ |
| BrokerAgencyCollaboration, ServiceProviderAgencyCollaboration | §2.1, §1.8 | ✅ |
| Property, PropertyAddress, PropertyMedia | §1.1, §1.2 | ✅ |
| SavedSearch | §1.2, §2.4 | ✅ |
| Booking, BookingPayment | §1.3, §1.5 | ✅ |
| Lease, LeasePayment, LeaseEvent | §1.4, §1.5 | ✅ |
| Invoice | §1.5 | ✅ |
| Integration | §1.5 P2, §1.6 P3 | ⚠️ partiel |
| AppNotification, NotificationPreference | §1.6, §2.3 | ✅ |
| Conversation, ConversationParticipant, Message, MessageAttachment, MessageReadReceipt | §1.7 | ✅ |
| MaintenanceRequest, MaintenanceIntervention | §1.8 | ✅ |
| LeaseInventory, LeaseInventoryItem, LeaseInventoryItemMedia | §1.9 | ✅ |
| Document, DocumentSignature | §1.10 | ✅ |
| Review | §1.11 | ✅ |
| ActivityLog | §2.6 | ✅ |

## ❌ Gaps confirmés

| ID | Élément | Localisation | Détail |
|----|---------|--------------|--------|
| ❌1 | `BankStatement` | code (`app/Models/BankStatement.php`) | absent de `models-spec.md` |
| ❌2 | `BankStatementLine` | code (`app/Models/BankStatementLine.php`) | absent de `models-spec.md` |

Aucun nouveau gap depuis pass-009.
