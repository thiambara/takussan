---
id: TCK-376
title: "Modération et journal d'audit — état partageable, pagination, recherche temporisée"
status: done
phase: P2
family: front
estimate: M
wave: 47
created: 2026-08-26
updated: 2026-08-27
depends_on: [TCK-373]
blocks: []
spec_refs:
  features:
    - docs/features.md#26-audit--traçabilité
    - docs/features.md#111-avis--réputation
    - docs/features.md#29-administration--configuration
tags: [front, admin, moderation, audit, a11y]
---

## Objectif utilisateur

Le modérateur partage un lien vers la file qu'il est en train de traiter et la retrouve intacte après un rechargement ; il atteint la fin d'une longue file ; et depuis le journal d'audit, il ouvre l'objet dont une ligne parle.

## Contexte

Quatre défauts mesurés le 2026-08-26 sur `/admin/moderation`, `/admin/moderation/properties` et
`/admin/audit`. Ils partagent leur forme : **l'écran sait des choses qu'il ne met pas dans
l'URL, et demande au serveur plus souvent qu'il ne le faut.**

1. **Les files de modération n'ont aucune pagination.** La requête ne porte pas de `page` : ce
   que la première réponse contient est tout ce que l'écran montrera. Une file longue a une fin
   inatteignable.
2. **Leurs filtres vivent en état local** (`useState`), pas dans l'URL. Un rechargement les
   perd, un lien partagé ne les transporte pas — alors que `/admin/team` et `/admin/finances`
   ont tranché l'inverse et mettent leur état dans la barre d'adresse.
3. **La recherche du journal d'audit n'a pas d'anti-rebond.** Chaque frappe change la clé de
   requête, sur des pages de 50 lignes : dix caractères tapés valent dix requêtes.
4. **La colonne « Objet » du journal affiche `Property #12` sans lien.** Le journal dit qu'il
   s'est passé quelque chose sur un objet et ne permet pas d'aller le voir.

**Et un cinquième, d'une autre nature :** le menu d'export du journal (`AuditTrail.tsx:280`)
est un `div` piloté par un `useState`. Ni `Escape`, ni fermeture au clic extérieur, ni
`aria-expanded`, ni piège de focus — alors que `ui/dropdown-menu.tsx` existe et est employé deux
fichiers plus loin. Ouvert, il reste ouvert.

## Contrat de données

Aucun endpoint à créer. Les files et le journal sont déjà paginés côté serveur — l'enveloppe
`meta` porte déjà `current_page` / `last_page`, que le journal utilise et que les files
ignorent.

Pour rendre un objet d'audit cliquable, la résolution se fait à partir du type et de
l'identifiant déjà présents dans la réponse — sans requête supplémentaire par ligne.

## Direction UX / Artistique

Une file de travail se partage : l'URL est l'état. Ce qui filtre, ce qui trie, la page courante
et l'élément sélectionné s'y lisent.

Le lien sur un objet d'audit ne promet que ce qu'il peut tenir : si un type d'objet n'a pas
d'écran, la cellule reste du texte plutôt qu'un lien mort.

## Contraintes strictes (métier)

- Les filtres sont appliqués **côté serveur** via `filter[…]`, jamais sur une liste déjà
  rapatriée.
- L'anti-rebond ne modifie pas ce qui est cherché, seulement quand : le résultat pour une même
  saisie est identique.
- Le menu d'export passe par la primitive de menu du dépôt : clavier, `Escape`, clic extérieur
  et nom accessible viennent avec, et ne se réimplémentent pas.
- La pagination est celle de la console (acquis de TCK-373), pas une sixième.

## Delta à produire

- [x] Pagination sur les deux files de modération
- [x] Filtres, page et sélection portés dans l'URL sur les deux files
- [x] Anti-rebond sur la recherche du journal d'audit
- [x] Colonne « Objet » du journal rendue cliquable quand une destination existe
- [x] Menu d'export porté sur la primitive de menu
- [x] Tests : partage d'URL, pagination, décompte de requêtes sur la recherche

## Critères d'acceptation

- [x] AC1 — un lien copié depuis une file de modération filtrée rouvre **la même** file, mêmes
      filtres et même page
- [x] AC2 — une file de plus d'une page est parcourable jusqu'à la dernière
- [x] AC3 — dix caractères saisis dans la recherche du journal déclenchent **au plus 2**
      requêtes, contre 10 aujourd'hui ; le test compte les appels et **échouerait** sans
      l'anti-rebond
- [x] AC4 — une ligne d'audit portant un objet doté d'un écran ouvre cet écran ; une ligne dont
      le type n'a pas de destination ne rend pas de lien
