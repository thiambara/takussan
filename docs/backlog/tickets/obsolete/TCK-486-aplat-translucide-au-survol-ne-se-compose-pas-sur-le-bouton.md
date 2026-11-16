---
id: TCK-486
title: "Un aplat translucide au survol ne se compose pas sur le fond du bouton : 4,41:1 dans deux composants"
status: obsolete
phase: P2
family: front
estimate: S
wave: 54
created: 2026-08-30
updated: 2026-11-16
depends_on: [TCK-481]
blocks: []
spec_refs:
  features:
    - docs/features.md
tags: [front, design-system, accessibilite, contraste, dette]
---

## Re-vérification du 2026-11-16 (sur dev @ 9112194ec)

**Verdict : caduc — établi le 2026-11-16 par la feuille compilée, voir « Clôture » ci-dessous** (texte d'origine :
« caduc probable ») — le cas que le ticket prévoyait (« s'il tient le seuil, il se ferme en
disant pourquoi »). L'occurrence de `CalendarPage.tsx` a disparu avec la refonte de l'agenda
(0ca317bc8 / 436853053). Celle de `BrandingBanner` a déménagé en
`components/agency/BrandingBanner.tsx:46`, dans un bandeau `bg-warning/10`, rendu en clair seulement.

⚠ **Ce verdict est DÉDUIT de l'ordre des classes Tailwind, pas mesuré au navigateur.** La classe est un
gabarit, pas `cn()` : `twMerge` ne retire rien de la variante `outline` (`ui/button.tsx:43`,
`hover:bg-muted hover:text-foreground`). Les deux `hover:bg-*` coexistent, mais `hover:text-foreground`
n'a pas de concurrent : Tailwind v4 émet les utilitaires à variante après ceux de base, donc l'encre
survolée serait `--foreground`, à **11,93 à 14,87:1** selon le fond qui gagne. Les **4,26 / 4,41:1**
(clair) ne valent que si l'encre restait `text-warning` sur l'aplat translucide.

**Geste qui rendrait le verdict certain** : au navigateur, survoler le bouton du bandeau (accueil
`/app`, agence sans logo) et lire `getComputedStyle(…).color` et `backgroundColor`. Si l'encre est
`--foreground`, fermer en `obsolete` avec ces ratios. Au passage (remarque, pas un reste) : passer la
chaîne par `cn()` rendrait le survol déterministe.

### Clôture (2026-11-16)

La certitude ne vient pas de l'ordre des classes mais de la **spécificité**. Feuille compilée de
`takussan-web/.next/static/chunks/*.css` : `.hover\:text-foreground:hover{color:var(--foreground)}`
(spécificité 0,2,0, la pseudo-classe compte) contre `.text-warning{color:var(--warning)}` (0,1,0).
L'encre survolée du bouton de `BrandingBanner` est donc `--foreground` **quel que soit l'ordre de la
feuille et quel que soit le `hover:bg-*` qui gagne**, soit 11,93 à 14,87:1. Aucun bouton du dépôt ne
compose plus `text-warning` au survol sur `bg-warning/15` sans encre de survol. Fermé en `obsolete`.

## Objectif utilisateur

Un bouton survolé doit rester lisible. C'est l'état où le pointeur est dessus — celui où
l'utilisateur s'apprête à cliquer.

## Le défaut, et le raisonnement faux qui le produit

`takussan-web/src/components/calendar/CalendarPage.tsx:280` et
`takussan-web/src/components/ui/BrandingBanner.tsx:46` *(2026-11-16 : seule reste
`takussan-web/src/components/agency/BrandingBanner.tsx:46` ; l'occurrence de CalendarPage a disparu
avec la refonte de l'agenda)* posent un survol translucide
(`hover:bg-<jeton>/15`) sur un bouton dont le fond au repos est opaque.

**L'intuition dit que l'aplat se compose sur le fond du bouton. Elle est fausse :
`background-color` REMPLACE.** L'aplat se compose donc sur ce qu'il y a *dessous* le bouton — le
bandeau teinté, la carte — et non sur son propre fond. Mesuré le 2026-08-30, en corrigeant
TwoFactorSection (TCK-481) : la même forme y rendait **4,41:1**, sous le seuil, là où le calcul
« sur le fond du bouton » annonçait un chiffre confortable.

⚠ **C'est un défaut de raisonnement avant d'être un défaut de couleur**, et c'est pour ça qu'il
se recopie : les deux occurrences ci-dessus sont la forme que TCK-481 allait reprendre, à
l'identique, avant de la mesurer. *Une forme empruntée à deux endroits du dépôt a l'air d'être
la convention ; elle peut n'être que la première erreur, copiée.*

## Ce qui n'est pas encore mesuré

Les ratios exacts de ces deux occurrences **n'ont pas été relevés** : TCK-481 les a nommées en
sortant de son périmètre, sur la foi de la forme, pas d'un calcul. Le ticket commence donc par
la mesure — et si elles tiennent le seuil, il se ferme en disant pourquoi, ce qui vaut mieux que
de le supposer.

*Relevés par calcul le 2026-11-16 (`scripts/lib/contraste.mjs`) : repos `text-warning` sur `--card`
6,26:1. Au survol, l'encre déduite est `--foreground` (classe `hover:text-foreground` de la variante
`outline`) : 11,93 à 14,87:1. Dans l'hypothèse d'une encre `text-warning` sur `warning/15` composé sur
le bandeau : 4,26 (page `--background`) / 4,41 (page `--card`). Le bandeau n'est sous aucune portée
`.dark` : seul le clair est rendu. Les formes voisines `accueil/pieces.tsx:143` et
`accueil/admin/AFaireAdmin.tsx:423` (`text-destructive hover:bg-destructive/6`) : 5,91 / 6,23:1,
conformes.*

## Contrat de données

Aucun.

## Delta à produire

- [ ] Mesurer les deux occurrences, dans les deux thèmes, sur leur fond RÉEL. *(2026-11-16 : une
      seule occurrence ; calculée, non mesurée au navigateur ; le clair seul est rendu.)*
- [ ] Corriger celles qui sont sous le seuil — la forme retenue par TCK-481 est un survol
      **opaque** (`hover:bg-secondary`), et son commentaire porte la raison.
- [ ] Chercher la forme ailleurs : le relevé de TCK-481 en a nommé deux, mais il cherchait
      `hover:bg-<jeton>/NN` dans un périmètre restreint.

## Critères d'acceptation

- [ ] **AC1** — chaque texte de bouton concerné atteint 4,5:1 dans son état de SURVOL, dans les
      deux thèmes, mesuré sur le fond réellement composé.
- [ ] **AC2** — l'état au repos est mesuré lui aussi : *un correctif du survol qui casserait le
      repos passerait un contrôle qui ne regarde qu'un état.*
- [ ] **AC3** — `node scripts/check-heritage-encre.mjs` reste vert. ⚠ Cette garde ne lit que
      l'état au repos : dire si elle peut voir le survol, ou écrire pourquoi non — *c'est le
      survol qui a rendu 1,00:1 dans TCK-481, pas le repos.*
- [ ] **AC4** — ablation : rétablir la forme translucide fait rougir AC1, changement prouvé par
      `md5` **avant** lecture du résultat.

## Hors périmètre

- Le jeton `--destructive` (TCK-480) et le badge du chat (TCK-485).

## Notes d'implémentation

Relevé par l'agent de TCK-481, qui a écrit `hover:bg-warning/15` en suivant ces deux fichiers,
l'a mesuré à 4,41:1, et a signalé la source plutôt que de la corriger hors de son périmètre.
