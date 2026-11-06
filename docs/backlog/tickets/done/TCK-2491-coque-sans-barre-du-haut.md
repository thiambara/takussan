---
id: TCK-2491
title: La coque de /app sans barre du haut — cloche, compte, espace, langue et crédits dans la colonne ; en-tête mobile compacte
status: done
phase: P2
family: front
estimate: M
wave: 83
created: 2026-11-06
updated: 2026-11-06
depends_on: [TCK-2489, TCK-2490]
blocks: []
spec_refs:
  features:
    - "docs/features.md#navigation-de-la-console-selon-le-profil-actif"
  models: []
tags: [front, navigation, coque, design, mobile, adr-0090]
---

## Objectif utilisateur

Toute la hauteur de l'écran sert la page ; le compte, l'espace et les notifications se trouvent au
même endroit, dans la colonne.

## Contrat de données

Composants existants : `NotificationBell`, `ProfileSwitcher`, `LanguageSwitcher`, `UserMenu`,
`PastilleCredits`, `Logo`, la palette.

## Direction UX / Artistique

[ADR-0090](../../../adr/0090-la-coque-de-app-sans-barre-du-haut.md) §2 et §8. Le menu du compte est
un seul menu (espace, langue, profil, réglages, déconnexion), sobre, ancré au pied de la colonne.

## Contraintes strictes (métier)

- À partir de `md`, `/app` n'a plus de barre du haut ; la marque mène à `/` ; la cloche garde son
  comportement (non-lus, panneau, sondage) ; le changement d'espace garde son comportement
  (`ProfileSwitcher` : cookie, rechargement, profils) ; la langue persiste comme aujourd'hui.
- Sous `md` : en-tête compacte (marque, « Aller à », cloche) ; barre d'onglets inchangée ; le tiroir
  rend la colonne de TCK-2490, menu du compte compris.
- Les bannières (impersonation, suspension, bandeaux du site) et le lien d'évitement gardent leur
  place et leur ordre de tabulation ; les pages plein écran restent sans coque.
- Le z-index des panneaux (cloche, menu du compte) respecte TCK-2485 (dialogues au-dessus de tout).
- i18n fr/en/wo.

## Delta à produire

- [x] Coque sans barre du haut dès `md` ; en-tête mobile ; contrôles déplacés.
- [x] Tests déplacés/adaptés (raccourci et bouton de la palette, contraste, focus, crédits).
- [x] Mesure au navigateur 320 → 1440, clair/sombre, défilement horizontal nul, ordre de tabulation.

## Critères d'acceptation

- [x] AC1 — Dès 768 px, aucune barre du haut ; la colonne porte cloche, compte (menu : espace,
  langue, profil, réglages, déconnexion) ; test qui rougit si la barre revient.
- [x] AC2 — Sous 768 px, en-tête compacte + barre d'onglets ; tiroir = colonne ; mesuré à 320/390.
- [x] AC3 — Aucun défilement horizontal de 320 à 1440 (relevé `innerWidth`/`scrollWidth`).
- [x] AC4 — Ordre de tabulation : évitement → (bannières) → colonne → contenu ; relevé au navigateur.
- [ ] AC5 — `check:*`, gardes, tsc, lint ; suites par la CI.

## Hors périmètre

`/super-admin`, pages publiques.

## Notes d'implémentation

2026-11-06 — branche `feat/coque-atelier`.

