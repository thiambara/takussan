---
id: TCK-2524
title: Console : écrire la vitrine de l'agence et le profil public de l'agent
status: done
phase: P1
family: front
estimate: M
wave: 85
created: 2026-11-09
updated: 2026-11-09
depends_on: [TCK-2518]
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
  models: []
tags: [front, console, agence, audit-ux]
---

## Objectif utilisateur

L'admin d'agence écrit son accroche, ses trois raisons et choisit six biens à montrer ; l'agent dit ses langues et ses quartiers — et chacun voit ce que la fiche publique en fera.

## Contrat de données

Écriture de TCK-2518 : `PATCH /api/agencies/{agency}` (`tagline`, `highlights`, `showcase_property_ids`) ; profil de l'agent (`languages`, `neighborhood_ids`).

## Direction UX / Artistique

- Dans la section d'administration d'agence (`/app/agency/*`), un bloc « Fiche publique » : accroche (compteur 120), trois lignes « Pourquoi nous » (compteur 80), sélection de six biens publics au plus (choix dans ses biens, réordonnables), et un aperçu de la couverture qui en résulte.
- Dans le profil de l'agent : langues (cases d'une liste fermée), quartiers (référentiel, cinq au plus).
- Lien « Voir ma fiche publique ».
- Champs uniformes de la console (garde `check-champs-uniformes`) ; vouvoiement de la console.

## Contraintes strictes (métier)

- Seul qui a la capacité de configurer l'agence écrit sa vitrine ; un agent n'écrit que son propre profil.
- Tout est facultatif ; vider un champ le retire de la fiche.
- Un bien non public ne se choisit pas dans la sélection.

## Delta à produire

- [x] Bloc « Fiche publique » de l'agence, avec aperçu.
- [x] Langues et quartiers dans le profil de l'agent.
- [x] Clés i18n `fr`/`en`/`wo`.
- [x] Tests (compteurs, six biens au plus, 422 remappée sur le champ, agent sans capacité d'agence).

## Critères d'acceptation

- [x] AC1 — Une septième sélection est refusée avant l'envoi, et un 422 de l'API s'affiche sur le champ.
- [x] AC2 — L'aperçu de couverture change quand la sélection change.
- [x] AC3 — Un agent sans capacité de configuration ne voit pas le bloc de l'agence, mais voit et enregistre ses langues.

## Hors périmètre

- La photo de couverture téléversée (la couverture est faite des biens, décision 2a).

## Notes d'implémentation

Relevés du 2026-11-09 (agent « console3 », vague 3), base de dev :

- **Aucune lecture authentifiée des langues et quartiers de l'agent.** `GET /api/me/profiles`
  (`agent1@dakarimmo.sn`) → 200 avec `license_number` et `specialty` seulement ;
  `GET /api/me/agent-profiles/1/directory` → 405. L'écran aurait ouvert vide et un enregistrement
  aurait effacé ce qui était posé. **Correctif back minimal** : `ProfileResource` (profil d'agent)
  émet `languages`, `neighborhood_ids` et `neighborhoods: [{id, name}]` dans l'ordre choisi ; un
  quartier disparu n'est émis ni nommé ni en id (`exists` le refuserait au renvoi).
  Test : `tests/Feature/Api/Me/ProfilAgentAnnuaireTest.php`.
- **`PATCH /api/agencies/{id}` exige le second facteur d'un admin d'agence**
  (`ProtectedActions::AGENCY_TWO_FACTOR`, middleware `RequireTwoFactor`) : `admin@dakarimmo.sn` →
  403 `two_factor_required` (aucun admin de dev n'a la 2FA ; un compte qui l'a mais sans session
  vérifiée reçoit `two_factor_step_up_required`). L'écran passe par `avecGardeDoubleFacteurAction`,
  comme `AgencyConfigForm` : au navigateur, « Enregistrer la fiche publique » ouvre la boîte
  « Activez la double authentification » de la coque, et la fermer laisse le refus sur le bloc.
  L'enregistrement réel de la vitrine n'a donc pas été joué au navigateur (2FA d'un compte partagé
  non activée) : il est prouvé par les tests du composant et d'`AgencyUpdateRequest` (TCK-2518).
- **À 390 px**, un `<fieldset>` garde `min-width: min-content` : la sélection (vignette, titre, trois
  boutons) portait le sien à 429 px dans une colonne de 310, et `main` défilait de côté (469 contre
  390) sans que `document.documentElement.scrollWidth` le montre. Les fieldsets des deux écrans
  portent `min-w-0`, et les boutons d'un bien sélectionné passent sous son titre au téléphone.
- **Le choix des biens** lit `GET /api/properties?filter[agency_id]=…&filter[public]=1&filter[status]=available`
  — le prédicat `publicPortfolio()` (public ET disponible) de la fiche. Trié
  `-published_at,-created_at,-id`, la page rend l'ordre de la couverture : relevé sur Dakar Immo,
  839, 838, 93 des deux côtés (`GET /api/public/agencies/dakar-immo` → `cover`). L'API accepte un
  bien de l'agence non public dans la sélection (la lecture publique le saute) : l'écran ne le
  propose pas, et s'il y est déjà le dit et permet de le retirer. **Cette règle de l'API n'est pas
  changée** : c'est la décision écrite de TCK-2518 (§ Delta 3 : seul un bien d'une AUTRE agence rend
  422 ; § 4 et AC1 : la lecture publique — `cover`, `showcase` — saute un bien qui n'est plus public).
  Un bien sélectionné qui cesse d'être public (loué, dépublié) doit pouvoir rester dans la sélection
  sans rendre la prochaine écriture invalide ; la saisie peut donc porter un id que la fiche ne
  montre pas, sans fuite. Confirmé par la revue de la session (2026-11-09).
- `main_photo_url` (conversion `preview`, premier média `photos`) est la photo de `cover`
  (`AgencyShowcase`, `PublicPhotoUrl::upTo(…, 'preview')`) : l'aperçu saute, comme l'API, un bien
  sans photo.
- **Qui voit le bloc.** `/app/agency` s'ouvre à tout rôle d'administration (`PAGES_ADMIN`, sans
  capacité) ; le bloc ne se monte que pour qui passerait `AgencyPolicy::configure` —
  l'administrateur principal, ou `agency.update` (`peutEcrireLaVitrine`, capacités illisibles :
  refusé). Un agent n'ouvre pas la page (`pageAccessible` : sans rôle d'admin, seule une capacité
  `ouvertePar` l'ouvrirait, et `/app/agency` n'en déclare aucune).
