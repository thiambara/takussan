# ADR-0131 — Le copilote du fil : il propose au seul personnel de l'agence, lit ce que son lecteur lit, passe par le socle IA et n'envoie rien

- **Statut** : Accepté le 2026-11-19 (décisions du porteur, sur les recommandations de la session : copilote réservé au personnel actif de l'agence ; lecture bornée à celle du lecteur, notes d'équipe comprises ; coût au budget IA ; transcription par le fournisseur que la passerelle sait appeler, sinon contrat seul ; rien n'est envoyé ni créé sans un geste) ; amendé le même jour par le porteur (décisions 4 et 5) : interrupteurs à la plateforme et à l'agence, modèle paramétrable par fonction, transcription configurable et désactivée sans fournisseur audio (§ 8)
- **Date** : 2026-11-19
- **Tickets** : TCK-2974 à TCK-2979 (vague 97)
- **Maquette retenue** : `fil-copilote`, approche A « Au fil de la lecture » (choix du porteur du 2026-11-17)
- **Va avec** : [ADR-0128](0128-le-fil-est-l-interface-des-objets.md) (le fil est l'interface des objets), [ADR-0129](0129-le-socle-temps-reel-signale-et-l-api-sert.md) (le socle temps réel), [ADR-0130](0130-l-engagement-est-un-objet-du-fil.md) (l'engagement, lot 3 du [plan « Le Fil »](../plans/2026-11-17-le-fil.md))
- **S'appuie sur** : [ADR-0076](0076-le-socle-ia.md) (le socle IA), [ADR-0078](0078-une-connexion-de-file-pour-les-jobs-longs.md) (la file `ai`), [ADR-0038](0038-note-vocale-dans-la-messagerie.md) (la note vocale), [ADR-0031](0031-personnel-de-l-agence-et-cloisonnement-des-bailleurs.md) (le personnel de l'agence)

## Contexte

Relevé sur `feat/le-fil-lots-3-5` (`cc4c6bcae`) le 2026-11-19 :

- **Le socle IA a un seul point d'appel, et aucun usage n'est jugé par une capacité d'agence.**
  `AiGateway::run()` (`app/Services/Ai/AiGateway.php:67`) applique dans l'ordre l'autorité, le
  coupe-circuit, le budget et les données (`admit()`, `:349`), puis la chaîne du rôle et le journal
  `ai_calls`. Les sept usages du registre (`AiUsageRegistry::USAGES`, `:24`) sont ceux du Radar, de
  la recherche et du test de connexion : tous exigent un geste plateforme. `AiAuthority::allows()`
  sait déjà juger une `Capability` pour le couple (utilisateur, agence), mais rien ne l'a encore
  employé.
- **Aucune capacité ne dit « se servir de l'assistant ».** L'enum `Capability` porte 49 cas, dont
  `messaging.broadcast` et `messaging.archive` (`app/Models/Enums/Capability.php:102`). Le
  super-admin court-circuite toute capacité (`MembershipCapabilityResolver::allows()`), et un
  bailleur peut recevoir une capacité par délégation : une capacité seule ne suffit donc pas à dire
  « personnel actif de l'agence du fil ».
