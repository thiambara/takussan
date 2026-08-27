---
id: TCK-381
title: "Tableau de bord /app — éteindre la palette Tailwind brute, et étendre le cliquet à ce qu'il ne couvre pas"
status: todo
phase: P2
family: front
estimate: M
wave: 48
created: 2026-08-27
updated: 2026-08-27
depends_on: [TCK-380]
blocks: []
spec_refs:
  features:
    - docs/features.md#25-reporting--tableaux-de-bord
    - docs/features.md#28-internationalisation--préférences
tags: [front, dashboard, design-system, tokens, garde-ci]
---

## Objectif utilisateur

Le tableau de bord parle **une** langue de couleur — celle du produit — et le dépôt refuse
mécaniquement d'en réintroduire une deuxième.

## Contexte

Le dépôt a déjà éteint un vocabulaire de couleur parallèle : TCK-372 a supprimé le dialecte
`--app-*` et posé `scripts/check-app-tokens.mjs`, qui prouve son absence par lecture de texte.
Cette garde est exacte pour ce qu'elle mesure. Elle ne mesure **qu'une** chaîne : `app-<jeton>`.

La palette Tailwind brute, elle, n'est couverte nulle part pour `/app`. Relevé du 2026-08-26,
sur la **clôture d'import réelle** des 46 pages de `/app` (259 fichiers, imports suivis — pas le
répertoire, cf. l'en-tête de `check-app-tokens.mjs`) :

| | |
|---|---|
| Fichiers de la clôture portant au moins une couleur brute | **45** |
| Occurrences | **393** |

Les douze plus chargés : `calendar/CalendarPage` (44), `bookings/BookingDetail` (35),
`leases/LeaseDetail` (28), `visits/VisitDetail` (27), `customer-dashboard/CustomerTagPicker` (25),
`profile/ProfileReviewsList` (22), `property-dashboard/PropertyList` (18),
`customer-dashboard/CustomerList` (15), `ui/toast` (12),
`property-dashboard/PropertyStatusBadge` (12), `profile/ProfileContactSection` (12),
`leases/CreateLeaseForm` (12). Trois pages de `/app` en portent aussi directement : 11 occurrences
(`account/privacy`, `overview/owner`, `payments/return`).

Deux conséquences, dont la seconde ne se voit pas :

1. **`docs/design-guidelines.md` autorise lui-même le doublon**, à la ligne 93 : *« skeleton
   loaders avec `bg-stone-200` **ou** `bg-muted` »*. C'est exactement l'échappatoire que
   `check-app-tokens.mjs` nomme dans son propre en-tête — *« Le « ou ». Une AC alternative ne
   nomme pas un objectif, elle nomme la sortie de secours et l'autorise. »* Le document qui pose
   la règle porte la brèche.
2. **`src/app/globals.css` déclare un bloc `.dark` complet** (l. 172) — et pas une des 393
   occurrences ne bascule avec lui. Un thème sombre existe dans la feuille de style et aucune
   surface du tableau de bord ne le suivrait. *Un thème qu'aucun écran ne peut suivre n'est pas
   un thème, c'est une déclaration.*

Ce ticket est le pendant, pour `/app`, de ce que TCK-358 fait pour la console super-admin — dont
le hors-périmètre dit explicitement : *« Le reste du dépôt : ce ticket ne touche que la console
super-admin. »*

## Contrat de données

Ticket purement frontend. Aucun changement d'API, aucun changement de comportement.

## Direction UX / Artistique

- **Direction retenue : les jetons Lin existants**, ceux que `docs/design-guidelines.md` impose
  déjà. Aucune couleur n'est inventée ; l'écran doit être visuellement indiscernable après la
  substitution, à l'exception des endroits où la palette brute produisait aujourd'hui un écart
  de charte — ceux-là s'alignent.
- La couleur d'**état** (succès, avertissement, danger, information) est le seul cas où la
  substitution n'est pas mécanique : un vert et un rouge y portent du sens. Ils obtiennent leurs
  jetons plutôt que de rester en `emerald-600` / `red-600`.
- La ligne 93 des guidelines se corrige dans le sens de la règle, pas dans celui de l'exception.

## Contraintes strictes (métier)

