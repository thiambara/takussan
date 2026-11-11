# ADR-0101 — Le fil commercial vit dans la fiche client : pas d'objet « affaire », un compte rendu de visite interne, le lien envoyé d'abord

- **Statut** : Accepté le 2026-11-10 par le porteur (approche A de la maquette `app-fil-commercial` ; décision n° 9 (c) : *lien envoyé au client d'abord, saisie par l'agent possible*) — modalités : décisions de la session, à revoir
- **Date** : 2026-11-10
- **Tickets** : TCK-2578 (compte rendu de visite), TCK-2581 (après la visite : compte rendu et « Et maintenant ? »), TCK-2582 (la demande devient le dossier), TCK-2589 (fiche client : résumé puis fil) ; lisent « À clore » : TCK-2587, TCK-2596
- **Va avec** : [ADR-0102](0102-une-reservation-porte-sa-nature.md) (la saisie par l'agent), [ADR-0103](0103-le-pilotage-commercial-se-derive-des-gestes-et-des-faits.md) (l'étape proposée)
- **S'appuie sur** : [ADR-0070](0070-piece-et-revenu-du-locataire-et-de-la-caution-chiffres-masques-lus-sous-step-up.md) § 7 (ce que l'export d'un client contient)

## Contexte

Relevé sur `dev` (1bce3798a) le 2026-11-10, audit UX famille 5 ([`05-commercial.md`](../qa/audit-ux-2026-11/05-commercial.md)), **seul P0 de toute la campagne** :

- **Une visite terminée ne propose aucune suite.** `VisitDetail.tsx` offre « Voir le bien » et un formulaire d'avis de 1 à 5. La seule trace d'après-visite est cet **avis** (`POST property-visits/{visit}/feedback`), rangé dans `metadata.feedback_{role}` et ouvert 24 h. Il n'y a aucun champ de verdict ni d'objection, et rien n'est écrit dans la fiche client.
- **L'étape qui fait le chiffre d'affaires, de la visite à l'engagement, n'a pas d'écran.**
- La fiche client (TCK-591) a déjà ce qu'il faut pour porter un fil : des notes épinglées typées (`CustomerNote.kind`, dont `conversion` et `loss`), le journal d'activité et les relations.
- `?action=reserver`, sur l'URL publique d'un bien, **rouvre déjà** la boîte de candidature ou d'offre après connexion (TCK-589, TCK-2510). Une candidature déposée rejoint la fiche par la coordonnée vérifiée (TCK-1710).
- L'export des données d'un client ne contient que son identité : ni les notes, ni les métadonnées, ni les critères de l'agence (`DataExportBuilder`, TCK-956, [ADR-0070](0070-piece-et-revenu-du-locataire-et-de-la-caution-chiffres-masques-lus-sous-step-up.md) § 7). TCK-537 et le conseil juridique en décideront.

La maquette proposait trois maisons pour le dossier : la fiche client (A), un objet « affaire » client × bien (B), la conversation de messagerie (C). Le porteur a retenu A.

## Décision

**Le dossier commercial est la fiche client. La demande, la visite, son compte rendu, la candidature ou l'offre et le bail s'y lisent dans l'ordre, sans objet neuf.**

