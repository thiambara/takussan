---
id: TCK-2606
title: "Voie e-mail en deux onglets, mot de passe oublié qui propose le code SMS, vérification de l'adresse qui pousse à continuer"
status: todo
phase: P2
family: front
estimate: M
wave: 86
created: 2026-11-10
updated: 2026-11-13
depends_on: [TCK-2604, TCK-2605, TCK-2684, TCK-2687, TCK-2688, TCK-2689, TCK-2691]
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
  models:
    - "docs/models-spec.md#1-user"
tags: [front, auth, email, audit-ux, app]
---

## Objectif utilisateur

Celui qui préfère l'e-mail se connecte ou crée son compte en trois contrôles ; celui qui a oublié son mot de passe apprend qu'un code SMS suffit ; celui qui vient de s'inscrire continue sans attendre sa boîte mail, et sait à quelle adresse le lien est parti.

## Contrat de données

Existant : `POST /api/auth/login`, `POST /api/auth/register` (assoupli par TCK-2605 : e-mail + mot de passe), `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`, renvoi du lien de vérification, correction d'une adresse non vérifiée (TCK-632), compte relu après vérification (TCK-2162). L'adresse du compte est lue sur `GET /api/auth/me` (session ouverte dès l'inscription).

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=app-entree-connexion&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes) — écrans « Voie e-mail », « Voie e-mail : créer », « Mot de passe oublié », « Lien envoyé », « Vérifier l'adresse ».
- Voie e-mail : « Avec votre e-mail », deux onglets « J'ai un compte » / « Créer un compte » ; créer = e-mail, mot de passe (œil, règle en **aide permanente sous le champ**, plus en *placeholder*), case des conditions avec liens, « Votre prénom vous sera demandé à l'écran suivant — rien d'autre. » ; lien bas « Utiliser plutôt mon numéro ».
- Mot de passe oublié : sous le bouton, encadré « Vous avez un numéro sur votre compte ? Recevez plutôt un code par SMS — sans rien réinitialiser. » vers la voie téléphone. Envoyé : le message tel qu'il attend dans la boîte (expéditeur, objet, première ligne), « Lien envoyé à a•••@gmail.com », renvoi à rebours, « Ouvrir Gmail » quand l'adresse est Gmail.
- Vérifier l'adresse : « Un lien est parti à **{adresse}**. Vous pouvez continuer : nous vous le rappellerons. », bouton plein **« Continuer »** (vers l'intention), liens « Renvoyer le lien » (à rebours) et « Corriger l'adresse ».
- **Téléphone (360-390 px)** : clavier ouvert, bouton au-dessus ; le bien quitté reste dans la barre (TCK-2604). **Bureau (≥ 1280 px)** : même contenu dans la colonne de droite d'TCK-2604, ou colonne centrée de 480 px pour oubli et vérification.
- Ton : vouvoiement partout ([ADR-0095](../../../adr/0095-le-ton-suit-la-session.md), révisé le 2026-11-10) ; la maquette tutoie, elle n'est pas une référence de ton — connexion, inscription, oubli et « Vérifier l'adresse » compris.

## Contraintes strictes (métier)

Pas de régression — restent : afficher / masquer le mot de passe, « Mot de passe oublié ? », bandeau « Mot de passe modifié » après réinitialisation (`?reset=1`), les trois messages d'échec Google lus dans l'URL, second facteur après le mot de passe, réponse de l'oubli identique compte ou non (pas de fuite d'existence), page de réinitialisation qui nomme l'adresse, état « Lien invalide » avec « Demander un nouveau lien », échec du lien de vérification avec son issue, compte relu après vérification, « Continuer » qui transporte l'intention.

