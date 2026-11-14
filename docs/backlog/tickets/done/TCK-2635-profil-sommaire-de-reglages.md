---
id: TCK-2635
title: "Profil : un sommaire de réglages (une rangée par section, ce qui demande une action marqué), les avis en onglets Reçus · À laisser · Publiés, et plus de texte technique"
status: done
phase: P2
family: front
estimate: L
wave: 87
created: 2026-11-10
updated: 2026-11-12
depends_on: [TCK-2684, TCK-2687, TCK-2688, TCK-2689, TCK-2691]
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
    - "docs/features.md#111-avis--réputation"
    - "docs/features.md#profils--contexte-actif-tck-138--tck-142"
  models:
    - "docs/models-spec.md#1-user"
tags: [front, profil, avis, securite, mobile, audit-ux, app]
---

## Objectif utilisateur

Pour vérifier son numéro ou activer la double authentification, on ne traverse plus six écrans : le profil s'ouvre sur un sommaire où ce qui demande une action est marqué. L'agent lit d'abord sa réputation (avis reçus), puis ce qu'il lui reste à noter.

## Contrat de données

Aucun endpoint neuf. Les sections lisent et écrivent ce qu'elles lisent et écrivent aujourd'hui :

- `/api/auth/me` et ses mises à jour ;
- profils (`GET /api/me/profiles`) ;
- sécurité (2FA TOTP, vérification du téléphone, sessions, suppression du compte avec délai de grâce) ;
- moyens de versement (avec la double authentification à l'écriture) ;
- préférences de recherche du client, fiche publique de l'agent (langues, quartiers, TCK-2518), annuaire public ;
- avis (`ProfileReviewsList` : postés, à laisser, reçus avec filtres et signalement) ;
- exports de données personnelles (`GET/POST /api/me/data-exports`).

**La note moyenne des avis reçus** n'est rendue que par la fiche publique de l'agent. Les avis d'un compte ne la rendent pas. Le sommaire l'affiche pour l'agent depuis sa fiche publique ; pour les autres personas, elle est absente plutôt que calculée sur une page chargée.

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=app-profil&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes). Écrans « Sommaire », « Coordonnées », « Fiche publique (agent) », « Mes avis », « Sécurité », « Sommaire (bailleur) ».
- **Sommaire (téléphone)** :
  - en-tête d'identité (avatar, nom, fonction, « Voir ma fiche publique » pour l'agent) ;
  - puis « À régler » : ce qui demande une action, avec son geste (« Vérifier votre numéro · Vérifier », « Activer la double authentification ») ;
  - puis des rangées de 56 px qui ouvrent chacune sa page, avec un point terracotta sur ce qui demande une action.
- **Rangées, selon le persona** :
  - Coordonnées ;
  - Profil professionnel (agent) ;
  - Fiche publique (agent) ;
  - Préférences de recherche (client) ;
  - Annuaire public (bailleur) ;
  - Moyens de versement (bailleur, prestataire) ;
  - Notifications ;
  - Mes avis ;
  - Sécurité ;
  - Menu et affichage ;
  - Mes espaces ;
  - Mes données ;
  - et en dernier, en rouge, « Supprimer mon compte ».
