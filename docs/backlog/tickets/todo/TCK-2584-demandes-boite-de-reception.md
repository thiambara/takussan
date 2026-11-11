---
id: TCK-2584
title: "Demandes : une boîte de réception — lignes compactes, âge, doublon annoncé, « Visite » préremplie et « Vous avez répondu ? » au retour"
status: todo
phase: P1
family: front
estimate: L
wave: 89
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2582, TCK-2583, TCK-2586, TCK-2684, TCK-2687, TCK-2688, TCK-2689, TCK-2691]
blocks: []
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
  models:
    - "docs/models-spec.md#67-propertycontactlead-"
tags: [front, leads, crm, mobile, audit-ux, app]
---

## Objectif utilisateur

Au téléphone, entre deux rendez-vous, l'agent trie dix demandes en deux minutes : il voit qui attend depuis quand, répond par WhatsApp ou propose une visite en un geste, et la boîte dit vrai à son retour.

## Contrat de données

- `GET /api/contact-leads` avec `filter[handled]`, `filter[mine]`, `filter[unassigned]`, `filter[search]`, `filter[property_id]`, `filter[recipient_user_id]`, `filter[channel]`, `include=property`, `fields[…]` ; `known_customer` et `first_responded_at` (TCK-2582, TCK-2583).
- `POST /api/contact-leads/{lead}/contacts` au toucher de WhatsApp, Appeler ou E-mail (TCK-2583) ; « Marquer traitée », « Convertir », « Attribuer » : routes existantes.
- `GET /api/contact-leads/response-stats` pour le bandeau de l'admin (TCK-2583).
- « Visite ▸ » : la planification de TCK-2586 lancée avec `contact_lead_id` (TCK-2582).

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=app-demandes&a=a` — écrans « Liste », « Demande ouverte », « Retour de WhatsApp », « Tout est traité », « Chargement », « Erreur » ; et l'écran « La demande » de `?p=app-fil-commercial&a=a` ; **référence de fidélité, non versionnée**, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes).
- Pastilles : À traiter (compte) · Non attribuées (personnel détenteur de `crm.assign`) · À moi · Traitées · Toutes ; recherche par la loupe.
- Ligne : point rouge et âge relatif (« il y a 8 j », rouge au-delà de 24 h), nom ou « Visiteur », bien (titre · quartier) ou « Contact direct », extrait du message sur une ligne, « déjà client·e ✓ » quand `known_customer`, puis trois gestes de 44 px : WhatsApp · Appeler · Visite ▸.
- Demande ouverte : nom, âge, carte du bien (vignette, prix), message entier, téléphone formaté (« +221 77 810 35 38 »), e-mail, destinataire, source ; encadré doublon (« Déjà client : Awa Ndiaye · 2 visites — Ouvrir ») ; barre collante WhatsApp · Appeler · Proposer une visite ; « Plus » : Convertir en client, Attribuer, Marquer traitée, E-mail.
- **Décision 3b** : au retour dans l'application après WhatsApp ou Appeler, une barre basse « Vous avez répondu à <prénom> ? [Oui, c'est traité] [Pas encore] » ; « Oui » marque traitée, toast « Demande traitée. ».
- Admin, bureau : bandeau « Délai médian de première réponse : 3 h 10 · 1 demande > 24 h », détail par agent au clic.
- **Téléphone (360-390 px)** : liste puis feuille plein écran. **Bureau (≥ 1280 px)** : deux panneaux — liste de 420 px, demande ouverte à droite, gestes en barre ; filtres Bien, Agent, Canal ; deux panneaux dès `lg` seulement.

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0103](../../../adr/0103-le-pilotage-commercial-se-derive-des-gestes-et-des-faits.md).

**Pas de régression** (`ContactLeadsInbox.tsx`, relevé de l'audit § 1) :
- `?filtre=` (À traiter par défaut, Traitées, Toutes), total de l'onglet, retour en page 1 au changement ;
- `?lead={id}` : la demande désignée en tête, encadrée, retirée de la liste (lien de notification) ;
- message entier, téléphone, e-mail, destinataire « Pour … », source « Arrivé par … », « À propos de « bien » » vers la fiche publique ;
- WhatsApp prérempli citant le bien, Appeler, E-mail, Convertir en client → « Voir la fiche client », Marquer traitée, Attribuer (capacité `crm.assign`, collègues joignables de l'agence **de la demande** — l'audit relève qu'elle prend aujourd'hui l'agence de l'utilisateur), doublon à la conversion avec « Ouvrir » et « Convertir quand même », `lead.already_converted` → fiche existante ;
- états : 3 squelettes, vide par onglet, erreur **avec « Réessayer »** (absent aujourd'hui), pagination à 20 ;
- la pastille « À traiter » du menu et la ligne « Demandes de contact » du bloc « Aujourd'hui » restent alimentées par la même requête.
- Le WhatsApp de la boîte passe par l'aide commune `whatsappHref` (aujourd'hui construit à la main, `ContactLeadsInbox.tsx:184-185`).
- Bailleur destinataire d'une demande : il voit sa boîte, sans « Non attribuées », sans « Attribuer », sans bandeau de délai.
- i18n `fr`/`en`/`wo` (`wo` = français) ; vouvoiement ; la fenêtre de bienvenue de l'agent ne dit plus « Vos leads » (`agentWelcome.slides.leads.title`) mais « Vos demandes », ni « pipeline ».

## Delta à produire

- [ ] Liste compacte et pastilles ; feuille / panneau de la demande ; barre « Vous avez répondu ? ».
- [ ] Gestes de contact enregistrés au toucher ; « Visite ▸ » préremplie depuis la demande.
- [ ] Bandeau de délai de l'admin ; filtres du bureau ; recherche.
- [ ] Erreur avec « Réessayer » ; libellés de la fenêtre de bienvenue.
- [ ] Tests : `?lead=` en tête ; le geste WhatsApp poste `contacts` puis la barre de retour paraît (événement `visibilitychange`) ; « Oui, c'est traité » marque traitée ; `known_customer` rend « déjà client » ; Attribuer liste les collègues de l'agence de la demande ; absences pour le bailleur.

## Critères d'acceptation

- [ ] AC1 — À 390 px, avec les quatre demandes de démo, au moins 4 lignes sont visibles sans défiler sous l'en-tête (relevé au navigateur), chacune avec ses trois gestes de 44 px.
- [ ] AC2 — Toucher WhatsApp sur la demande de Mouhamed émet `POST …/contacts {channel: whatsapp}` (vérifié au réseau) ; revenir sur l'onglet affiche « Vous avez répondu à Mouhamed ? » ; « Pas encore » laisse la demande dans « À traiter ».
- [ ] AC3 — « Visite ▸ » ouvre la planification avec la pièce de Ouakam et Mouhamed déjà posés ; l'envoi porte `contact_lead_id`.
- [ ] AC4 — Une demande de 8 jours affiche « il y a 8 j » en rouge, une demande de 25 min « il y a 25 min » sans rouge.
- [ ] AC5 — À 1280 px, l'admin voit deux panneaux et le bandeau de délai ; l'agent ne voit pas le bandeau.
- [ ] AC6 — `/app/leads?lead=8&filtre=todo` met la demande 8 en tête et ne la répète pas dans la liste.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), préparation : TCK-2684 → TCK-2691) :

- [ ] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2584.json` (modèle de TCK-2684) liste chaque écran de maquette implémenté (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés (vouvoiement, renommage décidé).
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9 — [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'[ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif : une des trois exceptions d'ADR-0106 § 2, ou une donnée.
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [ ] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une (visionneuse, `l=1280`), sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.

## Hors périmètre

- Les créneaux proposés dans le message WhatsApp (« samedi 10 h ou lundi 17 h ») : ils supposent les disponibilités déclarées de l'agent.
- Les raccourcis clavier `j`/`k`/`t`/`v` (proposés par l'audit, absents de la maquette retenue).

## Notes d'implémentation

**Où vit quoi.** La page `app/(dashboard)/app/leads/page.tsx` monte `components/leads/ContactLeadsInbox.tsx`, qui compose les pièces de `components/leads/boite/` (`LigneDeDemande`, `DemandeOuverte`, `RetourDeContact`, `BandeauDesDelais`, `FiltresDuBureau`, `AttribuerDialog`, `pieces`). La logique sans React est dans `lib/demandes/boite.ts` (âge, retard, tri, vues) ; les lectures et écritures dans `lib/queries/contact-leads.ts`.

**Décisions prises ici** (relevées dans le code, testées) :

- **Vues.** « À moi » = les demandes dont l'utilisateur est destinataire (`filter[mine]`), « Non attribuées » = sans destinataire (`filter[unassigned]`, montrée seulement avec `crm.assign`), « Toutes », « Traitées ». Tout dans l'URL (`?filtre=`, `?bien=`, `?agent=`, `?canal=`, `?q=`, `?ouverte=`) ; le changement de vue revient en page 1.
- **Âge et retard.** L'âge s'écrit en minutes, en heures, puis en **jours de calendrier à Dakar** (`max(1, jour(maintenant) − jour(création))`) : une demande du 2 nov. à 17 h 47 a « 8 j » le 10 à midi, comme la maquette ; un arrondi de durée en aurait donné 7. Le rouge suit `DELAI_DE_RETARD_MS` (24 h), la même borne que `open_over_24h_count` de l'API (`ContactLeadResponseStatsService`) — inscrit au registre `src/test/__tests__/promesses-de-delai.test.ts`.
- **Barre « Vous avez répondu ? ».** Montée au retour sur l'onglet (`visibilitychange`) après WhatsApp ou Appeler, **sur la liste comme dans la demande ouverte**, au téléphone **et jusqu'à 1023 px** (`md:flex`) : sous `lg`, la boîte garde le régime du téléphone. E-mail enregistre le geste mais n'ouvre pas de barre (cas testé). « Oui » marque traitée ; « Pas encore » referme sans rien écrire.
- **Pas d'« Annuler » au toast « Marquée traitée »** : l'API n'a pas de route pour dé-traiter une demande.
- **Déjà client·e.** `known_customer` remplace « Convertir » par « Voir la fiche » (lien vers la fiche existante), au bureau et dans le menu « Plus » du téléphone ; la feuille de planification se rattache à cette fiche.
- **Recherche.** Le texte d'attente dit « Nom, téléphone, e-mail… » et non « … bien » : `filter[search]` ne cherche pas dans le titre du bien (le filtre Bien existe à part, au bureau). Au téléphone, la page n'ajoute pas sa propre action de recherche à l'en-tête (la maquette n'y montre que la loupe de la coque) ; le champ ne paraît que lorsqu'une recherche `?q=` est en cours.
- **Bandeau des délais** : lu seulement par l'administrateur, au bureau (`enabled: admin && large`) ; trois agents dans la ligne, tous au clic sur « Par agent ».
- **Attribuer** liste les collègues de l'**agence de la demande** (`lead.agency_id`, droit `crm.assign` jugé sur elle), et non plus celle de l'utilisateur. Le filtre Agent du bureau, lui, propose les agents de l'agence de l'utilisateur (le filtre porte sur sa boîte).
- **Ouverte depuis une notification.** Au téléphone, quand la demande ouverte est la désignée (`?lead=`), l'en-tête dit « Ouverte depuis la notification · n sur N » (écran « La demande » de la maquette) ; sinon le rang seul.
- **Bienvenue de l'agent.** La diapositive des demandes ne parle plus de pipeline (fr, en ; le wolof, en pause, garde son texte).
- **Gestes.** WhatsApp passe par `whatsappHref` ; sans e-mail, le geste E-mail du bureau est présent mais **inactif**, avec son motif (`gestures.noEmail`).

**Piège payé — le contenu déclaré à la coque sort de la frontière i18n de la page.** `DeclarerEnTete({ droite })` rend son contenu dans l'en-tête de la coque, hors du `NextIntlClientProvider` restreint aux espaces de la page : un `useTranslations('contactLeads…')` dans ce contenu lève `MISSING_MESSAGE` au rendu et fait tomber la demande ouverte au téléphone. Tout libellé passé à la coque est donc **traduit par la page et passé en prop** (`MenuPlus libelle=…`). Le test monte le menu avec un dictionnaire privé de `contactLeads` (rouge par ablation).

**Espaces i18n.** L'entrée de `/app/leads` dans `src/i18n/namespaces.json` gagne `crm`, `visitPlanning` et `visits` (la feuille de TCK-2586 et le dialogue de doublon s'ouvrent depuis la boîte).

**Fidélité.** Fiche : `docs/qa/audit-ux-2026-11/fidelite/TCK-2584.json`. Les relevés servent les quatre demandes de la maquette par un **bouchon dans la page** (`GET /api/contact-leads*`, horloge figée au 10 nov. 12:00) : rien n'est écrit dans la base de démonstration. « Visite confirmée » depuis une demande n'est pas relevé (il créerait une visite et enverrait un SMS) : l'écran est celui de TCK-2586 (app-visites a-6).

**Hors périmètre confirmé.** Les créneaux proposés dans le message WhatsApp ; un jour déduit du texte du message (« Mouhamed a écrit « samedi » ») ; les raccourcis `j`/`k`/`t`/`v`.
