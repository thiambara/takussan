# Revue design — E `/app` relations clients (2026-09-16)

**Verdict : Needs changes** — les corrections du périmètre sont posées et vérifiées (dont deux HIGH : `/app/customers` en panne, messagerie inutilisable au bureau). Deux changements hors périmètre restent à faire à l'intégration (voir Collisions).
Pages couvertes : 12/12 · Corrections : 37 fichiers (+ 25 clés i18n en fr/en/wo) · Collisions : 5 · Non mesuré : conversation ouverte du tenant ; liste remplie et détail des visites et des réservations du tenant (aucune donnée) ; formulaire de retour de visite ouvert ; écran de succès du tunnel public ; bandeau de paiement client d'une réservation

Mode impeccable : Operate. Port Chrome 9345, captures `$S/shots/e`.

## Pages

### `/app/crm` → `/app/customers` — agent
`/app/crm` est une redirection permanente (308) vers `/app/customers`, qui était **en panne**.

Relevé avant : 360/390/768/1024/1366 ✓ (docOverflow 0), mais **h1 « Une erreur est survenue »** aux
cinq largeurs, plus `[dashboard] erreur non rattrapée` dans la console. Le journal de `next dev` dit
*Functions cannot be passed directly to Client Components* : `{id: "client", header: "Client", cell: function cell}`.
Après le correctif : la page rend. À 768, la table (5 colonnes) passait **dans 464 px** (pipeline et
statut coupés, défilement interne) et la recherche tombait à « Nom, p » ; à 1366, les deux listes
déroulantes affichaient « Tous » / « Tous », sans nom accessible.

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| **HIGH** | `components/customer-dashboard/CustomerList.tsx:1` | pas de `'use client'`, rendu depuis une page RSC, passe `cell`/`rowKey` (fonctions) au `DataTable` client | `'use client'` + un docblock qui dit pourquoi elle porte | `/app/customers` affichait l'écran de panne **depuis TCK-380 (2026-08-27)**. Les tests jsdom ne franchissent aucune frontière RSC, ils restaient verts. Le chef d'équipe a été prévenu. |
| MEDIUM | `CustomerList.tsx` (table / cartes) | `hidden md:block` / `md:hidden` | `hidden lg:block` / `lg:hidden` | TCK-505 : `md` n'est pas le bureau sous la barre latérale (464 px utiles) |
| MEDIUM | `CustomerListFilters.tsx` (barre) | `md:flex-row` ; selects `min-w-[160px]` en `flex-wrap` | `lg:flex-row`, `min-w-0` sur le formulaire ; selects en `grid-cols-2` sous `sm`, `sm:min-w-[160px]` | la recherche tombait à « Nom, p » à 768 ; à 390, selects de largeurs inégales |
| MEDIUM | `CustomerListFilters.tsx` (FilterSelect) | option « Tous » ×2, déclencheur sans nom accessible | « Toutes les étapes » / « Tous les statuts » (clés `crm.filters.allStages/allStatuses`, fr/en/wo) ; `aria-label="Pipeline : …"` / `"Statut : …"` | deux « Tous » côte à côte ne disent pas quel filtre ils règlent |
| LOW | `CustomerListFilters.tsx` (TagFilter) | `hover:bg-card` sur `bg-card` (survol invisible), éléments de menu `py-1.5`, icône X sans `aria-hidden`, compteur proportionnel | `hover:bg-muted` + `transition-colors`, `py-2`, `aria-hidden`, `tabular-nums` ; bouton pleine largeur sous `sm` | état de survol absent, cible plus haute |
| LOW | `CustomerList.tsx` (colonne client, téléphone) | `hover:text-foreground` sur `text-foreground` (rien au survol) | `hover:underline underline-offset-4` ; `tabular-nums` sur le téléphone | affordance du lien |

Contre-relevé : 360/390/768/1024 ✓ (docOverflow 0, h1 « Clients (CRM) », 0 erreur console). Preuve
de version par `--eval` : `.hidden.lg:block` présent, `.grid-cols-2.sm:flex` présent, déclencheurs
`["Pipeline : Toutes les étapes","Statut : Tous les statuts"]`. À 1366, **un** passage a rendu
l'écran de panne, mais la cause est hors périmètre (HMR de `next dev` : *module factory is not
available*, `lucide-react/arrow-right` requis par `components/layout/ProUpgradeCard.tsx` (groupe A)
pendant qu'il était en cours d'édition). La remesure est plus bas.

