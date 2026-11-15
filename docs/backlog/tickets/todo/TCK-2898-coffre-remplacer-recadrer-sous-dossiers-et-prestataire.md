---
id: TCK-2898
title: "Coffre de documents : « Remplace la carte qui expire » et la photo recadrée à l'ajout, le sous-dossier du bail chez le bailleur, « Devis et rapports » et le PDF des factures chez le prestataire"
status: todo
phase: P2
family: front
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: [TCK-2897]
blocks: []
spec_refs:
  features:
    - "docs/features.md#110-documents--contrats"
  models:
    - "docs/models-spec.md#22-document-"
tags: [front, documents, coffre, bailleur, prestataire, locataire, audit-ux, app]
---

## Objectif utilisateur

Le locataire qui photographie sa nouvelle carte d'identité remplace l'ancienne d'un geste, avec une photo droite et recadrée ; le bailleur trouve le bail de sa locataire rangé sous le bien ; le prestataire retrouve devis, rapports et factures en PDF.

## Contrat de données

- Sous-dossier de bail (bailleur), dossier « Devis et rapports » et PDF de facture (prestataire) : TCK-2897.
- Remplacer : `POST documents/{document}/versions` existe (versions, TCK-2656 lot 3) — aucun endpoint neuf.
- Recadrage et redressement : dans le navigateur, avant l'envoi ; le fichier envoyé est l'image recadrée (bornes de taille actuelles).

Audit (`audit-f4-patrimoine.md`, app-documents) :

- **e0** : fin de ligne = chevron au lieu de l'icône Télécharger (« écart accepté »).
- **e1** : « Redressée et recadrée » non tenu (aucun redressement) ; « À renouveler » rendu seulement s'il y a une pièce à échéance — à vérifier au navigateur.
- **e2** : interrupteur « Remplace la carte qui expire » absent (décision L2-1 (a) de TCK-2656 : le remplacement passe par la fiche).
- **e8** : sous-dossier « Bail de … » dans le dossier du bien absent ; « Relevés et factures » de la maquette rendu en deux dossiers (« Relevés et attestations », « Mes factures ») ; biens sans document comptés et non listés (décision 1 a de TCK-2656).
- **e9** : « Devis et rapports » absent ; factures sans geste de fin de ligne ; variante jamais relevée sur un vrai profil prestataire.

## Direction UX / Artistique

**Référence de fidélité** : page `app-documents`, approche `a`, fichiers `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-documents-a.tsx` et `app-documents-pieces.tsx` :

