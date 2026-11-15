# ADR-0111 — Les réglages de bail de l'agence se lisent par tout son personnel actif, et ne s'écrivent que par qui configure l'agence

- **Statut** : Accepté le 2026-11-15 (le porteur a demandé « écris les tickets pour tous les manques, implémente tout » — la proposition ci-après vaut acceptation, modalités à revoir) — proposé le 2026-11-15. **Décision du porteur** (2026-11-15, à la lecture de l'audit des maquettes de `/app`) : l'état « Lecture seule » de la maquette des réglages de bail est à construire, ce qui suppose que l'API serve la lecture à qui n'est pas administrateur. **Décisions de la session, à revoir** : le cercle des lecteurs (le personnel actif, au sens d'[ADR-0031](0031-personnel-de-l-agence-et-cloisonnement-des-bailleurs.md), et lui seul) et la forme de `can_edit`.
- **Date** : 2026-11-15
- **Tickets** : TCK-2920 (l'API), TCK-2921 (l'écran)
- **S'appuie sur** : [ADR-0031](0031-personnel-de-l-agence-et-cloisonnement-des-bailleurs.md) (le périmètre d'une agence appartient à son personnel actif), [ADR-0106](0106-la-maquette-retenue-fait-foi-au-pixel.md) (la maquette retenue fait foi)

## Contexte

Relevé sur `origin/dev` le 2026-11-15, en lecture seule :

- `GET /api/settings/lease` (`takussan-api/app/Http/Controllers/Api/LeaseSettingsController.php`, TCK-2832) n'est servi qu'à qui passe `AgencyPolicy::configure` : le super-admin, l'admin principal, ou un admin d'agence qui a `agency.update`. Un agent reçoit **403**.
- La réponse porte `can_edit`, **écrit en dur à `true`** : la lecture et l'écriture ont aujourd'hui la même porte, et le champ ne dit rien.
- Le front en a tiré une règle écrite seulement dans un commentaire (`takussan-web/src/lib/agence/fiche.ts:67-69`) : « L'API refuse la lecture aux autres : pas d'état lecture ». La section « Réglages de bail » de « Mon agence » et la page `/app/agency/lease-settings` (`lib/access/pages-admin.ts`) sont réservées au rôle `admin`. Aucune fiche de fidélité n'acte cet écart.
- **La maquette retenue** (`agence-reglages-bail`, approche A, écran « Lecture seule ») dessine pourtant un état pour qui ne peut pas modifier : « Vous pouvez consulter ces réglages, pas les modifier. Seule une personne qui administre l'agence peut les changer », valeurs en texte.
- **L'information n'est pas secrète pour un agent** : `GET /api/leases/defaults?property_id=` (TCK-2643, `LeasePolicy::createOn`) lui sert déjà, à la création d'un bail, chaque valeur reprise **et sa source** (`agency` ou `platform`). Il voit donc déjà les valeurs de l'agence, bien par bien, sans pouvoir les voir ensemble.

## Décision

**Les réglages de bail de l'agence se lisent par tout son personnel actif. Ils ne s'écrivent que par qui configure l'agence. La réponse de lecture dit, pour l'appelant, s'il peut écrire.**

1. **Lecture** — `GET /api/settings/lease` est servi à l'appelant qui a un profil **actif** de personnel (administrateur d'agence ou agent) dans l'agence de son espace actif, et au super-admin.
   - Il est refusé (403) au bailleur, au prestataire, au locataire, à un profil non actif (`draft`, `blocked`, `inactive`) et au personnel d'une autre agence : ADR-0031 inchangé.
   - Aucune capacité nouvelle : la lecture suit l'appartenance au personnel actif, comme les autres lectures du périmètre de l'agence.
2. **Écriture inchangée** — `POST /api/settings` (portée `agency`) et `DELETE /api/settings/{id}` restent jugés par `AgencyPolicy::configure`. Ouvrir la lecture n'ouvre aucune écriture.
3. **`can_edit` est calculé** — il vaut `AgencyPolicy::configure(appelant, agence)`, jamais une constante. C'est lui, et lui seul, que l'écran lit pour choisir entre l'état modifiable et l'état « Lecture seule ».
4. **La liste générale `GET /api/settings` n'est pas ouverte** : elle porte d'autres réglages que ceux du bail. Seule la route dédiée aux réglages de bail change.

## Conséquences

- Un agent peut voir, depuis le nouveau bail ou depuis « Mon agence », ce que chaque bail neuf reprend, au lieu de le déduire bien par bien. Il n'apprend rien que `leases/defaults` ne lui servait déjà.
- Le front doit ouvrir la section « Réglages de bail » et la page `/app/agency/lease-settings` au personnel, et rendre l'état lecture quand `can_edit` est faux. Le commentaire de `lib/agence/fiche.ts` qui dit l'inverse est à réécrire.
- Une erreur de garde coûterait une écriture par un agent : les tests d'écriture existants (403 pour un agent) restent la garde, et la lecture gagne ses propres tests.
- Rien ne change pour le bailleur, le prestataire ou une autre agence.

## Application

- `takussan-api/app/Http/Controllers/Api/LeaseSettingsController.php` : la porte de lecture et le calcul de `can_edit` (TCK-2920).
- Tests : `tests/Feature/Settings/LeaseSettingsReadTest` (TCK-2920) — agent actif 200 et `can_edit=false` ; admin principal 200 et `can_edit=true` ; agent `blocked` 403 ; bailleur 403 ; admin d'une autre agence 403 ; écriture par un agent toujours 403.
- Front : `lib/agence/fiche.ts`, `lib/access/pages-admin.ts`, écran des réglages de bail (TCK-2921).
- Index : la ligne de cet ADR est à ajouter à `docs/adr/README.md` à la fusion (non écrite par l'auteur de l'ADR, qui ne touche que des fichiers neufs).
