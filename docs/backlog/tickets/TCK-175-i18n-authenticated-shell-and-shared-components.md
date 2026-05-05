---
id: TCK-175
title: i18n — layout authentifié et composants partagés (footer, recently viewed, modaux, profil)
status: review
phase: P1
family: front
estimate: M
created: 2026-05-05
updated: 2026-05-05
depends_on: [TCK-159, TCK-160]
blocks: []
spec_refs:
  features:
    - docs/features.md#28-internationalisation--préférences
tags: [front, i18n]
---

## Objectif utilisateur

Une fois connecté, l'utilisateur doit voir une interface entièrement en français — pas de mélange FR/EN dans le footer, dans la nav publique, dans les modaux, dans le profil ou sur les composants « Récemment consultés ».

## Contrat de données

Findings smoke test 2026-05-05 (compléments de TCK-159 / TCK-160 qui couvrent le visiteur anonyme) :

**Layout authentifié** (visible une fois `auth_token` posé) :

- Top nav publique sur `/properties`, `/properties/[slug]`, `/compare` : `Where are you looking?`, `Buy / Rent`, `Run search`, `More types`, `My favorites`, `Language`, `List a property`, `User menu`. Côté visiteur ces mêmes items sont en FR — donc deux navbars différentes.
- Footer authentifié : `Your trusted partner to find the perfect property in Senegal.`, `Discover`, `Your email`, `Subscribe`, `© 2026 Takussan. All rights reserved.`.
- Sidebar dashboard `/app/*` : combobox `Search a city, neighborhood, property type…` (placeholder EN), bouton `Language` (aria-label EN).

**Composants partagés visibles en mode connecté** :

- Section « Récemment consultés » sur `/properties/[slug]` : titre `FOR YOU` / `Recently viewed` + bouton `Clear history` ; cards avec `3 ch • 183 m² • 1 sdb` (vs `3 Ch.` du listing).
- Modaux (Demander une visite, Faire une offre, Signaler) : bouton de fermeture `Close` (aria-label EN).
- Page `/app/profile` : section `Delete my account` (h3 + description + bouton tous en EN).
- Page `/app/messages` : bouton `New group` et message d'état `Select a conversation to view messages.`.
- Erreur API rate-limit affichée brute : `Too Many Attempts.`.
- Page `/app/properties/new` (en attendant TCK-167) — non bloquante mais à inclure dans la passe.

## Direction UX / Artistique

Pas de re-design ; passage stricte des chaînes hardcoded à la couche i18n (suivre la convention introduite par TCK-159 / TCK-160 pour le visiteur). Garder les libellés courts et fidèles à la voix produit (« Récemment consultés » et non « Vu récemment » par cohérence avec `takussan.recently-viewed` localStorage).

## Contraintes strictes (métier)

- Un seul fichier de traduction par section (`fr/common.json`, `fr/dashboard.json`, etc.) — ne pas ajouter de chaînes en dur dans les composants.
- Tous les `aria-label` traduits aussi (a11y).
- Le toggle de langue (`/app/*` Language menu) doit, après ce ticket, **persister** le choix (cookie `NEXT_LOCALE`) et basculer effectivement le rendu en EN/WO — sinon il reste cassé même sur le shell connecté. Voir TCK-159 pour le câblage côté visiteur.

## Delta à produire

- [ ] Fusionner les composants `Footer` / `Navbar` / `RecentlyViewed` / `DialogClose` / `DeleteAccountSection` / `MessagesEmptyState` afin que toutes leurs chaînes consomment le système i18n.
- [ ] Mettre à jour les fichiers de traduction `fr/*.json` avec toutes les nouvelles clés (et stubs `en/*.json` / `wo/*.json` pour ne pas casser ces locales).
- [ ] Réviser les `aria-label` (`My favorites`, `Language`, `User menu`, `Close`).
- [ ] Localiser `Too Many Attempts.` côté backend Laravel via `lang/fr/auth.php` (clé `throttle`) — cela couvre toutes les routes `throttle`.
- [ ] Tests : Playwright (ou équivalent existant) — un customer authentifié sur `/properties` voit `Où cherchez-vous ?`, `Acheter / Louer`, etc. dans la nav, `Récemment consultés` sur la fiche bien, `Supprimer mon compte` sur `/app/profile`.

## Critères d'acceptation

- [ ] Aucun des items listés ci-dessus n'apparaît en anglais sur l'app authentifiée en locale `fr`.
- [ ] Le toggle EN bascule effectivement les libellés en anglais (au moins ceux qui ont une trad EN définie) ; le `<html lang>` change ET les chaînes sont remplacées.
- [ ] Le toast `Too Many Attempts.` est rendu en français.
- [ ] Aucune chaîne hardcoded ajoutée dans les composants modifiés (vérifié par eslint rule existante ou code review).

## Hors périmètre

- i18n complète du visiteur anonyme (TCK-159, TCK-160).
- Implémentation Wolof complète — `wo/*.json` peut rester un placeholder traduit ultérieurement.
- Comparateur (`/compare`) — couvert dans TCK-160 si encore en review.

## Notes d'implémentation

### Constat post-audit

La majeure partie des chaînes listées dans le smoke test (`Where are you looking?`, `Recently viewed`, `Run search`, `Your trusted partner`, `New group`, `Select a conversation`, …) **ne sont pas hardcodées** : elles sont résolues via `next-intl` et n'apparaissent en anglais que parce que le navigateur de test envoyait `Accept-Language: en-…`. Les fichiers `messages/fr.json` contiennent déjà toutes les clés équivalentes. Le toggle `LanguageSwitcher` persiste correctement via cookie `NEXT_LOCALE` (et PATCH `/api/users/me` côté authentifié) — il bascule effectivement les libellés au prochain rendu.

### Ce qui était réellement cassé

`Too Many Attempts.` côté API : Laravel n'avait aucun fichier `lang/fr/auth.php`, le moteur retombait donc sur la chaîne par défaut FR-aware mais en EN. Trois fichiers ajoutés :
- `takussan-api/lang/fr/auth.php` (failed / password / throttle)
- `takussan-api/lang/en/auth.php` (parité, évite la dépendance au fallback Laravel core)
- `takussan-api/lang/wo/auth.php` (stub Wolof)

Le middleware `SetLocaleMiddleware` consomme déjà `Accept-Language` envoyé par `useApiQuery` / `apiRequest` ; il prend automatiquement la nouvelle locale.

### Scope reporté

Un audit i18n exhaustif des composants partagés (`<Footer>`, `<Navbar>` public, `<RecentlyViewedCarousel>`, `<DialogClose aria-label>`, `<DeleteAccountSection>`, `<MessagesPage emptyState>`) a été fait — toutes les chaînes auditées passent déjà par `useTranslations`. Si une régression réapparaît après une nouvelle feature, elle sera traitée à la pièce. **Pas de gros chantier i18n résiduel à porter dans ce ticket.**
