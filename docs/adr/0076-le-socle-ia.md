# ADR-0076 — Aucune fonctionnalité n'appelle un modèle : elle déclare un usage, et le socle IA l'exécute

- **Statut** : Accepté
- **Date** : 2026-10-26
- **Tickets** : TCK-2383, TCK-2384, TCK-2385 (lot 0 du [plan Radar et socle IA](../plans/2026-10-26-radar-et-socle-ia.md)) ; TCK-344 s'y rattache
- **Premier usager** : [ADR-0077](0077-le-radar.md) (le Radar)

## Contexte

Mesuré sur `dev` `ac1ac129` le 2026-10-26 :

- **Aucune IA dans le dépôt.** `laravel/ai` n'est pas dans `takussan-api/composer.json`, aucun appel
  à un fournisseur de modèle n'existe, aucune clé n'est dans `.env.example`.
- **pgvector est disponible, inutilisé.** L'image est `pgvector/pgvector:pg17` (ADR-0020, TCK-344),
  mais aucune migration ne déclare de colonne `vector`.
- **Ce dont un socle a besoin existe déjà ailleurs, par morceaux** : drapeaux de fonctionnalité
  (`FeatureFlag`), journal d'activité (`spatie/laravel-activitylog`), masquage de données
  (`WebhookPayloadRedactor::maskPhone`), garde de second facteur récent (`RequireRecentTwoFactor`),
  secrets chiffrés (`Integration::$casts` `encrypted:array`), crédits d'espace (ADR-0061),
  clé d'idempotence (ADR-0072).

Le 2026-10-26, le porteur a décidé que l'outil de remplissage du catalogue (le Radar, ADR-0077)
serait construit sur **une base réutilisable pour toute intégration IA future de l'application**,
et que **les modèles se configurent depuis la console super-admin**.

Le risque qu'on écarte : chaque fonctionnalité appelle un modèle à sa façon. Les noms de modèle se
retrouvent dans le code, chaque appel invente sa propre gestion du budget, des données personnelles
et des erreurs. Et le jour où l'on veut savoir ce que l'IA coûte ou ce qu'elle a vu, la réponse
n'existe nulle part.

## Décision

**Toute utilisation d'un modèle passe par le socle IA. Une fonctionnalité déclare un *usage*. Le
socle choisit le modèle, contrôle le budget et les données, journalise l'appel et le rend
évaluable.**

1. **`laravel/ai` est l'unique client des fournisseurs.** Le SDK officiel de Laravel 13 fournit
   les agents, la sortie structurée, les pièces jointes (vision), la bascule entre fournisseurs,
   la file de jobs, les embeddings et de faux modèles pour les tests. Ses migrations publiées sont
   relues avant d'être acceptées.

2. **Le code demande un *rôle de modèle*, jamais un modèle.** Les rôles sont fermés et nommés en code
   (`extraction`, `redaction`, `raisonnement`, `vision`, `embedding`). **L'affectation d'un rôle à
   une chaîne de modèles se fait dans la console super-admin** : un fournisseur et un modèle par
   maillon, dans l'ordre de bascule, avec son plafond de tokens. *(Amendé le 2026-10-27 : la
   température est retirée, l'API d'Anthropic refusant `temperature`, `top_p` et `top_k` sur tous
   ses modèles depuis le 2026-10-21.)* Elle
   est stockée en base (`ai_role_assignments`), avec un repli sur `config/ai.php` quand la base
   est vide. Toute modification est journalisée et exige un second facteur récent, comme le
   catalogue des réglages (ADR-0065).

3. **Les clés des fournisseurs restent dans l'environnement** (Dokploy, ADR-0069), jamais en base ni
   dans la console. La console affiche seulement, pour chaque fournisseur, si une clé est présente,
   et propose un bouton « tester la connexion ». Un secret qui s'édite dans une page web devient un
   secret qui fuit par une capture d'écran ou par une session usurpée.

   **On ne choisit dans la console qu'un fournisseur nommé par la politique de confidentialité.**
   La liste des fournisseurs sélectionnables est fermée en configuration, et une garde vérifie
   qu'elle concorde avec les sous-traitants cités dans `privacy.ts`. Sans cette garde, deux clics
   enverraient des données personnelles à un sous-traitant que le texte ne déclare pas.

4. **Le registre des usages.** Chaque usage est une classe déclarée qui porte : sa clé
   (`radar.extraction`…), son rôle de modèle, son prompt versionné, son budget, la `Capability`
   requise pour le déclencher, et la **classe de données** qu'il a le droit d'envoyer
   (`publique`, `personnelle`, `sensible`). Une donnée de la classe `sensible` (pièce d'identité,
   revenu : ADR-0070) ne part **jamais** vers un fournisseur. **Une garde casse si un agent
   `laravel/ai` existe sans usage déclaré.** Dans la console, chaque usage peut **forcer un modèle**
   à la place de celui de son rôle, par exemple pour en essayer un. Ce modèle forcé, le
   coupe-circuit et le plafond de l'usage vivent dans **`ai_usage_settings`**.

