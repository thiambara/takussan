---
id: TCK-2968
title: "La boîte de pilotage et la note d'équipe à l'écran : filtres de pilotage, Traité, Rappelez-le-moi, fil confié, pastille des gestes, interrupteur Équipe et @mention"
status: done
phase: P2
family: front
estimate: L
wave: 95
created: 2026-11-18
updated: 2026-11-18
depends_on: [TCK-2965, TCK-2966, TCK-2967]
blocks: []
spec_refs:
  features:
    - docs/features.md#17-communication--messagerie
  models: []
tags: [front, messagerie, le-fil, boite, note-d-equipe, mentions, i18n, adr-0128]
---

## Objectif utilisateur

- **Tout lecteur de la messagerie** : la liste lui dit d'abord ce qu'on attend de lui. Il range un fil
  d'un geste (« Traité », « Rappelez-le-moi »), et la pastille de l'onglet Messages compte ce qui
  l'attend, pas ce qu'il n'a pas lu.
- **Le personnel de l'agence** : dans le fil d'un client, il bascule sur « Équipe » pour écrire une
  note que seuls ses collègues liront, sans jamais se tromper de destinataire. Il appelle un collègue
  par `@`, et confie une salle ou un groupe à une personne de l'équipe.

## Contrat de données

Endpoints existants, enrichis par les tickets amont :
- `GET /api/conversations` : `filter[file]`, puis par fil `file`, `attend_depuis`, `en_attente_de`,
  `snoozed_until`, `handled_at` et `assigned_to` ; dans la réponse, `meta.counts.{vous,attente,rappel}`
  et `meta.gestes` (TCK-2967) ;
- `PUT|DELETE …/snooze`, `PUT|DELETE …/handled` et `PUT …/assignee` (TCK-2967) ;
- `POST …/messages` avec `visibility` et `mentions[]` ; `visibility` et `metadata.mentions` à la
  lecture (TCK-2965, TCK-2966).

Sparse fieldsets : les champs ajoutés entrent dans la constante `*_FIELDS` de la liste.

## Direction UX / Artistique

- **Référence de fidélité** (maquettes locales, hors git) :
  - `fil-boite`, approche **D** : une rangée unique de filtres Tous · Non lus · À vous · En attente ·
    Rappels, qui défile à l'horizontale au bureau comme au téléphone. **« Retard » n'apparaît pas
    avant le lot 3**, et ses écrans (`a-vous`, `traite`, `non-lus`, `rappels`, `vide`, `recherche`)
    se relèvent sans lui ;
  - `fil-cartes`, approche **D**, écran « Note d'équipe et @mention » : l'interrupteur « Équipe »
    est discret.