- **e0 « Locataire — le coffre »** (téléphone et bureau) : l'icône Télécharger en fin de ligne d'un document, qui télécharge sans ouvrir la fiche.
- **e1 « Locataire — ajouter »** (`MobileAjouter`, l. 152-226 ; bureau `BureauAjouter`) : la tuile « Prendre une photo — Redressée et recadrée toute seule » ; après la prise, l'aperçu « Photo nette, recadrée » (l. 244) avec « Changer ». Téléphone : redressement et recadrage proposés après la prise (coins ajustables, rotation) ; bureau : même étape dans la modale.
- **e2 « Locataire — nommer et ranger »** (`Remplace`, l. 216-226) : quand une pièce du même genre expire bientôt, l'interrupteur « Remplace la carte qui expire — L'ancienne reste dans les versions », activé par défaut — téléphone et bureau.
- **e8 « Bailleur — un dossier par bien »** (`COFFRE_BAILLEUR`, `app-documents-pieces.tsx` l. 100-130) : dans le dossier du bien, la ligne de dossier « Bail de Fatou Kiné Diallo — Contrat, état des lieux · 2 documents » ; le dossier « Relevés et factures » (relevés mensuels, « Factures d'intervention 2026 — 9 factures · 1 521 000 F ») ; chaque bien listé, même vide.
- **e9 « Prestataire — factures et pièces »** (`PUCES_PRESTATAIRE`, l. 907 ; arbre l. 932) : puces « Tout · Factures · Devis et rapports · Mes pièces » comptées au téléphone ; le dossier « Devis et rapports » (replié « 1 devis · 12 rapports de fin d'intervention ») ; chaque facture avec son geste Télécharger (PDF).

## Contraintes strictes (métier)

- Remplacer = **nouvelle version** du document qui expire (l'ancienne reste dans les versions), jamais un second document ; interrupteur désactivé → un document neuf, comme aujourd'hui.
- Un document généré n'a ni versions ni remplacement (ADR-0099 § 3).
- Lister chaque bien du bailleur, même sans document, **renverse la décision 1 a de TCK-2656** : le faire ici, avec un état « Aucun document » par bien.
- Libellés neufs en `fr`/`en`/`wo`, `wo` = le texte français tel quel.

## Delta à produire

- [ ] Ligne du coffre : icône Télécharger en fin de ligne (téléphone et bureau).
- [ ] Ajout par photo : étape de redressement / recadrage (coins, rotation), image recadrée envoyée.
- [ ] « Nommer et ranger » : interrupteur « Remplace la carte qui expire » quand une pièce du même genre expire dans la fenêtre de 60 jours ; activé → nouvelle version.
- [ ] Bailleur : sous-dossier de bail dans le dossier du bien ; « Relevés et factures » en un dossier ; biens vides listés.
- [ ] Prestataire : puces comptées, dossier « Devis et rapports », Télécharger le PDF d'une facture.
- [ ] Mettre à jour `TCK-2656.json` (a-8, a-9, L2-1, e0) : ces écarts disparaissent.
- [ ] Tests : remplacement → `POST documents/{id}/versions` et non `POST documents` ; recadrage envoie une image aux nouvelles dimensions ; sous-dossier rendu depuis la réponse ; « Devis et rapports » ; geste Télécharger d'une facture vers `…/pdf`.

## Critères d'acceptation

- [ ] AC1 — Chez un locataire dont la carte d'identité expire dans 42 jours, ajouter une nouvelle photo de carte d'identité avec « Remplace la carte qui expire » activé envoie `POST /api/documents/{id de l'ancienne}/versions` ; le coffre compte toujours une seule carte d'identité, dont la fiche montre 2 versions.
- [ ] AC2 — Le même ajout avec l'interrupteur désactivé envoie `POST /api/documents` (deux documents).
- [ ] AC3 — Sans pièce du même genre qui expire, l'interrupteur n'est pas rendu.
- [ ] AC4 — Après la prise de photo, l'utilisateur peut tourner l'image d'un quart de tour et déplacer un coin ; le fichier envoyé a les dimensions du recadrage choisi.
- [ ] AC5 — Chez un bailleur, le dossier du bien rend une ligne de sous-dossier « Bail de <locataire> » qui s'ouvre sur le contrat ; un bien sans document est listé avec « Aucun document ».
- [ ] AC6 — Chez un bailleur, les relevés et les factures d'intervention sont dans un seul dossier « Relevés et factures ».
- [ ] AC7 — Chez un prestataire, la puce « Devis et rapports » porte le compte servi et filtre sur ce dossier ; le geste Télécharger d'une facture appelle `GET /api/service-provider-bills/{id}/pdf`.
- [ ] AC8 — Chaque ligne de document téléversé ou généré du coffre porte un bouton « Télécharger » en fin de ligne, distinct de l'ouverture de la fiche.
- [ ] AC9 — Vérifier au navigateur, avec un vrai profil prestataire actif, que « Mes factures », « Devis et rapports » et « Mes pièces » sont rendus ; avec une pièce qui expire dans 60 jours, que « À renouveler » apparaît dans la feuille d'ajout (e1) ; corriger si absent.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)) — fiche : `docs/qa/audit-ux-2026-11/fidelite/TCK-2656.json` (écrans e0, e1, e2, e8, e9) :

- [ ] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2656.json` (écrans e0, e1, e2, e8, e9) liste chaque écran de maquette implémenté par ce ticket (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés ; les écarts que ce ticket lève en sont retirés.
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'ADR-0106 § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif (une des trois exceptions d'ADR-0106 § 2, ou une donnée).
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [ ] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une, sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.

## Hors périmètre

- La lecture de la date d'expiration sur la photo (« Lu sur la photo », TCK-2899).
- La vue de l'agence (TCK-2896).

## Notes d'implémentation

**2026-11-15 — implémentation (agent, vague 92).** [ADR-0099](../../../adr/0099-le-coffre-de-documents-la-liste-suit-la-lecture.md) amendé (§ « Relevés et factures » du bailleur, ses biens vides, le remplacement d'une pièce).

**Prémisses re-mesurées** :
- e8 « deux dossiers » : FAUX. Le bailleur n'a jamais eu « Mes factures » (`addBills` ne tourne que sous profil prestataire) : son coffre n'avait AUCUNE facture. AC6 demandait donc une tranche d'API, faite ici (aucun agent en cours ne tenait `DocumentVault`/`ArchiveDuCoffre`).
- `GET /api/documents/{id}` rend `file_url` (URL signée 30 min, `media/{id}/file`) ; sur un disque distant cette route REDIRIGE vers une URL présignée du seau (`PrivateMediaAccess::redirect`) : un `fetch` en blob y échouerait (CORS du seau). Le téléchargement d'une pièce en fin de ligne ouvre donc cette URL dans un onglet, comme « Télécharger » de la fiche.
- AC1 « la fiche montre 2 versions » était FAUX à l'API : le fichier d'origine vit dans la collection `file`, la liste des versions ne lit que `versions` — après un remplacement, une seule version était listée et l'original ne se lisait plus nulle part. Corrigé ici : `DocumentVersionService::uploadVersion` copie l'original en version 1 (inactive, auteur = `uploaded_by`) au premier remplacement ; `NomsDesAuteursParActeurTest` adapté (une version de plus, celle de l'agent), test neuf dans `DocumentVersionTest`.
- `DocumentVersionService::uploadVersion` refuse une pièce KYC posée sur un PROFIL (422 `document.profile_piece_not_versioned`) : « Remplace » ne la propose pas.
- `vide.quotes_reports` manquait (le dossier existe même vide : clé brute affichée) — ajoutée.

**Choix (décisions mineures tranchées)** :
- **AC6 (API)** : `DocumentVault::addChargedBills` range dans `statements` les factures refacturées au bailleur — exactement la branche « bailleur du bien » de `downloadPdf` (ses biens de l'agence active, `chargedToLandlord()`) —, une requête, dossier créé dès la première entrée ; `ArchiveDuCoffre` sait rendre `service-provider-bills.pdf` (`ServiceProviderBillPdfController::rendre`, extrait). Libellé `dossiers.releves` = « Relevés et factures ». Une ligne par facture (pas de ligne groupée « 9 factures · 1 521 000 F » : aucun PDF groupé n'existe) — écart écrit dans la fiche.
- **AC5** : la liste reste plate (`DossierVu.parent`) ; l'écran rend la ligne « Bail de {locataire} — Contrat, état des lieux · N documents » DANS le dossier du bien, repliée, qui s'ouvre en retrait ; ni puce ni entrée d'arbre pour un sous-dossier ; le bien compte ses documents + ceux de ses baux. Chaque bien listé, vide → « Aucun document » (décision 1 (a) renversée, `biensSansDocument` retiré). Recherche : `voirLesTrouvees(…, coffre.folders)` rend `parent`, un bail trouvé chez le bailleur se nomme « Bail de … », jamais « Mon bail » ; `nombreDeBauxDuLocataire` exclut les sous-dossiers (était faux dans `rangement.ts` et `CoffreDeDocuments`). « Rangé dans » d'un sous-dossier : précision « {bien} · bail {réf} ».
- **AC6 (écran)** : le résumé replié de « Relevés et factures » dit les mois des relevés puis « N factures » (un mois seul ne distinguait pas une facture d'un relevé).
- Puces et arborescence comptent le coffre entier, quel que soit le filtre (« Expire bientôt » faisait baisser le compte d'un bien qui a des baux).
- **AC7** : « Devis et rapports » s'ouvre replié (« 1 devis · 12 rapports de fin d'intervention »), puces existantes (comptées).
- **AC8 / e0** : téléphone — généré : la ligne entière télécharge ; pièce : la ligne ouvre la fiche, un bouton « Télécharger : {nom} » À CÔTÉ (jamais imbriqué) ouvre le fichier (`useTelechargementDuCoffre` : onglet ouvert AU CLIC contre le bloqueur de fenêtres, fiche lue au geste, `file_url`, onglet refermé si la pièce n'a pas de fichier). Bureau — chaque ligne finit par « Télécharger » ; l'ouverture de la fiche reste dans l'aperçu (« Ouvrir la fiche », plus un bouton Télécharger).
- **AC4 / e1** : étape « Redresser et recadrer » pour TOUTE image que le navigateur décode (`createImageBitmap`) — photo au téléphone, fichier au bureau dans la modale ; non décodable (HEIC hors Safari, jsdom) → l'original part sans étape. Quarts de tour + cadre rectangulaire à 4 coins (doigt/souris par capture de pointeur, flèches du clavier, pas 2 %) ; pas de correction de perspective. Rien changé → original envoyé sans réencodage ; sinon JPEG 0,9, nom `.jpg`, borne 10 Mo rejugée après. Échec du dessin → original. `createImageBitmap(…, { imageOrientation: 'from-image' })` : l'orientation EXIF appliquée comme par l'`<img>` de l'éditeur. Géométrie pure dans `lib/documents/recadrage.ts`. Tuile : « Redressée et recadrée avant l'envoi » (pas « toute seule » : aucun détecteur de bords). Le fichier recadré se nomme « Photo recadrée » ; la lecture MRZ (TCK-2899) lit l'image recadrée.
- **AC1-3 / e2** : `pieceARemplacer` = une pièce de « À renouveler » (fenêtre 60 j, aujourd'hui ou DÉJÀ expirée) de la catégorie choisie, hors lecture seule, hors pièce KYC sur profil ; la plus pressée. Interrupteur (`Switch`) activé par défaut, libellé par catégorie (carte / passeport / pièce). Activé → `POST documents/{id}/versions` avec l'échéance du formulaire (absente = vidée par l'API) et la précision en `comment` ; nom (prérempli du nom de la pièce), catégorie et « Rangé dans » ne s'appliquent pas à une version (la pièce garde les siens) — « Rangé dans » reste affiché comme la maquette. Pas sur un rangement imposé (TCK-2910).
- `TCK-2656.json` : retirés les écarts sous-dossier (a-8), chevron (e0), facture sans geste (a-9), « Remplace » (a-2) et l'alias « Relevés et factures » ; motif de la tuile photo réécrit ; décisions 1 et L2-1 marquées renversées ; un écart ajouté (ligne groupée des factures). `mesures` non touchées.

**Mesures** : front neufs `coffre.tck-2898` (10), `CoffreDeDocuments.tck-2898` (10), `AjoutAuCoffre.tck-2898` (7) ; adaptés `coffre.tck-2656`, `coffre.tck-2897`, `CoffreDeDocuments.tck-2656/.archive.tck-2770/.archive-preparee.tck-2812`, `AjoutAuCoffre.tck-2656/.profil.tck-2910/.lecture.tck-2899`, `promesse-du-rappel.tck-2783` (doublure de `useUploadDocumentVersion`). `src/lib/documents/__tests__`, `components/documents/coffre`, `components/documents/agence`, `promesse-du-rappel` : 19 fichiers, 157 verts ; gardes `show-sans-fields`, `fields-demandables`, `documents-fields` vertes. API neuf `DocumentVaultOwnerChargedBillsTest` (4) ; joués aussi `DocumentVaultOwnerTest`, `DocumentVaultArchiveTest`, `DocumentVaultPrimed{Vault,Verdict}ParityTest`, `ServiceProviderBillPdfTest`, `DocumentVaultOwnerLeaseSubfolderTest`, `DocumentVaultSearchTest`, `RechercheDuCoffreVocabulaireTest`, `DocumentVaultBlockedLandlordTest`, `DocumentVersionTest`, `NomsDesAuteursParActeurTest`, `DocumentCurrentFileTest`, `DocumentPieceAccessTest`, `ImpersonationProfilePiecesTest`, `DocumentUploadMimeTest`, `LimiteDeDebitDuPilotePdfTest`, les trois gardes d'architecture — verts. 16 ablations une à une (celles du rapport JSON), 15 rouges puis restaurées (md5) : version (AC1, deux formes), interrupteur ignoré (AC2), catégorie (AC3), KYC sur profil, rotation (AC4), imbrication et bien vide (AC5), repli de « Devis et rapports » (AC7), bouton de la pièce (AC8), appel `addChargedBills`, `chargedToLandlord()`, bras d'archive, original en version 1, comptes sous filtre, résumé des factures (la constante `RENDUS` seule n'est que documentaire : sa mutation reste verte). `tsc`, `eslint`, `check:i18n` (+ namespaces, classes, vouvoiement), Pint, `scripts/check-*.mjs` tous verts.

**Non mesuré** : le glisser des coins au doigt/à la souris et une vraie photo d'appareil (AC4 prouvé au clavier, sur un décodage simulé) ; l'ouverture réelle du fichier signé d'une pièce ; AC9 et AC-F2 à AC-F6 (aucun navigateur dans ce lot) — AC9 est couvert en vitest par un coffre de forme prestataire (« Mes factures », « Devis et rapports », « Mes pièces ») et par `AjoutAuCoffre.tck-2656` (« À renouveler »).  `docs/features.md` / `docs/models-spec.md` laissés à `/sync-specs`.
