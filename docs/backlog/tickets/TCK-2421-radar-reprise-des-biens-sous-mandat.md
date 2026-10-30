---
id: TCK-2421
title: "Radar : l'annonceur publié sous mandat qui ouvre un compte reprend ses biens dans son espace"
status: done
phase: P3
family: full
estimate: M
wave: 80
created: 2026-10-30
updated: 2026-10-30
depends_on: [TCK-2394]
blocks: []
spec_refs:
  features:
    - "docs/features.md#212-radar--acquisition-dannonces"
  models: []
tags: [api, front, radar, mandat, adr-0079]
---

## Objectif utilisateur

Un annonceur dont Takussan diffuse les biens sous mandat change d'avis et veut les gérer lui-même :
il ouvre un compte et retrouve ses biens dans son espace, sans les republier.

## Contexte

[ADR-0079](../../adr/0079-la-publication-sous-mandat-takussan.md) § Conséquences, livré par
TCK-2394. Un bien publié sous mandat vit dans l'espace désigné par `radar.mandate_agency_id` ;
l'annonceur n'a pas de compte (`radar_advertisers.user_id` nul, `mandate_at` posé). TCK-2394
ferme les chemins qui mêleraient les deux états : « publier pour lui » est refusé à un annonceur
sous mandat (`radar.publish.under_mandate`), et la relance d'activation ne le vise pas.

La réclamation par le lien (TCK-2390) est **fermée** à un annonceur sous mandat (vérification
adverse I1 de TCK-2394) : ni code SMS, ni confirmation, ni publication réclamée par le job, avec
409 `radar.claim.under_mandate` jugé sous le verrou de la réclamation. **Ce ticket lève ce
blocage** en organisant la reprise, et il est un **prérequis de l'allumage de `radar_mandate`**
(ADR-0079, prérequis du porteur) : tant qu'il n'est pas livré, un annonceur sous mandat qui veut
un compte n'a que « écrivez-nous ».

## Delta à produire

- [x] Transfert des biens sous mandat (agence, `user_id`, contact) dans l'espace du compte qui
      vérifie le numéro de l'annonceur, dans une transaction, journalisé.
- [x] La page de réclamation d'un annonceur sous mandat le dit et propose ce transfert.
- [x] Lever `radar.claim.under_mandate` dans `RadarClaims` et `RadarPublisher::publishClaimed()`, une
      fois le transfert en place.
- [x] `mandate_at` reste comme trace ; le second message suit le nouvel état.

## Critères d'acceptation

- [x] AC1 — Après la vérification de son numéro, l'annonceur sous mandat voit ses biens dans son
      espace, sans republication ni perte de vues ou de demandes.
- [x] AC2 — Rien ne se transfère vers un compte qui n'a pas vérifié le numéro de l'annonceur.

## Hors périmètre

- La présentation publique du mandat (TCK-2422).

## Notes d'implémentation

Mesuré sur `dev` 9f7bffea9 : le ticket disait juste. Le refus `radar.claim.under_mandate` était jugé
dans `sendCode()`, `confirm()`, `claim()` (sous verrou) et `publishClaimed()`. « Sous mandat » se lisait
`mandate_at !== null`, sauf dans le second message et à la console (`mandate_at` et pas de compte). Ce
ticket en fait une seule règle, `RadarAdvertiser::underMandate()`.

- **La reprise est le code de la réclamation.** `RadarMandateTakeBack::takeBack()` n'a qu'un appelant :
  `RadarClaims::claim()`, sous le verrou de l'annonceur, après `authenticate()` ou `checkCode()`. Rien
  ne se transfère sans le code envoyé au numéro de l'annonceur (AC2). L'annonceur n'est rattaché à son
  compte qu'une fois ses biens dans son espace : aucun état mêlé.
- **`mandate_taken_back_at`, et pas `user_id`.** Une colonne clôt la période de mandat. Avec
  `user_id`, un compte délié après la reprise (`AdvertiserAccountRelease`) remettrait l'annonceur
  « sous mandat » alors que ses biens ne sont plus dans l'espace des mandats. Un nouveau mandat après
  une reprise date une période neuve (`mandate_at` ← maintenant, reprise remise à nul).
