---
id: TCK-2613
title: "Assistants des invités : le téléphone, puis la raison de venir — ses biens, son premier prospect, son intervention — puis l'espace"
status: done
phase: P1
family: front
estimate: L
wave: 86
created: 2026-11-10
updated: 2026-11-14
depends_on: [TCK-2598, TCK-2612, TCK-2614, TCK-2680, TCK-2684, TCK-2687, TCK-2688, TCK-2689, TCK-2691]
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

**Écart au contrat posé le 2026-11-13, validé par team-lead le même jour** — la route neuve de l'écran 2
`GET /api/me/profiles/{sp}/intervention-d-origine` devait servir « le titulaire du profil **brouillon** seul ». Le
parcours réel (invitation depuis la demande, acceptation, lecture) a montré que cette condition ne laissait jamais
rien passer : **l'acceptation de l'invitation passe déjà le profil et sa collaboration à `active`**
(`InvitationService`, P208.02), avant tout écran de l'assistant. La condition devient : profil `draft` ou
`active`, jamais suspendu ni inactif, **et lien profond non consommé** (`metadata.deep_link_consumed_at` absent —
la première fin d'onboarding le consomme : c'est lui qui dit « onboarding pas encore fini »). Les autres
conditions tiennent : titulaire seul, invitation acceptée, même agence, demande non assignée et ouverte, champs
minimaux (titre, catégorie, quartier et ville, photo, devis soumis), jamais l'adresse exacte ni le contact du
locataire, sparse fieldsets.

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

