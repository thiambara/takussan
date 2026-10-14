# Passe 014 — Matrice de corrélation (différentielle)

**Périmètre.** Seules figurent ici les unités re-mesurées : les sections de `models-spec.md`
modifiées depuis la passe 013, et les lignes de `features.md` qui nomment un écran ou une règle
touchés par ADR-0064 (TCK-647 → TCK-650). **Toute autre unité garde le statut de la
[matrice 013](../pass-013-2026-10-14-1023/01-correlation-matrix.md)**, qui reste la matrice complète.

## Synthèse

| Axe | ✅ | ⚠️ | ❌ | Δ vs 013 |
|-----|----|----|----|----------|
| Features → Modèles (380 lignes) | 312 | 67 | 1 | −1 / +1 / 0 (l.671) |
| Modèles → Features (99 sections) | 72 | 27 | 0 | 0 / 0 / 0 (§96 +1, §30 −1) |

## A. Features → Modèles — lignes re-mesurées

| L. | Prio | § | Statut 013 | Statut 014 | Support mesuré | Reco |
|---|---|---|---|---|---|---|
| 412 | — | §1.12 (encadré) | — | — | `/app/overview/agency` reste le seul tableau de bord d'agence ; TCK-647 y a fusionné celui de `/admin`. Exact | — |
| 510 | P1 | §2.1 | ✅ | ✅ (note) | Données exactes (`AgencySetupStatus`, sept étapes). **Écran faux** : la carte vit sur `/app/overview/agency` depuis TCK-647, `/admin` n'existe plus. Et la ligne ne dit pas que la carte est réservée aux agences `standard` — c'était déjà le cas sur `/admin` (`PAGES_ADMIN`, `agence: 'standard'`, mesuré sur `b929243d^`), et `/app/overview/agency` est dans `PRO_ROUTES` | FC2 |
| 528 | P1 | §2.2 | ✅ | ✅ (note) | §52-53 exacts. **Écran faux** : `/admin/roles` → `/app/agency/roles` (TCK-649) | FC3 |
| 582, 583 | P1 | §2.5 | ✅ | ✅ | Le tableau de bord fusionné lit une seule fois `GET /api/dashboard/agency` ; restriction `standard` et `reports.view_agency` inchangées | — |
| 660 | P0 | §2.9 | ✅ | ✅ | §10 `Tag` inchangé. TCK-650 : l'écran `/super-admin/tags` lit et écrit au jeton de l'opérateur, même pendant une impersonation | — |
| 671 | P2 | §2.9 | ✅ | **⚠️ dérive** | « seules des clés lues par l'application, écrites par une seule voie validée et journalisée » : vrai du catalogue (`/api/admin/settings`, `EditablePlatformSettings`). **Faux de la route brute** `/api/settings` (`SettingController`), que la console sert depuis TCK-648 (`/super-admin/settings/global`) : elle refuse en 422 les clés du catalogue et `enum.*` (`managedByCatalogue`, sur `store`, `update`, `destroy`), mais crée ou modifie **toute autre** clé globale, `value` = tout objet, sans journal (`updated_by_id` seul). Préexistant (TCK-068, `/admin/settings`) ; non relevé par la 013 | FC1 |
| 674 | P2 | §2.9 | ✅ | ✅ | §83 inchangé. TCK-650 rend vraie, côté front, « chaque acte au nom de l'opérateur » pour les deux écrans qui y manquaient | — |

## B. Modèles → Features — sections re-mesurées

| § | Modèle | Statut 013 | Statut 014 | Mesure | Features |
|---|---|---|---|---|---|
| 1 | User | ⚠️ | ⚠️ | `bookingPayments()` retirée du code et de la spec (TCK-640) : la relation cassée n'est plus décrite. Les écarts de la 013 (C2 : nullabilités, `preferred_language`, relations absentes) demeurent | l.452, 456, 459 |
| 6 | BookingPayment | ✅ | ✅ | Paragraphe des relations réécrit : `User` ne déclare plus rien vers `BookingPayment` ; exact | l.154, 156, 157, 160 |
| 30 | Setting | ✅ | **⚠️** | Unicité `NULLS NOT DISTINCT` exacte (`pg_indexes`). **Écart** : « Les clés que la console édite (portée `global`) forment un catalogue en code » — depuis TCK-648, la console sert aussi l'éditeur brut, qui écrit les clés **hors** catalogue ; la section ne décrit ni cette voie ni son refus `setting.managed_by_catalogue`. MB13 (catalogue `enum.*`) reste ouverte | l.161, 430, 662, 665, 671 |
| 31 | Integration | ✅ | ✅ | `integrations_provider_agency_live_unique (provider, agency_id) NULLS NOT DISTINCT WHERE deleted_at IS NULL` exact (`pg_indexes`) ; l'ancien unique a disparu | l.221, 223 |
| 93 | PropertyBoost | ✅ | ✅ | Trois index `nullOnDelete` ajoutés (`2026_10_14_100100`), exacts | l.87, 662 |
| 94 | CreditLot | ✅ | ✅ | `credit_lots_granted_by_idx`, exact | l.428, 662 |
| 96 | CreditMovement | ⚠️ | **✅** | Trigger durci (`2026_10_14_100000`) : `DELETE` et mise à `NULL` de `property_boost_id`/`actor_id` admis à `pg_trigger_depth() > 1` seulement, ce que la section écrit. `credit_movements_actor_idx` exact. Reliquat sans effet : un `UPDATE` qui ne change aucune valeur passe à la profondeur 1 | l.428, 662 |
| 97 | CreditWelcomeGrant | ✅ | ✅ | Deux index ajoutés, exacts | l.428 |

**Sections transversales** : le tableau des index et celui des unicités (lignes `settings`,
`integrations`) sont exacts. L'encadré « Rôles personnalisés » (l.4924) nomme `/admin/roles` (MC2).
