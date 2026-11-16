---
id: TCK-2896
title: "Documents de l'agence : l'arbre « Bien › Bail › dossier » au téléphone et en trois colonnes au bureau, et la fiche d'un document qui dit à quoi elle est rattachée"
status: done
phase: P1
family: front
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-16
depends_on: [TCK-2895]
blocks: []
spec_refs:
  features:
    - "docs/features.md#110-documents--contrats"
  models:
    - "docs/models-spec.md#22-document-"
    - "docs/models-spec.md#29-documentsharelink-"
tags: [front, documents, coffre, agence, audit-ux, app]
---

## Objectif utilisateur

L'agent qui cherche la carte d'identité d'un locataire ouvre « Documents », déplie le bien, puis le bail, puis « Pièces du locataire » — ou tape le nom du locataire — et voit d'un coup d'œil ce qui expire bientôt et ce qui attend sa vérification.

## Contrat de données

- Arbre, totaux de l'en-tête, liste de l'agence filtrée et contexte de la fiche : servis par TCK-2895 (`GET /api/agency/document-vault`, cible `agency` de `GET /api/documents`, `context` de `DocumentResource`).
- Existant réutilisé : fiche d'un document, versions, liens de partage (`fiche/PartageDuDocument.tsx`), aperçu.
- Spec : la vue de l'agence par bien et par bail n'est pas détaillée dans `docs/features.md` § 1.10 — **à reporter par /sync-specs**.

Constat (audit `audit-f4-patrimoine.md`, app-documents **e4 — Absent** au téléphone et au bureau ; **e5 — Partiel**) : l'aiguillage `components/documents/EspaceDesDocuments.tsx:38-46` envoie le personnel d'agence vers l'ancienne `DocumentsLibrary` (TCK-062) : liste à plat groupée par TYPE, filtres `Select`, une colonne. C'est le « lot 4 » de TCK-2656, jamais fait.

## Direction UX / Artistique

**Référence de fidélité** : page `app-documents`, approche `a`, fichier `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-documents-a.tsx` :

- **e4 « Agence — par bien, par bail »** — `MobileAgence` (l. 405-470) et `BureauAgence` (l. 575-650), données `PUCES_AGENCE`, `DOSSIERS_BAIL`, `AUTRES_BIENS`, `ARBRE_AGENCE`, `PIECES_LOCATAIRE`.
- **e5 « Fiche d'un document »** — `FicheMobile` / fiche bureau, `MetaCni` (l. 505-515).

**Ce qui manque au téléphone (e4)** :

- Recherche « Chercher un document, un locataire, un bien ».
- Puces « Tous (n) », « Expire bientôt (n) », « Non vérifiés (n) », « Générés ».
- La carte du bien dépliée : en-tête (nom, quartier · n documents, chevron), « Pièces du bien (n) », le bail (« Bail Ousmane Niang », « LS-… · depuis le … », compte) et ses quatre sous-dossiers Contrat / États des lieux / Quittances (marque « Généré ») / Pièces du locataire, chacun avec son compte et son alerte en couleur d'avertissement.
- La carte « autres biens » : nom, « Bail … · n documents » ou « n baux · n documents », alerte.
- La carte du dossier de l'agence (« Dakar Immo — NINEA, registre de commerce, modèles · n documents »).
- « Ajouter un document » en action d'en-tête.

**Ce qui manque au bureau (e4)** :

- Sous-titre « n documents · n expirent bientôt · n à vérifier », recherche de 320 px et « Ajouter un document » dans la tête de page.
- Trois colonnes : l'arbre (Tous les documents, biens, Pièces du bien, bail, sous-dossiers, dossier de l'agence séparé), la liste (fil « Villa › Bail › Pièces du locataire », puces locales Tout / Expire bientôt / Non vérifiés, lignes, puis « Dans le même bail » en tuiles de dossiers « n · générés »), et l'aperçu (vignette, marques, Ajouté par, Vérifié par, Versions, Liens de partage).

