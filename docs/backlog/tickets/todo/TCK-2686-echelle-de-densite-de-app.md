---
id: TCK-2686
title: "Fidélité au pixel : l'échelle de densité de /app — boutons et champs à 44/48 px au téléphone, 36/32 px au bureau, sans toucher au site public"
status: todo
phase: P1
family: front
estimate: M
wave: 91
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2685]
blocks: [TCK-2688, TCK-2689, TCK-2691]
spec_refs:
  features:
    - "docs/features.md#navigation-de-la-console-selon-le-profil-actif"
  models: []
tags: [front, design-system, densite, audit-ux, app, fidelite]
---

## Objectif utilisateur

Dans `/app`, chaque bouton et chaque champ a la hauteur, le padding, la taille de texte et la teinte de la maquette — 44 px sous le pouce au téléphone, 36 px au bureau —, alors que le site public garde les siens.

## Contrat de données

Aucun changement d'API.

- **Lit** : `src/components/ui/field-density.ts` (TCK-468, TCK-2460), `ui/button.tsx`, `ui/input.tsx`, `ui/select.tsx`, `ui/textarea.tsx`, `ui/date-picker.tsx`, `ui/date-time-picker.tsx`, les planchers tactiles de `globals.css` (`.plancher-tactile-*`), la portée `/app` et les jetons de TCK-2685.
- **Produit** : un régime de densité « `/app` », étendu au `Button`, porté par la portée `/app` ; des variantes et une taille de `Button` ; l'aspect des champs.

## Direction UX / Artistique

> **Principe d'arbitrage (décidé par le porteur le 2026-11-10, [ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md))** : la maquette retenue fait foi au pixel, sauf (1) une règle d'accessibilité mesurée, (2) une contrainte technique, (3) une incohérence interne des maquettes, tranchée par la valeur majoritaire. Mesure : téléphone 390 × 844 à `rem` 16, bureau 1440 × 900 à racine 16 et densité ×0,9 ([ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)). Valeurs : [annexe B](../../../qa/audit-ux-2026-11/fidelite/B-composants.md), § 2.2, § 3.1, § 6 n° 1 à 3.

**Ses propres exceptions** :

