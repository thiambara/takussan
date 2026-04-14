# Recommandations — `docs/features.md` (Passe 004)

> Cette passe ne formule **aucune nouvelle recommandation** sur `features.md`. Le fichier source n'a pas été modifié depuis la passe 001 (commit `57bd3ed`), et toutes les recommandations émises en passe 001 restent strictement actionnables. C'est la **troisième passe consécutive** (après 002 et 003) sans aucune évolution côté source — seuil d'alerte organisationnelle atteint.

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
| B5 | Révision annuelle de loyer (ad hoc vs modèle dédié) | §1.4 | ⏳ non appliquée |
| B6 | Rapprochement bancaire (scope P2/P3) | §1.5 | ⏳ non appliquée |
| B7 | Réponse publique aux avis (champs `reply_*`) | §1.11 | ⏳ non appliquée |
| B8 | Multi-branches d'agence (`parent_agency_id`) | §1.12 | ⏳ non appliquée |

### C. Ajustements de priorité

| Réf. | Texte | Section ciblée | Statut |
|------|-------|----------------|--------|
| C1 | Templates email multilingues → P2 ou création modèle `EmailTemplate` | §2.3 / §2.9 | ⏳ non appliquée |
| C2 | Délégation temporaire de permissions → P3 | §2.2 | ⏳ non appliquée |

---

## Total recommandations `features.md`

- **Total :** 19 (9 ajouts + 8 reformulations + 2 ajustements de priorité)
- **Résolues depuis passe 001 :** 0
- **Restantes :** 19

Aucune nouvelle recommandation n'est introduite par la passe 004. Se reporter à [`pass-001-2026-04-14-0033/02-recommendations-features.md`](../pass-001-2026-04-14-0033/02-recommendations-features.md) pour le texte intégral des propositions (diff textuel).

## Priorisation suggérée pour l'arbitrage humain

Étant donné le blocage sur trois passes consécutives, prioriser dans cet ordre :

1. **B2, B7, A9** — petits ajustements textuels, faible risque, débloquent trois ⚠️.
2. **A1–A4** — quatre ajouts §1.1 cohérents, alignés sur des colonnes déjà présentes dans `models-spec.md`.
3. **C1, C2** — décisions de priorité, rapides à trancher.
4. **B1, B3, B4, B5, B6, B8** — reformulations nécessitant un arbitrage fonctionnel plus profond.
5. **A5, A6, A7, A8** — ajouts mineurs à coupler avec les extensions modèles correspondantes (R4, R10, R13, R18).
