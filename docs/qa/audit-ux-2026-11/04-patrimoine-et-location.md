# Famille 4 — Patrimoine et location

> Audit du 2026-11-10 sur `dev` (1bce3798a). Méthode et limites : [README](README.md).
> Personas : `admin` (admin@dakarimmo.sn, admin d'agence), `agent` (agent1@dakarimmo.sn),
> `proprietaire` (owner1@dakarimmo.sn), `locataire` (customer@agency1.demo.takussan.sn),
> `prestataire` (provider1@dakarimmo.sn). Bureau 1440 × 900, téléphone 390 × 844 tactile.
> Captures : `scratchpad/audit-app/captures/f4/` (hors dépôt).

## Pages

1. Biens — `/app/properties`, `/app/properties/[id]`, `/app/properties/new`
2. Propriétaires — `/app/owners`
3. Baux — `/app/leases`, `/app/leases/[id]`, `/app/leases/new`, `/app/leases/onboarding-pending`
4. États des lieux — `/app/inventories`, `/app/inventories/[id]`, `/app/inventories/new`
5. Paiements — `/app/payments`, `/app/payments/return`
6. Documents — `/app/documents`, `/app/documents/[id]`
7. Maintenance — `/app/maintenance`, `/app/maintenance/[id]`, `/app/maintenance/new`, `/app/maintenance/providers`

## Qui vient ici, et pour quoi

La famille 4 est **le cœur de la gestion locative** : ce qui fait payer une agence (le mandat de
gestion, la commission sur les loyers) et ce qui fait rester un bailleur (« je sais où en sont mes
loyers sans appeler l'agence »). Cinq publics, cinq questions :

- **l'admin d'agence**, au bureau : « quels biens rapportent, lesquels sont vides, qui n'a pas
  payé, quel dossier traîne ? » — il veut un **portefeuille**, pas une liste d'annonces ;
- **l'agent**, souvent debout dans un appartement avec son téléphone : il fait visiter, rédige un
  état des lieux pièce par pièce, photographie une fuite, relance un locataire. Une main, du
  soleil, du réseau moyen ;
- **le bailleur** (propriétaire) : « mes loyers sont-ils rentrés, que me reverse-t-on, qu'est-ce
  qui a été réparé et à quel prix ? » ;
- **le locataire** : « combien je dois, quand, comment je paie (Wave / Orange Money), où est ma
  quittance, ma fuite est-elle prise en charge ? » ;
- **le prestataire** : « où je vais aujourd'hui, à quelle heure, qui m'ouvre, et comment je
  rends mon rapport ? ».

**La mesure de succès de la famille est le loyer encaissé à temps et le bail tenu sans appel
téléphonique** — pas le nombre de biens saisis.

> **Données de démo — signalé une fois, non compté.** Titres de test (« Property Test Filter -
> 2vP0u3kL », « Villa Luxe 5000m² » à 999 999 999 F), photos génériques (paysages, animaux), loyers
> sans période (« 1 133 862 F CFA · Location »). **La persona `locataire`
> (customer@agency1.demo.takussan.sn) n'a aucun bail** — l'API lui rend `GET /api/leases` vide et
> aucun `Customer` ne lui est lié : c'est un client, pas un locataire. L'audit utilise donc un
> locataire réel du seed (`locataire-f4`, user 78, bail 22 actif, 6 échéances, 1 état des lieux,
> 3 interventions), jeton dans `outils/personas-f4.json`.
>
> **Mesures sous charge** : `load average` de 9 à plus de 300 pendant l'audit (8 cœurs, d'autres
> agents capturent) : aucun temps n'est jugé ici, seulement l'**ordre** d'apparition.
>
> **Captures refaites (outil corrigé à 10:29)** : jusque-là, l'outil ouvrait `127.0.0.1:3000`, que
> le CORS de l'API refuse ; les données chargées côté navigateur échouaient. Seules les captures de
> la section 1 (liste et fiche des biens) précédaient le correctif : elles ont été refaites, et les
> constats qui en venaient revus (une affirmation retirée, trois lignes réécrites). Les sections 2 à 7 sont postérieures.
> Côté locataire, tout vient d'un vrai locataire (`locataire-f4`) ; un second (`locataire-vrai`,
> famille 3 : bail LS-EC-IEJWXT, ni paiement, ni document, ni intervention) a servi de contre-épreuve sur
> les pages Paiements, Documents, Baux et Interventions : elle confirme les constats et en ajoute trois.
>
> **Le cercle « palmier » en bas à gauche de toutes les captures** est le bouton des TanStack Query
> Devtools (`next dev` seulement) : ignoré.

---

## 1. Biens — `/app/properties`, `/app/properties/[id]`, `/app/properties/new`

**Rôle business.** C'est l'inventaire de l'agence : ce qu'elle a à louer ou à vendre, et ce
qu'elle gère déjà. Aujourd'hui la page est **une console d'annonces** (publiée ou non, vues,
favoris, boost) ; elle ne dit rien de la **gestion** (occupé ou vacant, par qui, loyer à jour ou
en retard). Pour un admin qui gère 200 biens, c'est la moitié de la question.

**Fonctions existantes — à garder** (relevées : `properties/(liste)/page.tsx`,
`components/property-dashboard/*`, captures admin, agent, bailleur)

*Liste*
1. Titre « Mes biens » + sous-titre (bureau) ; bouton « Publier un bien » (bailleur : même
   libellé, la barre dit « Proposer un bien à mon agence »).
2. Avertissement « Votre numéro n'est pas vérifié : il n'est pas affiché sur vos annonces » +
   « Vérifier mon numéro » (`AvertissementNumeroNonVerifie`, quand des annonces sont en ligne).
3. Quatre tuiles-filtres comptées : Total · Publiés · Vendus / Loués · Archivés (liens, état
   actif) ; en téléphone, puces défilantes.
4. Recherche plein texte (titre, référence, description).
5. Tri : plus récents / anciens, prix ↑↓, vues ↑↓ (sélecteur en bureau, puces dans la feuille en
   téléphone).
6. Bascules « Mes biens » (`only_mine`) et « Archivés » (`include_archived`).
7. Filtres avancés : ville, prix min / max, statut, type, contrat (vente / location), visibilité,
   agent (`user_id`), créé du / au ; puces des filtres actifs retirables, « Tout réinitialiser ».
   En téléphone : feuille « Filtres et tri » avec « Voir les résultats » collé.
8. Ligne / carte d'un bien : photo, titre, type · ville · référence, **propriétaire** (personnel)
   et **agent responsable**, prix + transaction, ancienneté, vues, favoris, statut, visibilité.
9. « Modifier » (→ fiche) et menu « ⋯ » : Publier / Dépublier, Dupliquer, Booster, changer le
   statut (liste des statuts permis), Archiver, Supprimer (confirmation).
10. Sélection multiple + barre d'actions groupées : Archiver, Dépublier, « Changer l'agent
    responsable » (sélecteur), « Tout désélectionner », bilan par bien.
11. Pagination « Page 1 sur 11 · 209 résultats », 10 / 20 / 50 par page, Précédent / Suivant.
12. États vides distincts : portefeuille vide (« Aucun bien dans votre portefeuille » + CTA) et
    filtre sans résultat (« Aucun bien ne correspond à vos filtres » + réinitialiser).

*Fiche d'un bien*
13. Sur-titre « BIEN · référence », titre, statut, visibilité (Public / Privé), type · contrat ·
    ville, propriétaire et agent responsable, bailleur invité en attente (TCK-1000).
14. Actions : **Planifier une visite** (personnel actif seulement), Changer le titulaire (TCK-999),
    Voir la fiche publique, Booster, Ajouter un document, menu « ⋯ » (mêmes actions que la ligne).
15. Bannière de modération ; question de disponibilité d'une annonce Radar (TCK-2432) ;
    **clients correspondants** (`PropertyMatchingCustomers`, personnel).
16. Onglets **Aperçu** (vues, favoris, note, disponibilité, adresse + « Modifier », « À régler »
    avec « Compléter → », historique des prix, **agent principal** et collaborateurs avec
    désignation), **Édition** (formulaire complet + contacts sur place), **Médias (n)**,
    **Calendrier** (location à la nuit / semaine seulement), **Historique (n)** (prix + interventions).
17. Panneau « accès refusé » rendu (pas de redirection muette) sur 403.

