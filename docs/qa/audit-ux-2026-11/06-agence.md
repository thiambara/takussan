# Famille 6 — Agence : équipe, rôles, finances, rapprochement, KYC, modération, intégrations, audit, abonnement, crédits, commissions

> Audit du 2026-11-10 sur `dev` (1bce3798a). Méthode, sévérités et limites : [README](README.md).
> Personas : `admin` (admin@dakarimmo.sn, agence standard « Dakar Immo »), `admin2`
> (admin@thies-properties.sn, autre agence), `agent` (agent1@dakarimmo.sn), `proprietaire`
> (owner1@dakarimmo.sn) et un hôte individuel créé pour l'audit (passage en agence).
> Bureau 1440 × 900, téléphone 390 × 844 tactile. Captures : scratchpad `audit-app/captures/f6/`.

**Pages de la famille** (sous `/app`) : `agency` (fiche de l'agence), `agency/team`,
`agency/roles`, `agency/finances`, `agency/finances/reconciliation` (+ détail d'un relevé),
`agency/kyc`, `agency/moderation` (avis), `agency/moderation/properties`, `agency/integrations`,
`agency/audit`, `agency/billing`, `credits`, `commissions`, `settings/agency/upgrade`.

**Qui vient ici, et pour quoi.** C'est le back-office de l'agence : l'endroit où elle **paie**
Takussan (abonnement, crédits de mise en avant) et où elle **contrôle son argent** (encaissements,
impayés, reversements aux bailleurs, commissions des agents, rapprochement bancaire). Trois
personnes y viennent, avec trois rythmes :

- **l'admin d'agence**, au bureau, sur grand écran, en séance (fin de mois : reversements,
  commissions, relevé bancaire ; à l'embauche : invitation, rôle) — mais **au téléphone plusieurs
  fois par jour pour une seule question** : « le loyer de Mme Diop est-il arrivé ? », « qu'est-ce
  qui reste impayé ? », « combien me reste-t-il de crédits ? » ;
- **l'agent**, au téléphone, qui veut une seule chose ici : **combien on lui doit** (ses
  commissions) — et à qui l'on doit refuser poliment le reste ;
- **l'hôte individuel** (un propriétaire qui a publié et dont l'espace est devenu une agence
  `individual`), qui découvre l'abonnement, les crédits et le passage en agence professionnelle.

**La mesure de succès de la famille est double** : *l'argent est juste et se voit en un coup
d'œil* (aucun encaissement non identifié, aucun impayé oublié, aucun reversement en retard) et
*l'agence dépense ses crédits et reste abonnée*. Chaque fiche ci-dessous se juge à ça.

> **Limite de l'environnement, relevée avant tout constat.** L'API locale n'autorise que l'origine
> `http://localhost:3000` (`Access-Control-Allow-Origin`) ; l'outil de capture commun ouvre
> `127.0.0.1:3000`. Depuis cette origine, **toute lecture que le navigateur fait directement à
> l'API échoue** (`TypeError: Failed to fetch`) : la fiche d'agence affichait « Vos biens n'ont pas
> pu être chargés », l'équipe « Impossible de lire les absences ». Les captures de cette famille
> sont prises sur `localhost:3000` (copie de l'outil dans le dossier f6). Les autres familles
> doivent vérifier qu'aucun de leurs constats d'erreur ne vient de là. La machine était aussi
> chargée (`load average` 15 à 18 sur 8 cœurs) : une requête d'absences a mis 7,2 s. Les erreurs
> sous charge sont citées comme telles, jamais comptées comme défaut de l'API.

---

## 1. Fiche de l'agence — `/app/agency`

**Rôle business.** C'est la **carte d'identité** de l'agence, et trois choses en dépendent : ce que
voient les chercheurs sur la fiche publique (accroche, « pourquoi nous », vitrine de six biens), ce
qui s'imprime sur les factures (raison sociale, NINEA, RCCM, TVA), et **comment le locataire paie
sans paiement en ligne** (Wave, Orange Money, coordonnées bancaires). Une agence qui n'a pas rempli
cette page encaisse moins bien et convertit moins bien sa fiche publique. La page ne le dit pas.

**Fonctions existantes — à garder** (relevées : `agency/page.tsx`, `AgencyConfigForm.tsx`,
`AgencyPublicProfileCard.tsx`, `RegenerateWatermarksCard.tsx`, captures `fiche-d-*`, `fiche-m-*`)

1. Identité : nom (obligatoire), identifiant d'URL en lecture seule, numéro de licence, description.
2. Contact : e-mail, téléphone, site internet (repris par les e-mails et les fiches publiées).
3. Logo : aperçu (initiales à défaut), « Changer de logo » (JPG/PNG/WEBP, 2 Mo).
4. Paramètres métier : commission par défaut (%), devise avec exemple de rendu, **modération
   obligatoire avant publication**, **encaissement des pénalités de retard en ligne**.
5. Paiement hors ligne : numéro Wave, numéro Orange Money (normalisé en E.164 et réaffiché),
   coordonnées bancaires (500 caractères, compteur) — chaque champ ne part que s'il a changé.
6. Mentions légales et paiements : TVA par défaut, **seuil d'approbation des reversements** (double
   validation), raison sociale, NINEA, RCCM, adresse du siège.
7. Sécurité de l'équipe : double authentification obligatoire pour tous.
8. Menu de l'équipe : sept modules à décocher (Commissions, États des lieux, Onboardings en attente,
   Carnet prestataires, Calendrier, Crédits, Pilotage avancé) — retire l'entrée du menu, pas le droit.
9. « Enregistrer » / « Annuler » du formulaire, sous la garde de la double authentification de
   l'admin (`avecGardeDoubleFacteurAction`).
