---
id: TCK-2026
title: "La réinitialisation du mot de passe rend un code stable, traduit par l'écran, sans dire si le compte existe"
status: done
phase: P0
family: bug
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-192--libellés-résolus-par-une-clé-bâtie-sur-une-valeur"
tags: [api, web, auth, i18n, pistes]
---

## Objectif utilisateur

Un lien de réinitialisation faux ou expiré dit, dans la langue de l'utilisateur, que le lien est
invalide ou expiré, au lieu d'afficher la phrase anglaise du cadriciel ; une adresse sans compte
reçoit la même réponse, qui ne dit pas si le compte existe.

## Contexte

Réf : **P192.01** du fichier de pistes. `PasswordResetController::resetPassword` rendait
`__($status)`, où `$status` est une clé `passwords.*` qu'aucune langue du dépôt ne traduit : le
repli `en` rendait le texte anglais du cadriciel, que l'écran affichait tel quel.

## Décision du porteur

> validé — validation du porteur (2026-10-23) : la recommandation du délégué ; le front traduit le `code` (`auth.resetPassword.*`), `message` en repli ; `passwords.user` rend le même code que `token`

La recommandation du délégué : `abort_code(422, 'password_reset.<token|throttled>')` avec les clés
dans `lang/{fr,en}/errors.php` (texte français tel quel en `wo`), le succès par une clé de
`messages.php` comme `forgotPassword`, et `passwords.user` rendu sous le même code et le même texte
que `passwords.token`.

## Hypothèses (mode sans humain)

- Un seul code, `password_reset.invalid_link`, pour tout refus : `Password::broker()->reset()` ne
  rend que `passwords.reset`, `passwords.token` ou `passwords.user` (`passwords.throttled` n'est
  rendu que par `sendResetLink`). Un code `throttled` serait sans écrivain ; il n'est pas créé.
- Le texte de l'API reprend mot pour mot `auth.resetPassword.invalidBody` du front (« Ce lien de
  réinitialisation est invalide ou a expiré. Demandez-en un nouveau. »), et l'écran traduit le
  code par cette même clé : aucun texte de produit neuf côté front.

## Delta à produire

- [x] `resetPassword` : `abort_code_unless(… === PASSWORD_RESET, 422, 'password_reset.invalid_link')`,
  succès par `messages.password_reset_done`.
- [x] Clés `errors.password_reset.invalid_link` et `messages.password_reset_done` dans `fr`, `en`
  et `wo` (texte français tel quel en `wo`).
- [x] `reset-password/page.tsx` : le code connu se traduit par `auth.resetPassword.invalidBody`, le
  `message` de l'API en repli.
- [x] Tests : `AuthPasswordResetTest` (trois langues, adresse sans compte, succès) et
  `transactional-links.test.tsx` (code traduit, repli sur `message`).

## Critères d'acceptation

- [x] AC1 — jeton faux sous `fr`, `en`, `wo` → 422 `{code: password_reset.invalid_link}`, message
  dans la langue de la requête, jamais « This password reset token is invalid. ».
- [x] AC2 — adresse sans compte → même statut et même corps qu'un jeton faux.
- [x] AC3 — succès sous `fr` → message français, sans `code`.
- [x] AC4 — l'écran affiche le texte traduit du code, et le `message` de l'API pour un code inconnu.

## Hors périmètre

- La ligne « groupes du cadriciel » de `LangGroupParityTest` : plus rien ne lit `passwords.*`
  (recommandation du délégué).
- `forgotPassword`, déjà traduit.

## Notes d'implémentation

- Reproduit sur `c83f38bac` par les trois tests neufs d'`AuthPasswordResetTest` : rouges (pas de
  `code`, message `messages.password_reset_done` absent, phrase anglaise du cadriciel).
- Ablation : contrôleur remis à l'état de `c83f38bac` → les 3 tests API rouges ; page remise →
  le cas `password_reset.invalid_link` rouge (le repli reste vert, il décrit l'ancien comportement
  pour un code inconnu). Correctifs remis → verts.
