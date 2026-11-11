---
id: TCK-2590
title: "Liste des clients en lignes de contact, vues « À relancer / Mes clients », et création en deux temps avec le doublon dit pendant la frappe"
status: todo
phase: P2
family: front
estimate: M
wave: 89
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2583, TCK-2588, TCK-2684, TCK-2687, TCK-2688, TCK-2689, TCK-2691]
blocks: []
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
  models:
    - "docs/models-spec.md#7-customer"
tags: [front, crm, customers, mobile, audit-ux, app]
---

## Objectif utilisateur

L'agent rappelle un client depuis la liste sans ouvrir sa fiche, voit d'un coup qui relancer, et crée un prospect en vingt secondes au téléphone sans créer de doublon.

## Contrat de données

- `GET /api/customers` avec `filter[follow_up]`, `filter[referent]`, `filter[stage_group]`, `filter[pipeline_stage]`, `filter[status]`, `filter[tags]`, `filter[search]`, tris `next_action_at`, `last_contacted_at`, `follow_up_days`, `per_page` réellement transmis, `fields[customers]` avec `next_action`, `follow_up`, `referent` et les critères (TCK-2588).
- `GET /api/customers/duplicates` pendant la frappe du téléphone ou de l'e-mail (TCK-2588) ; `POST /api/customers` (existant, 409 de doublon gardé).
- `POST /api/customers/{id}/contacts` au toucher d'Appeler / WhatsApp (TCK-2583).

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=app-clients&a=a` — écrans « Liste », « Nouveau client : qui », « Nouveau client : sa recherche », « Liste vide » ; **référence de fidélité, non versionnée**, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes).
- Vues rapides en pastilles : À relancer (compte) · Mes clients · Négociation · Tous ; « Sans référent » pour l'admin.
- **Téléphone (360-390 px)** : ligne de 96 px — initiales, nom, Appeler et WhatsApp à droite ; la prochaine action ou la relance en retard (point rouge) ; ce qu'il cherche (« Studio · Mermoz · ≤ 250 000 F »). **Bureau (≥ 1280 px)** : tableau Client · Cherche · Étape · Prochaine action (rouge si en retard) · Référent · Étiquettes, tri par colonne, gestes au survol (Appeler, WhatsApp, Planifier), vues en onglets au-dessus ; tableau dès `lg`, défilement horizontal dans son conteneur en deçà.
- Création en deux temps : 1) Prénom, Nom, Téléphone (+221) — « Déjà dans vos clients : Mariama Fall ▸ » apparaît pendant la frappe ; 2) « Ce qu'il cherche » : Louer / Acheter, six types courants en pastilles + « Plus », quartiers en pastilles avec saisie, budget ; lien « Compléter plus tard » (profession, langue, pièce) ; en feuille au téléphone, en panneau au bureau.
- Liste vide : « Pas encore de clients. Ils arrivent avec vos demandes de contact, ou ajoutez-en un. » + « Ajouter un client ».

## Contraintes strictes (métier)

**Pas de régression** (`CustomerList.tsx`, `CustomerListFilters.tsx`, `CustomerForm.tsx`, audit § 2) :
- recherche (nom, prénom, e-mail, téléphone), filtres étape, statut, étiquettes (menu à cases, compteur, « Tout effacer »), tout dans l'URL (`page`, `search`, `pipeline_stage`, `status`, `tags`), retour en page 1 à chaque filtre ;
- « Vue pipeline » (devient « Étapes ») et « Ajouter un client » pour le personnel seulement ; le bailleur lit ses fiches sans créer ; état vide avec ou sans « Ajouter » ;
- pagination ; le sélecteur « 20 / page » **fonctionne** (aujourd'hui `perPage: 20` en dur) et la pagination ne s'annonce qu'une fois ;
- les étiquettes de la liste sont cliquables (→ liste filtrée) ;
- la création garde tous les champs : prénom*, nom*, e-mail **ou** téléphone (E.164), profession, langue des messages, étape (Nouveau par défaut), critères complets (les 16 types restent dans « Plus »), pièce d'identité ; doublon à l'envoi + « Créer quand même » ; erreurs 422 ; garde de sortie ; redirection vers la fiche.
- Le badge « Actif » n'est plus affiché quand il vaut pour toutes les lignes ; le statut reste un filtre.
- Téléphone toujours visible sur la ligne quand il existe (aujourd'hui masqué par l'e-mail) ; formaté.
- i18n `fr`/`en`/`wo` (`wo` = français) ; vouvoiement ; « Clients » sans « (CRM) ».

## Delta à produire

- [ ] Liste téléphone et tableau bureau ; vues rapides ; tri ; gestes en ligne.
- [ ] Création en deux temps avec sonde de doublon (frappe différée) ; « Compléter plus tard ».
- [ ] Tests : vues → filtres envoyés ; `per_page` transmis ; doublon affiché pendant la frappe et « Créer quand même » à l'envoi ; bailleur sans « Ajouter » ; étiquette cliquable.

## Critères d'acceptation

- [ ] AC1 — À 390 px, au moins six lignes sont visibles sous l'en-tête et les pastilles, chacune avec Appeler et WhatsApp ; une fiche à e-mail **et** téléphone montre le téléphone.
- [ ] AC2 — « À relancer » émet `filter[follow_up]=1&sort=-follow_up_days` (réseau) et affiche le compte de la pastille.
- [ ] AC3 — Taper « 70 648 20 » dans le téléphone de la création fait paraître « Déjà dans vos clients : Mariama Fall » avant tout envoi.
- [ ] AC4 — Choisir « 50 / page » change le nombre de lignes et l'URL.
- [ ] AC5 — Connecté en bailleur, ni « Ajouter un client » ni « Étapes » ne paraissent.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), préparation : TCK-2684 → TCK-2691) :

- [ ] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2590.json` (modèle de TCK-2684) liste chaque écran de maquette implémenté (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés (vouvoiement, renommage décidé).
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9 — [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'[ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif : une des trois exceptions d'ADR-0106 § 2, ou une donnée.
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [ ] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une (visionneuse, `l=1280`), sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.

## Hors périmètre

- La fiche (TCK-2589) ; le pipeline (TCK-2592).
- Les vues enregistrées par l'utilisateur (au-delà des quatre vues fixes).

## Notes d'implémentation

_(à remplir par implementing-specs)_
