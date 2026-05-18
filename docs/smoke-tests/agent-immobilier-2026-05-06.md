---
date: 2026-05-06
tester: Codex (browser smoke test)
account: agent1@dakarimmo.sn (Ousmane Ndiaye, role Agent · Dakar Immo)
env: localhost:3000 (web Next.js 16.2.3) + localhost:8002 (api Laravel)
spec: docs/qa/agent-qa.md
scope: parcours agent immobilier — login, sidebar, dashboard, biens, publication, médias, réservations, visites, calendrier, CRM, baux, maintenance, documents, messagerie, inventaires
---

# Smoke test — Agent immobilier

Test navigateur exécuté sur Chrome DevTools, en suivant l'ordre prioritaire de `docs/qa/agent-qa.md`.

> Donnée de test créée : bien `Smoke agent 2026-05-06`, id `628`, référence `TK-2026-K0HHF3`, laissé en brouillon. Deux médias ont été attachés pendant le test d'upload, dont un PNG volontairement minimal qui a exposé un problème de validation/conversion.

## Synthèse

| Sévérité | Nombre |
|----------|-------:|
| P0       | 1 |
| P1       | 7 |
| P2       | 8 |
| P3       | 3 |
| **Total** | **19** |

**Verdict** : le parcours agent est navigable, et la création de bien en brouillon fonctionne désormais. Le principal blocage restant est le CRM détail : les liens client de `/app/customers` mènent à des 404. Les autres risques forts concernent la publication/statuts des biens, un pipeline CRM vide malgré des clients actifs, et de nombreuses incohérences d'i18n/formatage.

## Couverture Rapide

- **Pass** : login agent, sidebar agent sans liens admin, liste biens, création brouillon, génération référence `TK-2026-*`, upload JPEG, réservations liste/détail avec actions, visites liste/détail avec actions, calendrier mensuel, baux liste/détail, maintenance liste, documents liste, inventaires avec pagination.
- **Partiel** : dashboard agent, publication/dépublication, médias avancés, CRM, pipeline, messagerie.
- **Non testé volontairement** : actions destructives ou métier irréversibles (`Accepter`, `Refuser`, `Activer le bail`, `Supprimer`, `Partager`, signature/export PDF).

## Bugs

### P0-1 · Fiches clients inaccessibles — `/app/customers/[id]`

- **Reproduction** : ouvrir `/app/customers`, cliquer un client listé, par exemple `/app/customers/424` ou `/app/customers/48`.
- **Observé** : page Next 404 `This page could not be found`.
- **Attendu** : fiche CRM avec coordonnées, notes, documents, tags, pipeline et actions.
- **Impact** : le CRM est utilisable en liste seulement ; consultation/édition d'une fiche client impossible.
- **Note** : le smoke du 2026-05-04 signalait un crash API 400 ; le symptôme visible est maintenant un 404, mais le blocage métier reste entier.

### P1-1 · Publication/statuts de bien semblent no-op — `/app/properties/628`

- **Reproduction** : depuis la fiche du brouillon, menu **Plus d'actions** → `Publier (Publié)`.
- **Observé** : requête POST 200 sur la route Next, mais le badge reste `Brouillon` / `Privé`, sans toast ni erreur visible.
- **Attendu** : soit validation bloquante explicite listant les champs manquants, soit changement de statut effectif.
- **Impact** : l'agent ne sait pas si l'action a échoué, est interdite ou en attente.

### P1-2 · Upload image invalide persistant comme média

- **Reproduction** : upload d'un PNG corrompu/minimal sur l'onglet `Médias`, puis upload d'un JPEG valide.
- **Observé** : alerte serveur `imagecreatefromstring(): gd-png: fatal libpng error`, puis l'onglet affiche `Médias (2)` après reload.
- **Attendu** : fichier invalide rejeté proprement, sans créer de média persistant.
- **Impact** : risque de média cassé en couverture ou dans la fiche publique.

### P1-3 · Dashboard agent incomplet vs QA — `/app/overview/agent`

- **Observé** : KPIs et graphiques `Pipeline CRM` / `Commissions et baux signés`.
- **Manquant attendu par `TC-AGT-02`** : widgets détaillés `Mes tâches`, `Activité récente`, `Visites du jour`, et pipeline opérationnel avec demandes/baux/tâches.
- **Impact** : l'écran ne couvre pas encore le quotidien agent décrit par la grille QA.

### P1-4 · Liste biens incomplète vs `TC-AGT-03` — `/app/properties`

- **Observé** : colonnes bien, contrat, prix, stats, statut, visibilité, actions.
- **Manquant** : agent assigné, date, filtres ville/agent/plage de prix/plage de dates/uniquement les miens, sélection multiple et actions en lot.
- **Impact** : gestion de portefeuille limitée dès que l'agence a beaucoup de biens.

