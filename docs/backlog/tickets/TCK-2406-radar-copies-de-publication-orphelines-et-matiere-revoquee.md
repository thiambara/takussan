---
id: TCK-2406
title: "Radar : les copies de publication sans ligne media, et la matière collectée d'une annonce publiée puis révoquée"
status: done
phase: P1
family: back
estimate: S
wave: 80
created: 2026-10-29
updated: 2026-10-30
depends_on: [TCK-2391]
blocks: []
spec_refs:
  features:
    - "docs/features.md#212-radar--acquisition-dannonces"
  models: []
tags: [api, radar, donnees-personnelles, purge, adr-0077]
---

## Objectif utilisateur

Ce que la purge du Radar (TCK-2391) laisse volontairement derrière elle ne s'accumule pas sans que personne l'ait décidé.

## Contexte

Deux écarts relevés par TCK-2391, mesurés le 2026-10-29 sur `feat/radar-revocation-purge` :

1. **Les copies de la publication sans ligne `media`.** `RadarPublisher::publish()` copie la réserve dans la collection `photos` des biens, sur le disque **public**. Une transaction défaite par une exception attrapée est nettoyée (`discardFiles`), mais une requête coupée par `max_execution_time` (60 s) laisse des fichiers sous le dossier d'un média jamais commité. `DefaultPathGenerator` range sous `{id du média}/` : il n'existe aucun préfixe par bien ou par annonce à balayer, et le disque public porte des milliers de dossiers numériques légitimes. `RadarOrphanFiles` (TCK-2391) ne balaie que le disque privé. L'écart est borné par `radar.publish.max_photos` (30) par requête coupée.
2. **La matière collectée d'une annonce publiée.** ADR-0077 §9 et `privacy.ts` § 6 ne purgent que les annonces « jamais publiées ». Après une révocation, le texte brut, les captures, `extracted` (numéros écartés compris) et le numéro en clair de l'annonceur restent tant que ses annonces publiées existent ; seule leur preuve d'accord suit la règle des 3 ans.

## Contraintes strictes (métier)

- Le porteur a retenu le 2026-10-29 la lettre d'ADR-0077 §9 pour TCK-2391 et demande l'éventuelle purge de la matière d'une annonce publiée **3 ans après le retrait**, avec la preuve. Elle change l'ADR-0077 §9 et le texte légal (avocat) : rien ne s'implémente sans cet accord.

## Delta à produire

- [x] (1) Choisir : un marqueur d'écriture avant la copie (une ligne qui nomme les identifiants de média attendus, effacée au commit), ou un chemin par bien pour la collection `photos` des biens du Radar, puis un balayage qui n'en dépend que.
- [x] (2) Purger la matière collectée d'une annonce publiée 3 ans après le retrait (`offline_since`, TCK-2391), avec la preuve ; en tirer l'ADR, `privacy.ts` § 6 et la règle de `RadarPurger`.

## Critères d'acceptation

- [x] AC1 — Un fichier de copie laissé par une publication coupée est effacé par la purge.
- [x] AC2 — Après le retrait du dernier bien et la durée retenue, la matière collectée d'une annonce publiée est effacée (si le porteur le décide).

## Hors périmètre

- La suppression du compte créé par le Radar (voie existante de `features.md` § 2.1).

## Notes d'implémentation

- **Re-mesure.** L'original d'une copie ne va pas sur le disque public : la collection `photos` d'un bien range l'ORIGINAL sur le
  disque PRIVÉ et les conversions sur le public (TCK-539). Avant ce ticket, `RadarOrphanFiles` balayait donc déjà l'original
  d'une copie orpheline (`{id}/` à la racine du privé) ; seule la vignette synchrone (`{id}/conversions/`, disque public) restait.
