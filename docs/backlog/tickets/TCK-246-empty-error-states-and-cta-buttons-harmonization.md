---
id: TCK-246
title: "Empty / error states + CTA shadcn — harmonisation transverse"
status: review
phase: P2
family: front
estimate: M
wave: 27
created: 2026-05-09
updated: 2026-08-15
depends_on: [TCK-129]
blocks: [TCK-291]
spec_refs:
  features:
    - docs/features.md#25-reporting--tableaux-de-bord
    - docs/features.md#29-administration--configuration
  models: []
tags: [front, design-system, empty-state, error-state, cta, shadcn]
---

## Objectif utilisateur

L'utilisateur (locataire, agent, bailleur, super-admin) rencontre des états vides et des écrans d'erreur réutilisables, accueillants et cohérents — pas des blocs ad-hoc en `bg-app-surface-1 text-red-600` ou `border-dashed bg-stone-50`. Les CTA principaux du dashboard sont tous des boutons DS (et non des `<Link>` stylés).

## Contrat de données

- Ticket purement frontend. Aucun changement d'API.
- Création d'un `<EmptyState>` et d'un `<ErrorState>` partagés dans `src/components/feedback/`.

> ⚠️ **Correction du 2026-08-15.** La version d'origine prescrivait « réutilisation d'`<Alert>`
> shadcn (variant `destructive`) ». Ce composant **n'existe pas dans ce dépôt et ne peut pas y
> exister** : `<Alert>` shadcn est bâti sur Radix, et il n'y a aucune dépendance Radix ici
> (`components.json` → `@base-ui/react`). L'équivalent existait déjà et n'avait **qu'un seul
> consommateur** : `ui/destructive-banner.tsx`.

## Direction UX / Artistique

- **EmptyState** : icône `lucide-react` dans une pastille, titre `font-display`, sous-titre en
  `text-muted-foreground`, CTA principal optionnel.
- **ErrorState** : bâti sur `DestructiveBanner` (tokens `--destructive`, `role="alert"`) — jamais
  de `text-red-600` brut sur du `bg-app-surface-1`, jamais de `bg-red-50`.
- **Spinners** : bannir les `border-stone-200 border-t-stone-900` ad-hoc. *Il n'existe aucun
  « spinner DS » dans ce dépôt* — les 60 autres `animate-spin` sont des icônes lucide, et c'est
  l'idiome à suivre.
- **CTA dashboard** : `buttonVariants()` posé sur un `<Link>` (28 fichiers l'utilisent déjà).
  **Pas `<Button asChild>`** : `asChild` est une API Radix, `rg asChild src` = 0 occurrence.

## Contraintes strictes (métier)

- **Un seul `<EmptyState>`, exporté depuis `src/components/feedback/`.** Le nom était déjà pris
  **onze fois** comme fonction privée locale, jamais exportée. Une convention non gardée a été
  violée onze fois : ce ticket livre donc **aussi la garde**.
- **Le composant partagé reste présentationnel** — ni `'use client'`, ni `useTranslations`. Quatre
  des surfaces visées sont des server components `async` ; un hook de traduction dans le composant
  en ferait une frontière client et casserait leur import.
- **Les libellés des écrans migrés passent par next-intl, dans `fr`, `en` ET `wo`.** Le wolof est
  traduit, pas recopié du français.
- **Aucun spinner ad-hoc `border-stone-*`.**
- **Aucun bouton fait main** sur les surfaces touchées : `buttonVariants()` ou `<Button>`.

## Delta à produire

### Les composants et la garde

- [x] `src/components/feedback/EmptyState.tsx` — props `{icon?, title, description?, action?,
      className?}` + spread des props résiduelles (`data-testid`, `col-span-full`).
- [x] `src/components/feedback/ErrorState.tsx` — props `{message, icon?, onRetry?, retryLabel?}`,
      `onRetry` et `retryLabel` liés par le typage.
- [x] `src/components/feedback/index.ts` — baril.
- [x] `scripts/check-feedback-states.mjs` + branchement dans `repo-ci.yml`.
- [x] Documentation des deux composants dans `docs/design-guidelines.md`.

### Les 17 écrans du périmètre décidé

Les 8 nommés à l'origine :

- [x] `/app/inventories` · `/app/inventories/new` · `/app/maintenance` · `/app/leases`
- [x] `/app/favorites` · `/app/saved-searches` · `/admin/team` · `/admin/agency`

Les 8 qui avaient chacun recopié leur propre `EmptyState` :

- [x] `ModerationWorkspace` · `PropertyModerationWorkspace` · `PropertyList` (portefeuille)
- [x] `PropertiesDiscoveryPage` · `PublicFavoritesPage` · `CustomerList` · `CompareClient`
- [x] `DocumentsLibrary` (branche simple seulement — cf. Notes)

Et :

- [x] `/app/payments/return` — le spinner CSS hors palette, seul hit de l'ancien AC3.

### Les CTA

- [x] `/app/profile` — « Gérer les préférences » et « Voir mes avis » → `buttonVariants({variant:'outline'})`.
- [x] Les liens primaires faits main à l'intérieur des états vides migrés (`PropertyList`,
      `CustomerList`, `CompareClient`) → `buttonVariants()`.
