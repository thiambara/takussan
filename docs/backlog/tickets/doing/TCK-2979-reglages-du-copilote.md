---
id: TCK-2979
title: "Les réglages du copilote : le résolveur ReglagesDuCopilote branché sur la base, interrupteur et modèle par fonction à la plateforme (ai_usage_settings), interrupteur de l'agence (AgencySettings), plafond IA par agence réglable ; console IA et réglages de l'agence à l'écran"
status: doing
phase: P2
family: full
estimate: L
wave: 97
created: 2026-11-19
updated: 2026-11-19
depends_on: [TCK-2974, TCK-2976]
blocks: []
spec_refs:
  features:
    - docs/features.md#211-socle-ia
    - docs/features.md#17-communication--messagerie
  models:
    - docs/models-spec.md#103-aiusagesetting-
tags: [back, front, copilote, ia, reglages, super-admin, agence, adr-0131, adr-0076, adr-0065]
---

## Objectif utilisateur

- **Le super-admin**, dans la console IA :
  - allume ou coupe chaque fonction du copilote (résumé, « Demander au fil », brouillon, promesses,
    transcription) ;
  - choisit le modèle de chacune, ou laisse le défaut de la configuration ;
  - affecte au rôle `transcription` un fournisseur qui transcrit ;
  - règle le plafond IA du jour de chaque agence.
- **L'administrateur d'agence**, dans les réglages de son agence, coupe ou rallume « l'assistant de
  la messagerie » et « la transcription des notes vocales ». Il ne peut pas allumer ce que la
  plateforme a coupé, et l'écran lui dit pourquoi.

## Contrat de données

- **ADR-0131 § 8** (décisions du porteur du 2026-11-19, n° 4 et 5, et leurs suites). **Aucun
  mécanisme neuf** : ce ticket suit trois patrons mesurés.

### Le contrat du résolveur `ReglagesDuCopilote` (posé par TCK-2974, branché ici)

TCK-2974 écrit ce résolveur **sur la seule configuration** ; les tickets TCK-2975 à TCK-2978 le
lisent sans dépendre de ce ticket. Ce ticket le branche sur la base **sans changer sa signature ni
le sens de ses retours**. Nom de classe imposé, sous `app/Services/Ai/` ou
`app/Services/Messaging/`, lié dans le conteneur (un `instance()` le remplace dans un test) :

```php
final class ReglagesDuCopilote
{
    /** Les usages du copilote, dans cet ordre. */
    public const FONCTIONS = ['fil.resume', 'fil.question', 'fil.brouillon', 'fil.promesses', 'fil.transcription'];

    /**
     * La fonction est-elle servie pour cette agence ? `raison` vaut null si oui, sinon (dans cet
     * ordre de priorité) : 'plateforme' (coupée à la plateforme), 'non_configuree' (transcription
     * sans fournisseur), 'agence' (coupée par l'agence).
     *
     * @return array{active: bool, raison: null|'plateforme'|'non_configuree'|'agence'}
     */
    public function etat(string $fonction, ?int $agenceId): array;

    /**
     * Les agences, parmi celles données, où la fonction est coupée PAR L'AGENCE. Une requête pour la
     * page (le booléen `copilote` de `ConversationResource`), jamais une par fil.
     *
     * @param  list<int>  $agenceIds
     * @return list<int>
     */
    public function agencesQuiCoupent(string $fonction, array $agenceIds): array;

    /** Le seuil du résumé, en messages comptés (10). */
    public function seuilDuResume(): int;

    /** La rétention des propositions, en jours (30). */
    public function retentionEnJours(): int;

    /** Le plafond par défaut de la fonction, en dollars par jour, chaîne décimale (ADR-0086). */
    public function plafondDuJour(string $fonction): ?string;
}
```

