# Famille 1 — Site public

> Audit du 2026-11-08 sur `dev` (4152090b0). Méthode et limites : [README](README.md).
> Visiteur anonyme sauf mention. Bureau 1440 × 900, téléphone 390 × 844 tactile.

**Qui vient ici, et pour quoi.** Le site public a trois publics, et chaque page doit savoir lequel
elle sert :

- **le chercheur** (locataire, acheteur, souvent sur téléphone, souvent sur une connexion moyenne,
  souvent arrivé par un lien WhatsApp ou Facebook) — il veut trouver, juger et **joindre quelqu'un** ;
- **le propriétaire ou l'agent qui hésite à publier** — il veut savoir si Takussan lui amènera des
  contacts ;
- **le moteur de recherche et l'aperçu de partage** — ils décident si le chercheur arrive un jour.

**La mesure de succès du site public est le contact qualifié** (visite demandée, message, appel,
dossier), pas la page vue. Chaque fiche ci-dessous se juge à ça.

---

## 1. Accueil — `/fr`

**Rôle business.** Remettre le chercheur dans une recherche en un geste ; montrer au propriétaire
qu'il y a du monde ici. La charte interdit le hero marketing (modèle Airbnb) : décision respectée
dans cette fiche.

**Ce qui marche**

- La recherche est le premier objet de la page, en bureau comme en mobile, avec l'autocomplétion
  qui mêle **lieux** et **biens** (« Alma » → Almadies, 9 biens, plus 3 annonces) : c'est le bon
  modèle.
- Les rangées ont chacune une intention lisible (près de toi, à louer, coup de cœur, à vendre,
  nouveau), et « Coup de cœur » a sa propre forme (carte Cover) : la charte des variantes y est tenue.
- Pied de page complet, langue accessible partout.

**Constats**

| Sév. | Où | Constat |
|---|---|---|
| P1 | mobile, en-tête | **Les catégories (Appartement, Studio, Chambre, Terrain…) disparaissent sous `md`.** En bureau elles sont la deuxième ligne de l'en-tête ; en mobile il ne reste qu'un champ « Chercher ». Le chercheur mobile, le plus nombreux, perd le geste le plus rapide pour filtrer. |
| P1 | mobile, recherche | **La recherche plein écran est vide** : deux raccourcis (Louer, Acheter) et 600 px de fond. Ni quartiers populaires, ni recherches récentes, ni type de bien, ni budget. Sur Airbnb, Leboncoin ou SeLoger, cet écran est le plus riche de l'app. Dès qu'on tape, le choix Louer/Acheter disparaît. |
| P1 | page entière | **Cinq rangées, même grammaire, mêmes biens.** 60 cartes, et le même bien revient dans « Près de toi », « À vendre » et « Tout juste publié » (relevé : *Terrain viabilisé à Point E*, *Pièce indépendante à Parcelles Assainies*). La page est longue sans être riche : rien sur les quartiers, les budgets types, les agences, la confiance. |
| P1 | mobile, cartes | **Quatre à six éléments posés sur la photo** dans les rangées : pastille de transaction, favori, comparateur, et sur « Coup de cœur » « Neuf » + « En vedette » en plus. La charte (TCK-555) limite à deux sous `md` pour la carte de liste ; les cartes de l'accueil n'ont pas reçu la règle. Le comparateur, en particulier, n'a rien à faire sur une carte de vitrine mobile. |
| P2 | « Près de toi » | Le titre promet de la géolocalisation, la rangée montre Dakar par défaut. Sans permission, l'intitulé ment ; avec, rien ne le montre. |
| P2 | cartes | La ligne de détails tronque l'ancienneté en « la semai… », « il y a 4 s… » : l'information est perdue au lieu d'être raccourcie (« 1 sem. »). |
| P2 | mobile, en-tête | Aucun accès « Publier » visible : il est dans le menu. Le propriétaire mobile — la moitié de l'offre — doit le chercher. |
| P2 | mobile, menu | Le menu ne contient que Connexion, Publier et la langue. Ni Louer, ni Acheter, ni Agences, ni Agents, ni Favoris, ni Comparateur : **tout ce que le pied de page sait, le menu l'ignore**. Le logo prend le focus à l'ouverture, avec un anneau terracotta plein cadre. |
| P3 | carte en erreur d'image | La première carte (média 3537) affiche un aplat terracotta avec un libellé illisible au centre : le repli d'image ne ressemble à aucun autre repli du site. |
| — | données de démo | Rangée « À louer » saturée de *Villa Luxe 5000m²* / *Micro Studio 10m²* à 500 000 F (biens de test des filtres). Une vraie rangée « À louer » doit exclure les biens de test et diversifier (un bien par propriétaire, par exemple). |

