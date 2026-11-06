---
id: TCK-2490
title: Barre latérale « Atelier » — une colonne pleine hauteur, une seule hiérarchie, « Aller à » et « Aujourd'hui »
status: done
phase: P2
family: front
estimate: M
wave: 83
created: 2026-11-06
updated: 2026-11-06
depends_on: [TCK-2489]
blocks: [TCK-2491]
spec_refs:
  features:
    - "docs/features.md#navigation-de-la-console-selon-le-profil-actif"
  models: []
tags: [front, navigation, coque, design, adr-0090]
---

## Objectif utilisateur

Une barre latérale calme et premium, lisible d'un coup d'œil, où l'on va partout (⌘K compris) sans
chercher.

## Contrat de données

Aucun endpoint neuf : `useMenuDeLEspace`, `useCompteursDuMenu`, `usePreferencesDuMenu`, les pages
récentes (`pages-recentes.ts`), le modèle « Aujourd'hui » de TCK-2489.

## Direction UX / Artistique

[ADR-0090](../../../adr/0090-la-coque-de-app-sans-barre-du-haut.md) §1, §3, §5, §6, §7. Référence
visuelle : la barre de Claude et la maquette « Atelier » validée le 2026-11-06 (relevé dans le
rapport de session). Calme, dense sans être serré, une seule hiérarchie ; la marque vit dans les
détails (l'icône active en couleur primaire, le « + » de l'action en pastille primaire). Lin clair et
sombre.

## Contraintes strictes (métier)

- Rien de ce que fait la barre aujourd'hui ne se perd : épingles (max, ordre, clavier), replis de
  groupe, mode icônes (auto/complet/icônes), groupe « Aussi … », « Démarrer », verrous pro, entrée
  console, carte de mise en location, carte d'offre, compteurs et leurs libellés accessibles,
  modules masqués, tiroir mobile (`onNavigate`, focus de retour).
- « Aller à » : une ligne du menu, nom accessible commençant par le texte visible, `aria-keyshortcuts`,
  ouvre la palette existante (même fonction que le bouton de la barre du haut).
