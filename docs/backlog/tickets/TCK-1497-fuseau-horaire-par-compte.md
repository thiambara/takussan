---
id: TCK-1497
title: "Un fuseau horaire par compte : `timezone` sur `PATCH /api/me` et un champ au profil"
status: done
phase: P2
family: full
estimate: M
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  models:
    - "docs/models-spec.md"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-107--champs-de-contact-du-profil--lus-par-les-chemins-qui-envoient-ou-seulement-affichés"
tags: [back, front, profil, fuseau, pistes]
---

## Contexte

Réf : **P107.03** du fichier de pistes, `validé` (critère V7 accordé).

`users.timezone` (défaut `Africa/Dakar`, « Fuseau horaire préféré » dans la spec des modèles) est
lu par le rendu des notifications, des rappels de visite et l'heure du résumé, mais n'avait aucun
écrivain : tous les comptes restaient à Dakar. `SetLocaleMiddleware.php:47-53` posait le fuseau du
processus depuis le compte, bloc mort sous jeton (TCK-536).

## Décision du porteur

validé — porteur (2026-10-22) : un fuseau par compte : `timezone` (`timezone:all`) accepté sur `PATCH /api/me` avec un champ au profil ; le bloc mort de `SetLocaleMiddleware.php:47-53` retiré sans l'activer

## Delta

- [x] `UpdateMeRequest` : `timezone` → `sometimes|string|timezone:all` ; `MeController::update`
  l'écrit sur la colonne.
- [x] `UserResource` : `timezone` rendu pour SOI (bloc « pour soi », comme les préférences de
  contact), pour que le champ lise la valeur enregistrée.
- [x] `SetLocaleMiddleware` : bloc `date_default_timezone_set` retiré, remplacé par un commentaire.
- [x] Front : `ProfileTimezoneSection` sur `/app/profile`, sous les coordonnées : liste native des
  fuseaux IANA (`Intl.supportedValuesOf('timeZone')`), enregistrement par le relais
  `PATCH /api/me`. Clés `profile.timezone.*` en `fr` et `en`, `wo` en français tel quel (pause du
  wolof).

## Hypothèses (mode sans humain)

- Les dates des écrans du front restent à Dakar : le réglage gouverne les rendus de l'API seuls
  (question que la mesure du délégué laissait ouverte ; l'option la plus étroite).
- Un `<select>` natif, comme `CreatePayoutDialog` : la liste compte plus de 400 fuseaux, et la
  primitive `Select` n'a pas de recherche.
- Les libellés sont les identifiants IANA bruts (« Europe/Paris ») : aucun texte de produit neuf
  par fuseau.

## Critères d'acceptation

- [x] AC1 — `PATCH /api/me {timezone: "Europe/Paris"}` enregistre et rend `data.timezone`.
- [x] AC2 — `Mars/Olympus`, `""`, `null`, `UTC+2` → 422 sur `timezone`, colonne inchangée.
- [x] AC3 — sans la clé, le fuseau ne change pas.
- [x] AC4 — une requête d'un compte à `Asia/Tokyo` ne change pas le fuseau du processus.
- [x] AC5 — le champ du profil montre le fuseau du compte (Dakar à défaut) et l'enregistre ;
  un échec se dit.

## Notes d'implémentation

- Ablation API : les quatre fichiers d'`app/` rendus à leur version d'avant → 3 rouges dans
  `MeUpdateTest` (dont AC4 : sous `actingAs`, `$request->user()` voyait le compte et le bloc mort
  tournait), remis → 17/17.
- Ablation front : corps de la requête vidé → 1 rouge sur 3, remis → 3/3.