| Valeur de la maquette | Retenu | Motif |
|---|---|---|
| Contour de champ `border-border` (#ebe5d5, 1,26:1) | `border-input` (#918672, 3,59:1) | (1) WCAG 1.4.11, décision de TCK-753 |
| Focus : `border-primary ring-[3px] ring-primary/15` (halo pâle) | anneau plein `ring-ring` de 3 px | (1) TCK-753 |
| Texte de champ `text-[15px]` au téléphone (20 pages) | 16 px sous `md` | (2) Safari iOS zoome sous 16 px (`input.tsx:15-18`) |
| Petit bouton `h-8` (32 px) au téléphone | plancher de 36 px gardé | (1) cible tactile (planchers de `button.tsx`) |
| Désactivé : aucun dessin dans les maquettes | `opacity-50` du produit | rien à suivre |

### Hauteurs (rendu en px CSS ; au bureau, une valeur de l'échelle (`h-*`, `--spacing`) est rendue à ×0,9 dès 1024, ADR-0107)

| Rôle | Téléphone (sous `md`) | Bureau (dès `md`) | Source |
|---|---|---|---|
| Bouton courant | **44** (`h-11`), `px-3.5`, texte 14 px 500 | **36** (`h-9`, rendu 32,4 à 1440), `px-3.5`, `text-sm` 500 | `chrome-app.tsx:362` (`Bouton`), 461 occ. au téléphone, 403 au bureau |
| Petit bouton | plancher 36 | **32** (`h-8`, rendu 28,8), `px-3`, texte **13 px** (jeton px), `rounded-lg`, `gap-1.5` | 68 occ. ; le produit écrit `text-[0.8rem]` : 11,52 px au bureau au lieu de 13 |
| Action principale (taille de plus) | **48** (`h-12`), `px-5`, texte **15 px** 500 | 48, idem | 145 occ. ; barre collante et formulaires (`?p=app-baux&a=a`, `?p=app-coque&a=a` « Page de détail ») |
| Bouton icône | **44** (`size-11`) | **36** (`size-9`) | flèche, ✕, ⋯ de l'en-tête (C § 2.3) |
| Champ, sélecteur, date (régime `/app`) | **44** (`h-11`), texte 16 px | **36** (`h-9`), `text-sm` | filtres de bureau (16 pages) |
| Champ de formulaire (régime « confortable » existant) | 44 | **44** (`h-11`, rendu 39,6) | formulaires de bureau (11 pages) |

### Variantes de `Button` (sous la portée `/app` seulement)

| Variante | Maquette | Produit aujourd'hui |
|---|---|---|
| contour | `border-border bg-card` (#fff) | `bg-background` (#fcf9f3) |
| douce (`secondary`) | `bg-secondary text-primary-deep font-semibold` | encre `secondary-foreground`, 500 |
| danger | `border border-destructive/30 bg-destructive/10 text-destructive` | sans bordure |
| discrète (`ghost`) | encre douce (jeton de TCK-2685) | `text-foreground` |
| **sombre** (16 pages au bureau, 7 au téléphone : « Faire », « Réessayer ») | `bg-foreground text-background` | absente — à créer : décidé par le porteur le 2026-11-10 (décision 2 a), la maquette fait foi contre la charte (« un seul style de bouton principal »), qui est amendée |
| pilule de l'entrée (`rounded-full h-12`) | 3 pages d'entrée | hors coque : relève des tickets de la vague 86 |

### Champs (sous la portée `/app`)

| Propriété | Valeur |
|---|---|
| Fond | `bg-card` (#fff) au lieu de transparent |
| Padding x | `px-3` (inchangé) |
| Sélecteur de filtre | `font-medium` |
| Zone de texte | `py-2.5 leading-snug` ; hauteur de départ de l'appelant permise (`min-h-*`) |
| Erreur | `border-destructive` + anneau du produit (inchangé) |

## Contraintes strictes (métier)

- **Décision structurelle** : ce ticket **amende TCK-2460** (« une seule hauteur de contrôle ») par [ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), décidée par le porteur le 2026-11-10 (hauteurs 44 au téléphone, 36 au bureau).

**Pas de régression.** Ce qui existe et doit rester :

- **Le site public, `/super-admin`, `(auth)`, `/onboarding`, `/invitations`, `/publish` ne changent pas d'un pixel** : rien hors de la portée `/app`. `Button` a 357 fichiers appelants (35 sous `(dashboard)`), `Input` 128, `Select` 78, `Textarea` 62 : le défaut de chaque primitive reste celui d'aujourd'hui (`h-10`).
- **Le régime « confortable »** (`fieldDensityScope()`, 12 appelants dont `(auth)/layout.tsx`, `PropertyWizard`, `PropertyListFilters`, `WizardReprenable`) garde 44 px partout ; posé **sous** la portée `/app`, c'est lui qui gagne. ⚠ Les deux portées s'appliquent par `:where()` à spécificité égale : seul l'ordre source départage (commentaire de `field-density.ts`) — à éprouver, pas à supposer.
- **`check-champs-uniformes.mjs`** reste vert sans exception nouvelle : aucune hauteur n'est écrite chez un appelant.
- **Les planchers tactiles** (`.plancher-tactile-*`, couche `components`) gardent leur rôle : ils relèvent, jamais ne rabotent.
- **Le contenu en portail** (dialogue, feuille, menu) suit le même régime que la page : la portée de TCK-2685 les atteint.
- La pression `active:scale-[0.96]`, le survol `--primary-deep`, les tailles `xs` et `icon-xs` ne changent pas.
- Libellés : aucun neuf. Si la vitrine en ajoute, `fr`/`en`/`wo` (`wo` = le texte français tel quel), vouvoiement.

## Delta à produire

- [ ] [ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) appliquée : `docs/design-guidelines.md` et l'en-tête de `field-density.ts` la citent comme l'amendement de TCK-2460.
- [ ] Le régime de densité `/app` dans `field-density.ts`, étendu au `Button` (tailles courante, petite, icône) et aux champs (`Input`, `SelectTrigger`, `Textarea`, `DatePicker`, `DateTimePicker`), porté par la portée `/app` de TCK-2685.
- [ ] La taille d'action principale de `Button` (48 px, `px-5`, 15 px).
- [ ] Les variantes du tableau, sous la portée `/app` ; la variante sombre seulement si le porteur la confirme.
- [ ] L'aspect des champs du tableau, sous la portée `/app`.
- [ ] La vitrine (TCK-2685) rend chaque taille et chaque variante, sous la portée `/app`, et un champ de chaque type dans les deux régimes.
- [ ] `docs/design-guidelines.md` § des contrôles (TCK-2460) : l'échelle de `/app` et pourquoi elle diffère du site public.
- [ ] **La densité suit le pointeur, pas seulement la largeur** (décision du porteur, 2026-11-10, « a ») : sous `@media (pointer: coarse)`, la portée `/app` rend les contrôles au régime téléphone (44 px courant, 48 px action principale, 36 px petit bouton), **quelle que soit la largeur** — un iPad à l'horizontale (1024 px) ne reçoit pas des cibles de 32 px. Au pointeur fin, rien ne change par rapport aux AC1-AC2.
- [ ] Tests de rendu des hauteurs et de la préséance « confortable ».

## Critères d'acceptation

- [ ] AC1 — Sur la vitrine, sous la portée `/app` : bouton courant 44 px de haut à 390 et 32,4 px à 1440 ; petit bouton 36 puis 28,8 px avec un texte de 13 px aux deux largeurs ; action principale 48 puis 43,2 px avec un texte de 15 px ; bouton icône 44 puis 32,4 px (`getComputedStyle` / `getBoundingClientRect`).
- [ ] AC2 — Sur la vitrine : `Input`, `SelectTrigger` et `DatePicker` rendent 44 px à 390 avec un texte de 16 px, et 32,4 px à 1440 avec un texte de 12,6 px ; posés dans une portée « confortable » sous la portée `/app`, ils rendent 44 puis 39,6 px. L'ordre inverse des deux règles dans la feuille ferait rougir ce critère.
- [ ] AC3 — Le contour d'un champ de la vitrine est `rgb(145, 134, 114)` et son fond `rgb(255, 255, 255)` ; le bouton contour a un fond `rgb(255, 255, 255)`.
- [ ] AC4 — Un bouton dans un dialogue ouvert depuis une page de `/app` mesure 44 px à 390 (la portée atteint le portail).
- [ ] AC5 — Relevé avant/après (outil de TCK-2684, sinon `getComputedStyle`) de `/fr`, d'une fiche de bien publique, de `/auth/login` et d'une page de `/super-admin`, à 390 et 1440 : zéro écart sur les boutons et les champs.
- [ ] AC6 — `node scripts/check-champs-uniformes.mjs` est vert, avec la même table d'exceptions qu'avant le ticket.
- [ ] AC8 — Sur la vitrine, sous la portée `/app`, avec l'émulation `pointer: coarse` (CDP `Emulation.setEmitTouchEventsForMouse` ou `setTouchEmulationEnabled` + media `pointer`) à 1024 et à 1440 : bouton courant 44 px, action principale 48 px, `Input` 44 px avec un texte de 16 px. Sans l'émulation, à 1024 : 32,4 px (AC1). Une règle posée sur la largeur seule ferait rougir ce critère.
- [ ] AC7 — Sur `/app/customers/new`, une fois le ticket fait, les champs mesurent 44 px à 390 (aujourd'hui 40, B § 3.1).

## Hors périmètre

- Les pages (vagues 86 à 90) : elles adoptent l'échelle sans rien écrire.
- Les boutons et champs des écrans d'entrée hors coque (`(auth)`, `/onboarding`, `/invitations`, `/publish`) : leurs tickets (vague 86) posent la portée s'ils la veulent.
- Une règle générale de 44 px pour toute cible **au pointeur fin** (B § 2.5) : non écrite dans la charte, à décider à part. Au pointeur grossier, elle est tranchée ici (AC8).
- Les puces de filtre et le contrôle segmenté (TCK-2689), le champ de recherche (TCK-2688).

## Notes d'implémentation

_(à remplir par implementing-specs)_
