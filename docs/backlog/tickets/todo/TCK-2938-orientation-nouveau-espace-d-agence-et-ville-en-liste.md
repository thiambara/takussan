---
id: TCK-2938
title: "Orientation : la pastille « Nouveau » de l'aperçu, l'espace pro qui ouvre une agence (« Ton équipe · Tes bailleurs · Tes mandats », « Sous 48 h »), la ville principale en liste et le chemin « Équipe, puis Inviter »"
status: todo
phase: P2
family: front
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: [TCK-2937]
blocks: []
spec_refs:
  features:
    - "docs/features.md#onboarding-parcours"
  models:
    - "docs/models-spec.md#2-agency"
tags: [front, entree, orientation, agence, audit-ux, audit-2026-11-15]
---

## Objectif utilisateur

Le chercheur voit ce qui vient d'arriver ; le professionnel sait ce que son espace d'agence lui ouvre et quand l'agence sera vérifiée, et l'agent sait où son administrateur trouve le lien.

## Contrat de données

- Création de l'agence et villes principales (TCK-2937).
- Pastille « Nouveau » : `published_at` des résultats de la recherche publique (déjà servi par `PropertyResource`), règle « publié depuis moins de 48 heures » de la liste des biens (TCK-2499).

## Direction UX / Artistique

- **Référence de fidélité** : `app-entree-orientation`, **approche A**, `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-entree-orientation.tsx`, visionneuse `?p=app-entree-orientation&a=a`.
  - **e2 « Chercheur : l'alerte »**, **bureau** : pastille « Nouveau » sur les lignes de l'aperçu (`:551`).
  - **e3 « Professionnel (créer) »**, **téléphone et bureau** : promesse « Ton espace d'agence s'ouvre tout de suite » (`:108`), panneau « Ce que tu auras » : « Ton équipe », « Tes bailleurs », « Tes mandats » (`:126-128`, bureau) ; « En deux temps » avec « Sous 48 h » (`:334-340`) ; « Ville principale » en liste (`:364`).
  - **e4 « Professionnel : rejoindre »**, **téléphone et bureau** : « Son administrateur te l'envoie depuis son espace (Équipe, puis « Inviter »). » (`:379`).
- Audit : `audit-f6-agence-entree.md`, « Famille entrée », § app-entree-orientation (e2-e4, « non vérifiables ») ; fiche TCK-2608 (`ecarts_acceptes` 9, 10, 11, 20).

## Contraintes strictes (métier)

- « Sous 48 h » n'est écrit que si l'ADR de TCK-2937 en fait un engagement ; sinon l'étape garde son texte sans délai et la fiche garde l'écart avec ce motif.
- La pastille suit exactement la règle de la liste des biens (même fonction, pas une seconde définition).
- Libellés `fr`/`en`/`wo` (`wo` = français) ; tutoiement de l'orientation conservé.

## Delta à produire

- [ ] Pastille « Nouveau » dans l'aperçu du chercheur.
- [ ] « Créer mon espace pro » branché sur la création d'agence ; panneau « Ce que tu auras » à trois rangées équipe / bailleurs / mandats ; « En deux temps » avec « Sous 48 h ».
- [ ] « Ville principale » en liste.
- [ ] Texte de « rejoindre ».
- [ ] Vérifications au navigateur (AC5).

## Critères d'acceptation

- [ ] AC1 — À 1440, une ligne de l'aperçu dont le bien est publié depuis 10 h porte « Nouveau » ; publié depuis 3 jours, non.
- [ ] AC2 — « Créer mon espace pro » rempli puis validé mène à `/app` dans l'**espace d'agence** créé (pas à `/app/settings/agency/upgrade`).
- [ ] AC3 — Le panneau « Ce que tu auras » (bureau) liste « Ton équipe », « Tes bailleurs », « Tes mandats » ; « En deux temps » porte « Sous 48 h » sous la condition ci-dessus.
- [ ] AC4 — « Ville principale » est une liste (combobox) des villes servies ; une valeur hors liste n'est pas envoyée. L'écran « rejoindre » nomme « Équipe, puis « Inviter » ».
- [ ] AC5 — Vérifier au navigateur : l'interrupteur WhatsApp de e2 avec la capacité `search_alerts.whatsapp_enabled` ouverte et un numéro ; la carte « agence reconnue » de e4 avec un lien d'invitation valide collé. Corriger ce qui manque.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md)) :

- [ ] AC-F1 — Fiche TCK-2608 mise à jour (entrées 9, 10, 11, 20 et la pastille retirées des écarts, ou motif réécrit).
- [ ] AC-F2 — À 390 × 844 et 1440 × 900, `fidelite compare` sur e2, e3, e4 ne rend aucun écart non expliqué.

## Hors périmètre

- La règle de création d'agence (TCK-2937).

## Notes d'implémentation

2026-11-15, agent d'implémentation (« valide tes choix » : option la plus sûre à chaque point).

**Livré.**

