---
id: TCK-2603
title: "« 1 240 recherches à Dakar cette semaine » : un chiffre vrai sur le départ de la publication"
status: todo
phase: P2
family: full
estimate: S
wave: 86
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2600, TCK-2684, TCK-2687, TCK-2688, TCK-2689, TCK-2691]
blocks: []
spec_refs:
  features:
    - "docs/features.md#24-recherche--filtres"
    - "docs/features.md#11-gestion-des-biens"
  models: []
tags: [back, front, publish, acquisition, search-journal, audit-ux, app]
---

## Objectif utilisateur

Le propriétaire qui hésite à publier voit, sur le premier écran, combien de personnes cherchent un logement dans sa ville cette semaine.

## Contrat de données

Re-mesure : aucun endpoint public ne compte les recherches. Le journal anonyme des recherches (ADR-0088) ne sort aujourd'hui qu'en quatre usages, dont un agrégat par quartier réservé au porteur d'un lien de réclamation du Radar (amendement TCK-2511). **Une cinquième sortie exige un amendement d'ADR-0088** (amendement du 2026-11-10 de [ADR-0088](../../../adr/0088-le-journal-anonyme-des-recherches.md), « cinquième sortie »).

- **À créer** : `GET /api/public/publish/demand?city={nom}` → `{ data: { city, searches_7d } }` : nombre de recherches journalisées des 7 derniers jours dont la ville est `city` ; `searches_7d: null` sous le seuil (`publish.demand_min_searches`, 200 par défaut) ; ville absente → la ville la plus recherchée du référentiel (Dakar).
- Contrôleur `PublicPublishDemandController`, FormRequest `PublicPublishDemandRequest` (`city` facultative, ville du référentiel), cache 1 h, `throttle:public-read`.
- Front : la carte de preuves du départ de `/publish` (TCK-2600) lit cet endpoint.

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=app-entree-publier&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes) — écran « Départ : le bien », carte sauge à deux chiffres.
- Le chiffre est arrondi à la dizaine inférieure et groupé selon la langue (`useFormatteurs()`).

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0093](../../../adr/0093-publier-sans-compte-le-brouillon-vit-dans-le-navigateur.md).
- Aucun chiffre inventé : sous le seuil, en échec ou en attente, la case du chiffre disparaît (pas de zéro, pas de squelette qui reste).
- Rien d'autre que le total ne sort : ni saisie, ni quartier, ni compte de visiteurs (règle d'ADR-0088 pour l'agrégat).
- Le second chiffre de la carte (« 0 F de commission ») n'est écrit que s'il est vrai pour un espace particulier ; sinon la carte n'a qu'un chiffre.
- Libellés en `fr`/`en`/`wo`.

## Delta à produire

- [ ] Amendement d'ADR-0088 écrit et accepté avant le code.
- [ ] Route `GET /api/public/publish/demand`, contrôleur, FormRequest, réglage `publish.demand_min_searches`, cache.
- [ ] `privacy.ts` dit la nouvelle sortie (ADR-0088 §6) et `VERSION_DOCUMENTS` avance.
- [ ] Front : la carte de preuves de `/publish`.
- [ ] Tests : `PublicPublishDemandTest` (seuil → `null`, compte des 7 jours, ville inconnue → 422, aucune autre clé dans la réponse) ; front : carte absente quand `null`.

## Critères d'acceptation

- [ ] AC1 (amendé le 2026-11-13) — 199 recherches « Dakar » sur 7 jours → `searches_7d: null` ; 1 247 → `1240`, et la
      réponse brute ne contient pas `1247` ; la page affiche « 1 240 ». *Raison : l'amendement d'ADR-0088 (cinquième
      sortie) arrondit ce qui SORT du journal ; arrondir au front laissait le total exact dans une réponse publique.
      Décision de la session, 2026-11-13.*
