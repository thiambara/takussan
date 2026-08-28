#!/usr/bin/env node
/**
 * Garde de la CONSOLE SUPER-ADMIN : elle ne parle qu'un vocabulaire de couleur, celui des jetons
 * du design system. Aucune échelle Tailwind brute (`stone-700`, `amber-500`, `emerald-100`…),
 * aucun `bg-white`, aucune valeur arbitraire de couleur (`bg-[#f5f5f4]`), aucun reste du
 * dialecte `app-*`.
 *
 * ⚠⚠ **SON NOM DIT « SUPER-ADMIN » ; ELLE GARDE LES TROIS ESPACES DU PRODUIT.** Depuis TCK-381
 * elle porte DEUX espaces, chacun avec son périmètre exigé à zéro et son cliquet propre :
 *
 *     ESPACES[0]  console super-admin  — TCK-358, et par ricochet la console AGENCE : le
 *                 périmètre inclut `src/components/console`, `feedback`, `billing` et
 *                 `reporting`, des répertoires que les DEUX consoles montent.
 *     ESPACES[1]  tableau de bord `/app` — TCK-381. Vingt-huit répertoires de `src/components`
 *                 plus les 46 pages de `src/app/(dashboard)/app`.
 *
 * C'est délibéré, et c'est la raison d'être des deux tickets : le périmètre n'est pas « un
 * répertoire de routes », c'est **ce que l'écran monte réellement**, primitives partagées
 * comprises. Une pastille de statut rendue par les trois espaces ne peut pas obéir à une règle de
 * couleur d'un côté et pas de l'autre.
 *
 * **Conséquence pratique, à savoir AVANT d'être surpris** : cette garde peut rougir sur un
 * fichier que vous modifiez pour un écran d'AGENCE ou de `/app`, sans que la console super-admin
 * soit en cause. Ce n'est pas un débordement, c'est le contrat.
 *
 * **Le fichier n'est PAS renommé, et c'est une décision, pas un oubli** : plusieurs branches et
 * une PR le désignent par ce nom. *Renommer un fichier que trois chantiers désignent coûte plus
 * que de dire en dix lignes ce qu'il fait vraiment.* Ce qui a été corrigé à la place, c'est
 * l'en-tête : un nom faux qui s'explique coûte moins qu'un nom juste qui casse trois branches.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * LE MOTIF — pourquoi cette garde existe
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * TCK-245 avait déjà fait ce travail et avait été marqué `done`. Son AC1 exigeait zéro classe de
 * palette brute — et le greppait sur `src/app/(super-admin)/**`, c'est-à-dire les *wrappers* de
 * page. L'écran, lui, vit dans les composants que ces wrappers montent. Relevé du 2026-08-26,
 * quatre mois plus tard, en rejouant l'AC verbatim :
 *
 *     src/app/(super-admin)/**  — le périmètre de l'AC1 ....................  11 (l'AC exigeait 0)
 *     src/components/admin/super/** .......................................  218
 *     src/components/layout/SuperAdmin{Shell,Sidebar,Topbar}.tsx ...........   12
 *     src/components/super-admin/** .......................................    1
 *
 * Les 11 du périmètre audité n'y étaient même pas restées : elles étaient REVENUES, avec
 * `/agency-upgrade-requests` et `/super-admins`, deux pages créées après TCK-245. *Un `done`
 * mesuré une fois redevient faux sans que personne le voie* — c'est la même leçon que
 * `check-app-tokens.mjs`, payée une seconde fois sur un autre périmètre.
 *
 * Sur l'ensemble de la console au 2026-08-26 : 348 utilitaires de palette brute contre 109
 * jetons et 25 jetons `app-*`. **Trois vocabulaires**, dont six fichiers en mélangeaient deux.
 *
 * ⚠ Le tableau ci-dessus est la mesure du 2026-08-26 citée par TCK-358. **Re-mesuré le
 * 2026-08-27, au moment d'implémenter, les comptes avaient bougé** — TCK-357 (primitives
 * partagées) était passé entre-temps et avait absorbé une partie du travail :
 *
 *     src/app/(super-admin)/** ............................................   18
 *     src/components/admin/super/** .......................................   85
 *     src/components/layout/SuperAdmin{Shell,Sidebar,Topbar}.tsx ...........   16
 *     src/components/super-admin/** .......................................    9
 *                                                                    total   128
 *
 * Les deux relevés figurent ici ensemble, avec leurs dates : c'est ce qui permettra, la
 * prochaine fois, de savoir lequel est périmé plutôt que de le supposer juste.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * LE MOTIF, SECONDE OCCURRENCE — `/app`, et un relevé de ticket faux d'un facteur 2,7
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * TCK-381 citait, pour la clôture d'import de `/app` : **259 fichiers, 45 porteurs, 393
 * occurrences**. Re-mesuré le 2026-08-27 avant d'implémenter, sur la même définition de clôture
 * (départ = les 51 fichiers de route de `src/app/(dashboard)/app`, imports `from '…'` et
 * `import('…')` suivis, tests écartés) :
 *
 *     fichiers de la clôture ............................................  403  (le ticket : 259)
 *     fichiers portant au moins une couleur brute .......................  119  (le ticket :  45)
 *     occurrences .......................................................  1070 (le ticket : 393)
 *
 * Par famille : pierre 409 · blanc 179 · ambre 121 · rouge 89 · émeraude 89 · bleu 29 · orange 24
 * · ardoise 24 · gris 18 · rose 17 · violet 16 · ciel 13 · noir 9 · vert 9 · le reste 24.
 *
 * *Un relevé de ticket est une hypothèse, pas une mesure* — et celui-ci se trompait dans le sens
 * qui rassure, d'un facteur 2,7. Le dimensionnement du travail en dépendait entièrement.
 *
 * Ce que TCK-381 porte à ZÉRO : les 1000 occurrences des 103 fichiers de la clôture qui
 * appartiennent aux domaines de `/app`. Ce qu'il laisse au cliquet : des occurrences dans 12
 * fichiers de primitives partagées avec le site public (`ui/`, `forms/`, `layout/`, `shared/`,
 * `property/`) — les mêmes que le cliquet super-admin, pour la même raison (TCK-384). Les 8
 * dernières sont dans `components/console` et `components/feedback`, que TCK-358 porte de son
 * côté et que ce ticket ne touche pas.
 *
 * ⚠ **Le COMPTE de ce reste ne s'écrit pas ici.** Il a valu 56 (relevé préalable, contrôles A
 * et B seuls), puis 58 (mesuré par la garde, contrôle D compris), puis 60 (arbre fusionné). Le
 * chiffre qui fait foi est `plafondReste` de l'entrée `/app` de {@link ESPACES}, et lui seul :
 * son docblock porte les trois mesures et ce qui les sépare. *Un compte recopié dans un second
 * endroit est un compte qui se met à diverger le jour même.*
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE PROUVE — et les TROIS trous qu'elle déclare
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Elle prouve, par lecture de texte et sans heuristique, qu'aucun fichier du PÉRIMÈTRE GARDÉ
 * n'écrit une classe de couleur hors jetons. Une classe Tailwind est un littéral : elle ne se
 * calcule pas, sous peine de ne pas être compilée du tout — c'est ce qui rend une lecture de
 * texte suffisante, et c'est pourquoi `` `bg-${famille}-200` `` n'est pas un faux négatif (cette
 * classe-là n'existe simplement pas dans le CSS produit).
 *
 * ⚠ **Cette section a affirmé, du 2026-08-27 au 2026-08-27, qu'il n'existait « pas de faux
 * négatif structurel — sauf le style inline ».** C'était faux, et faux dans le sens qui rassure :
 * la revue adverse de TCK-358 a passé quatre mutations au vert (`bg-[#fff]`, `text-[#a85332]`,
 * `bg-[rgb(255,0,0)]`, `border-[oklch(0.7_0.2_30)]`) — quatre formes qui COMPILENT réellement en
 * Tailwind v4. *Un cliquet qui déclare son unique trou et en a un deuxième est pire qu'un cliquet
 * qui n'en déclare aucun : on lui fait confiance.* Le contrôle D ci-dessous ferme celui-là.
 *
 * ⚠⚠ **ET ELLE L'A AFFIRMÉ UNE SECONDE FOIS, le 2026-08-27, en énumérant six trous dont AUCUN
 * n'était l'un des deux que la revue adverse de TCK-381 a mesurés.** Les deux se jouaient à UN
 * SEUL GESTE, sur une garde dont l'AC disait « un cliquet, sinon rien » :
 *
 *   D1 · Treize des vingt-deux familles de {@link FAMILLES} n'étaient éprouvées par AUCUNE forme
 *        d'{@link EPREUVE}. Retirer `'indigo'` — un geste — sortait la garde en **0 avec un ✓**
 *        pendant qu'un `bg-indigo-500` vivait dans un fichier gardé. Quinze des vingt-sept
 *        préfixes étaient dans le même cas, non trouvés par la revue. *Le docblock d'`autoEpreuve`
 *        affirmait précisément tenir ce mode d'échec* — il le tenait pour les formes écrites à la
 *        main, et pour elles seules. Fermé par les blocs F/G d'`EPREUVE` **et** par
 *        {@link ablationDeConfiguration}, qui refuse désormais toute entrée de configuration dont
 *        le retrait ne change rien.
 *   D2 · Le cliquet du reste de la console super-admin n'était pas bilatéral. `RESTE_PLAFOND =
 *        200` — un geste — sortait la garde en 0, et **elle imprimait elle-même** « RESTE NON
 *        GARDÉ : 46 défaut(s) (cliquet 200) ». Fermé : les deux cliquets sont bilatéraux, cf. le
 *        docblock de {@link RESTE_PLAFOND}, qui porte la révocation de l'asymétrie.
 *   D3 · `globals.css` — le seul fichier où une couleur A LE DROIT d'être décidée — était le seul
 *        que la garde ne lisait pas, pendant qu'elle imprimait prouver « qu'aucune couleur n'est
 *        décidée en dehors de `globals.css` ». Fermé par le contrôle du fichier de jetons
 *        ({@link JETONS}), sur les contrôles A/B/C seulement.
 *   D4 · La couleur en ATTRIBUT DE PRÉSENTATION — `<rect fill="#a85332" stroke="#f5f5f4" />` —
 *        échappait aux quatre contrôles. Fermé par le contrôle E, pour zéro correctif : les 7
 *        occurrences du dépôt sont toutes hors des deux périmètres et hors des deux clôtures.
 *
 * *Une garde qui déclare ses trous et en a quatre autres est pire qu'une garde muette : on lui
 * fait confiance sur la liste.* Ce qui a changé n'est pas la longueur de la liste — c'est qu'une
 * partie d'elle est maintenant PROUVÉE à chaque exécution plutôt qu'écrite à la main.
 *
 * Les trous qui restent sont énumérés ici, et ils y restent tant qu'ils ne sont pas fermés :
 *
 *   T1 · Le style INLINE — `style={{ backgroundColor: '#f5f5f4' }}` — et son jumeau, l'EXPRESSION
 *        JSX en attribut : `fill={couleur}`, `fill={'#a85332'}`. Hors portée d'une garde de
 *        texte : il faudrait analyser un objet JS. Non compté, donc non gardé — trou déclaré,
 *        pas mesuré. Les trois formes sont figées `false` dans `EPREUVE`.
 *   T2 · Le PÉRIMÈTRE lui-même — cf. la section suivante, et le compte du « reste non gardé »
 *        que cette garde imprime à chaque exécution pour que ce trou ne puisse plus grandir en
 *        silence.
 *   T3 · La JUSTESSE du rendu. Un `bg-card` posé là où il fallait `bg-muted` laisse cette garde
 *        verte. C'est un plancher de vocabulaire, pas une revue de design.
 *   T4 · Les PRÉFIXES et les ATTRIBUTS sont énumérés. La liste est large — vingt-sept entrées
 *        depuis TCK-381, qui y a ajouté les huit côtés de bordure, les deux axes de séparateur et
 *        `ring-offset` après les avoir vus passer au vert — mais large n'est pas exhaustif. Un
 *        utilitaire de couleur que Tailwind publierait demain serait invisible jusqu'à ce qu'on
 *        l'ajoute.
 *        ⚠ **Ce trou-ci a RÉTRÉCI le 2026-08-27, et il faut savoir de quel côté** : en RETIRER
 *        un est désormais rouge ({@link ablationDeConfiguration}) ; ne pas en ajouter un neuf
 *        reste muet. Ce qui était un désarmement à un geste est redevenu ce que le trou disait
 *        être — une liste à tenir à jour.
 *   T5 · La clôture part de la racine de ROUTES d'un espace, pas des layouts qui l'enveloppent.
 *        `src/app/layout.tsx` rend sur `/app`, mais aussi sur le site public : le prendre pour
 *        racine ferait entrer le produit entier dans la clôture de `/app`. Trois surfaces
 *        échappent donc au compte — cf. le commentaire sous `PERIMETRES_APP`.
 *   T6 · **Cette garde ne se défend pas contre une réécriture délibérée d'elle-même.** Mesuré par
 *        mutation le 2026-08-27 : retirer un répertoire du périmètre est attrapé (témoins) ;
 *        retirer le répertoire ET son témoin est attrapé (plancher de fichiers) ; retirer le
 *        répertoire, son témoin ET baisser le plancher **passe**. Trois gestes dans un seul
 *        commit. Il n'y a pas de quatrième cran à ajouter qui ne soit pas franchissable de la même
 *        façon : *un contrôle qui nomme ce qu'il surveille se désarme en retirant le nom.* À
 *        partir de là, la défense est la revue du diff — et c'est pour la rendre possible que ces
 *        trois crans existent : ils obligent la manœuvre à être VISIBLE.
 *        ⚠ Le compte de gestes vaut par CIBLE, et il a monté le 2026-08-27 : retirer une famille
 *        ou un préfixe en demande maintenant DEUX (l'entrée, puis sa forme d'`EPREUVE`) au lieu
 *        d'un ; desserrer un cliquet en demande deux (le plafond, puis le chiffre du reste, qui
 *        est bilatéral des deux côtés). *Le but n'a jamais été de rendre la manœuvre impossible,
 *        il est de la rendre plurielle* — un diff d'une ligne se relit distraitement.
 *        ⚠ Deux cibles restent à UN geste, mesurées le 2026-08-27 et écrites ici pour n'être pas
 *        redécouvertes : **supprimer le bloc de contrôle du fichier de jetons** ({@link JETONS})
 *        et **supprimer l'appel à {@link ablationDeConfiguration}** sortent tous deux la garde en
 *        0. Ce sont des blocs de trente lignes avec leur docblock, pas des chiffres : c'est tout
 *        ce que ce fichier peut opposer — la manœuvre est GROSSE, faute de pouvoir être refusée.
 *   T7 · {@link COULEURS_CSS} n'est PAS ablatée entrée par entrée. Ce que son compte bilatéral
 *        attrape, mesuré le 2026-08-27 : en RETIRER un seul nom (`gold`) → rouge, le compte passe
 *        à 147 ; en amputer une ligne entière → rouge. Ce qu'il ne voit PAS : une SUBSTITUTION —
 *        `gold` réécrit en `zzgold` laisse 148 noms, éteint `text-[gold]`, et la garde sort en 0.
 *        La fermer demanderait 148 formes d'épreuve pour une liste qui ne bouge que si la
 *        spécification CSS bouge — disproportion assumée, écrite ici plutôt que découverte.
 *  T11 · **LA PROFONDEUR DE PARENTHÈSES de la branche « couleur relative à canaux absolus ».**
 *        Cette branche décide si une relative GARDE son jeton ou le JETTE en cherchant, dans les
 *        canaux, un nom de composante (`r`, `g`, `b`, `l`, `c`, `h`, `alpha`…). Son balayage
 *        traite un groupe de parenthèses comme ATOMIQUE : il l'enjambe et n'y entre jamais
 *        (`[^()]` exclut la parenthèse ouvrante). **Un seul mécanisme, deux symptômes opposés, à
 *        deux profondeurs différentes** — mesuré le 2026-08-28 :
 *
 *          profondeur 1, TOUS les canaux enveloppés  →  aucun nom visible hors parenthèses, la
 *            branche tire, et une relative LÉGITIME est refusée. **FAUX POSITIF**, donc plus
 *            gênant qu'un trou :
 *              `oklch(from var(--x) calc(l * 0.8) calc(c * 1.1) calc(h))`
 *              `rgb(from var(--x) calc(r * 2) calc(g * 2) calc(b * 2))`
 *            ⚠ UN SEUL canal nu suffit à revenir dans le vrai :
 *            `oklch(from var(--x) calc(l + 0.1) c h)` passe correctement.
 *
 *          profondeur 2, un groupe dans un groupe    →  le balayage ne peut plus atteindre la
 *            parenthèse finale, le motif entier échoue, la branche est INERTE, et une jetante
 *            passe. **FAUX NÉGATIF** :
 *              `rgb(from var(--x) calc(calc(255)) 0 0)`
 *              `oklch(from var(--x) clamp(0, calc(0.5), 1) 0.2 30)`
 *              `rgb(from var(--x) min(255, max(0, 255)) 0 0)`
 *              `rgb(from var(--x) calc(calc(1)) calc(calc(2)) calc(calc(3)))`
 *            ⚠ À cette profondeur, les formes qui GARDENT le jeton sont épargnées PAR ACCIDENT —
 *            non parce qu'un nom a été vu, mais parce que la branche ne tire plus du tout.
 *            `oklch(from var(--x) clamp(0, calc(l), 1) c h)` est vert pour la mauvaise raison.
 *            ⚠⚠ Mais celle-là garde un canal NU (`c h`) : une fermeture l'épargnerait encore, et
 *            elle ne garde donc RIEN. La forme qui garde la fermeture est au CROISEMENT des deux
 *            mécanismes — `oklch(from var(--x) clamp(0, calc(l), 1) clamp(0, calc(c), 1)
 *            clamp(0, calc(h), 1))` : elle garde le jeton, elle est à profondeur 2, et tous ses
 *            canaux sont enveloppés. *La distinction n'est apparue qu'en JOUANT la fermeture sur
 *            chaque forme ; la lire ne l'aurait pas donnée.*
 *
 *        **Non fermé, et le motif est la NATURE de la frontière, pas son coût.** Cette branche
 *        est passée de la profondeur 0 (le partage « une lettre », faux) à la profondeur 1 (le
 *        balayage à un niveau). Une troisième itération la porterait à la profondeur 2 **sans
 *        changer sa nature** : elle resterait syntaxique là où la question est sémantique.
 *
 *        ⚠ **Et ce n'est pas une conjecture : la profondeur 2 a été JOUÉE**, sur chacune des dix
 *        formes figées. Trois résultats, et le troisième est le plus dur :
 *
 *          · les QUATRE faux négatifs basculent — la fermeture marcherait, de ce côté ;
 *          · les DEUX faux positifs SURVIVENT. Augmenter la profondeur apprend au balayage à
 *            ENJAMBER des groupes plus profonds ; ça ne lui apprend pas à ENTRER dans un groupe,
 *            qui est ce que le faux positif demande ;
 *          · et une forme qui passe aujourd'hui **deviendrait un faux positif NEUF** : celle du
 *            croisement, qui GARDE le jeton, est à profondeur 2, et dont TOUS les canaux sont
 *            enveloppés. Elle est verte aujourd'hui parce que la branche est inerte.
 *
 *        *Une itération de plus corrigerait la moitié du défaut, laisserait l'autre moitié
 *        intacte, et en créerait une troisième.* **La fermeture ne laisserait pas un faux
 *        positif : elle en CRÉERAIT un.** C'est la mesure qui dit de s'arrêter, pas le budget.
 *        Trancher pour de bon demanderait un analyseur d'expressions CSS — hors de proportion
 *        pour une garde de VOCABULAIRE, dont l'objet est qu'aucune couleur ne se décide hors de
 *        `globals.css`, pas de comprendre le calcul qui la produit.
 *
 *        Les dix formes sont figées dans {@link EPREUVE} **avec leur verdict RÉEL**, marquées
 *        `T11 déclaré` — comme le style inline l'est pour T1. Elles ne sont donc pas
 *        redécouvrables, et le jour où quelqu'un ferme ce trou, leur verdict bascule : la
 *        fermeture se voit en diff au lieu d'être à croire sur parole.
 *
 *        ⚠ **La leçon de méthode, qui vaut au-delà de cette branche.** Quatre attaques par
 *        RETOUR ARRIÈRE contre ce regard avant ont échoué, ce qui donnait l'impression d'un
 *        mécanisme imperméable de ce côté. La bonne lecture était l'inverse : *la propriété qui
 *        les fait échouer — un groupe de parenthèses est atomique pour le regard avant — est
 *        EXACTEMENT celle qui produit les deux résiduels.* **Un mécanisme qui résiste à une
 *        attaque par un côté la subit par l'autre.**
 *   T8 · Les fichiers `.svg` ne sont pas lus, et ce n'est pas un oubli : `EXTENSIONS` s'arrête au
 *        code et au CSS. Un SVG est un ACTIF, pas une feuille de style — un logo de marque y
 *        porte légitimement ses hexadécimaux, et les refuser ferait de cette garde une garde
 *        qu'on contourne. Mesuré le 2026-08-27 : **zéro `.svg` sous `takussan-web/src`** (les
 *        cinq du dépôt sont dans `public/`, hors de tout périmètre). Le trou est réel et vide.
 *  T10 · **Une valeur SÉPARÉE DE SON ATTRIBUT PAR UNE FIN DE LIGNE.** {@link analyser} lit le
 *        fichier LIGNE PAR LIGNE — c'est ce qui permet de rapporter un numéro de ligne — et les
 *        six motifs sont donc bornés à une ligne. `<rect fill=\n  "#a85332" />` traverse la
 *        garde ; `<rect fill="#a85332" />` est attrapé. Vérifié dans les deux sens le
 *        2026-08-27, signalé par la revue adverse de la passe 2. La même borne vaut pour une
 *        valeur arbitraire coupée par un retour à la ligne dans un gabarit.
 *        **Non fermé, et le motif tient en deux mesures — pas en un coût.** ⚠ Ce paragraphe a
 *        d'abord justifié le renoncement par le prix : « analyser le fichier d'un bloc ferait
 *        perdre le numéro de ligne », « il faudrait une table décalage → ligne, un mécanisme
 *        neuf ». **C'est surestimé, et la revue adverse de la passe 3 l'a montré** : ce trou-ci
 *        se ferme par une fenêtre glissante de DEUX lignes sur le SEUL contrôle E, en ne
 *        retenant que les correspondances qui enjambent la frontière et en rapportant la
 *        première ligne. Le numéro de ligne survit, et ça fait environ six lignes de code, pas
 *        un mécanisme. *Un coût annoncé plus haut qu'il n'est rend un renoncement plus
 *        confortable qu'il ne devrait l'être.*
 *
 *        Les deux vraies raisons, mesurées le 2026-08-27 :
 *          · **l'ensemble est VIDE** — `grep -rnE '(fill|stroke|color|bgcolor|stopColor|
 *            floodColor|lightingColor)\s*=\s*$' takussan-web/src` ne rend rien ;
 *          · **Prettier défait la forme** : un attribut JSX coupé après son `=` est reformaté au
 *            prochain passage, donc le trou ne se remplit pas tout seul.
 *        Un trou vide que l'outillage referme n'achète pas six lignes de complexité dans le
 *        seul contrôle qui lit deux lignes à la fois. La décision reste la même ; c'est sa
 *        justification qui était trop chère.
 *   T9 · **Une DÉCLARATION CSS ordinaire, dans un fichier `.css` d'un répertoire gardé.** Les
 *        contrôles A/B/C cherchent une classe, D et F un crochet, E un `=` : aucun ne voit
 *        `background-color: #f5f5f4;` écrit dans une feuille. Signalé par la revue adverse de
 *        TCK-384. **Le trou est réel et VIDE, mesuré le 2026-08-27 : zéro fichier `.css` sous
 *        un périmètre gardé** — les deux du dépôt sont `src/app/globals.css`, contrôlé à part
 *        (cf. {@link JETONS}) et hors de tout périmètre, et `src/app/(public)/playground/
 *        playground.css`, hors périmètre lui aussi. Non fermé : un contrôle de déclaration ne
 *        peut pas s'appliquer aux `.tsx` sans faux positifs (une prose de docblock y écrit
 *        légitimement `--warning: #8a5410`), et le restreindre aux `.css` demanderait à
 *        {@link analyser} de connaître le type des fichiers — un mécanisme neuf pour un
 *        ensemble vide. Même statut que T8, et même raison de l'écrire : il vaut mieux
 *        déclaré que redécouvert.
 *
 * **Les commentaires ne sont pas retirés avant analyse**, délibérément et pour la même raison
 * que `check-app-tokens.mjs` : un docblock qui montre `bg-stone-100` est exactement la
 * documentation périmée qui fait repousser le motif. Le récit d'une migration s'écrit en toutes
 * lettres (« pierre 100 »), pas en classes copiables.
 *
 * ⚠⚠ **ET `scripts/check-chart-contrast.mjs` FAIT L'INVERSE, exprès.** Elle DÉPOUILLE les
 * commentaires avant d'analyser (`sansCommentaires`), parce que l'en-tête de
 * `charts/palette.ts` cite la forme qu'elle interdit et qu'une garde qui rougit sur la
 * documentation de sa propre règle se fait désarmer avant d'avoir servi. Deux gardes du même
 * dépôt, politique opposée sur le même point, chacune pour une bonne raison :
 *
 *     ici (vocabulaire)   un commentaire qui MONTRE une classe brute est un presse-papier
 *                         → il est LU, et le récit s'écrit en toutes lettres.
 *     là (contraste)      un commentaire qui CITE le jeton qu'il interdit est de la pédagogie
 *                         → il est DÉPOUILLÉ, et seul le code est mesuré.
 *
 * *Un relecteur qui sonde l'une avec le réflexe de l'autre rapportera un trou qui n'existe
 * pas* — c'est arrivé à la revue adverse de TCK-404, le 2026-08-27, sur le cliquet de la garde
 * de contraste. Les deux en-têtes portent désormais ce paragraphe.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * T2 — LE PÉRIMÈTRE N'EST PAS L'ÉCRAN, et c'est le défaut de TCK-245 d'un cran plus haut
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Un périmètre est une liste de RÉPERTOIRES ; un écran est un GRAPHE DE RENDU. Les deux ne
 * coïncident jamais tout seuls, et la première version de cette garde en a fait la démonstration
 * le jour même de sa naissance : elle sortait en 0 pendant que `/super-admin/payouts` rendait six
 * pastilles de statut en ambre, bleu, violet, émeraude, rouge et neutre, parce que la chaîne
 * `app/(super-admin)/super-admin/payouts/page.tsx → AdminPayoutsClient → PayoutTable` sort du
 * quatrième répertoire à son deuxième maillon. Idem pour `kyc-components.tsx`, importé par
 * `admin/super/agency-detail.tsx` (gardé, lui) et portant un `text-white`.
 *
 * D'où DEUX mécanismes, et non un :
 *
 *   1. `PERIMETRES` — ce qui est GARDÉ, c'est-à-dire ce qui doit être à zéro. Il s'étend au fur
 *      et à mesure qu'on porte des fichiers ; il ne se devine pas.
 *   2. `resteNonGarde()` — ce qui est seulement MESURÉ : la clôture des imports depuis
 *      `src/app/(super-admin)/**`, moins le périmètre gardé. Ce sont les fichiers que la console
 *      rend réellement et que la garde ne peut pas exiger à zéro aujourd'hui, parce qu'ils sont
 *      des primitives partagées avec le reste du produit (`ui/`, `forms/`, `files/`…). Les
 *      porter demande de redessiner ces primitives pour TOUS les écrans : c'est TCK-384, pas
 *      celui-ci.
 *
 * Le second est un CLIQUET : son compte est écrit ci-dessous, la garde échoue s'il MONTE. C'est
 * ce qui empêche « le périmètre est quatre répertoires » de redevenir un secret. *Une garde dont
 * le chiffre de référence est plus petit que le défaut réel de l'écran rassure sur une mesure qui
 * n'est pas celle de l'écran* — alors elle imprime les deux.
 *
 * Usage :
 *   node scripts/check-super-admin-tokens.mjs            # garde, sort en 1 au moindre écart
 *   node scripts/check-super-admin-tokens.mjs --report   # + le détail fichier par fichier
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = process.argv.includes('--report');
const WEB_SRC = join(ROOT, 'takussan-web', 'src');

/**
 * LE PÉRIMÈTRE GARDÉ — ce qui DOIT être à zéro.
 *
 * Trois formes, et le choix entre elles se fait sur une question et une seule : *ce chemin
 * sert-il UNIQUEMENT la console super-admin ?*
 *
 *   `dir`   — le répertoire entier ne sert que la console, ou bien il est déjà propre en entier.
 *   `glob`  — un préfixe de nom dans un répertoire partagé. `src/components/layout/` sert aussi
 *             le shell agence ; seuls les `SuperAdmin*` y entrent, et un quatrième né demain est
 *             repris automatiquement — c'est ce que la forme `glob` a de mieux qu'une liste de
 *             trois fichiers nommés.
 *   `file`  — un fichier précis d'un répertoire partagé, quand ses voisins ne sont PAS rendus
 *             par la console. `src/components/kyc/` est le cas : `kyc-components.tsx` est monté
 *             par `admin/super/agency-detail.tsx`, mais `KycUploader.tsx` ne l'est que par les
 *             trois assistants d'onboarding (vérifié par `grep` le 2026-08-27). Mettre le
 *             répertoire entier aurait fait rougir la garde sur un fichier que la console ne
 *             rend pas — et la réponse humaine à ce rouge-là est une exception, pas un correctif.
 *
 * ⚠ La forme `file` a la faiblesse que la forme `glob` a fermée : un fichier neuf déposé à côté
 * n'est PAS couvert. C'est `resteNonGarde()` qui le rattrape — il apparaîtra dans le reste, et
 * le cliquet montera.
 *
 * QUATRE répertoires sont entrés en entier avec TCK-358, et deux d'entre eux ne sont PAS des
 * répertoires de console — cf. l'avertissement en tête de fichier :
 *
 *   `src/components/console`  — les primitives partagées de TCK-357 (`StatusBadge`, `DataState`,
 *                               `EmptyState`…), montées par la console super-admin ET par la
 *                               console agence. Son CODE était déjà propre ; seuls trois
 *                               docblocks citaient des classes brutes, et c'est ce qui l'avait
 *                               tenu dehors — la garde lit les commentaires. Réécrits en toutes
 *                               lettres le 2026-08-27, le répertoire est entré sans qu'une ligne
 *                               de rendu bouge.
 *   `src/components/feedback` — même histoire, un seul docblock (`ErrorState`).
 *
 * `src/components/billing` et `src/components/reporting` entrent aussi :
 * `billing` parce que `AdminPayoutsClient`/`AdminPlansClient`/`AdminAgencySubscriptionPanel` y
 * vivent et que ses cinq autres fichiers sont propres ; `reporting` parce qu'il était gardé par
 * RIEN (constat du vérificateur de TCK-361) alors que `/super-admin/reports` le monte — et qu'il
 * était déjà à zéro, mesuré le 2026-08-27. *Un répertoire déjà propre est le moins cher à mettre
 * sous cliquet, et c'est le seul moment où ça ne coûte rien.*
 */
