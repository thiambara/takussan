# ADR-0086 — Les coûts du socle IA se comptent en dollars, sans nombre de décimales figé ; le franc CFA n'est qu'un affichage

- **Statut** : Accepté le 2026-10-31 par le porteur.
- **Date** : 2026-10-31
- **Ticket** : [TCK-2448](../backlog/tickets/TCK-2448-catalogue-des-modeles-ia-en-console.md), qui change déjà le chemin des tarifs
- **Amende** : [ADR-0076](0076-le-socle-ia.md) (coût d'un appel et budgets) et [ADR-0085](0085-un-modele-se-regle-dans-la-console-un-fournisseur-dans-le-deploiement.md) point 1 (tarifs du catalogue)

## Contexte

Mesuré sur `dev` `b5e32f82c` le 2026-10-31 :

- Les fournisseurs facturent en dollars. `AiCostCalculator::estimate()` convertit pourtant le coût en XOF à chaque appel, par `config('ai.usd_to_xof')`, et l'arrondit à 2 décimales. `ai_calls.cost_estimate` ne garde que ce résultat.
- Les plafonds sont en XOF : `ai_usage_settings.daily_budget_xof`, `ai.budgets.daily_global_xof`, `ai.budgets.daily_per_agency_xof`, et `dailyBudgetXof()` de chaque usage. Le taux décide donc du moment où un appel est bloqué.
- Le taux par défaut est de 600 XOF pour 1 USD. Le relevé le plus récent trouvé donne 584,29 XOF au 2026-10-19, soit un écart d'environ 3 %.
- Le coût se calcule en `float` PHP, et `AiBudget` compare des `float`.
- `origin/preview` n'a pas la table `ai_calls`, et l'API n'a jamais servi en production : aucune ligne de coût n'est à reprendre hors des bases de développement.

Le prix d'une requête peut devenir très petit : un modèle à 0,00000000004 $ par requête n'a rien d'absurde. Toute colonne à décimales fixes l'arrondirait un jour à 0, et le budget ne compterait plus rien.

## Options envisagées

**Pour la devise :**

1. Garder le XOF : rejeté. Le taux reste dans chaque ligne et chaque blocage.
2. Coûts en dollars, plafonds en XOF : rejeté. Le taux déciderait encore du blocage.
3. **Coûts et plafonds en dollars, XOF à l'affichage seulement : retenu.**

**Pour la précision :**

1. Décimales fixes larges, comme `decimal(20,10)` : rejeté. Cela repousse le problème.
2. Entier en sous-unité (nanodollar) : rejeté. C'est le même choix, caché dans l'unité.
3. **`numeric` PostgreSQL sans précision déclarée : retenu.** Le dépôt n'a qu'un moteur (ADR-0020), et ce type garde chaque chiffre décimal.

## Décision

1. **Tout coût et tout plafond du socle IA est en dollars US** : coût d'un appel, plafonds d'usage, global et par agence, tarifs du catalogue.
2. **Aucun nombre de décimales n'est choisi pour stocker de l'argent IA.** Les colonnes sont en `numeric` sans précision (`rawColumn(..., 'numeric')`).
3. **Aucun `float` PHP ne porte ces montants.**
   - Ils circulent en chaînes décimales. Le calcul passe par `bcmath`, déjà exigé par le `Dockerfile` et par `smoke-api.sh`, avec une échelle assez grande pour ne rien perdre : celle du tarif, plus 6 pour la division par un million.
   - Le modèle Eloquent ne les caste pas en `decimal:N`, qui impose un nombre de décimales.
   - Les sommes et comparaisons se font en SQL ou par `bccomp`.
   - Les tarifs de `config/ai.php` s'écrivent en chaînes.
4. **Le XOF n'existe qu'à l'affichage.**
   - `AI_USD_TO_XOF` ne sert qu'à montrer une équivalence, présentée comme approximative (« ≈ »). Un taux périmé ne fausse aucune donnée ni aucun blocage.
   - Une dépense passée change légèrement d'équivalent quand le taux change : c'est accepté.
5. **L'arrondi n'arrive qu'à l'écran.** Un montant minuscule s'affiche avec assez de chiffres significatifs pour ne pas se lire 0, et jamais arrondi en base.
6. **Aucune reconversion de l'historique.** Il n'y a rien à reprendre hors des bases de développement.

## Conséquences

- La dépense enregistrée se compare directement à la facture du fournisseur.
- Un modèle moins cher que tout ce qu'on connaît aujourd'hui ne demande ni migration ni changement de code.
- `numeric` sans précision est propre à PostgreSQL : assumé (ADR-0020).
- Les montants passent en chaînes dans le code et le JSON : tout passage par `(float)` réintroduit l'arrondi. C'est le risque principal de ce choix, d'où la garde demandée par le ticket.
- Le plafond se saisit en dollars dans la console, avec son équivalent en XOF à côté.
- **Cela ne dit pas quand un fournisseur change ses prix.** Cette question reste ouverte, le porteur la reprendra.

## Application

TCK-2448 : migrations, `AiCostCalculator`, `AiBudget`, tableaux de bord IA et Radar, évaluation, console. Une garde refuse le retour d'un cast `decimal:N` ou d'un `(float)` sur ces montants.