10. Fiche publique (bloc à part, pour l'admin principal ou qui tient `agency.update`) : accroche
    (120 car.), trois « pourquoi nous » (80 car.), sélection de six biens publics par recherche
    (titre ou référence), aperçu de la couverture, « Voir ma fiche publique », « Enregistrer la
    fiche » ; un bien sélectionné qui n'est plus en ligne est signalé.
11. Carte « Régénérer les filigranes », seulement si le filigrane est allumé pour la plateforme.
12. États : sans agence (`EmptyState`), agence illisible (`ErrorState`).

**Ce qui marche**

- Chaque section dit à quoi elle sert (« Imprimées sur vos factures ; le seuil décide quand un
  reversement attend une seconde personne ») : c'est le bon ton pour un écran de réglages lourds.
- Le « Menu de l'équipe » est une idée juste et rare : l'agence simplifie l'outil pour ses agents
  sans toucher aux droits, et la page le dit en une phrase.
- La fiche publique a un **aperçu** à côté de la saisie : on voit ce qu'on publie.

**Constats**

| Sév. | Où | Constat |
|---|---|---|
| P1 | page entière | **Une seule colonne de neuf sections, 3 561 px en bureau, plus de 6 000 px au téléphone** (sept écrans), et **deux boutons « Enregistrer »** : celui du formulaire, posé au milieu de la page après « Menu de l'équipe », et « Enregistrer la fiche » tout en bas. Aucun n'est collant. Un admin qui change le numéro Wave en haut doit descendre trois écrans pour enregistrer — et ne sait pas que la fiche publique, en dessous, a son propre bouton. |
| P1 | page entière | **Rien ne dit ce qui manque.** Raison sociale, NINEA, RCCM, adresse du siège, numéros Wave et Orange Money, coordonnées bancaires, accroche, « pourquoi nous », vitrine : **tous vides** pour l'agence de démo. Or ces champs conditionnent les factures opposables, le paiement hors ligne affiché au locataire (TCK-2504) et la fiche publique. Aucune jauge, aucun rappel, aucun lien depuis le tableau de bord. |
| P1 | transversal | **La même identité légale est demandée trois fois** : ici (« Mentions légales » : raison sociale, NINEA, RCCM, adresse), au **KYC** (`/app/agency/kyc` : pièces RCCM, NINEA, pièce du dirigeant) et à la **demande de passage en agence** (`settings/agency/upgrade` : numéro RC, NINEA, RIB pro, raison sociale, adresse fiscale). Trois écrans, trois vocabulaires (RCCM / RC, adresse du siège / adresse fiscale), aucune reprise de l'un à l'autre. |
| P2 | Paramètres métier | Deux réglages qui changent le **comportement de toute l'agence** (modération obligatoire, pénalités encaissées en ligne) sont des cases à cocher noyées entre la devise et le paiement hors ligne. Ils relèvent d'une section « Règles de l'agence » avec l'approbation des reversements et la double authentification. |
| P2 | formulaire | Aucune garde de sortie : on quitte la page avec des modifications non enregistrées sans avertissement (aucun `beforeunload` ni état « modifié » dans `AgencyConfigForm.tsx`). Avec un bouton à mi-page et un autre en bas, la perte est probable. |
| P2 | bureau, bas de page | Le bouton flottant « Messagerie » recouvre « Enregistrer la fiche » (capture `fiche-d-5`). ADR-0089 l'a retiré de la barre mobile ; en bureau il reste, et masque l'action principale du dernier bloc. |
| P2 | logo | Le repli du logo est un carré vert anis à bordure pointillée (`DI`) : couleur hors palette Lin, et la bordure pointillée se lit comme une zone de dépôt alors que le dépôt passe par le bouton à côté. |
| P3 | menu | L'entrée du menu s'appelle « Agence », dans le groupe « Agence » : « Agence › Agence ». Le titre de la page est « Configuration de l'agence ». |
| P3 | Menu de l'équipe | « Onboardings en attente » : anglicisme dans un libellé de menu (« Entrées à finaliser »). |
| P3 | Identité | « Identifiant URL (non modifiable) » en champ grisé : c'est l'adresse de la fiche publique, elle gagnerait à s'écrire `takussan.com/agences/dakar-immo` avec « Copier ». |

**Proposition — mobile** *(l'admin corrige ici un numéro Wave ou un téléphone, rarement plus)*

Au téléphone, la page devient **un sommaire de réglages**, pas un formulaire de sept écrans :

```
┌──────────────────────────────────────┐
│ ←  Mon agence                        │
│ [logo] Dakar Immo                    │
│ takussan.com/agences/dakar-immo  ⧉  │
│ ┌──────────────────────────────────┐ │
│ │ Fiche complète à 60 %            │ │  ← jauge : ce qui manque, en clair
│ │ ▓▓▓▓▓▓░░░░  4 éléments à remplir │ │
│ │ › Numéro Wave pour vos locataires│ │
│ │ › NINEA et RCCM (factures)       │ │
│ └──────────────────────────────────┘ │
│ Identité & contact            ›      │
│ Fiche publique (vitrine)      ›  ●   │  ← point : incomplet
│ Paiement hors ligne           ›  ●   │
│ Facturation & mentions légales›  ●   │
│ Règles de l'agence            ›      │  ← modération, pénalités, seuil, 2FA
│ Menu de l'équipe              ›      │
└──────────────────────────────────────┘
```

- Chaque ligne ouvre **un écran court** (une section), avec **« Enregistrer » collant en bas**, au
  pouce, et un retour qui prévient si quelque chose n'est pas enregistré.
- « Paiement hors ligne » passe en tête des sections quand il est vide : c'est ce que le locataire
  voit sur son lien de paiement.

**Proposition — bureau**

- **Deux colonnes** : à gauche une navigation de sections collante (avec le point « incomplet »),
  à droite la section courante ; ou une page unique avec **une barre d'enregistrement collante en
  bas** qui apparaît dès qu'un champ change (« 2 modifications · Annuler · Enregistrer ») — une
  seule barre pour les deux formulaires.
- La **jauge de complétude** en tête de page, avec ses liens directs.
- Les **mentions légales** deviennent la source unique : le KYC et la demande de passage en agence
  les reprennent pré-remplies (voir § 9 et § 13).

**Ambition**

- **Fiche publique éditée en vrai** : l'aperçu devient la fiche publique elle-même, à l'échelle,
  avec la couverture faite des trois photos choisies, et les champs se remplissent dessus. C'est le
  moment où l'agence comprend ce qu'elle vend.
- **« Fiche complète »** compte comme une étape du « Démarrer » de l'espace (ADR-0089 §3) : la
  complétude se suit depuis le tableau de bord, pas seulement ici.

---

## 2. Équipe — `/app/agency/team`

**Rôle business.** Faire entrer un agent (invitation), lui donner un rôle et un taux de
commission, le suspendre, le retirer en passant son portefeuille à un autre, couvrir ses absences.
C'est la page qui **fait grandir l'agence** — et celle qu'on ouvre le jour où un agent part avec
ses clients, où chaque minute compte.

**Fonctions existantes — à garder** (relevées : `team/page.tsx`, `TeamConsole.tsx`,
`AdminUsersTable.tsx`, `UserDetailDrawer.tsx`, `PendingInvitationsSection`, `AgentAbsencesSection`,
`HandoverWizard`, captures `equipe-d*`, `equipe-m*`)

1. « Inviter » (en-tête) → dialogue d'invitation ; aussi offert à un non-admin qui tient
   `team.invite` (les gestes que l'API juge par le profil d'admin lui sont cachés).
2. **Invitations en attente** (agence `standard`) : destinataire, rôle, date d'envoi, état (en
   attente / expirée), « Relancer », « Annuler », pagination.
3. Onglets **Tous / Agents / Administrateurs / Propriétaires / Performance** (le dernier pour une
   agence `standard` et qui tient `reports.view_agency`), dans l'URL.
4. **Absences et remplacements** : déclarer une absence (pour soi, ou pour un autre avec
   `team.delegate_role`), remplaçant, fin, motif, révocation (ADR-0035).
5. Recherche (nom, e-mail, téléphone) et filtre de statut.
6. Tableau : membre (initiales, « Vous »), e-mail, rôle, statut, **double authentification**,
   dernière connexion, créé le ; tris sur membre, dernière connexion, création ; « 21 utilisateurs ».
7. Menu de ligne : « Voir le détail », suspendre / réactiver (l'admin principal ne se suspend pas),
   « Retirer de l'agence ».
8. Tiroir de détail : téléphone, dernière connexion, création, **rôle d'agence** (sélecteur),
   **taux de commission de l'agent** (TCK-2364), retrait.
9. Retrait → **passation du portefeuille** (`HandoverWizard` : tâches, visites, biens, clients vers
   un ou plusieurs repreneurs) ; suspension confirmée par dialogue ; double authentification exigée.
10. États : sans agence (`EmptyState` + lien vers la fiche), liste vide ou vide filtrée, erreur.

**Ce qui marche**

- La colonne **Double authentification** est la bonne information au bon endroit : l'admin qui
  active la 2FA obligatoire (§ 1) voit qui ne l'a pas encore.
- La passation du portefeuille au retrait d'un agent est un vrai geste métier, que peu d'outils
  ont.

**Constats**

| Sév. | Où | Constat |
|---|---|---|
| P1 | page, ordre | **Les invitations passent avant l'équipe, et ce sont surtout des locataires.** Au téléphone, « Invitations en attente · 29 » occupe les 1 100 premiers pixels ; 28 sur 29 sont des invitations de **locataires** (`tenant`) **expirées** depuis des semaines. L'équipe commence au troisième écran. Une invitation de locataire n'est pas une affaire d'équipe, et une invitation expirée n'est pas « en attente ». |
| P1 | page, périmètre | **Les propriétaires sont comptés dans l'équipe.** « 21 utilisateurs » = 9 agents, 2 admins, **11 propriétaires** (les bailleurs clients). Le sous-titre le revendique (« agents, administrateurs, propriétaires »), mais le métier ne le fait pas : un bailleur n'est pas un collaborateur, il a sa page (`/app/owners`). Mélangés, ils noient les agents et faussent le sens de « Suspendre ». |
| P1 | mobile, tableau | **Tableau à défilement horizontal** : au téléphone on voit membre et début d'e-mail ; rôle, statut, 2FA et **le menu d'actions** sont hors écran à droite. Suspendre un agent depuis le téléphone — le cas d'urgence — demande de deviner qu'il faut faire glisser le tableau. |
| P2 | invitations | Le rôle s'affiche en code brut `tenant` (et `Agent` en français à côté) : libellé anglais qui fuit (capture `equipe-m`). |
| P2 | absences | **Deux mécanismes pour la même situation, sur deux pages** : « Absences et remplacements » ici (les tâches vont au remplaçant, aucun droit — ADR-0035) et « Délégations temporaires » sur la page Rôles (un rôle prêté pour une période). Les deux se présentent « pour couvrir un congé ou une absence ». L'admin ne peut pas savoir lequel choisir. |
| P2 | absences | Lu dans le code : si la lecture des absences échoue, le message « Impossible de lire les absences. » n'a **pas de « Réessayer »** (`AgentAbsencesSection.tsx:142`, `retry: false`, `<p role="alert">` fait main au lieu d'`ErrorState`). L'échec vu pendant l'audit venait de l'origine 127.0.0.1 (CORS), pas de l'API. Sur une connexion 3G de Dakar, c'est un bloc mort. |
| P2 | bureau | Un bandeau gris vide de 36 px en tête (le squelette de la zone d'invitations) reste visible pendant tout le chargement, sans libellé. |
| P3 | tableau | « Créé le » montre l'ancienneté du **compte**, pas l'arrivée dans l'agence ; un admin veut « dans l'équipe depuis ». |

**Proposition — mobile** *(urgence : un agent part, un téléphone a été volé ; et le quotidien :
« qui est en congé ? »)*

```
┌──────────────────────────────────────┐
│ Équipe                    [+ Inviter]│
│ ( Agents 9 ) ( Admins 2 ) ( Absents 1)│  ← pastilles, pas d'onglet Propriétaires
│ [🔍 Chercher un membre            ]   │
├──────────────────────────────────────┤
│ (SS) Sokhna Sene            Agent  › │
│      En ligne hier · 2FA ✓           │
│ (PC) Pape Cissé             Agent  › │
│      Absent jusqu'au 14 nov. → Khady │  ← l'absence se lit sur la ligne
│ (KD) Khady Diallo           Agent  › │
│      2FA à activer                   │
├──────────────────────────────────────┤
│ 1 invitation en cours  ›             │  ← repliée, en bas ; expirées archivées
└──────────────────────────────────────┘
```

- **Une ligne = une personne**, deux lignes de texte, chevron ; le tap ouvre une **fiche plein
  écran** (pas un tiroir) : rôle, taux de commission, absences, puis les gestes en bas —
  « Suspendre » (confirmation), « Retirer et passer son portefeuille ».
- Les invitations de **locataires** quittent cette page (elles appartiennent au bail) ; les
  invitations d'équipe expirées passent dans un repli « Expirées (28) — tout effacer ».
- L'absence se déclare **depuis la fiche de la personne** (« Déclarer une absence »), et se lit sur
  sa ligne.

**Proposition — bureau**

- Le tableau garde ses colonnes ; les propriétaires sortent (lien « Vos bailleurs sont dans
  Propriétaires »). La performance reste un onglet.
- **Absences et délégations fusionnées** en un seul geste « Couvrir une absence » qui pose les deux
  questions : *qui reçoit ses nouvelles tâches ?* (absence) et *doit-il agir à sa place ?*
  (délégation de rôle, facultative). Une seule liste « Absences en cours ».
- Panneau latéral de détail plus large (rôle, commission, activité récente, sécurité).

**Ambition**

- **Inviter par WhatsApp** : l'invitation part en lien `wa.me` avec un message pré-écrit, et le
  lien d'acceptation s'ouvre sur le téléphone de l'agent. C'est le canal où l'agent répond.
- **Départ d'un agent en un seul parcours** : suspendre l'accès tout de suite, puis passation,
  puis solde de ses commissions dues (§ 6) — trois écrans aujourd'hui dispersés.

---

## 3. Rôles et permissions — `/app/agency/roles`

**Rôle business.** Décider ce qu'un agent peut faire (voir tous les contacts, encaisser, créer un
reversement, dépenser des crédits). Pour une agence de Dakar de cinq à quinze personnes, la
question réelle est rarement « quelles capacités », presque toujours **« est-ce qu'Awa peut
encaisser ? »** et **« qui peut approuver un reversement ? »**.

**Fonctions existantes — à garder** (relevées : `roles/page.tsx`, `AgencyRolesConsole.tsx`,
`AgencyRolesList.tsx`, `AgencyRoleEditor.tsx`, `CapabilityMatrix.tsx`, `CreateRoleDialog.tsx`,
`DeleteRoleDialog.tsx`, `RoleDelegationsSection.tsx`, `CreateDelegationDialog.tsx`,
`RevokeDelegationDialog.tsx`, captures `roles-d*`, `roles-m*`)

1. Liste des rôles **par type de profil** (Administrateurs, Agents, Propriétaires, Prestataires),
   pastille « Système », « N capacités · N membres », « Cloner ».
2. « Créer un rôle » (dialogue), suppression d'un rôle personnalisé (dialogue de confirmation).
3. Éditeur : nom, description ; **matrice de 46 capacités** en 13 domaines repliables, compte
   « 4/4 » par domaine, « 46 sur 46 capacités accordées », rappel « le modèle est additif ».
4. Rôle système en **lecture seule**, avec le bandeau « clonez-le pour créer une variante ».
5. Marques par capacité : « Sans effet pour l'instant », « Réservé à la plateforme » (cadenas).
6. **Délégations temporaires** : « Déléguer un rôle » (membre, rôle, période), liste, révocation
   (dialogue), état vide explicatif.
7. Garde : admin d'une agence `standard` qui tient `team.assign_role` (`PAGES_ADMIN`).

**Ce qui marche**

- Le regroupement par type de profil et le compte de membres par rôle répondent à « qui a quoi »
  en un regard.
- Les marques « Sans effet pour l'instant » et « Réservé à la plateforme » sont honnêtes : elles
  disent ce qu'une case ne fait pas, au lieu de laisser croire.

**Constats**

| Sév. | Où | Constat |
|---|---|---|
| P1 | matrice | **Le code technique de chaque capacité est affiché sous son libellé** (`agency.update`, `payments.reconcile`, `leases.rent_review_force`…), en police à chasse fixe, 46 fois. C'est le vocabulaire de l'API dans l'écran d'un gérant d'agence ; il double la hauteur de la matrice (4 088 px en bureau, 5 600 px au téléphone). |
| P1 | page | **Aucune lecture « par personne »** : pour savoir si Awa peut encaisser, il faut trouver son rôle dans l'Équipe, revenir ici, ouvrir le rôle et lire 46 lignes. L'écran pense en rôles, l'admin pense en personnes et en gestes. |
| P2 | matrice | Les capacités « Sans effet pour l'instant » (`agency.upgrade_request`, `payments.refund`…) restent cochables et comptées dans « 46 sur 46 » : une case qui ne fait rien n'a pas sa place dans un formulaire de droits. |
| P2 | rôle système | Le champ « Description » d'un rôle système est vide, avec le texte d'exemple « À quoi sert ce rôle dans votre agence ? » dans un champ désactivé : on lit une invitation à écrire là où rien ne s'écrit. |
| P2 | absences | « Délégations temporaires » double « Absences et remplacements » de l'Équipe (voir § 2). |
| P2 | mobile | Au téléphone, la liste des rôles est suivie de l'éditeur **sous** elle : choisir un rôle ne montre rien à l'écran, l'éditeur est 1 500 px plus bas. |
| P3 | liste | Les « Propriétaires » et « Prestataires » ont un rôle à une ou zéro capacité : ces cartes occupent la moitié de la liste pour un réglage que personne ne fait. |

**Proposition — mobile** *(rare : on vérifie, on ne configure pas)*

- La page devient **une liste de rôles** (nom, membres, résumé en une phrase : « Peut encaisser,
  créer des baux, voir tous les contacts »). Le tap ouvre **un écran par rôle** en lecture :
  les domaines en accordéon, **libellés seuls**, sans code. La modification d'un rôle reste
  possible mais n'est pas le premier geste.

**Proposition — bureau**

- **Deux lectures sur la même page, en bascule** : *par rôle* (l'éditeur actuel, codes retirés —
  infobulle au survol pour qui les veut) et **par personne** : un tableau membres × gestes clés
  (Encaisser, Créer un reversement, Approuver un reversement, Voir tous les contacts, Dépenser des
  crédits, Inviter) avec ✓ / — et le rôle d'où vient chaque droit (rôle, délégation).
- Les capacités « sans effet » sortent de la matrice (ou passent en bas, non cochables).

**Ambition**

- **Modèles de rôle prêts à l'emploi** au lieu de « Cloner » : « Agent junior (sans encaissement) »,
  « Comptable (finances seules) », « Gestionnaire locatif » — un clic, puis ajuster. C'est ainsi
  qu'une agence de huit personnes s'en sert réellement.

---

## 4. Finances — `/app/agency/finances`

**Rôle business.** Le **poste de pilotage de l'argent** : ce qui est entré (encaissements), ce qui
manque (impayés), ce qui doit sortir (reversements aux bailleurs, à approuver), ce qui doit être
facturé. C'est la page la plus importante de la famille : une agence de gestion locative vit de sa
commission sur des loyers qu'elle encaisse et reverse. Une erreur ici, c'est un bailleur qui part.

**Fonctions existantes — à garder** (relevées : `finances/page.tsx`, `AdminFinancesClient.tsx`,
`FinanceKpis.tsx`, `AdminFinancesTabs.tsx`, `PaymentsHistoryFilters/Table`, `InvoicesTable`,
`PayoutsTable`, `OverduePaymentsTable`, `CreateInvoiceDialog`, `CreatePayoutDialog`,
`InvoiceDetailDialog`, `PayoutDetailDialog`, captures `finances-d*`, `finances-m*`)

1. Quatre indicateurs : **Encaissements (30 j)**, **Impayés en cours** (ton d'alerte, « N baux
   concernés »), Reversements en attente, Factures à émettre.
2. Lien « Rapprochement bancaire » (pour qui tient `payments.reconcile`).
3. Onglets dans l'URL : **Encaissements · Factures · Reversements · À approuver** (pour qui tient
   `payouts.approve`) **· Impayés**.
