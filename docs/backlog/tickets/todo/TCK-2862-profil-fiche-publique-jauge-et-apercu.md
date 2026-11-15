---
id: TCK-2862
title: "Profil, fiche publique de l'agent : la jauge « 60 % complète » et ce qu'il reste, l'aperçu de la carte telle que le public la voit, en deux colonnes au bureau ; le pourcentage dans le sommaire"
status: todo
phase: P1
family: front
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
    - "docs/features.md#12-recherche--découverte-publique"
  models: []
tags: [front, profil, annuaire, agent, audit-ux, app]
---

## Objectif utilisateur

L'agent sait à quel point sa fiche publique est complète, ce qu'il lui manque pour recevoir plus de demandes, et voit en direct la carte que les visiteurs verront.

## Contrat de données

Aucun endpoint neuf :

- Le formulaire lit et écrit déjà langues et quartiers (`ProfileAgentDirectorySection`).
- La carte publique de l'agent est servie par `GET /api/public/agents/{slug}` (`PublicAgentController::show`) : note, langues, quartiers, temps de réponse (`AgentDirectoryFacts::median_response_minutes`), annonces — **404 pour un agent pas encore listé** (`ficheOu404`). L'aperçu se compose donc de l'état du formulaire (nom, photo, langues, quartiers) et, si la fiche est listée, des faits publics (note, temps de réponse, nombre d'annonces) ; non listée, ces trois lignes sont remplacées par « Visible après publication de votre fiche ».
- Complétude : le sommaire n'a qu'une règle binaire (`lib/profil/sommaire.ts:124-137`, « Indiquez vos langues et vos quartiers »). La maquette (`JaugeFiche`, `app-profil-pieces.tsx` l. 400-410 : « 60 % … Il vous reste : 3 quartiers et votre numéro vérifié. ») fixe la règle de ce ticket : **cinq critères de 20 % chacun** — photo, présentation, au moins une langue, 5 quartiers (« n sur 5 »), téléphone vérifié. « Il vous reste » nomme les critères manquants (les quartiers par leur nombre restant).

Relevé (audit-f3-coque.md, app-profil e0 et e3 ; « Écarts couverts » 1) : `profile/public-profile/page.tsx:14-19`, `ProfileAgentDirectorySection.tsx:93-112, 196-245` ; recherche vide de `jauge`, `Apercu`, `preview`, `complét` dans `components/profile/` ; TCK-2635 l'a classé « à proposer » sans ticket.

## Direction UX / Artistique

**Référence de fidélité** — `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-profil.tsx` (l. 390-420) et `app-profil-pieces.tsx` (jauge l. 400-410, carte l. 470-495, sommaire l. 58), approche a :

- **e3 « Fiche publique (agent) »**, **les deux formats** : en tête, la jauge « 60 % » « complète », la barre de progression, et « Les fiches complètes reçoivent plus de demandes. Il vous reste : 3 quartiers… » ; un bloc **« Aperçu »** (« Ce que voient les visiteurs du site. ») : la carte d'agent (photo, note, langues, quartiers, temps de réponse, annonces, « WhatsApp », « Voir ses biens ») ; le lien vers la fiche **sous** l'aperçu.
- **e3**, **bureau** : **deux colonnes** — le formulaire à gauche, l'« Aperçu en direct » **collant** de 340 px à droite, mis à jour à chaque modification non encore enregistrée.
- **e0 « Sommaire (agent) »**, **les deux formats** : la rangée « Fiche publique » dit « 60 % complète » (l. 58) et l'encart « Compléter votre fiche » donne le pourcentage et ce qui manque.

## Contraintes strictes (métier)

- Le pourcentage est le même partout (sommaire, encart, jauge) : une seule fonction de calcul.
- L'aperçu montre la carte **publique** : rien que le public ne voit (ni téléphone si la fiche ne le publie pas, ni courriel).
- 100 % : la jauge dit que la fiche est complète, sans « il vous reste ».
- Libellés neufs en `fr`/`en`/`wo`, `wo` = le texte français tel quel ; vouvoiement.

## Delta à produire

- [ ] Calcul de complétude partagé ; jauge et « il vous reste ».
- [ ] Bloc « Aperçu » (téléphone) ; deux colonnes avec aperçu en direct collant (bureau).
- [ ] Pourcentage dans le sommaire et l'encart.
- [ ] Tests : 60 % avec deux critères sur cinq manquants, 100 %, 0 % ; aperçu d'une fiche non listée ; l'aperçu change quand on ajoute un quartier, avant enregistrement ; la rangée du sommaire dit « 60 % complète ».

## Critères d'acceptation