- **Septième bien** : la case reste focalisable (`aria-disabled`), son changement n'ajoute rien
  (`basculerBien` rend la même référence) et l'écran le dit en `role="alert"`. Même patron pour un
  sixième quartier (`quartiersRetenus`).
- **422 des « Pourquoi nous »** : les lignes vides ne partent pas (`highlights.*` est `required`),
  donc `highlights.k` est la k-ième ligne ENVOYÉE ; `indexDesPoints` la ramène à sa ligne d'écran.
- Langues : la liste fermée est celle de `components/public/index/faits-de-profil.ts`
  (`LANGUES_DE_L_ANNUAIRE`, miroir gardé de `config/directory.php` par l'annuaire) ; libellés de
  la console sous `profile.agentDirectory.languageNames.*`, un test rougit sur un code sans libellé.
  Quartiers : seuls les `approved` du référentiel se proposent (comme `ChoixDesLieux`).

Corrections de la revue (2026-11-09) :

- **L'agent voit sa fiche publique** : `ProfileResource` émet `public_slug` sur le profil d'agent de
  l'APPELANT seulement (jamais celui d'un autre), et seulement si `AgentPublic::parSlug()` — la
  résolution même de `/agents/{slug}` — rend ce compte : `null` pour un agent d'agence hors ligne,
  un profil inactif sans annonce ni annuaire, etc. La section porte la puce « Voir ma fiche
  publique » (`/agents/{slug}`), ou dit que la fiche n'est pas en ligne.
- **La sélection se nomme par ses ids** : `GET /api/properties?filter[id]=…` (filtre d'identifiant
  ajouté à `Property::$requestFilterable`, 400 sur une valeur non entière, périmètre de l'appelant
  gardé — `PropertyListFilterByIdTest`), au même prédicat public + disponible que la liste. Un bien
  choisi au-delà des cent premiers se nomme et reste en tête de couverture ; « n'est plus en ligne »
  ne se juge que sur cette lecture à jour.
- **Le profil écrit est le profil d'agent ACTIF** (agent de deux agences) — testé ; la section a un
  état de chargement et un état d'erreur (avec « Réessayer ») au lieu de disparaître ; l'ordre des
  quartiers est testé sur un ordre qui n'est ni celui des ids ni celui des noms.

- 2026-11-09 (session) : cases du delta et AC1 à AC3 cochées après la contre-vérification adverse, qui les a éprouvés par exécution (API et navigateur, 390 et 1440) ; l'implémenteur les avait prouvés sans cocher les cases.