4. « Générer une facture » (`invoices.create`) et « Créer un reversement » (`payouts.create`),
   squelette pendant la lecture des capacités.
5. Encaissements : filtres statut, type d'entité, identifiant d'entité, du / au ; tableau
   référence, source, date, montant, statut, méthode (Wave, Orange Money, Free Money, espèces,
   virement), entité **liée** au bail ou à la réservation ; totaux (total, payé, restant, lignes) ;
   pagination 20 / page ; **cartes au téléphone** (`carteMobile`, TCK-2331).
6. Factures : liste, détail (dialogue), avoir.
7. Reversements et « À approuver » : liste, détail (approuver, marquer payé avec référence de
   transaction — double validation au-dessus du seuil de l'agence).
8. Impayés : regroupement **par locataire / par bailleur**, tranches de retard (1-30, 31-60, 61-90,
   > 90 jours), total, **cautions détenues**, lien vers la fiche client.
9. Dialogue de reversement : bailleur, période, **calcul ligne à ligne** (loyers, pénalités,
   réservations, travaux refacturés, commission), lien vers le relevé, moyen de versement vérifié
   ou non, date programmée, avertissement de seuil d'approbation.
10. États : sans agence (`NoAgencyState`), super-admin sans agence renvoyé vers `/super-admin`,
    accès refusé (`finances-degraded`).

**Ce qui marche**

- **« Impayés en cours : 33 715 000 F CFA — 16 baux »** en ton d'alerte, deuxième tuile : le chiffre
  qui fait agir est mis en avant.
- Le dialogue de reversement **calcule** au lieu de faire saisir : la commission se prend ligne à
  ligne, la caution est exclue, le seuil d'approbation est annoncé avant l'envoi.
- Les impayés par **tranche de retard** et par **bailleur** sont exactement la lecture d'un
  gestionnaire.
- Les encaissements ont leur version en cartes au téléphone.

**Constats**

| Sév. | Où | Constat |
|---|---|---|
| P1 | encaissements | **On ne sait pas qui a payé.** Une ligne dit `LPY-EAVKF4 · Bail · 10 nov. · 670 000 F · Payé · Virement bancaire · Bail #3`. Ni le locataire, ni le bien, ni la période (« loyer de novembre »). La question n° 1 de l'admin — « Mme Diop a-t-elle payé ? » — demande d'ouvrir les baux un par un. |
| P1 | encaissements, filtres | **Les filtres parlent la langue de la base** : « Type d'entité », « ID entité » (« Ex : 42 »). Aucun filtre par locataire, par bien, par bailleur, par moyen de paiement — ceux dont on se sert. |
| P1 | impayés | **Voir un impayé ne permet pas d'agir** : aucun « Relancer » (WhatsApp, SMS, e-mail, lien de paiement) depuis la liste ou la tuile. Le lien de paiement par échéance existe (`/pay/[token]`, TCK-602) : il n'est pas à portée de main de celui qui voit l'impayé. |
| P1 | indicateurs | **Les tuiles ne mènent nulle part.** « Impayés en cours » ne s'ouvre pas sur l'onglet Impayés, « Reversements en attente » ne s'ouvre pas sur « À approuver ». |
| P1 | téléphone | **Les quatre tuiles prennent les deux premiers écrans** (≈ 920 px, une tuile par ligne), puis le ruban d'onglets coupé (« À appro… »), puis deux boutons d'émission, puis cinq filtres : la première ligne de paiement arrive au troisième écran. Au téléphone, l'admin vient vérifier **un** encaissement ou **les** impayés. |
| P2 | indicateurs | « 16 **bails** concernés » : le pluriel est « baux » (clé `admin.finances.kpis.overdueHint`). |
| P2 | en-tête | « Rapprochement bancaire » est un bouton sans bordure ni icône, collé au titre (et seul sur sa ligne au téléphone) : on ne le lit pas comme une destination. |
| P2 | reversements | « Créer un reversement » est l'action primaire **en permanence**, même quand rien n'est à reverser ; le moment du reversement (début de mois, par bailleur) n'est pas porté par l'écran. |
| P3 | encaissements | La référence (`LPY-…`) en police à chasse fixe est la première colonne : c'est l'identifiant le moins utile pour un humain. |
| — | charge | Sous `load average` 30-50, la page a rendu deux fois l'erreur racine (« Une erreur est survenue », sans la coque) après un `TimeoutError` côté serveur : la charge de la machine, pas un défaut de la page. Mais le jour où l'API est lente, **l'admin perd toute la coque** (voir Transversal). |

**Proposition — mobile** *(l'admin entre deux rendez-vous : « qu'est-ce qui est arrivé, qu'est-ce
qui manque ? »)*

```
┌──────────────────────────────────────┐
│ Finances              Novembre ▾     │
│ ┌───────────────┬──────────────────┐ │
│ │ Encaissé      │ Impayés       ⚠  │ │  ← deux tuiles, côte à côte
│ │ 95,2 M F      │ 33,7 M F · 16    │ │
│ └───────────────┴──────────────────┘ │
│ À FAIRE                              │
│ › 16 impayés à relancer              │
│ › 3 reversements à approuver         │
│ › 2 factures à émettre               │
│ DERNIERS ENCAISSEMENTS        Tout › │
│ Awa Diop · Appt Mermoz         ✓     │
│ Loyer nov. · Wave · aujourd'hui      │
│                        670 000 F     │
│ Cheikh Fall · Villa Ngor       ✓     │
│ Loyer nov. · Espèces · hier          │
│                      1 355 000 F     │
└──────────────────────────────────────┘
```

- **Un tableau de bord d'argent**, pas une console : deux chiffres, une liste « À faire » qui ouvre
  chaque file (impayés, approbations, factures), puis les derniers encaissements **nommés**.
- **Impayés au téléphone** : une carte par locataire (nom, bien, montant, retard « 34 j »), avec
  **« Relancer sur WhatsApp »** (message pré-écrit avec le lien de paiement) et « Appeler ».
- La recherche remplace les filtres techniques : « Chercher un locataire, un bien, une référence ».

**Proposition — bureau**

- Les quatre tuiles restent, **cliquables** vers leur onglet.
- Encaissements : colonnes **Payeur · Bien · Période · Montant · Moyen · Date · Statut**, la
  référence en dernier ; filtres par payeur, bien, bailleur, moyen, période.
- Impayés : sélection multiple → « Relancer la sélection » (WhatsApp / SMS / e-mail avec lien de
  paiement), historique des relances sur la ligne.
- Reversements : une file **« À reverser ce mois »** par bailleur (montant calculé, moyen vérifié),
  plutôt qu'un dialogue qu'on ouvre bailleur par bailleur.

**Ambition**

- **Le reversement du mois en un écran** : au 5 du mois, la liste des bailleurs avec leur net
  calculé, les moyens vérifiés, cochés par défaut ; « Préparer les 23 reversements » → la double
  validation → l'envoi des relevés de gérance. C'est la tâche mensuelle la plus lourde d'une
  agence de gestion ; aujourd'hui elle se fait bailleur par bailleur.
- **Relances automatiques graduées** (J+3 WhatsApp, J+10 SMS, J+30 alerte à l'admin), la règle
  posée une fois dans la fiche de l'agence (P2 de la spec, « relance automatique des factures en
  retard »).

---

## 5. Rapprochement bancaire — `/app/agency/finances/reconciliation` et `/[statementId]`

**Rôle business.** Pointer chaque ligne du relevé de banque (ou de Wave Business, d'Orange Money)
avec le paiement qu'elle règle, pour que **« encaissé » dans Takussan veuille dire « arrivé sur le
compte »**. C'est le contrôle qui protège l'agence d'un encaissement déclaré mais jamais reçu, et du
détournement en espèces.

**Fonctions existantes — à garder** (relevées : `reconciliation/page.tsx`,
`[statementId]/page.tsx` et `layout.tsx`, `ReconciliationClient.tsx`, `ImportStatementForm.tsx`,
`StatementsList.tsx`, `CsvMappingForm.tsx`, `StatementDetail.tsx`, `PaymentSearchDialog.tsx`,
`PayableStatusBadge.tsx`, captures `rappro-d*`, `releve-absent-m`)

1. Import d'un relevé : fichier **CSV ou OFX**, format, banque (facultatif), « Importer » ;
   message « Relevé reçu : l'analyse est en cours ».
2. Liste des relevés : nom, période, statut (analyse en cours, échec, à vérifier, partiellement
   rapproché, rapproché, archivé), avancement « 12 / 40 rapprochées », **lignes non lues**
   signalées (« vérifiez le paramétrage CSV »).
3. **Paramétrage CSV** : séparateur, ligne d'en-tête, format de date, sept colonnes (date, montant,
   libellé, référence, contrepartie, devise, sens), convention de signe, **séparateur décimal
   obligatoire** (avec l'exemple « 1.500 »), séparateur de milliers.
4. Détail d'un relevé : statut, « N à traiter », « Finaliser le relevé » ; filtres (toutes, non
   rapprochées, suggestions, rapprochées, ignorées) ; lignes date, libellé (+ référence,
   contrepartie), sens, montant, rapprochement (paiement, statut du payable, **confiance %**),
   **doublon d'une ligne déjà importée** ; actions **Valider · Chercher · Ignorer · Délier** ;
   pagination.
5. Recherche d'un paiement : référence ou nom, montant, encaissements ou décaissements selon le
   sens de la ligne, « Rapprocher ».
6. Identifiant mal formé → 404 (layout) ; relevé introuvable → erreur avec « Réessayer ».
7. Garde : `payments.reconcile` (rôle système d'admin ; jamais celui d'agent).

**Ce qui marche**

- Le modèle est le bon : **suggestion avec confiance**, validation humaine, recherche manuelle en
  repli, doublons détectés, finalisation. C'est un vrai outil de rapprochement.
- Le séparateur décimal est **obligatoire et expliqué** (« 1.500 vaut 1 500 avec une virgule
  décimale ») : l'erreur la plus coûteuse d'un import est fermée par l'écran.

**Constats**

| Sév. | Où | Constat |
|---|---|---|
| P1 | page | **Le paramétrage passe avant le travail.** Une agence qui arrive voit un import, un état vide, puis **douze champs techniques** pré-remplis en anglais (`date`, `amount`, `label`, `reference`, `counterparty`) et un format de date PHP (`d/m/Y`). Elle ne sait pas ce que sa banque exporte ; on lui demande de le décrire **avant** d'avoir vu son fichier. |
| P1 | import | **Aucun aperçu** : on importe à l'aveugle, puis on découvre « N lignes non lues — vérifiez le paramétrage CSV ». Les préréglages Wave Business et Orange Money n'existent pas (dette D-67) — or ce sont les relevés qu'une agence sénégalaise a le plus. |
| P1 | détail | **Le détail est un tableau à six colonnes avec quatre actions par ligne**, sans carte mobile (`StatementDetail.tsx` : `<table>` fait main). Au téléphone, valider une suggestion demande de faire défiler chaque ligne à l'horizontale. |
| P2 | détail | Un relevé introuvable (`/reconciliation/999`) affiche « Impossible de charger ce relevé. Réessayer » : on « réessaie » un relevé qui n'existe pas, et il n'y a **pas de retour** vers la liste. |
| P2 | navigation | Aucun retour vers Finances depuis la page de rapprochement ; l'entrée n'existe pas au menu (seulement par le bouton discret des Finances). |
| P3 | import | Le champ fichier est l'`<input type=file>` natif (« Choose File · No file chosen » dans un navigateur anglais), seul de son espèce dans la famille — le KYC a de vrais boutons. |
| — | données | La base de démo n'a **aucun relevé** : le détail n'a pu être jugé que sur le code et sur l'état d'erreur. Un relevé de démonstration (Wave Business, 40 lignes, 30 suggestions) servirait l'audit et la vente. |

**Proposition — mobile** *(on ne rapproche pas au téléphone ; on y **valide** les suggestions)*

- Liste des relevés en cartes (« Wave Business · octobre · 34 / 40 ✓ · 6 à traiter »).
- Détail : **une ligne à la fois**, en pile : « 670 000 F reçus le 10 nov. · WAVE AWA DIOP »
  ↔ « Loyer nov. · Awa Diop · Appt Mermoz (confiance 96 %) » ; deux gros boutons **« C'est bien
  ça »** / **« Autre paiement »**, et « Ignorer » en lien. Glisser à la suivante.

**Proposition — bureau**

- **Import guidé en trois temps** : déposer le fichier → **aperçu des cinq premières lignes**
  avec, au-dessus de chaque colonne, « C'est la date / le montant / le libellé… » (choix en un
  clic, mémorisé pour cette banque) → importer. Le paramétrage CSV devient un écran de réglage
  avancé, plus la première chose vue.