- **Ce que rend la version de TCK-2974 (configuration seule)**, lue sous `config('ai.copilote')`
  (bloc neuf de `config/ai.php`) :
  - `fonctions.<clé>` : booléen, `true` par défaut ;
  - `seuil_du_resume` : 10 ;
  - `retention_jours` : 30 ;
  - `plafonds.<clé>` : `'1.00'`, et `'0.50'` pour `fil.transcription` (valeurs confirmées par le
    porteur le 2026-11-19).

  Le retour se lit ainsi :
  - `plateforme` si `fonctions.<clé>` est faux ;
  - `non_configuree` pour `fil.transcription` si la chaîne du rôle `transcription` est vide dans la
    configuration ;
  - jamais `agence` : `agencesQuiCoupent()` rend `[]`.
- **Le modèle n'est pas dans le résolveur** : il est déjà résolu par la passerelle.
  - `ModelResolver` (`app/Services/Ai/ModelResolver.php:24`) prend le modèle forcé de l'usage
    (`ai_usage_settings.forced_provider` / `forced_model`), sinon la chaîne du rôle de l'usage dans
    `config/ai.php`.
  - « Le modèle par fonction, avec un défaut en config » est donc le modèle forcé de la console, et
    à défaut le rôle de la fonction : `redaction` pour le résumé, la question et le brouillon,
    `extraction` pour les promesses, `transcription` pour la transcription.
  - Aucun ticket du lot ne passe `AiRequest::$link` pour choisir un modèle.

### Ce que ce ticket branche

- **Plateforme, interrupteur par fonction** : `etat()` rend `plateforme` si `fonctions.<clé>` est
  faux **ou** si `ai_usage_settings.enabled` de l'usage est faux (la console existante :
  `AiUsageController::update`, `app/Http/Controllers/Api/Admin/AiUsageController.php:51`,
  `AiUsagesPanel.tsx`). La passerelle continue de juger son coupe-circuit : le résolveur évite
  seulement de déposer un job voué au refus.
- **Plateforme, modèle par fonction** : déjà là pour tout usage du registre. Ce ticket ajoute à la
  console les libellés des cinq usages `fil.*` et le contrôle du fournisseur :
  - `AiRoleController::update` (`:46`) et `AiUsageController::update` (`:66`) refusent en 422
    `ai.provider_role_mismatch` un fournisseur qui ne transcrit pas pour le rôle `transcription` ou
    pour `fil.transcription` ;
  - ils refusent de même un fournisseur qui ne fait que transcrire pour un autre rôle, comme pour les
    embeddings ;
  - `AiProviderCatalogue` dit si un fournisseur transcrit : pilote du SDK qui implémente
    `TranscriptionProvider` (`openai`, `openrouter` ; jamais `anthropic` ni `voyageai`).
- **Transcription « configurée »** : `etat('fil.transcription', …)` rend `non_configuree` sauf si le
  rôle a une chaîne (ligne `ai_role_assignments`, sinon la configuration) ou si l'usage a un modèle
  forcé, d'un fournisseur sélectionnable (`AiProviderCatalogue::selectable`). Rôle vide = fonction
  désactivée proprement (décision 5a) : ni job ni appel (TCK-2976).
- **Agence, deux réglages** au patron de `watermark_enabled` (`app/Domain/Settings/AgencySettings.php`,
  écrit par `PATCH /api/agencies/{id}` sous `AgencyPolicy::update`, lu par `Agency::setting()`),
  `true` par défaut (confirmé par le porteur le 2026-11-19) :
  - `copilot_enabled` : le résumé, « Demander au fil », le brouillon et les promesses ;
  - `voice_transcription_enabled` : la transcription.

  `etat()` rend `agence` quand le réglage de l'agence du fil est faux. `agencesQuiCoupent()` les
  lit en une requête. **L'agence ne peut qu'éteindre** : `plateforme` et `non_configuree` priment
  sur `agence`.
- **Le booléen `copilote` de `ConversationResource`** (TCK-2974) devient faux quand l'agence coupe
  `copilot_enabled`. Il passe par `agencesQuiCoupent()` ; ce ticket n'y touche pas autrement.
- **`AgencyResource`**, pour qui peut mettre l'agence à jour, rend l'état de la plateforme à côté
  des deux réglages. Le nom est libre, par exemple `ai_platform: {copilot: bool, transcription: bool,
  transcription_configured: bool}`. Le front grise l'interrupteur et dit pourquoi.