- **Le budget par agence existe dans le code mais vaut `null`.** `AiBudget::exhausted()`
  (`app/Services/Ai/AiBudget.php:19`) juge un plafond global (`AI_DAILY_BUDGET_USD`, 8,33 $), un
  plafond par usage (console, sinon l'usage) et un plafond par agence, lu dans
  `config('ai.budgets.daily_per_agency_usd')`, écrit `null` en dur (`config/ai.php:144`). Chaque
  appel porte déjà son `agency_id` dans `ai_calls`.
- **La garde de données ne masque rien pour un usage personnel.** `AiDataGuard::prepare()`
  (`app/Services/Ai/AiDataGuard.php:31`) masque les téléphones des seuls usages `publique` et
  refuse toute charge `sensible`. Un fil porte des noms : son usage sera `personnelle`, donc rien n'y
  serait masqué.
- **Une requête web meurt à 60 s, un job de la file `ai` doit tenir sous 85 s.** Aucun appel au
  modèle n'est fait dans une requête HTTP aujourd'hui : tous passent par un job
  (`RunsOnAiQueue`, servi par le seul `worker-ia`), et `scripts/check-queues.mjs` l'exige.
- **`AiSuggestion` ne dit pas qui a demandé.** La table `ai_suggestions` porte l'usage, l'objet
  (polymorphe), la proposition et la décision ; le demandeur n'y est que par
  `ai_call_id → ai_calls.actor_id`. `EvalCaseExporter` n'exporte que les lignes dont
  `input_snapshot` est rempli, et `RadarPurger` vide `proposal`, `input_snapshot`, `final_value` et
  `correction_diff` sans supprimer la ligne, pour garder le taux d'acceptation.
- **La passerelle ne sait pas transcrire.** `AiGateway` n'a que `run()` et `embed()`. Le SDK
  (`laravel/ai`) transcrit par OpenAI, OpenRouter et d'autres (`Transcription::of()`, faux
  `Transcription::fake()`), pas par Anthropic. Le rôle `transcription` n'existe pas
  (`AiModelRole`), aucun tarif à la minute n'est déclaré, et la préproduction n'a que
  `ANTHROPIC_API_KEY` (`docs/infra/hebergement.md`, ligne « Clé d'IA de la préproduction »).
- **La note vocale est bornée** : 60 s et 2 Mo, fichier dans la collection privée `attachments`
  (ADR-0038).
- **La politique de confidentialité ne couvre pas les conversations.** `privacy.ts` § 4.3,
  rubrique « Intelligence artificielle », cite les annonces, les messages rédigés pour le Radar et
  les recherches sans résultat, pas le contenu d'un fil ni une note vocale.

Le plan « Le Fil » prévoit au lot 4 un copilote qui résume un fil chargé, repère les promesses pour
en proposer des engagements, propose des brouillons, transcrit les notes vocales en français et
répond à « Demander au fil », sans jamais rien envoyer seul.

## Décision

**Le copilote est un ensemble d'usages du socle IA, réservés au personnel actif de l'agence du fil.
Chaque appel lit ce que son lecteur lit du fil et de ses objets, part dans un job de la file `ai`,
est payé et plafonné comme tout appel du socle, et rend une proposition qu'il est seul à voir. Rien
n'est envoyé, créé ni modifié sans le geste d'une personne, par la route ordinaire de l'objet.**

### 1. Qui a le copilote : le personnel actif de l'agence du fil, et lui seul

- Une capacité neuve, **`messaging.copilot`**, accordée par défaut aux rôles système de l'agent et
  de l'administrateur d'agence (`SystemRoleCapabilities`), jamais au bailleur ni au prestataire. Les
  agences existantes la reçoivent par `membership:reconcile-system-roles`, que joue
  `docker/release.sh`. Une agence peut la retirer d'un rôle personnalisé, et couper l'assistant pour
  toute son équipe par son réglage (§ 8).
- Une demande est servie si, **et seulement si**, le lecteur :
  - lit le fil (`ConversationAccess::allows`) ;
  - en est **participant actif** ;
  - est **personnel actif de l'agence du fil** (`EquipeDuFil::agence`,
    `PersonnelDeLAgence::personnelActifDe`) ;
  - tient `messaging.copilot` pour cette agence (`AiAuthority`, jugé par la passerelle).
- Ni le client, ni le bailleur, ni le prestataire n'ont le copilote, transcription comprise. Le
  super-admin non plus : il lit les notes d'équipe (ADR-0128, amendement du 2026-11-18), mais il
  n'est pas personnel de l'agence. Sous impersonation, toute demande est refusée
  (`EnforceImpersonationReadOnly`).
