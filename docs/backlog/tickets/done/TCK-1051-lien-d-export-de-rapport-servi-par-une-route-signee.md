---
id: TCK-1051
title: "Le courriel « export de rapport prêt » mène à une route signée, liée au demandeur, qui sert le fichier"
status: done
phase: P2
family: bug
estimate: M
wave: null
created: 2026-10-20
updated: 2026-10-20
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#25-reporting--tableaux-de-bord"
  models:
    - "docs/models-spec.md#62-reportexport-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#le-courriel--export-de-rapport-prêt--mène-à-une-route-qui-nexiste-pas"
tags: [back, reporting, console, url-signee, pistes]
---

## Objectif utilisateur

L'opérateur qui reçoit le courriel « Votre export de rapport est prêt » télécharge son fichier d'un
clic, depuis sa messagerie, jusqu'à l'échéance annoncée de 7 jours ; personne d'autre que lui ne
peut s'en servir.

## Contexte

Réf : **P63.02** du fichier de pistes, `validé` (critère V7 accordé ; la délégation avait laissé
au porteur le V2 de la liaison au demandeur, que la précision tranche).

L'export asynchrone d'un rapport de la console (TCK-227, au-delà de 10 000 lignes) écrit
`reports/{report}-{id}.csv` puis envoie un courriel dont le lien visait
`/api/admin/reports/{report}/exports/{id}/download`. Mesuré avant correctif (test de garde
ci-dessous) : aucune route ne répond à ce chemin, le clic rend 404, et rien ne lit le fichier.

## Décision du porteur

> (a) une route de téléchargement `signed` jusqu'à `expires_at`, hors `auth:sanctum`, liée au demandeur comme P63.01, qui ne sert que l'export `ready` désigné ; la notification la produit par `URL::temporarySignedRoute` (porteur, 2026-10-20)

## Hypothèses (mode sans humain)

- « liée au demandeur comme P63.01 » se lit comme dans TCK-1050 (PR #804, non fusionnée au
  moment du passage) : le compte demandeur est un paramètre `user` signé avec l'export, et le
  téléchargement exige que ce compte existe encore et soit celui de `requested_by`. Aucun
  contrôle de rôle au clic : P63.01 n'en pose pas.
- La route vit hors du préfixe `/api/admin`, gardé en bloc par `super-admin` :
  `GET /api/report-exports/{reportExport}/download` (`report-exports.download`), sous `signed`
  et `throttle:60,1` comme `media.private.show`.
- Un lien dont l'export n'est pas `ready`, est échu, n'a plus de fichier ou désigne un autre
  demandeur rend 404 ; un lien sans signature, retouché ou expiré rend 403 (`signed`).

## Delta à produire

- [x] `App\Http\Controllers\Api\ReportExportDownloadController` (invocable) et sa
  `signedUrl(ReportExport)`, signée jusqu'à `expires_at`.
- [x] Route `report-exports.download` dans `routes/api/admin.php`, hors du groupe `super-admin`.
- [x] `ReportExportReadyNotification::toMail()` produit ce lien.
- [x] Test `tests/Feature/Api/Admin/ReportExportDownloadTest.php` (5 tests).

## Critères d'acceptation

- [x] AC1 — le lien du courriel vise une route déclarée, hors `auth:sanctum`, qui sert le fichier
  écrit par le job, sans session.
- [x] AC2 — après `expires_at`, le lien rend 403.
- [x] AC3 — sans signature, ou l'identifiant retouché, 403.
- [x] AC4 — un lien signé pour un autre compte que le demandeur rend 404.
- [x] AC5 — un export qui n'est pas `ready` ne se sert pas.

## Hors périmètre

- La signature relative (P73.02) et l'hôte des URL signées (P73.01) : le lien est signé comme les
  autres liens de l'API aujourd'hui.
- La purge des fichiers `reports/*` à l'échéance (angle 77).
- Le texte du courriel n'est pas touché.

## Notes d'implémentation

- Ablations : le lien d'avant remis dans la notification → 3 rouges sur 5 (route absente, puis 404
  au lieu de 403) ; la comparaison `requested_by` retirée → 1 rouge (lien d'un autre compte servi) ;
  le contrôle `ready` retiré → 1 rouge ; remis → 5 verts.