1. **Pas d'objet « affaire ».** Le fil se compose de ce qui existe :
   - les notes épinglées typées, avec deux `kind` neufs : `lead_message` (le message d'origine de la demande, TCK-2582) et `visit_report` ;
   - le journal d'activité ;
   - les relations existantes (demandes, visites, réservations, baux).
2. **Le compte rendu de visite est un objet de l'agence, distinct de l'avis du visiteur.**
   - Il vit en colonnes `report_*` sur `property_visits` : verdict, objections en liste fermée, note, suite choisie, auteur et date. Le personnel de l'agence du bien le lit et l'écrit. Il n'est **jamais** servi au visiteur, au client ni au bailleur hors personnel.
   - L'avis de 1 à 5, sa fenêtre de 24 h et son rôle ne changent pas.
   - Quand la visite a une fiche client, le compte rendu y est recopié en **une** note épinglée `visit_report`, réécrite à chaque modification.
3. **La suite d'une visite réutilise les routes existantes** : WhatsApp, tâche, planification, biens correspondants, bail depuis une réservation. Le serveur ne trace que **le choix** (`report_follow_up`). Il ne déclenche rien.
4. **Le lien d'abord.** Inviter un client à candidater ou à faire une offre, c'est lui envoyer **l'URL publique du bien avec `?action=reserver`**.
   - Il n'y a ni lien à jeton, ni lien court, ni travail public de plus.
   - La candidature déposée rejoint la fiche par la coordonnée vérifiée (TCK-1710).
5. **La saisie par l'agent est la voie seconde** : il saisit la candidature ou l'offre quand le client l'a donnée de vive voix ([ADR-0102](0102-une-reservation-porte-sa-nature.md)).
6. **« À clore »** désigne :
   - les visites confirmées dont l'heure est passée ;
   - les visites terminées sans compte rendu depuis au plus `visits.report_pending_days` jours.

   La valeur par défaut est **7** (décidée par le porteur le 2026-11-10) : c'est un réglage, pas une règle.
7. **Le sort du compte rendu.** Il suit la règle des notes de la fiche client.
   - **Hors de l'export du client**, comme les notes ([ADR-0070](0070-piece-et-revenu-du-locataire-et-de-la-caution-chiffres-masques-lus-sous-step-up.md) § 7), tant que TCK-537 n'a pas tranché.
   - À l'effacement de la fiche client, ou du compte du visiteur, la note `visit_report` part avec les notes, et `report_note`, le seul texte libre, est **vidée** sur la visite.
     **Amendement du 2026-11-11 (décision du porteur)** : « part avec les notes » laissait le texte en base — la fiche n'est que supprimée en douceur, et celle du visiteur seulement dissociée. Le **corps** de la note `visit_report` est donc vidé en place avec `report_note`, corbeille comprise ; la note garde sa place et son lien à la visite. Le journal n'a pas de copie à suivre : il ne retient pas le corps d'une note (`CustomerNote::getActivitylogOptions`, mesuré par `VisitReportPrivacyTest`).
   - Le verdict, les objections et la suite, qui sont des codes fermés sans texte, restent pour les statistiques de l'agence.

## Conséquences

- **Un client qui cherche deux biens a deux histoires dans le même fil.** C'est le « contre » de l'approche A, accepté. Le fil groupe par bien quand il en montre plusieurs.
- **Le jour où un dossier de candidature apparaît** (pièces, garant), il se rattache à la réservation ([ADR-0102](0102-une-reservation-porte-sa-nature.md)), pas à un objet neuf.
- `CustomerNote.kind` gagne deux valeurs. `docs/models-spec.md` § 33 doit enfin lister l'enum : `conversion` et `loss` y manquaient déjà.
- Le compte rendu ferme la visite d'un geste. Sur une visite confirmée et passée, il la passe à `completed` dans la même transaction, avec les mêmes effets que `complete` (TCK-2578).

## Options écartées

- **(B) Un objet « affaire » client × bien** : un modèle, une table, un cycle de vie et un écran de plus. Il dupliquerait l'étape du pipeline, qui vit sur la fiche, et poserait la question « l'affaire ou la fiche ? » à chaque écran.
- **(C) La conversation de messagerie comme dossier** : tout client n'a pas de conversation, la messagerie ne porte ni étape ni compte rendu, et ce que l'on y écrit est lu par le client.
- **Un lien d'invitation à jeton** : un secret de plus à gérer, alors que `?action=reserver` fait déjà le chemin, connexion comprise.

## Application

- Migration `add_report_to_property_visits` (réversible). `POST|PATCH /api/property-visits/{visit}/report`, sous `PropertyVisitPolicy::report`. `filter[to_close]`. Valeurs `lead_message` et `visit_report` de `CustomerNote.kind`.
- Gardes :
  - un test « le compte rendu n'est servi ni au visiteur ni au client », sur la ressource **et** sur le flux d'activité ;
  - un test « une modification réécrit la note, n'en crée pas une seconde » ;
  - un test d'effacement : `report_note` vidée, codes gardés.