- Substitutions : `bg-white` → `bg-card` · `border-stone-200|300` / `ring-stone-200` →
  `border-border` / `ring-border` · `bg-stone-50|100` → `bg-muted` · `text-stone-500|600|700` →
  `text-muted-foreground` · `text-stone-900|950` → `text-foreground`. Les couleurs d'état passent
  par des jetons, jamais par une classe brute conservée « parce qu'elle porte du sens ».
- **Le jeton `--warning` est celui de TCK-358** s'il a été livré, et il se crée ici sinon — dans
  `:root` **et** `.dark`. Deux tickets ne créent pas deux jetons du même nom.
- La substitution ne change **aucune** structure : pas de balise déplacée, pas de classe de
  disposition touchée.
- **Un cliquet, sinon rien.** Le motif est déjà revenu deux fois faute de garde — sur les jetons
  `app-*` (TCK-244 → TCK-372) et sur la palette du super-admin (TCK-245 → TCK-358). La garde doit
  mesurer la **clôture d'import**, pas un répertoire, et couvrir la liste complète des préfixes
  d'utilitaires de couleur de Tailwind (`fill`, `stroke`, `placeholder`, `caret`, `from`, `via`,
  `to`, `divide`, `outline`, `decoration` compris) et des variantes (`hover:`, `md:`, `/40`…).

## Delta à produire

- [ ] Jetons d'état dans `src/app/globals.css` (`:root` + `.dark`) et exposition `@theme inline`,
      pour ce que la palette brute portait de sémantique
- [ ] Substitution sur les 45 fichiers de la clôture (393 occurrences) et sur les 3 pages de
      `/app` (11 occurrences)
- [ ] Correction de `docs/design-guidelines.md:93` : la brèche `bg-stone-200` **ou** `bg-muted`
      devient une règle sans alternative
- [ ] Garde `scripts/check-dashboard-tokens.mjs` : calcule la clôture d'import de
      `src/app/(dashboard)/app` et refuse toute classe de palette brute dedans. En-tête portant
      le motif, le relevé chiffré du 2026-08-26, et pourquoi elle suit les imports
- [ ] Branchement de la garde dans `.github/workflows/repo-ci.yml`

## Critères d'acceptation

- [ ] AC1 — sur la **clôture d'import** de `src/app/(dashboard)/app`, hors `__tests__`, aucune
      classe `(text|bg|border|ring|divide|from|via|to|fill|stroke|placeholder|caret|outline|decoration)-(stone|amber|emerald|red|green|blue|slate|gray|zinc|neutral|orange|yellow|rose|sky|indigo|violet|teal|lime|cyan|fuchsia|pink|purple)-[0-9]{2,3}`
      ne subsiste, ni aucun `bg-white`
- [ ] AC2 — `node scripts/check-dashboard-tokens.mjs` sort en 0 sur le dépôt propre et **sort en
      échec** quand on réintroduit volontairement `bg-stone-200` dans
      `src/components/calendar/CalendarPage.tsx` (vérification par ablation : la garde doit être
      prouvée capable d'échouer, pas seulement de passer)
- [ ] AC3 — la garde échoue aussi sur une couleur brute introduite dans un fichier **atteint par
      import** depuis `/app` mais situé hors du répertoire — un fichier de `src/components/ui/`
      fait l'épreuve. C'est le faux négatif qui a coûté TCK-245
- [ ] AC4 — la garde est rejouée par `repo-ci.yml` et son en-tête porte le motif + le relevé du
      2026-08-26
- [ ] AC5 — `docs/design-guidelines.md` ne contient plus d'alternative autorisant la palette brute
- [ ] AC6 — les jetons d'état existent dans `:root` **et** `.dark`
- [ ] AC7 — `npm run lint`, `npx tsc --noEmit`, `npm run test` passent

## Hors périmètre

- **Livrer un thème sombre utilisable** : ce ticket rend les surfaces de `/app` capables de le
  suivre, il n'ajoute ni sélecteur de thème, ni persistance, ni audit de contraste en sombre. Le
  dépôt n'a aujourd'hui aucun basculeur (`grep -rn "setTheme\|next-themes" src` → aucun
  résultat) ; en poser un est une décision qui demande son propre ticket.
- Les espaces publics `(public)` et `(auth)`, et les consoles `/admin` et `/super-admin`
  (TCK-358).
- Les primitives de rendu : TCK-380, dont ce ticket dépend — substituer une fois sur une
  primitive coûte moins que quarante-cinq fois sur ses appelants.

## Notes d'implémentation

_(à remplir par implementing-specs)_
