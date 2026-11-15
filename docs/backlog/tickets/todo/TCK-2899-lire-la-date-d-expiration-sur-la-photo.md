---
id: TCK-2899
title: "Coffre : lire la date d'expiration sur la photo d'une pièce, dans le téléphone, sans rien envoyer à un fournisseur"
status: todo
phase: P3
family: front
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-15
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

_(à remplir par implementing-specs)_
