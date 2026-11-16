---
id: TCK-2846
title: "Les récents sont les fiches ouvertes (« Villa 4 chambres à Ngor · Bien », « Moussa Diallo · Demande »), un seul mécanisme pour « Aller à… », le tiroir et la page introuvable"
status: done
phase: P1
family: front
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-16
depends_on: [TCK-2845]
blocks: []
spec_refs:
  features:
    - "docs/features.md#navigation-de-la-console-selon-le-profil-actif"
  models: []
tags: [front, coque, recents, palette, navigation, audit-ux, app]
---

## Objectif utilisateur

L'agent qui vient de quitter la fiche de Moussa Diallo la retrouve en un geste, par son nom et son type, depuis « Aller à… », le menu ou une page introuvable — au lieu de la seule section « Baux » ou « Commissions ».

## Contrat de données

Aucun endpoint neuf : le titre et le type d'une fiche sont ceux que la fiche lit déjà pour s'afficher.

Relevé le 2026-11-15 : `lib/navigation/pages-recentes.ts` retient des **chemins** (`takussan.pages-recentes.<compte>`, 8 au plus) et la palette les résout sur les **entrées du menu** (`resolveurDesRecents`) ; `components/layout/RecentsDeLaBarre.tsx:16-40` et `SecoursDeLIntrouvable.tsx:43-115` font de même. Résultat : « Baux », « Commissions », jamais une entité (audit-f3-coque.md, app-coque e3 et e8 ; RAPPORT.md « Aller à »).

## Direction UX / Artistique

- **Référence de fidélité** — `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/`, approche a :
  - `app-coque.tsx` e4 « « Aller à… » » (téléphone et bureau) : groupe « Récents » = « Villa 4 chambres à Ngor » · « Bien », « Moussa Diallo » · « Demande », icône d'horloge (`app-coque-pieces.tsx` l. 622-627) ;
  - `app-coque.tsx` e3 « Menu (tiroir) » (téléphone : tiroir ; bureau : colonne) : « Récents » de la colonne (`app-coque-pieces.tsx` l. 415 et suivantes) ;
  - `app-coque.tsx` e8 « Page introuvable » (les deux formats) : la liste de secours sous le champ.
- Une ligne récente : icône d'horloge, **le nom de l'entité** (titre du bien, nom du client ou du demandeur, référence du bail…), et **son type** en petit gris à droite (« Bien », « Demande », « Client », « Bail », « Intervention », « Visite », « Réservation », « Bailleur »).
- Une page qui n'est pas une fiche (une liste, un tableau de bord) peut rester récente sous le nom de son entrée de menu, sans type, comme aujourd'hui — mais une fiche ouverte n'est jamais réduite à sa section.

## Contraintes strictes (métier)

- **Un seul mécanisme** : la palette, la colonne/tiroir et la page introuvable lisent la même liste, dans le même ordre (le plus récent d'abord), dédoublonnée par entité.
- **Isolation** :
  - par compte **et par espace actif** : une fiche de l'agence A n'apparaît pas dans les récents de l'espace B ;
  - vidée à la déconnexion ;
  - une entité qui n'est plus lisible (404/403 à l'ouverture) est retirée de la liste, sans erreur affichée.
- **Données personnelles** : on ne retient que l'identifiant, le type, le titre affiché et le chemin — jamais un téléphone, un courriel ou un montant. Le paragraphe de la politique de confidentialité qui nomme ce stockage (`src/content/legal/privacy.ts`, § 8) est mis à jour pour dire qu'il retient le **nom** des fiches ouvertes.
- Stockage enveloppé (navigation privée, quota) : la coque fonctionne sans récents, comme aujourd'hui.
- Libellés de type en `fr`/`en`/`wo`, `wo` = le texte français tel quel.

## Delta à produire

