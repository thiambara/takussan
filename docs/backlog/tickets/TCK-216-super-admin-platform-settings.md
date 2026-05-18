---
id: TCK-216
title: "Super-admin — Paramètres globaux plateforme & devises"
status: done
phase: P2
family: applicatif
estimate: M
created: 2026-05-07
updated: 2026-05-07
depends_on: [TCK-145]
blocks: [TCK-218]
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
    - docs/features.md#28-internationalisation--préférences
  models:
    - docs/models-spec.md#30-setting
tags: [back, front, super_admin, p2]
---

## Contexte

`features.md` §2.9 P2 prévoit les "Paramètres globaux de plateforme" et §2.8 mentionne la devise par défaut (XOF) et les devises additionnelles (EUR, USD). Aujourd'hui ces valeurs sont hardcodées dans `config/*.php` ou des `.env`. La page `/super-admin/system` est un stub. Il manque une surface d'édition en runtime, tracée par audit.

## Objectif utilisateur

Un super-admin ouvre `/super-admin/settings` et règle les paramètres plateforme : devise par défaut, devises supportées, format de date / nombre, fuseau horaire par défaut, frais plateforme % par type de transaction, taille max d'upload, durée de session max — sans redéploiement.

## Contrat de données

Endpoints à exposer :

- `GET /api/admin/settings` — toutes les clés éditables groupées par catégorie
- `PATCH /api/admin/settings` — bulk update `{ key: value, ... }` ; validation par clé
- `GET /api/settings/public` — endpoint public lecture seule retournant la sous-liste des paramètres affichables côté client (devise, formats)

Le store utilise le modèle `Setting` (cf. `models-spec.md#30-setting`) avec une convention de catégorie (`platform.*`, `currency.*`, `format.*`, `transaction.*`).

## Direction UX / Artistique

Page divisée en sections (Devises, Formats & i18n, Frais plateforme, Limites techniques, Divers). Chaque section avec inline edit, bouton "Enregistrer" par section. Bandeau d'avertissement si un paramètre nécessite un redémarrage de queue / vidage de cache. Affichage de la dernière modification (acteur + date) par paramètre.

## Contraintes strictes (métier)

- Endpoints super-admin-only.
- **Whitelist explicite** des clés éditables — toute clé hors whitelist renvoie 422.
- Validation par clé (typage, plage de valeurs) — chaque setting déclare son schéma de validation côté backend.
- Activity log sur chaque mutation, avec `key`, `old_value`, `new_value`.
- Cache applicatif des settings invalidé immédiatement après écriture (les lecteurs côté API voient la nouvelle valeur sans redémarrage).
- Les devises supportées doivent inclure XOF (devise primaire — non désactivable).
- Le frais plateforme est exprimé en pourcentage (0–100) avec 2 décimales max ; refusé hors borne.

## Delta à produire

- [x] Migration : ajustement / vérification de la table `settings` (cf. modèle existant)
- [x] Constante `App\Domain\Settings\EditablePlatformSettings` listant les clés autorisées + schéma de validation
- [x] Service `App\Services\Admin\PlatformSettingService` (read, write, cache invalidation)
- [x] Controller `Admin\PlatformSettingController` (`index`, `bulkUpdate`)
- [x] Endpoint public `GET /api/settings/public` (lecture cacheable, sous-liste non sensible)
- [x] Adaptation des consommateurs internes (devise, format, frais) pour passer par le service plutôt que la config hardcoded
- [x] Activity log `super_admin_setting_updated`
- [x] Frontend page `/super-admin/settings`
- [x] Composants : `SettingsSection`, `SettingField` (inline edit avec validation côté client miroir)
- [x] Tests backend : whitelist, validation, cache invalidation, 403 hors super-admin, XOF non désactivable
- [x] Tests UI : édition section, persistance, refresh

## Critères d'acceptation

- [x] `PATCH /api/admin/settings` met à jour les clés autorisées et invalide le cache applicatif
- [x] Une clé hors whitelist retourne 422 avec un message explicite
- [x] Désactiver XOF retourne 422
- [x] Le frais plateforme accepte uniquement [0.00 ; 100.00]
- [x] `GET /api/settings/public` ne retourne aucune clé sensible (pas de quota d'agence, pas de seuils internes)
- [x] Un agency_admin reçoit 403
- [x] Chaque mutation produit une entrée d'audit avec diff `old_value` → `new_value`

## Hors périmètre

- Réglage par agence (chaque agence garde sa propre devise effective via TCK-064)
- Conversion multi-devises avec taux temps réel (P3 spec, ticket dédié)
- Backups / snapshots de la table settings — out of scope

## Notes d'implémentation

- La migration existante `2026_04_17_160027_create_settings_table.php` est déjà conforme au modèle `Setting` (clé, valeur JSON, scope global/agence, `updated_by_id`, unique composé) ; aucun ajustement de schéma n'était nécessaire.
- `GET /api/settings/public` renvoie les clés publiques sous forme imbriquée (`currency.default`, `format.date`, etc.) et exclut les frais/limites internes.
- Le fallback devise de `PaymentGatewayService` passe désormais par `PlatformSettingService::getValue('currency.default')` quand ni le paiement ni l'agence ne portent une devise.
