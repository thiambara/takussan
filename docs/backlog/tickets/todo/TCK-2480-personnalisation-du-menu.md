---
id: TCK-2480
title: Personnaliser son menu — épingles et replis sur le compte, par persona ; barre réduite aux icônes sur l'appareil
status: todo
phase: P2
family: full
estimate: L
wave: 82
created: 2026-11-05
updated: 2026-11-05
depends_on: [TCK-2478]
blocks: []
spec_refs:
  features:
    - "docs/features.md#navigation-de-la-console-selon-le-profil-actif"
    - "docs/features.md#28-internationalisation--préférences"
  models:
    - "docs/models-spec.md#1-user"
tags: [front, back, navigation, coque, adr-0089, preferences]
---

## Objectif utilisateur

Chacun remonte les entrées qu'il ouvre tous les jours, replie ce qui ne le concerne pas, retrouve
ce réglage sur tous ses appareils et pour chacun de ses profils — et réduit la barre aux icônes sur
un petit écran.

## Contrat de données

**Backend (prescriptif)** :

- `App\Http\Requests\Api\Me\UpdateMeRequest` : `navigation` rejoint `PREFERENCE_FIELDS`. Règles de
  FORME seulement (le catalogue appartient au front, ADR-0089 §6) :
  - `navigation` : `sometimes|nullable|array` ; `navigation.v` : `required_with:navigation|integer|in:1` ;
  - `navigation.personas` : `array`, clés parmi les huit personas
    (`client, locataire, bailleur, agent, admin-agence, hote, prestataire, plateforme`) ;
  - `navigation.personas.*.epingles` : `array|max:5`, éléments `string|max:64|regex:/^[a-z0-9-]+$/` ;
  - `navigation.personas.*.replies` et `.ouverts` : `array|max:20`, mêmes éléments ;
  - `navigation.personas.*.demarrer_masque` : `boolean`.
- `MeController::update` : la clé est remplacée en bloc (pas de fusion profonde), comme les autres
  clés de `preferences`.
- Tests : `tests/Feature/Api/Me/NavigationPreferencesTest.php` — forme valide enregistrée et relue
  par `GET /api/auth/me` ; persona inconnu → 422 ; 6 épingles → 422 ; identifiant hors motif → 422 ;
  `null` efface la clé ; les autres clés de `preferences` sont intactes.
- Parité : une fixture commune (formes valides et invalides) lue par le test Laravel ET par le test
  du schéma zod du front.

**Front** : `user.preferences.navigation` (déjà rendu par `getMe`) ; écriture par `PATCH /api/me`.
Mode icônes seules : cookie non `httpOnly` (`menu_icones=1|0`), lu par le layout de `/app`.

## Direction UX / Artistique

- Une épingle discrète dans chaque ligne, visible au survol ET au focus clavier ; l'entrée épinglée
  monte dans « Épinglés », juste sous la bande « À traiter » (c'est l'utilisateur qui la déplace :
  il doit voir où elle va).
- Tout groupe titré se replie d'un clic sur son titre ; le chevron dit l'état.
- Profil → section « Menu » : revenir à la disposition par défaut du persona actif.
- **Barre réduite aux icônes** : 64 px, infobulles au survol et au focus, titres de groupe réduits à
  un séparateur, la bande « À traiter » réduite à une icône portant le total. Un bouton en pied de
  barre bascule les deux modes.
- **Par défaut, icônes seules entre `md` et `lg`** (le contenu passe de 464 à 656 px à 768, TCK-505) ;
  un réglage explicite de l'appareil l'emporte.

## Contraintes strictes (métier)

- Rangement **par persona** : épingler chez l'agent ne touche pas le menu bailleur du même compte.
- Une épingle ne peut viser qu'une destination accessible ; un identifiant inconnu ou devenu
  inaccessible est ignoré au rendu, jamais affiché.
- L'action principale ne s'épingle pas. Cinq épingles au plus (contrôlé des deux côtés).
- Écriture optimiste, envoyée après un court délai ; un échec rétablit l'état et le dit (toast).
- Rendu serveur juste au premier octet : ni la disposition personnelle ni la largeur ne
  « sautent » à l'hydratation.

## Delta à produire

- [ ] API : règles de `navigation`, enregistrement, `NavigationPreferencesTest`.
- [ ] Fixture de parité + test zod côté front.
- [ ] Épingles, replis, réinitialisation, appliqués par la composition (TCK-2477).
- [ ] Section « Menu » du profil.
- [ ] Mode icônes seules, cookie, défaut `md`–`lg`.
- [ ] Tests front : épingler/désépingler au clavier ; persona isolé ; identifiant périmé ignoré ;
      échec d'écriture rétabli ; rendu serveur sans saut (largeur et épingles).

## Critères d'acceptation

- [ ] AC1 — Épingler « Commissions » chez un agent la monte dans « Épinglés », la retire de
      « Gestion », et la retrouve après rechargement et sur un autre navigateur.
- [ ] AC2 — Le même compte, profil actif bailleur, n'a pas cette épingle.
- [ ] AC3 — `PATCH /api/me` avec six épingles → 422 ; ablation : retirer `max:5` fait rougir le test.
- [ ] AC4 — Une épingle vers une destination devenue inaccessible n'est pas rendue.
- [ ] AC5 — À 900 px sans réglage, la barre fait 64 px dès le HTML serveur ; avec `menu_icones=0`,
      256 px, sans saut à l'hydratation.
- [ ] AC6 — La fixture de parité passe des deux côtés ; ablation : élargir une règle d'un seul côté
      fait rougir l'autre.
- [ ] AC7 — `vendor/bin/pint`, lint, `tsc`, `check:i18n` verts ; suites par la CI.

## Hors périmètre

- Réordonner librement les entrées par glisser-déposer.
- La personnalisation par l'admin d'agence (TCK-2483).

## Notes d'implémentation

_(à remplir par implementing-specs)_