### P1-5 · Pipeline CRM vide malgré des clients actifs — `/app/crm/pipeline`

- **Observé** : `Active prospects 104`, mais chaque colonne (`Lead`, `Prospect`, `Qualified`, etc.) affiche `0` et `No customers`.
- **Attendu** : cartes client réparties par étape, cohérentes avec `/app/customers`.
- **Impact** : le pipeline ne permet pas de traiter les leads.

### P1-6 · Création de bien redirige vers la liste, pas la fiche — `/app/properties/new`

- **Reproduction** : remplir titre, prix, ville, région, pays, surface, chambres, SDB, description → `Enregistrer en brouillon`.
- **Observé** : création OK, référence générée, mais redirection vers `/app/properties`.
- **Attendu QA** : redirection vers `/app/properties/[id]`.
- **Impact** : l'agent doit retrouver manuellement le bien pour ajouter médias/adresse/statut.

### P1-7 · Visite détail affiche un demandeur générique — `/app/visits/475`

- **Observé** : `Demandeur Customer #48`.
- **Attendu** : nom, téléphone/email ou lien fiche client.
- **Impact** : l'agent ne peut pas contacter ou qualifier rapidement le visiteur.

## Incohérences UX / i18n

### P2-1 · Valeur brute `draft` visible dans la liste des biens

- `/app/properties` affiche `draft` puis `Brouillon` pour le bien créé.
- Ne rendre que le libellé utilisateur.

### P2-2 · Menu statut bien confus et incomplet

- Menu : `Publier (Publié)`, `Disponible`, `Vendu`, `Loué`, `En maintenance`, `Indisponible`, `En attente`, `Dupliquer · bientôt`.
- Manquant : dépublier, archiver, supprimer avec confirmation. `Dupliquer` est visible mais désactivé.

### P2-3 · Dates en anglais dans les pages métier

- Observé : `10 Jun 2026`, `13 May 2026, 16:15`, `23 Apr 2026`.
- Pages touchées : réservations, visites, baux, maintenance, documents, inventaires.
- Attendu : locale FR (`10 juin 2026`, etc.).

### P2-4 · Montants au format US sur réservations/baux

- Observé : `121,000,000 F CFA`, `500,000 F CFA`.
- Attendu cohérent avec biens : `121 000 000 F CFA`.

### P2-5 · Shell partiellement en anglais

- Top search placeholder : `Search a city, neighborhood, property type…`
- Bouton : `Language`
- Messagerie : `New group`, `Select a conversation to view messages.`

### P2-6 · Pipeline CRM entièrement en anglais

- `Prospect pipeline`, `Track your CRM contacts...`, `Active prospects`, `No customers`, `Qualified`, `Negotiating`, `Converted`, `Lost`.

### P2-7 · Maintenance : priorités et dates mixtes

- Filtres traduits (`Faible`, `Normale`, `Élevée`, `Urgente`), mais cards avec `Low`, `High`, `Normal`.
- Même ligne avec deux formats : `27 Apr 2026 · Prévu 27/04/2026`.

### P2-8 · Filtres baux affichent des valeurs techniques

- `/app/leases` affiche les combobox `Filtrer par statut` et `Filtrer par bien` avec value `all`.
- Attendu : `Tous les statuts`, `Tous les biens`.

## Améliorations Prioritaires

### P3-1 · Ajouter un vrai feedback d'action

Toutes les actions de statut/publication devraient afficher un toast de succès/échec et revalider la fiche. Les no-op silencieux sont coûteux pour un agent.

### P3-2 · Rapprocher le dashboard agent de l'ordre de travail réel

Mettre en premier les tâches du jour, visites imminentes, demandes à traiter et leads chauds. Les graphiques sont utiles, mais moins actionnables au quotidien.

### P3-3 · Durcir les uploads médias

Afficher la validation acceptée côté client (`JPG/PNG/WEBP`, taille, dimensions), rejeter les fichiers invalides avant upload si possible, et supprimer toute entrée temporaire si la conversion serveur échoue.

## Régressions Corrigées Depuis Le Smoke Du 2026-05-04

- Création de bien : le P0 `POST /api/properties` n'est plus reproduit. Le brouillon `628` a été créé avec succès.
- Formulaire nouveau bien : les labels `Type de bien` et `Type de contrat` sont maintenant en français (`Appartement`, `Location`).
- Documents : l'avertissement console Base UI signalé précédemment n'a pas été reproduit sur `/app/documents`.
- Inventaires : la pagination affiche maintenant `Précédent` et `Suivant`; l'ancien blocage d'accès aux pages 2-7 semble corrigé.
- Inventaire détail : le doublon de heading `État des lieux #73` n'est plus visible.