const PERIMETRES = [
  { type: 'dir', chemin: join(WEB_SRC, 'app', '(super-admin)') },
  { type: 'dir', chemin: join(WEB_SRC, 'components', 'admin', 'super') },
  { type: 'dir', chemin: join(WEB_SRC, 'components', 'super-admin') },
  { type: 'dir', chemin: join(WEB_SRC, 'components', 'billing') },
  { type: 'dir', chemin: join(WEB_SRC, 'components', 'reporting') },
  { type: 'dir', chemin: join(WEB_SRC, 'components', 'console') },
  { type: 'dir', chemin: join(WEB_SRC, 'components', 'feedback') },
  { type: 'glob', dir: join(WEB_SRC, 'components', 'layout'), prefixe: 'SuperAdmin' },
  { type: 'file', chemin: join(WEB_SRC, 'components', 'kyc', 'kyc-components.tsx') },
  //
  // ⚠ QUATRE RÉPERTOIRES DE PRIMITIVES PARTAGÉES entrent avec TCK-384, et aucun n'appartient à
  // la console — c'est le contraire de tout ce que cette liste contenait jusqu'ici. Ils entrent
  // parce qu'ils sont DÉJÀ à zéro (mesuré le 2026-08-27, après le portage des 40 occurrences du
  // ticket), et parce qu'ils sont montés par les trois espaces à la fois : les laisser dehors,
  // c'est les laisser gardés par le seul cliquet, donc récidivables jusqu'au plafond suivant.
  //
  // Ils entrent dans l'espace SUPER-ADMIN et pas ailleurs, pour la raison écrite au docblock de
  // `GARDE_PARTOUT` : un fichier gardé deux fois est gardé une fois de trop.
  //
  //   `ui`      les 90 primitives shadcn/base-nova. `toast`, `sheet`, `dialog`, `dropdown-menu`
  //             et `warning-banner` y portaient 22 des 46 occurrences du reste.
  //   `forms`   `FormError` / `FormSuccess`, portés sur `--destructive` / `--success`.
  //   `files`   `PdfViewer`, à lui seul 11 occurrences — le plus gros fichier du lot.
  //   `shared`  `LanguageSwitcher`, et ses deux noirs littéraux.
  //
  // *Un répertoire déjà propre est le moins cher à mettre sous cliquet, et c'est le seul moment
  // où ça ne coûte rien* — même raison que `components/reporting` chez TCK-358, à ceci près
  // qu'ici il a d'abord fallu le rendre propre.
  { type: 'dir', chemin: join(WEB_SRC, 'components', 'ui') },
  { type: 'dir', chemin: join(WEB_SRC, 'components', 'forms') },
  { type: 'dir', chemin: join(WEB_SRC, 'components', 'files') },
  { type: 'dir', chemin: join(WEB_SRC, 'components', 'shared') },
];

/**
 * Les préfixes d'utilitaires de couleur de Tailwind v4 — liste délibérément LARGE.
 *
 * C'est la leçon de l'AC2 de TCK-244, qui cherchait `stroke-` quand le code écrivait `fill-` :
 * une palette hors charte a survécu à un caractère près. Un préfixe manquant ici est un trou
 * muet — la garde reste verte et la palette brute revit sous un nom d'utilitaire voisin.
 */
const PREFIXES = [
  'bg', 'text', 'border', 'ring', 'divide', 'fill', 'stroke', 'placeholder',
  'outline', 'shadow', 'from', 'via', 'to', 'caret', 'accent', 'decoration',
  // ⚠ AJOUTÉS PAR TCK-381, et pas par prudence : par MUTATION. Les huit côtés de bordure, les
  // deux axes de séparateur et l'anneau de décalage sont des utilitaires de COULEUR à part
  // entière, et aucun n'était vu — `border-t-stone-300`, `divide-x-red-500` et
  // `ring-offset-stone-200` sortaient tous en 0 sur la version de TCK-358, alors que
  // `inset-ring-stone-300` et `text-shadow-stone-300`, eux, étaient bien attrapés (le motif y
  // retrouve `ring-` / `shadow-` après un tiret, qui est une frontière de mot).
  //
  // *C'est exactement le trou d'un caractère que l'AC2 de TCK-244 avait déjà payé* — `fill-` là
  // où on cherchait `stroke-`. La liste est LARGE, elle n'est pas exhaustive, et T4 le dit.
  'border-t', 'border-r', 'border-b', 'border-l', 'border-x', 'border-y',
  'border-s', 'border-e', 'divide-x', 'divide-y', 'ring-offset',
];

/**
 * Les familles de l'échelle Tailwind par défaut, TOUTES.
 *
 * L'AC1 de TCK-358 n'en nommait que dix (`stone|amber|emerald|red|green|blue|slate|gray|zinc|
 * neutral`) — celles que la console utilisait ce jour-là. Une garde qui recopierait cette liste
 * laisserait passer le premier `bg-teal-100` venu. La liste ci-dessous est celle de Tailwind,
 * pas celle du relevé.
 */
const FAMILLES = [
  'slate', 'gray', 'zinc', 'neutral', 'stone',
  'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal',
  'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose',
];

/**
 * Les 148 couleurs nommées de CSS — de la DONNÉE, pas une heuristique.
 *
 * `bg-[red]`, `text-[gold]`, `shadow-[0_1px_2px_teal]` compilent tous, et aucun ne porte de `#`
 * ni de fonction de couleur : sans cette liste, le contrôle D aurait le même genre de trou d'un
 * caractère que l'AC2 de TCK-244. Elle est recopiée de la spécification CSS Color 4, pas devinée.
 *
 * ⚠ Son COMPTE est vérifié plus bas (`COULEURS_ATTENDUES`) et il est BILATÉRAL. C'est le seul
 * cran qu'elle porte : l'ablation par entrée, que {@link ablationDeConfiguration} joue sur
 * `FAMILLES` et `PREFIXES`, n'est PAS jouée ici — il faudrait 148 formes d'épreuve pour une
 * liste qui ne bouge que si la spécification CSS bouge. Le trou résiduel est déclaré (T7).
 */
const COULEURS_CSS = (
  'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue '
  + 'blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk '
  + 'crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki '
  + 'darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen '
  + 'darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue '
  + 'dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite '
  + 'gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki '
  + 'lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan '
  + 'lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen '
  + 'lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen '
  + 'magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen '
  + 'mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream '
  + 'mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid '
  + 'palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum '
  + 'powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown '
  + 'seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen '
  + 'steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen'
).split(' ');

/**
 * Les ATTRIBUTS DE PRÉSENTATION qui décident un remplissage — le contrôle E.
 *
 * Ils ne sont pas des classes : `<rect fill="#a85332" stroke="#f5f5f4" />` est du BALISAGE, et
 * les quatre premiers contrôles n'en voient rien. C'est le voisin du trou T1 (style inline), et
 * il en diffère sur le seul point qui compte ici : *un attribut est du texte, pas un objet JS* —
 * donc il est attrapable par une lecture de texte, exactement comme une classe.
 *
 * Le dépôt en portait 7 occurrences au 2026-08-27, toutes HORS des deux périmètres gardés et
 * hors des deux clôtures (5 dans `auth/OAuthButtons.tsx` — des logos de marque —, 2 dans
 * `(public)/properties/[slug]/…/PropertyLocationMapInner.tsx`). Fermer ce trou coûtait donc
 * ZÉRO correctif : c'est le seul moment où ça ne coûte rien, même raison que `reporting` chez
 * TCK-358.
 *
 * ⚠ Les variantes à TRAIT D'UNION (`stop-color`, `flood-color`, `lighting-color`) ne sont PAS
 * dans la liste, et leur absence est un résultat de {@link ablationDeConfiguration}, pas un
 * oubli : elle les a refusées comme n'éprouvant rien. La raison est le `\b` initial du motif —
 * dans `flood-color="…"`, le trait d'union est un caractère non-mot, donc `\bcolor` y matche
 * déjà. Les entrées camelCase (`stopColor`, `floodColor`, `lightingColor`), elles, RESTENT :
 * la regex est sensible à la casse, et `\bcolor` n'y matche pas. `bgcolor` reste pour la raison
 * inverse — le `g` qui précède est un caractère de mot, donc `\bcolor` ne matche pas non plus.
 *
 * *Trois entrées qui ne changent rien quand on les retire ne gardent rien* : la garde de la
 * garde les a nommées avant qu'un lecteur ait pu les croire utiles.
 */
