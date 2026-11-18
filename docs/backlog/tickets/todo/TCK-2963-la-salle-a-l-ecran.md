---
id: TCK-2963
title: "La salle à l'écran (fil-salle-bail A) : bandeau de l'objet, chronologie repliée, dossier du fil, et l'entrée depuis la fiche du bail et de la réservation"
status: todo
phase: P1
family: front
estimate: M
wave: 94
created: 2026-11-17
updated: 2026-11-17
depends_on: [TCK-2960, TCK-2962]
blocks: []
spec_refs:
  features:
    - docs/features.md#17-communication--messagerie
    - docs/features.md#14-location-longue-durée-baux
    - docs/features.md#13-réservations-courte-durée--visites
  models:
    - docs/models-spec.md#18-conversation-
    - docs/models-spec.md#14-lease-
    - docs/models-spec.md#5-booking
tags: [front, messagerie, le-fil, salles, bail, reservation, maquette, adr-0128]
---

## Objectif utilisateur

- **Locataire, bailleur, agent d'un bail ; candidat et contact d'une réservation** : depuis la fiche
  de l'objet ou depuis la messagerie, il entre dans la salle, voit en tête où en est l'objet, parcourt
  son histoire repliée par mois, et retrouve sous la main les pièces et les dates qui comptent.

## Contrat de données

- `POST /api/conversations/rooms` `{subject_type, subject_id}` (TCK-2960) : ouvre la salle et la rend
  avec ses membres et `abilities.can_send_message` ; 403 si le lecteur n'y a pas accès.
- `GET /api/conversations` : les salles apparaissent dans la liste avec `type` (`lease`, `booking`),
  `subject_type`, `subject_id` (TCK-2957) ; le nom de la salle se compose depuis l'objet, jamais depuis
  `subject` (nul pour une salle).
- `GET /api/conversations/{conversation}/messages` : cartes et événements (TCK-2958, TCK-2961), rendus
  par les composants de TCK-2962.
- **Bandeau et dossier** : les lectures existantes de l'objet, avec leurs `fields[…]` (sparse
  fieldsets obligatoires) — `GET /api/leases/{lease}` (`next_due`, `overdue_count`, `overdue_amount`,
  `next_due_notice_date`, statut, période, parties), ses documents par la route existante des
  documents du bail ; `GET /api/bookings/{booking}` pour la réservation. Aucune lecture neuve côté API.

## Direction UX / Artistique

- **Référence de fidélité, à lire au chemin absolu (le résultat, jamais le code)** :
  `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/fil-salle-bail.tsx`,
  **approche A** (écrans : salle vue par l'agent, le locataire, le bailleur ; dossier du fil ; entrée
  depuis la fiche du bail ; plus tard, le préavis). Visionneuse :
  `http://localhost:3000/fr/playground/maquettes?p=fil-salle-bail&a=a`, à 360 et 1280.
- **Les cartes de la salle sont celles de TCK-2962 (approche D de fil-cartes)**, pas celles de
  `fil-cartes-cartes.tsx` que la maquette A importe encore : sans bordure ni barre d'accent.
- **Bandeau** : l'état de l'objet en mots, puis trois chiffres lisibles à 360 (prochaine échéance et
  sa date, solde, fin de période ou date de sortie en préavis), chacun relu pour le lecteur (le
  bailleur lit ce qui lui est reversé, le locataire « Prochain loyer ») ; « Dossier » ouvre le panneau
  sur téléphone. Pour une réservation, l'équivalent : dates, statut, prochain geste.
- **Chronologie** : séparateurs par mois, événements repliés par mois, le mois courant ouvert.
- **Dossier du fil** : colonne de droite au bureau, feuille sur téléphone — documents, dates clés,
  montants convenus (ce que la lecture du bail rend à ce lecteur), membres de la salle avec leur
  qualité. « Ouvrir la fiche du bail » pour qui la lit.
- **Entrée depuis la fiche** du bail et de la réservation : un bloc « Salle du bail » avec les
  derniers messages et « Ouvrir la salle ».

## Contraintes strictes (métier)

- **Aucune coordonnée du bailleur dans la salle** : la ligne du bailleur dans les membres dit
  seulement sa qualité (la salle est le moyen de le joindre), y compris pour le personnel, à qui
  `LeaseResource` rend aujourd'hui le téléphone (TCK-2906). C'est un choix d'affichage de la salle ;
  la fiche du bail ne change pas.
- Le locataire ne lit ni honoraires ni net reversé : le dossier n'affiche que ce que la lecture du
  bail lui rend, il ne masque rien lui-même.
- **Lecture seule** : quand `abilities.can_send_message` est faux (bail fini, réservation close,
  bailleur parti, fil fermé), la saisie disparaît et une ligne dit pourquoi, en code composé par le
  front.
