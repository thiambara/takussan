---
id: TCK-2608
title: "Orientation en trois portes, un geste : le chercheur repart avec une alerte, le professionnel avec son espace"
status: todo
phase: P1
family: front
estimate: M
wave: 86
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2598, TCK-2607, TCK-2684, TCK-2687, TCK-2688, TCK-2689, TCK-2691]
blocks: []
spec_refs:
  features:
    - "docs/features.md#onboarding-parcours"
    - "docs/features.md#24-recherche--filtres"
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md#1-user"
    - "docs/models-spec.md#23-savedsearch-"
tags: [front, onboarding, saved-search, agency, mobile, audit-ux, app]
---

## Objectif utilisateur

Juste après avoir créé son compte, chacun dit d'un seul geste ce qui l'amène — chercher, publier son bien, s'installer en professionnel — et repart avec quelque chose tout de suite : une alerte et la liste filtrée, l'assistant de publication, ou son espace pro.

## Contrat de données

Existant, re-mesuré sur `dev` (1bce3798a) : `PATCH /api/me` (`entry_intent`, `professional` ajouté par TCK-2607), `POST /api/saved-searches` (`criteria.locations`, `contract_type`, `price_min`/`price_max`, `notification_frequency`), `GET /api/public/search-alerts/capabilities` (WhatsApp ouvert ou non), `PATCH /api/me/notification-preferences` (canal WhatsApp de `saved_search_match`), `GET /api/public/properties?locations=…` (le compte de « Voir les N biens », `meta.total`), `GET /api/public/geo/neighborhoods`, `POST /api/host/individual/onboard` (`agency.name`, `agency.primary_city`, `agency.currency`, `phone_otp`, `cgu_accepted` — code facultatif pour un numéro déjà vérifié), puis la demande de passage en agence `/app/settings/agency/upgrade` (RC, NINEA, RIB pro, raison sociale, adresse fiscale, statuts).

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=app-entree-orientation&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes) — écrans « Prénom », « Trois portes », « Chercheur : l'alerte », « Professionnel », « Professionnel : rejoindre ».
- Prénom : « Comment vous appelez-vous ? », prénom et nom (facultatif), plus de note de pied ; 760 px → colonne de 480 px au bureau, champs côte à côte.
- Trois portes : « Bienvenue, Awa », « Qu'est-ce qui vous amène ? », trois cartes-boutons (icône, titre, sous-titre, promesse) — « Je cherche un logement / Louer ou acheter », « J'ai un bien à louer ou vendre / Particulier · gratuit », « Je suis un professionnel / Agent, agence, gestionnaire » ; « Vous pourrez toujours faire les trois. » ; « Plus tard » dans la barre. **La carte touchée est la réponse** : pas de bouton « Continuer ».
- Chercheur : « Où et pour combien ? », Louer | Acheter, quartiers en pastilles multiples (+ Autre), budget par mois en F CFA (« Moins de 150 000 », « 150 000 – 300 000 », « 300 000 – 600 000 », « Plus de 600 000 »), « On vous prévient sur WhatsApp quand un bien correspond » (interrupteur), bouton collé « Voir les N biens », « Passer » dans la barre ; au bureau, les trois premiers résultats à droite, mis à jour avec les pastilles.
- Professionnel : « Votre agence sur Takussan », deux cartes « Je crée mon agence » / « Je rejoins une agence » ; créer = nom de l'agence, ville principale, téléphone (repris du compte), encadré « En deux temps » (« Tout de suite » / « Sous 48 h ») ; rejoindre = « Demandez le lien à votre agence », champ « Lien d'invitation », « Écrire à votre agence sur WhatsApp » ; au bureau, « Ce que vous aurez » à droite.
- **Téléphone (360-390 px)** : cartes pleine largeur ; bouton collé au-dessus du clavier. **Bureau (≥ 1280 px)** : trois cartes côte à côte (colonnes dès `lg`).
- Ton : **vouvoiement partout ([ADR-0095](../../../adr/0095-le-ton-suit-la-session.md), révisé le 2026-11-10) ; la maquette tutoie, elle n'est pas une référence de ton**.

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0095](../../../adr/0095-le-ton-suit-la-session.md).

