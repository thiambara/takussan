---
id: TCK-2367
title: "Le compteur d'échecs de connexion s'écrit en base, le remboursement d'une Vedette et le montant d'une demande de séjour se calculent sur la ligne relue sous verrou"
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
    - "docs/features.md#13-réservations-courte-durée--visites"
  adr:
    - "docs/adr/0033-le-telephone-verifie-est-un-identifiant-de-connexion.md"
    - "docs/adr/0061-credits-d-espace-et-boost-des-annonces.md"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-245--colonnes-json-recomposées-depuis-le-modèle-chargé-puis-réécrites-en-entier"
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-246--montants-calculés-hors-de-la-transaction-écrits-après-une-relecture-qui-ne-rejuge-que-le-statut"
tags: [back, auth, boost, reservations, concurrence, pistes]
---

## Objectif utilisateur

Deux échecs de connexion simultanés sur un compte en comptent deux, et aucun ne réécrit le drapeau
de réinitialisation de la 2FA posé par le support. L'annulation remboursée d'une Vedette rend les
jours de la ligne telle qu'elle est au moment de l'annulation, prolongation comprise. Une demande de
séjour naît au prix du bien au moment où elle est écrite.

## Contexte

Trois pistes `validé` (second tour, 2026-10-25), de même cause : une valeur calculée sur le modèle
chargé avant l'écriture, puis écrite sans être rejugée sur la ligne en base.

- Réf : **P245.02** (V2) — `LoginLock::recordFailure` recomposait `metadata` depuis le compte chargé
  par `login()`, et `UserSupportService::resetTwoFactor` posait `force_2fa_reconfigure` de même.
  Précision du statut : le compteur d'échecs de connexion et `force_2fa_reconfigure` s'écrivent par un `UPDATE … jsonb_set` atomique, jamais depuis le modèle chargé
- Réf : **P246.01** (V1) — `BoostLifecycle::closeWithRefund` calculait `refundableCredits` sur le
  boost reçu, hors de la transaction, et la réclamation ne rejugeait que le statut. Précision du
  statut : le remboursement de crédits d'une Vedette se calcule sur le boost relu sous verrou dans la transaction de `closeWithRefund`
- Réf : **P246.02** (V1) — `PublicPropertyController::bookingRequest` calculait `total_amount` et
  `deposit_amount` sur le bien lié à la route, puis verrouillait la ligne sans garder la relecture.
  Précision du statut : les montants d'une demande de séjour se calculent sur le bien relu sous verrou

Mesures d'avant (mesureur, db3e25230) : (P245.02) un échec écrit pendant le `POST /api/auth/login` au
mauvais mot de passe → `failed_login_attempts = 1` au lieu de 2 ; la réinitialisation de la console
écrite au même moment → `force_2fa_reconfigure` effacé, 2FA coupée. (P246.01) Vedette 7 j, prolongée
de 7 j après la lecture de l'annulation → `refunded_credits = 17` au lieu de 37, solde 477 au lieu
de 497. (P246.02) prix passé de 50 000 à 80 000 après la liaison de la route → demande de 3 nuits à
150 000.

## Hypothèses (mode sans humain)

- P245.02 : toute la règle du compteur (verrou échu, série de 24 h, premier échec, incrément,
  verrou au 10ᵉ) se joue dans **une seule** instruction `UPDATE … RETURNING`, sur la valeur en base.
  `now()` y entre en paramètre, pour que le temps des tests (`travelTo`) reste celui de la règle.
  `LoginLock::clear` et le déblocage de la console retirent les trois clés du compteur par
  `metadata - '{…}'` de même : ce sont aussi des écritures du compteur.
- P245.02 : `resetTwoFactor` écrit les colonnes de la 2FA par le modèle (le journal d'activité suit
  `two_factor_enabled`), puis le drapeau par `jsonb_set`, dans une transaction. L'enrôlement qui
  solde la réinitialisation (`TwoFactorController::enable`, `SuperAdminTwoFactorController`) retire
  la clé par `metadata - 'force_2fa_reconfigure'`, pour la même raison.
