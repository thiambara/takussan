---
id: TCK-2613
title: "Assistants des invités : le téléphone, puis la raison de venir — ses biens, son premier prospect, son intervention — puis l'espace"
status: todo
phase: P1
family: front
estimate: L
wave: 86
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2598, TCK-2612, TCK-2614, TCK-2680]
blocks: []
spec_refs:
  features:
    - "docs/features.md#onboarding-parcours"
    - "docs/features.md#18-maintenance--interventions"
    - "docs/features.md#11-gestion-des-biens"
    - "docs/features.md#navigation-de-la-console-selon-le-profil-actif"
  models:
    - "docs/models-spec.md#34-ownerprofile-"
    - "docs/models-spec.md#35-agentprofile-"
    - "docs/models-spec.md#37-serviceproviderprofile-"
tags: [front, onboarding, invitation, mobile, audit-ux, app]
---

## Objectif utilisateur

L'invité d'une agence voit, deux écrans après avoir ouvert le lien, ce pour quoi il est venu — le bailleur ses biens (ou de quoi en proposer un), l'agent son premier prospect, le prestataire l'intervention qui l'attend — et entre dans son espace sans passer par trois pièces, un formulaire et une visite guidée.

## Contrat de données

Existant, re-mesuré sur `dev` (1bce3798a) : vérification du téléphone par code (envoi, vérification, code d'aperçu hors production), `GET /api/me/owner-profiles/{id}/properties` (biens rattachés), premier prospect pré-assigné et droits donnés par l'agence (étape 4 de l'assistant agent), spécialisation et zones de l'agent, métiers / zones / tarifs / disponibilités / assurance du prestataire, demande d'intervention d'origine (`metadata.from_maintenance_request_id`), `POST /api/maintenance-requests/{id}/accept`, accueil multi-agences du prestataire (`ServiceProviderMultiAgencyWelcome`), `POST /api/owner|agent|service-provider/onboard/complete`, brouillons serveur `owner-onboarding-{id}`, `agent-onboarding-{id}`, `sp-onboarding-{id}` et leur reprise (`wizard-drafts.ts`). Pièces : TCK-2612.

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=app-entree-assistants&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes) — écrans « Ton numéro, étape commune », « Bailleur : tes biens », « Agent : ton premier prospect », « Prestataire : l'intervention », et les variantes sous les écrans (aucun bien rattaché, aucun prospect, déjà prestataire d'une autre agence, l'envoi a échoué).
- Deux étapes, dites « Étape 1 sur 2 » / « Étape 2 sur 2 » dans la barre « Rejoindre Dakar Immo » (coque TCK-2598) :
  1. **Le numéro** : « Vérifiez votre numéro », six cases, renvoi à rebours ; un échec d'envoi s'écrit **sous le champ**, avec son délai (« Le SMS n'est pas parti : trop d'envois vers ce numéro. Réessayez dans 2 min, ou vérifiez le numéro. »), jamais en toast seul.
  2. **La raison de venir** — bailleur : « Vos biens chez Dakar Immo », une ligne par bien (vignette, type, quartier, état, loyer), « Vous avez un autre bien ? Proposez-le à l'agence » ; sans bien, « Proposer mon premier bien » en bouton plein. Agent : « Bienvenue dans l'équipe, Fatou », la carte du prospect (nom, besoin, budget, dernier contact, origine, étape, « Appeler », « WhatsApp », « Voir la fiche »), « Vos zones » préremplies avec « Modifier », « Ce que vous pouvez faire dans l'agence » replié. Prestataire : « Une intervention vous attend », la carte (titre, bien, signalée le…, photo, citation du locataire), « Accepter », puis « Complétez votre profil pour en recevoir d'autres » (métiers, zones, tarifs en F CFA, disponibilités, assurance facultative).
- Puis « Aller à mon espace » ; au bureau, à droite, « À faire pour être payé » (bailleur) ou les droits et zones (agent).
- **Téléphone (360-390 px)** : le geste principal est collé en bas (pour le prestataire : « Accepter »). **Bureau (≥ 1280 px)** : colonne de 640 px et panneau voisin, colonnes dès `lg`.
- Ton : **vouvoiement partout ([ADR-0095](../../../adr/0095-le-ton-suit-la-session.md), révisé le 2026-11-10) ; la maquette tutoie, elle n'est pas une référence de ton**.

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0095](../../../adr/0095-le-ton-suit-la-session.md).

Pas de régression — chaque fonction des assistants d'aujourd'hui reste, déplacée s'il le faut, jamais supprimée :

