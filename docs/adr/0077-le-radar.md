# ADR-0077 — Le Radar collecte hors du catalogue, et un bien n'y entre que sur un accord prouvé de son annonceur

- **Statut** : Accepté
- **Date** : 2026-10-26
- **Tickets** : TCK-2386 à TCK-2391 (lot 1 du [plan Radar et socle IA](../plans/2026-10-26-radar-et-socle-ia.md)) ; lots 2 à 5 : TCK-2392 à TCK-2395
- **Dépend de** : [ADR-0076](0076-le-socle-ia.md) (le socle IA)

## Contexte

Le porteur veut remplir le catalogue avant l'ouverture de la production, à partir des annonces
publiées ailleurs (CoinAfrique, Expat-Dakar, groupes WhatsApp et Facebook), **après vérification
et contact de l'annonceur**. Selon lui, **plus de 90 % de ces annonces viennent de courtiers**.

Mesuré sur `dev` `ac1ac129` le 2026-10-26 :

- **Le compte « particulier » existe déjà.** Le bouton « Publier » crée sans aucune question une
  agence `individual` (« Espace de {prénom} »), dont l'utilisateur est à la fois
  `AgencyAdminProfile` et `OwnerProfile` (`features.md` § 1.12, TCK-633). La surface publique la
  présente comme `owner` (`PublicProfileFacts::rolesPublics`, TCK-573, TCK-1077). La porte vers
  l'agence est la demande de passage en agence (`AgencyUpgradeRequest`).
- **Le courtier a quitté le code** (ADR-0030, 2026-10-06). Le réintroduire serait une fonctionnalité
  neuve, avec sa propre spec et son propre ADR.
- **Le téléphone vérifié est un identifiant de connexion** (ADR-0033).
- **WhatsApp** : un pilote d'envoi par l'API Cloud de Meta existe (`CloudApiWhatsappDriver`,
  TCK-282), avec le webhook des accusés de livraison (TCK-283). **Aucune réception de message
  entrant.** Ce numéro porte les notifications de bail, de visite et de paiement.
- **Le doublon entre publieurs est déjà détecté** : empreinte dHash (`MediaFingerprint`) et
  `DuplicateSuspicion` (ADR-0054). La prise en charge temporaire d'un élément existe pour la
  modération (`ModerationClaim`, ADR-0043).
- **Les textes juridiques ne promettent rien que le code ne fasse**
  (`takussan-web/src/content/legal/README.md`).

Trois contraintes extérieures au code :

- **Meta** n'autorise un premier message d'entreprise que vers une personne qui a accepté d'être
  contactée par elle, et un numéro trouvé sur une annonce ne compte pas comme une acceptation. Des
  signalements « spam » dégradent puis bloquent le numéro.
- **Un numéro de téléphone collecté est une donnée personnelle** (loi n° 2008-12).
- **Les photos d'une annonce appartiennent à son annonceur.**

## Décision

**Une annonce collectée vit dans les tables du Radar, jamais dans `properties`, tant que son
annonceur n'a pas donné un accord prouvé. Cet accord crée, ou fait réclamer par l'annonceur, un
espace individuel ordinaire.**

1. **Des tables à part, préfixées `radar_`** : `radar_advertisers` (une ligne par numéro de
   téléphone, au format international, unique), `radar_listings`, `radar_outreaches`,
   `radar_outreach_listing`, `radar_consents`. **`properties` ne reçoit aucune colonne** : c'est
   `radar_listings.property_id` qui pointe vers le bien publié.

2. **Le démarchage et l'accord se rattachent à l'annonceur, pas à l'annonce.** Un message couvre une
   liste d'annonces (`radar_outreach_listing`), et **un seul accord couvre toutes les annonces que
   le message listait**. C'est la condition du remplissage rapide quand 90 % des annonceurs en
   portent plusieurs.

3. **La preuve d'accord ne dépend pas du canal.** `radar_consents` porte un type de preuve :
   - **la capture d'écran** de l'échange, dont l'empreinte est conservée et que l'usage
     `radar.verification_accord` vérifie ;
   - **l'identifiant de message du fournisseur**, pour le canal automatisé ;
   - **la connexion par code SMS** de l'annonceur qui réclame lui-même son annonce.

   Une preuve n'est valide qu'**une fois confirmée par un humain**, et elle n'est jamais purgée tant
   que le bien qu'elle justifie existe.

4. **Le message d'accord a des clauses fixes.** Publication avec les photos, compte créé à ce
   numéro, contact direct des visiteurs, **déclaration d'être autorisé à diffuser ces biens**, STOP.
   Ces clauses sont un texte versionné du dépôt, **jamais une génération** : l'IA ne personnalise
   que la salutation et le résumé de la liste. Une clause juridique ne dépend pas d'un modèle, et
   sa présence se vérifie sur la capture.

5. **Deux canaux, dans cet ordre.**
   - **Lot 1 : WhatsApp manuel.** Un lien `wa.me` pré-rempli, envoyé par une personne depuis un
     **téléphone dédié au Radar**.
   - **Lot 5 : l'API Cloud**, sur un **numéro distinct de celui des notifications**.

   **Le numéro des notifications ne sert jamais à prospecter** : son blocage couperait les
   notifications des baux.

