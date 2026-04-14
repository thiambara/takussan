# Recommandations — `docs/features.md` (Passe 002)

> Cette passe ne formule **aucune nouvelle recommandation** sur `features.md`. Le fichier source n'a pas été modifié depuis la passe 001 (commit `57bd3ed`), et toutes les recommandations émises en passe 001 restent strictement actionnables.

---

## Statut des recommandations héritées de la passe 001

### A. Ajouts — capacités du modèle non exploitées

| Réf. | Texte | Section ciblée | Statut |
|------|-------|----------------|--------|
| A1 | Gestion des biens hiérarchiques (`Property.parent_id`) | §1.1 | ⏳ non appliquée |
| A2 | Référence unique automatique (`Property.reference_number`) | §1.1 | ⏳ non appliquée |
| A3 | Type de titre foncier (`Property.title_type`) | §1.1 | ⏳ non appliquée |
| A4 | Suivi administratif (`Property.admin_monitored`) | §1.1 | ⏳ non appliquée |
| A5 | Reformulation visites (self-guided / hybride / durée / agent) | §1.3 | ⏳ non appliquée |
| A6 | Pénalités de retard (`LeasePayment.late_fee`) | §1.4 | ⏳ non appliquée |
| A7 | Contact principal (`UserCustomerRelationship.is_primary`) | §1.6 | ⏳ non appliquée |
| A8 | Conversation de support (`ConversationType.support`) | §1.7 | ⏳ non appliquée |
| A9 | Signaler un avis (`Review.reported_count`) | §1.11 | ⏳ non appliquée |

### B. Reformulations / clarifications

| Réf. | Texte | Section ciblée | Statut |
|------|-------|----------------|--------|
| B1 | Collaborateurs avec partage de commission | §1.1 | ⏳ non appliquée |
| B2 | Historique des biens consultés (option A serveur / option B local) | §1.2 | ⏳ non appliquée |
| B3 | Calendrier de disponibilité (agrégation vs blocage manuel) | §1.3 | ⏳ non appliquée |
| B4 | Renouvellement / avenant au bail (parent lease / amendement) | §1.4 | ⏳ non appliquée |
| B5 | Révision annuelle du loyer journalisée | §1.4 | ⏳ non appliquée |
| B6 | Notes horodatées et signées sur un client | §1.6 | ⏳ non appliquée |
| B7 | Devis avec workflow d'approbation explicite | §1.8 | ⏳ non appliquée |
| B8 | Scope multi-agence des rôles spatie | §2.2 | ⏳ non appliquée |

### C. Changements de priorité

| Réf. | Texte | Section ciblée | Statut |
|------|-------|----------------|--------|
| C1 | Partage sécurisé par lien temporaire — maintenir P1 + ajouter modèle | §1.10 | ⏳ non appliquée |
| C2 | Tâches et rappels — maintenir P2 + ajouter modèle `Task` | §1.6 | ⏳ non appliquée |

### D. Retraits

Aucun retrait recommandé en passe 001 ; rien n'a évolué côté passe 002.

---

## Synthèse pass-002 (features)

- **Nouvelles recommandations :** 0
- **Recommandations héritées résolues :** 0
- **Recommandations héritées encore actionnables :** 19 (A1–A9, B1–B8, C1–C2)

Aucune action automatique possible : ces décisions doivent être prises par un humain et appliquées manuellement à `docs/features.md`. Une fois le fichier source modifié, relancer `/sync-specs` pour la passe 003 afin de constater les résolutions.
