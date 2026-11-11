---
id: TCK-2647
title: "État des lieux au pouce : une pièce par écran, les éléments proposés, la photo prise à l'appareil, la reprise après coupure et la sortie comparée à l'entrée"
status: todo
phase: P1
family: front
estimate: L
wave: 88
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2646, TCK-2684, TCK-2687, TCK-2688, TCK-2689, TCK-2691]
blocks: [TCK-2648]
spec_refs:
  features:
    - "docs/features.md#19-état-des-lieux--inventaires"
  models:
    - "docs/models-spec.md#24-inventory-"
tags: [front, inventory, mobile, camera, audit-ux, app]
---

## Objectif utilisateur

L'agent fait l'état des lieux d'un F3 d'une main, sans taper, une pièce après l'autre :

- il photographie pendant qu'il note ;
- il sait toujours pour quel logement il travaille ;
- il reprend là où il s'était arrêté quand le réseau tombe.

En sortie, il ne note que ce qui a changé depuis l'entrée.

## Contrat de données

- `GET /api/inventory-templates?property_id=` pour les pièces et éléments proposés (TCK-2646).
- `POST /api/inventories`, à « Commencer », avec les pièces cochées et leurs éléments.
- `PATCH /api/inventories/{id}` à chaque pièce, avec tout `rooms`. Le front n'a pas aujourd'hui de hook de mise à jour.
- `POST /api/inventories/{id}/room-photos` (`room_name`, `element_label` facultatif — TCK-2646), une photo par appel, et `DELETE …/room-photos/{media}`.
- Sortie préremplie : `entry_state`, vignette d'entrée, `retention_amount` (TCK-2646).
- Contexte : `GET /api/leases/{id}?include=tenant,property`.

## Direction UX / Artistique

- **Maquette de référence** : `/fr/playground/maquettes?p=app-etats-des-lieux&a=a`.
  - C'est une **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes).
  - Écrans « Démarrer », « Une pièce » et « Sortie — comparaison », au téléphone et au bureau.
- **Démarrer** :
  - carte de contexte : bien, locataire, référence du bail, date et heure ;
  - type « entrée / sortie », **déduit du bail** (bail qui commence → entrée ; préavis ou `terminating` → sortie) et modifiable ;
  - « Modèle : F3 standard » ;
  - pièces en cases sur deux colonnes, et « + Autre pièce » ;
  - « 6 pièces · 41 éléments proposés » ;
  - bouton collé « Commencer par le Séjour ».
