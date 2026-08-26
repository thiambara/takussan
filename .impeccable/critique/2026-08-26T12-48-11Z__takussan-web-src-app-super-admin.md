---
score: 17
max: 40
p0: 2
p1: 3
p2: 1
target: takussan-web/src/app/(super-admin)
method: single-context (sub-agents disabled by session policy)
timestamp: 2026-08-26T12-48-11Z
slug: takussan-web-src-app-super-admin
---
⚠️ DEGRADED: single-context (sous-agents interdits par consigne de session ; assessments A et B joués séquentiellement dans le même contexte)

# Critique — console `/super-admin`

Cible : `takussan-web/src/app/(super-admin)` + `src/components/admin/super` + `src/components/layout/SuperAdmin*`
Périmètre mesuré : 53 fichiers `.tsx` (hors tests), 24 écrans, 94 routes API `admin.*`.
**Aucune inspection navigateur** : docker est arrêté, l'API et le front ne répondent pas (`curl localhost:3000` → 000). Tout ce qui suit est dérivé du code et de contrastes calculés, pas de captures.

## Design Health Score

| # | Heuristique | Score | Constat |
|---|---|---|---|
| 1 | Visibilité de l'état système | 2 | 21 composants sur 22 n'ont pas d'état de chargement ou d'erreur complet ; 8 n'ont **ni** l'un **ni** l'autre (`alerts`, `feature-flags`, `maintenance`, `notification-templates`, `system-health`…). Une seule file porte un badge de backlog (upgrade-requests) ; KYC et modération n'en ont aucun. |
| 2 | Correspondance avec le monde réel | 2 | La file KYC affiche « Agence #12 » — l'identifiant technique à la place du nom. Les sondes de santé affichent `ok` / `error` bruts, en anglais, dans les trois langues. |
| 3 | Contrôle et liberté | 2 | Aucun fil d'Ariane sur les fiches (`/users/[id]`, `/agencies/[id]`). Aucun « réinitialiser les filtres » sur les 6 filtres de `/users`. Aucune annulation d'action. |
| 4 | Cohérence et standards | 1 | **Le point le plus faible.** Trois vocabulaires de couleur coexistent (348 utilitaires Tailwind bruts / 109 tokens shadcn / 25 tokens `app-*`), 11 tables faites à la main avec 5 échelles de padding différentes, deux paginations distinctes, `<Badge>` importé dans 10 fichiers et réimplémenté à la main dans 8 endroits. |
| 5 | Prévention de l'erreur | 3 | `ConfirmActionDialog` est bien posé sur les actions destructives (5 écrans) et demande un motif. Mais `retryAll` et la purge d'un job échouent sans confirmation. |
| 6 | Reconnaissance plutôt que rappel | 1 | Le filtre « agence » de `/users` est un **champ numérique où l'on tape un ID à la main**. Les sélecteurs d'agence de `/properties` et `/moderation` ne chargent que les 50 premières agences, silencieusement. |
| 7 | Flexibilité et efficacité | 1 | Pas de recherche globale ni de palette de commandes. Pas de tri par colonne (aucune table n'est triable). Pas de sélection multiple hors `/properties`. Pas de raccourcis clavier. La recherche `/users` déclenche **une requête par frappe** (aucun debounce nulle part). |
| 8 | Esthétique et minimalisme | 2 | La console ouvre sur 8 nombres de même poids, sans tendance, sans lien, sans hiérarchie. `/system` réaffiche exactement la même grille. |
| 9 | Récupération d'erreur | 2 | `ErrorState`/`DestructiveBanner` existent et sont utilisés à 6 endroits ; ailleurs c'est un `<div class="bg-destructive/10">` recopié 5 fois, ou `text-red-600` en dur (`/super-admins`). Aucun bouton « réessayer » n'est câblé. |
| 10 | Aide et documentation | 1 | Deux bandeaux d'avertissement, aucune aide contextuelle sur des écrans qui pilotent la production (feature flags, maintenance, réglages plateforme, enums verrouillés). |
| **Total** | | **17/40** | **Sous la moyenne — une console fonctionnellement riche, visuellement non gouvernée** |

## Verdict anti-patterns

**Évaluation LLM.** Ce n'est pas de la « slop IA » — c'est le défaut inverse, et plus coûteux : *l'étrangeté sans intention*. Le test du registre produit (« un utilisateur habitué à Linear / Stripe ferait-il confiance à cette interface ? ») échoue non pas sur une page mais sur le passage d'une page à l'autre. Même action, deux apparences ; même donnée, deux densités ; même erreur, trois rendus. Les tells :

- **La stratégie « distinct » n'est pas tenue.** La console est censée être visuellement non-ambiguë face au dashboard agence (commentaire de `SuperAdminSidebar`, TCK-145). Mais `stone-100` (fond de contenu) contre `#fcf9f3` (fond Lin) : **rapport 1,04:1** — l'œil ne les distingue pas. Seule la barre latérale est sombre. Le signal « tu es en cross-tenant » repose donc entièrement sur 256 px à gauche que l'on ne regarde plus après trois minutes.
- **L'ambre n'est la couleur de personne.** `amber-500` porte l'accent de la console (56 occurrences) alors que la marque est terracotta `#a85332` et sage `#5d6e4f`. `docs/design-guidelines.md` réserve l'ambre à l'**avertissement**. Résultat : l'onglet actif de Reporting, le badge de file, l'item de nav sélectionné et le bandeau « attention, réglages sensibles » parlent tous la même couleur. Un accent qui veut dire « ici » et « danger » ne veut plus rien dire.
- **Les graphiques sont des barres CSS.** `GrowthChart`/`RevenueChart` empilent des `<div>` à hauteur en `%` : pas d'axe, pas de grille, pas de graduation, pas d'infobulle (juste l'attribut `title=`), pas d'état vide. Sur une page qui s'appelle « Rapports », c'est le placeholder qui a survécu.
- **Cartes par réflexe.** `/users` rend des utilisateurs en cartes empilées là où les 10 autres listes de la console sont des tables. Une carte par ligne de données, c'est la réponse paresseuse.

**Scan déterministe.** `detect.mjs` → 3 avertissements, tous `gray-on-color` :
`ImpersonationBanner.tsx:32`, `SuperAdminPropertiesTable.tsx:160`, `SuperAdminSidebar.tsx:213`.
**Les trois sont des faux positifs** : `stone-900` sur `amber-500` mesure 8,14:1. La règle attrape le motif « gris sur teinte » sans calculer le contraste. Le détecteur, en revanche, **rate** le vrai défaut d'accessibilité (ci-dessous) parce qu'il n'évalue pas les couleurs de la barre latérale sombre.

**Contrastes calculés** (WCAG, valeurs Tailwind exactes) :

| Paire | Ratio | Verdict |
|---|---|---|
| `text-stone-500` sur `bg-stone-900` — libellés de groupe de la sidebar, 11 px majuscules | **3,65:1** | ❌ échoue AA (4,5 requis) |
| `text-stone-500` sur `bg-stone-50` — en-têtes de table | 4,59:1 | ⚠ passe de justesse |
| `text-stone-500` sur `bg-white` — libellés de tuiles | 4,80:1 | ⚠ marginal |
| `text-amber-700` sur `amber-500/15` — onglet actif Reporting | 4,56:1 | ⚠ marginal |
| `bg-stone-100` vs `--background` Lin | 1,04:1 | ❌ la distinction visuelle recherchée n'existe pas |

**Overlays navigateur** : non disponibles. Docker arrêté, aucun serveur local à instrumenter. Aucune capture n'a été prise ; aucun overlay n'est visible.

## Impression d'ensemble

La console est **beaucoup plus complète qu'elle n'en a l'air** : 24 écrans, 94 routes API branchées, une seule fonction de requête orpheline sur ~90. Le travail fonctionnel est là. Ce qui manque n'est pas du code, c'est une **gouvernance visuelle** : personne n'a jamais décidé, une fois, à quoi ressemble une table, un badge de statut, un en-tête de page, une erreur — alors chaque écran l'a redécidé. 17 fichiers sur 53 peignent en `stone` codé en dur, 27 en tokens, 2 en `app-*`, et 6 mélangent deux vocabulaires **dans le même fichier**.

La conséquence n'est pas seulement esthétique. `bg-white` (36 fois) et `ring-stone-200` (17 fichiers) ne répondront **jamais** à `.dark` — les tokens sombres existent pourtant dans `globals.css:192` et 67 `dark:` vivent ailleurs dans l'app. Chaque écran peint en dur est un écran qu'il faudra réécrire le jour du thème sombre.

**La plus grande opportunité, en une phrase :** extraire six primitives (`Table`, `PageHeader`, `StatCard`, `StatusBadge`, `FilterBar`, `DataState`) et faire passer les 24 écrans dessus. C'est le même geste qui répare la cohérence, l'accessibilité, le thème sombre et la lisibilité — et il se mesure.

## Ce qui marche

1. **Le contrat de données est propre.** Sparse fieldsets, `filter[]`, `include=`, état d'URL partageable sur `/properties` et `/moderation`, `staleTime` calibrés, invalidation ciblée après décision. Le socle react-query est meilleur que l'UI qu'il sert.
2. **La garde d'accès est exemplaire.** Le layout serveur intercepte l'absence de token *en conservant l'URL demandée*, détourne le super-admin en enrôlement 2FA incomplet, puis vérifie le rôle — trois cas, zéro flash d'UI admin côté client.
3. **`ConfirmActionDialog` demande un motif.** Sur une console cross-tenant, exiger une justification écrite avant de suspendre une agence ou d'usurper un compte est la bonne décision produit, et elle est appliquée là où ça compte.

## Problèmes prioritaires

### [P0] Trois vocabulaires de couleur, aucun gouverné
**Pourquoi ça compte** — C'est la cause racine de « c'est moche ». Ce n'est pas un écran raté, c'est l'absence de règle : 348 utilitaires Tailwind bruts contre 109 tokens. `/super-admins` peint en `app-ink` + `amber-100` + `emerald-100` + `text-red-600` ; son voisin `/kyc` peint en `foreground` + `border` + `<Badge>`. Le lecteur ressent l'incohérence sans pouvoir la nommer — et `docs/design-guidelines.md` l'interdit déjà noir sur blanc (« la palette Tailwind brute n'est pas la palette du produit »).
**Correctif** — Décider la palette de la console (voir la proposition plus bas), l'écrire en tokens dans `globals.css`, puis convertir mécaniquement : `bg-white`→`bg-card`, `ring-stone-200`→`ring-border`, `text-stone-500`→`text-muted-foreground`, `text-stone-900`→`text-foreground`, `amber-*` d'accent→`primary`, `amber-*` d'avertissement→un vrai token `--warning`. Ajouter une garde `scripts/check-super-admin-tokens.mjs` qui casse sur toute réintroduction — sinon le motif revient au troisième ticket.
**Commande** — `$impeccable extract takussan-web/src/components/admin/super`

### [P0] Onze tables faites à la main, aucune primitive
**Pourquoi ça compte** — Cinq échelles de padding (`px-2/3/4` × `py-2/3`) selon la table, `scope="col"` sur 15 `<th>` seulement, aucun `<caption>`, aucun tri, aucune ligne survolée sauf une. C'est la moitié de la sensation « bricolé », et c'est aussi de l'accessibilité perdue.
**Correctif** — `npx shadcn@latest add table` (vérifier `@base-ui/react`), puis un `DataTable` maison au-dessus : densité unique, `<th scope="col">`, tri par colonne, ligne survolée, colonne d'actions alignée à droite, défilement horizontal encapsulé. Migrer les 11 appelants.
**Commande** — `$impeccable extract takussan-web/src/components/admin/super`

### [P1] La file KYC ne permet pas de traiter la file
**Pourquoi ça compte** — C'est le seul défaut de cette liste qui coûte du temps humain tous les jours. L'écran liste des dossiers, affiche « Agence #12 » (l'ID, pas le nom), et le seul bouton disponible envoie sur la fiche agence. `postKycReview` existe et est câblé — ailleurs. Une file d'attente qu'on ne peut pas vider depuis la file n'est pas une file, c'est un index.
**Correctif** — Panneau de décision latéral (le patron de `/moderation` est déjà écrit, `ModerationDecisionPanel`), nom d'agence via `include=`, filtre par statut, remplacer la pagination locale par `<Pagination>`.
**Commande** — `$impeccable craft "panneau de décision KYC"`

### [P1] La console ouvre sur un mur de nombres
**Pourquoi ça compte** — Huit tuiles de même poids typographique, sans tendance, sans comparaison, sans lien cliquable, et `/system` réaffiche la même grille. Un super-admin qui ouvre la console cherche « qu'est-ce qui demande mon attention maintenant ? » et reçoit « il y a 840 biens ».
**Correctif** — Inverser la page : en haut, les **files** (KYC en attente, modération, demandes d'upgrade, jobs échoués) en lignes cliquables avec leur compte ; ensuite les métriques, avec un delta sur 30 jours et un lien vers la vue filtrée correspondante ; enfin les 5 dernières entrées d'audit. Supprimer la grille dupliquée de `/system`, qui devient une simple page d'index.
**Commande** — `$impeccable shape "console super-admin"`

### [P1] Contraste insuffisant sur les libellés de la barre latérale
**Pourquoi ça compte** — `text-stone-500` sur `stone-900` = 3,65:1, sous le seuil AA, sur du texte de 11 px en majuscules espacées — le pire cas de lisibilité. Ce sont les cinq intitulés qui structurent la navigation entière. Et aucun lien de nav n'a de style `focus-visible` (0 occurrence dans les 53 fichiers) : au clavier, sur fond sombre, le contour par défaut du navigateur est à peine visible.
**Correctif** — `stone-400` minimum (6,93:1) sur les libellés de groupe ; anneau `focus-visible:ring-2 focus-visible:ring-ring` explicite sur les liens de nav ; lien d'évitement vers `<main>` dans `SuperAdminShell`.
**Commande** — `$impeccable audit takussan-web/src/components/layout/SuperAdminSidebar.tsx`

### [P2] Filtres qui mentent, recherche qui martèle
**Pourquoi ça compte** — Trois défauts qui se ressemblent : le filtre agence de `/users` demande de **taper un ID numérique** ; ceux de `/properties` et `/moderation` ne chargent que 50 agences et tronquent en silence (au-delà, l'agence cherchée est simplement absente, sans le dire) ; et aucune recherche du dépôt n'est *debouncée* — chaque frappe part en requête.
**Correctif** — Un `AgencyCombobox` unique, recherche côté serveur, pagination à la demande ; `useDeferredValue` ou un debounce à 300 ms sur les trois champs de recherche ; compteur de résultats et « réinitialiser » sur la barre de filtres.
**Commande** — `$impeccable craft "sélecteur d'agence partagé"`

## Signaux par persona

**Fatou (opératrice KYC/modération, 6 h/jour dans la console)** — Ouvre la console : ne voit pas combien de dossiers l'attendent (aucun badge sur KYC ni modération, seul upgrade-requests en a un). Va sur `/kyc` : lit « Agence #12 », ne sait pas de qui il s'agit, ouvre la fiche dans un onglet, décide, revient, a perdu sa page. Aucun tri, aucune sélection multiple, aucun raccourci. Sur 40 dossiers/jour, la navigation coûte plus que la décision.

**Amine (dev/ops, entre trois fois par semaine)** — Cherche les jobs échoués : aucune entrée dans la barre latérale, ils sont enterrés dans `/system/health`. La table n'est pas paginée (20 lignes en dur), le payload est tronqué sans possibilité de le déplier alors que `GET jobs/failed/{id}` existe côté API. `retryAll` part sans confirmation. `/system/scheduler` est en lecture seule : dernière exécution, durée moyenne — mais pas le statut, pas l'historique, pas de « lancer maintenant ».

**Jordan (premier jour, découvre la console)** — 24 entrées de menu réparties en 5 groupes, aucune n'explique ce qu'elle fait. Atterrit sur `/enums` (« valeurs verrouillées »), `/feature-flags` (bascules sans description d'impact), `/settings` (« réglages sensibles ») — trois écrans qui pilotent la production sans une phrase d'aide contextuelle. Aucun état vide pédagogique : la file KYC vide affiche `<p>` « Aucun dossier », pas le composant `EmptyState` du dépôt.

## Observations mineures

- **`patchAdminAnnouncement` n'a aucun appelant** — l'API sait modifier une annonce, l'UI ne sait que créer et désactiver. Seule fonction de requête orpheline sur ~90.
- **`GET jobs/failed/{id}`** (détail d'un job) n'est jamais appelé — le payload reste tronqué à l'écran.
- **18 `toLocaleString('fr-FR')` codés en dur** dans 13 fichiers : les dates de la console restent françaises en `en` et `wo`. Le principe n°5 du dépôt (« le front possède le texte affiché ») est cassé au même endroit que les libellés `DB` / `Cache` / `Storage` / `Mail` / `SMS` et les statuts `ok` / `error` bruts de `system-health.tsx`.
- **Deux paginations** : le composant `<Pagination>` d'un côté, un couple de boutons locaux dans `/kyc` de l'autre — avec les mêmes clés i18n `superAdmin.pages.pagination`.
- **`<Tabs>` existe dans `ui/` et n'est utilisé nulle part** dans la console ; Reporting et la fiche agence réimplémentent des onglets à la main.
- **Le bandeau d'avertissement ambre est copié à l'identique** dans `/enums` et `/settings`, chacun avec le même commentaire d'exception TCK-245 — c'est le signe qu'il manque un token `--warning` et un composant `<WarningBanner>`.
- **Pas de fil d'Ariane** sur `/users/[id]` et `/agencies/[id]`, seuls écrans de profondeur 2.
- **`bg-stone-200` en squelette** dans `SystemMetricsGrid` alors que `bg-muted` est utilisé partout ailleurs — deux gris de chargement différents dans la même page.

## Questions à trancher

- **Est-ce que la console doit être sombre ?** Aujourd'hui elle est à moitié sombre (sidebar) et à moitié claire (contenu), ce qui est la seule option qui ne dit rien. Une console d'exploitation ouverte 6 h/jour, souvent en intérieur éclairé : le choix se défend dans les deux sens — mais il faut en faire un, entier.
- **Si la distinction cross-tenant est un enjeu de sécurité, pourquoi repose-t-elle sur 256 px à gauche ?** Un liseré terracotta permanent en haut de la fenêtre, ou un fond de contenu franchement décalé, tiendrait la promesse que la sidebar ne tient pas.
- **Que fait `/system` que `/super-admin` ne fait pas ?** Aujourd'hui : rien, plus quatre boutons. Deux pages qui affichent la même grille sont une page.
- **Combien de ces 24 entrées sont ouvertes une fois par mois ?** Enums, templates, alertes, scheduler méritent peut-être un regroupement « Configuration » derrière un seul point d'entrée, pour laisser les files d'attente respirer en haut du menu.