const ATTRIBUTS_DE_PEINTURE = [
  'fill', 'stroke', 'color', 'bgcolor', 'stopColor', 'floodColor', 'lightingColor',
];

/**
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * LA CONSTRUCTION DES CONTRÔLES — une seule fonction, et c'est ce qui rend l'ablation possible
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Les cinq expressions régulières étaient cinq constantes de module jusqu'au 2026-08-27. Elles
 * sont devenues une FONCTION pour une raison précise, et une seule : {@link ablationDeConfiguration}
 * doit pouvoir les reconstruire en RETIRANT une entrée de configuration, puis vérifier que
 * quelque chose cesse d'être vu. Sans cela, l'auto-épreuve ne peut rien dire d'une liste — elle
 * ne peut parler que des formes qu'on a bien voulu écrire à la main.
 *
 * ⚠ **Il n'y a qu'un seul constructeur, délibérément.** Une seconde copie des motifs, écrite
 * pour l'ablation, éprouverait un détecteur qui n'est pas celui qui garde le dépôt — et elle
 * divergerait le jour même. C'est le défaut que la moitié des gardes de ce dépôt existent pour
 * attraper ailleurs.
 */
function construireControles({
  familles = FAMILLES,
  prefixes = PREFIXES,
  couleurs = COULEURS_CSS,
  attributs = ATTRIBUTS_DE_PEINTURE,
} = {}) {
  const P = prefixes.join('|');

  /**
   * A · échelle numérotée : `bg-stone-100`, `hover:text-amber-700`, `ring-amber-500/30`.
   *
   * ⚠ La borne `[0-9]{2,3}` porte les DEUX longueurs d'échelle de Tailwind, et `EPREUVE` en
   * contient désormais des formes des deux (`bg-slate-50` à deux chiffres, `dark:bg-stone-800`
   * à trois). Elle n'en portait aucune à deux jusqu'au 2026-08-27 : amputer la borne en
   * `[0-9]{3}` éteignait toute l'échelle `-50` et passait l'auto-épreuve sans un mot.
   */
  const ECHELLE = new RegExp(`\\b(?:${P})-(?:${familles.join('|')})-[0-9]{2,3}\\b`, 'g');

  /**
   * B · les couleurs NOMMÉES sans échelle : `bg-white`, `text-black`, `border-white/10`.
   *
   * Elles échappent au motif A faute de chiffre, et c'est par elles que le blanc en dur revenait :
   * 14 `bg-white` dans les périmètres au 2026-08-27, tous des surfaces qui voulaient dire `--card`.
   * Le blanc FONCTIONNEL — le fond d'un QR code, qui doit rester blanc en thème sombre — passe par
   * la classe `.qr-surface` de `globals.css`, nommée pour ce qu'elle fait.
   */
  const NOMMEES = new RegExp(`\\b(?:${P})-(?:white|black)\\b`, 'g');

  /**
   * C · le dialecte `app-*`, que `check-app-tokens.mjs` garde déjà sur `src` entier.
   *
   * Le doublon est délibéré et il coûte trois lignes : si cette garde-ci était la seule à tourner
   * un jour (exécution ciblée, bissection), la console ne perdrait pas son contrôle le plus
   * ancien. Deux gardes qui se recouvrent valent mieux qu'un trou entre elles.
   */
  const APP_DIALECTE = new RegExp(`\\b(?:${P})-app-[a-z0-9-]+\\b`, 'g');

  /**
   * D · la VALEUR ARBITRAIRE porteuse d'une couleur LITTÉRALE : `bg-[#f5f5f4]`, `text-[#a85332]`,
   * `bg-[rgb(255,0,0)]`, `border-[oklch(0.7_0.2_30)]`, `shadow-[0_0_40px_rgba(0,0,0,.04)]`,
   * `bg-[red]`.
   *
   * Le mot LITTÉRALE porte tout le contrôle : `bg-[color-mix(in_srgb,var(--chart-1)_50%,transparent)]`
   * est accepté, parce qu'il ne décide aucune couleur — il en lit une.
   *
   * ⚠ **Ce contrôle est né d'un trou, pas d'une prévoyance.** Les quatre premières formes
   * ci-dessus ont été passées au vert par la revue adverse de TCK-358, sur une garde dont l'en-tête
   * affirmait n'avoir qu'un seul faux négatif. Elles compilent toutes : Tailwind v4 accepte
   * n'importe quelle valeur CSS entre crochets. Une couleur décidée là est décidée hors de
   * `globals.css` exactement comme un `bg-stone-100`, et elle est *plus* difficile à retrouver.
   *
   * Ce qu'il ne refuse PAS, et c'est voulu : `bg-[var(--sidebar-accent)]`, `w-[42ch]`,
   * `text-[13px]`, `shadow-[0_1px_2px_0_var(--ombre)]`. Une valeur arbitraire n'est pas un défaut ;
   * une COULEUR LITTÉRALE dans une valeur arbitraire en est un. Un `var(--…)` est une lecture de
   * jeton — précisément ce que la garde veut voir.
   *
   * Les bornes ne sont pas `\b` : dans une valeur arbitraire les séparateurs sont des `_`
   * (`shadow-[0_0_0_1px_teal]`), et `\b` ne coupe pas entre `_` et une lettre. La classe exclue de
   * part et d'autre est donc `[a-zA-Z0-9-]`, ce qui laisse `_teal` visible tout en protégeant les
   * noms de variables (`var(--linen)` : le `-` qui précède bloque).
   *
   * ⚠ `color-mix` n'est PAS dans la liste de fonctions, et son absence est le correctif d'un faux
   * positif mesuré — signalé par l'agent de TCK-361 le 2026-08-27, reproduit en extrayant la regex
   * de ce fichier même.
   *
   * **`color-mix()` est un CONTENEUR, pas une couleur.** Sa littéralité dépend entièrement de ses
   * arguments : `color-mix(in srgb, var(--chart-1) 50%, transparent)` ne décide aucune couleur, il
   * en LIT une et l'éclaircit — c'est exactement ce que `CohortHeatmap` calcule pour son échelle de
   * chaleur. Le nom de fonction nu tirait avant que le motif ait regardé l'intérieur, donc
   * l'exemption `var(--…)` ne pouvait jamais s'appliquer.
   *
   * Rien n'est perdu : un littéral NOYÉ dans un mix reste attrapé par les deux autres motifs —
   * `color-mix(…,#fff,…)` par l'hexadécimal, `color-mix(…,red,blue)` par les couleurs nommées,
   * `color-mix(…,rgb(1,2,3),…)` par la fonction imbriquée. Les quatre cas sont dans `EPREUVE`.
   *
   * `color(` RESTE, lui : `color(display-p3 1 0 0)` est une vraie couleur littérale.
   *
   * *Un contrôle qui refuse du code correct ne se fait pas corriger, il se fait contourner* — et la
   * sortie de secours la moins chère devant ce refus-ci aurait été de réinjecter un hexadécimal,
   * précisément ce que le contrôle D existe pour empêcher.
   */
  const D_MOTIFS = [
    // ⚠ `(?<!url\()` : `url(#degrade-lin)` n'est pas une couleur, c'est une RÉFÉRENCE — et un
    // identifiant fait de caractères hexadécimaux (`#f00ba7`) lui ressemble à s'y méprendre. Le
    // contrôle E connaissait déjà ce faux positif et le fermait par un `(?!url\()` en tête de
    // chaîne ; les contrôles D et F, eux, lisent le MILIEU d'une valeur, où ce garde-là ne peut
    // pas se poser. Le regard arrière le remplace, et il sert les trois d'un coup.
    //
    // ⚠⚠ Le SECOND regard arrière a été ajouté par la revue adverse de la passe 2 : la forme
    // GUILLEMETÉE `url("#f00ba7")` tombait, et la forme `url(_#f00ba7)` aussi — dans une valeur
    // arbitraire, Tailwind écrit les espaces avec des `_`. Les deux regards couvrent donc `url(`,
    // `url("`, `url('` et `url(_`. Résiduel DÉCLARÉ : `url(__#…`, deux séparateurs, que personne
    // n'écrit — l'empiler serait payer une lookbehind par caractère.
    //
    // ⚠ La leçon de méthode de cette correction vaut plus que la correction : la première sonde du
    // regard arrière fut `<rect fill="url( #degrade-lin )" />`, ACCEPTÉE — et c'est le `(?!url\()`
    // ancré en TÊTE du contrôle E qui la sauvait, pas le regard arrière. *Deux mécanismes qui
    // produisent le même vert : le second est celui qu'on croit avoir vérifié.* Le vrai test du
    // regard arrière est une valeur ARBITRAIRE, où aucun ancrage de tête n'existe.
    '(?<!url\\()(?<!url\\([\'"_])#[0-9a-fA-F]{3,8}',
    // ⚠ `(?![\s_]*from[\s_])` exempte la SYNTAXE DE COULEUR RELATIVE — `rgb(from var(--primary)
    // r g b / 50%)`, `oklch(from var(--chart-1) l c h)`. Elle ne DÉCIDE aucune couleur : elle en
    // LIT une et la transforme, exactement comme `color-mix`, et le docblock de ce contrôle
    // promet qu'une lecture de jeton est acceptée. Elle était pourtant refusée — la garde
    // refusait donc la meilleure façon de dériver une couleur d'un jeton, et *une garde qui
    // refuse la bonne façon de faire pousse à contourner la garde*. Le `[\s_]` final, et non
    // `\b`, parce que dans une valeur arbitraire `from` est suivi d'un `_`, qui est un caractère
    // de mot : `\bfrom\b` n'y coupe pas.
    '(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\\((?![\\s_]*from[\\s_])',
    // ⚠ LA BRANCHE DE RATTRAPAGE — la couleur relative à CANAUX ABSOLUS, et c'est la porte que
    // l'exemption ci-dessus ouvrait. `rgb(from var(--x) 255 0 0)` LIT le jeton puis le JETTE
    // entièrement : elle rend du rouge pur quelle que soit la valeur de `--x`. Le docblock
    // justifiait l'exemption par « une lecture de jeton » — *une forme qui lit puis jette n'en
    // est pas une*, c'est une couleur décidée hors de `globals.css`, déguisée en lecture.
    //
    // ⚠⚠ LE PARTAGE N'EST PAS « il y a une lettre », ET CE FICHIER L'A ÉCRIT PENDANT UNE PASSE.
    // C'est **« aucun canal ne NOMME une composante de l'origine »** — une NÉGATION, pas une
    // présence. La différence n'est pas théorique : neuf formes qui JETTENT le jeton contiennent
    // une lettre qui ne nomme rien, et passaient toutes —
    //
    //   un espace colorimétrique  `color(from var(--x) srgb 1 0 0)`, `display-p3`
    //                             ⚠ toute la famille `color(from …)` était hors d'atteinte PAR
    //                               CONSTRUCTION : elle porte toujours un espace.
    //   une unité                 `hsl(from var(--x) 120deg 50% 50%)`
    //   un mot-clé                `rgb(from var(--x) 255 none none)`
    //   une notation scientifique `rgb(from var(--x) 2.55e2 0 0)`
    //   un `calc()` de constantes `rgb(from var(--x) calc(255) 0 0)`
    //
    // Le dernier est le plus instructif : **la version précédente de ce commentaire citait
    // `calc()` comme le SIGNE qu'on garde le jeton.** `calc(l * 0.8)` le garde, `calc(255)` le
    // jette — la même fonction des deux côtés du partage. *Un critère qui porte sur la FORME de
    // l'expression ne peut pas trancher ce qui dépend de ce qu'elle NOMME.*
    //
    // D'où le regard avant NÉGATIF : la branche ne tire que si, dans les canaux, aucune
    // composante d'origine n'apparaît isolément. Les deux gardes de mot neutralisent les lettres
    // parasites — dans `srgb` le `r` est précédé d'un `s`, dans `deg` le `g` est précédé d'un
    // `e`, dans `calc` le `c` est suivi d'un `a`.
    //
    // ⚠ DEUX PIÈGES MESURÉS EN ÉPROUVANT LA FORME AVANT DE L'ADOPTER, et sans eux elle est pire
    // que le trou qu'elle ferme :
    //
    //   1. **Le séparateur `[\s_]+` après la source est OBLIGATOIRE.** Sans lui, le moteur
    //      revient en arrière sur l'alternative `[^\s_)]+`, fait finir la source à `var(--x`,
    //      et le regard avant ne voit plus qu'un `)` — donc aucune composante, donc il tire.
    //      Mesuré : la forme sans séparateur refuse **les douze** relatives légitimes. Une garde
    //      qui refuse la bonne façon de faire est pire qu'une garde qui laisse passer la
    //      mauvaise, parce qu'elle se fait désarmer.
    //   2. **Le balayage doit tolérer UN niveau de parenthèses** (`(?:[^()]|\([^()]*\))*`) et
    //      non s'arrêter au premier `)`. Sinon `rgb(from var(--x) calc(255) g b)` — qui GARDE
    //      `g` et `b` — est refusée : le balayage s'arrête dans le `calc` et ne voit jamais les
    //      composantes qui suivent. Trois formes de ce genre sont dans `EPREUVE`.
    //
    // Signalé par la revue adverse de la passe 3 sur deux formes ; six mesurées ici — les quatre
    // familles de fonction, plus les syntaxes de propriété arbitraire et d'attribut, qui partagent
    // ces motifs. Vérifié compilable avec le Tailwind 4.2.2 du projet.
    //
    // ⚠ Les formes à source NON-jeton (`rgb(from #a85332 r g b)`, `rgb(from rebeccapurple r g b)`)
    // étaient DÉJÀ refusées, par les branches 1 et 3 : l'exemption ne portait que sur le nom de
    // fonction. C'est de la défense en profondeur réelle, et elle explique pourquoi la porte était
    // étroite — il fallait un `var()` en source ET des canaux littéraux.
    '(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\\([\\s_]*from[\\s_]+'
      + '(?:var\\([^)]*\\)|[^\\s_)]+)[\\s_]+'
      + '(?!(?:[^()]|\\([^()]*\\))*(?<![a-zA-Z])(?:alpha|[rgbhswlcxyz])(?![a-zA-Z]))'
      + '(?:[^()]|\\([^()]*\\))*\\)',
    `(?<![a-zA-Z0-9-])(?:${couleurs.join('|')})(?![a-zA-Z0-9-])`,
  ];
  /*
   * ⚠ LE DRAPEAU `i`, sur D, E et F — et sur EUX SEULS. Revue adverse de la passe 2.
   *
   * Mesuré : `bg-[RED]`, `bg-[RGB(1,2,3)]`, `[Color:Red]` et `FILL="#A85332"` traversaient les
   * trois contrôles. Une majuscule suffisait. **Le motif hexadécimal, lui, n'a JAMAIS eu le
   * défaut** — sa classe `[0-9a-fA-F]` porte déjà les deux casses, et c'est pourquoi l'exemple
   * `[BACKGROUND-COLOR:#F5F5F4]` de la revue était en réalité DÉJÀ attrapé. Les trous étaient
   * ailleurs, et il y en avait trois : la liste des couleurs NOMMÉES, l'alternance des FONCTIONS
   * de couleur, et l'alternance des ATTRIBUTS de peinture.
   *
   * ⚠⚠ **A, B et C n'ont PAS ce drapeau, et ce n'est pas un oubli.** Une classe d'utilitaire
   * Tailwind est sensible à la casse : `BG-STONE-100` n'existe pas, ne compile pas, et rougir
   * dessus ferait de cette garde une garde qu'on contourne. `EPREUVE` fige les deux résultats —
   * `['BG-STONE-100', false]` d'un côté, les cinq formes de casse du bloc M de l'autre. *Le CSS
   * d'une valeur arbitraire est insensible à la casse ; le nom d'un utilitaire ne l'est pas.
   * Deux règles opposées dans le même fichier, chacune pour une bonne raison.*
   */
  const ARBITRAIRE = new RegExp(
    `\\b(?:${P})-\\[[^\\]]*(?:${D_MOTIFS.join('|')})[^\\]]*\\]`,
    'gi',
  );

  /**
   * E · la couleur littérale en ATTRIBUT DE PRÉSENTATION — `<rect fill="#a85332" />`.
   *
   * Ajouté le 2026-08-27, sur une mutation de la revue adverse de TCK-381 : les quatre premiers
   * contrôles laissaient un `fill="#a85332" stroke="#f5f5f4"` passer au vert dans un fichier du
   * périmètre gardé. Cf. {@link ATTRIBUTS_DE_PEINTURE} pour ce que ça a coûté (rien) et pourquoi.
   *
   * `(?!url\()` est là pour un faux positif que le contrôle D connaît déjà sous une autre forme :
   * `fill="url(#f00ba7)"` n'est pas une couleur, c'est une référence de dégradé — et un
   * identifiant fait de caractères hexadécimaux ressemble à un `#rrggbb` à s'y méprendre. Un
   * `var(--…)` reste accepté par le même mécanisme que le contrôle D : le `-` qui précède le nom
   * bloque la branche des couleurs nommées.
   *
   * ⚠ Il ne voit PAS `fill={couleur}` ni `fill={'#a85332'}` : une expression JSX n'est pas du
   * texte, c'est le trou T1 sous un autre habit. Déclaré, non fermé.
   */
  const ATTRIBUT = new RegExp(
    `\\b(?:${attributs.join('|')})\\s*=\\s*`
    + `(?:"(?!url\\()[^"]*(?:${D_MOTIFS.join('|')})[^"]*"`
    + `|'(?!url\\()[^']*(?:${D_MOTIFS.join('|')})[^']*')`,
    'gi',
  );

  /**
   * F · la PROPRIÉTÉ ARBITRAIRE porteuse d'une couleur littérale : `[background-color:#f5f5f4]`,
   * `[color:red]`, `[fill:#a85332]`, `[--pastille:#a85332]`, `hover:[color:red]`.
   *
   * ⚠ **Ce contrôle est né d'un refus, pas d'une prévoyance** — revue adverse de TCK-384, le
   * 2026-08-27. Le contrôle D exige un PRÉFIXE (`bg-[`, `text-[`, `shadow-[`) ; Tailwind v4
   * accepte une seconde syntaxe qui n'en a aucun, où la propriété CSS s'écrit DANS les crochets.
   * Douze formes ont été déposées une à une dans un fichier du périmètre gardé : **les douze
   * sortaient en 0.** Et elles compilent — vérifié avec le Tailwind 4.2.2 du projet :
   * `[background-color:#f5f5f4]` rend `.[background-color\:\#f5f5f4]{background-color:#f5f5f4}`.
   *
   * **Le cas qui fait le plus mal est `[fill:#a85332]`** : c'est très exactement ce que le
   * contrôle E venait d'être ajouté pour attraper, écrit en CLASSE au lieu d'un attribut. Deux
   * syntaxes frères, une seule gardée.
   *
   * ⚠ Ce n'est PAS le trou T1. Un style inline est un objet JS ; ceci est du TEXTE, attrapable
   * exactement comme D. *Un en-tête qui énumère ses trous et en oublie un fait croire à
   * l'exhaustivité — il est pire qu'un en-tête muet.*
   *
   * Ce qu'il ne refuse PAS, et qui est vérifié par `EPREUVE` : `supports-[display:grid]` (une
   * propriété sans couleur), `[&>svg]:size-3` (un sélecteur, sans `:` dans les crochets),
   * `max-w-[calc(100%-2rem)]`, `[--pastille:var(--chart-1)]` (une lecture de jeton),
   * `[transition:color_120ms_ease]` — et la raison de ce dernier n'est PAS celle qu'on croit :
   * `color` n'est pas dans {@link COULEURS_CSS}, parce que ce n'est pas une couleur nommée de
   * CSS. Ce n'est donc pas une frontière de mot qui le sauve, c'est la liste. La forme est dans
   * `EPREUVE` pour que ce résultat soit fixé plutôt que supposé.
   */
  const PROPRIETE = new RegExp(
    `\\[(?:--)?[a-zA-Z][a-zA-Z0-9-]*\\s*:[^\\]]*(?:${D_MOTIFS.join('|')})[^\\]]*\\]`,
    'gi',
  );

  return [
    ['A', 'échelle Tailwind brute (bg-stone-100, text-amber-700…)', ECHELLE],
    ['B', 'couleur nommée en dur (bg-white, text-black…)', NOMMEES],
    ['C', 'dialecte app-* (éteint par TCK-372)', APP_DIALECTE],
    ['D', 'couleur littérale en valeur arbitraire (bg-[#f5f5f4], bg-[rgb(…)], text-[red]…)', ARBITRAIRE],
    ['E', 'couleur littérale en attribut de présentation (fill="#a85332", stroke="red"…)', ATTRIBUT],
    ['F', 'couleur littérale en propriété arbitraire ([background-color:#f5f5f4], [color:red]…)', PROPRIETE],
  ];
}

