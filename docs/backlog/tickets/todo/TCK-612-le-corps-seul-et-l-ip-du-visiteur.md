---
id: TCK-612
title: "Ce qui transite par le BFF garde sa forme : une écriture lit le corps seul (`BaseFormRequest`), et chaque route handler transmet l'IP du visiteur par l'adresse interne — volet front fermé par TCK-893/TCK-894 (suites de TCK-600 passe 2 et du rapport de TCK-600)"
status: todo
phase: P2
family: back
estimate: M
wave: 76
created: 2026-10-08
updated: 2026-11-16
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#21-authentification--comptes
    - docs/features.md#29-administration--configuration
  models:
    - docs/models-spec.md#1-user
tags: [back, securite, form-request, rate-limit, ip, adr-0052, garde]
---

# TCK-612 — Une écriture lit le corps seul ; chaque route handler transmet l'IP du visiteur

## Re-vérification du 2026-11-16 (sur dev @ 9112194ec)

**Verdict : partiellement fermé — le volet front est caduc, le volet back reste entier.**

- Fermé entre-temps : le point 2 (IP du visiteur, AC4, AC5, deltas front) par **TCK-893**
  (169b733c1, `relayerVersApi()`) et **TCK-894** (f35f9f36b) : les 39 `route.ts` passent par
  `relayerVersApi()` ou `urlApiServeur()` + `enTetesServeurAmont()` (`X-Forwarded-For`), gardés
  par `src/app/api/__tests__/relais-chemin-serveur.test.ts`.
- Toujours vrai : `BaseFormRequest::prepareForValidation` (l.90-93) fait toujours
  `replace(normalize(input()))`, aucun `validationData()` ; **347** classes en héritent ;
  `QueryNeverFeedsAWriteTest` absent ; la route d'AC2 (`customers.php:49`) est là.
- Reste à faire (api seul) :
  - `validationData()` = corps seul pour une méthode non sûre ; `prepareForValidation` normalise
    le corps seul ;
  - inventaire des écritures qui lisent un champ en query (57 `->query(` dans
    `app/Http/Controllers`, à trier lecture/écriture), migration ou exemption motivée ;
  - `QueryNeverFeedsAWriteTest` (parcours de `Route::getRoutes()`), AC2, ablation.
- Aucune décision du porteur attendue.

## Objectif utilisateur

Un utilisateur dont une URL a été réécrite ne fait jamais faire à l'API une écriture qu'il n'a pas
saisie ; deux visiteurs ne partagent jamais le seau de débit du serveur Next.

## Contexte

Suites de **TCK-600** : verif-600 passe 2 (B1-bis, « API, défense en profondeur ») et
`TCK-600-rapport.md` (« Reste ouvert »), consignées dans `FILE-D-ATTENTE.md` (15:00, 15:35).

**Re-mesure sur `839be671` (2026-10-08)** :

1. **La query entre dans le corps de toute écriture.** `BaseFormRequest::prepareForValidation`
   (`takussan-api/app/Http/Requests/BaseFormRequest.php`) fait `$this->replace($this->normalize($this->input()))` :
   `input()` fusionne la query et le corps, et `replace` réécrit le tout dans la source d'entrée (le
   corps JSON). Toute requête validée d'une écriture accepte donc un champ venu de l'URL. 215 classes
   en héritent (**347** au 2026-11-16) (`grep -rln "extends BaseFormRequest" app | wc -l`) ; **une seule** s'en protège,
   `StartImpersonationRequest` (`validationData()` lit le corps seul, verif-600 B1-bis). Le défaut est
   la condition qui a rendu B1-bis exploitable (`POST …/impersonate?reason=…` sous n'importe quel
   corps).
