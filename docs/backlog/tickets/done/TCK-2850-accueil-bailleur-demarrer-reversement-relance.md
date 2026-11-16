---
id: TCK-2850
title: "Accueil du bailleur : « Démarrer » sur la page (ligne au téléphone, bandeau « Continuer » au bureau), « Prochain reversement · date · après commission », la dernière relance d'un loyer en retard, « Loyers du mois » à droite au bureau"
status: done
phase: P1
family: front
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-16
depends_on: [TCK-2915]
blocks: []
spec_refs:
  features:
    - "docs/features.md#25-reporting--tableaux-de-bord"
    - "docs/features.md#onboarding-parcours"
  models: []
tags: [front, accueil, bailleur, audit-ux, app]
---

## Objectif utilisateur

Le bailleur qui ouvre `/app` sait ce qu'il lui reste à faire pour être payé, quand arrive son prochain reversement et combien, et si l'agence a déjà relancé son locataire en retard.

## Contrat de données

Un seul manque d'API (la relance, TCK-2915) ; le reste est servi, mais pas lu par l'accueil (vérifié le 2026-11-15) :

- **Démarrer** : `GET /api/me/espace/demarrage` (TCK-2479, ADR-0089 § 5), lu aujourd'hui par le seul `DemarrerDeLEspace` du menu (`AppSidebar.tsx:1067`) ; l'accueil ne reçoit `miseEnService` que pour l'admin d'agence (`(accueil)/page.tsx:205`).
- **Prochain reversement** : `GET /api/payouts?filter[landlord_id]=…&filter[payee_role]=landlord&filter[upcoming]=1&sort=scheduled_at` — déjà lu par `lib/rapports/reversements-a-venir.ts` (`fetchUpcomingOwnerPayouts`, champs `scheduled_at`, `net_amount`). `EnCoursSurVosBiens.tsx:22` dit que « l'API ne sert pas sa date » : vrai d'un calendrier de reversement (il n'y en a pas, cf. TCK-2863), faux d'un reversement déjà créé, dont `scheduled_at` est servi. Tant qu'aucune ligne `Payout` à venir n'existe, la rangée ne se rend pas.
- **Dernière relance** : `last_reminder.at` des lignes d'historique (`include=reminders`), aujourd'hui refusé au bailleur (vérifié : `PaymentHistory::withReminders`, règle de TCK-2658) — **ouvert au bailleur par TCK-2915** (famille 4, amendement d'ADR-0105 § 3, qui cite déjà ce ticket). Pas de `depends_on` déclaré (le fichier de TCK-2915 n'est pas de cette famille) : **AC3 se livre après TCK-2915** ; le reste n'attend rien.

## Direction UX / Artistique

**Référence de fidélité** — `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-accueil.tsx` (écrans) et `app-accueil-contenu.tsx` (`AccueilBailleurMobile` l. 736, `AccueilBailleurBureau` l. 787, `AccueilVideMobile`/`Bureau` l. 859-917), approche a, **e2 « Bailleur »** et **e6 « Rien à faire (bailleur) »** ; même contenu en app-coque e9 « Persona · bailleur » (bureau jamais relevé).

- **Téléphone** : sous le salut, la ligne « Démarrer » avec son anneau « 1/2 » et l'étape suivante (« Envoyez vos pièces d'identité »), qui mène à l'étape. Dans le bloc des loyers, la rangée « Prochain reversement · 15 nov. » / « 10 260 000 F · après commission », qui mène aux reversements.
- **Bureau** : le bandeau « Démarrer · Envoyez vos pièces d'identité pour recevoir vos reversements. » avec « Continuer » à droite, sous la tête de page ; « Prochain reversement » dans la carte des loyers de la colonne de droite ; les loyers en retard en rangées « Seydou Camara · Villa blanche, Yoff » / « 1 400 000 F · relancé par l'agence le 8 nov. » ; **« Loyers de novembre » dans la colonne de droite**, pas au-dessus de « À faire » (manque de e6).
- Une seule source pour « Démarrer » : le menu et l'accueil lisent la même lecture et disent la même étape.

## Contraintes strictes (métier)

- « Démarrer » disparaît de l'accueil quand toutes les étapes sont faites (comme du menu).
- « Prochain reversement » : le premier reversement **à venir** au bailleur (`payee_role=landlord`), jamais une restitution de caution ni une facture de prestataire (TCK-595 AC4 bis) ; aucun à venir → la rangée ne se rend pas.
- « relancé par l'agence le {date} » seulement s'il existe une relance ; sinon rien (pas de « jamais relancé » chez le bailleur).
- Libellés neufs en `fr`/`en`/`wo`, `wo` = le texte français tel quel ; vouvoiement.

