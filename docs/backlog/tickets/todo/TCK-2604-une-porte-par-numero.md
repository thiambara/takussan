---
id: TCK-2604
title: "Entrer : une seule porte par numéro, surmontée de ce que le visiteur était en train de faire"
status: todo
phase: P1
family: front
estimate: M
wave: 86
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2598, TCK-2684, TCK-2687, TCK-2688, TCK-2689, TCK-2691]
blocks: [TCK-2606]
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
  models:
    - "docs/models-spec.md#1-user"
tags: [front, auth, mobile, intention, audit-ux, app]
---

## Objectif utilisateur

Le visiteur à qui l'on demande un compte au milieu d'un geste voit le bien qu'il quittait et l'action interrompue, entre son numéro sans avoir à choisir entre « se connecter » et « s'inscrire », et reprend là où il s'était arrêté.

## Contrat de données

Existant, re-mesuré sur `dev` (1bce3798a) :

- `POST /api/auth/phone/request-code` (202, même réponse que le numéro ait un compte ou non, `retry_after`) et `POST /api/auth/phone/verify-code` (compte créé au premier code ; `requires_2fa`, `requires_terms`) ; drapeau `phone_login` lu par le navigateur.
- L'intention : `?redirect=` filtré (`destinationInterne`, `destinationPublique`), posée par `hrefConnexion` (barre publique) et par les dialogues de la fiche (`PropertyReservationDialog`), relue jusqu'à `/onboarding/intention` (TCK-624). L'URL ne porte aujourd'hui que la page, jamais l'action.
- Le bien quitté : `GET /api/public/properties/{slug}` avec les seuls champs de la carte (titre, quartier, prix, fréquence, couverture).
- `/auth/register` (`register/page.tsx`) rend la même voie téléphone sous un autre titre.

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=app-entree-connexion&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes) — écrans « Numéro (venant d'une visite) », « Numéro (arrivée directe) », « Code ». **Le bureau est validé tel quel ; le téléphone a été redessiné le 2026-11-10.**
- **Téléphone (360-390 px)** : en tête, la photo du bien quitté (176 px) qui porte l'action (« Votre demande de visite ») et le bien (« Studio meublé · Mermoz · 250 000 F CFA / mois ») ; « Entrez votre numéro », « Nouveau ou déjà inscrit : un code par SMS suffit. » ; le numéro est le seul champ, en grand, avec sa coche quand il est complet ; Google et l'e-mail tiennent sur une ligne ; « Recevoir un code » est posé juste au-dessus du pavé numérique ouvert. Arrivée directe (sans intention) : la photo porte la marque et ce que le compte ouvre (« Vos visites, vos favoris, vos annonces. »).
- Écran du code : le bien reste dans la barre du haut (vignette, action, nom du bien) ; « Code envoyé au 77 123 45 67 · Modifier » ; six cases, remplissage automatique du SMS, envoi au sixième chiffre ; « Valable 5 minutes · Renvoyer le code dans 54 s » ; « Tu reprends là où tu t'es arrêtée » ; bouton « Me connecter ».
- **Bureau (≥ 1280 px)** : deux colonnes ; à gauche (45 %), l'objet de l'intention — grande photo du bien, titre, prix, l'action et sa date si elle est connue ; à droite, le formulaire de 400 px. Sans intention, aucune villa ni slogan : la marque seule (une photo de Dakar **libre de droits, fournie par le porteur** — décidé le 2026-11-10 ; sans elle, la marque seule).
- Le séparateur dit « ou » (plus « OU CONTINUER AVEC EMAIL » au-dessus de Google).
- Ton : vouvoiement partout ([ADR-0095](../../../adr/0095-le-ton-suit-la-session.md), révisé le 2026-11-10) ; la maquette tutoie, elle n'est pas une référence de ton.

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0095](../../../adr/0095-le-ton-suit-la-session.md).

Pas de régression — restent, à l'identique de comportement :

