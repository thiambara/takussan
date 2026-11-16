# ADR-0116 — Une fiche d'une autre de vos agences se nomme, sans se montrer

- **Statut** : Accepté le 2026-11-15 — décision du porteur « implémente tout », modalités à revoir
- **Date** : 2026-11-15
- **Tickets** : TCK-2847 (API), TCK-2848 (écrans)
- **S'appuie sur** : principe n° 2 (« l'agence est la frontière d'isolation »), [ADR-0004](0004-profil-actif-resolu-par-middleware.md) (profil actif), [ADR-0031](0031-personnel-de-l-agence-et-cloisonnement-des-bailleurs.md) (personnel de l'agence, profil suspendu)
- **Précédent** : `AgenceDeLaCible` (TCK-2751) — la cloche rend déjà l'agence de l'objet d'une notification au membre de cette agence

## Contexte

Mesuré le 2026-11-15 (worktree `feat/audit-manques-2026-11-15`) :

- Une fiche d'une autre agence répond 404 ou 403 sous le profil actif : l'API ne distingue pas « inexistante » de « dans une autre de vos agences ». TCK-2619 l'avait écarté pour ce motif.
- L'agent de deux agences qui ouvre un lien vers une fiche de l'autre agence (courriel, message, lien copié) tombe sur « introuvable », sans apprendre qu'un changement d'espace suffit.
- Seules les notifications connaissent l'agence de leur objet (`target.agency_id`, rendu au seul membre actif de cette agence).

Dire « cette fiche est dans votre espace Thiès Properties » révèle qu'un objet existe. C'est une entorse au cloisonnement, et il faut en fixer les bornes.

## Décision

### 1. `GET /api/me/locate?type=…&id=…` nomme l'espace qui lit la fiche, et rien d'autre

- `type` est une liste fermée : `bien`, `demande`, `client`, `bail`, `intervention`, `visite`, `reservation`, `bailleur`. `id` est un entier borné. Hors de ces bornes : 422.
- La réponse est `{profile_id, agency: {id, name} | null, role}` : le profil de l'appelant sous lequel la fiche se lit, son agence, son type. **Jamais** le titre, le statut ni aucune donnée de l'objet.

### 2. Le juge est la policy de la fiche, sous chaque profil, jamais une comparaison d'agences

Pour chaque profil **actif** de l'appelant (`ActiveProfileResolver::isActiveProfile`), la policy `view` de l'objet est appelée **comme si ce profil était actif** (attribut `active_profile` de la requête posé puis rendu dans un `finally`, comme `DocumentExpiryReminder`). Le premier profil qui lit la fiche est rendu ; les profils de l'agence de l'objet sont essayés d'abord, pour nommer l'espace attendu quand plusieurs lisent.

C'est la policy, et non un `where agency_id`, qui garde la réponse : un profil suspendu ou parti n'est jamais essayé ; un profil actif dans l'agence de l'objet mais sans le droit de lire la fiche (un bailleur qui n'en est pas le bailleur) ne la fait pas nommer.

### 3. Sinon, le même 404, quelle qu'en soit la raison

Objet absent, en corbeille, ou lu par aucun profil : **le même corps** (`abort(404)` de `MeLocateController`, le 404 générique de l'API), par un seul chemin de sortie. Ce que l'on garantit sur le **temps** : aucune branche n'émet de requête propre à l'objet au-delà de sa lecture par id et des lectures de la policy ; un objet absent économise ces dernières. L'écart est de l'ordre d'une requête indexée, et la route est limitée en débit (`throttle:30,1`) — on ne prétend pas à un temps constant.

### 4. Le super-admin n'a rien à localiser

`Gate::before` lui accorde toute lecture : sous n'importe quel profil, la policy dirait oui, et la réponse nommerait un espace au hasard. Pour lui, la route répond le même 404. Il lit les fiches par la console d'administration.

### 5. L'activité de chaque espace se calcule sous le même mécanisme

`GET /api/me/profiles?include=activity` ajoute à chaque profil actif les compteurs de son « Aujourd'hui », calculés profil lié comme ci-dessus, par les règles des listes qui les montrent (`VisitesLisibles`, la portée de l'index des demandes, `MaintenanceRequest::visibleTo`, `PortfolioScope`) — jamais recopiées. Le nombre de requêtes est borné par profil et indépendant du nombre d'objets.

## Conséquences

- **Ce qui se révèle** : à un membre actif d'une agence qui y lit la fiche, que cette fiche existe et dans quelle agence. C'est exactement ce que lui montrerait un changement d'espace : rien qu'il ne puisse déjà lire.
- **Ce qui ne se révèle pas** : à quiconque sans profil actif qui lit la fiche, rien — même corps qu'un id inexistant.
- **Coût** : au plus une évaluation de policy par profil actif (un compte en a rarement plus de quatre).
- Le locataire n'est pas un profil commutable (`ActiveProfileResolver::TYPE_MAP`) : il n'a ni ligne d'espace ni compteur.

## Application

- `app/Services/Profiles/SousLeProfil.php` (le jugement sous un profil), `app/Services/Profiles/OuEstLaFiche.php`, `app/Http/Controllers/Api/Me/MeLocateController.php`, `app/Services/Profiles/ActiviteDesEspaces.php`.
- Tests : `tests/Feature/Api/Me/LocateAcrossProfilesTest.php` (dont l'ablation de la policy, AC4), `tests/Feature/Api/Me/MeProfilesActivityTest.php`.