- **Préréglages** Wave Business, Orange Money, CBAO, Ecobank, SGBS (dès qu'un export réel existe —
  D-67).
- Détail en **deux colonnes** : lignes du relevé à gauche, paiement proposé à droite, raccourcis
  clavier (Entrée valide, → suivante).

**Ambition**

- **Rapprochement continu sans relevé** : avec l'intégration Wave ou Orange Money active (§ 11), les
  webhooks confirment déjà les paiements en ligne ; le rapprochement ne devrait plus porter que
  sur les espèces et les virements. L'écran le dirait : « 812 paiements confirmés par Wave, 34 à
  rapprocher à la main ».

---

## 6. Commissions — `/app/commissions`

**Rôle business.** Le grand livre de ce que l'agence doit à ses agents (ADR-0049) : à l'activation
d'un bail, la commission se ventile entre le négociateur et les collaborateurs, puis se fige.
**C'est l'écran qui retient les bons agents** : un agent qui ne sait pas ce qu'on lui doit, ni quand
il sera payé, part. Et c'est l'écran où l'admin solde ses dettes en fin de mois.

**Fonctions existantes — à garder** (relevées : `commissions/page.tsx`, `CommissionsLedger.tsx`,
captures `commissions-d`, `commissions-m*`, `agent-commissions-m`)

1. Accès : tout le personnel d'agence (`assertCanReachAgencyStaffArea`) ; l'agent voit **ses**
   lignes, l'admin **toutes** (l'API tranche).
2. Filtre par statut en pastilles (Toutes, Due, Payée, Annulée), dans l'URL.
3. Totaux : Reste dû, Payé, Annulé.
4. Lignes : acquise le, bail (référence), bénéficiaire + origine (Négociateur / Collaborateur),
   part (« 40 % de 725 000 F CFA »), montant, statut.
5. Pour qui tient `payouts.approve` : « Marquer payée » et « Annuler » sur les lignes dues.
6. Pagination ; état vide expliqué (« une commission naît à l'activation d'un bail… »).

**Ce qui marche**

- La part se lit en clair : **« 40 % de 725 000 F CFA »** à côté du montant. C'est exactement ce
  qu'un agent vérifie.
- L'agent voit ses seules lignes avec le même écran, sans page à part : le périmètre est tenu par
  l'API.

**Constats**

| Sév. | Où | Constat |
|---|---|---|
| P1 | admin, actions | **« Annuler » une commission due se fait en un clic, sans confirmation ni motif** (`CommissionsLedger.tsx` : `onClick={() => agir(() => cancel.mutateAsync(...))}`). Annuler 1 054 512 F dus à un agent est irréversible à l'écran ; la charte exige une confirmation qui dit la conséquence. **« Marquer payée »** non plus ne demande ni date, ni moyen (Wave, espèces), ni référence : l'agent ne pourra jamais rapprocher le versement. |
| P1 | admin, lecture | **Aucune vue par agent.** L'admin lit 120 lignes à plat (6 pages) sans pouvoir répondre à « combien je dois à Sokhna ? » : ni filtre par bénéficiaire, ni sous-total par personne, ni « tout solder pour Sokhna ». La spec annonce un « relevé par agent » (`features.md` §1.5). |
| P1 | téléphone | **Le montant et le statut sont hors écran** : le tableau défile à l'horizontale, on voit date, référence du bail et nom (captures `commissions-m`, `agent-commissions-m`). L'agent, qui ne viendra ici qu'au téléphone, ne voit pas ce qu'on lui doit ligne par ligne. |
| P2 | agent | La colonne **Bénéficiaire** répète le nom de l'agent sur chaque ligne ; le titre reste « Relevé des commissions » (« Mes commissions » serait juste) ; le total « Annulé : 0 F CFA » occupe un écran de carte au téléphone. |
| P2 | lignes | Le **bail** est une référence (`LS-6GZ6IOHI`) non cliquable, sans le bien ni le locataire. Personne ne se souvient d'un bail par sa référence. |
| P2 | lecture | Aucune date de **paiement** sur une ligne payée, aucun export (l'agent ne peut pas joindre son relevé à une demande de crédit, l'admin à sa compta). |