- **`user_id` du bien réécrit sans le journal du modèle** (ADR-0059 § 4), comme `PropertyOwnerTransfer` :
  sinon `properties:repair-reassigned-owners` déferait la reprise. La trace est l'évènement
  `radar_mandate_taken_back`.
- **Les biens repris** : ceux des annonces de l'annonceur avec `metadata.radar_mandate` vrai et non
  supprimés. Le drapeau passe à faux sur le bien, sans être effacé.
- **Amendement d'ADR-0079** : « la reprise des biens par l'annonceur ».

### Décisions prises en autonomie, à revoir

1. **Ce qui suit le bien** : ses demandes et ses clics (espace, destinataire), ses visites (agent), ses
   conversations (transmises au nouveau contact principal par le job rejouable
   `TransmitTakenBackConversations`, mis en file après le commit et après la publication des annonces
   cochées — TCK-888 : l'ancien répondant, titulaire ou collaborateur, quitte le fil ; une transmission
   en échec se rejoue, puis se signale, sans défaire la reprise ni retenir la publication), ses empreintes de photos,
   et le compteur `properties_count` des deux espaces. Écarté : ne déplacer
   que le bien, ce qui perdrait les demandes (AC1).
2. **Ce qui reste à l'espace des mandats** : ses prospects (le lien `customer_id` des demandes et des
   visites reprises est retiré) et ses collaborateurs (retirés du bien). Écarté : déplacer les prospects,
   qui sont partagés entre tous les biens de l'espace des mandats.
3. **Un bien qui porte de la gestion renvoie au support** : réservation, bail, facture de prestataire,
   mise en avant, maintenance, état des lieux, flux de calendrier, ou un lot. C'est l'état `mandate_support`, avec le code
   409 `radar.claim.mandate_support_required`. Écarté : les déplacer d'office (paiements et prospects
   d'un autre espace). Rien de cela ne naît d'une publication sous mandat.
4. **Aucun quota rejugé à la reprise** : les biens existent et sont déjà en ligne. Écarté : refuser une
   reprise au-delà du quota de l'espace individuel, qui laisserait l'annonceur enfermé sous mandat.
5. **La reprise ne dépend pas du drapeau `radar_mandate`** : l'éteindre ne ferme pas la sortie. Écarté :
   la fermer avec le drapeau.
6. **Le second message sous mandat porte le lien de la reprise** (`mandat.v2`, à faire relire par
   l'avocat). Si ce lien ne s'ouvrirait pas (connexion par téléphone éteinte, aperçu OTP actif), le
   message reste `mandat.v1`. Écarté : aucun lien, qui laisserait la page de reprise joignable par le
   seul lien du message d'accord, mort au bout de 30 jours.
7. **Sous mandat, une confirmation sans annonce cochée est permise** quand il y a des biens à reprendre.
   Écarté : exiger une annonce à publier.
8. **À revoir — un espace qui n'est pas actif (suspendu ou inactif) refuse la reprise** (vérification
   adverse I2 et N2), comme `publishClaimed()`, qui refuse désormais aussi l'espace inactif : 409
   `radar.claim.space_suspended` à l'envoi du code, à la confirmation et sous
   le verrou de la reprise ; les biens restent sous mandat, en ligne. Écarté : reprendre quand même, ce
   qui sortirait les biens du public (`Property::agencyIsPublic()`) sans que l'annonceur le voie.
   Autre voie à trancher par le porteur : reprendre et laisser les biens hors ligne jusqu'au
   rétablissement.

### Suite

- `absorbOrphan()` réécrivait `user_id` journal ouvert : TCK-2439, livré dans cette branche (commit
  séparé).

### Prérequis du porteur (hors code)

- Faire relire `mandat.v2` (fr, en) par l'avocat, avec `mandat.v1`, avant d'allumer `radar_mandate`.
- Les prérequis d'ADR-0079 restent : avis de l'avocat, TCK-2422, espace des mandats désigné avec un
  administrateur principal.
- Migration à appliquer avec le déploiement : `2026_10_30_242100_add_mandate_taken_back_at_to_radar_advertisers`
  (une colonne nulle, sans réimportation).