Pas de régression — restent :

- Sans session, renvoi à la connexion avec la destination ; étape prénom quand il manque (prénom requis, nom facultatif) ; question posée une seule fois (`skipped` compte comme une réponse), jamais à un compte qui a un profil d'agence, jamais quand la destination est explicite (`doitPoserLaQuestionDIntention`, `estUneDestinationExplicite`) ; « Plus tard » vers la destination (par défaut `/app`) ; réponse écrite dans `entry_intent` ; erreur d'enregistrement annoncée ; marque et sortie vers le site.
- Chaque porte écrit son `entry_intent` (`search`, `publish`, `professional`).
- Chercheur : quartiers et budget sont facultatifs ; « Passer » mène à la liste sans créer d'alerte ; l'alerte n'est créée qu'au geste « Voir les N biens », avec un nom lisible et unique pour le compte ; l'interrupteur WhatsApp n'apparaît que si la capacité est ouverte ; le compte affiché est celui que l'API rend pour les mêmes critères.
- Publier : mène à `/publish` (décision d'aujourd'hui, sans écran de transit).
- Professionnel, « Je crée mon agence » : l'espace s'ouvre par l'assistant hôte côté API (`host/individual/onboard`, devise XOF, numéro vérifié du compte) puis la demande de passage en agence s'ouvre préremplie du nom. **Le texte ne promet que ce que l'espace sait faire avant validation** (pas d'équipe tant que l'agence n'est pas `standard`) ; un autre numéro d'agence que celui du compte se saisit dans la demande, pas dans l'ouverture (l'API refuse un numéro différent, `phone_mismatch`). Le compte qui a déjà un espace va directement à la demande.
- « Je rejoins une agence » : un lien collé n'est suivi que s'il est une URL `/invitations/accept?token=…` de Takussan (filtre anti-redirection) ; sinon un message.
- L'assistant hôte reste servi à `/onboarding/host` (repli `host_auto_space` éteint) ; « créer une vraie agence » devient « créer une agence » (TCK-2616).
- Libellés neufs en `fr`/`en`/`wo`.

## Delta à produire

- [ ] Écran prénom resserré ; trois portes en cartes-boutons.
- [ ] Porte chercheur : quartiers, budget, contrat, WhatsApp, compte en direct, création de l'alerte, ouverture de la liste filtrée.
- [ ] Porte professionnelle : créer (ouverture de l'espace + demande préremplie) ou rejoindre (lien collé, WhatsApp).
- [ ] Tests : une carte = une réponse écrite (`PATCH /api/me`) et une navigation ; chercheur Mermoz + Ngor, 150-300 000 → alerte `locations=[Mermoz,Ngor]`, `price_min=150000`, `price_max=300000`, liste `?locations=Mermoz,Ngor&price_min=…` ; « Passer » sans alerte ; WhatsApp absent capacité fermée ; pro créer → `host/individual/onboard` puis demande préremplie ; lien d'un autre site refusé ; compte à profil d'agence → pas de question.

## Critères d'acceptation

- [ ] AC1 — Toucher « J'ai un bien à louer ou vendre » émet `PATCH /api/me {entry_intent: "publish"}` puis navigue vers `/publish`, sans autre clic.
- [ ] AC2 — « Voir les 37 biens » : le nombre affiché est égal au `meta.total` de la requête de liste émise pour les mêmes critères, et l'alerte créée porte ces critères (réseau).
- [ ] AC3 — « Je crée mon agence » avec « Keur Immo » : la demande de passage en agence s'ouvre avec « Keur Immo » prérempli ; aucun texte de l'écran n'annonce « équipe » avant la validation.
- [ ] AC4 — À 390 px, les trois cartes et « Plus tard » tiennent sans défilement ; à 1280 px, elles sont sur une ligne.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), préparation : TCK-2684 → TCK-2691) :

