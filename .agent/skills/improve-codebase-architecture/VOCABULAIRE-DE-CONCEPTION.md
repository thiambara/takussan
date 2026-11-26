# Vocabulaire de conception — les modules profonds

Adapté de `codebase-design` et de ses deux annexes (`DEEPENING.md`, `DESIGN-IT-TWICE.md`) de `mattpocock/skills`
(v1.3.2, MIT), d'après Ousterhout (*A Philosophy of Software Design*) et Feathers (*Working Effectively with Legacy
Code*). Employer ces termes exactement : la constance du vocabulaire est tout l'intérêt.

## Les termes

**Module** : tout ce qui a une interface et une implémentation, à n'importe quelle échelle — une fonction, une
classe, un service Laravel, un hook React, une tranche qui traverse l'API et le front.
_À éviter_ : unité, composant (sauf un composant React au sens littéral), service (sauf une classe de `app/Services`).

**Interface** : tout ce qu'un appelant doit savoir pour bien utiliser le module — la signature, mais aussi les
invariants, l'ordre des appels, les modes d'erreur (ici, les codes d'erreur), la configuration requise, les
performances.
_À éviter_ : API, signature (trop étroits).

**Implémentation** : le corps du module.

**Profondeur** : le levier à l'interface — la quantité de comportement qu'un appelant (ou un test) exerce par unité
d'interface à apprendre. **Profond** : beaucoup de comportement derrière une petite interface. **Superficiel** : une
interface presque aussi complexe que l'implémentation.

**Couture** (*seam*, Feathers) : un endroit où l'on peut changer le comportement sans modifier le code à cet
endroit ; l'emplacement où vit l'interface d'un module. Où placer la couture est une décision à part de ce qu'on met
derrière.
_À éviter_ : frontière (ici, « frontière » est réservée à l'**Agence**, frontière d'isolation).

**Adaptateur** : ce qui remplit une interface à une couture — un rôle, pas une substance. Un driver de paiement est un
adaptateur.

**Levier** : ce que la profondeur donne aux appelants — une implémentation qui sert N appelants et M tests.

**Localité** : ce que la profondeur donne à qui maintient — le changement, les défauts et la vérification se
concentrent en un endroit. Corrigé une fois, corrigé partout.

## Les principes

- **La profondeur est une propriété de l'interface**, pas de l'implémentation. Un module profond peut être fait de
  petites pièces internes ; elles ne font juste pas partie de l'interface. Il peut avoir des **coutures internes**
  (pour ses propres tests) en plus de sa **couture externe**.
- **Le test de suppression.** Imaginer qu'on supprime le module : si la complexité disparaît, c'était un passe-plat ;
  si elle réapparaît chez N appelants, il méritait sa place.
- **L'interface est la surface de test.** Appelants et tests franchissent la même couture. Vouloir tester *au-delà*
  de l'interface signale un module de la mauvaise forme.
- **Un adaptateur, couture hypothétique ; deux adaptateurs, couture réelle.** N'introduire une couture que si quelque
  chose varie vraiment à travers elle.

## Les dépendances d'un candidat

La catégorie de chaque dépendance décide comment on teste le module approfondi à travers sa couture.

1. **En processus** — calcul pur, état en mémoire, pas d'E/S. Toujours approfondissable : fusionner et tester par la
   nouvelle interface, sans adaptateur.
2. **Locale réelle** — ici, **PostgreSQL et Meilisearch tournent pour de vrai dans la suite** (ADR-0020, ADR-0008) :
   pas de doublure à inventer. Le module approfondi se teste contre eux ; la couture reste interne.
3. **Distante mais à nous** — l'API vue du front, à travers les route handlers BFF. Définir un port à la couture ;
   l'adaptateur de production parle HTTP, celui des tests est en mémoire.
4. **Vraiment externe** — paiement mobile, WhatsApp, SMS, fournisseurs d'IA. Le module prend la dépendance par un
   port injecté ; les tests fournissent un faux adaptateur. Ces drivers existent souvent déjà : lire le driver avant
   d'en proposer un.

**Remplacer, ne pas empiler** : une fois les tests écrits à l'interface du module approfondi, les anciens tests des
modules superficiels deviennent du gaspillage — on les supprime. Les tests affirment des résultats observables par
l'interface, pas un état interne, et survivent aux refactorisations internes.

## Concevoir deux fois

Quand le porteur veut comparer plusieurs interfaces pour un candidat retenu (Ousterhout : la première idée est
rarement la meilleure).

1. **Cadrer** : écrire pour le porteur les contraintes que toute interface devra tenir, les dépendances et leur
   catégorie, et une esquisse de code pour rendre les contraintes concrètes — pas une proposition. Puis passer tout
   de suite à l'étape 2 ; le porteur lit pendant que les sous-agents travaillent.
2. **Lancer 3 sous-agents en parallèle** (4 au plus : le dépôt plafonne le parallélisme), chacun au contexte neuf,
   en lecture seule, sans lancer de tests. Chacun reçoit un brief technique (chemins, couplages, catégorie des
   dépendances, ce qui passe derrière la couture), ce vocabulaire et celui de `docs/glossaire.md`, et une contrainte
   différente :
   - « Minimiser l'interface : 1 à 3 points d'entrée, levier maximal par point d'entrée. »
   - « Maximiser la souplesse : beaucoup de cas d'usage et d'extensions. »
   - « Optimiser pour l'appelant le plus courant : rendre le cas par défaut trivial. »
   - (si pertinent) « Concevoir autour de ports et d'adaptateurs pour les dépendances qui traversent la couture. »

   Chacun rend : l'interface (types, méthodes, paramètres, invariants, ordre, erreurs), un exemple d'appel, ce que
   l'implémentation cache, sa stratégie de dépendances, ses compromis.
3. **Comparer** : présenter les conceptions l'une après l'autre, puis les comparer en prose — profondeur, localité,
   placement de la couture — et **trancher** : laquelle est la plus forte et pourquoi, ou un hybride. Le porteur
   attend une lecture franche, pas un menu.
