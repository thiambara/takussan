---
id: TCK-2575
title: Sa propre fiche publique ne propose pas de se contacter soi-même
status: done
phase: P1
family: front
estimate: S
wave: 85
created: 2026-11-09
updated: 2026-11-16
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  models: []
tags: [front, directory, audit-ux]
---

## Re-vérification du 2026-11-16 (sur dev @ 9112194ec)

**Verdict : toujours vrai, mais la prémisse API est fausse.** `ContactDeFiche.tsx` ne lit toujours pas
l'utilisateur connecté (derniers commits `9727d4d89`, `16dd01065`, rien sur la reconnaissance de soi).
En revanche il n'y a **aucun changement d'API à faire** : la fiche sert déjà `id`
(`PublicAgentController.php:280`, `PublicAgencyController.php:455`) et l'utilisateur d'`AuthContext`
porte le sien — `user.id === fiche.id` suffit. L'écran de modification existe (TCK-2524, done).

Reste à faire (front seul) :
- `ContactDeFiche` + barre d'actions mobile : si `user.id === fiche.id`, « C'est votre fiche publique »
  + lien (agent → son profil, langues/quartiers ; agence → `/app/agency`, bloc « Fiche publique ») ;
  clés i18n fr/en/wo (wo = texte français, wolof en pause).
- Fiche d'agence : même règle pour qui a la capacité de configurer l'agence active = l'agence de la fiche.
- Tests AC1 (HTML serveur identique à un visiteur) et AC2.

Aucune décision du porteur attendue.

## Objectif utilisateur

Un agent (ou un propriétaire listé) qui ouvre sa propre fiche publique pour voir ce que voient ses
clients n'y trouve pas un « Contacter Moustapha Fall · Message » qui l'inviterait à s'écrire, mais
une indication qu'il regarde sa propre fiche et un lien pour la modifier.

## Constat (relevé du 2026-11-09, agent « fiches », vague 3)

Connecté en `agent2@dakarimmo.sn` (Moustapha Fall), `/fr/agents/moustapha-fall` à 1440 × 900 et
390 × 844 : la carte « Contacter Moustapha Fall » et la barre d'actions « Message » sont rendues
comme pour un visiteur, et le formulaire anonyme peut être soumis à soi-même. C'était déjà le cas
avant TCK-2523.

La page est rendue côté serveur sans la session du visiteur (la fiche doit rester la même pour tous
et cacheable) ; la reconnaissance se fait donc **côté client**. ~~Or l'utilisateur d'`AuthContext` ne
porte pas le slug public (`public_slug`) : `GET /api/me` ne le sert pas aujourd'hui.~~ *Corrigé le
2026-11-16 :* `GET /api/me` ne sert pas le slug public, mais ce n'est pas nécessaire : la fiche sert `id`
(`PublicAgentController.php:280`, `PublicAgencyController.php:455`) et l'utilisateur d'`AuthContext`
porte le sien.

## Delta à produire

- [ ] ~~Servir à `GET /api/me` le slug public de l'utilisateur (ou l'identifiant comparé à `id` de la
  fiche) — ce qu'il faut pour se reconnaître, rien de plus.~~ — sans objet (relevé 2026-11-16) : la
  fiche sert déjà `id`, comparé à `user.id` d'`AuthContext` ; aucun changement d'API.
- [x] `ContactDeFiche` (et la barre d'actions au téléphone) : sur sa propre fiche, remplacer les
  canaux par « C'est votre fiche publique » et un lien vers l'écran qui la modifie (TCK-2524) : agent →
  son profil (langues, quartiers) ; agence → `/app/agency` (bloc « Fiche publique »).
- [x] Même règle sur la fiche d'agence pour qui peut configurer l'agence — « peut configurer » se lit
  à la capacité de l'agence active (pas la simple appartenance), dans le contexte d'espace existant.

## Critères d'acceptation

- [x] AC1 — Connecté en tant que la personne de la fiche : ni « Message », ni « Appeler », et le lien
  de modification est rendu ; le HTML servi par le serveur reste identique à celui d'un visiteur.
- [x] AC2 — Un autre utilisateur connecté et un anonyme voient les canaux de contact, inchangés.

## Hors périmètre

- La saisie de la vitrine elle-même (TCK-2524).

## Notes d'implémentation

_(à remplir par implementing-specs)_

## Livré (2026-11-16)

- Reconnaissance côté client seulement, dans `useFicheDeSoi` : le layout racine pose l'utilisateur dans
  `AuthContext` dès le rendu serveur, d'où un garde d'hydratation (`useSyncExternalStore`, `false` au serveur)
  — sans lui, « C'est votre fiche » entrait dans le HTML servi.
- Personne : `user.id === fiche.id`. Agence : le profil ACTIF est dans l'agence de la fiche ET `GET
  /api/me/capabilities` rend `agency.update` pour cette même agence (`agency_id` comparé) ; les capacités ne sont
  lues que si l'agence active est celle de la fiche — aucune requête de plus pour un visiteur.
- Liens : agent → `/app/profile/public-profile` ; propriétaire → `/app/profile` (la section « Fiche publique »
  rend 404 hors agent, `SectionDuProfil`) ; agence → `/app/agency`. Carte de bureau ET barre du téléphone ;
  le formulaire anonyme n'est plus monté.
- AC1 — `ContactDeFiche.test.tsx` : la personne voit « C'est votre fiche publique » + lien, aucun `data-canal` ;
  `renderToString` identique pour elle et pour un anonyme (personne et agence). Ablations : garde d'hydratation
  levé → les deux tests HTML rougissent ; reconnaissance retirée → 3 rouges.
- AC2 — mêmes tests : autre connecté, anonyme, membre sans `agency.update`, capacité dans une autre agence →
  canaux inchangés. Ablation : capacité non vérifiée → rouge. Les deux pages transmettent `fiche`
  (`page.server.test.tsx` des agents et des agences).