5. **La passerelle.** Tout appel passe par un seul point, qui applique dans l'ordre :
   1. l'autorité de l'appelant (la `Capability` ou le geste plateforme de l'usage) ;
   2. le coupe-circuit de l'usage (`ai_usage_settings.enabled`) ;
   3. le budget (global, par usage, par agence) ;
   4. les données : refus d'une classe interdite, masquage selon la classe ;
   5. le cache par empreinte du contenu ;
   6. l'appel, avec bascule ;
   7. le journal.

   *(Amendé le 2026-10-27 : le coupe-circuit n'est pas un drapeau de fonctionnalité. Le catalogue
   `Flag` est fermé et une clé hors catalogue y vaut faux : un drapeau `ai.<usage>` aurait coupé
   tout usage par défaut. L'autorité passe en tête : un refus de droit ne doit rien coûter ni rien
   révéler.)*

   Le journal est la table **`ai_calls`** : usage, rôle, fournisseur, modèle, version du prompt,
   tokens (y compris le cache), coût estimé, durée, issue, agence, objet concerné (polymorphe).
   Chaque appel rattaché à une agence pourra un jour être payé en crédits d'espace (ADR-0061) :
   le compteur existe dès le premier jour, la facturation ne se décide pas ici.

6. **Les prompts sont du code** : des fichiers versionnés sous `takussan-api/resources/ai/prompts/`,
   relus en PR. La version utilisée est inscrite à chaque appel.

7. **L'IA propose, un humain décide.** Toute sortie qui modifierait une donnée devient une ligne
   **`ai_suggestions`** : usage, objet, proposition, confiance, puis la décision (acceptée, corrigée,
   rejetée), qui l'a prise, et **le différentiel de la correction**. Deux conséquences :
   - le **taux d'acceptation par usage** est la mesure de qualité en production ;
   - **les corrections alimentent les jeux d'évaluation**.

8. **Les évaluations ont un cliquet.** La suite de tests n'appelle **jamais** un vrai modèle : elle
   utilise les faux modèles du SDK. Les évaluations se lancent à part, avec
   `php artisan ai:eval <usage> [--model=…]`, sur un jeu de cas **anonymisés** versionné. Elles
   rendent un score par champ et un coût. Un score enregistré par usage sert de cliquet : un
   changement de prompt ou de modèle qui le fait baisser est refusé. Dans la console, **affecter
   un nouveau modèle à un rôle propose d'abord de l'évaluer** (score et coût comparés au modèle
   en place) avant d'appliquer. Elles se lancent la nuit et à la demande, jamais à chaque PR :
   elles coûtent de l'argent.

9. **L'agence reste la frontière d'isolation, y compris pour l'IA.** Les outils qu'un agent peut
   appeler enveloppent des lectures existantes et sont jugés pour le couple
   *(utilisateur, agence)*, comme le reste du code (principe 2 de `CLAUDE.md`). Un outil qui
   écrit exige l'approbation humaine du SDK.

10. **Un contenu externe est une donnée, jamais une consigne.** Un usage qui lit un contenu venu de
    l'extérieur (une annonce collectée, une capture, un message) n'a **aucun outil d'écriture**,
    ne produit que sa sortie structurée, et reçoit ce contenu dans un bloc délimité, présenté au
    modèle comme une donnée à analyser.

11. **Le socle sémantique est une seule table**, `embeddings` (objet polymorphe, modèle, dimension,
    vecteur pgvector, empreinte du contenu). Elle est **conçue ici et créée par son premier
    usager** (le lot 2 du Radar), pas avant.

12. **La console IA du super-admin**, sous `/super-admin/ai` :
    - affectation des rôles et modèles forcés par usage ;
    - présence des clés et test de connexion ;
    - budgets et coupe-circuits par usage (`ai_usage_settings`) ;
    - coût et latence par usage et par jour ;
    - taux d'acceptation ;
    - scores d'évaluation.

## Conséquences

- **Ajouter une fonctionnalité IA revient à déclarer un usage** : une classe, un prompt, un jeu
  d'évaluation. Ni client HTTP, ni compteur, ni masquage à réécrire.
- **Changer de modèle ou de fournisseur ne demande ni commit ni déploiement**, mais cette liberté a
  une garde : l'évaluation proposée avant d'appliquer, et le journal de qui a changé quoi.
- **Coût d'entrée** : le lot 0 construit le registre, la passerelle, `ai_role_assignments`,
  `ai_calls`, `ai_suggestions`, les prompts versionnés, `ai:eval` et une console minimale avant
  que la moindre fonctionnalité visible n'existe. On l'accepte parce que chaque usage suivant
  en hérite gratuitement.
- **Ce qui n'est pas construit au lot 0** : la table `embeddings` et les outils métier. Ils sont
  dessinés ici pour que leurs jointures soient prévues, et posés quand leur premier usager arrive.
- **Un nouveau sous-traitant de données personnelles** apparaît (le fournisseur du modèle). La
  politique de confidentialité le nomme **dans la même PR que le premier appel réel**
  (`takussan-web/src/content/legal/README.md` : « un nouveau prestataire se reporte ici dans le
  même changement »).
- **Interdit** : un nom de modèle dans le code applicatif, un appel à un fournisseur hors de la
  passerelle, une clé de fournisseur en base, un test qui joint un vrai modèle.

## Application

À écrire par TCK-2383 à TCK-2385. Ce qui empêchera la régression :

- garde « tout agent `laravel/ai` est un usage déclaré » ;
- garde « aucun identifiant de modèle hors de `config/ai.php` et des jeux d'évaluation » ;
- test « une donnée `sensible` ne quitte pas la passerelle » ;
- tests de la passerelle (budget, coupe-circuit, cache, journal) sur les faux modèles du SDK ;
- route `/super-admin/ai` inscrite dans `NamespaceAccessGuardTest`.
