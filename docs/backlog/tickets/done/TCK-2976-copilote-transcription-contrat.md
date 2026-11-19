---
id: TCK-2976
title: "La transcription des notes vocales côté données : AiGateway::transcribe, usage fil.transcription, job, statut sur le message pour le personnel, désactivée proprement sans fournisseur audio, pilote de test"
status: done
phase: P2
family: back
estimate: M
wave: 97
created: 2026-11-19
updated: 2026-11-19
depends_on: [TCK-2974]
blocks: [TCK-2977, TCK-2979]
spec_refs:
  features:
    - docs/features.md#17-communication--messagerie
    - docs/features.md#211-socle-ia
  models:
    - docs/models-spec.md#20-message-
    - docs/models-spec.md#104-aicall-
    - docs/models-spec.md#105-aisuggestion-
tags: [back, messagerie, le-fil, copilote, ia, note-vocale, adr-0131, adr-0076, adr-0038]
---

## Objectif utilisateur

- **L'agent ou l'administrateur d'agence** lit sous une note vocale ce qu'elle dit, en français,
  sans l'écouter. Ni le client, ni le bailleur, ni le prestataire ne voient de transcription.
- **Le porteur** active la transcription le jour où il pose la clé d'un fournisseur qui transcrit et
  lui affecte le rôle dans la console, sans commit.

## Contrat de données

- **ADR-0131** § 7. **Prémisse mesurée le 2026-11-19** :
  - `AiGateway` n'a que `run()` et `embed()` (`app/Services/Ai/AiGateway.php:67`, `:245`) ;
  - le SDK transcrit par `Laravel\Ai\Transcription` (OpenAI, OpenRouter et d'autres, pas
    Anthropic), avec un faux `Transcription::fake()` ;
  - la préproduction n'a que `ANTHROPIC_API_KEY`.

  Ce ticket livre donc **le contrat**, éprouvé sur le faux, et aucune clé ni aucun identifiant de
  modèle.
- **Rôle** `AiModelRole::Transcription` (`transcription`). Dans `config/ai.php`,
  `roles.transcription` vaut `[]` : **aucun fournisseur ni modèle par défaut**. Rôle vide =
  fonction désactivée proprement (décision 5a du porteur).
- **Activation** : par le seul résolveur `ReglagesDuCopilote` de TCK-2974 (contrat dans TCK-2979),
  `etat('fil.transcription', $agence)`. Ce ticket ne lit aucun réglage lui-même. Le résolveur rend
  `non_configuree` quand le rôle n'a pas de chaîne. TCK-2979 le branche ensuite sur la base
  (console, réglage d'agence `voice_transcription_enabled`), sans rien changer ici.
- **`AiGateway::transcribe(AiRequest, audio)`** rend le texte, la langue détectée si le fournisseur
  la rend, et l'appel journalisé. Il suit le même ordre que `run()` : `admit()` (autorité,
  coupe-circuit, budget, données), chaîne du rôle avec bascule, refus d'un fournisseur non
  sélectionnable, sans suivre de redirection, journal `ai_calls`. La langue est imposée à `fr`.
  Le coût est estimé sur les jetons rendus. Faute de jetons, le coût vaut zéro avec l'avertissement
  `usage_missing`, comme pour `run()`.
