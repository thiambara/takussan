# ADR-0095 — Takussan vouvoie partout : site public, entrée, publication et `/app`, connecté ou non

- **Statut** : Accepté le 2026-11-10 par le porteur (décision n° 2 (c)), puis **révisé le 2026-11-10** par le porteur (retour sur les points ouverts, n° 4 : *« utilise toujours le vouvoiement »*). La révision **remplace** la règle « le ton suit la session » (tutoiement sans compte, vouvoiement avec) ; voir § *Révision du 2026-11-10*. Modalités : décisions de la session, à revoir.
- **Date** : 2026-11-10
- **Tickets** : TCK-2616 (les mots de l'entrée), TCK-2683 (les derniers textes au tutoiement et la garde) ; la suivent : TCK-2598, TCK-2600, TCK-2601, TCK-2602, TCK-2604, TCK-2605, TCK-2606, TCK-2608, TCK-2611, TCK-2613, TCK-2614, et tous les tickets front des familles 3 à 6
- **Précise** : `docs/design-guidelines.md`, § « Ton & Micro-copy » (sa phrase « Tutoyer sur les surfaces publiques de découverte » est révoquée, TCK-2683)

## Contexte

- La charte (`docs/design-guidelines.md`, § « Ton & Micro-copy ») dit : *s'adresser à l'utilisateur directement (« Vos propriétés »)* et *tutoyer sur les surfaces publiques de découverte (« Près de toi »)*.
- **Le site ne la suit déjà presque plus.** Relevé sur `dev` (1bce3798a) le 2026-11-10 :
  - la famille 1 de l'audit a été livrée **au vouvoiement** (décision 17 de sa vague 1 : TCK-2495, TCK-2503, TCK-2508 l'écrivent) ;
  - dans `takussan-web/src/messages/fr.json`, **5 clés** sur 10 512 tutoient encore, toutes sur l'annuaire et la fiche publique d'agence (`publicProfile`, `publicProfileIndex`) ; aucune chaîne au tutoiement n'est écrite en dur dans `src/` hors maquettes et tests ; aucun gabarit de l'API ne tutoie.
- Les maquettes de l'audit tutoient souvent. Elles ne sont pas une référence de ton.
- La version initiale de cet ADR (décision n° 2 (c)) faisait suivre la voix à la session : tutoiement tant qu'aucun compte n'est ouvert, vouvoiement ensuite, avec des écrans « à double voix » (invitation, porte d'entrée, feuille de publication) qui portaient leurs deux voix dans un même message ICU. Elle supposait un site public au tutoiement, ce que le relevé ci-dessus dément.

## Décision

**Takussan vouvoie partout, sans exception : site public (visiteur connecté ou non), publication sans compte, inscription, connexion, invitation, assistants d'arrivée et `/app`.**

1. **Une seule voix.** Aucun écran, aucun message, aucune notification ne tutoie. La voix ne dépend ni de la session, ni de l'URL, ni du rôle.
2. **Plus d'écran à double voix.** Aucun message ne porte la voix en argument (pas de sélection ICU de voix), et aucun composant n'a besoin de savoir si une session est ouverte pour choisir ses mots.
3. **Les maquettes ne sont pas une référence de ton.** Un ticket qui reprend une maquette au tutoiement l'écrit au vouvoiement, sans le signaler comme un écart.
4. **La langue anglaise n'a pas de voix** ; le wolof est en pause : une clé neuve porte en `wo` le texte français tel quel, et un texte wolof existant ne se réécrit pas.
5. **Les mots, avec la voix.** La même règle bannit le jargon de l'entrée :

   | Mot banni | Mot retenu |
   |---|---|
   | « lead » | « prospect » |
   | « wizard » | « assistant » |
   | « dashboard » | « espace » |
   | « KYC » | « pièces » |
   | « TOTP » | « application d'authentification » |
   | « Valider » | le verbe de l'action |
   | « XOF », à l'affichage | « F CFA » |

   L'API continue de recevoir `XOF`.

## Conséquences

- La charte change : la phrase « Tutoyer sur les surfaces publiques de découverte (« Près de toi », « Pour ton prochain logement ») » est remplacée par « Vouvoyer partout, site public compris ». TCK-2683 porte ce delta de charte.
- Les 5 clés au tutoiement du site public passent au vouvoiement (TCK-2683). Leurs `wo` qui recopient le français suivent ; ceux qui sont écrits en wolof ne changent pas.
- **Une garde empêche le retour du tutoiement** (TCK-2683) : un script qui lit les textes `fr` et les chaînes de `src/` et rougit sur toute forme du tutoiement.
- Les tickets d'entrée qui prévoyaient une double voix (TCK-2598, TCK-2601, TCK-2604, TCK-2606, TCK-2611, TCK-2616) n'ont plus de prédicat de session à écrire : ils vouvoient.
- Le texte des courriels et des SMS, rendus par l'API dans la langue du destinataire ([ADR-0032](0032-l-api-n-ecrit-plus-de-prose.md)), vouvoie lui aussi, compte ou non.

## Options écartées

- **(a) Tutoyer partout**, `/app` compris : un outil de travail que l'on regarde des heures avec des clients et des bailleurs. Écarté par le porteur.
- **(c) Le ton suit la session** (la version initiale de cet ADR) : révoqué le 2026-11-10. Il demandait un prédicat de session dans chaque écran d'entrée et des messages à deux voix, pour un site public qui vouvoyait déjà.
- **Garder le tutoiement sur la seule découverte publique** : la charte le disait, mais le site livré ne le fait plus ; une page dont la voix change selon la surface se lit comme une incohérence.

## Application

- `docs/design-guidelines.md`, § « Ton & Micro-copy » (delta porté par TCK-2683).
- Les 5 clés `fr` (et leurs copies `wo`) : TCK-2683.
- Gardes :
  - `check-i18n` reste vert (parité des trois langues) ;
  - la garde du vouvoiement (TCK-2683), plafond 0.

## Révision du 2026-11-10 — le vouvoiement partout remplace « le ton suit la session »

- **Décision du porteur** (2026-11-10, retour sur les points ouverts, n° 4) : *« utilise toujours le vouvoiement »*, précisé par la session comme « site public (connecté ou non), publication sans compte, inscription, entrée, `/app` ».
- **Ce qu'elle remplace** : la décision n° 2 (c) de l'audit (*tutoiement jusqu'à la création du compte, vouvoiement dans `/app`*) et les § 1 à 5 de la version initiale — une seule source de voix (le prédicat de session), le changement de voix à l'ouverture du compte, les écrans à double voix et leur sélection ICU, le site public au tutoiement (§ 4, recommandation alors à confirmer), et l'écran « Ton annonce est en ligne » au vouvoiement (§ 5, qui reste vrai).
- **Ce qu'elle garde** : le vouvoiement de `/app` et la liste des mots bannis (ancien § 6, désormais § 5).