- Un fil sans agence (un fil direct sans bien, sans bail ni sujet) n'a pas de copilote.

### 2. Ce qu'il lit : ce que lit son lecteur, rien de plus

- Le copilote reçoit les messages par **`ConversationAccess::messagesLisiblesPar($lecteur, …, $fil)`**,
  le même filtre que la liste des messages. Il lit donc les notes d'équipe, puisque le personnel les
  lit. Il ne lit jamais un fil que son lecteur ne lit pas, ni un autre fil.
- Les cartes et les événements arrivent par leur **projection pour le lecteur** (ADR-0128 § 3), avec
  leurs `abilities`. Un objet `indisponible` pour lui reste indisponible pour le copilote.
- **Deux usages n'emploient jamais les notes d'équipe**, parce que leur sortie part vers le client
  ou devient un objet partagé :
  - le **brouillon de réponse** au fil ;
  - l'**extraction des promesses**.

  Les notes entrent dans le **résumé** et dans **« Demander au fil »**, dont la sortie n'est vue que
  du lecteur.
- **Masquage** : le texte envoyé au fournisseur passe par le masquage des téléphones et des
  adresses électroniques (`PhoneMasker::mask`, `EvalCaseAnonymizer::EMAIL`, comme le fait déjà
  `MotsDuSignalement::citer`), quelle que soit la classe de l'usage. Les noms restent : le résumé
  et le brouillon en ont besoin, et l'usage est `personnelle`.
  Le copilote ne transmet **aucune pièce jointe** (image, document). Un objet n'arrive que par sa
  **projection fermée** pour le lecteur (`ObjetsDesMessages`, chemins déclarés par type dans
  `SujetsDuFil::projection()`), jamais par sa ressource entière. Ces listes ne portent ni pièce
  d'identité ni revenu. C'est **elle** qui tient la donnée `sensible` (ADR-0070) hors de la charge :
  `AiDataGuard::refusalFor` ne juge que les classes que la requête déclare, pas son contenu. Un test
  par usage le garde.
- Les montants que le lecteur lit sur un objet (loyer dû, devis) peuvent partir, puisqu'un
  brouillon s'appuie sur eux (maquette A, « Brouillon qui connaît le bail ») : seule la classe
  `sensible` est exclue.
- **Contenu externe** (ADR-0076 § 10) : un message écrit par un participant est une donnée, jamais
  une consigne. Chaque usage le reçoit par `ExternalContent::wrap()`, n'a aucun outil et rend une
  sortie structurée.

### 3. Cinq usages, une file, un signal

