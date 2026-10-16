# ADR-0064 — L'administration d'agence vit dans `/app` : une seule coque, un menu dérivé de la table des pages, un seul tableau de bord d'agence ; `/admin` disparaît sans redirection

- **Statut** : Accepté — §1 amendé par [ADR-0065](0065-les-reglages-metier-a-repli-global-entrent-au-catalogue.md) (`/super-admin/settings/global` retirée)
- **Date** : 2026-10-14
- **Tickets** : TCK-647, TCK-648, TCK-649

## Contexte

Relevé sur la branche `feat/ux-mobile-navigation-tck-641-646` (au-dessus de `dev` 63287fd2) le
2026-10-14 :

- **Deux coques pour un même utilisateur.** L'espace de travail est servi par `AppShell` sous
  `/app/*`, l'administration de l'agence par `AdminShell` sous `/admin/*` : 17 `page.tsx`, un
  layout propre (`(dashboard)/admin/layout.tsx`), une barre propre (`AdminSidebar`), un dictionnaire
  propre (`(dashboard)/admin`, ADR-0022). Le menu de `/app` n'en montre qu'une entrée,
  « Administration » (`AppSidebar`, remplacée par `entreeAdmin`), qui fait **changer de coque**
  au clic : autre barre, autre menu, et un retour à faire pour revenir à son travail.
- **La règle d'accès, elle, est déjà unique.** `src/lib/access/pages-admin.ts` (TCK-633, lot B)
  porte LA table des pages : le menu, l'entrée « Administration » / « Mon espace », la carte du
  profil et la garde serveur (`garderPageAdmin`) en dérivent ; `scripts/check-pro-routes.mjs`
  vérifie que chaque page appelle la garde de son chemin. Ce qui est double, c'est la coque, pas
  l'autorisation.
- **Deux tableaux de bord d'agence lisent le même endpoint.** `/admin` (`fetchDashboardAgency`,
  séries temporelles : mise en service, files d'attente, indicateurs, activité, revenus) et
  `/app/overview/agency` (`fetchAgencyDashboard`, douze mois : huit tuiles et une courbe revenus /
  occupation) appellent tous deux `GET /api/dashboard/agency`, pour la même audience — l'admin
  d'une agence `standard` (`docs/features.md` §2.5). Deux réponses à « comment va mon agence », sans
  rien qui garde leur cohérence.
- **Deux pages de `/admin` ne sont pas de l'administration d'agence.** Elles exigent `super_admin`
  dans la table : `/admin/properties`, un réexport de la liste `/app/properties` qui double
  `/super-admin/properties` ; et `/admin/settings`, l'éditeur BRUT de la table clé-valeur
  `settings` (`/api/settings`, sous `auth:sanctum` seul : la portée `global` exige le super-admin).
  Les « Paramètres plateforme » de `/super-admin/settings` lisent la MÊME table par une autre API
  (`/api/admin/settings`), en vue catalogue typée des seules clés déclarées ; la route brute refuse
  d'écrire une clé du catalogue. Deux vues, deux API, une table — relevé par TCK-648, la première
  rédaction de cet ADR disait « deux tables ».
- **Deux pages sont des vestiges.** `/admin/users` redirige en 308 vers `/admin/team` (TCK-277) ;
  `/admin/settings/tags` redirige vers `/admin` avec un avis (les étiquettes sont gérées par la
  plateforme) ; c'est le seul émetteur de l'avis de redirection de `/admin` (`AdminNotice`, `lib/admin/notices.ts`), qui part avec lui.
- **Les liens que l'API émet vers `/admin` ne sont pas figés.** `NotificationTarget` stocke un
  `kind` et un identifiant ; le chemin est calculé **à la lecture** depuis `PATHS`. Changer `PATHS`
  fait suivre toutes les notifications, anciennes comprises. Aucun gabarit d'e-mail ne porte de
  lien `/admin` (relevé par recherche dans `app/`, `resources/`, `lang/`, `config/`). En revanche,
  `PATHS['review_moderation']` vaut `/admin/reviews`, **page qui n'existe pas** : la cloche mène
  aujourd'hui à un 404.
- **Coût du déplacement, mesuré** : 169 occurrences de `/admin` (hors `/api/admin` et
  `/super-admin`) dans 119 fichiers du front ; `src/proxy.ts` (`/^\/(?:app|admin)/`) ; cinq gardes
  racine qui citent le chemin (`check-pro-routes`, `check-app-tokens`, `check-super-admin-tokens`,
  `check-locale-figee`, `check-auth-interrupts`) ; 18 fichiers de test qui nomment `AdminShell` ou
  `AdminSidebar`.

Le **2026-10-14**, le porteur a demandé de supprimer `/admin`, de déplacer ses menus dans `/app` en
n'affichant à chacun que ce qu'il peut voir, et de fusionner les deux tableaux de bord. Arbitrages
tranchés le même jour : préfixe dédié dans `/app` (1a), pages super-admin vers `/super-admin`
(2a), **aucune redirection des anciennes URL** (3b), un seul tableau de bord d'agence (4a).

## Décision

**L'administration d'une agence est une section de `/app`, servie par `AppShell`, sous le préfixe
`/app/agency`. Son menu est dérivé de la table des pages, qui reste unique. Il n'y a qu'un tableau
de bord d'agence, `/app/overview/agency`. `/admin` disparaît, et ses URL ne redirigent pas.**

### 1. Les chemins