### `/app/crm/pipeline` — agent
Relevé avant : 360 ✓ (docOverflow 0 ; `narrowText` : « Taux de conversion 30j », « Temps moyen —
Qualifié ») · 390 ✓ · 768 ✓ (kanban à défilement horizontal, 1,5 colonne visible) · 1024 ✓ · 1366 ✓.
**Toutes les colonnes affichaient « Aucun client »**, et les tuiles « — ». Relevé dans le cache
React Query : les 6 requêtes de colonne en `error` (« API error 400 ») ; l'API répond *Requested
sort(s) `updated_at` is not allowed*. Le défaut vient de `lib/queries/pipeline.ts` et de l'API, hors
périmètre : il est signalé au chef d'équipe (voir Collisions). Entre-temps, `takussan-api` l'a corrigé
dans l'arbre (`app/Models/Customer.php`, `CustomerPipelineTest`). Les tuiles « — » ne venaient pas
d'une erreur : `pipeline-stats` répond 200, mais en ~15 s sous la charge de 8 agents. *(Rectifié en
fin de revue : `apiRequest` lève bien un `ApiError`, et `lib/query-client.ts` ne réessaie pas un 4xx.
La lenteur tient à la charge de la machine, pas à des réessais.)*

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| **HIGH** | `components/pipeline/PipelineColumn.tsx`, `PipelineKanban.tsx` | chargement **et** échec rendaient « Aucun client » | trois états distincts : squelettes (`Skeleton` ×3, `aria-busy`, libellé `sr-only`), `ErrorState` + « Réessayer » (`refetch`), vide ; le compteur d'en-tête et celui des onglets ne s'affichent qu'une fois la colonne chargée | un pipeline en panne se lisait comme un pipeline vide : un agent pouvait croire ses 108 prospects perdus |
| MEDIUM | `PipelineKanban.tsx` (onglets mobiles) | `text-xs px-3 py-1.5` ≈ 28 px de haut, `transition` | `min-h-11` (44 px mesurés), `text-sm`, `aria-pressed`, `transition-colors`, compteur `tabular-nums` ; conteneur `rounded-xl` et onglet `rounded-lg` (rayons concentriques avec `p-1`) | cible tactile sous le plancher de 44 px |
| MEDIUM | `PipelineKanban.tsx` → `PipelineColumn` mobile | colonne `w-[300px]` dans un écran de 358 px | `className="w-full"` (nouvelle prop `className`) | la colonne ne remplissait pas l'écran et laissait une marge droite orpheline |
| MEDIUM | `PipelineCard.tsx` | `transition` (anime `transform`, que dnd-kit écrit à chaque mouvement) ; `focus:ring` | `transition-[border-color,box-shadow] duration-150` ; `focus-visible:ring-ring` | la carte suivait le pointeur avec retard ; anneau de focus aussi au clic |
| MEDIUM | `PipelineCard.tsx` (date) | `Intl.DateTimeFormat(undefined)` → « Sep 2, 2026 » | `formatDate(…, locale)` de `lib/format` → « 2 sept. 2026 » (mesuré) | la date suivait la langue du navigateur, pas celle de l'app |
| MEDIUM | `CustomerDetailSheet.tsx` (notes, tâches, activité) | `toLocaleDateString('fr-FR', …)` en dur | `formatDateTime` / `formatDate(…, locale, { dateStyle: 'long' })` | des dates en français sous `en` et `wo` |
| MEDIUM | `PipelineStatsBar.tsx` | `<button disabled>` quand aucun gestionnaire n'est passé (toujours le cas) | `<div>` sans gestionnaire, `<button>` seulement avec | une donnée à lire était annoncée « estompée » et sautée au clavier |
| LOW | `PipelineStatsBar.tsx` | pastille d'icône de 40 px à 360 ; valeur `font-bold`, sans `tabular-nums` | pastille masquée sous `sm`, `p-3 sm:p-4`, `rounded-xl` ; valeur `font-semibold tabular-nums` ; libellé `text-pretty` | le libellé tenait sur trois lignes à 360 (`narrowText`) |
| LOW | `PipelineKanban.tsx` (toast d'erreur) | `bg-destructive/10` translucide, `right-4 bottom-4` (sous le widget de messagerie) | `bg-card` opaque, `bottom-24` en mobile, `sm:right-24 sm:max-w-sm` | le contenu transparaissait sous le texte ; collision avec le bouton flottant |
| LOW | `PipelineKanban.tsx` (défilement bureau) | défilement libre | `snap-x` + `snap-start` sur les colonnes, `overscroll-x-contain` | à 768, les colonnes s'arrêtaient à mi-largeur |
| LOW | `CustomerDetailSheet.tsx` | titre `font-bold`, sans `font-display` ; X sans `aria-hidden` ; case de tâche `size-4` ; pastille « épinglée » `bg-warning/15` ; `rounded-md` | `font-display font-semibold tracking-tight`, `aria-hidden`, `size-5`, `bg-warning/10` (plafond de contraste), `rounded-lg` | charte (titres en display, aplat de pastille ≤ 10 %) |

Contre-relevé : 360/390/768/1024/1366 ✓ (docOverflow 0, 0 erreur console). Données visibles à 390
une fois l'API corrigée (Lead 15, Prospect 15…). Onglets à 44 px (mesuré `getBoundingClientRect`).
Squelettes visibles à 1366 pendant le chargement (`aria-busy="true"` lu). Tiroir client ouvert à
1366 : 512 px, liste d'onglets 246/246 (sans débordement), date de carte « 2 sept. 2026 ».

### `/app/customers/[id]` — agent (fiches 553 et 2 de Dakar Immo ; 270 d'une autre agence, accès refusé)
Relevé avant : 360/390/768/1024/1366 ✓ (docOverflow 0, 0 erreur console). Défauts à l'œil et à la
mesure : **à 360, la barre d'onglets finissait à x = 365**, et « Relations (1) » était coupé par le
bord de l'écran (la sonde ne le voit pas : l'overflow est masqué) ; les statuts de l'en-tête étaient
peints en contour neutre alors que la liste les peint en couleur ; l'état « Accès client refusé »
n'avait **aucun `h1`**.

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| MEDIUM | `components/customer-dashboard/CustomerDetailTabs.tsx` | `<TabsList>` nu | enveloppe `-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0`, `TabsList w-max` | onglet coupé, donc inatteignable à 360 |
| MEDIUM | `app/(dashboard)/app/customers/[id]/page.tsx` (en-tête) | `<Badge variant="outline">` pour l'étape et le statut | `StatusBadge` avec les tons de la liste ; tables `PIPELINE_STAGE_TONE` / `CUSTOMER_STATUS_TONE` **déplacées** de `CustomerList.tsx` vers `components/customer-form/options.ts` (module sans directive, lisible par un RSC) | un même fait, deux vocabulaires visuels |
| MEDIUM | idem (`CustomerDetailUnavailable`) | aucun `h1` dans l'état refusé ou introuvable | `<h1 className="sr-only">{title}</h1>` | la page n'avait pas de titre pour les lecteurs d'écran (mesuré : `h1: []`) |
| LOW | idem (en-tête) | e-mail et téléphone nus | `break-all min-w-0` sur l'e-mail, `tabular-nums` sur le téléphone | une adresse longue ne pousse plus la ligne |
| MEDIUM | `components/customer-dashboard/CustomerTagPicker.tsx` | champ de tag **sans libellé** (placeholder seul) ; pastille `role="button"` sans clavier **contenant** un `<button>` ; bouton de retrait de 14 px (icône `size-2.5`) ; aplats `/15` ; suggestions `hover:bg-card` sur `bg-card` ; erreur sans `role="alert"` | `Input` du DS + `aria-label` (`crm.tags.inputLabel`) ; nom et retrait en boutons **frères** (le nom est un vrai `<button>` avec `crm.tags.filterAria`) ; retrait `size-5`, étendu à 24 × 36 px par `after:` sans chevaucher ses voisins ; aplats `/10` (plafond de la charte) ; `hover:bg-muted` ; `role="alert"` | commandes imbriquées inaccessibles, cible sous 24 px, contraste des pastilles |
| LOW | `CustomerTagPicker.tsx` (`CustomerTagChips`) | `span role="button"` sans `tabIndex` ni clavier | `<button>` quand `onTagClick` est fourni, `<span>` sinon, `focus-visible:ring` | clavier |
| LOW | `CustomerNotesTimeline.tsx` | méta proportionnelle ; corps sans `text-pretty` ; épingle `size-3` en `aria-label` sans rôle | `tabular-nums`, `text-pretty leading-relaxed`, `size-3.5 role="img"` | lecture, a11y |
| LOW | `CustomerDetailTabs.tsx` | onglet Aperçu `p-6` à 360 | `p-4 sm:p-6` ; `tabular-nums` et `text-pretty` sur les relations | gouttière de 24 px dans 328 px |