- **Plafond IA par agence, réglable** (patron d'ADR-0065, `EditablePlatformSettings`) :
  - une clé `ai.daily_budget_per_agency_usd` entre au catalogue, dans une catégorie `ai` neuve
    (les catégories actuelles sont `boost`, `crm`, `currency`, `limits`, `radar` et `rentals` ;
    son libellé s'ajoute côté front). Elle se règle
    dans les « Paramètres plateforme » de `/super-admin/settings`, sous second facteur et
    journalisée ;
  - son défaut est `config('ai.budgets.daily_per_agency_usd')`, qui lit désormais la clé
    d'environnement `AI_DAILY_BUDGET_PER_AGENCY_USD` (`$montant`, vide = `null`) au lieu de `null`
    en dur (`config/ai.php:144`). **Sans valeur, il n'y a pas de plafond** ;
  - `AiBudget::exhausted()` (`app/Services/Ai/AiBudget.php:31`) lit la valeur par
    `PlatformSettingService::getValue('ai.daily_budget_per_agency_usd')`, appel littéral, sous la
    garde `check-platform-catalogue-readers.mjs` ;
  - le plafond est **journalier**, comme tout plafond du socle (ADR-0086). Il vaut pour tout usage
    IA de l'agence, pas pour le seul copilote. Un plafond propre à une agence (ligne de portée
    `agency`) n'est pas livré ;
  - la clé d'environnement neuve demande `.env.example`, `.env.docker`, les gabarits
    `deploy/takussan/env.*.production.example` et son action de déploiement
    (`docs/deploiement/actions/`, ADR-0127 : la garde Repo CI rougit sans elle).

## Direction UX / Artistique

- **Console IA** (`AiUsagesPanel.tsx`, onglet des rôles) :
  - les cinq usages `fil.*` ont leurs libellés (« Copilote · résumé », « Copilote · Demander au
    fil », « Copilote · brouillon », « Copilote · promesses », « Copilote · transcription ») à
    côté de la clé ;
  - le rôle `transcription` a son libellé (type `AiModelRole`, `src/types/super-admin.ts:1063`) ;
  - le refus `ai.provider_role_mismatch` se lit comme pour les embeddings.
- **Paramètres plateforme** : la clé du plafond par agence s'affiche par le rendu générique du
  catalogue. Elle est en dollars, avec l'équivalent approximatif en XOF comme les autres plafonds
  IA. Un champ vide signifie « sans plafond ».
- **Réglages de l'agence** (`SectionRegles.tsx`, patron de l'interrupteur
  `owners_confirm_visits`, `InterrupteurAAide`) : un bloc « Assistant de la messagerie », avec deux
  interrupteurs et leur aide :
  - « propose des résumés, réponses et engagements à votre équipe ; rien n'est envoyé sans elle » ;
  - « transcrit les notes vocales en français pour votre équipe ».

  Le bloc est grisé, avec sa raison, quand la plateforme coupe ou qu'aucun fournisseur audio n'est
  configuré.
- **La transcription à l'écran** (TCK-2977) suit déjà les codes que rend ce résolveur
  (`ai.role_unassigned`, `copilote.coupe` avec sa portée). Ce ticket ne la modifie pas.
- Textes en `fr` et `en`, et en `wo` le texte français tel quel (wolof en pause). Vouvoiement.

## Contraintes strictes (métier)

- **Le contrat du résolveur ne change pas** : mêmes méthodes, mêmes valeurs de `raison`. Les tests
  de TCK-2974 à TCK-2978 restent verts sans retouche.
- **Aucun fournisseur, aucun modèle, aucune clé par défaut pour la transcription.**
- **L'agence ne rallume jamais ce que la plateforme coupe** : testé dans les deux ordres.
- **Seul l'administrateur de l'agence** écrit ses réglages (règle existante de `PATCH
  /api/agencies/{id}`). Un agent ne le peut pas.
- **Le modèle forcé et le plafond** suivent les gardes existantes : second facteur récent, journal,
  modèle tarifé (`ai.model_unpriced`).

