---
id: TCK-2656
title: "Documents : le coffre par dossier pour chaque profil, l'ajout par photo depuis le contexte, la fiche d'un document et le partage par lien"
status: todo
phase: P1
family: front
estimate: L
wave: 88
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2655, TCK-2684, TCK-2687, TCK-2688, TCK-2689, TCK-2691]
blocks: []
spec_refs:
  features:
    - "docs/features.md#110-documents--contrats"
  models:
    - "docs/models-spec.md#22-document-"
    - "docs/models-spec.md#29-documentsharelink-"
tags: [front, documents, camera, mobile, audit-ux, app]
---

## Objectif utilisateur

« Où est mon contrat ? » se règle en un toucher. Le locataire, le bailleur et le prestataire trouvent leurs documents rangés comme leur vie locative. L'agence ouvre le dossier d'un bien puis d'un bail. Une pièce d'identité s'ajoute en la photographiant et se range sans connaître aucun numéro. Ce qui expire bientôt se voit.

## Contrat de données

- `GET /api/me/document-vault` (TCK-2655) : dossiers, entrées `uploaded` / `generated`, `attachable_targets`, comptes `expiring_soon` et `unverified`.
- Agence : `GET /api/documents` avec une cible et `GET /api/documents/generated?target=` (TCK-2655), plus `filter[expiring_within_days]` et `is_verified`.
- Les endpoints existants :
  - téléversement : `DocumentUploadDialog`, 10 Mo au plus ;
  - fiche ;
  - versions : liste, téléchargement, restauration, nouvelle version avec commentaire ;
  - vérification ;
  - liens de partage : durée, téléchargements maximum, mot de passe, liste, révocation ;
  - suppression.

## Direction UX / Artistique

- **Maquette de référence** : `/fr/playground/maquettes?p=app-documents&a=a`.
  - C'est une **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes).
  - Écrans « Locataire — le coffre », « ajouter (photo ou fichier) », « nommer et ranger », « coffre encore vide », « Agence — par bien, par bail », « Fiche d'un document », « Fiche — partager par lien », « Fiche — lien copié », « Bailleur — un dossier par bien » et « Prestataire — factures et pièces ». Au téléphone et au bureau.
- **Locataire** :
  - dossier « Mon bail » : contrat et état des lieux, avec la pastille « Généré par Takussan » ;
  - « Quittances 2026 (n) », replié, avec « Tout télécharger » ;
  - « Mes pièces », avec « expire dans 42 jours » en ambre ;
  - bouton collé « Ajouter un document ».
- **Ajouter** : feuille « Prendre une photo / Choisir un fichier », puis « Nommer et ranger » :
  - nom, catégorie, expiration ;
  - « Rangé dans : Mes pièces · bail … », choisi parmi `attachable_targets`, **jamais un identifiant**.
- **Agence** :
  - recherche « Chercher un document, un locataire, un bien » ;
  - pastilles « Expire bientôt (n) », « Non vérifiés (n) » ;
  - dossiers Bien › Bail › (Contrat, États des lieux, Quittances, Pièces du locataire).
- **Bailleur** : un dossier par bien, plus « Relevés et attestations ».
- **Prestataire** : « Mes factures » et « Mes pièces ».
- **Fiche d'un document** :
  - aperçu, nom, « Vérifié ✓ · expire le … », « Rattaché à : … » ;
  - « Télécharger », « Partager » ;
  - section « Versions (n) ».
- **Partager** :
  - feuille : durée, mot de passe, téléchargements maximum ;
  - puis « Lien copié », avec la liste des liens actifs et « Révoquer ».
- **Téléphone (360-390 px)** : dossiers repliables, bouton d'ajout collé. L'appareil photo est proposé d'abord.
- **Bureau (≥ 1280 px)** : dès `lg`, l'arborescence à gauche, la liste au centre, et à droite l'aperçu avec les versions et les liens de partage.

## Contraintes strictes (métier)

**Rien ne se perd** (audit famille 4, § 6, *Fonctions existantes* 1-7, lues dans `components/documents/*`) :

- compteur, **recherche**, filtre par catégorie et par entité, pagination ;
- « Téléverser » :
  - glisser-déposer au bureau, ou sélection ;
  - taille maximale contrôlée ;
  - nom, catégorie, **date d'expiration**, rattachement, description ;
