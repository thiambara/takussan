# Le Radar et le socle IA — plan

- **Date** : 2026-10-26
- **Décisions** : [ADR-0076](../adr/0076-le-socle-ia.md) (le socle IA) · [ADR-0077](../adr/0077-le-radar.md) (le Radar)
- **Origine** : séance de conception avec le porteur du 2026-10-26. Chaque arbitrage ci-dessous a
  été posé par écrit, avec une recommandation, puis validé par lui.

Ce document porte **la vision entière**, y compris ce qui ne sera pas construit avant longtemps, pour
qu'elle ne se perde pas. Les décisions structurelles vivent dans les deux ADR. Les tickets décrivent
chacun un delta et pointent ici.

## L'idée

Un outil de la console super-admin qui **trouve des annonces immobilières publiées ailleurs, en
extrait les biens par IA, aide à contacter leurs annonceurs et les publie sur Takussan, sur un
accord prouvé**. C'est le remplissage du catalogue avant l'ouverture, et, au-delà, **la machine qui
fait venir les annonceurs** : un numéro derrière 40 annonces est une agence qui ne nous connaît pas
encore.

Il est construit sur un **socle IA réutilisable par toute l'application** : le Radar en est le
premier usager, pas le propriétaire.

## Les arbitrages du porteur (2026-10-26)

| # | Question | Décision |
|---|---|---|
| 1 | Périmètre | Toutes les recommandations de la vision : multi-sources, extraction avec confiance, fusion des doublons, fiche annonceur, suivi du démarchage, observatoire du marché. Airbnb est écarté du premier lot. |
| 2 | Propriété du bien publié | **c** : réclamé par l'annonceur par défaut ; publié par Takussan pour lui sur accord ; mandat Takussan en repli plus tard. |
| 3 | Chemin rapide | L'annonceur répond « OUI » sur WhatsApp sans cliquer : un bouton publie pour lui et crée son compte en même temps. |
| 4 | Canal du message d'accord | **c** : WhatsApp manuel (`wa.me`, téléphone dédié) d'abord, API Cloud ensuite sur un numéro distinct de celui des notifications. La preuve ne dépend pas du canal. |
| 5 | Ordre | **a** : la chaîne complète d'abord (saisie manuelle jusqu'à la publication), les collecteurs automatiques ensuite. |
| 6 | Courtiers (plus de 90 % du marché selon le porteur) | Compte particulier, c'est-à-dire **l'espace individuel du bouton « Publier »**. Un seul « OUI » couvre toutes les annonces d'un courtier. Nature de l'annonceur consignée dans le Radar seulement. |
| 7 | Architecture | Ambitieuse et réutilisable : socle IA commun (ADR-0076). |
| 8 | Modèles | **Configurables depuis la console super-admin.** |
| 9 | Textes juridiques | Mettre à jour les conditions d'utilisation (clauses rédigées ci-dessous). |

## Les lots

| Lot | Contenu | Ce que ça donne |
|---|---|---|
| **0. Socle IA** | `laravel/ai`, rôles de modèle, `ai_role_assignments`, registre des usages, passerelle, `ai_calls`, `ai_suggestions`, prompts versionnés, `ai:eval` et son cliquet, **console `/super-admin/ai`** | Toute fonctionnalité IA future n'est plus qu'un usage déclaré |
| **1. Chaîne complète du Radar** | Saisie (URL, texte, captures) · extraction · relecture · rapprochements · démarchage `wa.me` · preuve d'accord vérifiée · **publier pour lui** · réclamation · révocation · purge · clauses juridiques | Le catalogue se remplit, à la main |
| **2. Collecte automatique** | Adaptateurs Expat-Dakar et CoinAfrique · passages planifiés · instantanés datés · fusion des doublons entre sources · table `embeddings` | Le Radar trouve tout seul |
| **3. Annonceurs et observatoire** | Regroupement par numéro · classement des annonceurs · prix au m² · temps de mise sur le marché · carte des manques · alerte quand l'annonce source disparaît | La machine commerciale, et les chiffres du marché |
| **4. Activation et mandat** | Relance « 14 personnes ont vu votre bien » · publication sous mandat Takussan | Les comptes créés deviennent actifs |
| **5. WhatsApp automatisé** | Numéro dédié · webhook des messages entrants · classement de la réponse par l'IA · preuve par identifiant de message | Le démarchage passe à l'échelle |

## Lot 0 — le socle IA

Tout est décidé dans [ADR-0076](../adr/0076-le-socle-ia.md). Ce qui suit précise la console.

### La console `/super-admin/ai`

