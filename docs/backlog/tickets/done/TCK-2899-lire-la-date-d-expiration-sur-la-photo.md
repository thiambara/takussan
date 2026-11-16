---
id: TCK-2899
title: "Coffre : lire la date d'expiration sur la photo d'une pièce, dans le téléphone, sans rien envoyer à un fournisseur"
status: done
phase: P3
family: front
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-16
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#110-documents--contrats"
    - "docs/features.md#211-socle-ia"
  models:
    - "docs/models-spec.md#22-document-"
tags: [front, documents, coffre, ocr, donnees-personnelles, audit-ux, app]
---

## Objectif utilisateur

Le locataire photographie sa carte d'identité ; le champ « Expire le » se remplit seul (« Lu sur la photo »), il n'a qu'à vérifier.

## Contrat de données

Aucun endpoint neuf : `expiry_date` est déjà un champ du document envoyé à l'ajout. La lecture se fait **dans le navigateur**.

> **Décision prise à l'écriture du ticket** : une pièce d'identité est une donnée de classe `sensible`, qui **ne part jamais vers un fournisseur** d'IA ([ADR-0076](../../../adr/0076-le-socle-ia.md) § 4). Une lecture côté serveur par le socle IA est donc exclue. Reste la lecture locale : la **bande MRZ** (zone de lecture automatique des cartes CEDEAO et des passeports), qui porte la date d'expiration sous une forme normalisée et vérifiable par sa clé de contrôle, lue par un moteur d'OCR chargé dans la page (WebAssembly, à la demande). Une nouvelle dépendance est donc ajoutée au front.

Audit (`audit-f4-patrimoine.md`, app-documents **e2**) : « seule la lecture de la date sur la photo n'existe pas » ; fiche `TCK-2656.json` (« Lu sur la photo », corrigée par TCK-2904). Hors périmètre de TCK-2656 (« L'OCR … § 1.10, P3 »). Spec : la lecture automatique n'est pas décrite dans `docs/features.md` § 1.10 — **à reporter par /sync-specs**.

## Direction UX / Artistique

- **Référence de fidélité** : page `app-documents`, approche `a`, écran **e2 « Locataire — nommer et ranger »** — `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-documents-a.tsx` l. 254 : `Champ libelle="Expire le" valeur="14 nov. 2036" aide="Lu sur la photo. Nous vous préviendrons 60 jours avant."` — téléphone et bureau.
- La date lue pré-remplit le champ, qui reste modifiable ; l'aide « Lu sur la photo. » précède la promesse du rappel. Rien lu : le champ reste vide, sans message d'erreur (« Nous vous préviendrons 60 jours avant. » seul).
- La lecture ne bloque jamais l'ajout : elle tourne pendant que l'utilisateur nomme le document.

## Contraintes strictes (métier)

- **Aucune donnée de la photo ne quitte l'appareil pour la lecture** : aucune requête réseau autre que le chargement du moteur et de ses données (servies depuis notre propre origine, pas un CDN tiers à l'exécution).
- Seule une date **validée par la clé de contrôle MRZ** pré-remplit le champ ; une lecture douteuse ne remplit rien.
- Le moteur est chargé à la demande (pas dans le bundle initial de `/app/documents`).
- Genres concernés : carte d'identité, passeport ; les autres pièces ne lancent pas la lecture.

## Delta à produire

- [ ] Lecture locale de la MRZ sur l'image recadrée (après TCK-2898 si livré, sinon l'image brute) ; analyse de la date d'expiration et de sa clé de contrôle.
- [ ] Pré-remplissage du champ « Expire le » et aide « Lu sur la photo. ».
- [ ] Tests : analyseur MRZ (TD1 carte, TD3 passeport) sur des chaînes connues, clé de contrôle fausse → aucune date ; composant : aide rendue seulement quand la date vient de la lecture ; aucun `fetch` vers une autre origine pendant la lecture.

## Critères d'acceptation

- [ ] AC1 — L'analyseur rend `2036-11-14` pour une MRZ TD1 dont le champ d'expiration est `361114` avec une clé de contrôle juste, et rien quand la clé est fausse.
- [ ] AC2 — Après la photo d'une carte d'identité dont la MRZ est lisible, le champ « Expire le » vaut la date lue et l'aide commence par « Lu sur la photo. » ; l'utilisateur peut la changer, et la date envoyée est celle du champ.
- [ ] AC3 — Pour une attestation de travail, aucune lecture n'est lancée (le moteur n'est pas chargé).
- [ ] AC4 — Pendant la lecture, l'onglet Réseau ne montre aucune requête vers une autre origine que celle de l'application.
- [ ] AC5 — Vérifier au navigateur, sur un téléphone, avec une carte CEDEAO de test : la date est lue ; corriger si absent.

## Hors périmètre

- Toute lecture côté serveur ou par le socle IA (ADR-0076 § 4).
- La lecture d'autres champs (nom, numéro) : la maquette ne promet que la date.

