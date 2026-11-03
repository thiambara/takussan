---
id: TCK-486
title: "Un aplat translucide au survol ne se compose pas sur le fond du bouton : 4,41:1 dans deux composants"
status: todo
phase: P2
family: front
estimate: S
wave: 54
created: 2026-08-30
updated: 2026-08-30
depends_on: [TCK-481]
blocks: []
spec_refs:
  features:
    - docs/features.md
tags: [front, design-system, accessibilite, contraste, dette]
---

## Objectif utilisateur

Un bouton survolé doit rester lisible. C'est l'état où le pointeur est dessus — celui où
l'utilisateur s'apprête à cliquer.

## Le défaut, et le raisonnement faux qui le produit

`takussan-web/src/components/calendar/CalendarPage.tsx:280` et
`takussan-web/src/components/ui/BrandingBanner.tsx:46` posent un survol translucide
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

## Contrat de données

Aucun.

## Delta à produire

- [ ] Mesurer les deux occurrences, dans les deux thèmes, sur leur fond RÉEL.
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