**Proposition — mobile** *(l'agent, en fin de mois : « combien, et quand ? »)*

```
┌──────────────────────────────────────┐
│ Mes commissions                      │
│ ┌──────────────────────────────────┐ │
│ │ On vous doit                     │ │
│ │ 1 204 000 F CFA                  │ │
│ │ 3 baux · plus ancienne : 30 oct. │ │
│ └──────────────────────────────────┘ │
│ Payé cette année : 9 286 361 F       │
│ ( Dues 3 ) ( Payées ) ( Toutes )     │
├──────────────────────────────────────┤
│ Appartement 3 ch. · Mermoz      Due  │
│ 290 000 F · 40 % de 725 000 F        │
│ Négociateur · bail activé le 30 oct. │
├──────────────────────────────────────┤
│ Villa · Ngor                 Payée ✓ │
│ 1 840 000 F · payée le 5 sept. Wave  │
└──────────────────────────────────────┘
```

- Une **carte par ligne**, le montant en premier ; le bien (pas la référence) en titre ; la date
  et le moyen de paiement sur une ligne payée.
- L'admin au téléphone voit la même liste **groupée par agent** (« Sokhna Sene · 1 204 000 F dus ·
  3 lignes › »), et solde un agent depuis sa carte.

**Proposition — bureau**

- Bascule **Par agent / Par ligne**. Par agent : un tableau agent × (dû, payé ce mois, payé
  l'année, dernière date de paiement), et **« Solder »** qui ouvre un dialogue : lignes cochées,
  total, date, moyen (Wave / Orange Money / espèces / virement), référence — et la confirmation.
- « Annuler » passe derrière un menu « … » et demande un motif (journalisé).
- Export CSV / PDF du relevé d'un agent, pour une période.

**Ambition**

- **Verser la commission par Wave depuis l'écran** (les moyens de versement existent déjà pour les
  bailleurs, `features.md` §1.5 « Moyens de versement du bénéficiaire ») : l'agent reçoit l'argent
  et la ligne passe « Payée » avec la référence de transaction, sans saisie.
- **Prévision** : « à l'activation des 4 baux en cours de signature, vous toucherez environ
  640 000 F ». C'est la meilleure motivation qu'un outil puisse donner à un négociateur.

---

## 7. Crédits — `/app/credits`

**Rôle business.** **C'est ici que Takussan gagne de l'argent sur les agences** (ADR-0061) : les
crédits paient la mise en avant — Remontée (5 crédits), Vedette 7 / 15 / 30 jours (20 / 35 / 60),
badges « Urgent » et « Baisse de prix » 7 jours (10). Aujourd'hui les crédits sont **offerts**
(bienvenue, « programme de lancement : crédits du mois ») ; l'achat est la phase 2 de l'ADR.

**Fonctions existantes — à garder** (relevées : `credits/page.tsx`, `CreditsPanel.tsx`,
`boost/api.ts`, captures `credits-d*`, `credits-m*`)

1. Solde de l'espace (« 60 crédits »).
2. Lots disponibles : origine (offre de bienvenue, offerts par Takussan, remboursement, achat),
   restant sur initial, date d'expiration ou « sans expiration ».
3. Historique paginé : date et heure, opération (octroi, mise en avant, remboursement, expiration,
   débit par Takussan), crédits ±, objet (« Vedette — Parcelle à Mermoz »), motif.
4. États : chargement, erreur avec « Réessayer », lots vides, historique vide.
5. Visible au menu de l'admin seulement (`voitLePortefeuille`) ; module masquable par l'agence
   (« Menu de l'équipe »).

**Ce qui marche**

- L'historique dit **quoi a été acheté pour quel bien** (« Vedette — Terrain viabilisé à Thiès,
  −60 ») : la dépense est lisible.
- L'expiration des crédits offerts est écrite sur le lot.

**Constats**

| Sév. | Où | Constat |
|---|---|---|
| P1 | page | **Aucune action.** La page qui porte le revenu de Takussan ne propose **ni d'acheter, ni de dépenser** : pas de « Mettre un bien en avant », pas de grille des offres, pas de « Recharger ». Pour booster, il faut savoir que le bouton est sur la page d'un bien (`PropertyHeaderActions`). La palette « Aller à » promet même « recharger » comme mot-clé de cette page. |
| P1 | page | **Rien ne dit ce que les crédits ont rapporté.** 20 mises en avant en un mois (historique), et pas une vue, pas un contact attribué au boost. Sans retour, l'agence ne rachètera pas quand l'achat arrivera. |
| P1 | page | **Pas de mises en avant en cours.** La spec annonce « page Crédits (solde, lots, historique, **boosts**) » (`features.md` §1.12) : la page ne montre pas quelles Vedettes tournent en ce moment ni jusqu'à quand. |
| P2 | expiration | 60 crédits expirent le 24 décembre ; le 7 octobre, **165 crédits ont expiré** sans être utilisés (historique). Aucun rappel visible sur la page (la spec prévoit un préavis par notification) : un solde qui expire bientôt mérite un bandeau. |
| P2 | téléphone | L'historique est un tableau tassé à 390 px : chaque ligne fait 240 px (date sur trois lignes, objet sur cinq), et le **motif** est hors écran. |
| P3 | historique | L'objet n'est pas un lien vers le bien. |

**Proposition — mobile**

```
┌──────────────────────────────────────┐
│ Crédits                              │
│ ┌──────────────────────────────────┐ │
│ │ 60 crédits                       │ │
│ │ ⚠ 60 expirent le 24 déc.         │ │
│ │ [ Mettre un bien en avant ]      │ │  ← primaire
│ └──────────────────────────────────┘ │
│ EN AVANT EN CE MOMENT                │
│ ▣ Parcelle à Yoff · Vedette          │
│   jusqu'au 12 nov. · 214 vues · 3 ✉  │  ← le retour sur dépense
│ ▣ Villa · Kaolack · Vedette          │
│   jusqu'au 4 nov. — terminée         │
│ CE QUE COÛTE UNE MISE EN AVANT       │
│ Remontée 5 · Vedette 7 j 20 · …      │
│ HISTORIQUE                     ›     │
└──────────────────────────────────────┘
```

- **« Mettre un bien en avant »** ouvre une feuille : choisir un bien (les moins vus en premier),
  puis l'offre (le `BoostDialog` actuel).
- L'historique passe en **liste** (opération, objet, ±crédits à droite, date dessous).

**Proposition — bureau**

- En tête : solde, expiration, bouton primaire ; à droite la grille des offres.
- Au centre : **« En avant en ce moment »** (bien, offre, fin, vues et contacts depuis le début de
  la mise en avant) ; puis lots et historique.

**Ambition**

- **Un « rapport de mise en avant »** par boost : vues avant / pendant, contacts, visites
  demandées. C'est l'argument de vente de la phase 2 — et ce qui rend l'achat évident.
- **Suggestions** : « Ces 3 biens n'ont reçu aucun contact depuis 30 jours — une Remontée coûte
  5 crédits ». Le portefeuille devient un outil de vente, pas un relevé.

---

## 8. Abonnement — `/app/agency/billing`

**Rôle business.** Ce que l'agence paie à Takussan (plan, commission prélevée sur les
encaissements en ligne) et ce que Takussan lui reverse (« reversements plateforme »). Pour une
agence `individual`, la page ne montre que les reversements.

**Fonctions existantes — à garder** (relevées : `billing/page.tsx`, `AgencyBillingClient.tsx`,
`SubscriptionSummary.tsx`, `AgencyPayoutsClient.tsx`, `PayoutTable.tsx`, captures `abonnement-*`)

1. Abonnement (agence `standard`, ou super-admin) : nom du plan, statut (essai, actif, paiement en
   retard, suspendu, terminé), période, commission plateforme (%), limites (biens actifs, agents,
   succursales — « Illimité »), **dérogations actives**.
2. États : chargement, erreur avec « Réessayer », aucun abonnement (texte explicatif).
3. Reversements plateforme : tableau des virements reçus de la plateforme, état vide.

**Ce qui marche**

- La commission plateforme est affichée en clair, avec les dérogations : l'agence sait ce qui lui
  est prélevé.

**Constats**

| Sév. | Où | Constat |
|---|---|---|
| P1 | limites | **« Biens actifs : 100 » et « Agents : 15 » sont des plafonds qui se lisent comme des comptes.** L'agence ne voit ni sa consommation (combien de biens actifs aujourd'hui ?) ni l'approche de la limite. Un plafond sans jauge est une mauvaise surprise programmée. |
| P1 | plan | **Aucun prix, aucun renouvellement, aucun changement de plan, aucune facture** : « Pro, 9 nov. → 9 déc. » ne dit pas ce que l'agence paie, ni ce qui se passe le 9 décembre, ni comment payer. C'est la seule page où l'agence pourrait se voir cliente de Takussan. |
| P2 | reversements | « Reversements plateforme » vit ici, alors que les reversements **de l'agence** vers ses bailleurs vivent dans Finances. Le même mot pour deux flux opposés, sur deux pages. |
| P3 | en-tête | L'icône « carte bancaire » devant « Pro » suggère un moyen de paiement enregistré, qui n'existe pas. |

**Proposition — mobile**

- Une carte **« Votre offre »** : Pro · 3 % sur les paiements en ligne · renouvelée le 9 déc. ;
  puis deux **jauges** : « Biens en ligne 72 / 100 », « Agents 9 / 15 ».
- Les reversements plateforme en liste (montant, période, date, statut).

**Proposition — bureau**

- Même contenu, sur deux colonnes : offre + jauges à gauche, **« Ce que Takussan vous a prélevé
  ce mois »** (commission sur N paiements en ligne) et reversements à droite.

**Ambition**

- **Comparer les offres** quand une jauge approche de 100 % (« Passer à 250 biens ») : le plan Pro
  coûte 50 000 F/mois au seed (`PlanSeeder.php`), la page ne le dit pas, et c'est le seul endroit
  où la montée en gamme se vend.

---

## 9. Dossier KYC — `/app/agency/kyc`

**Rôle business.** La vérification de l'agence par la plateforme (RCCM, NINEA, pièce du dirigeant).
Elle **conditionne l'argent** : un reversement plateforme vers une agence `standard` non vérifiée est
bloqué à l'approbation (`features.md` §1.5). C'est aussi la promesse « agence vérifiée » faite aux
chercheurs.

**Fonctions existantes — à garder** (relevées : `kyc/page.tsx`, `AgencyKycClient.tsx`,
`kyc-components.tsx`, `KycUploader.tsx`, `KycEcheance.tsx`, `SharedIdentifiersNotice.tsx`, captures
`kyc-d`, `kyc-m`)

1. Suivi du dossier : statut (en attente, soumis, vérifié, refusé) et **échéance** (« Expirée —
   Échue le 26 avr. 2021 — à renouveler »), dates de création, soumission, décision, **motif de
   refus** affiché.
2. Pièces : RCCM, NINEA, pièce du dirigeant — statut « Fourni », lien vers le fichier, **date
   d'expiration de la pièce du dirigeant** (exigée à l'envoi), « Remplacer le fichier » / « Ajouter ».
3. « Soumettre le dossier ».
4. Verrouillage quand le dossier est vérifié (`locked = status === 'verified'`).
5. Avis d'identifiants partagés (NINEA ou RIB déjà porté par une autre agence) ; relances
   d'échéance J-30 / J-7 (côté serveur).
6. Sans agence : texte « contactez un super-administrateur ».

**Constats**

