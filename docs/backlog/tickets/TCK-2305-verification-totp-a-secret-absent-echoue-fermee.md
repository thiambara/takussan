---
id: TCK-2305
title: "La vérification d'un TOTP sur un compte « 2FA active, secret nul ou vide » refuse le code au lieu de rendre 500"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-25
updated: 2026-10-25
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-221--arguments-typés-string-nourris-par-une-colonne-nullable-ou-un-repli-qui-rend-null"
tags: [api, auth, 2fa, pistes]
---

## Objectif utilisateur

Un compte dont la 2FA est active mais dont le secret est nul ou vide ne reçoit jamais de 500 : le
code TOTP y est refusé, comme un code faux. Le code de secours reste une voie à la connexion, et le
mot de passe à la désactivation.

## Contexte

Réf : **P221.01** du fichier de pistes, `validé`.

Décision du porteur : validation du porteur (2026-10-25) : `verifyCodeForUser` rend faux pour un secret nul ou vide (échec fermé), ce qui corrige les six sites ; pas de contrainte en base

Avant (lu, puis mesuré par `SecretAbsentTest`, 12 rouges) : `TwoFactorService::verifyCodeForUser`
typait le secret `string`. Un secret nul levait une `TypeError` là où il passe tel quel (la
désactivation, `TwoFactorController.php:141` ; la connexion, `AuthController.php:114`). Un secret
nul casté en `(string)`, ou vide, levait `SecretKeyTooShortException` dans Google2FA (le step-up,
`TwoFactorController.php:188` ; `PhoneLoginService.php:160` ; `OAuthSessionOpener.php:130` ;
`RequestAccountDeletionRequest.php:160`). Les six sites rendaient 500.

Le défaut est latent : aucun écrivain connu ne produit cette ligne (relu par le mesureur).

## Delta à produire

- [x] `verifyCodeForUser(User, ?string $secret, string $code)` rend `false` pour un secret nul ou vide.
- [x] Test : `tests/Feature/Auth/TwoFactor/SecretAbsentTest.php`, un cas par site et par forme du
  secret (nul, vide).

## Critères d'acceptation

- [x] AC1 — Désactivation par code : 422 `two_factor.password_or_code_invalid`.
- [x] AC2 — Step-up : 422 `two_factor_step_up_invalid`.
- [x] AC3 — Connexion par e-mail : code refusé (401, `requires_2fa`, aucun jeton) ; le code de
  secours connecte (200, jeton).
- [x] AC4 — Connexion par téléphone : 401, `requires_2fa`, aucun jeton.
- [x] AC5 — Défi OAuth : 401, `requires_2fa`.
- [x] AC6 — Demande de suppression du compte : 422 sur `two_factor_code`.

## Hors périmètre

- Une contrainte en base (`CHECK (NOT two_factor_enabled OR two_factor_secret IS NOT NULL)`) : la
  décision l'écarte.
- Un secret non vide mais invalide (trop court, hors base32) lève encore dans Google2FA : la
  décision ne vise que le secret nul ou vide, et aucun écrivain ne pose un tel secret.
- Les `(string)` des quatre appelants restent : inoffensifs, puisque le vide rend désormais faux.

## Notes d'implémentation

- Le secret se pose dans le test après la fabrique, par le cast `encrypted` : un vide écrit en SQL
  brut ne se relirait pas (le déchiffrement de `''` lève avant tout appel).
- **Ablation** : la garde retirée (le type `?string` gardé) → 12 rouges sur 12 ; remise → 12 verts.
- Voisins verts : `TwoFactorTest`, `AuthLoginTest`, `StepUpTwoFactorTest`, `OAuthSecondFactorTest`,
  `PhoneLoginTest`, `AccountDeletionRequestTest` (66 tests).
