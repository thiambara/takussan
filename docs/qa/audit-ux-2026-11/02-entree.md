# Famille 2 — Entrée : connexion, inscription, onboarding, publication

> Audit du 2026-11-10 sur `dev` (1bce3798a). Méthode et limites : [README](README.md).
> Personas : `anon`, `proprietaire` (owner1@dakarimmo.sn), comptes neufs créés pour l'audit
> (`audit-ux-*@exemple.test`). Bureau 1440 × 900, téléphone 390 × 844 tactile. Captures :
> `scratchpad/audit-app/captures/f2/` (hors dépôt).

*Pages de la famille :*

1. Connexion — `/auth/login` (e-mail, téléphone, second facteur, OAuth)
2. Inscription — `/auth/register`
3. Mot de passe oublié et réinitialisation — `/auth/forgot-password`, `/auth/reset-password`
4. Vérification de l'adresse — `/auth/verify-email`, `/auth/verify-email/[id]/[hash]`
5. Retour OAuth — `/auth/oauth/[provider]/callback`
6. L'aiguillage d'après connexion — `/onboarding/intention`
7. Les assistants de profil — `/onboarding/{owner,agent,agency-admin,host,service-provider}`
8. Sécurité du compte à l'entrée — `/onboarding/securite`
9. Invitation d'agence — `/invitations/accept`
10. Publier un bien — `/publish`
11. Vérification indisponible — `/verification-indisponible`

> **Limite de l'outil de mesure, à connaître avant de lire une capture.** L'API n'autorise en CORS
> que l'origine `http://localhost:3000`. Ouverte sur `http://127.0.0.1:3000`, la connexion affiche
> « Impossible de charger les fournisseurs d'authentification » et cache la connexion par téléphone
> (le drapeau `phone_login` est lu par le navigateur). Toutes les captures de cette famille sont
> prises sur `localhost` ; l'état d'erreur n'est retenu que pour son libellé (§ 1, P3).

**Qui vient ici, et pour quoi.** La famille 2 est la porte. Quatre publics la franchissent, et
aucun n'y vient pour elle :

- **le chercheur** qui veut faire une chose précise — enregistrer un favori, demander une visite,
  suivre un dossier — et à qui l'on demande un compte au milieu du geste ;
- **le propriétaire particulier** qui a cliqué « Publier » : c'est **l'acquisition d'offre**, la
  seule page du produit qui fabrique le stock que tout le reste vend ;
- **l'invité** d'une agence (bailleur, agent, prestataire), arrivé par un e-mail ou un SMS, qui ne
  connaît pas Takussan et doit faire confiance à un lien ;
- **le professionnel** (agent, agence) qui veut s'installer — il n'a aujourd'hui aucune porte à
  lui (§ 6).

**La mesure de succès de la famille est le temps jusqu'au premier geste utile** : la visite
demandée, le favori posé, le bien en ligne, le premier écran de `/app` qui sert à quelque chose.
Chaque écran ci-dessous se juge au nombre d'écrans et de champs qu'il ajoute avant ce geste.

### Les parcours mesurés (téléphone, 2026-11-10)

| Parcours | Écrans jusqu'au but | Saisies obligatoires | Mesuré par |
|---|---|---|---|
| **Inscription par téléphone** → orientation | numéro → code → prénom → orientation → destination : **4 écrans** | 3 (numéro, code, prénom) + 1 choix | compte 174 créé au navigateur (`tel-complet-m`) |
| **Inscription par e-mail** → orientation | formulaire → « Vérifiez votre adresse » → orientation : **3 écrans** | **6** (prénom, nom, e-mail, mot de passe, confirmation, case CGU) | `register-email-m`, code `register/page.tsx` |
| **« Publier » anonyme → bien en ligne** | connexion (numéro) → code → prénom → « Création de votre espace… » → **modale de bienvenue (3 diapositives)** → assistant de 6 écrans (type, lieu, caractéristiques, prix, photos, titre) : **11 écrans** | 8 (numéro, code, prénom, contrat, type, ville, prix, titre) + 3 gestes de modale | `publish-anon-m`, `publish-neuf-m`, `nouveau-bien-m`, `wiz-fin-m` |
| **Invitation de bailleur** → premier écran de `/app` | invitation (prénom, nom, mot de passe) → assistant de 4 étapes (téléphone + code, pièces, tour de 3 diapositives, biens) → `/app` → **la même visite guidée, une seconde fois, en modale** : **7 écrans** | 5 (prénom, mot de passe, numéro, code, case du tour) | compte `audit-ux-f2-proprio` créé par une vraie invitation de Dakar Immo (`owner-wiz1-m` → `owner-fin-m`) |

Le bien n'a pas été publié pour de bon (il serait apparu dans la base de démo que les autres familles
auditent) : l'assistant a été parcouru jusqu'à son dernier écran, la suite est lue dans le code
(`PropertyWizard.tsx:401-430` : publication, toast, `/app/properties/{id}`).

---

## 1. Connexion — `/auth/login`

**Rôle business.** Rendre la main en moins de trente secondes, **et rendre la main là où on
l'avait prise** : la fiche, la visite, la publication. Une connexion ratée ici n'est pas une
connexion ratée, c'est une visite ou une annonce perdue.

**Fonctions existantes — à garder**

- Deux voies : **numéro + code SMS en tête** quand l'API la propose (`phone_login`), e-mail + mot de
  passe en voie secondaire ; bascule dans les deux sens (`login/page.tsx:177-193, 357-369`).
- Voie téléphone (`ConnexionParTelephone.tsx`) : indicatif +221 posé hors du champ et expliqué,
  numéro étranger par « + » ; code à 6 chiffres valable 5 min ; **renvoi avec compte à rebours**
  (60 s), **changer de numéro** ; étape « conditions » pour un compte né du Radar
  (`requires_terms`), étape second facteur ; messages distincts pour verrou (423), compte suspendu,
  trop de demandes (429), numéro invalide (422), code faux ; **code affiché à l'écran hors
  production** (« Environnement de test », « Utiliser ce code ») ; mention des CGU sous le champ.
- Le compte se **crée au premier code** d'un numéro inconnu : la connexion par téléphone est aussi
  une inscription.
- Google (bouton n'apparaît que si le fournisseur est configuré ; Facebook et Apple restent cachés,
  non configurés) ; l'intention (`?redirect=`) est mémorisée avant le départ chez Google.
- Voie e-mail : afficher / masquer le mot de passe, « Mot de passe oublié ? », bandeau de succès
  après réinitialisation (`?reset=1`), trois messages d'échec OAuth lus dans l'URL.
- Second facteur après le mot de passe : code d'application **ou** code de récupération (bascule),
  « Annuler » ; filtrage des caractères au fil de la frappe.
- Sortie unique vers `/onboarding/intention?redirect=…` (TCK-624), filtre anti-redirection ouverte
  partagé ; le lien « S'inscrire » transporte la même intention.
