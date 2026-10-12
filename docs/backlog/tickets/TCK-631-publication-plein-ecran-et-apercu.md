---
id: TCK-631
title: "Publier un bien : le parcours sort du tableau de bord (une question par écran) et montre l'annonce qui se construit à côté — la piste 6 des maquettes"
status: done
phase: P1
family: front
estimate: M
wave: null
created: 2026-10-10
updated: 2026-10-11
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#11-gestion-des-biens
  models: []
tags: [front, publication, parcours, apercu, responsive, ux]
---

## Objectif utilisateur

- **Celui qui publie un bien** (particulier, bailleur, agent) répond à une question par écran,
  sans le menu ni la messagerie autour, et voit l'annonce se remplir à chaque réponse, telle que
  les visiteurs la verront.

## Contexte

Relevé du porteur sur `/app/properties/new` (preview, 2026-10-10) et maquettes comparées sur le
canevas « Publier un bien — 6 pistes ». Le porteur a retenu la **piste 6**, qui combine la piste 1
(plein écran, une question à la fois) et la piste 2 (aperçu en direct).

Défauts de l'écran actuel que la piste corrige :

- « Publier un bien » était dit trois fois (menu, titre de page, titre d'étape).
- La progression était affichée deux fois (rail d'étapes et barre « Étape 1 sur 6 »).
- Les seize types de bien avaient tous le même poids.
- Vente ou location, le choix qui décide de tout, venait en second.
- « Continuer » prenait toute la largeur, loin du retour.
- La bulle « Messagerie » se posait sur le formulaire.
- « Reprendre plus tard » ne disait pas que le brouillon s'enregistre déjà.
- On ne voyait jamais l'annonce.

## Décision

**Plein écran.** Sur `/app/properties/new`, `AppShell` ne rend ni la barre du haut ni la barre
latérale. Les bandeaux (impersonation, agence suspendue, bandeaux du site) restent, et la bulle
de messagerie n'est pas montée. La liste des routes concernées vit dans un seul module, que
`AppShell` et `ChatWidget` lisent.

**En-tête du parcours.**
- La marque, puis « Publier un bien » ou « Proposer un bien ».
- L'état du brouillon (« Enregistrement… » / « Brouillon enregistré »).
- « Enregistrer et quitter », qui remplace « Reprendre plus tard » ; même geste, TCK-465.

**Six écrans, trois parties.**
- Le bien (bien, lieu), les détails (caractéristiques, prix), l'annonce (photos, titre).
- Le titre de l'étape devient le `h1` de la route, précédé de « Partie N sur 3 · … ».
- La barre de progression garde la sémantique `progressbar` sur six étapes. Elle se dessine en
  trois segments.

**Pied.** « Précédent » à gauche (le libellé existant, gardé), « Plus tard » et « Continuer » à droite, dans le pied fixe (AC9 de
TCK-464 inchangée). La flèche de retour du haut disparaît.

**Étape 1.**
- « Vous souhaitez » vient d'abord : Louer ou Vendre, en grandes cartes avec une ligne
  d'explication.
- Puis les neuf types les plus courants en tuiles. Les sept autres apparaissent derrière « Plus
  de types (7) », qui s'ouvre d'office si le type retenu (brouillon repris) en fait partie.
- La sémantique reste celle d'un groupe de radios à tabulation itinérante (`ChoiceChips`,
  `radioGroup`). Seule la forme change (`variant`).

**L'aperçu.**
- Sur ordinateur (`lg`), une colonne de droite présente une carte au format de
  `PropertyCardStandard` :
  - la première photo choisie, sinon un repère ;
  - le badge du contrat ;
  - le titre saisi, sinon le titre proposé (`suggestTitle`) ;
  - le lieu, les chiffres, le prix et sa période.
- La colonne porte aussi une liste « Pour publier » des six étapes, avec les franchies, la
  courante et la facultative. Une étape franchie s'y rouvre d'un geste, comme dans l'ancien rail.
- Sous `lg`, l'aperçu devient une barre sous l'en-tête (type, lieu, prix), et « Aperçu » ouvre la
  carte complète dans un tiroir.

**Le coût d'entrée.** L'aperçu en liste les composantes (mois d'avance, de caution, de frais,
charges). Il n'affiche **pas de total** : la formule et son arrondi n'existent qu'à un endroit, côté
API (`CoutDEntree`, TCK-598 : « aucun écran ne refait l'addition »). Le total reste celui de la
fiche publiée.

## Critères d'acceptation

- [x] Sur `/app/properties/new`, ni la barre du haut, ni la barre latérale, ni le lanceur
      « Messagerie » ne sont rendus. Sur `/app/properties`, ils le sont.
- [x] Le titre de l'étape est le seul `h1`, précédé de la partie (« Partie 1 sur 3 · Le bien »).
- [x] À l'étape 1, le contrat précède le type. Neuf types sont visibles et « Plus de types (7) »
      montre les sept autres. Un brouillon repris sur un type caché l'affiche ouvert.
- [x] Type et contrat restent des groupes de radios : un seul arrêt de tabulation, les flèches
      sélectionnent, et le nom de « Vendre » est « Vendre » (la ligne d'explication est une
      description).
- [x] L'aperçu suit le formulaire : un clic sur « Vendre » y change le badge, une ville saisie y
      apparaît, et un prix aussi, avec sa période en location.
- [x] Sous `lg`, la barre d'aperçu ouvre un tiroir qui contient la carte.
- [x] L'en-tête dit « Brouillon enregistré » après une écriture réussie. « Enregistrer et quitter »
      garde le contrat de TCK-465 (pas de départ sur une écriture refusée).
- [x] Le pied reste hors de la zone qui défile (AC9), avec « Précédent » et « Continuer ».
- [x] Les clés neuves existent en `fr`, `en` et `wo` (`npm run check:i18n`).
- [x] Au navigateur, à 390, 768 et 1366 px : aucun défilement horizontal du document, et le
      pied toujours visible.

## Hors périmètre

- Le total du coût d'entrée dans l'aperçu (il demanderait un calcul exposé par l'API).
- La page d'édition (`PropertyForm`), qui garde sa mise en page.