- **Rôles.** Pour chacun des cinq rôles (`extraction`, `redaction`, `raisonnement`, `vision`,
  `embedding`), une chaîne ordonnée de maillons *fournisseur · modèle · paramètres*. On peut en
  ajouter, en retirer et les réordonner.
- **Changer le modèle d'un rôle** ouvre un comparatif : on choisit le candidat, on lance
  l'évaluation des usages qui tiennent ce rôle, et on voit score et coût du candidat face au modèle
  en place. **Un score sous le cliquet bloque l'application**, sauf dérogation explicite, qui est
  journalisée.
- **Usages.** La liste du registre : rôle, modèle forcé éventuel, budget, coupe-circuit, coût du
  jour et du mois, taux d'acceptation, dernier score d'évaluation.
- **Fournisseurs.** Seuls ceux de la liste fermée apparaissent. Pour chacun : clé présente ou
  absente (jamais sa valeur), et un bouton pour tester la connexion.
- **Budgets.** Plafond global journalier, plafond par usage, plafond par agence.
- **Sécurité.** Lecture pour tout `super_admin`. Écriture sous second facteur récent, et chaque
  écriture est journalisée.

## Lot 1 — la chaîne complète du Radar

Tout est décidé dans [ADR-0077](../adr/0077-le-radar.md).

### Les données

| Table | Rôle | Colonnes principales |
|---|---|---|
| `radar_advertisers` | L'annonceur, une ligne par numéro | téléphone au format international (unique) · nom affiché · nature et indices · `do_not_contact_at` · empreinte HMAC du numéro · `user_id` |
| `radar_listings` | L'annonce collectée | annonceur · type de saisie · site d'origine · URL · texte brut · empreinte du contenu (unique) · champs extraits (valeur, confiance, passage cité) · rapprochements · étape · `property_id` · date de purge |
| `radar_outreaches` | Un message envoyé | annonceur · canal · texte exact · version des clauses · auteur · date · issue |
| `radar_outreach_listing` | Les annonces qu'il couvre | — |
| `radar_consents` | La preuve d'accord | démarchage · type de preuve · capture et son empreinte · identifiant de message · réponse transcrite · verdict IA · confirmée par · révoquée le |

Les étapes d'une annonce :

- parcours normal : `captured → extracted → reviewed → contacted → consented → published` ;
- sorties : `extraction_failed`, `duplicate`, `refused`, `do_not_contact`, `purged`.

### Les écrans (`/super-admin/radar`)

1. **Tableau de bord** : compteurs (à relire, à contacter, en attente, à relancer, accords à
   publier, publiés cette semaine, coût IA du jour rapporté au plafond) et files par étape,
   regroupées par annonceur à partir de « contacter ».
2. **Saisie rapide** : panneau ouvrable de partout, avec trois onglets (URL, plusieurs par ligne ;
   texte collé ; captures, plusieurs images). Une lecture d'URL impossible le dit et propose la
   saisie par texte ou par capture.
3. **Fiche annonce** : la source à gauche, les champs extraits à droite, avec badge de confiance et
   passage cité au survol. Le quartier est rapproché du référentiel géographique par du code, avec
   des suggestions. Un panneau montre la nature présumée et ses indices, un autre les
   rapprochements : même téléphone, même quartier et prix et nombre de chambres, empreinte des
   photos source calculée à la volée sans les conserver. Actions : valider la relecture, doublon
   de…, écarter. Chaque correction est une décision sur une `ai_suggestions`.
4. **Fiche annonceur** :
   - préparer le message (on coche les annonces ; clauses fixes ; l'IA ne fait que la salutation
     et le résumé) ;
   - ouvrir WhatsApp ;
   - déposer la réponse (verdict IA : accord, refus, STOP, question ou ambigu ; un humain confirme) ;
   - refus ou STOP sans capture ;
   - relances.
5. **Publication** :
   - **« Publier pour lui »** (`super_admin`). Un écran de vérification présente le compte à créer,
     les biens, les photos et les alertes de doublon, puis un job idempotent s'exécute. Ensuite,
     un second message `wa.me` est préparé : « en ligne, activez votre compte ».
   - **La réclamation** : une page publique où l'annonceur se connecte par code SMS, accepte les
     conditions, corrige et publie.

### Les usages IA

| Usage | Rôle | Reçoit | Rend |
|---|---|---|---|
| `radar.extraction` | `extraction` (+ `vision` pour les captures) | texte ou HTML nettoyé, captures | champs du bien, chacun avec valeur, confiance et passage cité · téléphones · nom · indices de nature |
| `radar.message_accord` | `redaction` | prénom, liste des annonces | salutation et résumé ; les clauses restent fixes |
| `radar.verification_accord` | `raisonnement` (+ `vision`) | captures, texte envoyé, numéro attendu | transcription · numéro concordant · clauses retrouvées · classement · confiance |