- **Créer** (`EtapePro`) : `ouvrirMonAgenceAction` → `POST /api/me/agencies` (TCK-2937, ADR-0125) avec `name`, `geo_city_id`, `phone` ; l'action pose le cookie du profil actif (le `Set-Cookie` de l'API ne traverse pas une action serveur), puis `/app` (AC2). `ninea` n'est pas demandé (absent de la maquette).
  - 422 `agency.phone_unverified` : l'écran l'explique (« Votre numéro n'est pas encore vérifié… ») et remontre la vérification par SMS sur place ; le bouton attend.
  - 409 `agency.already_admin` (admin d'une agence ou d'un espace individuel) : la demande de passage en agence, préremplie — le chemin que l'ADR § 2 laisse à l'espace individuel. Une agence déjà `standard` y est reçue par le garde de la page (`upgrade/layout.tsx` : écran « Offre » ou `/app`, TCK-2671) — pas de branche par sorte d'agence.
  - Après le 422, le champ revient au numéro du COMPTE : `send-otp` écrit le numéro tapé sur le compte, pas celui de l'agence.
  - Le téléphone de l'agence se change (« Repris de votre compte. Vous pouvez en mettre un autre. »), comme la maquette ; l'API l'accepte.
  - 2FA : rien à faire ici — `(dashboard)/layout.tsx` monte déjà `GardeDoubleFacteur`, qui enrôle sur place à la première 403.
- **Ville principale** : `Combobox` sans saisie libre sur `useVillesDuReferentiel` (`GET /api/public/geo/cities`), Dakar par défaut s'il est seul de ce nom ; seul un identifiant de la liste part (AC4).
- **Ce que vous aurez** : « Votre équipe », « Vos bailleurs », « Vos mandats » (icônes de la maquette). **« En deux temps »** : « Tout de suite. Votre espace est prêt : vous ajoutez vos biens et votre équipe. » / « Ensuite. Notre équipe vérifie l'agence (NINEA, registre du commerce). D'ici là, vos biens ne sont pas en ligne et les loyers encaissés vous sont reversés après la vérification. » La promesse de la porte pro : « équipe, bailleurs, mandats ».
- **Rejoindre** : « Son administrateur vous l'envoie depuis son espace (Équipe, puis « Inviter »)… » (la page Équipe porte « Inviter un agent »).
- **Pastille « Nouveau »** sur les lignes de l'aperçu du chercheur : `estNouveau(r.published_at ?? r.created_at)`, la fonction et la date de repli de `LigneDeResultat` (TCK-2499). `published_at` est servi par la recherche (`PropertySearchService` hydrate sans `select`, `PropertyResource::whenHas`).

**Décisions (mineures, tranchées).**

- « Sous 48 h » **non écrit** : ADR-0125 § 8 ne l'engage pas. L'étape garde « Ensuite », et la fiche garde l'écart avec ce motif.
- « Des crédits de mise en avant » (4e rangée de la maquette) **retiré** : l'ouverture ne donne aucun crédit (ADR-0125 § 5) et rien ne se met en ligne avant la vérification. Écart gardé dans la fiche.
- **Vouvoiement** gardé : le ticket dit « tutoiement de l'orientation conservé », mais l'orientation du produit est au vouvoiement (fiche TCK-2608, écart 1 ; consigne du brief).

**Prémisses qui différaient.**

- La fiche TCK-2608 : les entrées touchées sont 10, 11, 12 (ville), 18 (pastille), 20 et 21 (rejoindre), pas seulement 9, 10, 11, 20. 12, 18 et 21 sont retirées ; 10, 11, 20 réécrites ; 9 (WhatsApp) garde son motif.
- Garde trouvée rouge hors de ma zone, corrigée : `promesses-de-delai.test.ts` rougissait sur `admin.team.equipe.invitations.messageWhatsApp` (« valable 7 jours », posé par TCK-2928/2930) ; la clé est inscrite au registre (même mécanisme que `formulaire.validite`).

**Mesures.**

- `npx vitest run src/components/onboarding/orientation/__tests__/` : 4 fichiers, 35 verts ; voisins (`intention/__tests__`, `note-de-brouillon`, `CoqueDEntree`, `HostIndividualWizard`) : 55 verts ; `promesses-de-delai` : 60 verts.
- « Une valeur hors liste n'est pas envoyée » tient par construction (`Combobox` sans `saisieLibre` : le payload n'a pas de champ texte) ; le test le fixe, sans ablation qui le distingue.
- Cinq ablations, chacune rouge puis restaurée (md5) : la pastille, `push('/app')`, l'identifiant de ville, le retour à la vérification sur `phone_unverified`, le téléphone envoyé.
- ESLint 0, `tsc --noEmit` sans erreur dans mes fichiers, `check:i18n` vert, gardes `scripts/check-*.mjs` (racine et web) vertes.
- **Non mesuré** : AC5 et AC-F2 (navigateur, `fidelite compare`) — la consigne du lot interdit le relevé au navigateur ; l'interrupteur WhatsApp reste couvert par les tests vitest de TCK-2608.
