---
id: TCK-2615
title: "Plus de modale de bienvenue par-dessus un écran plein, après un assistant ou après une publication"
status: todo
phase: P1
family: front
estimate: S
wave: 86
created: 2026-11-10
updated: 2026-11-10
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#onboarding-parcours"
    - "docs/features.md#navigation-de-la-console-selon-le-profil-actif"
tags: [front, onboarding, modal, audit-ux, app]
---

## Objectif utilisateur

La personne qui vient de finir un assistant, de publier son annonce ou qui remplit un écran plein (la création d'un bien) arrive sur ce qu'elle a fait — pas sous une fenêtre « Bienvenue » qui lui réexplique l'espace qu'elle vient de traverser.

## Contrat de données

Aucun changement d'API. Re-mesure sur `dev` (1bce3798a) : la coque de `/app` monte les modales de bienvenue selon les rôles (client, bailleur, agent, agence standard), sur toutes les routes de `/app`, y compris l'écran plein `/app/properties/new` (`ROUTES_PLEIN_ECRAN`) et la première arrivée après un assistant d'invité ; leur fermeture est mémorisée.

## Direction UX / Artistique

- Décision 4 b de l'audit (README, famille 2) : **aucune modale à l'arrivée d'un parcours**. Ce qu'elles expliquaient vit en place, dans « Démarrer » et dans les bulles posées sur l'écran (4 a, porté par la famille 3).
- Rien de neuf à dessiner : la règle retire, elle n'ajoute pas.

## Contraintes strictes (métier)

- La modale ne s'affiche **jamais** : sur une route de la liste des écrans pleins ; à la première arrivée qui suit la fin d'un assistant (bailleur, agent, prestataire, administrateur, hôte) ; à l'arrivée qui suit une publication (TCK-2602).
- Hors de ces cas, le comportement d'aujourd'hui reste tant que la famille 3 n'a pas livré les bulles en place : même condition d'affichage, même mémorisation de la fermeture. **Pas de régression** : une personne qui n'a jamais vu la modale et qui arrive par la porte ordinaire la voit encore.
- Une modale évitée par cette règle n'est pas marquée « vue » : elle reste disponible pour la prochaine arrivée ordinaire.

## Delta à produire

- [ ] Règle d'affichage : écrans pleins, sortie d'assistant, sortie de publication exclus.
- [ ] Tests : `/app/properties/new` → aucune modale ; arrivée marquée « sortie d'assistant » → aucune modale, et la suivante arrivée ordinaire la montre ; arrivée ordinaire d'un nouveau bailleur → la modale, comme aujourd'hui.

## Critères d'acceptation

- [ ] AC1 — Un bailleur qui termine l'assistant d'invité arrive sur `/app` sans `role="dialog"` dans le DOM (sur `dev` : la modale bailleur s'ouvre).
- [ ] AC2 — Sur `/app/properties/new`, aucune modale de bienvenue n'est rendue, quel que soit le rôle.
- [ ] AC3 — Un compte bailleur qui n'a jamais vu la modale et ouvre `/app` par la porte ordinaire la voit encore.

## Hors périmètre

- Les bulles en place et le retrait complet des modales (famille 3, décision 4 a).
- Le contenu de « Démarrer » (TCK-2612, TCK-2614, famille 3).

## Notes d'implémentation

### Re-mesure de la prémisse (2026-11-11, arbre `71c0ea31d`)

- Confirmée : `AppShell` monte cinq fenêtres (client, locataire après le client, bailleur, agent,
  administrateur d'agence `standard`) sur toutes les routes de `/app`, `/app/properties/new`
  compris ; leur fermeture est mémorisée par `welcome-seen` (`useAccueilsVus`).
- Les sorties de parcours : bailleur, agent, prestataire → `router.push('/app'…)` ; administrateur
  d'agence → `router.replace('/app')` ; hôte → `/app/properties/new` (écran plein) ou la demande
  d'agence ; publication (`PropertyWizard`, `terminer`) → `/app/properties/{id}` **sans quitter la
  coque** (la création est déjà sous `/app`). L'assistant de la plateforme sort vers `/super-admin`,
  qui ne monte aucune de ces fenêtres : non marqué.

### Ce qui change

- **La règle vit dans les trois hooks des fenêtres, pas dans la coque** (`src/components/layout/`
  est réservé à la vague de préparation) : `useWelcomeOnce`, `useTenantWelcomeOnce`,
  `useAgencyStandardWelcomeOnce` lisent `useAccueilSuspendu()` (`src/lib/arrivee-de-parcours.ts`).
  Suspendue, une fenêtre ne s'ouvre pas et **rien n'est écrit** dans `welcome-seen`.
- Trois cas suspendent : l'écran plein (`estPleinEcran`, la liste unique de `plein-ecran.ts`) tant
  qu'on y est ; l'arrivée qui suit un assistant ; l'arrivée qui suit une publication.
- **Le marqueur** : `marquerArriveeDeParcours('assistant' | 'publication')`, appelé juste avant de
  partir vers `/app` par les assistants bailleur, agent, prestataire, administrateur d'agence et
  hôte, et par la publication. Hors coque, il est écrit en `sessionStorage`, daté (2 min de
  fraîcheur : un assistant fini puis abandonné ne suspend pas la visite ordinaire suivante) ; la
  coque montée (publication), il suspend la visite en cours tout de suite.
- **La suspension vaut pour la visite** (le montage des fenêtres de la coque, toutes ensemble,
  y compris le locataire qui se monte après le client) et s'éteint quand la coque se démonte :
  l'arrivée ordinaire suivante montre la fenêtre, comme avant. La fin de visite est actée au tour
  suivant, pour qu'un remontage immédiat (StrictMode) ne la coupe pas.
- Choix écarté : un paramètre d'URL (`?arrivee=`) survit au rechargement, au lien copié et au
  retour arrière.

### Tests et ablations

- `src/hooks/__tests__/accueil-suspendu.tck-2615.test.tsx` (19) — les cinq fenêtres RÉELLES :
  AC3 (arrivée ordinaire → `dialog`), AC2 (écran plein → aucun `dialog`, rien de marqué vu), AC1
  (marqueur d'assistant → aucun `dialog` ; démontage puis arrivée ordinaire → `dialog`) ; la
  publication coque montée ; quitter l'écran plein sans publier rend la fenêtre ; marqueur périmé ;
  toutes les fenêtres d'une même arrivée suspendues. ⚠ On compte les `[role="dialog"]` **dans le
  DOM** : une modale ouverte rend le reste `aria-hidden`, et `queryByRole` ne voyait aucune des
  trois fenêtres ouvertes ensemble (le test passait sans correctif, rattrapé avant l'ablation).
- Sorties marquées : assertions ajoutées aux tests de fin de parcours bailleur, agent, prestataire,
  hôte et publication (`PropertyWizard.test.tsx`) ; administrateur d'agence :
  `AgencyAdminOnboardingWizard.arrivee.tck-2615.test.tsx`.
- Ablations (chacune rouge, restaurée par `cp`, `md5` identique) : écran plein ignoré (7 rouges),
  marqueur jamais lu (6), pas de fin de visite (7), chaque fenêtre consomme seule le marqueur (6),
  publication coque montée ignorée (1), fraîcheur ignorée (1), `useWelcomeOnce` sans suspension,
  sortie du bailleur sans marqueur, publication sans marqueur.

### Reste

- Aucune mesure au navigateur : le parcours complet demande un compte invité neuf (ne pas modifier
  un compte de démo) ; AC1 est prouvé sur les fenêtres réelles en jsdom.
- Le retrait complet des modales et les bulles en place : famille 3 (décision 4 a).
