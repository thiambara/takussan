---
id: TCK-2483
title: Modules activés par agence — l'admin d'agence retire du menu de son équipe ce que l'agence n'utilise pas
status: doing
phase: P3
family: full
estimate: M
wave: 82
created: 2026-11-05
updated: 2026-11-06
depends_on: [TCK-2478, TCK-2479, TCK-2480, TCK-2481, TCK-2482]
blocks: []
spec_refs:
  features:
    - "docs/features.md#navigation-de-la-console-selon-le-profil-actif"
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md#2-agency"
tags: [front, back, navigation, coque, adr-0089, agence]
---

## Objectif utilisateur

L'admin d'une agence qui n'utilise pas, par exemple, les commissions ou les états des lieux les
retire du menu de toute son équipe, pour un menu à la mesure de l'agence.

## Décision

[ADR-0089, amendement « modules par agence (TCK-2483) » du 2026-11-05](../../../adr/0089-le-menu-de-app-se-derive-du-profil-actif.md#amendement--modules-par-agence-tck-2483-2026-11-05)
— accepté par délégation du porteur à la session. Ce ticket en est le delta ; il n'en recopie pas
les raisons.

## Contrat de données

**Backend (prescriptif)** :

- **Enum** `App\Models\Enums\AgencyModule: string`, sept cas, dans cet ordre :
  `commissions`, `inventories`, `move_in_follow_up`, `provider_book`, `calendar`, `credits`,
  `analytics`.
- **`App\Domain\Settings\AgencySettings`** : un type `list` (constante `LIST = 'list'`) et une
  entrée
  - `hidden_modules` : `type` `list`, `default` `[]`, `enum` `AgencyModule::class`,
    `rules` `['sometimes', 'nullable', 'array', 'list', 'max:'.count(AgencyModule::cases())]`.
  - `rules()` émet en plus, pour une entrée `list`, `settings.hidden_modules.*` →
    `['string', 'distinct', Rule::enum(AgencyModule::class)]`.
  - `read($settings, 'hidden_modules')` : une liste PHP (`array_is_list`) → ses seules valeurs qui
    sont des cas de l'enum, sans doublon, dans l'ordre lu ; toute autre forme (absente, `null`,
    chaîne, tableau associatif) → le défaut `[]`. La vérification « scalaire » existante ne
    s'applique pas au type `list`.
- **`AgencyUpdateRequest::rules()`** : pour une agence `individual` (`isIndividual()`),
  `settings.hidden_modules` → `['prohibited']` (même motif que `legalRules()`). `null` et `[]`
  passent (`prohibited` = non requis).
- **`AgencyController::update`** : inchangé. La fusion `array_replace` est de premier niveau : la
  liste est remplacée en bloc ; `null` retire la clé (défaut `[]`) ; `[]` est enregistré tel quel.
- **Lecture** : inchangée — `AgencyResource` rend déjà `settings`, donc `settings.hidden_modules`,
  à quiconque voit l'agence (l'agent de l'agence compris).
- **Test** `tests/Feature/Api/Agency/AgencyModulesSettingsTest.php` (étend `Tests\ApiTestCase`) :
  1. l'admin (`primary_admin_id`) enregistre `['commissions', 'analytics']` → 200, la colonne les
     porte, et l'agent de l'agence les relit par `GET /api/agencies/{id}` (`data.settings.hidden_modules`) ;
  2. les autres clés de `settings` sont intactes (`watermark_enabled: false` reste) ;
  3. refusés en 422, l'erreur sur la clé dite : code inconnu `['payments']` (`.0`), doublon
     `['calendar', 'calendar']` (`.1`), objet `{"a": "calendar"}` (racine), chaîne `'calendar'`
     (racine), entier `[1]` (`.0`) — et la colonne n'a pas bougé ;
  4. `null` retire la clé, `Agency::setting('hidden_modules')` rend `[]` ;
  5. `[]` est accepté et relu `[]` ;
  6. agence `individual` : `['calendar']` → 422 sur `settings.hidden_modules` ;
  7. un agent de l'agence (sans `configure`) → 403, rien d'écrit ;
  8. `AgencySettings::read` : `['calendar', 'obsolete', 3, 'calendar']` → `['calendar']` ;
     `'calendar'` → `[]` ; `['x' => 'calendar']` → `[]` ; `null` → `[]` ;
  9. `(new AgencyUpdateRequest)->rules()` porte `settings.hidden_modules` et `settings.hidden_modules.*`.

**Front (intentionnel)** :

- Un module `src/lib/navigation/modules.ts` : les codes (parité avec l'enum PHP, par un test qui
  lit `AgencyModule.php`), leur table vers les identifiants du catalogue (celle de l'amendement),
  la lecture tolérante de `agency.settings.hidden_modules`, l'ensemble des destinations masquées.
- `ContexteDeMenu.masquees` ; `estOuverte` la refuse ; `composerMenu` ne la garde pour le persona
  que s'il est `agent` ou `admin-agence`, et toujours pour le complément « Aussi … ».
- Le layout de `/app` lit les modules sur l'agence qu'il lit déjà, et les passe à la barre.
- `web-ci.yml` se déclenche aussi sur `takussan-api/app/Models/Enums/AgencyModule.php`.

## Direction UX / Artistique

- Fiche de l'agence (`/app/agency`), une section « Menu de l'équipe » après « Sécurité », même
  encadré cliquable que la double authentification : une case par module, **cochée = affichée**,
  chacune avec une ligne qui dit ce qu'elle retire (« Indicateurs, alertes et exports — les
  statistiques restent »).
- Le chapeau de la section dit les trois choses qui rassurent : le menu de toute l'équipe, le vôtre
  compris ; aucun droit ne change, une page reste ouverte par un lien direct ; bailleurs et
  locataires gardent leur menu.
- Enregistré par le bouton de la fiche ; le menu change aussitôt (`router.refresh()` relance le
  layout).
- Absente pour une agence `individual`.

## Contraintes strictes (métier)

- Désactiver un module ne retire AUCUN droit et ne ferme aucune page : l'API ne lit pas
  `hidden_modules`, aucune garde de page non plus.
- Ce que le persona `bailleur`, `locataire`, `client` ou `prestataire` ouvre lui-même ne disparaît
  jamais ; un module ne masque que ce qu'un profil du personnel apporte (disposition de l'agent et
  de l'admin, complément « Aussi … »).
- Jamais masquables : tableau de bord, messagerie, biens, baux, paiements, demandes ; toute
  destination à compteur, d'écriture, jugée sur l'espace, page d'agence, ou action principale.
- Une destination appartient à un module au plus.
- Le wolof porte le texte français tel quel (wolof en pause).

## Delta à produire

- [ ] API : enum `AgencyModule`, type `list` d'`AgencySettings`, refus en agence `individual`,
      `AgencyModulesSettingsTest`.
- [ ] Front, navigation pure : `modules.ts`, `ContexteDeMenu.masquees`, `estOuverte`,
      `composerMenu` ; gardes (modules, parité, branchement) ; `web-ci.yml`.
- [ ] Front, câblage : type `AgencySettings`, layout de `/app`, `AppShell`, `AppSidebar`.
- [ ] Front, écran : schéma et normalisation du formulaire, section « Menu de l'équipe », libellés
      `fr`/`en`/`wo`.
- [ ] Mesure au navigateur.

## Critères d'acceptation

- [x] AC1 — La décision est écrite (amendement d'ADR-0089) et validée par la session, par
      délégation du porteur, avant toute ligne de code.
- [ ] AC2 — `AgencyModulesSettingsTest` vert. Ablations, chacune rougit son cas : retirer
      `Rule::enum` (code inconnu) ; retirer `distinct` (doublon) ; retirer `list` (objet) ; retirer
      le `prohibited` de l'agence `individual` ; retirer le filtre par l'enum de `read()`.
- [ ] AC3 — Chez un agent dont l'agence masque `commissions` et `inventories`, ni « Commissions » ni
      « États des lieux » ne sont rendus — ni dans un groupe, ni sous « Plus », ni sous « Aussi … ».
      Ablation : `estOuverte` qui ignore `masquees` fait rougir.
- [ ] AC4 — Même agence : le bailleur et le locataire gardent « États des lieux » dans leur groupe ;
      un bailleur qui est aussi admin de l'agence ne voit ni « Commissions » ni « KPIs » sous « Aussi
      administrateur » quand `commissions` et `analytics` sont masqués. Ablation : `composerMenu` qui
      garde `masquees` pour tout persona fait rougir le cas bailleur.
- [ ] AC5 — « Rien n'est perdu » tient avec les modules : pour chaque persona et chaque combinaison
      de rôles, tous modules masqués, le menu rend exactement ce que la règle de l'amendement ouvre.
- [ ] AC6 — Gardes : aucun module ne contient une destination interdite (liste ET règles de l'AC
      « jamais ») ni une destination citée deux fois ; les codes du front sont ceux de l'enum PHP ;
      aucun fichier de `src/` hors `lib/navigation/` (tests exclus) n'appelle `estOuverte(` ; tout
      appelant de `composerMenu(` pose `masquees` ; `hidden_modules` n'est lu que par les fichiers
      autorisés (aucune page, aucune garde). Ablations : ajouter `messagerie` au module `calendar` ;
      ajouter un code au seul front ; appeler `estOuverte` depuis un composant — chacune rougit.
- [ ] AC7 — Le layout passe à la coque les seuls codes connus lus sur l'agence (admin et agent), `[]`
      sans agence lue. Ablation : ne pas les lire fait rougir.
- [ ] AC8 — Formulaire : une agence sans la clé a les sept cases cochées ; décocher « Calendrier »
      et enregistrer envoie `settings.hidden_modules` dans l'ordre des codes ; une agence
      `individual` n'a pas la section et n'envoie pas la clé. Ablation : ne plus émettre la clé fait
      rougir.
- [ ] AC9 — Au navigateur (`./dev.sh`) : l'admin décoche « Commissions », enregistre, l'entrée quitte
      son menu sans rechargement ; un agent de l'agence ne l'a plus ; `/app/commissions` ouvert par
      URL est servi ; un bailleur de l'agence garde « États des lieux » quand `inventories` est
      masqué. Relevés dans les notes.
- [ ] AC10 — Si TCK-2481 ou TCK-2482 est sur `dev` à l'implémentation : un onglet ou une entrée de
      palette vers une destination masquée n'est pas rendu (test sur le composant réel).
- [ ] AC11 — `./vendor/bin/pint`, `npx tsc --noEmit`, `npm run lint`, `npm run check:i18n` verts ;
      suites par la CI.

## Hors périmètre

- Tout effet hors des surfaces de navigation (menu, « Plus », « Aussi … », onglets, palette) : tuiles
  du tableau de bord, notifications, e-mails, recherche, pages — et a fortiori tout droit.
- Masquer pour un membre ou un rôle personnalisé ; réordonner ou renommer des entrées (TCK-2480 pour
  la personne).
- Les agences `individual` (hôte) ; les personas `bailleur`, `locataire`, `client`, `prestataire`,
  `plateforme` pour ce qu'ils ouvrent eux-mêmes.
- Déduire un masquage d'un autre réglage (par ex. `tenant_onboarding_enabled = false` → masquer
  `move_in_follow_up`) : une piste, pas ce ticket.
- Journaliser le changement (la fiche d'agence ne l'est pas aujourd'hui).
- La mise à jour de `docs/features.md` et `docs/models-spec.md` : `/sync-specs` après la fusion.

## Notes d'implémentation

_(à remplir par implementing-specs)_

- Plan : [`docs/plans/2026-11-05-tck-2483-modules-actives-par-agence.md`](../../../plans/2026-11-05-tck-2483-modules-actives-par-agence.md).
