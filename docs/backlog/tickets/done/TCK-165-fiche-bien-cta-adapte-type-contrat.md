---
id: TCK-165
title: "Fiche bien — CTA adapté au type de contrat (location longue / courte / vente)"
status: done
phase: P2
family: front
estimate: S
wave: 18
created: 2026-05-05
updated: 2026-05-05
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#13-réservations-courte-durée--visites
    - docs/features.md#14-location-longue-durée-baux
tags: [front, bug, p2, smoke-test-2026-05-05, fiche-bien, cta, visiteur-anonyme]
---

## Objectif utilisateur

Sur la fiche bien, le CTA principal proposé au visiteur correspond au type de contrat réellement disponible — un bien en location longue ne doit pas afficher "Réserver" (verbe associé à la location courte / saisonnière) mais bien un libellé adapté au bail (ex. "Postuler" ou "Demander une visite").

## Contrat de données

Le modèle `Property` expose déjà `contract_type` (sale / rent_short / rent_long ou équivalent — confirmer au moment de l'impl à partir de `models-spec.md#3-property` et de l'enum côté code). Le ticket consomme cette donnée sans modification.

## Direction UX / Artistique

- CTA principal selon le type :
  - **Vente** → `Faire une offre`
  - **Location courte / saisonnière** → `Réserver`
  - **Location longue / bail** → `Postuler` (ou `Faire une demande de location`) ; et `Demander une visite` reste un CTA secondaire.
- Le panneau latéral garde sa hiérarchie : un CTA primaire fort + un ou deux CTA secondaires (visite, message).
- Le bouton "Envoyer un message" reste présent dans tous les cas (cf. TCK-161).

## Contraintes strictes (métier)

- Conserver la cohérence avec la spec QA TC-VA-17 Q1 (qui prévoit déjà "Réserver" pour location et "Faire une offre" pour vente — ce ticket précise la sous-distinction location courte vs longue).
- L'action déclenche toujours la modale "Connexion requise" pour un visiteur anonyme (le flow auth ne change pas).
- Conserver TCK-127 (qui a renommé le CTA vente "Faire une offre" → "Réserver" sur certains contextes ; vérifier qu'on ne casse pas son périmètre).

## Delta à produire

- [ ] Helper `getPrimaryCtaForProperty(property)` qui retourne `{ label, action }` selon le `contract_type`.
- [ ] Brancher dans `(public)/properties/[slug]/page.tsx` (panneau CTA latéral).
- [ ] Vérifier la cohérence avec la fiche bien éditée côté agent (le CTA est-il aussi affiché là ? si oui même logique).
- [ ] Tests : un bien `rent_long` affiche `Postuler` ; un `rent_short` affiche `Réserver` ; un `sale` affiche `Faire une offre`.

## Critères d'acceptation

- [ ] Sur une fiche bien `rent_long` (par ex. `maison-de-standing-a-amitie-…`), le CTA primaire n'est plus `Réserver` mais `Postuler` (ou équivalent retenu).
- [ ] Une fiche `sale` affiche `Faire une offre`.
- [ ] Une fiche `rent_short` affiche `Réserver`.
- [ ] Cliquer le CTA en visiteur anonyme ouvre la modale `Connexion requise` adaptée au verbe de l'action.

## Hors périmètre

- Refonte de la modale `Connexion requise` (juste l'adapter au libellé courant).
- Création du tunnel de demande de location longue (relève d'un ticket dédié au flow bail).
- Distinction affichage prix `/ mois` (déjà OK).

## Notes d'implémentation

- Helper `lib/property-cta.ts#getPrimaryCtaForProperty(property)` retourne
  `{ label, action }` avec :
  - `sale` → `Faire une offre` (`offer`)
  - `rent` + `daily`/`weekly` → `Réserver` (`reserve`)
  - `rent` + `monthly`/`yearly` (ou `null`) → `Postuler` (`apply`)
  - default → `Réserver` (filet anti-régression).
- Branché dans `PropertyBookingCard` (panneau latéral),
  `PropertyMobileBottomBar` (bottom bar mobile) et
  `PropertyReservationDialog` (titre + sous-titre + libellé bouton +
  copy de la modale `Connexion requise`).
- Tests unitaires `lib/__tests__/property-cta.test.ts` couvrent les 5
  cas du tableau de décision.
- Pas de modification de la modale "Connexion requise" autre que sa
  copy (titre/description/CTA login restent dans `Dialog` standard).