const CONTROLES = construireControles();

/** Les contrôles de CLASSES seuls — ce que le fichier de jetons doit refuser, cf. `JETONS`. */
const CONTROLES_DE_CLASSE = new Set(['A', 'B', 'C']);


/**
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * L'AUTO-ÉPREUVE — elle tourne à CHAQUE exécution, avant la moindre lecture de fichier
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Le mode d'échec d'une garde à expressions régulières n'est pas de rougir à tort : c'est de
 * cesser de matcher. Un préfixe retiré de `PREFIXES`, une famille perdue, une parenthèse
 * déplacée dans le contrôle D — et la garde sort en 0 sur un dépôt qu'elle ne regarde plus.
 * *Un vert n'a de valeur que si un rouge reste possible*, et rien dans la sortie ne distingue
 * les deux.
 *
 * Le tableau ci-dessous est donc la garde de la garde : chaque forme y est marquée `true` (doit
 * être vue) ou `false` (doit être ignorée). Il n'est pas décoratif — **il est la liste exacte des
 * 20 mutations passées sur cette garde au 2026-08-27**, dont les six que sa version d'origine
 * laissait au vert (`bg-[#fff]`, `text-[#a85332]`, `bg-[rgb(…)]`, `border-[oklch(…)]`, plus
 * `bg-[red]` et une ombre à hexadécimal noyé). Les lignes `false` comptent autant que les
 * autres : une garde qui refuse `bg-[var(--jeton)]` ou `text-[13px]` devient une garde qu'on
 * contourne, et une garde qu'on contourne ne garde rien.
 *
 * Toute forme neuve essayée à la main VIENT ICI. C'est ce qui empêche la prochaine revue adverse
 * de redécouvrir un trou déjà trouvé une fois.
 */
