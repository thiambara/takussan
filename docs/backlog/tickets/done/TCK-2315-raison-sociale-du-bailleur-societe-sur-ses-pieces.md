---
id: TCK-2315
title: "La raison sociale d'un bailleur société s'imprime sur le contrat, le relevé, l'état des lieux et le reversement"
status: done
phase: P2
family: bug
estimate: M
wave: null
created: 2026-10-25
updated: 2026-10-25
depends_on: [TCK-1323]
blocks: []
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#34-ownerprofile-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-234--ce-que-linvitation-porte-face-à-lacceptation-par-un-compte-existant"
tags: [api, web, bailleur, pdf, pistes]
---

## Contexte

Réf : **P234.06** du fichier de pistes, `validé` par le porteur le 2026-10-25 (critère accordé :
V7). Suite de P117.05 (TCK-1323), dont le reste demandait ce relevé « un à un ».

La raison sociale d'un bailleur société vit dans `owner_profiles.metadata.company_name` de son
profil dans l'agence ; seul le carnet des bailleurs la lisait. Le contrat de bail, le relevé de
gérance, l'état des lieux et le dialogue de reversement nommaient la société par sa personne de
contact.

## Décision du porteur

validation du porteur (2026-10-25) : la raison sociale (format de TCK-1323) sur le contrat, le relevé, l'état des lieux et le reversement ; un contrat figé garde ses octets

## Delta à produire

- [x] `OwnerProfile::companyName()` (société seule) et `OwnerProfile::companyNameOf($userId, $agencyId)` :
  le profil du bailleur dans l'agence de la pièce, le profil en vigueur avant un profil retiré.
- [x] Contrat (`pdf.leases.contract`) : `landlord_company` en tête de la case « Bailleur », la
  personne en dessous ; passé par `DocumentPdfController::leaseContract` (rendu à la volée) et par
  `LeaseSignatureService::renderContract` (gel). Le contrat figé reste servi octet pour octet.
- [x] Relevé : `landlord.company_name` dans le JSON (`OwnerStatementService`), imprimé en tête par
  `pdf.statements.owner` ; type `OwnerStatement` du front.
- [x] État des lieux : le bailleur est lu par `$property->owner` (l'instantané et le rendu lisaient
  `$property->user`, relation que `Property` n'a pas : aucun bailleur n'était imprimé) ; sa raison
  sociale est figée dans l'instantané (`PrintedIdentity::LANDLORD_COMPANY`) à la seconde signature.
  Un état des lieux figé sans bailleur n'en imprime pas (`PrintedIdentity::frozenAbsent`).
- [x] Reversement : l'option du bailleur dans `CreatePayoutDialog` lit « SCI Baobab — Fatou Sarr ».
  `raisonSocialeDe` passe de `OwnersList` à `lib/queries/owners.ts`, lue par les deux.

## Critères d'acceptation

- [x] AC1 — Bail d'un bailleur société de l'agence du bail : le contrat rendu porte « SCI Baobab »,
  puis « Moussa Fall ».
- [x] AC2 — Un particulier (même avec une `company_name` saisie) et la raison sociale d'un profil
  d'une AUTRE agence ne s'impriment pas.
- [x] AC3 — Un contrat figé avant la raison sociale est servi avec ses octets d'origine ; un contrat
  figé après la porte.
- [x] AC4 — Le relevé rend `landlord.company_name` (`null` pour un particulier), `landlord.name`
  inchangé, et son PDF imprime la société puis la personne.
- [x] AC5 — État des lieux signé : « Bailleur », « SCI Baobab », « Moussa Fall » ; renommée ensuite,
  la société imprimée reste celle de la seconde signature.
- [x] AC6 — État des lieux figé avant ce ticket (instantané à `landlord` nul, sans raison sociale) :
  ni bailleur ni raison sociale.
- [x] AC7 — Le dialogue de reversement nomme « SCI Baobab — Fatou Sarr », et un particulier par son
  nom.

## Hypothèses

- « Format de TCK-1323 » : la raison sociale en tête, la personne en dessous, sans texte neuf
  (pas de « représentée par »). Une option de liste n'ayant qu'une ligne, le reversement les joint
  par un tiret cadratin.
- Le bailleur de l'état des lieux est le propriétaire du bien, comme le disait le gabarit
  (« owner of the property ») ; c'est la condition pour que la raison sociale y paraisse.

## Hors périmètre

- « Signé par X pour le compte de Y » de l'état des lieux garde le nom de la personne.
- Les autres pièces (quittance, reçu, facture) et les écrans du bail.
- Une colonne neuve pour la raison sociale (TCK-1323 : `metadata` seule).

## Notes d'implémentation

- Prémisse re-mesurée par `LandlordCompanyNameTest` (neuf) : 5 rouges sur 9 avant correctif
  (contrat, contrat figé après coup, relevé, deux états des lieux), et `PrintedIdentityFrozenTest`
  ne pouvait vérifier le bailleur de l'état des lieux (`landlord: false`) : il le vérifie désormais.
- Ablations, une à une, chacune rouge : `landlord_company` retiré du rendu à la volée (AC1), du
  gel (AC3), `company_name` du relevé à `null` (AC4), instantané par `property->user` (AC5 et
  `PrintedIdentityFrozenTest`), `frozenAbsent` retiré (AC6), raison sociale courante au lieu de
  celle de l'instantané (AC5), option sans raison sociale (AC7). Remis → verts.
- La comparaison du contrat figé (`LeaseSignatureService::rendersAs`) porte sur les colonnes, pas
  sur les octets : changer le gabarit ne défige aucun contrat.
