---
id: TCK-2479
title: La bande « À traiter » au-dessus du menu, et le groupe « Démarrer » d'un espace neuf
status: doing
phase: P1
family: full
estimate: M
wave: 82
created: 2026-11-05
updated: 2026-11-05
depends_on: [TCK-2478]
blocks: [TCK-2482]
spec_refs:
  features:
    - "docs/features.md#navigation-de-la-console-selon-le-profil-actif"
  models: []
tags: [front, navigation, coque, adr-0089, compteurs]
---

## Objectif utilisateur

Ce qui attend une réponse (messages, visites, demandes, modération) se voit d'un coup d'œil en tête
du menu et s'ouvre déjà filtré — sans qu'aucune entrée du menu ne change de place ; et un espace neuf
sait par où commencer.

## Contrat de données

- Compteurs existants, mêmes clés de cache et même cadence qu'aujourd'hui : `useUnreadCount`,
  `usePendingVisitsCount`, `useUnhandledLeadsCount`, file de modération des avis
  (`fetchModerationQueue`), des biens (`propertyModerationCountQueryOptions`).
- Destinations filtrées (`hrefATraiter`) : à RELEVER page par page avant d'écrire la pastille — la
  page lit-elle déjà le filtre (`/app/visits` en attente, `/app/leads` non traitées, `/app/messages`
  non lus) ? Sinon, la pastille mène à la liste entière et l'écart s'écrit ici, ou la page apprend à
  lire le filtre dans ce ticket.
- « Démarrer » : relever si un endpoint existant rend l'état de mise en service de l'espace (biens,
  KYC, équipe) — le tableau de bord d'agence en lit une partie (ADR-0064 §3). **Sinon, côté API
  (prescriptif)** : `GET /api/me/espace/demarrage` → `{ data: { etapes: [{ code, faite }] } }`, codes
  `premier_bien`, `kyc`, `equipe` ; contrôleur `App\Http\Controllers\Api\Me\EspaceDemarrageController`,
  jugé sur le profil actif ; test `EspaceDemarrageTest` (agence neuve, agence en service, bailleur,
  profil sans agence → 200 et `etapes: []` : le groupe ne s'affiche pas, ce n'est pas une erreur).

## Direction UX / Artistique

- Une bande de pastilles compacte entre l'action principale et le premier groupe : « 3 messages ·
  2 visites · 1 demande ». Calme, lisible, pas une alerte : la couleur primaire reste à ➊.
- Ordre des pastilles par priorité du persona (l'agent : demandes d'abord ; le locataire : messages).
- Quatre pastilles au plus, puis « +2 ».
- « Démarrer » : groupe à étapes cochables, chaque étape un lien ; un geste pour le masquer.

## Contraintes strictes (métier)

- **Aucune entrée du menu ne change de place selon un compteur** (ADR-0089 §5).
- Un compteur n'est sondé que si son entrée est au menu, non cadenassée (`countersToPoll`, TCK-377).
- La bande ne se rend ni pendant le chargement ni sur une erreur : 0 vaut « rien à traiter ».
- Bande nommée (`region`, « À traiter ») ; chaque pastille porte un nom accessible complet
  (« 3 messages non lus »).
- Le masquage de « Démarrer » est enregistré par TCK-2480 (`demarrer_masque`) ; avant lui, il ne
  survit pas au rechargement, et c'est écrit dans les notes.

## Delta à produire

- [x] Dérivation des pastilles depuis les compteurs et la priorité du persona.
- [x] `hrefATraiter` au catalogue pour chaque compteur, filtres de page relevés (ou ajoutés).
- [x] Bande rendue dans la barre et dans le tiroir.
- [x] Groupe « Démarrer » pour hôte, admin d'agence et bailleur, et sa source de données.
- [x] Garde : chaque `hrefATraiter` vise un paramètre que sa page lit.
- [x] Tests : ordre par persona ; « +N » ; disparition à zéro, au chargement, sur erreur ; a11y.

## Critères d'acceptation