- Voie téléphone en tête quand `phone_login` est allumé, voie e-mail sinon ; bascule dans les deux sens.
- +221 hors du champ et son aide (« À l'étranger ? Commence par + ») ; code à 6 chiffres valable 5 min ; renvoi au délai rendu par l'API ; changer de numéro ; mention des CGU sous le champ.
- Messages distincts : verrou (423), compte suspendu, trop de demandes (429), numéro invalide (422), indicatif refusé, code faux ; code affiché hors production (« Environnement de test », « Utiliser ce code ») ; étape « conditions » d'un compte né du Radar ; second facteur (code d'application ou de récupération, « Annuler »).
- Google seulement s'il est configuré, intention mémorisée avant le départ ; un échec de chargement des fournisseurs **retire** le bouton (plus de pilule grise ni de « Impossible de charger les fournisseurs d'authentification ») ; après un échec Google, le message propose la voie affichée (le numéro), pas l'e-mail.
- Sortie unique vers `/onboarding/intention?redirect=…` (TCK-624), filtre anti-redirection ouverte ; « Retour » vers la page publique quittée ; session ouverte par `openSession` seulement.
- **`/auth/register` redirige vers `/auth/login` en gardant `redirect`** (et l'onglet « Créer un compte » de la voie e-mail, TCK-2606) ; aucun lien entrant ne casse.
- **Pas d'énumération** : rien sur l'écran du numéro ou du code ne dit avant le code si le numéro a un compte ; le bouton du code a un seul libellé.
- L'action affichée vient d'une liste fermée (réservation, visite, alerte, favori, publication, invitation) posée par l'appelant ; une valeur inconnue est ignorée ; aucun texte de l'URL n'est affiché tel quel.
- Libellés neufs en `fr`/`en`/`wo` ; « Valider » disparaît.

## Delta à produire

- [ ] Écran unique du numéro (téléphone redessiné, bureau validé), carte et photo d'intention.
- [ ] Paramètre d'action facultatif, liste fermée, posé par les appelants qui interrompent une action (dialogue de réservation de la fiche, alerte, favori, « Me connecter » du départ de `/publish`).
- [ ] Écran du code : six cases, envoi au sixième chiffre, rappel du numéro et « Modifier ».
- [ ] `/auth/register` → `/auth/login` (redirection qui garde `redirect`).
- [ ] Tests : intention « réservation » d'une fiche → carte du bien ; action inconnue ignorée ; sans intention → aucune image de bien ; envoi automatique au sixième chiffre une seule fois ; `/auth/register?redirect=/publish` → `/auth/login?redirect=/publish` ; échec des fournisseurs → pas de bouton Google ; les huit messages d'erreur rendus ; `login-retour-a-l-origine` et `inscription-intention` restent verts.

## Critères d'acceptation

- [ ] AC1 — Depuis la fiche d'un bien, « Réserver » sans compte ouvre la connexion qui montre la photo, le titre et le prix de CE bien (comparés à la fiche), et l'action « réservation ».
- [ ] AC2 — À 390 × 844, pavé numérique émulé, le bouton « Recevoir un code » est entièrement visible au-dessus du pavé.
- [ ] AC3 — Au sixième chiffre, exactement un `POST /api/auth/phone/verify-code` part (réseau) ; un code faux laisse les six cases et dit « Vérifiez-le, ou demandez-en un nouveau ».
- [ ] AC4 — `GET /auth/register?redirect=%2Fpublish` aboutit sur `/auth/login?redirect=%2Fpublish` (307 ou navigation client), et le parcours ramène à `/publish`.
- [ ] AC5 — La réponse de `request-code` et l'écran du code sont identiques pour un numéro connu et inconnu (comparaison DOM).

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), préparation : TCK-2684 → TCK-2691) :

