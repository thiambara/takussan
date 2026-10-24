---
id: TCK-2150
title: "Le contrat papier, la pièce KYC d'agence et la preuve RGPD sont refusés au choix au-delà de 10 Mo"
status: todo
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
    - "docs/features.md#112-agence--équipe"
    - "docs/features.md#27-médias--fichiers"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-222--photos-et-pièces-téléversées-hors-de-mediamanager-et-mediadropzone"
tags: [front, leases, kyc, privacy, i18n, pistes]
---

## Objectif utilisateur

Celui qui choisit un contrat signé sur papier, une pièce KYC d'agence ou une preuve de réponse RGPD
de plus de 10 Mo l'apprend au choix, avec le nom du fichier et le plafond, au lieu d'un 422 après
l'envoi ; et la photo d'iPhone (HEIC, HEIF) n'est plus grisée dans le sélecteur KYC de l'agence.

## Contexte

Réf : **P222.06** du fichier de pistes, `validé (délégué)`. `ActivateLeaseRequest` (`max:10240`),
`UploadKycDocumentRequest` (`AcceptedUploads::kyc(10240)`) et `UpdatePrivacyRequestRequest`
(`PROOF_MAX_KB = 10240`) bornent à 10 Mo ; `LeaseSignaturePanel`, `kyc-components.tsx` et
`PrivacyRequestsConsole` envoient sans contrôle de taille. `kyc-components.tsx` annonce
`accept=".pdf,.jpg,.jpeg,.png,.webp"`, sans `heic` ni `heif`.

## Décision du porteur (déléguée)

> refuser avant l'envoi, au plafond de l'API (10 Mo), le fichier trop lourd sur `LeaseSignaturePanel` (contrat signé sur papier, `max:10240`), sur la pièce KYC d'agence de `kyc-components.tsx` (`AcceptedUploads::kyc(10240)`) et sur la preuve de `PrivacyRequestsConsole` (`PROOF_MAX_KB = 10240`), sur le modèle du refus de taille de `KycUploader` et `DocumentUploadDialog`, sans réduction, clé neuve en `fr` et `en` là où l'écran n'en a pas, le `wo` portant le texte français ; poser `KYC_MIME_ACCEPT` sur l'`accept` de `kyc-components.tsx` pour suivre `AcceptedUploads::KYC_EXTENSIONS` (`heic`, `heif`) ; test Vitest par écran : un fichier de 11 Mo est refusé sans appel à l'API ; reste : `reduirePhotosSousPlafond(…, 10 Mo)` sur les écrans d'intervention, qui attend la mesure d'un PNG de plus de 10 Mo sous 2 560 px

## Reste à faire

> `reduirePhotosSousPlafond(…, 10 Mo)` sur les écrans d'intervention, qui attend la mesure d'un PNG de plus de 10 Mo sous 2 560 px

## Hypothèses (mode sans humain)

- Plafond inclusif, comme `max:10240` : un fichier de 10 Mo exactement passe.
- Le fichier trop lourd n'est pas retenu (le bouton d'envoi reste inactif faute de fichier) et
  le champ natif est vidé ; un message `role="alert"` le nomme avec le plafond, sous le champ.
- Aucun écran n'a de clé de refus de taille : une clé neuve par écran, texte du devis
  (TCK-1907) — « Fichier trop lourd ({max} Mo au plus) : {files} » / « File too large ({max} MB
  max): {files} » — sous `lease.signature.paperTooLarge`, `kyc.uploader.fileTooLarge` et
  `superAdmin.privacyRequests.fields.proofTooLarge` ; le `wo` porte le français (wolof en pause).
- `accept` de `kyc-components.tsx` prend `KYC_MIME_ACCEPT` tel quel (types MIME de
  `AcceptedUploads::KYC_MIMETYPES`, que la garde de parité TCK-1888 tient déjà).

## Delta à produire

- [ ] `LeaseSignaturePanel` (`PaperActivation`) : refus au-delà de 10 Mo.
- [ ] `kyc-components.tsx` (`KycDocumentUploader`) : refus au-delà de 10 Mo par pièce, `accept={KYC_MIME_ACCEPT}`.
- [ ] `PrivacyRequestsConsole` (mise à jour d'une demande) : refus de la preuve au-delà de 10 Mo.
- [ ] Trois clés neuves en `fr`, `en`, `wo`.
- [ ] Un test Vitest par écran.

## Critères d'acceptation

- [ ] AC1 — Contrat papier de 11 Mo : nommé avec « 10 Mo », bouton d'activation inactif, aucun appel.
- [ ] AC2 — Pièce KYC d'agence de 11 Mo : nommée avec « 10 Mo », aucun envoi ; l'`accept` de l'input est `KYC_MIME_ACCEPT`.
- [ ] AC3 — Preuve RGPD de 11 Mo : nommée avec « 10 Mo », aucune mise à jour envoyée.
- [ ] AC4 — Un fichier de 10 Mo exactement est retenu sans alerte (au moins sur un écran).

## Hors périmètre

- La réduction des photos d'intervention sous 10 Mo (reste, au porteur).
- L'aide « PDF, JPG, PNG ou WEBP » (`kyc.uploader.accepted`), qui ne cite pas HEIC : texte
  existant, non touché par la décision.

## Notes d'implémentation

_(à remplir par implementing-specs)_
