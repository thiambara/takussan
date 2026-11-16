---
id: TCK-2880
title: "Après la visite et « Et maintenant ? » : dicter la note, la carte « Avant cette visite », « Voir le bien » et « Ouvrir la fiche » au bureau, « 1ʳᵉ visite · Prospect », la question « Passer en Qualifié ? · Plus tard · Oui » et la relance du lendemain sans choix"
status: done
phase: P1
family: front
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-16
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
    - "docs/features.md#16-crm--relation-client"
  models:
    - "docs/models-spec.md#17-propertyvisit-"
    - "docs/models-spec.md#33-customernote-"
tags: [front, visits, compte-rendu, crm, dictee, fil-commercial, audit-maquettes-2026-11-15]
---

## Objectif utilisateur

Juste après la visite, l'agent dicte sa note au lieu de la taper, revoit d'un coup d'œil ce qui s'est passé avant (la demande, sa réponse), et à « Et maintenant ? » répond à une question simple — passer le client en Qualifié, oui ou plus tard ; s'il ne choisit aucune suite, la relance du lendemain se pose seule.

## Contexte

Audit des maquettes de `/app` du 2026-11-15, famille commerciale (`audit-f5-commercial.md`, app-fil-commercial e4 et e5 ; app-visites e4 ; point 5 de la synthèse).

**Décision du porteur (2026-11-15) sur le compte rendu de visite** : « valide celui qui est implémenté si une maquette le confirme ». Le produit suit la maquette du fil commercial (`app-fil-commercial`, deux étapes « Après la visite » puis « Et maintenant ? », `?etape=compte-rendu` → `?etape=et-maintenant`), qui le confirme : **c'est elle qui fait foi**. L'écran unique de `app-visites` e4 (un seul écran qui défile, « 1 Son verdict · 2 Ce qui a pesé · 3 Un mot », bouton « Enregistrer et envoyer l'invitation », « Épinglé à la fiche de {prénom} », « Un choix suffit… », titre « Visite terminée — compte rendu à faire ») **est abandonné** : ses éléments propres ne sont pas ticketés.

Ce que la maquette qui fait foi dessine et qui manque — vérifié dans ses fichiers :

- « Dicter » sous la note (`NoteDictee`, `app-fil-commercial-a-suite.tsx:101-111`, utilisée l. 148 et 353) — exclue sans ticket par la fiche de TCK-2581 ;
- la carte « Avant cette visite » au bureau (l. 335-339, `FilAvantVisite`) ;
- « Voir le bien » et « Ouvrir la fiche de {prénom} » dans l'en-tête du bureau (l. 284-285) ;
- « {téléphone} · 1ʳᵉ visite · Prospect » sur la carte du visiteur (l. 329) ;
- « Passer en Qualifié ? · Prospect → Qualifié · Plus tard · Oui » (`PasserEnQualifie`, l. 220-238), que le produit a remplacé par un interrupteur et « Terminer » au nom de l'écran app-visites e4 désormais abandonné ;
- « Chaque choix s'écrit dans le fil de la fiche. Sans choix, une relance est proposée demain dans « Aujourd'hui ». » (l. 246).

## Contrat de données

- `GET /api/customers/{customer}/timeline?types=note,contact,visit` (existant, TCK-2589) : notes `lead_message`, gestes de contact, jalons de visite — pour « Avant cette visite », bornés à la date de la visite.
- Étape : `PATCH /api/customers/{customer}/pipeline-stage` (Oui), `POST /api/customers/{customer}/suggested-stage/dismiss` (Plus tard) — existants (TCK-2591).
- Relance : la création de tâche qu'utilise déjà « Relancer dans N jours » (`EtMaintenant.tsx`).
- Rang de la visite (« 1ʳᵉ visite ») : déjà rendu sur la carte du bien du compte rendu (« avec {nom} · Nᵉ visite »).

## Direction UX / Artistique

**Référence de fidélité** : maquette `app-fil-commercial`, approche **a** — fichier `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-fil-commercial-a-suite.tsx` ; écrans **e4 Après la visite (compte rendu)** et **e5 Et maintenant ?** ; téléphone et bureau.

- **Téléphone (390)** — manque : e4, le bouton « Dicter » et « 0:14 dictées · modifiable » sous la note ; e5, en bas, la question « Passer en Qualifié ? » avec « Plus tard » et « Oui » à la place de l'interrupteur et de « Terminer » ; la phrase « Sans choix, une relance est proposée demain dans « Aujourd'hui » ».
- **Bureau (1440)** — manque, en plus : la carte « Avant cette visite » dans la colonne gauche (demande reçue avec le message cité → réponse WhatsApp → visite confirmée, datés) ; « Voir le bien » et « Ouvrir la fiche de {prénom} » dans l'en-tête (au lieu du seul « Plus d'actions ») ; « 1ʳᵉ visite · Prospect » sous le téléphone du visiteur.
- La dictée suit la même solution que la dictée de l'état des lieux (TCK-2903) : reconnaissance vocale **du navigateur** (`SpeechRecognition` / `webkitSpeechRecognition`), texte ajouté à la fin de la note, bouton absent du DOM si l'API manque, langue de l'interface (`wo` → `fr-FR`).