- [ ] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2608.json` (modèle de TCK-2684) liste chaque écran de maquette implémenté (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés (vouvoiement, renommage décidé).
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9 — [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'[ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif : une des trois exceptions d'ADR-0106 § 2, ou une donnée.
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [ ] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une (visionneuse, `l=1280`), sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.

## Hors périmètre

- Le contenu de la demande de passage en agence ; la validation par la plateforme.
- L'accueil de `/app` après « Plus tard » (famille 3).

## Notes d'implémentation

### 2026-11-13 — terrain-8

**Ce qui est livré (front seul, aucune route d'API neuve).**
- `/onboarding/intention` : le prénom (maquette a-0, `EtapePrenom`) puis l'orientation (`components/onboarding/orientation/`) dans `CoqueDEntree` sans sortie ; trois portes en cartes-boutons (`PortesDEntree`) : la carte touchée EST la réponse — `PATCH /api/me {entry_intent}` (`search`, `publish`, `professional` ; « Plus tard » → `skipped`), puis `refreshUser`, puis l'écran suivant. `ENTRY_INTENTS` gagne `professional` (`types/user.ts`).
- Chercheur (`EtapeChercheur`) : contrat, huit quartiers (les plus fournis de Dakar, `/public/properties/neighborhoods`), « Autre », budget par tranche (location seule) ; le nombre vient de `GET /public/properties/search` avec les mêmes paramètres que la liste (`per_page=3&placements=false`, `meta.total` ne dépend ni de l'un ni de l'autre). L'alerte (`notification_frequency: daily`) n'est créée qu'au geste « Voir les N biens », jamais au toucher d'une pastille ; l'interrupteur WhatsApp n'existe que si la capacité est ouverte, le compte a un numéro et le canal n'est pas verrouillé (`canalWhatsAppDuChercheur`) ; « Passer » → `/properties` sans alerte.
- Professionnel (`EtapePro`) : « Je crée mon agence » → `hostIndividualOnboardAction` (numéro VÉRIFIÉ du compte, sinon `NumeroAVerifier` par OTP ; un 409 `already_onboarded` vaut « déjà un espace ») → `/app/settings/agency/upgrade?raison_sociale=<nom>` ; la page de la demande ne le prend que si la fiche n'a pas de raison sociale, rogné, ≤ 160 caractères. « Je rejoins une agence » : lien collé filtré (`lienDInvitationSuivi` : hôte du site ou de la page, `/invitations/accept?token=`), aperçu par `lireInvitation`, lien WhatsApp.
- Reprise : l'écran courant vit dans l'URL (`?etape=`, `history.replaceState`) — une server action qui pose un cookie (l'ouverture de l'espace pose `active_profile_id`) RE-REND la page côté serveur, réponse écrite et profil d'agence créé ; sans reprise elle redirigeait vers `/app` au milieu de l'écran (`ecranAReprendre`, `lib/orientation.ts`).
- Porte pro du site : `?etape=pro` ouvre l'écran du professionnel d'emblée pour un compte neuf, et pour un compte sans profil d'agence quelle que soit sa réponse ; la page écrit alors `professional` une fois (`ecrireProfessionnel`). Un compte établi (profil d'agence, autre réponse) n'y est pas ramené. ⚠ Le lien de `/publish` (`LIEN_PRO` de `PublierSansCompte.tsx`) vise encore `/onboarding/agency-admin` : son passage à `/auth/login?redirect=%2Fonboarding%2Fintention%3Fetape%3Dpro` attend terrain-9, dont le fichier et le test tck-2600 (assertion l. 127) sont en cours.
- `CoqueDEntree` (bloc TCK-2608, fichier partagé, accord de team-lead) : `DeclarerEntree largeur` (`portes` 880 dès `lg`, `volets` 560 dès `lg`, objet dessous jusqu'à 1280 puis à droite) l'emporte sur la largeur du layout.
- Supprimés : `QuestionDIntention.tsx` et son test, les clés mortes `onboarding.intention.{pageTitle,…,reprise}` et `name.lastName` (remplacée par `name.nom` + `name.facultatif`). ⚠ Sa traduction wolof « Sant (du war) » part avec elle ; les clés neuves portent le français en `wo` (wolof en pause).

**Preuves.** Tests : `lib/__tests__/orientation.tck-2608`, `orientation/__tests__/{Orientation,EtapeChercheur,EtapePro}.tck-2608`, `intention/__tests__/reprise.tck-2608`, `entree/__tests__/CoqueDEntree.largeur-declaree.tck-2608`, `settings/agency/upgrade/__tests__/page.raison-sociale.tck-2608`, plus les tests d'entrée ajustés. Ablations (chacune rouge, puis fichier restauré au md5) : publier écrit `search` ; `skipped` non écrit ; compte sans critères ; WhatsApp forcé ; sans `raison_sociale` ; lien non filtré ; 409 compté en échec ; alerte au toucher d'une pastille ; reprise pro avec profil ; verrou du canal ignoré ; capacité ignorée ; étape absente de l'URL ; largeur déclarée ignorée par la coque ; fiche écrasée par la proposition ; borne 160 levée ; porte pro → portes ; `professional` réécrit à chaque reprise ; `|| !aUnProfilDAgence` retiré ; écriture `professional` à l'ouverture retirée.

**Relevés (fidélité, `docs/qa/audit-ux-2026-11/fidelite/TCK-2608.json`).** Quinze écrans (a-0 à a-4 × 390, 1440, 1280), écritures refusées dans la page, `PATCH /api/me` et l'aperçu d'invitation doublés (rien n'est écrit, aucune invitation créée) ; balayage 390/768/1024/1280/1440 sans débord. Écarts acceptés et leurs motifs dans la fiche : vouvoiement (titres plus longs), « Retour au site » de la coque sur le prénom, ombres de jetons partagés, primitive « Autre », données de la démo (quartiers, aucun loyer entre 150 et 300 000 : « Voir les biens » sans nombre — le « 37 » de la maquette ; le nombre mesuré : 73 sans critère, 5 pour Mermoz + Ngor), WhatsApp fermé en local, contenu de « Ce que vous aurez » (aucune « équipe », AC3), pas de « 48 h », ville libre, ligne des conditions d'utilisation (décision produit). Réconciliation ligne à ligne des quinze rapports de la dernière comparaison (22 écarts acceptés, 26 alias) — dont l'espace avant « (facultatif) », la hauteur de l'aide du numéro, la phrase plus courte du lien d'invitation, et la pastille « Nouveau » de l'aperçu (aucune notion de nouveauté dans le contrat de recherche). ⚠ **Non mesuré** : l'aperçu peuplé du chercheur (aucun résultat dans l'état relevé, éprouvé en vitest seulement) et l'interrupteur WhatsApp. AC-F4 n'est pas tenu sur la barre de la coque (téléphone a-0 2,55 %, bureau 0,95 à 2,09 %), motivé dans la fiche.

**Comptes de démo de relevé (accord de team-lead, « aux conditions de la 189 »), 2026-11-13.** Créés par `User::create` direct (aucune inscription, aucun envoi), e-mails `@example.test`, téléphones fictifs `+221770002608/09` vérifiés : **187** (Awa Diop) et **189** (prénom vide). L'id 188 a été consommé par un premier insert refusé (`first_name` NOT NULL) : aucune ligne. Jetons de relevé dans un fichier 0600, jamais imprimés, absents de toute sortie (compte vérifié à 0), fichier supprimé. **Supprimés le même soir** : 2 jetons Sanctum, 160 préférences de notification (créées par `UserObserver`), les 2 comptes (`forceDelete`), 6 lignes du journal d'activité ; relu ensuite : aucune ligne à leur id dans aucune table à `user_id`/`causer_id`/`subject_id`/`tokenable_id`/`notifiable_id`/`model_id`, et l'index de recherche des comptes répond 404 `document_not_found` pour les deux.
⚠ Incident réparé pendant la frappe des jetons : `fidelite.mjs jetons` a refrappé toutes les personas absentes du fichier de relevé, ce qui révoque les jetons précédents du fichier partagé `~/.takussan-fidelite/jetons.json` ; refrappés aussitôt (`jetons --renouveler`), aucun relevé ne tournait. Pour une persona de relevé neuve : laisser `releve --persona <nom>` la frapper seule (il ne frappe que la persona qui manque), jamais `jetons` sur un fichier neuf.