**Proposition — mobile** *(l'écran le plus vu du produit ; il doit tenir dans le pouce)*

1. **En-tête de 56 px** : logo-symbole · champ « Où cherchez-vous ? » (pleine largeur restante) ·
   avatar ou « Se connecter » en icône. Le favori quitte l'en-tête et passe dans la barre du bas.
2. **Juste sous l'en-tête, une bascule `Louer | Acheter`** pleine largeur (segmenté, 44 px), puis
   **une rangée défilante de catégories** en pastilles icône + libellé (Appartement, Studio,
   Chambre, Villa, Terrain, Bureau, Commerce…). Ces deux contrôles **sont** la page d'accueil mobile :
   deux gestes et on est dans une liste filtrée.
3. **« Quartiers »** : une rangée de tuiles photo carrées (Almadies, Ngor, Mermoz, Plateau,
   Parcelles…) avec le nombre d'annonces. C'est la façon dont un Dakarois pense sa recherche, et
   c'est un contenu que personne d'autre ne montre aussi bien.
4. **Les rangées de biens, réduites à trois** : « Près de toi » (géolocalisé si permis, sinon
   « À Dakar », dit honnêtement), « Coup de cœur » (Cover), « Tout juste publié ». Une rangée,
   une carte de 70 % de largeur, **une pastille et un favori sur la photo, rien d'autre**. Le
   comparateur sort des cartes de l'accueil.
5. **Un bloc propriétaire** discret en fin de page : « Vous avez un bien à louer ? 1 240 personnes
   ont cherché à Dakar cette semaine » + « Publier gratuitement ». C'est du contenu, pas un hero :
   la charte tient.
6. **Barre d'onglets en bas** (voir § Navigation publique) : Explorer · Favoris · Publier ·
   Messages · Compte. Elle porte tout ce que le menu hamburger porte mal aujourd'hui.

**L'écran de recherche mobile, à refaire entièrement :**

```
┌──────────────────────────────────────┐
│ ←  [ Où cherchez-vous ?          ]   │
│     ( Louer ) ( Acheter )            │  ← reste visible pendant la frappe
├──────────────────────────────────────┤
│ 📍 Autour de moi                     │
│ RÉCENTS                              │
│ 🕘 Studio · Mermoz · < 300 000 F     │  ← recherche complète rejouable
│ 🕘 Almadies                          │
│ QUARTIERS POPULAIRES                 │
│ [Almadies] [Ngor] [Mermoz] [Plateau] │  ← pastilles, 1 tap = liste
│ [Ouakam] [Parcelles] [Yoff] [Thiès]  │
│ TYPE DE BIEN                         │
│ [Appartement] [Studio] [Chambre] …   │
└──────────────────────────────────────┘
```

**Proposition — bureau**

- Même logique de contenu : quartiers et bloc propriétaire ajoutés, rangées réduites, doublons
  retirés.
- La deuxième ligne de catégories peut se replier quand on défile (en-tête de 72 px au lieu de 127).

**Ambition**

- **Recherche en langage naturel** dans le même champ : « studio meublé Mermoz moins de 300 000 »
  → filtres posés. Le socle IA existe déjà (ADR radar / socle IA).
- **Alertes en un geste** depuis l'accueil (« Me prévenir des nouveaux studios à Mermoz ») : c'est
  ce qui fait revenir un chercheur, et ce qui crée un compte sans formulaire d'inscription.

---

## 2. Liste des biens — `/fr/properties`

**Rôle business.** C'est la page où le chercheur passe le plus de temps : il doit pouvoir parcourir
172 résultats vite, affiner sans perdre sa place, et ouvrir les bons. Les biens sponsorisés y sont
vendus : la page porte aussi un revenu.

**Ce qui marche**

- Titre explicite (« Biens immobiliers à louer », « 172 biens trouvés »), barre d'outils complète
  (Filtres avec compteur, tri, sauvegarder la recherche, carte).
- En mobile, la barre « Filtres | Carte » **flotte en bas quand on défile** : exactement le bon
  geste au bon endroit.
- Le panneau de filtres mobile est une feuille avec un bouton collant « Voir 172 biens » qui annonce
  le résultat avant de valider.
- Le champ de l'en-tête rappelle le contexte (« Chercher · À louer »).

**Constats**

| Sév. | Où | Constat |
|---|---|---|
| P1 | mobile, liste | **Une carte = 420 px, soit deux biens par écran, et 40 biens par page = 18 000 px de défilement** avant la pagination. Le chercheur compare des dizaines de biens : à ce rythme, il en voit dix et abandonne. TCK-555 avait choisi la colonne pleine largeur en gardant la ligne horizontale « en réserve si la longueur de liste se révèle coûteuse » : elle l'est. |
| P1 | mobile, filtres | **L'ordre des filtres ne suit pas l'usage.** Le premier écran de la feuille montre 16 types de bien (dont Usine, Ferme, Complexe, Hôtel) ; le **budget** et les **chambres**, les deux filtres que tout locataire pose, sont sous la ligne de flottaison, après « Fréquence de loyer ». |
| P1 | liste, haut de page | **La première rangée est entièrement promue** (3 « Sponsorisé » + 1 « En vedette » en bureau ; le premier bien en mobile). Le chercheur lit « publicité » avant de lire « résultat » : la confiance dans le tri baisse, et la valeur de l'emplacement payé baisse avec elle. |
| P2 | cartes | **Épingle de lieu sans lieu** : quand l'adresse manque (*Micro Studio 10m²*), la carte affiche l'icône seule. Il faut masquer la ligne. |
| P2 | mobile, pagination | Pagination numérotée « 1 … 5 » en bas de 18 000 px. En mobile, « Voir 40 biens de plus » (chargement à la suite, URL mise à jour) est le geste attendu ; le retour arrière doit ramener à la même position. |
| P2 | bureau | **Deux commandes pour le même filtre** : la rangée de catégories de l'en-tête et les puces « Type de bien » du panneau. À vérifier qu'elles restent synchronisées ; dans tous les cas, l'en-tête de la liste devrait montrer les filtres actifs en puces retirables, et la rangée de catégories n'a plus de raison d'être sur cette page. |
| P2 | bureau, cartes | Le prix est en terracotta sur la liste et en encre sur l'accueil (TCK-628) : deux règles pour le même objet. |
| P3 | bureau, panneau | « Fréquence de loyer » (Journalier, Hebdo…) au même rang que le budget : un filtre rare au premier niveau. |

**Proposition — mobile**

- **Deux densités, au choix du chercheur, mémorisées** : *Galerie* (la carte actuelle) et *Liste*
  (photo carrée de 112 px à gauche, prix · titre · quartier · 3 ch · 120 m² à droite, favori dans le
  coin). La Liste montre **5 à 6 biens par écran au lieu de 2**. Bascule dans la barre d'outils, à
  côté du tri.
- **Barre d'outils collante** sous l'en-tête une fois qu'on a défilé : puces des filtres actifs
  (« Louer ✕ », « Mermoz ✕ », « < 300 000 ✕ ») défilant horizontalement, puis « Filtres (3) ». On voit
  toujours ce qu'on regarde.
- **Feuille de filtres réordonnée par usage** : Louer/Acheter → **Budget** (curseur à deux poignées
  + histogramme des prix réels, plus les saisies min/max) → **Quartier** (multi-sélection) →
  **Chambres** → Type de bien (6 types courants, « Voir les 10 autres ») → Meublé, Parking,
  Disponibilité → « Plus de filtres ». Le bouton « Voir 172 biens » reste collé.
- **Carte en plein écran** depuis « Carte », avec une rangée de cartes défilante en bas, synchronisée
  avec les épingles (modèle Airbnb). Les prix sont posés sur les épingles.
- **Sponsorisés** : au plus un bien sponsorisé en tête, puis un toutes les 10 cartes, avec une
  mention « Sponsorisé » sobre. Les autres « en vedette » prennent leur rang naturel.

**Proposition — bureau**

- Puces de filtres actifs au-dessus de la grille ; rangée de catégories de l'en-tête retirée sur
  cette page.
- Vue partagée liste + carte (60/40) en option, carte qui suit le défilement.

**Ambition**

- **« Biens similaires mais moins chers »** quand la liste est courte ou vide : élargir
  automatiquement (quartier voisin, budget +10 %) et le dire.
- **Signal de fraîcheur et de réactivité** sur la carte : « Répond en général en 2 h », « Visité
  12 fois cette semaine ». C'est ce qui différencie une plateforme gérée d'un mur d'annonces.

---

## 3. Fiche d'un bien — `/fr/properties/[slug]`

**Rôle business.** C'est **la** page de conversion du produit. Tout ce qui précède sert à amener le
chercheur ici, et tout ce qui suit (visite, dossier, bail, paiement) part d'ici.

**Ce qui marche**

- **Le « Coût d'entrée »** (avance 3 mois, caution 2 mois, frais d'agence 0,5 mois, **total à
  l'entrée 12 320 000 F**) est la meilleure idée du site public. C'est la vraie question d'un
  locataire à Dakar, aucune plateforme concurrente ne la chiffre, et elle est chiffrée ici.
- Carte de réservation collante en bureau, galerie mosaïque, fil d'Ariane, conseil de prudence
  anti-arnaque, signalement d'annonce.
- **La demande de visite et le message ne demandent pas de compte**, et le message est pré-rempli
  avec le titre et la référence du bien.

**Constats**

| Sév. | Où | Constat |
|---|---|---|
| P0 | mobile, barre collante | **Le prix est tronqué dans la barre du bas** : « 2 240 000 F CF… » (mesuré : 172 px nécessaires, 146 disponibles à 390 px ; pire à 360). « /mois » disparaît. L'information la plus regardée de la page est la seule qu'on coupe. |
| P1 | mobile, ordre | **Le prix et le coût d'entrée arrivent à 2 200 px**, après la description, les caractéristiques, les équipements, la carte et les avis. En mobile, le bloc de réservation est rendu *après* le contenu ; c'est la mise en page bureau empilée, pas une page mobile. |
| P1 | actions | **Quatre portes pour contacter, mal ordonnées** : « Postuler » (primaire), « Demander une visite », « Envoyer un message », et « Message » dans la carte de l'agent. À Dakar, on visite avant de déposer un dossier : **la visite est l'action primaire d'une location**, le dossier vient après. Et deux boutons « message » ouvrent-ils le même chose ? |
| P1 | actions | **WhatsApp et Appeler vivent dans la carte de l'agent**, et n'y paraissent que si le contact a un numéro (`PropertyAgentCard.tsx:48-50`, `:146-170`) — absents sur ce bien de démo. En mobile, cette carte est à ~2 700 px, jamais dans la barre collante. Au Sénégal, WhatsApp est le canal de contact par défaut : le reléguer fait sortir le chercheur de la plateforme par une capture d'écran, et l'agent perd la trace du contact. |
| P1 | demande de visite | **20 créneaux de 09:00 à 18:30, tous proposés, tous égaux**, sans lien avec les disponibilités de l'agent. Le chercheur choisit au hasard, l'agent reçoit une heure qu'il ne peut pas tenir, et la « confirmation rapide » promise devient un échange de messages. Quatre types de visite (dont « Hybride ») ajoutent une décision que 95 % des gens ne se posent pas. |
| P1 | mobile, demande de visite | Dialogue centré de 812 px, **bouton d'envoi hors écran** (921 px de contenu) : il faut défiler dans une modale pour trouver « Demander la visite ». |
| P2 | message | Nom et message obligatoires, **e-mail et téléphone facultatifs tous les deux** : à vérifier qu'au moins un moyen de contact est exigé, sinon l'agent reçoit un message auquel il ne peut pas répondre. |
| P2 | « Postuler » | Sans compte, « Postuler » ouvre « Connectez-vous pour postuler » avec le focus sur **Annuler**. Bonne garde, mais le message « Vous ne serez pas débité avant la confirmation » sous le bouton parle de paiement à quelqu'un qui n'a encore rien choisi. |
| P2 | en-tête | « 0 vue » affiché publiquement : la preuve sociale négative fait plus de mal que l'absence de chiffre. Afficher à partir d'un seuil. |
| P2 | avatars | **Avatars cassés partout** (agent, auteurs d'avis) : le texte alternatif déborde (« Coun », « Pape »). Il faut un repli à initiales. |
| P2 | mobile, haut | La photo commence à 295 px, sous le titre, la note, le lieu, la référence, la pastille et trois icônes sans libellé (partager, favori, comparer). |
| P3 | formulaires | Libellés en CAPITALES dans la demande de visite (« DATE », « VOTRE NOM »), en casse de phrase dans le message : deux dialogues voisins, deux styles. |
| P3 | bureau | L'en-tête collant de 127 px garde la rangée de catégories sur la fiche, où elle ne sert à rien. |
| — | démo | Épingle de carte dans l'océan (coordonnées de démo), description d'une ligne. |

**Proposition — mobile** *(la page qu'il faut le plus soigner)*

```
┌──────────────────────────────────────┐
│ [←]                    [⇪] [♡]       │  ← sur la photo, pastilles 40 px
│                                      │
│         PHOTO PLEINE LARGEUR         │  ← 4:3, balayage, « 1/6 »
│                                1/6   │
├──────────────────────────────────────┤
│ 2 240 000 F / mois                   │  ← le prix d'abord
│ Villa avec jardin · Liberté 6        │
│ 3 ch · 2 sdb · 188 m² · ★ 4,0 (3)    │
│ ┌──────────────────────────────────┐ │
│ │ Pour entrer : 12 320 000 F    ⓘ  │ │  ← le coût d'entrée, replié
│ │ 3 mois d'avance · 2 de caution … │ │
│ └──────────────────────────────────┘ │
│ ┌──── Sokhna Gueye · Dakar Immo ✓ ─┐ │
│ │ Répond en ~2 h                    │ │  ← la personne, tôt
│ └──────────────────────────────────┘ │
│ Description · Caractéristiques …     │
│ Emplacement (carte statique, tap =   │
│ plein écran)                         │
│ Avis · Biens similaires              │
├──────────────────────────────────────┤
│ [ WhatsApp ] [ Visiter (primaire) ]  │  ← barre collante 64 px
└──────────────────────────────────────┘
```

- **Barre collante sans prix** (il est en haut et l'utilisateur l'a lu) : deux boutons de largeur
  égale. Pour une location : **WhatsApp** (ou **Appeler** si le contact n'a pas WhatsApp) et
  **Visiter**. Pour une vente : **WhatsApp** et **Être rappelé**. « Postuler » rejoint la feuille
  qui suit une visite, et le corps de la page.
- **Demande de visite en feuille plein écran, en deux temps** :
  1. *Quand ?* — trois jours en pastilles (« Demain », « Sam. 14 », « Lun. 16 », « Autre date »),
     puis Matin / Midi / Après-midi / Soir. **Les créneaux viennent des disponibilités de l'agent**
     quand il en a posé ; sinon, la tranche suffit.
  2. *Qui ?* — nom, téléphone (+221 déjà posé, `inputmode="tel"`), « Me contacter sur WhatsApp »
     coché. Le type de visite se replie sous « Autre format (visio, clés…) ».
  Bouton « Envoyer la demande » collé en bas de la feuille.
- **Après l'envoi**, un écran de confirmation qui dit ce qui va se passer (« Sokhna confirme en
  général dans les 2 h, par WhatsApp ») et propose **la suite** : « Préparer mon dossier » (c'est là
  que « Postuler » a sa place), « Me prévenir des biens similaires ».

**Proposition — bureau**

- Carte de réservation : **« Demander une visite » en primaire** pour une location, « Postuler » en
  secondaire, « Envoyer un message » en lien ; WhatsApp / Appeler dans la carte de l'agent. Une
  seule porte « message ».
- Rangée de catégories retirée de l'en-tête sur la fiche.

**Ambition**

- **Disponibilités réelles** : l'agent pose ses créneaux une fois (famille 5, agenda) et la fiche
  les propose ; la visite se confirme sans aller-retour. C'est le différenciateur le plus net d'une
  plateforme qui *gère* face à un site d'annonces.
- **Simulateur de coût d'entrée** déplié : « Avec 2 mois d'avance au lieu de 3 » si le propriétaire
  l'accepte (négociable affiché par lui).
- **Score de confiance de l'annonce** (agent vérifié, photos récentes, visites faites ce mois) en une
  ligne, à côté du conseil de prudence.

**Ingénieur (fiche)** — `getBiensSimilaires` ne dépend que du slug mais part après `getProperty`
(`properties/[slug]/page.tsx:168,195`) : à lancer en parallèle. Le bloc `openGraph` de la page
remplace celui du layout et perd `siteName`, `og:locale`, `og:url` (`:120`) — c'est l'aperçu
WhatsApp de chaque annonce partagée. Dialogues = modales centrées (`components/ui/dialog.tsx:58`) ;
le partage passe par `PropertyShareDialog` et pas `navigator.share` — le `ShareButton` qui l'utilise
n'est importé nulle part.

---

## 4. Agences — `/fr/agencies` et `/fr/agencies/[slug]`

**Rôle business.** Double : rassurer le chercheur (« il y a de vraies agences derrière »), et
**vendre Takussan aux agences** qui n'y sont pas encore — la page index est vue par leurs
concurrents. Pour l'agence présente, sa fiche est sa vitrine gratuite.

**Ce qui marche**

- Index sobre et lisible : nom, villes, biens à louer / à vendre, badge vérifié.
- Fiche agence : licence affichée, chiffres clés (45 à louer, 22 à vendre, 8 villes, 7 agents),
  équipe, portefeuille filtrable (Tous / À louer / À vendre), contact en tiroir bas sur mobile.

**Constats**

| Sév. | Où | Constat |
|---|---|---|
| P1 | fiche agence, « L'équipe » | **« 18 interlocuteurs » liste les propriétaires clients de l'agence** (Sokhna Gueye, Aminata Mbaye… « Propriétaire ») à côté de ses agents, alors que le bandeau dit « 7 agents ». Une agence expose ainsi publiquement **son fichier de bailleurs** à ses concurrents — c'est l'actif qu'elle protège le plus. À trancher par le porteur (voir questions). |
| P1 | mobile, index | **Le premier résultat arrive à 717 px** : titre sur trois lignes, paragraphe, champ, puis **11 villes en pastilles sur trois lignes**. |
| P1 | mobile, fiche | **Page de 25 800 px** : 48 biens rendus d'un coup en cartes carrées pleine largeur (470 px chacune). La fiche d'agence n'a ni recherche, ni tri, ni densité liste. |
| P2 | fiche | Contact : « Envoyer un email » en primaire (desktop) ouvre en fait un **formulaire de message** — le libellé ment ; sur mobile, « Contacter » ouvre un tiroir qui propose **un seul canal** (« Choisis ton canal… » puis un bouton) : un tap pour rien. Pas de WhatsApp. |
| P2 | mobile, tiroir contact | **Titre et texte collés au bord gauche de l'écran** (padding 0 mesuré sur le tiroir et son premier enfant). |
| P2 | partout | **Logo d'agence cassé** (repli navigateur) sans repli à initiales, alors que la fiche agent en a un. |
| P2 | index | Pas de note, pas de délai de réponse, pas de « Voir ses annonces » : rien n'aide à **choisir** une agence. |
| P2 | index | **Aucun appel aux agences absentes** (« Votre agence n'est pas là ? Rejoindre Takussan ») : la page la plus vue par des professionnels ne leur parle pas. |
| P3 | index | Recherche par nom avec bouton « Rechercher » pour 3 agences : un filtrage à la frappe suffit. |

**Proposition — mobile**

- **Index** : titre sur une ligne (« Agences »), villes en **une rangée défilante**, puis des cartes
  denses : logo · nom ✓ · « 67 biens · Dakar, Mbour » · ★ 4,6 · « Répond en ~1 h ». Le premier
  résultat à moins de 300 px.
- **Fiche agence** : en-tête compact (logo, nom, note, licence), **barre collante « WhatsApp ·
  Appeler · Message »**, puis onglets *Biens · Équipe · Avis · Infos* (adresse, horaires, zones).
  Les biens en **liste dense** filtrable (Louer/Acheter, type, budget) avec « Voir plus » — jamais
  48 cartes d'un coup.
- **Équipe** : les agents seulement (photo, langues parlées, spécialité) ; les propriétaires n'y
  figurent pas, ou seulement s'ils l'ont accepté.

**Ambition** — une **page d'agence qui vend l'agence** : bannière, texte « Pourquoi nous »,
avis vérifiés (issus de baux réels signés sur Takussan), « Biens loués ce mois : 12 ». C'est le
produit que Takussan peut facturer (vitrine premium) et l'argument d'adoption n° 1 auprès des
agences.

**Ingénieur** — erreur faite main sans `ErrorState` ni réessayer (`IndexDeProfils.tsx:121-126`) ;
portefeuille vide fait main (`agencies/[slug]/page.tsx:281`) ; logo sans repli d'erreur (`:144`) ;
`openGraph` qui écrase celui du layout (`:87`) ; pas de `BreadcrumbList`.

---

## 5. Agents & propriétaires — `/fr/agents` et `/fr/agents/[slug]`

**Rôle business.** Mettre un visage sur l'annonce. Pour un agent indépendant, c'est sa carte de
visite ; pour un propriétaire particulier, la question est d'abord : **veut-il être là ?**

**Ce qui marche** — même grammaire que les agences (cohérence), repli à initiales sur la fiche
(« SG »), portefeuille filtrable, tiroir de contact sur mobile.

**Constats**

| Sév. | Où | Constat |
|---|---|---|
| P1 | index | **44 profils dont une majorité de propriétaires particuliers**, nom complet et portefeuille publics. Un particulier qui confie son bien à une agence ne s'attend pas à être annuaire. À trancher (voir questions) — si la règle est voulue, elle doit au moins être un **choix** du propriétaire dans son profil. |
| P2 | URL | Les slugs disent le rôle et l'agence, pas la personne : `/agents/dakar-immo-owner-4`. Mauvais pour le partage (« takussan.com/agents/sokhna-gueye ») et le référencement. |
| P2 | fiche | Pas de bio, de langues parlées (français, wolof, anglais : décisif à Dakar), de zones, de délai de réponse, d'avis. La fiche est un portefeuille, pas une personne. |
| P2 | index, cartes | Avatars cassés sur l'index (alors que la fiche a son repli à initiales) : deux composants pour la même chose. |
| P2 | fiche | « Envoyer un email » ouvre un formulaire de message (même défaut que l'agence) ; un seul canal dans le tiroir. |

**Proposition — mobile** — l'index peut rejoindre celui des agences sous un même toit
« Professionnels » à deux onglets (*Agences · Agents*), propriétaires exclus par défaut. Fiche :
photo, nom, agence, langues, ★, « Répond en ~2 h », barre collante WhatsApp / Appeler / Message,
puis biens en liste dense.

---

## 6. Comparateur — `/fr/compare`

**Rôle business.** Aider à décider entre 2 à 4 biens — donc rapprocher de la visite. C'est un outil
de fin de parcours, utile à une minorité, qui doit rester **discret** tant qu'on ne s'en sert pas.

**Ce qui marche** — l'état vide est juste (« Sélectionnez au moins 2 biens » + CTA) ; en mobile, le
tableau devient des blocs par critère, avec la pastille « Diffère » et une ligne « Coût d'entrée ».

**Constats**

| Sév. | Où | Constat |
|---|---|---|
| P1 | partout en mobile | **Le dock du comparateur couvre 23 % de l'écran** (≈ 190 px) sur toutes les pages publiques dès qu'un bien y est, **y compris la fiche, le paiement et la revendication**. Connecté, il s'empile avec le bouton flottant « Messagerie » et la barre collante de la fiche : **~45 % de l'écran recouvert** sur la fiche d'un bien (relevé). |
| P2 | dock | Les biens **devenus indisponibles restent dans le panier** et y occupent des places (« Maximum 4 biens » alors que 3 sont morts) ; leurs vignettes restent des pictogrammes « image absente ». |
| P2 | URL | **L'URL ne dit pas ce qui est comparé** : ouvert avec `?ids=857,93,11`, la page affichait ces trois biens et l'adresse est devenue `?ids=530` (le panier local a réécrit l'URL). Un lien partagé (« regarde ces trois ») montre autre chose chez le destinataire. |
| P2 | toasts | Chaque ajout produit un toast, et ils **s'empilent en haut de l'écran** (trois toasts relevés, en-tête masqué). Le dock dit déjà « 3 biens sélectionnés » : le toast est redondant. |
| P2 | blocs mobile | 16 blocs × 3 lignes où le nom du bien est **répété et tronqué** à chaque bloc ; un bien indisponible y reste en lignes « — ». |

**Proposition — mobile**

- **Dock replié par défaut** : une pastille « ⚖ 3 » au-dessus de la barre d'onglets, qui s'ouvre
  sur demande. **Jamais** sur la fiche (où le bouton « Comparer » de l'en-tête suffit), le paiement,
  la revendication, la connexion.
- **Page en colonnes** : en-tête collant avec les 2 à 4 vignettes (photo, prix, ✕), puis une ligne
  par critère avec les valeurs **en colonnes alignées sous chaque vignette** ; « Masquer les critères
  identiques » ; **meilleure valeur mise en évidence** (le moins cher, le plus grand, coût d'entrée
  le plus bas).
- En pied : « Demander une visite pour les 3 » — un geste, trois demandes.

---

## 7. Favoris — `/fr/favorites`

**Rôle business.** Le favori est **le signal d'intention le plus fort** qu'un visiteur anonyme
donne. C'est le meilleur moment pour lui proposer un compte, une alerte, ou une visite.

**Ce qui marche** — favoris sans compte (stockage local), compteur dans l'en-tête, page dédiée avec
les cartes de liste.

**Constats**

| Sév. | Où | Constat |
|---|---|---|
| P1 | après un favori | **Rien ne se passe après le cœur** : pas de proposition de compte (« Retrouve tes favoris sur ton téléphone et ton ordinateur »), pas d'alerte (« Préviens-moi si le prix baisse »). Les favoris d'un anonyme meurent avec son navigateur. |
| P2 | page | Pas de **partage de la sélection** — le geste le plus local qui soit (« envoie-moi ce que tu as trouvé » au conjoint, à la famille, par WhatsApp). |
| P2 | en-tête mobile | Le cœur de l'en-tête ouvre un **popover de bureau** ancré en haut à gauche, qui dit « Cliquez sur le cœur » à un utilisateur tactile, en vouvoiement alors que le site public tutoie (charte). |
| P2 | favoris | Le cœur plein est rouge vif, hors palette (les autres états actifs sont terracotta). |
| P3 | page | Pas de suivi d'état : un favori devenu loué ou dont le prix a baissé n'est pas signalé. |

**Proposition — mobile** — onglet « Favoris » de la barre du bas. En tête de page, une carte
« Garde tes favoris partout · Créer un compte en 30 s (numéro de téléphone) ». Chaque carte : prix,
**changement depuis l'ajout** (« −50 000 F », « Loué »), bouton « Visiter ». Action d'en-tête :
« Partager ma sélection » (lien + aperçu WhatsApp).

---

## 8. Réservation courte durée — `/fr/bookings`

**Rôle business.** Tunnel de séjour court (nuitée). Pour un bien au mois, la page le dit et renvoie
vers l'agent.

**Non éprouvé jusqu'au bout** : la base de démo n'a **aucun bien en location courte** (382 biens
disponibles, `rent_period` nul ou mensuel). Le filtre « Journalier / Hebdo » de la liste est donc
exposé sur un inventaire vide.

**Constats**

| Sév. | Où | Constat |
|---|---|---|
| P2 | liste | **Filtres de fréquence exposés sans inventaire** : choisir « Journalier » mène à zéro résultat. Un filtre ne doit apparaître que si des biens le satisfont (les facettes savent compter). |
| P2 | `<title>` | « Réserver un bien — Takussan — Takussan » : la marque est ajoutée deux fois. |
| P2 | code | `apiFetch` brut + `catch {}` (`bookings/page.tsx:95,101`) : une panne de l'API s'affiche « bien introuvable ». Redirection de connexion construite à la main, sans langue (`BookingTunnel.tsx:141`). |
| — | bien au mois | L'état « Ce bien se loue au mois ou à l'année » est clair et propose « Contacter l'agent » : bonne sortie. |

**Proposition** — à concevoir avec un inventaire réel ; principe mobile : dates en premier (feuille
calendrier plein écran), prix total recalculé en barre collante, paiement Wave / Orange Money en un
écran.

---

## 9. Paiement d'une échéance — `/pay/[token]`

**Rôle business.** **La page qui encaisse.** Le locataire y arrive par SMS ou WhatsApp, sur son
téléphone, souvent pressé ou en retard. Chaque friction ici est un loyer qui arrive plus tard.

**Ce qui marche** — l'écran tient en un regard : agence, bien, échéance, référence, montant, pénalité
de retard ; lien valable 60 jours après l'échéance (ou depuis le jour même pour une échéance déjà
en retard) ; reçu disponible 30 jours après paiement.

**Constats**

| Sév. | Où | Constat |
|---|---|---|
| P1 | en-tête | **La coque de la marketplace** (recherche, favoris, menu, dock du comparateur, bouton Messagerie) **entoure une page de paiement**. Le locataire se demande s'il est au bon endroit, et le dock recouvre le bas de l'écran. Une page qui encaisse doit être **nue** : logo de l'agence, « Paiement sécurisé · Takussan », rien d'autre. |
| P1 | paiement indisponible | **Cul-de-sac** : « Le paiement en ligne n'est pas disponible… Contactez l'agence Thiès Properties » — sans bouton Appeler, sans WhatsApp, sans instructions de paiement hors ligne (numéro Wave / Orange Money de l'agence, virement). Le locataire veut payer et on ne lui dit pas comment. |
| P1 | montant | **Le total n'est pas dit** : « Montant à payer 792 467 F » puis, dans un encadré, « Pénalité de retard 39 623 F · À régler auprès de l'agence ». Le locataire doit-il 792 467 ou 832 090 ? |
| P2 | lien périmé | Une échéance **payée** il y a plus de 30 jours affiche « Ce lien n'est plus valide… Demandez un nouveau lien » : le locataire croit qu'il doit encore quelque chose. Dire « Cette échéance est réglée (le 21 déc. 2025) » et proposer le reçu par l'agence. |
| P2 | contenu | Ni le **nom du locataire** ni la **période** (« Loyer d'octobre 2025 ») : seulement une date d'échéance et une référence. |

**Proposition — mobile** *(une page, un geste)*

```
┌──────────────────────────────────────┐
│ [logo Thiès Properties]  🔒 Sécurisé │  ← coque nue
├──────────────────────────────────────┤
│ Loyer d'octobre 2025                 │
│ Espace de stockage · Thiès           │
│                                      │
│        832 090 F CFA                 │  ← LE total, en grand
│  792 467 loyer + 39 623 pénalité     │
│  En retard depuis 13 mois            │
│                                      │
│ [ Payer avec Wave            ]       │  ← fournisseurs = boutons pleins
│ [ Payer avec Orange Money    ]       │
│ ──────────── ou ──────────────       │
│ Payer à l'agence : 📞 Appeler · 💬   │
│ Réf. LPY-PQLJDO  (copier)            │
└──────────────────────────────────────┘
```

Après paiement : écran de succès avec **reçu téléchargeable et partageable** (WhatsApp), et
« Activer le rappel avant la prochaine échéance ».

---

## 10. Revendication d'annonces — `/fr/claim/[token]`

**Rôle business.** **Tunnel d'acquisition d'offre** : un annonceur repéré ailleurs (radar) reçoit
un SMS l'invitant à publier gratuitement ses annonces sur Takussan. Chaque revendication réussie,
c'est de l'inventaire et un futur client.

**Ce qui marche** — page personnalisée (« Bonjour Awa »), annonces pré-remplies, case « Publier
cette annonce » par annonce, « Corriger », confirmation par code SMS (`autocomplete="one-time-code"`).

**Constats**

| Sév. | Où | Constat |
|---|---|---|
| P1 | consentement | **Aucune sortie « Ce n'est pas moi » / « Ne plus me contacter »** (relevé : les seules actions sont le lien de l'annonce, « Corriger », les CGU et « Recevoir le code »). Un démarchage sans opposition possible est un risque au regard de la loi sénégalaise sur les données personnelles (CDP), et un motif de signalement de l'expéditeur SMS. |
| P1 | persuasion | **Aucune raison de dire oui** : ni « 1 240 chercheurs à Mermoz ce mois », ni « contacts reçus sur WhatsApp », ni « gratuit, sans engagement » mis en avant. La page demande un effort sans dire ce qu'il rapporte. |
| P2 | contenu | « Déjà en ligne : Appartement 3 chambres à Mermoz » puis la même annonce dans « Vos annonces » à cocher : est-elle publiée ou pas ? |
| P2 | coque | Barre de recherche, favoris et dock du comparateur sur un tunnel de conversion : chaque sortie possible est une revendication perdue. |
| P2 | mobile | Le bouton final « Recevoir le code par SMS » est **sous la ligne de flottaison**, après le formulaire. |

**Proposition — mobile** — coque nue ; en tête la promesse chiffrée ; les annonces en cartes à
cocher ; **bouton collant « Publier mes 3 annonces »** qui enchaîne prénom → code SMS dans une
feuille ; en pied, discret mais présent : « Ce n'est pas moi · Ne plus me contacter ».

**Ingénieur** — `<img>` brut sans repli d'erreur (`ClaimListingCard.tsx:77`, justifié par l'URL
signée).

---

## 11. Pages par lien — partage de document, alertes, désinscription

`/fr/share/[token]` (document protégé par mot de passe), `/fr/search-alerts/{confirm,unsubscribe}`,
`/fr/notifications/unsubscribe`.

**Ce qui marche** — l'action ne part **qu'au clic** (protège des scanners de mails), `noindex`,
`no-referrer`, états vides propres.

| Sév. | Constat |
|---|---|
| P2 | Même coque marketplace que le paiement : sur une page de désinscription ou de document confidentiel, la recherche et le dock n'ont rien à faire. |
| P2 | Erreur en `<p role="alert">` fait main au lieu d'`ErrorState` (`SearchAlertLinkAction.tsx:135`, `DigestUnsubscribeAction.tsx:83`). |
| P3 | Lien invalide = cul-de-sac (« Vérifiez l'adresse reçue dans le message ») sans lien vers l'accueil ou l'aide. |

**Proposition** — une **« coque de lien »** commune à ces pages, au paiement et à la revendication :
logo, éventuellement l'agence émettrice, pas de navigation marketplace, un pied minimal (aide,
langue). Une seule coque, quatre usages.

---

## 12. Pages légales — `/fr/legal/{terms,privacy,notice}`

**Ce qui marche** — version datée, texte structuré en 22 sections, colonne de lecture étroite.
*Correction du 2026-11-08 : cette ligne citait un « sommaire » — il n'y en a pas, seulement « Autres
documents » en bas de page ; au téléphone, les CGU font 20 800 px sans ancre (relevé en maquette).*

| Sév. | Constat |
|---|---|
| P1 | **« [⚠ à compléter : dénomination sociale] » publié en clair** dans le premier paragraphe des CGU. Bloquant avant toute ouverture publique. |
| P2 | **Aucun sommaire ni ancre** : trouver une partie demande de tout faire défiler. |
| P3 | `noindex` sans canonique ni hreflang alors que les pages existent en trois langues. |

---

## Navigation publique — desktop et mobile

**Ce qui existe.** En bureau : barre fixe (logo, recherche avec Louer/Acheter, rangée de 8
catégories + « Plus », favoris, langue, Connexion, Publier) et pied de page complet. En mobile :
logo, champ « Chercher », favoris, menu ; **pas de barre d'onglets** (la `BarreDOnglets` n'est
montée que dans `/app`).

**Constats**

| Sév. | Constat |
|---|---|
| P1 | **Agences et Agents ne sont accessibles que par le pied de page**, en bureau comme en mobile. Aucun menu ne les cite. |
| P1 | **Connecté, aucun lien vers son espace** (`/app`) depuis le site public : le menu mobile d'un client propose « Mon profil », « Publier une annonce » (à un locataire !) et la déconnexion. Ses visites, ses demandes, ses messages, ses paiements sont introuvables depuis l'endroit où il passe son temps. |
| P1 | **Trois couches flottantes sans arbitrage en mobile** : dock du comparateur, bouton « Messagerie », barre collante de page. Mesuré sur la fiche : ~45 % de l'écran recouvert. |
| P2 | Le menu mobile ne contient **aucune destination de contenu** (ni Louer, ni Acheter, ni Agences, ni Favoris, ni Comparateur). |
| P2 | La rangée de catégories reste dans l'en-tête de **toutes** les pages publiques en bureau (fiche, agence, CGU, paiement) : 127 px d'en-tête collant, dont 60 inutiles hors de la découverte. |
| P2 | Pas de bouton retour sur la fiche (les fiches agence et agent en ont un). |
| P2 | Le site public reste clair quand le système est en sombre (`/app` suit-il le thème ? à voir en famille 3) : décision à écrire si elle est voulue. |

**Proposition — une barre d'onglets publique en mobile** *(⚑ écart de charte : la charte ne prévoit
pas de navigation basse publique)*

```
┌─────────┬─────────┬─────────┬─────────┬─────────┐
│   🔍    │   ♡     │   ＋    │   💬    │   👤    │
│Explorer │ Favoris │ Publier │Messages │ Compte  │
└─────────┴─────────┴─────────┴─────────┴─────────┘
```

- **Explorer** : accueil et recherche. **Favoris** : la page favoris (le cœur quitte l'en-tête).
  **Publier** : le parcours de publication, visible pour l'offre sans encombrer la demande.
  **Messages** : remplace le bouton flottant « Messagerie » (anonyme : « Connecte-toi pour suivre tes
  échanges »). **Compte** : connexion, ou l'espace du client (visites, demandes, paiements, alertes).
- Elle **remplace** le menu hamburger pour la navigation ; le menu ne garde que langue, aide et
  légal.
- Elle **disparaît** sur la fiche (la barre d'actions la remplace), dans les tunnels (paiement,
  revendication, visite, publication) et sur la carte plein écran.
- Le dock du comparateur devient une pastille au-dessus d'elle, repliée.

**Règle des couches flottantes, à écrire dans la charte** : *une seule couche d'action en bas de
l'écran à la fois* — barre d'onglets **ou** barre d'actions de page **ou** tunnel. Les pastilles
(comparateur, messagerie) se replient au-dessus, jamais à côté.

**En bureau** — ajouter au menu utilisateur « Mon espace » (et ses compteurs : visites, messages) ;
retirer la rangée de catégories hors des pages de découverte ; mettre « Agences » dans l'en-tête.

---

## Transversal — ce qui touche toutes les pages publiques

1. **Aucun repli quand une image échoue** (`PropertyPhoto.tsx:38-60` ne couvre que `src` vide, aucun
   `onError` dans tout `src/`). `next/image` rend alors l'`alt` visible, qui se superpose aux pastilles
   (`PropertyCard.tsx:235`, `cards/*.tsx`). Même trou pour la galerie, les logos et les avatars. **Un
   correctif dans `PropertyPhoto` couvre toutes les cartes.**
2. **Pas d'`error.tsx` dans `(public)`** : une exception remplace toute la page, barre et pied
   compris, par l'erreur racine.
3. **Coque copiée 21 fois** : chaque page monte elle-même `Navbar`, `NavbarSpacer` et `Footer`. C'est
   ce qui rend difficile la « coque de lien » et la barre d'onglets proposées ici : la coque doit
   d'abord monter dans le layout.
4. **Modales centrées partout en mobile** (visite, message, postuler, partage) sauf le contact des
   profils. Règle proposée : **sous `md`, un formulaire est une feuille plein écran avec bouton
   collant** ; une confirmation courte reste un dialogue.
5. **Aperçus de partage appauvris** : le `openGraph` des fiches (bien, agence, agent) écrase celui du
   layout — sans `siteName`, `og:locale`, `og:url`. C'est l'aperçu WhatsApp de chaque annonce.
6. **Cascades serveur évitables** : liste (recherche → domaines → quartiers en série), fiche
   (bien → similaires).
7. **États faits main hors design system** (`PropertyRow.tsx:258,262`, `IndexDeProfils.tsx:121`,
   portefeuilles vides) que la garde `check-feedback-states` ne voit pas (elle cherche des noms).
8. **Cibles sous 44 px** : flèches des rangées et du carrousel (32 px), actions sur photo (28 px),
   fermeture des dialogues (36 px), barre collante de la fiche (40 px).
9. **Deux voix** : le site public tutoie (charte), les dialogues et popovers vouvoient (« Cliquez sur
   le cœur », « Vos coordonnées », « Connectez-vous »).
10. **Données de démo trompeuses pour qui juge le produit** : 382 biens disponibles sans période de
    loyer, aucun bien en courte durée, rangées saturées de biens de test, photos absentes. Un seed
    « vitrine » réaliste (photos d'intérieurs, adresses géocodées, périodes) servirait autant aux
    démonstrations qu'aux audits.

---

## Synthèse de la famille 1

### Les cinq chantiers qui rapportent le plus

| # | Chantier | Pages | Pourquoi d'abord |
|---|---|---|---|
| A | **Fiche de bien repensée pour le mobile** : prix et coût d'entrée en haut, barre WhatsApp + Visiter, visite en feuille à deux temps, prix jamais tronqué | 3 | C'est la page de conversion ; un P0 et cinq P1 |
| B | **Navigation mobile publique** : barre d'onglets, règle des couches flottantes, « Mon espace » pour le connecté, dock replié | toutes | Trois P1 transversaux ; débloque A, 6, 7 |
| C | **Recherche mobile** : écran de recherche riche (récents, quartiers, types), catégories visibles, filtres réordonnés, densité liste | 1, 2 | La porte d'entrée de la demande |
| D | **Coque de lien** pour paiement, revendication, partage, désinscription ; paiement à un total et sans cul-de-sac | 9, 10, 11 | Encaissement et acquisition d'offre ; quatre P1 |
| E | **Socle** : repli d'image unique, `error.tsx` public, coque dans le layout, aperçus OG complets, CGU complétées | toutes | Petits correctifs, grand effet ; prérequis de B et D |

### Décisions qui reviennent au porteur

> **Tranché le 2026-11-08 : les cinq recommandations sont validées** (1a puis 1b à la demande,
> 2a, 3a, 4a, 5a). Condition ajoutée par le porteur : **aucune proposition de design ne s'implémente
> avant d'avoir été vue en maquette statique** — jusqu'à quatre approches par page, en mobile et en
> bureau, sur une route séparée avec une navigation simple entre les variantes (cf. README).
>
> **Maquettes choisies le 2026-11-08 : toutes les recommandations**, avec deux compléments du
> porteur.
>
> | Page | Approche retenue |
> |---|---|
> | Accueil | A — Deux gestes |
> | Écran de recherche | **D — Riche et complet** (ajoutée à la demande du porteur) |
> | Liste et filtres | A — Deux densités |
> | Fiche d'un bien | A — Le prix d'abord |
> | Demande de visite | A — Deux temps |
> | Navigation mobile | A — Barre classique, **dont les onglets suivent le profil connecté** |
> | Paiement d'une échéance | A — Un total, un geste |
> | Agences et agents | **D — La liste dense, une vitrine en tête** (A + C, demandée par le porteur) ; l'agence mise en avant paraît aussi à son rang (1a du 2026-11-09) |
> | Fiche d'agence | **D — La vitrine à onglets, couverture et recherche** (A + C + recherche) ; couverture pour toutes les agences, faite de trois de leurs biens (2a du 2026-11-09, ⚑ écart de charte) |
> | Fiche d'agent | **D — La personne d'abord, ses biens cherchables** (A + recherche au-delà de six biens) |
> | Favoris | A — Le suivi |
> | Comparateur | A — Colonnes alignées, **sans « Visiter les N »**, « Partager » à la place de « Copier le lien » |
> | Réservation courte durée | A — Les dates d'abord |
> | Revendication d'annonces | A — La promesse, puis la liste |
> | Pages par lien | A — La carte au centre |
> | Pages légales | A — Sommaire et repères |
> | Pages d'erreur | A — Une issue utile, **sans « Signaler le problème »** |
>
> - **Recherche, « pas de régression »** : la proposition A a été confrontée à la barre actuelle
>   (`SearchAutocomplete`, `recherches-recentes`, saisie mobile de la `Navbar`). Six fonctions
>   existantes y manquaient — la saisie comprise et son compte, l'alerte quand aucun bien ne
>   correspond, « Voir des biens proches », les recherches populaires et fréquentes, le texte
>   libre, « Effacer les récentes ». D = A + ces fonctions, plus les filtres gardés rendus visibles
>   depuis la liste. Trois nouveautés de D demandent l'API : l'interprétation tolérante aux fautes
>   (« mermos » → Mermoz), le compte de chaque critère retiré, « N nouveaux depuis ta visite ».
> - **Annuaire et fiches, TCK-2517 → TCK-2524 (vague 85, 2026-11-09)** : la recherche dans les biens
>   d'une agence ou d'un agent passe par la liste publique (`filter[agency]`, `filter[agent]`, comptes
>   par option), sous le prédicat du portefeuille pour que les comptes ne divergent pas ; la mise en
>   avant d'une agence est **offerte** par la plateforme — sa vente en crédits attend un amendement
>   d'ADR-0061.
> - **Second lot, TCK-2507 → TCK-2516 (vague 85)** : deux notes des maquettes étaient fausses et
>   sont corrigées — le calendrier des nuits prises existe (`availability`, TCK-596) et la page du
>   bien retiré a déjà quartier, type et biens similaires (`/status`, TCK-598). La sélection de
>   favoris partagée est un lien `?ids=` (instantané), sans objet neuf dans l'API. L'annulation
>   gratuite montrée par la maquette de réservation n'est **pas** livrée : c'est une politique par
>   agence à décider.
> - **Navigation, « les menus varient selon la personne connectée »**, comme la coque de `/app` :
>   les onglets se dérivent de `DISPOSITIONS[persona].onglets` (`lib/navigation/dispositions.ts`),
>   Explorer et Messages restant fixes. Maquette « Selon le profil » de la page Navigation.

1. **Les propriétaires particuliers dans l'annuaire public** (`/agents`, équipe d'agence) :
   a) les retirer par défaut, b) les garder sur option du propriétaire, c) garder tel quel.
   → Recommandation : **a**, puis **b** quand un propriétaire le demande.
2. **Barre d'onglets publique en mobile** (⚑ écart de charte) : a) oui, cinq onglets comme proposé,
   b) oui mais sans « Publier », c) non, améliorer le menu.
   → Recommandation : **a**.
3. **Action primaire d'une location** : a) Visiter (Postuler après la visite), b) Postuler.
   → Recommandation : **a**.
4. **WhatsApp comme canal de premier rang** dans la barre collante : a) oui, quand l'agent l'a,
   b) non, garder la messagerie interne en premier pour tracer le contact.
   → Recommandation : **a**, en traçant le clic comme un contact (le lien `wa.me` passe par une
   route de comptage).
5. **Sponsorisés en tête de liste** : a) un en tête puis un toutes les 10 cartes, b) inchangé.
   → Recommandation : **a**.
