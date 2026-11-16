---
id: TCK-2860
title: "Messagerie : la colonne et la feuille de contexte avec projet, dernière visite, premier contact et demande de contact ; « ⋯ » avec Marquer comme non lue, Ajouter un participant, Signaler ; la double coche « Lu » ; le rôle de l'auteur ; le contexte ouvrable entre 1024 et 1279"
status: done
phase: P1
family: front
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-16
depends_on: [TCK-2858, TCK-2859]
blocks: []
spec_refs:
  features:
    - "docs/features.md#17-communication--messagerie"
    - "docs/features.md#16-crm--relation-client"
  models: []
tags: [front, messagerie, contexte, audit-ux, app]
---

## Objectif utilisateur

L'agent qui répond lit, à côté du fil et à toutes les largeurs, ce qu'il doit savoir du client ; il voit ce qui a été lu, qui parle dans un groupe, et dispose des gestes de la maquette sur la conversation.

## Contrat de données

- Contexte enrichi (`customer.project`, `last_visit`, `first_contact_at`, `origin`, `contact_lead`), `sender.role_label_code`, `read_by_recipient` : **livrés par TCK-2858**.
- `PUT …/unread`, `POST …/reports`, ajout à un fil direct : **livrés par TCK-2859**.
- Sourdine : `PUT conversations/{c}/mute` (existe).

Relevé (audit-f3-coque.md, app-messagerie e0, e1, e2, e5 ; « Écarts couverts par les fiches » 1 à 4 et 8) : `ColonneDeContexte.tsx:148-206` (client : téléphone, agent ; lié : bail, intervention), `:56-84` repliée sans l'icône de la demande ; `FeuilleDuFil.tsx:86-210` sans demande ni « Signaler » ; menu `EnTeteDuFil.tsx:282-317` réduit à la sourdine ; `ChatView.tsx:591-595` nom seul, `:616-623` heure seule ; **entre 1024 et 1279 px, le contexte d'un fil direct est inaccessible** (`ColonneDeContexte.tsx:62, 92` `max-xl:hidden`, bascule `hidden xl:inline-flex`, feuille réservée à `< lg`).

## Direction UX / Artistique

**Référence de fidélité** — `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-messagerie.tsx`, approche a :

- **e0 « Liste »** et **e2 « Contexte »**, **bureau** — colonne : fiche client avec « Projet » (« Achat · jusqu'à 70 M F »), « Dernière visite » (« Aucune encore »), « Premier contact » (« lun. 9 nov., par l'annonce ») (l. 549-551) ; « Lié à cette conversation » avec « Demande de contact du 9 nov. » (l. 573).
- **e1 « Fil »**, **bureau** — colonne repliée : l'icône « Demande de contact liée » (l. 599).
- **e1** et **e5**, **les deux formats** — double coche « Lu » sur mes messages lus (l. 211) ; **e5 « Groupe et note vocale »** : l'auteur « Fatou Wade · locataire » (l. 103).
- **e2**, **bureau** — menu « ⋯ » : Mettre en sourdine, **Marquer comme non lue**, **Ajouter un participant**, séparateur, **Signaler la conversation** en rouge (l. 487-498).
- **e2**, **téléphone** — feuille du fil : « Demande de contact du 9 nov. » / « Par l'annonce de la … », « Mettre en sourdine », **« Signaler la conversation »** en rouge (l. 696-699).
- **e5**, **bureau** — en-tête du groupe : bouton « Mettre en sourdine » direct (l. 951).
- **1024 – 1279 px** : « à 1024 le bouton du panneau l'ouvre » (maquette l. 1047) : le bouton de bascule et le panneau de contexte (superposé si la place manque) existent dès `lg`.

## Contraintes strictes (métier)

- Les blocs de contexte absents ne laissent ni titre vide ni « — » : la ligne ne se rend pas (sauf « Dernière visite : Aucune encore », que la maquette écrit).
- « Signaler » ouvre une confirmation avec motif ; succès → message « Conversation signalée » ; déjà signalée → le dire.
- « Ajouter un participant » sur un fil direct explique qu'un **nouveau groupe** est créé (ADR de TCK-2859) puis ouvre ce groupe.
- Le rôle s'affiche à partir du code (`role_label_code`) par next-intl (principe 5).
- Libellés neufs en `fr`/`en`/`wo`, `wo` = le texte français tel quel ; vouvoiement.