- [x] AC1 — Un bailleur invité arrive dans `/app` en exactement deux écrans d'assistant après l'invitation (sur `dev` : quatre, plus la modale). *(parcours du 2026-11-14 à 390 px, persona `bailleur-invite` : invitation 195 acceptée par mot de passe → `/onboarding/owner?owner=35`, écran 1 « Vérifiez votre numéro » → écran 2 « Vos biens chez Agence des personas » → « Aller à mon espace » → `/app` « Bonjour Moussa », aucune fenêtre ouverte ; le code est tenu pour vérifié par écriture (`users.phone_verified_at`) : la démo locale n'a aucun fournisseur SMS, l'API ne rend donc ni SMS ni aperçu de code)*
- [x] AC2 — Un 429 à l'envoi du code laisse un message dans le DOM sous le champ, encore présent 10 s après (sur `dev` : toast éphémère seul). *(parcours du 2026-11-14, `owner1` : deux demandes de code à la suite → « Le SMS n’est pas parti : trop d’envois vers ce numéro. Réessayez dans 1 min, ou vérifiez le numéro. » dans `#invite-numero-erreur` (`role=alert`), identique 10 s après)*
- [x] AC3 — Un agent invité avec un prospect pré-assigné voit son nom et « Voir la fiche » sur l'écran qui suit le code. *(2026-11-14, `agent1`, numéro tenu pour vérifié : l'écran 2 montre « Votre premier prospect · Astou Mbaye · Nouveau », « Appeler », « WhatsApp », « Voir la fiche »)*
- [x] AC4 — Un prestataire invité depuis une demande d'intervention voit la carte de l'intervention à l'étape 2 et « Accepter » émet `POST /api/maintenance-requests/{id}/accept`. *(2026-11-14, persona `prestataire-intervention` : carte « Fuite sous l’évier de la cuisine · Plomberie · Mermoz, Dakar » ; « Accepter » → action de fin `[20]` puis action d'acceptation `[123, null]` (`spAccepterInterventionAction` → `POST /api/maintenance-requests/123/accept`) ; en base, demande 123 `assigned_to` 196, `accepted_at` posé)*
- [x] AC5 — À 390 px, le geste principal de chaque étape est visible sans défilement ; à 1280 px, le panneau voisin est rendu. *(mesuré le 2026-11-14 au navigateur, sans clic : à 390, « Recevoir le code », « Aller à mon espace », « Accepter » et « Proposer un créneau » sont entiers dans la vue et `elementFromPoint` rend le bouton en son centre, à l'écran 1 du bailleur et de l'agent (état d'arrivée, avant tout envoi de code) et à l'écran 2 des trois rôles ; l'écran 1 du prestataire est le même composant, non relevé (aucune persona prestataire au numéro non vérifié) ; à 1280, le panneau est à côté de la colonne — écran 1 : 480 + 542 px, « {agence} vous attend » ajouté ce jour ; bailleur : « À faire pour être payé » à x = 790 ; agent : x = 750 ; prestataire : x = 690)*
- [x] AC6 — « Proposer un créneau », jeudi 10:00 choisi, émet `POST /api/maintenance-requests/{id}/accept` avec `scheduled_at` à cette heure (réseau) ; l'étape affiche ensuite l'intervention acceptée avec sa date. *(2026-11-14 à 1280 px, persona remise par son seeder : jeudi 19 novembre 10:00 → action `[123, "2026-11-19T10:00:00Z"]` ; l'écran dit « Intervention acceptée · Passage prévu le jeudi 19 novembre 2026 à 10:00 » ; en base `scheduled_at` = 2026-11-19 10:00:00)*

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), préparation : TCK-2684 → TCK-2691) :

- [x] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2613.json` (modèle de TCK-2684) liste chaque écran de maquette implémenté (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés (vouvoiement, renommage décidé).
- [x] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9 — [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'[ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif : une des trois exceptions d'ADR-0106 § 2, ou une donnée.
- [x] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [x] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [x] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [x] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une (visionneuse, `l=1280`), sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur. *(mesuré le 2026-11-14 : `scrollWidth − innerWidth = 0` à 390, 768, 1024 et 1280 sur l'écran 1 du bailleur et de l'agent et sur l'écran 2 des trois rôles (prestataire : 390 et 1280 après l'inversion des gestes, 768 et 1024 juste avant — seules les classes `order` ont changé depuis) (`innerWidth` relevé égal à la largeur demandée) ; sous 1280, le panneau passe SOUS la colonne (même x, 480 px à 768, 640 à 1024) ; la seule piste fixe sous 1280 est celle de la table des biens (6,5 rem et 11 rem, dans sa colonne, sans débord))*

## Hors périmètre

- L'écran des pièces (TCK-2614) ; l'assistant de l'administrateur d'agence créé par la plateforme (`/onboarding/agency-admin`, non dessiné : seuls ses textes sont repris par TCK-2616).
- Les disponibilités saisies comme contrainte du créneau proposé (TCK-2680, hors périmètre).

## Notes d'implémentation

2026-11-13 (terrain-6) — livré en trois lots, statut inchangé (le porteur de la session le change au rituel).

- **Commun** : `onboarding/invite/AssistantDInvite.tsx` (barre « Rejoindre {agence} », « Étape n sur 2 » toujours deux :
  un numéro déjà vérifié ouvre l'écran 2, `etapeImposee`), `EtapeDuNumero.tsx` (six cases, renvoi à rebours, un
  échec d'envoi — 429 compris — écrit sous le champ avec son délai, `role="alert"`, jamais en toast seul), `pieces.tsx`.
  Les trois pages montent `OnboardingShell brouillon sortie="quitter" largeur="assistant"` ; la largeur
  `assistant` de `CoqueDEntree` (30rem → `lg` 40rem → `xl` 67,5rem : colonne de 640 px, panneau voisin à 1280)
  est un delta isolé, prévenu à terrain-8.
- **Bailleur** : « Vos biens chez {agence} » (`BiensDuBailleur.tsx`), proposition d'un bien en mode proposition,
  « À faire pour être payé » à droite au bureau. Les pièces quittent l'assistant (TCK-2614).
- **Agent** : `ProspectDeLAgent.tsx` — prospect pré-assigné (« Appeler », « WhatsApp », « Voir la fiche »), « Pas
  encore de prospect pour vous », zones et spécialisation enregistrées d'un geste par
  `agentUpdateSpecializationAction` **sans `license_number`** (TCK-1779 : le numéro de carte n'est jamais effacé),
  droits du rôle repliés au téléphone, rappel des pièces qui restent. La page lit `/api/me/pieces` avec
  `X-Profile-Id: agent:<id>`.
- **Prestataire** : `InterventionDuPrestataire.tsx` + `ServiceProviderOnboardingWizard.tsx` réécrit en deux écrans.
  - **L'invité arrive ACTIF.** L'acceptation de l'invitation passe déjà le profil et sa collaboration à `active`
    (`InvitationService`, P208.02) — mesuré par le parcours réel (`InterventionDOrigineTest`). Sur `dev`, un
    prestataire invité tout neuf, envoyé par `?sp=` (`destinationDInvitation`), tombait donc sur le panneau
    multi-agences (TCK-262), jamais sur l'assistant : ni le numéro, ni la fin d'onboarding qui lui assigne la
    demande jointe. Le panneau reste au prestataire qui avait déjà une autre collaboration, ou qui arrive sans
    lien de reprise ; un invité tout neuf (une collaboration, `?sp=`) a l'assistant.
  - **Route neuve** `GET /api/me/profiles/{sp}/intervention-d-origine` (accord de team-lead, conditions du
    2026-11-13) : titulaire du profil seul (`ServiceProviderProfilePolicy::viewOriginRequest`), profil `draft` ou
    `active` (jamais suspendu ni inactif — « brouillon seul » ne rendait jamais rien, l'invité étant déjà actif :
    c'est le lien NON CONSOMMÉ, consommé par la première fin d'onboarding, qui dit « pas encore fini »), demande
    d'origine de l'invitation **acceptée**, même agence, demande non assignée et ouverte ou accusée
    (`ServiceProviderOnboardingService::demandeDOrigine`) ; champs `title`, `category`, `place` (quartier,
    ville), `photo` (URL signées `PrivateMediaAccess`, compte), `quote` (si soumis) — jamais l'adresse exacte, le
    demandeur ni son téléphone ; `fields[intervention_d_origine]` (ParametreUnique, ADR-0075). Le chemin suit le
    préfixe existant `/api/me/profiles/{sp_profile}`. `InterventionDOrigineTest` (14 tests) : un autre prestataire,
    le même sur une autre demande, une autre agence, un lien consommé, un profil suspendu ou inactif, une
    invitation non acceptée, une demande déjà tenue, et le parcours réel de bout en bout (invitation depuis la
    demande, acceptation, lecture, `…/accept` refusé 403 avant la fin d'onboarding puis accepté avec
    `scheduled_at` après) ; chaque condition retirée par ablation fait rougir. La photo est une URL signée de 30 min
    (`PrivateMediaAccess`), servie sans jeton à une balise `<img>` ; la vignette retombe sur l'original.
  - **Ordre imposé par l'API** : avant la fin d'onboarding, la demande n'est pas au prestataire et `…/accept`
    rend 403 (épinglé par le parcours réel) ; « Accepter » finalise donc d'abord (`complete`, qui l'assigne) puis
    accepte, sans quitter l'écran ; une fin réussie ne se rejoue pas (un 422 du créneau se corrige et se renvoie
    seul). ⚠ L'action de fin pose le cookie du profil actif, et Next **re-rend la route courante** : la page relit
    alors une intervention `null` (lien consommé). L'assistant garde l'intervention et la catégorie qu'il a
    montrées en premier (`useState`), sinon « Intervention acceptée » disparaissait avec la carte.
  - « Proposer un créneau » : `datetime-local`, `min` = heure murale de Dakar, converti par `instantADakar` ; un 422
    `scheduled_at` s'écrit sous le champ (`aria-invalid`, `aria-describedby`), l'intervention reste à accepter.
  - « Complétez votre profil » : n sur 5 (métiers, zones, tarifs en F CFA, disponibilités, assurance facultative),
    lu de `GET /api/me/profiles/{sp}` et des pièces ; chaque ligne mène au réglage — `/app/profile/professional`
    (`ProfileServiceProviderSection`, TCK-592, qui édite métiers, zones, tarifs et disponibilités) et `/app/pieces`
    pour l'assurance. **Écart assumé** : la saisie en ligne des tarifs et disponibilités de la maquette devient des
    liens vers ces réglages, qui existent déjà. La pièce d'identité du prestataire, que l'ancien assistant
    téléversait, reste à sa place dans « Vos pièces » : `PiecesDuProfil` prend les pièces du prestataire de
    `UploadKycServiceProviderProfileRequest::KYC_KIND_TO_TYPE` (`cni` requise, `insurance` facultative). **Une
    exigence tombe, acceptée par team-lead le 2026-11-13** : au moins un métier, une zone et un créneau avant la
    fin — un prestataire devient opérationnel sans eux, et la liste « n sur 5 » le lui dit. `KycUploader`, sans
    montage, part avec TCK-2796.
  - Le libellé de la catégorie est traduit par la PAGE (`getTranslations('maintenance.category')`) : l'espace
    `maintenance` entier n'a pas à suivre la frontière `onboarding` pour un mot (`check-i18n-namespaces`).
  - `KycUploader` n'est plus monté par aucun assistant ; `KycUploader.pastille-tck-385` garde désormais cette
    absence et éprouve le ton de la pastille sur les deux derniers jeux de props. Le composant n'a plus de montage
    dans `src/` : sa suppression est TCK-2796.
- **Fidélité** — fiche `docs/qa/audit-ux-2026-11/fidelite/TCK-2613.json`, relevé v1 du 2026-11-13 (23:00-23:02),
  téléphone 390 et bureau 1280 seulement (règles de cadence). Aucune persona de la démo n'atteint les écrans 0 et 2
  sans écrire : écritures TEMPORAIRES autorisées par team-lead, base de démo locale (port 5433), journal :
  - 23:01:08 — `users.phone_verified_at` des utilisateurs 3 (agent1), 8 (owner1) et 18 (provider1) : `NULL` →
    `now()`.
  - 23:01:08 — `INSERT invitations` id **190** : `service_provider`, agence 1, profil prestataire 1, utilisateur
    18, `accepted`, `metadata = {"locale": "fr", "from_maintenance_request_id": 10}`.
  - 23:02:33 — remise en état : les trois `phone_verified_at` → `NULL`, invitation 190 supprimée. Relu par psql :
    trois `NULL`, aucune ligne 190, `max(id)` = 189, demande 10 `open` non assignée, profil prestataire 1
    `active`. Seule trace : la séquence `invitations_id_seq` a avancé d'un cran.
  - Aucune écriture depuis la page : toute requête autre que GET/HEAD refusée et comptée, sauf l'action serveur
    de lecture de l'écran (`getOwnerPropertiesAction`, `getAgentFirstLeadAction`) ; 0 écriture bloquée, 0 erreur de
    console sur les huit relevés. Aucun SMS ni courriel : l'écran 4 est relevé à son état d'arrivée, avant tout envoi.
  - Écarts ouverts (fiche) : « Étape N sur 2 » écrit dans la barre (la coque partagée ne montre que les
    pastilles) ; la carte « Ton interlocutrice » du bailleur au bureau ; l'ordre « Accepter » / « Proposer un
    créneau » au bureau ; les droits refusés de l'agent.

2026-11-14 (invites-2613) — suite : AC5, AC-F6 et les quatre écarts ouverts de la fiche.

- **« Étape n sur 2 » est écrit dans la barre** (au téléphone sous l'intention, au bureau à côté des pastilles). Le texte passe par un champ de déclaration facultatif `avancementEcrit` de `CoqueDEntree` (fichier partagé, inactif par défaut, sans clé neuve). Le texte écrit est `aria-hidden` : le nom accessible reste celui des pastilles. La sortie garde « Quitter » (décision 2a, validée). **Piste pour toute la coque** : l'assistant reprend réellement là où l'invité l'a laissé — brouillon serveur à chaque écran (`WizardReprenable`), reprise par `?owner=`, `?agent=` ou `?sp=` et par le bandeau de `/app` (`wizard-drafts.ts`, règles `owner-`, `agent-` et `sp-onboarding-`), écran imposé par le numéro vérifié (`etapeDInvite`). « Reprendre plus tard » serait donc plus juste que « Quitter » sur les pages qui gardent un brouillon ; sa confirmation dit même l'inverse (« Ce que vous avez saisi sur cet écran ne sera pas enregistré »).
- **Écran 1 au bureau large** : c'était un écart non listé en v1, le champ et « Recevoir le code » prenaient 1080 px. La colonne fait maintenant 480 px dès `xl`. À droite, `CeQuiVousAttend` affiche « {agence} vous attend · Juste après votre code », une ligne propre au rôle (le titre de l'intervention jointe pour le prestataire) Avant le code, il ne montre **rien que l'invité n'ait déjà vu** (décision de team-lead) : l'agence, le rôle, et pour le prestataire le titre de l'intervention que la page d'invitation lui montrait déjà (`awaiting.maintenance_request.title`). Les pièces à envoyer, le nombre de biens et le dernier loyer de la maquette n'y sont pas : l'écran 2 les montre.
- **Ordre des gestes du prestataire** : au bureau, « Accepter » vient d'abord, dans le DOM comme dans la tabulation. Au téléphone, il passe à droite (`order-last lg:order-none`). Même traitement pour « Envoyer » et « Annuler » du créneau.
- **Le panneau ne présuppose rien** : « Vos biens chez l'agence » et « Vos prospects » sont vrais aussi pour un bailleur sans bien ou un agent sans prospect.
- **Écart relevé, laissé ouvert** : au téléphone, « Accepter » est dans la piste la plus étroite (164 px contre 186 px). La piste `1fr` de « Proposer un créneau », qui ne passe pas à la ligne, s'élargit à son contenu, alors que la maquette donne 1,15 fr à « Accepter ». Ce n'est pas une nouveauté : l'ordre d'avant donnait la même chose.
- **AC1 à AC4 et AC6 ont des preuves de parcours** (écritures autorisées par team-lead), décrites sous chaque AC. AC-F2 à AC-F5 restent ouverts : a-0, a-1 et a-2 n'ont pas été relevés de nouveau.
- **Droits refusés (✗) de l'agent** : écart accepté pour motif « donnée », car l'API ne sert que les droits donnés.
- **« Ton interlocutrice »** : l'écart reste ouvert ; ticket de suite [TCK-2838](TCK-2838-le-bailleur-invite-voit-son-interlocuteur.md).
- **TCK-2835 n'est pas nécessaire** : l'acceptation passe le profil invité à `active` (`InvitationService`), et la reprise par `?owner=`, `?agent=` ou `?sp=` lit un profil actif.
- **Mesures**, sous verrou, sans clic. Écritures bornées en base de démo locale : `users.phone_verified_at` des utilisateurs 3 et 8, de `NULL` à `now()` à 16:15:52, remis à `NULL` à 16:16:20 (trap, relu par psql). Puis, pour les preuves de parcours : voir le journal ci-dessous. La page n'a fait aucune écriture (0 bloquée) et n'a levé aucune erreur.
- **Fidélité v2 de l'écran a-4** : téléphone 18,51 % (19,07 % en v1), bureau 1280 8,52 % (11,62 % en v1). L'écran a-2 n'a pas été relevé à nouveau : l'outil des relevés ne connaît pas la persona `personas-prestataire-intervention`.
- **Parcours du 2026-11-14 (16:31-16:38)**, base de démo locale, écritures autorisées par team-lead. Aucun SMS n'est parti : la démo n'a aucune intégration SMS (seulement `orange_money` et `wave`), et le routeur journalise « aucun fournisseur disponible ».
  - Invitation 195 : acceptée, ce qui crée le compte 203 (profil bailleur 35, `active`) ; `users` 203 : téléphone +221779002613, vérifié par écriture.
  - Demande 123 : acceptée deux fois, persona remise entre les deux par `PersonasDeFideliteSeeder`. Elle reste `assigned_to` 196 et `scheduled_at` 2026-11-19 10:00.
  - `users` 3 : `phone_verified_at` posé puis remis à `NULL`, relu.
  - Jetons de session 103, 104 et 105 révoqués. Le corps de `set-token` du 103 avait été journalisé par le script de parcours, qui a été corrigé et dont les journaux ont été nettoyés.
  - Deux codes demandés pour `owner1` et deux pour +221779002613, refusés faute de fournisseur.
- **Constat local, hors ticket** : sans fournisseur SMS, la première demande de code de l'écran 1 n'écrit aucune erreur sous le champ, et l'écran attend un code qui n'arrivera pas. Un fournisseur absent n'est pas un 429 ; à re-mesurer avec un fournisseur configuré.
- **`check-i18n-namespaces` rouge sur « profile »** : ce rouge ne vient pas de TCK-2613 et n'existe pas au HEAD 68f1b3d04 (extrait par `git archive`, puis vert aussi avec les fichiers de TCK-2613 posés dessus). Il vient de travaux non commités d'un autre agent dans l'arbre partagé : `takussan-web/src/app/(dashboard)/app/owners/[id]/layout.tsx`, `page.tsx` et `src/i18n/namespaces.json` (TCK-2837).

- 2026-11-14 : relevés de clôture au HEAD 928e9c810 (fiche de fidélité à jour), AC-F validés par le porteur sur le rideau (« je valide tout ») ; tableau par écran et appareil dans la PR #1671. Ticket clos.
