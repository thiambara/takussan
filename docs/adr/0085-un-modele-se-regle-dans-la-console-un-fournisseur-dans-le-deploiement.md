# ADR-0085 — Un modèle s'ajoute et se tarife dans la console ; un fournisseur, sa clé et son adresse restent dans la configuration du déploiement

- **Statut** : Accepté le 2026-10-30 par le porteur pour le principe (option b, « modèles libres, secrets fermés »). Les
  modalités des points 2 à 5 sont des **décisions de la session, à revoir par le porteur**. Le point 2 est amendé le
  2026-10-31 (fin de ce document), décision de la session, à revoir par le porteur.
- **Date** : 2026-10-30
- **Tickets** : [TCK-2448](../backlog/tickets/TCK-2448-catalogue-des-modeles-ia-en-console.md) (catalogue des
  modèles), [TCK-2449](../backlog/tickets/TCK-2449-socle-ia-neutre-vis-a-vis-du-fournisseur.md) (neutralité du
  socle), [TCK-2450](../backlog/tickets/TCK-2450-fournisseurs-ia-openai-openrouter-compatibles.md) (OpenAI, OpenRouter,
  points d'accès compatibles OpenAI)
- **Amende** : [ADR-0076](0076-le-socle-ia.md) §2 et §3, et sa conséquence « changer de modèle ou de fournisseur ne
  demande ni commit ni déploiement »

## Contexte

Mesuré sur `dev` `20c2538a4` le 2026-10-30 :

- **Le socle ne joint qu'Anthropic.** Le bloc `providers` de `takussan-api/config/ai.php` n'a qu'une entrée, et la
  console ne propose que les fournisseurs de ce bloc (`UpdateAiRoleRequest`, `UpdateAiUsageRequest`,
  `StoreAiEvaluationRequest` : `Rule::in(array_keys(config('ai.providers')))`).
- **Un modèle n'est affectable que s'il est tarifé dans `config('ai.pricing')`** (`ModelLink`,
  `AiProviderCatalogue`). Ajouter un modèle, même chez Anthropic, ou corriger un tarif demande donc un commit et un
  déploiement. La conséquence d'ADR-0076 « changer de modèle […] ne demande ni commit ni déploiement » n'est vraie
  que pour un modèle déjà tarifé.
- **Le socle porte des réglages propres à Anthropic.** `SocleAgent::providerOptions()` ne neutralise l'outil de
  sortie forcé que pour le fournisseur nommé `anthropic`. Les limites de schéma vérifiées par les tests sont celles
  d'Anthropic (`Tests\Support\Ai\AnthropicSchemas`).
- **Le SDK sait déjà joindre les autres.** `laravel/ai` fournit les pilotes `openai`, `openrouter` et
  `openai-compatible`, entre autres (`vendor/laravel/ai/config/ai.php`, `Laravel\Ai\Enums\Lab`).

Le 2026-10-30, le porteur a demandé s'il pouvait passer à OpenAI, à OpenRouter ou à un modèle compatible OpenAI, et
s'il valait mieux tout régler depuis le super-admin. Trois options lui ont été posées :

- (a) ajouter ces fournisseurs en configuration ;
- (b) rendre les modèles et leurs tarifs réglables dans la console, en laissant fournisseurs, clés et adresses dans le
  déploiement ;
- (c) tout mettre en console, clés et adresses comprises.

Il a retenu (b).

**Pourquoi pas tout en console (c) :**

- **Une adresse de fournisseur modifiable dans la console** permettrait à une session super-admin usurpée de
  détourner chaque appel, avec son contenu, vers un serveur « compatible OpenAI » de son choix.
- **Une clé en base serait chiffrée sous `APP_KEY`**, dont la rotation reste à décider (ADR-0084 proposé, TCK-614).
- **Un fournisseur est un sous-traitant de données personnelles.** Le déclarer est un acte juridique : la politique
  de confidentialité le nomme avant le premier envoi. Un bouton ne remplace pas cet acte.

## Décision

**Deux niveaux.** Un **fournisseur** (qui reçoit les données, avec quelle clé, à quelle adresse) se décide dans la
configuration du déploiement : un commit, un déploiement, la mention dans la politique de confidentialité. Un
**modèle** de ce fournisseur, et son tarif, se décident dans la console.

1. **Le catalogue des modèles est en base, avec repli sur la configuration.**
   - Une ligne par couple *(fournisseur, modèle)*. Elle porte l'identifiant exact attendu par le fournisseur, y
     compris la forme `éditeur/modèle` d'OpenRouter. Elle porte aussi les quatre tarifs en dollars US par million de
     tokens (entrée, sortie, lecture en cache, écriture en cache), et un état actif ou retiré.
   - Un couple tarifé par `config('ai.pricing')` reste au catalogue tant qu'aucune ligne ne le remplace. Une ligne
     l'emporte sur la configuration pour le même couple : la console corrige un tarif ou retire un modèle sans
     déploiement.
   - **Un tarif nul est permis s'il est saisi explicitement**, pour un point d'accès payé autrement qu'au token. Un
     tarif absent ne l'est pas : sans tarif, le budget ne se juge pas.
   - **Seul un modèle actif du catalogue, d'un fournisseur sélectionnable** (point 4), s'affecte : maillon de chaîne,
     modèle forcé d'un usage, évaluation.
   - **Retirer un modèle encore affecté est refusé**, en nommant les rôles et les usages qui l'emploient.
   - Ajouter, modifier ou retirer un modèle exige le geste `platform.ai.manage` et un second facteur récent
     (`ProtectedActions::STEP_UP`), et se journalise, comme l'affectation des chaînes (ADR-0076 §2).
   - Un changement de tarif ne réécrit aucun `ai_calls` : le coût est figé à l'appel.
   - L'évaluation avant affectation (ADR-0076 §8) reste la garde d'un modèle neuf.
   - La règle « aucun identifiant de modèle hors de `config/ai.php` » vise le code. Un identifiant saisi dans la
     console est une donnée, pas du code.

2. **Le socle ne suppose plus de fournisseur.**
   - **Aucun appel ne force l'outil de sortie, chez aucun fournisseur.** Un agent non strict pose `tool_choice` à
     `auto` dans la forme qu'attend le **pilote** (`driver`), pas le nom du fournisseur. Une instance `openrouter` qui
     sert un modèle d'Anthropic rencontre le même refus de l'outil forcé.
   - **Le mode strict se déclare par agent et par pilote.** Il n'est vrai que pour un pilote sur lequel un vrai appel
     a attesté la taille de schéma concernée : l'amendement du 2026-10-30 d'ADR-0076 s'étend ainsi à chaque pilote.
     Un pilote sans attestation est non strict : c'est un choix déclaré, jamais un repli à l'exécution.
   - Les limites de schéma vérifiées par les tests sont celles que chaque pilote publie. Un pilote qui n'en publie
     aucune est non strict.

3. **Les nouveaux fournisseurs entrent par la configuration.**
   - `openai` et `openrouter` sont déclarés dans `config/ai.php`. Leur clé et leur adresse viennent de
     l'environnement (Dokploy, ADR-0069).
   - **Un point d'accès compatible OpenAI se déclare par son nom**, une entrée par point d'accès, avec son
     `legal_name` écrit en configuration. Le pilote `openai-compatible` n'est jamais une entrée générique dont
     l'adresse suffirait à changer le destinataire.
   - **Chaque entrée déclare les hôtes qu'elle accepte.** Si l'hôte de l'adresse lue de l'environnement n'est pas dans
     cette liste, le fournisseur n'est pas sélectionnable, et la sonde de santé et le test de connexion le disent.
     La configuration écrit la règle ; l'environnement ne fait que la remplir.
   - **OpenRouter** pose sur chaque requête `provider.data_collection: "deny"`. D'après la documentation d'OpenRouter
     (« Provider Routing », relevée le 2026-10-30), cette valeur n'achemine que vers des fournisseurs qui ne
     collectent pas les données. Le réglage est en configuration et vaut `deny` par défaut.

4. **Un fournisseur n'est sélectionnable que s'il est complet** : déclaré en configuration, nommé par la politique de
   confidentialité (garde `scripts/check-ai-providers-privacy.mjs`, inchangée), avec une clé présente et une adresse
   sur un hôte accepté. Un fournisseur déclaré sans clé est affiché, mais ne reçoit rien. **Poser sa clé dans Dokploy
   est l'acte qui l'active**, et cet acte revient au porteur.

5. **La politique de confidentialité nomme chaque fournisseur déclaré.** Pour OpenRouter, elle dit qu'il achemine
   vers le fournisseur du modèle choisi. Ce texte est juridique : sa formulation est à relire par l'avocat, au même
   titre que les mentions déjà marquées ⚠ dans `privacy.ts` § 4.3.

## Conséquences

- **Un modèle neuf, ou un tarif corrigé, chez un fournisseur déclaré : aucun déploiement.** L'évaluation proposée
  avant d'affecter et le journal restent les gardes.
- **Un fournisseur neuf demande un commit, un déploiement et une ligne de la politique de confidentialité.** C'est
  voulu, et c'est rare.
- **Les chaînes de repli de `config/ai.php` restent sur Anthropic.** Rien ne change pour l'existant tant qu'aucune
  clé d'un autre fournisseur n'est posée.
- **Risque accepté** : un tarif mal saisi fausse le budget de l'usage. La saisie est journalisée, et le coût de
  chaque appel reste lisible dans le tableau de bord.
- **Ce qui n'est pas fait** :
  - une clé en base ou une adresse dans la console ;
  - un plafond de classe de données par fournisseur ;
  - le rôle `embedding`, qui attendait son premier fournisseur : Voyage AI depuis TCK-2423 (ADR-0076, amendement du
    2026-10-31). La console ne mélange pas les fournisseurs de texte et d'embeddings.
- **Coût** : cet ADR et trois tickets, [TCK-2448](../backlog/tickets/TCK-2448-catalogue-des-modeles-ia-en-console.md),
  [TCK-2449](../backlog/tickets/TCK-2449-socle-ia-neutre-vis-a-vis-du-fournisseur.md) et
  [TCK-2450](../backlog/tickets/TCK-2450-fournisseurs-ia-openai-openrouter-compatibles.md).

## Application

À écrire par TCK-2448 à TCK-2450. Ce qui empêchera la régression :

- test « un modèle hors catalogue, retiré, ou d'un fournisseur non sélectionnable ne s'affecte pas » (chaîne, modèle
  forcé, évaluation) ;
- test « retirer un modèle affecté est refusé » ;
- test « aucun agent ne force l'outil de sortie », pour chaque pilote déclaré ;
- garde `check-ai-providers-privacy.mjs` étendue : chaque entrée de `providers` déclare ses hôtes acceptés ;
- test « une adresse hors des hôtes déclarés rend le fournisseur non sélectionnable » ;
- test « une requête OpenRouter porte `provider.data_collection` ».

## Amendement du 2026-10-31 — `auto` sur `anthropic` seul, et la bascule hors d'Anthropic (TCK-2449)

Amende le point 2. **Décision de la session, à revoir par le porteur.** Aucun vrai appel à un autre fournisseur qu'Anthropic
ne l'a éprouvée : elle repose sur le SDK `laravel/ai` et sur la documentation relevée le 2026-10-31.

### Pourquoi

- **Le point 2 suppose un outil que le SDK n'envoie pas.** Hors du pilote `anthropic`, `laravel/ai` demande la sortie par
  `text.format` (OpenAI) ou `response_format` (OpenRouter, OpenAI-compatible), sans `tools`. Aucune page lue ne dit qu'un
  `tool_choice` seul serait accepté.
- **Un refus arrêtait la chaîne sur tout pilote**, alors qu'un secours valide restait disponible. Hors d'Anthropic, ce
  qu'un point d'accès accepte peut changer sans commit (OpenRouter, « Structured outputs »), et OpenRouter documente
  des pannes en HTTP 200 (« Errors and debugging »).

### Décision

- **Remplace, au point 2, « Un agent non strict pose `tool_choice` à `auto` dans la forme qu'attend le pilote » :** un
  agent non strict à sortie structurée pose `tool_choice` à `auto` sur le pilote `anthropic`, le seul où le SDK passe la
  sortie par un outil. Les pilotes `openai`, `openrouter` et `openai-compatible` la demandent par un format de réponse,
  sans outil : il n'y a rien à poser. Le pilote décide, jamais le nom du fournisseur.
- **Bascule hors d'Anthropic.** Sur un autre pilote qu'`anthropic`, **s'il reste un maillon**, la chaîne passe au suivant
  sur un statut 400, 404, 408, 413, 422 ou 500, et sur une `AiException` de classe exacte (le SDK la lève sur un corps
  qui porte `error`, y compris en HTTP 200). 401 et 403 ne basculent pas, dans le statut comme dans le corps : une clé
  refusée doit se voir. Limite : le SDK ne garde du corps que `type`, ou `code` sur OpenRouter seul. Un 401 sans `type`
  sur `openai` ou `openai-compatible` ne se lit pas, et bascule.
- **Sur le dernier maillon, l'exception part telle quelle** : les jobs et le test de connexion en lisent la cause.
- **Rien n'est rejoué autrement sur le même maillon** : ni sans mode strict, ni sans schéma.
- **Sur `anthropic`, un refus arrête toujours la chaîne, par choix de ne rien y changer.** Ce n'est pas une propriété de
  tous ces refus : un schéma refusé (400) y est déterministe et doit rester bruyant (TCK-2433), mais un 500 ou un 408 ne
  l'est pas, et ils arrêtent la chaîne quand même.
- **La bascule se voit.** La ligne de `ai_calls` porte `failed_over`, le code de l'erreur et `warning: provider_rejected`.
  Le tableau de bord de la console compte ces lignes par jour et par usage, et affiche une phrase dès qu'il y en a.
- **Un 408 vaut `ai.provider_timeout`, sur tout pilote**, Anthropic compris : un délai dépassé se reprend, et ne clôt plus
  une extraction. C'est le seul changement d'issue sur Anthropic ; aucun corps envoyé ne change.

### Conséquences

- **Risque accepté** : un fournisseur cassé s'efface derrière le secours, et le trafic et le coût glissent vers lui. Seuls
  le journal et le tableau de bord le disent : aucune alerte n'est émise.
- Un contenu refusé part chez le fournisseur suivant, comme le fait déjà un 429. La chaîne est choisie par le super-admin,
  parmi des fournisseurs que la politique de confidentialité nomme.
- **Une entrée choisie pour sa garantie sur les données renvoie désormais un refus au maillon suivant.** Son contenu part
  alors chez un fournisseur qui n'offre peut-être pas cette garantie. Qui compose une chaîne doit donc y mettre des
  fournisseurs de même garantie. Rien dans le code ne le vérifie.
- Aucune chaîne ne contient aujourd'hui de pilote non Anthropic : la règle n'a aucun effet tant qu'aucune clé n'est posée.

## Amendement du 2026-10-31 — ce que porte le corps d'une requête (TCK-2450)

Précise le point 3. **Décisions de la session, à revoir par le porteur.** Vérifiées sur la documentation d'OpenAI et
d'OpenRouter le 2026-10-31 : aucune clé n'existe, aucun vrai appel ne les a éprouvées.

- **Le pilote décide, jamais le nom de l'entrée.** Tout maillon du pilote `openai` envoie `store: false`, sans réglage. Tout
  maillon du pilote `openrouter` envoie `provider.data_collection`, `deny` si l'entrée ne dit rien. La passerelle les passe à
  l'agent : le SDK ne donne à `providerOptions()` que le pilote.
- **`provider.require_parameters` vaut `true`**, réglable sur l'entrée. Sans lui, un point d'accès qui ignore le format de
  sortie rendrait de la prose. Avec lui, une absence de point d'accès est une erreur, que la bascule absorbe s'il reste un
  maillon. La documentation ne dit pas quel statut elle rend : la bascule ne le couvre que s'il est dans sa liste.
- **Une adresse à identifiants est refusée**, en plus de la comparaison d'hôte exacte.
- **La garde `check-ai-providers-privacy.mjs` rougit sur un `data_collection` autre que `deny`** : `privacy.ts` promet
  `deny`, donc le texte change avec la configuration.

**Une redirection n'est pas suivie, sur aucun pilote, Anthropic compris, ni pour un appel d'embeddings (`embed()`, Voyage AI).** Ni le corps ni la clé ne partent vers
l'adresse rendue : `AiGateway::withoutFollowingRedirects()` fait lever `ai.provider_redirected`, classé en panne de maillon,
qui bascule s'il en reste un. Le contrôle d'hôte ne porte que sur l'adresse configurée : c'est ce refus qui le rend vrai
jusqu'au bout. Une réponse 3xx sans `Location` n'est pas une redirection : elle arrive au SDK, et finit en erreur.

**Une réponse sans `usage`** écrit `warning: usage_missing`, et le tableau de bord la compte dans `provider_rejections`. Le
budget n'en est pas informé : elle y vaut zéro.

**Une clé Voyage sans la déclaration du refus de l'entraînement n'est pas sélectionnable** (`training_opt_out_undeclared`, code
`ai.provider_unreachable`) : le catalogue a une seule réponse, et `reachable()` n'y ajoute que `https`, même en `local` et `testing`.

**Limite connue.** Derrière un dernier maillon sans clé, la cause d'un 400 se perd : l'usage rend
`ai.provider_key_missing` au lieu de `ai.request_rejected`. La ligne du journal garde la bonne cause.
