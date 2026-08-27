---
id: TCK-438
title: "L'attente et l'introuvable de la section publique : quatre écrans sans état de chargement, et un 404 racine qui n'existe pas"
status: todo
phase: P1
family: front
estimate: M
wave: 49
created: 2026-08-27
updated: 2026-08-27
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
    - docs/features.md#112-agence--équipe
  models: []
tags: [front, public, ux, etats, a11y]
---

## Objectif utilisateur

Un visiteur sait toujours où il en est : que la page arrive, qu'elle n'existe pas, ou qu'elle a
échoué — et il n'est jamais renvoyé sur un écran qui n'appartient pas au site.

## Contexte

[TCK-382](TCK-382-app-attente-introuvable-et-titre-onglet.md) a traité ces trois états pour les
quarante écrans de `/app`. **La section publique n'a pas reçu le même passage**, alors qu'elle
est la seule qui soit exposée à des inconnus.

Mesuré le 2026-08-27 :

| Route | Charge côté serveur | `loading.tsx` | `not-found.tsx` |
|---|---|---|---|
| `/properties` | non (client) | ✅ | — |
| `/properties/[slug]` | **oui**, un aller-retour API | ❌ | ✅ |
| `/agencies/[slug]` | **oui**, un aller-retour API | ❌ | ❌ |
| `/agents/[slug]` | **oui**, un aller-retour API | ❌ | ❌ |
| `/bookings` | **oui**, un aller-retour API | ❌ | — |

```
$ find "src/app/(public)" -name "loading.tsx"
  src/app/(public)/properties/(liste)/loading.tsx        ← un seul, et c'est la page cliente
$ ls src/app/not-found.tsx
  No such file or directory
```

Deux conséquences :

**1. Quatre écrans serveur attendent l'API sans rien dire.** Un composant serveur qui `await`
une réponse HTTP bloque la navigation : le clic est fait, l'ancienne page reste, rien ne bouge.
C'est exactement l'état que `loading.tsx` couvre, et c'est le seul des cinq écrans qui n'en a pas
besoin — la liste, cliente — qui en a un.

**2. Il n'existe aucun 404 du site.** Sans `src/app/not-found.tsx`, une URL publique inconnue
tombe sur l'écran par défaut de Next : en anglais, hors de la palette, sans navbar, sans pied de
page, sans aucun moyen de revenir vers le catalogue. C'est ce qu'obtient aussi un visiteur qui
suit un lien périmé vers une agence ou un agent, puisque leurs `notFound()` n'ont pas de
`not-found.tsx` local et remontent jusque-là.

⚠️ **Et l'échec API n'est pas l'inexistence.** `agencies/[slug]` et `agents/[slug]` font tous deux
`try { … } catch { return null }` puis `notFound()` : une API injoignable rend donc « cette agence
n'existe pas », en 404, alors qu'on n'en sait rien. C'est le défaut exact que TCK-335 a corrigé
sur la fiche de bien — dont le `getProperty` distingue depuis `introuvable` et `indisponible` —
et il vit encore sur les deux fiches voisines. Le mauvais coupable est accusé, et le statut HTTP
le grave.

## Contrat de données

Aucun endpoint nouveau. `src/lib/queries/public-property.ts` porte déjà la distinction
`introuvable` / `indisponible` : c'est la forme à reprendre, pas à réinventer.

## Direction UX / Artistique

Les squelettes reprennent la **forme réelle** de la page qu'ils annoncent — la mosaïque de la
fiche, le hero asymétrique d'un profil —, pas un rectangle générique : un squelette qui ne
ressemble pas à ce qui arrive produit un saut de mise en page à l'arrivée.

Le 404 du site est une page d'accueil manquée, pas une page d'erreur : navbar, pied de page,
palette Lin, un `<h1>` qui dit ce qui s'est passé, et un chemin de retour vers le catalogue. Le
`not-found.tsx` déjà livré pour la fiche de bien est la référence de ton.

L'écran d'API injoignable dit qu'on ne sait pas, et propose de réessayer — il n'affirme pas que la
chose n'existe pas.

## Contraintes strictes (métier)

- **Un `notFound()` ne se prononce que sur un 404 amont.** Toute autre panne rend un écran
  d'indisponibilité, en 200, et — leçon mesurée de TCK-335 — avec `robots: { index: false }` :
  une page qui ne sait pas ne s'offre pas à l'indexation.
- Le statut HTTP compte autant que le rendu : la fiche de bien a montré qu'un `notFound()` appelé
  seulement dans le corps de page rend le bon écran en **200**. La forme retenue doit produire un
  vrai 404, et un test doit le mesurer sur le **code**, pas sur le texte.
- Tous les libellés viennent du dictionnaire next-intl, dans les trois langues.
- Le squelette ne doit pas écraser la restauration de défilement en traversée d'historique — la
  contrainte est déjà documentée dans `PropertiesDiscoveryPage` (TCK-335).

## Delta à produire

- [ ] `loading.tsx` pour `/properties/[slug]`, `/agencies/[slug]`, `/agents/[slug]`, `/bookings`
- [ ] `src/app/not-found.tsx` — le 404 du site, avec chrome et chemin de retour
- [ ] `not-found.tsx` pour `/agencies/[slug]` et `/agents/[slug]`
- [ ] Distinction `introuvable` / `indisponible` sur les chargements d'agence et d'agent, sur le
      modèle de `public-property.ts`
- [ ] Tests : code HTTP 404 sur un slug inconnu ; écran d'indisponibilité + `index: false` sur une
      API injoignable ; présence d'un état d'attente sur chaque route serveur

## Critères d'acceptation

- [ ] AC1 — un slug d'agence inconnu rend le **code HTTP 404** et l'écran du site. Le test lit le
      code de la réponse : un test qui n'assertion que le texte passerait sur la 200 d'aujourd'hui.
- [ ] AC2 — l'API injoignable sur une fiche d'agence rend un écran d'indisponibilité, **pas** un
      404, et la page déclare `robots: { index: false }`. Un test l'éprouve en faisant échouer
      l'appel — pas en supprimant l'agence.
- [ ] AC3 — chacune des quatre routes serveur rend un état d'attente pendant la navigation ; un
      test le constate par le rendu du repli, pas par la seule présence du fichier.
- [ ] AC4 — une URL publique inconnue rend le 404 du site, avec navbar, pied de page et un lien
      vers `/properties`, dans la langue active.
- [ ] AC5 — aucun libellé de ces écrans n'est écrit en dur : un test échouerait sur une chaîne
      absente des trois dictionnaires.

## Hors périmètre

- Le rendu serveur de la home et de `/properties` — [TCK-432](TCK-432-accueil-et-liste-sans-rendu-serveur.md).
- Les états d'erreur et d'attente de `/app`, traités par TCK-382.
- Le titre d'onglet des pages publiques, déjà porté par leurs `generateMetadata`.

## Notes d'implémentation

_(à remplir par implementing-specs)_