const EPREUVE = [
  // A · l'échelle numérotée.
  ['bg-stone-100', true], ['hover:text-amber-700', true], ['ring-amber-500/30', true],
  ['dark:bg-stone-800', true], ['bg-teal-100', true], ['fill-rose-500', true],
  ['decoration-fuchsia-400', true], ['bg-lime-500', true],
  // B · les couleurs nommées sans échelle.
  ['bg-white', true], ['text-black', true], ['border-white/10', true], ['bg-white/80', true],
  // C · le dialecte éteint.
  ['bg-app-surface', true], ['text-app-ink', true],
  // D · la couleur littérale en valeur arbitraire — les six formes qui passaient au vert.
  ['bg-[#fff]', true], ['text-[#a85332]', true], ['bg-[rgb(255,0,0)]', true],
  ['border-[oklch(0.7_0.2_30)]', true], ['bg-[red]', true], ['shadow-[0_1px_2px_#0003]', true],
  ['bg-[color-mix(in_oklch,var(--primary)_50%,white)]', true],
  // `color-mix` — un CONTENEUR : ces quatre lignes tiennent la frontière, cf. le docblock de
  // D_MOTIFS. Elles viennent d'un faux positif réel, pas d'une prévoyance.
  ['bg-[color-mix(in_srgb,#fff_50%,transparent)]', true],
  ['bg-[color-mix(in_srgb,red_50%,blue)]', true],
  ['bg-[color-mix(in_srgb,rgb(1,2,3)_50%,transparent)]', true],
  ['bg-[color(display-p3_1_0_0)]', true],
  ['dark:hover:bg-[#1a1a1a]/70', true], ['decoration-[lightseagreen]', true],
  ['shadow-[0_0_40px_0_rgba(31,27,23,0.04)]', true],
  // Ce qui doit rester INVISIBLE — la moitié qu'on oublie de vérifier.
  ['bg-[color-mix(in_srgb,var(--chart-1)_50%,transparent)]', false],
  ['bg-[color-mix(in_srgb,var(--a)_50%,var(--b))]', false],
  ['bg-[var(--sidebar-accent)]', false], ['text-[13px]', false], ['w-[42ch]', false],
  ['shadow-[0_1px_2px_var(--ombre)]', false], ['bg-[url(/fond.svg)]', false],
  ['grid-cols-[repeat(3,minmax(0,1fr))]', false], ['bg-card', false], ['text-muted-foreground', false],
  ['bg-warning/10', false], ['ring-border', false], ['bg-primary-foreground', false],
  // Un nom de variable CSS qui CONTIENT une couleur nommée : `--linen` ne doit pas rougir.
  ['bg-[var(--linen)]', false], ['text-[var(--tan-fonce)]', false],
  // Une classe calculée ne compile pas : la garde n'a pas à la voir (trou déclaré, pas un défaut).
  ['bg-${famille}-200', false],

  // ────────────────────────────────────────────────────────────────────────────────────────────
  // TCK-381 — les formes essayées à la main sur CETTE version, et ce qu'elles ont donné.
  //
  // La consigne était d'inventer au moins cinq mutations et de dire lesquelles passent. Les voici,
  // TOUTES, y compris les deux qui passent — *une liste de mutations qui ne contient que les
  // attrapées ne dit rien du détecteur, elle dit ce que son auteur a bien voulu montrer.*
  // ────────────────────────────────────────────────────────────────────────────────────────────

  // M1 · l'échelle à QUATRE chiffres. Tailwind v4 n'en publie pas au-delà de 950, mais la borne
  //      `[0-9]{2,3}` du contrôle A s'arrête à trois : `bg-stone-1000` ne compile pas, donc le
  //      laisser passer n'est pas un trou. On le fige quand même, pour que le jour où quelqu'un
  //      élargit la borne, il sache que ce cas a été regardé.
  ['bg-stone-1000', false],

  // M2 · la MAJUSCULE — `BG-STONE-100`. Tailwind est sensible à la casse : cette classe n'existe
  //      pas, la laisser passer est correct.
  ['BG-STONE-100', false],

  // M3 · les préfixes de COULEUR qui n'étaient pas dans la liste. **Les six premières passaient
  //      au vert** sur la version de TCK-358 ; ce sont de vraies classes Tailwind v4, qui
  //      compilent et décident une couleur. `PREFIXES` a été élargi pour elles — cf. son docblock.
  //      Les deux dernières étaient DÉJÀ attrapées, le motif retrouvant `ring-` / `shadow-` après
  //      un tiret : le noter évite de « corriger » deux fois la même chose.
  ['border-t-stone-300', true], ['border-x-red-500', true], ['divide-x-stone-200', true],
  ['border-s-amber-200', true], ['border-b-white', true], ['ring-offset-stone-200', true],
  ['inset-ring-stone-300', true], ['text-shadow-stone-300', true],

  // M4 · le jeton d'état NEUF employé correctement — il ne doit surtout pas rougir, sinon la
  //      substitution de TCK-381 se ferait refuser par la garde qui l'exige.
  ['bg-success/15', false], ['text-info', false], ['border-warning/30', false],
  ['text-success-foreground', false], ['bg-info/10', false],

  // M5 · le jeton d'état écrit en VALEUR ARBITRAIRE — accepté, c'est une lecture de jeton.
  ['bg-[var(--success)]', false], ['text-[var(--info-foreground)]', false],

  // M6 · l'échelle brute cachée derrière DEUX variantes et une opacité, forme qu'une regex
  //      ancrée sur le début de classe raterait.
  ['md:dark:hover:bg-emerald-950/40', true],
  ['group-hover:supports-[backdrop-filter]:bg-sky-100', true],

  // M7 · la couleur littérale dans une valeur arbitraire de GRADIENT — le préfixe `from` est bien
  //      dans la liste, mais l'oublier était plausible.
  ['from-[#a85332]', true], ['to-[hsl(12_55%_43%)]', true],

  // M8 · une couleur nommée CSS collée à un séparateur `_` dans une ombre — le cas qui a motivé
  //      les bornes `[a-zA-Z0-9-]` du contrôle D plutôt que `\b`.
  ['shadow-[0_0_0_1px_darkseagreen]', true],

  // M9 · ⚠ MUTATION QUI PASSE — la couleur en STYLE INLINE. C'est le trou T1, déclaré en tête de
  //      fichier et non fermé : `style={{ backgroundColor: '#f5f5f4' }}` n'est pas une classe, et
  //      le voir demanderait d'analyser un objet JS. La ligne est ici pour que la prochaine revue
  //      adverse trouve le trou DÉJÀ ÉCRIT plutôt que de croire l'avoir découvert.
  ["style={{ backgroundColor: '#f5f5f4' }}", false], // ← MUTATION QUI PASSE (T1, déclaré)

  // ────────────────────────────────────────────────────────────────────────────────────────────
  // LE DÉSARMEMENT À UN GESTE — les 22 familles et les 27 préfixes, un par un
  //
  // ⚠ Ce bloc est le correctif du DÉFAUT D1 de la revue adverse de TCK-381 (2026-08-27), et il
  // faut lire ce que le défaut était pour comprendre pourquoi il tient cette forme.
  //
  // `EPREUVE` n'éprouvait que NEUF des vingt-deux familles (amber, emerald, fuchsia, lime, red,
  // rose, sky, stone, teal). MESURÉ par le vérificateur : retirer `'indigo'` de {@link FAMILLES}
  // — UN geste — pendant qu'un `bg-indigo-500` vivait dans un fichier gardé sortait la garde en
  // **0, avec un ✓**. Treize familles entières étaient dans ce cas. Le même trou, non trouvé par
  // la revue mais de la même espèce, portait sur QUINZE des vingt-sept préfixes : `stroke`,
  // `placeholder`, `outline`, `via`, `caret`, `accent`, `divide`, `divide-y`, `border-r`,
  // `border-l`, `border-y`, `border-e`… aucun n'était éprouvé.
  //
  // *C'est exactement le mode d'échec que le docblock d'`autoEpreuve` dit tenir* — « le mode
  // d'échec d'une garde à expressions régulières n'est pas de rougir à tort : c'est de cesser de
  // matcher ». Il le tenait pour les formes écrites à la main, et pour elles seules.
  //
  // ⚠⚠ **DÉRIVER ces formes de `FAMILLES` — le correctif que la revue indiquait — N'AURAIT RIEN
  // FERMÉ**, et c'est le point le plus important de ce bloc. Une forme dérivée disparaît AVEC
  // l'entrée qu'elle est censée éprouver : retirer `'indigo'` retirerait du même geste la branche
  // de la regex ET le cas de test. L'auto-épreuve resterait verte. *Une épreuve construite à
  // partir de ce qu'elle éprouve n'éprouve rien.*
  //
  // D'où DEUX mécanismes, et non un — la même paire que `PERIMETRES` / `resteNonGarde()` :
  //   1. les formes LITTÉRALES ci-dessous, une par famille et une par préfixe. Elles ne
  //      dépendent d'aucune liste : retirer une entrée les fait rougir en la NOMMANT ;
  //   2. {@link ablationDeConfiguration}, qui joue le mouvement inverse — une entrée AJOUTÉE à
  //      `FAMILLES` ou `PREFIXES` sans forme d'épreuve est refusée. Sans lui, cette liste
  //      redeviendrait incomplète au premier élargissement, et on aurait corrigé le trou une
  //      fois au lieu de le fermer.
  // ────────────────────────────────────────────────────────────────────────────────────────────

  // F · UNE FAMILLE, UNE FORME — les 22 de Tailwind v4. Les échelles sont VARIÉES à dessein :
  //     `[0-9]{2,3}` porte deux longueurs, et `EPREUVE` n'en éprouvait qu'une (cf. le docblock
  //     d'`ECHELLE`). Les formes à DEUX chiffres ci-dessous sont ce qui rend l'amputation de la
  //     borne en `[0-9]{3}` immédiatement rouge, au lieu de la laisser à une protection
  //     incidente du cliquet de `/app` — protection qui disparaîtra le jour où TCK-384 ramène ce
  //     reste à zéro.
  ['bg-slate-50', true], ['text-gray-400', true], ['border-zinc-700', true],
  ['bg-neutral-900', true], ['bg-stone-50', true],
  ['text-red-600', true], ['bg-orange-500', true], ['ring-amber-200', true],
  ['text-yellow-300', true], ['bg-lime-50', true], ['bg-green-50', true],
  ['border-emerald-200', true], ['bg-teal-950', true],
  ['text-cyan-700', true], ['bg-sky-100', true], ['bg-blue-600', true],
  ['bg-indigo-500', true], ['accent-violet-500', true], ['bg-purple-200', true],
  ['text-fuchsia-500', true], ['text-pink-600', true], ['bg-rose-50', true],

  // G · UN PRÉFIXE, UNE FORME — les 27 de {@link PREFIXES}. Ceux que les blocs A/B/D
  //     éprouvaient déjà ne sont pas répétés ; ceux-ci sont les quinze qui manquaient.
  //     `outline-white` n'est pas un exemple inventé : c'est la classe RÉELLE d'`AppTopbar`,
  //     posée par la revue adverse de TCK-371 sur un contraste mesuré.
  ['stroke-emerald-500', true], ['placeholder-stone-400', true], ['outline-white', true],
  ['via-stone-200', true], ['caret-red-500', true], ['divide-stone-200', true],
  ['divide-y-stone-200', true], ['border-r-white', true], ['border-l-stone-300', true],
  ['border-y-amber-200', true], ['border-e-stone-300', true],

  // H · LE CONTRÔLE E — la couleur en ATTRIBUT DE PRÉSENTATION.
  //     La première ligne est la mutation N1 de la revue adverse de TCK-381, passée au vert sur
  //     la version d'alors dans `components/leases/LeaseDetail.tsx`, un fichier GARDÉ.
  ['<rect fill="#a85332" stroke="#f5f5f4" />', true],
  ['stroke="lightseagreen"', true], ['stopColor="rgb(1,2,3)"', true],
  ['color="rebeccapurple"', true], ['bgcolor="#ffffff"', true],
  ['floodColor="#000"', true], ['lightingColor="oklch(0.7_0.2_30)"', true],
  ["fill='#fff'", true],
  // ⚠ La variante à trait d'union n'a PAS d'entrée dans `ATTRIBUTS_DE_PEINTURE` : elle est
  //   couverte par `color` seul, le `\b` coupant après le trait d'union. La forme est ici pour
  //   fixer ce résultat — cf. le docblock d'`ATTRIBUTS_DE_PEINTURE`.
  ['flood-color="darkseagreen"', true],
  // Ce que le contrôle E doit IGNORER — la moitié qui décide si la garde sera contournée.
  ['fill="none"', false], ['fill="currentColor"', false], ['stroke="transparent"', false],
  ['fill="url(#degrade-lin)"', false],
  // ⚠ Un identifiant de dégradé fait de caractères hexadécimaux ressemble à une couleur : c'est
  //   le faux positif que le `(?!url\()` du contrôle E existe pour éviter.
  ['fill="url(#f00ba7)"', false],
  ['stroke="var(--chart-1)"', false], ['fill="var(--linen)"', false],
  // MUTATION QUI PASSE — l'expression JSX. C'est le trou T1 sous un autre habit : `{…}` n'est
  // pas du texte, c'est un objet JS. Écrit ici plutôt que redécouvert.
  ['fill={couleurDuSecteur}', false], // ← MUTATION QUI PASSE (T1, déclaré)
  ["fill={'#a85332'}", false],        // ← MUTATION QUI PASSE (T1, déclaré)

  // ────────────────────────────────────────────────────────────────────────────────────────────
  // TCK-384 / TCK-385 — les formes essayées à la main sur CETTE version. Aucune n'a passé.
  //
  // ⚠ Le bloc de TCK-381 ci-dessus éprouvait `FAMILLES` entrée par entrée et `PREFIXES` entrée
  // par entrée. Il ne faisait PAS le même travail sur la troisième liste du contrôle D — les sept
  // FONCTIONS de couleur de `D_MOTIFS`. Trois seulement étaient éprouvées (`rgb`, `oklch`, `hsl`,
  // plus `color(`) ; **`rgba`, `hsla`, `hwb`, `lab`, `lch` et `oklab` ne l'étaient pas**, alors
  // que ce sont six branches d'une alternance qu'un `|` déplacé éteint d'un coup. C'est le même
  // mode d'échec que le défaut D1, une liste plus loin.
  // ────────────────────────────────────────────────────────────────────────────────────────────

  // I · UNE FONCTION DE COULEUR, UNE FORME — les six branches de `D_MOTIFS` qui n'en avaient pas.
  ['bg-[hsla(200,50%,50%,0.4)]', true], ['stroke-[hwb(90_10%_10%)]', true],
  ['bg-[lab(50%_40_59.5)]', true], ['text-[lch(50%_60_30)]', true],
  ['border-[oklab(0.4_0.2_-0.1)]', true], ['shadow-[0_0_0_2px_rgba(0,0,0,.2)]', true],

  // J · l'hexadécimal à TROIS chiffres dans un gradient, et la couleur nommée la plus longue de
  //     CSS noyée dans un `color-mix` — les deux formes les plus proches d'un faux négatif du
  //     contrôle D, l'une par sa brièveté, l'autre par le conteneur qui l'enveloppe.
  ['to-[#0f0]', true], ['bg-[color-mix(in_srgb,rebeccapurple_50%,transparent)]', true],

  // ────────────────────────────────────────────────────────────────────────────────────────────
  // L · LA PROPRIÉTÉ ARBITRAIRE — le contrôle F, né du REFUS de TCK-384 par la revue adverse.
  //
  // ⚠ Les quatorze premières SORTAIENT TOUTES EN 0 avant le 2026-08-27, dans un fichier du
  // périmètre gardé, et elles compilent : Tailwind v4 accepte une syntaxe où la propriété CSS
  // s'écrit DANS les crochets, sans préfixe — celui que le contrôle D exige. Vérifié avec le
  // Tailwind 4.2.2 du projet : `[background-color:#f5f5f4]` rend une vraie règle.
  //
  // `[fill:#a85332]` est le cas qui fait le plus mal : c'est exactement ce que le contrôle E
  // venait d'être ajouté pour attraper, écrit en classe plutôt qu'en attribut.
  // ────────────────────────────────────────────────────────────────────────────────────────────
  ['[background-color:#f5f5f4]', true], ['[color:red]', true],
  ['[border-color:oklch(0.7_0.2_30)]', true], ['[box-shadow:0_0_0_1px_#a85332]', true],
  ['[background:linear-gradient(#000,#fff)]', true], ['[fill:#a85332]', true],
  ['[--pastille:#a85332]', true], ['hover:[color:red]', true],
  ['dark:[background-color:#000]', true], ['[stroke:rebeccapurple]', true],
  ['[outline-color:#fff]', true], ['[caret-color:hsl(12_55%_43%)]', true],
  ['[accent-color:rgb(1,2,3)]', true], ['md:[--voile:#0003]', true],

  // …et la moitié qui décide si le contrôle F sera contourné : une propriété arbitraire SANS
  // couleur, un sélecteur entre crochets, une lecture de jeton, une référence de dégradé.
  ['supports-[display:grid]', false], ['[&>svg]:size-3', false], ['[&_a]:underline', false],
  ['max-w-[calc(100%-2rem)]', false], ['grid-cols-[repeat(3,minmax(0,1fr))]', false],
  ['[--pastille:var(--chart-1)]', false], ['[grid-template-columns:1fr_auto]', false],
  ['data-[state=open]:bg-muted', false], ['[font-feature-settings:"tnum"]', false],
  // ⚠ `color` n'est pas une couleur NOMMÉE de CSS — il n'est pas dans `COULEURS_CSS`. Ce n'est
  //   donc pas une frontière de mot qui sauve cette forme, c'est la liste. Fixé ici plutôt que
  //   supposé.
  ['[transition:color_120ms_ease]', false],
  // ⚠ `url(#degrade-lin)` est une RÉFÉRENCE, pas une couleur — et un identifiant hexadécimal
  //   (`url(#f00ba7)`) lui ressemble à s'y méprendre. C'est le regard arrière `(?<!url\()` du
  //   premier motif de `D_MOTIFS` qui les sauve, et il sert D, E et F d'un coup.
  ['[background:url(#degrade-lin)]', false], ['[background-image:url(/fond.svg)]', false],
  ['bg-[url(#f00ba7)]', false],

  // ────────────────────────────────────────────────────────────────────────────────────────────
  // M · LA CASSE — cinq formes, parce qu'une seule aurait menti sur l'étendue du trou.
  //
  // ⚠ Revue adverse de la passe 2 : `bg-[RED]`, `bg-[RGB(1,2,3)]`, `[Color:Red]` et
  // `FILL="#A85332"` traversaient D, E et F. Une majuscule suffisait à contourner le contrôle qui
  // venait d'être ajouté pour fermer un trou.
  //
  // ⚠⚠ **Le motif HEXADÉCIMAL n'a jamais eu ce défaut** — sa classe `[0-9a-fA-F]` porte déjà les
  // deux casses. C'est pourquoi l'exemple donné par la revue, `[BACKGROUND-COLOR:#F5F5F4]`, était
  // en réalité DÉJÀ attrapé : le refus était juste, l'illustration ne l'était pas. Les trous
  // étaient ailleurs, et il y en avait TROIS — la liste des couleurs NOMMÉES, l'alternance des
  // FONCTIONS de couleur, et celle des ATTRIBUTS de peinture. D'où cinq formes : une par surface,
  // plus un mélange. *Une seule forme d'épreuve aurait prouvé le drapeau, pas la portée.*
  // ────────────────────────────────────────────────────────────────────────────────────────────
  ['bg-[RED]', true],                          // la couleur NOMMÉE
  ['bg-[RGB(1,2,3)]', true],                   // la FONCTION de couleur
  ['FILL="#A85332"', true],                    // l'ATTRIBUT de peinture
  ['bg-[#F5F5F4]', true],                      // l'hexadécimal — déjà couvert, figé ici
  ['[BoX-ShAdOw:0_0_0_1px_#A85332]', true],    // le mélange, en propriété arbitraire
  ['STROKE="RebeccaPurple"', true], ['[--Pastille:#A85332]', true],
  // ⚠ …et la moitié qui empêche le drapeau `i` de déborder : un NOM D'UTILITAIRE Tailwind est
  //   sensible à la casse, `BG-STONE-100` n'existe pas et ne compile pas. A, B et C n'ont donc
  //   PAS ce drapeau, et cette ligne est ce qui le prouve — elle vit déjà plus haut sous M2, elle
  //   est rappelée ici parce que c'est la contrainte que le correctif de casse aurait pu casser.
  ['BG-CARD', false], ['TEXT-MUTED-FOREGROUND', false],

  // ────────────────────────────────────────────────────────────────────────────────────────────
  // N · LA COULEUR RELATIVE — `rgb(from …)`, une LECTURE de jeton, donc acceptée.
  //
  // ⚠ Elle était REFUSÉE, alors que le docblock du contrôle D promet qu'une lecture de jeton est
  // acceptée : la garde refusait la meilleure façon de dériver une couleur d'un jeton. *Une garde
  // qui refuse la bonne façon de faire pousse à contourner la garde* — et la sortie de secours la
  // moins chère devant ce refus-là aurait été de réinjecter un hexadécimal, précisément ce que le
  // contrôle D existe pour empêcher. Même raisonnement, mot pour mot, que l'exemption de
  // `color-mix` : le conteneur ne décide aucune couleur, il en lit une.
  // ────────────────────────────────────────────────────────────────────────────────────────────
  ['bg-[rgb(from_var(--primary)_r_g_b_/_50%)]', false],
  ['bg-[oklch(from_var(--chart-1)_l_c_h_/_0.5)]', false],
  ['[background-color:rgb(from_var(--x)_r_g_b)]', false],
  ['fill="rgb(from var(--chart-1) r g b)"', false],
  ['bg-[RGB(FROM_var(--x)_r_g_b)]', false],    // …et sous le drapeau `i`, sans quoi N défait M
  // ⚠ Ce qui doit RESTER refusé : un `from` qui n'ouvre pas une couleur relative.
  ['bg-[rgb(1,2,3)]', true], ['bg-[color(display-p3_1_0_0)]', true],

  // ────────────────────────────────────────────────────────────────────────────────────────────
  // P · LES CANAUX ABSOLUS — la porte que l'exemption N ouvrait, et LES DEUX CÔTÉS.
  //
  // ⚠ Les positives seules ne suffiraient PAS ici, et c'est le point. La branche de rattrapage se
  // referme sur l'exemption qu'elle corrige : une expression un peu trop large refuserait AUSSI
  // les relatives légitimes, et le bloc N ci-dessus cesserait de tenir sans que rien ne bronche —
  // la garde sortirait en 1 sur du code correct, ce qui est la façon dont une garde se fait
  // désarmer. Les négatives sont donc rappelées ICI, à côté des positives qu'elles bornent, et
  // pas seulement vingt lignes plus haut.
  // ────────────────────────────────────────────────────────────────────────────────────────────
  ['bg-[rgb(from_var(--x)_255_0_0)]', true],
  ['bg-[oklch(from_var(--x)_0.5_0.2_30)]', true],
  ['bg-[hsl(from_var(--x)_120_50%_50%)]', true],
  ['bg-[lab(from_var(--x)_50_40_59)]', true],
  ['[color:rgb(from_var(--x)_255_0_0)]', true],
  ['fill="rgb(from var(--x) 255 0 0)"', true],
  ['bg-[RGB(FROM_var(--X)_255_0_0)]', true],      // …et sous le drapeau `i`
  ['bg-[rgb(from_var(--x)_255_0_0_/_0.5)]', true],
  // L'AUTRE CÔTÉ — les relatives qui GARDENT le jeton doivent rester acceptées, `calc()` compris.
  ['bg-[oklch(from_var(--x)_calc(l_*_0.8)_c_h)]', false],
  ['bg-[rgb(from_var(--x)_r_g_b_/_calc(alpha_*_0.5))]', false],
  // …et celles dont la SOURCE n'est pas un jeton étaient déjà refusées, par les branches 1 et 3 :
  // l'exemption n'a jamais porté que sur le nom de fonction. Défense en profondeur, figée ici.
  ['bg-[rgb(from_#a85332_r_g_b)]', true], ['bg-[rgb(from_rebeccapurple_r_g_b)]', true],
  ['bg-[rgb(fromage_1_2_3)]', true],

  // ────────────────────────────────────────────────────────────────────────────────────────────
  // R · LES LETTRES QUI NE NOMMENT RIEN — la correction du partage, passe 4.
  //
  // ⚠ Le bloc P ci-dessus a été posé avec un critère FAUX : « une lettre dans les canaux ». Ces
  // neuf formes JETTENT le jeton et contiennent une lettre — elles passaient toutes. La famille
  // `color(from …)` était hors d'atteinte PAR CONSTRUCTION : elle porte toujours un espace
  // colorimétrique, donc toujours une lettre.
  // ────────────────────────────────────────────────────────────────────────────────────────────
  ['bg-[color(from_var(--x)_srgb_1_0_0)]', true],              // un espace colorimétrique
  ['bg-[color(from_var(--x)_display-p3_1_0_0)]', true],
  ['[color:color(from_var(--x)_display-p3_1_0_0)]', true],
  ['bg-[hsl(from_var(--x)_120deg_50%_50%)]', true],            // une unité
  ['fill="hsl(from var(--x) 120deg 50% 50%)"', true],
  ['bg-[rgb(from_var(--x)_255_none_none)]', true],             // un mot-clé
  ['bg-[rgb(from_var(--x)_2.55e2_0_0)]', true],                // une notation scientifique
  ['bg-[rgb(from_var(--x)_calc(255)_0_0)]', true],             // un calc() de CONSTANTES
  ['bg-[oklch(from_var(--x)_calc(0.5)_0.2_30)]', true],
  //
  // …et l'AUTRE CÔTÉ, qui compte autant : `calc(l * 0.8)` GARDE le jeton et doit rester verte
  // alors que `calc(255)` le jette. La même fonction des deux côtés du partage — c'est ce qui
  // interdit un critère portant sur la forme de l'expression.
  ['bg-[color(from_var(--x)_srgb_r_g_b)]', false],
  ['bg-[hsl(from_var(--x)_h_50%_50%)]', false],
  ['bg-[rgb(from_var(--x)_r_g_b)]', false],
  ['bg-[RGB(FROM_var(--x)_r_g_b)]', false],
  //
  // ⚠ LES TROIS QUI ONT IMPOSÉ LE BALAYAGE IMBRIQUÉ. Un `calc()` de constantes SUIVI d'une
  // composante nommée garde le jeton. Un balayage qui s'arrête au premier `)` ne voit jamais ce
  // qui suit le `calc` et les refuse — trouvées en éprouvant la forme proposée avant de l'adopter.
  ['bg-[rgb(from_var(--x)_calc(255)_g_b)]', false],
  ['bg-[oklch(from_var(--x)_calc(0.5)_c_h)]', false],
  ['bg-[rgb(from_var(--x)_calc(2_*_100)_g_b)]', false],

  // ────────────────────────────────────────────────────────────────────────────────────────────
  // S · T11, DÉCLARÉ — les huit formes figées AVEC LEUR VERDICT RÉEL, pas avec le juste.
  //
  // ⚠ Le verdict écrit ici est CELUI QUE LA GARDE REND, et il est FAUX pour six d'entre elles.
  // C'est la forme que ce fichier emploie déjà pour T1 (le style inline) : un trou déclaré se
  // fige avec ce qu'il produit, pas avec ce qu'on voudrait. Deux effets, et les deux comptent —
  // ces formes ne peuvent plus être « redécouvertes » comme un défaut neuf, et le jour où
  // quelqu'un ferme T11, leur verdict bascule : **la fermeture se voit en diff.**
  //
  // Le mécanisme unique est en tête de fichier (T11) : un groupe de parenthèses est ATOMIQUE
  // pour le balayage. Profondeur 1 tout enveloppé → faux positif ; profondeur 2 → branche inerte
  // → faux négatif.
  // ────────────────────────────────────────────────────────────────────────────────────────────
  //
  // FAUX POSITIFS — elles GARDENT le jeton et sont pourtant refusées (profondeur 1, tout enveloppé).
  ['bg-[oklch(from_var(--x)_calc(l_*_0.8)_calc(c_*_1.1)_calc(h))]', true],  // ← FAUX POSITIF (T11)
  ['bg-[rgb(from_var(--x)_calc(r_*_2)_calc(g_*_2)_calc(b_*_2))]', true],    // ← FAUX POSITIF (T11)
  // …et le témoin qui borne le faux positif : UN SEUL canal nu suffit à revenir dans le vrai.
  ['bg-[oklch(from_var(--x)_calc(l_+_0.1)_c_h)]', false],
  //
  // FAUX NÉGATIFS — elles JETTENT le jeton et passent (profondeur 2, la branche est inerte).
  ['bg-[rgb(from_var(--x)_calc(calc(255))_0_0)]', false],                   // ← PASSE (T11, déclaré)
  ['bg-[oklch(from_var(--x)_clamp(0,_calc(0.5),_1)_0.2_30)]', false],       // ← PASSE (T11, déclaré)
  ['bg-[rgb(from_var(--x)_min(255,_max(0,_255))_0_0)]', false],             // ← PASSE (T11, déclaré)
  ['bg-[rgb(from_var(--x)_calc(calc(1))_calc(calc(2))_calc(calc(3)))]', false], // ← PASSE (T11)
  //
  // ⚠ DEUX FORMES VERTES POUR LA MAUVAISE RAISON. À profondeur 2, une forme qui GARDE le jeton
  // est épargnée non parce qu'un nom a été vu, mais parce que la branche ne tire plus du tout.
  //
  // ⚠⚠ **Elles DOCUMENTENT le mécanisme ; elles ne GARDENT rien, et ce fichier a prétendu le
  // contraire pendant une passe.** J'avais écrit « sans elles, on refermerait le trou en les
  // cassant sans le savoir ». Faux, et la revue adverse l'a montré en JOUANT la fermeture sur
  // chacune des neuf formes plutôt qu'en lisant leur justification : leurs canaux `c h` et `g b`
  // sont NUS, donc un balayage à deux niveaux les épargne toujours. Elles ne basculent pas.
  ['bg-[oklch(from_var(--x)_clamp(0,_calc(l),_1)_c_h)]', false],
  ['bg-[rgb(from_var(--x)_min(255,_max(0,_r))_g_b)]', false],
  //
  // ⚠ LA FORME QUI, ELLE, GARDE VRAIMENT LA FERMETURE — au CROISEMENT des deux mécanismes :
  // elle GARDE le jeton, elle est à profondeur 2, et TOUS ses canaux sont enveloppés. Aujourd'hui
  // elle passe parce que la branche est inerte ; sous un balayage à deux niveaux elle devient un
  // **NOUVEAU faux positif**, que rien d'autre ici ne signalerait.
  //
  // *La fermeture ne laisserait donc pas un faux positif : elle en CRÉERAIT un.* C'est la
  // troisième mesure qui dit de ne pas itérer, et la plus dure des trois.
  ['bg-[oklch(from_var(--x)_clamp(0,_calc(l),_1)_clamp(0,_calc(c),_1)_clamp(0,_calc(h),_1))]', false],

  // ⚠ LES RELATIVES MIXTES — la frontière exacte, trouvée en écrivant le risque résiduel plutôt
  //   qu'en le supposant. Une relative dont UN SEUL canal réfère au jeton le garde, et doit
  //   passer : le partage est « une lettre quelque part », pas « aucun littéral nulle part ».
  //   Sans ces quatre-là, resserrer la branche en « contient un chiffre » casserait des formes
  //   correctes sans qu'`EPREUVE` bronche — et c'est exactement le mouvement qu'on fait quand on
  //   veut « durcir » une garde.
  ['bg-[rgb(from_var(--x)_255_0_0_/_alpha)]', false],
  ['bg-[oklch(from_var(--x)_0.5_0.2_h)]', false],
  ['bg-[rgb(from_var(--x)_r_0_0)]', false],
  ['bg-[oklch(from_var(--x)_l_0.2_30)]', false],

  // Q · L'INDICE DE TYPE de Tailwind — forme de la revue adverse, que personne n'avait essayée.
  //     `text-[color:…]` désambiguë une couleur d'une taille de police : elle mêle la syntaxe
  //     PRÉFIXÉE et le `propriété:valeur`, donc D et F la voient tous les deux.
  ['text-[color:RED]', true], ['text-[color:#fff]', true], ['text-[length:14px]', false],

  // O · L'URL GUILLEMETÉE — le regard arrière élargi (mineur de la passe 2).
  ['bg-[url("#f00ba7")]', false], ["bg-[url('#f00ba7')]", false], ['bg-[url(_#f00ba7)]', false],
  ['[background:url("#f00ba7")]', false],

  // K · LE JETON DE VOILE, créé par TCK-384 — il ne doit PAS rougir, sinon la substitution que la
  //     garde exige se ferait refuser par elle. Même rôle que le bloc M4 pour TCK-381.
  ['bg-scrim/10', false], ['bg-scrim/30', false],
  // …et l'ombre ambiante qui LIT `--foreground` au lieu de réécrire son hexadécimal. C'est la
  // forme d'arrivée des deux `shadow-[…rgba(…)]` que le contrôle D comptait.
  ['shadow-[0_0_40px_0_color-mix(in_srgb,var(--foreground)_4%,transparent)]', false],
];

function autoEpreuve() {
  const echecs = [];
  for (const [forme, attendu] of EPREUVE) {
    const vu = CONTROLES.some(([, , motif]) => { motif.lastIndex = 0; return motif.test(forme); });
    if (vu !== attendu) echecs.push([forme, attendu, vu]);
  }
  if (echecs.length === 0) return;
  console.error(
    '✗ AUTO-ÉPREUVE EN ÉCHEC — les contrôles de cette garde ne font plus ce qu\'ils disent.\n',
  );
  console.error('  La garde ne mesure RIEN tant que ceci n\'est pas corrigé ; un vert de sa part');
  console.error('  serait un vert de détecteur cassé, pas un vert de dépôt propre.\n');
  for (const [forme, attendu, vu] of echecs) {
    console.error(`      ${forme}  —  attendu ${attendu ? 'ATTRAPÉ' : 'IGNORÉ'}, obtenu ${vu ? 'attrapé' : 'ignoré'}`);
  }
  process.exit(1);
}

/**
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * L'ABLATION DE CONFIGURATION — l'autre moitié, et celle qui survit à l'élargissement
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * {@link autoEpreuve} vérifie que chaque FORME écrite est vue comme il faut. Elle ne dit rien
 * d'une ENTRÉE de configuration qu'aucune forme n'éprouve : c'est ce trou-là qui a laissé treize
 * familles et quinze préfixes désarmables d'un seul geste jusqu'au 2026-08-27 (défaut D1).
 *
 * Cette fonction-ci pose la question inverse, et elle la pose par ABLATION plutôt que par
 * lecture : pour chaque entrée de `FAMILLES` et de `PREFIXES`, elle **reconstruit les cinq
 * contrôles sans elle** et exige qu'au moins une forme d'`EPREUVE` attendue ATTRAPÉE cesse de
 * l'être. Si rien ne bouge, l'entrée ne porte rien : la retirer serait un désarmement silencieux,
 * et la garde le dit maintenant au lieu de sortir en 0.
 *
 * *C'est la même règle que le dépôt applique à ses tests* — un test vert ne prouve rien s'il
 * serait vert sans le correctif. Une entrée de configuration ne prouve rien si la retirer ne
 * change rien.
 *
 * ⚠ Elle ne s'applique PAS à {@link COULEURS_CSS} : 148 entrées demanderaient 148 formes
 * d'épreuve pour une liste qui ne bouge que si la spécification CSS bouge. Ce qui la garde est
 * son COMPTE, bilatéral, ci-dessous — et le résiduel est déclaré (T7).
 */
