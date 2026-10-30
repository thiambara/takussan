# ADR-0079 — Un annonceur d'accord qui ne veut pas de compte peut confier la diffusion de ses biens à Takussan, derrière un drapeau éteint

- **Statut** : Accepté (principe) le 2026-10-30 par le porteur — `radar_mandate` reste éteint jusqu'à l'avis de l'avocat, la livraison de TCK-2421 et celle de TCK-2422 (article des CGU et mention publique)
- **Date** : 2026-10-30
- **Tickets** : TCK-2394 (mise en œuvre, drapeau éteint) ; suites : TCK-2421 (reprise des biens par
  l'annonceur), TCK-2422 (article des CGU et mention publique, avec l'acceptation)
- **Dépend de** : [ADR-0077](0077-le-radar.md) (le Radar)

> ⚠ **Accepté sur le principe, pas allumé.** Rédigé de nuit par un agent, sur la consigne du porteur de
> choisir la forme la moins restrictive, documentée, réversible et derrière une configuration ; accepté
> sur le principe par le porteur le 2026-10-30. Le code existe, **éteint** : rien ne se publie sous
> mandat tant que le drapeau `radar_mandate` n'est pas allumé, ce qui attend l'avis de l'avocat (dont
> la relecture de `mandat.v1`), la livraison de TCK-2421 (reprise des biens par l'annonceur) et celle
> de TCK-2422 (article des CGU et mention publique).

## Contexte

L'arbitrage n° 2 du [plan](../plans/2026-10-26-radar-et-socle-ia.md) (2026-10-26) range la
propriété d'un bien publié par le Radar en trois cas : **réclamé** par l'annonceur par défaut,
**publié par Takussan pour lui** sur accord, et **« mandat Takussan en repli plus tard »**. Les deux
premiers existent (TCK-2389, TCK-2390). Le troisième n'est défini nulle part.

Mesuré sur `dev` + TCK-2391 le 2026-10-30 :

- **Le message d'accord couvre déjà une publication par Takussan.** Le texte en vigueur est
  `accord.v3` (TCK-2395 : `accord.v2` précédé de « Takussan — », clauses identiques mot pour mot ;
  `ConsentMessageComposer::CLAUSES_VERSION`) ; les accords déjà recueillis portent `accord.v2`. Les
  deux font dire à l'annonceur qu'il autorise Takussan « à publier votre ou vos annonces sur
  takussan.com, avec leurs textes et leurs photos » (clause 1), qu'il est autorisé à les proposer
  (clause 2) et que les visiteurs le contactent directement à ce numéro (clause 4). La clause 3 —
  « un compte soit créé à votre nom » — est la seule dont le mandat se passe.
- **« Publier pour lui » crée toujours un compte** (ADR-0077 § 6) et le refuse sur un numéro déjà
  inscrit. L'annonceur qui dit « oui, publiez, mais je ne veux pas de compte » n'a aucune voie.
- **Les CGU disent le contraire d'un mandat.** Article 1 : « ${marque} agit comme un intermédiaire
  technique. *Sauf mention expresse contraire*, nous ne sommes ni propriétaire, ni bailleur, ni
  vendeur, ni mandataire immobilier des biens présentés ». La réserve « sauf mention expresse »
  laisse la porte ouverte, à condition que la mention existe.
- **La révocation et la purge suivent `radar_listings.property_id`**, pas le compte
  (`AdvertiserRevocation`, `RadarPurger`) : un bien publié ailleurs que dans un espace individuel
  en relève sans changement.
- **Un drapeau de la console s'allume par environnement, sans déploiement** : catalogue `Flag`,
  `FeatureFlagEvaluator` (absent de la base ⇒ éteint).

## Décision

**Sur un accord valide, et seulement drapeau `radar_mandate` allumé, le `super_admin` peut publier
les annonces d'un annonceur dans un espace que Takussan tient, sans créer de compte : c'est la
publication sous mandat. Rien d'autre ne change dans le Radar.**

1. **Le « mandat » est l'autorisation de publier que l'accord donne déjà**, exercée par Takussan
   dans son propre espace au lieu d'un espace créé au nom de l'annonceur. Aucun message, aucune
   preuve et aucune clause nouvelle : la preuve est celle de l'accord (ADR-0077 § 3), relue sous
   verrou comme pour « publier pour lui ». ⚠ À faire confirmer par l'avocat : la clause 1 suffit-elle
   sans la clause 3 ?

2. **L'espace des mandats est un espace existant, désigné par la console** : réglage plateforme
   `radar.mandate_agency_id` (0 : aucun). Le porteur le crée comme tout espace, puis le désigne.
   Les biens y naissent avec son administrateur principal pour auteur ; **le numéro de l'annonceur
   est le contact sur place** (`property_contacts`), comme pour « publier pour lui ». Le quota
   d'annonces de cet espace s'applique.

   **Qui reçoit quoi** (vérification adverse I3, mesuré) : le téléphone et le WhatsApp affichés
   sur la fiche sont **ceux de l'annonceur** — le visiteur le joint directement. Une demande laissée
   par **formulaire** (`contact-lead`) va, elle, à l'**administrateur de l'espace des mandats**
   (`ContactLeadService::forProperty()` : le contact principal, sinon les lecteurs de l'agence) :
   Takussan la reçoit et la transmet à l'annonceur. **Aucun relais automatique n'est construit** :
   la transmission est un geste humain. Sans profil d'administrateur dans l'espace des mandats, le
   formulaire refuse (409 `lead.contact_unavailable`) : l'espace des mandats **doit avoir un
   administrateur principal**, ce qui est déjà un prérequis de sa désignation. ⚠ À faire confirmer
   par l'avocat : la clause 4 (« directement à ce numéro ») suffit-elle quand le formulaire passe par
   Takussan ?

3. **Les gardes sont celles de « publier pour lui »** — accord valide couvrant chaque annonce,
   étape `consented`, réserve de photos prête, champs requis, plafond de photos, STOP, prise en
   charge, `super_admin` seul, transaction unique, idempotence — **moins celles du compte** : ni
   numéro déjà inscrit (on ne touche à aucun compte), ni connexion par téléphone exigée (on ne
   promet aucune activation).

4. **Deux états ne se mêlent pas.** Un annonceur déjà rattaché à un compte ne se publie pas sous
   mandat (`radar.mandate.account_exists`) ; un annonceur sous mandat ne se publie plus « pour lui »
   (`radar.publish.under_mandate`). Passer de l'un à l'autre est TCK-2421.

   **La réclamation par le lien est fermée sous mandat** (vérification adverse I1) : le lien du
   message d'accord ne publie rien dans un compte pour un annonceur sous mandat — ni code SMS
   (`sendCode`), ni confirmation, ni publication réclamée par le job — et répond 409
   `radar.claim.under_mandate`. Le jugement qui fait foi est rendu **sous le même verrou** que les
   autres gardes de la réclamation (`RadarClaims::claim()`, `RadarPublisher::publishClaimed()`).
   Sans cette fermeture, l'annonceur se retrouverait avec ses biens à la fois sous mandat et dans son
   compte. **TCK-2421 lève ce blocage** en organisant la reprise ; **TCK-2421 est donc un prérequis
   de l'allumage de `radar_mandate`**.

5. **Le second message est `mandat.v1`** : les biens sont en ligne ; le numéro affiché est le sien,
   on l'appelle ou lui écrit sur WhatsApp directement ; les demandes du formulaire arrivent à
   Takussan, qui les lui transmet ; STOP pour les retirer. Il ne porte aucun lien d'activation,
   puisqu'il n'y a pas de compte. ⚠ Texte à faire relire par l'avocat avant l'allumage.

6. **Le drapeau est l'interrupteur, et il est éteint.** Aucune migration ne l'allume. Éteint, l'API
   refuse `publish-mandate` (`radar.mandate.disabled`) sans rien écrire, et l'aperçu ne propose
   rien. L'éteindre plus tard n'efface rien : les biens déjà publiés restent, sous la même
   révocation.

7. **La révocation et la purge ne changent pas** (ADR-0077 § 8, § 9) : un STOP retire les biens
   sous mandat du public sur-le-champ.

## Les textes, à poser avant l'allumage, après l'avis de l'avocat (TCK-2422)

**CGU, nouvel article 6.4 — rédaction de départ, ⚠ à relire par l'avocat :**

> ## 6.4 Annonces diffusées par ${EDITEUR.marque} pour votre compte
>
> Si vous acceptez que nous publiions vos annonces (article 6.3) sans souhaiter de compte,
> ${EDITEUR.marque} peut les diffuser elle-même, pour votre compte, depuis son propre espace. Elle
> agit alors comme diffuseur des annonces que vous lui avez confiées, et seulement de celles-là : vous
> restez seul responsable de leur contenu (article 6.1) et seul partie à tout contrat conclu avec un
> visiteur, qui vous contacte directement à votre numéro ; les demandes laissées par le formulaire du
> site nous parviennent, et nous vous les transmettons. Vous pouvez y mettre fin à tout moment, en
> répondant « STOP » ou en nous écrivant : vos annonces sont retirées sans délai.

**Fiche publique** d'un bien sous mandat : « Annonce diffusée par ${EDITEUR.marque} pour le compte de
son annonceur ». C'est la « mention expresse contraire » de l'article 1.

## Conséquences

- **Le porteur garde toutes les portes** : le code existe, éteint ; l'allumer est un geste de
  console par environnement, l'éteindre aussi.
- **Takussan devient diffuseur pour le compte d'un tiers** pour ces seuls biens. C'est un
  changement de posture juridique : il ne s'allume qu'avec l'article 6.4, la mention publique et la
  relecture de l'avocat (TCK-2422).
- **Le compte ne naît pas** : le mandat ne fait pas d'utilisateurs. ADR-0077 voyait dans chaque
  publication « un compte à activer » ; le mandat assume de ne pas en créer, pour ne pas perdre
  l'annonce.
- **Les biens sous mandat comptent dans le quota de l'espace des mandats** : son offre doit le
  permettre, sinon `quota.listings_exceeded`.
- **Un annonceur sous mandat qui veut ensuite un compte** reprend ses biens dans son espace par le
  lien de réclamation (TCK-2421, amendement « la reprise » ci-dessous).
- **Takussan reçoit les demandes par formulaire** de ces biens et doit les transmettre à la main :
  une charge d'exploitation, que le volume rendra visible.

## Application

- `App\Services\Radar\RadarMandate` (drapeau, espace, ce qui bloque) ;
  `RadarPublisher::publishUnderMandate()` ; route `POST /api/admin/radar/advertisers/{id}/publish-mandate`.
- Tests : « drapeau éteint, `publish-mandate` refuse et n'écrit rien » (AC2 de TCK-2394) ; « aucun
  compte créé, contact = numéro de l'annonceur » ; « la révocation retire les biens sous mandat » ;
  les gardes de « publier pour lui » une à une sous mandat ; « la demande par formulaire va à
  l'administrateur de l'espace des mandats, 409 sans lui » ; « sous mandat, la réclamation par le
  lien est refusée, avant le SMS et sous le verrou » (`RadarClaimTest`,
  `PublishClaimedRadarListingsTest`).
- Prérequis du porteur avant d'allumer : accepter cet ADR (fait sur le principe le 2026-10-30), faire **TCK-2421** (qui lève la fermeture
  de la réclamation) et **TCK-2422**, faire relire `mandat.v1` par l'avocat, créer l'espace des
  mandats avec un administrateur principal et le désigner dans la console.

## Amendement du 2026-10-30 — la reprise des biens par l'annonceur (TCK-2421)

Le porteur a accepté cet ADR sur le principe le 2026-10-30 (réponse A2) ; `radar_mandate` reste éteint
jusqu'à l'avis de l'avocat et la livraison de TCK-2421. Cet amendement lève la fermeture du § 4
(« la réclamation par le lien est fermée sous mandat ») et précise le § 5. Mesuré sur `dev`
9f7bffea9.

1. **Le code de la réclamation est la reprise.** L'annonceur sous mandat qui vérifie son numéro par
   le lien de réclamation (ADR-0077 § 3, TCK-2390) reprend ses biens dans SON espace : celui que la
   réclamation lui ouvre ou qu'il a déjà. Aucun autre chemin ne transfère : ni l'opérateur, ni un
   compte qui n'a pas vérifié ce numéro (`RadarClaims::claim()`, seul appelant de
   `RadarMandateTakeBack::takeBack()`). Le drapeau éteint après coup ne ferme pas la reprise : elle
   est la sortie du mandat.
