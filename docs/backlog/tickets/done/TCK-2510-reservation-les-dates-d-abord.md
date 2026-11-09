---
id: TCK-2510
title: Réservation courte durée « Les dates d'abord » : calendrier des nuits prises, un seul récapitulatif
status: done
phase: P1
family: front
estimate: M
wave: 85
created: 2026-11-08
updated: 2026-11-09
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
  models: []
tags: [front, reservation, mobile, audit-ux]
---

## Objectif utilisateur

Choisir ses dates en voyant ce qui est déjà pris, voir le total suivre le doigt, puis envoyer sa demande depuis un seul écran — sans être arrêté par une page de connexion avant même d'avoir choisi.

## Contrat de données

- **Les nuits prises existent déjà** : `GET /api/public/properties/{slug}/availability?from=&to=` (TCK-596) rend les plages occupées fusionnées — réservations confirmées et indisponibilités manuelles ou importées — sans dire pourquoi. *La maquette affirmait que ce calendrier n'existait pas côté API : c'est faux, relevé le 2026-11-08.*
- Devis : `booking-quote.ts` (nuit ou semaine au prorata), acompte de 30 % après confirmation (règle de la spec § 1.3).
- Envoi : endpoint de demande de réservation existant ; `response_deadline` de la réponse affichée.
- Connexion dans le tunnel : la connexion par numéro et code SMS existante, **quand `auth.phone_login.enabled` est vrai** ; sinon, le renvoi actuel vers la connexion, retour au tunnel avec les dates conservées.

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=reservation&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes).
- « Réserver » ouvre un calendrier plein écran ; jours pris barrés et non sélectionnables ; barre basse avec le nombre de nuits et le total, recalculé à chaque sélection.
- Puis **un seul écran** : récapitulatif (dates, voyageurs, total, acompte « après confirmation »), identité (numéro + code si non connecté), conditions, envoi.
- Succès : référence, montant enregistré par l'API, et ce qui se passe ensuite (l'agent confirme avant l'échéance, sinon la demande expire).
- L'acompte, une fois confirmé, reprend le paiement « Un total, un geste » (TCK-2505).

## Contraintes strictes (métier)

- Une DEMANDE, jamais une réservation instantanée : dit avant l'envoi, pas seulement après ; rien n'est prélevé avant confirmation.
- Une sélection qui chevauche une plage occupée est impossible au calendrier, et le refus de l'API (nuits déjà confirmées) reste géré.
- Un séjour peut arriver le jour du départ d'un autre (TCK-596).
- Un bien au mois renvoie vers l'agent, avec Visiter et WhatsApp (décisions 3a, 4a).
- Le tunnel n'a pas de barre d'onglets (ADR-0091 § 4) ; le titre de page perd la marque en double.
- **La politique d'annulation gratuite affichée par la maquette n'est pas livrée** : c'est une décision par agence, qui n'existe pas en base (voir Hors périmètre).

## Delta à produire

- [ ] Calendrier plein écran branché sur `availability`, nuits prises barrées, total en barre basse.
- [ ] Écran unique de récapitulatif + identité + envoi (remplace les quatre étapes).
- [ ] Connexion par numéro dans le tunnel derrière le drapeau, repli sur le renvoi actuel.
- [ ] Le filtre « Journalier / Hebdo » de la liste ne s'affiche que s'il a des biens à montrer.
- [ ] Clés i18n `fr`/`en`/`wo`.
- [ ] Tests (jours pris non sélectionnables, total recalculé, repli sans connexion par numéro, dates conservées au retour de connexion).

## Critères d'acceptation

- [x] AC1 — Avec une plage occupée du 10 au 13, les nuits du 10, 11 et 12 sont barrées et une sélection du 9 au 11 est refusée au calendrier ; une arrivée le 13 est possible.
- [x] AC2 — Le total affiché à l'envoi est celui de `booking-quote.ts` pour les dates choisies, à l'unité près.
- [x] AC3 — Drapeau éteint : un anonyme qui envoie est renvoyé à la connexion et retrouve ses dates au retour.
- [x] AC4 — Le parcours compte trois écrans (dates, récapitulatif, succès) au lieu de quatre étapes.