- **Usage `fil.transcription`** : rôle `transcription`, classe `personnelle`, autorité
  `Capability::MessagingCopilot`, plafond par défaut `0.50` $ par jour, cache 0. **Patron
  d'`EmbeddingUsage`** (`app/Services/Ai/EmbeddingUsage.php`) : une interface `TranscriptionUsage
  extends AiUsage`, que `transcribe()` exige et que `run()` refuse. L'usage n'a ni agent ni prompt,
  et son `agentClass()` lève, comme `RadarEmbeddingUsage::agentClass()`. `check-ai-usages.mjs` n'exige
  que (A) des agents cités par un usage et (B) des usages listés au registre : un usage sans agent
  y passe. Il **a** un acteur : la passerelle juge son autorité.
- **Route** `POST /api/conversations/{conversation}/messages/{message}/transcription` (nom libre) :
  - garde du copilote de TCK-2974, et le message lisible par le lecteur dans ce fil
    (`messagesLisiblesPar`), de type `audio`. Sinon 404 ;
  - une seule transcription par message : si une suggestion `fil.transcription` existe pour ce
    message ou qu'une marque « en cours » est posée, `200` avec l'état, sans job ;
  - **le résolveur ne la sert pas** : `non_configuree` → `200` avec `indisponible` /
    `ai.role_unassigned` ; `plateforme` ou `agence` → `indisponible` / `copilote.coupe`. Dans les
    deux cas, **sans job ni ligne `ai_calls`** ;
  - sinon marque « en cours », job (`RunsOnAiQueue`, `$timeout` sous 85 s), `202`. Un refus ou un
    échec passé ne bloque pas une nouvelle demande, comme au § « état » de TCK-2974.
- **Job** : il lit le fichier de la collection privée `attachments` (ADR-0038 : 60 s et 2 Mo au
  plus), appelle `transcribe()` (acteur = le demandeur, agence = celle du fil, objet = le message),
  et enregistre une `AiSuggestion` (sujet = le message, `proposal = {texte, langue}`,
  `input_snapshot` nul). Il signale ensuite `message.updated` aux seuls lecteurs des notes d'équipe
  du fil (`EquipeDuFil::idsDesLecteursDesNotes`), sur leur canal d'utilisateur, jamais sur le canal
  du fil.
- **Lecture** : `MessageResource` rend `transcription` sur un message `audio` **pour un lecteur
  servi par la garde du copilote seulement**, et l'omet pour tout autre lecteur. Sa valeur :
  - `{etat: aucune|en_cours|prete|indisponible, texte?, langue?, code?}` ;
  - `indisponible` porte le code `ai.role_unassigned`, `copilote.budget_epuise`, `copilote.coupe`
    ou `copilote.echec` ;
  - `ai.role_unassigned` et `copilote.coupe` se lisent **sur les réglages, à chaque lecture**, pas
    sur un appel passé : le jour où le porteur affecte le rôle ou rallume la fonction, les notes
    déjà affichées repassent à `aucune` et se transcrivent ;
  - un refus ou un échec (`ai_calls`, objet = le message) ne compte que le jour civil où il a été
    journalisé, puis l'état redevient `aucune`.

  La transcription est chargée en lot pour la page (une requête), jamais une par message.
- Une transcription entre dans la lecture du fil de TCK-2974 à la place du seul type `audio`.
- La purge à 30 jours de TCK-2974 s'applique à `fil.transcription`.

## Contraintes strictes (métier)

- **Aucune clé, aucun identifiant de modèle, aucun fournisseur par défaut** pour le rôle.
- **La clé `transcription` est absente** de la réponse pour un client, un bailleur, un prestataire
  ou un super-admin. L'API ne rend ni `null` ni un état vide.
- **Le fichier audio ne quitte pas la plateforme** quand le rôle est vide : aucun appel au SDK.
- **Un message d'un autre fil**, ou une note d'équipe lue par un non-personnel, rend 404.

## Delta à produire

- [ ] `AiModelRole::Transcription`, `config/ai.php` (`roles.transcription = []`), l'interface
  `TranscriptionUsage` (patron d'`EmbeddingUsage`).
- [ ] `AiGateway::transcribe()`.
- [ ] `FilTranscriptionUsage` et le registre.
- [ ] Route, requête, contrôleur, job, `MessageResource` (chargement en lot), codes sous
  `LangGroupParity`, `ProtectedActionsCoverageTest`.
- [ ] Tests :
  - `AiGatewayTranscriptionTest` sur `Transcription::fake()` : ordre des refus (autorité, coupure,
    budget), rôle vide → `ai.role_unassigned` **sans appel au faux** ; bascule au maillon suivant ;
    journal ; langue `fr` transmise ;
  - `TranscriptionDuFilTest` : non-personnel 404 ; une seule transcription par message ; signal
    aux seuls lecteurs des notes ; `transcription` absente de `MessageResource` pour le locataire et
    présente pour l'agent ; requêtes de la page constantes de 1 à 20 notes vocales ; agence qui
    coupe `voice_transcription_enabled` → `copilote.coupe`, sans job.

## Critères d'acceptation

- [ ] **AC1** — Rôle vide : `POST …/transcription` rend `indisponible` / `ai.role_unassigned` sans job ni ligne
  `ai_calls`, et `Transcription::assertNothingGenerated()` passe. Le rôle affecté ensuite, la même note
  repasse à `aucune` et se transcrit ; un refus de budget de la veille ne se lit plus.
- [ ] **AC2** — Le locataire du même fil ne reçoit pas la clé `transcription`. **Ablation** : retirer
  la condition de la garde dans `MessageResource` fait rougir le test.
- [ ] **AC3** — Avec un maillon affecté sur le faux, la note est transcrite une fois. Le texte est
  rendu au personnel, la langue `fr` transmise, la ligne `ai_calls` porte l'agence du fil.
- [ ] **AC4** — Le nombre de requêtes de `GET …/messages` ne croît pas avec le nombre de notes
  vocales.
- [ ] **AC5** — `check-ai-usages.mjs`, `check-queues.mjs` verts ; `LangGroupParity` vert ; Pint
  propre ; tests des fichiers touchés verts.

## Hors périmètre

- Poser la clé d'OpenAI ou d'OpenRouter, affecter le rôle, déclarer un tarif à la minute : gestes du
  porteur, après le contrat de sous-traitance (ADR-0076, amendement du 2026-11-16).
- La transcription pour le client, le bailleur ou le prestataire.
- Le wolof (en pause) et la détection de langue au-delà de ce que rend le fournisseur.
- Les réglages en base (console, contrôle `ai.provider_role_mismatch` du rôle, réglage d'agence) :
  TCK-2979, qui branche le résolveur sans changer ce ticket.
- L'écran de la transcription : TCK-2977.

## Notes d'implémentation

Livré le 2026-11-19 :

- **Résolveur** : `ReglagesDuCopilote` avait été réécrit pendant le travail (contrat TCK-2979 : `etat($fonction, ?Agency)` →
  `{active, raison}`). La transcription y est branchée par la fonction `transcription` (constante `TRANSCRIPTION`) :
  `raison = non_configuree` quand `modele('transcription')` est nul (rôle vide sans modèle forcé), après le
  coupe-circuit plateforme ; `config('ai.copilote.fonctions.transcription')` la coupe. `modele()` mappe la fonction
  sur `fil.transcription` (elle n'est pas une sorte de `POST …/copilote/{sorte}`).
- **Garde de la route** : refus = **404** (ticket : « sinon 404 »), pas le `403 copilote.indisponible` du socle.
  Contrôleur à part (`MessageTranscriptionController`) pour ne pas toucher celui du copilote, que d'autres éditent.
- **Langue** : le SDK (`TranscriptionResponse`) ne rend pas la langue détectée ; `langue` = la langue imposée (`fr`).
- **État** (`TranscriptionsDuFil`) : `prete` (suggestion du message, partagée par le personnel) > `en_cours` (marque par
  message) > réglages (`ai.role_unassigned` / `copilote.coupe`, lus à chaque lecture) > dernier `ai_calls` du jour
  (`copilote.budget_epuise`, `copilote.echec` ; un rôle vide ou un coupe-circuit passés sont ignorés) > `aucune`.
- **`MessageResource`** : la clé `transcription` n'est calculée que par `page()` ; un message rendu seul (envoi) ne la
  porte pas. Une page sans note vocale ne coûte aucune requête.
- **Console** : `AiModelRole::Transcription` apparaît dans la liste des rôles ; type front et libellé ajoutés. Le
  contrôle `ai.provider_role_mismatch` du rôle reste à TCK-2979.
- Ablation : condition de garde de `MessageResource::transcriptionsDeLaPage()` retirée → `test_ac2` rouge ; restauré (md5).
- `LectureDuFilPourIa` : la transcription d'une note vocale entre à la place du seul type (`transcription`, une requête
  pour la fenêtre, masquée). Ablation → rouge.
- `run()` levait `ai.prompt_missing` sur un usage de transcription (le prompt se charge avant `agentClass()`) : il le
  refuse désormais par une `LogicException`, avant tout journal.
- `MessageResource::transcription` inscrite dans `DateInventoryByValueTest`.
