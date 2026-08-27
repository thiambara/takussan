---
id: TCK-375
title: "Tableau de bord agence — les files d'attente d'abord"
status: todo
phase: P2
family: front
estimate: M
wave: 47
created: 2026-08-26
updated: 2026-08-26
depends_on: [TCK-373]
blocks: []
spec_refs:
  features:
    - docs/features.md#25-reporting--tableaux-de-bord
    - docs/features.md#112-agence--équipe
tags: [front, admin, dashboard]
---

## Objectif utilisateur

L'admin d'agence ouvre `/admin` et voit d'abord ce qui l'attend — un dossier KYC à compléter, des biens à modérer, une invitation sans réponse, des impayés — plutôt qu'une rangée de compteurs sur lesquels il n'y a rien à faire.

## Contexte

`/admin` rend aujourd'hui 6 tuiles KPI, un flux d'activité de 4 compteurs et un graphe de
revenus. C'est un écran de **constat**, pas de **travail** : rien n'y indique qu'une action est
attendue, et rien n'y mène.

Ce que l'écran ne montre pas, alors que la console le sait déjà :

- le dossier KYC de l'agence et son statut (`/admin/agency/kyc` l'affiche, la barre latérale
  n'en porte aucun compteur) ;
- les biens en attente de modération — la barre latérale **porte déjà** ce compteur
  (`AdminSidebar.tsx`, sondage toutes les 60 s), le tableau de bord l'ignore ;
- les invitations sans réponse — objet de [TCK-368](TCK-368-equipe-cycle-de-vie-des-invitations.md) ;
- les impayés, présents en tuile mais sans chemin vers l'onglet qui les traite.

Le flux d'activité, lui, renvoie vers `/app/bookings`, `/app/maintenance`, `/app/customers` :
trois liens sur quatre sortent de la console où l'utilisateur se trouve.

## Contrat de données

Aucun endpoint à créer. Tout est déjà servi :

- `/api/dashboard/agency` — compteurs et séries, déjà consommé par l'écran
- la file de modération des biens — déjà sondée par la barre latérale
- le dossier KYC de l'agence — déjà consommé par `/admin/agency/kyc`
- les invitations en attente — livrées par TCK-368

Si un compteur manque à l'appel, **le constater et le dire** plutôt que d'ajouter un endpoint :
un tableau de bord qui invente sa donnée est pire que celui qui ne l'affiche pas.

## Direction UX / Artistique

L'ordre de lecture porte la priorité : **ce qui demande une action passe avant ce qui décrit un
état.** Une file vide ne se masque pas — elle se dit vide, calmement, parce que « rien à
traiter » est une information que l'admin est venu chercher.

Un compteur n'est utile que s'il mène quelque part : chaque file est un chemin, pas un chiffre.
Les KPI restent — ils ont leur valeur — mais ils cessent d'occuper la première ligne.

Éviter le réflexe du grand nombre en gros caractères : c'est le patron par défaut de tous les
back-offices, et il ne dit rien de plus qu'un nombre lisible bien placé.

## Contraintes strictes (métier)

- Une agence `individual` n'a ni modération de biens, ni invitations internes : les files
  correspondantes ne s'affichent pas, et leur absence ne se lit pas comme une erreur.
- Aucun compteur n'est calculé côté client à partir d'une liste rapatriée : c'est le serveur qui
  compte, via `filter[…]` et l'enveloppe de pagination.
- Les liens de la console mènent dans la console : ce qui a un écran sous `/admin` y renvoie.
- Le sondage périodique existant de la barre latérale ne se duplique pas — une seule source pour
  un même compteur.

## Delta à produire