- Contraste : textes ≥ 4,5:1, compteurs compris, clair ET sombre (test sur les jetons, patron
  d'`AppTopbar.a11y.test.tsx`) ; anneaux de focus visibles.
- i18n fr/en/wo ; aucun texte en dur ; `prefers-reduced-motion` respecté.

## Delta à produire

- [x] Nouvelle présentation de la colonne (en-tête, action, « Aller à », « Aujourd'hui », groupes,
  « Récents », lignes de statut, pied du compte) et du rail replié.
- [x] Tests adaptés + tests neufs (« Aller à », « Aujourd'hui », Récents, rail).
- [x] Mesure au navigateur (1024, 1280, 1440 ; clair/sombre ; tiroir à 390).

## Critères d'acceptation

- [x] AC1 — La colonne suit ADR-0090 §1/§3/§5/§6 ; captures datées au rapport (clair, sombre, replié, tiroir).
- [x] AC2 — Chaque fonction de la liste « rien ne se perd » a un test vert (existant adapté ou neuf).
- [x] AC3 — « Aller à » ouvre la palette au clic et ⌘K/Ctrl K ; focus rendu à la ligne à la fermeture.
- [x] AC4 — Contrastes ≥ 4,5:1 mesurés sur les jetons (clair et sombre), test qui rougit sur un jeton trop pâle.
- [ ] AC5 — `check:*`, gardes, tsc, lint ; suites par la CI.

## Hors périmètre

La barre du haut et l'en-tête mobile (TCK-2491) ; le contenu des pages.

## Notes d'implémentation

2026-11-06 — lot `atelier-coque`.

- **Colonne** (`AppSidebar`) : en-tête de 56 px (marque vers `/`, « Replier »), action principale à
  pastille primaire, « Aller à » (palette ; `aria-keyshortcuts`, touches montrées hors tactile et hors
  rail), zone qui défile (« Aujourd'hui », menu, « Récents »), lignes de statut, pied du compte. 272 px
  et 60 px **en px** : la racine est à 90 % dès lg (TCK-635), `w-68` mesurait 245 px.
- **Blocs neufs** : `AujourdhuiDeLaBarre` (sur `lignesAujourdhui`, TCK-2489 ; puce primaire sur la plus
  prioritaire), `RecentsDeLaBarre` (résolution de la palette, sans page courante ni doublon, 4 au plus,
  lu après hydratation), `LigneDeStatut` (cartes de mise en location, d'offre, console). Retirés :
  `BandeATraiter`, `EnTeteDEspace`.
- **Grammaire** : `styles-de-la-barre.ts` — lignes 36 px (40 au doigt), voile d'encre 8 % à l'actif et
  5 % au survol, icône active primaire, compteurs en chiffres `primary-deep` (`text-primary` échoue sur
  le voile : 4,10 / 3,74), point de couleur dans le rail, repli animé par `grid-template-rows` avec
  `inert` sur la liste fermée, rien sous `prefers-reduced-motion`, anneau rentrant (les listes sont en
  `overflow-hidden`). Rail : un filet entre groupes.
- **AC3** : `AppShell.palette.test.tsx` — clic, toucher sans focus, depuis le tiroir (le tiroir se
  referme, le focus revient au bouton « Menu ») ; Ctrl K / ⌘K inchangés.
- **AC4** : `AppSidebar.contraste.test.tsx` compose chaque fond depuis les classes rendues (lin, voiles,
  survol), clair et sombre ; trois ablations rougies (compteur `text-primary` 4,11 / 3,74 ; puce neutre
  4,10 ; valeur des crédits 4,42).
- **Récents** : trois ablations rougies (page courante, plafond, doublons).
- **Mesure** : 1024 / 1280 / 1440, 900 (rail auto), clair et sombre, rail par cookie, tiroir à 390 et
  320 : aucun défilement horizontal, tiroir de 288 px sans débordement.
- `check-super-admin-tokens` : cliquet 14 → 13 (l'avatar ne porte plus `text-white`).
- Reste à TCK-2491 : la variante `carte` de `ProfileSwitcher` n'a plus d'appelant ; le changement
  d'espace reste, d'ici là, au `ProfileSwitcher` de la barre haute, rendu à toutes les largeurs.

### Revue adverse (2026-11-06)

Chaque point a d'abord eu un test rouge. Chaque ablation est un script qui mute le code, joue le test
et restaure, md5 vérifié.

- **I1, « Aujourd'hui » dans le rail** — `ae9cf1049`. Le bloc reste dans le rail : une icône par ligne,
  un point de couleur, et l'infobulle « Visites à confirmer · 17 ». Le point n'est plus posé sur une
  entrée `inert` de hauteur nulle. Ablations R4 à R7 rouges. Au navigateur, 2 points visibles sur 2
  (agent 1280 en rail, hôte 900 en rail auto) et 0 point sous `[inert]`.
- **M3, chaque compte une seule fois** — `ae9cf1049`. Une entrée dont le compteur figure dans
  « Aujourd'hui » n'affiche plus de nombre. Son nom accessible garde l'information
  (`sr-only`) : les noms calculés par Chrome sont identiques avant et après. Un compteur absent
  d'« Aujourd'hui » reste sur son entrée (les visites du client). Ablations C1 et C2 rouges.
- **Point 3, l'admin d'agence** — `36056383c`. « Tableau de bord » vient juste après « Publier » et
  « Aller à », avant « Aujourd'hui » et « Démarrer ». Les autres profils sont inchangés. Ablations A1
  (le tableau remis après « Aujourd'hui ») et A2 rouges. Au navigateur à 1440 : action → « Aller à » →
  `/app` → Aujourd'hui.
- **M1, plafond à 99+** — `2f30d5c73`. `compteAffiche` (`compte-affiche.ts`) est la seule fonction de
  plafond, partagée par le menu et « Aujourd'hui ». Le nom accessible garde le vrai compte. Ablation P2
  rouge.
- **M2, un même bord droit** — `6df13b7ea`. L'épingle ne réserve sa place que là où elle s'affiche :
  au survol, au focus, quand elle est épinglée, et toujours sur un écran tactile. Ablations G1 et G2
  rouges. Au navigateur, les puces, la valeur des crédits et les touches sont toutes à 255 px. Au
  survol, l'épingle prend 25 px et le nombre passe à 226 px.
- **Suites non traitées** :
  - Dans le rail, un groupe replié ne signale pas un compteur qui ne figure pas dans « Aujourd'hui ».
  - Le tableau de bord remonté pour l'admin d'agence sort du repère `<nav>`.
  - La variante `carte` de `ProfileSwitcher` est réglée par TCK-2491 : le composant a quitté le dépôt.
