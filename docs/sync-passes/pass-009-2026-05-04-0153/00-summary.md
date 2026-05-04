# Passe 009 — Post-profils polymorphes (TCK-138→142)

- **Date :** 2026-05-04 01:53 UTC
- **Branche :** `dev`
- **Passe précédente :** [`pass-008-2026-04-14-2102`](../pass-008-2026-04-14-2102/00-summary.md)

## Delta source depuis pass-008

Les deux fichiers source ont évolué depuis la passe 008 (2026-04-14) :

- `docs/features.md` — sha1 `b6902e37` (vs `988a0c7d` en pass-008)
  - Ajout §2.1 "Profils & contexte actif" — 9 features (P0–P2)
  - §2.2 "Rôles & permissions" — reformulé pour profils + rôle `admin` global + résolution runtime P0
  - §1.3 ligne 121 — clarification acompte 30%
- `docs/models-spec.md` — sha1 `7a7cdd31` (vs `53fc4044` en pass-008)
  - Ajout modèles 34–39 : OwnerProfile, AgentProfile, BrokerProfile, ServiceProviderProfile, BrokerAgencyCollaboration, ServiceProviderAgencyCollaboration
  - User : description refaite ("identité authentifiée pure"), +HasProfiles, +relations profils, type/agency_id dépréciées
  - Règle 4 "Active profile context" ajoutée
  - Enums : +OwnerProfileStatus, AgentProfileStatus, CollaborationStatus, UserType → @deprecated

## Compteurs

| Axe | ✅ | ⚠️ | ❌ |
|-----|----|----|----|
| Features → Modèles | 193 | 15 | 0 |
| Modèles → Features | 39 | 0 | 2 |
| **Total** | **232** | **15** | **2** |

**Δ vs passe 008 :** +41 ✅ / +3 ⚠️ / +2 ❌.

Le delta est lié à :
- **+41 ✅** : les 9 features profils (§2.1) + reformulations §2.2 sont parfaitement couvertes par les 6 nouveaux modèles (34–39)
- **+3 ⚠️** : 3 P3 sans modèle (signature électronique intégrée, OCR documents, recherche vocale) précédemment fusionnés dans un décompte agrégé
- **+2 ❌** : BankStatement et BankStatementLine existent dans le code (`app/Models/`) mais sont **absents** de `models-spec.md`

## Top 5 points critiques

1. **❌ BankStatement / BankStatementLine absents de models-spec.md** — ces deux modèles existent dans le code (controllers, migrations) mais ne sont pas documentés dans la spec. Ils supportent §1.5 P2 "Rapprochement bancaire semi-automatique".
2. **⚠️ §1.5 P2 "Passerelle de paiement"** — le modèle `Integration` existe mais l'intégration réelle (Wave, Orange Money, Stripe) n'est que partiellement implémentée.
3. **⚠️ §2.5 "Reporting & tableaux de bord"** — aucun modèle de reporting dédié ; repose sur des requêtes d'agrégation ad-hoc. Couvert applicativement (controllers + queries), pas structurellement.
4. **⚠️ §1.3 P3 "Annulation avec remboursement partiel automatisé"** — `refund_amount` existe sur `BookingPayment` mais pas de workflow automatisé.
5. **⚠️ P3 multiples** (signature électronique, OCR, recherche vocale, marketplace, abonnement SaaS) — sans modèle, mais tous sont P3 et hors périmètre MVP.

## Statut de convergence

**Rompu depuis pass-008** — les 2 ❌ (BankStatement, BankStatementLine) sont de vrais gaps de documentation. Les 15 ⚠️ sont tous justifiés (P3 / applicatif pur / évolutions futures).

Une fois les 2 ❌ résolus (ajout de BankStatement + BankStatementLine dans models-spec.md), la convergence sera rétablie.

## Recommandations non appliquées de la passe précédente

Aucune — la passe 008 n'avait aucune recommandation actionnable.
