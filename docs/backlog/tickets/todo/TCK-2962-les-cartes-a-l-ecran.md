---
id: TCK-2962
title: "Les cartes à l'écran (fil-cartes D) : rendu par lecteur, état indisponible, gestes par les routes des objets, événements repliés, carte rafraîchie par signal"
status: todo
phase: P1
family: front
estimate: L
wave: 94
created: 2026-11-17
updated: 2026-11-17
depends_on: [TCK-2958, TCK-2959, TCK-2955]
blocks: [TCK-2963, TCK-2964]
spec_refs:
  features:
    - docs/features.md#17-communication--messagerie
  models:
    - docs/models-spec.md#20-message-
tags: [front, messagerie, le-fil, cartes, i18n, maquette, adr-0128]
---

## Objectif utilisateur

- **Tout participant d'un fil** : il lit dans le fil l'objet tel qu'il le connaît (un devis, un loyer,
  un créneau, un état des lieux), fait le geste qui l'attend sans quitter la conversation, et voit la
  carte changer chez lui quand quelqu'un d'autre agit.

## Contrat de données

- `GET /api/conversations/{conversation}/messages` (TCK-2958) : pour un message `card` ou `event`,
  `metadata.object {type, id}`, `metadata.code`, `metadata.data`, et `object` — la projection pour le
  lecteur avec ses `abilities`, ou `{indisponible: true}`. TCK-2959 : le booléen « un geste
  m'attend ». Les six types et leurs projections (`maintenance_request`, `lease`, `booking`,
  `lease_payment`, `inventory`, `property_visit`) : `SujetsDuFil`, TCK-2958. Les codes des événements
  des baux, paiements, visites et réservations arrivent par TCK-2961 ; ce ticket en compose le texte
  à partir du catalogue et se teste sur des réponses d'API de test.