- [x] AC1 — Avec 3 messages non lus et 2 visites en attente, un agent voit deux pastilles, dans
      l'ordre de sa priorité ; à zéro partout, aucune bande (ni nœud vide dans le DOM).
- [x] AC2 — Le jeu d'`href` des entrées du menu est le même avec et sans compteurs non nuls ;
      ablation : faire remonter une entrée chargée fait rougir le test.
- [x] AC3 — Une requête de compteur en échec ne rend aucune pastille pour ce compteur.
- [x] AC4 — Chaque pastille mène à sa page filtrée, et la page filtrée affiche ce qui attend ;
      ablation : un `hrefATraiter` vers un paramètre que la page ignore fait rougir la garde.
- [x] AC5 — « Démarrer » disparaît étape par étape, puis en entier quand tout est fait.
- [x] AC6 — Le prestataire, sans compteur à part la messagerie, voit au plus une pastille.

## Hors périmètre

- Le masquage persistant de « Démarrer » (TCK-2480).
- Toute notification nouvelle : la bande lit des compteurs existants.

## Notes d'implémentation

Plan : [`docs/plans/2026-11-05-tck-2479-bande-a-traiter-et-demarrer.md`](../../../plans/2026-11-05-tck-2479-bande-a-traiter-et-demarrer.md)
(relevés R1-R3, arbitrages 1-13 validés par la session le 2026-11-05). Commits : `895e0746b` (API),
`8474a6243` (pages filtrées + garde), `91c211466` (dispositions), `b837e053e` (bande), `34bc5b7ad`
(« Démarrer »).

**Preuve des AC** : AC1 `a-traiter.test.ts` + `AppSidebar.test.tsx` « AC1 » (T3-1, T4-3) et mesure
ci-dessous ; AC2 `AppSidebar.test.tsx` « AC2 », 8 personas (T4-1) ; AC3 `AppSidebar.test.tsx`,
`AppSidebar.section-agence.test.tsx` sur le vrai react-query, `useUnreadCount.test.tsx` (T4-2, T4-5,
T4-6) ; AC4 garde `a-traiter-lu-par-sa-page.test.ts` (T2-1 à T2-6) et mesure des clics ; AC5
`EspaceDemarrageTest.php`, `demarrer.test.ts`, `DemarrerDeLEspace.test.tsx` (T1-1..5, T3-4, T5-1) et
mesure de bout en bout ; AC6 `a-traiter.test.ts` + `AppSidebar.test.tsx` « AC6 » (T3-8, T4-4) et mesure.

### API — `GET /api/me/espace/demarrage` (tâche 1)

- `{ data: { etapes: [{ code, faite }] } }`, toujours 200 pour un compte authentifié, ordre fixe
  `premier_bien`, `kyc`, `equipe`. Une étape faite est RENDUE (`faite: true`) : c'est le front qui la
  sort. Service `App\Services\Onboarding\DemarrageDeLEspace`, qui compose `AgencySetupStatus::for()`
  (TCK-589) et `AgencyPolicy::configure`, sans réécrire de règle.