- « Retour » vers la page publique quittée (mémorisée ou dans l'historique, `RetourAuth.tsx`),
  logo qui ramène à l'accueil, arrivée en haut de page, session périmée nettoyée à l'arrivée
  (`ReinitialiserSessionClient`), `noindex`, titre d'onglet traduit.

**Ce qui marche**

- **Le téléphone en premier, sans mot de passe** : c'est le bon choix pour le Sénégal, et
  l'indicatif pré-posé et expliqué évite l'erreur la plus fréquente (le `0` national).
- Le code s'obtient et se colle en un geste ; l'erreur dit quoi faire (« Vérifiez-le, ou
  demandez-en un nouveau »).
- L'intention survit à tous les chemins (téléphone, e-mail, Google, inscription) : c'est mesuré par
  `login-retour-a-l-origine.test.tsx` et `inscription-intention.test.tsx`, et vu au navigateur
  (`?redirect=/publish` ramène à `/publish`).

**Constats**

| Sév. | Où | Constat |
|---|---|---|
| P1 | les deux | **L'écran ne dit jamais pourquoi on est là.** Arrivé de « Publier » (`/auth/login?redirect=/publish`), de « Demander une visite » ou d'un favori, le visiteur lit « Connectez-vous avec votre numéro » — ou « Content de vous revoir » en voie e-mail, à quelqu'un qui n'a jamais eu de compte. L'intention est transportée par l'URL mais **invisible** : rien ne rappelle le bien, l'action, ni ce qui suit. C'est l'écran où l'on perd le propriétaire qui vient publier. |
| P1 | les deux | **Connexion et inscription sont le même écran sous deux titres.** En voie téléphone, les deux pages ont le même champ, le même bouton et le même effet (le compte naît au premier code) ; seul le titre change. Le visiteur doit choisir entre « Se connecter » et « S'inscrire » pour rien, et le lien « Pas encore de compte ? S'inscrire » l'envoie sur un écran identique. |
| P2 | téléphone (voie téléphone) | **Séparateur « OU CONTINUER AVEC EMAIL » posé au-dessus du bouton Google** (`login-m`, `oauth-m`) : la voie e-mail est le lien juste au-dessus. Le séparateur vient d'`OAuthButtons` (`separator="before"`, libellé par défaut `auth.oauth.separator`). |
| P2 | téléphone | **Le bandeau photo prend 28 % de la hauteur** (236 px) : le titre commence à 220 px, le bouton « Recevoir un code » finit à 594 px. Clavier ouvert (~336 px sur un iPhone), le bouton passe sous le clavier dès qu'on touche le champ. |
| P2 | bureau | **45 % de l'écran pour une villa à piscine** d'Unsplash et un slogan (« Des milliers de biens… ») : décor générique au moment où l'on pourrait montrer **le bien** que le visiteur regardait, ou la raison de publier. |
| P2 | code | Le bouton du code s'appelle **« Valider »** — la charte l'interdit (§ Ton : « jamais OK, Valider »). « Me connecter » / « Créer mon compte » selon l'issue. |
| P3 | les deux | Le chargement des fournisseurs reste une pilule grise vide (« Chargement des fournisseurs… » en texte caché) ; en échec, « Impossible de charger les fournisseurs d'authentification » est du jargon. Un échec doit simplement retirer le bouton Google. |
| P3 | les deux | Après un échec Google, le message propose « connectez-vous avec votre email » alors que l'écran est en voie téléphone (`oauth-code-m`). |
| P3 | les deux | Vouvoiement ici, tutoiement sur le site public (charte § Ton ; même constat famille 1, transversal 9). |
| P3 | les deux | Liens « conditions générales » et « politique de confidentialité » à 16 px de haut (liens en ligne, tolérés). |

**Proposition — mobile** — *une seule porte, qui dit d'où l'on vient*

```
┌──────────────────────────────────────┐
│ ←                         TAKUSSAN   │  ← plus de bandeau photo : 56 px
├──────────────────────────────────────┤
│ ┌──────────────────────────────────┐ │
│ │ [img] Studio meublé · Mermoz     │ │  ← « carte d'intention » : ce qu'on
│ │       250 000 F/mois             │ │     allait faire (bien, visite,
│ │  Pour demander la visite, entre  │ │     favori, publication)
│ │  ton numéro. 30 secondes.        │ │
│ └──────────────────────────────────┘ │
│ Ton numéro                           │
│ [ +221 | 77 123 45 67            ]   │
│ Nouveau ou déjà inscrit : un code    │
│ par SMS suffit.                      │
│ [        Recevoir un code         ]  │  ← reste au-dessus du clavier
│ ──────────── ou ────────────         │
│ [ G  Continuer avec Google        ]  │
│ Utiliser un e-mail et un mot de passe│
│ En continuant, tu acceptes les CGU…  │
└──────────────────────────────────────┘
```

- **Une seule route d'entrée** (`/auth` ou `/auth/login`, `/auth/register` redirigeant) : le titre
  dit « Entre ton numéro », le sous-titre « Nouveau ou déjà inscrit, un code par SMS suffit ». Le
  lien « S'inscrire » disparaît de la voie téléphone ; il reste sur la voie e-mail.
- **La carte d'intention** lit `redirect` : un bien (`/properties/<slug>` → vignette, titre, prix),
  `/publish` (« Publier ton bien : gratuit, 5 minutes, en ligne aujourd'hui »), un favori, une
  alerte. Sans intention, rien — pas de slogan.
- L'écran du code : six cases ou un champ large, **remplissage automatique du SMS**
  (`autocomplete="one-time-code"` existe déjà), envoi automatique au sixième chiffre, bouton
  « Me connecter ». Le numéro saisi est rappelé en titre (« Code envoyé au 77 123 45 67 · Modifier »).
- Bouton principal **collé au-dessus du clavier** (`visualViewport`) sur les deux écrans.

**Proposition — bureau**

- Garder les deux colonnes, mais **le panneau de gauche porte l'intention** : la photo et le prix du
  bien, ou, pour « Publier », trois chiffres vrais (« 1 240 recherches à Dakar cette semaine ·
  annonces gratuites · un code SMS suffit »). Sans intention, une photo de Dakar plutôt qu'une villa
  à piscine.
- Formulaire inchangé ailleurs ; le séparateur dit « ou ».

**Ambition**

- **Connexion sans quitter la page** : pour une action en un geste (favori, alerte, « me prévenir »),
  une feuille par-dessus la fiche — numéro, code, c'est fait — au lieu d'une page de connexion.
  C'est le modèle des places de marché mobiles : le compte naît pendant l'action, pas avant.
- **Connexion par WhatsApp** (code reçu sur WhatsApp, déjà prévu en P3 dans `features.md` § 2.3) :
  au Sénégal, c'est le canal qui arrive, et il ne coûte pas un SMS.

---

## 2. Inscription — `/auth/register`

**Rôle business.** Créer le compte qui portera un favori, une visite, une annonce. Chaque champ
de plus est un compte de moins.

**Fonctions existantes — à garder**

- Voie téléphone identique à la connexion (variante « register » : titre « Créez votre compte avec
  votre numéro ») ; un compte neuf part vers l'orientation, un compte existant vers la destination
  (`register/page.tsx:91-99`).
- Voie e-mail : prénom, nom, e-mail, mot de passe (règle affichée en indication : « 8 caractères
  minimum, avec une lettre… »), confirmation, **case CGU obligatoire avec liens** ; afficher / masquer
  sur les deux mots de passe ; erreurs de l'API reportées par champ (`useApiForm`).
- Google, avec intention mémorisée ; « Déjà un compte ? Se connecter » transporte l'intention.
- Après la voie e-mail : session ouverte aussitôt (TCK-589), puis `/auth/verify-email?redirect=…`.

**Ce qui marche**

- La voie téléphone ne demande **rien d'autre qu'un numéro** : le prénom vient après, sur un écran
  à lui, et le nom est facultatif. C'est le bon ordre.
- La session s'ouvre sans attendre la vérification de l'adresse : on ne bloque pas un nouveau venu
  derrière sa boîte mail.

**Constats**

| Sév. | Où | Constat |
|---|---|---|
| P1 | les deux | Même constat qu'au § 1 : **écran identique à la connexion en voie téléphone**, et l'intention invisible. |
| P2 | voie e-mail | **Six contrôles** avant le premier geste, dont une **confirmation du mot de passe** que l'œil « afficher » rend inutile, et un **nom obligatoire** que la voie téléphone rend facultatif : deux règles pour le même compte. Sur téléphone, le bouton « Créer mon compte » est à la troisième hauteur d'écran (`register-email-m-2`). |
| P2 | voie e-mail | Le texte d'indication du mot de passe est un *placeholder* tronqué (« 8 caractères minimum, avec une lettr… ») qui disparaît à la frappe : la règle n'est plus lisible quand on en a besoin. L'invitation (§ 9) l'écrit dessous, en aide : c'est la bonne forme. |
| P3 | voie e-mail | « Créez votre compte » + « Rejoignez Takussan et gérez vos recherches et vos biens en toute simplicité » : sous-titre générique, même remarque d'intention qu'au § 1. |

**Proposition — mobile** — fusionnée avec la connexion (§ 1). La voie e-mail, quand on la choisit :
**e-mail, mot de passe (avec l'œil et la règle en aide), case CGU** — trois contrôles ; le prénom
est demandé à l'écran suivant, comme pour le téléphone (`EtapePrenom` existe déjà et sait le faire).

**Proposition — bureau** — idem, une colonne.

**Ambition** — *le compte implicite* : un visiteur qui demande une visite donne déjà son numéro
dans le formulaire de visite. Le code SMS qui confirme la visite peut ouvrir le compte en même
temps — zéro écran d'inscription. L'API sait déjà créer un compte au premier code.

---

## 3. Mot de passe oublié et réinitialisation — `/auth/forgot-password`, `/auth/reset-password`

**Rôle business.** Récupérer un compte e-mail sans passer par le support.

**Fonctions existantes — à garder** : demande par e-mail, réponse identique compte ou non (pas de
fuite d'existence) ; lien signé ; page de réinitialisation qui nomme l'adresse (« Choisissez un
nouveau mot de passe pour … »), nouveau mot de passe + confirmation, retour à la connexion avec
bandeau de succès ; **état « Lien invalide »** sans jeton, avec « Demander un nouveau lien »
(`reset-m`) ; « ← Retour à la connexion ».

**Ce qui marche** : l'état d'erreur existe et propose la seule issue utile ; l'adresse est rappelée
sur l'écran du nouveau mot de passe.

**Constats**

| Sév. | Où | Constat |
|---|---|---|
| P2 | les deux | **Aucune mention de la connexion par code SMS.** La personne qui a oublié son mot de passe et a un numéro vérifié peut se connecter tout de suite sans rien réinitialiser ; l'écran l'envoie attendre un e-mail. |
| P3 | téléphone | Le formulaire est centré verticalement sous le bandeau : 120 px de vide entre la photo et le titre (`forgot-m`). |
| P3 | les deux | « Envoyer le lien » puis, une fois envoyé, l'écran ne propose ni « Ouvrir ma messagerie » ni le délai de renvoi (lu dans le code : un message de succès seul). |

**Proposition — mobile** : sous le bouton, une ligne « Tu as un numéro sur ton compte ? **Reçois
plutôt un code par SMS** » qui ouvre la connexion par téléphone. Après l'envoi : « Lien envoyé à
a•••@gmail.com · Ouvrir Gmail · Renvoyer dans 60 s ».

**Proposition — bureau** : identique.

---

## 4. Vérification de l'adresse — `/auth/verify-email`, `/auth/verify-email/[id]/[hash]`

**Rôle business.** Garantir qu'une adresse joint bien la personne, sans freiner l'entrée.

**Fonctions existantes — à garder** : écran d'attente après l'inscription par e-mail avec
« Renvoyer l'email de vérification » (succès / échec annoncés) et « Continuer, je vérifierai plus
tard » vers l'orientation, intention transportée ; page du lien : succès (relit le compte en
session, mène à l'orientation ou à la connexion) et échec « Vérification impossible — Ce lien a
expiré ou a déjà servi » avec « Demander un nouveau lien » (passe par la connexion sans session).

**Ce qui marche** : on peut continuer sans vérifier ; l'échec du lien a une issue ; le compte en
session est relu après vérification (TCK-2162).

**Constats**

| Sév. | Où | Constat |
|---|---|---|
| P2 | les deux | **Le bouton plein est « Renvoyer l'email »**, l'issue réelle (« Continuer, je vérifierai plus tard ») est un lien gris dessous (`verify-m`). Juste après l'inscription, le geste attendu est de continuer : l'écran pousse à renvoyer un message qui vient de partir. |
| P2 | les deux | L'écran ne dit pas **à quelle adresse** le message est parti, ni comment la corriger : une faute de frappe à l'inscription n'a pas d'issue ici. |
| P3 | les deux | La page d'attente s'affiche à l'identique pour un compte **déjà vérifié** (mesuré avec `audit-ux-f2-email`, vérifié). |
| P3 | lien | Le succès renvoie vers `/onboarding/intention` **sans** l'intention d'origine : ouvert dans un autre onglet, le lien perd la visite ou la publication en cours. |

**Proposition — mobile** : « Un lien est parti à **awa.diop@gmail.com** » · bouton plein
**« Continuer »** (vers l'intention) · liens « Renvoyer » (avec compte à rebours) et « Corriger
l'adresse ». Un compte déjà vérifié est redirigé.

**Proposition — bureau** : identique.

---

## 5. Retour OAuth — `/auth/oauth/[provider]/callback`

**Rôle business.** Rendre la connexion Google invisible.

**Fonctions existantes — à garder** : écran d'attente « Connexion… », second facteur si le compte
l'exige (`DefiSecondFacteur`), intention mémorisée relue, sortie vers l'orientation, trois erreurs
renvoyées à la connexion (`oauth_invalid` sans code, `oauth_failed` refus ou expiration,
`oauth_unknown`), fournisseur inconnu nommé.

**Ce qui marche** : un retour incomplet ou refusé ramène sur la connexion **avec un message qui dit
ce qui s'est passé** (`oauth-m`, `oauth-code-m`).

**Constats** : P3 — le message propose l'e-mail alors que l'écran est en voie téléphone (§ 1).
Aucune autre remarque : la page est un transit, et elle se comporte comme tel.

---
## 6. L'aiguillage d'après connexion — `/onboarding/intention`

**Rôle business.** La **porte unique de sortie** de l'authentification (TCK-624) : demander ce qui
manque (un prénom), puis — seulement si la destination ne le dit pas déjà — ce que la personne
vient faire, pour l'envoyer au bon endroit. C'est le seul moment où le produit apprend **qui** il
vient d'accueillir.

**Fonctions existantes — à garder**

- Sans session : renvoi à la connexion **avec** la destination (`intention/page.tsx:60-63`).
- **Étape prénom** pour un compte né par téléphone ou par Google (prénom requis, nom facultatif,
  `EtapePrenom`), « Votre prénom apparaît sur vos annonces et vos messages ».
- La question n'est posée qu'une fois (`skipped` compte comme une réponse), jamais à un compte qui a
  déjà un profil rattaché à une agence, jamais quand la destination est explicite (`/publish`, une
  fiche…) : elle redirige alors aussitôt (`doitPoserLaQuestionDIntention`, `estUneDestinationExplicite`).
- Deux choix en cartes radio — « Je cherche un logement » → `/properties` ; « Je veux publier un
  bien » → `/publish` — enregistrés sur le compte (`PATCH /api/me`, `entry_intent`), et « Je verrai
  plus tard » → la destination (par défaut `/app`) ; erreur d'enregistrement annoncée ; note
  « Cette réponse ne vous engage à rien ».
- Coque `OnboardingShell` : marque, « Retour au site », `noindex`.

**Ce qui marche**

- Le principe : **une seule porte**, qui juge seule, éprouvée par des tests (AC5 de TCK-493). C'est
  ce qui rend possible tout ce qui suit.
- Au téléphone, l'action principale prend la largeur et « plus tard » est une vraie cible de 44 px
  (`intention-m`).
- Une destination explicite saute la question : le propriétaire qui a cliqué « Publier » ne la voit
  pas (mesuré : `?redirect=/publish` → prénom → `/publish`).

**Constats**

| Sév. | Où | Constat |
|---|---|---|
| P1 | les deux | **Pas de porte pour le professionnel.** Deux choix : chercher ou publier. L'agent indépendant, l'agence qui veut s'installer, le gestionnaire qui a vingt biens choisissent « publier » et reçoivent **un espace personnel créé sans question** (`/publish` → `autoOnboardAction`). La voie « Professionnel (créer une vraie agence) » existe — dans l'assistant d'hôte (`HostIndividualWizard`, étape 1, `hote-m`) — mais `host_auto_space` la court-circuite : elle n'est plus atteignable depuis l'entrée. Les agences sont les clientes payantes (crédits, mise en avant). |
| P1 | les deux | **« Je cherche un logement » mène au site public** (`/properties`) — juste après avoir créé un compte, la personne est renvoyée là où elle était, sans que rien n'ait changé pour elle : ni alerte proposée, ni favoris, ni « ce que ton compte t'apporte ». « Je verrai plus tard » mène à `/app`, un tableau de bord vide recouvert d'une modale de bienvenue (`client-app-m`, § 7.6). |
| P2 | les deux | La carte « Je veux publier un bien » parle de « **gérez vos réservations** » : la courte durée, cas minoritaire ; le propriétaire qui loue au mois ou qui vend ne s'y reconnaît pas. |
| P2 | bureau | Formulaire du prénom de **760 px de large** pour deux champs courts, au milieu d'un écran vide (`prenom-d`) ; idem pour les deux cartes. |
| P3 | les deux | Écran du prénom : la note de pied « Vos réponses sont enregistrées au fur et à mesure — vous pouvez reprendre plus tard » est fausse ici (rien n'est un brouillon) ; elle vient de la note par défaut d'`OnboardingShell`. Même note sur l'invitation (§ 9). |

**Proposition — mobile** — *trois portes, et chacune promet quelque chose*

```
┌──────────────────────────────────────┐
│ TAKUSSAN                      Plus tard│
├──────────────────────────────────────┤
│ Bienvenue, Awa                       │
│ Qu'est-ce qui t'amène ?              │
│ ┌──────────────────────────────────┐ │
│ │ 🔍 Je cherche un logement         │ │ → reste sur place : 2 questions
│ │   Louer ou acheter               │ │   (quartier, budget) → alerte créée
│ └──────────────────────────────────┘ │   → liste filtrée
│ ┌──────────────────────────────────┐ │
│ │ 🏠 J'ai un bien à louer ou vendre │ │ → /publish (espace perso)
│ │   Particulier · gratuit          │ │
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │
│ │ 💼 Je suis un professionnel       │ │ → agence : nom, ville, NINEA
│ │   Agent, agence, gestionnaire    │ │   plus tard (demande d'agence)
│ └──────────────────────────────────┘ │
│ (le choix vaut validation : pas de   │
│  bouton « Continuer »)               │
└──────────────────────────────────────┘
```

- **Un tap = la suite** : la carte est le bouton (aujourd'hui : choisir, puis « Continuer »).
- **Chercheur** : deux questions courtes sur le même écran (quartier, budget mensuel en pastilles :
  « < 150 000 F », « 150-300 000 », « 300-600 000 », « > 600 000 ») qui **créent une alerte** et
  ouvrent la liste filtrée. Le compte gagne tout de suite une raison d'exister. `entry_intent` reste
  écrit comme aujourd'hui.
- **Professionnel** : l'assistant d'hôte, directement à l'étape « Professionnel », puis la demande
  de passage en agence (`/app/settings/agency/upgrade`) au lieu d'un espace personnel silencieux.
- Le prénom reste un écran à lui, avant, quand il manque.

**Proposition — bureau** : même contenu, colonne de 560 px ; les trois cartes côte à côte.

**Ambition** — *un premier écran qui sait qui tu es* : chaque porte aboutit à un écran qui a déjà
quelque chose à montrer (une liste filtrée avec l'alerte active, l'assistant de publication, la
demande d'agence pré-remplie) — jamais un tableau de bord à zéro.

---

## 7. Les assistants de profil — `/onboarding/{owner,agent,service-provider,agency-admin,host}`

**Rôle business.** Faire d'un invité un utilisateur **actif** : vérifié (téléphone), en règle
(pièces) et orienté vers sa première tâche. Un bailleur qui n'achève pas son entrée ne reçoit pas
ses notifications de loyer ; un agent sans zones ne reçoit pas de prospects.

Ces assistants ne s'ouvrent pas seuls : on y arrive **par l'acceptation d'une invitation**
(`destinationDInvitation`, `?owner=`, `?agent=`, `?sp=`), par la réinitialisation du mot de passe
d'un administrateur d'agence créé par la plateforme (`reset-password/page.tsx:50`), ou par `/publish`
quand l'espace automatique est éteint (`/onboarding/host`). **Sans le paramètre de reprise, une
seconde visite renvoie à `/app`** (mesuré : `/onboarding/owner` sans `?owner=` → `/app`, profil
déjà actif) : un assistant à moitié fait ne se reprend que par le lien d'origine ou le bandeau de
reprise.

### 7.1 Bailleur invité — `/onboarding/owner` (parcouru en entier)

**Fonctions existantes — à garder** : 4 étapes avec barre de progression et « Étape N sur 4 » ;
(1) téléphone + code SMS obligatoire (bouton « Envoyer le code », code d'aperçu hors production,
bandeau « Numéro vérifié ») ; (2) pièces : CNI ou passeport, RIB, NINEA, glisser-déposer ou
parcourir, état « Brouillon » / « Soumis », **« Soumettre mon dossier KYC »**, non bloquant ;
(3) visite guidée de 3 diapositives (Vos biens, Vos paiements, Messages), « Passer le tour » ;
(4) biens déjà rattachés par l'agence ou état vide, « Voir tous mes biens », « Terminer » →
`/app` ; brouillon serveur par étape (`wizard-drafts`), reprise par `?owner=`.

**Constats**

| Sév. | Où | Constat |
|---|---|---|
| P1 | fin du parcours | **La visite guidée est jouée deux fois.** L'étape 3 montre « Vos biens / Vos paiements / Messages » ; « Terminer » mène à `/app`, où la modale de bienvenue du bailleur (`AppShell.tsx:129`) rejoue « Vos biens, à portée de main » en trois diapositives (`owner-fin-m`). Mesuré sur le compte créé par l'invitation. |
| P1 | étape 4 | **Le bailleur sans bien n'a rien à faire** : « Aucun bien rattaché pour le moment — Votre agence ajoutera vos biens ». Or le bailleur peut **proposer** un bien (persona « bailleur », action principale « Proposer un bien », `proprio-new-d` : « Votre agence relira ce bien avant de le publier »). Le seul geste qui fait avancer la relation est absent de l'écran qui la commence. |
| P2 | étape 2 | « Glissez un fichier ici ou cliquez pour parcourir » **au téléphone**, où l'on ne glisse rien et où la pièce se photographie (`owner-wiz2-m-1`). Pas de « Prendre une photo » (l'assistant de publication l'a, `StepPhotos`). |
| P2 | étape 2 | **Deux boutons pour avancer** : « Soumettre mon dossier KYC » (désactivé, rose) et « Suivant » (actif). Le second fait passer **sans** soumettre ; rien ne dit que les pièces sont facultatives maintenant ni ce qu'on perd à les laisser. « KYC » est du jargon. |
| P2 | étape 2 | Le **NINEA** est demandé en **fichier** ; c'est un numéro. |
| P3 | étape 3 | Deux « Suivant » à l'écran (celui des diapositives et celui de l'assistant). |
| P3 | en-tête | « Quatre étapes guidées pour vérifier votre identité, transmettre vos pièces et découvrir vos biens » — 4 étapes annoncées pour deux gestes utiles. |

### 7.2 Agent invité — `/onboarding/agent`

**Fonctions existantes — à garder** : 4 étapes — (1) téléphone + code, (2) pièces : carte
professionnelle (numéro + pièce), pièce d'identité, photo de profil, « Soumettre mon dossier KYC »,
(3) spécialisation (Résidentiel, Commercial, Luxe, Mixte) et zones d'intervention (ajout libre,
suggestions, retrait), « Enregistrer » obligatoire pour avancer, (4) « Bienvenue dans l'équipe » :
**les droits donnés par l'agence** (ou leur absence, ou leur échec de chargement) et **le premier
prospect pré-assigné** avec « Voir la fiche → ». Même brouillon et même reprise que le bailleur ;
l'invité au rôle d'administrateur passe aussi par cet assistant (`invitation-destination.ts`).

**Constats**

| Sév. | Où | Constat |
|---|---|---|
| P1 | étape 4 | **La meilleure idée de la famille arrive en dernier** : « Votre premier lead » (un vrai prospect, avec son étape) est la raison de rejoindre l'agence — il est derrière un code SMS, trois pièces et un formulaire de zones. |
| P2 | étape 1 | Envoi du code : relevé deux fois de suite « Envoi… » puis retour à « Envoyer le code » **sans que le champ du code apparaisse** (`agent-wiz2-m`, après plusieurs envois depuis la même adresse dans l'heure — limiteur probable). L'échec ne se lit qu'en toast éphémère : l'étape reste muette. |
| P2 | textes | **Anglicismes** : « lead », « Votre premier lead », « Aucun lead pré-assigné » (agent), « dès la fin du **wizard** » (prestataire), « plonger dans votre **dashboard** » (administrateur), « dossier **KYC** » partout. |
| P2 | étape 3 | « Enregistrer » **puis** « Suivant » : deux gestes pour un seul écran. |

### 7.3 Prestataire invité — `/onboarding/service-provider`

**Fonctions existantes — à garder** : 4 étapes — téléphone ; métiers (choix multiple), zones
(villes séparées par des virgules), **tarif horaire et frais de visite** (« XOF »), assurance RC
pro facultative ; disponibilités par créneaux de la semaine ; récapitulatif, et **« Une
intervention vous attend »** quand l'invitation vient d'une demande d'intervention ; accueil
multi-agences (`ServiceProviderMultiAgencyWelcome`) pour un prestataire déjà actif ailleurs, sans
recréer de compte. Mesuré jusqu'à l'étape 1 (`sp-wiz1-m`, invitation réelle de Dakar Immo).

**Constats** : P2 — l'intervention qui a déclenché l'invitation (le travail, donc le revenu) n'est
montrée qu'au récapitulatif ; P3 — montants en « XOF » (le produit écrit « F CFA » partout
ailleurs) ; P3 — zones en texte libre séparé par des virgules, quand l'agent a des suggestions et
des pastilles (§ 7.2).

### 7.4 Administrateur d'agence — `/onboarding/agency-admin`

**Fonctions existantes — à garder** : 2 étapes, « Bienvenue » (prénom, nom de l'agence) puis
« Sécurité » (enrôlement du second facteur), fil d'étapes en pastilles ; ouvert après la
première réinitialisation du mot de passe d'un administrateur créé par la plateforme ; redirige
vers `/app` qui n'est pas administrateur.

**Constats** : P2 — l'écran de bienvenue est une carte vide avec « Continuer » (`aa-m`) : rien de
ce que `/app` montrera ensuite (« Mise en service de l'agence, 6 sur 7 étapes », relevé sur le
compte admin) n'y est annoncé ; P3 — « dashboard », « Bienvenue sur Takussan, Admin » (le prénom
de démo est « Admin » : à ne pas compter).

### 7.5 Hôte — `/onboarding/host` (repli de `/publish`)

**Fonctions existantes — à garder** : 3 étapes — (1) « Vous publiez en tant que… » : **Particulier
(mon espace)** ou **Professionnel (créer une vraie agence)**, avec l'avertissement « En deux temps »
pour le second ; (2) l'espace : nom (« Espace de {prénom} » par défaut), ville principale, devise,
téléphone + code SMS ; (3) récapitulatif, CGU obligatoires ; esquisse du premier bien (titre, type,
ville, transaction, prix indicatif) ; succès « Votre espace est prêt » → formulaire de mise en
ligne ; un compte qui a déjà un profil d'agence est envoyé directement à `/app/properties/new`.

**Constats** : P1 — voir § 6 : **c'est la seule porte « Professionnel » du produit, et l'espace
automatique la rend inaccessible** (le drapeau `host_auto_space` est allumé ; l'assistant n'est
plus qu'un repli en cas de refus 403). P3 — « créer une **vraie** agence » sous-entend que l'autre
est fausse.

### 7.6 Les modales de bienvenue à l'arrivée dans `/app`

Montées par `AppShell` selon les rôles (`AppShell.tsx:117-142`) : client (« Trouvez le bien
parfait », 3 diapositives), bailleur (« Vos biens, à portée de main »), agent, administrateur
passé en agence, locataire (après le client). **Elles s'ouvrent sur la première page de `/app`,
quelle qu'elle soit** — y compris **par-dessus l'assistant de publication** (`nouveau-bien-m`,
`nouveau-bien-d` : la modale bailleur couvre « Quel bien publiez-vous ? »).

| Sév. | Où | Constat |
|---|---|---|
| P1 | `/app/properties/new` | **La modale de bienvenue interrompt la publication** : le propriétaire qui vient de créer son compte pour publier doit d'abord passer trois diapositives sur « vos locataires » et « votre tableau de bord ». C'est le moment le plus fragile de l'acquisition. |
| P1 | `/app` (bailleur invité) | Doublon de la visite guidée de l'assistant (§ 7.1). |
| P2 | `/app` (client neuf) | La modale « Trouvez le bien parfait — Filtrez plus de mille annonces » recouvre un tableau de bord qui dit « Aucune activité pour le moment » et propose « Mes baux, Paiements, Documents » à quelqu'un qui n'a pas de bail (`client-app-m`). |

**Proposition commune aux assistants — mobile**

- **La première tâche d'abord, la conformité ensuite.** Ordre : (1) vérifier le téléphone
  (inchangé, c'est un prérequis réel), (2) **la raison de venir** — bailleur : ses biens, ou
  « Proposer mon premier bien » ; agent : son premier prospect ; prestataire : l'intervention qui
  l'attend ; (3) les pièces, présentées comme une **liste de choses à faire** qui reste dans
  « Démarrer » (groupe de la colonne `/app`, ADR-0090 / TCK-2479) plutôt qu'une étape qui bloque.
- **Une seule visite guidée** : l'assistant la supprime (ou la modale de `/app` se tait pour un
  compte qui sort d'un assistant). Recommandé : retirer l'étape « tour » des assistants et ne
  garder que des **bulles en place** dans `/app` (pas de modale).
- **Pièces au téléphone** : chaque pièce est une ligne « CNI · Prendre une photo · Choisir un
  fichier », avec l'état (À fournir / Envoyée / Vérifiée) ; NINEA = un champ texte ; un seul bouton
  bas « Envoyer mes pièces » ou « Plus tard ».
- **Aucune modale de bienvenue dans un tunnel** : les modales de `AppShell` ne s'ouvrent pas sur
  une page plein écran (le prédicat `pleinEcran` existe déjà, `AppShell.tsx:112`).

**Proposition — bureau** : même ordre ; à droite de l'assistant, un **aperçu de ce qui attend**
(« Dakar Immo vous a confié 3 biens · 1 prospect · 0 pièce envoyée ») qui se remplit.

**Ambition** — *l'invitation est déjà l'assistant* : l'agence qui invite connaît le nom, le
téléphone, les biens, les zones. L'invité ne devrait **confirmer** que ce que l'agence a saisi
(comme le nom pré-rempli depuis TCK-2281), pas le ressaisir. Un bailleur invité par numéro arrive
avec un code SMS déjà en main : lien → code → ses biens. Trois écrans.

---

## 8. Sécurité du compte à l'entrée — `/onboarding/securite`

**Rôle business.** Imposer le second facteur là où il est obligatoire (super-admin sans 2FA,
réinitialisation par le support), sans « Plus tard ».

**Fonctions existantes — à garder** : la page ne décide rien seule
(`configurationDoubleFacteurExigee`) ; sans rien à configurer, elle renvoie vers l'espace (mesuré :
admin d'agence → `/app`, `secu-m`) ; sans session, vers la connexion avec retour ; motif affiché
(`reconfigure` ou `superAdmin`) ; enrôlement TOTP complet (`TotpEnrollment` : QR, clé, codes de
récupération).

**Constats** : aucun relevé au navigateur faute de compte dans l'état exigé (ne pas modifier un
compte de démo) ; à lire avec la famille 6 (2FA exigée sur les opérations d'argent). P3 — le
mot « TOTP » et l'absence d'explication de ce qu'est une application d'authentification pour un
public qui n'en a jamais installé : à vérifier en maquette.

---

## 9. Invitation d'agence — `/invitations/accept?token=…`

**Rôle business.** Transformer un e-mail ou un SMS d'une agence en compte actif. C'est **la
porte de l'agence vers ses bailleurs, ses agents et ses prestataires** : chaque invitation non
acceptée est un bien qui reste géré par téléphone, hors Takussan.

**Fonctions existantes — à garder**

- Sans jeton : « Ce lien d'invitation est incomplet. Rouvrez-le depuis le message reçu » (`invit-sans-m`).
- Déconnecté : prénom, nom (facultatif), mot de passe avec règle en aide, « Créer mon compte et
  accepter », « J'ai déjà un compte » (connexion avec retour à l'invitation) ; à l'acceptation,
  connexion automatique puis **assistant du rôle** (`?owner=`, `?agent=`, `?sp=`).
- Connecté sans nom : nom **pré-rempli depuis ce que l'agence a saisi** (TCK-2281), à confirmer.
- Connecté : « Accepter l'invitation » en un geste ; refus de l'API affiché, avec « Se connecter »
  quand le compte existe déjà.
- Invitation par SMS (lien court) pour un invité sans e-mail ; expiration à 7 jours, rappel à J+2.

**Constats**

| Sév. | Où | Constat |
|---|---|---|
| P1 | les deux | **La page ne dit pas qui invite, ni pour quoi.** « Vous êtes invité sur Takussan — Créez votre compte pour rejoindre l'espace qui vous invite » : ni le nom de l'agence (Dakar Immo), ni la personne, ni le rôle (bailleur, agent, prestataire), ni ce qui attend (« 3 biens », « une intervention »). Un lien reçu par SMS qui demande un **mot de passe** sans nommer l'expéditeur ressemble à de l'hameçonnage. |
| P1 | les deux | **Un jeton faux ou expiré affiche le même formulaire qu'un vrai** (`invit-faux-m` = `invit-owner-m`) : l'invité remplit prénom, nom et mot de passe, puis apprend l'erreur. |
| P2 | déconnecté | Le nom saisi par l'agence (« Moussa Ndiaye ») **n'est pas pré-rempli** pour l'invité déconnecté — seulement pour un compte connecté (`lireNomsPreremplis` exige une session). |
| P2 | déconnecté | **Mot de passe obligatoire**, sans « afficher » ; pas de voie téléphone, alors que la connexion du produit est par code SMS et qu'un invité par SMS n'a pas forcément d'e-mail. |
| P3 | les deux | « Vous êtes invité » (masculin seul) ; note de pied « Vos réponses sont enregistrées au fur et à mesure » fausse ici. |

**Proposition — mobile**

```
┌──────────────────────────────────────┐
│ TAKUSSAN                             │
├──────────────────────────────────────┤
│ [logo] Dakar Immo                    │
│ Aïssatou Diallo vous invite comme    │
│ bailleur.                            │
│ ┌──────────────────────────────────┐ │
│ │ Ce qui vous attend               │ │
│ │ · 3 biens suivis par l'agence    │ │
│ │ · vos loyers et versements       │ │
│ │ · vos quittances                 │ │
│ └──────────────────────────────────┘ │
│ Invitation pour m•••@gmail.com ·     │
│ valable jusqu'au 17 nov.             │
│ Prénom [Moussa      ] Nom [Ndiaye ]  │  ← pré-remplis
│ [ Continuer avec mon numéro       ]  │  ← code SMS, sans mot de passe
│ Utiliser un mot de passe             │
│ J'ai déjà un compte                  │
└──────────────────────────────────────┘
```

- **Lien invalide, expiré, révoqué ou déjà accepté** : un écran à part, qui le dit et qui donne
  l'issue (« Demandez à Dakar Immo de vous renvoyer l'invitation », avec le numéro de l'agence s'il
  est public ; « Se connecter » si déjà acceptée).
- Demande à l'API : un aperçu public de l'invitation par son jeton (agence, logo, rôle, prénom de
  l'invitant, adresse ou numéro masqués, expiration, compteurs) — **le jeton est déjà le secret
  porteur**, l'aperçu n'en révèle pas plus que le message reçu.

**Proposition — bureau** : même contenu en deux colonnes — à gauche l'agence et ce qui attend,
à droite le formulaire.

**Ambition** — *accepter en un code* : l'invitation par SMS porte déjà le numéro ; le lien ouvre
directement l'écran du code (« Code envoyé au 77 •• •• 45 67 »), et le compte naît vérifié.

---

## 10. Publier un bien — `/publish` → `/app/properties/new`

**Rôle business.** **L'acquisition d'offre.** C'est le chemin qui fabrique le stock : chaque
propriétaire qui abandonne entre « Publier » et « bien en ligne » est une annonce qui part sur
Facebook, Expat-Dakar ou un groupe WhatsApp. Les points d'entrée sont nombreux : « Publier » de la
barre d'onglets publique (case 3 pour l'anonyme), « Publier un bien » de l'en-tête bureau, le bloc
propriétaire de l'accueil (`BlocProprietaire`), « Rejoindre Takussan » des annuaires,
« Je veux publier un bien » de l'orientation.

**Fonctions existantes — à garder**

- `/publish` est un **aiguilleur** sans formulaire (`usePublishIntent`) :
  anonyme → `/auth/login?redirect=/publish` ; **aucun espace** → création automatique d'un espace
  personnel (« Création de votre espace… — Votre espace personnel se prépare : vous publiez juste
  après ») puis `/app/properties/new` ; refus serveur (`host_auto_space` éteint) → `/onboarding/host` ;
  **un espace** → bascule du profil actif si besoin puis le formulaire ; **plusieurs espaces** →
  « Où publier ce bien ? » (une ligne par agence, « Mon espace personnel », type de profil) ;
  erreurs de bascule et de création avec « Réessayer » ; écran d'attente « Préparation de votre
  annonce… ».
- L'assistant (`PropertyWizard`, TCK-464/631) : **6 écrans en 3 parties** (Le bien · Les détails ·
  L'annonce) — contrat et type (9 types + « Plus de types (7) ») ; lieu (« Utiliser Dakar, Dakar »
  suggéré, région, ville requise, quartier, rue et code postal repliés, « Utiliser ma position
  actuelle », coller un lien Google Maps / position WhatsApp, carte et repère) ; caractéristiques
  selon le type ; prix (fréquence, disponibilité, **coût d'entrée** : mois d'avance, caution,
  charges — total calculé) ; photos (facultatives, « Prendre une photo », envoi « 3 sur 12 ») ;
  titre (suggéré), description, visite virtuelle, **contacts sur place**, numéro et WhatsApp du
  contact.
- **Aperçu de l'annonce** en direct (colonne à droite au bureau, feuille « Aperçu » au téléphone) et
  liste « Pour publier » avec l'état de chaque partie ; résumé collant en haut au téléphone
  (« Appartement · En location — Prix à venir ») ; pied collant (parties, Précédent, Continuer) ;
  « Enregistrer et quitter » et brouillon serveur repris ; pays et devise posés et dits.
- Publication : contrôle `PublishReadiness` (prénom et **téléphone vérifié** du contact principal,
  CGU acceptées par la phrase sous « Publier ») ; statut rendu par l'agence (`available` ou
  `pending_review`) ; échec partiel (photos, contacts) dit sans recréer le bien ; toast avec
  « Booster » quand le bien est en ligne ; sortie sur la fiche `/app/properties/{id}`.
- Bailleur d'une agence : même assistant en mode **proposition** (« Proposer un bien — Votre agence
  relira ce bien avant de le publier : il reste privé jusque-là », `proprio-new-d`).

**Ce qui marche**

- **L'assistant est bon** : une question par écran, la ville suffit, la position WhatsApp se colle,
  le coût d'entrée est calculé (« Total à l'entrée : 1 000 004 F CFA » sur les valeurs de test),
  l'aperçu montre l'annonce telle que le chercheur la verra. C'est la meilleure page de la famille.
- L'espace automatique supprime l'assistant d'hôte pour le particulier : de la création du compte
  au formulaire, aucun écran de configuration.
- La publication refuse un bien que personne ne peut joindre (`PublishReadiness`) : c'est la bonne
  garde pour la confiance du chercheur.

**Constats**

| Sév. | Où | Constat |
|---|---|---|
| P1 | anonyme | **« Publier » mène à une page de connexion qui ne parle pas de publier** (`publish-anon-m` : « Connectez-vous avec votre numéro »). Rien ne dit que c'est gratuit, combien de temps ça prend, ni que le compte se crée tout seul. C'est le décrochage le plus probable du parcours, et il précède tout le reste. |
| P1 | après la connexion | **La modale de bienvenue du bailleur couvre l'assistant** (§ 7.6) — trois diapositives entre le compte et la première question. |
| P1 | parcours | **11 écrans de « Publier » au bien en ligne** pour un nouveau venu, dont 4 qui ne servent pas l'annonce (transit, 3 diapositives). Sans eux : 7. |
| P2 | anonyme | Le visiteur **ne voit rien du formulaire avant de créer son compte** : ni la longueur (6 écrans), ni ce qu'on lui demandera. Les places de marché qui convertissent le mieux laissent commencer l'annonce et demandent le compte au moment de publier. |
| P2 | compte e-mail | Le téléphone vérifié n'est exigé **qu'au clic sur « Publier »** (`PublishReadiness`, refus `verified_phone`) : le compte ouvert par e-mail découvre la vérification SMS au dernier écran. (Le compte ouvert par téléphone est déjà vérifié : le cas est minoritaire.) |
| P2 | transit | « Préparation de votre annonce… » / « Création de votre espace… » : un écran plein avec un rond qui tourne, 1 à 6 s mesurés sous `next dev` ; rien à lire. |
| P3 | bureau | Assistant en plein écran sans la colonne de `/app` : juste pour un tunnel, mais le **bouton « Enregistrer et quitter »** est le seul moyen de sortir — pas de lien vers l'espace. |

**Proposition — mobile** — *commencer l'annonce avant le compte*

Approche recommandée : **le compte au moment de publier, pas avant**.

```
« Publier » (anonyme)
┌──────────────────────────────────────┐
│ ✕                         TAKUSSAN   │
│ Publie ton bien gratuitement         │
│ En ligne aujourd'hui · 5 minutes     │
│ ┌──────────────────────────────────┐ │
│ │ 1 240 recherches à Dakar cette   │ │
│ │ semaine · 0 F de commission      │ │
│ └──────────────────────────────────┘ │
│ Tu veux…                             │
│ [ Louer ]  [ Vendre ]                │  ← la première question de l'assistant,
│ Type de bien                         │     posée ici, sans compte
│ [Appartement][Maison][Studio][Chambre]│
│ [Villa][Terrain][Bureau]  Plus…      │
│ ───────────────────────────────────  │
│ Tu es une agence ? Créer un compte pro│
└──────────────────────────────────────┘
→ lieu → caractéristiques → prix → photos → titre (brouillon en local)
→ « Publier » : feuille « Ton numéro » → code → prénom → en ligne
```

- Le brouillon vit **dans l'appareil** tant qu'il n'y a pas de compte (le brouillon serveur prend le
  relais à la connexion : `wizard-drafts` existe déjà).
- La connexion devient **l'avant-dernier geste** et ne demande que numéro, code, prénom — que
  `PublishReadiness` exige de toute façon (téléphone vérifié, prénom).
- Aucune modale, aucun écran de transit : l'espace se crée pendant la publication.

**Proposition — bureau** : même ordre ; l'aperçu de l'annonce reste à droite pendant tout le
parcours, compte compris ; la feuille du numéro est un panneau dans la colonne de l'assistant.

**Approche prudente (sans changer l'ordre)** : une page `/publish` pour l'anonyme qui **annonce**
le parcours (« 3 étapes · gratuit · un code SMS suffit ») avec un seul bouton « Commencer » vers la
connexion à intention visible (§ 1), puis l'assistant sans modale.

**Ambition**

- **Publier depuis WhatsApp** : « Envoie les photos et le prix de ton bien à ce numéro » — le
  Radar sait déjà extraire une annonce d'un message (famille Radar, `features.md` § 2.12) ; le
  propriétaire reçoit un lien vers le brouillon pré-rempli, à relire et publier.
- **Annonce minimale publiable en 60 secondes** (contrat, type, quartier, prix, une photo), le
  reste proposé après mise en ligne avec ce que chaque champ rapporte (« Ajoute 5 photos : les
  annonces avec photos reçoivent 4 fois plus de demandes » — à mesurer avant de l'écrire).

---

## 11. Vérification indisponible — `/verification-indisponible`

**Rôle business.** Dire à un membre d'agence que **la vérification de ses accès** a échoué pour
une raison technique (API injoignable), et non que sa formule a changé (TCK lié à `app/layout.tsx:57`).
Ce n'est pas un écran du parcours d'entrée : c'est un garde de `/app`, rangé ici parce qu'il est
hors coque.

**Fonctions existantes — à garder** : marque, icône d'alerte, titre « Vos accès n'ont pas pu être
vérifiés », texte qui écarte le changement de formule, **« Retour au tableau de bord »** (et non
« Réessayer », choix commenté dans le code), bouton « Messagerie » flottant.

**Constats** : P3 — l'écran ne propose ni de réessayer sur place ni l'état du service ; un lien
« Réessayer » qui rejoue la vérification et retombe ici en cas d'échec, plus « Contacter le support ».
Pas de maquette nécessaire : à traiter avec les pages d'erreur de la famille 3.

---
## Navigation de la famille — bureau et téléphone

**Trois coques pour un seul parcours.** Le nouveau venu qui publie traverse :

1. la coque d'authentification — photo en deux colonnes au bureau, bandeau photo au téléphone,
   « Retour » vers la page publique quittée (`(auth)/layout.tsx`) ;
2. la coque d'entrée — barre blanche « TAKUSSAN · Retour au site », colonne centrée, note de pied
   (`OnboardingShell`) — pour le prénom, l'orientation, les assistants et l'invitation ;
   `/publish` a sa variante (`BarreDeMarque` seule) ;
3. le plein écran de `/app` — l'assistant de publication, sa propre barre « Enregistrer et
   quitter », la modale de bienvenue par-dessus.

Chacune est juste prise seule ; ensemble, le parcours change trois fois de visage en cinq écrans,
et **aucune ne montre l'avancement global** (« étape 2 sur 4 » de l'assistant ignore les trois
écrans de compte qui l'ont précédé).

**Téléphone.** La barre d'onglets publique se retire correctement dans tous ces écrans (règle des
couches, ADR-0091) : le bas de l'écran appartient au bouton principal — c'est juste. Mais les
boutons principaux ne sont **pas collés** sur les écrans de compte (connexion, code, prénom,
orientation, invitation) : ils suivent le contenu et passent sous le clavier (§ 1). L'assistant de
publication, lui, a un pied collant : c'est le modèle à étendre.

**Sorties.** « Retour » (connexion) ramène à la page publique d'origine — bien fait (TCK-568).
« Retour au site » (coque d'entrée) ramène à l'accueil depuis n'importe quelle étape, sans
prévenir qu'un assistant reste à finir ; la reprise n'existe ensuite que par le lien d'origine
(`?owner=`…) ou le bandeau de reprise de `/app`. Au bureau, l'assistant de publication n'a que
« Enregistrer et quitter » pour sortir.

**Proposition — une coque d'entrée unique** pour tout ce qui précède le premier écran utile
(connexion, code, prénom, orientation, invitation, assistants, `/publish`) :

```
┌──────────────────────────────────────┐
│ ←  Publier ton bien        ● ● ○ ○   │  ← l'intention en titre, l'avancement
├──────────────────────────────────────┤     du parcours ENTIER (compte compris)
│                                      │
│  (contenu de l'étape)                │
│                                      │
├──────────────────────────────────────┤
│ [          Continuer               ] │  ← collé, au-dessus du clavier
└──────────────────────────────────────┘
```

- Le titre de la barre est l'intention (« Publier ton bien », « Rejoindre Dakar Immo », « Demander
  une visite »), pas la marque seule.
- Au bureau : colonne de 480 px centrée, et **le panneau de droite (ou de gauche) porte l'objet** —
  l'aperçu de l'annonce, l'agence qui invite, le bien à visiter. La photo décorative disparaît.
- `✕` / « Quitter » demande confirmation dès qu'une saisie existe, et dit où la reprendre.

---

## Transversal — ce qui touche toute la famille

1. **L'intention est transportée mais jamais montrée** (`redirect` lu par cinq écrans, affiché par
   aucun). Un composant « carte d'intention » unique, alimenté par `destinationInterne(redirect)`,
   couvrirait connexion, inscription, code, vérification et orientation.
2. **Les modales de bienvenue de `AppShell` s'ouvrent n'importe où**, tunnels compris, et doublent
   les visites guidées des assistants (§ 7.6).
3. **Deux modèles d'identification se contredisent** : le produit se connecte par code SMS
   (téléphone d'abord, sans mot de passe) mais l'invitation exige un mot de passe ; la publication
   exige un téléphone vérifié mais l'inscription par e-mail ne le demande pas.
4. **Anglicismes et jargon** dans les assistants : « lead », « wizard », « dashboard », « dossier
   KYC », « TOTP ». Tous dans `src/messages/fr.json` (`agents.onboarding.steps.welcome`,
   `serviceProviders.onboarding.steps.recap.maintenanceRequest`, assistant administrateur, `*.kyc.submitCta`).
5. **Deux voix** : vouvoiement dans toute la famille, tutoiement sur le site public d'où l'on vient
   (famille 1, transversal 9). La famille 2 est la charnière : à trancher ici.
6. **Glisser-déposer proposé au téléphone** pour les pièces (bailleur, agent) ; l'assistant de
   publication sait déjà « Prendre une photo ».
7. **Note de pied par défaut fausse** (« Vos réponses sont enregistrées au fur et à mesure ») sur
   les écrans sans brouillon : prénom, orientation de l'invité, invitation.
8. **« Valider »** sur le bouton du code (charte § Ton).
9. **Échecs d'envoi de SMS en toast seul** (assistants) : l'étape reste muette une fois le toast
   parti. Un échec d'envoi doit s'écrire sous le champ, avec le délai.
10. **Données de démo** : rien à signaler pour cette famille, sauf le prénom « Admin » du compte
    administrateur.

---

## Synthèse de la famille 2

### Les cinq chantiers

| # | Chantier | Pages | Pourquoi d'abord |
|---|---|---|---|
| A | **Publier sans friction** : l'annonce commencée avant le compte (ou annoncée), le compte demandé à la publication, aucune modale ni écran de transit — de 11 écrans à 7 | 10, 1, 7.6 | C'est l'acquisition d'offre ; trois P1 et le décrochage le plus probable |
| B | **Une seule porte d'entrée** : connexion = inscription par numéro, carte d'intention, bouton collé au-dessus du clavier, « Me connecter » au lieu de « Valider », vérification de l'adresse qui pousse à continuer, oubli du mot de passe → code SMS | 1-5 | Deux P1 ; touche tous les parcours qui demandent un compte |
| C | **L'orientation en trois portes** : chercheur (qui repart avec une alerte), particulier (publier), **professionnel** (agence) ; une carte = un geste | 6, 7.5 | Deux P1 ; la porte pro est la seule voie vers les clients payants |
| D | **Une invitation qui inspire confiance** : qui invite, pour quoi, ce qui attend ; lien invalide dit tout de suite ; nom pré-rempli ; code SMS au lieu du mot de passe | 9 | Deux P1 ; c'est la porte des agences vers leurs bailleurs |
| E | **Assistants de profil : la première tâche d'abord** — biens / proposer, premier prospect, intervention ; pièces au téléphone sans jargon ; une seule visite guidée | 7.1-7.4, 7.6 | Quatre P1 ; un invité qui finit son entrée est un utilisateur actif |

### Décisions qui reviennent au porteur

1. **Ordre de la publication pour l'anonyme** : a) l'annonce d'abord, le compte au moment de
   publier (brouillon dans l'appareil, puis serveur) ; b) une page `/publish` qui annonce le
   parcours, puis connexion à intention visible, puis l'assistant ; c) inchangé, carte d'intention
   seule sur la connexion.
   → Recommandation : **a**. b en premier lot si a demande trop à l'API (brouillon anonyme).
2. **Connexion et inscription** : a) une seule route par numéro (`/auth/register` redirige), la voie
   e-mail garde ses deux formulaires ; b) deux routes conservées, titres et sous-titres
   distincts ; c) inchangé.
   → Recommandation : **a**.