## Notes d'implémentation

**2026-11-15 — implémenté (agent délégué, vague 92).**

**Dépendance neuve, et pourquoi** : `tesseract.js@7.0.0` (OCR en WebAssembly, Apache-2.0) et
`@tesseract.js-data/eng@1.0.0` (le modèle `4.0.0_best_int`, 2,9 Mo gzippé), versions exactes ; licence
`Apache-2.0` (relevée dans `node_modules/tesseract.js/package.json`). Le ticket la prévoit (« Une
nouvelle dépendance est donc ajoutée au front ») : la lecture côté serveur est exclue par ADR-0076 § 4,
et une lecture par une API native du navigateur n'a pas été relevée ici. Aucune autre bibliothèque MRZ : l'analyse
(clés ICAO 9303) tient en 120 lignes et se teste mieux à nous.

**Servi par notre origine** : `takussan-web/scripts/copier-moteur-ocr.mjs` copie le worker, les trois
cœurs `*-lstm.wasm.js` (wasm embarqué, vérifié) et le modèle sous `public/ocr/` (~15 Mo, **ignoré par
git**), lancé par `prebuild` et `predev` — pas `postinstall` : l'étape `deps` du Dockerfile n'a que
`package.json` et le lock. `moteur.ts` pose les TROIS chemins (`workerPath`, `corePath`, `langPath`)
en URL absolues de `window.location.origin` : un seul omis et tesseract.js va le chercher sur jsdelivr.

**Écart trouvé et corrigé** : `gz` n'était pas une extension de fichier servi tel quel — le proxy aurait
pris `/ocr/lang/eng.traineddata.gz` pour une page à localiser (404). Ajouté à `EXTENSIONS_DE_FICHIERS`
(`src/i18n/routing.ts`) et au littéral du `matcher` (`src/proxy.ts`), comme leur test l'exige.

**Ce qui est livré** :
- `src/lib/documents/lecture-mrz/analyse.ts` — l'analyseur : il s'ancre sur le bloc
  naissance·clé·sexe·expiration·clé (colonne 0 de la ligne 2 en TD1, 13 en TD3), cherché n'importe où
  dans la ligne, sans dépendre des `<` (le modèle `eng` les lit `K`/`L`, relevé ci-dessous). **Les DEUX
  clés** (naissance et expiration) doivent tomber juste, et les deux dates exister ; les confusions
  lettre/chiffre (O→0, I→1, S→5, B→8…) ne s'appliquent qu'aux positions numériques, jugées ensuite par
  les clés.
- `src/lib/documents/lecture-mrz/moteur.ts` — `import('tesseract.js')` à la demande (aucun import
  statique : un test le garde sur tout `src/`), image réduite à 2000 px en niveaux de gris, lecture de
  la moitié basse puis de l'image entière, liste blanche `A-Z0-9<`, abandon par `AbortSignal` (worker
  terminé), toute erreur → `null` et une trace `console.warn` sans rien de la photo (le message de
  l'erreur seul, pour qu'un AC5 raté dise si c'est un 404, le wasm ou la lecture). tesseract.js est
  CommonJS : ses exports sont pris nommés ou sous `default`, selon l'interop du bundler (testé).
- Pas d'ADR écrit : le moteur embarqué et `public/ocr/` dérivé au build sont une décision que la
  session tranche (ADR ou non).
- `AjoutAuCoffre.tsx` — la lecture part sur le couple (image, catégorie `id_card` ou `passport`) : la
  catégorie vaut « Autre » au moment de la photo, la lecture démarre quand on la choisit et tourne
  pendant qu'on nomme. Une date déjà saisie n'est jamais écrasée ; une photo reprise, une catégorie
  changée ou la fenêtre fermée abandonnent la lecture et jettent son résultat. L'aide « Lu sur la
  photo. » précède la promesse du rappel tant que le champ porte la date lue, et s'affiche même là où la
  promesse ne dit rien (dossier d'un bien, échéance proche). Clé `documents.coffre.ajout.luSurLaPhoto`.

**Mesure de bout en bout (sans navigateur)** : une carte CEDEAO de synthèse (sharp, Courier New 64 px,
fond beige) lue par tesseract.js sous Node sur les fichiers copiés : `9005156M3611144SENKLLLLLLLLLLE`
→ `2036-11-14`, sur la moitié basse comme sur l'image entière. Les `<` reviennent `K`/`L` : d'où
l'ancrage sur le bloc chiffré.

**Non mesuré** : AC5 (téléphone, vraie carte CEDEAO — police OCR-B, reflets, perspective) et l'onglet
Réseau d'AC4 (pas de navigateur dans ce lot) ; `npm run build` non joué (la CI le joue — le bundle du
worker par Turbopack s'y éprouve). AC4 est jugé sur les options passées au moteur (ablation : sans
`langPath`, rouge).