- [ ] AC2 — La réponse ne contient que `city` et `searches_7d` (test de forme exacte).
- [ ] AC3 — API injoignable : le départ de `/publish` s'affiche sans la case du chiffre, sans message d'erreur.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), préparation : TCK-2684 → TCK-2691) :

- [ ] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2603.json` (modèle de TCK-2684) liste chaque écran de maquette implémenté (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés (vouvoiement, renommage décidé).
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9 — [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'[ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif : une des trois exceptions d'ADR-0106 § 2, ou une donnée.
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [ ] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une (visionneuse, `l=1280`), sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.

## Hors périmètre

- Les chiffres par quartier ; la page des statistiques de marché.

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_

**2026-11-13 — livraison en deux temps** (TCK-2600, dont ce ticket dépend, est en cours sur `/publish` par un autre
agent : `PublierSansCompte.tsx` et ses tests ne sont pas touchés ici).

1. *Livré* : l'API, la politique, et la carte **autonome** `components/publication/PreuvesDuDepart.tsx` (hook
   `lib/queries/demande-de-publication.ts`). 2. *Après TCK-2600* : le montage (entre le titre et la question du bien,
   `mt-4` au téléphone, `mt-6` au bureau, comme la maquette), la fiche de fidélité et AC-F1 à AC-F6.

- **L'arrondi se fait à l'API, et l'AC1 est amendé en conséquence** (décision de la session, 2026-11-13) : l'amendement
  d'ADR-0088 (cinquième sortie) écrit « Arrondi à la dizaine inférieure » de ce qui SORT ; l'AC1 d'origine
  (« 1 247 → `1247` ») arrondissait au front, et laissait donc le total exact dans une réponse publique. La réponse
  porte `1240` (`DemandeDePublication::arrondi()`, un seul point), le front affiche ce qu'il reçoit ;
  `test_le_total_exact_ne_sort_jamais_dans_la_reponse_brute` l'épingle.
- **Fenêtre** : aujourd'hui et les 6 jours d'avant (`day >= now()->subDays(6)`), comme les autres lectures du journal.
- **Ce qui compte pour une ville** : le critère `city` ou chacun des noms de `cities` (chaîne à virgules), rapproché
  d'une ville du référentiel par `CleDeQuartier` (sans casse ni accent), nom actuel ou ancien (`former_names`, comme
  `VilleDuFiltre`). Une ligne qui nomme deux fois la même ville compte une fois pour elle ; `location` (le quartier)
  n'est pas une ville ; une saisie hors référentiel ne compte pour aucune. Homonymes (Dinguiraye, Missirah,
  Vélingara) : une recherche « Missirah » compte pour chacune, la ville demandée est la plus ancienne (le texte du
  journal ne les départage pas).
- **Seuil** sur le total exact (`>= 200`), puis arrondi : 199 → `null`, 200 → `200`, 1 247 → `1240`.
- **Sans `city`** : la ville la plus recherchée PARMI CELLES QUI ATTEIGNENT LE SEUIL (égalité : la plus ancienne) ;
  aucune → `publish.demand_default_city` (« Dakar ») avec `null`. Un classement tiré d'un journal sous le seuil serait
  lui-même une sortie (une seule recherche suffirait à nommer la ville), que l'amendement ne permet pas.
  **Ville hors référentiel → 422** (`PublicPublishDemandRequest`).
- **`TERMS_VERSION` suit** (`PublishReadiness`, 2026-11-13) : `check-terms-version` l'exige dès que `VERSION_DOCUMENTS`
  avance. Un compte qui a déjà accepté n'est pas redemandé (`termsRequired()` lit `terms_accepted_at`) ; seule une
  réclamation Radar ou une connexion par téléphone EN COURS avec l'ancienne version reçoit `terms_outdated` / l'écran
  des conditions, comme à chaque révision.
- **Cache** : UNE entrée d'une heure (`publish.demand.v1`) porte le référentiel par clé et les totaux de toutes les
  villes : une saisie d'appelant ne crée aucune entrée, et le journal est lu au plus une fois par heure.
- **Listes fermées** : la route entre dans `AucunGuardTokenTest` (publique, sans compte) et dans les recettes de
  `NumeroPublieVerifieTest` (preuve `searches_7d`).
- **Politique** : § 2.2 dit la sortie (fr, en), `VERSION_DOCUMENTS` passe au 13 novembre 2026 ; les trois épingles de
  version de `textes.test.ts` suivent, et un bloc neuf épingle la phrase.
- **Front** : `useApiQuery` sans nouvelle tentative (`retry: false` : un chiffre de vitrine ne fait pas attendre
  l'écran) ; la carte ne rend rien sous le seuil, en échec ou en attente (AC3). Le nombre passe par
  `useFormatteurs().nombre()` (U+00A0, décision n° 11), jamais par un `#` ICU (U+202F, TCK-2714).