## Contraintes strictes (métier)

- [ADR-0101](../../../adr/0101-le-fil-commercial-vit-dans-la-fiche-client.md) (compte rendu interne, recopié en note épinglée) ; [ADR-0103](../../../adr/0103-le-pilotage-commercial-se-derive-des-gestes-et-des-faits.md) § 5 (« Oui » est le geste de l'agent ; « Plus tard » écarte la proposition pour ce fait).
- La question n'apparaît que si une étape est proposée ; sinon rien (pas d'interrupteur résiduel).
- **« Passer » sans suite choisie crée une tâche « Relancer {prénom} » échue demain** (décision prise à l'écriture du ticket : la maquette dit « proposée », et `CustomerFollowUpQuery` ne connaît pas ce motif ; la tâche est la seule mécanique existante qui fait paraître une relance dans « Aujourd'hui »). Un toast « Relance posée pour demain · Annuler » la retire.
- « Avant cette visite » n'est rendue que si la visite a une fiche client et au moins un fait antérieur ; une seule requête.
- i18n `fr`/`en`/`wo`.

## Delta à produire

- [ ] Dictée de la note du compte rendu (téléphone et bureau).
- [ ] Carte « Avant cette visite » (bureau).
- [ ] En-tête bureau : « Voir le bien », « Ouvrir la fiche de {prénom} ».
- [ ] Carte du visiteur : rang de visite et étape.
- [ ] « Et maintenant ? » : question Plus tard / Oui ; phrase d'aide ; « Passer » qui pose la relance de demain.
- [ ] Tests de composant : dictée ajoutée à la note, bouton absent sans API ; carte « Avant » ordonnée et bornée à la visite ; Oui appelle le changement d'étape, Plus tard le refus ; Passer crée la tâche J+1, Annuler la supprime.

## Critères d'acceptation

- [ ] AC1 — À 390, sur un navigateur qui expose `webkitSpeechRecognition`, le compte rendu porte « Dicter » ; une dictée qui reconnaît « trouve la douche petite » s'ajoute à la fin de la note ; sans l'API, le bouton n'est pas dans le DOM.
- [ ] AC2 — À 1440, la visite de Mouhamed (née d'une demande du 2 nov. avec réponse WhatsApp le 3) montre « Avant cette visite » avec ces trois faits datés et le message cité ; une visite sans fiche client ne montre pas la carte.
- [ ] AC3 — À 1440, l'en-tête de la visite terminée porte « Voir le bien » (→ fiche du bien) et « Ouvrir la fiche de Mouhamed » (→ `/app/customers/{id}`).
- [ ] AC4 — À 390, « Et maintenant ? » d'un client Prospect montre « Passer en Qualifié ? · Prospect → Qualifié » avec « Plus tard » et « Oui » ; « Oui » passe la fiche en Qualifié ; aucun interrupteur n'est rendu.
- [ ] AC5 — « Passer » sans suite choisie crée une tâche « Relancer Mouhamed » échue demain, visible le lendemain dans « Aujourd'hui » ; « Annuler » du toast la supprime.

**Fidélité** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md)) :

- [ ] AC-F1 — Fiche `docs/qa/audit-ux-2026-11/fidelite/TCK-2880.json` : écrans e4 et e5 de `app-fil-commercial` (a), téléphone et bureau ; `app-visites` e4 y est déclaré **abandonné par décision du porteur du 2026-11-15**.
- [ ] AC-F2 — `fidelite compare` à 390 × 844 et 1440 × 900 sans écart non expliqué.
- [ ] AC-F3 — Aucun libellé ni icône de e4/e5 absent sans motif.

## Hors périmètre

- Les éléments propres à `app-visites` e4 (abandonnés, voir Contexte).
- Une note vocale enregistrée (fichier audio) : la dictée produit du texte.

## Notes d'implémentation

**2026-11-15 — implémenté (vague 92), front seul.**

