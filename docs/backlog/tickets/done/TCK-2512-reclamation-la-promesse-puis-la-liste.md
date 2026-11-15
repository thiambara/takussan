---
id: TCK-2512
title: Page de réclamation « La promesse, puis la liste » : bouton sous le pouce, refus toujours présent
status: done
phase: P1
family: front
estimate: M
wave: 85
created: 2026-11-08
updated: 2026-11-09
depends_on: [TCK-2511, TCK-2505]
blocks: []
spec_refs:
  features:
    - "docs/features.md#212-radar--acquisition-dannonces"
  models: []
tags: [front, radar, mobile, audit-ux]
---

## Objectif utilisateur

L'annonceur qui ouvre le lien comprend en une ligne ce qu'il y gagne, coche ses annonces, publie d'un bouton toujours sous le pouce — ou dit « ce n'est pas moi » sans chercher.

## Contrat de données

`GET /api/radar/claims/{token}` (avec `demand`, TCK-2511), `POST …/otp`, `POST …/confirm`, `POST …/decline` (TCK-2511). Aucun autre.

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=revendication&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes) — écrans Vos annonces, Corriger, Votre espace, Code SMS, Confirmé, Ce n'est pas moi, Compte existant.
- **Coque de lien nue** construite par TCK-2505 : logo, « Lien personnel », pied minimal ; ni recherche, ni favoris, ni comparateur, ni barre d'onglets.
- En tête, la promesse : gratuit, numéro masqué aux visiteurs, et — si `demand` existe — « {N} recherches à {quartier} ces 30 derniers jours ». Sans `demand`, la promesse sans chiffre.
- « Déjà en ligne » et « À publier » séparés ; annonces en cartes à cocher, « Corriger » par carte.
- Bouton collant « Publier mes N annonces » qui ouvre deux feuilles successives : l'espace, puis le code.
- « Ce n'est pas moi · Ne plus me contacter » toujours visible en bas de page ; ouvre une feuille de confirmation (boîte de dialogue de 480 px en bureau).
- Vouvoiement (échange commercial).

## Contraintes strictes (métier)

- Rien de ce que la page fait ne se perd : correction (titre, prix, description, jeton [TELEPHONE]), prénom et nom d'espace avec l'avertissement « pas de numéro dans le nom », espace existant, conditions versionnées, code à 6 chiffres (`one-time-code`), renvoi avec compte à rebours, code de préproduction, « Ouvrir mon espace ».
- Tous les états gardent leur page : déjà en ligne, en cours de publication, en attente de vérification, reprise sous mandat, et les six blocages de la spec § 2.12.
- Lien expiré, révoqué, introuvable, service indisponible : l'état commun des pages par lien (TCK-2514).

## Delta à produire

- [ ] Page réordonnée (promesse, sections, bouton collant, feuilles).
- [ ] Feuille de refus branchée sur `decline`, état « C'est noté » final.
- [ ] Clés i18n `fr`/`en`/`wo`.
- [ ] Tests (chiffre absent quand `demand` est nul, refus, chacun des états existants toujours rendu).

## Critères d'acceptation

- [ ] AC1 — À 390 × 844, le bouton « Publier mes N annonces » est visible sans défilement et N suit les cases cochées.
- [ ] AC2 — Avec `demand: null`, aucun chiffre ni phrase de demande n'apparaît.
- [ ] AC3 — « Ce n'est pas moi » confirmé appelle `decline` une fois et laisse un écran sans action restante.
- [ ] AC4 — Les six blocages de la spec se rendent encore, chacun avec son texte actuel.

## Hors périmètre

- La coque de lien (TCK-2505).
- Le partage WhatsApp et le conseil de photos de l'écran « Confirmé » (ajouts à décider, montrés par la maquette).

## Notes d'implémentation

- **`data.demand` se dit en « recherches », jamais en « personnes »** (ni « visiteurs », ni « acheteurs », ni
  « locataires ») : c'est un total agrégé de `searches_count` (TCK-2511, décision de la session du 2026-11-09 —
  l'amendement d'ADR-0088 §4 couvre cette sortie parce qu'aucune saisie ne sort et que le seuil est de 50 recherches,
  sans plancher de réseaux distincts : un même visiteur peut en faire plusieurs). Forme : `null` ou
  `{ quarter, searches_30d }` ; `null` → rien à l'écran.
- Contrat complet de `POST …/decline` et de `demand` : notes d'implémentation de TCK-2511. Le refus n'a pas de 503 :
  il reste ouvert quand `GET` rend 503 `radar.claim.unavailable`.

### Relevé du 2026-11-09 (agent « liens », vague 2)

- **Prémisses re-mesurées.** `GET /api/radar/claims/{token}` rend bien `demand` (`null` sur les quatre annonceurs du
  jeu de dev) ; `POST …/decline` attend `{ reason: 'not_me' | 'stop_contact' }`. La barre d'onglets était déjà
  effacée sur `/claim/*` (`porteLaBarrePublique`, TCK-2493) ; pas le dock du comparateur en bureau — corrigé par
  TCK-2505 (`estPageDeLien`).
- **Ce qui est fait.** `RadarClaimReception` réordonné dans `CoqueDeLien largeur="large"` : promesse (prénom en titre,
  intro, demande en RECHERCHES seulement si `demand`, trois avantages), « À publier » (cartes `ClaimListingCard`
  inchangées), « Déjà en ligne », publication en cours, en attente, reprise, refus en pied. Bureau : colonne de
  400 px (formulaire ou carte de blocage). Téléphone : `BasDeLien` collant « Publier mes N annonces », qui ouvre la
  feuille de l'espace puis celle du code (`FeuilleDeLien` : feuille au téléphone, boîte de 480 px en bureau).
- **Refus.** Une feuille à deux choix (radio), un seul `POST decline`, puis « C'est noté » sans aucune action
  (ni bouton, ni champ). 410/404 → l'état du lien mort ; 409 → « annonces en mouvement », feuille ouverte ; 429 →
  le texte existant. Ouvert aussi sur l'état 503 (TCK-2511, décision n° 1).
- **Rien de perdu.** Toute la logique précédente est conservée telle quelle (sélection, correction, prénom/espace et
  leurs refus « numéro dans le nom », espace existant, conditions, code `one-time-code`, renvoi à rebours, code de
  préproduction, « Ouvrir mon espace », six blocages, mandat).
- **Écart à la maquette.** Le libellé du champ « Code reçu par SMS » est masqué (sr-only) au téléphone, où la feuille
  porte déjà ce titre — sinon il se lisait deux fois.
- **Hors périmètre laissé.** Partage WhatsApp et conseil de photos de l'écran « Confirmé ».
- Preuves : `src/components/radar-claim/__tests__/RadarClaimReception.test.tsx` (43 verts, dont 18 neufs) et
  5 ablations, chacune rouge puis restaurée par `cp`, `md5` identique. Navigateur : 390 × 844 (barre en bas,
  `bottom` du bouton à 798 px, aucune barre d'onglets, aucune recherche, `scrollWidth` 390) et 1440 × 900
  (deux colonnes, pas de dock).
- **Revue du 2026-11-09.** Un double clic sur « Confirmer » (refus en vol) n'envoie qu'UN `POST decline` — test dédié,
  ablation de la garde (`return` et `disabled`) rouge. La page elle-même est gardée par
  `claim/[token]/__tests__/coque.test.tsx` (témoins de la `Navbar` et du `Footer` de la marketplace).