## Delta à produire

- [ ] Colonne, colonne repliée et feuille de contexte enrichies.
- [ ] Menu « ⋯ » (bureau) et feuille (téléphone) avec les trois gestes.
- [ ] Double coche « Lu » ; rôle de l'auteur dans les groupes ; sourdine directe dans l'en-tête de groupe.
- [ ] Contexte ouvrable entre 1024 et 1279.
- [ ] Tests : lignes Projet / Dernière visite / Premier contact ; demande liée et son lien ; « Marquer comme non lue » appelle `unread` et la pastille revient ; « Signaler » appelle `reports` ; coche « Lu » ; « Fatou Wade · locataire » ; à 1100 px, le bouton de contexte ouvre le panneau.

## Critères d'acceptation

- [ ] AC1 — À 1440, fil d'un client : la colonne rend « Projet », « Dernière visite », « Premier contact » et « Demande de contact du {date} » (lien vers la demande).
- [ ] AC2 — À 1100 × 800, fil direct ouvert : un bouton « Contexte » (ou l'icône du panneau) est visible et ouvre le contexte du client.
- [ ] AC3 — « ⋯ › Marquer comme non lue » : le fil reprend sa pastille non lue dans la liste, et le compteur « Non lus » augmente.
- [ ] AC4 — À 390, la feuille du fil contient « Signaler la conversation » ; le geste, confirmé, envoie le signalement.
- [ ] AC5 — Mon message lu par le destinataire porte l'icône « Lu » ; non lu, il ne la porte pas.
- [ ] AC6 — Dans le groupe « Fuite sous évier », la bulle de Fatou Wade est signée « Fatou Wade · locataire ».
- [ ] AC7 — Vérifier au navigateur (audit, non vérifiables) : colonne de contexte quand `/context` rend bail **et** intervention, et quand le fil est celui d'un non-personnel (pas de fiche client) — corriger si la colonne casse.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md)) :

- [ ] AC-F1 — Fiche `docs/qa/audit-ux-2026-11/fidelite/TCK-2860.json` : app-messagerie e0, e1, e2, e5, téléphone et bureau, **plus une mesure à 1024** (aucune fiche ne mesurait 1024-1279).
- [ ] AC-F2 — Zéro écart non expliqué ; aucun des éléments ci-dessus n'est rangé en « donnée ».
- [ ] AC-F3 — À 1024 et 768 : `scrollWidth − innerWidth = 0`.

## Hors périmètre

- La bulle de note vocale, « Charger les messages précédents », la nouvelle conversation : TCK-2861.

## Notes d'implémentation

Implémenté le 2026-11-15 (agent délégué, arbre `takussan-manques`, sans navigateur).

**Prémisse re-mesurée** : conforme (`ColonneDeContexte` sans projet/visite/premier contact/demande, `max-xl:hidden` et bascule `hidden xl:inline-flex` ; menu `EnTeteDuFil` réduit à la sourdine ; feuille sans demande ni « Signaler » ; bulle : nom seul, heure seule). Les lignes citées ont glissé de quelques unités (TCK-2861 est passé dans `ChatView`).

**Livré** :
- Types front (`types/message.ts`) : `Message.read_by_recipient`, `read_count`, `sender.role_label_code` (`RoleDeLAuteur`), `Conversation.last_message.sender_id`, et `customer.project | last_visit | first_contact_at | origin | contact_lead` du contexte — tous facultatifs (une réponse d'avant TCK-2858 garde le rendu d'avant).
- **Accueil du client (TCK-2853)** : `ReponseRecue` ne rend plus « X vous a répondu » quand `last_message.sender_id` est le client lui-même.
- **Colonne de contexte** : « Projet » (contrat · budget abrégé, à défaut les lieux), « Dernière visite » (« Aucune encore » seulement si la fiche est lisible — `first_contact_at` posé), « Premier contact » (« lun. 9 nov., par l'annonce »), « Demande de contact du 9 nov. » en lien `/app/leads?lead={id}` (cible P97.04) ; rail replié : icône « Demande de contact liée ».
- **1024-1279** : le bouton du panneau est visible dès `lg` ; entre `lg` et `xl`, un état à part (fermé d'office, refermé au changement de fil) ouvre le contexte — ou « Infos du groupe » — en panneau superposé à droite (`absolute`, 320 px), sans rail. Dès `xl`, inchangé.
- **Menu « ⋯ » (bureau)** : sourdine, « Marquer comme non lue », « Ajouter un participant » (fil direct), séparateur, « Signaler la conversation » en rouge. **Feuille (téléphone)** : demande liée (« Par l'annonce « … » »), puis après la sourdine les trois gestes (écart à la maquette noté dans la fiche : le Delta veut les trois gestes aux deux formats). Les gestes ne sont passés que par la page (`gestes` de `ChatView`) : le widget flottant garde son menu d'avant, et les dialogues (`GestesDuFil.tsx`) restent hors de son graphe d'imports.
- **Signaler** : motif codé obligatoire + commentaire ≤ 500 ; « Conversation signalée » dit DANS le dialogue (pas de toast) ; 409 `conversation.already_reported` → « Vous avez déjà signalé cette conversation. ».
- **Ajouter un participant** (direct) : le dialogue dit qu'un nouveau groupe est créé sans l'historique, liste `GET …/contacts` de la directe (l'autre partie et soi exclus), `POST …/participants` → 201 → le groupe s'ouvre ; bouton inactif pendant l'envoi (ADR-0114 : un double envoi ferait deux groupes) ; 422 dit ses phrases. Hook distinct `useElargirLeFilDirect` (la réponse n'est pas celle de `useAddParticipants`).
- **Non lue** : `useMarkConversationUnread` (`PUT …/unread`) invalide `['conversations','list']` (pastille, compteur « Non lus ») et le détail. Le fil reste ouvert : `useMarkConversationRead` ne le remarque lu qu'au prochain message ou à la réouverture.
- **« Lu »** : double coche sur MES messages — direct `read_by_recipient === true`, groupe `read_count > 0` (règle notée dans la fiche). Le relevé `after_id` ne rafraîchit pas la coche (reste de TCK-2858) : tant que MON dernier message est non lu, `ChatView` relit le fil toutes les 15 s (onglet visible), et s'arrête à la coche.
- **Rôle de l'auteur** : « Fatou Wade · locataire » par `messaging.chat.role.<code>` (codes `tenant|owner|service_provider|agent|agency_admin|customer`) ; code nul ou inconnu → le nom seul.
- **Groupe au bureau** : la sourdine en bouton direct dans l'en-tête (maquette e5, l. 951).

**Restes de TCK-2861 soldés** : `NewGroupDialog.tsx` et son test supprimés (plus aucun geste ne l'ouvrait) ; `NouvelleConversation` reçoit `groupePossible: boolean` au lieu du rappel `onNouveauGroupe` jamais appelé (trois fichiers de test adaptés) ; `MessagesPage.test.tsx` ne simule plus « Créer un groupe → NewGroupDialog » ; clés orphelines retirées par l'outil (`messaging.group.create.{back,next,leaseLabel,propertyLabel,participantsLabel,subjectLabel,step1Description,step2Description}`, `messaging.voiceNote.duration`). Fiche `TCK-2632.json` : les quatre écarts « donnée » que ce ticket lève sont retirés (AC-F2).

**Tests dont l'attente change (voulu)** : `EnTeteDuFil.tck-2632` (le bouton du contexte n'est plus `hidden xl:inline-flex`) ; `MessagesPage.test` (« propose le groupe » vérifie le drapeau, plus l'ouverture de `NewGroupDialog`).

**Ablations** (une à une, restaurées par `cp`, md5 vérifié) : garde `sender_id` de l'accueil ; « Aucune encore » sans lisibilité ; rail en mode superposé ; lien de la demande ; règle de la coche ; signature du rôle ; relecture de la coche (absente / inconditionnelle) ; panneau superposé à 1100 ; bouton inactif pendant l'élargissement ; 409 ; « Ajouter » d'un groupe (menu et page) ; sourdine du groupe ; motif obligatoire — toutes rouges.

**Non mesuré (lot sans navigateur)** : AC7 (colonne avec bail **et** intervention ; fil d'un non-personnel) — lu dans le code : les deux liens se rendent l'un sous l'autre, et sans `customer` aucune ligne neuve ne paraît ; AC-F1 à AC-F3 — fiche `docs/qa/audit-ux-2026-11/fidelite/TCK-2860.json` écrite à la lecture, `releve_le: null`. Écart restant noté : la ville du bien n'est pas dans `/context`.
