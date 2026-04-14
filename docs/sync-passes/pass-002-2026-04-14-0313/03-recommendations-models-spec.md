# Recommandations — `docs/models-spec.md` (Passe 002)

> Cette passe ne formule **aucune nouvelle recommandation** sur `models-spec.md`. Le fichier source n'a pas été modifié depuis la passe 001 (commit `57bd3ed`), et toutes les recommandations émises en passe 001 restent strictement actionnables.

---

## Statut des recommandations héritées de la passe 001

### Nouveaux modèles proposés

| Réf. | Modèle | Feature cible | Statut |
|------|--------|---------------|--------|
| R1 | `PropertyViewHistory` | §1.2 P2 — historique de consultation | ⏳ non appliquée |
| R2 | `PropertyAvailability` (ou agrégation `Booking`) | §1.3 P1 — calendrier de dispo | ⏳ non appliquée — option A/B à arbitrer |
| R5 | `DocumentShareLink` | §1.10 P1 — partage sécurisé | ⏳ non appliquée — bloquant MVP |
| R6 | `Task` (morphTo CRM/Lease/Property) | §1.6 P2 — tâches & rappels | ⏳ non appliquée |
| R8 | `CustomerNote` | §1.6 P1 — notes horodatées | ⏳ non appliquée — alternative activitylog à trancher |
| R9 | `MaintenanceQuote` | §1.8 P2 — devis & validation | ⏳ non appliquée — option à trancher |
| R11 | `RentReview` | §1.4 P2 — révision annuelle | ⏳ non appliquée — option observer à trancher |
| R14 | `AgentAvailability` | §1.12 P2 — congés agents | ⏳ non appliquée |
| R15 | `Setting` | §2.9 P2 — paramètres globaux | ⏳ non appliquée |
| R16 | `Integration` | §2.9 P2 — intégrations tierces | ⏳ non appliquée |
| R17 | `ExchangeRate` | §2.8 P2 — multi-devises | ⏳ non appliquée |
| R21 | `NotificationTemplate` | §2.3 P1 — templates multilingues | ⏳ non appliquée — alternative blade à trancher |

### Extensions de modèles existants

| Réf. | Modèle | Changement | Feature cible | Statut |
|------|--------|------------|---------------|--------|
| R3 | `Property` | `moderation_status` + `moderated_by_id` + `moderated_at` + `moderation_notes` + enum `PropertyModerationStatus` | §1.1 P2 — modération | ⏳ non appliquée |
| R4 | `PropertyCollaborator` | `commission_share` decimal(5,2) | §1.1 P1 — % commission | ⏳ non appliquée |
| R7 | `Customer` | `pipeline_stage` (option A) ou `CustomerPipelineHistory` (option B) | §1.6 P2 — pipeline prospects | ⏳ non appliquée |
| R10 | `Lease` | `renewed_from_lease_id` (ou modèle `LeaseAmendment`) | §1.4 P2 — renouvellement / avenant | ⏳ non appliquée |
| R12 | `Review` | `reply_content`, `replied_by_id`, `replied_at` (ou modèle `ReviewReply`) | §1.11 P2 — réponse publique | ⏳ non appliquée |
| R13 | `Agency` | `parent_agency_id` (FK self) | §1.12 P2 — multi-branches | ⏳ non appliquée |
| R19 | `User` | `facebook_id`/`apple_id` ou modèle `SocialAccount` | §2.1 P2 — OAuth FB/Apple | ⏳ non appliquée |

### Extensions d'enums

| Réf. | Enum | Changement | Statut |
|------|------|------------|--------|
| R18 | `NotificationChannel` | ajouter `whatsapp` | ⏳ non appliquée |

### Configuration / clarifications

| Réf. | Élément | Changement | Statut |
|------|---------|------------|--------|
| R20 | Trait `Searchable` | activer Scout sur `Message` et `Document` | ⏳ non appliquée |
| R22 | spatie/permission | documenter le scope multi-agence (`teams=true`) | ⏳ non appliquée |
| R23 | Index complémentaires | conditionnels à R1, R5, R6, R13 | ⏳ dépendants |

---

## Synthèse pass-002 (models-spec)

- **Nouvelles recommandations :** 0
- **Recommandations héritées résolues :** 0
- **Recommandations héritées encore actionnables :** 23 (R1–R23)

Aucune nouvelle proposition à formuler tant que les arbitrages des options A/B (R2, R6, R8, R9, R10, R11, R19, R21) n'ont pas été tranchés et appliqués. La passe 003 servira à constater les résolutions une fois `models-spec.md` mis à jour.