- Un 403 à l'ouverture (`POST /api/conversations/rooms`) n'affiche pas de bloc vide : le bloc
  n'apparaît pas sur la fiche.
- Préfixe `/api` et sparse fieldsets : règles de `CLAUDE.md`.

## Delta à produire

- [ ] L'écran de la salle (bail, réservation) : bandeau, chronologie repliée par mois, dossier du fil,
  saisie (ou sa ligne de lecture seule).
- [ ] La salle dans la liste des conversations (nom composé depuis l'objet).
- [ ] Le bloc d'entrée sur la fiche du bail et sur la fiche de la réservation.
- [ ] Clés i18n `fr`, `en`, `wo` (= français).
- [ ] Tests : bandeau par lecteur (agent, locataire, bailleur) ; repli par mois ; dossier sans
  coordonnée du bailleur ; saisie absente en lecture seule ; bloc de la fiche qui appelle
  `POST /api/conversations/rooms` et ouvre la salle ; bloc absent sur 403.

## Critères d'acceptation

- [ ] **AC1** — Depuis la fiche d'un bail, « Ouvrir la salle » mène à la salle de ce bail (et pas à
  celle d'un autre objet) ; idem pour une réservation.
- [ ] **AC2** — Le dossier n'affiche aucun téléphone ni e-mail du bailleur, même quand la réponse de
  test en contient un. *Ablation : afficher le champ `phone` de la partie rend le test rouge.*
- [ ] **AC3** — Un bail `terminated` affiche la salle sans saisie, avec la raison ; un bail `active`
  avec saisie.
- [ ] **AC4** — Les événements d'un mois passé sont repliés, ceux du mois courant ouverts.
- [ ] **AC5** — Relevé de fidélité à 360 et 1280 contre fil-salle-bail A (cartes de TCK-2962).
- [ ] ESLint 0 erreur ; `tsc --noEmit` propre ; tests des fichiers touchés verts.

## Hors périmètre

- « Engagements ouverts » du dossier : lot 3.
- La présence et « en train d'écrire » (« Mouhamed écrit… ») : lot 2.
- Le badge WhatsApp et la réponse du bailleur par le pont : lot 5.
- Les approches B (journal) et C (fiche + salle) de la maquette : écartées.
- Une salle pour la visite ou l'état des lieux (décision 3a).

## Notes d'implémentation

### 2026-11-18 — implémentation (front seul ; l'API est à TCK-2961)

**Où vit quoi.** `takussan-web/src/components/messages/salle/` : `salle.ts` (lecteur et qualité des membres par
identifiants, raison de la lecture seule), `chronologieDeLaSalle.ts` (pliage par mois, pur), `requetesDeLaSalle.ts`
(lecture du bail, `POST /api/conversations/rooms`), `BandeauDeLaSalle`, `DossierDuFil`, `LectureSeuleDeLaSalle`,
`BlocDeLaSalle`, `SeparateurDeMois`, `useTitreDeLaSalle`. `ChatView` reçoit bandeau, raison et ouverture du dossier
en **slot** (`salle`) depuis `MessagesPage` : le widget flottant est sur la frontière i18n racine
(`check-i18n-namespaces`) et ne doit lire ni bail ni réservation.

**Prémisses re-mesurées, qui différaient du ticket.**
- « avec leurs `fields[…]` » : un `show` ignore `fields` et la garde `show-sans-fields.garde.test.ts` le refuse ;
  la lecture du bail ne porte donc que `fields[customers]=id,user_id` (seul admis, TCK-2780) et
  `include=tenant,due_summary` — ni `landlord` ni `agent`, qui rendent un téléphone au personnel.
- La qualité des membres se déduit des identifiants (`landlord_id`, `agent_id`, `tenant.user_id` ; réservation :
  `customer.user_id`) : les participants de la salle ne portent aucun rôle.
- `LeaseResource` rend `commission_rate` à **tout** lecteur (locataire compris) ; seul `commission_amount` est
  retiré hors du personnel. Le dossier n'écrit honoraires et net reversé que sur `commission_amount` : le
  bailleur ne voit donc pas son net reversé (non rendu par l'API) — à trancher côté API.
- L'API ne rend que `abilities.can_send_message` : la RAISON de la lecture seule (bail fini, réservation close,
  fil fermé) est composée au front depuis le statut de l'objet.

**AC5 (fidélité 360/1280) non mesuré** : le 2026-11-18 à 11:10, `:3000` répond 500 et l'API locale ne répond pas.

**Collision.** Le bloc de la salle lit React Query sans provider dans les tests des fiches : 21 fichiers de tests de
`BookingDetail`/`LeaseDetail` reçoivent un `vi.mock` du bloc (une ligne marquée TCK-2963), comme ils le font déjà
pour `LeaveReviewCta` ou `PayOnlineButton`.