- **Dictée** : un mécanisme partagé, écrit ici pour TCK-2903 — `lib/dictee.ts` (constructeur `SpeechRecognition` / `webkitSpeechRecognition`, langue `fr-FR`/`en-US`, `wo` → `fr-FR`, `ajouterALaNote` borné à 2000, codes d'erreur) et `hooks/useDictee.ts` (disponibilité par `useSyncExternalStore`, faux au serveur : bouton absent du DOM sans l'API ; écoute, durée cumulée, arrêt au démontage). Rendu sous la note du compte rendu, dans la même boîte (`NoteDictee` de la maquette) : « Dicter », « J'écoute… », « 0:14 dictées · modifiable », erreur sous le champ (espace i18n `dictee.erreurs`, réutilisable par TCK-2903).
- **« Et maintenant ? »** : l'interrupteur et « Terminer » sont retirés. La question `PasserEnQualifie` n'est rendue que si l'API propose « Qualifié » : `suggested_stage` est désormais lu au show de la fiche — ajouté à `ATTRIBUTS_CALCULES_DE_LA_FICHE` (seule exception de `show-sans-fields.garde`), la fiche client le reçoit aussi. « Oui » = `PATCH …/pipeline-stage` (relu avant d'écrire, comme avant) ; « Plus tard » = `POST …/suggested-stage/dismiss` avec le `reason` de l'API (un 409 retire aussi la question). **Choisir une suite n'écrit plus l'étape** (ADR-0103 § 5 : « Oui » est le geste de l'agent).
- **« Passer »** (en-tête du téléphone, maintenant un bouton) : sans suite choisie et avec fiche, `POST /api/tasks` « Relancer {prénom} » échue demain 09:00 (Dakar), puis `follow_up = remind` sur le compte rendu — c'est ce qui empêche un second « Passer » de reposer la tâche ; toast « Relance posée pour demain · Annuler » (Annuler : `DELETE /api/tasks/{id}` puis `follow_up = null`).
- La phrase « Sans choix, une relance est proposée demain dans « Aujourd'hui » » n'est dite qu'au téléphone avec fiche : au bureau, aucun « Passer » ne la pose.
- **Bureau** (même condition partout : personnel et compte rendu à droite, `apresLaVisite`) : en-tête « Voir le bien » (→ `/app/properties/{id}`, la fiche du bien du back-office ; le lien public de la carte du bien est retiré dans cette disposition pour ne pas doubler) et « Ouvrir la fiche de {prénom} » ; carte du visiteur « {téléphone} · 1re visite · Prospect » (la pastille de rang et la ligne « Étape » ne s'y répètent plus) ; carte « Avant cette visite » sous le visiteur (`AvantCetteVisite`), au seul personnel actif de l'agence (`ficheClient`) et avec fiche client.

- **La question ne lit que l'API** : la réponse de l'écriture ne sait pas qu'un « Plus tard » l'a écartée (sinon elle revenait au remontage, pendant la relecture de la fiche) — elle paraît donc après la relecture de la fiche.
- **Décision à trancher** : « Passer » trace aussi `follow_up = remind` (le ticket ne le demande pas) pour qu'un second « Passer » ne repose pas la tâche ; « Annuler » le remet à `null` (vérifié : `VisitReportService` écrit le null, `TaskPolicy::delete` permet au créateur).

**Prémisses qui différaient**
- Le contrat cite `GET …/timeline?types=…` : le paramètre réel est `filter[type]=note,contact,visit`. Une requête, `per_page=50` ; la borne (début prévu de la visite) et le tri des seules notes `lead_message` se font au front, l'ordre est celui de l'API.
- « Plus tard » exige le `reason` exact de la proposition courante : il n'était lisible nulle part côté écran (d'où l'ajout de `suggested_stage` au show).
- « Visite confirmée, SMS envoyé » : le fil ne dit pas si le SMS est parti — libellé du fil de la fiche (« Visite confirmée · {rendez-vous} »).

**Tests** : `compte-rendu.tck-2880.test.tsx` (14) ; `compte-rendu.tck-2581.test.tsx` réécrit sur la question (l'interrupteur n'existe plus) ; `fiche-du-client.tck-2589.test.ts` (le champ ajouté). Ablations rouges : append de la dictée, disponibilité forcée, borne de « Avant », étape écrite par une suite, « Passer » sans tâche.

**Non mesuré** : AC-F2 (pas de relevé au navigateur pour ce lot) ; AC5 « visible le lendemain dans Aujourd'hui » repose sur la mécanique existante des tâches échues, non rejouée ici.
