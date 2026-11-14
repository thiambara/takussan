---
id: TCK-2825
title: "« Comparer » sur une carte de favori, sous /app au téléphone, ne mène nulle part : la pastille du comparateur s'efface hors de la barre publique"
status: todo
phase: P2
family: front
estimate: S
wave: null
created: 2026-11-14
updated: 2026-11-14
depends_on: []
blocks: []
spec_refs:
  features: []
  models: []
  adr:
    - "docs/adr/0091-la-navigation-mobile-du-site-public-suit-le-profil.md"
  tickets:
    - docs/backlog/tickets/done/TCK-2618-menus-et-onglets-par-persona.md
    - docs/backlog/tickets/todo/TCK-2738-listes-de-favoris-orphelines-et-outil-de-fidelite.md
tags: [front, defaut, comparateur, favoris, app, mobile, suivi-lot-2]
---

## Objectif utilisateur

La personne connectée qui touche « Comparer » sur une carte de `/app/favorites` au téléphone voit que le bien est
ajouté, et trouve le chemin vers le comparatif. Aujourd'hui, le bouton change d'état, et rien d'autre ne se passe :
pas de pastille, pas de barre, pas de toast.

## Contexte

Relevé pendant la vérification de TCK-2618 (« Ajouts » de TCK-2738), qui note que le défaut est antérieur à TCK-2618.
Re-mesuré dans le code le 2026-11-14, au HEAD de `feat/audit-ux-app-lot-3` (1db3d00ca) :

- Chaque carte de la page des favoris porte `CompareToggleButton` (`components/favorites/suivi/CarteDeSuivi.tsx`,
  `surface="page"`).
- Les layouts de `/app/favorites` et `/app/saved-searches` montent `CompareProvider` et `CompareFloatingBar`.
- Dans `CompareFloatingBar`, sous `lg`, la barre devient une pastille au-dessus de la barre d'onglets PUBLIQUE et
  s'efface ailleurs : `effaceeParUneAutreCouche = sousLg && !porteLaBarrePublique(chemin)`. Or
  `porteLaBarrePublique('/app/favorites')` est faux (`lib/navigation/barre-publique.ts`, chemin hors du site public).
  Sous `lg`, rien du comparateur n'est donc rendu sous `/app`. En bureau, le dock s'affiche.

Non relevé au navigateur pour ce ticket. Le premier geste de l'implémentation est de le reproduire à 390 (persona
client avec au moins un favori disponible, `node takussan-web/scripts/fidelite/fidelite.mjs jetons --persona …`).

## Décision

À trancher par le porteur avant l'implémentation. ADR-0091 § 4 pose « une seule couche d'action en bas » :

- **a) Monter la pastille sous `/app`**, au-dessus de la barre d'onglets de la coque (`data-slot="barre-onglets"`,
  `--barre-onglets-hauteur`), comme sur le site public. Le comparateur reste un geste de la page des favoris.
- **b) Retirer « Comparer » des cartes sous `lg` dans `/app`.** Le bouton ne promet plus rien, et le comparatif
  reste accessible en bureau et depuis le site public.

Recommandation : **a**. La page est la même que celle du site (TCK-2618), et le geste y fonctionne. Le retirer
d'un seul côté ferait diverger les deux pages.

## Contrat de données

Aucun.

## Contraintes strictes

- Une seule couche d'action en bas (ADR-0091 § 4). Sous `/app`, la pastille se pose au-dessus de la barre d'onglets
  de la coque, jamais par-dessus, et s'efface là où la coque n'a pas de barre (plein écran, conversation ouverte).
- `CompareFloatingBar` est partagé avec le site public. Le site public ne change pas : les tests de la pastille
  publique restent verts tels quels.
- Les ombres du comparateur sont le sujet de TCK-2741. Ne pas les retoucher ici.

## Delta à produire

- [ ] Selon la décision : la règle d'effacement de `CompareFloatingBar` connaît la coque de `/app` (a), ou
      `CarteDeSuivi` ne rend pas « Comparer » sous `lg` dans `/app` (b).
- [ ] Un test sur la page de route `/app/favorites` (montée comme dans `favoris-dans-la-coque.tck-2618.test.tsx`),
      sous `lg` : après « Comparer », la pastille est rendue et mène au comparatif (a), ou le bouton n'est pas rendu (b).

## Critères d'acceptation

- [ ] AC1 — À 390, sous `/app/favorites`, toucher « Comparer » sur un favori disponible rend un retour visible :
      la pastille, au-dessus de la barre d'onglets, qui mène à `/compare` (a). Avec b, le bouton est absent.
- [ ] AC2 — La pastille ne recouvre pas la barre d'onglets : son bas est au-dessus du haut de la barre (relevé à 390).
- [ ] AC3 — Le site public est inchangé : `/fr/favorites` à 390 rend la pastille comme avant, et ses tests sont
      verts sans retouche.
- [ ] AC4 — En bureau (1280), le dock de `/app/favorites` est inchangé.

## Hors périmètre

- Les ombres du comparateur flottant (TCK-2741).
- Le comparateur sur les autres écrans de `/app`, qui ne portent pas de bouton « Comparer ».

## Notes d'implémentation

Re-mesure au navigateur, 2026-11-14 (CDP, 390×844, persona agent, quatre favoris, `/app/favorites`) : deux taps
sur « Comparer » → `aria-pressed` vrai sur les deux, `takussan.compare.v1` = `{"ids":[18,137],…}`, aucune
pastille, aucun lien `/compare`, aucun toast, l'URL ne change pas. Cause lue : `CompareFloatingBar` rend `null`
sous `lg` quand `!porteLaBarrePublique(chemin)` (`effaceeParUneAutreCouche`).
