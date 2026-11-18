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

### Re-mesure (2026-11-18, arbre `feat/le-fil`, après TCK-2955, TCK-2958, TCK-2959)

- **Aucun code `card` n'existe encore** : `CodesDuFil` ne porte que les 14 `maintenance.*` (`event`). Les
  codes de TCK-2961 (`lease_payment.*`, `lease.*`, `inventory.awaiting_signature`, `maintenance.slot_*`,
  `visit.*`, `booking.confirmed`) et de TCK-2964 (`property.shared`, `visit.proposed`) ne sont pas
  écrits : le texte en est composé ici depuis le tableau de TCK-2961 et éprouvé sur des réponses de test.
- **Ce qui rend une carte** : un `card`, et un `event` dont `action_attendue` est vrai (TCK-2959) ; tout
  autre `event` est une ligne, repliable. Le type vient de `metadata.object.type`, la variante
  d'intervention (devis / passage) de la famille du code ; l'état, les chiffres et les gestes viennent de
  `object` seul. `action_attendue` ne dit jamais « fait » (il reste vrai après le geste jusqu'à la relecture).
- **Lecteur du devis (AC1)** : la présence de `quote_amount` ne décide pas (`seesQuote` côté API le retire,
  mais le test d'AC1 le pose quand même). Le montant ne s'affiche que si `abilities.can_view_quote_pdf`
  (`viewQuote`) ou `abilities.can_decide_quote` est vrai — un droit lu, jamais un rôle.
- **Le rafraîchissement** : `useFilEnDirect` ne relit sur `message.created` que la relecture `after_id` ;
  une carte déjà chargée garderait son `object`. Relire toutes les pages à chaque signal relirait aussi à
  chaque message texte et chaque lecture. D'où : l'arrivée d'un `event`/`card` PLUS RÉCENT que ceux déjà
  vus (fusionné par la relecture, signal ou filet de 3 s) relit les pages chargées. Marche sans temps réel.

### Relevé des gestes, carte par carte (avant d'écrire)

| Carte | Geste de la maquette | `ability` lue | Route | Rendu |
|---|---|---|---|---|
| Devis | Approuver le devis | `can_decide_quote` | `POST /api/maintenance-requests/{id}/quote/approve` | bouton principal |
| Devis | Refuser | `can_decide_quote` | `…/quote/reject` (`reason` exigé) | lien → `QuoteRejectionModal` existant |
| Devis | Demander une précision | — | — | **absent** |
| Passage | Proposer un autre moment | `can_request_reschedule` | `POST …/reschedule-requests` | lien → feuille de créneaux |
| Passage | Confirmer ce moment | — | aucune route (hors périmètre) | **absent** |
| Passage / visite | Relancer {nom} | — | — | **absent** |
| Visite | Confirmer ce moment | `abilities.confirm` | `POST /api/property-visits/{id}/confirm` | bouton principal ; 422 `visit.time_required` dit en refus |
| Visite | Proposer un autre moment | aucune dans la projection (`PropertyVisitPolicy::reschedule`) | `…/reschedule` | **absent** (reste) |
| Loyer | Payer avec Wave / Orange Money | `pay` | `POST /api/lease-payments/{id}/initiate` | UN bouton « Payer » → `PayerUneEcheance` existant (choix du moyen) |
| Loyer | Encaisser à la main | `record_payment` | `POST /api/lease-payments/{id}/mark-paid` | lien → `LeasePaymentDialog` existant |
| Loyer | Relancer Ousmane | `remind` | `POST …/reminders` exige `channel` whatsapp/call | **absent** : la route NOTE une relance faite sur le téléphone, que la projection ne porte pas (reste) |
| Loyer | Appeler, Autre moyen, Télécharger la quittance | — | — | **absents** (`receipt_available` hors projection) |
| État des lieux | Relire et signer | `can_sign_as` non vide | parcours existant (`/app/inventories/{id}`, canevas + code) | bouton-lien principal |
| État des lieux | Relancer Astou Cissé, Télécharger le PDF | — | — | **absents** |
| Réservation | Confirmer / Refuser | `confirm` / `reject` | `POST /api/bookings/{id}/confirm`, `…/reject` | bouton + lien (refus en deux temps) |
| Bail | — | — | page `/app/leases/{id}` | lien « Voir le bail » |

Textes de la maquette sans champ projeté, **non rendus** : net reversé et honoraires (bailleur),
pénalité et « rappel automatique le 4 », mandat de travaux, détail des lignes du devis, « Reversé le 7 »,
nombre de pièces et de photos de l'état des lieux.

### Écarts au relevé, en cours d'écriture (2026-11-18)

- **Les parcours existants ne sont pas montés dans le fil** : `ChatView` est atteint depuis la RACINE (le
  widget public, `ChatWidget`), et `check-i18n-namespaces` a rougi (« frontière « . » — espaces atteignables
  et non déclarés : lease, maintenance, payments ») dès que la carte importait `QuoteRejectionModal`,
  `LeasePaymentDialog` et `PayerUneEcheance`, même par `next/dynamic` (la garde suit `import()`). Les
  déclarer à la racine les servirait à TOUTES les pages. D'où, sous `messaging.cartes.*` :
  - « Refuser » le devis : une feuille à motif (≥ 10 caractères, la règle de `QuoteRejectionModal`) →
    `POST …/quote/reject {reason}` (`FeuillesDesGestes.tsx`) ;
  - « Encaisser à la main » : une feuille au moyen de paiement (les cinq de `LeasePaymentDialog`), réglée
    aujourd'hui → `POST /api/lease-payments/{id}/mark-paid {payment_method}` ;
  - « Proposer un autre moment » : la feuille de « Changer le créneau » réécrite avec des clés `messaging`
    (`ProposerUnAutreMoment.tsx`), même route et mêmes règles (`lireLesCreneaux`) ;
  - « Payer » : un lien vers le parcours du locataire, `/app/payments` (choix du moyen ouvert par le serveur,
    `initiate`, page du fournisseur) — un paiement quitte de toute façon la conversation pour le fournisseur.
- Le nom du client d'une réservation passe par `nomAffichable` (`check-nom-affichable`).
- `CarteNeutreBubble` reste : c'est le rendu d'un type que ce front ne sait pas encore dire (le bien
  partagé, TCK-2964). Le test de TCK-2958 qui attendait la ligne neutre pour un objet indisponible attend
  désormais la carte indisponible.
- **Repli** : à partir de DEUX `event` consécutifs (`SEUIL_DE_REPLI`) ; un jour, un message, une carte, un
  avis `system` ou un événement qui attend le lecteur coupent la suite. Fonction pure,
  `replierLesEvenements.ts`, testée seule.
- L'en-tête d'une carte venue d'un `event` est le texte de l'événement (composé du code) et l'heure ; celui
  d'une `card` posée dans un groupe, son auteur et l'heure.

### Mesures (2026-11-18, `load average` 1,7 à 3,2 sur 8 cœurs)

- `npx tsc --noEmit` : propre (hors les quatre `tesseract.js` déjà relevés par TCK-2958). `npx eslint
  src/components/messages src/types/message.ts` : 0.
- `npx vitest run` sur les 40 fichiers de `src/components/messages/__tests__/` (liste explicite) : 324 verts.
- `check-i18n-namespaces` : conforme (50 frontières). `check-i18n` et `check-classes-emises` : rouges des
  seules maquettes du playground. Gardes racine : rouges des seules maquettes (les sept nommées par le brief) ;
  `check-nom-affichable` vert après `nomAffichable`.
- **AC6 (fidélité au navigateur) non mesuré** : aucune carte n'existe en base tant que TCK-2961 (codes et
  `action_for` des objets) et TCK-2964 (pose d'une carte) ne sont pas livrés — tout `event` d'aujourd'hui a
  `action_for` vide, donc se rend en ligne. Relevé statique contre `fil-cartes-d-cartes.tsx` : aplat
  `bg-muted/80` sans bordure, aucune barre ni liseré, aucune puce-icône (seule la coche de l'état « fait »,
  comme la maquette), un seul bouton plein par carte, les autres gestes en liens.

### Ablations (une à une, `-t`, restauration par `cp` prouvée par md5)

| AC | Mutation | Résultat |
|---|---|---|
| AC1 | `litLeDevis = true` (la carte du personnel pour tout lecteur) | « le locataire lit … sans montant » rouge |
| AC2 | `decide = true` (ignorer `can_decide_quote`) | locataire et prestataire rouges |
| AC2 | visite : `peutConfirmer` sans `abilities.confirm` | « Confirmer ce moment … absent sinon » rouge |
| AC3 | `'indisponible' in objet` retiré | « rend une carte discrète » rouge |
| AC4 | `replierLesEvenements` retiré de `ChatView` | le test AC4 rouge |
| AC5 | `useCartesEnDirect` retiré de `ChatView` | « message.created → … Validés » rouge |
| AC2 | loyer : « Payer » sans `abilities.pay` | « le personnel … ni payer » et « payée … sans geste » rouges |
| AC2 | loyer : « Encaisser » sans `abilities.record_payment` | « le locataire … ni encaissement » et « payée … sans geste » rouges |

### Revue avant remise (2026-11-18)

- **Un geste relit aussi les écrans de l'objet** : `useGesteDeLaCarte(conversationId, clesDeLObjet.…)`
  invalide, en plus des deux clés du fil, celles que les mutations de ces écrans invalident
  (`['maintenance']`, `['bookings','detail',id]`/`list`, `['visits',…]`, `['leases',…]` et
  `['payments','history']`) — écrites en littéraux pour ne pas importer `lib/queries/*` dans un module
  atteint depuis la racine. Éprouvé sur l'approbation d'un devis (`['maintenance']`) et la confirmation
  d'une réservation (`['bookings','detail',3]`).
- Routes ajoutées aux tests : `…/reschedule-requests` (un instant à venir) et `/api/bookings/{id}/confirm`.
- Encres opaques : les gardes `src/test/__tests__/encre-sans-alpha` (cliquet de TCK-658) refusaient les
  `text-foreground/NN` des cartes → `text-foreground` ou `text-muted-foreground`. Les trois gardes de
  contraste restent rouges des seules maquettes du playground.
- « Payer » (lien vers `/app/payments`) et « Relire et signer » (`/app/inventories/{id}`, dont la fiche
  ouvre le canevas sur `can_sign_as`, TCK-596) sont des navigations, pas des POST.
- `namespaces.json` est modifié dans l'arbre par un autre ticket ; ses `frontieres` sont identiques à
  HEAD et aucune des 50 parts mesurées ne dépasse les plafonds de HEAD : ce ticket n'exige pas ce fichier.
- Vitest élargi : `messages/__tests__` (40 fichiers), tous les tests qui importent `ChatView`,
  `ChatWidget`, `SystemMessageBubble`, `useTexteMessageSysteme` ou `ConversationList`, les gardes de
  `src/test/__tests__` et `zod-hors-des-ecrans-de-lecture` : 78 fichiers, 935 verts (gardes de contraste
  à part, rouges des seules maquettes).
- **À trancher par la session** : la table de TCK-2961 donne un `action_for` au locataire sur
  `due_soon`, chaque jalon `overdue` et `reminded` — un loyer impayé empilera donc plusieurs cartes,
  chacune avec « Payer ». C'est la règle du ticket appliquée à la lettre ; le code ne la contourne pas.

