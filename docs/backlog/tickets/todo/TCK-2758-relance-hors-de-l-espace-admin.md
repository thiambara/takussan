---
id: TCK-2758
title: "La relance d'un impayé n'embarque plus l'espace `admin` du dictionnaire sur la fiche du bien"
status: todo
phase: P2
family: technique
estimate: S
wave: 90
created: 2026-11-12
updated: 2026-11-12
depends_on: [TCK-2639, TCK-2660]
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
    - "docs/features.md#28-internationalisation--préférences"
  models: []
tags: [front, i18n, dictionnaire, impayes, relance, poids]
---

## Objectif utilisateur

L'agent qui ouvre la fiche d'un bien reçoit le dictionnaire de ce que la page affiche, et non l'administration
de l'agence entière : la relance d'un impayé garde ses libellés sans charger les autres.

## Contrat de données

Aucun endpoint touché. Le dictionnaire next-intl est découpé par frontière de rendu et par espace de premier
niveau (`src/i18n/namespaces.json`, garde `scripts/check-i18n-namespaces.mjs`, TCK-337) : une frontière
reçoit tout espace qu'un fichier de son graphe d'imports lit côté client.

Mesuré le 2026-11-12 (`node scripts/check-i18n-namespaces.mjs --report`) : la frontière
`(dashboard)/app/properties` sert **15 espaces, 57,9 % du dictionnaire servi (plafond 63 %)**. TCK-2639 (décision 7,
validée « a » avec ce suivi) y a ajouté `admin` et `payments` : « Relancer » de la fiche réutilise la feuille de
relance de TCK-2644, qui vit dans le module de l'écran Impayés et lit `admin.finances.impayes.*` — l'espace
`admin` entier (≈ 70 ko bruts en `fr`) part donc sur toutes les pages de `/app/properties`. Sans lui, le
navigateur levait `MISSING_MESSAGE: admin.finances.impayes` et « Relancer » n'ouvrait rien (la suite vitest ne le
voit pas). `payments` est légitime (le dialogue d'encaissement) et reste.

## Contraintes strictes (métier)

- **Un seul composant Impayés et une seule relance** (décision du porteur du 2026-11-10, point 14 a, écrite par
  TCK-2660) : la relance de la fiche, celle de l'écran Impayés et celle en lot (TCK-2682) restent le même code et
  les mêmes libellés. Ce ticket déplace des clés et des frontières d'import, il ne duplique rien.
- **Le texte ne change pas** : mêmes libellés `fr`/`en`/`wo` au caractère près ; une clé déplacée garde sa
  valeur `wo` existante (le wolof est en pause : aucune réécriture).
- Le message WhatsApp de la relance (TCK-2644) et le lien de paiement qu'elle crée (point ouvert de TCK-2660)
  sont inchangés.

## Delta à produire

- [ ] Les clés de la relance d'un impayé sortent de `admin` vers un espace de premier niveau qui leur est propre ;
  tous leurs lecteurs (écran Impayés, fiche du bien, relance en lot si TCK-2682 est livré) les lisent là.
- [ ] La fiche du bien atteint la relance sans que son graphe d'imports atteigne un lecteur de `admin`.
- [ ] **Même cas sur l'accueil** (TCK-2624, lot 1, plafond ratifié le 2026-11-13) : « Relancer » de l'accueil de l'admin
  monte `FeuilleDeRelance` et `FileDeRelance` ; la frontière `(dashboard)/app/(accueil)` sert `admin`, `lease` et
  `payments` à 44,7 % (plafond relevé de 27 à 45). Elle quitte `admin` comme la fiche du bien, et son plafond est
  resserré sur la mesure. Alternative sans déplacer de clés : TCK-2775 (l'accueil mène à l'écran Impayés par l'URL).
- [ ] **L'accueil sert aussi `maintenance`** (TCK-2624, lot 2, ratifié le 2026-11-13) : la feuille « Valider » du devis
  du bailleur monte `DecisionDuDevis` (TCK-2654), qui lit `maintenance.bailleur.devis` ; la frontière `(dashboard)/app/(accueil)`
  passe à 46,9 % du dictionnaire servi sur HEAD (47,3 % dans l'arbre partagé), plafond écrit par l'outil : 52 %. Le même
  découpage (un espace de la décision du devis hors de `maintenance`) le ramènerait sur la mesure.
- [ ] `src/i18n/namespaces.json` régénéré (`--update`) : `admin` quitte la frontière `(dashboard)/app/properties`,
  son plafond est resserré sur la mesure.
- [ ] Les tests de la relance (écran Impayés, fiche du bien) passent sur les clés déplacées.

## Critères d'acceptation

- [ ] AC1 — `node scripts/check-i18n-namespaces.mjs --report` : la frontière `(dashboard)/app/properties` ne porte
  plus `admin`, et sa part du dictionnaire servi baisse (chiffre avant / après dans le ticket).
- [ ] AC2 — Au navigateur, sur `/app/properties/<id>` d'un bien loué en retard : « Relancer » ouvre la feuille avec
  ses libellés, sans `MISSING_MESSAGE` dans la console ; même chose depuis l'écran Impayés.
- [ ] AC3 — `node scripts/check-i18n.mjs` vert (parité `fr`/`en`/`wo`), et aucune valeur de libellé modifiée
  (diff des valeurs avant / après vide).
- [ ] AC4 — `admin.finances.impayes` ne porte plus les clés déplacées : aucun lecteur ne lit les deux chemins.

## Hors périmètre

- Le contenu de la relance, le lien de paiement, la relance en lot (TCK-2660, TCK-2682).
- Les autres espaces de la frontière `(dashboard)/app/properties`, et `payments`.
- Le découpage de l'espace `admin` au-delà des clés de la relance.

## Notes d'implémentation

_(à remplir par implementing-specs)_