**Ce qui a bougé.** `AppTopbar` est supprimé, avec ses deux tests. Dès `md`, la colonne porte la marque
(vers `/`), la cloche (panneau aligné à gauche) et la bascule rail/complet, puis « Aller à » ; au pied,
`MenuDuCompte`, un seul menu. Il rassemble l'en-tête nom/courriel, le changement d'espace
(`EspacesDuMenu`, extrait de `ProfileSwitcher` avec le hook `useEspacesDuCompte` ; rien quand il n'y a
qu'un espace), le solde de crédits (pour qui voit le portefeuille, seulement s'il est connu), le profil,
les préférences de notification (`HREF_PREFERENCES`), l'entrée d'administration, la langue
(`menuitemradio`, par `useChangementDeLangue`) et la déconnexion (par le contexte, puis l'accueil
localisé). Sous `md`, `EnTeteMobile` (`md:hidden`) monte la marque, le bouton de la palette
(`aria-keyshortcuts` par `useSurApple`) et la cloche, avec des cibles de 40 px ; le tiroir rend la colonne,
menu du compte compris, sans cloche (l'en-tête a la sienne). Chaque choix du menu referme le tiroir
(`onNavigate`). Panneaux en portail au `z-[1100]` (TCK-2485). En plein écran : ni en-tête, ni colonne.

**Effets de bord.**
- Les encres translucides introduites par TCK-2490 (lignes, puce neutre, « Récents », touches) faisaient
  rougir `encre-sans-alpha` : elles passent aux jetons opaques. Les touches `kbd` sont désormais
  dessinées par un contour : avec un fond, elles tombaient à 4,10:1 au survol.
- `src/i18n/namespaces.json` régénéré : `property` et `search` quittent la racine de `/app`.
- `check-super-admin-tokens` : `components/search` sort des fermetures de `/app`, et le plafond du reste
  passe de 13 à 0.
- La sentinelle `AppTopbar` de `portees-sombres.test` est rejouée sur un en-tête reconstitué.
- Suite possible : le **déclencheur** `ProfileSwitcher` n'est plus monté ; seuls ses tests le gardent.
  Le supprimer relève d'un ticket à part.

**Preuves.**
- `AppShell.sans-barre-du-haut.test` :
  - AC1 : tout `<header>` de la coque porte `md:hidden`.
  - AC2 : l'en-tête mobile ne contient qu'un lien vers `/` et deux boutons de 40 px.
  - AC4 : l'ordre du document suit la chaîne évitement → bannière → en-tête → colonne → contenu → onglets.
- `AppSidebar.atelier.test` couvre l'en-tête de la colonne, la cloche absente du tiroir, chaque entrée du
  menu et le changement d'espace.
- `AppShell.menu-et-credits` couvre le solde dans le menu.
- Ablations rougies puis restaurées (md5 vérifié) :
  - B1 : `md:hidden` retiré.
  - B2 : la cloche dans le tiroir.
  - B3 : `onNavigate` retiré.
  - B4 : la langue non cochée.
  - B5 : le solde retiré.
  - B6 : le bouton de la palette retiré.
  - E1 : `EspacesDuMenu` retiré.
  - E2 : l'espace actif re-basculé.

**Mesure au navigateur** (CDP, `next dev`, 2026-11-06, `load averages: 5.47 5.67 5.91`, 8 cœurs) :
- `scrollWidth == innerWidth` à 320 (sombre), 390, 768 (rail 60 px), 900 (sombre, rail), 1024, 1280
  (sombre) et 1440 (colonne de 272 px).
- Ordre de tabulation relevé :
  - à 1440 : évitement → marque → cloche → bascule → action → « Aller à » → Aujourd'hui… ;
  - à 390 : évitement → en-tête (marque, palette, cloche) → contenu → onglets.
- Menu du compte ouvert au pointeur, toujours dans l'écran :
  - à 1280 et 1440 depuis le pied (230 px) ;
  - dans le rail à 1280 (sombre) ;
  - par le tiroir à 320 et 390 (256 px), au-dessus du tiroir.
- Dans le rail, le menu « ne s'ouvrait pas » : faux positif. L'indicateur de `next dev` et le bouton des
  devtools TanStack Query couvrent le coin bas-gauche, et aucun des deux n'existe en production.
- AC5 : `check:*`, gardes du dépôt, `tsc` et `lint` sont verts à chaque commit. Les suites entières sont
  laissées à la CI : la case reste ouverte.

### Revue adverse (2026-11-06)

Chaque point a d'abord eu un test rouge. Chaque ablation est un script qui mute le code, joue le test
et restaure, md5 vérifié.

- **I2, un appui à côté du menu du compte** — `283aa5899`. Un `Menu.Backdrop` explicite
  (`DropdownMenuContent voile`, z 1099) empêche cet appui d'activer la ligne en dessous. Le test couvre
  le toucher et la souris, dans le tiroir comme sur le bureau. Ablation V1 rouge. Au navigateur, avec
  l'hôte (390 au toucher, 390 et 1280 à la souris), l'appui tombe sur `dropdown-menu-voile`. Ensuite,
  le menu est fermé, le tiroir reste ouvert et la page reste `/app`. Sans le voile, l'appui ouvrait
  `/app/properties/new`.
- **M4, la marque mène à l'accueil dès 768** — `7e24d030a`. Le rail compris, la marque mène à `/` ;
  dans le rail, elle ne montre que le symbole. Ablations K1 et K2 rouges. Chrome calcule le nom
  « Takussan » à 1440, 900 et 1280 en rail.
- **M5, la garde d'AC1** — `6f622cf94`. La garde juge la structure, plus le seul `<header>`.
  Au-dessus de la rangée colonne + contenu ne sont permis que l'évitement, les bannières
  `role=status` et ce qui porte `md:hidden`. Dans la rangée, seuls la colonne (`hidden md:block`) et
  le `<main>`. Ablations rouges : B1 (un `<div>` au-dessus de la rangée), B2 (un `<nav>`), B3 (un
  `<div>` dans la rangée).
- **`ProfileSwitcher` retiré** — `08f8636ce`. Le composant n'avait plus d'appelant ; il part avec ses
  tests. Ce que `MenuDuCompte` utilise vit dans `EspacesDuMenu.tsx`, avec son propre test, après un
  grep sans appelant restant. Ablations E3 à E5 rouges.
- **Mesure finale** (CDP, `next dev`, 2026-11-06, `load averages: 2.22 4.11 4.92`, 8 cœurs) :
  `scrollWidth == innerWidth` à 320 (clair et sombre), 390 (clair et sombre), 900, 1280 (rail) et
  1440 (clair et sombre). Aucun voile au repos. Captures `r-20261106-*`.
