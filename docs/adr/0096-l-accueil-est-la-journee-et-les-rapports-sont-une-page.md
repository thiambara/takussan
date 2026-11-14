# ADR-0096 — L'accueil de `/app` est la journée de la persona ; une seule page « Rapports » remplace les vues de tableau de bord

- **Statut** : Accepté le 2026-11-10 par le porteur (décision n° 4 (b) ; décision 1 b de la famille 3 ; retour « Aujourd'hui = a » ; décisions n° 10 (a) et n° 12 (a) pour les onglets) — modalités : décisions de la session, à revoir ; **amendé le 2026-11-14**, deux fois (cf. § *Amendement du 2026-11-14 — ce que l'implémentation de TCK-2628 a tranché* et § *Amendement du 2026-11-14 (bis) — l'hôte garde « Alertes », décision du porteur*)
- **Date** : 2026-11-10
- **Tickets** : TCK-2622 (socle et aiguillage), TCK-2623 (lectures de l'accueil), TCK-2624 (accueil de l'admin et du bailleur), TCK-2625 (accueil du locataire, du client et du prestataire), TCK-2596 (« Aujourd'hui », la journée de l'agent), TCK-2626 et TCK-2627 (lectures des rapports), TCK-2628 (page « Rapports »), TCK-2629 (ses onglets Équipe, Impayés, Exports, Alertes) ; TCK-2618 pour la place des entrées
- **Amende** : [ADR-0089](0089-le-menu-de-app-se-derive-du-profil-actif.md) (amendement du 2026-11-10 : le module `analytics` masque des onglets, les dispositions changent) et [ADR-0090](0090-la-coque-de-app-sans-barre-du-haut.md) § 4 (amendement du 2026-11-10 : « Aujourd'hui » ouvre le menu de l'agent)

## Contexte

Relevé sur `dev` (1bce3798a) le 2026-11-10, audits des familles 3 et 5 ([`03-coque-et-accueil.md`](../qa/audit-ux-2026-11/03-coque-et-accueil.md), [`05-commercial.md`](../qa/audit-ux-2026-11/05-commercial.md)) :

- **Deux tableaux de bord coexistent, et le plus pauvre est l'accueil.**
  - `/app` montre quatre tuiles de stock et des raccourcis dérivés des **rôles**, faux pour le client.
  - Les vues `/app/overview/*` (agence, agent, bailleur), rangées sous « Plus › Statistiques », portent ce qui sert à agir : la file « À traiter », les priorités et les visites du jour de l'agent, les graphiques.
- **Indicateurs, Alertes et Exports sont trois pages isolées**, que le module `analytics` des agences masque ensemble ([ADR-0089](0089-le-menu-de-app-se-derive-du-profil-actif.md), amendement du 2026-11-05).
- **Le prestataire a un accueil inventé** (« Explorez les biens »), contre la spec (`docs/features.md` § 2.5), qui ne lui donne pas de tableau de bord.
- **Le locataire et le client ont une page « Ma situation »** qui redit ce que l'accueil devrait dire.

Le porteur a retenu le 2026-11-10 :
- *l'accueil est la journée, une page « Rapports » remplace les vues* ;
- *l'accueil de l'agent est « Aujourd'hui »* ;
- les onglets de l'agent « Aujourd'hui · Demandes · Clients · Messages · Menu » ;
- les onglets de l'admin « Accueil · Argent · Biens · Messages · Menu ».

## Décision

**`/app` rend la journée de la persona du profil actif : ce qui attend un geste, avec ce geste, puis « Ce mois » en liens. Les chiffres et les courbes vivent dans une seule page « Rapports », à onglets par persona.**

1. **L'accueil se choisit par persona, plus par rôles.** La persona est celle d'[ADR-0089](0089-le-menu-de-app-se-derive-du-profil-actif.md) § 2. Un socle commun : la salutation, la date et son résumé, le bandeau de mise en service en une ligne, les bandeaux existants. Puis, par persona :
   - **agent** : `/app` **rend** la page « Aujourd'hui » de TCK-2596. Il n'y a ni route neuve ni redirection. Les priorités et les visites du jour de la vue agent y déménagent ;
   - **admin d'agence** : « À traiter », chaque ligne avec son geste (attribuer, relancer, valider). Cette file quitte la Vue agence. Puis l'équipe aujourd'hui, et « Ce mois » ;
   - **bailleur** : ses demandes en attente, qui quittent la vue bailleur. Puis les loyers du mois et « Ce mois » ;
   - **hôte** : l'accueil de l'admin, réduit à ce qu'une agence `individual` possède (TCK-2624) ;
   - **locataire** : son loyer (montant, échéance, « Payer »), puis son bail. **« Ma situation » est absorbée** ;
   - **client** : ses demandes, visites et réservations en cours. « Ma situation » est absorbée ;
   - **prestataire** : la liste de ses interventions du jour, avec « Commencer » et « Terminé ». **Ce n'est pas un tableau de bord** : le § 2.5 de la spec reste vrai.
2. **Les raccourcis dérivés des rôles disparaissent.** Ce qui menait quelque part y mène par une ligne de « À traiter » ou de « Ce mois ».
3. **« Rapports » est une page, une URL par onglet**, sous une seule entrée de menu. Les onglets par persona :

   | Persona | Onglets |
   |---|---|
   | admin d'agence | Vue d'ensemble · Équipe · Impayés · Exports · Alertes |
   | agent | Vue d'ensemble (portée « Moi / Agence » sous `reports.view_agency`) · Commissions · Pipeline · Exports |
   | bailleur, hôte | Vue d'ensemble · Reversements · Exports |
   | locataire, client, prestataire | **pas de Rapports** |

   Chaque onglet garde la garde de la page qu'il remplace. Un onglet que la persona ne peut pas ouvrir n'est pas rendu, et ne devient jamais un cadenas.
4. **« Rapports » remplace cinq entrées** : Vue agence, Statistiques, Indicateurs, Alertes et Exports.
   - Les anciennes adresses (`/app/overview`, `/app/overview/agency`, `/agent`, `/owner`, `/kpis`, `/alerts`, `/exports`) **redirigent** vers l'onglet équivalent, avec leurs paramètres (portée, période). Un lien de courriel, de notification ou de favori ne casse pas.
   - Une adresse qui mène à un onglet masqué ou interdit mène à la vue d'ensemble. Une persona sans Rapports est menée à `/app`.
5. **Les onglets « Commissions » et « Pipeline » de l'agent sont des analyses.** Ils mènent aux pages de travail (familles 5 et 6) et ne les remplacent pas. **L'onglet « Impayés » de l'admin** lit la même liste que la page des impayés d'« Argent » (famille 6, TCK-2657 et TCK-2660) : un seul composant, deux entrées, et Rapports y ajoute les tranches d'ancienneté. La liste n'est pas recopiée.
6. **Une série par graphique.** Toute seconde série passe d'abord la validation catégorielle des couleurs (`docs/design-guidelines.md`, couleurs de série).

## Conséquences

- **Le catalogue d'[ADR-0089](0089-le-menu-de-app-se-derive-du-profil-actif.md)** perd les entrées `vue-agence`, `statistiques`, `kpis`, `alertes` et `exports`, et gagne `rapports`. Le module `analytics` masque désormais des **onglets**, et non des entrées : voir l'amendement d'ADR-0089 du 2026-11-10.
- **« Tableau de bord » disparaît du menu de l'agent** : c'est la même destination, sous le nom « Aujourd'hui ». Une épingle sur l'ancienne entrée reste valide. Voir l'amendement d'[ADR-0090](0090-la-coque-de-app-sans-barre-du-haut.md) § 4.
- **TCK-617** (tableau de bord et agenda de l'agent cloisonnés) vise `/app/overview/agent`, qui devient l'onglet « Vue d'ensemble » de l'agent et la page « Aujourd'hui ». Ses critères sont à réécrire sur les nouvelles adresses. Sa règle (« les visites d'une autre agence n'y passent plus ») doit tenir sur les deux.
- **Une seule définition de l'occupation du jour** (`Lease::ONGOING_STATUSES`) pour l'accueil du bailleur, l'onglet Vue d'ensemble et la liste des biens (TCK-2626, TCK-2637). Le premier ticket fusionné l'extrait.
- **Le locataire, le client et le prestataire perdent une page**, « Ma situation » ou l'accueil inventé. Rien de ce qu'elle montrait ne se perd : l'accueil le porte.
- Les sept redirections sont des pages à garder, sous `HORS_MENU`, tant qu'un lien ancien peut circuler.

## Options écartées

- **(a) Garder deux tableaux de bord et enrichir l'accueil** : deux endroits pour un même chiffre, et la question « où est la file À traiter ? » sans réponse stable.
- **(c) L'accueil devient le rapport** : on agit le matin, on analyse en fin de mois. Mettre les courbes en tête relègue ce qui attend un geste.
- **Une route `/app/aujourdhui` pour l'agent, redirigée depuis `/app`** : une redirection à chaque arrivée, et deux adresses pour la même page. Convenu entre les familles 3 et 5 : `/app` la rend.
- **Des Rapports pour le locataire** : il n'a rien à analyser. Son loyer et son bail tiennent sur l'accueil.

## Application

- Front : l'aiguillage de `/app` par persona (TCK-2622), la page `/app/reports` et ses onglets (TCK-2628, chemin indicatif), et les redirections.
- Gardes :
  - « aucune destination perdue » d'ADR-0089, étendu aux onglets (jeu d'`href` accessibles avant et après, par persona) ;
  - un test par redirection, paramètres compris ;
  - un test « locataire, client et prestataire : aucune entrée Rapports » ;
  - un test de l'onglet masqué par `analytics`.

## Amendement du 2026-11-14 — ce que l'implémentation de TCK-2628 a tranché

Décisions de la session (mandat du porteur : « selon tes propres recommandations »), à revoir :

1. **L'hôte garde l'onglet « Alertes ».** Il l'ouvrait déjà comme admin de son agence `individual` ; le retirer serait une régression. Ses onglets : Vue d'ensemble · Reversements · Exports · Alertes. *Confirmé par le porteur le 2026-11-14 : amendement suivant.*
2. **Une ancienne adresse lit le masque `analytics` pour choisir sa cible** (`lib/rapports/contexte-serveur.ts`) : elle ne mène jamais à un onglet masqué (§ 4). Les gardes des onglets, elles, ne lisent pas le masque ([ADR-0089](0089-le-menu-de-app-se-derive-du-profil-actif.md), amendement § 3). Conséquence : `analytics` ne barre plus d'entrée dans la prévisualisation du menu de la fiche agence (super-admin), seulement des onglets.
3. **Le § 4 d'[ADR-0090](0090-la-coque-de-app-sans-barre-du-haut.md) est assoupli pour le bailleur et l'hôte** : « Rapports » y est une entrée unique **dans un groupe partagé**, pas un groupe à lui seul.
4. **Les refus de la page vivent dans `lib/rapports/gardes-serveur.ts`**, une table jugée sur le contexte de persona. Le plafond de `scripts/check-auth-interrupts.mjs` descend de 12 à 5, comme pour `garderPageAdmin` (TCK-633) ; le test M2 recoupe la table avec le menu sur toutes les combinaisons.
5. **Une épingle sur `vue-agence`, `statistiques`, `kpis`, `alertes` ou `exports`** est ignorée par le composeur depuis TCK-2628. Ticket de suite : la migrer vers `rapports`, et supprimer les composants morts de l'ancienne vue agence (`AgencyQueues`, `AgencyKpis`, `AgencyActivityFeed`, `AgencyRevenueSnapshot`).

## Amendement du 2026-11-14 (bis) — l'hôte garde « Alertes », décision du porteur

- **Ticket** : TCK-2628 (page « Rapports »).
- **Amende** : le tableau du § 3 (ligne « bailleur, hôte »).
- **Décision** : ao du porteur, 2026-11-14 (« je valide tes recommandations sur tous les points listés »).

**Constat.** Le § 3 donnait à l'hôte les onglets du bailleur : Vue d'ensemble · Reversements · Exports. Or l'hôte est
l'admin d'une agence `individual`, et il ouvre aujourd'hui les alertes de seuil : depuis TCK-284, `/app/overview/alerts`
n'est plus réservée aux agences `standard` (aucune spec ne la restreint, le cadenas était l'ajout). Appliquer le § 3 à la
lettre lui retirait une fonction qu'il a. Le point 1 de l'amendement précédent l'avait tranché en décision de la
session, « à revoir ».

**Décision.**

1. **L'hôte garde l'onglet « Alertes » dans « Rapports ».** Le tableau du § 3 se lit désormais :

   | Persona | Onglets |
   |---|---|
   | bailleur | Vue d'ensemble · Reversements · Exports |
   | hôte (admin d'une agence `individual`) | Vue d'ensemble · Reversements · Exports · Alertes |

2. **Le reste du § 3 est inchangé** : l'onglet garde la garde de la page qu'il remplace, et un onglet que la persona
   ne peut pas ouvrir n'est pas rendu.