Bornes de vraisemblance écrites en code, hors de l'IA : loyer, prix de vente, surface, nombre de
pièces. Un champ sans passage cité voit sa confiance forcée au plus bas.

### Les cas d'erreur

| Cas | Comportement |
|---|---|
| Fournisseur en panne | Bascule. Si tous sont en panne, le job réessaie en espaçant les tentatives et l'annonce affiche « extraction en attente ». La saisie n'est jamais bloquée. |
| Plafond atteint | État explicite. Les annonces attendent le lendemain, ou que le plafond soit relevé. |
| Sortie invalide | Revérifiée en PHP. Une nouvelle tentative, puis `extraction_failed` avec formulaire manuel et source conservée. |
| URL | SSRF (adresses privées, boucle locale, métadonnées), `robots.txt`, fréquence par domaine, délais d'expiration. |
| Captures | Taille et type limités, EXIF retiré, empreinte conservée. |
| Numéro déjà inscrit | Pas de publication pour lui : réclamation seulement. |
| Aucune photo récupérable | Publication bloquée, avec la possibilité de déposer des photos à la main. |
| Publication interrompue | Photos d'abord, puis une transaction ; l'idempotence fait d'une nouvelle tentative une reprise. |
| STOP après publication | Biens retirés du public sur-le-champ, compte conservé. |
| Deux opérateurs | Prise en charge de 10 minutes (modèle d'ADR-0043). |
| Crédits de bienvenue | Aucun à la création, attribués à la vérification du numéro. |

### Les tests

- Suite principale **sans aucun appel réseau vers un modèle** (faux modèles du SDK).
- Droits : `support` ne publie pas, et l'API refuse sans accord.
- Idempotence, compte créé sans mot de passe, espace `individual`, présenté comme `owner`, sans
  crédits.
- Révocation, SSRF, clauses mot pour mot dans le message préparé, purge, empreinte HMAC
  conservée après un STOP.
- Chaque test de correctif est **vérifié par ablation**.
- Jeu d'évaluation : 30 à 50 annonces réelles **anonymisées avant d'entrer dans le dépôt**.
- Front : Vitest, i18n `fr`/`en` (`wo` reprend le français tant que le wolof est en pause),
  `npm run check:*`, route dans `NamespaceAccessGuardTest`.

## Le message d'accord — clauses fixes (v1)

Texte versionné, **jamais généré**. L'IA ne produit que `{salutation}` et `{resume}`.

> {salutation}
>
> Nous avons vu {resume} et nous aimerions les publier gratuitement sur Takussan, la plateforme
> immobilière du Sénégal.
>
> En répondant **OUI** à ce message :
> 1. vous nous autorisez à publier ces annonces sur takussan.com, avec leurs textes et leurs photos ;
> 2. vous confirmez être propriétaire de ces biens ou autorisé à les proposer ;
> 3. vous acceptez qu'un compte soit créé à votre nom avec ce numéro ;
> 4. vous acceptez que les visiteurs vous contactent directement à ce numéro.
>
> Vous préférez vérifier vous-même avant ? {lien_reclamation}
>
> Conditions : {lien_conditions} · Répondez **STOP** pour ne plus être contacté.

## Les textes juridiques — clauses à poser

⚠ **Ces textes entrent dans `takussan-web/src/content/legal/` dans la PR qui livre la publication
pour l'annonceur, pas avant** : la règle du dossier veut qu'un texte juridique ne promette rien que
le code ne fasse. `VERSION_DOCUMENTS` avance dans le même changement, et la traduction anglaise de
courtoisie suit. **Relecture par un avocat inscrit au barreau du Sénégal avant toute production.**
Les passages marqués ⚠ sont à trancher avec lui.

### Conditions d'utilisation (`terms.ts`) — nouvel article 6.3

> ## 6.3 Annonces reprises sur votre accord
>
> L'équipe ${EDITEUR.marque} peut repérer une annonce que vous avez publiée ailleurs (site
> d'annonces, réseau social, groupe de messagerie) et vous proposer, par un message, de la publier
> aussi sur la plateforme.
>
> Si vous acceptez, en répondant favorablement à ce message ou en suivant le lien qu'il contient :
>
> - vous nous autorisez à publier sur la plateforme les annonces que ce message énumère, avec leurs
>   textes et leurs photos, après mise en forme ;
> - vous déclarez être propriétaire de ces biens ou disposer d'un mandat ou d'une autorisation qui
>   vous permet de les proposer, et détenir les droits nécessaires à la diffusion de leurs photos :
>   les garanties de l'article 6.1 s'appliquent ;
> - vous acceptez qu'un compte soit créé à votre nom, rattaché au numéro de téléphone depuis lequel
>   vous avez répondu, avec un espace individuel où ces annonces sont publiées ;
> - vous acceptez que les visiteurs vous contactent directement à ce numéro au sujet de ces annonces.
>
> Votre réponse et le message auquel elle répond sont conservés comme preuve de votre accord.
>
> Le compte ainsi créé n'a pas de mot de passe. Vous l'activez en vous connectant avec un code reçu
> par SMS à ce numéro ; les présentes Conditions vous sont alors présentées pour acceptation.
> ⚠ Jusqu'à cette activation, votre accord vaut autorisation de publier les seules annonces
> énumérées, et aucun autre engagement de votre part.
>
> Vous pouvez retirer votre accord à tout moment, en répondant « STOP » ou en nous écrivant à
> ${EDITEUR.courriels.contact} : vos annonces sont alors retirées de la plateforme sans délai, et
> nous ne vous recontactons plus. Vous pouvez aussi demander la suppression de votre compte
> (article 17.1).

### Politique de confidentialité (`privacy.ts`)

**§ 2.3, nouvelle puce :**

> - Si vous avez publié une annonce immobilière sur un autre site, un réseau social ou un groupe de
>   messagerie, nous pouvons en relever le contenu public — texte, prix, localisation, photos, nom
>   affiché et numéro de téléphone — pour vous proposer de la publier sur la plateforme (article 6.3
>   des Conditions).

**§ 3, nouvelle finalité :**

> - **Proposer à un annonceur de publier sur la plateforme une annonce qu'il a publiée ailleurs**, et
>   conserver la preuve de son accord. ⚠ Fondement : notre intérêt légitime à développer l'offre de
>   la plateforme pour le relevé et le premier contact ; votre consentement pour la publication et
>   la création du compte.

**§ 4.3, nouvelle puce** (à n'écrire qu'avec les fournisseurs effectivement sélectionnables : la
garde d'ADR-0076 § 3 les tient d'accord) :

> - **Intelligence artificielle** : Anthropic (États-Unis) ⚠ [et tout autre fournisseur retenu] —
>   analyse du texte et des images d'une annonce pour en extraire les caractéristiques, rédaction
>   de messages, vérification d'une preuve d'accord. ⚠ Ces prestataires n'utilisent pas les données
>   transmises pour entraîner leurs modèles : à vérifier sur leurs conditions en vigueur.

**§ 6, deux nouvelles durées :**

> - **Annonces relevées ailleurs et jamais publiées** : 90 jours à compter du relevé, et effacées dès
>   que vous demandez à ne plus être contacté. Ne subsiste alors qu'une empreinte chiffrée de votre
>   numéro, qui sert seulement à ne jamais vous recontacter.
> - **Preuve de votre accord à la publication** : tant que les annonces concernées sont en ligne,
>   puis ⚠ 3 ans.

**§ 9 (droits)** : le droit d'opposition s'exerce aussi en répondant « STOP » au message reçu.

## Les prérequis hors code, à la charge du porteur

1. **La clé API Anthropic** (et celle de tout autre fournisseur retenu) dans les deux environnements
   Dokploy. Les nouvelles clés vont dans `.env.example` et `.env.docker` : `check-env-parity` les
   exigera.
2. **La déclaration du traitement à la CDP**, y compris le **transfert de données hors du Sénégal**
   vers le fournisseur du modèle (loi n° 2008-12, transferts vers un pays tiers).
3. **La relecture des clauses** par un avocat.
4. **Un téléphone et un numéro WhatsApp dédiés au Radar**, et plus tard un second numéro Meta pour
   le lot 5.

## Les tickets à créer (`/write-spec`)

- **Lot 0** :
  1. passerelle, registre, rôles de modèle, `ai_calls` ;
  2. `ai_suggestions`, prompts versionnés, `ai:eval` et son cliquet ;
  3. console `/super-admin/ai`.
- **Lot 1** :
  1. tables, saisie, extraction ;
  2. relecture et rapprochements ;
  3. démarchage et preuve d'accord ;
  4. publier pour lui, avec les clauses juridiques ;
  5. réclamation par l'annonceur ;
  6. révocation et purge.
- **Lots 2 à 5** : un ticket chacun, qui pointe vers ce plan.

Chaque ticket qui crée un modèle ajoute sa section à `docs/models-spec.md` **dans la même PR**.
