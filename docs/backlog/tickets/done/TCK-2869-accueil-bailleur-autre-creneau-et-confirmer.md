---
id: TCK-2869
title: "Accueil du bailleur : « Autre créneau » et « Confirmer » sur une visite à confirmer quand l'agence le lui confie, et l'interrupteur de l'agence (ADR-0112)"
status: done
phase: P1
family: front
estimate: S
wave: 92
created: 2026-11-15
updated: 2026-11-16
depends_on: [TCK-2849]
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
    - "docs/features.md#25-reporting--tableaux-de-bord"
  models: []
tags: [front, accueil, bailleur, visites, audit-ux, app]
---

## Objectif utilisateur

Le bailleur à qui l'agence confie ses visites les confirme, ou propose un autre créneau, sans quitter son accueil.

## Contrat de données

- Réglage d'agence et confirmation par le bailleur : **livrés par TCK-2849** (ADR-0112, à valider par le porteur).
- La confirmation avec `scheduled_at` existe (TCK-2624) ; l'accueil de l'admin s'en sert déjà (`LigneDeVisite.tsx:76-96`, « Autre créneau » / « Confirmer »).

Relevé (audit-f3-coque.md, app-accueil e2, app-coque e9) : le bailleur voit « Voir » seul (décision 7 de TCK-2624) ; la maquette dessine « Autre créneau » + « Confirmer ».

## Direction UX / Artistique

**Référence de fidélité** — `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-accueil-contenu.tsx` (`AccueilBailleurMobile` l. 745-746 : `CarteAFaire` « Visite à confirmer » avec « Autre créneau » / « Confirmer » ; `AccueilBailleurBureau` l. 801-802 : `RangeeAFaire` « Proposée par Sokhna Sène · visiteur : Pape Gueye »), écran **e2 « Bailleur »** d'`app-accueil.tsx`, approche a, **téléphone et bureau** ; même contenu en app-coque e9.

- Mêmes gestes, mêmes feuilles (téléphone) et dialogues (bureau) que l'accueil de l'admin : une seule implémentation du choix de créneau.
- La ligne dit qui a proposé la visite (« proposée par Sokhna Sène ») et, au bureau, le visiteur.
- **Réglages de l'agence** : un interrupteur « Les bailleurs confirment les visites de leurs biens », pour l'administrateur, là où vivent les réglages de l'agence (sans autre maquette : la forme d'un interrupteur de réglage existant).

## Contraintes strictes (métier)

- Les gestes n'apparaissent que si l'API les permet (capacité rendue avec la visite) ; sinon « Voir », comme aujourd'hui (TCK-2624, « Chaque geste n'apparaît que s'il est permis »).
- Un 403 au moment du geste retire le geste et garde la ligne (pas d'erreur bloquante).
- Succès : la ligne quitte la liste, le compte baisse.
- Libellés neufs en `fr`/`en`/`wo`, `wo` = le texte français tel quel ; vouvoiement.

## Delta à produire

- [ ] Gestes « Autre créneau » / « Confirmer » sur les visites du bailleur, conditionnés à l'API.
- [ ] Interrupteur dans les réglages de l'agence.
- [ ] Tests : réglage faux → « Voir » seul ; vrai → deux gestes ; « Confirmer » → la ligne disparaît ; 403 → geste retiré.

## Critères d'acceptation

- [ ] AC1 — Agence au réglage faux : la visite à confirmer du bailleur porte « Voir » et ni « Confirmer » ni « Autre créneau ».
- [ ] AC2 — Réglage vrai : à 390 la carte porte « Autre créneau » et « Confirmer » ; à 1440 la rangée aussi ; « Confirmer » envoie la confirmation et retire la ligne.
- [ ] AC3 — « Autre créneau » → choix d'une heure → la confirmation part avec `scheduled_at`.
- [ ] AC4 — L'administrateur bascule l'interrupteur ; le bailleur voit les gestes au rechargement.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md)) :

- [ ] AC-F1 — Fiche `docs/qa/audit-ux-2026-11/fidelite/TCK-2869.json` : app-accueil e2, téléphone et bureau, réglage vrai.
- [ ] AC-F2 — Zéro écart non expliqué ; la décision 7 n'est plus un écart accepté quand le réglage est vrai.

## Hors périmètre

- « Démarrer », « Prochain reversement », relances : TCK-2850.

## Notes d'implémentation

2026-11-15 (agent, arbre `takussan-manques`).

**Écarts à la prémisse**

- L'accueil existait déjà (TCK-2624) avec les deux gestes, mais gardés par un booléen de PERSONA
  (`confirmeLesVisites = persona === 'hote'`). Remplacé par la capacité de CHAQUE visite : `can_confirm`,
  ajoutée à `fields[property_visits]` de `parametresDesVisitesAConfirmer` (l'API ne la sert en liste que
  nommée, TCK-2849). L'hôte la reçoit par `agitPourLeBien` (personnel de son agence individuelle) : aucune
  régression. Le prop `confirmeLesVisites` disparaît (page et deux doublures de test de page).