- Admin d'agence standard : les trois étapes. Hôte (agence `individual`), sous son profil admin OU
  bailleur : `premier_bien`, `kyc`, et les faits sont ceux de l'AGENCE. Bailleur : `premier_bien` (un bien
  à lui, hors brouillon) et `kyc` (`metadata.kyc.submitted_at` : pièces ENVOYÉES, aucune vérification
  n'existe). Agent, prestataire, client, locataire, et admin sans `agency.update` : `[]`.
- **Écart au plan, le test de l'hôte ne voyait pas l'ablation 5** (retirer la branche « bailleur de
  l'hôte ») : dans l'état vide, la lecture bailleur et la lecture agence rendent la même chose. Renfort :
  le test pose le KYC vérifié de l'agence et attend `kyc: true` sous les deux profils.
- Ablations 1-5 toutes rouges après le renfort (`ablations-2479-api.sh`). 11 tests, 28 assertions.

### Front pur (tâches 2 et 3)

- Pages filtrées : `/app/visits?tab=requested` (lecteur `onglet-des-visites.ts`), `/app/leads?filtre=todo`
  (la boîte APPREND `?filtre=`, arbitrage 5, lecteur `filtre-des-demandes.ts`),
  `/app/agency/moderation?filter[moderation_status]=pending` (lecteur `statut-de-la-file.ts`). Messages :
  la liste entière (arbitrage 4) ; biens : la page EST la file, sans `hrefATraiter`.
- Garde `a-traiter-lu-par-sa-page.test.ts` : un `hrefATraiter` vise un paramètre que son lecteur lit,
  ou l'absence se justifie dans `SANS_FILTRE`. Ajout au plan : 4ᵉ cas « aucune justification orpheline ».
- `pastillesATraiter` (`a-traiter.ts`) : fonction pure des entrées RENDUES non cadenassées ;
  `priorites` est une liste blanche ET un ordre (table de l'arbitrage 6 mot pour mot) ; 4 pastilles
  puis « +N ». `etapesARendre` (`demarrer.ts`) : un code inconnu n'est ni rendu ni compté.
- Ablations T2-1 à T2-6 et T3-1 à T3-8 toutes rouges (`ablations-t2.sh`, `ablations-t3.sh`, restauration
  vérifiée par md5).

### Barre : bande et « Démarrer » (tâches 4 et 5)

- **Bande « À traiter »** (`BandeATraiter.tsx`) : `<section aria-label="À traiter">` hors du `<nav>`,
  entre l'action principale et le menu ; rendue par l'`AppSidebar` du bureau ET du tiroir (éprouvé sur
  `AppShell` monté). Pastilles neutres (`bg-muted/60`, bordure), jamais `primary` ni rouge. Quatre au
  plus, puis « +N » (bouton `aria-expanded`/`aria-controls`, nom « +2 autres à traiter »). Chaque nom
  accessible commence par le texte visible (« 3 messages » → « 3 messages non lus »).
- **AC2** : la bande lit les entrées rendues ; le menu est comparé avec et sans compteurs pour les
  8 personas (ablation : trier par compteur rougit les 8).
- **AC3 / arbitrage 7** : un compteur en erreur vaut 0 dans le badge ET la bande, premier échec comme
  relecture ratée. Mesuré sur le vrai react-query : après une relecture en échec, la requête est
  `error` et garde son `data` — sans `isError`, l'ancien compte restait affiché. `useUnreadCount`
  rend 0 sur `isError` (la pastille du widget flottant aussi, jusqu'à la relecture suivante).
- **Bogue antérieur corrigé** : `nav.sidebar.counters.unhandledLeads` manquait dans les trois
  langues depuis TCK-590 — le badge des demandes n'avait pas de nom accessible.
- **« Démarrer »** (`DemarrerDeLEspace.tsx`, `useDemarrageDeLEspace`) : premier bloc du `<nav>`
  (admin d'agence, hôte, bailleur) ; une étape faite sort ; le groupe disparaît quand tout est fait ;
  rien au chargement, sur erreur, pour `etapes: []` ou une réponse malformée (la barre ne tombe
  jamais pour lui). Ni lecture ni groupe pour les autres personas ni en espace suspendu. Pas de
  sondage : relu à la navigation au-delà de 30 s, `cancelRefetch: false` (bureau + tiroir montés).
- **Masquage non persistant** : `useState` par montage — il revient au rechargement et ne se
  partage pas entre barre et tiroir. TCK-2480 l'enregistrera (`demarrer_masque`).
- **Écarts au plan MESURÉS en tâche 5** : `cancelRefetch: false` (sans lui, le second montage annulait
  la lecture du premier : 3 requêtes au lieu de 2) ; une réponse sans `etapes` ne lève plus (le code du
  plan levait un `TypeError` au rendu et emportait TOUTE la barre).
- Ablations : 8 (tâche 4) + 11 (tâche 5), toutes rouges, restaurées et vérifiées par md5.

### Écarts connus, écrits (arbitrages)

- Messages : la pastille mène à la liste entière (aucun filtre « non lus » côté API).
- Visites : une visite `scheduled` passée était comptée par la pastille mais rangée par la page dans
  « Passées » (relevé R1). Mesuré au navigateur à HEAD `34bc5b7ad` : « 42 visites » pour l'agent.
  La revue (I2, en cours dans l'arbre, non commitée au moment de la mesure) borne le compte au
  périmètre de l'onglet : mesuré ensuite « 17 visites » → « Demandées 17 ».
- Modération des avis : la liste montre aussi les avis SUR l'agence (tranchés par la plateforme, non
  comptés) ; pour le super-admin, les avis `reported` comptés n'apparaissent pas sous le filtre `pending`.
- Masquage de « Démarrer » non persistant avant TCK-2480.
- Constat de la mesure, non tranché : la pastille donne le compte entier (« 181 messages ») quand le
  badge du menu plafonne à « 99+ ».

### Mesure au navigateur (2026-11-05, 22:25-22:54)

Banc : Chrome 156 headless à profil jetable, CDP direct, front `next dev` servi sur
`http://localhost:3000` (l'API n'autorise que cette origine), API :8002. Session par jeton Sanctum
`mesure-2479` posé par `/api/auth/set-token`, sans `POST /api/auth/login`. Charge (`uptime`, 8 cœurs) :
`2.94 3.46 4.03` au début, `2.39 2.99 3.66` à la fin des deux passages, `5.64 10.58 8.35` à la toute
fin. Preuve de version : `34bc5b7ad`, `takussan-web/src` sans diff avant et après le passage A. Au
passage B, une retouche de `ContactLeadsInbox.tsx` (revue) est arrivée pendant la mesure, dans un
module que `/app` ne charge pas. Relevés bruts et 35 captures : `…/scratchpad/mesures-2479/`.

Données créées pour la mesure puis supprimées (vérifié : 0 restant) : une agence NEUVE (aucune dans la
base) — `Agency::factory()` standard, son admin, et les 80 préférences et 4 rôles posés par les
observateurs ; deux demandes de contact non traitées (la base n'en avait aucune) ; un agent pour faire
l'étape `equipe` ; 8 jetons ; 6 lignes `welcome_views`. Les pièces KYC du bailleur 8 et leurs fichiers,
son `submitted_at`, son téléphone vérifié, ses 3 jobs Scout et 5 lignes d'activité ont été remis en état.

| Persona (user) | 1366 · 768 · 390 (tiroir ouvert) | Bande « À traiter » (ordre → page) | « Démarrer » |
|---|---|---|---|
| agent (3) | débordement 0 · 0 · 0 (`innerWidth` 1366/768/390 ; témoin `mobile:true` iw=390) | 2 demandes → `/app/leads?filtre=todo` · 42 visites → `/app/visits?tab=requested` · 181 messages → `/app/messages` | — |
| admin-agence (2) | 0 · 0 · 0 | 2 demandes · 42 visites · 64 messages · 1 bien → `/app/agency/moderation/properties` · « +1 » → 100 avis → `…moderation?filter[moderation_status]=pending` | 2 sur 3 : Faire vérifier l'agence → `/app/agency/kyc` |
| admin d'agence NEUVE | 0 · 0 · 0 | **aucun nœud** (tout à zéro) | 0 sur 3 : `/app/properties/new`, `/app/agency/kyc`, `/app/agency/team` |
| bailleur (7) | 0 · 0 · 0 | 113 messages · 2 visites | 1 sur 2 : Envoyer vos pièces d'identité → **`/onboarding/owner`** (cf. défaut ci-dessous) |
| hôte (62) | 0 · 0 · 0 | 54 messages · 48 visites | 1 sur 2 : Faire vérifier l'agence → `/app/agency/kyc` |
| prestataire (17) | 0 · 0 · 0 | 114 messages (une seule pastille, AC6) | — |
| locataire (104) | 0 · 0 · 0 | **aucun nœud** (0 non lu) | — |

- Aux trois largeurs : la bande et « Démarrer » sont présents dans le TIROIR à 390 ; la bande est une
  `section` « À traiter » hors du `<nav>`, après l'action principale, sans défilement interne ;
  « Démarrer » est le premier bloc du `<nav>`. Aucune requête échouée hors des vignettes bloquées par ORB
  (contenu du tableau de bord, préexistant).
- **Ordre clavier** (dix Tab réels depuis l'en-tête d'espace, statique sur cette base) : action
  principale → pastilles → « Démarrer » (ses liens, puis « Masquer ») → menu. Le prestataire n'a pas
  d'action : en-tête → pastille → menu.
- **Chaque pastille, cliquée dans la barre, ouvre sa page sur ce qui attend** (admin, agent, bailleur,
  prestataire, 1366) : demandes → onglet « À traiter 2 » choisi, les 2 demandes listées ; visites →
  onglet « Demandées » choisi ; messages → la liste ; 1 bien → la file, « 1 bien en attente » ;
  avis (derrière « +1 », qui s'ouvre : `aria-expanded=true`) → le sélecteur sur « En attente ».
- **AC5 de bout en bout** (agence neuve) : un agent ajouté à l'agence pendant que la page est ouverte ;
  une navigation à moins de 30 s ne relit rien (« 0 sur 3 ») ; une navigation au-delà de 30 s relit
  et l'étape sort (« 1 sur 3 », `/app/agency/team` disparu), sans rechargement.
- **Arbitrage 3, le KYC du bailleur sur un profil DÉJÀ actif** : avec `?owner=2` (bailleur 8, téléphone
  pré-vérifié en base pour qu'aucun SMS ne parte), l'assistant s'ouvre, puis téléphone → 3 pièces
  (`201`) → soumission → tour → récapitulatif → `complete` réussit (activité
  `owner_onboarding_completed`, retour sur `/app`). « Démarrer » a alors disparu EN ENTIER (2 sur 2),
  et il reste absent après 30 s et deux navigations. L'assistant fonctionne : la consigne de repli
  (retirer `kyc` du bailleur côté API) ne s'applique pas.
- **DÉFAUT RÉEL TROUVÉ PAR LA MESURE, ET CORRIGÉ : le lien KYC du bailleur perdait `?owner=`.**
  `useAuth().activeProfileId` ne vaut que le cookie `active_profile_id`, et la CONNEXION ne le pose pas
  (seuls l'onboarding et le changement d'espace le posent). Pour un bailleur connecté normalement, le
  lien rendu était donc `/onboarding/owner`, et la page renvoie un profil actif vers `/app` : l'étape
  bouclait sans jamais ouvrir l'assistant (mesuré, bailleurs 7 et 8). **Correctif** :
  `DemarrerDeLEspace` prend `activeProfileId ?? useMyProfiles().data.meta.active_profile_id`, soit le
  profil que l'API a résolu, celui sur lequel elle juge les étapes (même cache que le sélecteur de
  profil de la barre, aucune requête de plus). **Deux tests** dans `DemarrerDeLEspace.test.tsx` :
  « bailleur sans cookie de profil », ROUGE sans le correctif (ablation : `activeProfileId` seul) ; et
  « le profil choisi dans le client prime », ROUGE si la priorité s'inverse. Re-mesuré après le
  correctif : le lien vaut `/onboarding/owner?owner=1` et son clic ouvre l'assistant. ⚠ Au moment de
  ce commit, le correctif est dans l'arbre mais **non commité** : ces deux fichiers portent aussi le
  travail de revue M6, en cours. Il part avec lui.

### Tickets de suite proposés

- Filtre « non lus » de la messagerie (API `ConversationController::index` + liste), pour que la
  pastille des messages ouvre ce qui attend (arbitrage 4).
- Clôture ou affichage des visites `scheduled` passées (aucune tâche planifiée ne les clôt), si la
  borne de la revue I2 ne suffit pas à la page.
