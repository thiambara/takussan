---
id: TCK-379
title: "Tableau de bord /app — le menu et l'inventaire des écrans ont divergé : deux écrans sans chemin, un geste mort, un menu qui n'est pas le sien"
status: todo
phase: P2
family: bug
estimate: S
wave: 48
created: 2026-08-26
updated: 2026-08-26
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#21-authentification--comptes
    - docs/features.md#16-crm--relation-client
    - docs/features.md#19-état-des-lieux--inventaires
    - docs/features.md#22-rôles--permissions
    - docs/features.md#25-reporting--tableaux-de-bord
tags: [front, dashboard, navigation, rgpd, bug]
---

## Objectif utilisateur

Ce que le produit a construit est atteignable, et ce que le menu propose correspond au métier de
celui qui le lit.

## Contexte

Quatre défauts mesurés le 2026-08-26 sur `/app`. Aucun n'est une fonctionnalité manquante :
chacun est un raccord entre la table de navigation et l'inventaire des écrans, qui ont dérivé
l'un de l'autre. Ils tiennent dans un seul ticket parce qu'ils partagent leur forme — *l'écran
existe des deux côtés, le fil entre les deux est absent* — et que chacun se vérifie en une
commande.

| # | Constat | Mesure |
|---|---|---|
| 1 | `/app/account/privacy` — **export RGPD de portabilité** — n'a **aucun lien entrant** dans tout le front | clôture d'import de `src/` : 0 référence hors du fichier lui-même. Ni la barre latérale, ni `UserMenu`, ni `/app/profile` (qui expose pourtant « Notifications » et « Avis ») ne la desservent |
| 2 | `/app/crm/pipeline` — le kanban de prospects — n'a **aucun lien entrant** | idem : 0 référence. `PipelineKanban` fait 201 lignes et porte deux fichiers de tests ; l'écran est fini et injoignable |
| 3 | `/app/inventories` n'offre **aucun geste de création** | l'état vide renvoie vers `/app/leases` (`InventoryList.tsx:108`) ; la liste peuplée n'a pas de bouton. `/app/inventories/new` n'est atteint que par `TenantOnboardingChecklistWidget.tsx:133`, avec `?lease_id=`, donc **par le locataire seul** — alors que [§1.9](../../features.md#19-état-des-lieux--inventaires) donne « créer un inventaire » en P1 🧑‍💼 |
| 4 | Un `service_provider` reçoit « Réservations », « Baux », « Favoris », « Recherches sauvegardées » et « Statistiques » | `AppSidebar.tsx` — le bloc « Wave 3 Ops » (l. 186-203) pousse `/app/bookings`, `/app/visits`, `/app/leases` et `/app/messages` **sans aucune condition de rôle**, et `/app/overview` de même (l. 133) |

Le quatrième mérite son détail, parce qu'il ne s'arrête pas au bruit. `OverviewPage` aiguille
explicitement `isServiceProvider` vers `/app/overview/tenant`
(`app/overview/page.tsx`) : un prestataire qui clique « Statistiques » atterrit sur le **tableau
de bord locataire**, qui lui répondra `has_customer_profile: false`.

Et la spec ne le rattrape pas, parce qu'elle ne le connaît qu'à moitié — un générateur du dépôt
le dit déjà tout seul :

```
$ node docs/gen-features-by-actor.mjs --check
⚠ 1 acteur(s) non déclaré(s) dans la légende de features.md : 🔧
$ grep -c "🔧" docs/features.md
1                      # une seule ligne : §2.1, le wizard d'onboarding
```

Le prestataire n'est pas dans la table des acteurs de `docs/features.md`, et
[§2.5](../../features.md#25-reporting--tableaux-de-bord) ne lui accorde aucun tableau de bord. Le
menu offre donc quelque chose que la spec ne prévoit pas, et l'aiguillage le fait atterrir chez
quelqu'un d'autre.

*Un écran qu'on peut construire sans jamais avoir à l'atteindre reste vert en CI, et invisible
en production.*

## Contrat de données

Aucun endpoint à créer, aucun à modifier. Les quatre écrans concernés consomment déjà leurs
routes :

- `/api/data-exports` (`src/lib/queries/data-exports.ts`) — l'export RGPD
- `/api/customers` + transitions de stade (`src/lib/queries/pipeline.ts`) — le pipeline
- `/api/inventories` (`src/lib/queries/inventory.ts`) — la création d'état des lieux

## Direction UX / Artistique

- L'export de ses données personnelles est un **droit**, pas une option avancée : il se trouve
  là où l'utilisateur cherche ses affaires de compte, à côté de la suppression de compte dont il
  est le pendant — et pas au fond d'un menu qu'il faudrait deviner.
- Le pipeline est une **vue** du CRM, pas une section parallèle : il s'atteint depuis les clients,
  comme une seconde façon de regarder la même chose.
- La création d'un état des lieux part d'un bail : le geste doit le dire, plutôt que de renvoyer
  l'agent chercher lui-même dans une autre section.
- Un menu qui propose ce qui ne concerne pas le lecteur lui coûte de l'attention à chaque
  affichage. Retirer vaut mieux que griser.

## Contraintes strictes (métier)

- **Rien ici n'élargit un accès.** Les entrées retirées au `service_provider` sont retirées parce
  que ni la spec ni son métier ne les lui accordent ; aucune entrée n'est ajoutée à un rôle qui
  ne l'avait pas, hors les trois chemins manquants ci-dessus, qui mènent à des pages déjà gardées.
- `/app/account/privacy` et `/app/crm/pipeline` gardent leurs gardes serveur actuelles : un
  chemin de navigation n'autorise rien.
- Le prestataire garde « Interventions », « Messagerie » et « Documents » — c'est son métier
  ([§1.8](../../features.md#18-maintenance--interventions)).
- Tant qu'aucun tableau de bord prestataire n'est spécifié, l'entrée « Statistiques » ne lui est
  pas montrée. **Ne pas en inventer un** : ce serait une fonctionnalité hors spec.
- `/app/crm` reste une redirection permanente vers `/app/customers` (les signets), et
  `/app/payments/return` reste sans lien entrant (c'est un retour de passerelle de paiement) —
  ni l'un ni l'autre n'est un défaut.

## Delta à produire

- [ ] Chemin de navigation vers `/app/account/privacy`, placé auprès des réglages de compte de
      l'utilisateur
- [ ] Chemin de navigation vers `/app/crm/pipeline` depuis les clients, visible par les rôles que
      la page laisse déjà entrer (agent / bailleur / admin)
- [ ] Geste de création d'état des lieux depuis `/app/inventories`, pour les rôles que
      [§1.9](../../features.md#19-état-des-lieux--inventaires) sert — y compris quand la liste
      n'est pas vide
- [ ] Conditions de rôle sur les entrées poussées sans garde dans `buildNavItems` : réservations,
      baux, visites, favoris, recherches sauvegardées, statistiques
- [ ] Aiguillage de `/app/overview` : un `service_provider` n'y est plus envoyé vers la vue
      locataire
- [ ] i18n fr/en/wo pour tout libellé neuf
- [ ] Tests : un par défaut corrigé

## Critères d'acceptation

- [ ] AC1 — un test parcourt **toutes** les routes `page.tsx` de `src/app/(dashboard)/app` et
      échoue sur toute route sans lien entrant, hors une liste d'exceptions **nommées et
      justifiées** (`/app/crm`, `/app/payments/return`, les routes dynamiques). Ce test aurait
      échoué avant ce ticket sur `/app/account/privacy` et `/app/crm/pipeline`
- [ ] AC2 — un `agent` sur `/app/inventories`, liste **non vide**, atteint la création d'un état
      des lieux depuis cet écran ; un test l'éprouve et échouerait si le bouton n'existait que
      dans l'état vide
- [ ] AC3 — le menu d'un `service_provider` ne contient ni « Réservations », ni « Baux », ni
      « Visites », ni « Statistiques ». Un test compare l'ensemble des `href` rendus pour les six
      rôles à une table attendue, et échouerait sur une entrée poussée sans garde
- [ ] AC4 — `/app/overview` n'aiguille plus un `service_provider` vers `/app/overview/tenant`
- [ ] AC5 — les gardes serveur des trois pages nouvellement desservies sont inchangées : un test
      vérifie qu'un rôle non autorisé est toujours refusé malgré le nouveau lien
- [ ] AC6 — `npm run lint`, `npx tsc --noEmit`, `npm run test` passent

## Hors périmètre

- Créer un tableau de bord prestataire : hors spec, il faudrait d'abord écrire l'acteur et sa
  ligne dans `docs/features.md`.
- Refondre le pipeline CRM, l'écran d'export RGPD ou le formulaire d'état des lieux.
- Le regroupement et le surlignage de la barre latérale : TCK-377.
- Le contenu du menu pour les cinq autres rôles, au-delà des entrées poussées sans garde.

## Notes d'implémentation

_(à remplir par implementing-specs)_