- [ ] Une écriture « cette fiche a été ouverte » (id, type, titre, chemin), appelée par les fiches de `/app` : bien, demande de contact, client, bail, intervention, visite, réservation, bailleur, prestataire, conversation de groupe (au minimum celles que la maquette nomme).
- [ ] Lecture commune ; palette (groupe « Récents »), colonne/tiroir (« Récents ») et page introuvable branchées dessus.
- [ ] Migration douce des chemins déjà retenus (ils restent valides le temps d'être remplacés, ou sont ignorés sans erreur).
- [ ] Texte de la politique de confidentialité.
- [ ] Tests : ouvrir la fiche d'un bien puis d'une demande rend, dans la palette, « {titre} · Bien » puis « {nom} · Demande » dans l'ordre inverse ; changer d'espace vide la liste visible ; déconnexion vide le stockage ; une entité 404 disparaît.

## Critères d'acceptation

- [ ] AC1 — Après ouverture de `/app/properties/{id}` (« Villa 4 chambres à Ngor ») puis de la demande de Moussa Diallo, « Aller à… » rend sous « Récents » : « Moussa Diallo » avec « Demande », puis « Villa 4 chambres à Ngor » avec « Bien » — et aucune ligne « Biens » ou « Demandes » pour ces deux visites.
- [ ] AC2 — Le tiroir (390) et la colonne (1440) montrent les mêmes lignes, dans le même ordre ; la page `/app/zzz` aussi, sous son champ.
- [ ] AC3 — Basculer vers un autre espace : aucune des deux lignes n'est rendue ; revenir : elles reviennent.
- [ ] AC4 — Après déconnexion, la clé de stockage du compte n'existe plus.
- [ ] AC5 — Le stockage ne contient aucune chaîne qui ressemble à un téléphone ou un courriel après l'ouverture d'une fiche client (test sur la valeur écrite).
- [ ] AC6 — Vérifier au navigateur le contenu réel des récents (localStorage de l'appareil, audit « non vérifiables » e3/e8) sur un compte de démo, et corriger si une fiche y paraît sous le nom de sa section.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md)) :

- [ ] AC-F1 — Fiche `docs/qa/audit-ux-2026-11/fidelite/TCK-2846.json` : app-coque e3, e4, e8, téléphone et bureau, avec un état où deux fiches ont été ouvertes.
- [ ] AC-F2 — Zéro écart non expliqué ; « Récents » n'est jamais rangé en « donnée ».

## Hors périmètre

- La présentation de la palette (ordre des groupes, pastilles, plein écran) : TCK-2845.
- La variante « cet élément est dans un autre espace » de la page introuvable : TCK-2847 / TCK-2848.

## Notes d'implémentation

_2026-11-15 — agent délégué (vague 92), sur 56cb33890 (TCK-2845)._

**Re-mesure de la prémisse** : exacte. `pages-recentes.ts` retenait des chemins bruts par compte, la palette,
`RecentsDeLaBarre` et `SecoursDeLIntrouvable` les résolvaient sur les entrées du menu (« Baux »,
« Commissions »). Aucune purge à la déconnexion n'existait (AC4 était rouge par construction).

**Ce qui est livré** :

- Un magasin (`src/lib/navigation/pages-recentes.ts`) : une clé par compte, `{ v: 2, espaces: { <profil>: [...] } }`,
  8 au plus par espace. Deux sortes d'entrées : une **page du menu** (`{ chemin }`) et une **fiche**
  (`{ chemin, type, id, titre }`, rien d'autre). Espace inconnu : ni lecture ni écriture.
- Une lecture commune, `recentsResolus` (`palette.ts`) : palette (5, horloge, nom + type en précision),
  colonne/tiroir (4, nom seul, maquette e3), page introuvable (4, nom + « Récent », maquette e8).
- La coque ne retient plus que les pages qui **sont** une entrée du menu (`entreeDe(chemin) === chemin`) :
  une fiche n'est plus jamais réduite à sa section. Les fiches s'écrivent par `RetenirLaFiche`
  (`components/layout/RetenirLaFiche.tsx`) : bien, client, bailleur (pages serveur), bail, réservation,
  intervention (composants de fiche), visite (`visits/[id]/RetenirLaVisite.tsx`, même `useVisit` — la
  fiche est dans `components/visits`, tenu par TCK-2880), demande (`ContactLeadsInbox`, seulement sur
  `?ouverte=` explicite, jamais la première ligne ouverte d'office au bureau).
- Ordre des écritures : la fiche d'une page montée avec la coque écrit AVANT elle (effet d'enfant) ; une page
  du menu dont la fiche de tête est la sienne (`/app/leads` sous `/app/leads?ouverte=9`) n'est donc pas
  ajoutée, et une fiche retire la page de sa section. Les deux ordres sont testés.
- Espace : `app/layout.tsx` passe l'identifiant lié (`profilLieDeLaCoque`) à `AppShell` → `espaceActif` du
  contexte du menu et d'`AppSidebar`. Un compte SANS profil (client, locataire : l'API lie `null`) reçoit
  l'espace `compte` (`espaceDesRecents`) — sans quoi ces deux personas perdaient « Récents ».
- Couverture : une fiche n'est rendue que si le menu couvre sa section ; `palette.test.ts` garde la table
  par persona (admin, hôte, plateforme : toutes ; agent, bailleur : toutes sauf `/app/owners`, que leur
  layout refuse).
- Déconnexion : `AuthContext.logout` appelle `oublierLesPagesRecentes()` (toutes les clés
  `takussan.pages-recentes.*`), et la session morte (401 de `/api/auth/me`) aussi.
- Introuvable : la page introuvable oublie son propre chemin (une fiche 404) ; les panneaux « accès refusé »
  du bien et du client montent `OublierLaFiche` (403).
- AC5 : un titre qui ressemble à un courriel ou à un téléphone n'est pas retenu (`titreRetenable`) ; le client
  est retenu par `nomCompletDe` (jamais le repli courriel/téléphone de `nomAffichable`), la demande par `name`,
  la visite par le titre du bien.
- Migration douce : l'ancienne valeur (tableau de chemins) est ignorée sans erreur et remplacée à la première écriture.
- Politique de confidentialité § 8 : « pages et fiches de votre espace ouvertes récemment, avec leur nom ».
  `VERSION_DOCUMENTS` **non avancée** (décision au porteur : une avance peut redemander l'acceptation).
- Hors périmètre initial, demandé par la session : `SecoursDeLIntrouvable` rend le nombre d'une ligne
  « À traiter » en pastille (`option.compte`), comme la palette.

**Écarts** : prestataire et conversation de groupe ne sont pas branchés (pas de route `[id]` dans `/app`) ;
l'intervention n'est retenue que dans la fiche du personnel (`FicheDIntervention`), pas dans
`MaintenanceDetail` des autres rôles. Une page hors menu qui n'est pas une fiche (`/app/settings/notifications`)
n'est plus retenue (elle apparaissait sous sa section).

Une demande ouverte (`/app/leads?ouverte=9`) reste proposée dans les récents pendant qu'on la lit : la page
courante est comparée sans sa requête.

**Non mesuré** : AC6, AC-F1, AC-F2 (le brief interdit le navigateur ; le front servi tourne sur un autre arbre).
