---
id: TCK-376
title: "Modération et journal d'audit — état partageable, pagination, recherche temporisée"
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

- [ ] Pagination sur les deux files de modération
- [ ] Filtres, page et sélection portés dans l'URL sur les deux files
- [ ] Anti-rebond sur la recherche du journal d'audit
- [ ] Colonne « Objet » du journal rendue cliquable quand une destination existe
- [ ] Menu d'export porté sur la primitive de menu
- [ ] Tests : partage d'URL, pagination, décompte de requêtes sur la recherche

## Critères d'acceptation

- [ ] AC1 — un lien copié depuis une file de modération filtrée rouvre **la même** file, mêmes
      filtres et même page
- [ ] AC2 — une file de plus d'une page est parcourable jusqu'à la dernière
- [ ] AC3 — dix caractères saisis dans la recherche du journal déclenchent **au plus 2**
      requêtes, contre 10 aujourd'hui ; le test compte les appels et **échouerait** sans
      l'anti-rebond
- [ ] AC4 — une ligne d'audit portant un objet doté d'un écran ouvre cet écran ; une ligne dont
      le type n'a pas de destination ne rend pas de lien
- [ ] AC5 — le menu d'export se ferme à `Escape` et au clic extérieur, et porte un nom
      accessible ; il n'y a plus de `useState` d'ouverture écrit à la main dans ce fichier
- [ ] AC6 — `npm run lint`, `npx tsc --noEmit`, `npm run test` passent

## Hors périmètre

- Le panneau de décision de modération lui-même : il fonctionne, seul son cadre bouge.
- L'export du journal (format, contenu, traitement asynchrone au-delà du 202 déjà géré).
- Les libellés d'événement affichés en anglais (`created`, `updated`, …) : les traduire ou non
  est une décision produit, pas un raccord — elle se pose dans `docs/features.md` avant tout
  ticket.
- La file KYC de la console super-admin — TCK-362.

## Notes d'implémentation

_(à remplir par implementing-specs)_