3. **Porte professionnelle à l'entrée** : a) un troisième choix « Je suis un professionnel » à
   l'orientation et sur `/publish`, qui ouvre l'assistant d'hôte en mode Professionnel puis la
   demande d'agence ; b) un lien discret « Vous êtes une agence ? » sous les deux choix ; c) rien
   (l'agence passe par le support).
   → Recommandation : **a**.
4. **Visites guidées** : a) plus de modale de bienvenue — l'étape « tour » des assistants
   disparaît, des bulles en place dans `/app` la remplacent ; b) les modales restent, mais jamais
   sur une page plein écran et jamais après un assistant qui a déjà montré sa visite ; c) inchangé.
   → Recommandation : **b** tout de suite (petit, sans risque), **a** avec la famille 3.
5. **Aperçu public d'une invitation par son jeton** (API : agence, logo, rôle, prénom de
   l'invitant, destinataire masqué, expiration, compteurs) : a) oui, tout cela ; b) l'agence et le
   rôle seulement ; c) non, la page reste générique.
   → Recommandation : **a** — le jeton est déjà le secret porteur.
6. **Identification de l'invité** : a) code SMS par défaut, mot de passe en option ; b) mot de
   passe comme aujourd'hui.
   → Recommandation : **a**, aligné sur la connexion du produit.