- **On ne se trompe jamais de destination.** Quand « Équipe » est actif, quatre signes l'affichent
  sans bordure :
  - la teinte ocre du champ ;
  - le texte d'attente (« Note d'équipe · invisible pour … ») ;
  - le libellé du bouton (« Noter ») ;
  - la ligne « Lu par… ».

  Une note envoyée se lit au premier regard (aplat ocre, cadenas, « Note d'équipe »).
- **La file se lit sans légende** : délai « depuis 25 min » sur un fil « À vous », dépassé au-delà
  de **4 h** (une constante nommée du front ; décision du porteur du 2026-11-18, 2a) ; motif court sur un fil « En attente » (« Bineta Sarr
  doit signer », « confié à Ibrahima Fall »), composé depuis `en_attente_de` et les participants.
- **« Traité »** : un geste au survol au bureau et au glissement au téléphone, suivi d'un toast avec
  « Annuler ». **« Rappelez-le-moi »** propose des choix courts (dans 1 h, ce soir, demain matin,
  lundi), dans une feuille au téléphone.
- **La pastille** de l'onglet Messages (barre du téléphone et colonne du bureau) lit `meta.gestes`.
  « Non lus » garde son sens : un fil lu peut rester « À vous ».
- **@mention** : `@` ouvre une liste des seuls participants qui liront ce message (le personnel pour
  une note). La mention s'affiche en nom, jamais en identifiant.
- **Confier** : depuis l'en-tête ou le dossier d'une salle ou d'un groupe, pour le seul personnel. Le
  fil d'un prospect n'offre pas ce geste.
- Textes en `fr` et `en`, et en `wo` le texte français tel quel (wolof en pause). Vouvoiement.

## Contraintes strictes (métier)

- **Un client ne voit jamais l'interrupteur « Équipe »**, ni aucun texte qui parle de notes
  d'équipe. Le front le cache, et l'API le refuse de toute façon (TCK-2965).
- **Écrire une note n'émet pas « en train d'écrire »** : aucun message éphémère sur le canal de
  présence du fil (ADR-0129 § 2, `src/lib/temps-reel/ecriture.ts`) tant que « Équipe » est actif.
  *Ablation : laisser passer le message éphémère en mode « Équipe » rend un test rouge.*
- **L'interrupteur revient à « Fil » après chaque envoi**, et ne se retient pas d'un fil à l'autre :
  aucun brouillon ne garde la destination « Équipe » à l'insu de l'auteur.
- **Le filtre de file part au serveur** (`filter[file]`), jamais sur la page déjà reçue. Les comptes
  des puces lisent `meta.counts`, et non la page.
- **Sous impersonation** : gestes absents (lecture seule).

## Delta à produire

- [x] La rangée de filtres de pilotage de la liste et ses états vides par filtre.
- [x] Sur chaque ligne : délai, motif d'attente, « confié à », et les gestes « Traité » et
  « Rappelez-le-moi » avec leur annulation.
- [x] La pastille des gestes dans la barre du téléphone et la colonne du bureau.
- [x] Le composeur : interrupteur « Équipe » pour le personnel, saisie `@` et liste des mentionnables,
  aucun message éphémère en mode « Équipe ».
- [x] La bulle de note d'équipe et l'affichage d'une mention.
- [x] Le geste « Confier » pour les salles et les groupes.
- [x] Clés i18n `fr`, `en` et `wo` (texte français).
- [x] Tests :
  - les filtres envoient `filter[file]` ;
  - la pastille lit `meta.gestes` ;
  - « Traité » puis « Annuler » ;
  - le client n'a pas l'interrupteur ;
  - aucun message éphémère en mode « Équipe » ;
  - retour à « Fil » après l'envoi ;
  - les mentionnables d'une note ne comptent que le personnel.

## Critères d'acceptation

- [x] **AC1** — Relevé au navigateur sous `./dev.sh`, à 360 et 1280 px : chaque écran de `fil-boite`
  D (sans « Retard ») et l'écran « Note d'équipe et @mention » de `fil-cartes` D est fidèle à sa
  maquette. Chaque écart est nommé dans le ticket.
- [x] **AC2** — Un locataire connecté ne voit ni l'interrupteur, ni une note, ni le mot « équipe » dans
  son fil. Relevé au navigateur, avec un agent qui écrit une note dans la même salle.
- [x] **AC3** — Écrire en mode « Équipe » n'affiche pas « en train d'écrire » chez le locataire
  abonné au même fil. Relevé au navigateur, deux sessions.
- [x] **AC4** — « Traité » fait sortir le fil de « À vous » et baisser la pastille d'une unité ;
  « Annuler » rétablit les deux.
- [x] **AC5** — `npm run lint`, `npx tsc --noEmit`, `check:i18n`, `check:vouvoiement` verts ; tests des
  fichiers touchés verts.

## Hors périmètre

- La puce « Retard », la file des engagements et leur part de la pastille : lot 3.
- Le copilote et le pont WhatsApp ou SMS.
- Un délai dépassé réglable par agence.

## Notes d'implémentation

### Re-mesure de la prémisse (2026-11-18)

- **Qui écrit et qui lit les notes : les drapeaux de l'API** (reprise du 2026-11-18, à la demande de la
  session). Une première passe dérivait la règle de la relation `agent` du contexte, faute de drapeau ; elle
  est retirée. `GET …/context` porte désormais `data.can_write_team_note` et
  `data.participants[].reads_team_notes` (TCK-2967, `ConversationContextResource`) : l'interrupteur paraît
  si et seulement si `can_write_team_note` ; les mentionnables d'une note, et les collègues proposés par
  « Confier », sont les participants de `data.team_note_reader_ids` (ajouté ensuite par TCK-2967 : tout
  participant actif qui lit les notes, AVEC ou SANS ligne de relation — `participants[]` n'en porte pas pour
  qui n'a aucune relation lisible, TCK-2748). `reads_team_notes` est typé, pas lu. La `relation` ne sert
  plus qu'au libellé « Lu par Awa Diop (agent) ». L'API reste juge (422 `messaging.team_note_*`,
  `messaging.mention_not_reader`), et le composeur affiche l'échec d'un envoi (il était avalé).
- **`en_attente_de` porte des identifiants seuls** : « Bineta Sarr doit signer » ne se compose pas (la
  nature du geste attendu ne sort pas). Motif générique « En attente de {noms} », nommé d'après les
  participants actifs ; un identifiant inconnu est ignoré, jamais affiché.
- **Ordre de « À vous »** : l'API trie désormais `filter[file]=vous` par `attend_depuis` croissant (la plus
  longue attente d'abord, comme la maquette ; TCK-2967) ; les autres files gardent l'ordre du dernier échange.
  Le front ne retrie rien sur la page reçue.
- **Pastille** : `meta.gestes` arrive sur la même requête étroite (`per_page=1`, clé
  `['conversations','list','unread-total']`) ; `useUnreadCount({ mesure: 'gestes' })` la lit, sans lecture de
  plus. Le widget flottant garde `unread_total`. Les libellés du compteur (`nav.sidebar.counters`,
  `aujourdhui.lignes`, `palette.aTraiterLignes`, et l'annonce `AnnonceDesNonLus`) disent « à traiter » ; le
  `wo` déjà traduit est conservé par l'outil de clés (ADR-0095 § 4) et dit encore « non lus » (wolof en pause).

### Composeur (2026-11-18)

- Destination liée au fil (`{fil, equipe}`) et remise à « Fil » pendant le rendu quand le fil change :
  revenir au fil d'avant ne la rend pas « Équipe » (test). Retour à « Fil » après un envoi RÉUSSI ; un échec
  la garde (le nouvel essai reste une note).
- En mode « Équipe » : ni trombone, ni note vocale, ni réponses rapides, ni « poser » (ils partiraient au
  fil entier) ; `@` remplace le trombone, « Noter » le rond d'envoi. L'interrupteur est désactivé pendant
  une pièce en attente ou une note vocale.
- Le nom accessible de l'interrupteur est « Équipe » (le `<label>` qui l'enveloppe l'emporte sur
  `aria-label`), décrit par la ligne « Lu par… ».

### Ablations (2026-11-18, une à une, `-t` sur le seul test visé, restauration par `cp`, md5 vérifié)

| Ablation | Rouge |
|---|---|
| `signalerFrappe` sans la garde du mode « Équipe » | `écrire une note n’émet rien` |
| pas de retour à « Fil » après l'envoi | `rendu à « Fil »` |
| pas de remise à « Fil » au changement de fil | `changer de fil` |
| `equipeLit` toujours vrai | `un client ne voit ni l’interrupteur` |
| interrupteur dérivé de la relation `agent` (l'ancienne règle) | `un personnel aussi bailleur du fil l’a quand l’API le dit` |
| interrupteur dès que le contexte est lu, sans `can_write_team_note` | `un agent dont l’API dit qu’il n’écrit pas de note` |
| mentionnables d'une note dérivés de la relation `agent` | `les mentionnables d’une note suivent team_note_reader_ids` |
| mentionnables d'une note lus sur `participants[].reads_team_notes` | `un lecteur des notes SANS ligne de relation reste mentionnable` |
| collègues de « Confier » dérivés de la relation `agent` | `le dialogue « Confier » liste les participants…` |
| mentionnables d'une note = tous les participants | `mentionnables d’une note` |
| l'impersonation ne coupe plus les gestes (`actif: true`) | `sous impersonation, aucun geste` |
| la puce ne pose plus `file` dans les filtres | `chaque puce de file part au serveur` |
| `conversationListParams` n'envoie plus `filter[file]` | `` `file` part en `filter[file]` `` |
| « Confier » offert à tout fil (direct, client) | `« Confier » : une salle ou un groupe` |
| « Confié à » lisible de tous | `« Confié à » ne se lit que du personnel` |
| la pastille du menu lit `nonLus` | `ne sonde que les compteurs` (`useCompteursDuMenu`) |
| « Annuler » n'envoie plus `DELETE …/handled` | `« Traité » puis « Annuler »` |
| « Confier » de l'en-tête sans la règle « personnel, salle ou groupe » | `un agent dans un groupe` et `un locataire dans un groupe` (`MessagesPage`) |
| « Confier » de l'en-tête sans la condition « personnel » | `un locataire dans un groupe` |

### La boîte (2026-11-18)

Décisions acceptées par la session le 2026-11-18 : la puce « Groupes » quitte la rangée ; la feuille
« Filtrer » est hors de ce delta ; la pastille de l'onglet lit `meta.gestes` ; le motif d'un fil « En attente »
est générique, « En attente de {noms} ».

- Puces Tous · Non lus · À vous · En attente · Rappels, comptes de `meta.counts`, file en `filter[file]` (et
  dans la clé de requête). **« Groupes » quitte la rangée** (écart : la maquette le range dans « Filtrer »,
  feuille hors de ce lot). Une ligne d'aide par puce, sous la rangée, page seule.
- Rangée : étiquette de file (`StatusBadge`) sous « Tous » et « Non lus » ; signaux — délai d'un fil « À vous »
  (« au-delà de 4 h » en encre d'alerte, `DELAI_DEPASSE_MS`), « En attente de {noms} », « Confié à » (personnel
  seul), « Revient {quand} ». L'horloge des délais se relève chaque minute.
- Gestes tenus par la PAGE (`pilotage`), jamais par le widget flottant ni sous impersonation (cookie témoin,
  `relaisImpersonationActif`) : survol ou focus au bureau (Traité · Rappel · Confier), glissement au toucher
  au téléphone (Rappel · Traité), « Ramener » sous « Rappels ». Le toast de « Traité » est dessiné par la
  boîte (surface `.dark`, 6 s, « Annuler » → `DELETE …/handled`) : la liste est aussi montée hors des coques
  qui portent un `ToastProvider`. Un échec de geste s'affiche (`role=alert`).
- « Rappelez-le-moi » : choix courts seulement (dans 1 h, ce soir 18 h, demain 9 h, lundi 9 h ; heure de
  Dakar). **Écarts** : pas de date libre, et la case « revenir plus tôt si quelqu'un écrit » devient une ligne
  de règle (l'API ramène le fil sur tout message, elle ne prend pas d'option). « Dans 1 heure » est inscrit au
  registre des promesses de délai (`promesses-de-delai.test.ts`), adossé à `pilotage.ts`.
- « Confier » : au survol d'une salle ou d'un groupe (personnel), et dans le « ⋯ » de l'en-tête ; une feuille
  (dialogue au bureau) liste les participants qui ont `reads_team_notes` et « Personne ». **Écart** : la
  pastille « Suivi par » de la maquette n'est pas posée dans l'en-tête ; « Confié à » se lit sur la rangée.
  La règle « personnel, salle ou groupe, hors impersonation » de l'en-tête vit dans `MessagesPage` (testée,
  ablation).
- États vides par file ; « À vous » vide : « Rien ne vous attend » et « Voir « En attente » (n) ».
- Sous-titre du bureau : « {n} gestes attendus · {m} conversations » quand l'API rend `meta.gestes`.

### Vérifications (2026-11-18)

- `npx eslint` (fichiers touchés) : 0 ; `npx tsc --noEmit` : propre ; vitest, 65 fichiers touchés ou voisins :
  831 verts ; `check-vouvoiement` vert ; `check-i18n` : 116 écarts, tous dans `playground/maquettes` (locales,
  hors git). Gardes racine : rouges seulement sur la liste tolérée, chacune ne citant que les maquettes ;
  `check-valeurs-arbitraires-app` a attrapé un `text-[0.6875rem]` de la note (→ `text-legende`), vert depuis.
  `src/test/__tests__` (recensements) : 3 fichiers rouges (`encre-sans-alpha`, `focus-et-contour-des-champs`,
  `surface-publique`), écarts tous dans `playground/maquettes` — les deux fichiers irrésolvables de plus de
  `surface-publique` sont `maquettes/pages/accueil.tsx` et `navigation.tsx` (sondé). Les tests qui importent les
  composants touchés hors de `messages/` et `chat-widget/` (23 fichiers) : verts.
- **Relevé au navigateur de la session (2026-11-18, `./dev.sh`, base de dev migrée)** — agent `agent3@dakarimmo.sn`
  (Pape Cissé), locataire Fatou Wade, salle du bail 178 :
  - **AC1** — 1280 px et 360 px (émulation mobile, `innerWidth` 360, aucun défilement du document ; la rangée de
    puces défile dans son conteneur). Comparé à `fil-boite` D écran 0 et à `fil-cartes` D « Note d'équipe et
    @mention », au téléphone. **Écarts nommés** :
    - la ligne ne porte ni la puce d'objet (« Devis 145 000 F à approuver », « Pièces du dossier demandées »), ni
      l'étiquette « Note d'équipe », ni « 2 événements », ni « en train d'écrire… », ni le canal WhatsApp : hors du
      delta de ce ticket (engagements au lot 3, pont hors périmètre) ;
    - le bouton « Filtrer » et « Groupes » : écart déjà nommé plus haut ;
    - les données de dev n'ont que des attentes anciennes : toutes les lignes « À vous » rendent l'état dépassé
      (« depuis 304 j · au-delà de 4 h », ocre), la maquette montre l'état dans le délai (« depuis 25 min ») ;
    - le composeur en mode « Équipe » dit « Lu par l'équipe seulement — pas par Mamadou ou Fatou » : la maquette nomme
      l'agence (« l'équipe Dakar Immo ») et écrit « ni » ; l'interrupteur n'a pas de cadenas dans le bouton ;
    - la bulle de note (cadenas, « Note d'équipe · vous », « Invisible pour Mamadou et Fatou », fond ocre) et la feuille
      « Rappelez-le-moi » au téléphone (Dans 1 heure, Demain matin, Lundi prochain, la règle) sont fidèles. La
      liste des mentionnables n'a pas pu être relevée : le fil 178 n'a qu'un membre du personnel, l'appelant.
  - **AC2** — après une note de l'agent dans 178 : chez la locataire, ni note, ni interrupteur, ni le mot « Équipe »
    (`document.body.innerText`) ; `/context` rend `can_write_team_note: false`, `team_note_reader_ids: []`, tous
    les `reads_team_notes` faux ; la liste garde l'aperçu « Une relance a été faite… » (l'aperçu ne porte pas la note).
  - **AC3** — deux sessions sur 178, observateur de mutations chez la locataire : saisie en mode « Équipe » → aucun
    « écrit… » ; témoin, la même saisie en mode « Fil » → « Pape Cissé écrit… » relevé. Le composeur revient à
    « Fil » après l'envoi d'une note.
  - **AC4** — « Traité » sur une ligne de « À vous » : `PUT …/handled` 200, toast « « Photos à refaire » est traité. »
    à 3,3 s (latence de l'API de dev), « À vous » 7 → 6 ; « Annuler » : 6 → 7. La pastille de la colonne
    (« Conversations à traiter ») suit le compte. « À vous » est trié par attente la plus ancienne (API).
  - **AC5** — `tsc`, `check:i18n`, `check:vouvoiement`, ESLint des fichiers touchés et 5038 tests (422 fichiers) verts
    par la vérification de la session ; `npm run lint` entier et la suite web par la CI.