- P246.01 : la ligne relue sous verrou n'étant plus vivante, rien n'est rendu ni écrit, comme une
  réclamation perdue avant.
- P246.02 : le bien relu sous verrou porte aussi la devise de la demande. Un bien supprimé entre la
  liaison et le verrou rend 404 (`firstOrFail`) au lieu de faire naître la demande.

## Delta à produire

- [x] `LoginLock::recordFailure` : un `UPDATE users … RETURNING metadata` qui joue la règle en SQL ;
  `clear` et `UserSupportService::unlock` : retrait atomique des trois clés. L'écriture passe par
  `App\Services\Auth\MetadataDuCompte` (`ecrire`, `poser`, `retirer`).
- [x] `UserSupportService::resetTwoFactor`, `TwoFactorController::enable`,
  `SuperAdminTwoFactorController` : `force_2fa_reconfigure` écrit ou retiré par `jsonb_set` / `-`.
- [x] `BoostLifecycle::closeWithRefund` : boost relu sous verrou dans la transaction, remboursement
  calculé sur lui.
- [x] `PublicPropertyController::bookingRequest` : montants et devise calculés sur le bien relu sous
  verrou.
- [x] Tests : `tests/Feature/Auth/Session/EchecsDeConnexionCroisesTest.php`,
  `tests/Feature/Boost/AnnulationRembourseeFaceAProlongationTest.php`,
  `tests/Feature/Public/DemandeDeSejourAuPrixReluTest.php`.

## Critères d'acceptation

- [x] AC1 (P245.02) — Un échec écrit en base après la lecture du compte par `login()`, puis le
  mauvais mot de passe → `failed_login_attempts = 2`.
- [x] AC2 (P245.02) — La réinitialisation de la 2FA écrite après la lecture du compte, puis un
  échec → `force_2fa_reconfigure` présent, compteur à 1.
- [x] AC3 (P245.02) — Un échec écrit après la lecture du compte par `resetTwoFactor` → compteur
  conservé, drapeau posé.
- [x] AC4 (P245.02) — La règle du compteur ne change pas : `PasswordLoginLockTest`,
  `LoginFailureWindowTest`, `ThirdPartyLockTest`, `UserSupportTest`, `ForceTwoFactorReconfigureTest`
  verts.
- [x] AC5 (P246.01) — Vedette prolongée après la lecture de l'annulation remboursée → remboursement
  calculé sur la ligne relue (37), solde 497.
- [x] AC6 (P246.02) — Prix changé après la liaison de la route → la demande de séjour porte le total
  et l'acompte du prix relu.

## Notes d'implémentation

- **Ablation** (fichiers de code remis à leur version d'avant, puis le correctif remis) : P245.02 →
  6 rouges sur 6 (`EchecsDeConnexionCroisesTest`), puis 6 verts ; P246.01 → le test de la
  prolongation rouge (17 au lieu de 37), celui sans prolongation vert, puis 2 verts ; P246.02 → rouge
  sur l'égalité du total de la demande et du devis du prix relu (`240000.00`), puis vert.
- **Concurrence réelle** (P245.02), jouée hors suite sur une base jetable du conteneur : une session
  tient la ligne avec un premier échec et le drapeau, l'`UPDATE` de `recordFailure` attend son verrou,
  puis rend `failed_login_attempts = 2` et garde le drapeau. PostgreSQL rejoue bien l'expression, sous
  requêtes `LATERAL` comprises, sur la version commitée. L'écouteur `retrieved` des tests ne joue que
  le cas « écrit avant l'`UPDATE` ».
- `?|` n'est pas utilisable derrière PDO (le `?` y devient un paramètre) : la condition de `retirer`
  passe par `jsonb_exists_any()`.
- `now()` entre en paramètre ISO 8601 (`::timestamptz`), jamais `now()` de PostgreSQL : le temps des
  tests (`travelTo`) reste celui de la règle, et la liaison d'un `Carbon` perdrait son fuseau.
- Pas d'amendement d'ADR : les trois décisions disent où le calcul se fait, pas ce qu'il rend. Les
  règles d'ADR-0033 § 6 (verrou) et d'ADR-0061 § 8 (remboursement) sont inchangées.