| Usage (`usage_key`) | Rôle de modèle | Notes d'équipe | Sortie structurée |
|---|---|---|---|
| `fil.resume` | `redaction` | oui | points, chacun avec le message qu'il cite ; la question qui attend le lecteur en tête |
| `fil.question` | `redaction` | oui | réponse et sources (messages du fil, objet du fil, objets des cartes) |
| `fil.brouillon` | `redaction` | **non** | texte et appuis (objets lus) |
| `fil.promesses` | `extraction` | **non** | promesses : message source, porteur (un participant), libellé, échéance (les champs de création d'un engagement) |
| `fil.transcription` | `transcription` (neuf) | sans objet | texte |

- Chaque usage a son prompt versionné (`resources/ai/prompts/<clé>/v1.md`), sa classe `personnelle`,
  son coupe-circuit et son plafond du jour dans la console (`ai_usage_settings`), et un plafond par
  défaut déclaré par l'usage. Aucun n'est mis en cache par empreinte (usage non public).
- **Tout appel part dans un job de la file `ai`** (`RunsOnAiQueue`, `$timeout` sous 85 s), jamais
  dans la requête. La route rend `202` ; le job écrit la proposition, puis émet le signal
  **`copilote.updated`** sur le canal du **seul demandeur** (`utilisateur.{id}`, ADR-0129), sans
  donnée. Le front relit alors l'état.
- **L'état se dérive, aucune table neuve** :
  - « prête » : la dernière `AiSuggestion` de l'usage pour ce fil dont l'appel (`ai_calls.actor_id`)
    est le lecteur ;
  - « refusée » ou « en échec » : le dernier `ai_calls` du lecteur pour cet usage et ce fil, avec son
    `refusal_reason` ou son `error_code`, s'il est postérieur à sa dernière proposition **et
    journalisé le jour civil courant**, puisque les plafonds sont journaliers. Un refus passé ne
    bloque jamais une nouvelle demande ;
  - « en cours » : une marque de cache posée au dépôt du job, qui expire après 120 s. Elle sert
    aussi de verrou : une seconde demande identique pendant ce temps ne dépose pas un second job.

  Chaque lecture rejuge le § 1 : un agent parti ne relit plus ses anciennes propositions.
- **Le front sait sans demander** : `ConversationResource` porte `copilote` (booléen, calculé en lot
  pour la page). Un lecteur sans copilote n'émet aucune requête vers ses routes.
- **Le résumé ne se calcule que pour un fil chargé** : 10 messages comptés au moins (règle d'ADR-0128
  § 5) depuis le premier non-lu que le front a affiché. Le front l'envoie, puisqu'il marque le fil lu
  à l'ouverture ; l'API le rejuge. En dessous, la route refuse sans appel. Le résumé est
  **idempotent** par (lecteur, fil, fenêtre résumée), gardée dans la proposition : rouvrir le même
  fil ne paie pas deux fois.
- **« Demander au fil »** ne lit que ce fil, son sujet et les objets de ses cartes. Une source
  rendue par le modèle qui ne serait pas l'un d'eux, lisible par le lecteur, est retirée de la
  réponse avant écriture.
- **Les promesses** ne se proposent que sur des messages `all` du fil, d'un porteur participant. Un
  porteur hors du fil est écarté avant écriture. Un message déjà source d'un engagement n'est plus
  proposé : l'extraction est propre au lecteur, et deux collègues ne noteront pas deux fois la même
  promesse.

### 4. Ce que ça coûte, et comment on le refuse

- Chaque appel est journalisé avec **l'agence du fil** (`AiRequest::$agencyId`), l'acteur et le fil
  en objet. Il compte donc dans le plafond global, celui de son usage et celui de l'agence quand le
  déploiement en pose un.
- Un refus (autorité, coupe-circuit, budget, classe de données) est rendu au front par un **code
  d'erreur** qui dit pourquoi, sous `LangGroupParity` :
  - `copilote.indisponible` : hors du § 1 ;
  - `copilote.coupe` : fonction coupée à la plateforme ou par l'agence, avec sa portée (§ 8) ;
  - `copilote.budget_epuise` : un plafond du jour est atteint ;
  - `copilote.resume_inutile` : moins de 10 non-lus ;
  - `copilote.echec` : panne du fournisseur, réponse coupée ou invalide.

  Le montant d'un plafond n'est jamais montré : le front dit « limite du jour atteinte, il revient
  demain à 00:00 », et que le reste de la messagerie fonctionne.
- Le copilote coupé ou épuisé ne touche rien d'autre : messages, engagements, rappels et
  transcriptions déjà faites restent.

### 5. Il propose, une personne décide

- Le copilote n'a **aucune route d'écriture** sur un message, un engagement ou un objet. Toute sortie
  est une `AiSuggestion` en attente, vue de son seul demandeur.
- **« Utiliser ce brouillon »** met le texte dans le composeur. Seul « Envoyer », par la route
  ordinaire des messages, publie. La suggestion est ensuite décidée :
  - acceptée, si le texte envoyé est identique ;
  - corrigée, avec le différentiel, s'il a été retouché ;
  - rejetée, sur « Jeter le brouillon ».
- **« Noter l'engagement »** ouvre la création d'un engagement pré-remplie. Seule la route du lot 3 (TCK-2969, `POST /api/conversations/{conversation}/commitments`)
  le crée, avec sa politique et sa validation. La suggestion est acceptée ou corrigée au retour, et
  rejetée sur « Écarter ».
- **« Utile / Pas utile »** sur un résumé ou une réponse décide la suggestion (acceptée ou rejetée) :
  le taux d'acceptation de la console mesure la qualité de chaque usage (ADR-0076 § 7).
- Une décision ne se prend qu'une fois et par le seul demandeur (`SuggestionRecorder`, UPDATE
  conditionnel).