const COULEURS_ATTENDUES = 148; // CSS Color 4, recompté le 2026-08-27

function ablationDeConfiguration() {
  const vuPar = (controles, forme) => controles.some(([, , motif]) => {
    motif.lastIndex = 0;
    return motif.test(forme);
  });
  // Seules les formes ACTUELLEMENT attrapées peuvent servir de sonde : une forme attendue
  // ignorée ne cesse jamais d'être vue, elle ne l'a jamais été.
  const sondes = EPREUVE.filter(([forme, attendu]) => attendu && vuPar(CONTROLES, forme))
    .map(([forme]) => forme);

  const orphelines = [];
  for (const famille of FAMILLES) {
    const sans = construireControles({ familles: FAMILLES.filter((f) => f !== famille) });
    if (!sondes.some((forme) => !vuPar(sans, forme))) orphelines.push(`FAMILLES · ${famille}`);
  }
  for (const prefixe of PREFIXES) {
    const sans = construireControles({ prefixes: PREFIXES.filter((p) => p !== prefixe) });
    if (!sondes.some((forme) => !vuPar(sans, forme))) orphelines.push(`PREFIXES · ${prefixe}`);
  }
  for (const attribut of ATTRIBUTS_DE_PEINTURE) {
    const sans = construireControles({
      attributs: ATTRIBUTS_DE_PEINTURE.filter((a) => a !== attribut),
    });
    if (!sondes.some((forme) => !vuPar(sans, forme))) {
      orphelines.push(`ATTRIBUTS_DE_PEINTURE · ${attribut}`);
    }
  }

  if (COULEURS_CSS.length !== COULEURS_ATTENDUES) {
    console.error(
      `✗ AUTO-ÉPREUVE — \`COULEURS_CSS\` porte ${COULEURS_CSS.length} noms, contre `
      + `${COULEURS_ATTENDUES} au relevé du 2026-08-27 (CSS Color 4).`,
    );
    console.error('');
    console.error('  Le contrôle D lit cette liste : l\'amputer éteint le motif `text-[gold]` en');
    console.error('  silence. Le compte est BILATÉRAL — si la spécification CSS a réellement');
    console.error('  changé, corriger `COULEURS_ATTENDUES` avec sa date, jamais l\'inverse.');
    process.exit(1);
  }

  if (orphelines.length === 0) return;
  console.error('✗ AUTO-ÉPREUVE — des entrées de configuration n\'éprouvent RIEN.\n');
  console.error('  Pour chacune, les contrôles ont été reconstruits SANS elle et aucune forme');
  console.error('  d\'`EPREUVE` n\'a cessé d\'être vue. La retirer sortirait donc la garde en 0,');
  console.error('  sans un mot, sur un pan entier du vocabulaire — c\'est le défaut D1, mesuré');
  console.error('  par la revue adverse de TCK-381 sur treize familles et quinze préfixes.\n');
  for (const o of orphelines) console.error(`      ${o}`);
  console.error('');
  console.error('  Correctif : AJOUTER une forme littérale à `EPREUVE` pour chacune — par exemple');
  console.error('  une classe qui l\'emploie. Ne PAS la dériver de la liste : une forme dérivée');
  console.error('  disparaît avec l\'entrée qu\'elle est censée éprouver, et n\'éprouve donc rien.');
  process.exit(1);
}

autoEpreuve();
ablationDeConfiguration();

const EXTENSIONS = /\.(tsx?|jsx?|mjs|cjs|css|mdx?)$/;

/**
 * L'ÉPREUVE DE `EXTENSIONS` — le même mode d'échec que les contrôles, sur le PARCOURS.
 *
 * Mesuré le 2026-08-27 : en retirer `css` sortait la garde en 0, sans un mot. Le coût est nul
 * aujourd'hui — il n'existe aucune feuille `.css` DANS un périmètre gardé — et c'est exactement
 * ce qui rend la mutation invisible : elle ne devient chère que le jour où quelqu'un dépose une
 * feuille dans `components/`, et ce jour-là la garde ne la lira pas, en restant verte.
 *
 * *Une garde qui ne coûte rien à désarmer aujourd'hui se désarme aujourd'hui et se paie plus
 * tard.* Les lignes `false` comptent autant : `.svg` doit rester DEHORS (trou T8, déclaré et
 * raisonné) — l'y faire entrer par distraction ferait rougir la garde sur des logos de marque.
 */
{
  const attendus = [
    ['Page.tsx', true], ['labels.ts', true], ['barrel.jsx', true], ['outil.js', true],
    ['garde.mjs', true], ['config.cjs', true], ['globals.css', true], ['note.md', true],
    ['note.mdx', true],
    ['logo.svg', false], ['photo.png', false], ['police.woff2', false], ['data.json', false],
  ];
  const rates = attendus.filter(([nom, attendu]) => EXTENSIONS.test(nom) !== attendu);
  if (rates.length > 0) {
    console.error('✗ AUTO-ÉPREUVE — `EXTENSIONS` ne parcourt plus ce qu\'elle dit.\n');
    console.error('  Une extension perdue vide le parcours d\'un pan entier, en silence : la garde');
    console.error('  sort en 0 sur des fichiers qu\'elle n\'a pas ouverts.\n');
    for (const [nom, attendu] of rates) {
      console.error(`      ${nom}  —  attendu ${attendu ? 'PARCOURU' : 'IGNORÉ'}, obtenu ${attendu ? 'ignoré' : 'parcouru'}`);
    }
    process.exit(1);
  }
}

function fichiersDe(dir, acc = []) {
  for (const entree of readdirSync(dir)) {
    const chemin = join(dir, entree);
    if (statSync(chemin).isDirectory()) {
      if (entree === 'node_modules') continue;
      fichiersDe(chemin, acc);
      continue;
    }
    if (EXTENSIONS.test(entree)) acc.push(chemin);
  }
  return acc;
}

/**
 * LE CLIQUET DU RESTE — mesuré le 2026-08-27, après TCK-358.
 *
 * Ce sont des défauts de couleur RÉELLEMENT RENDUS par la console, dans des fichiers que le
 * périmètre gardé ne couvre pas parce qu'ils sont partagés avec tout le produit :
 * `ui/toast.tsx`, `ui/sheet.tsx`, `ui/dropdown-menu.tsx`, `ui/dialog.tsx`, `ui/warning-banner.tsx`,
 * `forms/FormError.tsx`, `forms/FormSuccess.tsx`, `files/PdfViewer.tsx`, `layout/UserMenu.tsx`,
 * `shared/LanguageSwitcher.tsx`.
 *
 * ⚠ Ce plafond valait 54 le 2026-08-27 au matin. Il est à 46 le même jour : les HUIT occurrences
 * de `console/` et `feedback/` n'étaient pas du rendu mais des DOCBLOCKS, et les réécrire en
 * toutes lettres a fait passer ces deux répertoires du reste au périmètre gardé. *Un chiffre qui
 * descend doit dire par quoi, sinon la prochaine baisse ressemblera à une érosion.*
 *
 * Ces deux répertoires sont donc comptés dans le PÉRIMÈTRE GARDÉ et nulle part ailleurs : un
 * fichier ne peut pas être dans les deux à la fois, `resteNonGarde()` retirant le périmètre de la
 * clôture avant de compter. Les 46 restants sont bien du rendu.
 *
 * **Les porter demande de redessiner des primitives montées par les pages publiques et par
 * `/app` : c'est TCK-384, et le faire ici l'aurait fait sans revue de ces écrans-là.**
 *
 * Le nombre ci-dessous n'est PAS un objectif ni une tolérance : c'est un plafond. La garde
 * échoue s'il monte — donc un nouveau `bg-emerald-50` déposé dans `ui/` est refusé même si aucun
 * périmètre gardé ne le contient. Quand TCK-384 le fait descendre, la ligne se corrige à la main
 * avec sa date, et cette phrase-ci reste.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * ⚠ **BILATÉRAL DEPUIS LE 2026-08-27 — et c'est la révocation d'une décision écrite ici même.**
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Ce cliquet-ci était unilatéral : il refusait une HAUSSE du reste, pas un desserrage du
 * plafond. La revue adverse de TCK-381 l'a mesuré (défaut D2) : `const RESTE_PLAFOND = 200;` —
 * **UN seul geste** — sortait la garde en 0, et elle **imprimait elle-même** « RESTE NON GARDÉ :
 * 46 défaut(s) (cliquet 200) ». La récidive de palette sur la moitié super-admin du produit
 * devenait libre jusqu'à 200 occurrences, en annonçant le trou dans sa propre sortie de succès.
 *
 * L'asymétrie était justifiée ainsi : *« son chiffre appartient à TCK-358, et le rendre bilatéral
 * ferait rougir la CI d'un autre chantier pour une amélioration. »* **Cette raison ne tient
 * pas**, pour deux motifs mesurés :
 *
 *   1. Elle protège contre une DESCENTE. Le désarmement, lui, est une HAUSSE du plafond — que
 *      rien ne regardait. Le raisonnement répondait à l'autre moitié de la question.
 *   2. Le cliquet de `/app` est bilatéral et appartient tout autant à un chantier (TCK-381).
 *      Le rouge qu'on redoutait ici est exactement celui que l'autre a choisi : *un cliquet qui
 *      ne descend pas est une tolérance*, et corriger un chiffre à la baisse avec sa date est le
 *      seul moment où quelqu'un relit ce que la garde couvre.
 *
 * Aucune marge n'est tolérée, délibérément. Une marge — « refuser `plafond > reste + 12` » —
 * laisserait passer le desserrage d'un cran, c'est-à-dire le geste discret plutôt que le geste
 * voyant : *un cliquet à marge attrape la manœuvre grossière et laisse la manœuvre patiente.*
 * Répartition mesurée le 2026-08-27, qui donne l'ordre de grandeur du rouge attendu quand
 * TCK-384 avancera : `ui/toast` 12 · `files/PdfViewer` 11 · `ui/sheet` 4 · `layout/UserMenu` 4 ·
 * `ui/warning-banner` 3 · `ui/dropdown-menu` 3 · `forms/FormSuccess` 3 · `forms/FormError` 3 ·
 * `shared/LanguageSwitcher` 2 · `ui/dialog` 1.
 */
/*
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * ⚠ **54 → 46 (TCK-358) → 4, LE 2026-08-27, PAR TCK-384.**
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Les 42 occurrences descendues sont dix fichiers portés sur les jetons, et les quatre
 * répertoires qui les contiennent sont entrés dans `PERIMETRES` — un fichier porté qui n'entre
 * dans aucun périmètre revient au premier commit venu, c'est la leçon de TCK-245.
 *
 * ⚠ **Ce qui RESTE tient dans un seul fichier, et il ne se corrige pas ici : `layout/UserMenu.tsx`
 * (4).** La mesure vaut d'être écrite, parce qu'elle contredit ce qui paraissait le lot le moins
 * cher de la liste. Sa variante `dark` sert DEUX barres hautes qui fabriquent « sombre » par des
 * mécanismes OPPOSÉS :
 *
 *   `layout/AppTopbar`        `bg-foreground`, en portée CLAIRE. L'encre qui s'y lit est
 *                             `--background`.
 *   `layout/SuperAdminTopbar` `dark` + `bg-background`, donc en portée SOMBRE. L'encre qui s'y
 *                             lit est `--foreground`.
 *
 * Les deux jetons sont exactement l'inverse l'un de l'autre : aucun ne convient aux deux barres,
 * et le blanc littéral d'aujourd'hui ne convient qu'en thème clair (sous `.dark`, `bg-foreground`
 * d'`AppTopbar` devient crème et le blanc disparaît dessus). Le correctif porte donc sur
 * `AppTopbar`, qui doit adopter `dark` comme son jumeau — un fichier que le cliquet de `/app`
 * ci-dessous met explicitement hors de portée, parce qu'y traduire `outline-white` demanderait
 * de REMESURER un contraste que la revue adverse de TCK-371 vient d'établir.
 *
 * *Traduire ces quatre-là par un jeton aurait rendu le composant faux sur l'une des deux barres,
 * et vert dans la garde.* C'est la forme de correctif que ce fichier existe pour ne pas produire.
 *
 * ⚠ **Ce cliquet ne peut plus tomber à 0 par le seul travail de TCK-384**, et le dire est le
 * point du paragraphe : le point 4 du delta (« quand le reste atteint 0, supprimer le plafond »)
 * dépend d'un ticket sur `AppTopbar` qui n'existe pas encore.
 */
const RESTE_PLAFOND = 4;

/**
 * LE PÉRIMÈTRE GARDÉ DE `/app` (TCK-381) — vingt-huit répertoires plus les pages.
 *
 * La liste n'est pas devinée : c'est l'ensemble des répertoires de `src/components` atteints par
 * la clôture d'import des 46 pages de `/app` ET qui ne servent QUE le tableau de bord. Ce qui est
 * partagé avec le site public (`ui/`, `forms/`, `layout/`, `shared/`, `property/`, `public/`,
 * `files/`, `wizard/`, `onboarding/`, `map/`) reste DEHORS, dans le cliquet : les porter demande
 * de redessiner des primitives que la recherche publique et les fiches de bien montent aussi.
 *
 * ⚠ `components/console`, `feedback`, `billing`, `reporting` et `kyc-components.tsx` n'y figurent
 * PAS — non parce qu'ils seraient hors de `/app`, mais parce qu'ils sont **déjà** dans le
 * périmètre de l'espace super-admin ci-dessus. Un fichier gardé deux fois est gardé une fois de
 * trop : le second passage n'ajoute rien, et il rendrait le compte du reste dépendant de l'ordre
 * des espaces.
 */
const PERIMETRES_APP = [
  { type: 'dir', chemin: join(WEB_SRC, 'app', '(dashboard)', 'app') },
  // Les répertoires qui ne servent QUE le tableau de bord : gardés en entier, un fichier neuf
  // déposé dedans est couvert d'office.
  ...[
    'agency', 'agent', 'calendar', 'charts', 'customer', 'customer-dashboard',
    'customer-form', 'dashboard', 'documents', 'inventory', 'leases', 'media',
    'messages', 'owner', 'owners', 'payments', 'pipeline', 'privacy', 'profile',
    'property-dashboard', 'property-form', 'reviews', 'service-providers',
    'tenant', 'visits', 'welcome',
  ].map((d) => ({ type: 'dir', chemin: join(WEB_SRC, 'components', d) })),
  //
  // ⚠ `agent`, `customer-form`, `dashboard`, `owner` et `welcome` entrent alors qu'ils étaient
  // DÉJÀ propres (mesuré le 2026-08-27 : zéro occurrence hors `__tests__`) et qu'aucune page
  // publique ne les monte. *Un répertoire déjà propre est le moins cher à mettre sous cliquet, et
  // c'est le seul moment où ça ne coûte rien* — même raison que `components/reporting` chez
  // TCK-358. Sans eux, ils tombaient dans le reste : gardés par personne, à zéro par chance.
  // Les répertoires PARTAGÉS avec le site public : seuls les fichiers que `/app` monte
  // réellement entrent — cf. le docblock du type `cloture`.
  ...['bookings', 'compare', 'favorites', 'maintenance', 'search']
    .map((d) => ({ type: 'cloture', chemin: join(WEB_SRC, 'components', d) })),
];

/**
 * LE PÉRIMÈTRE GARDÉ DES ASSISTANTS D'ONBOARDING (TCK-385) — deux entrées, et c'est le sujet.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN TROISIÈME ESPACE, ET PAS UNE ENTRÉE DE PLUS DANS `PERIMETRES`
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * `src/components/kyc/KycUploader.tsx` n'était gardé par RIEN, et pas par accident : il vit à
 * côté de `kyc-components.tsx`, que la console monte et que `PERIMETRES` nomme FICHIER PAR
 * FICHIER pour ne pas embarquer ce voisin-ci. Mesuré le 2026-08-27 : `KycUploader` n'est monté
 * que par les trois assistants d'onboarding, JAMAIS par la console — il n'est donc pas dans la
 * clôture de `/super-admin`, il n'apparaît même pas dans son reste. Et `check-app-tokens.mjs`
 * ne connaît que le dialecte `app-*`.
 *
 * *Un fichier que deux gardes se renvoient l'une à l'autre n'est pas à moitié gardé : il ne
 * l'est pas du tout.* La réponse n'est ni d'élargir le périmètre de la console — ce qui la
 * ferait rougir sur un écran d'onboarding, et *la réponse humaine à ce rouge-là est une
 * exception, pas un correctif* — ni d'écrire une garde de plus : c'est de donner à
 * `/onboarding` l'espace qu'il n'avait pas, dans le mécanisme qui existe déjà. Une COPIE de ce
 * fichier aurait divergé le jour même, et c'est le défaut que la moitié des gardes de ce dépôt
 * existent pour attraper ailleurs.
 *
 * ⚠ **`src/components/onboarding` n'y figure PAS**, et c'est une mesure : il portait
 * **18 occurrences** de palette brute le 2026-08-27, réparties sur six assistants
 * (`HostIndividualWizard` 6, `ServiceProviderMultiAgencyWelcome` 4, `AgencyAdminOnboardingWizard`
 * 2, plus une bannière verte dans chacun des trois assistants portés par ce ticket). Les mettre
 * en `dir` aurait fait rougir la garde le jour de sa naissance. Elles tombent donc dans le RESTE,
 * qui les compte, les nomme et refuse qu'elles se multiplient — c'est exactement ce que le hors
 * périmètre de TCK-385 demande : « elles se traitent dans un ticket qui les aura comptées ».
 */
const PERIMETRES_ONBOARDING = [
  // Les six pages de routes plus leur layout : déjà à zéro le 2026-08-27. *Un répertoire déjà
  // propre est le moins cher à mettre sous cliquet, et c'est le seul moment où ça ne coûte rien.*
  { type: 'dir', chemin: join(WEB_SRC, 'app', 'onboarding') },
  // La forme `file`, pour la raison exacte qui la justifie dans `PERIMETRES` : ses voisins de
  // `src/components/kyc/` ne sont PAS rendus par les assistants (`kyc-components.tsx` l'est par
  // la console, `AgencyKycClient.tsx` par `/admin`).
  { type: 'file', chemin: join(WEB_SRC, 'components', 'kyc', 'KycUploader.tsx') },
];

/*
 * ⚠ `components/chat-widget` a été RETIRÉ de la liste ci-dessus, et le contrôle « clôture vide »
 * est ce qui l'a dénoncé : le widget est monté par `src/app/layout.tsx`, la racine de TOUT le
 * site. Il n'est donc pas dans la clôture de `/app` — il est dans celle de la page d'accueil
 * publique aussi bien que dans celle du tableau de bord.
 *
 * C'est le trou T5, déclaré : **la clôture part de `app/(dashboard)/app`, pas des layouts qui
 * l'enveloppent.** `app/layout.tsx` et `app/(dashboard)/layout.tsx` rendent sur `/app`, mais ils
 * rendent aussi sur `/admin` et sur le site public ; les prendre pour racine ferait entrer le
 * produit entier dans la « clôture de /app » et viderait le cliquet de son sens. La définition
 * retenue est celle du ticket, et elle laisse trois surfaces hors compte : le widget de
 * conversation, la bannière de maintenance globale et le sélecteur de langue du pied de page.
 */