2. *Fermé par TCK-893 et TCK-894 : les 39 `route.ts` passent par `relayerVersApi()` ou
   `urlApiServeur()` + `enTetesServeurAmont()` (relevé 2026-11-16). Constat d'origine conservé :*
   **21 route handlers joignent l'API par l'URL publique, sans l'IP du visiteur.** ADR-0052 §5 : le
   serveur Next joint l'API par `API_INTERNAL_URL` et transmet `X-Forwarded-For`, seul chemin sur
   lequel Laravel honore l'IP du visiteur (`takussan-web/src/lib/api.ts:14-27`, `ipDuVisiteur`
   `:551`). `apiFetch` / `apiRequest` le font ; les fichiers `src/app/api/**/route.ts` qui lisent
   `API_URL` directement ne le font pas — **21** sur 36, aucun n'appelant `ipDuVisiteur`, dont
   `super-admin/[...path]`, `admin-users/[[...path]]`, `agencies/[[...path]]`, `export/[entity]`,
   `me/*/kyc/upload`, `me/payouts`, `data-exports/[id]/download`. Leurs requêtes partagent le seau du
   serveur Next (`TCK-600-rapport.md` : « les lectures sous impersonation partagent donc le seau du
   limiteur du serveur Next »).

## Contraintes strictes (métier)

1. **Une écriture (`POST`, `PUT`, `PATCH`, `DELETE`) se valide sur le corps seul.** La query reste
   lisible là où un contrôleur la lit explicitement pour un filtre (`filter[]`, `include=`, lectures
   `GET`), jamais comme champ validé d'une écriture.
2. Un endpoint d'écriture qui **attend** aujourd'hui un champ en query (lien signé, `?force=`…) est
   inventorié avant le changement et migré au corps, ou exempté avec motif — sans régression de
   contrat côté front.
3. Le front ne construit qu'**un** chemin vers l'API côté serveur : `apiFetch` / `apiRequest`, ou un
   assistant commun qui porte `API_INTERNAL_URL` et l'IP du visiteur. Un route handler n'écrit plus
   `fetch(\`${API_URL}…\`)` lui-même.
