---
id: TCK-499
title: "Refonte de la coque des assistants d'onboarding — radio natif, fil d'étapes qui se plie, aucune sortie"
status: doing
phase: P1
family: front
estimate: M
wave: 56
created: 2026-08-30
updated: 2026-08-31
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#21-authentification--comptes
tags: [front, onboarding, design-system, ux, i18n, a11y]
---

> **`status: doing`, et il le reste après le merge — délibérément.** Le code est livré et toutes les
> suites sont vertes, mais **AC2 n'est pas mesuré** : il porte sur ce qu'on VOIT à trois locales et à
> plusieurs largeurs, et l'assistant exige une session authentifiée qu'aucune suite ne fabrique.
> Un rail vertical ne PEUT structurellement pas se plier — c'est un raisonnement, pas une mesure, et
> ce dépôt paie assez cher la différence pour ne pas cocher un critère sur cette base.
>
> **Ce qui reste à faire pour passer à `done`** : ouvrir `/onboarding/host` sur une session réelle,
> en `fr`, `en` et `wo`, à trois largeurs, et regarder le rail.

## Objectif utilisateur

Quelqu'un qui entre dans un assistant d'onboarding sait où il est, combien il reste, qu'il peut
partir et revenir — et voit une interface qui ressemble au site qu'il vient de quitter.

## Contrat de données

**Aucune.** Ce ticket ne touche ni endpoint, ni charge utile, ni brouillon. `WizardReprenable`
conserve intégralement sa logique — l'hydratation pendant le rendu (TCK-316), la lecture du sort de
`flush()` sur les deux sites (TCK-475), le garde par ref du toast de succès (TCK-483). Ces trois
correctifs portent des défauts déjà payés : **seul le rendu est remplacé.**

## Direction UX / Artistique

**Sept défauts sur une seule capture, chacun avec une cause structurelle** — relevés le 2026-08-30
sur `preview.takussan.com/onboarding/host` :

| Ce qu'on voit | Ce qui le produit |
|---|---|
| Un point bleu dans une page terracotta | `<input type="radio">` non stylé → peint par l'`accent-color` du système. Quatre surfaces du dépôt roulaient leur propre radio |
| Le fil d'étapes passe à la ligne | `<ol>` horizontal en `flex-wrap` : le pli dépend de la **longueur des traductions**, il ne tombe pas au même endroit en `fr`, `en` et `wo` |
| La même information trois fois | barre de progression + pastilles numérotées + titre d'étape, tous porteurs du même message |
| Rien ne s'aligne | page en `max-w-3xl` au-dessus d'un assistant en `max-w-2xl` |
| Des cartes dans une carte | le corps d'étape était encarté, et ses options sont déjà des cartes |
| Aucune issue | l'assistant est servi hors `(dashboard)` et hors `(public)` : ni logo, ni sortie. On n'en repart qu'avec le bouton *Précédent* du navigateur |
| La sauvegarde ne se dit qu'après | l'enregistrement automatique existe depuis TCK-250 et ne s'annonçait qu'**en quittant** la page |

**La direction retenue.** Un rail d'étapes vertical à partir de `lg` — en colonne, il n'y a plus de
pli à placer, quelle que soit la langue — remplacé sous cette largeur par un compteur et une barre,
jamais les deux à la fois. Une coque commune portant le nom de marque, une sortie, et la mention de
la sauvegarde automatique **pendant** la saisie. Le corps d'étape n'est plus encarté.

**La primitive de choix garde l'input natif.** `ChoiceCard` place un `<input type="radio">` en
`sr-only` et n'en reprend que la peinture : la navigation clavier d'un groupe de radios — flèches,
bouclage, un seul arrêt de tabulation — est un comportement du navigateur qu'aucune réimplémentation
ne rend gratuitement.

**Les animations réemploient le vocabulaire existant.** `.wizard-step-in-forward` /
`.wizard-step-in-back` (TCK-464) portent déjà la direction comme sens, et la garde
`prefers-reduced-motion` de `globals.css` **nomme déjà ces classes** — donc zéro CSS ajouté et
aucune garde à étendre.

Référence obligatoire : [`docs/design-guidelines.md`](../../design-guidelines.md).

