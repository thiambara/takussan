---
id: TCK-501
title: "Messagerie pleine page — deux panneaux fixes sur un écran de téléphone"
status: done
phase: P2
family: bug
estimate: S
wave: 57
created: 2026-08-31
updated: 2026-08-31
depends_on: [TCK-500]
blocks: [TCK-503]
spec_refs:
  features:
    - docs/features.md#17-communication--messagerie
  models:
    - docs/models-spec.md#18-conversation-
tags: [front, bug, messaging, responsive]
---

## Objectif utilisateur

Un utilisateur qui ouvre sa messagerie depuis un téléphone doit pouvoir lire ses conversations et
écrire dedans.

## Contrat de données

Aucun changement d'API. Le défaut est entièrement de mise en page.

## Direction UX / Artistique

Sous le point de rupture `md`, la messagerie montre **une chose à la fois** : la liste des
conversations, ou la conversation ouverte — avec un retour vers la liste. C'est le partage
habituel d'une boîte de réception sur téléphone, et c'est déjà celui que la vue compacte du
panneau flottant applique.

Au-dessus, rien ne change : les deux panneaux côte à côte restent le bon écran.

## Contraintes strictes (métier)

1. Un utilisateur entré sur une conversation depuis un lien (`?conversation=`, `?property=`) doit
   pouvoir **revenir à la liste** ; sans quoi le lien mène à un cul-de-sac.
2. La hauteur ne peut pas rester `calc(100vh - 12rem)` sur un téléphone, où la barre d'adresse
   mobile fait varier `100vh`.

## Delta à produire

- [ ] Mise en page de la messagerie pleine page : une seule colonne sous le point de rupture,
      deux au-dessus.
- [ ] Retour vers la liste depuis une conversation, visible uniquement sous le point de rupture.
- [ ] Tests : la liste et la conversation ne sont pas rendues ensemble sous le point de rupture ;
      le retour ramène à la liste.

## Critères d'acceptation

- [ ] AC1 — à 390 px de large, `/app/messages` sans conversation choisie montre la **liste seule**,
      pleine largeur, sans défilement horizontal.
- [ ] AC2 — à 390 px, une conversation ouverte occupe **toute** la largeur : aucun mot du fil ni du
      composeur ne se coupe en colonne d'un mot par ligne.
- [ ] AC3 — à 390 px, depuis une conversation ouverte par `?property=` ou `?conversation=`, un
      retour ramène à la liste.
- [ ] AC4 — à 1440 px, l'écran est **inchangé** : liste 320 px à gauche, conversation à droite.
- [ ] AC5 — le test rougit si la classe responsive est retirée (ablation).

## Hors périmètre

- Le panneau flottant, qui ne s'affiche pas sous le point de rupture par construction.
- Toute évolution fonctionnelle de la messagerie.

## Notes d'implémentation

**Le partage est fait en JS, pas par un `hidden` Tailwind — et c'est la seule décision du ticket.**
Les deux panneaux montent chacun un sondage réseau (`ConversationList` toutes les 10 s, `ChatView`
toutes les 3 s). Un panneau caché en CSS reste monté et continue de sonder : sur un téléphone, on
aurait payé les deux. Le gate lit `useMatchesMaxWidth(767)` — la valeur `md` de Tailwind moins un —
et la classe `md:grid-cols-[320px_1fr]` reste sur le conteneur pour l'AC4. Les deux couches
basculent au même pixel ; s'en écarter créerait une largeur où le CSS montre deux colonnes et le JS
n'en remplit qu'une.

**`selectedId: number | null` est devenu `choix: number | null | undefined`, et le troisième état
est ce que la contrainte 1 exigeait.** « Retour à la liste » est un CHOIX, qui doit l'emporter sur
l'URL — laquelle, elle, ne bouge pas. La version qui remettait simplement la sélection à `null`
rendait la main à `?conversation=42`, qui rouvrait aussitôt la même conversation : le lien restait
un cul-de-sac, avec en plus un clignotement. Le booléen `brouillonEcarte` disparaît dans la
foulée : « un choix a été fait » et « le brouillon est écarté » sont le même fait.

**Le bouton retour est désormais gouverné par la PRÉSENCE de `onBack`, plus par `variant`.**
`PropertyDraftChatView` n'avait plus que cet usage de sa prop `variant`, qui a donc disparu (le
widget ne la passe plus). `ChatView` garde la sienne — elle distingue encore trois autres
comportements de groupe.

**`100vh` → `100dvh`** (contrainte 2). Sur téléphone `100vh` vaut la hauteur barre d'adresse
*rétractée* : le composeur, dernière ligne de l'écran, passait sous le pli tant que la barre était
déployée. ⚠ `AppShell` reste en `h-screen` (`100vh`) — hors périmètre, mais c'est le même défaut un
cran plus haut, et il vaudra son propre ticket.

**Ablations (AC5), les trois rouges puis vert restauré** : gate JS retiré → 5 rouges ;
`md:grid-cols-[320px_1fr]` retirée → 1 rouge ; `dvh` remis en `vh` → 1 rouge.

**Vérification** : `MessagesPage.test.tsx` 13 verts, suite front entière 3116 verts, `npm run lint`
0 erreur, `tsc --noEmit` propre. **Non vérifié au navigateur** — les AC sont formulés en pixels
(390 / 1440) et les tests portent sur ce qui est monté, pas sur ce qui est peint.
