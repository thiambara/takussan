---
id: TCK-2581
title: "Après la visite : le compte rendu en trois touches, puis « Et maintenant ? » — inviter, saisir, 2e visite, autres biens, relancer, créer le bail"
status: todo
phase: P0
family: front
estimate: L
wave: 89
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2578, TCK-2580]
blocks: [TCK-2587]
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
    - "docs/features.md#16-crm--relation-client"
    - "docs/features.md#14-location-longue-durée-baux"
  models:
    - "docs/models-spec.md#17-propertyvisit-"
    - "docs/models-spec.md#nouveaux-enums"
tags: [front, visits, crm, mobile, audit-ux, app, p0]
---

## Objectif utilisateur

À la sortie d'une visite, l'agent dit en trois touches comment elle s'est passée, puis donne une suite au client en un choix — le lien pour déposer son dossier ou son offre d'abord, la saisie s'il est devant lui —, et le fil commercial ne s'arrête plus à « Terminée ».

## Contrat de données

- `POST|PATCH /api/property-visits/{visit}/report` (TCK-2578) : `outcome`, `objections[]`, `note`, `follow_up` ; la réponse porte `suggested_stage`.
- `PATCH /api/customers/{id}/pipeline-stage` (existant) pour l'interrupteur « Passer en Qualifié ».
- Suites, toutes sur des routes existantes :
  - **Inviter à candidater / à faire une offre** : message WhatsApp prérempli (aide `whatsappHref` de `components/crm/contact.ts`) qui porte l'URL publique du bien **avec `?action=reserver`** — re-mesuré : ce paramètre rouvre déjà la boîte de candidature (location au mois) ou d'offre (vente) sur la fiche publique, connexion par numéro comprise (`useReservationDeLaFiche`, TCK-589, TCK-2510). La candidature déposée rejoint la fiche existante du client par sa coordonnée vérifiée (`CustomerService::findOrCreateFromUser`, TCK-1710) ;
  - **Saisir sa candidature / son offre** : la feuille de TCK-2580, préremplie ;
  - **Planifier une 2e visite** : la planification de visite, client et bien préremplis ;
  - **Proposer d'autres biens** : les biens correspondants de la fiche (partage WhatsApp existant, `CustomerMatches`) ;
  - **Relancer dans N jours** : `POST /api/tasks` rattachée au client, échéance proposée à J+2 ;
  - **Créer le bail** : `/app/leases/new?booking_id=` (P48.03), actif seulement si `GET /api/bookings?filter[customer_id]=&filter[property_id]=&filter[kind]=application&filter[status]=confirmed` rend une ligne.
- Le choix fait est renvoyé dans `follow_up` du compte rendu.

## Direction UX / Artistique

- Maquettes de référence : `/fr/playground/maquettes?p=app-fil-commercial&a=a` — écrans « Après la visite », « Et maintenant ? », « La candidature arrive », « Acceptée : le bail » ; et `?p=app-visites&a=a` — écran « Compte rendu et suite » (téléphone redessiné le 2026-11-10) ; **référence de fidélité, non versionnée**, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes).
- Compte rendu : rappel de la visite en tête (bien, visiteur, heure) ; trois grosses touches Intéressé · À réfléchir · Pas intéressé ; « Ce qui a pesé · facultatif » en pastilles (Prix, Quartier, Taille, État, Disponibilité, Garant) ; « Une note » ; mention « Interne à l'agence — le client ne le voit pas et garde son propre avis (1 à 5) ».
- « Et maintenant ? » : résumé du compte rendu avec « Modifier », puis la liste des suites dans l'ordre utile, la recommandée marquée « Conseillé » et dépliée avec l'aperçu du message WhatsApp ; « Créer le bail » grisée avec sa raison tant qu'aucune candidature n'est acceptée ; phrase « Chaque choix s'écrit dans le fil de la fiche ».
- **Décision 2a — « Oui, qualifié / Plus tard » devient un interrupteur** « Passer <prénom> en « Qualifié » » (« Aujourd'hui « Prospect » ») : allumé par défaut quand `suggested_stage` le propose, éteint sinon ; l'étape ne change qu'à la validation.
- Libellés de la suite selon le bien : « Inviter à candidater » / « Saisir sa candidature » pour une location au mois, « Inviter à faire une offre » / « Saisir son offre » pour une vente ; pas de suite d'engagement pour un séjour court.
- « Compte rendu », jamais « feedback » ; vouvoiement de l'agent ; le message WhatsApp au client vouvoie aussi.
- **Téléphone (360-390 px)** : deux feuilles plein écran successives, bouton collant « Enregistrer » ; cibles ≥ 44 px. **Bureau (≥ 1280 px)** : dans le détail de la visite, colonne droite « Compte rendu » puis « Suite » (maquette `VisiteTermineeBureau`), colonnes dès `lg`.

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0101](../../../adr/0101-le-fil-commercial-vit-dans-la-fiche-client.md), [ADR-0102](../../../adr/0102-une-reservation-porte-sa-nature.md).
- Sur le détail d'une visite, le compte rendu s'ouvre : après « Terminer la visite » (enchaîné), depuis une visite `completed` sans compte rendu, et depuis une visite `confirmed` passée (TCK-2578 la clôt en un geste).
- **Pas de régression sur le détail de visite** (`VisitDetail.tsx`, `VisitFeedbackForm.tsx`) : « Voir le bien », lien « Fiche CRM », `tel:` / `mailto:`, tous les gestes selon l'état et le rôle (Prendre en charge, Confirmer, Replanifier, Proposer un autre créneau, Terminer, Absent, Annuler avec motif), l'avertissement de SMS retenu, et **l'avis post-visite 1-5 du client** dans sa fenêtre de 24 h restent. Côté agent, le formulaire « Feedback post-visite » laisse la place au compte rendu ; un avis d'agent déjà envoyé (`metadata.feedback_agent`) reste lisible sur la visite.
- Le compte rendu n'est montré qu'au personnel de l'agence ; le client et le bailleur hors personnel ne voient ni l'entrée ni le contenu.
- Visiteur sans fiche client : le compte rendu s'enregistre, mais les suites qui demandent une fiche (saisir, relancer, autres biens, passage d'étape) proposent d'abord « Créer sa fiche » (création préremplie du nom et du téléphone du visiteur).
- Sans choix de suite, rien ne casse : la visite garde son compte rendu (la relance proposée « demain dans Aujourd'hui » est portée par TCK-2596, pas par une tâche créée d'office).
- i18n `fr`/`en`/`wo` (`wo` = français), dont le texte du message WhatsApp.