## Contraintes strictes (métier)

1. **Aucune modification de la logique de `WizardReprenable`.** TCK-316, TCK-475 et TCK-483 vivent
   dans ce fichier ; leurs commentaires disent ce qu'ils ont coûté et pourquoi la forme est celle-là.
2. **La coque est un composant, pas une copie.** Elle était recopiée au caractère près dans quatre
   pages — hôte, propriétaire, agent, prestataire —, si bien qu'une correction devait être appliquée
   quatre fois pour être vraie.
3. **Le mouvement réemploie les classes existantes** plutôt que d'en introduire de nouvelles, faute
   de quoi la garde `prefers-reduced-motion` cesserait de couvrir ce qu'elle couvre.
4. **Le nom de marque passe par `common.appName`** : la garde i18n refuse un libellé en dur sur un
   fichier neuf, et elle a raison.
5. **Le front possède le texte affiché** (principe non négociable n° 5) : `fr`, `en`, `wo` dès le
   premier commit — le repli de `fr` sous toute autre locale rend une clé non traduite invisible.

## Delta à produire

**Frontend — intentionnel**

- [x] Primitive `ChoiceCard` / `ChoiceCardGroup` dans `components/ui/` — input natif conservé en
      `sr-only`, états défaut / survol / focus / retenu / désactivé
- [x] `WizardReprenable` — rail vertical à partir de `lg`, compteur et barre en dessous, corps
      d'étape désencarté, animation directionnelle réemployée
- [x] Coque `OnboardingShell` — nom de marque, sortie, mention de la sauvegarde automatique —
      appliquée aux quatre pages qui recopiaient la même
- [x] L'étape « mode » de l'assistant hôte passe à `ChoiceCard`
- [x] Libellés `fr` / `en` / `wo` ; table des espaces de noms i18n régénérée
- [x] Tests : `choice-card.test.tsx` (7 cas, dont l'arrêt de tabulation unique) ; les suites
      existantes des quatre assistants restent vertes sans être réécrites

## Critères d'acceptation

- [x] **AC1** — Aucun `<input type="radio">` non stylé ne subsiste dans l'assistant hôte : l'état
      retenu se peint avec les jetons de la palette, jamais avec l'`accent-color` du système.
- [ ] **AC2** — Le fil d'étapes ne passe à la ligne dans aucune des trois locales, à aucune largeur.
      ⚠ **NON MESURÉ** — cf. l'encadré en tête de ticket. Le seul critère qui reste ouvert.
- [x] **AC3** — Un seul indicateur de progression est visible à la fois.
- [x] **AC4** — Toute page d'onboarding porte le nom de marque et une sortie vers le site.
- [x] **AC5** — La sauvegarde automatique est annoncée **pendant** la saisie, pas seulement au
      départ.
- [x] **AC6** — La navigation clavier du groupe de choix est celle d'un groupe de radios natif :
      flèches, bouclage, un seul arrêt de tabulation. Épinglé par
      `components/ui/__tests__/choice-card.test.tsx`, **vérifié par ablation** : donner à chaque
      radio un `name` distinct fait rougir exactement les deux tests qui prétendent le mesurer.
- [x] **AC7** — Aucune classe d'animation neuve : les classes employées sont celles que la garde
      `prefers-reduced-motion` de `globals.css` nomme déjà.
- [x] **AC8** — `npm run lint` 0 erreur, `npx tsc --noEmit` propre, `npm run test` vert,
      `node scripts/check-i18n.mjs` et `node scripts/check-i18n-namespaces.mjs` verts.

## Hors périmètre

- Le nombre et le contenu des étapes de l'assistant hôte → TCK-496 pour le mode de paiement.
- Le sélecteur de profil et ses deux entrées homonymes → TCK-497.
- La refonte des corps d'étape des trois autres assistants : ils héritent de la coque, leurs champs
  ne sont pas retouchés.
- Rien : la vérification au navigateur d'AC2 est DANS le périmètre, elle n'est simplement pas
  faite. La sortir du périmètre reviendrait à supprimer le critère plutôt qu'à le tenir.

## Notes d'implémentation

_(à remplir par implementing-specs)_
