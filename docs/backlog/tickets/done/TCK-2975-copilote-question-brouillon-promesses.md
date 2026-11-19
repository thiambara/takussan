---
id: TCK-2975
title: "Le copilote côté données, les trois propositions : « Demander au fil », le brouillon de réponse sans notes d'équipe, les promesses proposées en engagements, et la décision de chaque suggestion"
status: done
phase: P2
family: back
estimate: L
wave: 97
created: 2026-11-19
updated: 2026-11-19
depends_on: [TCK-2974, TCK-2969]
blocks: [TCK-2977, TCK-2978]
spec_refs:
  features:
    - docs/features.md#17-communication--messagerie
    - docs/features.md#211-socle-ia
  models:
    - docs/models-spec.md#105-aisuggestion-
    - docs/models-spec.md#20-message-
tags: [back, messagerie, le-fil, copilote, ia, engagements, adr-0131, adr-0076]
---

## Objectif utilisateur

- **L'agent ou l'administrateur d'agence** :
  - pose une question sur le fil (« Le plombier a-t-il déjà confirmé ? ») et reçoit une réponse
    sourcée ;
  - demande un brouillon de réponse qui s'appuie sur l'état des objets du fil (loyer dû, paiement
    absent, engagement en retard) ;
  - voit sous un message la promesse qui s'y trouve (« Je repasse jeudi à 10 h »), prête à devenir
    un engagement.

  Lui seul voit ces propositions. Seul son geste envoie le brouillon ou crée l'engagement, par les
  routes ordinaires.

## Contrat de données

- **ADR-0131** §§ 2, 3 et 5. Le socle (garde, lecture du fil, job, état, signal, codes, purge) est
  celui de TCK-2974 : ce ticket ajoute trois sortes à la liste fermée de
  `POST /api/conversations/{conversation}/copilote/{sorte}` et à l'état de `GET …/copilote`.
