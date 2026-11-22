# ADR-0087 — Le Radar lit chaque annonce par l'adaptateur de son site, n'appelle l'IA que pour le reste, découvre par sitemap et ne lit que ce qu'une cible vise

- **Statut** : Accepté le 2026-11-04 par le porteur (principe : « Radar 2 », option c — l'opérateur cible, la demande crée des cibles rafraîchies par l'IA) — modalités : décisions de la session, à revoir
- **Date** : 2026-11-04
- **Tickets** : TCK-2465 (lecture par l'adaptateur), TCK-2466 (extraction économe), TCK-2467 (sitemap), TCK-2468 (cibles, API), TCK-2469 (cibles, console), TCK-2470 (cibles de la demande rafraîchies par l'IA), TCK-2471 (le message cite la demande)
- **Amende** : [ADR-0080](0080-la-collecte-automatique-du-radar.md) §1 (la collecte lit aussi la page de l'annonce par l'adaptateur, et part d'un sitemap quand le site en publie)
- **Dépend de** : [ADR-0077](0077-le-radar.md), [ADR-0076](0076-le-socle-ia.md), [ADR-0088](0088-le-journal-anonyme-des-recherches.md) (la demande sans résultat)

## Contexte

Mesuré le 2026-11-04 sur `dev` `74506074b` et sur les deux sites, une annonce de chacun passée par `HtmlCleaner` :

- **CoinAfrique : le téléphone de l'annonceur est perdu.** Il n'est porté que par des attributs (`href="tel:+221…"`,
  `data-phone-number`, le lien `web.whatsapp.com/send?phone=`). `HtmlCleaner` ne garde que le texte : le numéro est
  **absent** du texte envoyé au modèle. Sans numéro, l'annonce n'a pas d'annonceur et ne peut pas être démarchée.
- **CoinAfrique : une photo sur une galerie de 4 et plus** (`og:image` seul ; la galerie est en `background-image`), et
  6 041 caractères de texte dont la plus grande part est le menu des catégories du site.
- **Expat-Dakar se lit bien** (téléphone dans le texte, 2 341 caractères, 6 photos). Son `dataLayer` porte déjà
  `listing_id`, prix, devise, lieu et catégorie ; la page dit le vendeur (« Vendu par Buy Rent Senegal », « Membre
  depuis », « Vérifié via »). Elle porte aussi le numéro du site lui-même (`Organization.telephone`), à ne jamais
  prendre pour celui de l'annonceur.
- **Le coût** : 30 extractions locales réussies, 5 896 jetons d'entrée et 1 159 de sortie en moyenne, sur
  `claude-sonnet-5-5` (premier maillon du rôle `extraction`) — ≈ 0,023 $ l'annonce aux tarifs de `config/ai.php`. Le
  plafond de l'usage (3,33 $/jour) borne la collecte à ≈ 140 annonces par jour. `radar.extraction` est le seul usage du
  rôle `extraction`.
- **Le volume** : les sitemaps d'Expat-Dakar par catégorie (`sitemap-listings-<catégorie>-fr.xml`, `lastmod` et
  photos) portent 3 349 annonces sur cinq catégories immobilières, dont ≈ 660 modifiées en sept jours. Le passage
  actuel lit au plus 20 pages de liste.
- **Aucune lecture ne demande JavaScript** sur ces deux sites : le rendu est serveur, tout est dans le HTML.
- Le Radar collecte tout ce qu'il voit : aucun critère ne borne ce qui est lu, extrait et payé.

## Décision

1. **L'adaptateur d'un site lit aussi la page d'une annonce, sans IA.** `RadarSiteAdapter::parseListing()` rend ce que
   la page dit en clair : téléphones (liens `tel:`, attributs `data-*phone*`, liens WhatsApp — jamais le numéro du site),
   galerie complète, prix et devise, contrat, type, lieu, date de publication, nom du vendeur et ses indices
   professionnels (boutique, ancienneté, « vérifié »), description. Une valeur lue ainsi fait foi.
