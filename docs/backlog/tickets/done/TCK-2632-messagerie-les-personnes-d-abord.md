---
id: TCK-2632
title: "Messagerie : la personne en titre, puces et recherche, le fil en plein écran au téléphone, une nouvelle conversation à une personne, le contexte au bureau"
status: done
phase: P1
family: front
estimate: L
wave: 87
created: 2026-11-10
updated: 2026-11-14
depends_on: [TCK-2617, TCK-2630, TCK-2631, TCK-2684, TCK-2687, TCK-2688, TCK-2689, TCK-2691]
blocks: []
spec_refs:
  features:
    - "docs/features.md#17-communication--messagerie"
  models:
    - "docs/models-spec.md#18-conversation-"
    - "docs/models-spec.md#20-message-"
tags: [front, messagerie, mobile, audit-ux, app]
---

## Objectif utilisateur

L'agent répond à ses clients comme sur WhatsApp, avec en plus ce que WhatsApp n'a pas : le bien, la fiche et le bail à côté du fil.

- Il retrouve un client par son nom.
- Il lit le fil sur tout l'écran.
- Il appelle depuis l'en-tête.
- Il écrit à une seule personne sans passer par sa fiche.
- Il envoie une photo.

## Contrat de données

- **Liste** : `GET /api/conversations`, avec `filter[search]`, `filter[unread]`, `filter[type]` et `meta.counts` (TCK-2630). `participants[].user` porte déjà `full_name` et l'avatar, que la liste n'affiche pas aujourd'hui (elle affiche le sujet ou le bien).
- **Contexte** : `GET /api/conversations/{id}/context` (TCK-2630).
- **Nouvelle conversation à une personne** : `POST /api/conversations` avec `type = direct`, qui existe déjà. Le hook du front qui l'appelle existe et n'est utilisé nulle part. Les personnes proposées viennent de `GET /api/conversations/contacts` (périmètre de TCK-565).
- **Pièces jointes** : `type = image | document`, plus le fichier (TCK-2631).
- **Relevé après TCK-2631 (c66938af4)** :
  - le fichier part dans le champ `file` (`multipart`), un seul par message ; `content` est la légende, facultative ;
  - une pièce sans légende rend `content = ''` : n'afficher la légende que si elle n'est pas vide ;
  - `attachments[]` porte `{id, name, mime_type, size, url, thumbnail_url}` ; `thumbnail_url` (vignette 400 px, signée) est `null` pour un PDF, une note vocale, ou tant que la file `media` ne l'a pas produite — retomber alors sur `url` ;
  - une photo de plus de **20 Mpx** est refusée en 422 (`PixelsAuPlus`, sur l'en-tête) : **réduire l'image avant l'envoi** (un capteur de 48 Mpx en pleine définition dépasse la borne) ; une image que le serveur ne sait pas décoder rend 422 `media.file_rejected` ;
  - bornes appliquées par le serveur : image `jpeg`/`png`/`webp` ≤ 8 Mo, PDF ≤ 10 Mo, refus en 422 sur `errors.file` ;
  - `last_message.type` (`image`, `document`) permet de rendre l'aperçu de la liste dans la langue du lecteur ; `last_message_preview` vaut « Photo » ou « Document », écrit dans la langue de l'expéditeur.
- **Appel et WhatsApp** : le téléphone de la fiche client du contexte, seulement quand l'API le rend.

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=app-messagerie&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes). Écrans « Liste », « Fil », « Contexte », « Nouvelle conversation », « Aucune conversation (agent) », « Groupe et note vocale ».
- **Liste** :
  - chaque ligne porte en premier le **nom de la personne** (ou du groupe), avec son avatar ou ses initiales, et la vignette du bien en petit ;
  - puis le bien en deuxième ligne, puis l'aperçu ;
  - puces collantes « Tous · Non lus 2 · Groupes », avec leurs comptes ;
  - champ « Chercher un nom, un bien… » ;
  - au téléphone, le « ⊕ » de l'en-tête (action de la page racine, TCK-2617) ouvre « Nouvelle conversation ».
- **Nouvelle conversation** : plein écran au téléphone (« ✕ » et titre), dialogue au bureau. Une recherche, puis des groupes de personnes (« Clients récents », « Équipe », « Propriétaires »), puis « Nouveau groupe » en dernière ligne. Toucher une personne ouvre le fil existant s'il y en a un, sinon un brouillon créé au premier envoi.
- **Fil, au téléphone** : plein écran, sans l'en-tête de la coque ni la barre d'onglets (règle de TCK-2617).
  - **En-tête** : flèche de retour unique, avatar, **nom de la personne**, et en sous-ligne le bien (lien vers sa fiche).
  - **Boutons** : « 📞 » (appel ou WhatsApp, au choix en feuille) et « ⋯ » (infos, sourdine, quitter).
  - Pour un groupe : nom du groupe et « 5 personnes ».
