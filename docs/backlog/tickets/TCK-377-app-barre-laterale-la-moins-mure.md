---
id: TCK-377
title: "Tableau de bord /app — la barre latérale est la moins mûre des trois, et c'est celle que tout le monde utilise"
status: done
phase: P1
family: bug
estimate: M
wave: 48
created: 2026-08-26
updated: 2026-08-27
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#22-rôles--permissions
    - docs/features.md#25-reporting--tableaux-de-bord
    - docs/features.md#17-communication--messagerie
tags: [front, dashboard, navigation, a11y, bug]
---

## Objectif utilisateur

Quel que soit son rôle, l'utilisateur connecté sait **où il est** dans le tableau de bord, trouve
l'entrée qu'il cherche sans parcourir une liste de vingt-trois lignes, et voit depuis le menu ce
qui l'attend.

## Contexte

Le dépôt porte **trois** barres latérales. Elles ont été écrites dans cet ordre : `AppSidebar`
(TCK-055, la plus ancienne), `AdminSidebar`, `SuperAdminSidebar` (TCK-357/359, la plus récente).
Chaque génération a appris quelque chose que la précédente n'a pas reçu en retour.

Relevé du 2026-08-26 :

| Propriété | `SuperAdminSidebar` | `AdminSidebar` | `AppSidebar` |
|---|---|---|---|
| Entrées groupées en sections | ✅ `NAV_GROUPS` (l. 56) | ❌ | ❌ |
| Actif sur les pages filles | ✅ `isActivePath` (l. 249-252) | ✅ en ligne (l. 194-197) | ❌ `pathname === item.href` (l. 316) |
| `aria-current="page"` | ✅ (l. 200, 230) | ❌ | ❌ |
| Compteurs sur les entrées | — | ✅ deux sondages 60 s (l. 154, 167) | ❌ aucun appel réseau |
| Entrées maximum, à plat | groupées | ~10 | **23** (`agency_admin`) |

Les deux premières lignes se voient tout de suite à l'usage :

- **Aucune entrée n'est surlignée sur une page de détail.** `/app/properties/42`,
  `/app/leases/7`, `/app/bookings/12`, `/app/visits/3`, `/app/maintenance/9`,
  `/app/documents/4`, `/app/inventories/5`, `/app/customers/8`, `/app/leases/new`,
  `/app/customers/new`, `/app/inventories/new`, `/app/maintenance/new` — douze routes de
  `/app` sur quarante-six, et sur chacune la barre latérale n'indique rien. `AdminSidebar`
  résout exactement ce cas depuis son commentaire l. 193 : *« prefix match for nested routes so
  "Paramètres" stays highlighted on /admin/settings/tags »*. `AppSidebar` ne l'a jamais reçu.
- **Vingt-trois entrées à plat pour un `agency_admin`** (comptées sur `buildNavItems`, après
  dédoublonnage) : tableau de bord, biens, publier, favoris, recherches, réservations, baux,
  maintenance, carnet prestataires, messagerie, documents, statistiques, exports, vue agence,
  KPI, alertes, bailleurs, CRM, états des lieux, visites, calendrier, onboarding en attente,
  administration. Treize pour un `customer`. Aucun repère, aucune césure.

Le troisième point est ce qui manque au menu, pas ce qui y est faux : **`AppSidebar` ne fait
aucun appel réseau.** Un locataire ne voit pas depuis le menu qu'il a un message non lu, un
agent ne voit pas qu'une demande de visite attend. `useConversations` sonde déjà toutes les
10 s (`src/lib/queries/conversations.ts:101`) — la donnée existe, le menu ne la lit pas.

*Une génération qui n'apprend rien de la suivante finit par servir les utilisateurs les moins
bien lotis : ici, tous.*

## Contrat de données

Aucun endpoint à créer. Les compteurs se prennent sur ce que le front consomme déjà :