- **Écart accepté** : le second chiffre de la maquette, « 0 F de commission », n'est pas écrit (contrainte du ticket,
  ADR-0093 : la commission dépend du plan de l'espace, 3 % en pro) ; la carte perd sa seconde colonne.
- **Démo** : le journal de la base de démonstration compte 59 recherches, dont 15 pour Dakar — sous le seuil ; la carte
  n'y apparaît donc pas. Le relevé de fidélité simulera la réponse dans le navigateur.
- **Tests** : `PublicPublishDemandTest` (19), `PreuvesDuDepart.tck-2603.test.tsx` (6), `textes.test.ts`. Ablations,
  chacune rouge puis restaurée au md5 : fenêtre (−7 jours), arrondi, seuil (`>`), dédoublonnage par ligne, anciens
  noms, `cities`, cache (durée 0 ; durée 2 h), 422, ville la plus recherchée, classement sous le seuil ; côté front : `retry`, garde du `null`,
  groupement, paramètre `city` ; politique : phrase retirée, version reculée.

**2026-11-14 — étape 2 : le montage et la fidélité** (après TCK-2600, 791f7fa65).

- **Montage** : `ModeAnonyme.depart.dessus` (PropertyWizard), rendu avant la question du bien ; `PublierSansCompte`
  y pose `PreuvesDuDepart` avec la ville d'un brouillon repris (`brouillon.draft.data.city`), sinon aucune. Le corps
  de l'étape est `mt-7 space-y-7` : `-mt-3 mb-6 lg:-mt-1 lg:mb-8` redonnent les écarts de la maquette (16 / 24 au
  téléphone, 21,6 / 28,8 au bureau) — sous Tailwind 4, `space-y-*` pose un `margin-block-end` sous `:where()`.
- **Fidélité** (fiche `docs/qa/audit-ux-2026-11/fidelite/TCK-2603.json`, téléphone et bureau 1280, règle de
  cadence 7) : la carte est au pixel près en place et en taille au bureau (560 × 63,6, écarts 21,6 et 28,8), en place
  au téléphone (écarts 16 et 24) ; quatre écarts acceptés, tous propres à la carte (second chiffre absent, hauteur au
  téléphone qui en découle, encre opaque TCK-658, groupe U+00A0) ; le reste de l'écran relève de TCK-2600. Réponse
  doublée au cache de React Query dans le navigateur (le journal de démo est sous le seuil), sans requête ni écriture.
  768 et 1024 non relevés : la carte n'y change pas de disposition.
- **Tests** : `PublierSansCompte.preuves.tck-2603.test.tsx` (4 : place entre le sous-titre et la question, rien sous le
  seuil, AC3 API injoignable, ville d'un brouillon repris) ; ablations rouges : emplacement retiré, ordre inversé,
  ville ignorée. `UNE_HEURE_MS` n'est plus importé de `referentiel-public` : les tests de TCK-2600 doublent ce module
  sans cette constante, et l'import faisait tomber tout l'assistant.