- **Composeur** :
  - « 📎 » (photo, appareil photo, PDF), champ, micro ou envoi ;
  - au-dessus du champ, pour l'agent, quatre **réponses rapides** fixes : « Le bien est toujours disponible », « Quand pouvez-vous visiter ? », « Voici les pièces à fournir », « Je vous rappelle » ;
  - toucher une réponse rapide la pose dans le champ, sans l'envoyer.
- **Bureau (≥ 1280)** :
  - trois colonnes, liste (320) · fil · **contexte** (320, repliable) ;
  - le contexte montre le bien (photo, prix, statut), la fiche client (étape, téléphone, agent) et le bail ou l'intervention, avec leurs liens (« Voir le bail ») ;
  - à l'arrivée, le fil non lu le plus récent est ouvert, au lieu d'un panneau vide ;
  - un seul titre au-dessus de la liste (plus « Messagerie / Vos conversations / Conversations »).
- **État vide par persona** :
  - le client garde « Parcourir les annonces » ;
  - l'agent et l'admin : « Écrivez à un client » (Nouvelle conversation) ;
  - le prestataire et le bailleur : une phrase sur les fils qui naissent des interventions et des baux, sans bouton vers les annonces.

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0038](../../../adr/0038-note-vocale-dans-la-messagerie.md).

**Pas de régression.** Ce qui existe et doit rester :

- **Liste** :
  - pagination à défilement infini, dédoublonnée ;
  - squelette ; erreur avec « Réessayer » ;
  - badge « Groupe », « +3 » participants ;
  - pastille de non-lus, icône de sourdine ;
  - archives.
- **Ouverture par URL** :
  - `?conversation=ID` (cloche, e-mails) ;
  - `?property=<slug>` : brouillon `PropertyDraftChatView`, créé au premier envoi.
- **Nouveau groupe** :
  - pour les espaces d'agence standard et les comptes sans agence (`peutProposerUnGroupe`) ;
  - participants dans le périmètre (TCK-565) ;
  - bien et bail rattachés (TCK-576).
- **Fil** :
  - séparateurs de date ;
  - bulles (moi à droite, l'autre à gauche, auteur dans un groupe) ;
  - messages système (`SystemMessageBubble`) ;
  - anciens messages chargés en remontant ;
  - **lecture seule** (« chat.readOnly ») ;
  - « Voir le bien ».
- **Note vocale ≤ 60 s** : enregistrer, arrêter, écouter, envoyer, jeter ; refus du micro expliqué.
- **Infos du groupe** :
  - renommer, participants, ajouter, sourdine ;
  - quitter, avec le dernier admin qui ne peut pas partir et la page qui le dit.
- **Téléphone** :
  - hauteur en `dvh` : le composeur ne passe jamais sous le pli (TCK-501) ;
  - région `aria-live` des nouveaux non-lus.

**Autres règles :**

- **Appel et WhatsApp** n'apparaissent que si le contexte rend un téléphone. Un client ne voit jamais le numéro personnel de l'agent par ce biais.
- **Réponses rapides** : seulement pour le personnel d'agence (agent, admin). C'est une liste fixe de libellés du front, en `fr`/`en`/`wo`, jamais émise par l'API (principe 5). Leur réglage par l'agence est hors périmètre.
- **Pièce jointe** :
  - refus de taille ou de type expliqué avant l'envoi (8 Mo pour une image, 10 Mo pour un PDF) ;
  - l'image s'affiche en vignette dans la bulle, le PDF en carte (nom, taille) ;
  - les deux s'ouvrent par l'URL signée rendue par l'API.
- **Le délai de première réponse** se mesure par les gestes de la famille 5 : ouvrir WhatsApp ou appeler depuis l'en-tête du fil est un geste de contact. Si le fil est rattaché à une demande, il est enregistré comme tel, quand la route de la famille 5 existe.
- Libellés neufs en `fr`/`en`/`wo` (`wo` = le français tel quel) ; vouvoiement. L'onglet s'appelle « Messages » (TCK-2618).

## Delta à produire

- [ ] Liste : la personne en titre, puces avec comptes, recherche (côté serveur, jamais sur la page chargée).
- [ ] Nouvelle conversation (une personne ou un groupe).
- [ ] Fil plein écran au téléphone, en-tête de la personne, appel et WhatsApp, « ⋯ ».
- [ ] Composeur : trombone et appareil photo, aperçus de pièces, réponses rapides du personnel.
- [ ] Bureau : colonne de contexte repliable, arrivée sur le non lu le plus récent, un seul titre.
- [ ] États vides par persona.
- [ ] Tests :
  - nom de la personne en titre d'un fil direct ;
  - `filter[search]` envoyé à la frappe (avec un délai) ;
  - puce « Groupes » qui envoie `filter[type]=group` ;
  - fil ouvert sans en-tête de coque ni onglets à 390 ;
  - toucher une personne qui a déjà un fil ouvre ce fil (pas de doublon) ;
  - pas d'appel sans téléphone dans le contexte ;
  - réponses rapides absentes pour un client ;
  - refus d'un PDF de 11 Mo avant l'envoi.

## Critères d'acceptation

- [ ] AC1 — À 390, la première ligne de la liste d'un agent dit « Malick Seck », et non « Maison avec jardin · Thiès », qui est en deuxième ligne.
- [ ] AC2 — Taper « thiès » dans la recherche envoie `filter[search]=thiès` (réseau) et laisse une seule ligne. Effacer rend la liste entière. *(Réécrit le 2026-11-11 : l'API replie la casse, pas les accents — TCK-2630 AC1, ADR-0020 § 2.)*
- [ ] AC3 — À 390, le fil ouvert occupe toute la hauteur, de `y = 0` jusqu'au composeur. Aucun `[data-slot=en-tete-mobile]` ni barre d'onglets n'est rendu, et le composeur reste visible clavier ouvert.
- [ ] AC4 — « Nouvelle conversation » → « Awa Ndiaye », qui a déjà un fil : le fil existant s'ouvre, et aucun `POST /api/conversations` ne part. Pour une personne sans fil, le premier envoi crée la conversation `direct` (une seule requête).
- [ ] AC5 — À 1280, l'arrivée sur `/app/messages` ouvre le fil non lu le plus récent. La colonne de contexte montre l'étape et le téléphone du client, et se replie.
- [ ] AC6 — Un client connecté : pas de réponses rapides, pas de bouton d'appel. Son état vide garde « Parcourir les annonces ».
- [ ] AC7 — Une photo envoyée apparaît en vignette dans la bulle, et l'aperçu de la liste dit « Photo ».

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), préparation : TCK-2684 → TCK-2691) :

