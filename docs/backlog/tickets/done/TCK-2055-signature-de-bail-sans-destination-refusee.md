---
id: TCK-2055
title: "Le code de signature d'un bail est refusé par un code quand le signataire n'a ni numéro vérifié ni e-mail"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-193--comptes-et-invitations-sans-e-mail-face-aux-textes-et-avis-bâtis-sur-l-e-mail"
tags: [api, lease, signature, pistes]
---

## Objectif

Un signataire qu'aucun canal ne peut joindre apprend pourquoi il ne reçoit pas de code, au lieu
d'une réponse qui annonce un envoi par e-mail qui n'a pas lieu.

## Contexte

Réf : **P193.06** du fichier de pistes, `validé`.

### Décision du porteur

> validé — validation du porteur (2026-10-23) : la recommandation du délégué

La recommandation du délégué (ligne `Mesure` du 2026-10-23, delegue) : (1) signature : refuser
avant d'émettre le code, comme `sms_not_sent` le fait après, par
`422 lease_signature.no_destination` quand ni numéro vérifié ni e-mail, sans consommer la fenêtre
de renvoi, et le front dit au signataire de vérifier son numéro depuis son profil ; (2) les trois
textes d'opérateur : ne rien faire tant que P193.05 n'est pas tranchée, puisqu'un opérateur a
toujours un e-mail et que le repli est sans effet aujourd'hui.

Mesuré par le mesureur : `POST /api/leases/{id}/signature/otp` pour un locataire sans e-mail ni
numéro vérifié → `202 {"channel":"mail","destination":"•••@"}`, aucun courriel.

## Hypothèses (mode sans humain)

- Le panneau de signature affiche déjà le message de l'API tel quel (`LeaseSignaturePanel`,
  `messageErreur`, éprouvé par son test « affiche le refus de l'API tel qu'elle le dit ») : le
  texte du refus, qui dit de vérifier le numéro depuis le profil, est donc écrit dans
  `lang/*/errors.php` et le front n'a rien à ajouter.
- Le refus passe après le verrou (`423 code_locked`) et avant la fenêtre de renvoi (`429`) : un
  refus sans destination ne consomme pas cette fenêtre.

## Delta à produire

- [x] `LeaseSignatureService::sendCode` : `422 lease_signature.no_destination` avant `issue()`.
- [x] Texte du refus (`fr`, `en` ; `wo` recopie le français).
- [x] Test dans `LeaseSignatureTest`.

## Critères d'acceptation

- [x] AC1 — Sans numéro vérifié ni e-mail, `422 lease_signature.no_destination`, aucune
  notification de code.
- [x] AC2 — L'adresse ajoutée, la demande suivante part aussitôt (202), sans attendre la fenêtre de
  renvoi.

## Reste à faire

- Les trois textes d'opérateur (`SuperAdminAcceptedBroadcast`, `SuperAdminCooptationService`,
  `ImpersonationService`) et l'accesseur commun de P193.05, laissés tels quels par la décision :
  sans effet tant qu'un opérateur a toujours un e-mail.

## Hors périmètre

- Un lien vers le profil dans le panneau de signature.

## Notes d'implémentation

- Reproduit avant correctif : `test_p193_06_un_signataire_sans_destination_est_refuse_avant_tout_code`
  rendait 202.
- Ablation : `LeaseSignatureService.php` remis à `HEAD` → rouge ; remis → vert, et la classe
  `LeaseSignatureTest` entière verte (52).