- [x] ~~`/app/customers`, `/app/leases`, `/app/properties`~~ — **déjà faits** avant ce ticket,
      retirés du delta (cf. Notes).

## Critères d'acceptation

- [x] AC1 — `<EmptyState>` / `<ErrorState>` sont définis une seule fois et consommés par les
      **17 fichiers** de la liste ci-dessus (`rg -l "from '@/components/feedback'" takussan-web/src`
      = 17 hors tests). Le 17ᵉ écran, `/app/payments/return`, ne porte qu'un spinner et n'importe
      donc rien.
- [x] AC2 — `rg 'function (\w*)(Empty|Error)State' takussan-web/src --glob '!components/feedback/**'`
      ne renvoie que `OwnerEmptyState`, seul écart assumé et tracé (TCK-291).
      *L'AC2 d'origine (`grep -RE "rounded-xl bg-app-surface-1 [^"]*text-red" src/app`) était
      **vacue** : les 16 occurrences réelles vivent sous `src/components`, hors de son périmètre.
      Il renvoyait 0 sans qu'aucun travail n'ait été fait. Le reste part en AC1 de TCK-291.*
- [x] AC3 — `rg 'border-stone-200 border-t-stone-900' takussan-web/src` ne renvoie aucun résultat.
- [x] AC4 — les CTA du delta passent par `<Button>` ou `buttonVariants()`, jamais par `asChild`.
- [x] AC5 — `node scripts/check-feedback-states.mjs` est vert, et **prouvé par mutation** :
      réintroduire une définition locale, un état vide ad-hoc ou un bloc d'erreur en palette brute
      le fait rougir ; laisser un plafond non resserré aussi.
- [x] AC6 — `npx tsc --noEmit`, `npx eslint <fichiers touchés>` et `npm run test` passent.
      *(`npm run build` n'est plus cité : sous Next 16 il ne lance PAS ESLint — c'est exactement
      ce qui a laissé vivre une erreur bloquante 53 jours sur `dev`.)*
- [x] AC7 — chaque libellé posé existe dans `fr`, `en` et `wo`.

## Hors périmètre