## Hors périmètre

- Une politique d'annulation par agence (à décider par le porteur, puis spec et ticket).
- Le paiement de l'acompte (TCK-2505).

## Notes d'implémentation

### Mesures avant de coder (2026-11-09, agent « reservation », vague 2)

- `GET /api/public/properties/{slug}/availability?from=&to=` : 200 `{data:{from,to,occupied:[{start,end}]}}`,
  plages `[start, end)` (le jour `end` est le départ, libre pour une arrivée), **fusionnées quand elles se touchent**
  (`start <= end` précédent) ; fenêtre par défaut aujourd'hui → +12 mois, bornée à 18 ; `to` avant `from` → 422.
  Confirmé : réservations confirmées + indisponibilités, sans motif.
- **Deux voies d'envoi coexistent** : le tunnel `/bookings` poste `POST /api/bookings` (`useCreateBooking`, idempotent),
  la boîte de la fiche poste `POST /api/public/properties/{slug}/booking-request` (action serveur). Les deux refusent
  les nuits prises (`PropertyAvailabilityService::assertAvailable` → 422 `booking.dates_overlap` /
  `booking.dates_unavailable`) et recalculent le montant (`BookingQuote`). Le tunnel garde `POST /api/bookings`.
- **La fiche n'ouvrait jamais le tunnel** : « Réserver » ouvrait `PropertyReservationDialog` (deux `DatePicker`,
  nuits grisées) ; `/bookings?property=` n'était lié de nulle part (`grep` sur `src/`). Le retour de connexion
  « dates conservées » vivait dans la boîte (`?action=reserver&debut=&fin=`, TCK-589), pas dans le tunnel, dont
  l'invite de connexion renvoyait à `/bookings?property=` SANS les dates.
- Base de dev : **aucun bien `daily`/`weekly`** (`Property::whereIn(rent_period, [daily, weekly])->count()` → 0).
- `auth.phone_login` : `GET /api/auth/oauth/providers` → `phone_login: true` en dev.
- Titre servi : `<title>Réserver un bien — Takussan — Takussan</title>` (la clé porte la marque, le gabarit
  `%s — Takussan` la rajoute).
- Filtre de période de la liste : la recherche (`/api/public/properties/search`) n'a **pas de facette `rent_period`**
  (`FACETTES = contract_type, type, bedrooms, neighborhood`). Le compte se prend par
  `search?contract_type=rent&rent_period=daily&per_page=1` → `meta.total` (0 en dev, 46 pour `monthly`).


### Décisions d'implémentation

- **La fiche ouvre le tunnel pour un séjour court** (`useOuvrirReservation`, seule édition de la fiche : trois
  `onRequestBooking`). La boîte `PropertyReservationDialog` reste pour le dossier d'une location au mois et l'offre
  d'une vente, et pour les anciens liens `?action=reserver` (TCK-589).
- **Les dates voyagent dans l'URL du tunnel** (`/bookings?property=&debut=&fin=&personnes=`, `tunnel-de-reservation.ts`),
  réécrite par `history.replaceState` à chaque choix : le renvoi vers la connexion (drapeau éteint, second facteur,
  conditions du Radar) y ramène, et le tunnel rouvre alors directement « Votre demande ». Des dates rapportées devenues
  prises tombent quand les nuits arrivent (`selectionTenable`), et l'écran le dit.
- **Calendrier maison** (`CalendrierDesNuits`, règles pures dans `calendrier-des-nuits.ts`) plutôt que `react-day-picker` :
  un jour barré (nuit prise) reste un **départ** possible le jour où un autre séjour arrive, ce que le `disabled` d'un
  jour ne sait pas dire. En attente du départ, un jour au-delà d'une nuit prise est éteint (pas un nouveau départ
  d'arrivée) : c'est ce qui rend « une sélection du 9 au 11 refusée au calendrier » (AC1) visible.