- par document : vérifié / non vérifié, versions, télécharger, partager, supprimer avec confirmation ;
- fiche : statut de vérification, version active, expiration, commentaire, retour ;
- **versions** : nouvelle version avec commentaire, restauration ;
- **lien de partage** : durée, téléchargements maximum, mot de passe, liens actifs avec leurs usages, révocation ;
- le guide `OwnerDocumentsPrimer` du bailleur, s'il reste utile au coffre ;
- l'état vide pédagogique de l'agence (exemples du métier).

Autres contraintes :

- **Appareil photo** : l'ajout au téléphone propose une entrée `capture="environment"` (image) **et** une entrée fichier. Aujourd'hui l'entrée n'a pas de `capture` (`DocumentUploadDialog.tsx:220`).
- **Rattachement sans identifiant** : les champs « type d'entité » et « identifiant » (`DocumentUploadDialog.tsx:258-274`) disparaissent de tous les profils. Le rattachement se choisit parmi les dossiers nommés. Depuis une fiche (bien, bail, client), il est prérempli et verrouillé, comme `AddDocumentButton` aujourd'hui.
- **Un document généré** se télécharge, mais ne se versionne, ne se vérifie, ne se supprime ni ne se partage par lien ([ADR-0099](../../../adr/0099-le-coffre-de-documents-la-liste-suit-la-lecture.md)). Ces gestes ne sont pas rendus pour lui.
- **États vides propres au profil** :
  - locataire : « Vos pièces, votre contrat et vos quittances apparaîtront ici » ;
  - jamais « Glissez-déposez » au téléphone ;
  - un seul bouton d'ajout.
- **L'entrée « Documents » du bailleur** dans le menu relève de la coque (famille 3) : cf. le RAPPORT.
- **i18n** : `fr` / `en` / `wo` (le `wo` porte le texte français tel quel), vouvoiement, dates relatives (« expire dans 42 jours ») par `useFormatteurs()`.

## Delta à produire

- [ ] Coffre par dossier pour le locataire, le bailleur et le prestataire.
- [ ] Vue de l'agence par bien et par bail, avec les pastilles d'expiration et de vérification.
- [ ] Ajout en deux temps : photo ou fichier, puis nommer et ranger parmi les dossiers.
- [ ] Fiche d'un document : aperçu, versions, partage en feuille, lien copié et liens actifs.
- [ ] Gestes masqués pour un document généré. États vides par profil.
- [ ] Tests :
  - coffre du locataire (contrat, quittances, état des lieux) ;
  - aucun champ d'identifiant ;
  - `capture` présent ;
  - document généré sans gestes de gestion ;
  - expiration affichée ;
  - partage : charge utile et révocation ;
  - 1280 px en trois colonnes.

## Critères d'acceptation

- [ ] AC1 — `locataire-f4` ouvre « Documents » : le dossier « Mon bail » contient le contrat, et « Quittances 2026 » compte autant d'entrées que d'échéances payées rendues par l'API. Le texte « 0 document » n'apparaît pas.
- [ ] AC2 — L'ajout au téléphone offre une entrée `capture="environment"`. Le formulaire « Nommer et ranger » ne contient aucun champ numérique d'identifiant (DOM). Le rattachement envoyé est celui du dossier choisi.
- [ ] AC3 — Sur un contrat généré, la fiche rend « Télécharger », et ni « Nouvelle version », ni « Supprimer », ni « Partager ».
- [ ] AC4 — Une pièce qui expire dans 42 jours porte « expire dans 42 jours ». La pastille « Expire bientôt » de l'agence la compte.
- [ ] AC5 — Partager avec 7 jours, un mot de passe et 3 téléchargements envoie ces trois valeurs. Le lien apparaît dans « Liens actifs », et « Révoquer » le retire.
- [ ] AC6 — À 1280 px, l'arborescence, la liste et l'aperçu sont côte à côte. À 390 px, aucune ligne ne déborde.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), préparation : TCK-2684 → TCK-2691) :