- Le reste du parc (~24 états vides et 12 blocs d'erreur, surtout super-admin et administration)
  → **TCK-291**, ouvert par ce ticket.
- Migration de masse des tokens legacy (TCK-244) · palette stone super-admin (TCK-245) ·
  pages publiques `/agencies/[slug]` et `/agents/[slug]` (TCK-242).
- La résorption i18n générale du frontend (TCK-286).

## Notes d'implémentation

**Le ticket avait DÉRIVÉ de trois mois.** Écrit le 2026-05-09 contre
`docs/design-audit-2026-05-09.md`, qui se décrit lui-même comme une « lecture statique des
`page.tsx` » — il n'avait jamais ouvert `src/components`, là où vivaient 10 des 11
réimplémentations et 16 des 16 blocs d'erreur. Cinq de ses items étaient sans objet au moment de
l'implémenter : les trois CTA de `/app/{leases,customers,properties}` passaient déjà par
`buttonVariants()`, `/app/customers/[id]` n'avait plus de bloc rouge, et `/app/payments/return`
était déjà entièrement i18n. Ils sont barrés dans le delta plutôt que supprimés : un item retiré
en silence se réouvre à la revue suivante.

**Deux prescriptions du ticket étaient inapplicables**, et les suivre à la lettre aurait produit
du code qui ne compile pas : `<Alert variant="destructive">` (composant Radix, absent) et
`<Button asChild>` (API Radix, `rg asChild src` = 0). L'idiome du dépôt est `buttonVariants()` sur
un `<Link>`. Introduire `render={<Link/>} nativeButton={false}` — l'équivalent base-ui, utilisé une
seule fois dans tout le dépôt — aurait créé un TROISIÈME idiome de bouton-lien, l'inverse du but.

**Pourquoi les composants ne traduisent pas eux-mêmes.** C'est la contrainte qui commande leur
forme. Quatre surfaces migrées sont des server components `async` (`admin/team`, `admin/agency`,
`inventories/new`) ou des server components synchrones (`CustomerList`) ; les autres sont clientes.
Un `useTranslations` dans `EmptyState` en ferait une frontière client. L'appelant choisit donc son
canal — `useTranslations` (client **et** server sync) ou `getTranslations` (server async) — et
passe des chaînes déjà traduites.

**Le typage lie `onRetry` et `retryLabel`.** Comme `ErrorState` ne traduit pas, le libellé du
bouton vient de l'appelant : une union discriminée rend impossible un bouton sans libellé, et un
libellé sans action.

**Cadeau ramassé au passage : le namespace `team.*` était orphelin.** Ses clés existaient dans les
trois locales, portaient déjà la copie « encouragement + CTA » que `design-guidelines.md:83` exige,
et **aucun fichier ne les consommait** — pendant que l'écran affichait en dur « Aucun membre ne
correspond aux filtres courants. »

**Trois écrans distinguaient « vraiment vide » de « rien qui corresponde aux filtres »**
(`PropertyList`, `LeasesList`, `TeamConsole`). Un état vide unique appliqué sans cette nuance
aurait fait régresser l'UX : un « invitez votre premier agent » alors que l'utilisateur vient de
taper un nom dans la recherche est faux. La distinction est conservée, et `LeasesList` la gagne
(elle n'affichait qu'un seul message pour les deux cas).

**`DocumentsLibrary.OwnerEmptyState` n'a PAS été migré, délibérément.** Il branche sur le rôle et
rend une grille d'exemples de documents plus une liste de cibles de rattachement : le forcer dans
`{icon, title, description, action}` aurait détruit de la fonctionnalité. Il est inscrit dans
`ECARTS_ASSUMES` de la garde avec son ticket (TCK-291) plutôt que renommé pour faire taire le
contrôle — *une allowlist est une dette visible, un renommage est une dette cachée.*

**La garde est HONNÊTE SUR SA PORTÉE, et c'est le point.** Elle porte trois contrôles de force
décroissante et l'écrit dans sa propre sortie de succès :

| | ce que ça mesure | statut |
|---|---|---|
| A | aucun `*EmptyState`/`*ErrorState` défini hors de `components/feedback/` | **exact** |
| B | cliquet heuristique sur les états vides ad-hoc | plancher |
| C | cliquet heuristique sur les blocs d'erreur en palette brute | plancher |

Seul A prouve une propriété. B et C ne certifient rien quand ils sont verts : ils garantissent que
le chiffre n'a pas monté. C'est la leçon de la dette D-23 — *une garde qui cherche un jeton ne
mesure pas la propriété* — appliquée à elle-même plutôt que proclamée. Une garde muette sur sa
portée laisse croire qu'elle couvre tout ; celle-ci nomme ce qu'elle rate : les états vides
anonymes, ceux libellés par une clé i18n, ceux sans `text-center`.

**Chiffres mesurés avec le même script, avant et après :**

| | avant | après |
|---|---|---|
| définitions locales `*EmptyState` / `*ErrorState` | 11 | 1 (assumée) |
| états vides ad-hoc (heuristique) | 43 | 34 |
| blocs d'erreur en palette Tailwind brute | 28 | 22 |

**Régression visuelle assumée** sur `/app/favorites` et `/app/saved-searches` : leurs états vides
utilisaient la palette stone brute avec un CTA `rounded-full`. Le passage aux tokens change
visiblement bordure, fond, couleur de texte et forme du bouton. C'est voulu — c'est le sujet du
ticket — mais à lire comme tel en revue, pas comme une casse.

**Recoupement avec TCK-286** (i18n généralisée) : ce ticket branche next-intl sur 17 fichiers et
fait donc descendre le compteur du cliquet de TCK-286 avant qu'il n'existe. Ils ne se marchent pas
dessus — TCK-286 demande justement de commencer par les états d'erreur — mais son plafond initial
devra être mesuré **après** le merge de celui-ci.