- La confirmation du mot de passe disparaît de l'inscription (l'œil la remplace) ; la réinitialisation garde la sienne.
- Un compte **déjà vérifié** qui ouvre `/auth/verify-email` est redirigé vers sa destination.
- Le lien de vérification ouvert dans un autre onglet ramène à l'intention d'origine quand elle est connue (aujourd'hui il la perd).
- L'adresse est masquée sur l'écran « Lien envoyé » de l'oubli (aucune session : on ne confirme rien) ; elle est en clair sur « Vérifier l'adresse » (compte en session).
- Après l'inscription, l'étape prénom de `/onboarding/intention` s'affiche (prénom requis, nom facultatif).
- Libellés neufs en `fr`/`en`/`wo`.

## Delta à produire

- [x] Voie e-mail en deux onglets (connexion, création à trois contrôles).
- [x] Oubli : sortie vers le code SMS ; écran « Lien envoyé ».
- [x] Vérification : adresse dite, « Continuer » en plein, renvoi à rebours, correction, redirection d'un compte vérifié, intention gardée par le lien.
- [x] Tests : création sans prénom → étape prénom ; règle du mot de passe visible pendant la frappe ; oubli → même écran compte ou non ; compte vérifié redirigé ; le lien de vérification rend l'intention.

## Critères d'acceptation

- [x] AC1 — L'onglet « Créer un compte » envoie `{email, password}` (sans `password_confirmation`, vérifié au réseau) puis montre « Comment vous appelez-vous ? » / l'étape prénom.
- [x] AC2 — Après avoir tapé trois caractères dans le mot de passe, le texte « 8 caractères minimum… » est toujours dans le DOM et visible.
- [x] AC3 — `/auth/verify-email` pour un compte dont `email_verified_at` est posé redirige vers la destination ; pour un compte non vérifié, l'adresse du compte figure en clair dans la page.
- [x] AC4 — « Mot de passe oublié » rend le même écran « Lien envoyé » pour une adresse connue et inconnue (comparaison DOM).

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), préparation : TCK-2684 → TCK-2691) :