## Delta à produire

- [ ] « Démarrer » de la persona bailleur sur l'accueil (deux formes).
- [ ] Rangée « Prochain reversement ».
- [ ] Dernière relance sur les loyers en retard.
- [ ] Place de « Loyers du mois » au bureau (e2 et e6).
- [ ] Corriger le docblock de `EnCoursSurVosBiens.tsx` (la date d'un reversement créé est servie).
- [ ] Tests : ligne et bandeau « Démarrer » selon l'étape ; absence quand tout est fait ; rangée de reversement et son absence ; « relancé par l'agence le 8 nov. ».

## Critères d'acceptation

- [ ] AC1 — Bailleur dont l'étape « Pièces » n'est pas faite (1 sur 2) : à 390, une ligne « 1/2 · Envoyez vos pièces d'identité » mène à l'étape ; à 1440, le bandeau porte « Continuer ». Étapes toutes faites : ni ligne ni bandeau.
- [ ] AC2 — Bailleur avec un reversement `scheduled` au 15 novembre de 10 260 000 F net : « Prochain reversement · 15 nov. » et « 10 260 000 F · après commission » aux deux formats ; aucun à venir : la rangée n'existe pas.
- [ ] AC3 — Loyer en retard relancé le 8 novembre : sa rangée dit « relancé par l'agence le 8 nov. » ; non relancé : aucune mention de relance.
- [ ] AC4 — À 1440, bailleur sans file (e6 « Rien à faire ») : « Loyers de novembre » est dans la colonne de droite ; la colonne de gauche commence par « À faire ».
- [ ] AC5 — Vérifier au navigateur (audit, non vérifiables) avec un bailleur sans file : « Devis à valider », « En cours sur vos biens » et « Tout est à jour » ; corriger si absents.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md)) :

- [ ] AC-F1 — Fiche `docs/qa/audit-ux-2026-11/fidelite/TCK-2850.json` : app-accueil e2 et e6, app-coque e9 (bureau jamais relevé), téléphone et bureau.
- [ ] AC-F2 — Zéro écart non expliqué ; « Prochain reversement » et « Démarrer » ne sont plus rangés en « donnée ».
- [ ] AC-F3 — À 1024 et 768 : `scrollWidth − innerWidth = 0`.

## Hors périmètre

- « Autre créneau » et « Confirmer » sur les visites du bailleur : TCK-2849 (API, ADR-0112) puis TCK-2869.

## Notes d'implémentation

**2026-11-15 — implémentation (agent, vague 92).** Front seul (`takussan-web`), aucune API touchée.

