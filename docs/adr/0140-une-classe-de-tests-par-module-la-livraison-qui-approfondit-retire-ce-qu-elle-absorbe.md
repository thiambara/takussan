# ADR-0140 — Une classe de tests par module ; la livraison qui approfondit un module retire les tests qu'il absorbe

- **Statut** : Accepté le 2026-11-28 (relevé des tests du back du 2026-11-28 ; le porteur : « corrige tous les points susceptibles d'améliorer la situation sur les tests back »)
- **Date** : 2026-11-28
- **Tickets** : TCK-3012 (la règle), TCK-3013 à TCK-3018 (son application)
- **S'appuie sur** : [ADR-0138](0138-qui-peut-lire-s-ecrit-une-fois-pour-la-liste-et-la-fiche.md), [ADR-0139](0139-une-fiche-lit-ses-gestes-sur-l-api-policy-et-etat-compris.md)

## Contexte

Relevé exhaustif de `takussan-api/tests` le 2026-11-28 (branche `feat/approfondissements-architecture`) : 2 166 fichiers,
14 337 tests, 379 000 lignes de tests pour 249 000 dans `app/`. Chaque fichier a été classé (garder, fusionner, alléger,
supprimer, couture). Mesuré :

- **Peu de tests inutiles** : environ 385 retirables (2,7 %), aucun en argent, isolation d'agence, empreintes du Radar
  ou idempotence. La copie littérale est rare (241 tests au corps identique).
- **L'accrétion est la cause** : 1 738 fichiers de test ajoutés en 8 semaines, 22 supprimés, presque tous avec du code
  retiré. 2 095 fichiers sur 2 166 citent un ticket : un fichier naît par ticket sur la même route. Quand un module
  profond arrive (`GestesDeLaVisite`, `GestesDeLaReservation`, `NamespaceAccessGuardTest`, `BornesMaxFaceAuSchemaTest`),
  les tests HTTP qu'il rend superflus restent. Un seul remplacement observé : `BookingGestesTest` a absorbé
  `BookingGestesDuLecteurTest` (TCK-3007).
- **Le coût est concentré** : 50 classes font 40 % du temps cumulé, les tests du seeder 19 % ; médiane 0,8 s par classe.
- **Couture** : 15 fichiers appellent du privé par réflexion, 6 doublent partiellement `PaymentGatewayService`.

## Décision

1. **Un fichier de test se nomme par le module ou la règle qu'il éprouve, jamais par le ticket qui l'a fait naître.**
   Un ticket qui ajoute un comportement à un module ajoute ses tests à la classe de ce module ; il cite le ticket dans
   le nom ou le docblock du TEST, pas dans le nom du fichier.
2. **Remplacer, ne pas empiler.** La livraison qui crée ou approfondit un module retire, dans la même PR, les tests des
   modules superficiels qu'il absorbe.
3. **La preuve d'un retrait est une ablation, par grappe.** Avant de retirer un test qui garde une règle, muter la règle
   en production : un test qui reste doit rougir. Sinon le test se déplace, il ne se supprime pas. Seuls les tests qui ne
   peuvent pas rougir (squelettes, assertions tautologiques) s'en dispensent.
4. **Une règle transversale se garde par un recensement**, pas par une copie par route : planification, routes retirées,
   bornes de longueur, authentification des routes, refus par espace. Le recensement voit aussi la route oubliée.
5. **On teste par l'interface.** Pas de réflexion sur du privé ni de doublure partielle d'un module de l'application : un
   adaptateur factice derrière la couture qui existe (patron `FakeSmsRouter`). Exception : une garde de course qui épingle
   un `FOR UPDATE`, seule preuve possible.

## Conséquences

- La suite décroît là où un module s'approfondit, au lieu de croître à chaque ticket.
- Une refactorisation sans défaut ne casse plus de tests.
- Coût : une PR d'approfondissement est plus longue (ablations, retraits) ; les retraits se lisent dans sa description.
- Les règles sacrées (argent, isolation, empreintes, idempotence) ne perdent un test que si un autre rougit à sa place.

## Application

`.agent/skills/implementing-specs/SKILL.md`, `.agent/skills/test-driven-development/SKILL.md`, `takussan-api/CLAUDE.md`.
