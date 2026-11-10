# Famille 5 — Commercial : demandes, prospects, clients, visites, réservations, tâches, agenda

> Audit du 2026-11-10 sur `dev` (1bce3798a). Méthode et limites : [README](README.md).
> Personas : `admin` (admin@dakarimmo.sn, admin d'agence), `agent` (agent1@dakarimmo.sn),
> `proprietaire` (owner1@dakarimmo.sn), `locataire` (customer@agency1.demo.takussan.sn).
> Bureau 1440 × 900, téléphone 390 × 844 tactile. Captures : `scratchpad/audit-app/captures/f5/`.
> Côté client : la persona `locataire` est un **client sans bail** (onglets Favoris, Visites), sans
> visite ni réservation ; revérifié avec `locataire-vrai` (bail actif, onglets Paiements,
> Interventions) : **2 visites passées, mais « Visites » s'ouvre sur « Demandées 0 » (« Aucune visite
> demandée ») et « Réservations » sur « En attente » vide** — même défaut d'onglet par défaut que pour
> le personnel (§ 5) ; `proprietaire` voit les visites
> de ses biens (9 demandées, 30 passées) dans les mêmes composants que le personnel.

**Pages de la famille** (sous `/app`) :

1. Demandes de contact — `/app/leads`
2. Clients (CRM) — `/app/customers`, `/app/customers/[id]`, `/app/customers/new` (`/app/crm` redirige ici)
3. Pipeline — `/app/crm/pipeline`
4. Visites — `/app/visits`, `/app/visits/[id]`
5. Réservations — `/app/bookings`, `/app/bookings/[id]`
6. Tâches — `/app/tasks`
7. Agenda — `/app/calendar`

**Qui vient ici, et pour quoi.** La famille commerciale est l'atelier de l'**agent** — et, plus
rarement, de l'admin d'agence qui répartit et contrôle. Trois situations, à servir différemment :

- **l'agent sur le terrain, au téléphone, entre deux visites** (le cas qui compte) : une notification
  « nouvelle demande » arrive, il doit **répondre en moins d'une heure** (WhatsApp d'abord, c'est le
  canal du marché), proposer une visite, puis, la visite faite, **noter en trente secondes** ce que le
  client a dit et la suite à donner. Une main, un pouce, une connexion moyenne ;
- **l'admin d'agence au bureau** : il répartit les demandes non attribuées, voit ce qui traîne
  (demandes sans réponse, visites non confirmées), mesure la conversion de l'équipe ;
- **le bailleur** (propriétaire en gestion directe) et **le client** : le premier reçoit les demandes
  de ses biens quand aucun agent n'en est le contact ; le second suit ses visites et ses réservations.

**La mesure de succès de la famille est le délai et le taux de passage d'une étape à la suivante** :
demande → réponse (minutes), réponse → visite (jours), visite → offre / candidature / bail. Chaque
page se juge à ça : *combien de gestes pour passer à l'étape suivante, et le dossier suit-il ?*