7. **Voix de la famille** : a) tutoiement, comme le site public d'où l'on arrive ; b) vouvoiement
   partout (site public compris, ⚑ écart de charte) ; c) tutoiement jusqu'au compte, vouvoiement
   dans `/app`.
   → Recommandation : **c** — la famille 2 tutoie, `/app` (outil de travail) vouvoie.

### Maquettes

Brief : `scratchpad/audit-app/briefs/famille-2.json` — cinq pages de maquette, chacune en
téléphone et en bureau : **Publier** (A, l'annonce d'abord / annoncé puis compte / par WhatsApp),
**Entrer** (B), **Orientation** (C), **Invitation** (D), **Assistants** (E).

### Traces laissées dans la base locale par l'audit

Comptes `audit-ux-f2-*@exemple.test` (e-mail, client, hôte, bailleur invité — profil bailleur 30
chez Dakar Immo —, agent invité — profil 21 —, prestataire invité — profil 16) et le compte 174 né
par téléphone (77 900 11 23) ; un espace personnel créé par `/publish` pour `audit-ux-f2-email`, avec
un brouillon d'assistant ; trois invitations de Dakar Immo, toutes acceptées. Aucun bien publié.

## Maquettes choisies le 2026-11-10

> **Le porteur a validé la recommandation de chaque page**, avec les compléments ci-dessous. Les
> maquettes ont été retouchées le jour même ; la visionneuse marque l'approche « retenue ». Elles
> sont la **référence de fidélité** des tickets à écrire (cf. README). Rien ne s'implémente avant
> que le porteur dise comment attaquer l'implémentation (qui se fera sur Opus 5.5).