**Fiche d'un document (e5)** :

- Métadonnées « Rattaché à » (lien vers le bail ou le bien) et « Bien » — téléphone et bureau.
- Fil d'Ariane du bureau « Documents › Bien › Bail › dossier › nom » au lieu de « Documents › nom ».
- Téléphone : le menu « ⋯ » de l'en-tête (écarté par choix au lot 3 ; à rendre avec les gestes secondaires de la fiche : Ajouter une version, Supprimer).

**Partage depuis la liste de l'agence** : l'ancien `DocumentShareDialog` (décision L3-4 de TCK-2656, « inchangée jusqu'au lot 4 ») cède la place au partage de la fiche (feuille au téléphone, popover au bureau, e6/e7).

## Contraintes strictes (métier)

- Le locataire, le bailleur et le prestataire gardent leur coffre (`coffre/CoffreDeDocuments.tsx`) : seul le personnel actif d'une agence voit la vue de l'agence.
- Filtrer côté serveur (puces, recherche) : jamais sur une liste déjà récupérée. Sparse fieldsets.
- Un document généré n'a ni versions, ni vérification, ni partage (ADR-0099 § 3) : la marque « Généré » le dit, les gestes de gestion n'apparaissent pas.
- Libellés neufs en `fr`/`en`/`wo`, `wo` = le texte français tel quel ; vouvoiement.
- Rien ne se perd de la bibliothèque actuelle sans motif : l'ajout, la suppression, les versions, le téléchargement restent atteignables.

## Delta à produire

- [ ] Vue de l'agence (téléphone et bureau) branchée sur l'arbre et la liste de TCK-2895 ; retrait de `DocumentsLibrary` de l'aiguillage du personnel (et de `DocumentShareDialog` s'il n'a plus d'usage).
- [ ] Fiche : « Rattaché à », « Bien », fil contextuel au bureau, « ⋯ » au téléphone.
- [ ] Fiche de fidélité `docs/qa/audit-ux-2026-11/fidelite/TCK-2896.json` (écrans e4, e5).
- [ ] Tests : arbre rendu depuis la réponse ; puces envoyant le bon filtre ; recherche serveur ; marque « Généré » sans gestes ; fiche avec « Rattaché à » ; 3 colonnes à 1280 ; aucune ligne qui déborde à 390.

## Critères d'acceptation

- [ ] AC1 — Avec le personnel actif d'une agence, `/app/documents` à 390 rend une carte de bien dépliable dont le bail porte les quatre sous-dossiers comptés ; le texte « Contrat », « États des lieux », « Quittances », « Pièces du locataire » est présent, et aucun groupe par type de document (« Pièce d'identité », « Quittance » en titre de groupe) n'est rendu.
- [ ] AC2 — Toucher la puce « Non vérifiés » envoie `filter[is_verified]=false` sur la cible agence et la liste rend les seules pièces non vérifiées ; « Expire bientôt » envoie `filter[expiring_within_days]` ; « Générés » envoie `filter[generated]`.
- [ ] AC3 — La recherche « Niang » envoie `filter[search]=Niang` au serveur (aucun filtrage client).
- [ ] AC4 — Le sous-dossier « Pièces du locataire » dont l'API compte une expiration et une pièce à vérifier affiche « 1 expire dans 42 jours · 1 à vérifier » (forme exacte des clés au pluriel testée pour 1 et 2).
- [ ] AC5 — À 1440, l'arbre, la liste et l'aperçu sont côte à côte ; sélectionner « Pièces du locataire » rend le fil « Villa 4 chambres › Bail Ousmane Niang › Pièces du locataire » et la section « Dans le même bail ».
- [ ] AC6 — La fiche d'une pièce rattachée à un bail rend « Rattaché à » (lien vers `/app/leases/{id}`) et « Bien » ; au bureau, le fil d'Ariane contient le nom du bien et du bail ; à 390, un bouton « Plus d'actions » ouvre les gestes secondaires.
- [ ] AC7 — Partager depuis la vue de l'agence ouvre le partage de la fiche (feuille à 390, popover à 1440) ; `DocumentShareDialog` n'est plus rendu nulle part.
- [ ] AC8 — Un compte locataire voit toujours son coffre à `/app/documents` (pas l'arbre de l'agence).
- [ ] AC9 — Vérifier au navigateur, avec le personnel d'une agence, à 390 et 1440, que `/app/documents` rend l'arbre et non plus la liste par type ; corriger si absent.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)) — fiches : `docs/qa/audit-ux-2026-11/fidelite/TCK-2896.json` (neuve, écrans e4 et e5) :