6. **« Publier pour lui » crée un espace individuel par le chemin du bouton « Publier ».** Il n'y a
   pas de nouveau type de compte et le courtier n'est pas réintroduit (ADR-0030 est respecté).
   - L'utilisateur est créé **sans mot de passe**. Sa première connexion par code SMS vérifie son
     numéro (ADR-0033) et lui fait accepter les conditions d'utilisation.
   - Aucun crédit de bienvenue n'est donné à la création : il arrive à la vérification du numéro,
     comme pour tout le monde.
   - L'action est réservée au niveau `super_admin` du profil plateforme.
   - **L'API refuse sans accord valide** qui couvre chaque annonce.
   - Le traitement est idempotent (ADR-0072) et transactionnel, et les photos sont téléchargées
     **avant** la création.
   - **Si le numéro appartient déjà à un utilisateur**, la publication pour lui est refusée et seule
     la réclamation est proposée : le Radar ne touche jamais à un compte existant.

7. **La nature de l'annonceur reste dans le Radar.** « Propriétaire probable », « intermédiaire
   probable », « agence » ou « inconnue », avec ses indices, est consigné dans `radar_advertisers`,
   **jamais dans les profils**. La surface publique présente l'espace comme elle présente tout
   espace individuel. Si une offre « pro solo » doit naître un jour, la part de courtiers mesurée
   par le Radar en sera l'argument : la décision ne se prend pas ici.

8. **La révocation retire du public.** Un STOP, ou une révocation après publication, passe
   l'annonceur en « ne plus contacter » (définitif) et **retire ses biens de la surface publique
   sur-le-champ**. Le compte reste. Sa suppression suit la voie de suppression de compte existante.

9. **La purge.** Le texte brut, les captures et le téléphone d'une annonce **jamais publiée**
   s'effacent 90 jours après la collecte, ou dès un STOP. Restent :
   - des compteurs anonymes ;
   - pour un annonceur qui a demandé à ne plus être contacté, une **empreinte à clé (HMAC) de son
     numéro**, et rien d'autre. Sans elle, le Radar le retrouverait sur une prochaine annonce et
     le recontacterait : effacer son numéro en clair ne doit pas effacer son refus.

   Après le retrait du dernier bien qu'elle couvre, une preuve d'accord est conservée pendant la
   durée fixée par la politique de confidentialité, puis effacée.

   **Amendement proposé (TCK-2406, 2026-10-30), non en vigueur.** La matière collectée d'une
   annonce **publiée** (texte brut, adresse de la source, extraction, réserve de photos, captures),
   puis le numéro en clair de son annonceur, s'effaceraient avec la dernière preuve qui la couvre :
   trois ans après le retrait du bien, s'il n'est pas revenu en ligne. Le code existe derrière
   `radar.purge_published_material`, **éteint**. L'allumer revient au porteur, après relecture par
   l'avocat, dans la PR qui modifie `privacy.ts` § 6 et fait avancer `VERSION_DOCUMENTS`.

   Les copies que la publication écrit sur les biens se rangent sous un préfixe à elles
   (`publications/{id du média}/`, TCK-2406) : la purge y balaie, sur les deux disques, les
   dossiers qu'une requête coupée a laissés sans ligne `media`.

10. **La collecte est polie et protégée.** La lecture d'une URL refuse les adresses privées, de
    boucle locale et de métadonnées (SSRF). Elle respecte le `robots.txt` et limite la fréquence par
    domaine. Airbnb est hors périmètre : sa protection anti-robot, ses conditions d'utilisation et
    la location courte durée en font un autre sujet.

11. **Les droits** : le niveau `support` du profil plateforme saisit, relit, démarche et dépose les
    preuves. Seul `super_admin` publie pour l'annonceur. Deux opérateurs ne travaillent pas en même
    temps sur le même annonceur : une prise en charge de 10 minutes, sur le modèle d'ADR-0043.

## Conséquences

- **Le catalogue se remplit dès le lot 1**, avec ce que l'équipe trouve à la main. La collecte
  automatique (lot 2) n'automatisera que la fourniture des URL.
- **Chaque publication crée un compte à activer** : la relance d'activation (lot 4) devient le levier
  qui transforme le remplissage en utilisateurs.
- **La preuve par capture est de valeur moyenne** : une capture se falsifie. On l'accepte au lot 1
  parce que seul `super_admin` publie, que l'empreinte du fichier est conservée et que tout est
  journalisé. Les preuves fortes sont la réclamation par code SMS (dès le lot 1) et l'identifiant
  de message Meta (lot 5).
- **Le doublon entre courtiers est la règle, pas l'exception** : la vérification avant publication
  montre au super-admin les rapprochements (ADR-0054). La décision reste humaine.
- **Les textes juridiques changent avec le code.** Les clauses rédigées dans le plan entrent dans
  `terms.ts` et `privacy.ts` dans la PR qui livre la publication pour l'annonceur, et
  `VERSION_DOCUMENTS` avance.
- **Prérequis hors code, à la charge du porteur** : la déclaration du traitement à la CDP, la relecture
  des clauses par un avocat, le téléphone et le numéro dédiés au Radar.

## Application

À écrire par TCK-2386 à TCK-2391. Ce qui empêchera la régression :

- test « la publication pour l'annonceur refuse sans accord valide couvrant chaque annonce » ;
- test « un numéro déjà inscrit ne crée pas de compte » ;
- test « aucun crédit de bienvenue à la création » ;
- test « la révocation retire les biens du public » ;
- tests de la protection SSRF ;
- test « le message préparé contient les clauses fixes, mot pour mot » ;
- tâche de purge inscrite au suivi des tâches planifiées ;
- sections de `docs/models-spec.md` ajoutées dans la même PR que chaque modèle (`check-models-spec`).