### 6. Ce qu'il garde, et combien de temps

- **Aucune copie de l'entrée** : `input_snapshot` reste nul pour les usages du copilote. Les fils ne
  sont donc jamais exportés en jeu d'évaluation par `EvalCaseExporter`.
- La proposition (`proposal`, `final_value`, `correction_diff`) est **vidée après 30 jours**,
  comme le fait `RadarPurger`. La ligne reste, avec `usage_key`, `decision` et `decided_at`, pour le
  taux d'acceptation.
- Une suggestion dont le fil n'est plus lisible par son demandeur ne se relit plus (§ 3).

### 7. La transcription : contrat livré, fournisseur à poser

- La passerelle gagne **`transcribe()`**, dans le même ordre que `run()` :
  1. autorité ;
  2. coupe-circuit ;
  3. budget ;
  4. données ;
  5. chaîne du rôle **`transcription`**, avec bascule ;
  6. journal `ai_calls`.

  La langue est imposée : `fr`.
- **Aucun fournisseur ne transcrit aujourd'hui.** Le rôle `transcription` naît **sans chaîne par
  défaut** dans `config/ai.php`. Seul un fournisseur dont le pilote transcrit s'y affecte, et la
  préproduction n'a la clé d'aucun. Tant que le rôle est vide, la ressource du message le dit
  (`ai.role_unassigned`, lu sur le rôle à chaque lecture) sans job ni appel, et la note s'affiche
  « Transcription indisponible ». Le jour où le rôle est affecté, les notes repassent d'elles-mêmes
  à « à transcrire ». L'usage suit le patron d'`EmbeddingUsage` : sans agent ni prompt. Aucune clé ni aucun
  identifiant de modèle n'est inventé : poser la clé d'OpenAI ou d'OpenRouter et affecter le rôle
  dans la console est un geste du porteur, après le contrat de sous-traitance (ADR-0076,
  amendement du 2026-11-16).
