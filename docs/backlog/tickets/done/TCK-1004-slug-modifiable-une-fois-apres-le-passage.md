---
id: TCK-1004
title: "Après le passage en professionnelle, l'agence garde son slug et peut le changer une fois"
status: done
phase: P2
family: full
estimate: M
wave: null
created: 2026-10-19
updated: 2026-10-19
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md#49-agencyupgraderequest-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-49--passage-dune-agence-individual-à-standard"
tags: [api, front, agency-upgrade, slug, pistes]
---

## Contexte

Réf : **P49.04** du fichier de pistes, `validé` par le porteur. L'espace créé par « Publier »
s'appelle « Espace de {prénom} » et son slug en dérive (`espace-de-awa`). La bascule
`individual → standard` ne change ni `name` ni `slug`. `name` se modifie déjà par
`PATCH /api/agencies/{id}` ; `slug` n'a aucune règle dans `AgencyUpdateRequest`, et `validated()`
l'écarte sans un mot : l'agence professionnelle garde pour toujours l'adresse publique
`/agencies/espace-de-awa`.

## Décision du porteur

> validé — à la bascule, poser un slug tiré de `company_legal_name` par `uniqueSlug()` et laisser `name` à l'admin, qui peut déjà le modifier ; sans redirection de l'ancien slug si aucune page du site ne lie la fiche d'une agence `individual` (à mesurer d'abord) ; si un tel lien existe, garder le slug et l'ouvrir une fois à l'édition ; un test de la bascule qui écrit ce que deviennent le nom et le slug (porteur, 2026-10-19, sur la recommandation du délégué)

## La mesure qui choisit la branche

Une page du site lie la fiche d'une agence `individual` (lu) :

- la fiche publique d'un bien rend `PropertyAgentCard`, qui lie `/agencies/${agency.slug}` dès que
  l'agence est présente (`takussan-web/src/app/[locale]/(public)/properties/[slug]/components/PropertyAgentCard.tsx:116`) ;
- `PropertyResource::buildAgency` rend l'agence quel que soit son `kind` ;
- `PublicAgencyController` sert `/api/public/agencies/{slug}` sans filtrer le `kind`.

La décision prend donc sa seconde branche : **la bascule garde le slug, et le slug s'ouvre une
fois à l'édition**. Le nom reste à l'admin, comme aujourd'hui.

## Hypothèses (mode sans humain)

- « Une fois » se tient dans `agencies.metadata.slug_changed_at`, posé au premier changement
  effectif ; aucune migration. L'ouverture se lit sur la marque que la bascule pose déjà,
  `metadata.welcome.standard_unlocked_at` : une agence créée `standard` n'y a pas droit.
- Renvoyer le slug courant (le formulaire le fait à chaque enregistrement) ne consomme pas le
  changement.
- Forme acceptée : minuscules, chiffres et tirets (`^[a-z0-9]+(?:-[a-z0-9]+)*$`), 100 caractères
  au plus, unique sur toutes les lignes d'`agencies`, supprimées comprises (l'index unique les
  compte).
- Hors du cas ouvert, `slug` est `prohibited` (`422`) au lieu d'être écarté en silence. Aucun
  appelant ne l'envoie aujourd'hui (lu : seul `AgencyConfigForm` appelle `updateAgencyAction`, et
  `normaliseAgencyForm` ne le portait pas).
- Pas de redirection de l'ancien slug : la décision ne la demande que dans la première branche,
  et l'aide du champ prévient que l'ancienne adresse ne fonctionnera plus.
- Texte `wo` : le français tel quel (wolof en pause).

## Delta à produire

- [x] `Agency::slugEditableOnce()` et `Agency::SLUG_CHANGED_AT`.
- [x] `AgencyUpdateRequest` : règle `slug` (ouverte une fois, `prohibited` sinon).
- [x] `AgencyController::update` : marque `metadata.slug_changed_at` au changement effectif.
- [x] `AgencyResource` : `slug_editable`.
- [x] Formulaire de configuration de l'agence : champ éditable et son aide quand `slug_editable`,
      lecture seule sinon ; le slug ne part que modifié. Clés `fields.slugEditable`,
      `fields.slugEditableHint`.
- [x] Tests : `AgencySlugAfterUpgradeTest` (5) ; `AgencyConfigForm.slug.tck-1004.test.tsx` (4).

## Critères d'acceptation

- [x] AC1 — La bascule garde `name` (« Espace de Awa ») et `slug` (`espace-de-awa`), pose
      `legal_name` ; `GET /api/agencies/{id}` rend `slug_editable: true`.
- [x] AC2 — `PATCH` avec un nouveau slug → `200`, slug changé, la fiche publique répond sous le
      nouveau slug, `slug_editable: false` ; un second changement → `422` sur `slug`.
- [x] AC3 — Renvoyer le slug courant → `200`, `slug_editable` reste `true`.
- [x] AC4 — Slug déjà pris, majuscules, espace, souligné, tiret initial ou vide → `422`, rien ne
      change, le changement reste disponible.
- [x] AC5 — Agence `individual`, ou `standard` jamais basculée : `slug_editable: false` et
      `PATCH` avec `slug` → `422`.
- [x] AC6 — Le formulaire n'ouvre le champ que si `slug_editable`, et n'envoie le slug que modifié.

## Hors périmètre

- La redirection de l'ancien slug (première branche de la décision, non retenue par la mesure).
- `uniqueSlug()` de l'onboarding hôte ne voit pas les agences supprimées (portée par défaut de
  `SoftDeletes`) alors que l'index unique les compte : vu au passage, non corrigé.

## Notes d'implémentation

- Avant : 5 rouges sur 5 (`slug_editable` absent ; `PATCH` du slug → `200` sans effet ; slug pris
  ou mal formé → `200`).
- Ablation : règle `slug` ramenée à `prohibited` partout → 3 rouges ; marque `slug_changed_at`
  retirée → le rouge du « une seule fois » ; côté front, `slugEditable` forcé à faux → 1 rouge,
  condition « modifié » retirée de `normaliseAgencyForm` → 1 rouge ; tout remis → verts.
- La forme du slug ne se contrôle pas dans le schéma zod : les slugs créés par `Agency::booted()`
  portent des majuscules (`Str::random(5)`), et un contrôle côté client bloquerait
  l'enregistrement du reste du formulaire. L'API rend l'erreur sur le champ.
