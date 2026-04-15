# Backlog — Takussan

> Vue kanban projetée depuis les frontmatters des `tickets/*.md`.
> À l'avenir cet index pourra être régénéré automatiquement — en attendant, le
> maintenir à la main quand un ticket change de `status`.
>
> **Convention d'ID** : `TCK-NNN` (séquentiel, jamais réutilisé).
> **Template** : voir [`_template.md`](_template.md).
> **Archive** : [`_archive/`](_archive/).

## Légende

| Champ | Valeurs |
|---|---|
| `status` | `todo` · `doing` · `review` · `done` · `blocked` |
| `phase` | `P0` · `P1` · `P2` · `P3` · `EF` (évolution future) |
| `family` | `applicatif` · `evolution` · `technique` · `bug` |
| `estimate` | `S` ≤2j · `M` 3–5j · `L` 6–10j · `XL` >10j |

---

## 📋 Todo

### Couche 1 — Fondation

- [TCK-013](tickets/TCK-013-auth-accounts.md) — Authentification & gestion de comptes `L · P0 · applicatif`
- [TCK-014](tickets/TCK-014-roles-permissions.md) — Rôles & permissions `M · P0 · applicatif`
- [TCK-015](tickets/TCK-015-agency-team.md) — Agence & équipe `M · P0 · applicatif`
- [TCK-016](tickets/TCK-016-media-files.md) — Médias & fichiers `M · P0 · applicatif`
- [TCK-017](tickets/TCK-017-i18n-preferences.md) — Internationalisation & préférences `S · P0 · applicatif`
- [TCK-018](tickets/TCK-018-audit-trail.md) — Audit & traçabilité `S · P0 · applicatif`

### Couche 2 — Domaines métier de base

- [TCK-019](tickets/TCK-019-property-management.md) — Gestion des biens `XL · P0 · applicatif`
- [TCK-020](tickets/TCK-020-crm-customers.md) — CRM & relation client `L · P0 · applicatif`
- [TCK-021](tickets/TCK-021-documents-contracts.md) — Documents & contrats `M · P0 · applicatif`
- [TCK-022](tickets/TCK-022-notifications.md) — Notifications `M · P0 · applicatif`
- [TCK-023](tickets/TCK-023-admin-configuration.md) — Administration & configuration `M · P0 · applicatif`

### Couche 3 — Opérations métier

- [TCK-024](tickets/TCK-024-search-filters.md) — Recherche & filtres `M · P0 · applicatif`
- [TCK-025](tickets/TCK-025-public-search-discovery.md) — Recherche & découverte publique `L · P0 · applicatif`
- [TCK-026](tickets/TCK-026-short-term-bookings.md) — Réservations courte durée & visites `L · P1 · applicatif`
- [TCK-027](tickets/TCK-027-long-term-leases.md) — Location longue durée (baux) `XL · P1 · applicatif`
- [TCK-028](tickets/TCK-028-transactions-payments.md) — Transactions & paiements `L · P1 · applicatif`

### Couche 4 — Features avancées

- [TCK-029](tickets/TCK-029-messaging.md) — Communication & messagerie `L · P1 · applicatif`
- [TCK-030](tickets/TCK-030-maintenance-requests.md) — Maintenance & interventions `M · P1 · applicatif`
- [TCK-031](tickets/TCK-031-inventory-inspections.md) — État des lieux & inventaires `M · P1 · applicatif`
- [TCK-032](tickets/TCK-032-reporting-dashboards.md) — Reporting & tableaux de bord `L · P1 · applicatif`
- [TCK-033](tickets/TCK-033-reviews-reputation.md) — Avis & réputation `M · P2 · applicatif`

### Tickets isolés (P2/P3)

- [TCK-001](tickets/TCK-001-property-comparator.md) — Comparateur de biens côte à côte `S · P2 · applicatif`
- [TCK-003](tickets/TCK-003-bank-reconciliation.md) — Rapprochement bancaire semi-automatique `M · P2 · applicatif`
- [TCK-008](tickets/TCK-008-booking-cancellation.md) — Annulation booking avec remboursement partiel `M · P3 · applicatif`
- [TCK-009](tickets/TCK-009-fec-export.md) — Export comptable FEC `M · P3 · applicatif`

## 🚧 Doing

_(vide)_

## 👀 Review

_(vide)_

## ✅ Done

_(vide)_

## ⛔ Blocked

> Bloqués par une décision produit ou un déclencheur d'évolution future.