> **Environnement.** Mesures sous charge (load average 16 à 30 sur 8 cœurs, d'autres agents
> travaillaient) : plusieurs captures ont rendu un squelette ou l'erreur racine « Une erreur est
> survenue » (`TimeoutError` du rendu serveur, borne de 30 s) ; elles ont été refaites. Les durées ne
> sont pas jugées. L'outil de capture commun visait `127.0.0.1:3000`, que le CORS de l'API refuse
> (`FRONTEND_URL=http://localhost:3000`) : **toutes les données chargées côté navigateur
> échouaient** (« Les demandes n'ont pas pu être chargées »). Captures refaites sur `localhost`.
> La persona `agent` reçoit à chaque passage la fenêtre de bienvenue (« Vos leads ») : elle a été
> masquée dans la page, sans l'acquitter. La pastille ronde (palmier) en bas à gauche est le bouton des outils de
> développement de TanStack Query, absent en production : elle masque le début du libellé du compte
> et l'onglet « Accueil » sur les captures.
>
> **Données de démo** (signalées une fois, non comptées) : 139 visites « demandées » dont aucune
> confirmée à venir, des visites « terminées » datées de la fin du mois, un destinataire nommé
> « Property Owner », des métiers tirés au hasard (« Rogneur », « Pilote fluvial »), 0 tâche pour
> l'admin.

---

## 1. Demandes de contact — `/app/leads`

**Rôle business.** C'est **l'entrée du chiffre d'affaires** de l'agence : chaque ligne est quelqu'un
qui a levé la main sur un bien. Le délai de première réponse décide du reste (au Sénégal comme
ailleurs, le chercheur écrit à trois agences et visite avec la première qui rappelle). La page doit
faire répondre vite, et ne jamais laisser une demande sans propriétaire.

**Fonctions existantes — à garder**

- Onglets **À traiter** (défaut) · **Traitées** · **Toutes**, dans `?filtre=` ; total de l'onglet
  actif ; retour en page 1 au changement d'onglet (`ContactLeadsInbox.tsx:75-105`).
- `?lead={id}` : la demande désignée (lien de notification) en tête, encadrée, retirée de la liste
  (`:50-54`, `:107-131`).
- Carte : nom (ou « Visiteur »), « À propos de « bien » » → fiche publique, ou « Contact direct » ;
  reçue le / traitée le ; **message entier** ; téléphone, e-mail, destinataire (« Pour … »), source
  (« Arrivé par … ») (`:234-262`).
- Gestes : **WhatsApp** (`wa.me`, message prérempli citant le bien), **Appeler** (`tel:`),
  **E-mail** (`mailto:`), **Convertir en client** (devient « Voir la fiche client » une fois converti),
  **Marquer traitée**, **Attribuer** (capacité `crm.assign`, collègues joignables de l'agence) ; toasts
  (`:185-327`, `:341-416`).
- Détection de doublon à la conversion : encart des fiches existantes avec « Ouvrir », puis
  « Convertir quand même » ; `lead.already_converted` ouvre la fiche existante (`:146-159`, `:264-287`).
- La conversion **marque la demande traitée** (`ContactLeadService.php:286-289`).
- États : 3 squelettes, erreur, vide par onglet ; pagination à 20 au-delà d'une page.
- Pastille « À traiter » du menu (rafraîchie toutes les 60 s) et ligne « Demandes de contact » du
  bloc « Aujourd'hui ».
- Mobile : boutons empilés pleine largeur, 40 px.

**Ce qui marche**

- Le message se lit **en entier**, avec le téléphone : l'agent sait de quoi répondre (TCK-590).
- WhatsApp est le premier geste, avec un texte prérempli qui cite le bien : c'est le bon canal et le
  bon ordre.
- Le filtre par défaut est « À traiter » : la page ouvre sur le travail, pas sur l'archive.

**Constats**

| Sév. | Où | Constat |
|---|---|---|
| P1 | fil métier | **La conversion ne transporte rien.** `ContactLeadService::convert` crée la fiche avec nom, e-mail, téléphone et l'étape « lead » (`:276-283`) : **ni le message, ni le bien demandé, ni l'origine**. Sur la fiche client, l'agent ne retrouve pas « je suis fonctionnaire, je peux fournir un garant, le bien est-il libre ? » ni le bien concerné ; « Biens correspondants » est vide faute de critères. Le contexte qui fait la vente est perdu au premier geste. |
| P1 | fil métier | **Aucun « Proposer une visite » depuis une demande.** La moitié des messages relevés demandent une visite (« Une visite samedi est-elle possible ? ») ; le chemin réel est : Convertir → Voir la fiche client → Planifier une visite → **rechercher à nouveau le bien** (le dialogue ne connaît que le client) → date → heure → Planifier : **7 gestes et 3 écrans**, et le lien demande → visite n'est écrit nulle part. |
| P1 | business | **Aucune notion d'âge ni d'urgence.** La seule demande à traiter a 8 jours (« Reçue le 2 nov. ») et ressemble à une demande de ce matin : ni « il y a 8 j », ni couleur, ni tri par ancienneté, ni délai de réponse mesuré. L'admin ne peut pas voir qui répond lentement. |
| P1 | business | **Répondre ne compte pas comme traiter.** Toucher WhatsApp ou Appeler ouvre l'application externe et laisse la demande « À traiter » : l'agent doit revenir et toucher « Marquer traitée ». Sur le terrain, il ne revient pas : la boîte ment, et la pastille du menu avec elle. |
| P2 | mobile | **Une demande = un écran entier** : cinq boutons empilés pleine largeur (WhatsApp, Appeler, Convertir, Marquer traitée, Attribuer) font 520 px. Avec dix demandes, l'agent défile dix écrans pour trier. |
| P2 | liste | Ni recherche, ni filtre par bien, par destinataire ou par canal ; « Non attribuées » n'existe pas alors que l'admin a « Attribuer ». |
| P2 | attribution | « Attribuer » est un bouton fantôme qui se lit comme du texte ; le dialogue prend l'agence de l'utilisateur et non celle de la demande (`:334-335`). |
| P2 | doublon | Le doublon ne se découvre qu'au moment de convertir. La carte pourrait dire d'emblée « Déjà client : Mariama Fall · 2 visites » (même téléphone) : c'est l'information la plus utile pour répondre. |
| P3 | libellés | La fenêtre de bienvenue de l'agent titre **« Vos leads »** (anglicisme, `agentWelcome.slides.leads.title`) et promet « leur étape de pipeline en temps réel » : deux mots anglais pour un agent de Dakar. |
| P3 | erreur | `ErrorState` sans « Réessayer » (`:119`) : c'est l'écran que tout agent a vu pendant ce relevé. |

**Proposition — mobile** *(la page qu'on ouvre depuis la notification, debout, entre deux rendez-vous)*

Une **boîte de réception**, pas une pile de formulaires : une ligne compacte par demande, la carte
s'ouvre en feuille.

```
┌──────────────────────────────────────┐
│ Demandes            [Toutes ▾]  (🔍) │
│ ( À traiter 3 ) ( À moi ) ( Traitées )│
├──────────────────────────────────────┤
│ ● Mouhamed Dieng           il y a 8 j│ ← rouge au-delà de 24 h
│   Pièce indépendante · Ouakam        │
│   « Je suis fonctionnaire et je peux…│
│   [WhatsApp]  [Appeler]   [Visite ▸] │ ← 3 gestes, 44 px, sur la ligne
├──────────────────────────────────────┤
│ ● Awa Ndiaye            il y a 25 min│
│   Studio · Mermoz · déjà cliente ✓   │ ← doublon dit d'avance
│   « Une visite samedi est-elle poss… │
│   [WhatsApp]  [Appeler]   [Visite ▸] │
└──────────────────────────────────────┘
```

- **Toucher la ligne** ouvre une feuille plein écran : message entier, bien (vignette, prix), le
  demandeur (déjà client ? visites passées ?), puis les gestes secondaires (Convertir, Attribuer,
  Marquer traitée, E-mail).
- **Après WhatsApp ou Appeler**, au retour dans l'application, une barre basse demande : « Vous avez
  répondu à Mouhamed ? [Oui, c'est traité] [Pas encore] ». Un geste, et la boîte dit vrai.
- **« Visite ▸»** ouvre la planification **déjà remplie** (bien de la demande, demandeur, tranche
  souhaitée s'il en a donné une) : il ne reste que le jour et l'heure. La fiche client est créée
  (ou rattachée au doublon) au même moment, avec le message en première note.

**Proposition — bureau**

- Liste à gauche (lignes de 72 px, âge, bien, extrait), demande ouverte à droite (deux panneaux, comme
  une messagerie) ; raccourcis clavier `j`/`k`, `t` traiter, `v` visite.
- Filtres : À traiter · **Non attribuées** · À moi · Traitées ; recherche ; bien ; agent.
- En tête, pour l'admin : **délai médian de première réponse** et nombre de demandes > 24 h, par
  agent (donnée à créer : l'heure de première réponse n'est pas enregistrée aujourd'hui, seule
  `handled_at` l'est).

**Ambition**

- **La demande devient le dossier** : convertir = créer (ou rattacher) la fiche **avec** le message
  en note épinglée, le bien en « bien d'intérêt », les critères déduits du bien (type, quartier,
  budget ±20 %) pour que « Biens correspondants » propose aussitôt des alternatives.
- **Réponse en un geste avec créneaux** : WhatsApp prérempli avec deux créneaux libres de l'agent
  (« Je vous propose samedi 10 h ou lundi 17 h ») ; c'est le geste qui transforme une demande en visite.

---

## 2. Clients (CRM) — `/app/customers`, `/app/customers/[id]`, `/app/customers/new`

**Rôle business.** Le **carnet de l'agence** : 141 fiches à Dakar Immo, mêlant contacts tout juste
arrivés, prospects en négociation, locataires en place et clients perdus. C'est la mémoire commerciale
qui doit survivre au départ d'un agent (ADR passation) et nourrir le rapprochement biens ↔ prospects.
Sa valeur se mesure à une question : *quand le client rappelle, l'agent sait-il en dix secondes qui il
est, ce qu'il cherche et où on en est ?*

**Fonctions existantes — à garder**

*Liste* (`customers/(liste)/page.tsx`, `CustomerList.tsx`, `CustomerListFilters.tsx`)

- Recherche texte (nom, prénom, e-mail, téléphone ; validée par Entrée), filtres **étape**, **statut**,
  **étiquettes** (menu à cases, compteur, « Tout effacer ») ; tout dans l'URL (`page`, `search`,
  `pipeline_stage`, `status`, `tags`), retour en page 1 à chaque filtre.
- Bureau (`lg`+) : tableau Client (nom → fiche, métier) · Contact (`mailto:`, `tel:`) · Tags · Pipeline ·
  Statut. Téléphone (sous `lg`) : cartes cliquables (nom, e-mail **ou** téléphone, badges).
- « Vue pipeline » et « Ajouter un client » pour le **personnel** seulement (le bailleur lit ses fiches,
  l'API lui refuse la création — TCK-591 §9) ; état vide avec ou sans « Ajouter ».
- Pagination à 20 (« 141 clients — page 1 sur 8 »).

*Fiche* (`customers/[id]/page.tsx`, `CustomerDetailTabs.tsx`, `components/crm/*`)

- En-tête : « Client · #35 », nom, e-mail, téléphone, badges étape et statut ; **Planifier une visite**
  (client prérempli), **Ajouter un document**, **Inviter à créer son compte** (fiche sans compte ;
  agent, admin d'agence, super-admin).
- **Appeler** / **WhatsApp** (message prérempli, 44 px ; « pas de téléphone » / « numéro
  injoignable ») ; **sélecteur d'étape** (converti / perdu exigent un motif, qui devient une note
  épinglée).
- **Référent** : « Me désigner », ou désigner un agent (capacité `crm.assign`).
- **Étiquettes** : ajout (Entrée, virgule), suggestions, retrait, 10 au plus, clic → liste filtrée.
- Onglets : **Aperçu** (le formulaire d'édition complet, critères de recherche compris), **Notes (n)**
  (5 000 car., épinglées en tête, sans modification ni suppression), **Tâches** (titre, échéance,
  cocher), **Activité** (journal en phrases, « Voir plus »), **Visites**, **Réservations**, **Baux**
  (lignes vers chaque objet), **Biens correspondants** (cases à cocher, « Partager (n) par WhatsApp »),
  **Documents (n)** (ajout, ouvrir), **Relations (n)** (lecture seule).
- Numéro de pièce masqué, révélé à l'admin seul après double facteur.
- 404 vrai pour un identifiant invalide, « Fiche indisponible » pour un refus.

*Création* (`customer-form/CustomerForm.tsx`)

- Prénom*, nom*, e-mail **ou** téléphone (indicatif +221 préfixé, E.164), profession, langue des
  messages, étape (lead par défaut), **ce que le prospect recherche** (achat/location, chambres min.,
  budget min./max., 16 types de bien, villes, quartiers), pièce d'identité (type + numéro).
- Doublon (téléphone ou e-mail) à l'envoi : encart des fiches existantes + « Créer quand même ».
- Erreurs 422 sur les champs, garde de sortie si le formulaire est modifié, redirection vers la fiche.

**Ce qui marche**

- La fiche **réunit tout** — notes, tâches, activité, visites, réservations, baux, biens
  correspondants, documents : c'est la « fiche client unique » de TCK-591, et elle est juste dans son
  principe.
- **Appeler / WhatsApp en tête de fiche**, en cibles de 44 px : le bon geste au bon endroit.
- Les critères de recherche structurés et le **partage WhatsApp de biens correspondants** sont une
  vraie arme commerciale, rare chez les concurrents locaux.
- Le doublon est détecté (téléphone normalisé) avant de polluer le carnet.

**Constats**

| Sév. | Où | Constat |
|---|---|---|
| P1 | fiche, bureau et téléphone | **L'« Aperçu » est un formulaire d'édition.** Le premier onglet de la fiche montre 20 champs de saisie (prénom, nom, e-mail…), pas un résumé : ce que cherche le client, où il en est, sa dernière interaction, sa prochaine action, ses visites à venir. L'agent qui ouvre la fiche pendant que le client parle au téléphone voit un formulaire vide de sens (« Indifférent », champs budget vides). |
| P1 | fiche | **Aucune « prochaine action ».** Ni prochaine visite, ni tâche due, ni dernier contact dans l'en-tête. Les tâches existent, mais dans un onglet. Un CRM immobilier vit de « qui dois-je relancer aujourd'hui ? » ; la fiche n'y répond pas. |
| P1 | fiche | **L'origine est perdue** : rien ne dit que Mariama Fall vient de la demande #8 sur tel bien, ni son message (cf. § 1). Le bien qui a déclenché le contact n'est nulle part. |
| P2 | fiche | **Deux sélecteurs d'étape** sur le même écran : celui de l'en-tête (« Lead ▾ », à droite) et le champ « Étape du pipeline » du formulaire. Deux vérités possibles avant « Enregistrer ». |
| P2 | fiche, bureau | **Référent et Étiquettes occupent chacun une carte pleine largeur** (80 et 100 px) pour une ligne d'information ; les onglets arrivent à 400 px du haut. |
| P2 | fiche, téléphone | **680 px avant le premier onglet** : Planifier + Ajouter un document, Appeler + WhatsApp + sélecteur d'étape, la carte Référent (« Me désigner », liste « Choisir un agent », « Désigner ») et la carte Tags ; le premier écran ne dit ni ce que cherche la cliente ni la suite. « Ajouter un document » y est au même rang que « Planifier une visite ». |
| P2 | fiche | **Dix onglets**, dont quatre vides pour la plupart des fiches (Baux, Réservations, Documents (0), Relations). L'onglet actif n'est pas dans l'URL : un retour arrière ramène à l'Aperçu. Sous `sm`, la rangée défile sans indice. |
| P2 | fiche | Pas de « Écrire » (messagerie interne) alors que la messagerie relie un client à sa fiche (TCK-2295) ; pas de « Créer le bail » ni de « Proposer un bien » en tête. |
| P2 | liste, téléphone | **La carte mobile perd le téléphone** quand il y a un e-mail (`e-mail ou téléphone`) et n'offre **aucun geste** : pour rappeler un client depuis la liste, il faut ouvrir sa fiche. 220 px par carte, 4 clients par écran. |
| P2 | liste | Le badge « Actif » est sur 140 lignes sur 141 : du bruit. La colonne « Tags » est vide (« — ») partout et les étiquettes de la liste ne sont pas cliquables (`onTagClick` jamais passé). |
| P2 | liste | **Ni tri ni « à relancer »** : le tri est la date de création ; impossible de lister « mes prospects sans contact depuis 7 jours », « en négociation », « référent : moi ». Le filtre « Référent » n'existe pas. |
| P2 | liste | Le sélecteur « 20 / page » écrit `?per_page` que la page ignore (`perPage: 20` en dur) ; la pagination s'annonce deux fois (« 141 clients — page 1 sur 8 » puis « Page 1 sur 8 · 141 résultats »). |
| P2 | création | **Formulaire long pour un geste de terrain** : 20 champs dont 16 pastilles de types de bien (Usine, Ferme, Complexe, Hôtel…). Au téléphone avec un prospect, l'agent veut nom + téléphone + « studio Mermoz < 300 000 », en 20 secondes. Le doublon n'est signalé qu'à l'envoi. |
| P3 | libellés | « Clients (CRM) », « Lead », « Pipeline », « Tags » : quatre mots d'outil pour un agent. « Prospect », « Étape », « Étiquettes » existent déjà dans le produit. |
| P3 | fiche | Le bouton « Ajouter un document » de l'en-tête ne rafraîchit pas l'onglet Documents (pas d'`onUploaded`, contrairement à celui de l'onglet). |

**Proposition — mobile**

*Liste* : une **ligne de contact**, comme un répertoire de téléphone.

```
┌──────────────────────────────────────┐
│ Clients                     (+) (🔍) │
│ (À relancer 6)(Mes clients)(Négo.)(…)│ ← vues rapides, pas des filtres
├──────────────────────────────────────┤
│ MF  Mariama Fall          [📞] [💬] │
│     Studio · Mermoz · ≤ 250 000 F    │ ← ce qu'il cherche, pas son e-mail
│     Prospect · visite jeu. 10 h      │ ← où on en est + prochaine action
├──────────────────────────────────────┤
│ YD  Yacine Diouf          [📞] [💬] │
│     Villa · Almadies · achat         │
│     Négociation · relance en retard ●│
└──────────────────────────────────────┘
```

*Fiche* : **une fiche de lecture, l'édition en feuille**.

```
┌──────────────────────────────────────┐
│ ←  Mariama Fall              ⋯       │
│    Prospect ▾  · référent : Khady D. │
│ [ Appeler ] [ WhatsApp ] [ Écrire ]  │ ← 3 gestes, 48 px
├──────────────────────────────────────┤
│ PROCHAINE ACTION                     │
│ ▸ Visite jeu. 13 nov. 10 h · Studio  │
│   Mermoz            [Confirmer]      │
│ ▸ Relancer après visite · vendredi   │
├──────────────────────────────────────┤
│ CHERCHE  Location · studio, F2       │
│          Mermoz, Ouakam · ≤ 250 000 F│
│          [3 biens correspondent ▸]   │
├──────────────────────────────────────┤
│ ORIGINE  Demande du 3 nov. sur       │
│ « Studio Mermoz » : « Une visite     │
│ samedi est-elle possible ? »         │
├──────────────────────────────────────┤
│ FIL   (notes, visites, appels, mêlés │
│        dans le temps, + Ajouter note)│
└──────────────────────────────────────┘
│  [ + Note ]   [ + Tâche ]  [ Visite ]│ ← barre collante
```

- Les onglets techniques (Réservations, Baux, Documents, Relations) deviennent des **sections
  repliées** en fin de fiche, avec leur compte, n'apparaissant que non vides.
- « Modifier » (menu `⋯`) ouvre l'édition en feuille plein écran.

*Création* : **une saisie en deux temps** — 1) nom, téléphone (doublon vérifié **pendant la frappe**),
2) « Ce qu'il cherche » en phrase guidée (Louer/Acheter · type en 6 pastilles courantes + « Plus » ·
quartiers · budget). Le reste (profession, langue, pièce) passe en « Compléter plus tard ».

**Proposition — bureau**

- *Liste* : tableau gardé, mais colonnes **Cherche** (type · quartier · budget), **Étape**, **Prochaine
  action** (date, en rouge si en retard), **Référent** ; tri par chacune ; vues enregistrées « À
  relancer », « Mes clients », « Sans référent » ; gestes au survol (Appeler, WhatsApp, Planifier).
- *Fiche* : deux colonnes — à gauche le résumé (cherche, origine, référent, étiquettes en ligne), à
  droite le fil (notes, visites, appels, étapes) avec saisie de note en tête ; « Modifier » en
  panneau latéral. Les dix onglets se réduisent à trois : **Fil**, **Biens proposés**, **Dossier**
  (documents, baux, réservations, relations).

**Ambition**

- **« À relancer aujourd'hui »** comme vue d'entrée du CRM de l'agent : les prospects dont la
  prochaine action est due, les visites d'hier sans compte rendu, les négociations sans contact depuis
  7 jours. C'est le tableau de bord commercial dont le terrain a besoin, construit sur des données qui
  existent déjà (tâches, visites, journal d'étapes).
- **Le rapprochement qui sonne** : quand un bien correspondant est publié, la ligne du prospect porte
  « 2 nouveaux biens pour Mariama » et le partage WhatsApp est à un geste (le récapitulatif quotidien
  existe déjà côté serveur, TCK-591).

---

## 3. Pipeline — `/app/crm/pipeline`

**Rôle business.** La vue « où en sont mes affaires » : combien de prospects à chaque étape, qui
avance, qui stagne. Pour l'admin, c'est le seul endroit où se lit la santé commerciale de l'équipe ;
pour l'agent, c'est (devrait être) sa liste de relances.

**Fonctions existantes — à garder**

- Six étapes : Lead · Prospect · Qualifié · Négociation · Converti · Perdu ; compteur par colonne
  (`stage_counts`), « Charger plus (x/total) » par 50 (`PipelineColumn.tsx:59`, `:126-137`).
- **Glisser-déposer** en bureau (pointeur, et clavier : Espace, flèches, Échap ; annonces pour
  lecteur d'écran ; colonne cible surlignée) (`PipelineKanban.tsx:60-164`, `:290-320`).
- **Changer d'étape sans glisser** : sélecteur sur chaque carte (doigt, clavier) ; Converti / Perdu
  exigent un **motif** (dialogue, 5 000 car.) qui devient une note épinglée ; mise à jour optimiste
  avec retour arrière en cas d'erreur (`ReasonDialog.tsx`, `useCustomerStageMutation.ts:59-102`).
- Carte : initiales, nom, « par {ajouté par} », date de mise à jour, pastille des tâches ouvertes,
  **Appeler**, **WhatsApp** ; clic ou Entrée → **feuille latérale** (Aperçu, Notes avec ajout,
  Tâches, Activité) (`PipelineCard.tsx:72-156`, `CustomerDetailSheet.tsx`).
- Quatre indicateurs : Prospects actifs, Changements 30 j, Taux de conversion 30 j, Temps moyen —
  Qualifié (`PipelineStatsBar.tsx`, `PipelineStatsService.php`).
- Téléphone : onglets d'étape avec compteur, une colonne à la fois, changement par le sélecteur.
- États par colonne : squelettes, erreur avec « Réessayer », vide.

**Ce qui marche**

- **Le changement d'étape au doigt** (sélecteur sur la carte) et au clavier : le kanban n'exclut ni
  le téléphone ni l'accessibilité (TCK-591). Rare et juste.
- Le **motif obligatoire** de « Perdu » et « Converti », versé dans les notes : c'est ce qui permet
  un jour d'analyser pourquoi on perd.
- Appeler / WhatsApp sur la carte : le pipeline est actionnable.

**Constats**

| Sév. | Où | Constat |
|---|---|---|
| P1 | indicateurs | **Les chiffres se contredisent** : « Changements 30 j : 0 » et « Taux de conversion 30 j : 92 % » côte à côte ; « Temps moyen — Qualifié : 0 j ». Le taux compte les fiches **dont la dernière modification** date de moins de 30 jours, pas celles **passées** en Converti/Perdu dans la période (`PipelineStatsService.php:212-237`) : n'importe quelle retouche d'une vieille fiche convertie gonfle le taux. Un admin qui pilote sur ce chiffre pilote sur du bruit. *(Les données de démo n'ont pas de journal d'étapes, d'où le 0 ; le défaut de calcul, lui, est réel.)* |
| P1 | carte | **La carte ne dit pas pourquoi la personne est là.** Nom, « par Sokhna Sene », date : ni ce qu'elle cherche (budget, quartier, type), ni le bien d'origine, ni la dernière interaction, ni la prochaine action, ni le référent. « par » désigne **qui a créé la fiche** (`addedBy`), pas qui la suit : sur 53 cartes, toutes « par Sokhna Sene ». |
| P1 | usage | **Rien ne dit qui relancer.** Le tri est la date de modification ; aucune carte ne signale une fiche immobile depuis 10 jours, une visite faite sans suite, une tâche en retard (la pastille de tâches n'indique pas le retard). Le pipeline décrit, il ne pousse pas. |
| P2 | filtres | **Aucun filtre** (référent, étiquette, recherche, bien) : l'agent voit les 53 prospects de l'agence, l'admin ne peut pas isoler un agent. |
| P2 | bureau | Six colonnes de 290 px dans 1 140 px utiles : « Négociation » est coupée, « Converti » et « Perdu » hors écran ; le défilement horizontal n'a pas d'indice. Les deux colonnes terminales occupent la même place que les étapes vivantes. |
| P2 | feuille | La feuille latérale n'a **ni lien vers la fiche complète, ni sélecteur d'étape** ; ses onglets ne sont pas dans l'URL. |
| P2 | téléphone | Quatre tuiles d'indicateurs (2 × 2, 340 px) avant le premier prospect ; une carte = 280 px (avatar, nom, « par », date, puis sélecteur + Appeler + WhatsApp). |
| P2 | indicateurs | Tuiles non cliquables (`onClickWidget` jamais passé) ; « Temps moyen » n'affiche que Qualifié alors que le serveur calcule les six étapes. |
| P3 | entrée | On n'arrive au pipeline que par le bouton « Vue pipeline » de la liste des clients : il n'est dans aucun menu, ni dans « Aller à » (à vérifier en famille 3). |
| P3 | libellés | « Pipeline de prospects », « Lead », « 30j » sans espace insécable. |

**Proposition — mobile** *(l'agent ne fait pas de kanban au téléphone : il fait sa liste de relances)*

```
┌──────────────────────────────────────┐
│ Mes prospects            [Moi ▾] (🔍)│
│ Lead 18 · Prospect 14 · Qualifié 11 ›│ ← entonnoir compact, tap = filtre
├──────────────────────────────────────┤
│ À RELANCER (6)                       │
│ YN Yacine Ndiaye     Négociation  ▸  │
│    Villa Almadies · offre 85 M F     │
│    ⚠ sans contact depuis 9 j [📞][💬]│
│ BN Bineta Ndoye      Qualifié     ▸  │
│    F3 Mermoz · visite faite lun.     │
│    ⚠ compte rendu manquant     [✎]   │
├──────────────────────────────────────┤
│ À JOUR (47)                       ▾  │
└──────────────────────────────────────┘
```

- Un balayage sur une ligne propose « Étape suivante » (avec motif si terminale) et « Reporter ».
- L'entrée sur une ligne ouvre la **fiche client** (§ 2), pas une feuille de plus.

**Proposition — bureau**

- Kanban gardé, mais **quatre colonnes vivantes** (Lead → Négociation) pleine hauteur et **deux
  colonnes terminales repliées** en bandeaux comptés (« Converti 9 · Perdu 7 ») qu'on déplie.
- Carte enrichie : ce qu'il cherche (une ligne), référent (avatar), dernière interaction (« appel il y
  a 3 j »), **prochaine action datée** (rouge si en retard).
- Barre de filtres : Référent · Étiquette · Recherche · « À relancer seulement ».
- Indicateurs **justes et cliquables** : entonnoir (passages d'étape sur 30 j **datés par le journal
  d'étapes**), taux de conversion sur les sorties de la période, durée médiane par étape ; un clic
  filtre le kanban.

**Ambition**

- **Le pipeline se nourrit tout seul** : une visite confirmée fait passer Lead → Prospect, une visite
  faite avec compte rendu « intéressé » → Qualifié, une candidature ou une offre → Négociation, un
  bail signé → Converti. L'agent ne déplace plus de cartes, il confirme ce que le produit propose
  (« Bineta a visité : la passer en Qualifié ? »). Le pipeline devient vrai parce qu'il n'est plus
  saisi à la main.

---

## 4. Visites — `/app/visits`, `/app/visits/[id]`

**Rôle business.** La visite est **le moment de vérité** : c'est là que se décide la location ou la
vente, et c'est le cœur du métier d'agent sur le terrain. La page doit servir trois temps : **avant**
(confirmer vite, ne rien rater), **pendant** (adresse, contact, bien sous la main), **après** (compte
rendu et suite en trente secondes).

**Fonctions existantes — à garder**

*Liste* (`VisitsList.tsx`, `onglet-des-visites.ts`)

- Onglets dans `?tab=` : **Non attribuées** (personnel), **Demandées** (défaut), **Confirmées**,
  **Passées**, **Annulées**, chacun avec son total ; une page par onglet (30).
- Ligne : bien, statut, type (En personne, virtuelle…), « Non attribuée », date et durée → détail.
- Pastille « À traiter » du menu vers `?tab=requested` ; ligne « Visites à confirmer » du bloc
  « Aujourd'hui ».
- Mêmes composants pour le client (« Mes visites ») et pour le personnel.

*Détail* (`VisitDetail.tsx`, `VisitFeedbackForm.tsx`)

- « ← Toutes les visites » ; bien, statut, type ; **Créneau** (date, heure, durée), notes, motif
  d'annulation ; **Demandeur** (fiche client, compte ou visiteur anonyme) avec `tel:`, `mailto:` et
  **« Fiche CRM »** ; **Accompagnement** (agent).
- Gestes selon le rôle et l'état : **Prendre en charge** (409 si un collègue l'a prise),
  **Confirmer la visite**, **Replanifier** (date-heure de Dakar), **Proposer un autre créneau**
  (visiteur : grille de créneaux libres lue au serveur), **Terminer**, **Absent** (après l'heure),
  **Annuler** (motif obligatoire), **Voir le bien** ; toasts, avertissement si le SMS au client a été
  retenu.
- **Avis post-visite** dans les 24 h : agent ou client, note 1 à 5 + commentaire.

*Planifier* (`PlanifierUneVisite.tsx`, depuis la fiche client, la fiche d'un bien, l'agenda)

- Bien (fixé, ou recherche + liste), client (fixé, ou recherche + « Pas de fiche » → nom et
  téléphone), date, heure de Dakar (grille 09:00 → 18:30 par 30 min) ; la visite naît **confirmée** et
  le client est prévenu.

**Ce qui marche**

- Les **onglets dans l'URL** et la pastille du menu qui mène droit aux visites à confirmer.
- Le demandeur est résolu proprement (fiche, compte ou visiteur sans compte) avec le lien vers sa
  fiche : la visite est rattachée au CRM.
- « Proposer un autre créneau » côté client s'appuie sur les **créneaux réellement libres** (TCK-590).
- Les gestes suivent l'état (Absent n'apparaît qu'après l'heure, Terminer après le début).

**Constats**

| Sév. | Où | Constat |
|---|---|---|
| P0 | visite terminée | **Le fil métier s'arrête ici.** Une visite « Terminée » ne propose que « Voir le bien » et un formulaire « Feedback post-visite » (note 1-5 + commentaire, fenêtre de 24 h). **Aucune suite** : ni « Le client est intéressé → proposer une candidature / une offre », ni « Créer le bail », ni « Relancer dans 2 jours », ni passage d'étape. Et la console **ne sait pas enregistrer une candidature ou une offre pour un client** — l'offre reçue de vive voix à la sortie de la visite n'a nulle part où aller, sinon une note — alors que l'API l'accepte (`StoreBookingRequest.php:38`, `customer_id`) : seul le tunnel public (`BookingTunnel`, `/bookings`) crée une réservation. L'étape qui rapporte (visite → engagement) n'a **pas d'écran**. |
| P1 | liste | **On ne sait pas qui visite.** La ligne montre le bien, le statut et l'heure, jamais le visiteur ni l'agent (pourtant chargés : `include=agent,visitor`). Pour 139 visites demandées, l'agent doit ouvrir chaque visite pour savoir qui c'est. |
| P1 | liste | **Confirmer coûte trois gestes par visite** (ouvrir, Confirmer, revenir) : aucune action en ligne, aucune sélection multiple. 139 demandes = plus de 400 touches. Le compteur du menu reste à « 99+ » : le signal est saturé, donc ignoré. |
| P1 | terrain | **Ni adresse, ni itinéraire, ni WhatsApp.** Le détail d'une visite n'a pas l'adresse du bien (seulement « Voir le bien », qui ouvre la fiche **publique**), pas de lien Maps, pas de WhatsApp vers le visiteur ; le téléphone est un lien gris de 12 px qui ne se lit pas comme un bouton. L'agent qui part à la visite doit fouiller ailleurs. |
| P1 | terrain | **Aucune vue « Aujourd'hui ».** Les onglets découpent par statut (Demandées, Confirmées, Passées) ; l'agent veut « mes visites d'aujourd'hui, dans l'ordre, avec l'heure et l'adresse ». Il doit passer par l'agenda (§ 7), qui ne montre pas non plus l'adresse. |
| P1 | compte rendu | Le « feedback » est une **note de satisfaction**, pas un compte rendu : ni « intéressé / à réfléchir / pas intéressé », ni objections (prix, quartier, état), ni prochaine étape. Rien n'en remonte dans la fiche client ni dans le pipeline. Les avis déjà envoyés ne sont pas relus à l'écran. Libellés anglais : « Feedback post-visite », « Envoyer le feedback ». |
| P2 | demande | La visite demandée ne montre **ni le message du visiteur, ni la tranche souhaitée** (« l'après-midi ») qu'il a pu donner (TCK-2502) : l'agent confirme à l'aveugle. |
| P2 | planifier | Dialogue centré en téléphone ; **bien en deux contrôles** (champ de recherche + liste déroulante), recherche sans délai à chaque frappe ; **grille d'heures fixe** 09:00-18:30 sans vérifier les disponibilités, alors que « Proposer un autre créneau » le fait ; après « Planifier », aucun lien vers la visite créée. |
| P2 | liste | Ni recherche, ni filtre par bien, client ou agent ; les cinq onglets lancent cinq requêtes au montage pour leurs compteurs. |
| P2 | liste | « Non attribuées » paraît pour l'agent (0) mais **pas pour l'admin** sur les deux captures (bureau et téléphone), alors que `VisitsList.tsx:40` l'ouvre à `isAdmin` : à vérifier, c'est l'admin qui répartit. |
| P2 | téléphone | Une ligne de visite = 230 px (titre, deux pastilles sur deux lignes, date) : 4 visites par écran. |
| P3 | détail | Le détail tient dans une carte de 1 100 px de large aux trois quarts vide en bureau ; « Demandée » vs onglet « Demandées » qui contient des visites `scheduled` : le vocabulaire « demandée / programmée / confirmée » n'est pas expliqué. |

**Proposition — mobile** *(la page de l'agent sur le terrain)*

*Liste* — **Aujourd'hui d'abord**, puis à confirmer :

```
┌──────────────────────────────────────┐
│ Visites                    [+ Visite]│
│ ( Aujourd'hui 3 )( À confirmer 12 )( … )│
├──────────────────────────────────────┤
│ 10:00  Studio · Mermoz, rue 12       │
│        Awa Ndiaye · 1re visite       │
│        [Itinéraire] [📞] [💬]        │
│ 14:30  F3 · Sacré-Cœur 3 (villa 112) │
│        Ousmane Ba · revient          │
│ 17:00  ⚠ Compte rendu de 11:00 ▸     │ ← l'après se rappelle
├──────────────────────────────────────┤
│ À CONFIRMER                          │
│ Mer. 12 · après-midi · Local Yoff    │
│ Abdoulaye Cissé « dispo après 15 h » │
│ [Confirmer 15:00 ▾]   [Autre heure]  │ ← en ligne, un geste
└──────────────────────────────────────┘
```

*Détail* — trois états, trois écrans :

- **Avant** : bien (vignette, **adresse**, Itinéraire), visiteur (Appeler, WhatsApp, fiche), message
  et tranche demandée ; barre basse « Confirmer » / « Proposer une autre heure ».
- **Le jour J** : barre basse « Je suis en route » (envoie un WhatsApp prérempli), « Commencer ».
- **Après** : **compte rendu en trois touches** — `Intéressé` · `À réfléchir` · `Pas intéressé` ;
  objections en pastilles (Prix, Quartier, Taille, État, Disponibilité) ; note vocale ou texte ; puis
  **la suite** en un choix : « Inviter à candidater / faire une offre » (lien envoyé par WhatsApp),
  « Créer le bail », « Planifier une 2e visite », « Proposer d'autres biens » (biens correspondants),
  « Relancer dans … ». Le compte rendu devient une note de la fiche et propose le passage d'étape.

*Planifier* : **feuille plein écran**, bien par une seule recherche, **créneaux libres** de l'agent
et du bien en pastilles (comme « Proposer un autre créneau »), visiteur prérempli.

**Proposition — bureau**

- Liste en tableau : Quand · Bien (quartier) · Visiteur · Agent · Statut ; sélection multiple
  « Confirmer » / « Attribuer » ; filtres Agent, Bien, Période ; vue « Semaine » partagée avec
  l'agenda.
- Détail en deux colonnes : la visite (créneau, bien, adresse, carte) à gauche, le visiteur (fiche
  résumée, historique des visites, autres biens correspondants) et le compte rendu à droite.

**Ambition**

- **La visite pilote la suite** : le compte rendu « Intéressé » sur un bien à louer envoie au client,
  par WhatsApp, le lien de candidature prérempli ; sur un bien à vendre, le lien d'offre. L'agent
  voit la réponse arriver dans la même fiche. C'est la pièce manquante entre la famille 5 et la
  famille 4 (baux).
- **Tournée** : pour un agent qui a 3 visites l'après-midi, l'ordre et l'itinéraire (adresse +
  quartier), avec un « en retard de 10 min » prévenu en un geste.

---

## 5. Réservations — `/app/bookings`, `/app/bookings/[id]`

**Rôle business.** Sous un seul mot, **trois engagements différents** : le séjour courte durée (nuits
payées, acompte de 30 %), la **candidature** à une location au mois, et l'**offre d'achat** sur un bien
à vendre (relevé sur la démo : 129 « réservations » à Dakar Immo ; sur les 100 premières, 18 portent sur des
biens à vendre et 23 sur des locations au mois). C'est l'étape qui précède l'argent — acompte, bail, compromis — et
c'est elle que l'agent doit accepter vite et transformer.

**Fonctions existantes — à garder**

*Liste* (`BookingsList.tsx`)

- Onglets dans `?status=` : **En attente** (défaut), **Confirmées**, **Refusées**, **Annulées**,
  **Expirées** ; une page de 30 par onglet.
- `?only_mine=1` (depuis « Mes chiffres ») : case « Mes biens » décochable (`filter[managed_by]=me`).
- Ligne : bien, statut, dates (ou date de création), référence, **montant total** → détail.
- États : squelettes, vide propre à l'onglet. Mêmes composants pour le client (« Mes réservations »).

*Détail* (`BookingDetail.tsx`, `BookingPaymentDialog.tsx`, `BookingRefundPanel.tsx`)

- « ← Retour aux réservations », bien, statut, référence ; blocs **Dates / Créée le / Expire le**,
  **Total / Acompte (Payé)**, message.
- Personnel, chacun sous sa capacité : **Accepter**, **Refuser** (motif), **Créer le bail**
  (réservation confirmée d'un bien à louer → `/app/leases/new?booking_id=` prérempli, P48.03),
  **Enregistrer un paiement** (montant, type, moyen, référence, notes), **Annuler** (motif ; client
  comme personnel, avant le début du séjour).
- **Paiements** : date, type, moyen, référence, montant, statut, « Payer en ligne », **reçu PDF**.
- **Remboursement** : état (à traiter, en cours, remboursé), « Rembourser » par paiement (montant,
  motif, avertissement si les fonds ont été reversés).
- **Historique** (créée, confirmée, acompte payé, annulée, expirée).
- Client seulement : **Payer l'acompte / le solde**, **Laisser un avis**.

**Ce qui marche**

- **« Créer le bail » depuis une candidature acceptée** (bien, locataire, dates, loyer préremplis) :
  c'est exactement le pont que les visites n'ont pas.
- Paiements, reçu PDF et remboursement au même endroit, sous capacités : la réservation est un vrai
  dossier financier.
- Les gestes irréversibles exigent un motif.

**Constats**

| Sév. | Où | Constat |
|---|---|---|
| P1 | détail | **On ne sait pas qui a réservé.** Le client est chargé (`include=customer`) mais ni son nom, ni son téléphone, ni un lien vers sa fiche ne sont affichés (relevé sur la réservation 51 : « Terrain à Diourbel », 491 164 F, acompte payé — par qui ?). Pour accepter une candidature, l'agent ne voit pas le candidat. |
| P1 | liste | **Trois métiers mélangés sans le dire.** Séjour, candidature et offre d'achat portent le même nom, la même ligne et les mêmes onglets. « Total 491 164 F » sur une offre d'achat, « Dates » sur une candidature au mois : les libellés ne suivent pas l'objet. L'agent qui cherche « les offres reçues sur la villa des Almadies » n'a pas de filtre. |
| P1 | liste | **Le client n'est pas sur la ligne** non plus : une liste de réservations sans noms. |
| P2 | liste | **Ouvre sur un écran vide** : « En attente » est l'onglet par défaut et ne contient rien, alors que 26 réservations confirmées attendent un bail ou un séjour ; les onglets n'ont **pas de compteur** (les visites en ont). |
| P2 | liste | Les **57 réservations terminées** (`completed`) sont **inaccessibles** : aucun onglet ne les liste. |
| P2 | vide | L'état vide du personnel dit « **Parcourez le catalogue pour envoyer une demande de réservation** » : c'est le texte du client, montré à l'admin. Côté client, le même texte n'a pas de bouton vers le catalogue. |
| P2 | détail | « Expire le 10 nov. » affiché sur une réservation **confirmée** ; moyen de paiement brut **« orange_money »** (code d'énumération) ; « Quittance PDF » pour le reçu d'un acompte (une quittance est un reçu de loyer). |
| P2 | détail | **Le séparateur de milliers disparaît** : « 491164 F CFA » (total) à côté de « 66 917 F CFA » (acompte), en bureau comme en téléphone. Le texte est le même (`491\u202f164`, espace fine insécable d'`Intl` fr) : c'est **la police du total** (`text-lg font-semibold`) qui ne dessine pas U+202F. Tout montant affiché dans cette graisse est touché — à vérifier partout (cf. Transversal). |
| P2 | détail | Pas de « Écrire au client », pas d'appel, pas de WhatsApp ; pas de lien vers la visite qui a précédé. |
| P2 | liste | Ni recherche, ni filtre par bien ou par client (l'API refuse `filter[search]`). |
| P3 | bureau | Détail : deux cartes côte à côte puis Paiements et Historique sur 1 100 px de large, 60 % vides ; les actions « Créer le bail » et « Enregistrer un paiement » sont à 40 px de haut tout en haut à droite, loin du contenu. |

**Proposition — mobile**

- **Liste** : un sélecteur de nature en tête — `Séjours` · `Candidatures` · `Offres` — puis les
  statuts **avec compteurs**, « À décider » en premier. Ligne : client (nom, avatar) · bien ·
  montant **dans le vocabulaire de l'objet** (« 3 nuits · 165 000 F », « Loyer 250 000 F/mois »,
  « Offre 85 000 000 F ») · âge de la demande.
- **Détail** en trois blocs : **Qui** (client, téléphone, WhatsApp, fiche, visites passées sur ce
  bien), **Quoi** (dates ou loyer ou prix offert, acompte, message), **Suite** (barre basse :
  `Accepter` / `Refuser` ; puis, une fois acceptée, `Créer le bail` ou `Encaisser l'acompte`).
  Paiements et historique en sections repliées.

**Proposition — bureau**

- Tableau avec colonnes Client · Bien · Nature · Montant · Statut · Reçue ; filtres nature, bien,
  client ; « À décider » en vue par défaut quand elle n'est pas vide, sinon « Confirmées ».
- Détail en deux colonnes : dossier (qui, quoi, paiements) à gauche, décision et historique à droite.
- **« Nouvelle candidature / offre »** depuis la fiche client et depuis une visite terminée, pour
  enregistrer ce que le client a dit de vive voix (l'API l'accepte déjà, cf. § 4).

**Ambition**

- **Séparer les trois objets dans l'interface** (même modèle en base si on veut) : « Séjours »
  rejoint l'agenda et le calendrier des nuits du bien ; « Candidatures » devient l'antichambre du
  bail (pièces du dossier, garant, scoring simple) ; « Offres » porte la négociation d'une vente
  (contre-offre, acceptation, compromis). Chacun avec son vocabulaire et sa suite.

---

## 6. Tâches — `/app/tasks`

**Rôle business.** La liste « à faire » de l'agent : relances, dossiers à préparer, états des lieux à
faire signer. Bien tenue, c'est elle qui empêche un prospect de refroidir ; mal tenue, elle devient
une archive qu'on ne regarde plus.

**Fonctions existantes — à garder**

- Pastilles d'échéance : **Toutes**, **En retard**, **Aujourd'hui**, **À venir**, **Sans échéance**
  (`?filter[due]=`) ; `?filter[assigned_to]=me` (cible de la tuile « Tâches du jour », conservé quand
  on change d'échéance) (`tasks/page.tsx:18-20`, `MyTasks.tsx:65-91`).
- **Nouvelle tâche** : titre, date et heure, rattachement **Un client** / **Un bien** (recherche
  après 2 caractères, 8 résultats, « Changer ») ; bouton actif seulement avec titre et cible.
- Ligne : case à cocher (faite / ouverte), titre barré une fois faite, échéance ou « sans échéance »,
  lien vers le client ou le bien, **Appeler** et **WhatsApp** quand c'est un client.
- « Voir plus » (30 par page) ; états chargement, erreur avec « Réessayer », vide par filtre.
- Les tâches d'un client se créent aussi depuis sa fiche (onglet Tâches) ; elles paraissent dans
  l'agenda (type « Tâches »).

**Ce qui marche**

- Les **échéances comme filtres** (en retard, aujourd'hui, à venir) : la bonne découpe.
- **Appeler / WhatsApp sur la ligne** d'une tâche rattachée à un client : la relance se fait sans
  ouvrir la fiche.
- La création exige un rattachement : aucune tâche orpheline.

**Constats**

| Sév. | Où | Constat |
|---|---|---|
| P1 | liste | **« Toutes » mêle faites et à faire, triées par création** : sur le téléphone de l'agent, une tâche ouverte **en retard depuis le 17 oct.** est noyée entre des tâches barrées ; rien ne la colore. La page s'ouvre sur « Toutes », pas sur « En retard + Aujourd'hui ». |
| P1 | liste | **« Un bien »** au lieu du nom du bien sur presque toutes les lignes relevées (une seule affiche « Chambre à louer à Saint-Louis ») : la tâche « Faire signer l'état des lieux d'entrée » ne dit pas de quel logement. |
| P2 | création | Le formulaire de création occupe **le premier écran entier** en téléphone (titre, date, Client/Bien, recherche, bouton : 600 px) ; la liste commence sous la ligne de flottaison. Un bouton « + Tâche » ouvrant une feuille suffit. |
| P2 | gestes | Ni modifier (titre, échéance), ni **reporter** (« demain », « lundi »), ni supprimer, ni assigner à un collègue, ni priorité — alors que l'API et la spec prévoient l'assignation au personnel (TCK-591). « Assignées à moi » n'a pas d'interrupteur à l'écran. |
| P2 | admin | L'admin ne voit que **ses** tâches (0) : aucune vue des tâches de l'équipe, en retard par agent. |
| P2 | lien | Aucune tâche n'est créée automatiquement (après une visite, une demande, une étape) : la liste ne se remplit que si l'agent y pense. |
| P3 | entrée | « Mes tâches » est en tête du menu de l'agent mais rangé sous « Plus » chez l'admin ; l'en-tête dit « client par client et bien par bien » mais rien ne regroupe par client ou par bien. |

**Proposition — mobile**

```
┌──────────────────────────────────────┐
│ À faire                       [+]    │
│ ( En retard 2 )( Aujourd'hui 3 )( … )│ ← s'ouvre sur En retard + Aujourd'hui
├──────────────────────────────────────┤
│ EN RETARD                            │
│ ○ Faire signer l'EDL d'entrée   ⚠17 oct│
│   F2 Grand Yoff · Awa Diop [📞][💬]  │
│ ○ Vérifier le titre foncier     ⚠14 oct│
│   Terrain Diourbel                   │
│ AUJOURD'HUI                          │
│ ○ Relancer Yacine (offre villa) 18:00│
└──────────────────────────────────────┘
```

- Balayer à droite : **Fait** ; à gauche : **Reporter** (Demain · Lundi · Choisir). Toucher : feuille
  de détail (modifier, assigner, supprimer).
- « + » ouvre une feuille courte : titre, échéance en pastilles (Aujourd'hui, Demain, Lundi, Date),
  rattachement **prérempli** quand on vient d'une fiche, d'une visite ou d'une demande.

**Proposition — bureau**

- Trois colonnes de temps (En retard · Aujourd'hui · Cette semaine) et une liste « Plus tard » ;
  regroupement possible par client ou par bien ; pour l'admin, filtre **Assignée à** et compte des
  retards par agent.

**Ambition**

- **Les tâches naissent du métier** : une visite terminée sans compte rendu → « Compte rendu de la
  visite de 11 h » ; une demande non traitée depuis 24 h → « Répondre à Mouhamed » ; un prospect en
  négociation sans contact depuis 7 jours → « Relancer Yacine ». La liste dit enfin ce qu'il faut
  faire, et le pipeline (§ 3) avance avec elle.

---

## 7. Agenda — `/app/calendar`

**Rôle business.** La journée de l'agent (visites, tâches) et l'occupation des biens (séjours,
échéances de bail, interventions) au même endroit. Pour l'agent sur le terrain, la seule question est
« **où dois-je être, et quand ?** » ; pour l'admin et le bailleur, « quels biens sont occupés, qu'est-
ce qui tombe cette semaine ? ».

**Fonctions existantes — à garder**

- Vues **Mois**, **Semaine**, **Jour**, **Liste** (30 jours glissants) ; Précédent / Aujourd'hui /
  Suivant ; tout dans l'URL (`view`, `date`, `types`, `property`, `mine`) (`CalendarPage.tsx:94-263`).
- **Mes rendez-vous** (personnel ; coché d'emblée pour un agent non admin), bascules de type
  (Réservations, Visites, Tâches, Échéances de bail, Interventions ; jamais toutes éteintes), filtre
  **par bien** avec bandeau des filtres actifs.
- Légende des types ; un événement gris = demande ou signature en attente.
- Mois : deux événements par jour puis « +N autres » ; en téléphone, des points ; panneau du jour
  sélectionné (« Mardi 10 novembre · 10 événements », « Vue jour ») à droite à partir de `xl`, dessous
  en téléphone.
- **Fiche d'événement** en feuille : type, état, titre, dates, référence, durée, « Voir le bien »,
  « Ouvrir la réservation / le bail / la tâche / l'intervention / la visite ».
- **Planifier une visite** dans l'en-tête.
- **Abonnement iCal** personnel (agent, admin d'agence) : créer, copier, Google Agenda, Apple
  (`webcal:`), dernier accès, révoquer.
- Audiences : personnel, bailleur, prestataire (interventions seules).

**Ce qui marche**

- **Une seule vue agrégée** des cinq natures d'événements, filtrable par bien et par type, état dans
  l'URL : la base est solide.
- **L'abonnement iCal** : l'agent retrouve ses visites dans l'agenda de son téléphone. C'est
  probablement la fonction la plus utile de la page pour le terrain.
- La fiche d'événement mène à l'objet source.

**Constats**

| Sév. | Où | Constat |
|---|---|---|
| P1 | « Mes rendez-vous » | **Les séjours noient les rendez-vous.** Même filtré sur « Mes rendez-vous », le 10 novembre montre **8 réservations « Journée »** (séjours de plusieurs semaines sur des biens de l'agence) **avant** la seule visite de la journée (10:57). Un séjour en cours n'est pas un rendez-vous de l'agent : c'est une occupation de bien. |
| P1 | téléphone | **La journée est à trois écrans du haut.** Titre, Planifier, navigation, 4 vues, Mes rendez-vous, 5 types, bien, légende (230 px), puis la grille du mois en points : la liste du jour commence à ~1 500 px. L'agent ouvre l'agenda pour savoir où aller **maintenant**. |
| P1 | mois | En bureau, chaque jour affiche « Appartement lu… », « Superbe villa 5… » (les deux mêmes séjours, tronqués, répétés 30 fois) puis « +8 autres » : la vue mois est illisible dès qu'un séjour dure. Les séjours longs devraient être des **barres** continues, pas une puce par jour. |
| P2 | événements | Une ligne d'événement ne donne que l'heure et le **titre du bien** : ni le type en mots, ni le client, ni l'adresse. « 10:57 · Local commercial à Dakar-Plateau » : visite ? avec qui ? |
| P2 | couleurs | Échéances de bail et Interventions ont **deux verts** voisins ; « en attente » est un gris sur fond de jour gris. Les bascules de type en couleurs pastel portent seules l'information d'état (actif/inactif). |
| P2 | téléphone | La légende et la bascule des cinq types (« Échéances de bail » sur deux lignes, « Interventions » coupé) prennent 400 px à chaque visite de la page. |
| P2 | planifier | « Planifier une visite » depuis l'agenda ne préremplit pas la date ni l'heure du jour sélectionné ; on ne peut pas créer un événement en touchant un créneau. |
| P2 | liste des biens | Le filtre « Tous les biens » est déduit des événements de la période et nomme chaque bien d'après le titre d'un de ses événements (`CalendarPage.tsx:138-149`). |
| P3 | libellés | « Calendrier » au menu, « Agenda » dans la spec, « vue unifiée » en sous-titre. |

**Proposition — mobile** *(l'agenda de l'agent, pas celui de l'agence)*

```
┌──────────────────────────────────────┐
│ Agenda              [Moi ▾]   [+]    │
│ L  M  M  J  V  S  D                  │ ← bande de 7 jours, points
│ 9 [10] 11 12 13 14 15                │
├──────────────────────────────────────┤
│ MARDI 10 NOVEMBRE                    │
│ 10:57 ● Visite · Local Dakar-Plateau │
│        Abdoulaye Cissé  [📍][📞][💬] │
│ 16:55 ● Visite · Terrain Dakar-Pl.   │
│ 18:00 ● Tâche · Relancer Yacine      │
│ ───────────────────────────────────  │
│ OCCUPATION (8 séjours en cours)    ▸ │ ← replié : ce n'est pas mon agenda
└──────────────────────────────────────┘
```

- **Vue Jour par défaut en téléphone**, bande de semaine défilante au-dessus ; le mois en option.
- Types et biens dans une feuille « Filtres » (un bouton avec compteur), légende dedans.
- Toucher un créneau vide → « Planifier une visite à 15:00 ».

**Proposition — bureau**

- **Semaine par défaut** pour l'agent (créneaux horaires, visites et tâches), **Mois** pour l'admin
  et le bailleur avec les **séjours en barres** continues et les visites en puces.
- « Occupation des biens » devient une vue à part (un bien par ligne, le temps en colonnes) : c'est
  le planning dont le bailleur courte durée a besoin, et qui sort l'occupation de l'agenda personnel.
- Panneau du jour gardé ; événements enrichis (type, client, adresse).

**Ambition**

- **Disponibilités de l'agent** : déclarer ses créneaux de visite une fois ; la demande de visite
  publique, la planification console et la réponse WhatsApp (§ 1) proposent alors de vrais créneaux.
  C'est le même moteur que « Proposer un autre créneau » (TCK-590), étendu à l'agent.

---

## Le fil métier, de bout en bout — mesuré

Demande de contact sur le site public → prospect → visite planifiée → visite faite → compte rendu →
candidature / offre / bail. Parcours relevé pour l'**agent au téléphone** (persona `agent`), à partir
de la notification ; « geste » = une touche ou une saisie.

| # | Étape | Écran | Gestes | Ce qui se perd |
|---|---|---|---|---|
| 1 | Ouvrir la demande | cloche → notification → `/app/leads?lead=` | 2 | — (la demande est bien mise en tête) |
| 2 | Répondre | WhatsApp (application externe), retour | 2 | la demande reste « À traiter » tant qu'on ne touche pas « Marquer traitée » (+1) |
| 3 | En faire un prospect | « Convertir en client » → « Voir la fiche client » | 2 | **le message et le bien demandé** ne passent pas dans la fiche |
| 4 | Planifier la visite | fiche → « Planifier une visite » → chercher le bien (saisie) → le choisir → date → heure → Planifier | 7 + saisie | **le bien est à rechercher à nouveau** ; les créneaux ne tiennent pas compte de l'agenda |
| 5 | Le jour J, retrouver la visite | Visites → « Confirmées » → la visite | 3 | **ni adresse, ni itinéraire, ni WhatsApp** au visiteur |
| 6 | Clore la visite | Terminer → note 1-5 → commentaire → Envoyer | 4 + saisie | le « feedback » ne remonte ni dans la fiche ni dans le pipeline |
| 7 | La suite | **aucun geste depuis la visite** : fiche CRM → changer l'étape (2) ; pour une location : Menu → Baux → nouveau bail (bien et locataire à ressaisir) ; pour une offre de vente : **impossible depuis la console** | 4 à 6 + formulaire de bail | **le fil casse** : la console ne sait pas enregistrer une candidature ou une offre ; le bail ne connaît ni la visite ni la demande |

**Bilan : 7 écrans, 24 à 26 gestes plus quatre saisies, et trois ruptures de contexte** (le message
au § 3, le bien au § 4, tout le dossier au § 7). Le passage *visite → engagement*, celui qui fait le
chiffre d'affaires, est le seul qui n'a **aucun écran**. Le seul pont existant part de l'autre bout :
une candidature **déposée par le client** sur le site, acceptée, donne « Créer le bail » prérempli
(§ 5) — l'agent ne peut que l'attendre.

**Cible proposée** (maquette « Le fil commercial ») : demande → « Visite ▸ » (bien et demandeur
préremplis, fiche créée au passage, message en note) → visite du jour avec itinéraire → compte rendu
en trois touches → « Inviter à candidater / faire une offre » (lien WhatsApp) ou « Créer le bail » →
le pipeline avance seul. **3 écrans, une dizaine de gestes, aucune ressaisie.**

---

## Navigation de la famille — bureau et téléphone

**Ce qui existe** (`lib/navigation/dispositions.ts`, `catalogue.ts`).

| | Bureau (colonne) | Téléphone (onglets) |
|---|---|---|
| **Agent** | tête : Messagerie, Mes tâches · **Prospection** : Demandes de contact, Clients (CRM), Visites, Calendrier · **Catalogue** : Mes biens, Réservations · Tableau de bord · Gestion (Baux…) | Accueil · Demandes · Visites · Messagerie · Menu |
| **Admin d'agence** | Tableau de bord, Vue agence, Messagerie · **Activité** : Demandes de contact, Visites, Réservations, Calendrier · **Portefeuille** : …, Clients (CRM), … · Mes tâches sous « Plus » | Accueil · Demandes · Biens · Messagerie · Menu |
| **Bailleur** | Activité : Demandes, Visites, Réservations, Calendrier ; Clients sous « Plus » | Accueil · Mes biens · Demandes · Messagerie · Menu |
| **Client** | Mes démarches : Visites, Réservations | Accueil · Favoris · Visites · Messagerie · Menu |

**Constats**

| Sév. | Constat |
|---|---|
| P1 | **Une même personne vit sous quatre entrées** selon son étape : « Demandes de contact » (message), « Clients (CRM) » (fiche), « Pipeline » (carte), « Visites » (rendez-vous), sans fil entre elles. Le **pipeline n'est dans aucun menu** : on n'y arrive que par un bouton de la liste des clients. |
| P1 | **Aucune entrée « Aujourd'hui » pour l'agent.** Ses visites du jour sont dans l'agenda (sous trois écrans de filtres et de séjours), ses tâches dues dans une autre page, ses demandes dans une troisième ; l'accueil de l'agent montre « Biens gérés 25 · Pipeline 38 · Tâches ouvertes 4 (4 en retard) · Commissions 0 F » et des raccourcis, **pas sa journée** (famille 3). |
| P2 | Le bloc « Aujourd'hui » de la colonne compte « Visites à confirmer **99+** » : un compteur saturé n'est plus un signal. |
| P2 | En bureau, le bouton flottant « Messagerie » double l'entrée du menu et couvre le coin bas droit des listes (famille 3 ; ADR-0090 le retire du téléphone seulement). |
| P2 | L'admin a « Mes tâches » sous « Plus » alors qu'il n'a aucune vue des tâches de l'équipe ; le bailleur a « Clients » sous « Plus » mais ne peut pas en créer. |
| P3 | Libellés : « Clients (CRM) » au menu, « Mon CRM » en raccourci d'accueil, « Pipeline » en tuile ; « Calendrier » au menu, « agenda » dans la spec. |

**Proposition — téléphone (agent)** *(changement de `DISPOSITIONS.agent.onglets`, ADR-0089)*

```
┌─────────┬─────────┬─────────┬─────────┬─────────┐
│   ☀︎     │   📥    │   👥    │   💬    │   ☰     │
│Aujourd'hui│Demandes│ Clients │Messages │  Menu   │
└─────────┴─────────┴─────────┴─────────┴─────────┘
```

- **Aujourd'hui** : visites du jour (heure, adresse, visiteur, gestes), tâches dues et en retard,
  comptes rendus manquants, demandes > 24 h ; un sélecteur de jour en tête ; il **remplace l'accueil**
  de l'agent et absorbe Visites + Agenda + Tâches au quotidien (les pages restent au menu).
- **Demandes** : la boîte du § 1. **Clients** : la liste « À relancer / Mes clients » du § 2, avec
  le pipeline comme vue (bascule Liste | Étapes).

**Proposition — bureau**

- Un groupe **« Commercial »** unique pour l'agent et l'admin : Aujourd'hui · Demandes · Clients
  (vues Liste / Pipeline / À relancer) · Visites · Réservations (Séjours, Candidatures, Offres) ·
  Agenda · Tâches. Le pipeline entre au menu et dans « Aller à ».
- Le bloc « Aujourd'hui » de la colonne affiche des **délais**, pas des stocks : « 1 demande > 24 h »,
  « 3 visites à confirmer cette semaine », « 2 comptes rendus en retard ».

---

## Transversal — ce qui touche toute la famille

1. **Le « qui » manque aux listes** : visites (ni visiteur ni agent), réservations (ni client), pipeline
   (« par » = créateur, pas référent). Partout, la personne est la première information utile.
2. **Les gestes de contact sont inégaux** : Appeler + WhatsApp existent sur les demandes, la fiche
   client, les cartes du pipeline et les tâches — **pas** sur la visite ni sur la réservation, là où
   l'agent en a le plus besoin. Un composant unique (`ContactGestures`) existe : il suffit de le poser.
3. **Formulaires en dialogue centré en téléphone** : Planifier une visite, Attribuer, motif de
   Converti/Perdu, Replanifier, Annuler, Enregistrer un paiement. Même règle que la famille 1 :
   **sous `md`, un formulaire est une feuille plein écran avec bouton collant**.
4. **Vocabulaire d'outil** : Lead, Pipeline, CRM, Tags, Feedback, « Vos leads ». Proposition :
   *Nouveau / Prospect / Qualifié / Négociation / Gagné / Perdu*, « Étapes », « Étiquettes », « Compte
   rendu ».
5. **Formats** : téléphones bruts (« +221778103538 » au lieu de « +221 77 810 35 38 ») ; moyen de
   paiement en code (« orange_money ») ; **séparateur de milliers invisible** dans les montants en
   `font-semibold` (« 491164 F CFA », U+202F non dessiné) — à vérifier au-delà de la famille.
6. **Onglets à compteurs incohérents** : visites (tous les onglets comptés), demandes (onglet actif
   seulement), réservations (aucun), tâches (aucun). Et deux listes s'ouvrent sur un onglet vide
   (réservations « En attente », tâches de l'admin).
7. **Erreurs sans issue** : « Les demandes n'ont pas pu être chargées » sans « Réessayer » ; sous
   charge, un délai serveur dépassé rend l'erreur de la coque (logo seul, ni menu ni onglets) au lieu
   d'une erreur dans la page.
8. **Aucune donnée de délai** : ni heure de première réponse à une demande, ni date de passage
   d'étape fiable pour les indicateurs (le taux de conversion lit `updated_at`). Le pilotage
   commercial de l'admin n'a pas de matière.

---

## Synthèse de la famille 5

### Les chantiers, classés

| # | Chantier | Pages | Pourquoi d'abord |
|---|---|---|---|
| A | **Le fil commercial sans rupture** : la conversion emporte message et bien ; « Visite ▸ » depuis une demande, prérempli ; compte rendu en trois touches puis **suite** (inviter à candidater / faire une offre, créer le bail, 2e visite, relance) ; **saisir une candidature ou une offre depuis la console** | 1, 2, 4, 5 | Le P0 de la famille et quatre P1 ; c'est le passage qui fait le chiffre d'affaires |
| B | **L'agent sur le terrain** : « Aujourd'hui » (onglet et page), visite avec adresse, itinéraire, Appeler/WhatsApp, agenda Jour par défaut en téléphone, séjours sortis de « Mes rendez-vous » | 4, 6, 7, navigation | Cinq P1 ; c'est la situation qui compte (porteur) |
| C | **Fiche client lisible** : résumé (cherche, origine, prochaine action), fil unique, édition en feuille, liste « À relancer » et colonnes utiles | 2 | Trois P1 ; la fiche est l'écran le plus ouvert pendant un appel |
| D | **Boîtes qui se traitent vite** : demandes en boîte de réception (âge, doublon annoncé, « c'est traité ? » au retour), visites à confirmer en ligne et en lot, réservations avec client, nature et compteurs | 1, 4, 5 | Six P1/P2 de débit ; 139 visites à confirmer aujourd'hui = 400 touches |
| E | **Pipeline honnête** : indicateurs recalculés sur le journal d'étapes, carte enrichie (cherche, référent, prochaine action), filtres, colonnes terminales repliées, étapes proposées par les événements | 3 | Le chiffre affiché à l'admin est faux ; aucune relance n'en sort |
| F | **Socle** : feuilles mobiles, vocabulaire, formats (téléphone, montants, moyens de paiement), compteurs d'onglets, réservations terminées accessibles, erreurs avec « Réessayer », tâches modifiables et reportables | toutes | Petits correctifs, grand effet ; prérequis de A-D |

### Décisions qui reviennent au porteur

1. **Saisir une candidature ou une offre depuis la console pour un client** (l'API l'accepte,
   `StoreBookingRequest` : `customer_id`) : a) oui, l'agent saisit ce que le client dit ; b) non,
   l'agent **envoie un lien** (WhatsApp) et le client dépose lui-même ; c) les deux, le lien d'abord.
   → Recommandation : **c** — le lien garde le consentement et les pièces du client, la saisie couvre
   l'offre faite de vive voix à la sortie d'une visite.
2. **Réservations, candidatures et offres** : a) une page, un sélecteur de nature (Séjours ·
   Candidatures · Offres) et le vocabulaire de chaque objet ; b) trois pages distinctes au menu ;
   c) inchangé. → Recommandation : **a**, puis **b** si les candidatures prennent un dossier à part
   entière (pièces, garant).
3. **« Répondre » vaut-il « traiter » ?** a) WhatsApp ou Appeler marquent la demande traitée d'office ;
   b) au retour dans l'application, une barre demande « C'est traité ? » ; c) inchangé.
   → Recommandation : **b** — la boîte dit vrai sans clore une demande restée sans réponse.
4. **Barre d'onglets de l'agent** (⚑ change `DISPOSITIONS.agent`, ADR-0089) : a) **Aujourd'hui ·
   Demandes · Clients · Messages · Menu**, « Aujourd'hui » remplaçant l'accueil ; b) garder Accueil ·
   Demandes · Visites · Messagerie et refaire l'accueil en « Ma journée » ; c) inchangé.
   → Recommandation : **a**.
5. **Le pipeline avance-t-il seul ?** a) le produit **propose** l'étape suivante sur un événement
   (visite confirmée, compte rendu, candidature, bail) et l'agent confirme d'un geste ; b) il avance
   automatiquement ; c) manuel comme aujourd'hui. → Recommandation : **a**.
6. **Vocabulaire commercial** : a) français partout — Nouveau / Prospect / Qualifié / Négociation /
   Gagné / Perdu, « Étapes », « Étiquettes », « Compte rendu », « Clients » sans « (CRM) » ;
   b) garder les termes d'outil (Lead, Pipeline, CRM). → Recommandation : **a**.
7. **Mesurer le délai de première réponse** (donnée neuve : heure du premier geste de réponse sur une
   demande, et date de chaque passage d'étape fiable pour les indicateurs) : a) oui, affiché à l'admin
   par agent ; b) oui, sans affichage par agent ; c) non. → Recommandation : **a** — c'est l'indicateur
   qui prédit le mieux la conversion, et il ne coûte qu'une colonne.
8. **Les séjours dans l'agenda personnel** : a) sortis de « Mes rendez-vous » vers une vue
   « Occupation des biens » ; b) gardés, repliés en fin de journée ; c) inchangé.
   → Recommandation : **a** pour l'agent, **b** pour l'hôte et le bailleur courte durée.

## Maquettes choisies le 2026-11-10

> **Le porteur a validé la recommandation de chaque page**, avec les compléments ci-dessous. Les
> maquettes ont été retouchées le jour même ; la visionneuse marque l'approche « retenue ». Elles
> sont la **référence de fidélité** des tickets à écrire (cf. README). Rien ne s'implémente avant
> que le porteur dise comment attaquer l'implémentation (qui se fera sur Opus 5.5).

| Page | Approche retenue | Visionneuse |
|---|---|---|
| Le fil commercial | A — La fiche client porte le fil | `?p=app-fil-commercial&a=a` |
| Demandes | A — La boîte de réception | `?p=app-demandes&a=a` |
| Clients | A — Résumé + fil | `?p=app-clients&a=a` |
| Pipeline | A — Relances d'abord, kanban en vue | `?p=app-pipeline&a=a` |
| Visites | A — Par le temps | `?p=app-visites&a=a` |
| Réservations | A — Un écran, trois natures | `?p=app-reservations&a=a` |
| Aujourd'hui | A — La chronologie | `?p=app-aujourdhui&a=a` |
| Agenda | A — Mon agenda / Occupation | `?p=app-agenda&a=a` |

- **Pipeline, A** : téléphone redessiné (« pas beau ») — carte de portefeuille et liste « À relancer »
  triée par retard. Règle de périmètre : **l'agent ouvre sur « Moi »** (38 actifs pour Sokhna Sène),
  **l'admin sur « Agence »** (53) ; le bureau montre l'admin.
- **Visites, A** : téléphone redessiné (« pas beau ») — l'heure et l'adresse d'abord, une couleur
  forte par écran. **Décision 2a** : trois gestes changent de place et sont gardés — « Autre heure »
  devient la pastille « Autre… » ; « Faire le compte rendu » devient les trois verdicts sur la carte ;
  « Oui, qualifié / Plus tard » devient un interrupteur. Visites n'est plus un onglet de l'agent
  (Aujourd'hui + Menu).
- **Aujourd'hui, A — décision « a »** : pour l'agent, l'accueil EST Aujourd'hui (un seul écran pour la
  journée, pas de doublon avec l'accueil de la famille 3). Il porte en bas les chiffres de l'ancien
  accueil (biens gérés, prospects, tâches ouvertes, commissions), chacun en lien, et « Voir le
  rapport du mois ». Il absorbe « Mes tâches » (entrée « Tâches »).