- messages non lus — `GET /api/conversations` (déjà sondé par `src/lib/queries/conversations.ts`)
- demandes de visite en attente — `GET /api/visits?filter[status]=pending`, `per_page=1`, compte
  lu dans `meta` (la forme exacte qu'`AdminSidebar` emploie pour ses deux compteurs)

Le sondage suit la même règle que la console agence : `enabled` sur le rôle qui voit l'entrée,
jamais un appel pour un rôle qui n'a pas la ligne.

## Direction UX / Artistique

- **Le regroupement porte le parcours, pas l'inventaire technique.** Les sections se lisent dans
  l'ordre où le métier arrive : découvrir → demander → s'engager → piloter. L'étiquette de section
  est discrète (petite, en majuscules espacées) ; c'est une césure, pas un titre.
- Un rôle qui n'a que trois entrées ne doit pas se voir infliger trois en-têtes de section : le
  groupement s'efface quand il n'a plus de travail à faire.
- Le compteur est un **signal**, pas une alarme : il dit qu'il y a quelque chose, il ne crie pas.
  Il ne s'affiche jamais à zéro.
- L'entrée courante doit être reconnaissable **sans la couleur seule** — c'est la même exigence
  que TCK-359 pose sur la console super-admin.
- La barre reste utilisable au clavier de bout en bout, y compris repliée en tiroir sur mobile.

## Contraintes strictes (métier)

- **Le regroupement ne change aucun droit.** Les conditions de rôle de `buildNavItems` sont le
  contrat ; ce ticket réorganise l'affichage, il n'ajoute ni ne retire aucune entrée à aucun
  rôle. Toute entrée qui change de visibilité est hors périmètre (c'est TCK-379).
- L'entrée cadenassée (`isProRouteLocked`) garde son cadenas, sa sémantique et son
  `aria-disabled` : le cadenas n'est pas une autorisation, il n'en devient pas une.
- Le surlignage par préfixe ne doit **pas** faire de `/app` le parent de tout : la racine se
  compare par égalité stricte, exactement comme `AdminSidebar` traite `/admin` et
  `/admin/agency`. Même exception pour `/app/properties` vs `/app/properties/new`, et
  `/app/leases` vs `/app/leases/onboarding-pending` — sinon deux entrées s'allument ensemble.
- Un compteur qui échoue à se charger n'affiche rien ; il n'affiche jamais `0`, ni un `—`, ni un
  état d'erreur dans le menu.

## Delta à produire

- [x] Surlignage par préfixe dans `AppSidebar`, avec la liste explicite des racines comparées par
      égalité — la même forme que `AdminSidebar`, factorisée pour que les trois shells la
      partagent plutôt que de la réécrire une quatrième fois
- [x] `aria-current="page"` sur l'entrée active — dans les **trois** shells, `AdminSidebar`
      comprise, qui ne l'a pas non plus
- [x] `aria-label` sur le `<nav>` de `AppSidebar`
- [x] Sections de navigation dans `buildNavItems` : la donnée porte la clé de section, le rendu
      la résout (patron TCK-286, déjà appliqué aux libellés)
- [x] Compteur « messages non lus » et compteur « visites en attente » sur les entrées
      correspondantes, sondés comme ceux d'`AdminSidebar`
- [x] i18n fr/en/wo des étiquettes de section et du libellé accessible des compteurs
- [x] Tests : un par défaut corrigé — surlignage sur une page fille, absence de surlignage
      croisé sur les trois couples de routes imbriquées, `aria-current` présent, compteur absent
      à zéro

## Critères d'acceptation

- [x] AC1 — sur `/app/properties/42`, l'entrée « Mes biens » est active ; un test l'éprouve et
      **échouerait** si `pathname === item.href` revenait
- [x] AC2 — sur `/app/properties/new`, **une seule** entrée est active, et c'est « Publier un
      bien » ; idem pour `/app/leases/onboarding-pending` contre « Baux ». Un test couvre les
      trois couples imbriqués et échouerait sur un préfixe naïf
- [x] AC3 — l'entrée active porte `aria-current="page"` dans `AppSidebar` **et** `AdminSidebar`
- [x] AC4 — pour un `agency_admin`, les 23 entrées sont réparties en sections ; la liste des
      `href` rendus est **identique** à celle d'avant le ticket, à l'ordre près — un test compare
      les deux ensembles pour chacun des six rôles
- [x] AC5 — un compteur ne s'affiche pas quand la valeur est `0` ni quand la requête échoue ; un
      test l'éprouve dans les deux cas
- [x] AC6 — aucun sondage réseau n'est armé pour un rôle qui ne voit pas l'entrée comptée
      *Cochée seulement depuis le correctif final : la branche est devenue atteignable par un rôle
      réel (TCK-379 retire `/app/visits` au `service_provider`) et rien ne l'observait alors — cf.
      Notes ci-dessous.*
- [ ] AC7 — `npm run lint`, `npx tsc --noEmit`, `npm run test` passent
      *Non cochée : `npm run lint` (0 erreur, 36 avertissements tous préexistants) et
      `npx tsc --noEmit` (0 erreur) sont exécutés et verts sur l'arbre fusionné (2026-08-27), et
      `src/components/layout` + `src/app/(dashboard)` rendent 228/228. `npm run test` **en entier**
      n'a jamais tourné — il appartient à la session déléguante (CLAUDE.md, « qui lance quoi »).*

## Hors périmètre

- **Changer qui voit quoi** : les entrées poussées sans garde de rôle et les écrans sans chemin
  sont l'objet de TCK-379.
- Repliage persistant de la barre, recherche dans le menu, navigation basse sur mobile.
- La palette et les primitives de rendu : TCK-380 et TCK-381.
- Le contenu des pages atteintes.

## Notes d'implémentation

### Ce que la re-mesure a contredit (2026-08-27)

| Affirmation du ticket | Mesuré |
|---|---|
| `GET /api/visits?filter[status]=pending`, compte dans `meta` « la forme exacte qu'`AdminSidebar` emploie » | **Faux sur trois points.** L'endpoint est `/api/property-visits` (`routes/api/property-visits.php`). Il n'existe **aucun** statut `pending` : `App\Models\Enums\VisitStatus` en compte cinq — `scheduled`, `confirmed`, `completed`, `cancelled`, `no_show` — et « en attente » est `scheduled`, que le front rend déjà « Demandée ». Le compte est `meta.total` ; `meta.pending_count` n'existe que sur les deux files de modération, qui l'ajoutent. |
| « les **trois** couples de routes imbriquées » | **Cinq.** Aux trois nommés (`/app`, `/app/properties` ⊃ `/new`, `/app/leases` ⊃ `/onboarding-pending`) s'ajoutent `/app/maintenance` ⊃ `/app/maintenance/providers` et `/app/overview` ⊃ ses **quatre** filles (`exports`, `agency`, `kpis`, `alerts`). Une liste explicite de racines aurait donc été fausse le jour de sa rédaction — d'où le départage **par longueur** plutôt que par énumération. |
| « `useConversations` sonde déjà toutes les 10 s — la donnée existe, le menu ne la lit pas » | **Exact, et meilleur que ça** : `ChatWidget` est monté dans `src/app/layout.tsx`, donc `useConversations()` tourne déjà sur toute page authentifiée. La clé de requête étant identique, la pastille « Messagerie » coûte **zéro requête**. |
| « 23 entrées à plat pour un `agency_admin`, treize pour un `customer` » | **Exact**, et la liste des 23 du Contexte est juste, entrée pour entrée. Relevé complet des sept rôles : 23 (`agency_admin`, `super_admin`), 18 (`agent`), 16 (`owner`), 13 (`customer`), 10 (`service_provider`), **9 (`tenant`)**. |
| « douze routes de `/app` sur quarante-six » | **Exact** (46 `page.tsx` sous `(dashboard)/app`), mais **sous-estimé** : `/app/crm`, `/app/crm/pipeline`, `/app/overview/{agent,owner,tenant}`, `/app/profile/notifications`, `/app/account/privacy`, `/app/payments/return` et `/app/settings/agency/upgrade` n'étaient pas surlignées non plus. |
| Renvois de lignes du tableau comparatif | `NAV_GROUPS` l. 56 ✓, `isActivePath` l. 249 ✓, `AdminSidebar` l. 194-197 ✓. `AppSidebar` : `pathname === item.href` était **l. 334**, pas 316. |

### AC6 n'a aujourd'hui aucune prise sur la réalité, et c'est dit

`/app/messages` et `/app/visits` sont poussées **sans aucune garde de rôle** : les sept rôles les
voient. La branche `enabled: false` n'est donc atteinte par aucun rôle réel. `countersToPoll` est
exportée et éprouvée sur une liste construite, plus un test qui **épingle le constat** — il rougira
le jour où TCK-379 gardera l'une des deux, et c'est à ce moment-là que la branche deviendra
observable. *Un critère coché par une branche que rien n'exécute n'est pas couvert.*

### Deux défauts mesurés hors du « Delta à produire », dont un corrigé

- **L'entrée cadenassée mesurait 2,51:1.** `opacity-60` compose `--muted-foreground` (#6e655a) sur
  `--card` (#ffffff) — très en dessous du 4,5:1 de WCAG AA, et aucune opacité intermédiaire ne
  sauve la paire (0,9 → 4,57 ; 0,8 → 3,70). `opacity-60` est **retiré** : 5,72:1, le cadenas, le
  `cursor-not-allowed`, le `title` et l'`aria-disabled` portant seuls la sémantique. *Encoder
  « désactivé » dans un contraste illisible, c'est le dire à ceux qui le voyaient déjà.*
- **`AdminSidebar` allumait DEUX entrées** sur `/admin/moderation/properties` pour un super-admin,
  `/admin/moderation` et `/admin/moderation/properties` étant deux préfixes valides. Corrigé
  gratuitement par le passage au plus-long-préfixe. Non corrigé, en revanche : son entrée
  cadenassée (`text-white/40 opacity-60` sur `--foreground`) est bien pire que celle de `/app` —
  c'est de la palette, donc TCK-380/381.

### Les sept contrastes de la barre, recalculés

sRGB → luminance relative WCAG 2.x, **alpha composé avant le calcul**, sur le fond **réel** —
l'`<aside>` est `bg-card` (#ffffff) et non `--background` (#fcf9f3), qu'il masque.

| Paire | Fond | Mesure | Seuil |
|---|---|---|---|
| entrée inactive `--muted-foreground` | `--card` | **5,72:1** | 4,5 |
| entrée inactive au survol | `--muted` | **4,85:1** | 4,5 |
| entrée active `--foreground` | `--border` | **13,94:1** | 4,5 |
| libellé de section `--muted-foreground` | `--card` | **5,72:1** | 4,5 |
| pastille `--primary-foreground` | `--primary` | **5,06:1** | 4,5 |
| anneau `--ring` (peint HORS border-box) | `--card` | **5,32:1** | 3 |
| anneau `--ring` (bord interne, entrée active) | `--border` | **4,23:1** | 3 |

Trois mesures ont **écarté** un choix : `--muted-foreground` à 70 % pour le libellé de section
(3,03:1 — refusé, il reste à pleine opacité) ; une règle `border` entre sections (1,26:1 sur
`--card` — la césure est portée par la typographie et l'espacement, pas par un trait) ; et le fond
supposé `--background` au lieu de `--card`, qui aurait annoncé 5,44 pour une paire qui en mesure
5,72. **Aucun `ring-offset` n'est nécessaire ici** — contrairement au shell super-admin (TCK-359),
où `--ring` et `--sidebar-primary` se confondent sur fond sombre.

### Décisions de structure

- La règle de surlignage vit dans **`src/lib/navigation/active-path.ts`**, avec **deux** formes.
  `resolveActiveHref` (le plus long préfixe, un seul gagnant) pour `AppSidebar` et `AdminSidebar` ;
  `isActiveHref` (préfixe simple) pour `SuperAdminSidebar`, **délibérément** : ses entrées ont des
  `children` rendus sous leur parent, et le plus-long-préfixe éteindrait le parent. La différence
  est un choix de rendu, pas un oubli.
- Le départage **par longueur** remplace l'énumération des couples imbriqués : une liste écrite à
  la main aurait manqué deux couples sur cinq le jour même (cf. tableau ci-dessus).
- `aria-current="page"` est posé sur l'entrée **active** (donc aussi sur une page de détail), et
  non sur la seule égalité stricte : avec le plus-long-préfixe, une seule entrée est active à la
  fois, ce qui rend l'attribut non ambigu.
- La section `primary` n'a **pas** de libellé, et c'est la DONNÉE qui le dit (`SECTION_LABEL_KEYS`
  vaut `null`), pas un test sur son nom dans le rendu.

### Vérification par ablation

Onze régressions rejouées sur les 65 tests des deux fichiers neufs, **rouges à chaque fois**,
vertes au retour : retour à `pathname === item.href` (13 rouges) · préfixe sans départage par
longueur (11) · `/app` retiré des racines exactes (3) · `aria-current` retiré d'`AdminSidebar` (2)
· compteur peint à zéro (3) · cadenas qui ne coupe plus le sondage (1) · `opacity-60` rendu à
l'entrée cadenassée (1) · `aria-label` du `<nav>` retiré (1) · anneau de focus retiré (1) ·
sections vides conservées (2) · une entrée de plus pour un rôle (9).

### Non vérifié

Aucune vérification navigateur : tout est calculé ou exécuté sous jsdom. En particulier
l'apparence réelle des césures et de la pastille, et le comportement de la barre repliée en tiroir
sur mobile.

### Revue adverse et correctif final (2026-08-27)

**Verdict : REFUSÉ**, puis corrigé. Les contrastes et le surlignage tiennent — les 16 paires ont
été **recalculées indépendamment** et reproduisent les chiffres du tableau ci-dessus à ±0,02 près,
sur le fond RÉEL vérifié en remontant la chaîne (`AppShell` → `<aside> bg-card`, et le chemin
mobile `SheetContent` est `bg-card` aussi). Les trois ablations du surlignage ont été rejouées à
l'identique : 13, 11 et 3 rouges, comptes exacts. Aucune assertion n'a été perdue au renommage de
`AppSidebar.test.tsx` en `AppSidebar.audience.test.tsx` (9 tests sur 9, table `ATTENDU` identique
octet pour octet).

**Ce qui a été refusé, ce sont les gardes — cinq mutations survivantes, toutes fermées depuis :**

| Mutation survivante (mesurée) | Ce qui a été fait |
|---|---|
| `useUnreadCount({ enabled: true })` et `usePendingVisitsCount({ enabled: true })` écrits **en dur**, `countersToPoll` ignorée par le composant → **88/88 verts**. AC6 n'avait aucune garde au niveau du RENDU : le seul test qui capturait les arguments montait un `agency_admin`, pour qui `enabled: true` est la bonne réponse. | `it.each` sur les **sept** rôles, montant réellement la barre, plus une clause qui fige `service_provider → {unreadMessages}` seul et exige que la liste des rôles qui ne sondent pas `pendingVisits` soit exactement `['service_provider']`. Ablation → 1 rouge. |
| Le test AC6 réparé à la fusion recalculait son attendu avec **le prédicat exact du corps de `countersToPoll`**, sur le même `items` : tautologie, incapable de rougir sur un changement de garde de rôle. Prouvé : la mutation qui réintroduit le défaut n°4 de TCK-379 rendait 3 tests rouges, et pas celui-là. | L'attendu est dérivé de deux sources indépendantes du composant, écrites à la main : `HREFS_PAR_ROLE` et `COMPTEUR_PAR_HREF`. La même mutation rend maintenant **6 rouges, dont les deux tests AC6**. |
| `SECTION_ORDER` intégralement **inversé** — « Administration » en haut, « Tableau de bord » en bas, c'est-à-dire la thèse même du ticket retournée → **88/88 verts**. Le test existant vérifiait la PRÉSENCE des cinq en-têtes, jamais leur séquence. | Un test de rendu lit la séquence des `<p>` d'en-tête **dans le DOM** et la compare à une liste écrite à la main (non dérivée de `SECTION_ORDER`, sans quoi il comparerait la constante à elle-même). Ablation → 1 rouge. |
| `withHeadings = true` (césures imposées à une section unique) → **88/88 verts**. Et pire : la règle **n'était pas gardable** dans cette forme — `/app`, `/app/messages` et `/app/documents` étant poussées sans condition de rôle, tout compte a au moins deux groupes, donc la branche `false` n'était atteignable par personne. *Une règle qu'aucune entrée ne peut violer ne peut pas rougir.* | La décision sort du composant (`withSectionHeadings`, pure et exportée) et gagne une clause atteignable : les en-têtes ne paraissent que si au moins une section **libellée** porte deux entrées ou plus. Ablations → 1 puis 3 rouges. |
| Le docblock de la table d'href promettait « relevé pris sur le code d'AVANT TCK-377 » alors que la ligne `service_provider` avait été régénérée depuis le code d'APRÈS TCK-379. | `HREFS_AVANT_TICKET` renommée `HREFS_PAR_ROLE` — *le nom portait le mensonge* — et le docblock dit ligne par ligne ce que la table est : relevé d'avant-ticket pour six rôles, spec (`features.md` §1.8/§2.5) pour le septième. |

**La règle « le regroupement ne change aucun droit » est tenue, et re-prouvée après correctif** :
`occupeUnLogement`, `buildNavItems`, `SECTION_ORDER` et `SECTION_LABEL_KEYS` extraits avant/après
ont le **même md5** ; le dump des href sur 7 rôles + 2 combinaisons reproduit exactement celui de
la revue (23 / 23 / 18 / 16 / 13 / 4 / 9, et 10 pour `service_provider+tenant`).

⚠ **Un seul changement visible au rendu, et il est voulu** : le `service_provider`, avec ses
4 entrées, ne reçoit plus les deux césures « Demandes » et « Engagements » qui coiffaient UNE
entrée chacune. Aucun href ne bouge. C'est le cas exact que la Direction UX de ce ticket nomme.

**Reste ouvert** : la table d'href est dupliquée octet pour octet entre `AppSidebar.test.tsx` et
`AppSidebar.audience.test.tsx` — un fichier tiers non-test serait la sortie, mais c'est un fichier
neuf hors du périmètre du correctif ; le coût (éditer deux endroits) est écrit dans les deux
docblocks. L'entrée cadenassée d'`AdminSidebar` (`text-white/40 opacity-60`) reste bien pire que
celle de `/app` : c'est de la palette, donc TCK-380/381. Aucune vérification navigateur.