| Page | Approche retenue | Visionneuse |
|---|---|---|
| Publier | A — L’annonce d’abord | `?p=app-entree-publier&a=a` |
| Entrer | A — Une porte, l’intention en tête | `?p=app-entree-connexion&a=a` |
| Orientation | A — Trois portes, un geste | `?p=app-entree-orientation&a=a` |
| Invitation | A — Qui t’invite, puis un code | `?p=app-entree-invitation&a=a` |
| Assistants | A — La raison de venir d’abord | `?p=app-entree-assistants&a=a` |

- **Publier, A — l'annonce d'abord, avec TOUTES les étapes de l'annonce d'aujourd'hui** (porteur :
  « il manque des étapes qu'on a actuellement ») : un écran par étape de `PropertyWizard` — le bien,
  le lieu, les caractéristiques, le prix (fréquences Mois/Semaine/Jour/An), les photos, le titre et la
  finition —, puis la feuille de compte au moment de publier. Champs et conditions relevés sur
  `PropertyWizard.tsx`, les six `Step*.tsx`, `field-matrix.ts` et `fr.json`. Les champs réservés aux
  agences ne paraissent pas pour le particulier mais **restent** : choix et invitation du bailleur,
  frais d'agence, mode proposition du bailleur, quota.
- **Décision 1a** : la feuille de compte demande le **prénom ET le nom**, comme le bloc « Vos
  coordonnées pour les intéressés » d'aujourd'hui — aucune donnée collectée ne se perd.
- **Entrer, A** : le bureau est validé tel quel ; le téléphone a été redessiné (« pas beau du tout ») —
  la photo du bien quitté et l'intention en tête, le numéro en grand, « Recevoir un code » sur le pavé.
- **Ton — révisé le 2026-11-10** : le porteur a retenu le **vouvoiement partout**, site public, publication
  sans compte, inscription et entrée comprises. Cela remplace la recommandation (c) de la § « Décisions
  qui reviennent au porteur », point 7 (« tutoiement jusqu'au compte »), et la ligne P3 « Vouvoiement ici,
  tutoiement sur le site public ». Les maquettes de la famille tutoient : elles ne sont pas une référence
  de ton ([ADR-0095](../../adr/0095-le-ton-suit-la-session.md), révisé ; TCK-2616, TCK-2683).