- Vérification du téléphone **obligatoire** en première étape, code d'aperçu hors production, bandeau « Numéro vérifié » ; un numéro déjà vérifié saute l'étape.
- Bailleur : biens déjà rattachés, « Voir tous mes biens », « Terminer » → `/app` ; la proposition d'un bien ouvre l'assistant en mode proposition (« Votre agence relira ce bien avant de le publier »).
- Agent : carte professionnelle (numéro et pièce), pièce d'identité, photo de profil — déplacées dans « Pièces » (TCK-2614) ; spécialisation (Résidentiel, Commercial, Luxe, Mixte) et zones (suggestions, ajout, retrait) — éditables depuis l'écran du prospect, **un seul geste pour enregistrer** ; droits donnés par l'agence, leur absence et leur échec de chargement ; premier prospect pré-assigné, ou « Pas encore de prospect pour vous » qui renvoie à « Demandes » et aux zones. L'administrateur invité passe toujours par cet assistant.
- Prestataire : métiers, zones, tarif horaire et frais de visite **en F CFA** (plus « XOF »), assurance RC pro facultative, disponibilités par créneau, récapitulatif ; accueil multi-agences sans recréer de compte.
- Brouillon serveur par étape et reprise par `?owner=` / `?agent=` / `?sp=` et par le bandeau de reprise de `/app`.
- **L'étape « tour » (visite guidée de 3 diapositives) disparaît des assistants** ; aucune modale de bienvenue ne la rejoue à l'arrivée (TCK-2615).
- Les pièces ne bloquent rien : elles partent dans « Démarrer » (TCK-2612, TCK-2614).
- « Accepter » l'intervention appelle l'acceptation existante ; **« Proposer un créneau » est livré** (décision du porteur du 2026-11-10, point 11 b) : il ouvre un choix de date et d'heure (heure de Dakar, pas avant maintenant) et appelle `POST /api/maintenance-requests/{id}/accept` avec `scheduled_at` (TCK-2680) — accepter et fixer le créneau d'un seul geste. Une date refusée (422) s'écrit sous le champ, et l'intervention reste à accepter.
- Libellés neufs en `fr`/`en`/`wo` ; aucun « lead », « wizard », « dashboard », « KYC » visible (TCK-2616).

## Delta à produire

- [ ] Assistants bailleur, agent, prestataire en deux étapes : numéro, puis la raison de venir.
- [ ] Échec d'envoi du code écrit sous le champ, avec délai.
- [ ] Retrait de l'étape « tour » ; pièces sorties de l'assistant.
- [ ] Tests : ordre des étapes par rôle ; numéro vérifié saute l'étape 1 ; bailleur sans bien → « Proposer mon premier bien » ouvre l'assistant en proposition ; agent sans prospect ; prestataire → `POST …/accept` ; « Proposer un créneau » → `POST …/accept` avec `scheduled_at`, et un 422 écrit sous le champ ; reprise d'un brouillon à l'étape 2 ; 429 à l'envoi → message sous le champ qui reste après 10 s.

## Critères d'acceptation

- [ ] AC1 — Un bailleur invité arrive dans `/app` en exactement deux écrans d'assistant après l'invitation (sur `dev` : quatre, plus la modale).
- [ ] AC2 — Un 429 à l'envoi du code laisse un message dans le DOM sous le champ, encore présent 10 s après (sur `dev` : toast éphémère seul).
- [ ] AC3 — Un agent invité avec un prospect pré-assigné voit son nom et « Voir la fiche » sur l'écran qui suit le code.
- [ ] AC4 — Un prestataire invité depuis une demande d'intervention voit la carte de l'intervention à l'étape 2 et « Accepter » émet `POST /api/maintenance-requests/{id}/accept`.
- [ ] AC5 — À 390 px, le geste principal de chaque étape est visible sans défilement ; à 1280 px, le panneau voisin est rendu.
- [ ] AC6 — « Proposer un créneau », jeudi 10:00 choisi, émet `POST /api/maintenance-requests/{id}/accept` avec `scheduled_at` à cette heure (réseau) ; l'étape affiche ensuite l'intervention acceptée avec sa date.

## Hors périmètre

- L'écran des pièces (TCK-2614) ; l'assistant de l'administrateur d'agence créé par la plateforme (`/onboarding/agency-admin`, non dessiné : seuls ses textes sont repris par TCK-2616).
- Les disponibilités saisies comme contrainte du créneau proposé (TCK-2680, hors périmètre).

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