2. **L'IA ne reçoit que la description et ce qui manque.** Le modèle ne cherche que les champs que la lecture n'a pas
   rendus (chambres, surface, équipements, nature de l'annonceur…) ; il voit les champs déjà lus pour contexte. Une
   valeur du modèle qui contredit une valeur lue est signalée, jamais retenue. Le rôle `extraction` part par défaut sur
   `claude-haiku-5-5`, `claude-sonnet-5-5` en repli (la console peut le changer, ADR-0085).
3. **Le lecteur générique ne perd plus un numéro.** Pour un site sans adaptateur, `HtmlCleaner` récolte aussi les
   numéros des liens et attributs, et retire le bruit de navigation reconnaissable.
4. **Un site qui publie un sitemap d'annonces est découvert par lui.** La source lit les sitemaps des catégories que son
   adaptateur déclare : URL neuve → saisie ; `lastmod` changé → relecture de la page, sans IA si la description n'a pas
   changé ; URL absente de deux lectures complètes du sitemap → disparue (même règle que l'observatoire, ADR-0083).
   La lecture des listes reste le chemin des sites sans sitemap.
5. **Une cible borne ce qui se lit.** `radar_targets` : des critères (villes et quartiers, types, contrat, prix, chambres,
   meublé, sites, fraîcheur). Une source **ciblée** (le défaut) ne saisit une annonce nouvelle que si sa carte (ou
   l'entrée de son sitemap) peut correspondre à au moins une cible active ; une valeur absente de la carte ne l'exclut
   pas. Une annonce écartée ainsi n'est pas enregistrée : ni coût, ni donnée. Une source réglée **tout** garde le
   comportement d'ADR-0080.
6. **La demande sans résultat crée des cibles, et l'IA les tient à jour.** Les recherches sauvegardées sans résultat et
   les recherches du journal anonyme qui n'ont rien rendu (ADR-0088) sont regroupées par l'usage `radar.cibles` en un jeu
   **borné** de cibles d'origine `demand`. À chaque passage, le modèle propose un écart (créer, fusionner, retirer) ; le
   code le valide (critères valides, plafond de cibles, pas de doublon) puis l'applique et en garde la révision. Il ne
   touche jamais une cible de l'opérateur ni une cible épinglée. Une révision se défait.
7. **Rien ne change dans ce qui protège** : SSRF, `robots.txt` et créneau par domaine restent ceux d'`UrlFetcher` pour
   chaque page lue, sitemap compris. Aucune API privée d'un site n'est appelée. Aucun navigateur sans tête : TCK-2425
   reste la voie, à n'ouvrir que si un site retenu exige JavaScript (Cloudflare Browser Rendering en serait le pilote).

## Conséquences

- Une annonce de CoinAfrique devient démarchable ; la galerie entière nourrit l'empreinte des photos et la publication.
- Le coût d'une annonce baisse d'un ordre de grandeur (moins de jetons, petit modèle) : le plafond de l'usage couvre
  l'inventaire au lieu de 140 annonces par jour. À re-mesurer sur la préproduction après livraison.
- Un adaptateur casse quand le site change sa page : la lecture vide le dit (champ manquant, journal du passage), et
  l'IA comble ce qui manque en attendant le correctif — plus chère, jamais muette.
- Une source ciblée ne voit plus tout le marché : l'observatoire ne compte que ce qui a été saisi. L'opérateur règle une
  source sur **tout** pour l'observatoire.
- Les cibles de la demande bougent sans geste humain : la révision journalisée et la séparation des cibles de
  l'opérateur sont ce qui garde la liste cohérente et réversible.

## Application

Tickets TCK-2465 à TCK-2471. Ce qui empêche la régression : tests d'adaptateur sur fixtures écrites à la main (téléphone
pris aux attributs, numéro du site écarté, galerie entière) ; test « la valeur lue fait foi, la contradiction du modèle
est signalée » ; test « une carte hors cible ne crée rien » ; test « l'IA ne touche ni cible de l'opérateur ni cible
épinglée, et une révision se défait ».