4. Le flux binaire (téléversements KYC, téléchargements d'export) reste un flux : l'assistant commun
   ne lit pas le corps en mémoire.

## Delta à produire

- [x] Back : `BaseFormRequest::validationData()` → corps seul pour une méthode non sûre ;
      `prepareForValidation` normalise le corps seul. `StartImpersonationRequest` garde sa forme
      (redondante, gardée par son test).
- [x] Back : inventaire des écritures qui lisent un champ en query (`grep -rn "query(" app/Http`),
      consigné dans les Notes, et migration ou exemption motivée.
- [x] Front : les 21 route handlers passent par l'assistant serveur commun (contrainte 3) (tenu par TCK-894, relevé 2026-11-16).
- [x] Garde front (tenu par TCK-894, `relais-chemin-serveur.test.ts`, relevé 2026-11-16) : un test (ou `scripts/check-*.mjs`) échoue si un fichier `src/app/api/**/route.ts`
      lit `API_URL` / `NEXT_PUBLIC_API_URL` au lieu de l'assistant commun.
- [x] Tests : `QueryNeverFeedsAWriteTest` (back), ~~tests des route handlers (front)~~ — caduc depuis TCK-894.

## Critères d'acceptation

- [x] **AC1 (rouge sur `839be671`).** Un test parcourt **`Route::getRoutes()`** et, pour chaque route
      d'écriture dont l'action type-hint une `BaseFormRequest`, construit la requête avec un champ de
      ses `rules()` placé **en query seulement** : `validated()` ne le contient pas. Les exemptions
      motivées sont listées dans le test. Une `FormRequest` ajoutée demain est couverte sans toucher au
      test.
- [x] **AC2.** `POST /api/customers/{id}/notes?body=injecte` avec un corps `{"body":"saisi"}` : la note
      porte « saisi » ; sans corps, 422.
- [x] **AC3.** Les tests existants des écritures restent verts (le front envoie déjà ses champs dans le
      corps) ; l'inventaire de la contrainte 2 est vide ou résolu.
- [x] **AC4 (rouge sur `839be671`).** *(tenu par TCK-894, relevé 2026-11-16)* La garde front rougit sur un route handler qui lit `API_URL`
      directement ; elle est verte après la migration des 21.
- [x] **AC5.** *(tenu par TCK-894, relevé 2026-11-16)* Un route handler migré, appelé avec `x-forwarded-for: 203.0.113.7` derrière le nombre de
      mandataires de confiance configuré, transmet `203.0.113.7` à l'API par `API_INTERNAL_URL`
      (test du handler, `fetch` simulé).
- [x] Ablations consignées : `validationData()` rendu à `all()` → AC1 rouge ; ~~un handler remis en
      `fetch` direct → AC4 rouge~~ — caduc depuis TCK-894.

## Hors périmètre

- Le constructeur de chemins `cheminApi` des server actions (TCK-600, fait).
- La mesure de l'IP réelle vue par Laravel en préproduction (ADR-0052 §6, au porteur).

## Notes d'implémentation

**Inventaire de la contrainte 2 (2026-11-16).** Les 57 `->query(` de `app/Http/Controllers` relus
(script de tri par route) : tous sur des `GET` sauf

- `PublicPropertyController::view` (`POST …/view?src=sponsored`) — signal de comptage, sans
  FormRequest, ni champ validé : **exempté** (une URL réécrite ne fait que compter une vue sponsorisée) ;
- `LAfricaMobileSmsStatusController`, webhooks WhatsApp — routes `GET`, contrat du fournisseur : hors sujet.

Hors `->query(` : `AgencyController::removeAgent` (`DELETE …/agents|members/{user}`) lisait
`leave_unassigned` par `boolean()`, query comprise — **migré** au corps seul (le front l'envoie déjà
dans le corps, `lib/queries/agent-crm.ts`). Côté FormRequest, deux écritures lisent un champ en query
par contrat : **exemptées** par `$queryKeysAcceptedOnWrite`, motif dans la classe —
`PurgeExpiredInvitationsRequest` (`filter`, un `DELETE` sans corps) et
`UnsubscribePublicSearchAlertRequest` (`token`, RFC 8058).

## Livré (2026-11-16)

- `BaseFormRequest`, pour une méthode non sûre : `validationData()` = corps + fichiers (+ clés
  exemptées) ; `prepareForValidation()` normalise le corps seul ; les clés que la query porte seule
  sont **cachées** pendant `prepareForValidation()` (rendues avant `authorize()`), pour qu'une
  sous-classe qui relit `input()` puis `merge()` (`InviteAgentRequest`, `StoreCustomerRequest`…) ne
  les recopie pas ; une fois les règles connues, un champ **réglé** venu de la query seule est retiré
  de la query (`input()`/`boolean()` du contrôleur ne le voient plus), les paramètres sans règle
  (`include`, `fields`, `lang`) restent lisibles. `GET`/`HEAD` inchangés.
- AC1 : `tests/Feature/Validation/QueryNeverFeedsAWriteTest.php` parcourt `Route::getRoutes()` et
  compare `validationData()` sans query / avec chaque champ des `rules()` en query ; exemptions
  recensées dans le test, plancher de 200 écritures couvertes. Les `rules()` qui lisent le modèle lié
  à la route sont couverts par un champ témoin (le mécanisme ne dépend pas du nom du champ).
- AC2 : `test_la_note_d_un_client_porte_le_corps_et_non_la_query` et `…_query_seule_est_refusee`.
- AC3 : 382 tests verts sur `tests/Feature/Validation` + les classes qui postent avec une query.
- Ablations : `validationData()` rendu à `all()` → AC1 + AC2 (422) rouges ; cacher neutralisé → AC1
  (6 FormRequests : invitations, clients, demande de passage en agence) rouge ; retrait de la query
  neutralisé → test `input()` rouge ; `removeAgent` remis à `boolean()` → son test rouge.
- `StartImpersonationRequest` garde sa forme (redondante). Les 36 classes qui étendent `FormRequest`
  directement (`LoginRequest`, `StoreAgentHandoverRequest`, `InitiatePaymentRequest`…) ne sont pas
  couvertes : hors de la classe de base du ticket.