- **Bureau (≥ 1280)** : deux colonnes dès `lg`, avec un sommaire collant de 240 px à gauche (« Vue d'ensemble » en tête) et la section à droite.
- **Un seul « Enregistrer » par section**, collant en bas de la section modifiée, actif seulement s'il y a une modification.
- **Mes avis** : onglets « Reçus (12) · À laisser (2) · Publiés ».
  - La note moyenne est en tête des reçus (agent).
  - Les filtres passent dans une feuille au téléphone.
  - Le bouton d'une carte seule dit « Publier mon avis ».
- **Vocabulaire** :
  - « Fuseau horaire : Dakar (GMT) », et non « Africa/Dakar » ;
  - « Double authentification » ;
  - « Numéro au format international » ;
  - « Carte professionnelle » et non `license_number` ;
  - statut « Actif » et non « · active ».
- **Mobile (360–390)** : chaque section est une page de détail, avec l'en-tête « détail » de TCK-2617 et la flèche unique.

## Contraintes strictes (métier)

**Pas de régression : chaque section d'aujourd'hui a sa rangée et sa page.** Relevé dans `profile/page.tsx` :

- **Coordonnées** :
  - courriel « Vérifié », non modifiable ici ;
  - téléphone et encart « Vérifiez votre numéro » ;
  - bio sur 500 caractères.
- **Fuseau horaire**.
- **Menu** : « Revenir au menu par défaut » (TCK-2480), barre latérale sur cet appareil.
- **Mes profils** : une carte par profil, avec agence, rôle, statut, profil actif et informations KYC propres.
- **Selon le persona** :
  - section client (préférences de recherche) ;
  - profil professionnel de l'agent (agence liée, carte professionnelle, spécialisations) ;
  - fiche publique de l'agent (langues, quartiers 0 sur 5 par ville, « Voir ma fiche publique ») ;
  - section bailleur ;
  - annuaire public ;
  - section admin ;
  - moyens de versement (bailleur, prestataire, sous double authentification) ;
  - section prestataire.
- **Sécurité** :
  - courriel vérifié ;
  - 2FA TOTP ;
  - vérification du téléphone ;
  - sessions actives avec « Courante » et révocation ;
  - **suppression du compte** avec délai de grâce de 30 jours.
- **Données** : « Mes données personnelles » (`/app/account/privacy` : archive ZIP de portabilité, liste des exports demandés).
- **Avis** :
  - postés ;
  - à laisser (étoiles, commentaire, publier) ;
  - reçus avec filtres (bien, type, statut, cible), pagination, « En attente de validation », signalement.
- **Les adresses existantes restent** (`/app/profile`, `/app/profile/notifications`, `/app/profile/reviews`, `/app/account/privacy`) : chacune ouvre sa section, et un lien d'e-mail vers l'une d'elles ne casse pas.

**Autres règles :**

- **La suppression du compte** reste derrière ses confirmations d'aujourd'hui (double authentification si active, délai de grâce affiché). Elle est en dernier, jamais au milieu.
- **« Mes espaces »** montre les espaces sans slug, avec rôle et ville (même règle que TCK-2621).
- **Le point « à régler »** ne se calcule que sur des faits rendus par l'API (téléphone non vérifié, 2FA inactive pour un admin, fiche publique incomplète pour l'agent), jamais sur une supposition.
- Libellés neufs en `fr`/`en`/`wo` (`wo` = le français tel quel) ; vouvoiement.

## Delta à produire

- [x] Sommaire (téléphone) et colonne de sommaire (bureau), rangées par persona, bloc « À régler ».
- [x] Une page par section, aux contenus et gestes d'aujourd'hui ; un seul « Enregistrer » par section.
- [x] Mes avis en trois onglets, note moyenne de l'agent, filtres en feuille.
- [x] Vocabulaire : fuseau, 2FA, format du téléphone, carte professionnelle, statut des profils.
- [x] Adresses existantes conservées.
- [x] Tests :
  - rangées exactes par persona (agent, bailleur, prestataire, client, admin) ;
  - « Vérifier votre numéro » présent si et seulement si le téléphone n'est pas vérifié ;
  - aucun texte `license_number` ni « · active » rendu ;
  - « Supprimer mon compte » en dernière rangée ;
  - `/app/profile/reviews` ouvre « Mes avis » ;
  - un seul bouton « Enregistrer » visible par section.

## Critères d'acceptation

- [x] AC1 — Agent au téléphone non vérifié et sans 2FA, à 390 : le premier écran de `/app/profile` montre « À régler », avec « Vérifier votre numéro » et « Activer la double authentification », au-dessus du pli.
- [x] AC2 — La page de l'agent ne contient nulle part les chaînes `license_number` ni `active` en minuscule après un point médian (DOM entier, sections ouvertes).
- [x] AC3 — À 1280, le sommaire de 240 px reste visible en défilant une section longue (position collante relevée après défilement).
- [x] AC4 — Bailleur : le sommaire a « Moyens de versement » et « Annuaire public », et n'a pas « Fiche publique ». Modifier un moyen de versement demande toujours la double authentification (même requête qu'avant le ticket).
- [x] AC5 — « Mes avis » d'un agent ouvre sur « Reçus ». La note moyenne affichée est celle de sa fiche publique (même valeur au réseau). « Signaler » reste sur chaque avis reçu.
- [x] AC6 — `/app/account/privacy` ouvre la section « Mes données », et « Demander mon export » envoie la même requête qu'avant le ticket.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), préparation : TCK-2684 → TCK-2691) :

