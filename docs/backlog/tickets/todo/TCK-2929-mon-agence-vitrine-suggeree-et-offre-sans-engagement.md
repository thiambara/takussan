---
id: TCK-2929
title: "Mon agence : « vos biens les plus vus ce mois · Utiliser cette sélection » dans la vitrine, « Sans engagement » sous l'offre, et les deux états jamais relevés"
status: todo
phase: P2
family: front
estimate: S
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: [TCK-2923]
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md#2-agency"
tags: [front, agence, fiche-publique, vitrine, offre, audit-ux, audit-2026-11-15]
---

## Objectif utilisateur

L'admin remplit sa vitrine d'un geste avec ses biens les plus vus, et lit sous l'offre pro ce qui l'engage.

## Contrat de données

- Biens les plus vus du mois de l'agence (TCK-2923).
- Offre : la lecture actuelle de `/app/settings/agency/upgrade` (`BlocDeLOffre`, `OffreDeLAgencePro`).
- La spec ne détaille pas la suggestion : à reporter par `/sync-specs`.

## Direction UX / Artistique

- **Référence de fidélité** : `app-identite-agence`, **approche A**, `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-identite-agence-sections.tsx` (écrans déclarés dans `app-identite-agence.tsx`), visionneuse `?p=app-identite-agence&a=a`.
  - **e2 « Fiche publique (à remplir) »**, **téléphone et bureau** : sous la vitrine, « N autres biens publiés. Suggestion : vos biens les plus vus ce mois. **Utiliser cette sélection** » (`sections.tsx:809`).
  - **e8 « Offre (agence déjà pro) »**, **téléphone et bureau** : « … Sans engagement. » sous le prix (`sections.tsx:1253`).
- Audit : `audit-f6-agence-entree.md`, § app-identite-agence e2, e8, et « non vérifiables » (e4, e9) ; fiche TCK-2670 (`a-2`).

## Contraintes strictes (métier)

- « Utiliser cette sélection » remplace la vitrine par les biens les plus vus (au plus le nombre de places de la vitrine) **dans le formulaire**, sans enregistrer : la barre « N modification non enregistrée » paraît, « Annuler » rend la vitrine d'avant.
- La suggestion n'est rendue que si l'API rend au moins un bien vu ce mois.
- **« Sans engagement » est une promesse** : ne l'écrire que si la règle de facturation de l'offre le tient (résiliation sans frais ni durée minimale). L'implémenteur vérifie la règle dans l'API (abonnement à l'approbation, ADR de l'offre) ; si elle ne le tient pas, il ne l'écrit pas et remonte la question au porteur dans la PR (décision 2026-11 « Sans engagement retiré » à confirmer).
- Libellés `fr`/`en`/`wo` (`wo` = français) ; vouvoiement.

## Delta à produire

- [ ] Ligne de suggestion et geste « Utiliser cette sélection ».
- [ ] « Sans engagement » sous le prix (sous la condition ci-dessus).
- [ ] Vérifications au navigateur (AC4, AC5).

## Critères d'acceptation

- [ ] AC1 — Avec trois biens vus ce mois (ordre B, A, C), « Utiliser cette sélection » met B, A, C dans la vitrine du formulaire et fait paraître la barre de modifications ; « Annuler » rend la vitrine d'avant ; rien n'est écrit avant « Enregistrer ».
- [ ] AC2 — Sans aucun bien vu ce mois, aucune ligne de suggestion n'est rendue.
- [ ] AC3 — Sur l'offre d'une agence pro, la ligne sous le prix finit par « Sans engagement. » si la règle le tient ; sinon la PR porte la question au porteur et la fiche TCK-2671 garde l'écart avec ce motif.
- [ ] AC4 — Vérifier au navigateur, avec un dossier KYC portant NINEA et RCCM et une agence sans ces numéros, l'encart « NINEA et RCCM manquent… Reprendre ces deux numéros » (e4) ; corriger si absent.
- [ ] AC5 — Vérifier au navigateur, avec une demande de passage en pro **refusée** (motif saisi), l'état refusé de e9 (pastille, « refusée le … », motif en tête, formulaire prérempli, NINEA et RIB à ressaisir) à 390 et 1440 ; corriger si un élément manque.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md)) :

- [ ] AC-F1 — Fiches TCK-2670 et TCK-2671 mises à jour (entrées couvertes retirées, ou motif réécrit pour AC3).
- [ ] AC-F2 — À 390 × 844 et 1440 × 900, `fidelite compare` sur e2, e8, e9 (état refusé) ne rend aucun écart non expliqué.

## Hors périmètre

- La série des vues (TCK-2923).

## Notes d'implémentation