Contre-relevé : 360 ✓ · 768 ✓ · 1366 ✓ (docOverflow 0, 0 erreur). Preuve de version : l'enveloppe
des onglets lue dans le DOM (`-mx-4 overflow-x-auto px-4 …`, scrollWidth 381 / clientWidth 360, bord
droit à 360). Pastilles « Lead » (neutre) et « Actif » (succès) visibles à 1366, sans régression de
mise en page. 270 : `h1` « Accès client refusé » lu.

### `/app/customers/new` — agent (formulaire vide soumis : état d'erreur, sans envoi)
Relevé : 360/390/768/1024/1366 ✓ (docOverflow 0). La soumission à vide ne part pas : zod refuse,
`aria-invalid` est posé sur `first_name`, `last_name` et `email`, le focus va sur `first_name`, et
les messages s'affichent (« Le prénom est requis. », « Le nom est requis. », « Renseignez au moins un
e-mail ou un téléphone. »).

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| MEDIUM | `messages/*.json` `dashboard.pages.customerNew.subtitle` (via `i18n-set --force`) | « Indiquez au minimum un prénom et un nom. » | « Indiquez au minimum un prénom, un nom et un e-mail ou un téléphone. » (fr/en/wo) | **la consigne contredisait la validation** : le formulaire exige aussi un moyen de contact, et l'utilisateur ne l'apprenait qu'à l'erreur. Seul changement de texte factuel du lot, pour cette raison. |
| MEDIUM | `components/customer-form/CustomerForm.tsx` (×4 grilles) | `md:grid-cols-2` | `lg:grid-cols-2` | à 768, deux champs de ~200 px dans une carte de 416 px (TCK-505) |
| LOW | `app/(dashboard)/app/customers/new/page.tsx` | formulaire pleine largeur (champs de 500 px à 1366) | `max-w-3xl` | longueur de ligne d'un formulaire de saisie |
| LOW | `CustomerForm.tsx` | titres de section `text-base font-semibold` ; bouton « Fermer » de l'erreur globale en `text-xs` nu | `font-display … tracking-tight` ; bouton avec padding et `focus-visible:ring` | charte (titres en display), cible et focus |

Contre-relevé : 5 largeurs ✓, `.max-w-3xl` lu dans le DOM, états d'erreur identiques à 360 et à
1366 (captures `after/new`).

### `/app/messages` — agent (22 conversations) et tenant (aucune conversation)
Relevé avant : 360/390/768/1024/1366 ✓ (docOverflow 0, 0 erreur). Le gate JS de TCK-501 (1023 px)
tient : la liste seule sous `lg`, avec un bouton retour dans la conversation. **Mais à 1024 et au-delà,
la grille était cassée**, et la sonde ne le voit pas (aucun débordement, tout est masqué) :

- la liste mesurait 1429 px dans une grille de 707 px, avec `scrollHeight = clientHeight` : **aucun
  défilement, les conversations 11 à 22 étaient inatteignables** ;
- conversation ouverte : **le composeur tombait à y = 1631** pour une grille qui s'arrête à 876, donc
  **impossible d'écrire un message au bureau** ;
- sans conversation ouverte, le texte « Sélectionnez une conversation… » était centré dans une
  colonne de 1474 px, donc invisible.

Cause : la rangée implicite de la grille prend la hauteur de son contenu.

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| **HIGH** | `components/messages/MessagesPage.tsx` (grille) | `grid h-[calc(100dvh-12rem)] grid-cols-1 …` ; `aside` et `section` sans `min-h-0` | `grid-rows-[minmax(0,1fr)]` + `min-h-0` sur les deux panneaux ; test ajouté dans `__tests__/MessagesPage.test.tsx` | liste non défilable, composeur hors de l'écran au bureau |
| MEDIUM | `components/messages/ConversationList.tsx` | 🔕 (émoji) pour « en sourdine » ; libellé `muted` **non traduit** en fr et wo | `BellOff` de lucide, `role="img"` ; `messaging.list.muted` = « Conversation en sourdine » (fr/en/wo) | un émoji tenait lieu d'icône ; texte anglais annoncé en français |
| MEDIUM | idem | dates, pastille « Groupe », compteurs en `text-[9px]` / `text-[10px]` | `text-xs` (dates) et `text-[11px]` (pastilles) ; `tabular-nums` | charte : jamais sous 12 px, sauf 11 px pour les pastilles |
| MEDIUM | idem | vignette de bien **vide** quand le bien n'a pas de photo (22 ronds beiges identiques) | icône `Building2` en repli ; contour d'image `outline-foreground/10` quand il y a une photo | aucun repère visuel d'une ligne à l'autre |
| MEDIUM | idem (états) | erreur en `<p class="text-destructive">`, vide en `<div>` texte, squelettes faits main | `ErrorState`, `EmptyState` (icône `MessagesSquare`), `Skeleton` | règle « un seul composant rend tous les états » (charte) |
| LOW | idem (ligne) | pas d'état sélectionné exposé ; aperçu non lu en gris comme le lu (ternaire aux deux branches identiques) ; pastille non lue `bg-foreground` | `aria-current`, `focus-visible:ring-inset`, `px-4` ; aperçu non lu en `font-medium text-foreground` ; pastille non lue en `bg-primary` | l'état non lu se voyait à peine ; l'accent de marque marque un état |
| MEDIUM | `components/messages/ChatView.tsx`, `ChatComposerShell.tsx`, `PropertyDraftChatView.tsx` (mobile) | envoi 32 px, trombone 36 px, retour 32 px, champ 36 px | 44 px sous `sm` (`size-11 sm:size-9`, `min-h-11 sm:min-h-9`), mesurés à 360 : envoi 44, trombone 44 | cibles tactiles |
| LOW | `ChatView.tsx` | 🔕 en texte ; vignette `rounded-lg` (ronde dans la liste) et vide sans photo ; titre `text-sm` ; heure et nom en `text-[10px]` ; erreur en texte nu ; trombone sans anneau de focus | `BellOff` ; `rounded-full` + repli `Building2` ; `font-display text-base tracking-tight` ; `text-[11px] tabular-nums` / `text-xs` ; `ErrorState` ; `focus-within:ring-2` | cohérence liste/conversation, focus clavier du trombone |
| LOW | `ChatComposerShell.tsx` | erreur de pièce jointe sans `role="alert"` | `role="alert"` | annonce |
| LOW | `messages/*.json` | `chat.groupInfoAria` = « Group info » en français ; `chat.uploadFailed` = « Upload échoué. » | « Infos du groupe » ; « L'envoi du fichier a échoué. Réessayez. » (et en/wo) | texte anglais dans l'interface française ; message d'erreur qui dit quoi faire |

