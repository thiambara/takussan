---
id: TCK-1788
title: "Un renouvellement qui naît actif sans signature fige son contrat"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#110-documents--contrats"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-140--pdf-figés-face-aux-pdf-recomposés-à-chaque-téléchargement"
tags: [api, bail, renouvellement, pdf, pistes]
---

## Objectif utilisateur

Le contrat de bail d'un renouvellement né actif, téléchargé aujourd'hui ou dans un an, imprime les
termes du jour de sa naissance : une révision de loyer ou un réglage d'agence changé ensuite ne le
réécrivent plus.

## Contexte

Réf : **P140.01** du fichier de pistes.

### Décision du porteur

> validé — validation en bloc du porteur (2026-10-22) : la piste telle qu'écrite, avec la recommandation du délégué quand l'entrée en porte une ; où elle laisse plusieurs voies sans recommandation, l'implémenteur retient la plus étroite et écrit son choix dans le ticket

**Choix de l'implémenteur** : la `Piste` propose de figer le contrat (voie principale) ou, « à
défaut », d'imprimer une mention d'état courant. Seule la première tient la garde que la `Piste`
demande (« renouvellement actif, révision, contrat inchangé ») : c'est elle qui est retenue, en
réemployant le rendu et la collection `signed_contract` de `LeaseSignatureService`, sans aucun
texte neuf.

**Limite** : le gel ne vaut que pour un enfant dont les termes d'exécution sont posés (hérités d'un
parent figé, ou renégociés). ADR-0042 §1, accepté, écrit « Seul un parent antérieur (colonnes
nulles) donne un enfant nul » : figer ces termes sur l'enfant d'un parent antérieur, comme la
seconde garde de la `Piste` le demande, change une décision d'ADR (V6, autre que V7 et V1 accordés,
et `docs/adr/` est fermé à l'implémenteur).

## Reste à faire

- Les termes d'exécution (et donc le contrat) de l'enfant actif d'un parent antérieur, que
  ADR-0042 §1 laisse nuls : au porteur, par un amendement de l'ADR.

Mesuré avant correctif (2026-10-23, `529ebc0ac`) : bail actif à 400 000 renouvelé à 450 000 par
`POST /api/leases/{id}/renew` → enfant `active`, `contract_sha256`, `rent_review_max_pct` et
`early_termination_penalty_months` nuls (test de garde rouge sur la première assertion). Avec un
parent figé (termes d'exécution posés), l'enfant actif n'a pas non plus d'empreinte, et une révision
de loyer réécrit le loyer imprimé.

## Hypothèses (mode sans humain)

- Le gel se fait à la naissance `active` seulement ; un enfant `pending_signature` est figé par sa
  demande de signature, comme avant.
- Le PDF est rendu dans la transaction du renouvellement, et le fichier écrit en dernière étape,
  après tout ce qui peut encore refuser (même règle que `signOnPaper`, VERIF-596 M-F).
- Conséquence assumée : l'enfant ayant désormais des termes d'exécution figés, son propre
  renouvellement qui change un terme renégociable naît `pending_signature`
  (`LeaseRenewalService::isFrozen`), comme pour tout bail dont les termes sont figés.
- Le garant ajouté après coup (constat « déduit, à vérifier ») n'est pas traité : un bail figé
  imprime ses garants du jour du gel, et l'attache d'un garant sur un bail actif reste ouverte.

## Delta à produire

- [x] `LeaseSignatureService::freezeRenewal()` : empreinte, média `signed_contract` ; rendu partagé
  avec `request()` par `renderContract()`.
- [x] `LeaseRenewalService::renew()` l'appelle quand l'enfant naît `active` avec ses deux termes
  d'exécution posés.
- [x] `LeaseContractTermsTest::test_a_parent_frozen_by_its_columns_only_still_requires_a_signature`
  attendait un enfant « sans empreinte » : il attend désormais l'empreinte, son objet (le
  petit-enfant à +50 % se signe) est inchangé.
- [x] Garde : `tests/Feature/Api/LeaseRenewalFrozenContractTest.php`.

## Critères d'acceptation

- [x] AC1 — Renouvellement actif d'un parent figé → `contract_sha256` posé, termes d'exécution
  hérités ; le contrat servi a l'empreinte enregistrée.
- [x] AC2 — Révision du loyer de 400 000 à 420 000 → le contrat servi est identique octet pour octet.
- [x] AC3 — Un renouvellement né `pending_signature` n'est pas figé à sa naissance.
- [x] AC4 — Le renouvellement actif d'un parent antérieur reste sans empreinte ni termes (ADR-0042 §1).

## Notes d'implémentation

- Ablation : appel à `freezeRenewal()` retiré → AC1 rouge (`contract_sha256` nul) ; remis → vert.
- Piège : un renouvellement d'un parent figé qui change le loyer naît `pending_signature`
  (avenant, ADR-0042 §1) ; le scénario renouvelle donc au même loyer, puis révise.
- Une première version figeait aussi l'enfant d'un parent antérieur : `LeaseContractTermsTest`
  (`test_a_renewal_of_a_legacy_lease_stays_unfrozen`) a rougi sur la règle d'ADR-0042 §1.
- Les tests sondent le vrai gabarit rendu en HTML (mock partiel de `render`, même sonde que
  `LeaseSignatureTest`) : le loyer imprimé se lit dans les octets servis.
