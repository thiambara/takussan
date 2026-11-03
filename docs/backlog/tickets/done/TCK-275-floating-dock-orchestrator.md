---
id: TCK-275
title: "Floating Dock — orchestrateur des éléments UI flottants en bas d'écran"
status: done
phase: P2
family: front
estimate: S
wave: 31
created: 2026-05-15
updated: 2026-05-15
depends_on: [TCK-082, TCK-274]
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
    - docs/features.md#17-communication--messagerie
  models: []
tags: [front, ux, dx, refacto]
---

## Objectif utilisateur

Quand un utilisateur authentifié navigue sur une page publique (par exemple
une liste de biens ou une fiche bien sur mobile), il doit pouvoir voir
**simultanément et sans chevauchement** la sélection du comparateur, le
bouton/widget de messagerie et la barre d'action sticky de la fiche bien.
Aujourd'hui ces éléments flottants se superposent en bas-droite et masquent
les uns les autres.

## Contrat de données

**Refacto frontend pure — aucun changement backend, aucun nouvel endpoint.**

Les éléments concernés existent déjà et continuent d'utiliser leurs sources
de données actuelles :

- `CompareFloatingBar` (`src/components/compare/CompareFloatingBar.tsx`) —
  pilule de sélection comparateur, alimentée par `CompareContext`
  (TCK-082).
- `ChatWidget` (`src/components/chat-widget/ChatWidget.tsx`) — launcher
  desktop + FAB mobile messagerie, alimenté par les hooks de TCK-274.
- `PropertyMobileBottomBar`
  (`src/app/(public)/properties/[slug]/components/PropertyMobileBottomBar.tsx`)
  — barre sticky d'action sur fiche bien (mobile only, full-width).

## Direction UX / Artistique

**Principe** — l'espace en bas de l'écran est un *dock partagé*. Aucun
élément flottant ne doit en masquer un autre. L'utilisateur perçoit chaque
élément comme empilé verticalement (desktop) ou ré-arrangé pour laisser
place à une éventuelle sticky bar full-width (mobile).

**Comportement attendu** :

- **Bas-droite (desktop & mobile)** : les éléments s'empilent verticalement
  avec un petit gap. L'élément le plus important visuellement (chat) reste
  en bas ; les éléments contextuels (comparateur) montent au-dessus quand
  ils sont actifs. Aucun chevauchement, aucun élément derrière un autre.
- **Page propriété mobile** : quand `PropertyMobileBottomBar` est monté
  (full-width sticky bottom), les éléments en bas-droite se décalent
  automatiquement au-dessus de la barre (ils ne doivent **jamais** la
  recouvrir ni être recouverts par elle).
- **Safe areas iOS / Android** — l'orchestrateur respecte `safe-area-inset-bottom`
  comme le fait déjà `PropertyMobileBottomBar` (`safe-area-bottom`).

  > ⚠ **Correction du 2026-08-29 (TCK-453) — cette phrase était fausse quand elle a été
  > écrite, et ce ticket est clos.** `safe-area-bottom` n'a **jamais existé** : elle n'est
  > déclarée ni dans `takussan-web/src/app/globals.css`, ni ailleurs, donc elle n'émettait
  > aucune règle CSS et `PropertyMobileBottomBar` n'avait **aucun** rembourrage de zone
  > sûre. Trois endroits y croyaient — cette ligne, la barre elle-même, et un commentaire
  > de `useFloatingDockSlot.ts` — et zéro l'implémentait ; c'est sur cette base que le
  > prochain implémenteur du dock aurait construit.
  >
  > La barre porte désormais `pb-[calc(0.75rem+env(safe-area-inset-bottom))]`, forme
  > vérifiée par compilation : elle **s'ajoute** au `py-3` existant au lieu de le
  > remplacer — `pb-[env(safe-area-inset-bottom)]` seul aurait corrigé iOS en faisant
  > perdre 12 px à tous les appareils sans encoche.
  >
  > *Le ticket n'est pas réécrit : la ligne d'origine reste, avec ce qu'elle affirmait.*
  > Trouvée par `takussan-web/scripts/check-classes-emises.mjs`, le jour de sa mise en
  > service.

  > ⚠ **Correction du 2026-08-30 (TCK-477).** La classe `pb-[calc(…)]` ci-dessus a été
  > remplacée par un style en ligne : la barre déclare son encart dans
  > `useFloatingDockSlot({ corner: 'bottom-full', safeAreaInset: … })` — champ que le TYPE
  > exige désormais, la branche `bottom-full` de `FloatingDockSlotConfig` ne se construisant
  > plus sans lui — et le hook le lui rend sous `paddingBottom`. Un style en ligne l'emporte
  > sur toute classe : la dépendance à l'ordre longhand-après-shorthand disparaît.
  >
  > *La délégation que cette ligne ratifiait est ce qui restait à fermer.* TCK-453 avait
  > supprimé la classe morte ; il restait qu'un prochain consommateur de `bottom-full`
  > pouvait retomber dans le même trou sans que rien ne le lui dise. C'est le type qui le
  > lui dit maintenant, à la frappe — et non un commentaire, dont l'échec est précisément
  > ce que ce ticket a coûté.
