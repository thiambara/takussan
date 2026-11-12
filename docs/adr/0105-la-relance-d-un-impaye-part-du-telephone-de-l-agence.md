# ADR-0105 — La relance d'un impayé part du téléphone de l'agence ; Takussan la note et ne l'envoie pas

- **Statut** : Accepté le 2026-11-10 par le porteur (décision n° 13 (a) : *par WhatsApp, message prérempli*) — modalités : décisions de la session, à revoir ; **amendé le 2026-11-10** (la relance en lot entre dans le lot, comme une file guidée : cf. § *Amendement du 2026-11-10*) ; **amendé le 2026-11-12** (le lien de paiement n'est créé qu'à l'envoi, et le message nomme l'agence : cf. § *Amendement du 2026-11-12*)
- **Date** : 2026-11-10
- **Tickets** : TCK-2658 (API : relances journalisées), TCK-2660 (impayés : relancer sur WhatsApp), TCK-2682 (relance en lot, file guidée), TCK-2644 (liste des baux : « À traiter » et relance) ; la lisent : TCK-2624 (accueil de l'admin), TCK-2629 (onglet Impayés de Rapports)
- **S'appuie sur** : [ADR-0051](0051-lien-porteur-de-paiement-et-journal-des-webhooks.md) (lien porteur de paiement d'une échéance), [ADR-0032](0032-l-api-n-ecrit-plus-de-prose.md) (l'API n'écrit pas de prose)

## Contexte

Relevé sur `dev` (1bce3798a) le 2026-11-10 :

- **Il n'y a ni modèle, ni table, ni route de relance manuelle.**
- Les **rappels automatiques** existent : `SendLeasePaymentReminders`, à J-3, J+1 et J+7, chaque jour. Ils ne laissent qu'une trace, `metadata.reminder_{étape}_sent_at` sur l'échéance.
- Le **lien de paiement** d'une échéance existe ([ADR-0051](0051-lien-porteur-de-paiement-et-journal-des-webhooks.md), TCK-602) : `POST /api/lease-payments/{payment}/payment-link`, sous `LeasePaymentPolicy::update`. Aucune page de relance ne l'utilise.
- Deux familles de l'audit relancent : la famille 4 depuis la liste des baux, la famille 6 depuis les impayés d'« Argent ». Chacune s'apprêtait à écrire la sienne.

Le porteur a retenu le 2026-11-10 l'option (a) : *la relance se fait par WhatsApp, avec un message prérempli*.

## Décision