- [ ] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2656.json` (modèle de TCK-2684) liste chaque écran de maquette implémenté (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés (vouvoiement, renommage décidé).
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9 — [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'[ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif : une des trois exceptions d'ADR-0106 § 2, ou une donnée.
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [ ] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une (visionneuse, `l=1280`), sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.

## Hors périmètre

- Le dossier de location à partager (ambition).
- L'OCR, et la signature de documents autres que le bail et l'état des lieux (§1.10, P3).
- L'entrée de menu « Documents » du bailleur et du prestataire (coque, famille 3).

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_

### Lot 1 — le coffre du locataire, du bailleur et du prestataire (2026-11-13, terrain-4)

- `/app/documents` choisit sur le profil ACTIF (`EspaceDesDocuments`) : le personnel actif d'une agence garde
  la bibliothèque (vue agence : lot 4) ; tout autre profil ouvre son coffre (`GET /api/me/document-vault`).
  Rien n'est rendu tant que les profils se lisent : les deux écrans lisent deux endpoints.
- Module pur `src/lib/documents/coffre.ts` : ordre des dossiers (baux, biens, quittances de l'année récente
  à l'ancienne, relevés, factures, pièces), libellés en CLÉS (`documents.coffre.*`), nature et geste de
  chaque entrée, échéance au jour de Dakar (fenêtre de 60 jours de `Document::EXPIRING_SOON_DAYS`, bornes
  comprises, comme `counts.expiring_soon`).
- **Le titre d'une entrée générée n'est pas un libellé** (`LS-0DPA75TK`, `LPY-JMQLQ0`, `2026-10`) : le
  libellé vient de la catégorie et de la date (« Quittance d'octobre », élision en français).
- Geste : un généré se télécharge par son `download_path` ; une pièce téléversée ouvre sa fiche (son
  `download_path` est la fiche JSON, pas le fichier) ; la facture d'intervention n'a pas de PDF : aucun geste.
- Décisions, tranchées par le chef d'équipe le 2026-11-13 :
  - 1 (a) : les biens du bailleur sans document ne sont pas listés, ils se comptent (« 2 biens sans document ») ;
  - 2 (c) : pas de champ de recherche dans le coffre (aucun filtre côté API, jamais de filtre côté client). Un
    geste « Rechercher » ouvre la recherche serveur que ces profils avaient (voir « Lot 1, suite ») ;
  - 3 (a) : pas de « Tout télécharger » (aucune archive servie).
  - Suites : [TCK-2769](TCK-2769-coffre-chercher-par-le-serveur.md) (chercher dans le coffre par le serveur) et
    [TCK-2770](TCK-2770-coffre-tout-telecharger-en-archive.md) (archive .zip).
- Bureau : trois colonnes dès `xl` (1280), comme la maquette ; sous `xl`, les puces tiennent lieu
  d'arborescence et l'aperçu n'est pas rendu (les lignes font leur geste). Un dossier de plus de 4 entrées en
  montre 3, puis « Voir les N autres ».
- `OwnerDocumentsPrimer` reste à la bibliothèque : au coffre, les exemples passent dans le texte d'un dossier
  vide (« Titre foncier, assurance, mandat : … »).
- **Rien ne se perd** : la ligne de la bibliothèque offrait au locataire et au bailleur « Télécharger »,
  « Partager » et « Supprimer ». Le coffre mène chaque pièce sur sa fiche, qui n'avait que les versions :
  `GestesDuDocument` y ajoute les trois gestes, aux verdicts de l'API (`abilities.share`, `abilities.delete`),
  suppression confirmée. La **recherche** de la bibliothèque reste accessible depuis le coffre (décision 2 (c),
  « Lot 1, suite »).
- L'ajout de ce lot range dans « Mes pièces » (cible `user`) par le dialogue existant ; « Nommer et ranger »
  parmi `attachable_targets` est le lot 2.
- Fidélité : `docs/qa/audit-ux-2026-11/fidelite/TCK-2656.json` (écrans 0, 3, 8, 9) ; aucun débord de 390 à 1440.

### Lot 1, suite (2026-11-13) — « Rechercher » et le dossier en lecture seule

- **Décision 2 (c).** Le coffre d'un profil qui n'est pas du personnel porte « Rechercher » dans son en-tête,
  sauf s'il est vide. Ce geste ouvre `/app/documents?vue=recherche`. `EspaceDesDocuments` y rend, sous l'en-tête
  « Chercher un document » (le titre de la maquette, court pour la barre du haut) et un lien « Retour aux documents », la bibliothèque existante : `GET
  /api/documents`, cherchée par `filter[search]` côté serveur, les paramètres gardés dans l'URL par
  `DocumentsFilters`. Le coffre chargé n'est jamais filtré côté client.
  - ⚠ Cette recherche ne voit que les téléversements que la liste rend à l'appelant : ni les documents
    générés ni les pièces déposées par l'agence. C'est l'objet de TCK-2769.
  - La bibliothèque y est en mode `recherche` : ni ajout, ni dépôt par glisser, ni mode d'emploi du bailleur. Un
    résultat vide se dit « Aucun de vos documents ne correspond à cette recherche. », ou « Vous n’avez encore
    ajouté aucun document. » sans requête. La pagination et les filtres gardent `vue=recherche`.
  - Le personnel n'est pas concerné : sa bibliothèque porte déjà la recherche, `?vue=recherche` n'y change rien.
- **Lecture seule (TCK-2729).** `read_only` est désormais un champ toujours présent du type `DossierDuCoffre`.
  - Le dossier d'un bien d'un bailleur bloqué se lit comme les autres.
  - Le coffre le dit une fois : « Votre accès bailleur est suspendu : ces documents restent consultables, mais
    rien ne peut y être ajouté. » L'avis disparaît quand le filtre ne montre aucun dossier en lecture seule.
  - Chaque dossier figé porte aussi la marque « Lecture seule » : dans un coffre mixte, l'avis seul ne nomme pas
    lequel.
  - Sur la fiche d'une pièce figée, `abilities` est jugé par `DocumentPolicy` (`landlordWrites` écarte le
    bailleur bloqué) : ni « Nouvelle version », ni « Partager », ni « Supprimer ».
  - La pièce de ce dossier qui expire bientôt garde son alerte, sans « Remplacer ».
  - L'ajout ne vise que « Mes pièces », et l'API ne rend jamais la cible d'un dossier en lecture seule dans
    `attachable_targets`.
  - Un dossier de bien vide en lecture seule n'est pas listé (décision 1 (a)), mais il suffit à faire
    afficher l'avis.
- **Tests.**
  - `coffre.tck-2656.test.ts` : +1 test, la lecture seule et l'alerte.
  - `CoffreDeDocuments.tck-2656.test.tsx` : +3 tests, « Rechercher » et coffre vide, bailleur bloqué (avis,
    marque au téléphone et au bureau).
  - `EspaceDesDocuments.tck-2656.test.tsx` : +2 tests, `?vue=recherche` pour le locataire et pour le personnel.
  - `DocumentsLibrary.recherche.tck-2656.test.tsx` : 3 tests, le mode `recherche`.
  - Au total, 35 verts sur les cinq fichiers.
- **Ablations : 10, toutes rouges, restaurées par md5.** En plus des six ci-dessous : marque du dossier
  retirée ; ajout et état vide du mode `recherche` ; vue de recherche sans le mode.
  - lecture seule du coffre forcée à faux ;
  - « Remplacer » sans garde ;
  - avis sans filtre ;
  - « Rechercher » sur un coffre vide ;
  - vue de recherche ignorée ;
  - lecture seule d'un dossier forcée à faux.
- **Autres vérifications.** ESLint à 0 sur les fichiers touchés. `tsc` ne relève aucune erreur dans ces
  fichiers.
- **Relevé (2026-11-13).** `TCK-2656.json`, § `mesures.l1_suite` :
  - a-0, a-8 et a-9 re-relevés et comparés ; « Rechercher » est la seule ancre neuve, en écart accepté ;
  - balayage de 390 à 1440 : débord 0 ;
  - le titre « Rechercher dans mes documents » s'ellipsait à 390 dans la barre du haut : remplacé par
    « Chercher un document » ;
  - limite connue : locataire-f4 n'a rien téléversé, sa recherche est vide alors que son coffre compte 26
    documents (TCK-2769).

### Lot 2 (2026-11-13) — l'ajout en deux temps

- **Ce qui change.** L'ajout du coffre (`coffre/ajout/AjoutAuCoffre.tsx`, chargé à la première ouverture)
  remplace la boîte de dépôt de la bibliothèque, qui ne visait que « Mes pièces ».
  - Téléphone : une feuille « Prendre une photo » (`accept="image/*"`, `capture="environment"`) ou
    « Choisir un fichier ». Elle liste aussi « À renouveler », les pièces expirées ou dans la fenêtre, la
    plus pressée d'abord, avec « Remplacer » vers leur fiche. Puis l'écran plein « Ajouter un document » :
    le fichier (aperçu, « Reprendre » ou « Changer de fichier »), Nom, Catégorie, Expire le, Rangé dans,
    Précision.
  - Bureau (dès `md`) : une modale de 600 px posée à 16 pas du haut. Son corps défile entre un en-tête et
    un pied fixes. Elle offre le dépôt par glisser et « Parcourir ».
  - Un fichier de plus de 10 Mo est refusé avant tout envoi.
  - Au clavier, les tuiles, « Parcourir », « Changer de fichier » et « Reprendre » sont des boutons qui
    ouvrent les entrées de fichier cachées. « Changer » porte le focus sur le dossier coché. Les flèches
    choisissent sans refermer la liste ; Entrée ou Échap la referment et rendent le focus à « Changer ».
- **« Rangé dans ».** `lib/documents/rangement.ts` le construit à partir des seules `attachable_targets` de
  l'API.
  - Il dédoublonne et écarte les types hors du coffre et tout dossier en lecture seule.
  - Il garde un bien qui n'a pas encore de dossier.
  - La précision « Le bien » ou « Le bail LS-… de ce bien » se lit à la clé du dossier (`property:`), et non
    à la présence du dossier.
  - Par défaut : « Mes pièces ».
  - **Aucun champ d'identifiant n'est rendu** : le type et l'identifiant voyagent avec le dossier choisi
    (AC2).
- **API (additif).** `attachable_targets` porte `reference`, le `reference_number` d'un bail, `null` pour
  les autres cibles (`DocumentVault`). Un bien peut avoir plusieurs baux hors brouillon (un bail clos, le
  bail en cours), et rien d'autre ne les distinguait. `DocumentVaultOwnerTest` : +1 test (ablation rouge),
  et l'assertion exacte de la cible « pièces » prend la clé.
- **Décisions, validées par le chef d'équipe le 2026-11-13 : (a) et (a).**
  - L2-1 (a) : l'interrupteur « Remplace … » n'est pas rendu. Le remplacement est une version, portée
    par la fiche (lot 3).
  - L2-2 (a) : les pastilles sont des types de l'API (pièce d'identité, passeport, assurance, autre),
    plus « Plus de catégories ». « Justificatif de revenus » n'existe pas et n'est pas inventé.
- **Écarts de vérité.** Ni redressement, ni « Lu sur la photo », ni « Nous vous préviendrons 60 jours
  avant » (aucun rappel d'expiration de document dans l'API), ni le nom de l'agence. Détail :
  `TCK-2656.json` § `ecarts_acceptes`.
- **Suite possible, remontée au porteur par le chef d'équipe : le rappel d'expiration d'un document.**
  L'API n'en envoie aucun. `expiry_date` ne sert qu'à la marque « expire dans N jours », au compte
  `expiring_soon` et à « À renouveler », tous lus à l'ouverture du coffre : personne n'est prévenu
  60 jours avant. La maquette le promet (« Nous vous préviendrons 60 jours avant »), et la promesse est
  retirée de l'écran tant que le rappel n'existe pas.
- **Tests.**
  - `AjoutAuCoffre.tck-2656.test.tsx` : 9 tests. Ils couvrent la capture, la taille (Ko et Mo), le refus
    au-delà de 10 Mo, le dossier choisi envoyé sans champ d'identifiant, la photo non nommée, « Plus de
    catégories », les tuiles au clavier, « Changer » au clavier et la modale du bureau.
  - `rangement.tck-2656.test.ts` : 4 tests.
  - API : `DocumentVaultOwnerTest`, `DocumentVaultTenantTest` et `DocumentVaultImpersonationTest`, 13 verts.
- **Ablations : 21, toutes rouges, restaurées par md5.**
  - Front, 20 : sans `capture` ; choix du dossier ignoré ; sans contrôle de taille ; photo nommée d'après
    le fichier ; dépôt muet ; pastille muette ; « Remplacer » sans lien ; flèches qui referment ; sans
    focus dans la liste ; taille toujours en Mo ; tuile muette ; numéro de bail non affiché ; Entrée qui
    ne replie pas ; « À renouveler » hors lecture seule ; cibles en lecture seule gardées ; sans
    dédoublonnage ; défaut sur la première cible ; types hors du coffre gardés ; précision lue à la
    présence du dossier ; numéro ignoré.
  - API, 1 : `reference` à `null`.
- **Relevé (2026-11-13), sur l'état final.** a-1 et a-2, avec `--perturber`, à 390, 1440 et 1280. Les
  chiffres et leur lecture sont dans `TCK-2656.json` § `mesures.l2`. La modale est contrôlée formulaire
  déplié à 1280 et 1024 : son pied reste visible et son corps défile.

### Lot 3 (2026-11-13) — la fiche d'un document, le partage par lien

- **Ce qui change.** `/app/documents/{id}` suit `FicheMobile` / `FicheBureau` de la maquette.
  - Téléphone : l'en-tête dit « Document » ; l'aperçu bord à bord, puis le nom (titre de la page), ses
    marques (« Vérifié » ou « Non vérifié », l'échéance du coffre : « expire dans 42 jours »…), la carte
    des métadonnées, « Versions (n) », « Liens de partage (n) », « Supprimer ce document » ; la barre
    collante « Télécharger » / « Partager ».
  - Bureau : l'en-tête de page (fil « Documents › nom », nom, marques, « … », « Télécharger »,
    « Partager »), puis dès `xl` l'aperçu (520 px de haut, légende « Version n · JPG · 2,4 Mo · ajoutée
    le … ») à gauche et une colonne de 400 px à droite. Sous `xl`, la colonne passe sous l'aperçu.
  - Aperçu : l'image elle-même quand le fichier en est une (URL signée servie `inline`), une tuile
    « Fichier PDF » sinon, et la tuile aussi quand l'image ne se charge pas (HEIC, URL expirée).
- **Partager** (`fiche/PartageDuDocument.tsx`). Une feuille du bas au téléphone, une carte flottante de
  400 px sous « Partager » au bureau.
  - « Le lien expire dans » (1 heure, 24 heures, 7 jours — coché —, 30 jours), « Téléchargements au
    plus » (3 par défaut ; « − » depuis 1 donne « Sans limite »), « Protéger par un mot de passe »
    (interrupteur, puis le champ et « À donner de vive voix… »). Allumé, il exige 4 caractères
    (`min:4` de l'API) : rien ne part avant. Éteint, aucun mot de passe ne part, même saisi.
  - « Créer le lien et le copier » : « Lien copié » seulement si `navigator.clipboard.writeText` a
    réussi ; sinon « Lien créé » et le bouton « Copier le lien ». L'adresse (page de réception,
    `buildShareUrl`, désormais dans `lib/documents/partage.ts` et partagé avec `DocumentShareDialog`),
    « Valable jusqu’au … · 3 téléchargements au plus · protégé par mot de passe. », « Envoyer par
    WhatsApp » (le lien, jamais le mot de passe), « Révoquer ce lien ».
  - « Liens de partage (n) » : les liens ACTIFS que l'API rend (`GET /api/documents/{id}/share-links`,
    nouveau `useShareLinks`), lus seulement avec `abilities.share` ; un lien créé y entre aussitôt
    (« Créé à l’instant par vous », sur fond vert), un lien révoqué en sort aussitôt, puis la liste se
    relit (invalidation de `['documents', 'share-links']` par la création et la révocation). Chaque
    ligne : « Créé le 5 nov. », « Expire dans 2 jours · mot de passe » (aujourd'hui à HH:MM, dans N
    jours jusqu'à 7, puis la date ; jours de Dakar), « 1 téléchargement sur 3 », « Révoquer ».
- **Versions** (`fiche/VersionsDuDocument.tsx`, remplace l'accordéon `DocumentVersionsList`). « Version
  n », « Actuelle », le commentaire, « Vous · date » ou la date seule, « Télécharger la version n »,
  « Restaurer » (confirmé) et « Ajouter une version ».
  - **« Ajouter une version » porte « Expire le », prérempli de l'échéance actuelle** (validé par le chef
    d'équipe). `DocumentVersionService::uploadVersion` pose l'échéance envoyée et VIDE l'ancienne quand la
    requête n'en porte pas (TCK-2300) : le formulaire d'avant, sans ce champ, effaçait en silence
    l'échéance de toute pièce renouvelée. L'aide le dit : « Reprise de l’échéance actuelle : changez-la si
    le nouveau fichier en a une autre. Laissée vide, le document n’en a plus. »
  - **Pas d'« Ajouter une version » sur une pièce de profil** (`id_card`, `rib`, `ninea` rattachés à un
    `…Profile`) : l'API la refuse en 422 (`document.profile_piece_not_versioned`). `seVersionne()`.
- **Supprimer** : « Supprimer ce document » (téléphone) ou « … › Supprimer » (bureau), confirmé, au seul
  `abilities.delete`, puis retour aux documents.
- **Fichiers retirés** : `GestesDuDocument.tsx` (lot 1) et `DocumentVersionsList.tsx` (TCK-097), avec
  leurs tests. La fiche sert aussi le personnel de l'agence : chaque cas est repris un pour un, même
  scénario.
  - `GestesDuDocument.tck-2656` → `DocumentDetailClient.abilities` : lecteur sans droit (télécharge, rien
    d'autre), auteur (partage, suppression confirmée, retour aux documents), sans fichier ni droit (aucun
    geste, aucune barre collante).
  - `DocumentVersionsList.rejet-rattrape.p210-04` → `VersionsDuDocument.tck-2656` : ajout de version
    refusé et restauration refusée, rejets rattrapés, boîte ouverte.
- **Tests.**
  - `partage.tck-2656` (9) et `fiche.tck-2656` (4) : modules purs.
  - `PartageDuDocument.tck-2656` (8) : AC5 (7 jours, mot de passe, 3 téléchargements envoyés ; le lien
    dans la liste ; « Révoquer » l'en retire), mot de passe vide ou court, presse-papiers refusé, WhatsApp
    sans mot de passe, « Révoquer ce lien », ligne d'un lien lu, « Sans limite », carte du bureau.
  - `VersionsDuDocument.tck-2656` (6) et `DocumentDetailClient.abilities` (10).
  - Dossiers entiers `src/components/documents` et `src/lib/documents` : 17 fichiers, 118 verts.
- **Ablations : 30, toutes rouges, restaurées par md5.** La première passe en laissait une verte (la borne
  « aujourd'hui » / « dans 1 jour ») : un cas ajouté la ferme. Les six dernières visent les cas les plus
  risqués pour le personnel : rejet d'ajout et de restauration non rattrapé ; partage, suppression et
  restauration ouverts sans le verdict de l'API.
- **Décisions, tranchées par le chef d'équipe le 2026-11-13 : (a) partout.**
  - L3-1 (a) : les lignes de nom sont absentes, « vous » quand l'identifiant est celui de l'appelant ; elles
    sont construites par les données. Montrer un nom à un locataire ou à un bailleur est une question de
    visibilité : suite [TCK-2773](TCK-2773-fiche-document-noms-des-auteurs-par-acteur.md).
  - L3-2 (a) : 1 heure et « sans limite » restent (sinon, une régression) ; le compteur peut valoir « Sans
    limite ».
  - L3-3 (a) : le menu « … » du bureau ne porte que « Supprimer » (aucune route de renommage) ; l'action
    destructive reste derrière un clic de plus.
  - L3-4 (a) : `DocumentShareDialog` (bibliothèque du personnel) reste inchangée jusqu'au lot 4 ; seule
    `buildShareUrl` en est extraite et partagée. Son test (`DocumentShareDialog.url`) reste vert, intact.
- **Écarts « donnée »** : l'API ne sert aucun nom (auteur, vérificateur, auteur d'une version, créateur
  d'un lien) ni l'entité de rattachement : « Rattaché à », « Bien », « Ajouté par Ousmane Niang »,
  « Vérifié par Awa Diop », « Créé … par Sokhna Sène » ne sont pas rendus ; « vous » quand c'est
  l'appelant, la date seule sinon. Fil « Documents › nom » (Bien › Bail : lot 4).
- **Relevé (2026-11-13), sur l'état final**, agent de la démo, document 82 : a-5 et a-6 à 390, 1440 et
  1280 ; balayage de 360 à 1440, débord 0. Chiffres et lecture : `TCK-2656.json` § `mesures.l3`. a-7 (lien
  copié) suit un POST et n'est éprouvé qu'en vitest.