/**
 * LES TÉMOINS — la moitié de l'auto-épreuve que ce fichier n'avait PAS, et le trou le plus
 * silencieux qu'il portait.
 *
 * Le contrôle `manquants` vérifie qu'un chemin CONFIGURÉ existe encore. Il ne voit pas le cas
 * inverse — **une entrée RETIRÉE de la configuration** : la garde sort alors en 0, sans un mot,
 * sur un périmètre amputé. C'est la troisième façon de la désarmer, après « casser une expression
 * régulière » (que {@link EPREUVE} attrape) et « lever un plafond » (que le cliquet attrape).
 *
 * Chacun des fichiers ci-dessous DOIT se retrouver dans l'ensemble ANALYSÉ de son espace. Le
 * mécanisme est repris de `scripts/check-locale-figee.mjs`, qui l'avait déjà payé.
 */
const TEMOINS = {
  'console super-admin': [
    join(WEB_SRC, 'app', '(super-admin)', 'super-admin', 'payouts', 'page.tsx'),
    join(WEB_SRC, 'components', 'admin', 'super', 'system-health.tsx'),
    join(WEB_SRC, 'components', 'console', 'StatusBadge.tsx'),
    join(WEB_SRC, 'components', 'feedback', 'ErrorState.tsx'),
    join(WEB_SRC, 'components', 'billing', 'PayoutTable.tsx'),
    join(WEB_SRC, 'components', 'reporting', 'RevenueChart.tsx'),
    join(WEB_SRC, 'components', 'kyc', 'kyc-components.tsx'),
    // ⚠ Un témoin par répertoire ENTRÉ avec TCK-384. Sans eux, retirer `{ type: 'dir', … 'ui' }`
    // de `PERIMETRES` — UN geste — laissait 90 primitives partagées hors de toute exigence de
    // zéro : seul le plancher de fichiers l'aurait vu, et un plancher se corrige d'un chiffre.
    join(WEB_SRC, 'components', 'ui', 'toast.tsx'),
    join(WEB_SRC, 'components', 'forms', 'FormError.tsx'),
    join(WEB_SRC, 'components', 'files', 'PdfViewer.tsx'),
    join(WEB_SRC, 'components', 'shared', 'LanguageSwitcher.tsx'),
  ],
  "assistants d'onboarding": [
    join(WEB_SRC, 'app', 'onboarding', 'layout.tsx'),
    join(WEB_SRC, 'app', 'onboarding', 'agent', 'page.tsx'),
    join(WEB_SRC, 'app', 'onboarding', 'owner', 'page.tsx'),
    join(WEB_SRC, 'app', 'onboarding', 'service-provider', 'page.tsx'),
    // ⚠ LE témoin de ce ticket : le fichier que deux gardes se renvoyaient. Son retrait de
    // `PERIMETRES_ONBOARDING` sortirait la garde en 0 sans un mot, sur le seul fichier pour
    // lequel l'espace a été créé.
    join(WEB_SRC, 'components', 'kyc', 'KycUploader.tsx'),
  ],
  'tableau de bord /app': [
    // TCK-426 — le fichier a été DÉPLACÉ, pas supprimé : `app/page.tsx` vit désormais sous le
    // groupe de routes `(accueil)`, qui ne consomme aucun segment d'URL (`/app` est inchangée).
    // Le déplacement retire le `loading.tsx` de la racine, dont la frontière de suspension
    // effaçait le statut HTTP de tout `/app`. C'est exactement le cas que le message
    // d'AUTO-ÉPREUVE décrit : renommé pour de bon, donc on corrige le témoin.
    join(WEB_SRC, 'app', '(dashboard)', 'app', '(accueil)', 'page.tsx'),
    join(WEB_SRC, 'components', 'calendar', 'CalendarPage.tsx'),
    join(WEB_SRC, 'components', 'leases', 'LeaseDetail.tsx'),
    join(WEB_SRC, 'components', 'maintenance', 'labels.ts'),
    join(WEB_SRC, 'components', 'property-dashboard', 'PropertyList.tsx'),
    join(WEB_SRC, 'components', 'profile', 'ProfileReviewsList.tsx'),
    join(WEB_SRC, 'components', 'messages', 'ChatView.tsx'),
  ],
};

/**
 * LES DEUX ESPACES — chacun : ce qu'il exige à zéro, ce qu'il MESURE, et son cliquet.
 *
 * `resteBilateral` marque le cliquet qui échoue AUSSI quand il descend. Il vaut `true` pour LES
 * DEUX depuis le 2026-08-27 — l'asymétrie qui vivait ici était le défaut D2 de la revue adverse
 * de TCK-381, et le docblock de {@link RESTE_PLAFOND} porte la mesure qui l'a révoquée.
 *
 * ⚠ **Le champ reste, alors qu'il vaut `true` partout.** Le retirer économiserait deux lignes et
 * rendrait le prochain espace bilatéral par défaut — ce qui est le bon défaut. Il est gardé parce
 * qu'un espace neuf naît avec un reste qu'on n'a pas encore mesuré, et que la forme d'un désarmement
 * est justement de poser `false` « en attendant » : le champ écrit à `true` dans les deux entrées
 * rend ce `false`-là VISIBLE dans un diff, au lieu d'être une ligne qu'on n'a pas ajoutée.
 */
const ESPACES = [
  {
    libelle: 'console super-admin',
    perimetres: PERIMETRES,
    racineCloture: join(WEB_SRC, 'app', '(super-admin)'),
    plafondReste: RESTE_PLAFOND,
    resteBilateral: true, // ⚠ était `false` — défaut D2, cf. le docblock de RESTE_PLAFOND.
    ticketReste: 'TCK-384',
    natureDuReste: 'primitives partagées avec le site public',
    reference: '128 le 2026-08-27, avant TCK-358',
    // 93 fichiers analysés le 2026-08-27, arbre `feat/console-lot-358-382` fusionné. Le chiffre
    // valait 92 : un fichier de mou, resserré ici parce qu'un plancher qui traîne est du silence
    // acheté à crédit.
    //
    // ⚠ **93 → 130 le 2026-08-27 (TCK-384)**, et l'écart n'est pas du dépôt qui grossit : ce sont
    // les 37 fichiers de `ui`, `forms`, `files` et `shared` qui entrent dans `PERIMETRES`. Un
    // plancher qu'on ne resserre pas après un élargissement de périmètre est un plancher qui
    // descend tout seul — le jeu récupéré est exactement ce dont la manœuvre du trou T6 a besoin.
    plancherFichiers: 130,
  },
  {
    libelle: 'tableau de bord /app',
    perimetres: PERIMETRES_APP,
    racineCloture: join(WEB_SRC, 'app', '(dashboard)', 'app'),
    /*
     * CLIQUET DU RESTE `/app` — **58, mesuré PAR CETTE GARDE le 2026-08-27**, dans 11 fichiers :
     * `ui/toast` (12), `layout/NotificationBell` (10), `property/PropertyCard` (8),
     * `layout/AppTopbar` (7), `layout/UserMenu` (4), `ui/sheet` (4), `forms/FormError` (3),
     * `forms/FormSuccess` (3), `ui/dropdown-menu` (3), `shared/LanguageSwitcher` (2),
     * `layout/AppSidebar` (1), `ui/dialog` (1).
     *
     * ⚠ **Le chiffre du ticket n'est pas celui-ci, et l'écart est instructif.** Mon relevé
     * préalable disait 56 : il ne jouait que les contrôles A et B. La garde y ajoute le contrôle
     * D, qui trouve deux couleurs littérales en valeur arbitraire (`ui/sheet`, `ui/dropdown-menu`)
     * — *un compte pris avec un sous-ensemble des contrôles n'est pas le compte de la garde*, et
     * c'est exactement ainsi qu'un cliquet naît deux crans trop bas.
     *
     * Ce sont RÉELLEMENT des surfaces de `/app`, et RÉELLEMENT des primitives du site public :
     * neuf de ces onze fichiers figurent aussi dans le reste non gardé de la console super-admin.
     * Les porter est TCK-384, pour les trois espaces d'un coup — le faire ici l'aurait fait sans
     * revue des écrans publics.
     *
     * ⚠ Bilatéral : la garde échoue s'il MONTE (récidive) ET s'il descend sans que ce chiffre
     * suive. Un cliquet qui ne descend pas est une tolérance — leçon de `check-locale-figee.mjs`.
     *
     * ────────────────────────────────────────────────────────────────────────────────────────
     * ⚠ **58 → 60, à la FUSION de TCK-380/381 dans `feat/console-lot-358-382` (2026-08-27).**
     * ────────────────────────────────────────────────────────────────────────────────────────
     *
     * Le 58 ci-dessus a été mesuré sur l'arbre de contrôle de la branche. L'arbre FUSIONNÉ en
     * porte 60, et l'écart n'est pas une récidive : les DEUX occurrences viennent de
     * `layout/AppTopbar.tsx`, du commit `f3a36668` (revue adverse de TCK-371), qui n'est pas
     * dans la base de la branche. Mesuré à la fusion, ce fichier passe de 7 à 9 :
     *
     *     l. 34   `outline-white`   ← l'anneau de focus des DEUX contrôles écrits à la main de
     *                                 la barre haute. Ils n'en portaient aucun et retombaient
     *                                 sur la règle globale, mesurée à 1,73:1 — sous les 3:1 de
     *                                 WCAG 1.4.11. Le blanc rend 17,53:1 sur la barre nue et
     *                                 13,17:1 sur le hamburger survolé, quand `outline-ring`
     *                                 rend 3,30:1 et **2,48:1 (✗)**. C'est un correctif MESURÉ.
     *     l. 28   blanc en dur      ← dans le DOCBLOCK de ce même correctif, qui porte la table
     *                                 des mesures. La garde lit les commentaires, délibérément.
     *
     * **Le plafond est relevé plutôt que le fichier corrigé, et c'est une décision.**
     * `AppTopbar` n'est dans le périmètre gardé d'AUCUN des deux espaces : c'est une primitive
     * partagée avec le site public, donc le terrain de TCK-384 — et traduire `outline-white`
     * par un jeton demande de REMESURER un contraste que la revue adverse vient d'établir.
     * *Une garde qui force à défaire un correctif mesuré ne garde plus, elle arbitre.*
     *
     * ⚠ C'est le seul cas où ce nombre monte sans qu'une couleur ait été décidée à la légère,
     * et il est écrit ici pour que la prochaine hausse n'ait pas ce précédent pour excuse.
     */
    /*
     * ────────────────────────────────────────────────────────────────────────────────────────
     * ⚠ **58 → 60 (fusion) → 32, LE 2026-08-27, PAR TCK-384.**
     * ────────────────────────────────────────────────────────────────────────────────────────
     *
     * Les 28 descendues sont les mêmes primitives partagées que celles du cliquet super-admin
     * ci-dessus — `ui/toast` (12), `ui/sheet` (4), `forms/FormError` (3), `forms/FormSuccess`
     * (3), `ui/dropdown-menu` (3), `shared/LanguageSwitcher` (2), `ui/dialog` (1) — portées une
     * fois et comptées dans les DEUX espaces, ce qui est précisément l'argument de TCK-384 :
     * les porter depuis un ticket de console les aurait portées sans revoir ces écrans-ci.
     *
     * Les 32 qui restent tiennent dans quatre fichiers, tous hors du périmètre gardé de `/app`
     * comme de celui de la console : `layout/AppTopbar` (9), `layout/NotificationBell` (10),
     * `property/PropertyCard` (8), `layout/UserMenu` (4), `layout/AppSidebar` (1).
     * `AppTopbar` reste hors de portée pour la raison écrite plus haut (un correctif MESURÉ
     * qu'une traduction obligerait à refaire) et `UserMenu` en dépend — cf. le docblock de
     * {@link RESTE_PLAFOND}.
     */
    plafondReste: 32,
    resteBilateral: true,
    ticketReste: 'TCK-384',
    natureDuReste: 'primitives partagées avec le site public',
    reference: '1070 le 2026-08-27, avant TCK-380/381',
    /*
     * ⚠ **225 → 266 le 2026-08-27**, et l'écart n'était pas de deux fichiers mais de QUARANTE ET
     * UN. Le rapport de fusion de TCK-380/381 annonçait « 227 mesurés pour un plancher de 225 »,
     * relevé pris AVANT l'entrée de TCK-382 : 36 `loading.tsx`, le `not-found.tsx` et ses voisins
     * ont fait monter l'analysé à 266 sans que le plancher bouge. La fusion lui a donc ajouté du
     * mou sans le dire — signalé par la revue adverse (défaut faible n°5).
     *
     * *Un plancher qu'on ne resserre pas est un plancher qui descend tout seul* : il ne bouge
     * pas, c'est le dépôt qui monte au-dessus, et le jeu récupéré est exactement ce que la
     * manœuvre à trois gestes du trou T6 a besoin d'avoir sous la main.
     */
    plancherFichiers: 266,
  },
  {
    libelle: "assistants d'onboarding",
    perimetres: PERIMETRES_ONBOARDING,
    racineCloture: join(WEB_SRC, 'app', 'onboarding'),
    /*
     * CLIQUET DU RESTE `/onboarding` — **24, mesuré PAR CETTE GARDE le 2026-08-27**, le jour
     * où l'espace est né. Il n'y a donc pas de « avant » à comparer : la référence ci-dessous est
     * le compte de l'espace ENTIER (périmètre + reste) au même instant, ce qui est le seul chiffre
     * honnête pour un espace neuf.
     *
     * Le reste est ici **plus gros que le périmètre**, et c'est le contraire des deux autres
     * espaces. Ce n'est pas un défaut de cadrage : TCK-385 met explicitement le reste des
     * assistants hors périmètre, et il a raison de le faire — les porter demande de trancher, pour
     * chacun, ce que sa bannière verte ou ambre VEUT DIRE. Le cliquet est là pour que ce travail
     * reste chiffré au lieu de rester à faire.
     *
     * ⚠ Bilatéral, comme les deux autres : la garde échoue s'il MONTE (récidive) ET s'il descend
     * sans que ce chiffre suive. *Un cliquet qui ne descend pas est une tolérance.*
     */
    plafondReste: 24,
    resteBilateral: true,
    ticketReste: 'TCK-385',
    natureDuReste: "assistants d'onboarding non encore portés, plus le module TOTP",
    reference: "24 sur la clôture entière le 2026-08-27, à la naissance de l'espace",
    // 8 fichiers analysés le 2026-08-27, sans le moindre mou : les sept de `src/app/onboarding`
    // (six pages plus le layout) et `KycUploader.tsx`.
    plancherFichiers: 8,
  },
];
const estTest = (chemin) => chemin.split(/[\\/]/).includes('__tests__');

const EXTENSIONS_IMPORT = ['.tsx', '.ts', '.jsx', '.js'];

/**
 * Rassemble les fichiers d'UN périmètre, en dénonçant tout chemin configuré qui a disparu.
 *
 * `cloture` reçoit la clôture de rendu de l'espace, pour le quatrième type de périmètre.
 */
function fichiersDuPerimetre(perimetres, manquants, cloture) {
  const tous = [];
  for (const p of perimetres) {
    if (p.type === 'cloture') {
      /*
       * QUATRIÈME TYPE, ajouté par TCK-381 — l'intersection d'un répertoire et de la clôture.
       *
       * Il existe parce que six répertoires servent DEUX espaces à la fois : `search/`,
       * `compare/`, `bookings/`, `favorites/`, `chat-widget/` et `maintenance/` portent les
       * écrans de `/app` **et** le tunnel de réservation, la comparaison et la recherche du site
       * PUBLIC. Mesuré : 137 occurrences de palette brute y vivent dans des fichiers que `/app`
       * ne monte pas.
       *
       * Les mettre en `dir` aurait fait rougir la garde sur le site public, que TCK-381 met
       * explicitement hors périmètre — et *la réponse humaine à ce rouge-là est une exception,
       * pas un correctif*, exactement ce que le docblock du type `file` dit déjà.
       *
       * ⚠ Contrairement à `dir`, un fichier NEUF déposé dans ce répertoire n'est couvert que
       * s'il est réellement importé depuis l'espace. C'est le contrat, pas une faiblesse : la
       * garde suit l'écran. S'il n'est monté par personne, il tombe dans le reste — et le
       * cliquet le voit.
       */
      if (!existsSync(p.chemin)) { manquants.push(relative(ROOT, p.chemin)); continue; }
      const dedans = cloture.filter((c) => c.startsWith(p.chemin + sep));
      // Un répertoire de clôture qui ne rend plus RIEN est un périmètre évaporé : le dire.
      if (dedans.length === 0) manquants.push(`${relative(ROOT, p.chemin)} (clôture vide)`);
      for (const c of dedans) tous.push(c);
      continue;
    }
    if (p.type === 'dir') {
      if (!existsSync(p.chemin)) { manquants.push(relative(ROOT, p.chemin)); continue; }
      fichiersDe(p.chemin, tous);
    } else if (p.type === 'file') {
      // Un périmètre d'UN fichier disparaît sans bruit au premier renommage : sans ce contrôle, la
      // garde perdrait sa portée sur `kyc-components.tsx` en restant verte.
      if (!existsSync(p.chemin)) { manquants.push(relative(ROOT, p.chemin)); continue; }
      tous.push(p.chemin);
    } else {
      if (!existsSync(p.dir)) { manquants.push(relative(ROOT, p.dir)); continue; }
      const trouves = readdirSync(p.dir).filter(
        (e) => e.startsWith(p.prefixe) && EXTENSIONS.test(e),
      );
      // Un périmètre défini par un préfixe de nom peut se vider sans erreur : le jour où les trois
      // `SuperAdmin*.tsx` sont renommés, cette garde perdrait un pan de sa portée en silence.
      if (trouves.length === 0) manquants.push(`${relative(ROOT, p.dir)}/${p.prefixe}*`);
      for (const e of trouves) tous.push(join(p.dir, e));
    }
  }
  return tous;
}