2. **Une transaction, sous le verrou de l'annonceur**, celle de la réclamation : le compte, la preuve
   `otp`, les annonces réclamées et les biens repris passent ensemble, ou rien. Le mandat se relit
   sous ce verrou. Il n'existe donc jamais d'état mêlé mandat + compte : l'annonceur n'est rattaché à
   son compte qu'une fois ses biens dans son espace.
3. **Les mêmes biens** : ni republication, ni perte. Suivent le bien : l'espace et le titulaire
   (journal du modèle coupé, ADR-0059 § 4), ses demandes et ses clics (l'espace, et lui pour
   destinataire), ses visites, ses conversations (transmises après le commit à son nouveau contact
   principal, lui : l'ancien répondant, titulaire ou collaborateur, quitte le fil — TCK-888,
   ADR-0068 § 3), ses empreintes de photos, et le compteur `properties_count` des deux espaces. Ses vues et son contact (son numéro) ne bougent pas. Restent dans l'espace
   des mandats : ses prospects (le lien d'une demande ou d'une visite reprise vers un prospect de
   l'espace des mandats est retiré) et ses collaborateurs (retirés du bien). Aucun quota n'est rejugé :
   les biens existent déjà.
4. **Un bien qui porte de la gestion renvoie au support** — réservation, bail, facture de
   prestataire, mise en avant, demande de maintenance, état des lieux, flux de calendrier, ou un lot : la page dit
   `mandate_support` et le code n'est pas envoyé (409 `radar.claim.mandate_support_required`).
5. **`mandate_at` reste comme trace ; la reprise se date** (`radar_advertisers.mandate_taken_back_at`).
   « Sous mandat », c'est `mandate_at` posé et `mandate_taken_back_at` nul
   (`RadarAdvertiser::underMandate()`) : une colonne et non `user_id`, pour qu'un compte délié après
   la reprise (`AdvertiserAccountRelease`) ne remette pas l'annonceur sous mandat. Un nouveau mandat
   après une reprise ouvre une période neuve. Sur le bien, `metadata.radar_mandate` passe à faux.
6. **Le second message suit l'état.** Sous mandat, il devient `mandat.v2` : le texte de `mandat.v1`
   plus le lien de réclamation, par lequel l'annonceur reprend ses biens. Si ce lien ne s'ouvrirait pas
   (connexion par téléphone éteinte, aperçu des codes actif), le message reste `mandat.v1`, sans lien.
   Repris, l'annonceur reçoit le message des biens en ligne (`publie.v2`). ⚠ `mandat.v2` est à faire
   relire par l'avocat avec `mandat.v1`.
7. **Un espace suspendu refuse la reprise**, comme la publication d'une réclamation
   (`RadarPublisher::publishClaimed()`) : ses biens y quitteraient le public. Refus 409
   `radar.claim.space_suspended` à l'envoi du code, à la confirmation, et rejugé sous verrou dans la
   reprise ; les biens restent sous mandat, en ligne, jusqu'au rétablissement de l'espace.
   ⚠ Décision prise en autonomie (vérification adverse I2), à revoir par le porteur.

Aucun relais automatique des formulaires vers l'annonceur sous mandat (réponse B6 du porteur) : la
reprise est la voie par laquelle il reçoit lui-même ses demandes.