| Avant | Après |
|---|---|
| `/admin` (tableau de bord) | `/app/overview/agency`, fusionné (§3) |
| `/admin/agency` | `/app/agency` |
| `/admin/agency/kyc` | `/app/agency/kyc` |
| `/admin/agency/billing` | `/app/agency/billing` |
| `/admin/team` | `/app/agency/team` |
| `/admin/roles` | `/app/agency/roles` |
| `/admin/finances` | `/app/agency/finances` |
| `/admin/finances/reconciliation[/{statementId}]` | `/app/agency/finances/reconciliation[/{statementId}]` |
| `/admin/moderation` | `/app/agency/moderation` |
| `/admin/moderation/properties` | `/app/agency/moderation/properties` |
| `/admin/audit` | `/app/agency/audit` |
| `/admin/settings/integrations` | `/app/agency/integrations` |
| `/admin/settings` (super-admin) | `/super-admin/settings/global` |
| `/admin/properties` (super-admin) | supprimée — `/super-admin/properties` existe |
| `/admin/users`, `/admin/settings/tags` | supprimées — vestiges |

Le segment est **anglais**, comme tous ceux de `/app` (`properties`, `bookings`, `settings`…) ;
`/app/agency` n'entre en collision avec rien (`/app/settings/agency/upgrade` est une autre page).

### 2. Une coque, un menu

- Les pages déplacées sont rendues par `AppShell`. `AdminShell`, `AdminSidebar` et
  `(dashboard)/admin/layout.tsx` sont supprimés — après avoir vérifié ce que `/super-admin` en
  réutilise.
- Le menu de `/app` porte une section d'agence **dérivée de la table des pages** : une entrée par
  page à menu que le profil actif peut ouvrir, aucune sinon. Un admin d'agence `individual`
  continue d'y lire « Mon espace ». L'entrée unique « Administration » disparaît.
- **La table reste la seule source** : elle change de chemins, pas de règles. Exigences (`role`,
  `agence`, `capacite`), garde serveur par page, et renvoi d'une page refusée vers la première page
  accessible restent ceux de TCK-633 (`docs/features.md` §2.2).

### 3. Un seul tableau de bord d'agence

`/app/overview/agency` devient le seul. Il reprend le contenu du tableau de bord de `/admin` — mise
en service, files d'attente, indicateurs, activité, revenus — et garde de
l'autre ce qui n'y figure pas (la courbe d'occupation, les tuiles sans équivalent). Une seule
lecture de `GET /api/dashboard/agency` par affichage. L'aiguillage de `/app/overview` et la garde
du layout de `/app/overview/agency` ne changent pas.

### 4. Pas de redirection

Les anciennes URL `/admin/*` rendent un **404**. C'est un choix du porteur : il n'y a ni favori
qu'on doive préserver à tout prix, ni lien d'e-mail à honorer, et une redirection est un chemin de
plus à garder pour toujours. Les notifications, elles, suivent sans redirection : leur chemin est
calculé à la lecture (§ Contexte). `PATHS['review_moderation']` est corrigé au passage.

### 5. Ce qui ne change pas

- `/api/admin/*` — l'API de la console plateforme, sans rapport (ADR-0047).
- `/super-admin/*` — sa coque, sa barre, ses pages ; elle accueille seulement `settings/global`.
- Les règles d'accès de l'API : chaque endpoint rejuge (`AgencyKindGuard`, policies). La table
  décide de l'écran, jamais de la donnée.

## Conséquences

- **Ce qu'on gagne** : un utilisateur ne change plus de coque pour administrer son agence ; le
  menu montre au même endroit ce qu'il fait et ce qu'il administre ; un seul tableau de bord à
  tenir juste.
- **Ce que ça casse, assumé** : tout favori, lien partagé ou onglet resté ouvert sur `/admin/*`
  tombe en 404.
- **Ce qui devient plus fragile** : le menu de `/app` s'allonge pour un admin d'agence `standard`
  (dix pages d'administration en plus des entrées de travail). La section doit se lire comme une
  section, pas comme une liste plate — et c'est la table, pas le composant, qui dit qui la voit.
- **Ce qui grossit** : le dictionnaire servi sous `/app/agency` doit porter les espaces de noms de
  l'administration (ADR-0022, ensemble cumulé) — sans quoi une clé manquante lève.
- **Ce qui doit suivre dans les documents** : `docs/features.md` (§1.12 « Mise en service sur
  `/admin` », §2.2 « écran `/admin/roles` ») par `/sync-specs` après fusion ; `takussan-web/CLAUDE.md`
  (proxy, layouts, coques à barre latérale) ; la section « trois surfaces appelées admin » de
  `takussan-api/CLAUDE.md`, qui n'en compte plus que deux.
- **ADR-0013 n'est pas remplacé** : il tranche Filament contre Next.js, et l'administration reste
  en Next.js. Il nommait `/admin/*` comme surface de l'admin d'agence ; cette surface s'appelle
  désormais `/app/agency/*`.

## Application

- `takussan-web/src/lib/access/pages-admin.ts` — la table, avec ses nouveaux chemins ;
  `pages-admin-server.ts` — la garde.
- `takussan-web/src/components/layout/AppSidebar.tsx` — la section d'agence dérivée de la table.
- `takussan-web/src/app/(dashboard)/app/agency/` — les pages ; `(dashboard)/admin/` n'existe plus.
- `takussan-web/src/app/(dashboard)/app/overview/agency/` — le tableau de bord unique.
- `takussan-web/src/app/(super-admin)/super-admin/settings/global/` — l'éditeur de `settings`.
- `takussan-api/app/Domain/Notifications/NotificationTarget.php` — `PATHS`.
- **Gardes** : `scripts/check-pro-routes.mjs` vérifie que chaque `page.tsx` de
  `app/(dashboard)/app/agency` appelle la garde de son chemin, et casse si
  `app/(dashboard)/admin` réapparaît ; une garde racine (`scripts/check-*.mjs`) vérifie que chaque chemin de
  `NotificationTarget::PATHS` correspond à une page du front — celle qui aurait vu `/admin/reviews`.
