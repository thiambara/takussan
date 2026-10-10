---
id: TCK-624
title: "Entrer : quatre sorties d'authentification qui perdaient la destination, ne demandaient jamais de prénom, et un lien de vérification qui n'ouvrait rien sans session"
status: doing
phase: P1
family: full
estimate: M
wave: null
created: 2026-10-10
updated: 2026-10-10
depends_on: [TCK-623, TCK-493, TCK-589]
blocks: []
spec_refs:
  features:
    - docs/features.md#21-authentification--comptes
  models: []
tags: [back, front, auth, onboarding, redirection, verification-email, mot-de-passe]
---

## Objectif utilisateur

- **Toute personne qui se connecte ou crée un compte**, par n'importe quelle voie : arriver là où
  elle allait, après qu'on lui a demandé — une fois — ce qui manque vraiment (son prénom), et
  seulement ça.

Plan d'ensemble : [`docs/plans/2026-10-10-parcours-entrer-publier.md`](../../plans/2026-10-10-parcours-entrer-publier.md).

## Contexte (relevé le 2026-10-10)

- Quatre règles de sortie : e-mail → `redirect` ; téléphone → question si compte neuf ; OAuth →
  question ; inscription → vérification puis question. Un compte né sans nom (téléphone, OAuth)
  n'en donnait jamais.
- La destination se perdait : `/auth/*?redirect=X` avec un cookie → `/app` (proxy) ; la page
  d'intention sans session oubliait `redirect` ; « Je cherche » ramenait à la destination, y
  compris `/publish` ; « Je publie » envoyait à `/onboarding/host` même pour un compte qui avait
  déjà un espace.
- Le lien de vérification d'e-mail exigeait la session de l'inscription : ouvert sur le téléphone,
  il échouait toujours. Le bouton « Continuer vers le tableau de bord » menait à la question.
- La connexion par téléphone crée un compte au premier code, sans montrer la mention des
  conditions.
- L'API acceptait tout mot de passe de 8 caractères ; le front exigeait une lettre et un chiffre.

## Décision

1. **Une porte de sortie** : toutes les voies (e-mail, second facteur, téléphone, OAuth,
   vérification) sortent par `/onboarding/intention?redirect=X`. Elle demande, dans l'ordre :
   - **le prénom** s'il manque (`EtapePrenom` : prénom exigé, nom facultatif), enregistré par
     `PUT /api/auth/profile` ;
   - **l'orientation**, seulement si `X` n'est pas explicite (`estUneDestinationExplicite` :
     l'accueil et `/app` sont des défauts, tout le reste dit ce que la personne vient faire).
   Puis elle rend `X`. « Je publie » mène à `/publish`, qui sait où conduire.
2. **`redirect` préservé partout** : le proxy rend la destination (assainie) à une session déjà
   ouverte ; la page d'intention sans session renvoie à la connexion avec elle.
3. **Vérification d'e-mail sans session** : la route sort du groupe `auth:sanctum`, garde
   `signed:relative`, prend `throttle:6,1`, et `VerifyEmailLinkRequest` vérifie le hash de
   l'adresse ACTUELLE du compte désigné. La page appelle l'API avec ou sans cookie ; sans session,
   elle propose de se connecter.
4. **Mention des conditions** sur les deux variantes de la connexion par téléphone.
5. **`Password::defaults()`** = 8 à 72 caractères, une lettre, un chiffre — la règle du front —
   pour l'inscription, la réinitialisation et l'acceptation d'invitation.

## Critères d'acceptation

- [x] Connexion e-mail, second facteur et téléphone (compte ancien ou neuf) sortent par
      `/onboarding/intention`, destination portée (`login-retour-a-l-origine`,
      `connexion-par-telephone`, `points-d-entree`).
- [x] Un compte sans prénom le donne avant d'aller plus loin ; prénom vide refusé sans appel
      (`EtapePrenom.test.tsx`).
- [x] `/publish`, une fiche, `/app/properties/new` sautent la question ; `/`, `/fr`, `/app` non
      (`redirection-interne.test.ts`).
- [x] « Je veux publier » mène à `/publish` (`QuestionDIntention.test.tsx`).
- [x] `/auth/login?redirect=/publish` avec une session → `/publish` ; `//evil.example` → `/app`
      (`proxy.test.ts`).
- [x] Le lien de vérification aboutit sans session ; un lien d'une autre adresse ou sans signature
      est refusé (`AuthEmailVerificationTest`, trois rouges sans le correctif).
- [x] `aaaaaaaa`, `12345678` et 74 caractères sont refusés à l'inscription (`AuthRegistrationTest`).

## Hors périmètre

- Garder la preuve d'acceptation des CGU (aucune colonne ne la porte) : décision structurelle,
  ADR d'abord — cf. le plan.

## Vérification

- vitest : `src/app/(auth)`, `src/app/onboarding`, `src/components/{onboarding,auth}`,
  `proxy.test.ts`, `redirection-interne.test.ts` — 228 verts.
- `AuthRegistrationTest`, `AuthPasswordResetTest`, `tests/Feature/Invitation`,
  `AuthEmailVerificationTest` : verts.