- [ ] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2896.json` (neuve, écrans e4 et e5) liste chaque écran de maquette implémenté par ce ticket (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés ; les écarts que ce ticket lève en sont retirés.
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'ADR-0106 § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif (une des trois exceptions d'ADR-0106 § 2, ou une donnée).
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [ ] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une, sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.

## Hors périmètre

- Le coffre du locataire, du bailleur et du prestataire (TCK-2656, TCK-2897, TCK-2898).
- Le partage par lien d'un document généré (ADR-0099, Conséquences).

## Notes d'implémentation

Implémenté le 2026-11-15 (agent, worktree `takussan-manques`), sur l'API de TCK-2895 (8611a0949).

- **Écran** : `components/documents/agence/` — `DocumentsDeLAgence` (en-tête, arbre du téléphone, arbre du bureau, puces, « Dans le même bail »), `ListeDeLAgence` (liste et aperçu du bureau), `libelles.ts`, `etat-de-la-vue.ts` (`?dossier=`, `?filtre=`, `?q=`, `?page=` dans l'URL). Module pur `lib/documents/coffre-de-l-agence.ts` (types de l'arbre, clé d'un dossier `lease-12-tenant_pieces`, alerte, résumé d'un bien, entrées au format du coffre) ; lectures `lib/queries/coffre-de-l-agence.ts` (clés sous `['documents', …]` : un dépôt ou une suppression relit l'arbre).
- **Aiguillage** : `EspaceDesDocuments` envoie le personnel actif vers `DocumentsDeLAgence` ; `DocumentsLibrary`, `DocumentsFilters`, `DocumentShareDialog` et leurs tests (`DocumentsLibrary.test`, `DocumentShareDialog.url.test` — l'URL de réception reste gardée par `lib/documents/__tests__/partage.tck-2656`, `densite-et-page-hors-bornes.tck-2815`) sont retirés ; leurs lignes de `eslint-suppressions.json` et de `check-valeurs-arbitraires-app.consigne.json` aussi ; `namespaces.json` régénéré (la frontière `documents` perd `propertyDashboard` et `search`, 30 → 26 Ko).
- **Choix de données** : les comptes (puces, sous-dossiers, « Dans le même bail », sous-titre) viennent TOUS de l'arbre. Un dossier généré d'un bail (Contrat, États des lieux, Quittances) se liste par `GET /api/documents/generated?target=lease:{id}`, découpé par catégorie comme `AgencyDocumentVault::countOf` : `filter[generated]=1` ne se borne pas à un bail. « Générés » (puce globale) part à `filter[generated]=1`. Un dossier téléversé : `filter[agency]=current` + `filter[documentable_type|id]`. Une recherche porte sur toute l'agence (le dossier s'efface devant elle).
- **Écarts (donnée)** : `totals.documents` compte les générés, la liste « Tous » ne rend que les téléversés ; la ligne dit « locataire · type · ajout du … » (ni format ni taille servis) ; l'alerte d'un bien replié se dit en nombre (« 1 expire dans 23 jours »), le nom de la pièce n'étant pas servi. Les biens sans document sont comptés (« n biens sans document »), jamais listés (décision 1 (a) de TCK-2656).
- **Rien ne se perd sans motif** : ajout (en-tête, prérempli de la cible du dossier téléversé ouvert), suppression, versions, téléchargement (fiche, aperçu du bureau, lignes), partage (aperçu au bureau, bouton de ligne au téléphone : `PartagerParLien`). Perdus avec motif : la liste des téléversements de l'appelant sur d'autres porteurs (fiche client, réservation, compte) — hors de l'arbre de l'agence (ADR-0099, amendement du 2026-11-15) et toujours sur la page de leur porteur ; la bascule « Interne » (`BasculeDeVisibilite`) — une pièce de fiche client, que l'arbre ne range pas, et qui la garde sur la fiche client (`CustomerDocumentsPanel`) ; le glisser-déposer de la zone de liste — absent de la maquette, le dépôt garde le sien ; le sélecteur de densité — pagination de la console à 20. La page au-delà de la dernière (TCK-2815) est gardée (`PageAuDelaDeLaDerniere`). Chaque ligne se lit par sa forme (`kind`), jamais par la puce : la page d'avant (`keepPreviousData`) ne se rend pas de travers au passage de « Générés ». Le dossier ouvert au téléphone n'a pas de flèche (garde TCK-2617 : la seule flèche est celle de la coque).
- **Fiche (e5)** : `context` ajouté au type `Document` ; « Rattaché à » (bail → `/app/leases/{id}`, sinon le bien) et « Bien » (« titre, quartier ») ; fil du bureau « Documents › Bien › Bail … › Pièces du locataire|Pièces du bien › nom » (le dossier mène à `/app/documents?dossier=…`) ; au téléphone, `DeclarerEnTete actions` → « ⋯ » avec « Ajouter une version » (état relevé de `VersionsDuDocument` par `ajoutOuvert`/`onAjoutOuvert`) et « Supprimer ». Sans `context`, la fiche d'avant. Les liens ne dépendent pas du profil : `context` n'est servi qu'à qui lit la cible.
- **Retouche partagée** : `coffre/ChampDeRecherche` reçoit `libelle` et `className` facultatifs (placeholder « Chercher un document, un locataire, un bien », 320 px au bureau) — additif, le coffre inchangé.
- **Fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2896.json` (e4, e5) ; dans `TCK-2656.json`, les écarts levés (fil, « ⋯ », « Rattaché à », « Bien ») sont retirés. **Non mesuré au navigateur** (consigne du lot : le front local sert un autre arbre) : AC9 et AC-F2 à AC-F6 restent à relever.
- **Mesures** : `DocumentsDeLAgence.tck-2896` 14 tests, `DocumentDetailClient.contexte.tck-2896` 7, `coffre-de-l-agence.tck-2896` 9, `EspaceDesDocuments.tck-2656` 5 ; les 13 fichiers de `components/documents/__tests__` et `fiche/__tests__` et les 10 de `coffre/__tests__` + `lib/documents/__tests__` verts. Ablations une à une, chacune rouge puis restaurée par `cp` (md5 vérifié) : `filter[is_verified]`, `filter[expiring_within_days]`, `filter[generated]`, `filter[search]` (AC2, AC3) ; sous-dossiers du bail (AC1) ; forme au singulier de l'alerte (AC4) ; « Dans le même bail » (AC5) ; bouton de partage du téléphone (AC7) ; découpage des générés par catégorie ; « Rattaché à », fil, « ⋯ » (AC6) ; aiguillage du locataire (AC8) ; page au-delà de la dernière ; forme de ligne ; « + » de l'en-tête du téléphone. Gardes jouées : zod-hors-des-ecrans-de-lecture, show-sans-fields, chemin-api, fleche-de-retour-unique (rouge seulement sur `visits/compte-rendu/SuiteDeLaVisite.tsx`, autre agent), check:i18n, check:i18n-namespaces, check:classes-emises, check:vouvoiement, `scripts/check-*.mjs` (rouge seulement `check-models-spec` : `BookingDossierItem`, TCK-2872).
- **Reste** : relevé au navigateur (AC9, AC-F2 à F6) ; `/sync-specs` (§ 1.10, vue de l'agence).