**Prémisses re-mesurées — trois diffèrent.** (1) **La relance n'est pas servie par `include=reminders`** : TCK-2915 a laissé `include=reminders` et `LeasePaymentPolicy::remind` à l'agence (ADR-0105 amendé) ; le bailleur lit `{at, channel, by_name}` des relances NOTÉES dans SON relevé (`GET /api/owner-statements?period=AAAA-MM`, `properties[].reminders[]`, la plus récente d'abord), pour les échéances en retard DE LA PÉRIODE. L'accueil lit donc un relevé par mois d'échéance des loyers montrés (trois au plus, emplacements fixes de `useOwnerStatement`, même clé de cache que l'écran du relevé), apparie par `property_id` et prend `reminders[0].at`. Chargement, panne, bien absent : aucune mention. ⚠ Le relevé est celui de l'agence ACTIVE : le loyer d'une autre agence du même bailleur ne dit pas sa relance. (2) **« Prochain reversement » est, dans la maquette, la 2ᵉ rangée de « En cours sur vos biens »** (téléphone e2 et bureau e2), pas une rangée du bloc des loyers comme le dit la Direction UX : la maquette fait foi (ADR-0106). Le bloc se rend désormais avec un reversement seul. (3) « Démarrer » au téléphone est AU-DESSUS du salut dans la maquette (comme la mise en service de l'admin), pas « sous » : posé au-dessus.

**Démarrer (AC1)** — `DemarrerDuBailleur` (`components/accueil/bailleur/`) : même lecture (`useDemarrageDeLEspace`) et même règle (`etapesARendre(…, 'bailleur')`) que `DemarrerDeLEspace` du menu. Téléphone : anneau, « 1/2 », « Envoyez vos pièces d’identité », lien vers l'étape (`/app/pieces`) ; bureau : « Démarrer · 1 étape sur 2 », « Envoyez vos pièces d’identité pour recevoir vos reversements. », « Continuer ». Le Socle reçoit une prop additive `demarrage {telephone, bureau}` (la mise en service de l'agence prime). `Anneau` exporté de `BandeauMiseEnService`. Décisions : le masquage de « Démarrer » dans le menu (`demarrer_masque`, persona bailleur) le masque aussi sur l'accueil (sans lecture) ; `ouverte` non passé (les deux écrans du bailleur s'ouvrent à tout `owner`) ; persona `bailleur` seul (l'hôte a la mise en service de son agence) ; l'agence suspendue n'est pas jugée ici. `PageHeader` : `empty:hidden` sur l'enveloppe du bandeau (un bandeau qui ne rend rien ne laisse plus sa marge de 20 px — valait déjà pour la mise en service).

**Prochain reversement (AC2)** — `useProchainReversement` (`lib/queries/accueil-bailleur.ts`) : `GET /api/payouts`, `filter[landlord_id]`, `filter[payee_role]=landlord`, `filter[upcoming]=1`, `sort=scheduled_at,-created_at`, `per_page=1`, clé sous `payouts` (un geste sur un reversement la relit). « Prochain reversement · 15 nov. » / « 10 260 000 F · après commission » (`net_amount`), lien vers `/app/reports/payouts` (onglet « Reversements », ouvert à tout `owner` par `vueBailleurOuverte`). Un reversement encore sans date (attente d'approbation) : « Prochain reversement » sans « · ». Docblock de `EnCoursSurVosBiens` corrigé.

**Relance (AC3)** — rangées « Loyers en retard » du bureau : « 1 400 000 F · relancé par l’agence le 8 nov. » quand une relance existe, sinon « 1 400 000 F · échu le 5 nov. » (inchangé).

**Place de « Loyers du mois » (AC4)** — `useFilesDuBailleur` extrait d'`AFaireBailleur` (mêmes lectures, aucune de plus) ; `PlaceDesLoyers` monté deux fois par la page : à gauche (toute largeur ; masqué dès `xl` quand rien n'attend) et dans la cellule de « Ce mois » à droite, au-dessus de « Ce mois », dès `xl` et seulement quand le bloc est `aJour` (e6). Pendant le chargement : à gauche. Cellule de « Ce mois » du Socle en `empty:hidden`. Écart expliqué, préexistant : en e2 la maquette met « En cours » au-dessus de « Ce mois » à droite, le Socle rend « Ce mois » d'abord (ordre commun à tous les personas, non changé ici).

**Tests** — `components/accueil/bailleur/__tests__/accueil-bailleur.tck-2850.test.tsx` (12) ; `socle.tck-2622.test.tsx` (+2, doubles de `DemarrerDuBailleur` et `PlaceDesLoyers`) ; `AFaireBailleur.tck-2624.test.tsx` (`landlordId` passé à `EnCoursSurVosBiens`). 12 ablations une à une : 11 rouges puis restaurées (md5) ; celle de la page (« Démarrer » donné à l'hôte) reste verte parce que le Socle fait primer la mise en service — deux gardes, le test le dit. Joués : `src/components/accueil`, `(accueil)/__tests__`, `components/console/__tests__`, `components/rapports/ensemble/__tests__`, `demarrage-espace`, `visites-champs-lus`, `en-tete-mobile`, `show-sans-fields` ; `tsc`, `eslint`, `check:i18n`, gardes `scripts/check-*.mjs` (front et racine) vertes.

**Revue (même jour)** — champs de `useProchainReversement` alignés sur ceux de `fetchUpcomingOwnerPayouts` ; le relevé n'est lu qu'au bureau (`useMatchesMedia('(width >= 48rem)')`, les rangées sont cachées au téléphone) ; AC3 contre l'API : le relevé du bailleur se lit avec `period` seul (agence du profil owner actif, comme `OwnerStatementRemindersTest`). Test et ablation ajoutés : ni le client ni le locataire n'ont « Démarrer ». Cas accepté : un compte au persona bailleur qui est aussi admin d'agence garde la mise en service dans l'en-tête (elle prime), sans « Démarrer » du bailleur. Fiche de fidélité `docs/qa/audit-ux-2026-11/fidelite/TCK-2850.json` (relevé `null`, quatre écarts expliqués). Gardes `check-status-labels` / `check-status-unions` rouges sur `ServiceProviderBillStatus::draft` : travail en cours d'un autre agent, hors de ce ticket.

**Non mesuré** — AC5 et AC-F1 à F3 demandent le navigateur, exclu de ce lot (le front servi en local tourne sur un autre arbre) : à relever par la session.