/** Compte les trouvailles de chaque contrôle sur une liste de fichiers. */
function analyser(chemins) {
  const par = new Map(CONTROLES.map(([id]) => [id, []]));
  for (const chemin of chemins) {
    const rel = relative(ROOT, chemin);
    readFileSync(chemin, 'utf8').split('\n').forEach((ligne, i) => {
      for (const [id, , motif] of CONTROLES) {
        motif.lastIndex = 0;
        for (const m of ligne.matchAll(motif)) par.get(id).push([rel, i + 1, m[0]]);
      }
    });
  }
  return par;
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// T2 · le RESTE NON GARDÉ — ce que l'espace REND et que son périmètre ne couvre pas
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * La clôture transitive des imports depuis une racine de routes.
 *
 * C'est une approximation, et elle l'est dans le sens PRUDENT : un import qu'elle ne résout pas
 * (chemin calculé, ré-export exotique, `next/dynamic` avec une expression) sort de la clôture,
 * donc du compte — la garde ne peut pas rougir à cause d'elle, seulement manquer quelque chose.
 * *Une approximation qui se trompe toujours du même côté n'est pas un aléa : c'est un plancher.*
 */
function resoudre(spec, depuis) {
  let base;
  if (spec.startsWith('@/')) base = join(WEB_SRC, spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(depuis), spec);
  else return null; // paquet npm : hors du dépôt, donc hors sujet.
  for (const e of EXTENSIONS_IMPORT) {
    if (existsSync(base + e) && statSync(base + e).isFile()) return base + e;
  }
  if (existsSync(base) && statSync(base).isDirectory()) {
    for (const e of EXTENSIONS_IMPORT) {
      const idx = join(base, `index${e}`);
      if (existsSync(idx)) return idx;
    }
    return null;
  }
  if (existsSync(base) && statSync(base).isFile()) return base;
  return null;
}

function clotureDeRendu(racine) {
  const depart = fichiersDe(racine).filter((f) => /\.(tsx?|jsx?)$/.test(f));
  const vus = new Set(depart);
  const file = [...depart];
  while (file.length > 0) {
    const f = file.pop();
    let src;
    try { src = readFileSync(f, 'utf8'); } catch { continue; }
    for (const m of src.matchAll(/from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      const r = resoudre(m[1] ?? m[2], f);
      if (r && !vus.has(r)) { vus.add(r); file.push(r); }
    }
  }
  return [...vus].filter((f) => !estTest(f));
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// L'EXÉCUTION — un passage par espace, et un seul verdict
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * L'ÉPREUVE DE LA FORME DE LA CONFIGURATION — deux lignes, contre deux mutations à un geste.
 *
 * Mesuré le 2026-08-27 : **retirer l'entrée `/app` du tableau {@link ESPACES}** et **vider
 * {@link TEMOINS}** sortaient tous deux la garde en 0, d'une seule suppression chacun. Ces deux
 * contrôles ne les rendent pas impossibles — ils les font passer d'UNE suppression à DEUX, dont
 * l'une est un chiffre écrit ici, que personne ne baisse par distraction.
 *
 * ⚠ **C'est un plancher, pas une preuve** : cf. le trou T6 en tête de fichier. Une garde ne se
 * défend pas contre une réécriture délibérée d'elle-même ; à partir de là, la défense est la revue
 * du diff.
 */
if (ESPACES.length < 2) {
  console.error('✗ AUTO-ÉPREUVE — `ESPACES` ne porte plus que ' + ESPACES.length + ' espace(s).');
  console.error('  Il en faut DEUX : la console super-admin (TCK-358) et `/app` (TCK-381). En');
  console.error('  retirer un sortait la garde en 0 sur la moitié du produit, en silence.');
  process.exit(1);
}
for (const espace of ESPACES) {
  const t = TEMOINS[espace.libelle];
  if (t && t.length >= 3) continue;
  console.error(`✗ AUTO-ÉPREUVE — « ${espace.libelle} » n'a plus au moins trois témoins.`);
  console.error('  Vider `TEMOINS` désarmait le contrôle de périmètre d\'une seule suppression.');
  process.exit(1);
}

/**
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * LE FICHIER DE JETONS — l'ironie de portée que la revue adverse de TCK-381 a nommée
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Cette garde imprime, à chaque exécution, qu'elle prouve « qu'aucune couleur n'est décidée en
 * dehors de `globals.css` ». **Elle ne lisait pas `globals.css`** : le fichier n'appartenait à
 * aucun des deux périmètres et n'entrait dans aucune clôture, `EXTENSIONS_IMPORT` ne suivant pas
 * le CSS. Le seul fichier où une couleur PEUT être décidée était le seul qu'elle ne regardait
 * pas. MESURÉ (défaut D3, 2026-08-27) : `.mutation-n9 { @apply bg-stone-200 text-red-600; }`
 * ajouté en fin de fichier → garde VERTE.
 *
 * Le coût du trou n'est pas théorique : un `@apply` de palette brute y fabrique une classe
 * utilitaire qui sert **n'importe quelle** surface des trois espaces, sans qu'aucune des 359
 * lectures de fichier ci-dessus ne voie jamais passer une classe de palette.
 *
 * ⚠ **Les contrôles A, B et C seulement — PAS D, PAS E, et c'est tout le sujet.** Un
 * hexadécimal dans ce fichier est ce qu'on veut : `--primary: #a85332` EST la décision de
 * couleur, prise au seul endroit où elle a le droit de l'être. Refuser D ici transformerait la
 * garde en interdiction de définir un jeton, c'est-à-dire en garde qu'on contourne. Ce qui est
 * refusé, c'est le mouvement INVERSE : faire rentrer l'échelle Tailwind brute par la porte du
 * fichier qui existe pour s'en passer.
 *
 * ⚠ Corollaire assumé : ajouter `--jeton-pirate: #ff00ff` à `:root` reste VERT. Ce n'est pas un
 * trou, c'est la définition — un jeton neuf est une décision de couleur prise au bon endroit, et
 * juger de sa PERTINENCE est le trou T3, pas celui-ci.
 */
const JETONS = join(WEB_SRC, 'app', 'globals.css');

if (!existsSync(JETONS)) {
  console.error(`✗ « ${relative(ROOT, JETONS)} » est introuvable.`);
  console.error('  C\'est le fichier de jetons : la garde affirme dans sa sortie qu\'aucune');
  console.error('  couleur n\'est décidée ailleurs. S\'il a été déplacé, corriger `JETONS` —');
  console.error('  jamais retirer ce contrôle.');
  process.exit(1);
}

{
  const defauts = [];
  readFileSync(JETONS, 'utf8').split('\n').forEach((ligne, i) => {
    for (const [id, , motif] of CONTROLES) {
      if (!CONTROLES_DE_CLASSE.has(id)) continue;
      motif.lastIndex = 0;
      for (const m of ligne.matchAll(motif)) defauts.push([id, i + 1, m[0]]);
    }
  });
  if (defauts.length > 0) {
    console.error(
      `✗ ${defauts.length} classe(s) de palette brute dans « ${relative(ROOT, JETONS)} » :\n`,
    );
    for (const [id, l, m] of defauts) console.error(`      ${id} ${relative(ROOT, JETONS)}:${l}  ${m}`);
    console.error('');
    console.error('  Ce fichier DÉFINIT les jetons ; il ne consomme pas la palette. Un `@apply` de');
    console.error('  classe brute y fabrique un utilitaire qui sert ensuite n\'importe quelle');
    console.error('  surface des trois espaces, hors de portée de tous les autres contrôles.');
    console.error('');
    console.error('  Si l\'occurrence est dans un COMMENTAIRE : la réécrire en toutes lettres');
    console.error('  (« ambre 50 » et non la classe copiable) — même règle que `components/console`');
    console.error('  chez TCK-358. Un docblock qui montre une classe brute est la documentation');
    console.error('  périmée qui fait repousser le motif.');
    console.error('');
    console.error('  Une COULEUR LITTÉRALE (`#a85332`, `oklch(…)`) reste acceptée ici, et seulement');
    console.error('  ici : c\'est la définition d\'un jeton, pas sa contrefaçon.');
    process.exit(1);
  }
}

const manquants = [];

const collectes = ESPACES.map((espace) => {
  // La clôture d'abord : le type de périmètre `cloture` en dépend.
  const cloture = clotureDeRendu(espace.racineCloture);
  return { espace, cloture, tous: fichiersDuPerimetre(espace.perimetres, manquants, cloture) };
});

/**
 * TOUT ce qui est gardé, TOUS espaces confondus.
 *
 * ⚠ Le reste d'un espace se calcule contre cet ensemble-là, pas contre son seul périmètre — et
 * ce n'est pas un détail de présentation. `components/console` et `components/feedback` sont
 * rendus par `/app` **et** gardés par l'espace super-admin : les compter dans le reste de `/app`
 * ferait dire au cliquet « voici des fichiers que personne ne garde » à propos de fichiers exigés
 * à zéro deux lignes plus haut. Le chiffre dépendrait alors de l'ordre dans lequel les tickets
 * fusionnent — un cliquet qui bouge sans que le dépôt change n'est pas un cliquet.
 */
const GARDE_PARTOUT = new Set(collectes.flatMap((c) => c.tous));

const bilans = collectes.map(({ espace, cloture, tous }) => {
  // Les tests ne sont PAS analysés : ils peuvent légitimement asserter la classe d'un composant
  // tiers, et l'AC1 de TCK-358 comme celle de TCK-381 les excluent explicitement.
  const analyses = tous.filter((c) => !estTest(c));
  const reste = cloture.filter((f) => !GARDE_PARTOUT.has(f));
  const trouvailles = analyser(analyses);
  const resteTrouvailles = analyser(reste);
  const somme = (t) => CONTROLES.reduce((n, [id]) => n + t.get(id).length, 0);
  return {
    espace,
    tous,
    analyses,
    cloture,
    reste,
    trouvailles,
    resteTrouvailles,
    total: somme(trouvailles),
    resteTotal: somme(resteTrouvailles),
  };
});

if (manquants.length > 0) {
  console.error('✗ périmètre introuvable — la garde n\'aurait rien vérifié dessus :');
  for (const m of manquants) console.error(`    ${m}`);
  console.error('  Si le chemin a été renommé ou supprimé, METTRE À JOUR `PERIMETRES` ou');
  console.error('  `PERIMETRES_APP`, selon l\'espace.');
  process.exit(1);
}

for (const bilan of bilans) {
  if (bilan.analyses.length === 0) {
    // Une garde qui parcourt une liste vide passe au vert sans rien avoir vérifié : la forme de
    // vacuité la plus difficile à voir, parce que la sortie ressemble à un succès.
    console.error(
      `✗ aucun fichier lisible dans le périmètre « ${bilan.espace.libelle} » — rien n'a été vérifié.`,
    );
    process.exit(1);
  }
}

/**
 * L'ÉPREUVE DES TÉMOINS — le contrôle que ce fichier n'avait pas, cf. le docblock de `TEMOINS`.
 *
 * Elle tourne APRÈS la collecte parce qu'elle porte sur son RÉSULTAT : ce n'est pas « le chemin
 * existe-t-il », c'est « ce fichier a-t-il réellement été analysé ». Les deux questions ont l'air
 * de la même ; seule la seconde survit au retrait d'une entrée de la configuration.
 */
for (const bilan of bilans) {
  const vus = new Set(bilan.analyses);
  for (const temoin of TEMOINS[bilan.espace.libelle] ?? []) {
    if (vus.has(temoin)) continue;
    console.error(
      `✗ AUTO-ÉPREUVE — « ${relative(ROOT, temoin)} » n'est PLUS analysé dans « ${bilan.espace.libelle} ».`,
    );
    console.error('');
    console.error('  Un répertoire retiré de la configuration, une extension perdue, un parcours');
    console.error('  cassé : la garde sortait en 0 SANS UN MOT sur un périmètre amputé. C\'est la');
    console.error('  troisième façon de la désarmer, après « casser une expression régulière »');
    console.error('  (que EPREUVE attrape) et « lever un plafond » (que le cliquet attrape).');
    console.error('');
    console.error('  Si le fichier a été renommé ou supprimé POUR DE BON, corriger `TEMOINS` —');
    console.error('  jamais le retirer pour faire taire ce message.');
    process.exit(1);
  }
}

/**
 * LE PLANCHER DE FICHIERS GARDÉS — le trou que la MUTATION K a ouvert, et qu'elle referme.
 *
 * Les témoins ci-dessus attrapent « retirer un répertoire du périmètre ». Ils n'attrapent pas la
 * manœuvre à deux temps : **retirer le répertoire ET son témoin.** Mesuré le 2026-08-27 en la
 * jouant — `leases` sorti de `PERIMETRES_APP` et `LeaseDetail.tsx` sorti de `TEMOINS` : la garde
 * sortait en **0, sans un mot**, sur seize fichiers de moins. C'est la même leçon que les témoins,
 * d'un cran plus haut : *un contrôle qui nomme ce qu'il surveille se désarme en retirant le nom.*
 *
 * Ce plancher-ci ne nomme rien : il compte. Ajouter des fichiers est libre ; en perdre exige de
 * corriger le chiffre à la main, avec sa date — et corriger un chiffre à la baisse est un geste
 * qu'une revue voit, contrairement à une ligne de configuration retirée.
 *
 * ⚠ Il est PLANCHER et non cliquet bilatéral : une suppression légitime de composant le fera
 * rougir, et c'est voulu — c'est le seul moment où quelqu'un relit ce que la garde couvre.
 */
for (const b of bilans) {
  if (b.analyses.length >= b.espace.plancherFichiers) continue;
  console.error(
    `✗ « ${b.espace.libelle} » ne garde plus que ${b.analyses.length} fichiers, `
    + `contre ${b.espace.plancherFichiers} au relevé du 2026-08-27.`,
  );
  console.error('');
  console.error('  Un répertoire retiré de la configuration fait exactement cela — et si son');
  console.error('  témoin part avec lui, RIEN d\'autre ne le dit. Le périmètre a rétréci :');
  console.error('    · si c\'est une suppression légitime de composants, corriger');
  console.error('      `plancherFichiers` de cet espace, avec sa date ;');
  console.error('    · sinon, remettre le chemin dans `PERIMETRES` / `PERIMETRES_APP`.');
  console.error('');
  process.exit(1);
}

if (REPORT) {
  for (const b of bilans) {
    console.log(
      `${b.espace.libelle} — ${b.analyses.length} fichiers GARDÉS `
      + `(${b.tous.length - b.analyses.length} fichiers de test écartés)\n`,
    );
    for (const [id, libelle] of CONTROLES) {
      const hits = b.trouvailles.get(id);
      console.log(`  ${id} · ${libelle} : ${hits.length}`);
      for (const [f, l, m] of hits) console.log(`      ✗ ${f}:${l}  ${m}`);
    }
    console.log(
      `\n  reste NON GARDÉ — ${b.reste.length} fichiers de la clôture de rendu, hors périmètre :`,
    );
    for (const [id, libelle] of CONTROLES) {
      const hits = b.resteTrouvailles.get(id);
      if (hits.length === 0) continue;
      console.log(`    ${id} · ${libelle} : ${hits.length}`);
      for (const [f, l, m] of hits) console.log(`        · ${f}:${l}  ${m}`);
    }
    console.log(`    total ${b.resteTotal} (cliquet ${b.espace.plafondReste}) — ${b.espace.ticketReste}\n`);
  }
}

let echec = false;

for (const b of bilans) {
  if (b.total === 0) continue;
  echec = true;
  console.error(
    `✗ ${b.total} classe(s) de couleur hors jetons dans « ${b.espace.libelle} » :\n`,
  );
  for (const [id, libelle] of CONTROLES) {
    const hits = b.trouvailles.get(id);
    if (hits.length === 0) continue;
    console.error(`  ${id} · ${libelle} — ${hits.length} :`);
    for (const [f, l, m] of hits) console.error(`      ${f}:${l}  ${m}`);
    console.error('');
  }
}

if (echec) {
  console.error('  Traduire par RÔLE, jamais par teinte proche :');
  console.error('      surface de carte ............ bg-card          (ex-blanc en dur)');
  console.error('      surface secondaire .......... bg-muted         (ex-pierre 50|100|200)');
  console.error('      bordure / anneau ............ border-border · ring-border');
  console.error('      texte principal ............. text-foreground  (ex-pierre 900|950)');
  console.error('      texte secondaire ............ text-muted-foreground');
  console.error('      accent de marque ............ text-primary · bg-primary');
  console.error('      avertissement ............... WarningBanner · bg-warning/10 · text-warning');
  console.error('      succès / confirmation ....... bg-success/15 · text-success   (TCK-381)');
  console.error('      information / en cours ...... bg-info/15 · text-info         (TCK-381)');
  console.error('      erreur ...................... ErrorState · text-destructive');
  console.error('      pastille de statut .......... <StatusBadge tone="…"> — jamais une classe');
  console.error('  Surface sombre permanente (topbar / sidebar) : la classe `dark` plus les jetons');
  console.error('  `--sidebar-*`, cf. le docblock de `SuperAdminSidebar`.');
  console.error('  Blanc FONCTIONNEL (fond de QR code) : la classe `.qr-surface` de `globals.css`.');
  console.error('  Valeur arbitraire (contrôle D) : une couleur ne s\'écrit pas entre crochets.');
  console.error('  `bg-[var(--jeton)]` est accepté — c\'est une LECTURE de jeton, pas une décision.');
  console.error('');
  console.error('  ⚠ FAUX POSITIF CONNU (T11) — si la forme refusée est une COULEUR RELATIVE dont');
  console.error('  TOUS les canaux sont enveloppés dans une fonction, votre code est JUSTE et la');
  console.error('  garde a tort :');
  console.error('      oklch(from var(--x) calc(l * 0.8) calc(c * 1.1) calc(h))   ← refusé à tort');
  console.error('      oklch(from var(--x) calc(l * 0.8) c h)                     ← accepté');
  console.error('  Le contournement est de laisser UN canal nu. La raison, le mécanisme et la');
  console.error('  mesure sont en tête de ce fichier, sous T11.');
  console.error('  N\'écrivez PAS un hexadécimal pour contourner ce refus : c\'est précisément ce');
  console.error('  que le contrôle D existe pour empêcher, et ce message serait alors la cause du');
  console.error('  défaut qu\'il annonce.');
  console.error('');
}

for (const b of bilans) {
  const { plafondReste, resteBilateral, libelle, ticketReste } = b.espace;
  if (b.resteTotal > plafondReste) {
    echec = true;
    console.error(`✗ « ${libelle} » — le RESTE NON GARDÉ est monté : ${b.resteTotal} > ${plafondReste}.\n`);
    console.error('  Ces fichiers sont rendus par l\'écran sans être dans son périmètre — ils sont');
    console.error(`  partagés avec le reste du produit (cf. ${ticketReste}). Le plafond ne se relève pas :`);
    console.error('  soit la couleur neuve passe par un jeton, soit le fichier entre dans un');
    console.error('  périmètre gardé et y passe à zéro. Le détail : --report.\n');
    for (const [id] of CONTROLES) {
      for (const [f, l, m] of b.resteTrouvailles.get(id)) console.error(`      ${id} ${f}:${l}  ${m}`);
    }
    console.error('');
  } else if (resteBilateral && b.resteTotal < plafondReste) {
    echec = true;
    console.error(
      `✗ « ${libelle} » — le reste vaut ${b.resteTotal}, alors que le cliquet dit ${plafondReste}.\n`,
    );
    console.error('  Un cliquet qui ne DESCEND pas est une tolérance : corrige le chiffre dans');
    console.error('  `scripts/check-super-admin-tokens.mjs`, avec sa date. C\'est aussi ce qui rend');
    console.error('  une hausse de plafond immédiatement rouge au lieu de silencieuse.\n');
  }
}

if (echec) process.exit(1);

for (const b of bilans) {
  console.log(
    `✓ ${b.espace.libelle} : 0 classe de couleur hors jetons sur ${b.analyses.length} fichiers `
    + `gardés (contre ${b.espace.reference}).`,
  );
  console.log(
    `  RESTE NON GARDÉ : ${b.resteTotal} défaut(s) (cliquet ${b.espace.plafondReste}`
    + `${b.espace.resteBilateral ? ', bilatéral' : ''}) dans ${b.reste.length} fichiers que l'écran `
    + `rend RÉELLEMENT`,
  );
  console.log(
    `  sans qu'un périmètre les couvre — ${b.espace.natureDuReste} (${b.espace.ticketReste}).`,
  );
}
console.log(
  `✓ fichier de jetons — 0 classe de palette brute dans ${relative(ROOT, JETONS)} `
  + '(contrôles A/B/C ; une couleur littérale y est la DÉFINITION d\'un jeton, pas un défaut).',
);
console.log(
  '  PORTÉE — plancher de VOCABULAIRE, pas revue de design : un `bg-card` posé là où il',
);
console.log(
  '  fallait `bg-muted` laisse cette garde verte. Elle prouve seulement qu\'aucune couleur',
);
console.log('  n\'est décidée en dehors de `globals.css` — fichier qu\'elle LIT depuis le');
console.log('  2026-08-27 : elle l\'affirmait sans le lire. Trous déclarés, en tête de fichier :');
console.log('  T1 style inline et expression JSX, T2 périmètre (ci-dessus, sous cliquet),');
console.log('  T3 justesse du rendu, T4 listes énumérées, T5 racine de clôture, T6 réécriture');
console.log('  de la garde, T7 noms CSS non ablatés un à un, T8 fichiers .svg,');
console.log('  T9 déclaration CSS ordinaire dans un .css gardé, T10 valeur séparée de');
console.log('  son attribut par une fin de ligne, T11 profondeur de parenthèses de la');
console.log('  branche « canaux absolus ». Détail : --report.');
process.exit(0);
