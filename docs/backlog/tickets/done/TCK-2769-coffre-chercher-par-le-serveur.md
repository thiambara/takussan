---
id: TCK-2769
title: "Coffre de documents : chercher dans le coffre par le serveur — `filter[search]` sur `GET /api/me/document-vault`, documents générés compris"
status: done
phase: P2
family: full
estimate: M
wave: 90
created: 2026-11-13
updated: 2026-11-14
depends_on: [TCK-2656]
blocks: []
spec_refs:
  features:
    - "docs/features.md#110-documents--contrats"
  models:
    - "docs/models-spec.md#22-document-"
tags: [back, front, documents, recherche, suite-de-tck-2656, audit-ux, app]
---

## Objectif utilisateur

Le locataire, le bailleur et le prestataire cherchent « contrat », « quittance de mars » ou « assurance »
depuis leur coffre et y retrouvent **tout** ce que le coffre leur montre. Cela comprend les documents
générés par Takussan, pas seulement les pièces qu'ils ont eux-mêmes déposées.

## Contrat de données

**Décision.** Porteur, 2026-11-13, liste du soir n° 14 : ticket de suivi (recherche dans le coffre).

**Constat (2026-11-13).** La maquette du coffre (`app-documents` a) porte un champ « Chercher un document ».
`GET /api/me/document-vault` n'a aucun filtre de recherche. TCK-2656 (décision 2, option (c), tranchée par
le chef d'équipe) a donc posé à la place un geste « Rechercher ». Il ouvre `/app/documents?vue=recherche` :
la liste `GET /api/documents` cherchée par `filter[search]`, que ces profils avaient avant le coffre.

Cette recherche ne voit que les documents **téléversés** que la liste rend à l'appelant. Elle ignore :

- les entrées générées du coffre (contrat, états des lieux, quittances, relevés, attestations) ;
- les pièces que l'agence a déposées sur le bail du locataire.

**Delta côté API.** `filter[search]` sur `GET /api/me/document-vault`, jugé par le serveur :

