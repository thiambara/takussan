# ADR-0112 — Le bailleur d'un bien d'agence confirme ses visites, ou en propose un autre créneau, seulement quand l'agence le lui confie

- **Statut** : Accepté le 2026-11-15 (le porteur a demandé « écris les tickets pour tous les manques, implémente tout » — la proposition ci-après vaut acceptation, modalités à revoir) — proposé le 2026-11-15 (écrit avec les tickets des manques de l'audit des maquettes de `/app`, famille 3) — décision de la session, **à valider par le porteur** avant l'implémentation de TCK-2849
- **Date** : 2026-11-15
- **Tickets** : TCK-2849 (API), TCK-2869 (accueil du bailleur)
- **Amende** : [ADR-0031](0031-personnel-de-l-agence-et-cloisonnement-des-bailleurs.md), pour la seule règle des visites d'un bien d'agence (TCK-590 : aucun bailleur n'écrit une visite) — une exception sous réglage, rien d'autre
- **S'appuie sur** : [ADR-0031](0031-personnel-de-l-agence-et-cloisonnement-des-bailleurs.md) (le personnel de l'agence et le cloisonnement des bailleurs ; règle des visites de TCK-590) ; décision 7 de la famille « coque et accueil » (TCK-2624 : seul l'hôte confirme)

## Contexte

La maquette validée par le porteur le 2026-11-11 (`app-accueil`, approche a, écran « Bailleur », e2) donne au
bailleur, sur une visite à confirmer d'un de ses biens, deux gestes : « Autre créneau » et « Confirmer ».
Le porteur a demandé, le 2026-11-15, que **tous** les manques de l'audit soient traités, y compris ceux
écartés « par décision ».

Mesuré le 2026-11-15 sur `dev` (8c60f4c58) :

- `PropertyVisitController::confirm` et `update` exigent `PropertyVisitPolicy::agitPourLeBien` :
  sur un bien **d'agence**, seul le personnel actif de l'agence agit (TCK-590, passe 3 B2″ : confirmer
  fait partir le SMS au visiteur ; le bailleur, l'agent parti et l'agent suspendu confirmaient).
- La branche `landlordWrites` de la Policy ne décide plus que pour un bien **sans agence** (l'hôte).
- TCK-2624 a ratifié cette règle à l'écran (décision 7) : le bailleur d'un bien d'agence voit « Voir ».

La maquette et la règle se contredisent. Donner le geste à tout bailleur rouvrirait le défaut que TCK-590
a fermé : un bailleur qui confirme dans le dos de l'agence un créneau que l'agent n'a pas.

## Décision

1. **Un réglage d'agence** : « Les bailleurs confirment les visites de leurs biens » (booléen, **faux par
   défaut**), posé par un administrateur de l'agence. Faux, rien ne change : décision 7 et TCK-590
   restent la règle.
2. **Vrai**, le bailleur **actif** (profil `active` dans l'agence du bien, `BailleurDuBien::est`) d'un bien
   peut, sur une visite `scheduled` de ce bien :
   - la **confirmer** (même chemin, même SMS, même garde de chevauchement que le personnel) ;
   - **proposer un autre créneau** (la confirmation qui accepte `scheduled_at`, TCK-2624).
   Il ne peut ni l'annuler, ni l'attribuer, ni écrire son compte rendu.
3. Un bailleur suspendu (`blocked`), inactif ou parti ne confirme jamais, réglage ou non.
4. L'agent attribué à la visite est **notifié** de la confirmation ou du nouveau créneau posé par le
   bailleur, avec son nom : l'agence n'apprend jamais un rendez-vous par le visiteur.
5. Le journal (`activity`) nomme le bailleur comme auteur du geste.

## Conséquences

- `PropertyVisitPolicy::agitPourLeBien` gagne une branche explicite, lue sur le réglage de l'agence du bien.
- Le réglage vit avec les autres réglages de l'agence (lieu exact au choix de TCK-2849, migration comprise).
- L'accueil du bailleur montre « Autre créneau » et « Confirmer » seulement quand l'API les permet
  (capacité ou réponse) ; sinon « Voir », comme aujourd'hui.

## Options écartées

- **Le geste pour tout bailleur, sans réglage** : rouvre TCK-590 (B2″) ; écarté.
- **Garder « Voir » seul** (décision 7 telle quelle) : laisse la maquette validée sans suite ; c'est l'état
  d'aujourd'hui, que le porteur a demandé de lever.
