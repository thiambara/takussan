# Passe 001 — Synthèse exécutive

- **Date :** 2026-04-14 00:33 UTC
- **Branche :** `dev`
- **Première passe** — aucune passe précédente, aucune recommandation héritée.

## Périmètre audité

- `docs/features.md` — 21 sections (12 métier + 9 transverses), ~170 fonctionnalités classées P0–P3.
- `docs/models-spec.md` — 28 modèles, 37 enums, règles d'invariance, contraintes et index.

## Compteurs

| Axe | ✅ | ⚠️ | ❌ |
|-----|----|----|----|
| Features → Modèles | 128 | 22 | 9 |
| Modèles → Features | 28 | 0 | 0 |
| **Total** | **156** | **22** | **9** |

Aucun modèle orphelin (tous les 28 modèles sont utilisés par au moins une feature).

## Top 5 points critiques

1. **❌ Partage sécurisé par lien temporaire** (`features.md §1.10 P1`) — feature P1 sans modèle de support. Aucun `DocumentShareLink`, `ShareableLink` ou équivalent dans `models-spec.md`. À résoudre avant MVP.
2. **❌ Tâches et rappels CRM** (`features.md §1.6 P2`) — aucun modèle `Task` / `Reminder` polymorphique pour attacher une échéance à un Customer, un Lease ou un Property.
3. **❌ Pipeline de prospects CRM** (`features.md §1.6 P2`) — `CustomerStatus` (`active/inactive/blocked/deleted`) est trop pauvre pour modéliser un pipeline (lead → qualified → converted → lost).
4. **❌ Paramètres globaux plateforme & Intégrations tierces** (`features.md §2.9 P2`) — aucun modèle `Setting` ni `Integration` pour stocker la configuration runtime ou les clés API tierces.
5. **⚠️ Réponse publique aux avis** (`features.md §1.11 P2`) — `Review` n'a ni `reply_content`, ni `replied_by_id`, ni modèle `ReviewReply` associé. Feature P2 partiellement couverte.

## Points notables additionnels

- **⚠️ Scope multi-agence des rôles spatie** (`features.md §2.2 P1` — « Éditeur de rôles personnalisés par agence ») : `spatie/laravel-permission` n'est pas scopé par `agency_id` dans la spec. À clarifier (teams feature de spatie ou couche applicative).
- **⚠️ Multi-devises avec taux de change** (`features.md §2.8 P2`) : enum `Currency` existe mais aucun modèle `ExchangeRate` n'est décrit.
- **⚠️ Multi-branches / sous-agences** (`features.md §1.12 P2`) : `Agency` n'a pas de `parent_agency_id`.
- **⚠️ Capacités du modèle non exploitées par features.md :** `Property.parent_id` (hiérarchie immeuble→étage), `Property.reference_number`, `Property.admin_monitored`, `Property.title_type`, `UserCustomerRelationship.is_primary`, `Review.reported_count`, `LeasePayment.late_fee`, `ConversationType.support`, `VisitType.self_guided/hybrid` + `PropertyVisit.duration_minutes` — toutes ces capacités sont présentes en BDD mais aucune feature ne les mentionne explicitement.

## Évolution depuis la passe précédente

N/A — première passe.

## Prochaines passes

Deux passes consécutives sans recommandation actionnable déclarent la convergence. Cette passe compte 22 ⚠️ et 9 ❌ encore actionnables — **convergence non atteinte**.
