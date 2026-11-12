---
id: TCK-2682
title: "Impayés : relancer une sélection, une conversation WhatsApp après l'autre, dans une file guidée"
status: todo
phase: P2
family: front
estimate: M
wave: 90
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2660, TCK-2684, TCK-2687, TCK-2688, TCK-2689, TCK-2691]
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#125-leasepaymentreminder-"
    - "docs/models-spec.md#84-leasepaymentlink-"
tags: [front, finances, relance, whatsapp, mobile, audit-ux, app]
---

## Objectif utilisateur

Le 5 du mois, l'admin a douze loyers en retard. Il les coche, appuie sur « Relancer la sélection », et
enchaîne les douze relances WhatsApp sans revenir à la liste entre deux : chaque message est prêt, il
l'envoie, Takussan passe au suivant et garde la trace.

## Contrat de données

Rien de neuf côté API : la file réutilise, échéance par échéance, les routes de la relance unitaire
(TCK-2660) :

- `POST /api/lease-payments/{payment}/payment-link` → `{url, expires_at}` ; 409 si l'échéance n'est plus payable en ligne ;
- `POST /api/lease-payments/{payment}/reminders {channel: whatsapp}` et `GET …/reminders` (TCK-2658) ;
- la liste des impayés et ses filtres serveur (TCK-2657, TCK-2660).

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=app-argent&a=a` — **référence de fidélité, non
  versionnée**, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes)
  — écran « Impayés et relance », action « Relancer la sélection ». La maquette ne dessine pas la file :
  elle reprend la feuille de relance unitaire de TCK-2660, avec un en-tête « 3 sur 12 ».
- **Sélection** : une case par impayé (cible ≥ 44 px au téléphone), « Tout sélectionner » sur la page
  filtrée, et une barre d'action collante « Relancer la sélection (12) ».
- **La file** : la feuille de relance de TCK-2660 (montant, période, retard, message prérempli
  modifiable, lien de paiement), plus l'en-tête « 3 sur 12 », « Ouvrir WhatsApp » (primaire),
  « Passer », et « Arrêter ». Au retour de WhatsApp, la feuille montre l'échéance suivante.
- **Fin** : un récapitulatif — relancés, passés, sautés avec leur raison — puis retour à la liste,
  où chaque carte relancée porte « relancé aujourd'hui ».
- **Téléphone (360-390 px)** : la file est une feuille plein écran ; « Ouvrir WhatsApp » reste visible
  sans défiler. **Bureau (≥ 1280 px)** : la file vit dans le panneau latéral de TCK-2660 ; la liste
  reste visible à gauche, l'échéance en cours y est surlignée. Panneau et colonnes dès `lg`.

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0105](../../../adr/0105-la-relance-d-un-impaye-part-du-telephone-de-l-agence.md) (amendement du 2026-11-10 — la relance en lot est une file guidée).

- **Takussan n'envoie rien** : chaque message part du WhatsApp de l'admin, ouvert par `wa.me`, et
  c'est lui qui l'envoie. Aucune route d'envoi, aucun envoi en arrière-plan.
- **Une relance notée par ouverture** : « Ouvrir WhatsApp » note la relance de **cette** échéance
  (`channel: whatsapp`) ; « Passer » ne note rien.
- **Le lien de paiement se demande au moment où l'échéance s'affiche**, jamais en lot à l'ouverture
  de la file (un lien n'est créé que pour une échéance réellement présentée).
- **Rien n'est retiré en silence** : une échéance sans téléphone, ou dont le lien rend 409, est
  sautée avec sa raison affichée dans la file et comptée au récapitulatif.
- Le message prérempli est celui de TCK-2660 (vouvoiement, dans la langue du locataire), et **la même
  aide** construit le lien `wa.me` (ADR-0105 § 1 : une seule aide).
- « Arrêter » garde les relances déjà notées et rend la liste, sélection intacte pour reprendre.
- Aucun « Lu le … », aucun « envoyé » : « relancé » veut dire « WhatsApp a été ouvert » (ADR-0105).
- i18n : libellés neufs en `fr` / `en` / `wo` (le `wo` porte le texte français tel quel), vouvoiement.

## Delta à produire

- [x] Sélection multiple des impayés et barre « Relancer la sélection (n) ».
- [x] File guidée : en-tête de position, feuille réutilisée, « Ouvrir WhatsApp », « Passer », « Arrêter ».
- [x] Sauts motivés (pas de téléphone, 409) et récapitulatif de fin.
- [x] Tests : file de 3 échéances (dont une sans téléphone et une à 409) → 1 `wa.me` ouvert, 1 `POST …/reminders`, 2 sauts motivés ; les liens de paiement ne sont demandés qu'aux échéances affichées ; « Passer » ne poste rien ; « Arrêter » garde la sélection.

## Critères d'acceptation

- [x] AC1 — Sélectionner 3 impayés puis « Relancer la sélection » : le réseau montre **un seul** `POST …/payment-link` avant la première « Ouvrir WhatsApp », et pas les trois.
- [x] AC2 — Sur la file de 3 (une normale, une sans téléphone, une à 409), le récapitulatif dit « 1 relancé · 0 passé · 2 sautés » et nomme les deux raisons ; un seul `POST …/reminders` est parti.
- [x] AC3 — Aucune requête vers une route d'envoi de message (SMS, WhatsApp de la plateforme) n'apparaît au réseau pendant la file.
- [x] AC4 — À 390 px, « Ouvrir WhatsApp » est visible sans défiler sur chaque échéance de la file ; à 1280 px, la liste reste visible à côté de la file.
- [x] AC5 — Après la file, les cartes des échéances relancées portent « relancé aujourd'hui » sans rechargement, et les autres non.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), préparation : TCK-2684 → TCK-2691) :

- [x] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2682.json` (modèle de TCK-2684) liste chaque écran de maquette implémenté (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés (vouvoiement, renommage décidé).
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9 — [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'[ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif : une des trois exceptions d'ADR-0106 § 2, ou une donnée.
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [x] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une (visionneuse, `l=1280`), sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.

## Hors périmètre

- Un envoi par Takussan (SMS, API WhatsApp) : un autre ADR, ADR-0105.
- Le lot depuis la liste des baux (TCK-2644) : un autre ticket s'il le faut.

L'onglet Impayés de Rapports (TCK-2629) monte **le même composant** Impayés (décision du porteur du 2026-11-10, point 14 a) : la sélection et la file y sont donc présentes sans travail de plus.

## Notes d'implémentation

**Fichiers** (`takussan-web/src/components/admin/finances/impayes/`) :

- `selection.ts` (neuf) : `useSelectionDesImpayes`, qui garde des **lignes** (`Map<id, PaymentHistoryRow>`) et non des identifiants : une échéance cochée puis sortie de l'affichage garde son nom, son montant et son téléphone pour la barre et la file. `ordreDeLaFile` trie par retard décroissant, puis par `id`. `useEcheancesAffichees` lit les pages montrées dans le cache de React Query (`useSyncExternalStore`, avec une chaîne d'identifiants pour instantané stable).
- `FileDeRelance.tsx` (neuf) : l'état de la file (`useFileDeRelance`), le bilan, et le panneau (`PanneauDroit formulaire` : plein écran sous `xl` avec pied collant, 480 px non modal dès `xl`).
- `SelectionDesImpayes.tsx` (neuf) :
  - `BarreDeSelection`, la barre sombre du bureau ;
  - `TeteDeSelection`, la tête de liste sous `lg`, avec la barre collante `BarreDAction` du téléphone.
- Fichiers modifiés :
  - `TableDesImpayes.tsx` : colonne de coche, rangée cochée et rangée présentée surlignées ;
  - `CarteDImpaye.tsx` : case de 44 px en mode sélection ;
  - `Impayes.tsx` : branchement ;
  - `useRelanceDUnImpaye.ts` : `noterLaRelance` rend une promesse ;
  - `RelanceDUnImpaye.tsx` : `onOuvert(note)`.

**Pourquoi pas la `BarreDeSelection` des visites (TCK-2587).** Elle porte les gestes des visites (« Confirmer (n) », « Attribuer ▾ », les heures) et leur clé de traduction. Seul le fond `bg-foreground` serait commun : la barre des impayés suit sa propre maquette.

**Trois pièges, chacun tenu par un test ou un relevé :**

1. **L'avance se fait APRÈS le clic** (`setTimeout` 0), et chaque pas a sa propre ancre (`key` = id). Le navigateur suit un lien après le gestionnaire ET ses microtâches, où React valide le rendu. Mesuré le 2026-11-12 par un vrai clic (CDP), une file de trois locataires aux numéros différents, liens en cache au second tour (`parcours` : scratchpad `terrain-5/2682/fid/ancre-app.mjs`) :
   - le code tel quel : l'`href` suivi est celui de la rangée présentée ;
   - sans le délai ni la `key` (A8) : l'`href` suivi est celui du locataire **suivant**, mauvais destinataire ;
   - sans le délai, avec la `key` (A9) : l'ancre est détachée et garde son `href`, et une ancre détachée navigue encore vers son `href` (mesuré à part : `ancre-principe.mjs`).

   Chacune des deux gardes suffit, et les deux restent.
2. **La note de chaque échéance est suivie par sa propre promesse** (`mutateAsync`). `isError` ne dit que la dernière mutation, et les rappels de `mutate` se perdent dès que la note suivante part. Une note revenue AVANT l'avance garde son issue. Ablation A2 : sans cette garde, « relance non notée » disparaît.
3. **Aucun lien n'est demandé pour une échéance sans numéro** (`actif = joignable`). Ablation A1 : sans cette garde, AC1 et AC2 rougissent.

**Décisions du chef d'équipe, telles qu'appliquées :**

- **(1) Mode sélection au téléphone.**
  - « Sélectionner » est à droite de l'en-tête (`DeclarerEnTete droite`), à la place du « ⋯ » ; il devient « Annuler ».
  - « Tout sélectionner » et le compte sont dans la tête de liste ; « Relancer la sélection (n) » est la barre collante.
  - Les trois gestes ne tiennent pas sur une ligne de 328 à 358 px. « Annuler » va donc à l'en-tête plutôt qu'à la barre.
  - Échap, « Annuler » et le geste retour (`useFermeAuRetour`) sortent du mode et vident la sélection.
  - Une sélection non vide montre toujours ses cases sous `lg` : il n'y a jamais d'échéance cochée sans sa case.
  - De 768 à 1023 px, il n'y a pas d'en-tête de téléphone ni de barre collante : « Sélectionner » est posé au-dessus de la liste, et « Relancer la sélection (n) » dans la tête.
- **(2) La note.** « Ouvrir WhatsApp » note et avance. Si la note est refusée, la file avance quand même, et le récapitulatif nomme « Relances non notées ».
- **(3) Les sauts.** Une échéance sans numéro (aucun lien demandé) ou dont le lien rend 409 est montrée avec sa raison et un bouton « Suivant ». Les deux comptent comme « sautés ».
- **(4) Le récapitulatif.**
  - Il dit « N relancés · N passés · N sautés », puis nomme chaque sautée et sa raison.
  - « Terminer » ne garde sélectionnées que les passées et les sautées. Une relance non notée est **retirée** de la sélection, car WhatsApp s'est ouvert ; le récapitulatif l'a nommée.
  - « Arrêter », la croix et Échap gardent toute la sélection.
- **(5) La sélection par échéance.**
  - Elle survit aux pages, à « Voir plus » et aux filtres.
  - « Tout sélectionner » coche ce qui est affiché.
  - La barre dit « dont N non affichés » : ce mot compte aussi une autre page du même filtre, pas seulement une échéance hors du filtre. La file reprend ces échéances non affichées.
  - Une échéance encaissée depuis le dossier quitte la sélection.
- **(6) Le bureau.** La barre porte « WhatsApp » et « Tout désélectionner ». SMS et E-mail sont un écart de la fiche.

**Six écarts aux consignes, acceptés par le chef d'équipe le 2026-11-12 (option « a » partout) :**

1. **Barre du téléphone.** « Annuler » est dans l'en-tête, « Tout sélectionner » et le compte dans la tête de liste, et la barre collante ne porte que « Relancer la sélection (n) ».
2. **Libellé.** « dont N non affichés » plutôt que « hors du filtre affiché ».
3. **Relance non notée.** Elle quitte la sélection à « Terminer ».
4. **Geste retour pendant la file.** Il vaut « Arrêter » : la sélection et le mode restent, et le retour suivant quitte la page.
5. **De 768 à 1023 px.** « Sélectionner » est sur sa propre ligne au-dessus des cartes, et « Relancer la sélection (n) » dans la tête de liste.
6. **Pendant la file.** La sélection est figée et un clic sur une rangée n'ouvre pas le dossier.

**Le tour de la file** est compté hors de la file (`useRef`) : une note qui revient après « Arrêter » ne s'inscrit pas dans la file suivante. C'est une garde par construction, sans test.

**Le geste retour pendant la file.** Il arrête la file, et la sélection et le mode restent, comme avec « Arrêter ». Il n'y a qu'une seule entrée sentinelle : `useFermeAuRetour` ne distingue pas deux surfaces ouvertes l'une sur l'autre. Après ce retour, le suivant quitte donc la page. Relevé au téléphone le 2026-11-12 : la file se ferme, 16 cases restent, la page reste.

**Acomptes de réservation.** Ils ne peuvent pas paraître : `PaymentHistory::applyBusinessFilters` pose `1 = 0` sur les réservations dès qu'un filtre de retard est là, et toute tranche a `min ≥ 1`. La sélection n'accepte malgré tout que `source = lease`.

**AC3.** Dans le parcours, les seules requêtes non-GET sont `POST …/payment-link`, `POST …/reminders` et `POST /app/agency/finances`. Cette dernière est l'action serveur `composerLaRelanceAction`, qui compose le message et n'envoie rien.

**Preuves :**

- Tests : `__tests__/impayes-en-lot.tck-2682.test.tsx`, 7 tests verts.
- Ablations : 7 en test, toutes rouges, et chaque fichier restauré à l'octet (md5) ; A8 et A9 au navigateur, ci-dessus :
  - A1 : lien demandé sans numéro ;
  - A2 : note écrasée par l'avance ;
  - A3 : « Passer » qui note ;
  - A4 : non affichés jamais dits ;
  - A5 : Échap sans effet ;
  - A6 : « Terminer » qui garde tout ;
  - A7 : une échéance encaissée gardée dans la sélection.
- Fiche de fidélité : `docs/qa/audit-ux-2026-11/fidelite/TCK-2682.json`.