- **Pas de FOUC ni de saut** — les éléments doivent se positionner
  correctement dès le premier paint, sans flash de chevauchement pendant
  l'hydratation.
- **Pas de régression visuelle** : l'apparence individuelle de chaque
  élément (couleurs, ombres, animations, badges de non-lus) reste
  strictement identique. Seul le **positionnement** est centralisé.
- **Z-index cohérent** : un seul layer flottant pour tout le dock, qui passe
  sous les modales (`z-50+`) et au-dessus du contenu de page (`< z-40`).

Ne pas prescrire de bibliothèque, de structure de dossier, de hook name ni de
shape de context — c'est à l'agent de décider. Critère : un nouveau
composant flottant futur (cookie banner, undo toast, onboarding nudge)
doit pouvoir s'ajouter au dock **sans toucher** aux composants existants.

## Contraintes strictes (métier)

- **Aucune régression fonctionnelle** sur les éléments existants — chaque
  AC de TCK-082 (comparateur) et TCK-274 (messagerie) reste vert après
  refacto. Les `data-testid` actuels sont préservés à l'identique
  (`chat-widget-launcher`, `chat-widget-mobile-fab`, `chat-widget-panel`,
  `chat-widget-close`, `chat-widget-badge`, `chat-widget-mobile-badge`).
- **Aucun élément flottant ne doit masquer ou être masqué** par un autre,
  sur toutes les pages publiques et applicatives où ils coexistent
  (notamment `/properties`, `/properties/[slug]` desktop & mobile,
  `/app/*` hors `/app/messages`).
- **Le `ChatWidget` reste monté au root layout** (visible site-wide) et le
  `CompareFloatingBar` reste monté au public layout (visible sur les pages
  publiques uniquement) — la portée de chaque élément ne change pas.
- **Mobile FAB chat ≠ Desktop launcher chat** — la distinction
  `hidden md:block` / `md:hidden` doit rester (un seul élément visible à la
  fois selon le breakpoint).
- **Pas de dépendance circulaire** — l'orchestrateur ne doit pas dépendre
  des composants concrets ; ce sont les composants qui s'enregistrent
  auprès de lui.
- **A11y préservée** — focus management du `ChatWidget` (restore focus
  launcher à la fermeture, escape closes panel) reste fonctionnel. Aucun
  `role` ou `aria-label` existant n'est supprimé.

## Delta à produire

- [x] Mécanisme d'orchestration partagé pour les éléments fixed bottom
      (provider + API d'enregistrement / hook, shape libre)
- [x] Wrapper / primitive de positionnement consommé par chaque élément
      flottant (remplace les classes `fixed bottom-* right-*` brutes)
- [x] Migration de `CompareFloatingBar` vers l'orchestrateur
- [x] Migration du `ChatWidget` (launcher desktop + panel + FAB mobile)
      vers l'orchestrateur
- [x] Migration de `PropertyMobileBottomBar` vers l'orchestrateur (slot
      full-width qui pousse les autres vers le haut)
- [x] Montage de l'orchestrateur dans le root layout (`src/app/layout.tsx`)
      pour qu'il couvre toutes les routes
- [x] Tests Vitest : stack vertical desktop, offset mobile en présence de
      `PropertyMobileBottomBar`, démontage propre d'un slot, plusieurs
      éléments dans le même corner
- [ ] (Optionnel mais souhaitable) test Playwright sur fiche bien mobile
      vérifiant qu'aucun élément n'est masqué — _non couvert (option)_

## Critères d'acceptation

- [x] AC1 — sur `/properties` en utilisateur authentifié, le `CompareFloatingBar`
      (≥ 1 bien sélectionné) et le `ChatWidget` desktop sont **tous deux
      visibles et entièrement cliquables** sans chevauchement.
- [x] AC2 — sur `/properties/[slug]` en mobile authentifié, quand
      `PropertyMobileBottomBar` est sticky en bas, le FAB messagerie et la
      pilule comparateur (si actifs) se positionnent **au-dessus** de la
      sticky bar, sans la recouvrir ni être recouverts.