- **`fil.question`** (rôle `redaction`, notes d'équipe **comprises**) :
  - corps `{question}` : texte, 500 caractères au plus, requis. La question est une saisie du
    lecteur ; elle est délimitée à part du contenu du fil ;
  - entrée : les 300 derniers messages lisibles, la projection du sujet du fil et celles des objets
    de ses cartes ;
  - sortie `{reponse, sources: [{type: message|objet, id, objet_type?}]}`. Toute source qui n'est ni
    un message de l'entrée ni le sujet ni un objet de carte lisible par le lecteur est **retirée**
    avant écriture. Une réponse sans source garde sa réponse, avec `sources: []`.
  - Chaque question est une demande à elle : pas d'idempotence. La marque « en cours » empêche deux
    questions simultanées sur le même fil. La proposition enregistrée porte la question avec la
    réponse (`{question, reponse, sources}`), puisque `input_snapshot` reste nul ; la purge à 30 jours
    les vide ensemble.
- **`fil.brouillon`** (rôle `redaction`, **sans notes d'équipe** : l'option de la lecture du fil de
  TCK-2974) :
  - corps `{ton?: court|normal}`, `normal` par défaut (« Plus court » de la maquette) ;
  - entrée : les 50 derniers messages `all`, la projection du sujet pour le lecteur, et les
    engagements ouverts ou en retard rattachés au fil (lot 3, lus par leur politique) ;
  - sortie `{texte, appuis: [{type, id}]}`, appuis bornés comme les sources ci-dessus.
- **`fil.promesses`** (rôle `extraction`, **sans notes d'équipe**) :
  - entrée : les messages `all` postérieurs à la dernière extraction du lecteur sur ce fil
    (`ai_suggestions` de l'usage, sujet = le fil, `ai_calls.actor_id` = lui), plus 10 messages de
    contexte. Aucun nouveau message compté → `200` avec l'état courant, sans appel ;
  - sortie `{promesses: [{message_id, porteur_id, libelle, echeance (ISO 8601 ou null)}]}`. Les
    champs sont ceux du corps de `POST /api/conversations/{conversation}/commitments` (TCK-2969) :
    `source_message_id`, `holder_id`, `title`, `due_at`. L'objet de l'engagement n'est pas proposé,
    puisque la route du lot 3 le dérive du fil ;
  - écartées avant écriture :
    - une promesse dont le `message_id` n'est pas un message `all` de l'entrée (le lot 3 refuse
      aussi une note en source : `commitment.team_note_source`) ;
    - une promesse dont le porteur n'est pas un participant actif du fil ;
    - une échéance passée (`commitment.due_in_past`), ramenée à `null` ;
  - **une suggestion par promesse** (`SuggestionRecorder::record()` avec `$proposal`), pour qu'elle
    se décide seule ;
  - **pas de doublon entre collègues** : l'extraction est propre au lecteur, mais un message qui est
    déjà la source d'un engagement (`source_message_id`, TCK-2969) est exclu de l'entrée. Une
    promesse en attente dont le message est devenu source d'un engagement depuis n'est plus rendue
    par `GET …/copilote` : un collègue l'a notée.
- **Décision** : `PUT /api/copilote/suggestions/{suggestion}/decision` (nom libre), corps
  `{decision: accepted|edited|rejected, final?: object}`.
  - Seul le demandeur (`ai_calls.actor_id`), encore servi par la garde de TCK-2974 sur le fil de la
    suggestion, décide. Sinon 404.
  - La décision passe par `SuggestionRecorder::accept`, `edit` ou `reject`, une seule fois : 409
    `copilote.deja_decidee` sinon (`LogicException('ai.suggestion_already_decided')`).
  - Une suggestion purgée (`proposal = []`) ne se décide plus : 410.
  - `final` est le texte envoyé (brouillon) ou les champs de l'engagement créé (promesse).
- **Engagement** : ce ticket **ne crée aucun engagement**. La route de création est celle du lot 3
  (TCK-2969, `POST /api/conversations/{conversation}/commitments`), appelée par le front au geste
  « Noter l'engagement » depuis le formulaire de TCK-2972. La proposition porte ce qu'il faut pour
  le pré-remplir. Elle ne porte aucun identifiant d'engagement.

## Contraintes strictes (métier)

- **Une note d'équipe n'entre jamais dans l'entrée d'un brouillon ni d'une extraction de
  promesses**, même pour le personnel qui la lit.
- **Aucune route du copilote n'écrit un message, un engagement ou un objet.** Le brouillon n'est
  publié que par `POST /api/conversations/{conversation}/messages`, appelé par le front au geste
  « Envoyer ».
- **« Demander au fil » ne lit que ce fil** : ni un autre fil, ni l'historique du bien hors des
  objets du fil (ADR-0131, « Ce que ça ne règle pas »).
- **La décision d'un autre** est refusée en 404, sans dire que la suggestion existe.

## Delta à produire

- [ ] `FilQuestionUsage`, `FilBrouillonUsage`, `FilPromessesUsage`, leurs agents, leurs prompts v1,
  `AiUsageRegistry::USAGES`, `versions.lock.json`. Plafond par défaut `1.00` $ par jour chacun.
- [ ] Les trois sortes dans la liste fermée de la route, leur validation, leurs jobs (même patron
  que TCK-2974) et leur état.
- [ ] Le filtrage des sources, appuis et promesses avant écriture (un service partagé, nom libre).
- [ ] La route de décision, sa requête, ses codes sous `LangGroupParity`, `ProtectedActionsCoverageTest`.
- [ ] Tests, sur le faux modèle du SDK :
  - non-fuite des notes : une note d'équipe écrite dans le fil est **absente** de l'entrée reçue
    par le faux modèle pour `brouillon` et `promesses`, et **présente** pour `question` ;
  - filtrage : une source vers un message d'un autre fil, un porteur non participant, un objet
    d'une autre agence, chacun retiré ;
  - promesses : pas d'appel sans nouveau message ; une suggestion par promesse ; un message déjà source d'un engagement exclu de l'entrée, et une promesse en attente masquée une fois son message noté par un collègue ;
  - décision : demandeur seul, une seule fois, collègue refusé en 404, suggestion purgée en 410,
    `edited` garde son différentiel.

## Critères d'acceptation

- [x] **AC1** — Pour `brouillon` et `promesses`, une note d'équipe n'est pas dans l'entrée du faux
  modèle. **Ablation** : passer la lecture du fil avec notes pour ces usages fait rougir les deux
  tests. — preuve : takussan-api/tests/Feature/Messaging/Copilote/CopiloteBrouillonQuestionTest::test_ac1_… et CopilotePromessesTest::test_ac1_ac2_… ; ablation relevée dans les notes
- [x] **AC2** — Une source, un appui ou une promesse hors du fil est retiré avant écriture.
  **Ablation** : retirer le filtrage fait rougir les trois cas. — preuve : takussan-api/tests/Feature/Messaging/Copilote/CopiloteBrouillonQuestionTest::test_ac2_… et CopilotePromessesTest::test_ac1_ac2_… ; ablation relevée dans les notes
- [x] **AC3** — Aucun message ni engagement n'est créé par une route du copilote : le nombre de lignes
  `messages` et des engagements est inchangé après chaque sorte et après une décision `accepted`. — preuve : takussan-api/tests/Feature/Messaging/Copilote/CopiloteBrouillonQuestionTest::test_ac3_… (compte messages et commitments) ; CopiloteDecisionTest::test_le_demandeur_accepte_une_seule_fois_sans_ecrire_de_message
- [x] **AC4** — Un collègue du même fil ne lit pas la réponse de l'autre (`GET …/copilote`) et ne
  peut pas la décider (404). — preuve : takussan-api/tests/Feature/Messaging/Copilote/CopiloteBrouillonQuestionTest::test_ac3_… (GET état : collègue voit « aucun ») ; CopiloteDecisionTest::test_un_collegue_du_meme_fil_… (404)
- [x] **AC5** — `check-ai-usages.mjs` et `check-queues.mjs` verts ; `LangGroupParity` vert ; Pint
  propre ; tests des fichiers touchés verts. — preuve : check-ai-usages.mjs et check-queues.mjs ok, LangGroupParity 4 verts, Pint passed, 27 tests copilote/engagements verts

## Hors périmètre

- L'écran du brouillon, des promesses et de « Demander au fil » : TCK-2977 et TCK-2978.
- Le montant repéré et « Ajouter au devis » de la maquette.
- « Demander au fil » au-delà du fil (outils de lecture du SDK).
- La création de l'engagement : lot 3.

## Notes d'implémentation

**2026-11-19 — fait en deux passes : brouillon, décision, question (1re), puis promesses et engagements du brouillon (2de).**

- `fil.brouillon` et `fil.question` (`FilBrouillonUsage`, `FilQuestionUsage`, agents `FilBrouillon` / `FilQuestion`,
  prompts v1 + `versions.lock.json`, `AiUsageRegistry`), sortes `brouillon` et `question` de `SortesDuCopilote`.
  Le job `DemanderAuCopilote` porte une `demande` (`{question}` ou `{ton}`) ; son entrée :
  - brouillon : `LectureDuFilPourIa::lire(avecNotes: false, max: 50, contexte: 0)` — **aucune note d'équipe** ;
  - question : `lire(avecNotes: true, max: 300)`, la question dans un bloc `ExternalContent::wrap('question', …)`
    à part du fil.
  Pas d'idempotence : chaque demande est à elle, la marque « en cours » empêche deux demandes simultanées.
- Filtrage avant écriture : `App\Services\Messaging\Copilote\AppuisDuFil::garder()` — un appui `message` doit
  être un id de l'entrée, un appui `objet` le sujet ou l'objet d'une carte que le lecteur lit
  (`lire()['objets']`, nouveau). Proposition : question `{question, reponse, sources}`, brouillon
  `{texte, appuis, ton}`.
- Décision : `PUT /api/copilote/suggestions/{suggestion}/decision` (`CopiloteSuggestionController@decider`,
  `DeciderUneSuggestionRequest`) : 404 `copilote.suggestion_introuvable` si ce n'est pas un usage du copilote, si
  le lecteur n'est pas `ai_calls.actor_id`, sous impersonation, ou si la garde de TCK-2974 ne le sert plus ;
  410 `copilote.suggestion_purgee` ; 409 `copilote.deja_decidee`. Codes en fr/en/wo (wo = fr). Exemption
  `PlatformAnyRouteExempt` : `SOI`.
- Tests : `CopiloteBrouillonQuestionTest` (5), `CopiloteDecisionTest` (5) ; AC3 compte `messages` ET `commitments`.
  Run de confirmation après Pint (charge 26) : 64 verts, gardes `LangGroupParity`, `ProtectedActionsCoverage`,
  `NamespaceAccessGuard`, `PromptRepository` et `ReglagesDAgenceDuCopiloteTest` (TCK-2979) compris. Ablations, chacune rouge puis restaurée
  (md5 vérifié) : brouillon lu avec notes → AC1 rouge ; filtrage `AppuisDuFil` neutralisé → AC2 rouge ; contrôle
  du demandeur retiré → test du collègue (404) rouge.
- Gardes : check-ai-usages, check-queues, check-ai-providers-privacy, check-capability-readers verts ;
  check-front-routes : la route de décision attendue par le front existe, seul écart restant
  `pont/invitations` (TCK-2984). `AiUsageRegistryTest` et `AiJobsQueueTest` rougissent sur
  `FilTranscriptionUsage` / `TranscrireLaNoteVocale` (TCK-2976), pas sur ce ticket.
- **Promesses** (`fil.promesses`, rôle `extraction`, `FilPromessesUsage`, agent `FilPromesses`, prompt v1) :
  `App\Services\Messaging\Copilote\PromessesDuFil`.
  - `premierNouveau()` : premier message `all` lisible, non source d'un engagement, écrit depuis la dernière
    extraction réussie du lecteur (`ai_calls.created_at`, `>=` car à la seconde ; le doublon est écarté par
    `garder()`, qui refuse un message dont le lecteur a déjà une promesse proposée). Nul → `200` et l'état, sans appel.
  - Entrée : `lire(avecNotes: false, contexte: 10, horsSourcesDEngagement: true)` + un bloc `participants` délimité.
  - `garder()` : message hors de l'entrée ou porteur non participant actif écartés ; échéance passée/illisible → null.
    Une suggestion par promesse.
  - État : `sortes.promesses = {statut: aucun|prete|…, promesses: [{suggestion_id, proposition: {message_id,
    porteur_id, libelle, echeance}}]}` (forme lue par `takussan-web/src/lib/queries/copilote.ts`), sans les
    promesses dont le message est devenu source d'un engagement.
- **Brouillon** : `LectureDuFilPourIa::engagementsEnCours()` — engagements `proposed`/`open` du fil vus par
  `CommitmentPolicy::view`, `en_retard` signalé, bloc `engagements` délimité ; appui `objet` `commitment` admis.
- Tests : `CopilotePromessesTest` (4). Ablations rouges puis restaurées (md5) : promesses lues avec notes ;
  contrôle du porteur retiré ; `horsSourcesDEngagement` faux ; masquage des promesses notées retiré ;
  « rien de neuf » neutralisé. Run de confirmation : 73 verts sur 74 ; le seul rouge,
  `NamespaceAccessGuardTest` sur `pont/invitations`, est de TCK-2984. Gardes node vertes (check-front-routes compris).
