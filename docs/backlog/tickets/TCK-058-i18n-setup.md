---
id: TCK-058
title: "i18n Setup (FR/EN/WO)"
status: review
phase: P0
family: front
estimate: S
created: 2026-04-16
updated: 2026-04-22
depends_on: [TCK-054]
blocks: [TCK-038, TCK-017]
spec_refs:
  features: [docs/features.md#28-internationalisation--préférences]
  models: []
tags: [front, infrastructure, i18n, next-intl, localization]
---

## Objectif utilisateur

L'application est disponible en français, anglais et wolof, et l'utilisateur peut changer de langue à tout moment.

## Contrat de données

- Pas d'endpoint API dédié — la langue est stockée en cookie/localStorage
- Préférence langue envoyée aux headers API (`Accept-Language`) pour réponses localisées côté backend

## Direction UX / Artistique

- **Language switcher** : discret dans le header (drapeau ou code langue), dropdown compact
- **Français par défaut** : tout le Sénégal comprend le français
- **Wolof** : langue nationale, pas de traduction complète nécessaire — les clés manquantes tombent en français
- **Anglais** : pour la diaspora et investisseurs internationaux

## Contraintes strictes (métier)

- next-intl comme bibliothèque i18n (compatible App Router)
- Les fichiers de traduction sont dans `src/messages/{locale}.json`
- Les namespaces par domaine : `common`, `auth`, `property`, `dashboard`, `errors`
- Formatage : dates (dd/MM/yyyy), nombres (1 234 567 XOF), fuseau Africa/Dakar
- URL localisée : `/fr/properties`, `/en/properties` (ou cookie-based, au choix de l'IA)
- Fallback : clé manquante → français

## Delta à produire

- [ ] `npm install next-intl`
- [ ] Config next-intl : middleware locale, routing
- [ ] Fichiers de traduction : `fr.json`, `en.json`, `wo.json` (structure commune + namespace)
- [ ] Composant `LanguageSwitcher`
- [ ] Hook `useTranslation()` ou `useFormatter()` pour dates/nombres
- [ ] Integration dans le layout racine
- [ ] Tests : switch de langue, fallback, formatage

## Critères d'acceptation

- [ ] L'application s'affiche en français par défaut
- [ ] Le language switcher change la langue de l'interface
- [ ] Les clés wolof manquantes tombent en français
- [ ] Les dates sont formatées en dd/MM/yyyy
- [ ] Les nombres sont formatés avec espace comme séparateur de milliers

## Hors périmètre

- Traduction automatique des contenus utilisateurs (→ P3)
- Devise configurable (→ P2)
- Backend i18n (→ TCK-017)

## Notes d'implémentation

- **Routing strategy**: cookie-based (`NEXT_LOCALE`), not URL-prefixed. Preserves the existing route tree (`/auth/*`, `/app/*`, `/admin/*`, public `/properties/*`) — URL-prefix would have required mass-renaming every route.
- **Wolof fallback**: implemented in `src/i18n/request.ts` via a recursive `mergeMessages()` (fr as base + wo overrides) rather than relying on next-intl runtime fallback, which resolves missing keys only per-namespace. This keeps fallback transparent to `useTranslations()` callers.
- **Locale resolution order**: cookie → `Accept-Language` header → `fr` default.
- **Accept-Language → backend**: `apiRequest()` now accepts an optional `locale` that sets the `Accept-Language` header; callers in server components can pass `await getLocale()` from `next-intl/server`.
- Commit SHA: _pending_.