| Sév. | Où | Constat |
|---|---|---|
| P1 | pièces | **« À renouveler » et tous les boutons désactivés en même temps.** La pièce du dirigeant est marquée « Expirée — à renouveler », mais « Remplacer le fichier », « Ajouter » et « Soumettre le dossier » sont grisés, parce que le dossier est « Vérifié » (`kyc-components.tsx:101`). L'écran demande un geste qu'il interdit, sans un mot d'explication. (La spec prévoit que le dossier repasse « en attente » à l'échéance ; la base de démo montre un dossier vérifié *et* expiré — que ce soit l'état réel ou un état de démo, **l'écran ne doit jamais le rendre sans issue**.) |
| P1 | page | **On ne sait pas à quoi sert la vérification** ni ce qu'elle bloque : aucun mot sur les reversements gelés, ni sur le badge « vérifiée » de la fiche publique. Un admin ne priorise pas une démarche dont il ne voit pas l'enjeu. |
| P2 | en-tête | « Dossier KYC », « Suivi du dossier KYC » : sigle anglais de conformité dans le titre d'une page d'agence. Le menu dit déjà « Faire vérifier l'agence » dans la palette : c'est le bon titre. |
| P2 | suivi | Deux pastilles contradictoires côte à côte (« Vérifié » vert, « Expirée » rouge) et trois cartes de dates de 2017 qui prennent la moitié du premier écran au téléphone, avant les pièces. |
| P2 | transversal | RCCM et NINEA sont aussi saisis dans la fiche de l'agence et dans la demande de passage en agence (voir § 1). |

**Proposition — mobile et bureau** *(même écran, une colonne ; c'est une démarche, pas une console)*

```
┌──────────────────────────────────────┐
│ Vérification de l'agence             │
│ ┌──────────────────────────────────┐ │
│ │ ⚠ Une pièce a expiré             │ │
│ │ Tant qu'elle n'est pas remplacée,│ │
│ │ vos reversements Takussan sont   │ │
│ │ suspendus.                       │ │
│ │ [ Remplacer la pièce d'identité ]│ │  ← l'unique action, primaire
│ └──────────────────────────────────┘ │
│ ✓ RCCM            rccm.pdf           │
│ ✓ NINEA           ninea.pdf          │
│ ✕ Pièce du dirigeant · expirée       │
│   le 26 avr. 2021                    │
│ Historique : vérifié le 9 nov. 2017 ›│
└──────────────────────────────────────┘
```

- **Un état, une phrase, une action** : à fournir · en cours d'examen (délai annoncé) · vérifiée
  (badge, prochaine échéance) · refusée (motif + « Corriger ») · à renouveler (pièce + conséquence).
- Les dates passent dans un « Historique » replié.
- Au téléphone, **« Prendre en photo »** à côté de « Choisir un fichier » : le dirigeant a sa CNI
  sur lui, pas en PDF.

**Ambition**

- **Vérification guidée en une fois** avec le passage en agence (§ 13) : mêmes pièces, même
  formulaire, NINEA et RCCM saisis une fois et repris par la fiche, les factures et le KYC.

---

## 10. Modération — avis `/app/agency/moderation` et biens `/app/agency/moderation/properties`

**Rôle business.** Deux files d'attente qui protègent la **réputation** de l'agence : les avis
laissés sur ses biens et ses agents (ADR-0043), et les biens soumis par les agents quand l'agence
a rendu la modération obligatoire (§ 1). La seconde a un coût direct : **un bien qui attend
validation n'est pas en ligne**.

**Fonctions existantes — à garder** (relevées : `moderation/page.tsx`,
`moderation/properties/page.tsx`, `ModerationWorkspace.tsx`, `ModerationDetail.tsx`,
`PropertyModerationWorkspace.tsx`, captures `moderation-*`, `moderation-biens-d`)

*Avis*

1. Bandeau de périmètre (« un avis sur l'agence elle-même est modéré par la plateforme »).
2. Filtres : statut (en attente, signalés, approuvés, rejetés), sujet (biens, agences,
   utilisateurs), « Signalés uniquement » ; compte « 55 en file d'attente ».
3. Liste : statut, note, titre, auteur, date ; pagination (20 / page).
4. Détail : « Avis #15 », titre, auteur et note, texte, **signalements** (nombre, auteurs),
   **Approuver · Masquer · Supprimer · Ignorer les signalements**, motif codé + texte
   (journalisé), confirmations ; avis sur l'agence ou déjà publié : réservé à la plateforme.

*Biens*

5. Recherche d'un bien ; « N biens en attente ».
6. Liste : vignette, titre, référence, agence, auteur, statut.
7. Détail : titre, référence, agence, ville, photo, auteur, prix, type, date de soumission,
   **Approuver** / **Rejeter** (raison obligatoire, 20 caractères minimum, confirmation).

**Constats**

| Sév. | Où | Constat |
|---|---|---|
| P1 | avis, détail | **On ne sait pas sur quoi porte l'avis.** Le détail montre « Avis #15 · Moyen · Par Yacine Diouf — note 3/5 » et le texte (« l'humidité dans la salle de bain est un vrai problème ») : **ni le bien, ni l'agent visé**, aucun lien (`ModerationDetail.tsx` ne lit `reviewable_*` que pour savoir si c'est l'agence). Impossible de juger si l'avis est fondé, ni de prévenir l'agent concerné. |
| P1 | biens, détail | **On valide une annonce sans la voir** : une photo recadrée, prix, type, auteur. Ni la description, ni les autres photos, ni l'adresse, ni un lien vers la fiche telle qu'elle paraîtra. Le refus exige 20 caractères de raison, l'approbation ne demande même pas d'avoir regardé. |
| P2 | biens | Valeurs brutes de l'API : type **`apartment`**, prix en **`XOF`** (« 1 095 619 XOF » au lieu de F CFA), « Soumis le — ». L'auteur s'intitule « Agent » alors que c'est ici un **propriétaire** (Mouhamed Sene, owner1). |
| P2 | avis | **Pas de geste par lot** : 55 avis en attente, majoritairement 4 ou 5 étoiles sans signalement ; il faut les ouvrir un par un. |
| P2 | avis | **Pas de « Répondre »** : la seule réponse de l'agence à un avis négatif fondé est de le masquer. Le texte de l'écran évoque pourtant « Vous pouvez y répondre » pour un avis déjà publié. |
| P2 | téléphone | Liste puis détail empilés (`grid-cols-1` sous `lg`) : toucher un avis au téléphone ne montre pas son détail à l'écran — il est sous les vingt cartes de la liste. Le filtre et le bandeau prennent le premier écran. |
| P2 | les deux | Messages d'échec « Une erreur est survenue. » (`detail.genericError`) : la charte l'interdit. |
| P3 | avis | Dates au format `18/11/2026` ici, `18 nov. 2026` partout ailleurs. |

**Proposition — mobile** *(trier les avis du jour en deux minutes, entre deux visites)*

- **Une carte par avis, en pile** : le **bien ou l'agent visé** en titre (avec sa photo), la note,
  le texte entier, les signalements ; trois actions en bas de carte : **Publier · Répondre ·
  Masquer**. Le geste suivant fait passer à la carte d'après.
- Pour les biens : la carte montre **l'annonce comme le public la verra** (photos en carrousel,
  prix en F CFA, quartier, description), puis « Publier » / « Demander une correction » (motif
  choisi dans une liste — photos floues, prix incohérent, adresse manquante — plus un texte libre).

**Proposition — bureau**

- Avis : liste à gauche avec **cases à cocher** et « Publier la sélection » ; détail à droite avec
  le **sujet** (bien ou agent, lien), l'historique des avis de ce sujet, « Répondre
  publiquement ».
- Biens : détail = **aperçu de la fiche publique** (le composant de la fiche, en lecture), et une
  liste de contrôle (photos ≥ 5, adresse, prix cohérent avec le quartier).

**Ambition**

- **Pré-tri par l'IA** (le socle existe, `features.md` §2.11) : avis « sans risque » proposés en
  lot, avis à risque (injure, coordonnées, hors sujet) en tête ; annonce dont le prix s'écarte de
  plus de 40 % de la médiane du quartier signalée.
- **Réponse publique de l'agence** sous l'avis, sur la fiche du bien : c'est ce que les chercheurs
  lisent, plus que la note.

---

## 11. Intégrations — `/app/agency/integrations`

**Rôle business.** Brancher **Wave et Orange Money** (et SMS, e-mail) pour que les locataires
paient en ligne et que les paiements se confirment seuls. C'est ce qui transforme Takussan d'un
registre en caisse — et ce qui alimente la commission plateforme (§ 8).

**Fonctions existantes — à garder** (relevées : `integrations/page.tsx`,
`IntegrationsManager.tsx`, capture `integrations-d`)

1. Cartes par intégration : fournisseur, active / désactivée, **dernier test**, « Désactiver /
   Activer », **« Tester la connexion »**, « Configurer », suppression (confirmation).
2. **Adresse de notification** (webhook) par fournisseur, avec l'instruction propre à chacun
   (Wave : « collez-la dans votre portail Wave Business » ; Orange Money : « rien à coller »),
   « Copier » (repli si le presse-papier échoue), **« Régénérer »** (confirmation : l'ancienne cesse
   de fonctionner).
3. « Ajouter une intégration » : dialogue par fournisseur, champs propres à chacun, **secrets
   jamais réaffichés** (« laissez vide pour conserver »), notes internes, active ou non.
4. Mention de conformité ARTP (NINEA, RCCM pour les souscriptions business).
5. Erreur de lecture (`ErrorState` avec le message), remise à zéro au changement de profil.

**Ce qui marche**

- L'adresse de notification **expliquée fournisseur par fournisseur**, avec copie et
  régénération : c'est le point où les intégrations échouent d'habitude, et l'écran le traite.

**Constats**

| Sév. | Où | Constat |
|---|---|---|
| P1 | page | **L'écran ne dit pas si ça marche.** « Active · dernier test : 31/10/2026 23:59:59 » ne dit ni combien de paiements sont passés par Wave ce mois, ni si la dernière notification a échoué (la table `integration_webhook_logs` existe). L'admin découvre une panne quand un locataire appelle. |
| P2 | libellés | **Anglais qui fuit en français** : sous-titre « Providers externes… », champs « Client ID », « Client secret », « Username », « Password », « Sender address (SIM Orange SN) », « Sender name (≤ 11, whitelist Orange) », « Sender ID », « Account ID », « Service ID », « Host LAMPUSH (optionnel — override par défaut) » (`adminSettings.integrations.fields.*`). |
| P2 | cartes | Suppression par une **icône poubelle seule**, collée à « Configurer » ; dates à la seconde (`23:59:59`). |
| P2 | page | Rien ne relie cette page à ce qu'elle débloque : le locataire voit-il « Payer avec Wave » sur son lien ? Combien de baux en profitent ? |
| P3 | téléphone | Non mesuré en détail (charge machine) ; les cartes passent en une colonne, la zone d'adresse à défilement horizontal reste étroite. |

**Proposition — mobile et bureau**

