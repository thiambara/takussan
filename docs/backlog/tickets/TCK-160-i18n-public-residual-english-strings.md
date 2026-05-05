---
id: TCK-160
title: "i18n public — chaînes anglaises résiduelles côté visiteur anonyme"
status: review
phase: P1
family: front
estimate: M
created: 2026-05-05
updated: 2026-05-05
depends_on: [TCK-159]
blocks: []
spec_refs:
  features:
    - docs/features.md#28-internationalisation--préférences
    - docs/features.md#12-recherche--découverte-publique
tags: [front, bug, p1, smoke-test-2026-05-05, i18n, visiteur-anonyme]
---

## Objectif utilisateur

Un visiteur anonyme en français ne voit aucune chaîne anglaise résiduelle dans le parcours public. La page `/compare`, la barre flottante du comparateur, `/favorites`, les modales, l'autocomplétion de recherche et les contrôles de la carte interactive sont tous traduits.

## Contrat de données

Tout est côté front : compléter les clés dans `messages/{fr,en,wo}.json` et brancher les composants. Aucun changement d'API.

## Direction UX / Artistique

- Cohérence FR site-wide : pas de mix FR/EN dans une même zone fonctionnelle (cf. TCK-154 qui pose la convention pour le dashboard).
- Préserver les valeurs canoniques d'enum côté code (ne pas changer le contrat backend).

## Contraintes strictes (métier)

- Pas de modification d'enums backend.
- a11y : conserver les `aria-label` mais traduits (pas de mélange aria EN + texte visible FR).

## Delta à produire

Pour chaque zone, ajouter / corriger les clés dans les catalogues et brancher les composants concernés :

- [ ] **Page `/compare`** — page entière en EN aujourd'hui : titre `Compare properties`, sous-titre `2 properties selected — compare to decide.`, libellé `COMPARATOR` / `CRITERION`, en-têtes colonnes (`Price`, `Transaction`, `Property type`, `Billing period`, `City`, `Neighborhood`, `Area`, `Bedrooms`, `Bathrooms`, `Floor`, `Furnished`, `No`, `Year built`, `Parking spots`, `Amenities`, `Other tags`), boutons `View property`, `Remove …`.
- [ ] **Barre flottante "Comparator"** (visible site-wide quand ≥1 bien comparé) : `Comparator`, `1 / 4 propertie(s)` (corriger aussi la typo de pluriel parenthésé), `Remove property #621 from the comparator`, `Compare (1)`, `Clear comparator`.
- [ ] **Page `/favorites`** : H1 `My favorites` → `Mes favoris`, message `1 saved property.` → `1 bien sauvegardé.` (avec pluralisation).
- [ ] **Navbar publique** : `aria-label="My favorites"` → `Mes favoris`, `aria-label="Language"` → `Langue`.
- [ ] **Modales** (Connexion requise pour Réserver / Demander une visite / Envoyer un message / Signaler ; Partager cette annonce) : bouton invisible `Close` → `Fermer`.
- [ ] **Carte Leaflet** (fiche bien + vue carte du listing) : libellés `Zoom in`, `Zoom out`, `Marker` localisés via les options Leaflet ou un wrapper.
- [ ] **Autocomplétion barre de recherche** (home + listing) : placeholder/listbox `Search a city, neighborhood, property type…` → `Recherchez une ville, un quartier, un type de bien…` ; options `See all cities`, `All types` traduites.
- [ ] Tests : snapshot ou test ciblé vérifiant l'absence des chaînes EN listées en mode FR.

## Critères d'acceptation

- [ ] En mode FR, aucune des chaînes suivantes n'apparaît dans le parcours public : `Comparator`, `Compare properties`, `propertie(s)`, `Clear comparator`, `View property`, `My favorites`, `1 saved property`, `Search a city, neighborhood…`, `See all cities`, `All types`, `Zoom in`, `Zoom out`, `Close` (en bouton de modale), `Marker`.
- [ ] La page `/compare` est entièrement en français.
- [ ] La barre flottante du comparateur est entièrement en français et le compteur utilise une vraie pluralisation (`1 bien sélectionné` / `2 biens sélectionnés`).
- [ ] Les `aria-label` de la navbar sont en français.

## Hors périmètre

- Mise en place de l'infrastructure i18n (faite dans TCK-159).
- Traductions Wolof complètes (livraison incrémentale acceptée — au moins fallback FR).
- Pages dashboard (déjà couvertes par TCK-117 / TCK-154).

## Notes d'implémentation

La majorité des chaînes EN listées étaient en réalité présentes en FR dans
le catalogue mais n'apparaissaient en mode FR que parce que TCK-159 a câblé
le résolveur de locale. Le travail s'est focalisé sur les vrais résidus :

- **Pluralisation ICU** sur `compare.subtitle`, `compare.unavailableNotice`
  et `compare.floatingBar.count` (FR/EN/WO) — supprime la typo `bien(s)` /
  `propertie(s)` et donne « 1 bien sélectionné » vs « 2 biens sélectionnés ».
- **Dialog Close** (`components/ui/dialog.tsx`) tire désormais
  `common.actions.close` via `useTranslations` au lieu du littéral `Close`.
- **Cartes Leaflet** (`PropertyMap`, `PropertyLocationMapInner`) : zoom
  control monté manuellement avec `zoomInTitle`/`zoomOutTitle` localisés ;
  marqueurs reçoivent `alt` + `title` traduits depuis le namespace `map`.
- Toast bleu de chargement et bandeau « X+ biens » de `PropertyMap` migrés
  vers `t('loading')` / `t('truncated', { count })`.
- Garde-fou : extension de `messages.test.ts` qui échoue si l'une des
  chaînes EN listées dans l'AC réapparaît dans `fr.json`.
- Test `CompareFloatingBar` mis à jour pour le nouveau format pluralisé.
