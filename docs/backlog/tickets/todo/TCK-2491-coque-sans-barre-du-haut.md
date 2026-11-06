---
id: TCK-2491
title: La coque de /app sans barre du haut — cloche, compte, espace, langue et crédits dans la colonne ; en-tête mobile compacte
status: todo
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

- [ ] Coque sans barre du haut dès `md` ; en-tête mobile ; contrôles déplacés.
- [ ] Tests déplacés/adaptés (raccourci et bouton de la palette, contraste, focus, crédits).
- [ ] Mesure au navigateur 320 → 1440, clair/sombre, défilement horizontal nul, ordre de tabulation.

## Critères d'acceptation

- [ ] AC1 — Dès 768 px, aucune barre du haut ; la colonne porte cloche, compte (menu : espace,
  langue, profil, réglages, déconnexion) ; test qui rougit si la barre revient.
- [ ] AC2 — Sous 768 px, en-tête compacte + barre d'onglets ; tiroir = colonne ; mesuré à 320/390.
- [ ] AC3 — Aucun défilement horizontal de 320 à 1440 (relevé `innerWidth`/`scrollWidth`).
- [ ] AC4 — Ordre de tabulation : évitement → (bannières) → colonne → contenu ; relevé au navigateur.
- [ ] AC5 — `check:*`, gardes, tsc, lint ; suites par la CI.

## Hors périmètre

`/super-admin`, pages publiques.

## Notes d'implémentation
