# Matrice de corrélation features ↔ modèles (Passe 007)

> Les fichiers `docs/features.md` et `docs/models-spec.md` sont strictement identiques à l'état analysé en pass-006. La matrice complète est donc inchangée.

## Totaux

- **Features → Modèles :** 158 ✅ / 12 ⚠️ / 0 ❌
- **Modèles → Features :** 33 ✅ / 0 ⚠️ / 0 ❌
- **Total :** 191 ✅ / 12 ⚠️ / 0 ❌

**Δ vs passe 006 :** 0 / 0 / 0.

## Renvoi vers la matrice de référence

Pour la matrice détaillée section par section (§1.1 à §2.9), voir :
[`../pass-006-2026-04-14-2047/01-correlation-matrix.md`](../pass-006-2026-04-14-2047/01-correlation-matrix.md)

Toutes les 21 sections de `features.md` y sont couvertes avec le support modèle associé et le statut ligne par ligne. Aucune réévaluation n'est nécessaire en l'absence de modification source.

## Modèles → Features (rappel)

Les 33 modèles de `models-spec.md` sont tous utilisés par au moins une feature. Aucun orphelin.

| Catégorie | Modèles | Features principales |
|-----------|---------|----------------------|
| Identité & agence | User, Agency, Address | §1.12, §2.1, §2.2 |
| Biens & recherche | Property, Tag, Favorite, SavedSearch, PropertyPriceHistory | §1.1, §1.2 |
| Réservations & visites | Booking, BookingPayment, PropertyVisit | §1.3 |
| Baux & garants | Lease, LeasePayment, Guarantor | §1.4 |
| Facturation & reversements | Invoice, Payout | §1.5 |
| CRM | Customer, UserCustomerRelationship, CustomerNote, Task, PropertyCollaborator | §1.6, §1.1 |
| Messagerie | Conversation, ConversationParticipant, Message | §1.7 |
| Maintenance | MaintenanceRequest | §1.8 |
| Inventaires | Inventory | §1.9 |
| Documents | Document, DocumentShareLink | §1.10 |
| Avis | Review | §1.11 |
| Notifications | AppNotification | §2.3, §1.7 |
| Config transverse | Setting, Integration | §2.9, §2.3, §2.8 |
| Activité (package) | spatie/laravel-activitylog | §1.4, §1.6, §2.6 |

Toutes les entrées sont ✅ utilisé.
