---
id: TCK-623
title: "« UNDEFINED » dans la navbar : un compte ouvert par téléphone n'a pas de nom, et l'interface écrivait `''[0]` en toutes lettres — la section contact du profil ne s'enregistrait pas non plus"
status: done
phase: P1
family: full
estimate: S
wave: null
created: 2026-10-10
updated: 2026-10-10
depends_on: [TCK-589]
blocks: []
spec_refs:
  features:
    - docs/features.md#21-authentification--comptes
  models: []
tags: [back, front, auth, telephone, profil, navbar, identite]
---

## Objectif utilisateur

- **Toute personne qui entre par son numéro (ou par Google)** : voir une interface propre avant
  d'avoir donné son nom — ni « undefined », ni pastille vide, ni libellé qui déborde — et pouvoir
  enregistrer sa bio ou son numéro sans qu'un nom qu'on ne lui demande pas bloque tout.

## Contexte

Relevé en préproduction le 2026-10-10, juste après une connexion par téléphone : la pastille de la
navbar affichait « UNDEFINED » et chevauchait « Publier ».

- `PhoneLoginService::createAccount()` (et le provisionnement OAuth) créent le compte avec
  `first_name = ''` et `last_name = ''`.
- `Navbar.tsx` construisait les initiales par `` `${user.first_name[0]}${user.last_name[0]}` `` :
  `''[0]` vaut `undefined`, écrit tel quel, puis mis en capitales. L'`Avatar` n'avait pas
  d'`overflow-hidden` : le texte sortait du rond.
- Le même nom vide laissait ailleurs des trous : « Bonjour  » (accueil), « Bienvenue,  »
  (intention), une pastille vide (barres latérales, menu, en-tête du profil).
- `ProfileContactSection` renvoyait `first_name`/`last_name` vides à `PUT /api/auth/profile`, qui
  les exigeait : **toute sauvegarde de la bio ou du numéro rendait 422** pour ces comptes.

## Décision

- **`lib/identite.ts`** : `prenomDe`, `nomCompletDe`, `libelleDe` (nom → e-mail → numéro lisible),
  `initialesDe` (nom → initiale de l'e-mail → `null`). Chaque fonction rend `null` quand elle n'a
  rien de vrai à dire ; l'appelant choisit le repli : une silhouette (`UserRound`) pour la pastille,
  `nav.accountFallback` (« Mon compte ») pour le libellé, une variante sans nom pour les titres.
- Branché sur `Navbar`, `UserMenu`, `AppSidebar`, `AdminSidebar`, `ProfileHeader`, l'accueil de
  `/app`, `/onboarding/intention` et l'accueil de l'admin d'agence.
- `Avatar` : `overflow-hidden`.
- **API** : `first_name` n'est exigé que s'il est envoyé (et alors non vide) ; `last_name` est
  facultatif (vide → `''`). La section contact n'envoie plus les noms ; l'action serveur n'écrit
  plus « null » pour un champ absent.

## Critères d'acceptation

- [x] Un compte sans nom ni e-mail n'écrit « undefined » nulle part dans la navbar, menu ouvert
      compris, et son numéro le désigne (`Navbar.compte-sans-nom.test.tsx`, rouge sans le correctif).
- [x] Un compte sans nom enregistre sa bio sans envoyer de nom ; un prénom seul s'enregistre
      (`AuthProfileTest`, deux rouges sans le correctif).
- [x] Un prénom envoyé vide reste refusé (422 `first_name`).

## Hors périmètre

- Demander le prénom à l'entrée : c'est le chantier « Entrer » de
  `docs/plans/2026-10-10-parcours-entrer-publier.md`.
- Les listes qui affichent **d'autres** personnes (tables d'admin, CRM) : un membre sans nom y
  apparaît encore vide. Le prénom demandé à l'entrée en réduit la population.

## Vérification

- `src/lib/__tests__/identite.test.ts` (6 cas), `Navbar.compte-sans-nom.test.tsx`.
- `tests/Feature/Auth/AuthProfileTest.php` (19 tests).
- vitest sur `components/{layout,profile,home,onboarding,super-admin}`, `app/onboarding`,
  `app/(dashboard)/app` : 615 verts. `tsc`, ESLint sur les fichiers touchés, `check:i18n` : verts.