- La transcription est **propre au message**, pas au lecteur : une `AiSuggestion` dont l'objet est
  le message, partagée par le personnel qui lit ce message. Elle part à la **première lecture de la
  note par un membre du personnel** (il en est l'acteur, son agence paie), une fois par message. Son
  arrivée signale `message.updated` aux seuls lecteurs des notes d'équipe du fil.
- Une note dans une autre langue que le français n'est pas devinée : la transcription dit
  « Peut contenir des erreurs · la note fait foi ». Elle n'affiche « Seules les notes en français
  sont transcrites » que si le fournisseur rend une langue détectée autre que `fr`. Le wolof est en
  pause.

### 8. Les réglages : interrupteurs et modèle par fonction, sur les patrons existants

Décisions du porteur du 2026-11-19 (n° 4 et 5, puis ses réponses du même jour : défaut `true`
des réglages d'agence, plafond par agence réglable, valeurs du § 3 confirmées). Mesuré avant d'écrire : la plateforme a déjà, pour
chaque usage du registre, un coupe-circuit, un modèle forcé et un plafond (`ai_usage_settings` :
`enabled`, `forced_provider`, `forced_model`, `daily_budget_usd`), réglés dans la console
(`AiUsageController`, `AiUsagesPanel`). `ModelResolver` prend le modèle forcé avant la chaîne du
rôle. L'agence a un catalogue de réglages (`AgencySettings`, écrit par `PATCH /api/agencies/{id}`
sous `AgencyPolicy::update`), dont `watermark_enabled` suit déjà un drapeau de la plateforme. Aucun
mécanisme neuf n'est donc créé.

- **Un seul résolveur, `ReglagesDuCopilote`**, dit si une fonction est servie pour une agence
  (`etat()`, avec la raison `plateforme`, `non_configuree` ou `agence`), quelles agences la coupent
  (en lot), et les valeurs du lot : seuil du résumé (10), rétention (30 jours), plafond du jour de
  chaque fonction (1,00 $, et 0,50 $ pour la transcription). Il est posé par TCK-2974 **sur la seule
  configuration** (`config('ai.copilote')`), et branché sur la base par TCK-2979 **sans changer
  son contrat**. Ainsi aucun ticket du lot n'attend celui des réglages. Le contrat est écrit dans
  TCK-2979.
- **Le modèle n'est pas dans le résolveur** : la passerelle le résout déjà (`ModelResolver`, modèle
  forcé de l'usage, sinon chaîne du rôle).

- **À la plateforme** : chacun des cinq usages `fil.*` s'allume ou se coupe dans la console
  (`enabled`). Son modèle s'y choisit (modèle forcé de l'usage) ; à défaut, il suit la chaîne de son
  rôle dans `config/ai.php` (`redaction` pour le résumé, la question et le brouillon, `extraction`
  pour les promesses, `transcription` pour la transcription).
- **À l'agence** : deux réglages d'`AgencySettings`, écrits par l'administrateur de l'agence,
  `true` par défaut :
  - `copilot_enabled` : le résumé, « Demander au fil », le brouillon et les promesses ;
  - `voice_transcription_enabled` : la transcription.
- **L'agence ne peut qu'éteindre** : une fonction est servie si l'usage est allumé à la plateforme
  **et** si le réglage de l'agence du fil est vrai. Le réglage de l'agence ne rallume jamais un usage
  coupé ; l'écran de l'agence montre l'interrupteur grisé et dit pourquoi.
- **La transcription est « configurée »** quand le rôle `transcription` a une chaîne, ou
  `fil.transcription` un modèle forcé, d'un fournisseur sélectionnable qui transcrit. Seuls un
  fournisseur qui transcrit pour ce rôle ou cet usage, et un fournisseur qui ne transcrit pas pour un
  autre, sont acceptés (`ai.provider_role_mismatch`, comme pour les embeddings). Non configurée,
  elle est **désactivée proprement** : ni job ni appel, la note le dit, l'interrupteur de l'agence
  est grisé.