- [ ] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2632.json` (modèle de TCK-2684) liste chaque écran de maquette implémenté (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés (vouvoiement, renommage décidé).
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9 — [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'[ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif : une des trois exceptions d'ADR-0106 § 2, ou une donnée.
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [ ] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une (visionneuse, `l=1280`), sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.

## Hors périmètre

- La recherche dans le texte des messages, le canal WhatsApp entrant (spec § 2.3, P3).
- Les réponses rapides réglées par l'agence.
- La mesure du délai de réponse elle-même (famille 5).

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_

**2026-11-12 — écran a-4 « Aucune conversation (agent) » aligné sur la maquette gelée** (contre-vérification : téléphone 6,27 % de pixels, bureau mis en page autrement). L'état vide vit dans `src/components/messages/EtatVideDeLaMessagerie.tsx` (`EmptyState variant="nue"`, icône 24 px au trait 1,5, rôles d'AC6 inchangés). Au téléphone, il occupe la liste, posé à 96 px du haut (`pt-24`), « Écrire à un client » en `size="xl"` (48 px). Au bureau (`dense`), la liste garde sa recherche éteinte (`opacity-50`, `aria-hidden`) et dit « La liste se remplira au premier message. » (`messaging.list.seRemplira`) ; le panneau du fil (`MessagesPage`, `comptes.all === 0`) porte l'état vide, et le personnel d'agence y lit « ou voir les demandes de contact » (`messaging.list.ouVoirLesDemandes`, lien `/app/leads`). Une liste FILTRÉE à zéro garde « Sélectionnez une conversation ». Relevé (réponse de `GET /api/conversations` réécrite vide dans le navigateur, rien d'écrit) : téléphone 29 conformes · 9 écarts · 0,35 % ; bureau 1440 2,2 %, 1280 2,36 %, l'état vide à ±1,1 px de la maquette, le reste dans la barre latérale (écart déjà accepté). Fiche : écran a-4 et deux écarts (`a-4-*` bordure transparente du bouton ; `a-4-bureau-*` boîte du texte de la recherche éteinte). Tests : `EtatVideDeLaMessagerie.tck-2632.test.tsx` (neuf), `ConversationList.tck-2632.test.tsx`, `ConversationList.test.tsx`, `MessagesPage.test.tsx` ; 4 ablations rouges.