- [ ] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2635.json` (modèle de TCK-2684) liste chaque écran de maquette implémenté (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés (vouvoiement, renommage décidé).
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9 — [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'[ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif : une des trois exceptions d'ADR-0106 § 2, ou une donnée.
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [ ] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une (visionneuse, `l=1280`), sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.

## Hors périmètre

- Les préférences de notification (TCK-2636).
- Le score de complétude de la fiche de l'agent (ambition de l'audit, non retenue).
- Le choix d'espace (TCK-2621).

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_

**Livraison en tranches** (terrain-5, 2026-11-11) : (1) le squelette — sommaire, une page par section ;
(2) le vocabulaire et un seul « Enregistrer » par section ; (3) les onglets de « Mes avis » ; (4) la
fiche de fidélité. Les quatre tranches sont dans l'arbre ; la fiche de fidélité est
`docs/qa/audit-ux-2026-11/fidelite/TCK-2635.json` (six écrans, trois appareils, écarts acceptés avec motif).

- **Une page par section**, sous `/app/profile/<section>` ; `/app/profile/reviews`,
  `/app/profile/notifications` et `/app/account/privacy` gardent leur adresse et ouvrent leur section
  dans le même cadre (`CadreDuProfil`). Les rangées par persona et l'adresse de chaque section vivent
  dans `src/lib/profil/sommaire.ts` (`rangeesDuSommaire`, `HREF_DE_LA_RANGEE`, `rangeeDuChemin`).
  « Supprimer mon compte » a sa page (`/app/profile/delete-account`) et ses confirmations d'avant
  (`SuppressionDuCompte`, double authentification et 30 jours de grâce inchangés).
- **« À régler » ne lit que des faits de l'API** (`aRegler`) : numéro renseigné et non vérifié ;
  double authentification inactive pour l'agent et l'admin d'agence ; fiche publique de l'agent sans
  langue ou sans quartier. Aucun pourcentage de complétude : l'API n'en rend pas. Rien pour le KYC du
  bailleur tant que l'API n'en rend pas de fait.
- **Le vocabulaire (AC2)** : le statut d'un espace se dit (« · Actif », `profile.myProfiles.statuts.*`)
  et un statut inconnu ne s'affiche pas ; « Carte professionnelle » et « Identifiant fiscal » sans nom
  de colonne ; « double authentification » partout au lieu de « 2FA » ; « format international » au
  lieu de « E.164 » ; « Dakar (GMT) » au lieu d'`Africa/Dakar`. Relevé au navigateur sur les 5 personas
  (DOM entier hors scripts, chaque section ouverte) : ni `license_number`, ni `tax_id`, ni un mot en
  code après un point médian. **Wolof** (pause du 2026-10-16 ; règle du 2026-11-12 : aucune valeur
  `wo` existante n'est réécrite) : un texte dont le SENS a changé a pris une clé neuve, `wo` = le
  français, et l'ancienne clé est retirée — `profile.security.emailAbsent` (« … dans « Coordonnées » »,
  l'ancien `wo` disait « ci kaw », plus haut), `profile.contact.emailIdentifiant` (l'identifiant de
  connexion), `profile.security.twoFactor.explication` ; `profile.serviceProvider.subtitle`, que plus
  rien ne lit (« chaque réglage s'enregistre séparément », devenu faux), est retirée. « Email » et
  « Bio » gardent leur `wo` (« Courriel », « Présentation » en `fr`). **Écart assumé, AC2 « hors wo »** :
  là où seul le vocabulaire change, `wo` garde l'ancien — `tax_id`, `license_number`, « 2FA », « E.164 ».
- **Un seul « Enregistrer » par section** (`PiedDEnregistrement`) : collé au bas de la zone qui défile,
  avec « N modification(s) non enregistrée(s) », actif sur une modification seulement — coordonnées,
  fiche publique, préférences de recherche, fuseau, profil prestataire. Le prestataire en avait
  **quatre** : un formulaire désormais, qui écrit par les mêmes routes (`PATCH …/trades` avec les
  seules clés modifiées, `PATCH …/availability` si les disponibilités ont changé). Les moyens de
  versement, l'annuaire, les notifications et le menu s'enregistrent au geste, comme avant : aucune
  requête changée (AC4, AC6).
- **Vérifié par ablation** : sans la garde de modification, les tests de la fiche publique et des
  préférences rougissent ; l'ancienne section prestataire rougit les trois tests du nouveau ; le statut
  rendu en code rougit `MyProfilesSection.vocabulaire.tck-2635`.
- **Aller-retour réel** (base de démo, valeurs restaurées) : prestataire — un tarif et une zone
  modifiés partent en UN `PATCH …/trades` (200), le pied revient à « Enregistré. » et inactif, la
  restauration aussi ; agent — une langue et un quartier enregistrés (200) éteignent le point de « Fiche
  publique » **sans recharger** (un rafraîchissement RSC), la restauration le rallume.
- **« À régler » se relit après un geste** : `router.refresh()` après la fiche publique ;
  `revalidatePath('/app/profile', 'layout')` après la vérification du numéro, l'activation ou la
  désactivation de la double authentification (`actions/security.ts`) et l'enregistrement des
  coordonnées (`actions/auth.ts`, qui ne revalidait que la page racine).
- **Les renvois vers l'ancienne page unique** pointent leur section : « Vérifier mon numéro »
  (`AvertissementNumeroNonVerifie`), le lien SMS des notifications et celui des alertes e-mail vers
  `/app/profile/contact` ; l'étape « double authentification » de la mise en service vers
  `/app/profile/security` ; « Ajoutez-en une dans vos coordonnées, plus haut » devient « … dans
  « Coordonnées » ».
- **« Enregistrer » au téléphone suit la maquette, tant qu'il y a quelque chose à enregistrer** (tranche
  4, arbitrage du 2026-11-12) : dès la première modification non enregistrée, dans la barre d'action de
  la coque, en pleine largeur, À LA PLACE de la barre d'onglets (`DeclarerEnTete formulaire` → `AppShell`
  `sansOnglets`) ; le bouton est `type=submit form=<id>`, hors du `<form>` dans le DOM. Sans
  modification, la navigation reste : barre d'onglets, et le pied du bureau sous la section (bouton
  inactif). Clavier : enregistré depuis la barre, le bouton disparaît avec elle — le focus, tombé sur
  `<body>`, est rendu au pied (`tabIndex=-1`), qui porte le retour ; un focus resté dans un champ n'est
  pas déplacé. Au bureau, sous la section après un filet. Un seul « Enregistrer » est rendu. Le compte « N
  modification(s) » et les retours restent sous le formulaire. Les sections n'ont plus de carte ni de
  titre en double (« Coordonnées » deux fois) : titre de section seul, sections en `aria-label`.
- **« Mes avis » en onglets** (tranche 3, AC5) : « Reçus · À laisser · Publiés » (`Tabs` `line`), chacun
  compté par la requête de sa liste (même clé, une seule requête ; le compte « Reçus » est le total
  sans filtre, une requête de plus quand l'adresse porte des filtres). Qui reçoit des avis ouvre sur
  « Reçus », les autres sur « À laisser » ; l'onglet suit `?onglet=` (`history.replaceState`). Un
  formulaire à une seule cible dit « Publier mon avis ». Au téléphone, les filtres des reçus passent dans
  une `FeuilleDuBas` (« Filtres » et le nombre de filtres actifs).
- **La note de l'agent** est celle de sa fiche publique (`noteDeLaFiche` : `GET /api/public/agents/{slug}`,
  la requête de la page publique, sans importer `lib/queries/public-agent.ts`, qui tire les types de la
  fiche publique dans le graphe de `/app`) : en tête des reçus et dans la rangée « Mes avis » du sommaire
  (« 12 reçus · 4,1 sur 5 »). Sans fiche, sans avis ou fiche illisible : rien, jamais un zéro. La
  répartition par étoile de la maquette n'est pas rendue : la fiche ne la donne pas (écart « donnée »).
  Relevé sur la démo : l'agent a 10 avis reçus, tous en attente, et sa fiche rend `count: 0` —
  aucune note ne s'affiche, comme sur la fiche.
- **« Signaler »** reste sur chaque avis reçu publié ; un avis en attente ne se signale pas encore
  (règle d'avant le ticket, inchangée) — et les 14 avis reçus de la démo (agent, bailleur) sont tous en
  attente.
- **Le titre de la coque au téléphone** : `/app/profile` dit « Profil » ; `/app/profile/reviews` est
  déclarée hors menu sous le profil (`HORS_MENU`) et devient un détail « ← Mes avis », comme la maquette.

**Tranche 4 — fidélité** (terrain-5, 2026-11-11) :

- **Coordonnées** : téléphone par `PhoneInput` (+221 en tête), « Vérifier » dans la rangée et la pastille
  de statut ; courriel en lecture seule (cadenas) ; « Présentation » avec compteur. Mêmes requêtes.
- **Sécurité** en rangées (`RangeeDeSecurite`, une carte à filets) : double authentification, numéro,
  courriel, puis « Appareils connectés » (icône d'ordinateur ou de téléphone d'après l'agent utilisateur,
  « Courante », « Révoquer »). Gestes inchangés.
- **Vue d'ensemble** : tête compacte (avatar et son badge d'appareil photo, qui ouvre la boîte d'édition
  d'avant ; fonction et agence par `identiteDuSommaire` ; « Voir ma fiche publique »), « Mes espaces » en
  bref (sans slug : rôles, ville, carte professionnelle — règle TCK-2621), « Menu et affichage » au bureau
  (mode de la barre, menu par défaut, langue, fuseau). ⚠ Le fuseau de cette carte s'enregistre **au
  choix** (`ProfileTimezoneSection immediat`, retour à l'ancienne valeur sur échec) ; sur sa page, il
  garde son « Enregistrer ».
- **Fiche publique** : langues en puces, quartiers empilés avec leur compte ; « Voir ma fiche publique ».
  La **jauge « 60 % complète » et l'aperçu en direct ne sont pas faits** : aucune règle de complétude
  n'existe dans l'API (écart « donnée », suite à proposer).
- **Mes avis** : carte d'avis reçu de la maquette (initiales, auteur et cible, drapeau en icône de 36 px,
  étoiles lues « Note : 4 sur 5 », date, pastille « En attente de validation ») ; « Répondre » sous la
  carte quand `can_reply`. La note de la fiche passe au-dessus des onglets. « À laisser » : étoiles de 32
  px dans des cibles de 44, « Publier mon avis » pleine largeur, cartes côte à côte dès 360 px. Le compte
  « N avis en attente » n'est pas rendu (une requête de plus).
- **Moyens de versement** en rangées (icône, « Par défaut », « En attente de vérification ») ; le
  formulaire se déplie sous « Ajouter un moyen de versement », ouvert d'emblée sans destination, en deux
  colonnes (plus de piste fixe de 180 px). Même requête (test).
- **Coordonnées** : « Modifications enregistrées. » se tait dès la modification suivante (il restait à
  côté de « 1 modification non enregistrée »).
- **Largeurs** : colonne de section 640 px (840 large), sommaire du bureau 260 px (maquette ; le texte
  d'AC3 dit 240). À 1024 et 768, `scrollWidth − innerWidth = 0` sur les 16 adresses du profil (agent,
  bailleur).
- **Ablations** : sans le pied de téléphone et sans `sansOnglets` sur `formulaire`, leurs tests rougissent ;
  la barre posée au téléphone sans modification rougit trois tests, le focus non rendu au pied un ;
  idem pour la note en étoiles, le drapeau d'un avis en attente, le formulaire replié des versements,
  l'enregistrement au choix du fuseau et son retour arrière sur échec, et le retour qui se tait.
- **Au navigateur, 390 × 844** (agent de démo, valeurs restaurées) : `/app/profile/contact` s'ouvre à 0
  modification, « Enregistrer » inactif ; une présentation modifiée part par **Entrée** dans le champ
  téléphone (soumission implicite par le bouton `form=` hors du formulaire), et le numéro envoyé est
  celui enregistré (`+221778040289`, rien de reformaté) ; une langue de la fiche part par un **toucher
  réel** sur la barre, corps identique au bureau (`{"languages":["fr"],"neighborhood_ids":[]}`) ;
  sommaire → fiche → flèche → sommaire, en navigation douce. Après l'arbitrage du 2026-11-12
  (`barre-conditionnelle.mjs`) : coordonnées ouvertes avec la barre d'onglets et « Enregistrer » inactif
  sous la section ; la présentation modifiée efface les onglets (barre d'action, bas à 832 px) ; annulée,
  ils reviennent ; enregistrée au clavier (focus sur le bouton de la barre, Entrée), les onglets reviennent
  et le focus est sur le pied, « Modifications enregistrées. » ; présentation restaurée (vide), relue
  après rechargement.
- **Fiche de fidélité** : a-1 et a-3 au téléphone sont relevés dans l'état que la maquette dessine — une
  modification en cours, non enregistrée (`--perturber`, `scripts/fidelite/fixtures/perturber-tck-2635-a-*-telephone.txt`) :
  8,98 % et 16,44 % ; au repos, avec la barre d'onglets, 14,04 % et 20,37 %. La zone « barre d'onglets » de la coque s'ancre sur « Messages » (`coque:
  false`, rôles repris) : sur le sommaire, « Menu » attrapait la rangée « Menu et affichage ».
