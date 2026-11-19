---
id: TCK-2974
title: "Le copilote côté données, le socle et le résumé : capacité messaging.copilot, garde du personnel, lecture du fil masquée, job de la file ai, signal, état dérivé, refus par code, purge à 30 jours, usage fil.resume"
status: todo
phase: P2
family: back
estimate: L
wave: 97
created: 2026-11-19
updated: 2026-11-19
depends_on: [TCK-2965, TCK-2967]
blocks: [TCK-2975, TCK-2976, TCK-2977, TCK-2979]
spec_refs:
  features:
    - docs/features.md#17-communication--messagerie
    - docs/features.md#211-socle-ia
  models:
    - docs/models-spec.md#104-aicall-
    - docs/models-spec.md#105-aisuggestion-
    - docs/models-spec.md#20-message-
tags: [back, messagerie, le-fil, copilote, ia, adr-0131, adr-0076, adr-0128, adr-0129]
---

## Objectif utilisateur

- **L'agent ou l'administrateur d'agence** qui rouvre un fil chargé (10 messages non lus ou plus)
  reçoit « Ce que vous avez manqué » : quelques points, chacun renvoyant au message qu'il résume, et
  en tête la question qui l'attend. Lui seul le voit, et rien n'est envoyé.
- **Le client, le bailleur et le prestataire** n'ont pas d'assistant. Rien de ce qu'ils lisent ne
  change.

## Contrat de données

- **ADR-0131** §§ 1 à 4 et 6 : qui a le copilote, ce qu'il lit, la file, le signal, l'état dérivé,
  les refus et la purge. ADR-0076 pour le socle.
- **Capacité** : `Capability::MessagingCopilot` (`messaging.copilot`, à côté de
  `messaging.archive`, `app/Models/Enums/Capability.php:103`). Elle est accordée à l'agent
  (`SystemRoleCapabilities::agent()`) et à l'administrateur, qui reçoit tout `agencyAssignable()`.
  Elle est inscrite dans `CapabilityEnforcementInventory`.
- **Garde du copilote** (nom libre, sous `app/Services/Messaging/`) : `peutServir(User, Conversation)`
  vaut vrai si, et seulement si, le lecteur :
  - lit le fil (`ConversationAccess::allows`) ;
  - en est participant actif ;
  - est personnel actif de l'agence du fil (`EquipeDuFil::agence`,
    `PersonnelDeLAgence::personnelActifDe`).

  Un fil sans agence rend faux. La capacité est jugée **en plus** par la passerelle (`AiAuthority`,
  `AiRequest::$agencyId` = l'agence du fil).
- **La lecture du fil pour l'IA** (nom libre) rend le texte d'entrée d'un usage :
  - les messages par `ConversationAccess::messagesLisiblesPar($lecteur, …, $fil)` ;
  - une option « sans notes d'équipe », qui ajoute `visibility = all` pour les usages du § 2 de
    l'ADR (TCK-2975 s'en sert) ;
  - les cartes, les événements et le sujet du fil par leur **projection fermée** pour le lecteur
    (`ObjetsDesMessages`, chemins déclarés par type dans `SujetsDuFil::projection()`,
    `app/Services/Messaging/SujetsDuFil.php:253`), jamais par la ressource entière de l'objet. Ces
    listes ne portent ni pièce d'identité ni revenu (relevé du 2026-11-19 : le bail rend loyer,
    charges, dates, parties par leur nom). Un test le garde : un champ sensible de l'objet n'atteint
    jamais le faux modèle ;
  - l'auteur de chaque message par son nom et son rôle dans le fil, et l'identifiant du message
    pour que la sortie le cite ;
  - le tout enveloppé par `ExternalContent::wrap()`, téléphones masqués (`PhoneMasker::mask`) et
    adresses électroniques masquées (`EvalCaseAnonymizer::EMAIL`, comme `MotsDuSignalement::citer`,
    `app/Support/MotsDuSignalement.php:31`) ;
  - aucune pièce jointe. Les messages `image`, `document` et `audio` y figurent par leur type seul,
    et `audio` par sa transcription quand TCK-2976 l'a faite.