- [TCK-002](tickets/TCK-002-payment-gateway.md) — Passerelle de paiement `L · P2 · applicatif` — décision provider
- [TCK-004](tickets/TCK-004-email-sms-campaigns.md) — Campagnes email / SMS `M · P3 · applicatif` — décision providers
- [TCK-005](tickets/TCK-005-commission-model-ef2.md) — Commissions automatiques (EF2) `L · EF · evolution` — déclencheur produit
- [TCK-006](tickets/TCK-006-message-reads-ef5.md) — Accusés de lecture >5 participants (EF5) `S · EF · evolution` — déclencheur produit
- [TCK-007](tickets/TCK-007-exchange-rates-ef9.md) — Conversion multi-devises (EF9) `M · EF · evolution` — déclencheur produit
- [TCK-010](tickets/TCK-010-voice-nlp-search.md) — Recherche vocale / LLM `M · P3 · applicatif` — décision LLM
- [TCK-011](tickets/TCK-011-auto-translation.md) — Traduction automatique `M · P3 · applicatif` — décision provider
- [TCK-012](tickets/TCK-012-semantic-search.md) — Recherche sémantique par embeddings `XL · P3 · technique` — décision architecture

---

## Graphe de dépendances

```
── Couche 1 (fondation, pas de deps) ──
TCK-013 (auth)
TCK-016 (media)
TCK-017 (i18n)
TCK-018 (audit)

── Couche 1 → 1 ──
TCK-013 ──▶ TCK-014 (roles)
TCK-013 + TCK-014 ──▶ TCK-015 (agency)

── Couche 1 → 2 ──
TCK-013 + TCK-014 + TCK-015 + TCK-016 ──▶ TCK-019 (property)
TCK-013 + TCK-014 ──▶ TCK-020 (crm)
TCK-013 + TCK-016 ──▶ TCK-021 (documents)
TCK-013 ──▶ TCK-022 (notifications)
TCK-013 + TCK-014 ──▶ TCK-023 (admin)

── Couche 2 → 3 ──
TCK-019 ──▶ TCK-024 (search)
TCK-019 + TCK-024 ──▶ TCK-025 (public discovery)
TCK-019 + TCK-020 ──▶ TCK-026 (bookings)
TCK-019 + TCK-020 ──▶ TCK-027 (leases)
TCK-026 + TCK-027 ──▶ TCK-028 (transactions)

── Couche 3 → 4 ──
TCK-013 + TCK-019 ──▶ TCK-029 (messaging)
TCK-019 + TCK-027 ──▶ TCK-030 (maintenance)
TCK-019 + TCK-027 ──▶ TCK-031 (inventory)
TCK-019 + TCK-027 + TCK-028 ──▶ TCK-032 (reporting)
TCK-013 + TCK-019 ──▶ TCK-033 (reviews)

── Tickets isolés (P2/P3/EF) — dépendent des domaines ──
TCK-025 ──▶ TCK-001 (comparateur)
TCK-028 ──▶ TCK-002 (payment gateway) ──▶ TCK-008 (annulation)
TCK-028 ──▶ TCK-003 (rapprochement bancaire)
TCK-020 ──▶ TCK-004 (campagnes email/SMS)
TCK-028 ──▶ TCK-005 (commissions) ──▶ TCK-009 (FEC)
TCK-029 ──▶ TCK-006 (message reads EF5)
TCK-017 + TCK-028 ──▶ TCK-007 (taux de change EF9)
TCK-026 ──▶ TCK-008 (annulation booking)
TCK-028 ──▶ TCK-009 (export FEC)
TCK-024 ──▶ TCK-010 (recherche vocale)
TCK-017 ──▶ TCK-011 (traduction auto)
TCK-024 ──▶ TCK-012 (recherche sémantique)
```

---

## Règles

1. **Un ticket ne recopie jamais une spec** — il pointe via `spec_refs` vers
   `features.md` / `models-spec.md`.
2. **`depends_on`** = autres tickets, pas des specs.
3. **`spec-coder` refuse de démarrer** un ticket dont les `depends_on` ne sont
   pas `done`.
4. **Info manquante dans la spec** → PR sur la spec, pas dans le ticket.
5. **Post-déblocage EF** → lancer une passe `/sync-specs` après merge.

## Historique

- **2026-04-15** — Création domaines : 21 tickets (TCK-013 → TCK-033) couvrant les 21 domaines de `features.md`.
- **2026-04-15** — Migration initiale : 12 tickets extraits de `_archive/warnings-backlog.md`.