- [ ] AC1 — Agent avec photo, présentation, une langue, 2 quartiers sur 5, téléphone non vérifié : la jauge dit « 60 % », la barre a `aria-valuenow=60`, et « Il vous reste : 3 quartiers et votre numéro vérifié. » ; le sommaire dit « 60 % complète ». Les cinq critères remplis : « 100 % » sans « Il vous reste ».
- [ ] AC2 — À 1440, la page est en deux colonnes ; l'aperçu reste visible au défilement (collant) ; ajouter « Mermoz » aux quartiers fait paraître « Mermoz » dans l'aperçu sans enregistrer.
- [ ] AC3 — À 390, le bloc « Aperçu » suit le formulaire et le lien « Voir ma fiche publique » est sous lui.
- [ ] AC4 — L'aperçu ne contient pas le courriel de l'agent.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md)) :

- [ ] AC-F1 — Fiche `docs/qa/audit-ux-2026-11/fidelite/TCK-2862.json` : app-profil e0 et e3, téléphone et bureau.
- [ ] AC-F2 — Zéro écart non expliqué ; la jauge et l'aperçu ne sont plus « à proposer ».
- [ ] AC-F3 — À 1024 et 768 : `scrollWidth − innerWidth = 0` ; sous 1280, l'aperçu passe sous le formulaire.

## Hors périmètre

- Les avis et le sommaire du bailleur : TCK-2864.

## Notes d'implémentation

**2026-11-15 — implémentation (agent, vague 92).**

- Re-mesure : prémisses exactes (`sommaire.ts` règle binaire langues/quartiers, aucune jauge ni aperçu
  sous `components/profile/`, `/public/agents/{slug}` en 404 hors fiche listée, `public_slug` `null` alors).
- Calcul unique : `lib/profil/completude-de-la-fiche.ts` (`completudeDeLaFiche`, `faitsDeLaFiche`,
  `ceQuIlReste` par `Intl.ListFormat`). Photo = `user.avatar_url`, présentation = `user.bio` non vide,
  téléphone = renseigné ET `phone_verified_at`. Ordre de « Il vous reste » : quartiers, numéro, langue,
  photo, présentation (celui de la maquette pour ses deux premiers).
- **Écart de règle assumé** : « À régler → Compléter votre fiche publique » s'allume désormais sous 100 %
  (et non plus seulement sans langue ou sans quartier) — l'encart de la maquette e0 le montre à 60 %. Un
  agent avec moins de cinq quartiers a donc toujours ce point. `sommaire.test.ts` adapté (AGENT_COMPLET à
  cinq quartiers, photo et présentation).
- Sommaire : rangée « {n} % complète » (`profile.sommaire.details.fiche.pourcentage`) ; encart :
  « {n} % · il manque {reste}. » (`aRegler.fiche.detailPourcentage`), au téléphone aussi (sous le titre).
  Profils illisibles : la rangée garde l'ancien détail, rien n'est supposé.
- Page : `public-profile/page.tsx` passe le compte (nom, photo, présentation, téléphone vérifié — jamais
  le courriel) et les faits de la fiche listée (`lib/profil/faits-publics-de-la-fiche.ts` : note, médiane
  de réponse, `portfolio_total`). Non listée : « Visible après publication de votre fiche ».
- Disposition : jauge en tête, formulaire, puis l'aperçu ; dès `xl` (1280), deux colonnes
  `minmax(0,1fr)_340px`, aperçu `xl:sticky xl:top-6` titré « Aperçu en direct » ; sous 1280, « Aperçu »
  + aide sous le formulaire. Le lien « Voir ma fiche publique » quitte le haut de la section pour
  passer sous l'aperçu (sans compte fourni — tests d'avant —, il reste au-dessus du formulaire).
- WhatsApp et « Voir ses biens » de l'aperçu sont une image (`aria-hidden`), WhatsApp seulement avec un
  numéro vérifié (la fiche publique ne publie que celui-là).
- Tests : `lib/profil/__tests__/completude-de-la-fiche.test.ts`, `components/profile/__tests__/ProfileAgentDirectorySection.tck-2862.test.tsx`,
  `components/profile/sommaire/__tests__/completude.tck-2862.test.tsx` ; 6 ablations, toutes rouges puis restaurées (md5).
- Fidélité (lecture de la maquette) : cinq étoiles, « Aperçu en direct » au bureau, aide de section
  « … elle se met à jour sous vos yeux » (`profile.sommaire.aides.fiche`). **Écarts expliqués** : pas de
  badge « Agent vérifié » (la page publique `/agents/{slug}` n'en montre aucun à un agent — l'aperçu ne
  montre que ce que le public voit) ; pas de présentation dans la petite carte (la maquette ne la met que
  dans la variante `grand`, non utilisée par e3).
- **Défaut relevé hors zone (API)** : `PublicAgentController::show()` sert `'avatar_url' => $agent->avatar_url`,
  attribut qui n'existe pas sur `User` (son propre commentaire l. 194 le dit pour `index()`, qui emploie
  `avatarUrl()`) : la fiche publique n'affiche donc jamais la photo, que la jauge compte et que l'aperçu
  montre. À corriger par un ticket API (`avatarUrl()`).
- Non mesuré : AC-F1..F3 (fiche de fidélité, débordement à 1024/768) — pas de navigateur dans ce lot.