- **(1) Chemin, pas marqueur d'écriture.** `RadarCopyPathGenerator` (enregistré pour `Property` dans
  `media-library.custom_path_generators`) range sous `publications/{id du média}/` tout média qui porte la propriété
  `publication_copy`, que `RadarPublisher` pose à la copie. Le marqueur vit avec la ligne parce que le chemin se recalcule à
  chaque lecture. `RadarOrphanFiles::sweepPublicationCopies()` balaie ce seul préfixe sur les deux disques, avec la règle du
  disque privé (identifiant sans ligne, dernier fichier de plus d'une heure) ; compteur `orphan_copies`. Les copies d'avant ce
  ticket restent à `{id}/` : leurs lignes existent, mais les orphelins déjà laissés là (préproduction seule) ne seront jamais
  balayés.
- **(2) Derrière `radar.purge_published_material`, éteint.** Une annonce `published` est due quand une preuve confirmée qui la
  couvre est effacée, qu'aucune autre n'est encore vivante et que son bien n'est pas public (ou n'existe plus). Elle perd ce
  que perd une annonce jamais publiée et passe `purged` ; `property_id` reste. L'annonceur sans autre annonce perd ensuite son
  numéro par la règle existante (4). Compteur `published_listings`. Limite : un bien remis en ligne par le compte APRÈS
  l'effacement de la preuve retient la matière jusqu'à son prochain retrait, puis elle part au passage suivant, sans nouveau
  délai de trois ans (la preuve qui portait le délai n'existe plus). Le délai court du retrait du **dernier** bien que couvre
  l'accord : une preuve qui couvre deux annonces retient la matière de la première tant que la seconde est en ligne
  (vérification adverse, I-1 ; testé).
- ADR-0077 §9 : amendement proposé, marqué non en vigueur. `privacy.ts` § 6 n'est pas modifié : il reste vrai tant que le
  drapeau est éteint.

### Décisions prises en autonomie, à revoir

- **Copies orphelines : un préfixe de chemin** plutôt qu'une ligne témoin écrite avant la copie. Écartée : la ligne témoin, car
  l'identifiant du média n'existe qu'à l'insertion, dans la transaction, et il faudrait une écriture hors transaction. Le
  préfixe ne demande ni table ni migration. **Il ne se défait pas en retirant la ligne de config** (vérification adverse,
  I-2) : les copies déjà publiées verraient leur chemin recalculé vers `{id}/`, où il n'y a aucun fichier (404, et une
  suppression laisserait les fichiers sous `publications/`). La ligne de `config/media-library.php`, `MARKER` et `DIRECTORY`
  sont porteurs tant qu'une copie existe ; un retour arrière demande une commande qui déplace les fichiers et retire le
  marqueur.
- **Nom du préfixe : `publications/`**, neutre. Écarté : `radar/`, car le préfixe paraît dans l'URL publique de la vignette et
  dirait l'origine du bien à tout visiteur.
- **Matière d'une annonce publiée : codée, mais éteinte par défaut.** Écarté : l'allumer, car l'effacement est irréversible,
  change la lettre d'ADR-0077 §9 et le texte légal, et le ticket le subordonne à l'accord du porteur et à l'avocat.
- **Le drapeau est une valeur de `config/radar.php`, pas une variable d'environnement.** Écarté : `env()`, car le fichier n'en
  lit aucune (parité `.env.example`), et allumer le drapeau doit passer par la PR qui change `privacy.ts`.
- **Déclencheur « avec la preuve »** : la dernière preuve effacée, plutôt qu'un délai propre à l'annonce. Écarté : une colonne de
  retrait par annonce, car il faudrait une migration pour un délai que `offline_since` porte déjà.

### Prérequis du porteur (hors code)

- Décider d'allumer `radar.purge_published_material`. Si oui, dans la même PR : faire relire par l'avocat, modifier
  `privacy.ts` § 6 (ligne proposée : « **Annonces relevées ailleurs puis publiées** : le contenu relevé est effacé avec la preuve
  de votre accord, au plus tard 3 ans après le retrait du dernier des biens que couvre votre accord »), faire avancer `VERSION_DOCUMENTS`, et passer l'amendement d'ADR-0077 §9
  « en vigueur ».