*Création*
18. Assistant en trois parties (Le bien · Les détails · L'annonce), aperçu vivant de l'annonce en
    tête, brouillon serveur repris (« Brouillon enregistré »), « Enregistrer et quitter », choix
    du bailleur ou « Inviter un nouveau bailleur » (admin), « Utiliser ma position actuelle »,
    coller un lien Google Maps / WhatsApp, carte à toucher ; quota d'annonces (« Limite
    d'annonces atteinte » + « Gérer mes annonces ») ; mention « Votre agence relira ce bien »
    pour le bailleur. **L'assistant est celui de `/publish` (famille 2)** : il n'est pas ré-audité
    ici, seulement son entrée depuis `/app`.

**Ce qui marche**

- La liste de bureau est dense et complète : en une ligne, propriétaire, agent responsable,
  référence, prix, ancienneté, vues et favoris. Les tuiles sont des filtres, pas des décorations.
- Le téléphone a sa propre carte (`lg:hidden`) avec la référence et l'activité en pied, et une
  vraie feuille de filtres avec bouton collant.
- Le bailleur ne voit pas la ligne « Propriétaire » (c'est lui) : la carte s'adapte au lecteur.
- La fiche a une liste « À régler » qui mène droit au champ à compléter : bon modèle.
- L'assistant de création se juge bien au téléphone (grandes tuiles, une question par écran,
  barre Précédent / Continuer collée, position GPS du téléphone).

**Constats**

| Sév. | Où | Constat |
|---|---|---|
| P1 | liste + fiche | **Le bien n'a pas de vie locative.** Ni la liste ni la fiche ne disent si le bien est occupé, par qui, depuis quand, jusqu'à quand, ni si le loyer est à jour. La fiche (`PropertyDetailTabs.tsx`) a cinq onglets — Aperçu, Édition, Médias, Calendrier, Historique — et **aucun ne mène au bail, au locataire, aux échéances, aux états des lieux ni aux documents du bien** (`grep lease components/property-dashboard/` : seul `ChangerLeTitulaire` en parle). « Ajouter un document » existe ; voir les documents du bien, non. L'admin qui ouvre un bien loué doit repartir par Baux et chercher l'adresse. |
| P1 | liste, badges | **« Publié » veut dire trois choses.** La tuile « Publiés » compte les biens *en ligne* (`scopePublic` : visibilité publique, publié, pas de test, statut ouvert — `Property.php:607`) : 67 chez l'admin, 4 chez le bailleur. La pastille « Publié » d'une ligne ne lit que `visibility = public` : chez le bailleur, **les sept premières lignes disent « Publié » alors que la tuile en compte quatre**. Un troisième « Publié » est un *statut* (ligne « Property Test Filter - cfvb1iVw »). Et la fiche dit « Public » pour la même donnée que la liste appelle « Publié ». Le bailleur ne peut pas savoir si son annonce est visible. |
| P1 | création (agent) | **Quota : « Vous avez 120 annonces actives sur 100 »** alors que la liste du même agent dit 67 publiés. Deux définitions d'« actif » à l'écran ; le message dit « vous » et « changez d'offre » à un agent qui ne tient ni le quota ni l'abonnement de l'agence. Au téléphone, l'écran n'a ni retour ni menu (en-tête réduit au logo) : seule issue, « Gérer mes annonces ». |
| P2 | fiche, téléphone | **Les actions s'empilent sur deux à trois lignes avant le contenu** (bien 85 : « Planifier une visite » · « Changer le titulaire », puis « Ajouter un document » · « ⋯ » ; bien 329, sans agence : « Voir la fiche publique » seule, puis « Booster » · « Ajouter un document » · « ⋯ »). « Planifier une visite », l'action de terrain la plus utile de la page, est rendu côté client après la lecture du profil actif (`PlanifierUneVisite` → `usePersonnelActif`) et décale la ligne quand il paraît ; il n'est offert que sur un bien d'agence (`agenceDuBien`), ce qui est voulu. |
| P2 | fiche | Les onglets sont **décidés par l'annonce** (Édition, Médias, Historique des prix) : l'onglet « Historique (n) » compte les seuls changements de prix (`priceHistory.length`, `PropertyDetailTabs.tsx:96`) alors qu'il porte aussi les interventions (`MaintenanceHistoryByProperty`, `:140`). Le garage d'Ouest Foire (bien 85, trois interventions) affiche « Historique (2) ». |
| P2 | fiche | **Aucune photo sur la fiche** : bien 85, « Médias (6) », est représenté par son titre et trois tuiles « 0 vue · 0 favori · 4.0 note » ; au téléphone, ces trois tuiles prennent ≈ 680 px de haut. La fiche dit « Loué » sans dire à qui (constat P1 ci-dessus). |
| P2 | liste | Loyer sans période dans la colonne prix (« 1 133 862 F CFA · Location ») sauf quand la période existe (« 600 000 F CFA /mois ») : la charte interdit le prix nu pour un loyer. |
| P2 | liste, bailleur | Deux libellés pour le même geste : « Proposer un bien à mon agence » (barre) et « Publier un bien » (bouton de page). La bascule « Mes biens » n'a pas de sens pour un bailleur (tous ses biens sont à lui). |
| P2 | liste, téléphone | Carte de 430 px : **2 biens par écran, 20 par page, 4 800 px** ; la case à cocher est posée sur la photo (20 × 20 px), « ⋯ » fait 36 px, « Modifier » 72 × 36. La ligne « Propriétaire : … · Agent re… » est tronquée. |
| P2 | liste | Le titre de la page dit « Mes biens » à l'admin quand la barre dit « Biens » (`allProperties`) : chez l'admin, ce ne sont pas *ses* biens. |
| P3 | liste, téléphone | La feuille dit « Chaque choix s'applique aussitôt à la liste » et porte un bouton « Voir les résultats » : l'un des deux est faux. |
| P3 | création | L'assistant écrit un brouillon serveur dès le premier choix (`PUT /api/me/wizard-drafts/property-create-wizard`) : bien pour reprendre, mais rien ne dit à l'agent qu'un brouillon l'attend quand il rouvre « Publier un bien » depuis la liste. *(Relevé : l'audit a lui-même laissé un brouillon d'étape 0 au compte `admin2` en passant à l'étape 2.)* |

**Proposition — mobile** *(l'agent cherche un bien pour agir dessus, pas pour le contempler)*

```
┌──────────────────────────────────────┐
│ Biens                     [＋]       │  ← « Publier » en icône, titre court
│ [🔍 Adresse, réf., locataire…     ]  │  ← cherche AUSSI par locataire
│ (Tous 209)(Loués 141)(Vacants 38)    │  ← puces = état de GESTION
│ (En ligne 67)(Impayés 9)(Archivés 5) │
├──────────────────────────────────────┤
│ ▢ Villa · Liberté 6         2 400 000│  ← ligne de 88 px : photo 64 px
│   Loué · Yacine Diouf     F / mois   │
│   ● Loyer d'oct. en retard (6 j)     │  ← la seule ligne d'alerte
├──────────────────────────────────────┤
│ ▢ Studio · Mermoz             350 000│
│   Vacant depuis 23 j · en ligne      │
│   👁 41 vues · 2 demandes            │
└──────────────────────────────────────┘
  appui long = sélection multiple → barre d'actions en bas
```

- **Une ligne dense par bien (88 px, 7 à 8 par écran)**, pas une carte de 430 px : la photo est un
  repère, pas un argument (l'agent connaît ses biens). La ligne 2 dit **l'état de gestion**
  (Loué · nom du locataire / Vacant depuis N j / En vente), la ligne 3 **la seule chose qui
  demande un geste** (retard de loyer, bail qui finit dans 30 j, intervention ouverte, annonce à
  compléter). Rien quand tout va bien.
- **Puces d'état de gestion** en tête (Loués, Vacants, En ligne, Impayés, Fin de bail < 60 j,
  Archivés) à la place des tuiles Publiés / Vendus-Loués ; « En ligne » dit enfin la même chose que
  la pastille.
- **Sélection multiple par appui long** (modèle Gmail / Photos) : la case quitte la photo ;
  la barre d'actions groupées apparaît **en bas**, à la place de la barre d'onglets.
- **Recherche par locataire** (« Diouf » → le bien qu'il occupe) : c'est ainsi qu'un agent pense
  quand un locataire appelle.

**La fiche d'un bien, au téléphone :**

```
┌──────────────────────────────────────┐
│ ←  Villa · Liberté 6            ⋯    │
│ [ photo 16:9, 1/6 ]                  │
│ PR-XUOD4NWE · Maison · 3 ch · 198 m² │
│ ┌ Occupé ──────────────────────────┐ │
│ │ Yacine Diouf · bail LS-M6JG0OLF  │ │  ← le bloc qui manque
│ │ 2 185 000 F / mois · jusqu'au    │ │
│ │ 31/12/2027 · Octobre : en retard │ │
│ │ [Appeler] [WhatsApp] [Le bail →] │ │
│ └──────────────────────────────────┘ │
│ À faire (2) : Description · EDL sortie│
│ (Aperçu)(Annonce)(Documents)(Suivi)  │  ← onglets par MÉTIER
│ …                                    │
├──────────────────────────────────────┤
│ [ Planifier une visite ] [ Signaler ]│  ← barre collante : 2 gestes terrain
└──────────────────────────────────────┘
```

- **Le bloc « Occupation »** en haut : vacant (depuis quand, « Mettre en location », demandes
  reçues) ou occupé (locataire, bail, loyer, prochaine échéance et son état, contacts).
- **Onglets par métier** : *Aperçu* (occupation, à faire, chiffres), *Annonce* (édition, médias,
  boost, vues — tout ce qui sert la publication), *Documents* (ceux du bien et de ses baux),
  *Suivi* (baux passés, états des lieux, interventions, historique des prix — un fil daté).
- **Barre d'actions collante** : « Planifier une visite » et « Signaler un problème » (création
  d'intervention sur ce bien) ; le reste dans « ⋯ » (feuille). Le bouton ne doit plus *apparaître*
  après coup : réserver sa place, ou le rendre côté serveur.

**Proposition — bureau**

- Garder le tableau, **ajouter une colonne « Occupation »** (Loué · locataire · fin de bail /
  Vacant depuis N j) et une colonne « Loyer » (à jour / en retard / —), triables. Les colonnes
  « Activité » (vues, favoris) passent dans un mode « Annonces » commutable (*Gestion* /
  *Annonces*), mémorisé.
- Fiche en deux colonnes : à gauche les onglets par métier, à droite un panneau collant
  « Occupation + À faire + Contacts ».
- Une seule sémantique « En ligne » (= `scopePublic`) partout : tuile, pastille, fiche. La
  visibilité « Public / Privé » reste un réglage, pas un statut affiché à côté du statut.

**Ambition**

- **Vue « Portefeuille »** : taux d'occupation, vacance moyenne, loyers attendus / encaissés du
  mois, par bien et par bailleur, avec la carte des biens. C'est la page qu'un directeur d'agence
  ouvre le lundi matin, et celle qu'il montre à un bailleur qu'il veut signer.
- **« Remettre en location » en un geste** depuis un bien qui se libère (préavis reçu) : l'annonce
  repasse en ligne avec la date de disponibilité, les clients correspondants sont prévenus
  (`PropertyMatchingCustomers` existe déjà), la vacance se réduit.

**Ingénieur.** La liste fait 1 lecture + 5 comptes en parallèle (bien). La fiche ajoute côté
client `matching-customers`, `collaborators`, `availability-check`, le profil actif, plus les
compteurs de la coque : le contenu utile arrive par morceaux, et deux blocs (agent principal,
« Planifier une visite ») changent la mise en page en arrivant. `PropertyCollaboratorsPanel`
rend `null` sur erreur (`:67`) : un échec ne se voit pas.

---

## 2. Propriétaires — `/app/owners`

**Rôle business.** Le bailleur est **le client qui paie l'agence** (mandat de gestion,
commission). Cette page est le carnet de ces clients : c'est d'ici qu'un admin devrait savoir
combien de biens chacun confie, ce qu'on lui a reversé, et l'appeler. Aujourd'hui c'est une liste
d'invitations.

**Fonctions existantes — à garder** (`components/owners/OwnersList.tsx`, `InviteOwnerSheet.tsx`)

1. Titre, sous-titre « Gérez les bailleurs rattachés à votre agence », « Ajouter un propriétaire »
   (si la capacité d'inviter est accordée).
2. Mention de confidentialité : RIB, NINEA et numéro de pièce masqués ; « Afficher » révèle et
   journalise la consultation (« Masquer » ensuite).
3. Tableau : nom (raison sociale + personne de contact pour une société), e-mail, téléphone,
   identifiants masqués, statut (Actif / invitation en attente…), actions **Renvoyer
   l'invitation** et **Révoquer** sur une invitation en cours.
4. Feuille d'invitation : e-mail, prénom, nom, téléphone, type (particulier / société), raison
   sociale ; erreurs « déjà membre », « interdit ».
5. État vide avec le même bouton d'invitation.
6. Accès réservé à l'admin (`isAdmin` + capacité) — le menu ne la montre pas aux autres.

**Ce qui marche**

- La révélation journalisée des pièces sensibles est un vrai choix de confiance, bien expliqué.
- Particulier et société sont distingués dès l'invitation.

**Constats**

| Sév. | Où | Constat |
|---|---|---|
| P1 | page entière | **Le bailleur n'a pas de fiche.** Aucune ligne ne s'ouvre (`grep "/app/owners/"` : aucun lien) ; ni ses biens, ni ses baux, ni ses reversements, ni son relevé de gérance ne sont atteignables depuis lui. Pour répondre à « Monsieur Sene appelle, il demande où en est son loyer de Mermoz », l'admin passe par Biens, filtre, ouvre, puis Baux. |
| P1 | colonne Téléphone | **Le téléphone est vide pour tous les bailleurs du seed** alors qu'ils en ont un : la cellule ne lit que `metadata.phone` (le téléphone saisi à l'invitation — `OwnersList.tsx:200-204`), jamais `user.phone`. Relevé : owner1 a `+221703757526` sur son compte, la page affiche « — ». L'admin ne peut appeler aucun bailleur depuis l'application. |
| P2 | page | Aucun chiffre : nombre de biens, biens loués / vacants, loyers du mois, dernier reversement. Aucune recherche, aucun tri (12 bailleurs ici ; 80 dans une vraie agence). |
| P2 | téléphone | Le tableau garde ses colonnes et n'en montre que deux (Nom, E-mail) ; le nom passe sur deux lignes, le statut et les actions (Renvoyer, Révoquer) disparaissent hors cadre. |
| P2 | absent | **Le plafond de travaux sans accord** (`works_approval_threshold` du profil bailleur, `docs/features.md` §1.8) n'a **aucun écran** : `grep works_approval_threshold takussan-web/src` ne rend rien. La règle « au-delà, le bailleur approuve le devis » est donc inréglable. |
| P3 | page | « Propriétaires » (titre, menu) et « bailleurs » (sous-titre) pour la même personne ; le reste de l'app dit « Bailleur » sur le bail. |

**Proposition — mobile**

```
┌──────────────────────────────────────┐
│ Bailleurs (12)               [＋]    │
│ [🔍 Nom, téléphone, bien…         ]  │
├──────────────────────────────────────┤
│ (MS) Mouhamed Sene                   │
│      6 biens · 5 loués · 1 vacant    │
│      Reversé le 5 nov. : 4 120 000 F │
│                           [📞] [💬]  │  ← appeler / WhatsApp, 44 px
├──────────────────────────────────────┤
│ (✉) Moussa Ndiaye · invitation       │
│      envoyée il y a 2 j [Renvoyer]   │
└──────────────────────────────────────┘
```

Une **fiche bailleur** en écran plein : en-tête (nom, téléphone, WhatsApp, e-mail), quatre
chiffres (biens, occupation, loyers du mois encaissés / attendus, dernier reversement), puis
onglets *Biens* · *Baux* · *Reversements et relevés* · *Pièces* (RIB, NINEA, CNI masqués avec
« Afficher » journalisé) · *Réglages* (plafond de travaux sans accord, moyens de versement).

**Proposition — bureau** — même liste en tableau triable (biens, occupation, impayés, dernier
reversement), fiche en deux colonnes. Les invitations en cours passent dans un onglet
« Invitations (n) » pour ne plus mêler les états.

**Ambition** — **Le relevé de gérance partagé** : depuis la fiche bailleur, « Envoyer le relevé
d'octobre » (PDF existant, TCK-594) par WhatsApp en un geste. C'est le moment où l'agence prouve sa
valeur chaque mois, et aujourd'hui il n'a pas d'écran.

---

## 3. Baux — `/app/leases`, `/app/leases/[id]`, `/app/leases/new`, `/app/leases/onboarding-pending`

**Rôle business.** Le bail est **l'actif qui produit le revenu récurrent** de l'agence
(commission) et du bailleur (loyer). Chaque bail en retard, chaque échéancier non généré, chaque
renouvellement oublié coûte de l'argent. La liste doit être une **file de travail** ; la fiche, le
**dossier complet** d'une location.

**Fonctions existantes — à garder** (`components/leases/*`, captures admin, bailleur, locataire)

*Liste*
1. Titre « Baux », « Nouveau bail » (selon la capacité).
2. Filtres : statut (sélecteur, aussi par `?status=` dans l'URL), bien (liste de tous les biens).
3. Ligne : référence, statut, titre du bien, dates début → fin, loyer / mois (ou prix de vente).
4. Pagination par 30 ; états chargement (squelettes), erreur (« Réessayer »), vide (avec
   « Nouveau bail »), `NoAgencyState` sans agence.

*Fiche*
5. « Retour aux baux », référence, statut, type (« Bail commercial »), alerte « N échéances en
   retard ».
6. Gestes selon `abilities` : Ajouter un document, Générer l'échéancier, Réviser le loyer,
   Enregistrer un paiement reçu, Renouveler le bail, Résilier le bail (gestion) ; Télécharger le
   contrat PDF, Donner mon préavis (locataire).
7. Chaîne des baux (renouvellements, `LeaseChainTimeline`), **panneau de signature par code**
   (`LeaseSignaturePanel`), bannière de résiliation anticipée (annulable), bannière de
   restitution de caution.
8. Durée, loyer, caution ; conditions générales et particulières.
9. Échéancier : période, date d'échéance, montant, pénalité de retard (« Pénalité à régler auprès
   de l'agence »), statut, **Quittance PDF**, « Pénalité réglée », encaissement par échéance.
10. Caution : montant initial, remboursements ; restitution (montant, retenue, motif).
11. Garants : jusqu'à 3, ajout, documents (`GuarantorSection`).
12. Invitation à laisser un avis (locataire, bail en cours ou terminé).
13. Dialogues : paiement reçu, renouvellement, préavis / résiliation, restitution, « passer
    outre ».

*Création*
14. Formulaire en trois blocs (Parties · Conditions financières · Clauses) : bien, locataire
    (recherche nom / e-mail / téléphone + liste), récapitulatif « bien / locataire / bailleur =
    titulaire du bien », type de contrat, début, fin (facultative), loyer ou prix, caution, devise,
    fréquence, jour du paiement, conditions générales, particulières ; « Annuler » / « Créer le
    bail ». Depuis une réservation (`?booking_id=`) : bien, locataire, dates et loyer préremplis.
    Lien « Publier un bien » quand aucun bien n'est éligible.

*Entrées en attente*
15. Liste des checklists d'entrée ouvertes depuis plus de 7 jours : référence du bail (lien),
    date de signature, éléments manquants, jours d'ouverture (pastille rouge au-delà de 14).

**Ce qui marche**

- La fiche porte **tout le cycle d'un bail** : signature, échéancier, quittances, pénalités,
  caution, garants, renouvellement, résiliation. Rares sont les logiciels de gestion qui vont
  aussi loin.
- Les gestes suivent les capacités renvoyées par l'API (`abilities`), pas le rôle deviné par le
  front — sauf deux (voir constats).
- La création depuis une candidature acceptée préremplit tout : le bon chemin existe.
- Quittance PDF par échéance, en un geste, au téléphone comme au bureau.

**Constats**

| Sév. | Où | Constat |
|---|---|---|
| P1 | liste | **Aucune ligne ne nomme le locataire** (`LeaseRow`, `LeasesList.tsx:211-247` : référence, bien, dates, loyer). Le premier repère est `LS-M6JG0OLF`, un code que personne ne retient. Aucune ligne ne dit non plus si le loyer est à jour. Pas de recherche (ni par locataire, ni par bien : le filtre « bien » est une liste de 200 titres). |
| P1 | fiche | **La fiche ne nomme ni le locataire, ni le bailleur, ni le bien** dans son en-tête : titre `LS-0DPA75TK`, « Actif · Bail commercial ». Le bien n'apparaît que dans l'invitation à laisser un avis, en bas, chez le locataire. Aucun lien vers le bien, le dossier du locataire, ses états des lieux, ses interventions, ses documents. |
| P1 | fiche, bailleur et personnel | **« Télécharger le contrat PDF » n'est offert qu'au locataire** : `{!isAgentSurface && <BoutonTelechargement…>}` (`LeaseDetail.tsx:228`), avec `isAgentSurface` vrai pour admin, agent **et bailleur**. Relevé au navigateur sur le bail 80 du bailleur : absent. `docs/features.md` §1.4 le promet au bailleur (🏢). |
| P1 | fiche, « Réviser le loyer » | **Deux `window.prompt()` natifs à la suite** (montant, puis motif — `LeaseDetail.tsx:140-144`) : pas d'aperçu du nouveau loyer, pas de date d'effet, pas de plafond expliqué, et au téléphone une boîte système qui ne ressemble à rien de l'application. C'est un geste qui modifie un contrat. |
| P2 | fiche, sous charge | **Écran du mauvais profil tant que l'utilisateur n'est pas chargé** : `isAgentSurface` lit `user.roles` du contexte ; tant qu'il est vide, l'admin voit « Donner mon préavis », « Télécharger le contrat PDF » et « Partagez votre expérience · Laisser un avis » — capturé une fois à 9 s d'attente sous charge (`admin-bail22-d.png`), correct à la capture suivante. Les gestes devraient tous suivre `abilities`, rendu serveur. |
| P2 | fiche, locataire | Le locataire lit les textes de l'agence : échéancier vide « **Générez l'échéancier** pour créer automatiquement les échéances du bail » — un geste qu'il ne peut pas faire (`lv-bail331-m.png`, second locataire). Le bien n'est nommé qu'au pied de la page, dans l'encart d'avis (« Avis pour Espace commercial à Amitié »), ce qui confirme le P1 ci-dessus sur un autre bail. *(Démo : ce bail a pris fin le 9 nov. 2026 et reste « Actif » avec « Donner mon préavis » ; non compté.)* |
| P2 | fiche, téléphone | **Six boutons empilés sur quatre lignes (≈ 370 px) avant la première information** ; « Générer l'échéancier » reste offert quand l'échéancier existe ; « Enregistrer un paiement reçu » (le geste le plus fréquent) est au milieu. |
| P2 | fiche, échéancier | **La caution est une ligne d'échéancier sans nom** (« 1 juil. 2026 → 1 juil. 2026 · 1 355 000 F CFA · Payé ») au milieu des loyers. « Pénalité réglée » est un bouton qui se lit comme un état. Le statut « Payé » est en terracotta (couleur de marque) au lieu de `--success`. La pénalité est en rouge sur une échéance payée. |
| P2 | locataire, liste | Le locataire (un bail) arrive sur une liste « Baux · Consultez et gérez vos contrats » avec **deux filtres** (Tous les statuts, Tous les biens) au-dessus d'une seule ligne ; son menu dit pourtant « Mon bail ». |
| P2 | locataire, fiche | « Donner mon préavis » est le **deuxième geste de la page**, contour rouge, à côté du téléchargement : l'action la plus lourde de conséquence d'un locataire est la plus visible. Aucun « prochain loyer » ni « Payer » en tête de la fiche. |
| P2 | création | **Rien ne se préremplit depuis le bien choisi** (hors réservation) : loyer à 0, caution à 0 en montant alors que l'annonce porte la caution **en mois** (`deposit_months`) ; ni la pénalité de retard (`late_fee_percent`, délai de grâce), ni la commission, ni le préavis, ni l'agent du bail ne se saisissent ici, bien que l'API les porte. « Devise » est un sélecteur à une seule option (XOF). Le formulaire est une page de 3 écrans au téléphone, bouton « Créer le bail » en bas, pas collé. |
| P2 | création | **Aucune entrée « Créer un bail » depuis la fiche d'un bien vacant** ni depuis la fiche d'un client : seuls la liste des baux et la réservation y mènent (`grep leases/new`). |
| P2 | entrées en attente | Page de menu à part entière pour une liste vide la plupart du temps ; **anglicismes** dans le titre et la description (« Onboardings en attente », « checklist d'onboarding ») ; les lignes ne nomment pas le locataire et n'offrent aucun geste (relancer, appeler). |
| P3 | liste | Les brouillons passent devant les baux actifs (tri par création) : un admin voit d'abord ce qui ne produit rien. |

**Proposition — mobile**

*Liste : une file de travail, pas un registre.*

```
┌──────────────────────────────────────┐
│ Baux                         [＋]    │
│ [🔍 Locataire, bien, référence…   ]  │
│ (À traiter 7)(En cours 259)(Brouil.14)│
│ (Fin < 60 j 6)(Préavis 4)(Terminés)  │
├──────────────────────────────────────┤
│ Mamadou Seck                 ● 6 j   │  ← le locataire d'abord
│ Garage · Ouest Foire                 │
│ 1 355 000 F / mois · oct. en retard  │
├──────────────────────────────────────┤
│ Yacine Diouf              Brouillon  │
│ Villa · Liberté 6 · début 1 janv.    │
│ À signer : 0 / 2                     │
└──────────────────────────────────────┘
```

« À traiter » rassemble ce qui demande un geste : impayé, signature en attente, échéancier non
généré, fin de bail sous 60 jours, préavis reçu, entrée incomplète (**la page « Onboardings en
attente » devient cette puce**).

*Fiche : le dossier d'une location, gestes en bas.*

```
┌──────────────────────────────────────┐
│ ←  Bail · Garage Ouest Foire     ⋯   │
│ Mamadou Seck · locataire  [📞][💬]   │
│ Bailleur : Sokhna Ba · Agent : Fall  │
│ ● Actif · 1 juil. 2026 → 30 juin 2028│
├──────────────────────────────────────┤
│ Prochain loyer : 5 déc. · 1 355 000 F│  ← l'information qui compte
│ Tout est à jour ✓                    │
│ (Échéances)(Documents)(Suivi)(Contrat)│
│ …                                    │
├──────────────────────────────────────┤
│ [ Encaisser un loyer ] [ ⋯ Gestes ]  │  ← collant
└──────────────────────────────────────┘
```

- Le **geste principal est collé en bas** (gestion : « Encaisser un loyer » ; locataire :
  « Payer » quand une échéance est due, sinon « Télécharger ma quittance ») ; les autres
  (renouveler, réviser, résilier, document, échéancier) dans une **feuille « Gestes »**, les
  destructifs en dernier et séparés.
- **Réviser le loyer** devient une feuille : nouveau montant (saisie groupée), date d'effet,
  motif, aperçu « 1 355 000 → 1 400 000 F (+3,3 %) à partir du 1 janv. », plafond rappelé.
- **Échéances** : la caution en carte séparée au-dessus (« Caution · 1 355 000 F · encaissée le
  1 juil. »), puis les loyers, l'échéance en cours en tête ; « Pénalité : 67 750 F · réglée le
  12 oct. » comme un état, l'action en menu.
- Locataire : « Donner mon préavis » descend dans « ⋯ », avec son explication (délai, pénalité)
  avant tout bouton.

*Création, au téléphone : quatre étapes courtes.* 1. **Bien** (recherche, biens vacants d'abord,
le bien ouvert préchoisi quand on vient de sa fiche) → 2. **Locataire** (recherche ou création
rapide nom + téléphone) → 3. **Conditions** préremplies depuis l'annonce (loyer, caution en mois
convertie, jour de paiement, pénalité de l'agence par défaut, commission) → 4. **Récapitulatif**
et « Créer le brouillon » / « Envoyer à la signature ». Bouton collé, aperçu du total à l'entrée.

**Proposition — bureau** — tableau triable (locataire, bien, bailleur, loyer, prochaine échéance
et son état, fin), puces « À traiter » ; fiche en deux colonnes : à gauche les onglets, à droite
une colonne collante « Parties » (locataire, bailleur, agent, garants, avec contacts) et
« Prochaine échéance ».

**Ambition**

- **Renouvellement proactif** : 90 jours avant la fin, le bail entre dans « À traiter » avec une
  proposition préparée (nouveau loyer selon la révision, durée), envoyée au locataire par
  WhatsApp, signée par code. Un bail renouvelé sans appel, c'est un mandat qui ne se perd pas.
- **Le bail se crée depuis la visite** : visite faite → « Proposer un bail » préremplit tout
  (le chemin réservation → bail existe déjà ; l'étendre à la visite).

---

## 4. États des lieux — `/app/inventories`, `/app/inventories/[id]`, `/app/inventories/new`

**Rôle business.** L'état des lieux est **la pièce qui protège la caution** — donc la relation
avec le locataire et avec le bailleur à la sortie. À Dakar, il se fait souvent mal (une feuille,
trois photos WhatsApp) ; une agence qui le fait bien, photos datées par pièce et signature des
deux parties, **vend une garantie**. C'est aussi la tâche la plus « terrain » de toute
l'application : l'agent la fait **debout, dans l'appartement, au téléphone**.

**Fonctions existantes — à garder** (`components/inventory/*`, captures admin, agent, locataire)

*Liste*
1. Titre, sous-titre, « Nouvel état des lieux » (personnel).
2. Filtres Type (entrée / sortie) et Statut.
3. Ligne : bien · référence du bail, « Réalisé le … », pastilles type (Entrée / Sortie) et statut
   (Brouillon, En attente de signature, Signé, Contesté…).

*Création*
4. Choix du bail (liste des baux éligibles, « Démarrer › ») si `?lease=` est absent.
5. Formulaire : type, état général, date et heure de réalisation, notes générales ; **pièces**
   (« Ajouter une pièce », nom, état général, notes, « Retirer ») ; **éléments par pièce** (nom
   libre, état, notes, « Retirer ») ; « Annuler » / « Enregistrer le brouillon ».

*Fiche*
6. En-tête : bien (lien « Voir le bien »), référence du bail, type, statut, état général, date,
   signatures locataire / bailleur.
7. Brouillon : édition, **photos par pièce** (sélection multiple, réduction sous 5 Mo, envoi une
   par une, reprise du reste en cas d'échec, suppression tant que brouillon), « Soumettre pour
   signature ».
8. Signatures : tracé sur canevas (`SignaturePad`), chaque partie pour elle-même
   (`can_sign_as`), mention « Une signature est immuable… L'inventaire est figé dès que les deux
   parties ont signé ».
9. « Contester » avec motif ; **PDF** une fois signé (`InventoryPdfButton`, si `signed_at`).
10. Pièces avec état et photos ; état terminal expliqué quand aucune action ne reste.

**Ce qui marche**

- Le modèle est le bon : pièces → éléments → état → photos → signatures des deux parties →
  empreinte figée → PDF. La contestation existe.
- L'envoi des photos est robuste (une par appel, réduction côté client, reprise) : pensé pour un
  réseau mobile moyen.
- Le locataire voit son état des lieux, ses signatures et ses pièces dans son espace.

**Constats**

| Sév. | Où | Constat |
|---|---|---|
| P1 | création, téléphone | **Le formulaire ne dit pas pour quel logement on travaille.** Ouvert sur `?lease=22`, l'écran titre « Nouvel état des lieux · Pièce par pièce, état et éléments, photos » : ni le bien, ni le locataire, ni l'adresse. L'agent qui en prépare deux le même jour peut se tromper de bail sans aucun signal. |
| P1 | création, téléphone | **Tout se tape, rien ne se coche.** Chaque pièce se nomme à la main, chaque élément aussi (« Canapé, Réfrigérateur… »), et **un élément coûte ≈ 520 px** (nom, état, « Retirer », notes). Un F3 (6 pièces × 8 éléments) fait ≈ 25 000 px de formulaire. Aucun modèle de pièces (Séjour, Chambre, Cuisine, Salle d'eau, Balcon) ni d'éléments par pièce (murs, sol, plafond, prises, fenêtres, porte). |
| P1 | création → fiche | **Les photos ne se prennent pas pendant la saisie.** Le formulaire promet « photos » mais n'en a pas ; elles s'ajoutent *après* « Enregistrer le brouillon », depuis la fiche, pièce par pièce. Et l'entrée de fichier n'a pas `capture="environment"` (la maintenance l'a : `MaintenanceGallery.tsx:134`) : le téléphone propose la galerie avant l'appareil photo. L'agent refait donc le tour de l'appartement. |
| P1 | fiche, signature | **Le locataire ne peut signer que depuis son propre compte** (`canSignTenant = roles.includes('tenant')` sur `can_sign_as`, `InventoryDetail.tsx:451`). Sur place, l'agent ne peut pas tendre son téléphone : si le locataire n'a pas l'app ouverte et connectée, l'état des lieux repart « en attente de signature » et la remise des clés se fait sans preuve. |
| P2 | création, choix du bail | Liste de tous les baux éligibles, sans recherche, sans locataire (« Property Test Filter - NshmtzBj · LS-EC-KQIAAS · Démarrer ») ; le type (entrée / sortie) n'est pas déduit du bail (un bail qui commence → entrée ; un préavis → sortie). Aucune entrée depuis la fiche du bail ni depuis celle du bien. |
| P2 | fiche | Titre « État des lieux #25 · Détail de l'inventaire » (l'identifiant technique) ; les signatures sont dites **deux fois** (résumé puis section) ; « Signé le 1 juil. 2026, **00:00** » ; les signataires ne sont pas nommés. |
| P2 | fiche | « Contester » est offert à **quiconque regarde** un état des lieux en attente ou signé (`canDispute` ne lit que le statut, `InventoryDetail.tsx:338`) — l'admin compris. |
| P2 | liste | Aucune ligne ne nomme le locataire ni l'agent ; rien ne signale ce qui reste **à faire** (sortie à programmer pour un préavis reçu, brouillon non soumis, signature manquante). |
| P3 | création | Les éléments après le premier n'ont pas de libellé visible (« Élément », « État » seulement sur l'index 0, `RoomEditor.tsx:174,183`) : le placeholder sert d'étiquette. L'état vide dit « Cliquez sur… » au téléphone. |
| — | démo | États des lieux « Signé » avec `signed_at` vide (n° 25) : le bouton PDF (qui lit `signed_at`) ne paraît pas. Donnée de seed, non comptée. |

**Proposition — mobile** *(la page la plus « terrain » de l'application : elle doit se faire au
pouce, une pièce à la fois)*

```
 Écran 1 — Démarrer                    Écran 2 — Une pièce
┌──────────────────────────────┐     ┌──────────────────────────────┐
│ ←  État des lieux d'entrée   │     │ ←  Séjour          2 / 6  ✓  │
│ Garage · Ouest Foire         │     │ [ 📷 Prendre une photo ]     │ ← appareil direct
│ Mamadou Seck · LS-0DPA75TK   │     │ [img][img][img]  +           │
│                              │     │ Murs        (Bon)(Usé)(Abîmé)│ ← un tap par ligne
│ Pièces du logement           │     │ Sol         (Bon)(Usé)(Abîmé)│
│ ☑ Séjour   ☑ Chambre 1      │     │ Plafond     (Bon)(Usé)(Abîmé)│
│ ☑ Chambre 2 ☑ Cuisine        │     │ Fenêtres ×2 (Bon)(Usé)(Abîmé)│
│ ☑ Salle d'eau ☐ Balcon      │     │ Prises ×4   (Bon)(Usé)(Abîmé)│
│ [＋ Autre pièce]             │     │ ＋ Ajouter un élément        │
│                              │     │ 🎤 Note vocale / texte       │
│ [ Commencer par le Séjour ]  │     │ [ Pièce suivante : Chambre 1]│ ← collé
└──────────────────────────────┘     └──────────────────────────────┘

 Écran 3 — Récapitulatif & signatures (sur place)
┌──────────────────────────────┐
│ 6 pièces · 41 éléments · 23 📷│
│ 3 réserves : Cuisine (évier), │
│ Ch. 2 (store), Sdb (joint)    │
│ ── Signer sur place ──        │
│ Locataire : Mamadou Seck      │
│ [ tracé plein écran ]         │  ← paysage proposé
│ ou [ Envoyer un code par SMS ]│
│ Agence / bailleur : [ tracé ] │
│ [ Terminer et envoyer le PDF ]│
└──────────────────────────────┘
```

- **Une pièce par écran**, état d'un élément en **trois pastilles** (Bon · Usé · Abîmé, plus
  « À signaler » qui ouvre une note), éléments **proposés** selon le type de pièce, photo par
  l'appareil (`capture="environment"`), compteur de pièces, « Pièce suivante » collé en bas.
- **Brouillon enregistré à chaque pièce** (le réseau tombe dans les cages d'escalier) et
  reprise à la pièce en cours.
- **État des lieux de sortie = celui d'entrée pré-rempli** : chaque élément montre son état
  d'entrée et sa photo ; l'agent ne note que ce qui a changé. Les écarts forment la liste des
  retenues sur caution, qui alimente la restitution (TCK-2375).
- **Signature sur place** (⚑ décision porteur, voir Synthèse) : le locataire signe sur le
  téléphone de l'agent, avec un code SMS envoyé à *son* numéro pour l'authentifier — même
  mécanisme que la signature du bail.

**Proposition — bureau** — la même progression en deux colonnes (pièces à gauche, pièce
courante à droite) ; la fiche montre les pièces en grille photo, et, pour une sortie, **la
comparaison entrée ↔ sortie côte à côte** par élément.

**Ambition**

- **Comparaison automatique entrée ↔ sortie** (`docs/features.md` §1.9, P3) qui produit le
  **calcul de retenue** sur caution : la dispute la plus fréquente entre bailleur et locataire,
  tranchée par des photos datées.
- **Modèles d'agence** : un admin enregistre « F3 standard Dakar », « Studio meublé » ; l'agent
  part d'un modèle.


## 5. Paiements — `/app/payments`, `/app/payments/return`

**Rôle business.** C'est **l'argent de l'agence et la confiance des deux autres** : le locataire
veut savoir « combien je dois, et c'est réglé ? », le bailleur « combien j'ai touché, et quand
vous me versez le reste ? », l'agence « qui n'a pas payé ? ». Une seule page sert les trois,
selon le profil (`payments/page.tsx` : client → `CustomerPayments`, sinon `PaymentsTabs`).

**Fonctions existantes — à garder** (`components/payments/*`, captures admin, bailleur, locataire)

*Locataire (`CustomerPayments`)*
1. « Prochain paiement » en tête : montant dû calculé par l'API (`amount_due`, la page
   n'additionne rien), échéance, **Payer en ligne** (choix du fournisseur : Wave, Orange Money…),
   détail loyer + pénalité incluse ou « à régler auprès de l'agence ».
2. Historique en **cartes** (pas de tableau au téléphone) : période, date de paiement, montant,
   statut, **« Quittance PDF » par ligne**, rappel de pénalité restant due.
3. Échéances lues sur un horizon de 6 mois, retards compris (TCK-2169).

*Personnel et bailleur (`PaymentsTabs`)*
4. Onglets **Historique** (registre filtrable : statut, type d'entité, ID entité, du / au ;
   référence, source bail / réservation, date, montant, statut, méthode, entité), **Factures**,
   **Reversements**, **À approuver** (`payouts.approve`), **Interventions** (factures de
   prestataires, `payouts.create`).
5. « Générer une facture », « Créer un reversement » (dialogues), détail de facture et de
   reversement.
6. **Relevé du bailleur** (`OwnerStatementPanel`, sous Reversements) : mois ou « Toute l'année
   (attestation annuelle) », Encaissé, Commission, Interventions, Net, Déjà versé ; **PDF et
   CSV**.

*Retour de passerelle (`PaymentReturnClient`)*
7. « Vérification… » au moins 800 ms, interrogation toutes les 15 s pendant 2 min, quatre issues
   (confirmé, échoué, **remboursement** quand l'échéance était annulée ou déjà réglée — TCK-596,
   en attente), « Retour aux paiements ».

**Ce qui marche**

- Le locataire a **sa** page, pensée pour sa question, en cartes, avec la quittance à chaque
  ligne : c'est la meilleure page de la famille au téléphone.
- Le montant affiché est exactement celui que la passerelle encaissera (TCK-593) ; le cas
  « débité sur une échéance annulée » a son propre écran, au lieu d'inviter à payer deux fois.
- Le relevé du bailleur existe, avec attestation annuelle et exports : c'est ce que demande un
  bailleur de la diaspora et son comptable.

**Constats**

| Sév. | Où | Constat |
|---|---|---|
| P1 | retour de paiement | **La page croit l'URL.** Quand la vérification ne rend aucun statut ou `pending`, l'indice `status=` de l'URL décide (`bucketFor`, `PaymentReturnClient.tsx:20-37`). Ouvert avec `?payment_type=lease-payments&payment_id=999999&status=success` (paiement inexistant), l'écran affiche **« Paiement confirmé · Merci ! Votre paiement a été enregistré »** (`loc-retour2-m.png`). Le cas réel est pire que le cas forgé : un paiement mobile encore `pending` (le webhook n'est pas arrivé) est annoncé **confirmé** au locataire, qui ferme la page — et s'il échoue ensuite, il se croit à jour. |
| P1 | locataire | **« Vous êtes à jour : aucun paiement en attente » au-dessus de deux pénalités dues** (67 750 F CFA en octobre et en juillet, « à régler auprès de l'agence », `loc-paie-m.png`). Choix assumé du code (une pénalité sur loyer payé n'est pas un « du », `CustomerPayments.tsx:31-33`), mais l'écran dit au locataire qu'il ne doit rien pendant que la fiche du bail, côté agence, montre « Pénalité réglée » comme une action à faire. Les deux parties lisent deux vérités. |
| P1 | bailleur, relevé | **Le chiffre que le bailleur cherche n'est pas écrit** : Encaissé 11 437 597, Commission −850 457, Net 10 587 140, Déjà versé 7 469 771… et **pas « Reste à vous verser : 3 117 369 F CFA »** ni sa date. Le relevé est sous l'onglet « Reversements », troisième onglet, sous un tableau dont la colonne Bailleur affiche « #8 » (`PayoutsTable.tsx:88`). |
| P2 | bailleur | Le menu dit **« Finances »**, la page **« Paiements »**, le sous-titre « Historique, factures et reversements **bailleurs** » — au bailleur lui-même. Son registre est celui de l'agence : « LPY-HLNI4U · Bail · Bail #63 », filtres « Type d'entité » et **« ID entité · Ex: 42 »** (un filtre de développeur), ni bien ni locataire nommés (`prop-paie-m.png`, `prop-paie-d.png`). |
| P2 | bailleur, relevé | Le mois est un `<Input type="month">` natif (`OwnerStatementPanel.tsx:108`) : rendu **« November 2026 »** dans le navigateur de l'audit, aucune maîtrise de la langue ; « Interventions **-0 F CFA** ». |
| P2 | personnel | **Deux pages pour le même registre.** Pour l'admin, `/app/payments` n'est pas au menu (catalogue `paiements` ouvert au client et au bailleur seulement) : son argent vit dans **Finances de l'agence** (`/app/agency/finances`, famille 6 §4), et cette page-ci, atteinte par « Aller à… » ou un lien, rejoue le même registre avec les mêmes filtres « Type d'entité / ID entité ». Les impayés n'y sont pas (file « Échéances impayées » du tableau de bord, `AgencyKpis`). À trancher : une page par public (voir Synthèse, décision 4). |
| P2 | personnel, téléphone | Cinq onglets sur une rangée : « Interventions » sort de l'écran sans indice de défilement ; les deux boutons d'action (« Générer une facture », « Créer un reversement ») passent **avant** les filtres et les données ; cartes de ≈ 300 px pour quatre informations, « Bail #3 » en lien comme seule identité (`admin-paie-m.png`). |
| P2 | locataire | Rien quand rien n'est dû : ni la **date du prochain loyer** (le bail 22 en a une), ni le montant à prévoir. Contre-épreuve (`locataire-vrai`, `lv-paie-m.png`) : bail LS-EC-IEJWXT actif, 500 000 F CFA / mois, **aucune échéance émise** — la page dit « Vous êtes à jour : aucun paiement en attente ». Le locataire ne peut pas distinguer « tout est payé » de « l'agence n'a jamais généré l'échéancier ». La caution apparaît comme « Loyer du 1 juil. 2026 au 1 juil. 2026 » (`loc-paie-m-2.png`). Le statut « Payé » est vert ici et terracotta sur la fiche du bail. |
| P3 | retour de paiement | Sans paramètres : « Paramètres invalides · Lien de retour incorrect » — vrai, mais un locataire qui revient d'une app de paiement mobile n'a rien à faire d'un « paramètre ». |
| P3 | locataire | L'état vide de l'historique a une icône de reçu marquée **« $ »** (`lv-paie-m.png`) : un dollar sur la page d'un locataire qui paie en F CFA. |

**Proposition — mobile**

```
 Locataire                              Bailleur
┌──────────────────────────────┐     ┌──────────────────────────────┐
│ Paiements                    │     │ Mes revenus        nov. 2026 ▾│
│ ┌──────────────────────────┐ │     │ ┌──────────────────────────┐ │
│ │ À régler                 │ │     │ │ Reste à vous verser      │ │
│ │ 135 500 F CFA            │ │     │ │ 3 117 369 F CFA          │ │
│ │ 2 pénalités de retard    │ │     │ │ virement prévu le 15 nov.│ │
│ │ à régler à l'agence  ›   │ │     │ └──────────────────────────┘ │
│ └──────────────────────────┘ │     │ Encaissé      11 437 597     │
│ Prochain loyer               │     │ Commission      −850 457     │
│ 1 355 000 F · le 5 déc.      │     │ Interventions          0     │
│ [ Payer d'avance ]           │     │ Déjà versé    −7 469 771     │
│                              │     │ [Relevé PDF] [Attestation]   │
│ Historique                   │     │ Par bien                     │
│ nov. · 1 355 000 · Payé  ⤓   │     │ Villa Almadies · 2 150 000 ✓ │
│ oct. · 1 355 000 · Payé  ⤓   │     │ Appart Mermoz  ·   505 000 ✓ │
│      + pénalité 67 750 due   │     │ Garage Foire   · 1 910 000 ⏳│
└──────────────────────────────┘     └──────────────────────────────┘
```

- **Locataire : un total, un geste.** Le bloc de tête dit ce qui reste dû, **pénalités
  comprises**, et où le régler ; quand tout est payé, il montre le prochain loyer et sa date.
- **Bailleur : le relevé d'abord.** « Reste à vous verser » en chiffre de tête, le mois en
  sélecteur traduit, la ventilation, **par bien** (loyer attendu, reçu, en retard), les
  documents. Le registre technique reste derrière « Toutes les opérations ».
- **Agence : la vue de l'argent est celle de la famille 6** (chantier A, « Tableau de l'argent »,
  sur `/app/agency/finances`) ; ici, « Créer un reversement » se propose **depuis le relevé d'un
  bailleur**, pas en bouton de page.
- **Retour de paiement :** ne jamais dire « confirmé » sans statut serveur. « Paiement en cours
  de confirmation — vous recevrez un SMS » + quittance quand elle arrive.

**Proposition — bureau** — même hiérarchie ; pour l'agence, tableau des échéances du mois
(locataire, bien, montant, statut, relance) à côté du registre ; pour le bailleur, relevé à
gauche, détail par bien à droite.

**Ambition**

- **Relance automatique graduée** (J+1 SMS, J+5 WhatsApp, J+10 appel de l'agent) avec le lien
  de paiement prérempli (le paiement par lien existe déjà, `components/pay/*`).
- **Versement au bailleur programmé** (date fixe du mois) et notifié avec le relevé PDF joint.

## 6. Documents — `/app/documents`, `/app/documents/[id]`

**Rôle business.** Le **coffre** du dossier : pièces d'identité, contrats signés, quittances,
RIB, NINEA, assurances, rapports d'état des lieux. Pour une agence, c'est ce qu'on lui demande
en cas de litige ; pour un locataire ou un bailleur, c'est « où est mon contrat ? ».

**Fonctions existantes — à garder** (`components/documents/*`, captures admin et locataire —
la démo n'a **aucun document** pour ces comptes, la fiche n'a pu être vue que dans le code)

*Bibliothèque (`DocumentsLibrary`)*
1. Compteur, recherche, filtre par **catégorie** (pièce d'identité, passeport, contrat de bail,
   quittance, facture, assurance, rapport d'état des lieux, photo, RIB, NINEA, autre) et par
   **entité** rattachée (bien, bail, utilisateur), pagination.
2. « Téléverser » ; état vide pédagogique : exemples (« Titre foncier », « Bail signé »,
   « Quittance », « Facture », « Pièce d'identité du propriétaire ») et à quoi rattacher.
3. Par document : vérifié / non vérifié, versions, télécharger, partager, supprimer (avec
   confirmation).

*Téléversement (`DocumentUploadDialog`)*
4. Glisser-déposer ou sélection, taille maximale contrôlée, nom, catégorie, **date
   d'expiration**, rattachement (type + ID), description.

*Fiche (`DocumentDetailClient`, `DocumentVersionsList`, `DocumentShareDialog`)*
5. Statut de vérification, version active, expiration, commentaire, retour.
6. **Versions** : nouvelle version avec commentaire, restauration d'une ancienne.
7. **Lien de partage** : durée, nombre de téléchargements maximal, mot de passe, liste des liens
   actifs avec usages et révocation.

**Ce qui marche**

- Le modèle est complet et sérieux : versions, expiration, vérification, partage par lien avec
  mot de passe et quota. Pour un avocat, un notaire ou une banque, le lien de partage est
  exactement l'outil attendu.
- L'état vide explique quoi déposer et pourquoi, avec des exemples du métier.

**Constats**

| Sév. | Où | Constat |
|---|---|---|
| P1 | locataire, bailleur | **Les documents que la plateforme produit ne sont pas dans « Documents ».** Le locataire de la démo a 6 quittances PDF (page Paiements), un contrat (fiche du bail), un état des lieux ; sa page Documents dit **« 0 document »** (`loc-docs-m.png`). Le menu « Mon logement › Documents » promet le coffre ; il ne contient que ce qui a été téléversé à la main. |
| P2 | téléversement | Le rattachement se fait par **type d'entité + ID numérique** (« attached_to », « entity_id » dans le dialogue) : il faut connaître le n° du bail. Depuis une fiche (bien, bail) le bouton `AddDocumentButton` préremplit — mais la fiche du bien n'a pas d'onglet Documents (§1). |
| P2 | locataire | Le texte de l'état vide est celui de l'agence : « … de vos biens, baux et clients », exemples « Titre foncier », « Pièce d'identité du propriétaire » (`loc-docs-m.png`). |
| P2 | téléphone | État vide : « **Glissez-déposez** » au téléphone ; deux boutons « Téléverser » (en-tête et état vide) ; le téléversement n'offre pas l'appareil photo (`accept` sans `capture`, `DocumentUploadDialog.tsx:220`) alors que la pièce d'identité se photographie. |
| P2 | partout | Aucun signal d'**expiration proche** dans la liste ni ailleurs (assurance, pièce d'identité) alors que la date est saisie. |
| — | démo | 0 document pour l'admin Dakar Immo et pour les deux locataires (`locataire-f4`, `locataire-vrai` : même page, même texte d'agence, `lv-docs-m.png`) : fiche, versions et partage non vus en vrai. |

**Proposition — mobile**

```
┌──────────────────────────────┐
│ Documents                     │
│ (Tout)(Bail)(Paiements)(Pièces)│
│ ── Mon bail ──                │
│ 📄 Contrat de bail signé      │  ← produit par la plateforme
│ 📄 État des lieux d'entrée    │
│ ── Quittances 2026 ──         │
│ 📄 nov. · oct. · sept. … (6) ⤓│
│ ── Mes pièces ──              │
│ 🪪 Pièce d'identité  expire   │
│    dans 42 jours  ⚠           │
│ [ 📷 Ajouter une pièce ]      │  ← appareil photo
└──────────────────────────────┘
```

- **Un coffre qui se remplit seul** : contrat, quittances, états des lieux, relevés et factures
  apparaissent automatiquement, groupés par dossier (le bail, le bien, l'année), à côté de ce
  qui est téléversé.
- **Ajouter depuis le contexte** (fiche bien / bail / client) — jamais par ID ; au téléphone,
  l'appareil photo d'abord.
- **Expirations visibles** : pastille « expire dans 42 jours » et rappel.

**Proposition — bureau** — arborescence par dossier à gauche (Biens › Bail › Pièces), liste au
centre, aperçu à droite avec versions et liens de partage.

**Ambition**

- **Dossier de location à partager** : un lien unique (mot de passe, 7 jours) qui rassemble les
  pièces du candidat pour le bailleur — le partage existe déjà document par document.

## 7. Maintenance — `/app/maintenance`, `/app/maintenance/[id]`, `/app/maintenance/new`, `/app/maintenance/providers`

**Rôle business.** La maintenance est **le service que le bailleur paie** en confiant son bien :
une fuite réparée en deux jours, c'est un locataire qui reste et un bailleur qui ne reprend pas
la gestion. C'est aussi un circuit à **quatre acteurs** (locataire qui signale, agence qui
dispatche, prestataire qui intervient, bailleur qui approuve le devis), où chacun n'attend
qu'une chose de l'écran : **savoir si c'est à lui de bouger**.

**Fonctions existantes — à garder** (`components/maintenance/*`, `components/service-providers/*`,
captures admin, agent, bailleur, locataire, prestataire)

*Liste (`MaintenanceList`)*
1. Filtres Statut et Priorité ; « Nouvelle demande » (personnel, bailleur, locataire).
2. Section **« Urgences prioritaires »** puis « Autres demandes » ; carte : titre, métier, date,
   « Prévu … », bien · quartier · agence, pastilles priorité (Urgente, Élevée, Normale, Faible) et
   statut.
3. Prestataire : **« Mes factures d'intervention »** sous la liste (référence, intervention,
   montant, statut « À valider »…).

*Signalement (`MaintenanceNewLauncher`, `MaintenanceForm`)*
4. Choix du bien (prérempli pour le locataire qui n'en a qu'un), titre avec exemple (« Fuite
   sous l'évier cuisine »), description, catégorie (métier), **priorité en quatre grandes
   tuiles**, jusqu'à 20 photos, « Signaler le problème ».

*Fiche (`MaintenanceDetail`, le serveur dit ce qui est permis — `abilities`, TCK-592)*
5. Titre, métier, création, priorité, statut, description ; bien et adresse, demandeur, assigné
   à, prévu le, coût réel.
6. **« Prestataire et créneau »** : choix dans le carnet, créneau date-heure, « Inviter un
   nouveau prestataire », « Enregistrer ».
7. Frise Demande créée → Devis → En cours → Terminée.
8. **Devis** : demander, soumettre (prestataire, pièce jointe), approuver / refuser avec motif
   (bailleur au-dessus du seuil, ADR-0037), PDF.
9. **Prestataire** : « Cette intervention vous est confiée — acceptez-la pour voir l'adresse et
   le contact du locataire, ou refusez-la », photos avant / après **à l'appareil**
   (`capture="environment"`), kit d'accès, rapport de fin avec coût et photos.
10. **Locataire** : « L'intervention est terminée — Le problème est-il réglé ? Sans réponse de
    votre part, la demande sera close dans 7 jours » → **« C'est réparé » / « Le problème
    persiste »** (avec photos).
11. « Changer le statut » (transitions permises), notes de résolution, historique par bien
    (`MaintenanceHistoryByProperty`).

*Carnet (`/app/maintenance/providers`, admin)*
12. Nom, téléphone, métiers, zones, statut ; « Ajouter un prestataire » (invitation),
    renvoyer / révoquer une invitation.

**Ce qui marche**

- Le circuit est **complet et juste** : devis, approbation du bailleur au-dessus d'un seuil,
  acceptation par le prestataire avant de voir l'adresse, confirmation par le locataire avec
  clôture automatique. Peu de logiciels de gestion locative ont ce niveau.
- La fiche du locataire est la bonne : une question, deux réponses, un délai écrit
  (`loc-maint-44-m-1.png`).
- Le prestataire prend ses photos à l'appareil, et le serveur décide des boutons (plus de bouton
  voué au 422).
- Les tuiles de priorité du signalement sont de vraies cibles de pouce.

**Constats**

| Sév. | Où | Constat |
|---|---|---|
| P1 | liste, personnel | **La liste ne dit pas ce qui attend qui.** « Urgences prioritaires » trie par **priorité seule, statut ignoré** (`MaintenanceList.tsx:170`) : la section rouge de l'admin s'ouvre sur « Urgence réparée en 2h · **Terminée** » et « Chasse d'eau… · **Terminée** » ; celle du prestataire et du bailleur ne contient **que** des demandes terminées (`pre-maint-m.png`, `prop-maint-m.png`). Pendant ce temps, la demande #8 est « Ouverte » **depuis le 14 sept.**, non assignée, et la #9 « En cours » avec un créneau **dépassé depuis le 27 sept.** (`adm-maint-8-m.png`, `adm-maint-9-m-1.png`) : aucune ancienneté, aucun retard, aucun « sans prestataire » ne se voit. |
| P1 | signalement, locataire, téléphone | **La photo vient en dernier et n'ouvre pas l'appareil.** Le locataire qui voit une fuite doit choisir un bien, taper un titre, une description, une catégorie (préremplie « Autre »), une priorité, puis trouver « Photos (optionnel) » sous un **champ de fichier natif non stylé** — « Choose Files · No file chosen » dans le navigateur de l'audit — sans `capture` (`MaintenanceForm.tsx:176`) alors que les trois autres entrées de photo de la maintenance l'ont (`MaintenanceGallery.tsx:134`, `MaintenanceCompleteForm.tsx:127`, `MaintenanceResolutionResponse.tsx:83`). |
| P2 | fiche, personnel | **La machine à états est exposée.** Sur une demande « Ouverte, Non assignée » : « Changer le statut » offre **Terminée, Prise en compte, Assignée, En cours** en quatre boutons terracotta de même poids, plus « Annulée » (`adm-maint-8-m-2.png`) — « Assignée » sans prestataire, « Terminée » sans intervention. Le geste attendu (choisir un prestataire et un créneau) est dans un autre bloc, plus haut, avec son propre « Enregistrer ». |
| P2 | fiche, prestataire | **« J'accepte » sur une intervention terminée** (#32 « Terminée », coût réel 268 035 F CFA, notes de résolution : le bandeau « Cette intervention vous est confiée… J'accepte » est affiché, `pre-maint-32-m-1.png`). `can_accept` ne regarde que `accepted_at` et l'état terminal, et `completed` n'est pas terminal (`MaintenanceRequestResource.php:192`). La démo n'a pas posé `accepted_at`, mais le cas est atteignable : l'agence peut passer une demande à « Terminée » sans que le prestataire ait accepté (constat précédent). |
| P2 | fiche | Titre « Demande #8 · Suivi de l'intervention » ; frise à **quatre** étapes pour **douze** statuts (`MaintenanceStatus.php` : ouverte, prise en compte, devis demandé, devis soumis, attente bailleur, approuvée, refusée, assignée, en cours, terminée, close, annulée) — « Attente du bailleur » n'a pas d'étape ; bloc Devis « Montant — · Soumis le — · Décision Approuvé » (`adm-maint-9-m-2.png`). |
| P2 | fiche, locataire | Le locataire voit **« Coût réel 124 198 F CFA »** — la facture d'un travail payé par le bailleur, marge éventuelle de l'agence comprise. À décider (voir Synthèse). |
| P2 | prestataire | « Mes factures d'intervention » : tableau qui **déborde au téléphone** (« MONTA… » coupé, statut invisible), interventions désignées par « #41 », « #26 »… dont plusieurs ne sont pas dans la liste au-dessus ; ni total à encaisser ni date de paiement. Le prestataire n'a pas de vue « mes interventions de la semaine » (créneaux). |
| P2 | carnet | Colonne Téléphone **vide pour les six prestataires** : elle ne lit que `metadata.phone` saisi à l'invitation (`ServiceProvidersList.tsx:148`), comme la liste des propriétaires (§2). Ni note, ni interventions réalisées, ni délai moyen ; pas de fiche prestataire ; au téléphone, Statut et Actions sortent de l'écran (`adm-prest-m.png`). |
| P2 | partout | Le menu dit **« Interventions »** (onglet coupé « Interventio… » au téléphone), la page **« Maintenance »**, la fiche « Demande ». Le carnet est sous « Plus » pour l'admin. |
| P3 | signalement, personnel | Écran « Nouvelle demande » d'abord vide sous le sélecteur de bien (≈ 1 000 px de blanc au téléphone, `adm-maint-new-m.png`) : rien n'indique que le formulaire apparaîtra. |
| P3 | liste, locataire | Liste vide sans aucun filtre : « Aucune demande ne correspond à ces filtres. Créez-en une pour signaler un problème sur un bien » (`lv-maint-m.png`, second locataire) — le texte du filtre sans résultat sert d'état vide, et « un bien » au lieu de « votre logement ». |
| — | démo | Aucune demande « devis soumis », « attente bailleur » ni « contestée » dans la démo : approbation du bailleur et contestation non vues en vrai. |

**Proposition — mobile**

```
 Agence — à dispatcher                 Locataire — signaler
┌──────────────────────────────┐     ┌──────────────────────────────┐
│ Interventions                │     │ ←  Signaler un problème      │
│ (À dispatcher 3)(En retard 1)│     │ Garage · Ouest Foire         │
│ (Chez le bailleur 1)(Toutes) │     │ [ 📷 Prendre une photo ]     │ ← d'abord
│ ┌──────────────────────────┐ │     │ [img][img] +                 │
│ │ ⚠ Surpresseur en panne   │ │     │ C'est quoi ?                 │
│ │ Bureaux Hann Maristes    │ │     │ (💧Eau)(⚡Électricité)(🚪Porte)│
│ │ Aïssatou Diop · prévu    │ │     │ (🐜Nuisibles)(🔧Autre)        │
│ │ 27 sept. — 44 j de retard│ │     │ C'est urgent ?               │
│ │ [Relancer] [Réassigner]  │ │     │ (Oui, ça coule)(Ça peut      │
│ └──────────────────────────┘ │     │  attendre quelques jours)    │
│ ┌──────────────────────────┐ │     │ En deux mots (optionnel)     │
│ │ Nettoyage cage escalier  │ │     │ [ Fuite sous l'évier…      ] │
│ │ ouverte depuis 57 j      │ │     │ 🎤 ou un message vocal        │
│ │ [ Choisir un prestataire]│ │     │ [ Envoyer à l'agence ]       │
│ └──────────────────────────┘ │     └──────────────────────────────┘
└──────────────────────────────┘
```

- **Files par état d'attente**, pas par priorité : « À dispatcher », « En retard » (créneau
  passé), « Devis chez le bailleur », « À confirmer par le locataire », « Terminées ».
  L'ancienneté et le retard en clair sur chaque carte.
- **Fiche = un geste principal selon l'état** (dispatcher → choisir prestataire et créneau ;
  en cours → relancer ; terminée → attendre la confirmation), les autres transitions dans un
  menu « Autre action ».
- **Signalement photo d'abord**, catégories en pictogrammes, urgence dite en mots du
  locataire, description optionnelle (le titre se déduit de la catégorie), note vocale
  (les pictogrammes du croquis sont les icônes Lucide de la charte, pas des émojis).
- **Prestataire : « Ma semaine »** (créneaux, adresse après acceptation, itinéraire), puis
  « À facturer » et « Payé » avec totaux.

**Proposition — bureau** — tableau Kanban par état d'attente (colonnes ci-dessus) avec
glisser-déposer pour assigner ; fiche en deux colonnes (demande et photos à gauche, journal et
action à droite) ; carnet prestataires avec note moyenne, délai moyen, interventions du mois.

**Ambition**

- **Dispatch suggéré** : le carnet connaît métiers et zones ; proposer les deux prestataires
  du bon métier les plus proches et les plus rapides, à valider d'un geste.
- **Note du prestataire par le locataire** au moment du « C'est réparé » (`docs/features.md`
  §1.8 la prévoit) : elle nourrit le carnet.

---

## Navigation de la famille — bureau et téléphone

**Ce qui existe** (`lib/navigation/dispositions.ts`)

- **Admin d'agence, bureau** : groupe *Portefeuille* (Biens, Propriétaires, Clients (CRM), Baux,
  Onboardings en attente) ; **Maintenance, Carnet prestataires, États des lieux, Documents sont
  sous « Plus »**, replié. Paiements n'y est pas (l'argent est dans *Finances*, famille 6).
  **Téléphone** : onglets Accueil · Demandes · Biens · Messagerie · Menu.
- **Agent** : groupe *Gestion*, **le dernier** du menu, après le tableau de bord (Baux, Entrées en
  attente, États des lieux, Interventions, Commissions). Onglets Accueil · Demandes · Visites ·
  Messagerie · Menu — aucune page de la famille.
- **Bailleur** : groupe *Mon patrimoine* (Mes biens, Baux, **Finances** → page « Paiements »,
  États des lieux) ; *Interventions* sous *Activité* ; Documents sous « Plus ». Onglets Accueil ·
  Mes biens · Demandes · Messagerie · Menu.
- **Locataire** : groupe *Mon logement* (Mon bail, Paiements, Interventions, États des lieux,
  Documents), action de tête « Payer mon loyer ». Onglets Accueil · Paiements · Interventions ·
  Messagerie · Menu — **la meilleure disposition de la famille**.
- **Prestataire** : Interventions, Messagerie, Documents, Tableau de bord ; mêmes onglets.

**Constats**

| Sév. | Constat |
|---|---|
| P1 | **Pour l'admin, la moitié de la gestion locative est sous « Plus »** : maintenance, prestataires, états des lieux, documents. Le menu d'une agence de gestion range comme secondaire ce qui fait son mandat ; au téléphone, chacune de ces pages est à trois touches (Menu → Plus → page). |
| P2 | **Un objet, trois noms** : *Maintenance* (admin, titre de page) / *Interventions* (menus des autres) / *Demande #8* (fiche) ; *Finances* (menu du bailleur) / *Paiements* (page) ; *Onboardings en attente* (menu admin) / *Entrées en attente* (menu agent) / « Onboarding » dans la page ; *Biens* / *Mes biens* / *Tous les biens*. |
| P2 | **Aucun fil entre les pages de la famille** : du bien on ne va ni au bail, ni au locataire, ni aux interventions, ni aux documents ; du bail on ne va pas à l'état des lieux ni aux paiements de ce bail ; de l'intervention on va au bien mais pas au bail. Chaque page est une liste qui s'ouvre sur une fiche cul-de-sac. |
| P2 | Les fiches (bien, bail, état des lieux, intervention) ont un « Retour » **dans le corps** de la page au téléphone, et aucune n'a de titre dans l'en-tête de la coque (cf. famille 3, chantier B). |
| P3 | L'onglet du locataire et du prestataire est coupé : « Interventio… ». |

**Proposition** *(s'appuie sur la coque de la famille 3, chantier B)*

- **Le bien est le pivot** : sa fiche porte des onglets *Annonce · Location · Interventions ·
  Documents* ; le bail, l'état des lieux, les paiements et les interventions y sont **à une
  touche**, et chaque fiche enfant a un fil « Villa Almadies › Bail LS-0DPA75TK ».
- **Admin et agent, bureau** : un groupe **Gestion locative** visible, juste après
  *Portefeuille* — Baux (avec « Entrées en attente » comme filtre), États des lieux,
  Interventions, Prestataires, Documents. Rien de la gestion sous « Plus ».
- **Agent, téléphone** : l'onglet *Visites* devient **« Terrain »** quand l'agent a des états des
  lieux ou des interventions programmés (visites + EDL + rendez-vous prestataire du jour) — à
  croiser avec la famille 5, chantier B « L'agent sur le terrain ».
- **Un seul nom par objet** : « Interventions » partout (la page, le menu, la fiche
  « Intervention — Surpresseur en panne ») ; « Paiements » pour le locataire, **« Mes revenus »**
  pour le bailleur ; « Entrées en attente » partout.

---

## Transversal — ce qui touche toute la famille

1. **Les identifiants techniques remplacent les personnes.** « Bail #63 », « #8 » (bailleur),
   « Demande #8 », « État des lieux #25 », « #41 » (facture prestataire), « ID entité · Ex: 42 ».
   Dans toute la famille, **aucune liste ne nomme le locataire** (baux, états des lieux,
   paiements, interventions côté agence). La gestion locative se fait avec des noms :
   « Mamadou Seck, Garage Ouest Foire ».
2. **Le téléphone lu au mauvais endroit, deux fois** : propriétaires (`OwnersList.tsx:200-204`)
   et prestataires (`ServiceProvidersList.tsx:148`) n'affichent que `metadata.phone` saisi à
   l'invitation ; `user.phone` est ignoré. Résultat : des colonnes Téléphone vides dans un pays
   où **tout passe par le téléphone et WhatsApp** — et aucun bouton Appeler / WhatsApp nulle
   part dans la famille.
3. **L'appareil photo n'est proposé qu'à moitié** : maintenance du prestataire et résolution du
   locataire oui (`capture="environment"`) ; signalement du locataire, état des lieux, documents
   non (`MaintenanceForm.tsx:176`, `InventoryPhotos`, `DocumentUploadDialog.tsx:220`) — là où la
   photo est la preuve.
4. **Des statuts sans ancienneté.** Bail « En attente de signature », intervention « Ouverte »,
   état des lieux « En attente de signature », facture « À valider » : aucun ne dit **depuis
   quand**, aucun ne passe « en retard ». Les files d'attente ne se vident pas sans âge.
5. **Machines à états exposées** : « Changer le statut » de l'intervention, révision du loyer par
   `window.prompt`, « Pénalité réglée » en bouton — l'écran propose les transitions du modèle,
   pas le geste suivant du métier.
6. **Tableaux qui débordent au téléphone** : propriétaires, carnet prestataires, factures du
   prestataire, colonnes coupées sans indice de défilement. Le motif `carteMobile` (famille 6,
   chantier D) s'applique tel quel.
7. **Champs natifs non traduits** : `<input type="month">` du relevé (« November 2026 ») et
   `<input type="file">` du signalement (« Choose Files · No file chosen ») suivent la langue du
   navigateur, pas celle de l'application.
8. **Couleurs de statut incohérentes** : « Payé » vert (paiements) et terracotta (fiche du
   bail) ; la terracotta est la couleur d'action de la charte — un statut ne doit pas la porter.
9. **Le bien n'a pas de vie locative** (§1) : c'est la cause commune des constats 1, 3 et de la
   navigation. La fiche du bien est une fiche d'annonce.

---

## Synthèse de la famille 4

**Comptes** : P0 = 0 · P1 = 20 · P2 = 42 · P3 = 10 (lignes des tableaux de constats des sept
sections et de la navigation ; les lignes « démo » ne comptent pas).

### Les chantiers qui rapportent le plus

| # | Chantier | Pages | Pourquoi d'abord |
|---|---|---|---|
| A | **Le bien comme dossier locatif** : fiche du bien avec occupation (locataire, bail, prochain loyer, impayé), onglets *Annonce · Location · Interventions · Documents*, liste en mode **Gestion** (occupé, vacant, en retard) à côté du mode **Annonces** ; « Publié » au seul sens public ; **fiche du bailleur** (biens, reste à verser, réglages du mandat) | 1, 2, navigation | Cinq P1 ; c'est le pivot de toute la famille et de la navigation |
| B | **Le bail qui se lit et se traite** : liste « À traiter » (signature, préavis, révision, impayé) avec locataire et bien nommés ; fiche-dossier avec parties nommées, geste principal collé, révision en feuille ; création en 4 étapes préremplie depuis le bien ou le client | 3 | Quatre P1 ; le bail porte l'argent de l'agence |
| C | **L'état des lieux au pouce** : une pièce par écran, pièces et éléments proposés, trois pastilles d'état, photo à l'appareil pendant la saisie, sortie préremplie par l'entrée, signature sur place | 4 | Quatre P1 ; la tâche la plus « terrain », et la protection de la caution |
| D | **L'argent lisible pour le locataire et le bailleur** : locataire « un total, un geste » (pénalités comprises, prochain loyer) ; bailleur « Mes revenus » avec **reste à verser** et détail par bien ; retour de paiement qui ne dit jamais « confirmé » sans le serveur | 5, 2 | Trois P1 dont un correctif de confiance immédiat (retour de paiement) |
| E | **Interventions par état d'attente** : files « À dispatcher / En retard / Chez le bailleur / À confirmer », ancienneté sur chaque carte, un geste principal par état, signalement photo d'abord, « Ma semaine » du prestataire | 7 | Deux P1 ; c'est le service que le bailleur paie |
| F | **Un coffre qui se remplit seul** : contrat, quittances, états des lieux, relevés dans Documents ; ajout depuis le contexte, appareil photo, expirations visibles | 6 | Un P1 ; « où est mon contrat ? » est la première question du locataire |
| G | **Socle de la famille** : noms à la place des « #63 », téléphone lu sur `user.phone` + boutons Appeler / WhatsApp, `capture` partout où la photo est une preuve, âge des statuts, tableaux en cartes, champs natifs remplacés, couleurs de statut | toutes | Petits correctifs, grand effet ; prérequis de A à F |

**Correctifs qui n'attendent pas les maquettes** (comportement faux, pas un choix de design) :
retour de paiement qui croit l'URL (§5) ; « J'accepte » sur une intervention terminée (§7) ;
« Urgences prioritaires » qui inclut les terminées (§7) ; colonnes Téléphone vides (§2, §7) ;
lien du contrat PDF refusé au bailleur et au personnel (§3).

### Décisions qui reviennent au porteur

1. **Signature du locataire sur place** (état des lieux, et par extension le bail) :
   a. Le locataire signe sur le téléphone de l'agent, authentifié par un **code SMS** envoyé à
      son numéro. *(recommandé : c'est le moment de la remise des clés ; le code garde la preuve
      d'identité)*
   b. Le locataire signe sur le téléphone de l'agent, sans code (l'agent atteste).
   c. Inchangé : chacun signe depuis son compte.
2. **Le sens de « Publié »** :
   a. « En ligne » = visible du public (statut publié **et** visibilité publique) ; les deux
      autres sens deviennent « Validé » (statut) et « Public / Réseau / Privé » (visibilité).
      *(recommandé)*
   b. Garder « Publié » pour le statut et renommer le seul indicateur.
3. **« Entrées en attente » (onboarding)** :
   a. Un filtre de la liste des baux (« En attente du locataire »), la page dédiée disparaît du
      menu. *(recommandé : c'est un état du bail, pas un objet)*
   b. Garder la page, renommée « Entrées en attente » partout.
4. **`/app/payments` pour le personnel** :
   a. La page devient celle du **locataire et du bailleur** seulement ; le personnel passe par
      Finances de l'agence (famille 6), qui reçoit factures, reversements et factures de
      prestataires. *(recommandé : une page par public, un seul registre)*
   b. Garder la page aux trois publics avec des onglets par profil.
5. **Pénalités de retard dans le « à régler » du locataire** :
   a. Les compter dans le total dû, avec « à régler à l'agence » quand elles ne se paient pas en
      ligne. *(recommandé : le locataire et l'agence lisent la même dette)*
   b. Les laisser hors du total, rappelées sous le loyer concerné (actuel).
6. **Coût réel d'une intervention visible du locataire** :
   a. Non : le locataire voit le prestataire, le créneau et le résultat ; le coût est pour
      l'agence et le bailleur. *(recommandé)*
   b. Oui, comme aujourd'hui.
7. **Modèles d'état des lieux par agence** (pièces et éléments proposés) :
   a. Un modèle Takussan par type de bien (studio, F2, F3, villa, local), modifiable par
      l'agence. *(recommandé)*
   b. Modèles entièrement définis par chaque agence.
   c. Pas de modèle, saisie libre (actuel).

> **Rappel de la condition du porteur (2026-11-08)** : rien ne s'implémente avant d'avoir été vu
> en maquette statique. Le brief de maquettes de cette famille est
> `audit-app/briefs/famille-4.json` (scratchpad).

## Maquettes choisies le 2026-11-10

> **Le porteur a validé la recommandation de chaque page**, avec les compléments ci-dessous. Les
> maquettes ont été retouchées le jour même ; la visionneuse marque l'approche « retenue ». Elles
> sont la **référence de fidélité** des tickets à écrire (cf. README). Rien ne s'implémente avant
> que le porteur dise comment attaquer l'implémentation (qui se fera sur Opus 5.5).

| Page | Approche retenue | Visionneuse |
|---|---|---|
| Biens | A — Deux modes : Gestion et Annonces | `?p=app-biens&a=a` |
| Bailleurs | A — La fiche-compte du bailleur | `?p=app-bailleurs&a=a` |
| Baux | A — La file « À traiter » puis le dossier | `?p=app-baux&a=a` |
| États des lieux | A — Une pièce par écran | `?p=app-etats-des-lieux&a=a` |
| Paiements | A — Un total, un geste — et « Mes revenus » | `?p=app-paiements&a=a` |
| Interventions | A — Files par état d’attente | `?p=app-interventions&a=a` |
| Documents | A — Le coffre par dossier | `?p=app-documents&a=a` |