2026-11-15 — implémenté (agent délégué, worktree `feat/audit-manques-2026-11-15`). Front seul : l'API de TCK-2923
(`GET /api/agencies/{agency}/properties/most-viewed?limit=N`, `AgencyPolicy::configure`) suffit — aucune route, aucun
test API.

- **Suggestion (AC1, AC2)** — `SectionFichePublique` lit la route par `useApiQuery` (`limit=6`, les places de la
  vitrine, passé par `extra` : `buildQueryString` ne sérialise pas une clé inconnue — un premier jet l'avait perdue, le
  test l'a vu). Règle pure dans `lib/vitrine-agence.ts` : `selectionSuggeree()` garde l'ordre de l'API (jamais retrié),
  sans doublon, six au plus ; `null` sans bien vu ce mois, ou quand la vitrine est déjà exactement cette sélection
  (décision : le geste ne changerait rien, la ligne se tait). « Utiliser cette sélection » passe par `choisir()`
  (`setValue(…, { shouldDirty: true })`) : la barre « modification non enregistrée » paraît, « Annuler » rend la vitrine
  d'avant, rien ne part avant « Enregistrer ». Les biens suggérés entrent dans `parId` et dans la couverture dès le
  geste (sans attendre la relecture par ids).
- **Décision (« N autres biens publiés »)** : seul un compte vrai s'écrit — `meta.total` de la liste moins la page
  reçue (cent au plus) ; à 0, la phrase se tait. La ligne est au pied de la liste, HORS de sa zone de défilement
  (`max-h-80`), dans la même carte ; rendue hors recherche seulement (le compte vise la liste non filtrée). Liste vide
  (tout est choisi) : la ligne reste sous l'état vide.
- **« Sans engagement » (AC3) : NON écrit.** Re-mesuré : l'agence n'a aucune voie de résiliation (seul
  `POST /api/admin/agencies/{agency}/subscription/cancel`, geste de l'opérateur), ni `plans` ni `agency_subscriptions` ne
  portent de durée minimale ou de frais, et les CGU (`content/legal/terms.ts`) ne disent rien de la durée : § 7.2
  « Abonnements et commission » est muet sur la résiliation, et § 16 « Disponibilité et évolution du service » ne
  promet une résiliation sans frais que sur modification substantielle d'une offre. `BlocDeLOffre` inchangé ; motif de TCK-2671.json réécrit.
  **Question pour le porteur (à porter dans la PR)** : « Sans engagement » — confirmez-vous le retrait, ou voulez-vous
  une résiliation par l'agence (route + texte contractuel) pour pouvoir l'écrire ? À noter : les CGU (§ 16) donnent
  déjà au professionnel le droit de « résilier son abonnement sans frais » sur modification substantielle, alors que
  l'application n'a aucune voie de résiliation côté agence.
- **AC4, AC5 : non mesurés au navigateur** (consigne du lot : ni Chrome ni `next dev`). Lus élément par élément contre
  la maquette : e4 (`EncartMentions`) — titre, numéros du dossier, « Reprendre ces deux numéros », « À reprendre » —
  présents dans `SectionFacturation` ; e9 (`StatutDemande`, `ChampsDemandePro`) — pastille « Refusée », « refusée le … »,
  motif, « Soumise le … », formulaire prérempli, NINEA et RIB vides à ressaisir, « à remplacer » — présents. Tests
  renforcés : le titre de l'encart et les numéros (`FicheDeLAgence.test.tsx`), la pastille et la date du refus
  (`UpgradeRequestStatus.tck-2671.test.tsx`). Écart connu, non corrigé : la maquette téléphone dit « À reprendre de
  votre dossier vérifié » en placeholder, le produit « À reprendre » aux deux largeurs (un placeholder ne suit pas un
  point de rupture CSS).
- **AC-F1** : entrée a-2 de TCK-2670.json réécrite (construit, reste la vérité des données) ; entrée a-8 de
  TCK-2671.json re-datée. **AC-F2 non mesuré** (pas de navigateur).
- Le chemin passe par `cheminApi` (garde `chemin-api.garde.test.ts`, rouge sur un gabarit `/api` brut) ; les 14
  gardes `*garde*.test.ts*` du front vertes, et les 3 tests de page `/app/agency` qui montent la fiche.
- Tests : `FicheDeLAgence.vitrine.test.tsx` (+6, les deux `beforeEach` rendent `[]` pour `most-viewed`),
  `vitrine-agence.test.ts` (+3) ; les 9 fichiers de `fiche/__tests__` verts (139). Ablations une à une, restaurées au
  md5 : geste sans `choisir` → AC1 rouge (2) ; ordre retrié → AC1 rouge ; garde « aucun bien vu » retirée → AC2 rouge
  (le test d'AC2 a dû passer à une vitrine non vide : vide, la seconde garde le masquait).