- Une carte par moyen de paiement, **en langage d'agence** : « **Wave** · vos locataires paient en
  ligne · ✓ 37 paiements confirmés ce mois · dernière confirmation il y a 2 h » ; en cas d'échec :
  « ⚠ 3 notifications refusées depuis hier — vérifiez l'adresse dans Wave Business ».
- Au-dessus, **« Ce que voient vos locataires »** : l'aperçu du bouton de paiement de leur lien.
- Les champs techniques en français (« Identifiant client », « Secret client », « Nom
  d'expéditeur (11 caractères) ») et les réglages avancés repliés.

**Ambition**

- **Branchement assisté Wave Business** : un parcours en trois écrans avec captures du portail
  Wave, test d'un paiement de 100 F de bout en bout, et le statut « prêt ». C'est la fonction qui
  fait encaisser — elle mérite un onboarding, pas un formulaire.

---

## 12. Journal d'audit — `/app/agency/audit`

**Rôle business.** La preuve : qui a changé un rôle, consulté une pièce, retiré un agent, exporté
des données. On l'ouvre rarement, **mais le jour d'un litige** (un loyer contesté, un agent parti
avec un fichier clients), il doit répondre en une minute.

**Fonctions existantes — à garder** (relevées : `audit/page.tsx`, `AuditTrail.tsx`, capture
`journal-d`)

1. Filtres : du / au (30 jours par défaut), action, type d'objet, **membre**, recherche dans la
   description.
2. Tableau : date et heure, utilisateur (« Système », « Compte supprimé »), action (pastille),
   objet **lié** à sa page quand elle existe.
3. **Exporter** (fichier direct, ou e-mail pour un export volumineux).
4. Événements métier nommés (agent suspendu / retiré / réactivé, droits d'un rôle modifiés, rôle
   créé / attribué, données personnelles consultées, pièce KYC expirée, données exportées).
5. Garde : agence `standard`, `reports.view_agency`.

**Constats**

| Sév. | Où | Constat |
|---|---|---|
| P1 | tableau | **Noms de classes et codes bruts** : objets « `AgentProfile #20` », « `Booking #276` », « `Customer #335` », « `Invitation #77` » ; action « `booking_expired` ». Anglais et identifiants techniques dans l'écran de preuve d'une agence (les libellés existent pour une partie : `admin.audit.subjects.*`). |
| P1 | lecture | **Le bruit du système noie les actes humains** : sur le premier écran, 30 lignes « Système », expirations de réservations et créations de clients ; l'acte sensible du jour (un rôle changé, une pièce consultée) se cherche. La page promet « les actions sensibles ». |
| P2 | lecture | **Aucun « quoi a changé »** : « Modification · Booking #276 » ne dit pas quel champ, de quelle valeur à quelle valeur. |
| P3 | dates | Format `09/11/2026 23:00` (numérique) ici, `9 nov. 2026` ailleurs. |

**Proposition — bureau** *(la page vit au bureau ; au téléphone, une liste lisible suffit)*

- Par défaut, **« Actes de l'équipe »** (humains seulement) ; « Inclure les opérations
  automatiques » en bascule.
- Ligne lisible : « **Sokhna Sene** a modifié le loyer du **bail Appt Mermoz (Awa Diop)** :
  650 000 → 670 000 F · 10 nov. 10:37 ». Objet nommé, différence montrée.
- Raccourcis de filtre par question : « Qui a vu des données personnelles ? », « Changements de
  droits », « Argent (paiements, reversements, remboursements) ».

**Proposition — mobile**

- Liste chronologique de phrases (comme ci-dessus), groupées par jour, filtres en feuille.

**Ambition**

- **« Historique de cet objet »** depuis chaque fiche (bail, bien, client, paiement) : le journal
  vient à l'objet, au lieu que l'admin vienne au journal.

---

## 13. Passage en agence professionnelle — `/app/settings/agency/upgrade`

**Rôle business.** La conversion de l'offre : un hôte individuel (un propriétaire, une petite
structure) devient une agence `standard` qui invite des agents, partage son portefeuille… et paie
un abonnement d'agence. C'est **le moment où Takussan gagne un client équipe**.

**Fonctions existantes — à garder** (relevées : `upgrade/layout.tsx`, `upgrade/page.tsx`,
`ProUpgradeCard.tsx`, `AppSidebar.tsx:656`, captures `upgrade-aminata-m`, `upgrade-awa-d`,
`upgrade-awa-m` ; jetons d'audit pour `admin@studio-aminata.sn` — une demande en attente et une
refusée — et pour un hôte sans demande)

1. Accès : admin d'une agence `individual` seulement ; une agence `standard` lit « déjà
   professionnelle » ; un autre profil est renvoyé vers `/app`.
2. Carte « Passer en pro » dans la barre latérale (et l'assistant de démarrage de l'hôte), qui
   devient « Demande en cours » quand une demande attend.
3. « Pourquoi passer en pro ? » : inviter des agents, co-administrer, rôles personnalisés ; délai
   d'examen et canal de réponse (« par e-mail et dans vos notifications »).
4. Formulaire : numéro RC, NINEA, RIB professionnel, raison sociale, adresse fiscale, nombre estimé
   d'agents (optionnel), statuts juridiques (PDF, JPG, PNG, 10 Mo), brouillon conservé.
5. Demande en cours : « Soumise le 6 novembre 2026 », **« Révoquer la demande »** (confirmation).
6. Lecture en échec : un état d'erreur, jamais le formulaire par défaut (commentaire de
   `page.tsx:49-60`, défaut déjà corrigé).

**Constats**

| Sév. | Où | Constat |
|---|---|---|
| P1 | page | **Ni prix ni conséquence.** Rien ne dit ce que coûte l'agence pro (abonnement d'équipe, sièges), ce qui change pour les biens et les baux existants, ni si l'on peut revenir en arrière. On demande un RIB et des statuts juridiques avant d'avoir dit le prix. |
| P1 | refus | **Un refus est invisible.** La page ne lit que la demande `pending` (`page.tsx:86`) : l'hôte dont la demande a été refusée retombe sur un formulaire vide, **sans le motif du refus** ni ce qu'il avait envoyé. Il recommencera la même erreur. |
| P2 | formulaire | **Troisième saisie de l'identité légale** (après la fiche § 1 et le KYC § 9) : RC et NINEA ne sont pas repris du dossier KYC, et les statuts ne servent pas de pièce KYC. |
| P2 | formulaire | Aucun aide-mémoire de format (RC `SN-DKR-2024-B-12345`, NINEA à 9 chiffres, RIB à 24 caractères), aucune vérification avant l'envoi ; le sélecteur de fichier est le contrôle natif du navigateur (rendu en anglais dans l'outil : « Choose File — No file chosen »). |
| P2 | demande en cours | La demande en attente ne montre **ni ce qui a été envoyé** ni le délai restant ; « Révoquer » est le seul geste — pas de « Compléter ». |
| P2 | textes | « Une erreur est survenue » générique ; libellé accessible « demande d'upgrade » (anglicisme). |