- [ ] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2604.json` (modèle de TCK-2684) liste chaque écran de maquette implémenté (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés (vouvoiement, renommage décidé).
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9 — [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'[ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif : une des trois exceptions d'ADR-0106 § 2, ou une donnée.
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [ ] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une (visionneuse, `l=1280`), sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.

## Hors périmètre

- Voie e-mail, mot de passe oublié, vérification de l'adresse (TCK-2606).
- La connexion sans quitter la page (approche C, non retenue) ; la connexion par WhatsApp.

## Notes d'implémentation

**Implémenté le 2026-11-13 (terrain-5).** Fiche de fidélité : `docs/qa/audit-ux-2026-11/fidelite/TCK-2604.json`.

**Décisions réversibles prises** (signalées à la session, ticket « recommande et avance si c'est réversible ») :
`/auth/register` répond par une redirection serveur (307) vers `/auth/login` en gardant `redirect` et l'intention ;
le paramètre s'appelle `intention=` (liste fermée `ACTIONS_D_ENTREE`, `lien-connexion.ts`) ; le dialogue de la fiche
passe `reserve` → `reservation`, `apply` → `candidature`, `offer` → aucune intention (une offre n'a pas de nom dans la liste).
**`apply` disait d'abord `visite` : la mesure depuis la fiche l'a démenti.** Sur une location au mois, le bouton est
« Déposer mon dossier » (`property.reservation.apply` : « Postuler à ce bien », « votre dossier de location ») ; la
connexion disait « Votre demande de visite ». Septième geste ajouté : `candidature` — « Votre candidature », « Pour
déposer votre dossier, entrez votre numéro. », « Votre dossier part chez … », icône de dossier (`FileText`) au lieu du
calendrier. La demande de visite, elle, ne passe jamais par la connexion (TCK-590 : nom et téléphone suffisent).
L'inscription par e-mail (seul formulaire d'inscription par e-mail du produit) est extraite dans `InscriptionParEmail`
et reste joignable depuis la connexion (« S'inscrire », ou `?voie=inscription` du tunnel de réservation) jusqu'à TCK-2606.

**Comment.**
- `login/page.tsx` est un composant serveur : il lit `searchParams`, ne garde l'action que dans la liste fermée, et lit
  le bien par `bienQuitte` (`lib/queries/bien-quitte.ts`) — la lecture PARTAGÉE de la fiche (`getProperty`, même cache),
  réduite côté serveur aux huit champs que l'écran montre. Le slug vient de `redirect` filtré par `destinationInterne`
  puis par la forme d'un slug ; aucun texte de l'URL n'est affiché.
- Les six cases sont UN seul champ réel, transparent, posé sur six cases de présentation (`CasesDuCode`) : le
  remplissage du SMS, le collage et le lecteur d'écran voient un champ de 6 chiffres. L'envoi part au passage à six
  chiffres, une fois : verrou synchrone (`verificationEnCours`, une ref) en plus de `disabled` — un envoi du formulaire
  dans le même instant que le sixième chiffre (SMS rempli puis « OK ») passait avant le rendu qui désactive le bouton.
- Au téléphone, « Recevoir un code » / « Me connecter » vivent dans une barre FIXÉE à `bottom: <clavier>`
  (`useDecalageDuClavier`), avec une cale de 72 px dans le flux. Collante dans le formulaire, elle suivait le
  contenu et flottait à 90 px au-dessus du pavé sur un écran court ; le pied de la coque ne convient pas, le bureau
  pose le bouton AVANT les autres voies.
- `PhoneInput` reçoit `taille="grand"` (56 px au téléphone, 16 px au bureau) et `aideNationale` (l'aide de l'indicatif
  dite autrement, SANS toucher l'aide internationale qu'un « + » appelle). `CodeDePreproduction` reçoit `forme="ligne"`
  (la rangée de la maquette) ; le bandeau reste la forme des douze autres écrans. Les deux sont dans la clôture de
  `/app` : tailles par jetons (`text-ui`, `text-legende`, `text-action`, `tracking-surtitre`), jamais en px.
- L'agence du bien (`agency.name`, public) dit « Avec … » au bureau et « Votre demande de … part chez … » sur l'écran
  du code ; sans agence, « Retour à l'annonce, là où vous en étiez ».
- `CoqueDEntree` (TCK-2598) reçoit `enTete` (remplace la barre du téléphone), `panneau` (45 % à gauche dès `lg`,
  avec la barre de la colonne de droite) et `retourBureau`. Le panneau paraît dès 1024 et non dès 1280 (« Bureau
  (≥ 1280 px) » ci-dessus) : décision réversible, signalée — il est fluide (45 %), la colonne garde 400 px, rien ne
  déborde, et c'est le seuil de la coque de TCK-2598 ; le passer à `xl:` ne toucherait que `CoqueDEntree`.

**Ce que la prémisse ne disait pas.** `PublicPropertyController::show()` ignore `fields[]` : la réduction se fait côté
serveur, pas par l'URL (l'ajouter aurait séparé le cache de celui de la fiche). Une demande de visite ne porte AUCUNE
date avant la connexion (seul le retour du tunnel de réservation porte `debut`/`fin`, TCK-589) : la date de la
maquette a-0 est une donnée absente. Aucun délai de réponse d'agence n'existe nulle part.

**Mesures** (2026-11-13, base de démo, visiteur sans compte, `request-code` et `verify-code` bloqués au réseau et la
demande de code servie dans la page : aucun SMS, aucune requête autre que GET dans les relevés).
- AC1 — depuis la vraie fiche (`/fr/properties/micro-studio-10m2-GXNq`, 390 et 1280), sans compte : « Déposer mon
  dossier » → « Se connecter » de la boîte → `/auth/login?redirect=…%3Faction%3Dreserver&intention=candidature`, qui
  montre « Votre candidature », « Micro Studio 10m² », « 500 000 F CFA / mois » et la photo du bien (mêmes que la
  fiche). « Réserver » (location à la nuit ou à la semaine) N'EST PAS mesurable sur la démo : ses 143 biens publics
  sont 73 locations au mois et 70 ventes ; ce chemin est gardé par `PropertyReservationDialog.intention.test.tsx`.
  Le seul non-GET des relevés de la fiche est `POST /api/public/properties/…/view`, le compteur de vues que la fiche
  envoie à chaque visite.
- AC3 — écran du code, 390 et 1280, verify-code servi dans la page (422) : six chiffres saisis un à un → **1** appel
  de `verify-code` ; les six cases restent (6 sur 6 en rouge, valeur gardée) et le message dit « Code incorrect ou
  expiré. Vérifiez-le, ou demandez-en un nouveau. ». Compté au `fetch` de la page : l'appel ne quitte pas la page.
- AC4 — `curl` sans identifiant : `GET /auth/register?redirect=%2Fpublish` → **307** vers
  `/auth/login?redirect=%2Fpublish` ; l'intention suit (`&intention=visite` gardé). Le retour à `/publish` après le
  code : test seulement (aucun code n'est vérifié sur la démo).
- AC2 — 390 × 844, clavier émulé de 336 px (zone visible 508) : « Recevoir un code » de 448 à 496, entier, avec et
  sans intention. Avec le pavé de la maquette (236 px) : 548 à 596, la position de la maquette (535/548).
- AC-F2 (conformes · écarts · absents produit · absents maquette · % pixels) : a-0 téléphone 16 · 3 · 0 · 4 · 32,68 ;
  a-1 téléphone 0 · 16 · 1 · 3 · 41,88 ; a-2 téléphone 16 · 2 · 0 · 2 · 17,53 ; a-0 bureau 33 · 9 · 4 · 0 · 40,58 ;
  a-1 bureau 1 · 34 · 8 · 0 · 48,59 ; a-2 bureau 41 · 11 · 0 · 1 · 1,97. Les pourcentages de a-0 sont la PHOTO du
  bien (une donnée) ; ceux de a-1, la photo de ville que le porteur n'a pas fournie (même écart que TCK-2598).
  Chaque écart restant est au tableau `ecarts_acceptes` de la fiche (18 lignes).
- AC-F4 — a-2 au bureau, zones explicites : titre, « Modifier », cases et aperçu 0,01 % ; « Me connecter » et l'aide
  0 % ; la ligne du décompte 3,54 % — attribués au lissage sous-pixel par INFÉRENCE (mêmes y, corps, graisse, couleur ; le
  lissage n'est pas mesuré).
- AC-F6 à 1280 contre la maquette « bureau 1280 » de la visionneuse : a-0 11 · 5 · 3 · 44,91 % ; a-2 12 · 9 · 2 ·
  8,19 %. Écarts : la pastille « Retour à l'annonce » (44 px, accepté), « Ton/Votre numéro » (vouvoiement), et sur
  a-2 le panneau de reprise 171 px plus haut — la maquette centre dans un cadre de 1 220 px, le produit dans la
  fenêtre de 900 (accepté, fiche).
- AC-F6 — aucun défilement horizontal (`scrollWidth − innerWidth = 0`) à 1280, 1024 et 768, avec et sans intention,
  écran du code compris. À 768 : panneau caché, colonne de 480 px centrée, bouton de la barre aligné sur elle (x 144,
  480). À 1024 : panneau fluide de 45 % (461 px), colonne de 400 px — aucune piste fixe ni panneau de 480 px.

**Tests** : `porte-par-numero.tck-2604.test.tsx` (29), `PropertyReservationDialog.intention.test.tsx` (+1), `bien-quitte.tck-2604.test.ts` (4), `lien-connexion.test.ts`
(13) ; les tests d'auth existants passent sur la nouvelle porte (libellé « Votre numéro », envoi au sixième chiffre).
`promesses-de-delai.test.ts` : « Valable 5 minutes » (`auth.porte.code.valable`) entre au registre, adossé à `CODE_TTL_SECONDS` (chiffre tenu : 5), à la place de `auth.phoneLogin.codeSentTo` retirée.
Ablations (chacune rougit son test, restaurée au md5) : verrou synchrone, `codeRefuse`, liste fermée, forme du slug,
forme et ordre des dates, l'entrée du registre des délais, retrait de Google sur échec, intention gardée par `/auth/register`, `aideNationale`,
l'agence lue et dite, le prix nul, `apply` → `candidature`, l'étape « part chez » d'une candidature.

**2026-11-13 — commité avec TCK-2606** (la voie e-mail branchée sur la même porte). Avant le commit, deux gardes : les
encres translucides de la porte (`text-foreground/75` des étapes du bureau, `/40` du bouton désactivé, `/60` de l'indicatif)
deviennent l'encre douce opaque `text-muted-foreground` (`encre-sans-alpha.contraste.test.ts`, TCK-658 ; écarts de couleur
acceptés dans `TCK-2604.json`), et le chiffre du code passe de `text-[26px]` au jeton `text-affiche-26`
(`check-valeurs-arbitraires-app` : `CasesDuCode` sert aussi la signature sur place de l'état des lieux, dans `/app`).