**Takussan n'envoie pas la relance manuelle. L'écran ouvre WhatsApp (ou l'appel) sur le téléphone de la personne de l'agence, message prérempli avec le lien de paiement de l'échéance. L'API note la relance. La lecture fusionne les relances notées et les rappels automatiques, en une seule source pour toutes les pages.**

1. **Le geste.**
   - « Relancer » ouvre `wa.me`, ou `tel:`, sur l'appareil de l'utilisateur.
   - Le message est prérempli dans la langue du **locataire** : le texte appartient au front (principe 5) et n'est **pas stocké**.
   - Il porte le lien porteur de paiement de l'échéance, créé ou repris par la route existante.
   - L'aide qui construit le lien `wa.me` est **partagée** : la boîte des demandes, les fiches d'agence (TCK-2576) et les deux pages de relance l'utilisent. Le premier ticket fusionné l'écrit.
2. **La note.** `LeasePaymentReminder` enregistre l'échéance, le canal (`whatsapp` ou `call`), l'auteur, la date et une note libre facultative de 500 caractères au plus.
   - Elle ne s'enregistre que sur une échéance de bail **due et non soldée** de l'agence de l'appelant, sous la même autorisation que le lien de paiement.
   - La route **enregistre un fait** : elle ne déclenche ni SMS, ni WhatsApp, ni e-mail.
3. **Une lecture unique.** Les relances d'une échéance se lisent par une seule route, qui fusionne :
   - les relances notées (`source: manual`, avec leur auteur) ;
   - les rappels automatiques (`source: automatic`, sans auteur), lus dans leur trace actuelle.

   La liste des baux, les impayés d'« Argent », l'accueil de l'admin et l'onglet Impayés de Rapports lisent **cette** route. Aucune ne tient sa propre trace.
4. **Le journal.** Chaque relance notée entre au journal d'audit de l'agence. Aucune coordonnée n'entre dans les journaux applicatifs (TCK-613).

## Conséquences

- **Zéro coût d'envoi** pour la plateforme. La relance part du numéro que le locataire connaît : celui de son agence.
- **Aucun accusé de lecture ni d'envoi n'est mesurable.** « Relancé » veut dire « WhatsApp a été ouvert », pas « message reçu » (même limite que les gestes de contact d'[ADR-0103](0103-le-pilotage-commercial-se-derive-des-gestes-et-des-faits.md) § 2). Aucun écran ne doit prétendre le contraire.
- **La relance en lot est une file guidée, pas un envoi** (amendement du 2026-11-10 ci-dessous) : WhatsApp s'ouvre une conversation à la fois, et la personne de l'agence envoie chaque message elle-même.
  - Un envoi par Takussan resterait un nouvel ADR : un numéro d'envoi, un coût par message, un consentement et des modèles validés. Il ne remettrait pas en cause la note : il écrirait la même ligne, avec `source: platform`.
- Les rappels automatiques gardent leur trace dans `metadata`. Les migrer vers la table est possible plus tard, mais pas nécessaire : la lecture les fusionne.

## Options écartées

- **L'envoi par Takussan**, par SMS ou par l'API WhatsApp : le coût par message, un numéro de plateforme que le locataire ne connaît pas, et une intégration que le produit n'a pas pour l'agence (celle du Radar sert un autre usage, [ADR-0081](0081-le-radar-prospecte-par-l-api-whatsapp-sur-son-propre-numero.md)). Écarté par la décision 13 (a).
- **Stocker le texte du message** : une prose dans la base, qui serait une seconde source du texte (principe 5), et qui pourrait contenir une donnée personnelle saisie à la main.
- **Une trace par page**, une pour les baux et une pour « Argent » : deux comptes de relances pour la même échéance, qui divergeront.

## Application

- Table et modèle `lease_payment_reminders`. `POST` et `GET /api/lease-payments/{payment}/reminders` (chemin indicatif, TCK-2658), sous `LeasePaymentPolicy::update`.
- L'aide `wa.me` partagée (front).
- Gardes :
  - « aucun envoi déclenché par la route », par un faux des canaux qui doit rester vide ;
  - « échéance soldée → 422 » ;
  - « autre agence → 403 » ;
  - « la lecture fusionne manuel et automatique, dans l'ordre des dates ».

## Amendement du 2026-11-10 — la relance en lot entre dans le lot, comme une file guidée

- **Ticket** : [TCK-2682](../backlog/tickets/todo/TCK-2682-relance-des-impayes-en-lot.md).
- **Décision du porteur** (2026-11-10, retour sur les points ouverts, n° 13) : *« Relance d'impayés en lot : dans le lot »*.

**Constat.** La version initiale renvoyait la relance en lot à un envoi par Takussan, écarté par la décision 13 (a). La maquette « Argent » montre pourtant « Relancer la sélection », et le porteur la veut dans ce lot.

**Décision.** Le lot reste fidèle au § 1 et au § 2 : **Takussan n'envoie toujours rien**.

1. L'agence coche des impayés, puis « Relancer la sélection » ouvre une **file** : une échéance à la fois, avec son message prérempli (dans la langue du locataire), son lien de paiement et « Ouvrir WhatsApp ».
2. Chaque ouverture de WhatsApp **note la relance de cette échéance** (`channel: whatsapp`), comme une relance unitaire. La file passe ensuite à l'échéance suivante ; « Passer » la saute sans rien noter.
3. Une échéance sans téléphone, ou dont le lien répond 409 (plus payable en ligne), est **sautée avec sa raison**, jamais retirée en silence ; le récapitulatif de fin le dit.
4. Le lien de paiement est demandé **échéance par échéance**, au moment où elle s'affiche, par la route existante : aucune route de lot n'est créée, et un lien n'est jamais créé pour une échéance qu'on n'a pas ouverte. *Amendé le 2026-11-12 : le lien n'est plus demandé à l'affichage, mais à l'envoi (cf. § Amendement du 2026-11-12, point 1).*
5. Le récapitulatif de fin compte les relances notées, les échéances passées et les sautées, avec leur raison.

**Ce qui ne change pas.** La note, la lecture unique (§ 3) et le journal (§ 4). Un envoi par Takussan reste un autre ADR.


## Amendement du 2026-11-12 — le lien de paiement n'est créé qu'à l'envoi, et le message nomme l'agence

- **Tickets** : [TCK-2660](../backlog/tickets/todo/TCK-2660-impayes-relance-whatsapp.md), [TCK-2682](../backlog/tickets/todo/TCK-2682-relance-des-impayes-en-lot.md) ; le message partagé sert aussi TCK-2639 (fiche bien) et TCK-2644 (liste des baux).
- **Décisions du porteur** (2026-11-12, soir) : n° 1 (a), *le lien de paiement n'est créé qu'à l'ENVOI de la relance, jamais à l'ouverture de la feuille : une lecture n'écrit pas* ; n° 3 (a), *le message nomme l'agence*. Le mécanisme ci-dessous est celui que back-4 a implémenté et éprouvé par ablation. Ce sont des décisions de la session, à revoir.

**Constat.** Le point 4 de l'amendement du 2026-11-10 demandait le lien « au moment où l'échéance s'affiche ». Le § 1 le disait « créé ou repris » sans dire quand. Les écrans demandaient donc le lien (`POST /api/lease-payments/{payment}/payment-link`) à l'ouverture de la feuille, du dossier ou d'une échéance de la file. Ce `POST` écrit : il crée un lien porteur ([ADR-0051](0051-lien-porteur-de-paiement-et-journal-des-webhooks.md)). Regarder un impayé créait donc un lien de paiement, même quand personne ne relançait.

**Décision.**

1. **Le lien se crée au geste d'envoi, et à lui seul.** Deux gestes créent le lien :
   - « Ouvrir WhatsApp » ;
   - « Copier » le lien.

   Aucun autre n'en crée :
   - l'ouverture de la feuille, du dossier ou d'une échéance de la file ;
   - « Passer » ;
   - « Appeler ».

   Le point 4 de l'amendement du 2026-11-10 est remplacé : la file ne demande plus le lien quand une échéance s'affiche.
2. **Le message attend son lien.** Il est composé avec un **repère** à la place du lien (« [lien de paiement ajouté à l'envoi] »). Au clic, « Ouvrir WhatsApp » fait quatre choses, dans cet ordre :
   - il **ouvre l'onglet au moment même de l'appui**, avant toute requête, par un `window.open('', '_blank')` synchrone. Le navigateur voit ainsi un geste de l'utilisateur, et non une ouverture différée ;
   - il crée le lien ;
   - il remplace le repère par l'URL. Un repère que l'agent a effacé laisse son texte tel quel ;
   - il pose l'adresse `wa.me` dans l'onglet déjà ouvert, puis note la relance (§ 2).
3. **Un 409 n'arrive qu'à l'envoi.** S'il arrive (l'échéance ne se paie plus en ligne), ou si la création du lien échoue, l'onglet ouvert à l'appui se referme et rien n'est noté. Dans la file, l'échéance est sautée avec sa raison (point 3 de l'amendement du 2026-11-10, inchangé).
4. **L'envoi abandonné ne laisse rien partir.** Si l'agent quitte l'échéance pendant la création du lien (« Passer », « Arrêter », feuille refermée), l'onglet ouvert d'avance se referme, et rien n'est noté : le lien revenu n'y est pas posé. Un second clic pendant la création, ou juste après l'ouverture, ne crée, n'ouvre ni ne note rien.
5. **L'onglet refusé.** Le repli ne sert que si le navigateur refuse **quand même** l'onglet ouvert à l'appui (`window.open` rend `null`). Dans ce cas, une fois le lien créé, un lien `wa.me` prêt remplace le bouton : « Touchez encore pour ouvrir WhatsApp ». C'est ce second appui qui ouvre et qui note.
   - **Non mesuré sur un vrai navigateur** : la part des navigateurs, Safari iOS en tête, qui refusent même un onglet ouvert de façon synchrone à l'appui. Le repli n'est éprouvé qu'en test.
6. **Le message nomme l'agence** (décision 3) : les gabarits finissent par « De la part de {agence}. », l'agence du profil actif.
   - L'aide qui compose le message reste **unique** (§ 1), donc les quatre écrans qui relancent (TCK-2660, TCK-2682, TCK-2639, TCK-2644) le disent ensemble.
   - Le texte reste au front (principe 5), et il n'est toujours pas stocké.

**Conséquences.**
- **Une lecture n'écrit plus.** Ouvrir les impayés, un dossier ou la file ne crée aucun lien. Les liens créés correspondent aux relances envoyées ou copiées.
- **« Copier » crée un lien qui peut ne jamais partir.** Copier n'est pas noter : la note ne suit que l'ouverture de WhatsApp (§ 2). Un lien copié et jamais collé reste un lien porteur valide jusqu'à son expiration, comme tout lien d'[ADR-0051](0051-lien-porteur-de-paiement-et-journal-des-webhooks.md).
- **WhatsApp attend une requête.** L'onglet s'ouvre à l'appui, mais WhatsApp n'y arrive qu'une fois le lien créé. C'est le prix du point 1. L'onglet ouvert d'avance évite le blocage d'une ouverture différée, et le repli du point 5 couvre le reste.

**Ce qui ne change pas.** Takussan n'envoie toujours rien. La note (§ 2), la lecture unique (§ 3), le journal (§ 4) et la file guidée (amendement du 2026-11-10, points 1 à 3 et 5) restent tels quels.
