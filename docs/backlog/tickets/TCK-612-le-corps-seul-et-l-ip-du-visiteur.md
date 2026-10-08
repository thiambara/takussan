---
id: TCK-612
title: "Ce qui transite par le BFF garde sa forme : une écriture lit le corps seul (`BaseFormRequest`), et chaque route handler transmet l'IP du visiteur par l'adresse interne (suites de TCK-600 passe 2 et du rapport de TCK-600)"
status: todo
phase: P2
family: full
estimate: M
wave: 74
created: 2026-10-08
updated: 2026-10-08
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#21-authentification--comptes
    - docs/features.md#29-administration--configuration
  models:
    - docs/models-spec.md#1-user
tags: [back, front, bff, securite, form-request, rate-limit, ip, adr-0052, garde]
---

# TCK-612 — Une écriture lit le corps seul ; chaque route handler transmet l'IP du visiteur

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
   en héritent (`grep -rln "extends BaseFormRequest" app | wc -l`) ; **une seule** s'en protège,
   `StartImpersonationRequest` (`validationData()` lit le corps seul, verif-600 B1-bis). Le défaut est
   la condition qui a rendu B1-bis exploitable (`POST …/impersonate?reason=…` sous n'importe quel
   corps).
2. **21 route handlers joignent l'API par l'URL publique, sans l'IP du visiteur.** ADR-0052 §5 : le
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

- [ ] Back : `BaseFormRequest::validationData()` → corps seul pour une méthode non sûre ;
      `prepareForValidation` normalise le corps seul. `StartImpersonationRequest` garde sa forme
      (redondante, gardée par son test).
- [ ] Back : inventaire des écritures qui lisent un champ en query (`grep -rn "query(" app/Http`),
      consigné dans les Notes, et migration ou exemption motivée.
- [ ] Front : les 21 route handlers passent par l'assistant serveur commun (contrainte 3).
- [ ] Garde front : un test (ou `scripts/check-*.mjs`) échoue si un fichier `src/app/api/**/route.ts`
      lit `API_URL` / `NEXT_PUBLIC_API_URL` au lieu de l'assistant commun.
- [ ] Tests : `QueryNeverFeedsAWriteTest` (back), tests des route handlers (front).

## Critères d'acceptation

- [ ] **AC1 (rouge sur `839be671`).** Un test parcourt **`Route::getRoutes()`** et, pour chaque route
      d'écriture dont l'action type-hint une `BaseFormRequest`, construit la requête avec un champ de
      ses `rules()` placé **en query seulement** : `validated()` ne le contient pas. Les exemptions
      motivées sont listées dans le test. Une `FormRequest` ajoutée demain est couverte sans toucher au
      test.
- [ ] **AC2.** `POST /api/customers/{id}/notes?body=injecte` avec un corps `{"body":"saisi"}` : la note
      porte « saisi » ; sans corps, 422.
- [ ] **AC3.** Les tests existants des écritures restent verts (le front envoie déjà ses champs dans le
      corps) ; l'inventaire de la contrainte 2 est vide ou résolu.
- [ ] **AC4 (rouge sur `839be671`).** La garde front rougit sur un route handler qui lit `API_URL`
      directement ; elle est verte après la migration des 21.
- [ ] **AC5.** Un route handler migré, appelé avec `x-forwarded-for: 203.0.113.7` derrière le nombre de
      mandataires de confiance configuré, transmet `203.0.113.7` à l'API par `API_INTERNAL_URL`
      (test du handler, `fetch` simulé).
- [ ] Ablations consignées : `validationData()` rendu à `all()` → AC1 rouge ; un handler remis en
      `fetch` direct → AC4 rouge.

## Hors périmètre

- Le constructeur de chemins `cheminApi` des server actions (TCK-600, fait).
- La mesure de l'IP réelle vue par Laravel en préproduction (ADR-0052 §6, au porteur).

## Notes d'implémentation

_(à remplir par implementing-specs)_