- [x] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2606.json` (modèle de TCK-2684) liste chaque écran de maquette implémenté (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés (vouvoiement, renommage décidé).
- [x] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9 — [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'[ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif : une des trois exceptions d'ADR-0106 § 2, ou une donnée.
- [x] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [x] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [x] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une (visionneuse, `l=1280`), sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.

## Hors périmètre

- La voie téléphone (TCK-2604) ; l'écran de réinitialisation lui-même (inchangé).

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_

**2026-11-13 (terrain-9).**

- **Voie e-mail** : `VoieEmail` (onglets ARIA « J’ai un compte » / « Créer un compte », flèches gauche/droite), montée par
  `FormulaireDeConnexion` quand le numéro est fermé, ou d’emblée sur `?voie=email` (retour de l’oubli et de la vérification),
  `?voie=inscription` (`/auth/register`, qui redirige désormais vers cet onglet) et `?reset=1` (le mot de passe vient d’être
  changé). Le second facteur, le bandeau « Mot de passe modifié » et les trois échecs Google y sont repris. `InscriptionParEmail`
  est supprimé (créé par TCK-2604 en attendant ce ticket).
- **AC1** : l’onglet « Créer » envoie `{email, password}` — éprouvé sur le corps de la requête réseau (vrai `register`, vrai
  `apiRequest`, `voie-email.tck-2606.test.tsx`). Il ouvre la session puis mène à « Vérifiez votre adresse » (intention gardée) ;
  « Continuer » y mène à `/onboarding/intention`, dont l’étape prénom (`EtapePrenom`) s’affiche pour un compte sans prénom.
  **AC1 amendé (décision a, validée le 2026-11-13)** : la création mène d’abord à « Vérifiez votre adresse », PUIS à l’étape
  prénom — l’ordre des écrans de la maquette (a-4 → a-7) ; la chaîne est éprouvée maillon par maillon (corps `{email, password}`
  → `/auth/verify-email` → « Continuer » vers `/onboarding/intention` → `EtapePrenom` pour un prénom vide). `/auth/register`
  pose `voie=inscription` (décision b, validée).
- **Oubli** : `MotDePasseOublie` (page serveur qui lit l’intention, comme la connexion) ; l’écran « Lien envoyé » est rendu quel
  que soit le résultat de l’API (AC4, DOM comparé), l’adresse masquée (`adresseMasquee`), « Ouvrir Gmail » pour une adresse Gmail
  seulement, le code SMS seulement si la voie téléphone est ouverte, le renvoi à rebours (60 s, `useCompteARebours`).
- **Vérification** : `/auth/verify-email` est une page serveur — sans session, la connexion (voie e-mail, intention gardée) ; un
  compte vérifié ou sans adresse part vers sa destination ; sinon l’adresse en clair, le renvoi à rebours, la correction
  (`updateProfileAction`, TCK-632). Le geste interrompu est nommé quand la maquette le nomme (« Continuer ma demande de visite » au
  téléphone) ; « part dès que vous continuez » est devenu « Vous reprenez … dès que vous continuez » : « Continuer » rouvre le
  geste, rien ne part tout seul.
- **Lien ouvert dans un autre onglet** : l’intention est mémorisée dans `localStorage` (et non `sessionStorage`, par onglet),
  refiltrée à la lecture, périmée au bout d’un jour, oubliée au clic (`memoire-de-l-intention.ts`) ; « Continuer » de
  `/auth/verify-email/{id}/{hash}` la lit par `useSyncExternalStore`.
- **Retirés** : `OAuthButtons` (plus aucun appelant ; son test est repris par `AutresVoies.test.tsx`, le « G » est dans
  `IconeGoogle.tsx`), 35 clés `auth.login.*`, `auth.register.*`, `auth.oauth.*`, `auth.phoneLogin.usePhone` que plus rien ne lit,
  et `auth.forgotPassword.*`, `auth.verifyEmail.*` (remplacées par `auth.oubli.*`, `auth.verification.*`, `auth.boite.*`).
- **Fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2606.json` — quinze écarts acceptés, chacun motivé (cible de
  44 px, case native de `FormCheckbox`, encre opaque de TCK-658, vouvoiement, AC4, données : date de visite absente, objet réel
  du courriel, photo du bien, clavier dessiné). Relevé du 2026-11-13 (arbre de travail sur 16a148872 ; conformes · écarts ·
  absents · % pixels, téléphone / bureau 1440) : a-3 16·2·0·14,06 / 15·4·1·39,79 ; a-4 14·5·3·17,05 / 12·8·4·40,53 ; a-5
  11·2·0·15,22 / 11·3·0·0,92 ; a-6 11·12·1·6,94 / 10·3·0·0,61 ; a-7 19·5·2·4,21 / 11·4·0·0,56. Aucune zone à contenu identique
  (la barre porte le bien, la colonne les alias). AC-F6 : pas de maquette 1280 (JOURNAL : « sans objet ») ; à 390, 768, 1024 et
  1280, débord 0 et aucune coupe sur les cinq écrans (seule ellipse : l'extrait du courriel, secondaire, tronqué comme dans la
  maquette). AC-F5 (rideau validé par le porteur) reste à faire.
- **Pied du bouton au téléphone** : 12 px sous le bouton posé sur le clavier, 20 px sans clavier (maquette : `pb-3` sur ses
  écrans à clavier, `pb-5` ailleurs) — `BoutonCollant` le lit du décalage du clavier.
- **« Mot de passe oublié » ne dit pas l'existence du compte par son temps de réponse** (r1 de la contre-vérification de
  861535de2, 2026-11-13) : `sendResetLink` (jeton haché, écrit en base, minuté à 200 ms par le `Timebox` du courtier de
  Laravel) part APRÈS la réponse, par `defer()` ; validation du format et `throttle:auth-password` restent avant. FrankenPHP
  1.13.2 rend la réponse avant les rappels différés (`fastcgi_finish_request` y existe, mesuré dans l'image : 12 ms pour un
  script qui dort 2 s après l'appel). Mesuré en base de test, `BCRYPT_ROUNDS=12`, 6 tours après chauffe, charge 9-10 sur
  8 cœurs : jusqu'à la réponse, avant 206-216 ms (compte) et 206-220 (sans) ; après 6-9 ms et 6-13 ms. Le vérificateur avait
  mesuré 360-425 contre 207-213 sous charge 13 : ici le minutage du courtier masquait l'écart, il ne le garantit pas.
  `OubliSansFuiteDExistenceTest` prouve l'ORDRE (aucun jeton à `RequestHandled`, le jeton et le lien après), pas une durée.
