# Passe 015 — Recommandations pour `docs/features.md`

**Deux recommandations nouvelles : FD1 et FD2.** FC1, FC2 et FC3 de la passe 014 sont soldées (voir
`00-summary.md`). Les seize de la passe 013 (FB1, FA1-FA7, FB2-FB9) restent ouvertes et ne sont pas
répétées ([texte intégral](../pass-013-2026-10-14-1023/02-recommendations-features.md)). Leurs
numéros de ligne sont à décaler de +3 à partir de la l.92 : FB1, les notifications push, vise
désormais la l.545.

| ID | Ligne | Objet | Priorité |
|----|-------|-------|----------|
| FD1 | §2.1 l.473 ; §2.6 l.623 | La protection des données d'identité et de revenu s'étend au locataire, à la caution et au revenu du bailleur | Basse — rédactionnelle |
| FD2 | §2.1 l.475 | L'export du droit d'accès porte la fiche client du titulaire | Basse — rédactionnelle |

---

#### FD1 — l.473 et l.623 : le périmètre d'ADR-0070

**Constat.** La l.473 limite le chiffrement au repos, le masquage et la lecture réservée aux
« données bancaires et d'identité des profils et des demandes de passage en agence (RIB, NINEA, n° de
pièce, RIB professionnel) ». Depuis TCK-953 à TCK-956 ([ADR-0070](../../adr/0070-piece-et-revenu-du-locataire-et-de-la-caution-chiffres-masques-lus-sous-step-up.md)),
la même règle couvre aussi :

- le numéro de pièce du client ou locataire ;
- le numéro de pièce et le revenu mensuel de la caution ;
- le revenu mensuel du bailleur.

La valeur claire de ces données est réservée à l'admin de l'agence du sujet et au super-admin
(amendement du 2026-10-19). Elle se lit sous un second facteur récent et chaque lecture est
journalisée.

La l.623 nomme le journal des consultations « depuis la console ». Les lectures claires de
l'application (`customers/{id}/sensitive`, `guarantors/{id}/sensitive`) écrivent dans le même journal,
hors console.

**Proposition.**

- **l.473** : remplacer la parenthèse par « (RIB, NINEA, n° de pièce, RIB professionnel, revenu
  déclaré) et pièce et revenu du locataire et de la caution », et ajouter en fin de ligne « ;
  lecture sous second facteur récent (TCK-601, TCK-953 à TCK-956, ADR-0070) ».
- **l.623** : remplacer « depuis la console » par « depuis la console et des valeurs claires lues
  dans l'application (pièce, revenu) ».

#### FD2 — l.475 : le contenu de l'export

**Constat.** L'archive du droit d'accès porte depuis TCK-956 un fichier `customers.json`. Il contient
les fiches client du titulaire, pièce comprise et en clair, limitées aux colonnes d'identité. La
ligne ne détaille aucun contenu : elle n'est pas fausse. Mais c'est le seul endroit du catalogue où le
titulaire apprendrait que sa pièce, masquée partout ailleurs, lui est rendue.

**Proposition (facultative).** Ajouter avant la parenthèse finale « ; l'archive porte les fiches
client du titulaire, pièce comprise (ADR-0070 § 7) ».