- la recherche plein texte (Meilisearch) pour les pièces téléversées, bornée par le périmètre du coffre et sa
  règle de lecture (`restreindreAuxLecteursDInternes`, règle d'auteur) ;
- une correspondance sur le libellé de la catégorie et la période pour les entrées générées.

Le libellé d'une entrée générée est aujourd'hui composé par le front. Ce ticket doit donc trancher où il
vit, pour que le serveur cherche ce que l'utilisateur lit.

**Delta côté front.** Le champ « Chercher un document » de la maquette dans le coffre. La requête est envoyée
au serveur (`filter[search]`), gardée dans l'URL, et le geste « Rechercher » de TCK-2656 est retiré.

## Contraintes strictes

- **Jamais de filtre côté client sur le coffre chargé** : la recherche passe par le serveur.
- Pas de reconnaissance de texte (OCR) : on cherche dans les noms, descriptions, catégories et périodes,
  jamais dans le contenu d'un fichier.
- Une pièce interne d'une fiche client (TCK-2759) n'est jamais trouvable par qui ne la lit pas.

## Critères d'acceptation

- [x] AC1 — Le locataire qui cherche « quittance » trouve ses quittances générées de l'année. Une régression qui ne
  chercherait que les téléversements échoue.
  *Preuve : `DocumentVaultSearchTest::test_ac1_quittance_trouve_les_quittances_generees_de_l_annee` (les 5 quittances
  de loyer, dossier « Quittances 2026 », plus récente d'abord ; « quittance de mars », « March receipt », « caution »,
  « contrat », « état des lieux »). Ablation (aucune entrée générée retenue) : rouge.*
- [x] AC2 — « assurance » trouve la pièce « Assurance habitation » qu'il a déposée, et pas celle d'un autre bail.
  *Preuve : `test_ac2_assurance_trouve_sa_piece_et_pas_celle_d_un_autre_bail` : une « Assurance habitation » sur
  l'autre bail, trouvée par son locataire (témoin), jamais par le premier ; « asurance habitation » (faute) prouve le
  chemin Meilisearch. Ablation (filtre du moteur réduit à `uploaded_by`) : rouge.*
- [x] AC3 — L'agent suspendu qui a déposé une pièce interne ne la trouve pas (même règle que TCK-2759 r4).
  *Preuve : `test_ac3_l_interne_n_est_trouve_ni_par_l_agent_suspendu_ni_par_le_sujet` : actif, il trouve l'interne
  et la visible ; suspendu, `data` vide et `meta.total` 0 ; le sujet de la fiche trouve la visible, jamais l'interne.
  Ablations (règle des internes retirée du coffre ; règle d'auteur remplacée par `uploaded_by`) : rouges.*
- [x] AC4 — Le total et la pagination sont ceux du serveur.
  *Preuve : `test_ac4_le_total_et_les_pages_sont_ceux_du_serveur` (`per_page=2` : trois pages, total 5, la
  concaténation égale la liste entière, page 4 vide, `per_page=51` → 422) ; au front,
  `CoffreDeDocuments.recherche.tck-2769` rend le total de `meta` et écrit `?page=2` dans l'URL. Ablation (pas de
  découpage) : rouge.*

## Hors périmètre

- La recherche de la bibliothèque de l'agence (inchangée).
- L'archive « Tout télécharger » (TCK-2770).

## Notes d'implémentation

**Où vit le libellé d'une entrée générée (tranché, option (a), posée à team-lead le 2026-11-14).** Il reste au front
(principe 5). Le serveur cherche dans `takussan-api/resources/documents/vocabulaire-du-coffre.json`, DÉRIVÉ des
messages du front (`documents.coffre.entrees`, `documents.types`, placeholders ICU retirés) par
`takussan-web/scripts/gen-vocabulaire-du-coffre.mjs`. C'est le patron de `requetes-du-front.json` (TCK-1800) :

- `src/lib/documents/__tests__/vocabulaire-du-coffre.tck-2769.test.ts` rougit quand un libellé change sans que le
  fichier suive ;
- `RechercheDuCoffreVocabulaireTest` rougit quand le coffre émet une catégorie (`receipt_<LeasePaymentType>`,
  `inventory_<InventoryType>`…) ou une pièce un type que le fichier ne connaît pas.

Le mois (Carbon, dans chaque langue du fichier), l'année de la date et la référence s'ajoutent côté serveur. Toutes les
langues du fichier sont cherchées, quelle que soit celle de l'appelant.

**La recherche ne juge rien.** `DocumentVault::search()` bâtit le coffre par le chemin sans recherche (mêmes règles :
internes, règle d'auteur, pièces de profil sous impersonation, lecture seule), puis `RechercheDuCoffre` n'en retient
que des entrées. Le moteur ne fournit que des identifiants CANDIDATS pour les pièces téléversées, sous un filtre borné
par les porteurs du coffre : `(documentable_type, documentable_id IN …) OR uploaded_by = moi`. Ces attributs sont
filtrables avant comme après TCK-2781. Une pièce se trouve aussi par le libellé de son type (l'index ne cherche que
`title` et `description`).

**Forme de la réponse (option (a)).** Sans `filter[search]` (ou vide), la réponse est inchangée. Avec, `data` est la
liste plate des entrées trouvées, chacune avec `folder` (`key`, `kind`, `name`, `year`, `read_only`), plus récentes
d'abord. `meta` vient de `PaginationMeta::of`. Les paramètres sont `page` et `per_page` (20 par défaut, 50 au plus),
validés par `DocumentVaultRequest`.

**Front.** Le champ « Chercher un document » de la maquette est sous l'en-tête au téléphone, et dans l'en-tête au
bureau (`h-9 w-64`). La requête vit dans l'URL : `?q=` après 300 ms de pause, `?page=`. Sous une recherche, les
entrées trouvées remplacent les dossiers, et chacune nomme son dossier. Le bureau garde l'aperçu, la pagination est
celle de la console. Le geste « Rechercher », `?vue=recherche` et le mode `recherche` de `DocumentsLibrary` sont
retirés, avec leurs clés i18n et `DocumentsLibrary.recherche.tck-2656.test.tsx`. Relevé de fidélité :
`docs/qa/audit-ux-2026-11/fidelite/TCK-2769.json`.

**Frappe éprouvée au navigateur, à 390 et 1280** (2026-11-14, persona locataire, `fidelite.mjs releve --perturber`). La
saisie de « quittance de mars », avec des pauses, garde le même champ, son focus et sa saisie, espace final compris.
`?q=` rattrape la frappe après la pause, et rend 2 résultats. Seul le squelette des résultats se montre, à la première
requête : `(liste)/loading.tsx` ne remplace pas le champ. Une `key={q}` sur le coffre (ablation) remonte le champ et
fait rougir le test de focus. `vocabulaire-du-coffre.json` est dans les `paths` de Web CI : sa retouche seule réveille
la garde du front.

**Le coffre retient APRÈS le moteur, impersonation comprise** (exigences de team-lead du 2026-11-14). Deux tests de
`DocumentVaultSearchTest` donnent au coffre un moteur espion, qui relève ses candidats et peut en ajouter :

- `un_candidat_du_moteur_que_l_appelant_ne_lit_pas_ne_sort_jamais` : le moteur rend en plus l'assurance d'un autre
  bail, la pièce du bien et l'interne de la fiche, toutes refusées au locataire (403). Aucune ne sort, et le total
  reste 1 ;
- `sous_impersonation_la_recherche_ne_rend_que_le_coffre_de_la_personne` : la pièce d'identité du profil du bailleur
  et l'interne de la fiche du locataire sont candidates, et ne sortent pas. La réponse ne porte aucune cible de
  rattachement, et un dépôt est refusé (403). Chaque cas a son versant sous le jeton de la personne elle-même.

Ablations, toutes rouges : le moteur pris pour argent comptant (candidats hors du coffre ajoutés), les deux tests ;
`excludingProfilePieces` retiré, le test d'impersonation ; `restreindreAuxLecteursDInternes` retiré, les deux.
`filter[search][]=x` rend 422 (validé par team-lead : ADR-0075 admet le refus sur `q`, précédent TCK-1864).

**Le fichier généré** porte un en-tête (`_`) qui dit sa source et nomme la commande qui le régénère :
`cd takussan-web && node scripts/gen-vocabulaire-du-coffre.mjs`. Le message d'échec du test du front la nomme aussi.
Il ne touche aucune garde existante : `check-front-routes` voit un GET vers une route qui existe, et
`requetes-du-front.json` ne liste que ses invocations (le hook de recherche n'y est pas).