- **Usage `fil.resume`** (`app/Ai/Usages/`, agent sous `app/Ai/Agents/`, prompt
  `resources/ai/prompts/fil.resume/v1.md`, `versions.lock.json`) :
  - rôle `redaction`, classe `personnelle`, `readsExternalContent() = true`, cache 0 ;
  - autorité `Capability::MessagingCopilot`, plafond par défaut `1.00` $ par jour ;
  - sortie structurée `{points: [{texte, message_id, attend_le_lecteur: bool}]}`. Un `message_id`
    hors de l'entrée est retiré avant écriture. La proposition enregistrée porte aussi la fenêtre
    résumée (`depuis_message_id`, `jusqu_a_message_id`), qui sert l'idempotence, puisque
    `input_snapshot` reste nul.
  - **Entrée** : les messages de la fenêtre (200 au plus), plus les 5 messages qui précèdent pour le
    contexte.
  - **La fenêtre ne se lit pas sur `last_read_at` au moment du POST** : le front marque le fil lu à
    l'ouverture (`useMarkConversationRead`, `takussan-web/src/lib/queries/conversations.ts:321`),
    avant ou pendant la demande. Le front envoie donc `{depuis_message_id}`, le premier message non
    lu qu'il a affiché au séparateur « N nouveaux messages ». L'API vérifie que ce message est
    lisible par le lecteur dans ce fil, et compte au moins 10 messages comptés (règle de `NonLus`,
    hors message du lecteur) à partir de lui. Sinon : 422 `copilote.resume_inutile`.