- **Les gestes appellent les routes existantes des objets**, jamais une route de la messagerie (il
  n'y en a pas), et seulement quand l'`ability` correspondante est vraie dans `object.abilities` :
  - devis : `POST /api/maintenance-requests/{id}/quote/approve`, `…/quote/reject` ;
  - créneau d'intervention : « Proposer un autre moment » par `POST
    /api/maintenance-requests/{id}/reschedule-requests` (le demandeur) ;
  - visite : `POST /api/property-visits/{visit}/confirm`, `…/reschedule` ;
  - loyer : payer par `POST /api/payments/{paymentType}/{paymentId}/initiate` (le parcours de paiement
    déjà en place côté locataire), relancer `POST /api/lease-payments/{payment}/reminders`, encaisser
    `POST /api/lease-payments/{payment}/mark-paid` ;
  - état des lieux : signer `POST /api/inventories/{inventory}/sign` (le parcours de signature
    existant) ;
  - réservation : `POST /api/bookings/{booking}/confirm`, `…/reject`.
  Chaque lien vers la fiche de l'objet (« Voir le bien », « Télécharger la quittance ») suit les
  routes de page existantes.
- **Rafraîchissement** : le hook de sujet en direct du lot 0 (`useSujetEnDirect`, TCK-2954/TCK-2955)
  sur le fil ouvert. Un geste fait depuis une carte invalide la page de messages ; chez les autres
  lecteurs, l'événement que l'objet écrit (TCK-2961) arrive par le signal du fil, et la carte se relit.

## Direction UX / Artistique

- **Référence de fidélité, à lire au chemin absolu (le résultat, jamais le code)** :
  - `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/fil-cartes-d.tsx`
  - `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/fil-cartes-d-cartes.tsx`
  - visionneuse : `http://localhost:3000/fr/playground/maquettes?p=fil-cartes&a=d`, à 360 et 1280.
- **Cartes sobres** (approche D, décision du porteur) : un aplat de la palette Lin **sans bordure**,
  sans barre d'accent, sans liseré d'état, sans puce-icône devant le titre, sans pastille criarde. Un
  sur-titre qui dit la nature et l'objet, un état **en mots** à droite (encre profonde quand il
  attend ce lecteur, vert quand c'est fait), le chiffre clé en Bricolage, **un seul geste principal**
  évident, les autres en liens, une trace d'une ligne quand c'est fait. Le porteur refuse tout
  « AI slop ».
- **Une carte, plusieurs lectures** : la même carte rend ce que son lecteur lit (le locataire voit
  « l'agence prépare les travaux », jamais un montant de devis ; le bailleur voit ce qui est à sa
  charge ; le prestataire voit son devis). Ce que l'écran affiche vient de `object`, jamais de
  `data` ni d'une supposition sur le rôle.
- **Indisponible** : une carte discrète, sans détail, qui dit seulement que l'objet n'est pas
  accessible.
- **Événements repliés** : les `event` consécutifs se regroupent en une ligne repliée (« 3 événements
  · … ») qui se déplie, comme dans la maquette ; un événement qui attend un geste du lecteur reste
  visible en carte. Le texte se compose depuis le code (next-intl `fr`/`en`, `wo` = texte français).
- Mobile d'abord (360), puis bureau (1280) ; gestes au pouce ; les montants en chiffres tabulaires.

## Contraintes strictes (métier)

- **Aucun geste sans route ni `ability`** : un lien de la maquette qui n'a ni l'un ni l'autre
  (« Demander une précision », « Relancer Malick », « Relancer Astou Cissé », « Appeler Ousmane ») ne
  s'affiche pas. Le relevé est fait carte par carte avant d'écrire.
- **Aucun texte affiché ne vient de l'API** : ni `content`, ni l'aperçu ; un code inconnu rend un
  libellé générique, jamais le code.
- Le front ne déduit jamais un droit : il lit `object.abilities`. Un 403 d'une route d'objet se
  montre comme un refus, et la carte se relit.
- Le préfixe `/api` : `apiFetch` l'ajoute, `apiRequest` et `useApiQuery` non (règle de `CLAUDE.md`).
- Sans temps réel (clés d'exécution `TEMPS_REEL_URL` / `TEMPS_REEL_CLE` absentes de `src/lib/config-publique.ts`, impersonation), l'écran reste juste par la
  relecture du lot 0.

## Delta à produire

- [ ] Le rendu d'un message `card` ou `event` dans le fil, par type d'objet : devis (intervention),
  créneau (intervention et visite), loyer (échéance), état des lieux, réservation, bail ; l'état
  indisponible.
- [ ] Les gestes de chaque carte, branchés sur les routes ci-dessus, avec leur état d'attente et leur
  refus.
- [ ] Le regroupement replié des événements consécutifs, et son dépliage.
- [ ] Le rafraîchissement de la page de messages par le hook de sujet en direct du lot 0.
- [ ] Les clés i18n `fr`, `en`, `wo` (= français) ; `node scripts/check-i18n.mjs --report` sans
  régression.
- [ ] Tests : une carte par type et par lecteur (au moins locataire et personnel pour le devis et le
  loyer) ; l'état indisponible ; un geste absent quand l'`ability` est fausse ; l'appel de la bonne
  route ; le regroupement ; le rafraîchissement sur signal (faux Echo du lot 0).

## Critères d'acceptation

- [ ] **AC1** — Une carte de devis rendue pour le locataire n'affiche aucun montant, même si la
  réponse de test en contient un dans un champ que la projection ne devrait pas porter. *Ablation :
  rendre la carte du personnel pour tout lecteur rend le test rouge.*
- [ ] **AC2** — Un geste n'apparaît que si son `ability` est vraie ; il appelle la route de l'objet,
  et aucune route sous `/api/conversations`. *Ablation : ignorer l'`ability` rend rouge le cas
  « fausse ».*
- [ ] **AC3** — `{indisponible: true}` rend la carte indisponible, sans titre ni détail de l'objet.
- [ ] **AC4** — Trois `event` consécutifs sans geste attendu se replient en une ligne ; un `event` qui
  attend le lecteur reste déplié.
- [ ] **AC5** — Un signal sur le fil relit la page, et la carte change d'état sans recharger l'écran.
- [ ] **AC6** — Relevé de fidélité à 360 et 1280 contre fil-cartes D : pas de bordure, pas de barre
  d'accent, pas de puce-icône, un geste principal par carte.
- [ ] ESLint 0 erreur ; `tsc --noEmit` propre ; tests des fichiers touchés verts.

## Hors périmètre

- L'interrupteur « Équipe » du composeur et la note d'équipe (`NoteEquipeD`) : lot 2.
- La @mention, la présence, « en train d'écrire » : lot 2 (la présence et la saisie reposent sur le
  canal de présence du lot 0).
- Le badge WhatsApp d'un message et le relais par le pont : lot 5.
- La carte de rappel (`RappelD`) et les engagements : lots 2 et 3.
- La carte du bien partagé (`BienD`) et la pose d'une carte par un participant : TCK-2964.
- « Confirmer ce moment » sur le passage d'une intervention : aucune route relevée pour que le
  demandeur confirme un `scheduled_at` ; la carte de passage n'offre que « Proposer un autre moment ».
- La salle (bandeau, chronologie, dossier) : TCK-2963.

## Notes d'implémentation

_(à remplir par implementing-specs)_