## Delta à produire

- [ ] Feuille « Compte rendu » (verdict, objections, note) et écran « Et maintenant ? » (suites + interrupteur d'étape), branchés sur le détail de visite téléphone et bureau.
- [ ] Les six suites câblées sur les routes ci-dessus ; « Créer le bail » activée par la candidature acceptée.
- [ ] Retrait du formulaire d'avis côté agent, avis déjà envoyés affichés en lecture.
- [ ] Tests : trois touches → corps envoyé ; interrupteur allumé si `suggested_stage` et `PATCH` d'étape seulement à la validation ; lien WhatsApp contient `?action=reserver` et le slug du bien ; « Créer le bail » inactive puis active selon la réponse des réservations ; libellés vente / location ; avis client 1-5 toujours proposé au client.

## Critères d'acceptation

- [ ] AC1 — À 390 px, sur la visite terminée de Mouhamed Dieng (pièce à Ouakam, location au mois), toucher « Intéressé » puis « Enregistrer » envoie `outcome=interested` et ouvre « Et maintenant ? » avec « Inviter à candidater » marquée « Conseillé ».
- [ ] AC2 — L'URL du message WhatsApp de « Inviter à candidater » ouvre, dans un navigateur sans session, la fiche publique du bien avec la boîte de candidature ouverte après connexion par numéro (parcours mesuré au navigateur, pas seulement l'URL).
- [ ] AC3 — L'interrupteur « Passer Mouhamed en « Qualifié » » est allumé ; l'éteindre puis valider n'émet **aucun** `PATCH …/pipeline-stage` ; l'allumer émet `{stage: qualified}`.
- [ ] AC4 — Sur une villa à vendre, les libellés sont « Inviter à faire une offre » et « Saisir son offre » ; sur un séjour court, aucune des deux suites n'apparaît.
- [ ] AC5 — « Créer le bail » est grisée sans candidature acceptée ; avec une candidature `confirmed` du client sur ce bien, elle mène à `/app/leases/new?booking_id=<id>`.
- [ ] AC6 — Connecté en client sur sa visite terminée, il voit l'avis 1-5 et **aucun** élément du compte rendu (DOM).
- [ ] AC7 — À 1280 px, compte rendu et suite tiennent dans la colonne droite du détail, sans dialogue.

## Hors périmètre

- La refonte du détail de visite avant / jour J (TCK-2587) et la carte « À clore » (TCK-2587).
- La note dictée (micro) : saisie au clavier seulement.
- Un lien court dédié (`/c/…`) ou un lien qui reconnaît le client sans connexion : l'URL de la fiche avec `?action=reserver` suffit à la décision 9c.

## Notes d'implémentation

_(à remplir par implementing-specs)_