- **Routes** (`routes/api/conversations.php`, noms libres, à déclarer avant toute route de même
  forme) :
  - `POST /api/conversations/{conversation}/copilote/{sorte}` : `sorte` ∈ liste fermée en code (ce
    ticket : `resume` ; TCK-2975 ajoute `question`, `brouillon` et `promesses`). La route juge la
    garde, puis pour `resume` la fenêtre et son seuil (ci-dessus), sans appel s'ils échouent. Si un
    résumé existe déjà pour la même fenêtre (même `depuis_message_id`, même dernier message), elle le
    rend (`200`) sans appel. Sinon elle pose la marque « en cours » (cache, 120 s, verrou contre une
    seconde demande identique), dépose le job et rend `202`. **Un refus ou un échec passé ne bloque
    jamais une nouvelle demande** : seule une proposition prête est réutilisée.
  - `GET /api/conversations/{conversation}/copilote` : l'état du lecteur pour ce fil, par sorte. Il
    vaut `aucun`, `en_cours`, `prete` (avec la proposition et l'identifiant de la suggestion),
    `refusee` ou `echec` (avec un code). La garde est rejugée à chaque lecture. **Un refus ou un
    échec ne compte que s'il est le dernier appel du lecteur pour cette sorte et ce fil, postérieur à
    sa dernière proposition, et journalisé le jour civil courant** (les plafonds sont journaliers).
    Hier « budget épuisé », aujourd'hui `aucun`.
- **Disponibilité sans requête au copilote** : `ConversationResource` gagne `copilote` (booléen, la
  garde ci-dessus plus la capacité), sur la liste comme sur le fil. Il est calculé **en lot pour la
  page**, jamais une requête par fil. C'est lui que le front lit avant toute requête `…/copilote` :
  un client n'en émet aucune. La raison d'une indisponibilité de droits n'est jamais rendue.
- **Job** (`app/Jobs/Copilote/…`, `RunsOnAiQueue`, `$timeout` sous 85 s) : il construit l'entrée,
  appelle `AiGateway::run()` avec acteur, agence et fil en objet, puis enregistre la proposition par
  `SuggestionRecorder::record()` (sujet = le fil, `input_snapshot` nul). Il émet ensuite
  `copilote.updated` au seul demandeur. Un `AiRefused` ou un `AiUnavailable` est absorbé : le
  journal `ai_calls` porte déjà l'issue, et le job émet le même signal.
- **Signal** : `CodeDeSignal::CopiloteUpdated` (`copilote.updated`,
  `app/Support/TempsReel/CodeDeSignal.php`), sur `CanauxTempsReel::canalDe($demandeur)` seulement.
- **Codes** sous `LangGroupParity` : `copilote.indisponible` (403), `copilote.resume_inutile` (422),
  et dans l'état `copilote.coupe`, `copilote.budget_epuise`, `copilote.echec`. Correspondance :
  `AiRefusalReason::KillSwitch` → `coupe`, `Budget` → `budget_epuise`, `Forbidden` →
  `indisponible`, tout `AiUnavailable` → `echec`.
- **Purge** : une commande planifiée chaque jour (nom libre) vide `proposal` (`'[]'`), `final_value`
  et `correction_diff` des suggestions des usages `fil.*` de plus de 30 jours, sans supprimer la
  ligne. C'est le patron de `RadarPurger` (`app/Services/Radar/RadarPurger.php:453`).
- **Politique de confidentialité** : `takussan-web/src/content/legal/privacy.ts` § 4.3, rubrique
  « Intelligence artificielle » (`fr` et `en` ; `wo` est vide dans ce fichier, `privacy.ts:393`). Elle
  dit qu'à la demande d'un membre du personnel de l'agence, le contenu d'une conversation à
  laquelle il participe (messages, notes vocales transcrites) est transmis au fournisseur pour
  proposer un résumé, une réponse, un brouillon ou un engagement. Elle précise que les numéros et
  les adresses électroniques sont masqués, que rien n'est envoyé sans lui, et que la proposition
  est effacée à 30 jours. C'est la PR du premier appel réel (ADR-0076, Conséquences).

## Contraintes strictes (métier)

- **Ni client, ni bailleur, ni prestataire, ni super-admin, ni un agent d'une autre agence** : 403
  `copilote.indisponible`, avant tout appel et sans ligne `ai_calls`.
- **Un bailleur à qui la capacité est déléguée** reste refusé : la garde exige le personnel actif.
- **Rien ne s'écrit dans le fil** : aucun message, aucun accusé de lecture, aucun signal sur le
  canal du sujet.
- **Aucun appel dans la requête HTTP** : `scripts/check-queues.mjs` reste vert.
- **Le résumé d'un agent n'est lu par personne d'autre**, y compris un collègue du même fil.

## Delta à produire

- [ ] Capacité, rôles système, inventaire. Les agences existantes la reçoivent par
  `membership:reconcile-system-roles`, déjà joué par `docker/release.sh` (le relire, ne rien y
  ajouter si c'est le cas).
- [ ] La garde du copilote et la lecture du fil pour l'IA, avec le masquage.
- [ ] `FilResumeUsage`, son agent, son prompt v1, `AiUsageRegistry::USAGES`, `versions.lock.json`.
- [ ] Les deux routes, leur requête (`authorize()` par la garde), leur contrôleur, et le job.
- [ ] `CodeDeSignal::CopiloteUpdated` et l'émission après le COMMIT (`TempsReel`).
- [ ] Les codes d'erreur (`lang/fr`, `lang/en`), `ProtectedActionsCoverageTest` /
  `PlatformAnyRouteExempt` selon la règle des routes neuves.
- [ ] La purge planifiée et son inscription au planificateur.
- [ ] `privacy.ts` § 4.3, `fr` et `en`.
- [ ] `copilote` dans `ConversationResource`, en lot.
- [ ] Tests, tous sur le faux modèle du SDK :
  - `CopiloteGardeTest` : agent participant, admin d'agence, collègue non participant, agent d'une
    autre agence, bailleur, bailleur délégataire, locataire, prestataire, super-admin, fil sans
    agence ;
  - `LectureDuFilPourIaTest` : notes comprises ou non selon l'option ; un message d'un autre fil
    absent ; une carte d'un objet que le lecteur ne lit pas rendue `indisponible` ; téléphone et
    adresse électronique masqués **dans l'entrée reçue par le faux modèle** ; un champ hors de la
    projection déclarée (par exemple un attribut posé sur le bail du sujet) absent de l'entrée ;
  - `CopiloteResumeTest` :
    - fenêtre sous le seuil, ou `depuis_message_id` d'un autre fil → 422 ;
    - le fil marqué lu avant le POST n'empêche pas le résumé ;
    - idempotence (un second POST sur la même fenêtre ne fait pas de second appel) ;
    - `202` puis `prete`, et le signal au seul demandeur ;
    - budget épuisé → `refusee` / `budget_epuise`, puis `aucun` le lendemain (horloge avancée), et
      un nouveau POST repart ;
    - coupe-circuit → `coupe` ;
    - un collègue ne lit pas le résumé de l'autre ;
    - un `message_id` inventé est retiré ;
  - `ConversationResource` : `copilote` vrai pour l'agent participant, faux pour le locataire et le
    super-admin ; requêtes de la liste constantes de 1 à 30 fils ;
  - purge : une suggestion de 31 jours vidée, une de 29 jours intacte, une suggestion du Radar
    intacte.

## Critères d'acceptation

- [ ] **AC1** — Matrice de non-fuite : chaque lecteur refusé reçoit 403 et aucune ligne `ai_calls`
  n'est écrite. **Ablation** : retirer la clause « personnel actif » de la garde fait rougir les
  cas bailleur délégataire et super-admin.
- [ ] **AC2** — L'entrée reçue par le faux modèle ne contient ni le téléphone ni l'adresse
  électronique écrits dans un message. **Ablation** : retirer le masquage fait rougir le test.
- [ ] **AC3** — Avec l'option « sans notes d'équipe », une note d'équipe écrite dans le fil n'est pas
  dans l'entrée. **Ablation** : retirer la clause `visibility` fait rougir le test.
- [ ] **AC4** — Une fenêtre sous le seuil rend 422 sans appel ; un second POST sur la même fenêtre ne
  fait aucun second appel (compte de `ai_calls`) ; un fil marqué lu avant la demande se résume
  quand même.
- [ ] **AC5** — Budget épuisé et coupe-circuit rendent chacun leur code dans l'état ; un refus de la
  veille ne se lit plus. Le signal part vers le seul demandeur (`FauxTransport`).
- [ ] **AC6** — `copilote` est calculé en lot : le nombre de requêtes de `GET /api/conversations` ne
  croît pas de 1 à 30 fils.
- [ ] **AC7** — `node scripts/check-ai-usages.mjs`, `node scripts/check-queues.mjs` et
  `node scripts/check-ai-providers-privacy.mjs` verts ; `LangGroupParity` vert ; Pint propre ;
  tests des fichiers touchés verts.

## Hors périmètre

- `fil.question`, `fil.brouillon`, `fil.promesses` et les décisions : TCK-2975.
- La transcription : TCK-2976.
- L'écran : TCK-2977.
- Les interrupteurs (plateforme par usage, agence par réglage) et le modèle par fonction : TCK-2979,
  qui ajoute sa clause à la garde de ce ticket et à `copilote`. Ici, le coupe-circuit de l'usage
  (`ai_usage_settings.enabled`, jugé par la passerelle) suffit à rendre `coupe`.
- Le plafond par agence (`daily_per_agency_usd` reste `null`) et le fil « sans assistant » :
  ADR-0131, « Ce que ça ne règle pas ».
- Un jeu d'évaluation de `fil.resume`.

## Notes d'implémentation

_(à remplir par implementing-specs)_