- [x] Bloc de files d'attente en tête de `/admin`, chaque file portant son compteur et son chemin
- [x] Files couvertes : KYC de l'agence, biens à modérer, invitations en attente, impayés
- [x] KPI et graphe conservés, repositionnés sous les files
- [x] Flux d'activité : les liens qui ont une destination dans `/admin` y renvoient — **rien à
      déplacer, et c'est une mesure** : sur les quatre liens, le seul qui ait une destination sous
      `/admin` (l'équipe) y renvoyait déjà ; `bookings`, `maintenance` et `customers` n'ont AUCUN
      écran `/admin`. L'invariant est désormais gardé par un test dérivé du système de fichiers.
- [x] État « rien à traiter » explicite pour chaque file — et DISTINCT de « compte indisponible »
- [x] i18n fr/en/wo (diff strictement additif, 33 lignes par dictionnaire)
- [x] Tests : présence des files, masquage en agence `individual`, état vide

## Critères d'acceptation

- [x] AC1 — depuis `/admin`, chacune des quatre files est atteignable **en un clic**
- [x] AC2 — une file sans élément affiche un état vide explicite, et un test le vérifie
- [x] AC3 — en agence `individual`, les files sans objet ne sont pas rendues ; un test l'éprouve
      *(⚠ portée : cf. Notes — la page redirige avant d'y arriver)*
- [x] AC4 — aucun compteur de cet écran n'est obtenu en comptant les éléments d'une liste
      rapatriée côté client (vérifier par lecture des requêtes : `per_page` et `filter[…]`
      côté serveur)
- [x] AC5 — le compteur de modération n'est sondé qu'**une** fois par l'application, pas deux
- [ ] AC6 — `npm run lint` (0 erreur) et `npx tsc --noEmit` (aucune sortie) sont **exécutés et
      verts**. `npm run test` **en entier** appartient à la session déléguante (CLAUDE.md, « qui
      lance quoi ») : 205 tests du périmètre pertinent sont verts, la suite entière reste à jouer.

## Hors périmètre

- Décider depuis le tableau de bord : les files mènent aux écrans qui décident, elles ne
  décident pas.
- Le contenu des écrans de destination.
- Une API d'activité dédiée : la spec n'en demande pas, et les compteurs existants suffisent.

## Notes d'implémentation

### Les mesures qui contredisent le ticket

**1. « Une agence `individual` … : les files correspondantes ne s'affichent pas » (AC3) décrit une
branche INATTEIGNABLE depuis cet écran.** `/admin` figure dans `PRO_ROUTES` et la page appelle
`ensureStandardAgencyOrRedirect(user)` : toute agence dont le `kind` n'est pas `standard` est
renvoyée sur `/app` **avant le moindre rendu**. Le composant honore quand même la contrainte —
c'est une garde en profondeur, du même tissu que le `agencyIsStandard !== false` de la barre
latérale — et elle est éprouvée à son niveau. Le redirect, lui, est prouvé par un test de page.
*Un AC dont la seule preuve possible est un test de composant doit le dire, plutôt que de laisser
croire qu'un parcours l'exerce.*

**2. « le dossier KYC … » n'est pas un compteur, et son statut `submitted` n'est pas une tâche.**
`KycDossierStatus` a quatre cas ; seuls `pending` (à compléter) et `rejected` (à corriger)
appellent un geste de l'agence. `submitted` est chez la plateforme : le signaler comme une file
fabriquerait une attente qui n'existe pas. La ligne rend donc un STATUT, pas un nombre.

**3. « invitations en attente » s'écrit `filter[status]=sent`, pas `pending`.**
`InvitationStatus` n'a que `sent | accepted | expired | revoked`. Et `Invitation::scopePending()`
ajoute `expires_at > now()`, condition que le front **ne peut pas exprimer** : `expires_at` n'est
pas dans `$requestFilterable`. L'écart est borné par le cron horaire `invitations:expire`
(`routes/console.php:69`), qui bascule `sent → expired` — et c'est la MÊME donnée que celle de la
console Équipe (TCK-368), ce qui est la propriété qui compte : les deux écrans ne peuvent pas se
contredire.

**4. « Flux d'activité : les liens qui ont une destination dans `/admin` y renvoient » n'a rien à
corriger.** Le Contexte présente comme un défaut que *« trois liens sur quatre sortent de la
console »*. C'est exact, et ce n'est pas un défaut : l'inventaire des quinze routes `/admin/**`
(2026-08-27) ne contient ni `/admin/bookings`, ni `/admin/maintenance`, ni `/admin/customers`. Le
seul lien qui ait une destination interne — l'équipe — y renvoyait déjà. Les créer est hors
périmètre par le ticket lui-même. À la place : un test qui DÉRIVE l'invariant du système de
fichiers et rougira le jour où l'un de ces écrans naîtra.

**5. Aucun endpoint de comptage n'était nécessaire, et `meta.pending_count` non plus.**
`PropertyModerationController.php:62` écrit littéralement `['pending_count' => $paginator->
total()]` : les deux nombres sont le même. Le module lit `total`, la clé canonique garantie par
l'enveloppe de pagination (TCK-304). *Lire une clé d'agrément là où une clé canonique dit la même
chose, c'est se lier à celle des deux qui peut disparaître.*

### Décisions

**`src/lib/queries/agency-queues.ts` est l'UNIQUE déclaration des comptes de files.** Le badge de
`AdminSidebar` et la tuile de l'accueil sont montés en même temps sur `/admin` et ne se voient
pas : deux `queryKey` divergentes, ce seraient deux requêtes pour un nombre, puis un badge à 3
devant une tuile à 4 après la première décision de modération. La clé de `AdminSidebar` n'a **pas**
été renommée en déménageant, exactement pour qu'aucun autre appelant n'ait à bouger.

**La `queryFn` du KYC rend le dossier ENTIER et non le statut**, alors que le bloc n'a besoin que
du statut : la clé est celle qu'`AgencyKycClient` emploie déjà, donc l'entrée de cache est
partagée. Une seconde `queryFn` rendant une forme plus étroite sous la même clé ferait lire à
l'écran KYC une chaîne là où il attend un dossier, selon lequel des deux monte en premier.
L'étroitissement passe par `select`, qui ne touche pas au cache.

**Le lien « impayés » porte `?tab=impayes`**, et `TAB_VALUES` a été **exportée** d'
`AdminFinancesTabs` pour que le test le vérifie contre la table plutôt que contre une chaîne
recopiée : un `?tab=` inconnu retombe en silence sur « encaissements », donc le lien mènerait à
côté de ce qu'il annonce sans que rien ne casse.

**Les nombres sont formatés par ICU (`{count, plural, …}`) à partir de la locale du provider**, et
non par `formatNumber(v, 'fr')`. Les six tuiles `AgencyKpis` d'à côté figent encore `'fr'` en dur —
non touché (hors delta), noté comme reste.

### Restes assumés

- `AgencyKpis` / `AgencyActivityFeed` appellent `formatNumber(x, 'fr')` : locale figée
  pré-existante, hors du périmètre de `check-locale-figee.mjs` (qui ne voit qu'`Intl.*` et
  `toLocale*`) et hors du delta de ce ticket.
- `AdminSidebar.tsx` porte toujours `bg-red-500/80` et `text-[10px]` sur sa pastille (ligne
  pré-existante, non modifiée ici ; `components/layout/` n'est pas dans le périmètre gardé).
- **Aucune vérification navigateur** : l'écran n'a pas été ouvert dans un navigateur (pile de dev
  non démarrée). Les AC d'interface sont prouvés par rendu jsdom, pas par usage.
