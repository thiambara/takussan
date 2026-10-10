---
id: TCK-621
title: "Le logo seulement sur le site public : les tableaux de bord, la console, l'authentification, les onboardings et les écrans d'erreur écrivent « Takussan » en texte nu, ou rien"
status: done
phase: P1
family: front
estimate: S
wave: null
created: 2026-10-10
updated: 2026-10-10
depends_on: [TCK-583]
blocks: []
spec_refs:
  features:
    - docs/design-guidelines.md
  models: []
tags: [front, design, marque, logo, dashboard, super-admin, auth, onboarding, erreurs]
---

## Objectif utilisateur

- **Tout visiteur, tout membre** : reconnaître la marque sur chaque écran du produit, pas seulement
  sur le site public — dans `/app`, `/admin`, `/super-admin`, l'authentification, les onboardings et
  les écrans d'erreur ou de maintenance.

## Contexte

Relu sur `dev` à `dd9ef6a3` (2026-10-10). TCK-583 a posé le logo « lever de toit »
(`components/brand/Logo.tsx`) dans la `Navbar` et le `Footer` publics, et nulle part ailleurs :

| Écran | Avant |
|---|---|
| Barre haute de `/app` (`AppTopbar`) | « Takussan » en texte blanc |
| Tiroir mobile de `/app` (`AppSidebar`) | « Takussan » en texte |
| Barre latérale de `/admin` (`AdminSidebar`) | « Takussan » en texte blanc, sur desktop **sous** la barre haute qui le porte déjà |
| Barre haute de la console (`SuperAdminTopbar`) | « Takussan · Console » en texte terracotta |
| Tiroir mobile de la console (`SuperAdminSidebar`) | rien |
| `/auth/*`, panneau photo et bannière mobile | « Takussan » en texte blanc |
| Onboardings (`OnboardingShell`) | « Takussan » en texte |
| `/onboarding/securite`, `/onboarding/super-admin` | **aucune** marque |
| `/maintenance`, `/publish`, `/verification-indisponible` | **aucune** marque |
| Frontières d'erreur `app/error.tsx`, `(dashboard)/error.tsx` | **aucune** marque — elles remplacent la coque entière |
| 404 du site (`app/not-found.tsx`) | « Takussan » en texte |
| 404 d'une fiche (`properties/[slug]/not-found.tsx`) | ni `Navbar` ni `Footer`, quand ses voisines (bien retiré, indisponible) les ont |

## Décision

1. **Un second ton pour le logo** : `ton="clair"` peint toit, horizon et nom à `--background` (le
   lin), les rayons restant terracotta — le traitement d'`icon.svg`. Il sert sur les fonds sombres
   **hors** `.dark` : barre d'encre de `/app`, barre latérale de `/admin`, photo de `/auth`. Sous
   `.dark` (la console), le ton `encre` suffit : `--foreground` y est déjà le lin.
2. **`BarreDeMarque`** (`components/brand/`) : une barre d'identité pour les écrans servis hors de
   toute coque — frontières d'erreur, maintenance, publication, vérification indisponible,
   enrôlement du second facteur, accueil du super-admin.
3. **Le logo une fois par écran** : dans les tiroirs mobiles seulement (`md:hidden`) quand une barre
   haute le porte déjà au-dessus — la règle qu'`AppSidebar` appliquait depuis la revue design du
   2026-09-16, étendue à `AdminSidebar` et à `SuperAdminSidebar`.
4. **La console garde son nom accessible** « Takussan · Console » : le lien porte un `aria-label`,
   le logo et une pastille « Console » (`nav.superAdmin.consoleBadge`, fr/en/wo) se lisent ensemble.

## Critères d'acceptation

- [x] Chaque écran du tableau ci-dessus porte le logo (symbole + nom, ou symbole seul sous 640 px
      dans la barre de `/app`).
- [x] Le nom lu reste « Takussan » partout (double `sr-only` de `Logo`), et « Takussan · Console »
      sur le lien de la console.
- [x] Aucune couleur écrite : les deux tons passent par les jetons (`Logo.test.tsx`).
- [x] Sur desktop, `/admin` ne montre plus deux logos l'un au-dessus de l'autre.

## Hors périmètre

- `/playground`, page interne.
- Les e-mails et les PDF : ils ont leurs propres gabarits.

## Vérification

- `npm run lint`, `npx tsc --noEmit`, `npm run check:i18n`, suite vitest entière.
- `Logo.test.tsx` : le ton clair peint toit, horizon et nom à `--background`, les rayons à
  `--primary`.
- `SuperAdminShell.a11y.test.tsx` : le parcours clavier du tiroir compte le lien du logo.
- Au navigateur, en local (2026-10-10, 1366 et 390 px) : `/auth/login`, `/app` (barre et tiroir),
  `/admin`, `/onboarding/securite`, la frontière d'erreur de `/app` (rencontrée sur une migration
  locale en attente), la 404 d'une fiche. La console elle-même n'a pas été vue : l'atteindre
  exige un second facteur enrôlé ; sa barre est couverte par `SuperAdminShell.a11y.test.tsx`.