- [x] AC5 — le menu d'export se ferme à `Escape` et au clic extérieur, et porte un nom
      accessible ; il n'y a plus de `useState` d'ouverture écrit à la main dans ce fichier
- [ ] AC6 — `npm run lint`, `npx tsc --noEmit`, `npm run test` passent
      *Non cochée : `npm run lint` (0 erreur, 36 avertissements tous préexistants) et
      `npx tsc --noEmit` (exit 0) sont exécutés et verts sur l'arbre fusionné (2026-08-27), mais
      `npm run test` **en entier** n'a jamais tourné — ni chez l'implémenteur, ni à la revue, ni
      au correctif final. Ce qui a tourné : 137 fichiers / 1125 tests couvrant tous les fichiers
      touchés et leurs dépendants directs. La suite entière appartient à la session déléguante
      (CLAUDE.md, « qui lance quoi ») et cochera cette case.*

## Hors périmètre

- Le panneau de décision de modération lui-même : il fonctionne, seul son cadre bouge.
- L'export du journal (format, contenu, traitement asynchrone au-delà du 202 déjà géré).
- Les libellés d'événement affichés en anglais (`created`, `updated`, …) : les traduire ou non
  est une décision produit, pas un raccord — elle se pose dans `docs/features.md` avant tout
  ticket.
- La file KYC de la console super-admin — TCK-362.

## Notes d'implémentation

_(TCK-376, 2026-08-27 — frontmatter délibérément intouché : la vague le fait à la fusion.)_

### Ce que la re-mesure a contredit dans le ticket

- **« `AuditTrail.tsx:280` »** — le menu était aux lignes **298-315** sur `origin/dev`. Le
  reste du constat tenait mot pour mot : `<div>` + `useState`, ni `Escape`, ni clic extérieur,
  ni `aria-expanded`.
- **Le contrat de données était déjà tenu côté queries, pas côté écrans.**
  `fetchModerationQueue` et `fetchPropertyModerationQueue` acceptaient DÉJÀ `page` / `perPage`
  et les sérialisaient correctement — seuls les deux workspaces ne les passaient jamais. La
  pagination n'était donc pas à écrire, elle était à **brancher**.
- **La recherche de `/admin/moderation/properties` a le même défaut que celle du journal**, et
  le ticket ne la nomme pas. Elle est traitée : la porter dans l'URL SANS temporisation aurait
  ajouté une entrée d'historique par frappe aux dix requêtes existantes.
- **`Invoice` et `User` sont dans le sélecteur de filtre du journal et n'ont aucun écran
  `[id]`.** Vingt modèles portent `use Auditable` côté API ; le front n'expose une page par
  identifiant que pour quatre d'entre eux. C'est ce qui condamne la résolution par convention
  (`Property` → `/properties`) : elle aurait produit des liens morts pour la moitié des types.

### Les trois décisions

1. **`useEtatUrl` (`src/hooks/useEtatUrl.ts`) rend le retour à la page 1 STRUCTUREL.** Il
   n'expose aucun chemin qui pose un filtre sans retirer `page` et `selected`. C'est la réponse
   directe à ce que la revue adverse de TCK-363 a relevé : le `params.delete('page')` était
   écrit à la main sur un écran sur trois, parce que rien ne l'imposait.
2. **Les clés d'URL portent le nom du filtre d'API** (`filter[moderation_status]`,
   `filter[subject_type]`, `filter[search]`), comme `/admin/team` et `/admin/users` l'avaient
   déjà tranché. Aucune table de correspondance entre deux vocabulaires à tenir.
3. **`DebouncedSearchInput` est repris de TCK-363 avec deux correctifs**, décrits dans son
   propre docblock : le brouillon n'est plus resynchronisé sur NOTRE commit (le champ avalait
   les espaces — « Dakar Immo » devenait « DakarImmo »), et l'indicateur d'attente compare des
   valeurs REPLIÉES (il ne s'éteignait jamais sur une saisie d'espaces seuls). ⚠ **Collision de
   fusion attendue** avec la branche de TCK-363 sur ce fichier et sur `console.search.pending`.

### Vérifié par ablation (chaque test rougit sans son correctif)

