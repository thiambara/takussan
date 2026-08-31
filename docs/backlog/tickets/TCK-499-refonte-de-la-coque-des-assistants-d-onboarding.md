---
id: TCK-499
title: "Refonte de la coque des assistants d'onboarding — radio natif, fil d'étapes qui se plie, aucune sortie"
status: done
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

> **Ce ticket est resté `doing` UN JOUR après que son code fut livré et ses suites vertes, parce
> qu'AC2 attendait une MESURE.** Il porte sur ce qu'on VOIT à trois locales et à plusieurs largeurs,
> et l'assistant exige une session authentifiée qu'aucune suite ne fabrique. Le raisonnement « un
> rail vertical ne peut structurellement pas se plier » était juste — et n'a pas suffi : *ce dépôt
> paie assez cher la différence entre un raisonnement juste et une mesure pour ne pas les
> confondre.*
>
> ✅ **Mesuré au navigateur le 2026-08-31**, session réelle, `fr`/`en`/`wo`, **33 relevés** de 320 à
> 1920 px. Détail dans les Notes d'implémentation. Le ticket passe à `done`.

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
- [x] **AC2** — Le fil d'étapes ne passe à la ligne dans aucune des trois locales, à aucune largeur.
      **Mesuré, pas raisonné** : 33 relevés (`fr`/`en`/`wo` × 13 et 10 largeurs, 320→1920 px) sur
      une session authentifiée réelle. Sous 1024 px le rail est `display:none` et c'est le compteur
      qui porte l'information ; à partir de 1024 px, **3 étapes sur 3 rangées distinctes** dans les
      trois locales — une par ligne, donc aucun pli. Zéro débordement de texte, zéro défilement
      horizontal du document. Cf. Notes d'implémentation.
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
- Rien n'en a été sorti : la vérification au navigateur d'AC2 était DANS le périmètre et elle a été
  faite. *L'en sortir aurait supprimé le critère au lieu de le tenir* — c'est ce que cette ligne
  refusait par avance, et elle a servi.
- Les trois autres assistants (propriétaire, agent, prestataire) n'ont pas été ouverts au
  navigateur : ils héritent de la coque et du rail, ce qui est un raisonnement et non un relevé.
  La limite est écrite dans les Notes plutôt que tue.

## Notes d'implémentation

### La mesure d'AC2 — comment, et ce qu'elle vaut

**Le blocage n'était pas la mesure, c'était la session.** `/onboarding/host` exige un compte
authentifié, qu'aucune suite ne fabrique. Levé en trois gestes : `php artisan serve` + `npm run dev`,
un compte créé par `tinker` avec son jeton Sanctum, puis un `POST /api/auth/set-token` **depuis la
page elle-même** — c'est le route handler BFF du front qui pose le cookie httpOnly, donc la session
obtenue est celle d'un vrai utilisateur, pas une simulation.

⚠ **Le compte de mesure rend `roles = ['customer']` et rien d'autre** — c'est exactement le public
de cet assistant, et c'est ce que TCK-492 venait de rendre possible : avant lui, un compte nu
n'avait aucun rôle du tout.

**Le balayage se fait dans une `iframe` dont on pilote la largeur, pas en redimensionnant la
fenêtre.** Les media queries répondent à la largeur du cadre : la mise en page mesurée est réelle, et
13 largeurs tiennent dans un seul appel au lieu de 13 redimensionnements. Ce qui est relevé à chaque
largeur : `display` calculé de l'`<aside>`, le nombre de **rangées distinctes** occupées par les
`<li>` (`Math.round(getBoundingClientRect().top)` dédoublonné — *deux étapes sur la même rangée EST
la définition du pli*), le débordement de texte (`scrollWidth > clientWidth`), et le défilement
horizontal du document.

**Résultat** — bascule nette à **1024 px** (`lg` = 64 rem), identique dans les trois locales :

| Largeurs | Rail | Rangées / étapes | Débordement | Défilement horizontal |
|---|---|---|---|---|
| 320 → 1023 px | `display:none` | — (compteur + barre) | aucun | aucun |
| 1024 → 1920 px | visible | **3 / 3** | aucun | aucun |

Libellés relevés à 1024 px, qui confirment que les trois dictionnaires sont bien servis — *le repli
`fr` sous toute autre locale aurait rendu du français sans le dire* :

- `fr` — « Vous publiez en tant que… » · « Votre espace » · « Récapitulatif »
- `en` — « You're publishing as… » · « Your space » · « Summary »
- `wo` — « Yaa ngi publi ni… » · « Sa espas » · « Résumé »

⚠ **Ce que cette mesure NE prouve pas** : elle porte sur l'assistant **hôte** et sur ses trois
étapes. Les trois autres assistants héritent de la même coque et du même rail, mais n'ont pas été
ouverts au navigateur — *hériter d'un composant est un raisonnement, pas un relevé*, et c'est la
distinction même que ce ticket a tenue pendant un jour.

### Ce que la capture a confirmé au passage

AC1, AC3 et AC4 se lisent sur la même page rendue : la pastille de choix est peinte en `--primary`
(terracotta) et non par l'`accent-color` du système, le rail et le compteur ne coexistent jamais, et
la coque porte « Takussan » et « Retour au site ».

**AC5 a failli être rouvert à tort.** La mention de sauvegarde n'apparaissait pas sur la capture —
elle est sous la ligne de flottaison (page 779 px, fenêtre 695 px). Vérifiée dans le DOM plutôt que
déduite de l'image : *« Vos réponses sont enregistrées au fur et à mesure — vous pouvez reprendre
plus tard. »* Une absence à l'écran n'est pas une absence.

### Trois étapes, pas quatre

Le relevé compte **3** étapes : TCK-496 est vérifié sur l'application qui tourne, et pas seulement
par ses tests.