- **Connexion par numéro sur l'écran même** (`useIdentiteParTelephone`) : le numéro, le code, puis l'envoi. Les cas
  rares de `ConnexionParTelephone` (second facteur, `requires_terms`, 404 du drapeau éteint entre-temps) **renvoient
  vers la connexion, dates conservées**, au lieu d'être recopiés. L'envoi part au rendu qui suit `openSession` : la
  mutation lit le jeton d'`AuthContext` au rendu, et le drapeau d'envoi est posé AVANT `verifier()` (posé après,
  l'effet passait avant lui — rouge constaté).
- Un compte ouvert par le code SMS du tunnel ne passe pas par `/onboarding/intention` (prénom) : la demande part au
  nom d'un compte sans prénom. Écart assumé, noté dans le rapport.
- Sous `lg`, la page `/bookings` masque la barre du site et le pied (`Coque plein`) : le tunnel tient l'écran, avec
  sa propre barre basse (ADR-0091 § 4). En bureau, calendrier sur deux mois + carte de récapitulatif collante ; la
  maquette posait le calendrier en surcouche de la carte de la fiche — non fait (la fiche est partagée en vague 2).
- Titre : la clé `bookings.public.metaTitle` portait « — Takussan » que le gabarit rajoute ; elle vaut désormais
  « Réserver un séjour ».
- Filtre de la liste : `usePeriodesCourtesOffertes` + `periodesAProposer` (sonde `search?...&per_page=1`, cache de
  module, une option choisie reste affichée pour pouvoir la retirer, une sonde en échec garde l'option).

### Vérification au navigateur (2026-11-09, bien temporaire `tck-2510-studio-court-sejour`, retiré depuis)

Bien à la nuit (35 000 F CFA), indisponibilités `[20, 23)` novembre et `[5, 8)` décembre — l'API rend des plages
demi-ouvertes. Mesuré à 390 × 844 (mobile, tactile) et 1440 × 900, `scrollWidth = innerWidth` partout :

- 20-21-22 et 5-6-7 barrés, le 23 et le 8 actifs (jour de départ d'un autre séjour). Arrivée le 23 → départs au-delà
  du 5 décembre éteints, le 5 lui-même possible. 23 → 26 : 105 000 F CFA dans la barre, acompte 31 500 (30 %),
  URL réécrite `&debut=2026-11-23&fin=2026-11-26`. URL `debut=19&fin=24` (à cheval sur une nuit prise) : départ
  retiré, bandeau « Ces dates ne sont plus libres », arrivée gardée.
- Fiche du bien → « Réserver » mène à `/fr/bookings?property=…` (aucune boîte). Bien au mois → état « Ce bien se loue
  au mois ou à l'année » + « Visiter ».

**Quatre défauts trouvés par cette vérification, corrigés en TDD (rouge constaté avant chaque correctif) :**

1. *Arrivée sans dates : « Ces dates ne sont plus libres » affiché à tort.* La page passe
   `lireSejourDemande(params)` = `{debut: null, fin: null}` ; `selectionTenable` rendait `SELECTION_VIDE`, une AUTRE
   référence que la sélection vide initiale, et l'appelant (qui compare par identité) concluait à un changement. Les
   tests ne l'avaient pas vu : ils montaient le tunnel sans `sejourInitial`. Correctif : une sélection vide est
   rendue telle quelle.
2. *Consentement demandé deux fois* (mention TCK-624 « En recevant le code, vous acceptez… » ET case « J'accepte les
   conditions »). Une seule case, qui nomme désormais conditions ET confidentialité ; `agir()` l'exige avant
   `demanderCode`, donc avant l'ouverture du compte. Ablation : rendre la case facultative au pas du numéro laisse
   **vert** l'ancien test « les conditions sont exigées avant l'envoi » — seul le test neuf rougit.
3. *Deux « Continuer » au bureau* (barre basse statique + carte de récapitulatif) : la barre est masquée dès `lg` sur
   l'écran des dates, comme elle l'était déjà sur le récapitulatif.
4. *L'état « au mois / vente » était plein écran sur mobile*, sans barre du site ni issue autre que son bouton :
   `Coque plein` n'est plus posé que pour un séjour court (`estSejourCourt`).

Gardes de la surface publique, ramenées au vert pour les fichiers de ce ticket sans toucher aucun cliquet :
encre translucide (`text-muted-foreground/40|/50` → encre pleine), alerte en `DestructiveBanner`, pastille de succès
sur `bg-muted`, classes du jour choisi posées EN DERNIER (la dernière encre gagne, pour `twMerge` comme pour le
lecteur de `surface-publique.contraste`), hauteur des champs par `fieldDensityScope()` (`check-champs-uniformes`).

### Corrections de la revue (2026-11-09, sept mineurs)

1. **Jour de l'API gardé** — `BookingTunnel.jour-de-l-api.{new-york,paris}.tck-2510.test.tsx` (cf. P212.02). ⚠ 23:30Z
   ne fait pas diverger New York (18:30, même jour) : New York à **02:00Z** (jour local en retard), Paris à **23:30Z**
   (en avance). La mutation de la revue (`toLocaleDateString('sv-SE')`) rougit les deux.
2. **401 à l'envoi** → connexion, `redirect` avec dates et personnes : testé, rouge sans la branche.
3. **URL du tunnel** — mesuré au navigateur, les deux formes :
   - `history.replaceState(window.history.state, …)` (livré) : après `router.refresh()`, l'URL **perd ses dates**
     (`?property=…` seul), l'écran les garde — le défaut de la revue, reproduit.
   - `router.replace(url, { scroll: false })` (demandé) : une **navigation** — 4 requêtes RSC pour 2 jours touchés,
     la page rendue au serveur et le bien relu à l'API à chaque clic (94 à 126 s chacune sous la charge du moment),
     l'URL en retard d'autant.
   - `history.replaceState(null, '', url)` (retenu) : la forme que Next 16 documente (« Native History API ») ; son
     patch passe alors par `applyUrlFromHistoryPushReplace` (`ACTION_RESTORE`), le routeur suit. Mesuré : URL à jour
     au clic, **0 requête RSC**, dates gardées après `router.refresh()`.
   Test : état `{__NA: true}` posé d'abord (sous jsdom il vaut `null` et le test serait muet), puis
   `replaceState(null, '', …)` attendu, ni `push` ni `replace`. Rouge sous les deux ablations.
4. **Un seul parcours** — `useReservationDeLaFiche` (fiche : un appel au lieu de deux) : « Réserver » ET le retour
   `?action=reserver&debut=&fin=` (TCK-589) mènent au tunnel pour un séjour court, dates reprises ; mesuré au
   navigateur (fiche → `/fr/bookings?…&debut=2026-11-24&fin=2026-11-27`, « Votre demande », aucune boîte).
   `useIntentionDeReservation` passe l'intention lue à `ouvrir`. **`PropertyReservationDialog` reste** : il sert le
   dossier d'une location au mois (`onPrepareApplication` de la visite, repli de « Réserver ») et l'offre d'achat.
5. **Bien au mois** : « Contacter l'agent » d'après le contact principal (`is_agent` + `slug`), à défaut le
   propriétaire. Mesuré : `petit-studio-a-dakar-plateau-fmzMTY` → `/fr/agents/awa-seck`.
6. **zod** : l'entrée `BookingTunnel.tsx` de `FORMULAIRES_ADMIS` retirée. ⚠ Prémisse de la revue contredite : sans
   elle, `/bookings` ROUGISSAIT — `FormGlobalError` importé du barrel `@/components/forms` tirait `react-hook-form`.
   Import du fichier `FormError` ; la table est vide, et une ablation (zod dans le tunnel) rougit.
7. **Maquette, écran de succès** : bouton WhatsApp vers le contact **seulement si l'API dit `has_whatsapp`** (le numéro
   n'est jamais exposé, il se révèle au geste, TCK-590) — sinon « Retour au bien ». « (30 %) » avec une espace
   insécable (vu à 1440 : sur une ligne). **Au bureau, le tunnel reste pleine page, sans surcouche sur la carte de la
   fiche** : la maquette A posait le calendrier en surcouche ; écart assumé, à trancher par le porteur.
