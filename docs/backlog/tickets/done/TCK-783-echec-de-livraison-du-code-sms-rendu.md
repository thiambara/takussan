---
id: TCK-783
title: "Un code SMS qu'aucun fournisseur n'a accepté se dit : 503 phone.sms_undelivered"
status: done
phase: P2
family: bug
estimate: M
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-15--parcours-dune-agence-neuve"
tags: [back, auth, sms, otp, pistes]
---

## Contexte

Réf : **P15.05** du fichier de pistes, `validé` (critère accordé : V2). `PhoneVerificationService::issue()`
rendait `true` après `deliver()`, quelle qu'en soit l'issue : quand aucun fournisseur n'acceptait le
SMS, `deliver()` journalisait seulement, et l'écran affichait « code envoyé » pour un code qui
n'arriverait jamais.

## Décision du porteur

issue() rend l'échec de livraison et l'écran le dit ; pas de repli par e-mail pour vérifier un téléphone ; reste : un repli pour la signature d'un bail quand le SMS ne part pas

## Reste à faire

un repli pour la signature d'un bail quand le SMS ne part pas

## Delta à produire

- [x] `App\Exceptions\SmsCodeUndelivered` (503 `phone.sms_undelivered`), levée par `issue()` quand
      aucun fournisseur n'accepte le SMS ; `deliver()` rend l'issue.
- [x] `errors.phone.sms_undelivered` en `fr` et `en` ; en `wo`, le texte français tel quel (wolof en
      pause depuis le 2026-10-16).
- [x] `PhoneLoginService::requestCode` l'attrape et reste muet ; `RecordPublicSearchAlert` l'attrape
      et ne compte pas la confirmation comme envoyée.
- [x] `SmsCodeUndeliveredTest`.

## Critères d'acceptation

- [x] AC1 — `POST auth/phone/send-otp`, `auth/secondary-phone/send-otp` et `auth/phone/change-code`
      rendent 503 `phone.sms_undelivered`, avec son message localisé, quand aucun fournisseur
      n'accepte le SMS.
- [x] AC2 — `POST auth/phone/request-code` reste 202 dans ce cas.
- [x] AC3 — Aperçu du code allumé (ADR-0060), l'envoi reste 200 et porte `otp_preview`.

## Hors périmètre

- Aucun repli par e-mail pour vérifier un téléphone (décision).
- Le repli de la signature d'un bail (reste). `LeaseSignatureService` émet ses codes par son propre
  chemin, que ce ticket ne touche pas.

## Hypothèses (mode sans humain)

- **« L'écran le dit » sans changement du front** : les trois écrans qui envoient un code
  (`PhoneVerificationSection`, `CoordonneesPublication`, `SecondaryPhoneSection`) affichent déjà le
  `message` d'un refus par `messageErreurApi`, et un 5xx qui porte de la prose rend cette prose,
  pas le générique (`takussan-web/src/lib/api.ts:422-426`, lu).
- **La connexion par téléphone reste muette** : son contrat est de ne rien dire de l'issue
  (`PhoneLoginService::requestCode`, docblock). Le dire serait un autre choix d'authentification.
- **Le code et le délai de renvoi restent posés** après un échec : un échec « ambigu » a pu arriver
  quand même (`AmbiguousDelivery`). D'où « Réessayez dans une minute » dans le message.
- **Aperçu allumé, l'envoi n'échoue pas** : sans cela, la préproduction ne vérifierait plus aucun
  numéro sans fournisseur, ce qui est la raison d'être d'ADR-0060.

## Notes d'implémentation

- Ablations : la levée retirée → 3 rouges sur 5 ; le `catch` de la connexion retiré → 1 rouge
  (503 au lieu de 202) ; la condition d'aperçu retirée → 1 rouge. Remis → 5 verts.
- Une sous-classe d'`ApiError`, et non `abort_code()` : les deux appelants muets la nomment dans
  leur `catch`, sans comparer un code en chaîne.
- Piège : `PhoneVerificationTest` envoyait par le vrai routeur, sans fournisseur configuré, et
  attendait 200. Ses 4 tests d'envoi rougissaient donc (503) : la classe installe désormais le faux
  routeur, comme les autres classes qui éprouvent un envoi réussi.
