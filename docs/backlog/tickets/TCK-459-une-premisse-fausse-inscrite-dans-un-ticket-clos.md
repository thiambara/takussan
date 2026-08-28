---
id: TCK-459
title: "Une prémisse fausse est inscrite dans TCK-371 (`done`), où elle justifie de laisser un contraste à 1,05:1"
status: todo
phase: P2
family: front
estimate: S
wave: 49
created: 2026-08-28
updated: 2026-08-28
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#26-accessibilité
tags: [front, a11y, documentation, dette, dark]
---

## Objectif utilisateur

Aucun directement. Ce ticket protège une décision **future** : il empêche un raisonnement faux de
servir une deuxième fois.

## Contexte

[TCK-371](TCK-371-console-agence-accessibilite-et-mobile.md), statut **`done`**, écrit deux fois —
lignes ~165-168 et ~235-237 :

> « **Le mode sombre reste hors périmètre et reste cassé** : `bg-foreground` vaut `#fcf9f3` sous
> `.dark`, où le `text-white` de la barre mesure **1,05:1**. **Aucune classe `.dark` n'est jamais
> posée** (aucun `ThemeProvider`, aucun `prefers-color-scheme`), donc rien de tout cela n'est
> atteignable aujourd'hui. »

**La prémisse est fausse.** Mesuré le 2026-08-28 : la classe `dark` est posée **littéralement**, en
première position d'un `className`, à **trois** endroits —

```
src/components/layout/SuperAdminSidebar.tsx:224   'dark flex h-full w-64 …'
src/components/layout/SuperAdminTopbar.tsx:49     'dark flex h-14 …'
src/components/layout/SuperAdminShell.tsx:80      <SheetContent className="dark bg-sidebar p-0">
```

Le troisième passe par un **portail** (`SheetContent` rend dans `DialogPrimitive.Portal`) : sa
portée atterrit au niveau du `body`, hors position d'arbre — *aucun raisonnement sur le JSX ne la
trouve*. Les docblocks de TCK-358 disent d'ailleurs explicitement que « la classe `dark` n'est PAS
le mode sombre de l'utilisateur : c'est une surface ».

**La conclusion de TCK-371 survit, et c'est vérifié** : `AppTopbar` — la barre de `/app`, celle
dont il est question — ne porte aucune des trois portées, et rien ne l'enveloppe. Le 1,05:1 reste
effectivement inatteignable. **Ce ticket ne rouvre donc pas TCK-371.**

## Pourquoi ça mérite quand même un ticket

Parce que le raisonnement est inscrit dans un **ticket clos**, et qu'un ticket clos est le
véhicule idéal pour faire repousser une erreur : *personne ne le relit, tout le monde le cite.*

Le même énoncé a déjà servi **cinq fois** dans le dépôt — dans la sortie `--report` d'une garde,
dans le docblock de cette garde, dans `src/test/contraste-wcag.ts`, dans
`chrome-publique.contraste.test.tsx`, et enfin dans la correction de ces deux derniers, **qui
était elle-même une énumération incomplète** (elle disait « les deux composants »). Les quatre
premières sont corrigées ; celle-ci ne l'est pas, et c'est la seule dont la fonction est de
**justifier de ne pas corriger un défaut mesuré**.

⚠️ L'angle mort qui a produit l'erreur, à conserver : la vérification cherchait un **mécanisme** —
`ThemeProvider`, `next-themes`, `documentElement.classList` — et les trois sont réellement
absents, *ce qui est précisément ce qui l'a rendue convaincante*. Elle n'a pas cherché **une
classe littérale dans un `className`**, qui est pourtant la façon la plus simple de poser une
classe. *Chercher l'outil et pas le geste : on ne trouve alors que les usages sophistiqués.*

## Critères d'acceptation

1. Les deux passages de TCK-371 disent ce qui est vrai : la classe **est** posée, à des portées
   locales, et le 1,05:1 reste inatteignable **parce qu'`AppTopbar` n'est enveloppé par aucune
   d'elles** — pas parce que rien ne pose la classe.
2. L'énoncé corrigé **ne réénumère pas**. C'est l'énumération qui a échoué deux fois ; la
   remplacer par « trois » reconduirait le défaut avec un chiffre de plus. Renvoyer vers la
   commande qui **dérive** les portées.
3. ⚠ Le piège du relevé est écrit : **`variant="dark"` est une PROP, pas la classe** — un `grep`
   naïf en compte quatre.
4. Le 1,05:1 lui-même est **re-jugé** : il était classé « hors périmètre » sous une prémisse
   fausse. Soit il reste hors périmètre pour une raison qui tient, soit il rejoint le backlog.
   *Une décision prise sous une prémisse fausse n'est pas confirmée par le fait que sa conclusion
   se trouve juste.*

## Notes

Voir aussi [TCK-452](TCK-452-theme-sombre-inatteignable.md), qui porte le même redressement côté
mécanisme, et [TCK-458](TCK-458-contraste-de-la-pastille-de-contrat.md), qui étend la mesure de
contraste à toute la surface publique.