**Proposition — mobile** *(l'hôte le fait au téléphone, ses statuts sont une photo)*

```
┌──────────────────────────────────────┐
│ Passer en agence pro                 │
│ ┌ Ce qui change ───────────────────┐ │
│ │ ✓ Vos agents gèrent vos biens    │ │
│ │ ✓ Plusieurs administrateurs      │ │
│ │ ✓ Rôles sur mesure               │ │
│ │ Offre Pro : 50 000 F/mois        │ │
│ │ Vos 3 biens et 2 baux restent.   │ │
│ └──────────────────────────────────┘ │
│ Étape 1 sur 3 · Votre société        │
│ Raison sociale   [Studio Aminata SARL]│
│ NINEA            [00 512 3456 ✓ KYC] │  ← repris du KYC
│ [        Continuer        ]          │
└──────────────────────────────────────┘
```

*Le prix existe : plan Pro à 50 000 F/mois et 3 % sur les paiements en ligne (`PlanSeeder.php:30-45`). Ni cette page ni l'Abonnement (§ 8) ne l'affichent.*

- **Trois étapes** : société (repris du KYC quand il existe) · compte bancaire · statuts (photo ou
  fichier) ; récapitulatif avant l'envoi.
- **Après envoi** : une frise « Envoyée → En examen (48 h) → Décision », le récapitulatif,
  « Compléter » et « Annuler ma demande ».
- **Après un refus** : le motif en tête, le formulaire **pré-rempli** avec la pièce en cause
  marquée.

**Proposition — bureau** : même parcours en deux colonnes (formulaire, et à droite le récapitulatif
« Ce que vous obtenez · ce que ça coûte » qui reste visible).

**Ambition**

- **Un seul dossier d'identité de l'agence** (chantier E) : NINEA, RCCM, RIB, statuts saisis une
  fois, vérifiés une fois, et repris par la fiche, le KYC, les factures et la demande de passage.

---

## Navigation de la famille

**Ce qui existe.**

- **Admin, bureau** : la barre latérale range la famille en deux groupes — *Finances* (Finances de
  l'agence, Commissions, Crédits avec le solde « 60 », Abonnement) et *Agence*, **replié par
  défaut** (Équipe, Rôles, Agence, KYC agence, Modération avis, Modération biens, Journal d'audit,
  Intégrations).
- **Admin, téléphone** : onglets Accueil · Demandes · Biens · Messagerie · Menu. **Aucune page de
  la famille n'est dans la barre** ; tout passe par Menu.
- **Agent** : onglets Accueil · Demandes · Visites · Messagerie · Menu ; « Commissions » dans le
  menu.
- **Hôte individuel** : onglets Accueil · Mes biens · Réservations · Messagerie · Menu ; *Mon
  espace* porte Agence, KYC agence, Reversements, Crédits, et la carte « Passer en pro ».
- Garde : `agency/layout.tsx` renvoie vers `/app` un utilisateur sans aucune page d'admin.

**Constats**

| Sév. | Constat |
|---|---|
| P1 | **Au téléphone, l'argent est à trois touches** (Menu → Finances → onglet) alors que c'est la question la plus fréquente de l'admin dans la journée (« le loyer est-il arrivé ? »). Ni l'accueil ni la barre d'onglets n'y mènent directement. |
| P2 | **Le rapprochement bancaire n'a pas d'entrée de menu** : on n'y arrive que par le bouton sans bordure « Rapprochement bancaire » en tête de Finances. |
| P2 | Le groupe *Agence* replié mêle le quotidien (Modération : 55 avis en attente, sans compteur dans le menu) et le rare (Rôles, Intégrations, Journal). Une file d'attente sans compteur ne se vide pas. |
| P2 | Libellés du menu incohérents avec les titres : « KYC agence » / « Dossier KYC » / « Faire vérifier l'agence » (palette, assistant) ; « Agence » / « Mon agence » / « Paramètres de l'agence ». |
| P2 | `/app/credits` n'a pas de garde de page ; le lien n'est montré qu'à qui voit le portefeuille (`voitLePortefeuille`). Un agent qui ouvre l'URL voit un écran qui n'a pas été pensé pour lui (non capturé sous charge : à vérifier). |

**Proposition**

- **Admin, téléphone** : l'onglet *Demandes* devient **« Argent »** pour un admin d'agence (ou une
  tuile « Encaissé aujourd'hui · Impayés » en tête de l'accueil, cf. famille 3) ; la décision
  revient au porteur (décision 1).
- **Admin, bureau** : trois groupes au lieu de deux — **Argent** (Finances, Rapprochement,
  Commissions), **Takussan** (Abonnement, Crédits, Passer en pro), **Agence** (Fiche, Équipe,
  Rôles, Vérification, Modération *avec compteur*, Intégrations, Journal).
- **Agent** : « Mes commissions » **avec le montant dû** dans le menu (« 1 240 000 F à percevoir »).
- Un même nom par page partout : « Vérification de l'agence », « Fiche de l'agence ».

---

## Transversal — ce qui touche toute la famille

1. **Tableaux à défilement horizontal au téléphone.** La variante `carteMobile` de `DataTable`
   (TCK-2331) n'est utilisée que par `PaymentsHistoryTable` et `InvoicesTable`. Partout ailleurs,
   le montant et l'action sortent de l'écran à droite : `AdminUsersTable`,
   `PendingInvitationsSection`, `PayoutsTable`, `OverduePaymentsTable`, `AuditTrail`,
   `CommissionsLedger`, `CreditsPanel`, `PayoutTable`, `StatementsList`, `StatementDetail`.
   **Un chantier unique** (D) : chaque tableau déclare sa carte (titre, montant, statut, action).
2. **Les indicateurs repoussent la liste sous le pli.** Finances au téléphone : quatre cartes
   d'indicateurs empilées (dont deux à « 0 ») puis les onglets à défilement et deux boutons — la
   première ligne d'impayé arrive après ~1 450 px (capture `impayes-m`). Règle proposée : au
   téléphone, les indicateurs tiennent sur **une rangée défilante** de pastilles, et un indicateur
   nul ne prend pas une carte.
3. **Anglais et codes bruts qui fuient** : `tenant`, `apartment`, `XOF` (au lieu de F CFA),
   « Onboardings », « Providers », les champs des intégrations (« Client secret », « Sender ID »…),
   « `AgentProfile #20` », « `booking_expired` ». Le principe 5 du dépôt (le front possède le
   texte) n'est pas tenu sur cette famille ; la garde i18n ne voit pas les valeurs d'énumération
   rendues telles quelles.
4. **Fautes de libellé** : « 16 **bails** concernés » (`admin.finances.kpis.overdueHint`) — le
   pluriel est « baux ».
5. **Messages d'échec génériques** (« Une erreur est survenue. ») dans la modération, le passage en
   pro et plusieurs dialogues : la charte demande la cause et le geste suivant.
6. **Trois formats de date** : `18 nov. 2026`, `18/11/2026`, `31/10/2026 23:59:59`. Une seule
   fonction de format, la seconde jamais affichée.
7. **L'identité légale saisie trois fois** (fiche § 1, KYC § 9, passage en pro § 13) et vérifiée
   par trois circuits.
8. **Deux mécanismes pour la même absence** : « Absences » dans l'Équipe et « Délégations
   temporaires » dans les Rôles (§ 2, § 3).
9. **Aucune relance** depuis les impayés, ni par WhatsApp ni par SMS, alors que les intégrations
   SMS existent (§ 4, § 11).
10. **Le bouton flottant « Messagerie » recouvre les actions de bas de page** en bureau (bas des
    tableaux, « Enregistrer » des formulaires longs). Même règle que la famille 1 : une seule
    couche flottante en bas.
11. **Sous charge, une erreur serveur rend la page d'erreur racine** (« Une erreur est survenue…
    Référence technique ») **sans la coque `/app`** — barre latérale et onglets disparaissent —
    alors que `(dashboard)/error.tsx` existe. Mesuré trois fois (`impayes-d`, `finances2-m`,
    `upgrade-aminata-d`, `load average` 25 à 51). C'est le comportement d'une erreur levée dans un
    layout, que l'`error.tsx` du même segment ne rattrape pas : à vérifier, mais la conséquence est
    vue — l'admin perd toute navigation sur une simple lenteur.
12. **Le bouton rond en bas à droite est l'outil de développement de TanStack Query** : absent en
    production, il n'est pas un constat.

---

## Synthèse de la famille 6

**Bilan** : 15 pages auditées (14 routes et le détail d'un relevé), **aucun P0**, 34 P1 dont la
moitié portent sur l'argent : **l'agence ne voit pas d'un coup d'œil ce qui est entré, ce qui
manque et ce qu'elle doit** — ni l'admin au téléphone, ni l'agent qui attend sa commission.

### Les chantiers qui rapportent le plus

| # | Chantier | Pages | Pourquoi d'abord |
|---|---|---|---|
| A | **Tableau de l'argent** : « Encaissé aujourd'hui / ce mois », encaissements **nommés** (locataire, bien, moyen), impayés par ancienneté avec **Relancer** (WhatsApp, SMS), reversements dus aux bailleurs | 4 | La question quotidienne de l'admin ; cinq P1 ; débloque la relance, qui rapporte directement |
| B | **Commissions par agent** : un solde par agent (dû, payé, à venir), « Payer » groupé, et pour l'agent « ce qu'on me doit » en une carte | 6 | La seule raison pour laquelle l'agent vient dans la famille |
| C | **Crédits comme outil de vente** : boosts en cours et leur effet (vues, contacts), offres en clair avec le prix, recharge (phase 2 d'ADR-0061) | 7, 8 | Revenu direct de Takussan ; aujourd'hui un registre |
| D | **Tableaux en cartes au téléphone** pour toute la famille (`carteMobile` généralisée) + indicateurs en rangée | toutes | Dix tableaux ; un seul motif ; prérequis de A et B au téléphone |
| E | **Une seule identité de l'agence** : fiche sommaire avec complétude, vérification guidée, passage en pro pré-rempli, refus lisible, prix annoncé | 1, 9, 13 | Sept P1 ; la conversion vers l'agence pro |
| F | **Équipe centrée sur les personnes** : une fiche par membre (rôle, biens, absences, commissions), absences et délégations fusionnées, invitations nettoyées | 2, 3 | La tâche d'embauche et de départ ; cinq P1 |
| G | **Modération avec son sujet** : avis avec le bien ou l'agent visé, réponse publique, lot ; bien modéré vu comme le public le verra | 10 | Deux P1 ; 55 avis en attente |
| H | **Rapprochement guidé** : import du relevé en un geste, correspondances proposées, reste à identifier | 5 | Trois P1 ; aucun relevé dans la base de démo : le parcours n'a pas de données pour se montrer |

Le brief de maquettes couvre A, B, C, E, F, G, H en sept pages ; D n'a pas de page propre : chaque maquette dessine ses listes en cartes au téléphone.

Socle à traiter avec A : libellés anglais et codes bruts, « baux », formats de date, erreurs
génériques, page d'erreur sans coque.

### Décisions qui reviennent au porteur

1. **L'argent dans la barre d'onglets de l'admin au téléphone ?**
   a. Un onglet « Argent » remplace « Demandes » pour l'admin d'agence. *(recommandé : c'est sa
      question la plus fréquente ; les demandes restent à une touche depuis l'accueil)*
   b. Une tuile « Argent » en tête de l'accueil, onglets inchangés.
   c. Rien ne change ; Menu → Finances.
2. **Les propriétaires dans l'Équipe ?**
   a. Non : l'Équipe ne liste que les collaborateurs (admins, agents) ; les propriétaires vont dans
      un carnet « Bailleurs » rattaché aux biens et aux reversements. *(recommandé)*
   b. Oui, dans un onglet séparé de l'Équipe.
3. **Absences et délégations**
   a. Fusionner : une absence propose « qui reprend ses dossiers », ce qui crée la délégation.
      *(recommandé)*
   b. Garder les deux écrans, avec un lien de l'un à l'autre.
4. **Relance des impayés**
   a. Bouton « Relancer » qui ouvre WhatsApp avec un message pré-rempli (montant, échéance, lien
      de paiement), journalisé. *(recommandé : zéro coût, le canal réel au Sénégal)*
   b. Relance SMS envoyée par Takussan (coût par SMS, intégration existante).
   c. Les deux, au choix de l'agence.
5. **Prix affichés dans le produit**
   a. Afficher le prix de l'abonnement d'agence pro et des offres de crédits en F CFA, là où l'on
      décide (passage en pro, boost). *(recommandé : on ne demande pas un RIB avant de dire un prix)*
   b. Renvoyer vers une page tarifs publique.
   c. Ne rien afficher ; l'équipe commerciale répond.
6. **Codes de capacité dans la matrice des rôles** (`property.update`…)
   a. Les retirer de l'écran, garder des phrases (« Modifier un bien ») et les codes en infobulle
      pour le support. *(recommandé)*
   b. Les garder visibles.

> **Rappel de la condition du porteur (2026-11-08)** : rien ne s'implémente avant d'avoir été vu
> en maquette statique. Le brief de maquettes de cette famille est
> `audit-app/briefs/famille-6.json` (scratchpad).

## Maquettes choisies le 2026-11-10

> **Le porteur a validé la recommandation de chaque page**, avec les compléments ci-dessous. Les
> maquettes ont été retouchées le jour même ; la visionneuse marque l'approche « retenue ». Elles
> sont la **référence de fidélité** des tickets à écrire (cf. README). Rien ne s'implémente avant
> que le porteur dise comment attaquer l'implémentation (qui se fera sur Opus 5.5).

| Page | Approche retenue | Visionneuse |
|---|---|---|
| Argent | A — Le point du jour | `?p=app-argent&a=a` |
| Commissions | A — Le solde d’abord | `?p=app-commissions&a=a` |
| Crédits et offre | A — Vendre la mise en avant | `?p=app-credits&a=a` |
| Équipe | A — Une personne, une fiche | `?p=app-equipe&a=a` |
| Identité de l’agence | A — Le sommaire avec complétude | `?p=app-identite-agence&a=a` |
| Modération | B — La liste triée avec lot | `?p=app-moderation&a=b` |
| Rapprochement | C — Le reste à rapprocher | `?p=app-rapprochement&a=c` |

- **Identité de l'agence, A** : le porteur a demandé « le design des différentes sections » — dix
  écrans : sommaire, identité et contact, fiche publique, paiement hors ligne, facturation et
  mentions légales, vérification, règles de l'agence, menu de l'équipe, offre, passage en pro (hôte).
  Champs repris de `/app/agency`, `/app/agency/kyc` et `/app/settings/agency/upgrade`.
- **Décision 3a** : pas d'horaires ni de zones d'intervention — ils n'existent pas dans le produit,
  on n'invente pas de fonction.
- **Modération, B** et **Rapprochement, C** : les recommandations de ces deux pages.
