---
id: TCK-1792
title: "Quittance, reçu de réservation et état des lieux signé impriment les identités du jour qu'ils attestent"
status: done
phase: P2
family: technique
estimate: M
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#110-documents--contrats"
    - "docs/features.md#19-état-des-lieux--inventaires"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-140--pdf-figés-face-aux-pdf-recomposés-à-chaque-téléchargement"
tags: [api, quittance, etat-des-lieux, pdf, pistes]
---

## Objectif utilisateur

Le locataire qui retélécharge une quittance, le client qui rouvre un reçu de réservation, et les
parties d'un état des lieux signé lisent le nom, le courriel, le bien et l'agence vrais au jour du
règlement ou de la seconde signature, et non ceux du jour du téléchargement.

## Contexte

Réf : **P140.02** du fichier de pistes.

### Décision du porteur

> validé — validation en bloc du porteur (2026-10-22) : la piste telle qu'écrite, avec la recommandation du délégué quand l'entrée en porte une ; où elle laisse plusieurs voies sans recommandation, l'implémenteur retient la plus étroite et écrit son choix dans le ticket

**Choix de l'implémenteur** : la `Piste` propose de ranger le PDF à sa délivrance, ou de figer à
l'acquittement un instantané des identités imprimées dans `metadata`. La seconde est retenue :

- elle est la plus étroite : aucun fichier ni stockage neuf, aucune collection de médias sur deux
  modèles qui n'en ont pas, et les gabarits ne changent pas ;
- elle seule respecte P109.04, qui laisse **recomposé** le logo de l'agence sur un état des lieux
  signé : ranger les octets l'aurait figé aussi ;
- elle date l'instantané du fait attesté (règlement, signature), quand ranger le PDF le daterait
  du premier téléchargement.

Mesuré avant correctif (2026-10-23, `529ebc0ac`) : échéance réglée, puis locataire « Diop »
renommé « Ndiaye », adresse « Rue Alpha » passée à « Rue Beta », agence « Agence Alpha » renommée
« Agence Beta » → la quittance, le reçu de réservation et l'état des lieux signé impriment les
valeurs nouvelles (3 rouges sur 3).

## Hypothèses (mode sans humain)

- L'instantané vit dans `metadata.printed_identity` (`App\Services\Pdf\PrintedIdentity`) : nom et
  courriel de la personne, titre et composantes d'adresse du bien, nom de l'agence. Ce sont les
  seules valeurs d'identité que les gabarits lisent.
- Il se pose au passage à `paid` d'une échéance ou d'un paiement de réservation, par l'événement
  `saving` du trait `HasPaymentAttributes`, qui porte déjà la matrice des transitions : tout chemin
  Eloquent y passe (service, passerelle, création déjà payée). Une seule fois : un second passage à
  `paid` (remboursement partiel) garde le premier.
- Pour l'état des lieux, il se pose à la seconde signature, avec l'empreinte figée.
- Un acte réglé ou signé avant ce ticket n'a pas d'instantané : il imprime les valeurs courantes.
  Aucune donnée existante n'est réécrite (V4).
- Les ressources JSON des paiements et des états des lieux n'exposent pas `metadata` : l'instantané
  ne sort que dans le PDF. L'effacement de compte garde déjà les fiches `Customer` : l'instantané
  n'en conserve rien de plus.
- Le pied de page « Document généré le … » reste la date du téléchargement : il dit quand le PDF a
  été rendu, pas l'acte.

## Delta à produire

- [x] `PrintedIdentity::capture()` / `restore()`.
- [x] Capture : `HasPaymentAttributes` (saving), `LeasePayment::printedIdentityRoles()`,
  `BookingPayment::printedIdentityRoles()`, `InventorySignatureService::sign()`.
- [x] Restitution : `DocumentPdfController::streamRentReceipt()` (console et lien public),
  `PaymentReceiptPdf::forBookingPayment()`, `InventoryController::downloadPdf()`.
- [x] Garde : `tests/Feature/Api/PrintedIdentityFrozenTest.php`.

## Critères d'acceptation

- [x] AC1 — Quittance d'une échéance réglée, identités changées ensuite → elle imprime celles du
  règlement.
- [x] AC2 — De même pour le reçu de réservation.
- [x] AC3 — De même pour l'état des lieux signé, à la seconde signature.
- [x] AC4 — Un acte sans instantané imprime les valeurs courantes.

## Notes d'implémentation

- Ablation : `restore()` rendant les modèles tels quels → AC1 à AC3 rouges ; remis → vert.
- `Address::full_address` est un accesseur : l'instantané garde ses composantes, que la copie
  recompose.
- Piège rencontré : `InventoryController` lit le bailleur par `$property->user`, relation que
  `Property` n'a pas (elle a `owner()`) : la valeur est toujours `null` et l'état des lieux
  n'imprime jamais le bailleur. Hors périmètre, non corrigé ; l'instantané reprend la même lecture.