| Ce qu'on retire | Ce qui rougit |
|---|---|
| `params.delete('page' \| 'selected')` de `poserFiltres` | 4 tests de `useEtatUrl` |
| le brouillon resynchronisé comme dans TCK-363 | 3 tests de `DebouncedSearchInput` (a et b) |
| `CONSOLE_SEARCH_DEBOUNCE_MS` à 0 | 2 tests AC3 (journal + file de biens) |
| la cellule « Objet » redevenue du texte | 4 tests AC4 |
| le menu d'export redevenu `<div>` + `useState` | 6 tests AC5 |
| `page` / `perPage` et `<Pagination>` des deux files | 8 tests AC1/AC2 |
| une destination pointant sur une route absente | 3 tests de `audit-subject-links` |

### Reste

- La cellule « Objet » n'ouvre pas les seize autres types audités (`Payout`, `KycDossier`,
  `Announcement`, …) : ils n'ont pas d'écran par identifiant. L'ajout se fait en une ligne dans
  `DESTINATIONS`, et la garde vérifie sur le disque que la route existe.
- Le sélecteur « Type d'objet » du journal ne propose que six types sur vingt audités —
  hors périmètre, c'est un choix produit.

### Revue adverse et correctif final (2026-08-27)

**Verdict : ACCEPTÉ SOUS RÉSERVE.** Douze mutations tentées sur ce ticket, onze rougissent — dont
les quatre défauts du jumeau TCK-363 (espaces avalés, indicateur d'attente perpétuel, retour à la
page 1, tables de filtres en mutant survivant) et la mutation-piège **N13** : `lire()` rendant
toujours `''`, c'est-à-dire *l'URL s'écrit mais ne se relit jamais* → **6 tests rouges sur 3
fichiers**. C'est elle qui prouve qu'AC1 REJOUE l'URL au lieu de constater son écriture, et
qu'aucun filtrage n'est fait en mémoire.

**Le conflit add/add sur `DebouncedSearchInput.tsx` (annoncé au §3 ci-dessus) est vérifié
intact** : `git diff` du commit de fusion sur ce fichier → 16 lignes, **toutes en commentaire**,
aucune ligne de code. Les tests de TCK-376 ont été **ajoutés** à ceux de TCK-363 (+266 lignes),
pas substitués ; les deux jeux de propriétés rougissent sous les mêmes mutations.

**Trois défauts relevés, tous corrigés :**

| Défaut mesuré | Ce qui a été fait |
|---|---|
| `allerALaPage` ne retirait plus `selected` : mutant **survivant** (19 fichiers / 184 tests verts), alors que son jumeau de `poserFiltres` est gardé. L'invariant a pourtant un paragraphe entier dans le bloc de tête du hook. | Deux tests ajoutés à `useEtatUrl.test.tsx`, couvrant les **deux** branches du `if` (page > 1 et retour à la page 1) ; ablation → 2 rouges. |
| Le docblock d'interface d'`allerALaPage` disait « et rien d'autre — les filtres restent » quand l'implémentation retire aussi `selected` : *c'est ce commentaire qui rendait le retrait plausible comme nettoyage.* | Docblock remis à la vérité aux deux bouts, et le commentaire d'implémentation nomme le test qui garde désormais la ligne. |
| La `<Pagination>` était rendue **à l'intérieur** de la branche « la liste n'est pas vide » : modérer les dernières lignes de la page 4 d'une file retombée à 3 pages faisait disparaître la pagination avec les lignes — cul-de-sac, hors édition de l'URL. AC2 cochait quand même : ses tests ne parcourent qu'une file peuplée. | `PropertyModerationWorkspace.tsx` — la pagination sort du ternaire et se rend sous le seul `meta` ; ablation → 1 rouge. La sortie anticipée de `Pagination` (`lastPage <= 1 && !summary`) garantit qu'une file d'une seule page n'en gagne aucun contrôle. |

**Reste ouvert, nommé :**

- `ModerationWorkspace.tsx` (file d'**avis**, super-admin) porte le même défaut de pagination, à
  l'identique, et n'a pas été corrigé — hors du périmètre de fichiers du correcteur. *Un correctif
  appliqué sur un écran sur deux est le motif exact que la revue de TCK-363 a fait payer.*
- File **entièrement** vide avec `?page=4` dans l'URL : aucun contrôle de pagination, délibérément
  (un bouton qui mène d'un écran vide à un écran vide n'est pas une sortie). Figé par un test.
- `fetchAuditLogs` n'émet aucun `fields[activity_log]` sur des pages de 50 lignes — préexistant,
  hors delta.
- Aucun test n'assère qu'un `agency_admin` de l'agence A ne voit rien des lignes d'audit causées
  par l'agence B. Le code le fait (`AuditLogController::index` borne par le causer de l'agence
  active, `whereRaw('0 = 1')` sans agence) ; rien ne le garde. Préexistant (TCK-104), aucun fichier
  PHP n'est touché par ce ticket.