## Delta à produire

- [ ] API :
  - `ReglagesDuCopilote` branché sur `ai_usage_settings`, `ai_role_assignments` et `AgencySettings` ;
  - les deux réglages d'agence et l'état de la plateforme dans `AgencyResource` ;
  - la capacité de transcrire dans `AiProviderCatalogue`, et les deux contrôles
    `ai.provider_role_mismatch` ;
  - la clé `ai.daily_budget_per_agency_usd` au catalogue, sa lecture par `AiBudget`, la clé
    d'environnement et son action de déploiement.
- [ ] Front :
  - libellés des usages et du rôle dans la console ;
  - le bloc « Assistant de la messagerie » des réglages de l'agence ;
  - messages `fr` / `en` / `wo`.
- [ ] Tests API :
  - matrice plateforme (configuration, console) × agence, un cas par fonction, sur `etat()` ;
  - l'agence à `true` sur une fonction coupée reste coupée ;
  - `agencesQuiCoupent()` en une requête ;
  - transcription non configurée → `non_configuree`, puis configurée par un modèle forcé `openai`
    (faux du SDK) → servie ;
  - un modèle forcé `anthropic` sur `fil.transcription` → 422 ;
  - un agent ne peut pas écrire `copilot_enabled` ;
  - plafond par agence : absent → aucun refus ; posé et atteint → refus `budget` pour cette agence
    seule.
- [ ] Tests Vitest :
  - interrupteurs grisés et raison quand la plateforme coupe ;
  - le rôle `transcription` listé dans la console.

## Critères d'acceptation

- [x] **AC1** — Une fonction coupée à la plateforme reste refusée quel que soit le réglage de
  l'agence. **Ablation** : inverser la priorité `plateforme` / `agence` dans `etat()` fait rougir le
  cas « agence à `true`, plateforme coupée ». — preuve : tests/Feature/Messaging/Copilote/ReglagesDAgenceDuCopiloteTest.php::test_la_plateforme_prime_sur_l_agence et ReglagesDuCopiloteBrancheTest.php::test_l_agence_a_vrai_ne_rallume_pas_une_fonction_coupee_a_la_console
- [x] **AC2** — L'agence qui coupe `copilot_enabled` fait passer `copilote` à faux pour son
  personnel, et aucune demande n'atteint la passerelle (compte de `ai_calls`). **Ablation** :
  retirer la lecture du réglage d'agence fait rougir le test. — preuve : tests/Feature/Messaging/Copilote/ReglagesDAgenceDuCopiloteTest.php::test_coupe_par_l_agence_la_route_refuse_sans_appel_et_le_fil_le_dit ; ablations consignées au ticket
- [x] **AC3** — Les tests de TCK-2974 à TCK-2978 passent sans retouche (le contrat du résolveur n'a
  pas bougé). — preuve : tests/Feature/Messaging/Copilote/ (72 tests verts, 2026-11-19)
- [x] **AC4** — Plafond par agence : sans valeur, pas de refus ; avec une valeur atteinte, l'agence
  concernée est refusée et une autre ne l'est pas. **Ablation** : retirer le filtre `agency_id` de
  la somme fait rougir le second cas. — preuve : tests/Feature/Messaging/Copilote/ReglagesDuCopiloteBrancheTest.php::test_le_plafond_par_agence_des_parametres_plateforme
- [ ] **AC5** — Relevé au navigateur sous `./dev.sh`, à 360 et 1280 px : le bloc des réglages de
  l'agence (allumé, coupé par l'agence, coupé par la plateforme), la console (usages `fil.*`, rôle
  `transcription`) et le plafond par agence dans les Paramètres plateforme.
- [x] **AC6** — Vérifications vertes :
  - `check-ai-usages.mjs`, `check-platform-catalogue-readers.mjs`, `check-env-parity.mjs` et la
    garde des actions de déploiement ;
  - `LangGroupParity`, Pint ;
  - `npm run lint`, `npx tsc --noEmit`, `check:i18n`, `check:vouvoiement` ;
  - tests des fichiers touchés. — preuve : CI verte de #1700 sur 2cf49b37f : Repo CI 44461750702 (gardes check-*.mjs), API CI 44461750864 (Pint, LangGroupParity, suite entière), Web CI 44461750708.