- **« Autre créneau » ne pouvait pas aboutir pour le bailleur** : il mène à la fiche (`?heure=autre`), dont
  le choix de l'heure était gardé par `abilities.manage` (faux pour le bailleur) et dont la grille
  `GET /api/property-visits/slots` rendait 403 hors du personnel. Deux corrections : `VisitDetail` ouvre le
  geste « Confirmer » sous `manage || abilities.confirm` (les autres gestes restent sous `manage`) ;
  **API** — `VisitSlotsRequest::authorize` admet `PropertyVisitPolicy::bailleurConfirme` (bien d'agence dont
  il est `user_id`, bailleur actif, réglage vrai). Changement d'autorisation hors de la zone « web » du
  ticket, nécessaire à AC3 (ADR-0112 § 2 donne « Autre créneau » au bailleur).
- Au bureau, l'en-tête de la fiche (`FicheDeLaVisite`) ne montrait « Proposer une autre heure » et
  « Confirmer à … » qu'au personnel (`personnel` = `manage`) : ces deux gestes s'affichent désormais dès que
  `gestes.confirmer` existe (le bailleur au titre du réglage), sans rien d'autre du personnel (« ⋯ »,
  Replanifier, messages, fiche client restent sous `personnel`). Le dialogue `?heure=autre` n'était, lui,
  gardé que par `gestes.confirmer`.
- Bureau : la rangée du bailleur dit « Proposée par {agent} · visiteur : {visiteur} » (`LigneDeVisite
  pour="bailleur"`) ; le visiteur n'est nommé que s'il est servi au bailleur (`visitor_display` réduit, nul sur
  une visite à fiche — TCK-2717) : sinon « Proposée par {agent} ». « visiteuse » (maquette) non tenu : genre
  non servi.
- Réglage : « Les bailleurs confirment les visites de leurs biens », groupe « Visites » de « Règles de
  l'agence » (`SectionRegles`), agence `standard` seulement, chaîne entière de `late_fee_online_collection`
  (type, schéma zod, `reglagesDeLaFiche` lu comme `AgencySettings::read`, envoi seulement modifié et jamais
  pour une `individual`, section et libellé de la barre).
- `AuditTrail` : le sujet `PropertyVisit` se NOMMAIT déjà (`admin.audit.subjects.propertyVisit`) et
  l'événement `visit.confirmed_by_owner` avait son libellé (TCK-2849) ; ajoutés : le lien
  (`audit-subject-links` → `/app/visits/{id}`) et le filtre « Objet » (`KNOWN_SUBJECT_TYPES`).

**Mesures**

- `npx vitest run` des 14 fichiers touchés ou voisins → 328 verts ; `tsc --noEmit` propre ; ESLint 0 ;
  `check:i18n` et les `check:*` du front verts ; gardes racine vertes sauf `check-models-spec`
  (`BookingDossierItem`, TCK-2872).
- `php artisan test` OwnerReadsVisitSlotsTest (neuf, 3), StaffVisitSlotsTest, OwnerConfirmsAgencyVisitTest et
  les trois gardes d'architecture → 27 verts.
- Ablations (une à une, restauration par `cp`, md5 vérifié) : grille sans le bailleur → « réglage vrai »
  rouge ; `VisitDetail` sous `manage` seul → AC3 rouge ; `can_confirm` retiré des `fields` → 5 rouges ;
  `confirmable` sans `can_confirm` → AC1 rouge ; détail du bailleur ignoré → rangée du bureau rouge ;
  `owners_confirm_visits` jamais envoyé → AC4 rouge ; interrupteur montré à l'individuelle → rouge ; lien de
  la visite retiré du journal → AuditTrail TCK-2869 rouge.
- Bureau : `fiche.tck-2587` « TCK-2869 » au bureau (`ecrans(false)`) — `?heure=autre` puis « Confirmer à
  16:00 » poste `scheduled_at` ; l'en-tête du bailleur porte les deux gestes et aucun geste du personnel ;
  ablation (en-tête d'origine) → rouge. Garde `routes-atteignables` et tests `fidelite-*` verts.
- Clés i18n posées par l'outil (`accueil.bailleur.visite.proposeePar`, `…proposeeParAvecVisiteur`,
  `admin.agencyConfig.ownersConfirmVisits.label/.hint`, `admin.agencyConfig.fiche.regles.groupeVisites`) :
  déjà embarquées par le commit de la session 45db18523 (TCK-2862).
- Aucune vérification au navigateur (brief du lot 92) : l'écran n'est éprouvé qu'en vitest.
- AC-F1 : fiche `docs/qa/audit-ux-2026-11/fidelite/TCK-2869.json` écrite SANS relevé au navigateur (brief
  du lot 92) ; à relever par la session si elle le juge utile.