Contre-relevé : 360/768/1024/1366 ✓ (docOverflow 0, 0 erreur). À 1366, conversation ouverte : bas du
composeur à 863 pour une grille qui finit à 876 ; liste 1429/661, donc défilable. À 1024 : 1429/785.
À 360 : bouton retour présent, envoi et trombone à 44 px. Tenant : `EmptyState` visible à 390. Le
tenant n'a aucune conversation : **l'état « conversation ouverte » n'est pas mesuré pour lui**, car il
faudrait écrire en base. `ChatView` est aussi monté par le widget flottant (groupe A) : les cibles
de 44 px sous `sm` s'y appliquent aussi, ce qui va dans le sens du widget.

### /app/calendar — agent (vues mois, semaine, jour, liste)
Relevé avant : 360 ✓ (docOverflow 0) · 390 ✓ · 768 ✓ · 1024 ✓ · 1366 ✓, mais lt44 = 132 à 360 et un
défaut de lecture à mobile. La sonde n'a rien vu de ce qui suit ; les captures et les `--eval` l'ont
montré.

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| **MEDIUM** | `components/calendar/{CalendarPage,DayView,WeekView,ListView,EventDetailSheet}.tsx` | `toLocaleDateString('fr-FR', …)` / `toLocaleTimeString('fr-FR', …)` en dur (cinq fichiers) | `useDatesCalendrier()` (nouveau `components/calendar/dates.ts`) : locale de l'app via `useFormatteurs()`, **fuseau du navigateur** conservé (la grille raisonne en dates locales, cf. docblock) | un utilisateur `en` ou `wo` lisait « septembre 2026 » |
| **MEDIUM** | `components/calendar/MonthView.tsx` (TCK-505 #6) | à 360, des puces de 45 px de large, tronquées à 2 caractères ; cellule `min-h-24` | sous `sm` : bouton de points colorés (3 max + `+N`, `aria-label` du compte), puces à partir de `sm` ; cellule `min-h-16 sm:min-h-24` | des libellés illisibles valaient moins qu'un signal de densité ; le jour s'ouvre dans le panneau du jour |
| MEDIUM | `MonthView.tsx` | jours du mois en cours et hors mois de même couleur (ternaire aux deux branches identiques) ; aujourd'hui en `text-primary-foreground` | `text-foreground` pour le mois, `text-muted-foreground` hors mois ; aujourd'hui en `text-background` ; `focus-visible` sur le numéro | on ne distinguait pas le mois courant |
| MEDIUM | `components/calendar/WeekView.tsx` | à 390, sept colonnes de 46 px, événements illisibles | racine `overflow-x-auto overscroll-x-contain`, grilles `min-w-[45.5rem] lg:min-w-0` | la semaine défile dans son conteneur (728/356 mesuré), le document reste à 0 |
| MEDIUM | `CalendarPage.tsx` (barre d'outils, mobile) | navigation 32 px ; sélecteur de vues `inline-flex` qui passait à la ligne ; libellé de période tronqué à 390 (« Semaine du 14 s… », 162/150) | navigation `size-10 sm:size-8` ; vues en `grid grid-cols-4` pleine largeur sous `sm`, `min-h-10` ; libellé en tête sur sa propre ligne sous `sm` (`order-first w-full text-balance`, `sm:truncate` au-dessus) | cibles tactiles, et la période visible en entier |
| LOW | `CalendarPage.tsx` | vue active `bg-foreground text-primary-foreground` ; légende en deux blocs empilés ; chargement en texte ; filtre de types sans rôle ; `useMemo` à la main | `text-background` ; légende en ligne sous `sm`, aides `hidden sm:block` ; `Skeleton` ; `role="group"` + `aria-label` sur le select ; IIFE (React Compiler) | contraste des jetons, densité mobile, conventions du dépôt |
| LOW | `EventDetailSheet.tsx` | voile `bg-foreground/…` ; fermeture 32 px ; CTA fait main | `bg-scrim/30` ; `size-10 rounded-lg focus-visible` ; `buttonVariants({ size: 'lg' })` ; titre `font-display text-balance pr-10` | jeton de voile, cible, primitive |
| LOW | `DayView.tsx`, `ListView.tsx` | titres `capitalize` (majuscule à chaque mot) ; heures sans `tabular-nums` | `first-letter:uppercase` ; `font-display` ; `tabular-nums` ; DayView gagne un `h3` | typographie française, chiffres alignés |

Contre-relevé : 360 et 390 ✓, vues à 40 px, lt44 passé de 132 à 90 ; 768 à 1366 ✓ (32 px, docOverflow
0). Vues semaine, jour et liste cochées (`aria-checked=true`). Semaine à 360 et 390 : libellé de
période plus tronqué (seuls restent tronqués les titres d'événements, voulu), grille 728/326
défilable. Preuve de version : `calendar-view-week` coché, classe `overscroll-x-contain` lue dans le
DOM. Captures : `shots/e/after/cal`, `after2/cal-week`. Tests calendar : 24 verts.

### /app/visits — agent, tenant
Relevé avant : agent et tenant, 360 ✓ · 390 ✓ · 768 ✓ · 1024 ✓ · 1366 ✓ (docOverflow 0, 0 erreur).
Mais **l'onglet « Annulées » était coupé à 390** : `TabsList` rogné, sans défilement.

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| **MEDIUM** | `components/visits/VisitsList.tsx` (onglets) | quatre onglets dans une `TabsList` de largeur fixe, « Annulées » rogné à 390 | enveloppe `-mx-4 overflow-x-auto overscroll-x-contain px-4 sm:mx-0 sm:px-0`, `TabsList w-max` ; compteurs `tabular-nums`, sans parenthèses | commande inatteignable à mobile |
| MEDIUM | `VisitsList.tsx`, `VisitDetail.tsx` (statuts) | liste en variantes de `Badge` (`outline`, `default`, `destructive`), détail tout en `outline` : « Demandée » et « Annulée » se lisaient pareil | `StatusBadge` avec `VISIT_STATUS_TONE` (demandée = attention, confirmée = info, terminée = succès, annulée = neutre, absent = danger) ; tables partagées dans le nouveau `components/visits/visit-status.ts` | TCK-472 : un seul décideur de couleur ; un seul vocabulaire liste/détail |
| LOW | `VisitsList.tsx` (ligne) | carte sans affordance ; `transition-shadow` ; aucun anneau de focus ; squelettes `bg-card` (invisibles sur carte) | chevron qui glisse au survol, `transition-[border-color,box-shadow]`, `focus-visible:ring-2` ; `Skeleton` | lisibilité du lien, focus clavier, états visibles |
| MEDIUM | `components/visits/VisitDetail.tsx` (actions, mobile) | boutons de 32 px en rangée ; « Voir le bien » en lien fait main (`h-9 rounded-md`) | pile pleine largeur sous `sm`, `h-10 sm:h-8` ; lien en `buttonVariants({ variant: 'outline' })` ; séparateur `border-t` | cibles tactiles ; primitive |
| LOW | `VisitDetail.tsx` | titre `text-lg` sans police display ; carte `p-6` à 360 ; lien retour `text-xs` de 16 px ; retour de feedback en `h3` sous un `h1` ; e-mail sans coupure ; écran d'erreur sans `h1` ; squelette `bg-card` | `font-display text-xl sm:text-2xl text-balance` ; `p-4 sm:p-6` ; retour `min-h-10 sm:min-h-8 text-sm` ; `h2` ; `break-all`, `tabular-nums` sur le téléphone ; `h1` masqué à l'erreur ; `Skeleton` | hiérarchie, rythme, cibles, plan du document |
| MEDIUM | `components/visits/VisitFeedbackForm.tsx` | note dans un `<label>` qui enveloppe cinq boutons (un clic sur le libellé active le bouton 1) ; boutons de 32 px ; `bg-warning/15` ; erreur sans rôle | `fieldset` + `legend` ; `aria-pressed` ; `size-11 sm:size-9`, `active:scale-[0.96]`, `focus-visible` ; `bg-warning/10` ; `role="alert"` | sémantique et cible tactile ; plafond d'aplat |

Contre-relevé : liste agent 360 à 1366 ✓ (docOverflow 0), onglets défilables. Détail agent : 274
(demandée), 7 (terminée), 8 (annulée), 360/768/1366 ✓. Preuve de version :
`data-tone=attention|success|neutral` lu sur `[data-testid=visit-status]`, actions à 40 px à 360 et à
32 px à partir de 768. Tests visits : 12 verts.
**Non mesuré** :
- le tenant n'a aucune visite (`visitor_id = 104` : 0 ligne), donc ni sa liste remplie ni son détail ;
- le formulaire de retour ouvert : il faut une visite terminée depuis moins de 24 h, et les données de démo n'en ont pas (le verrou « fenêtre fermée » est vu sur la 7).
La visite 2519, d'une autre agence, rend un 403 que le layout laisse passer (`ErrorState` générique) : voir Collisions.

### /app/bookings — agent, owner, tenant
Relevé avant : les trois rôles, 360 ✓ · 390 ✓ · 768 ✓ · 1024 ✓ · 1366 ✓ (docOverflow 0, 0 erreur).
Mais **l'onglet « Expirées » était coupé à 390**. L'onglet par défaut « En attente » est vide pour
les trois rôles : les lignes se voient sous « Confirmées » (12 pour l'agent). Le tenant n'a aucune
réservation, dans aucun onglet.

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| **MEDIUM** | `components/bookings/BookingsList.tsx` (onglets) | cinq onglets dans une `TabsList` fixe, « Expirées » rogné | même enveloppe défilante que les visites (430/360 mesuré) | commande inatteignable à mobile |
| MEDIUM | `BookingsList.tsx`, `BookingDetail.tsx` (statuts) | variantes de `Badge` : « Confirmée » en aplat terracotta (couleur de marque), « Annulée » et « Expirée » dans le même gris que le reste ; paiement « payé » en `default` | `StatusBadge` + `BOOKING_STATUS_TONE` / `BOOKING_PAYMENT_STATUS_TONE` (nouveau `components/bookings/booking-status.ts`, table de libellés partagée) ; acompte payé en ton succès | TCK-472 ; la marque ne signifie pas un statut ; mêmes tons que les visites |
| LOW | `BookingsList.tsx` (ligne) | montant proportionnel, serré à droite du titre à 360 ; aucune affordance ; anneau de focus absent ; squelettes `bg-card` | à mobile, montant sous la ligne de dates, `tabular-nums` ; chevron ; `focus-visible:ring-2` ; `Skeleton` | lisibilité des montants (charte : chiffres tabulaires), états visibles |
| MEDIUM | `components/bookings/BookingDetail.tsx` (en-tête) | actions en `flex` à droite du titre dès 768 (464 px utiles), boutons de 32 px à mobile ; lien retour `text-xs` avec `hover:text-muted-foreground` (aucun effet) | actions sous le titre avant `lg`, en pile pleine largeur sous `sm`, `h-10 sm:h-8` ; retour `text-sm min-h-10 sm:min-h-8 hover:text-foreground` ; titre `font-display text-balance tracking-tight` | TCK-505, cibles tactiles, affordance |
| MEDIUM | `BookingDetail.tsx` (grille) | `sm:grid-cols-2` | `lg:grid-cols-2` | à 768, deux cartes de 224 px sous la barre latérale |
| LOW | `BookingDetail.tsx` | montants, dates, référence sans `tabular-nums` ; sections `p-5` à 360 ; `h2` en `text-sm` ; puce de l'historique alignée sur la ligne de base (décalée) ; lien « reçu » de 16 px ; libellé du motif (dialogue) en `text-xs` gris ; paiement client en bouton étroit ; écran d'erreur sans `h1` ; squelette `bg-card` | `tabular-nums` partout où un chiffre compte ; `p-4 sm:p-5` ; `font-display text-base tracking-tight` ; `items-center flex-wrap` ; reçu `min-h-10 sm:min-h-0` ; libellé `text-sm text-foreground` ; bouton `w-full sm:w-auto` ; `h1` masqué ; `Skeleton` | rythme, hiérarchie, cibles |
| MEDIUM | `BookingDetail.tsx`, `components/visits/VisitDetail.tsx` (403) | une ressource d'une autre agence rendait « Impossible de charger cette visite. » + « Réessayer » (mesuré sur la visite 2519) | `ApiError` 403 → « Cette visite relève d'une autre agence : vous n'y avez pas accès. », sans « Réessayer » (clés `visits.detail.forbidden`, `bookings.detail.forbidden`, fr/en/wo) ; deux tests ajoutés dans `visits/__tests__/VisitDetail.test.tsx` (403 et 500) | on n'invite pas à réessayer ce qui ne peut pas réussir ; le layout laisse délibérément passer le 403 (`lib/detail/ressource-de-detail.ts:45`) |

Contre-relevé : liste agent 360 à 1366 ✓, onglet « Confirmées » ouvert par `--eval` (12 lignes,
`data-tone=info`), onglets 430/360 défilables. Détail agent 404 (confirmée) et owner 402 (annulée) :
360 à 1366 ✓, `data-tone` info et neutral, actions à 40 px à 360 et à 32 px à partir de 768, lt24
passé de 1 à 0 sous 768. Visite 2519 : h1 « Visite #2519 » + message 403 à 390 et 1366. Tests
bookings et visits : 19 verts.
**Non mesuré** :
- côté tenant, la liste remplie et le détail (aucune réservation) ;
- le bandeau de paiement client (`CustomerPayCta`), pour la même raison ;
- le dialogue de décision ouvert (accepter ou refuser), car aucune réservation n'est en attente pour l'agent, et l'ouvrir sur une confirmée n'est pas possible.

### /app/visits/<id> — annulation et replanification par dialogue (demande du chef d'équipe)
| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| **MEDIUM** | `components/visits/VisitDetail.tsx` (annuler, replanifier) | deux `window.prompt` natifs : un motif sans libellé visible, et un créneau à taper au format « YYYY-MM-DD HH:mm » | un `Dialog` de la primitive (patron de `BookingDetail`, composants `VisitActionDialog` et `VisitActionForm`) :<br>• annulation : `Textarea` libellé « Motif d'annulation », motif exigé ;<br>• replanification : `Input type="datetime-local"`, pré-rempli du créneau courant comme le faisait le prompt ;<br>• validation en ligne (`aria-invalid`, `aria-describedby`, `role="alert"`) ;<br>• bouton d'annulation en variante `destructive`, « Revenir » pour fermer, état « Enregistrement… » ;<br>• le formulaire est remonté à chaque ouverture (`key`) | une date saisie au clavier dans un prompt natif était la pire commande de l'écran ; le prompt n'était ni stylable ni annoncé correctement |

**Ce qui ne change pas**, à la lettre :
- `cancel.mutateAsync({ reason })` reçoit le motif débarrassé de ses espaces (`trim`), comme avant ;
- `updateVisit.mutateAsync({ scheduled_at: new Date(<créneau local>).toISOString() })` : le prompt faisait `new Date("AAAA-MM-JJ HH:mm".replace(' ', 'T'))`, et `datetime-local` rend directement « AAAA-MM-JJTHH:mm » ;
- les mêmes toasts de succès, et le même `router.push('/app/visits')` après l'annulation ;
- aucune gestion d'erreur ajoutée : en cas d'échec, le dialogue reste ouvert, comme `BookingDecisionDialog`.

La valeur par défaut reprend aussi le `slice(0, 16)` d'avant, avec le même comportement de fuseau, normalisé `' '` → `'T'` pour le champ natif.

**Nouvelles clés** (`i18n-set`, fr/en/wo) : `visits.detail.dialogs.{dismiss, processing}`, `dialogs.cancel.{title, description, placeholder, required, submit}`, `dialogs.reschedule.{title, description, label, required, submit}`. Le libellé du motif réutilise `visits.detail.cancellationReason`. La clé `visits.detail.prompts.newSlot` n'est plus lue par aucun composant. Je ne l'ai pas supprimée : le script `i18n-set` ne supprime pas de clé, et le brief interdit d'éditer les JSON à la main. À retirer à l'intégration.

**Tests** (`visits/__tests__/VisitDetail.test.tsx`, deux nouveaux) :
- **Annulation** : le dialogue s'ouvre ; un envoi à vide affiche l'alerte sans appeler l'API ; le payload vaut `{ reason: 'Visiteur indisponible' }` (motif rogné) ; la page redirige ; `window.prompt` n'est jamais appelé.
- **Replanification** : le champ est de type `datetime-local` et vaut `2026-05-10T10:00` ; un envoi à vide affiche l'alerte ; le payload vaut `{ scheduled_at: new Date('2026-06-01T14:30').toISOString() }`.
- **Ablation** : le bouton « Annuler » n'ouvre plus le dialogue, et `scheduled_at` part sans conversion ISO. Résultat : **2 échecs sur 8**. Après restauration : 8 verts, et 16 verts sur le dossier `visits`.

**Mesure, dialogue ouvert sans envoi** (agent, `/app/visits/274`, `localhost:3000`, ouvert par une séquence de pointeur) :

| Largeur | Dialogue | Débordement | Hauteurs | Erreurs console |
|---|---|---|---|---|
| 390, replanifier | 358 × 279 px, marge de 16 px | 0 | champ `datetime-local` 40 px ; boutons 40 px, empilés, l'action principale en premier ; fermeture 36 px | 0 |
| 390, annuler | 358 × 325 px | 0 | `Textarea` 66 px ; boutons 40 px | 0 |
| 1366 | 448 px, centré | 0 | champ 36 px ; boutons 32 px, alignés à droite | 0 |

Captures : `shots/e/final/vdlg-{reschedule,cancel}`.

Vérification :
- ESLint sur les deux fichiers : propre ;
- `tsc --noEmit` : exit 0 ;
- détecteur impeccable : `[]` ;
- `check-classes-emises` : ✓ (1733 classes) ;
- `check:i18n` : aucun écart dans `visits` ;
- `grep window.prompt src/components/visits` : aucune occurrence.

### /fr/bookings?property=<slug> — tunnel de réservation public (anon, tenant), demande du chef d'équipe (signalé par B)
Bien mesuré : `appartement-lumineux-f3-a-almadies-Bt2PTs` (id 33, location). **La base n'a aucun bien en courte durée** (`rent_period` ∈ {null, monthly}) : le tunnel a donc été mesuré sur une location au mois. Les étapes 2 et 3 ont été atteintes par `--eval`, sans rien soumettre : deux dates choisies dans le calendrier, puis « Continuer ».

Relevé avant :
- **anon** (écran « Connectez-vous pour réserver ») : 360 ✓ · 390 ✓ · 768 ✓ · 1366 ✓ (docOverflow 0, 0 erreur) ; lt44 = 5 à 360 ;
- **tenant**, étapes 1 à 3 : les 4 largeurs ✓ ; boutons de 40 px sous `sm`, 32 px au-dessus ; lt44 = 8 à 360.

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| **MEDIUM** | `components/bookings/BookingTunnel.tsx` | palette brute partout : `border-stone-200 bg-white`, `text-stone-900/700/600`, `bg-stone-50` ; écran de succès en `emerald-50/200/600/700/800/900` | `border-border bg-card`, `text-foreground` / `text-muted-foreground`, `bg-muted` ; succès sur `bg-card`, pastille `bg-success/10` + icône `text-success`, récapitulatif sur `bg-muted` | charte : jetons uniquement (et un vert hors palette Lin) |
| MEDIUM | `BookingTunnel.tsx` (commandes) | boutons `default` (32 px en bureau, 40 px sous `sm`) ; écran de connexion et écran de succès en rangée centrée | `size="lg"` + `h-11 px-4` (constante `CTA`) sur les 6 boutons, soit **44 px aux 4 largeurs** ; sur ces deux écrans, pile pleine largeur sous `sm` avec l'action principale en tête (`flex-col-reverse`) | page publique lue au doigt, même réglage que les états vides publics du groupe B |
| MEDIUM | `BookingTunnel.tsx` (étape 2) | à 360, « 41 280 000 F CFA » passait sur deux lignes à côté d'un libellé sur deux lignes | libellé en `min-w-0`, montant `shrink-0 whitespace-nowrap`, `gap-3`, bloc en `tabular-nums` | montants lisibles et alignés |
| LOW | `BookingTunnel.tsx` | titres `text-lg font-semibold` ; carte `p-6` à 360 ; montant de l'acompte dans les conditions en chiffres proportionnels | `font-display tracking-tight text-balance` ; `p-4 sm:p-6` ; `text-pretty` ; `<strong class="tabular-nums">` | charte typographique |
| MEDIUM | `components/bookings/BookingStepper.tsx` | `text-white`, `bg-white`, `border-stone-200`, `text-stone-400`, `bg-stone-200` | `text-background`, `bg-card`, `border-border`, `text-muted-foreground`, `bg-border` ; `tabular-nums`, `transition-colors` | jetons |
| MEDIUM | `components/bookings/BookingSummary.tsx` | `border-stone-*`, `bg-white`, `bg-stone-100`, `text-stone-900/500` ; vignette **vide** sans photo ; « 6 880 000 F CFA / par mois » coupé n'importe où | jetons ; repli `Building2` sur `bg-muted`, contour d'image `outline-foreground/10` ; titre en `font-display` ; montants `tabular-nums` insécables, lignes `items-baseline gap-3` ; `p-4 sm:p-5` | jetons, repère visuel, lisibilité |

Contre-relevé (même bien, mêmes gestes) :
- **anon** : 360/390/768/1366 ✓, docOverflow 0, 0 erreur. « Retour au bien » et « Se connecter » à **44 px** aux quatre largeurs ; lt44 passé de 5 à 3 à 360. Titre en `font-display` (lu dans le DOM).
- **tenant, étape 1** (« Vos dates ») : les 4 largeurs ✓, « Retour » et « Continuer » à 44 px ; lt44 passé de 8 à 6.
- **Étape 2** (« Récapitulatif ») et **étape 3** (« Conditions »), `aria-current=step` lu : les 4 largeurs ✓, 0 erreur, boutons à 44 px (« Soumettre la demande » compris, **non cliqué**). À 390, les montants tiennent sur une ligne.
- Captures : `shots/e/before/tunnel-*` et `shots/e/after/tunnel-*`.

**Non mesuré** : l'écran de succès (étape 4), qui n'apparaît qu'après la création d'une réservation en base ; ses jetons ne sont vérifiés que par la lecture du code.

**Signalé, non corrigé (défaut de calcul, pas de design)** : sur une location **au mois**, le tunnel calcule `prix × nuits`. Mesuré : 6 880 000 F CFA « par mois » × 6 nuits = **41 280 000 F CFA** de total estimé, acompte 12 384 000 F CFA. Le calcul est à `BookingTunnel.tsx:117` (`isRent && nights > 0 ? property.price * nights`), sans tenir compte de `rent_period`. À trancher par le produit : ce tunnel est-il réservé à la courte durée ?

Vérification :
- **Palette brute** : `grep` des classes `stone`/`white`/`emerald`/`gray`/`slate` dans `components/bookings` : 0.
- **Tests** `components/bookings` : 5 verts.
- **ESLint** sur `components/bookings` : 0 erreur, 1 avertissement **antérieur**, `react-hooks/incompatible-library` sur `form.watch()` (`BookingTunnel.tsx:104`), une ligne que ce lot ne touche pas.
- **`tsc --noEmit`** : exit 0.
- **Détecteur impeccable** : `[]`.
- **Gardes** :
  - `node scripts/check-public-chrome-tokens.mjs` : exit 0 ;
  - `check-app-tokens` : exit 0 ;
  - `check-classes-emises` : ✓.

**Collision (garde)** : `scripts/check-public-chrome-tokens.mjs:238` (`PERIMETRES`) ne couvre pas `components/bookings`, et sa ligne 281 (`FAMILLES`) ne compte pas `stone`. Son vert ne disait donc rien de ce tunnel, et le dirait encore demain. Proposition : ajouter `join(WEB_SRC, 'components', 'bookings')` (avec son témoin `BookingTunnel.tsx`) et `'stone'` aux familles. `components/bookings` est désormais à 0 dans ces familles.

### Remesure après correction du banc (CORS, `localhost:3000`) et du tri côté API
Le banc sert désormais `localhost:3000`, et la preuve est lue dans le DOM : `location.host = localhost:3000`. Tous les relevés à données client de ce rapport ont été pris sur des listes **remplies** : 94 cartes dans le kanban, 22 conversations, 12 réservations confirmées, 2 visites demandées. Aucun n'a donc été pris sur l'`ErrorState` du CORS.
- **`/app/crm/pipeline`** (agent, 390 et 1366) : 94 cartes, 0 `ErrorState` de colonne, 0 colonne `aria-busy`. Le tri `updated_at` est accepté par l'API (correctif du chef d'équipe dans `Customer::$requestSortable`). `lib/queries/pipeline.ts` n'a pas été modifié. Les états de chargement et d'erreur sont conservés.
- **`PipelineKanban.tsx`, correctif ajouté** : l'état « chargement » d'une colonne ne lit plus `fetchStatus` (`'idle'` au rendu serveur, `'fetching'` au premier rendu client, donc un écart d'hydratation possible). Il vaut maintenant `!!token && isPending`. Tests pipeline : 7 verts, ESLint propre, `tsc` exit 0.
- **Erreur d'hydratation intermittente, non corrigée car ce n'est pas un défaut du code** : à certains passages, le HTML serveur de `/app/crm/pipeline` porte l'**ancienne** tuile de `PipelineStatsBar` (`<button disabled class="… rounded-lg … p-4">`), alors que la source et le client rendent la nouvelle (`<div class="… rounded-xl … p-3">`). Sur trois passages après un `touch` du fichier, le premier était propre et les deux suivants non. C'est un rendu serveur périmé de `next dev` ; les serveurs n'ont pas été redémarrés (règle du brief). **À revérifier après un redémarrage de `next dev` par la session principale.**
- **Widget de messagerie** (signalement du groupe A, « Impossible de charger les conversations ») : l'erreur venait du CORS du banc, et le groupe A l'a remesurée sur localhost. Rien à corriger ici.

## Collisions (hors périmètre — NON appliquées)

| Fichier:ligne | Avant | Après | Pourquoi | Pages touchées |
|---|---|---|---|---|
| `scripts/check-locale-figee.mjs:611` | `const PLAFOND_RESTE = 48;` | `const PLAFOND_RESTE = 28;` (le compte mesuré, avec sa date) | **la garde est rouge** : le cliquet exige de descendre. Ce groupe a retiré 17 lignes `'fr-FR'` (calendrier, tiroir du pipeline), d'autres groupes le reste ; `--report` ne compte plus rien dans ce périmètre | toutes (garde de dépôt) |
| `takussan-web/src/lib/queries/pipeline.ts:59` + `takussan-api/app/Models/Customer.php` | `sort: '-updated_at'` refusé par l'API (400 *Requested sort(s) `updated_at` is not allowed*) | le correctif API **présent non commité** dans l'arbre (`Customer.php`, `CustomerPipelineTest.php`) doit partir dans le même lot que ce groupe | sans lui, les six colonnes du kanban tombent en erreur. Avec ce lot, elles le disent (`ErrorState`) au lieu d'afficher « Aucun client » | `/app/crm/pipeline` |
| `takussan-web/src/components/ui/tabs.tsx:27` | `group-data-horizontal/tabs:h-8` (déclencheurs de 25 px de haut, mesurés) | `h-10 sm:h-8` sur la liste horizontale, ou une variante `size` | cibles tactiles de 25 px sur tous les onglets de `/app` à mobile | `/app/visits`, `/app/bookings`, `/app/customers/<id>` (et hors périmètre, tout écran à onglets) |
| `scripts/check-public-chrome-tokens.mjs:238` et `:281` | `PERIMETRES` sans `components/bookings` ; `FAMILLES` sans `stone` | ajouter `components/bookings` (témoin `BookingTunnel.tsx`) et `'stone'` | le tunnel public était entièrement en `stone-*` sous une garde verte | `/fr/bookings` |
| `takussan-web/src/components/ui/input.tsx:16` | `h-8` (32 px) | `h-10 sm:h-8` | champ de 32 px au doigt ; ce groupe ne peut pas le corriger fichier par fichier sans dupliquer la primitive | `/app/customers/new`, `/app/customers` (recherche, tags), `/app/customers/<id>` |

Notes, sans changement demandé :
- `components/messages/ChatView.tsx` est aussi monté par le widget flottant du groupe A. Ses cibles passent à 44 px sous `sm` (ce groupe), ce qui sert aussi le widget.
- Un passage à 1366 sur `/app/customers` a rendu l'écran de panne, à cause du HMR de `components/layout/ProUpgradeCard.tsx` (groupe A) en cours d'édition. La remesure est verte.
- `scripts/check-status-badge-unique.mjs` est rouge sur `components/announcements/GlobalAnnouncementBanner.tsx:14,15`, hors de ce périmètre (un autre groupe).

## Écartés

| Emplacement | Candidat | Écarté parce que |
|---|---|---|
| `components/customer-dashboard/CustomerTagPicker.tsx` (palette) | retirer la teinte destructive de la palette des tags | la couleur d'un tag est un choix de l'utilisateur, déjà enregistré en base ; la retirer change des données existantes |
| `components/pipeline/PipelineKanban.tsx` (mobile) | réécrire l'aide « déplacez les cartes » à mobile, où l'on change d'étape par onglets | c'est une copie produit, et le glisser-déposer reste possible au toucher (dnd-kit) ; à trancher par le produit |
| `components/calendar/MonthView.tsx` (mobile) | faire défiler jusqu'au panneau du jour après un toucher | changement de comportement ; le panneau reste visible sous la grille à 390 |
| `app/(dashboard)/app/customers/[id]` (relations) | traduire le type et le statut d'une relation | l'API émet des codes libres, sans énumération côté front : il faut d'abord la liste des codes (ticket i18n) |
| `components/calendar/WeekView.tsx` (fuseau) | formater en `Africa/Dakar` comme `useFormatteurs` | la grille calcule en dates locales du navigateur : formater à Dakar décalerait les heures affichées (cf. docblock de `calendar/dates.ts`) |
| `components/customer-dashboard/CustomerListFilters.tsx:46` | avertissement ESLint `exhaustive-deps` (`activeTags`) | antérieur à la revue, sans effet visible ; le corriger touche la logique de filtre |

## Vérification

- `npx vitest run src/components/{pipeline,customer-dashboard,customer-form,messages,calendar,visits,bookings} "src/app/(dashboard)/app/__tests__"` : **22 fichiers, 205 tests verts**. Après l'ajout du 403, `visits` + `bookings` : 4 fichiers, 19 tests verts, et `pipeline` : 7 verts.
- Ablation du test 403 : sans le correctif, le message rendu est « Impossible de charger cette visite. », donc `getByText(/relève d'une autre agence/)` échoue.
- `npx eslint <35 fichiers>` : 0 erreur, 1 avertissement antérieur (`CustomerListFilters.tsx:46`). L'import inutilisé `CustomerListItem` de `CustomerTagPicker.tsx` a été retiré.
- `npx tsc --noEmit` :
  - 1er passage : **rouge** sur `PipelineColumn.tsx:86` (props d'`ErrorState` étalées, union discriminée). Corrigé par deux branches explicites. Il y avait aussi deux erreurs hors périmètre (`admin/ModerationWorkspace.tsx:169`, `admin/PropertyModerationWorkspace.tsx:99`, `tCommon` introuvable, un autre groupe en cours d'édition).
  - Passage final : **exit 0**. La commande a tourné trois fois au lieu d'une : il fallait prouver le correctif.
- Gardes (depuis la racine) :
  - `check-app-tokens` : 0 ;
  - `check-feedback-states` : 0 ;
  - `check-destructive-contrast` : 0 (min 4.55:1) ;
  - `takussan-web/scripts/check-classes-emises.mjs` : ✓, 1722 classes toutes émises ;
  - `check-status-badge-unique` : **1**, sur `announcements/GlobalAnnouncementBanner.tsx`, hors périmètre. Les nouvelles tables `*_TONE` (ton par nom, sans classe) ne sont pas comptées ;
  - `check-locale-figee` : **1**, le cliquet doit descendre de 48 à 28 (voir Collisions).
- `npm run check:i18n` : parité fr/en/wo intacte. 4 écarts, **tous hors périmètre** (`PropertyLocationMapInner.tsx`, `OverduePaymentsTable.tsx`, `SuperAdminPropertiesTable.tsx`).
- Après le correctif d'hydratation de `PipelineKanban.tsx` : vitest pipeline 7/7, ESLint propre, `tsc --noEmit` exit 0.
- `node …/impeccable/scripts/detect.mjs --json <35 fichiers>` : `[]` (aucune trouvaille).
- Chrome du port 9345 arrêté en fin de revue.