## Hors périmètre

- Poser une clé d'OpenAI ou d'OpenRouter dans un environnement, affecter le rôle : gestes du porteur.
- Un interrupteur par fonction côté agence (deux suffisent : copilote, transcription), un choix de
  modèle par agence, un plafond propre à une agence.
- Le fil marqué « sans assistant » (ADR-0131, « Ce que ça ne règle pas »).

## Notes d'implémentation

Au 2026-11-19 (agent impl-2977), **tout le delta est livré**, sauf le relevé au navigateur (AC5).

**Le résolveur et la console (API)** :
- `ReglagesDuCopilote` (fichier de TCK-2974, blocs TCK-2979) est branché sur la console. `etat()` rend `plateforme`
  dans trois cas : `ai.copilote.actif` faux, `fonctions.<f>` faux, ou `ai_usage_settings.enabled` faux pour l'usage
  `fil.*`. Puis viennent `non_configuree` et `agence`.
  - Les lignes de la console se lisent en UNE requête pour toutes les fonctions (`fonctions()`, testé).
  - La transcription est « configurée » si un maillon (modèle forcé de l'usage, sinon chaîne du rôle) vient d'un
    fournisseur sélectionnable qui transcrit.
  - `modele()` suit désormais le modèle forcé, comme `AiGateway::transcribe()`.
  - La signature et les raisons n'ont pas changé.
- `AiProviderCatalogue::transcribes()` lit le type que rend `AiManager::create<Pilote>Driver`, sans instancier le
  fournisseur. Seuls `openai` et `openrouter` transcrivent.
- `AiProviderCatalogue::servesRole()` est le seul juge de `ai.provider_role_mismatch`, appelé par
  `AiRoleController::update` et `AiUsageController::update` :
  - le prédicat des embeddings reste inchangé ;
  - le rôle `transcription` (ou un usage de transcription) exige un fournisseur qui transcrit ;
  - un fournisseur `serves: transcription` ne joue aucun autre rôle.
- Le message de `errors.ai.provider_role_mismatch` couvre aussi la transcription (fr, en, wo).
- `AgencyResource.ai_platform` vaut `{copilot, transcription, transcription_configured}`. Il est rendu par
  étalement, seulement si `can('update')` est vrai, et lu une fois par requête (attribut de la requête). Il se dérive
  de `etat(…, null)` :
  - `copilot` est vrai si au moins une des fonctions que couvre `copilot_enabled` est servie par la plateforme ;
  - l'écran grise l'interrupteur seulement quand aucune ne l'est.

**L'interrupteur de l'agence (livré plus tôt)** :
- `AgencySettings` porte `copilot_enabled` et `voice_transcription_enabled`, `true` par défaut.
- `etat()` rend `agence` APRÈS la plateforme.
- `agencesQuiCoupent()` lit les agences en une requête.

**Le plafond par agence** :
- La clé `ai.daily_budget_per_agency_usd` entre au catalogue, dans la catégorie neuve `ai` :
  - type `decimal`, `nullable`, règle `gt:0` (un zéro refuserait tout appel IA) ;
  - normalisée en chaîne décimale par `PlatformSettingService`, jamais en `float` (ADR-0086).
- Son défaut est `config('ai.budgets.daily_per_agency_usd')`, qui lit `AI_DAILY_BUDGET_PER_AGENCY_USD`. Vide, nul ou
  illisible : `null`, donc pas de plafond.
- `AiBudget` la lit par `getValue('ai.daily_budget_per_agency_usd')`, sous la garde des lecteurs du catalogue.
- La clé d'environnement est ajoutée à `.env.example`, `.env.docker` et `deploy/takussan/env.api.production.example`.
- L'action de déploiement est `docs/deploiement/actions/2026-11-19-plafond-ia-par-agence.md`.
- La clé figure dans `VIDES_PERMISES` de `scripts/check-env-production.mjs` : son défaut est `null`, donc la ligne
  vide du gabarit n'écrase rien.

**Front** :
- `SectionRegles.tsx` : le bloc « Assistant de la messagerie » (deux interrupteurs) est grisé selon `ai_platform`, avec
  sa raison :
  - « coupé par la plateforme » ;
  - « aucun service de transcription configuré ».

  Sans `ai_platform`, rien n'est grisé.
- `InterrupteurAAide` reçoit `desactive` : l'interrupteur grisé ne change plus la valeur.
- Le schéma de la fiche lit une clé absente comme `true` et n'envoie que ce qui a changé.
- `AiUsagesPanel` affiche les libellés des cinq usages `fil.*` à côté de la clé.
- Le libellé du rôle `transcription` existait déjà (TCK-2976).
- La catégorie `ai` est ajoutée à `PlatformSettingCategory` et à `categoryOrder`, avec ses libellés.
- Sous le champ du plafond par agence, `platform-settings.tsx` affiche l'équivalent en XOF. Il réutilise le taux de la
  console (`meta.usd_to_xof` des usages, même clé de cache) et `equivalentXofIa`. Test dans
  `console-copilote.tck-2979.test.tsx` ; retirer la ligne le fait rougir.

**Tests** :
- `tests/Feature/Messaging/Copilote/ReglagesDuCopiloteBrancheTest.php` (11 tests) :
  - la matrice console × fonction (les cinq) ;
  - AC1 dans les deux ordres ;
  - une requête pour la console ;
  - transcription non configurée, puis servie par un modèle forcé `openai` ;
  - `transcribes()` ;
  - 422 pour `anthropic` sur `fil.transcription` et sur le rôle `transcription`, et pour un fournisseur
    « transcription seule » sur `redaction` ;
  - 403 pour l'agent sur `copilot_enabled` ;
  - `ai_platform` pour l'administrateur et pas pour l'agent ;
  - AC4 (plafond absent, posé et atteint pour cette agence seule, vidé) ;
  - défaut par la configuration, et `0` refusé.
- `tests/Feature/Messaging/Copilote/ReglagesDAgenceDuCopiloteTest.php` (6 tests).
- Vitest :
  - `FicheDeLAgence.assistant.tck-2979.test.tsx` (4) ;
  - `console-copilote.tck-2979.test.tsx` (2) ;
  - `admin-schemas.test.ts`.

**Ablations** (une à une, chaque fois restaurée et vérifiée par md5) — chacune a fait rougir son test :
- la ligne de la console placée APRÈS `agence` (AC1) ;
- le filtre `agency_id` retiré de la somme (AC4) ;
- `servesRole()` qui accepte tout pour la transcription ;
- `AiBudget` qui relit la configuration au lieu du catalogue ;
- le grisé retiré de `SectionRegles` ;
- les libellés `fil.*` retirés ;
- le défaut de lecture de `copilot_enabled` mis à faux ;
- la ligne `agence` d'`etat()` retirée ;
- le filtre d'`agencesQuiCoupent()` retiré.

**AC3** : les fichiers de TCK-2974 à TCK-2978 passent un par un, sans retouche : Brouillon/Question, Décision,
Disponibilité, Garde, Promesses, Résumé et Transcription.

**Écarts à la prémisse** :
- Le résolveur réel a la signature `etat(string $fonction, ?Agency $agence)`, et ses fonctions sont nommées par sorte.
  `agencesQuiCoupent()` a reçu `$fonction` EN DERNIER, avec un défaut.
- `copilote` de `ConversationResource` est un objet `{fonctions: …}`, pas un booléen (TCK-2974).
- `transcription_configured` vaut `false` quand la plateforme coupe la transcription : l'écran dit alors la raison
  `plateforme`, qui prime.

**Reste** :
- AC5, le relevé au navigateur.

## Reste sur dev

Le code est sur `dev` (#1700, 83f651c16). Il reste :

- AC5 : relevé au navigateur des réglages de l'agence (il faut un compte admin d'agence avec double facteur), de la console IA et du plafond, non fait.