- **Le plafond IA par agence devient réglable** (patron d'ADR-0065) : une clé du catalogue des
  réglages de la plateforme (`ai.daily_budget_per_agency_usd`), éditée par le super-admin, dont le
  défaut vient de l'environnement (`AI_DAILY_BUDGET_PER_AGENCY_USD`). **Sans valeur, pas de
  plafond.** Il reste journalier, comme tout plafond du socle (ADR-0086), et vaut pour tous les
  usages IA de l'agence. `AiBudget` le lisait déjà ; seule la source change.

## Conséquences

- **Ce que ça coûte** :
  - une capacité, cinq usages, cinq prompts, un rôle de modèle ;
  - une méthode de passerelle et un composeur de la lecture du fil, masquage compris ;
  - un job par usage et un code de signal ;
  - une purge à 30 jours ;
  - un résolveur, deux réglages d'agence dans le catalogue existant, une clé du catalogue de la
    plateforme et une clé d'environnement ;
  - aucune table et aucune colonne neuves.
- **Ce que ça interdit** :
  - qu'une note d'équipe nourrisse ce qui part vers le client ;
  - qu'un participant non salarié de l'agence se serve de l'assistant ;
  - qu'une proposition se publie ou se crée sans geste ;
  - qu'un appel au modèle tienne une requête HTTP.
- **Ce que ça rend possible** :
  - l'assistant se coupe, se plafonne, se mesure et change de modèle depuis la console IA, comme le
    Radar ;
  - le taux d'acceptation dit, par usage, s'il sert.
- **Les mauvaises** :
  - la proposition arrive quelques secondes après la demande, et un `worker-ia` arrêté la laisse « en
    cours » jusqu'à l'expiration de la marque ;
  - tant que le plafond par agence n'est pas posé (défaut nul), une agence très active peut
    consommer le plafond d'un usage pour toutes les autres.

## Ce que ça ne règle pas

- **La valeur du plafond par agence** : réglable, nulle par défaut ; la poser est un geste du porteur.
- **Un plafond propre à une agence**, un choix de modèle par agence, un interrupteur par fonction
  côté agence : non demandés.
- **Le fil marqué « sans assistant »**, qu'un participant pourrait demander, et le fait de dire aux
  autres participants qu'un assistant lit le fil : **hors du lot**, par décision du porteur du
  2026-11-19.
- **Le montant repéré** (« Ajouter au devis » de la maquette) : hors du lot, le devis a ses routes.
- **« Demander au fil » au-delà du fil** (l'historique du logement, une intervention passée) : il
  demanderait des outils de lecture jugés pour le couple (utilisateur, agence) (ADR-0076 § 9).
- **Le tarif d'une transcription** : le calcul des coûts compte des jetons. Un fournisseur qui
  facture à la minute demandera un tarif déclaré avant l'affectation du rôle.
- **Les jeux d'évaluation** des cinq usages : à constituer à partir de cas anonymisés écrits à la
  main, puisque les fils n'en fournissent pas (§ 6).

## Options écartées

- **Le panneau à part (approche B) et la commande « / » (approche C)** : écartés par le choix de la
  maquette A, qui met la proposition au point où la décision se prend.
- **Un appel dans la requête HTTP** : plus simple, mais un résumé long dépasse les 60 s d'une
  requête, et aucun usage du socle ne le fait.
- **Une table des demandes du copilote** : elle doublerait `ai_calls` (qui sait déjà qui a demandé
  quoi, quand, et pourquoi c'est refusé) et `ai_suggestions`.
- **Les notes d'équipe dans le brouillon** : le modèle les paraphraserait dans un texte destiné au
  client, et la relecture humaine serait la seule barrière.
- **La transcription pour tous les participants** : elle ferait payer à l'agence l'usage du client,
  et le porteur réserve le copilote au personnel.

## Application

- Capacité `Capability::MessagingCopilot`, `SystemRoleCapabilities`, `CapabilityEnforcementInventory`.
- Usages `app/Ai/Usages/Fil*Usage.php`, agents `app/Ai/Agents/`, registre `AiUsageRegistry::USAGES`,
  prompts et `versions.lock.json`.
- Le composeur de la lecture du fil, et la garde du § 1, sous `app/Services/Messaging/` (noms
  libres).
- `AiGateway::transcribe()`, `AiModelRole::Transcription`, `TranscriptionUsage`.
- `AgencySettings` : `copilot_enabled`, `voice_transcription_enabled`.
- `CodeDeSignal::CopiloteUpdated`.
- Gardes :
  - `check-ai-usages.mjs` ;
  - `check-queues.mjs` ;
  - `LangGroupParity` ;
  - `ProtectedActionsCoverageTest` ;
  - une matrice de non-fuite par usage, vérifiée par ablation : un client, un bailleur, un
    super-admin et un agent d'une autre agence sont refusés ; aucune note d'équipe n'entre dans
    l'entrée du brouillon ni des promesses ; le masquage est relevé sur l'entrée reçue par le faux
    modèle ;
  - la règle de combinaison plateforme × agence, testée dans les deux ordres et par ablation.
- Tickets TCK-2974 à TCK-2979 ; les réglages sont TCK-2979.