- [x] AC3 — sur une page sans `PropertyMobileBottomBar`, les éléments
      flottants reviennent à leur position naturelle en bas-droite (pas
      d'offset fantôme).
- [x] AC4 — démonter un élément (ex. vider le comparateur) recompacte
      automatiquement le dock : pas de "trou" entre les éléments restants.
- [x] AC5 — tous les tests Vitest existants de TCK-082 et TCK-274 restent
      verts sans modification (`data-testid` et comportements préservés).
- [x] AC6 — un nouveau composant fictif déclaré dans un test peut s'ajouter
      au dock sans modifier le code de `CompareFloatingBar`,
      `ChatWidget` ni `PropertyMobileBottomBar` (preuve d'extensibilité).
- [x] AC7 — `npm run lint` + `npm run build` passent. Pas de warning
      React (hydratation, key, etc.) en console au mount.

## Hors périmètre

- Refonte visuelle (couleurs, ombres, tailles) des éléments flottants —
  ticket séparé si jugé utile après merge.
- Animation d'entrée / sortie sophistiquée — un fade ou translate discret
  est acceptable mais pas obligatoire.
- Floating toolbar pour autres routes (admin, dashboard) — le ticket couvre
  uniquement les 3 composants existants.
- Système de "queue" prioritisé entre éléments concurrents (ex. masquer
  compare quand chat panel ouvert) — comportement par défaut suffit.
- Refacto du toast region (`Toaster` de `@/components/ui/toast`) — il a
  son propre mécanisme.
- Extension aux dialogues / modales — `z-index` documenté mais hors scope.

## Notes d'implémentation

### Architecture — `src/components/floating-dock/`

- `FloatingDockProvider` expose **deux contextes séparés** :
  `FloatingDockMutationsContext` (`register` / `unregister`, identité stable)
  et `FloatingDockSlotsContext` (registry vivant). Cette séparation évite la
  boucle "register → setState → re-render → register" : l'effet de
  registration ne dépend que des mutations stables, jamais du registry
  lui-même. La `Map` est ré-utilisée à l'identique quand un slot se
  ré-enregistre avec les mêmes `corner / priority / height` (anti re-render
  storm sur parents qui re-rendent souvent).
- `useFloatingDockSlot(config)` est l'**unique API publique** consommée par
  les éléments flottants. Hors provider, le hook est un no-op gracieux qui
  retourne `var(--floating-dock-base, 16px)` — les tests unitaires existants
  des composants migrés tournent toujours sans monter le provider.
- L'algorithme de positionnement (`computeBottom`) est pur et exporté pour
  test isolé. Les slots `bottom-right` s'empilent par priorité ascendante
  avec un gap de 8px ; chaque slot `bottom-full` actif soulève toute la
  colonne `bottom-right` de `height + 8px`.
- Variable CSS `--floating-dock-base` déclarée dans `globals.css` : 16px en
  mobile, 24px en `sm:`+. Elle remplace les classes `bottom-4 / sm:bottom-6`
  que les composants appliquaient en dur.

### Hauteurs déclaratives

Chaque consommateur déclare une hauteur logique fixe (pas de `ResizeObserver`)
pour garder le positionnement déterministe et éviter le FOUC d'hydratation :
- `CompareFloatingBar` : 64px (priority 1, sits above chat).
- `ChatWidget` desktop launcher : 56px (priority 0, floor).
- `ChatWidget` FAB mobile : 48px (priority 0, floor).
- `PropertyMobileBottomBar` : 76px (`bottom-full`, full-width sticky).

Le panneau ouvert du `ChatWidget` n'est pas mesuré : seul le launcher
contribue à la hauteur du slot, donc la pilule comparateur ne saute pas de
500 px à l'ouverture du panneau (UX standard Messenger / Intercom).

### Garde mobile-only sur `PropertyMobileBottomBar`

La sticky bar fiche bien est `lg:hidden` (`display: none` sur ≥1024px). Sans
gate symétrique sur l'enregistrement dock, les slots desktop seraient soulevés
de 84px par une barre invisible (régression AC3). On consomme donc
`useMatchesMaxWidth(1023)` (built sur `useSyncExternalStore` pour éviter
l'anti-pattern setState-in-effect) et on passe `enabled: isMobile` au hook.
Snapshot SSR retourne `false` (assumption desktop conservatrice) — la barre
ne contribue jamais à un offset fantôme avant l'hydratation.

### Z-index unifié

Tous les éléments restent en `z-40` (au-dessus du contenu de page, sous les
modales `z-50+`). L'orchestrateur ne change pas le z-index.

### Tests

`src/components/floating-dock/__tests__/FloatingDock.test.tsx` (12 cas)
couvre : fallback gracieux hors provider, stack 1 / 2 / 3+ slots, lift par
`bottom-full`, démontage propre (AC4), `enabled: false` (toggle), AC6
(extensibilité), AC3 (toggle d'un `bottom-full` qui ne doit plus offsetter).
Les suites existantes de `CompareFloatingBar` et `ChatWidget` tournent telles
quelles (data-testid et comportements préservés).

### Vérifications

- `npx vitest run` : **801/801 verts**.
- `npm run lint` : **0 nouvelle erreur** (un seul reste, pré-existant dans
  `UserLocationProvider.tsx`).
- `npm run build` : ✓ Compiled successfully.