- **Une pièce** :
  - en-tête « Séjour · 1 / 6 » ;
  - « Prendre une photo » en premier, à l'appareil arrière, puis les vignettes de 64 px ;
  - chaque élément sur une ligne, avec des pastilles **Bon · Usé · Abîmé**, sélectionnées d'un toucher ;
  - « Manquant » reste choisissable (l'énumération a quatre valeurs) ;
  - « Abîmé » ouvre sous la ligne « Précisez » et une photo dédiée ;
  - « + Ajouter un élément », « Note de la pièce » ;
  - barre collée « Pièce suivante : Chambre 1 ».
- **Sortie** :
  - chaque élément montre « Entrée : Bon » (en gris) et sa vignette d'entrée ;
  - un changement de Bon à Abîmé est surligné et propose « Ajouter une retenue » (montant) ;
  - le total « Retenues proposées : … sur … de caution » s'affiche en fin de parcours.
- **Téléphone (360-390 px)** : un écran par pièce, la flèche de retour unique, et la progression visible.
- **Bureau (≥ 1280 px)** : deux colonnes dès `lg`. À gauche la liste des pièces avec leurs coches de progression ; à droite la pièce courante, photos en grille, éléments en tableau à pastilles. « Démarrer » en carte de 640 px.

## Contraintes strictes (métier)

**Rien ne se perd** (audit famille 4, § 4, *Fonctions existantes* 4-7, lues dans `components/inventory/*`) :

- **choix du bail** sans `?lease=` : il devient une recherche qui nomme le locataire (P2 de l'audit), et chaque bail garde « Démarrer » ;
- type, état général, date et heure de réalisation, notes générales ;
- pièces : ajouter, nommer, état général, notes, retirer ;
- éléments : nom libre, état, notes, retirer ;
- « Annuler » ;
- « Enregistrer le brouillon », qui devient « Enregistrer et quitter » ;
- photos par pièce :
  - sélection multiple ;
  - **réduction sous 5 Mo** ;
  - **envoi une par une** et reprise du reste en cas d'échec ;
  - suppression tant que l'état des lieux est un brouillon ;
- « Soumettre pour signature ».

Autres contraintes :

- **L'en-tête dit toujours le bien, le locataire et la référence du bail**, du premier au dernier écran (P1 de l'audit).
- **Photo à l'appareil** : l'entrée de fichier porte `capture="environment"` et `accept` image, comme les entrées de la maintenance.
- **Brouillon à chaque pièce** :
  - « Pièce suivante » enregistre avant de changer d'écran ;
  - un échec réseau garde la saisie à l'écran, avec « Réessayer », et ne fait pas avancer ;
  - la reprise rouvre la première pièce non terminée.
- **Chaque élément a son libellé visible**, pas seulement le premier (P3 de l'audit, `RoomEditor.tsx:174,183`). Au téléphone, l'écran dit « Touchez », jamais « Cliquez ».
- **Entrées** vers ce parcours : la fiche du bail (TCK-2645), la file « À traiter » (préavis, TCK-2644) et la fiche du bien (TCK-2639), toutes par `/app/inventories/new?lease=…&type=…`.
- **i18n** : `fr` / `en` / `wo` (le `wo` porte le texte français tel quel), vouvoiement. Les noms de pièces et d'éléments du modèle passent aussi par les messages.

## Delta à produire

- [ ] Écran « Démarrer » : contexte, type déduit, modèle, pièces.
- [ ] Écran « Une pièce » : photo d'abord, pastilles, précision et photo d'un élément abîmé, ajout, note. Enregistrement et progression.
- [ ] Reprise à la pièce en cours. Variante de sortie, avec l'état d'entrée et les retenues.
- [ ] Deux colonnes au bureau. Recherche du bail, avec le locataire nommé.
- [ ] Tests :
  - préremplissage par le modèle ;
  - un `PATCH` par pièce ;
  - reprise ;
  - `capture` présent ;
  - libellés visibles ;
  - échec réseau sans perte ;
  - sortie (états d'entrée, total des retenues).

## Critères d'acceptation

- [ ] AC1 — `/app/inventories/new?lease=22` affiche, au premier écran à 390 px et sans défiler, le bien, le locataire et la référence du bail.
- [ ] AC2 — Pour un F3, l'écran « Démarrer » coche les pièces du modèle rendu par l'API. « Commencer » envoie `POST /api/inventories` avec ces pièces et leurs éléments.
- [ ] AC3 — Qualifier les 6 éléments d'une pièce demande 6 touchers et aucune frappe clavier. « Pièce suivante » produit un `PATCH` (vu au réseau) avant l'écran suivant.
- [ ] AC4 — L'entrée photo de la pièce porte `capture="environment"`. Trois photos prises produisent trois `POST …/room-photos` successifs. Si le deuxième échoue, le troisième part quand même, et le deuxième se réessaie.
- [ ] AC5 — Quitter à la pièce 3 sur 6 puis rouvrir l'état des lieux ramène à la pièce 3, avec les pièces 1 et 2 cochées.
- [ ] AC6 — Sur une sortie d'un bail dont l'entrée est signée, chaque élément affiche son état d'entrée. Deux retenues de 35 000 F et 50 000 F donnent « Retenues proposées : 85 000 F ».
- [ ] AC7 — À 1280 px, la liste des pièces et la pièce courante sont côte à côte.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), préparation : TCK-2684 → TCK-2691) :

- [ ] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2647.json` (modèle de TCK-2684) liste chaque écran de maquette implémenté (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés (vouvoiement, renommage décidé).
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9 — [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'[ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif : une des trois exceptions d'ADR-0106 § 2, ou une donnée.
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [ ] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une (visionneuse, `l=1280`), sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.

## Hors périmètre

- Le récapitulatif, les signatures et la fiche (TCK-2648).
- La liste `/app/inventories` (non maquettée) : les lignes nommant le locataire et « ce qui reste à faire » attendent une maquette.
- La note vocale. La modification des modèles par l'agence.

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
