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

**2026-11-13 — terrain-8 (front), back-4 (delta API).**

**Prémisse re-mesurée.** Les dépendances (TCK-2646, 2684, 2687, 2688, 2689, 2691) sont livrées. Le contrat de l'API ne permettait pas deux critères :

- `rooms.*.elements.*.state` était exigé, donc aucun élément ne pouvait rester non qualifié (AC3) ;
- `rooms.*.completed` n'avait pas de règle, et `validated()` le retirait (AC5).

Delta API validé par team-lead, écrit par back-4 et commité avant le front :

- `state` nullable dans les deux requêtes ;
- `submit` rend 422 `inventory.unqualified_elements` tant qu'un élément n'a pas d'état ;
- `rooms.*.completed` en `nullable|boolean`.

**Écrans** (`takussan-web/src/components/inventory/terrain/`) :

- `Demarrer` (a-0) et `ParcoursDeTerrain` (a-1, a-3) ; la page `[id]` passe par `EcranDUnePiece`.
- Règles sans écran dans `parcours.ts`.
- `useFileDePhotos` : file d'envoi une par une.
- `InventoryForm` et `RoomEditor` sont retirés : leurs fonctions vivent dans les feuilles de l'élément et de la pièce.

**Décisions validées par team-lead :**

- `general_condition` et `rooms.*.condition` valent `good` par défaut ; ils se saisissent au récapitulatif (TCK-2648).
- Deux colonnes dès **`xl`**, et non `lg` comme l'écrit la direction UX : à 1024, la largeur utile (694 px) ne tient pas la liste de 320 px et le tableau à pastilles.
- Pas de dictionnaire front pour les modèles : l'API rend les noms de pièces et d'éléments dans la langue de la requête (TCK-2646).
- La fiche de fidélité couvre a-0, a-1 et a-3 ; a-2 relève de TCK-2648.

**Pièges payés :**

- **La reprise ne s'ouvre que sur `completed: false` explicite**, ou sur `?piece=N` (« Revoir les pièces »). Un brouillon antérieur, dont les pièces n'ont pas la clé, garde la page de relecture : sinon un serveur qui perdrait la clé rouvrirait la pièce 1 sans fin.
- **L'API n'accepte une photo que pour une pièce et un élément déjà enregistrés** (`UploadRoomPhotosInventoryRequest`, `Rule::in`). La file enregistre donc les pièces avant chaque passage quand elles ont changé ; sans cela, une 422 passait pour une panne réseau.
- **Un 4xx est un refus**, dit à l'écran, jamais une attente du réseau.
- **« Terminer » et « Enregistrer et quitter » ne partent pas avec des photos en attente** : la file vit dans l'écran.
- `requete()` ne s'interpole que dans `cheminApi` : un gabarit nu envoie `[object Object]`, et tsc ne le voit pas.
- Les valeurs de l'énumération (`usé`, `endommagé`) passent par des constantes (`ETAT_*` dans `parcours.ts`) : le scan i18n les lit comme du texte en dur.
- La flèche de retour de l'en-tête de pièce est `BoutonFlecheDeRetour` (TCK-2617).

**Tests.** 50 tests TCK-2647 : `parcours`, `Demarrer`, `ParcoursDeTerrain`, `InventoryDetail.terrain`. 27 ablations, toutes tuées. Deux tests existants retouchés : `code-mort.tck-917` (`useUpdateInventory` revient avec un appelant) et `parametre-de-bail` (le mock vise `Demarrer`).

**Fidélité** (`docs/qa/audit-ux-2026-11/fidelite/TCK-2647.json`, 12 écarts acceptés motivés). La démo n'a aucun brouillon : a-1 et a-3 doublent en GET la seule lecture cliente d'un état des lieux existant. Résultats en conformes · écarts · absents (% de pixels) :

