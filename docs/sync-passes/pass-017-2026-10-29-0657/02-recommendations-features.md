# Passe 017 — Recommandations pour `docs/features.md`

**Une recommandation nouvelle : FF1.** FE1 → FE5 (016) sont soldées. Restent ouvertes, et ne sont pas
répétées :

- FD2 (015, facultative) : [texte intégral](../pass-015-2026-10-19-2229/02-recommendations-features.md) ;
- FB1, FA2, FA4 → FA7, FB2 → FB7, FB9 (013) : [texte intégral](../pass-013-2026-10-14-1023/02-recommendations-features.md).

Leurs numéros de ligne ont bougé. FB1 (les notifications push) vise désormais la **l.560**, FB2
(« en temps réel ») la l.282, FB9 (les rôles prédéfinis) la l.538.

| ID | Ligne | Objet | Nature | Priorité |
|----|-------|-------|--------|----------|
| FF1 | §2.12, règles | « Les photos ne sont téléchargées qu'à la publication » : démenti par TCK-2387 | Correction factuelle | Basse |

---

#### FF1 — §2.12 : ce que la règle des photos veut dire

**Constat.** La règle dit : « Les photos ne sont téléchargées qu'à la publication ». Depuis
TCK-2387 :

- `SourcePhotoFingerprinter` télécharge chaque photo source, par le chemin protégé d'`UrlFetcher`
  (SSRF, `robots.txt`) ;
- il la décode en mémoire, en calcule l'empreinte dHash, puis la jette ;
- seule l'empreinte reste (`models-spec.md` §109 `source_photo_hashes`). Rien n'est écrit, ni sur
  disque, ni en base, ni dans les médias.

C'est la contrainte de TCK-2387 (« calculée à la volée et la photo n'est pas conservée »), et c'est le
sens d'ADR-0077 : les photos appartiennent à l'annonceur. La règle du catalogue est donc juste dans son
intention, mais fausse à la lettre. Un lecteur qui la vérifierait dans le trafic sortant y verrait des
téléchargements.

**Proposition.** « **Les photos ne sont conservées qu'à la publication** : avant, seule leur empreinte
(dHash, calculée à la volée sur la photo source, qui n'est jamais écrite) est gardée pour les
rapprochements (TCK-2387) ».

---

**Sans recommandation, dit explicitement :**

- **§2.12, les huit lignes non livrées** (l.784 → 791) : rien à changer. Elles décrivent une cible
  décidée (ADR-0077), et leurs tickets sont ouverts (TCK-2389 → TCK-2395). Elles restent ⚠️
  justifiées jusqu'à leur fusion. Le texte de la l.786 couvre le STOP déjà livré et le retrait public
  à venir, sans dire lequel est fait. Ce n'est pas une erreur : le catalogue décrit la cible.
- **§2.12, les six règles neuves** : conformes au schéma et à `config/radar.php`.
- **l.223** : la ligne omet le solde à la main de la reprise, que FE4 proposait. C'est juste : §107
  le dit décidé (ADR-0039, point 2.9) et non livré. Quand il sera livré, une phrase suffira.
