# Recommandations — `docs/features.md` (Passe 006)

> Changements proposés au catalogue fonctionnel.

---

## Recommandations actionnables

**Aucune.**

Toutes les recommandations de la passe 001 (A1–A9, B1–B8, C1–C2) ont été appliquées à `docs/features.md` entre les passes 005 et 006.

## Récapitulatif des recommandations pass-001 — toutes résolues

### A. Ajouts — capacités du modèle non exploitées

| Référence | Feature ajoutée | Section | Statut |
|-----------|-----------------|---------|--------|
| A1 | Hiérarchie de biens (immeuble → étages → lots) | §1.1 P1 | ✅ appliqué |
| A2 | Référence unique automatique (TK-2025-001) | §1.1 P0 | ✅ appliqué |
| A3 | Type de titre foncier | §1.1 P1 | ✅ appliqué |
| A4 | Suivi administratif | §1.1 P3 | ✅ appliqué (priorité P3 retenue) |
| A5 | Reformulation visites multi-types (self_guided, hybrid) | §1.3 P2 | ✅ appliqué |
| A6 | Pénalités de retard automatiques | §1.4 P1 | ✅ appliqué |
| A7 | Contact principal CRM | §1.6 P1 | ✅ appliqué |
| A8 | Conversation de support | §1.7 | ❌ retiré — `ConversationType.support` supprimé de l'enum (décision utilisateur) |
| A9 | Signaler un avis inapproprié | §1.11 P2 | ✅ appliqué |

### B. Reformulations / clarifications

| Référence | Sujet | Statut |
|-----------|-------|--------|
| B1 | PropertyCollaborator commission explicite | ✅ appliqué (`commission_share` ajouté au modèle) |
| B2 | Historique biens consultés → option B (localStorage) | ✅ appliqué |
| B3 | Vue calendrier agrégée (sans blocage manuel) | ✅ appliqué |
| B4 | Renouvellement de bail avec traçabilité (`renewed_from_lease_id`) | ✅ appliqué |
| B5 | Révision annuelle du loyer via journal d'activité | ✅ appliqué |
| B6 | Notes CRM horodatées et signées (`CustomerNote`) | ✅ appliqué |
| B7 | Devis et validation avant travaux (workflow approbation) | ✅ appliqué |
| B8 | Éditeur de rôles scopé par agence (spatie teams) | ✅ appliqué |

### C. Changements de priorité

| Référence | Sujet | Statut |
|-----------|-------|--------|
| C1 | Partage sécurisé par lien → maintenu P1 + modèle `DocumentShareLink` ajouté | ✅ appliqué |
| C2 | Tâches CRM en P2 + modèle `Task` ajouté | ✅ appliqué |

### Ajustements post-plan (hors pass-001)

- `§1.12 Multi-branches / sous-agences` : déplacé de P2 → **P3** (EF7 ajouté aux évolutions futures).
- `§1.12 Gestion des congés / disponibilité` : déplacé de P2 → **P3** (EF8 ajouté).
- `§2.8 Multi-devises` : scindé en deux features — « Devise configurable par agence » (P2) + « Conversion multi-devises avec taux » (P3, EF9).
- `§1.10 Versioning des documents` : reformulé « Historique des versions (via medialibrary + journal d'activité) ».
- `§2.3 Templates multilingues` : reformulé « Templates localisés via fichiers lang/ Laravel ».

---

## Nouvelles recommandations issues de la passe 006

**Aucune.** La passe 006 ne produit aucune recommandation nouvelle sur `features.md`. Les 12 ⚠️ restants sont tous justifiés (applicatifs purs ou évolutions futures documentées EF2, EF5, EF9).

## Critère de convergence

Le critère « deux passes consécutives sans recommandation actionnable » s'appliquera à la passe 007 si elle est lancée sans modification entre-temps. En l'état, la passe 006 déclare déjà la convergence car :

1. Aucun ❌ restant.
2. Aucune recommandation actionnable produite.
3. Tous les ⚠️ ont une justification explicite (applicatif, EF, P3).