| Écran | Téléphone | Bureau 1440 | Bureau 1280 |
|---|---|---|---|
| a-0, avant | 1 · 5 · 41 (28,97 %) | 28 · 115 · 54 (10,04 %) | 28 · 115 · 54 (11,32 %) |
| a-0, après | 18 · 11 · 8 (3,59 %) | 41 · 127 · 21 (5,1 %) | 41 · 127 · 21 (5,74 %) |
| a-1 | 20 · 29 · 7 (9,49 %) | 58 · 191 · 25 (9,19 %) | 58 · 191 · 25 (8,7 %) |
| a-3 | 12 · 25 · 7 (6,64 %) | 46 · 186 · 28 (9,05 %) | 47 · 185 · 28 (11,79 %) |

Le reste des écarts vient de la coque, des données de démo (bien, locataire, photos absentes) et des fonctions ajoutées. Balayage 390/768/1024/1280/1440 sur les trois routes : aucun débord, aucune coupe.

### Delta API (2026-11-13, back-4)

- **`rooms.*.elements.*.state` nullable** dans `InventoryStoreRequest` et `InventoryUpdateRequest`. L'énumération juge toujours une valeur non nulle.
  - Ces deux requêtes ne visent que des brouillons : la création n'en fait que des brouillons, et la mise à jour refuse tout autre statut dans `InventoryService::update()` (`assertDraft`).
  - Un élément peut aussi être envoyé sans clé `state`. Il est alors stocké sans elle et compte comme non qualifié.
- **Soumission** : `InventoryService::submit()` rend 422 `inventory.unqualified_elements` tant qu'un élément a un état nul ou absent. Le libellé existe en fr, en et wo (wo = fr), et LangGroupParity est vert.
- **`rooms.*.completed`** (`nullable|boolean`) dans les deux requêtes : stocké dans le JSON `rooms` et rendu tel quel par `InventoryResource`. Un non-booléen rend 422.
- **Lecteurs de `state`** vérifiés sur un état nul ou absent :
  - reprise de la sortie (`InventoryExitPrefill::roomsFrom` / `attach`) ;
  - PDF (`report.blade.php`, « — ») ;
  - ressource ;
  - retenues : `InventoryRetention` ne lit pas `state`.
- **Épinglé par** `tests/Feature/Api/InventoryPieceParPieceTest.php` (5 tests).
- **Ablations, toutes rouges :**
  - `state` requis à la création ; `state` requis à la mise à jour ;
  - sans le refus de soumission ;
  - `completed` retiré de la création ; `completed` retiré de la mise à jour ;
  - le PDF sans repli « — » ;
  - la reprise sans `?? null`.

### Reprise après la contre-vérification de 065941306 (2026-11-13, terrain-8)

- **r1, perte de photo** : `useFileDePhotos` jugeait l'enregistrement des pièces en tête d'un passage seulement, dans la version du rendu où le passage était né. La photo d'un élément ajouté pendant qu'une autre était en vol partait sans `PATCH`, l'API la refusait (422), et elle quittait la file. Désormais, `avantEnvoi` est lu par une ref mise à jour à chaque rendu et court avant CHAQUE photo, réessais compris.
- **q3** : un 401 n'est plus un refus. La photo reste dans la file et attend la reconnexion.
- **q4** : `?piece=` ne s'entend que comme un entier de [1, n]. `?piece=2.5` rendait un écran vide ; il reprend désormais à la première pièce non terminée.
- **q2** : tant qu'une photo n'est pas partie, quitter la page (rechargement, onglet fermé) demande confirmation (`beforeunload`).
  - **Écart** : la navigation DANS l'application n'est pas gardée. « Terminer » et « Enregistrer et quitter » vident la file avant de partir, mais un lien du menu ne la vide pas.
- **q1** : le parcours ne demande plus le locataire du bail (`include=property` seul). Il le nomme depuis l'état des lieux (`tenant.full_name`).
  - **Écart** : `GET /api/leases/{id}` sert l'include `tenant` entier, téléphone et e-mail compris, sans égard aux `fields`. « Démarrer », qui précède tout état des lieux, le charge encore. Corriger cela demande un changement de l'API.

