# ADR-0082 — L'empreinte des refus du Radar a sa propre clé, distincte d'`APP_KEY`, et une lecture la reconnaît sous toutes les clés où elle a pu être écrite

- **Statut** : Accepté le 2026-10-30 par le porteur
- **Date** : 2026-10-30
- **Tickets** : [TCK-2414](../backlog/tickets/TCK-2414-radar-cle-dediee-des-empreintes-de-refus.md) ; suite hors Radar : [TCK-2430](../backlog/tickets/TCK-2430-empreintes-sous-app-key-hors-radar.md)
- **Dépend de** : [ADR-0077](0077-le-radar.md) §9 (empreinte HMAC du refus conservée), [ADR-0044](0044-donnees-personnelles-chiffrement-journal-d-agence-registre-des-droits.md) (une empreinte HMAC se pose « sous une clé **distincte** d'`APP_KEY`, par ADR »)

## Contexte

Mesuré le 2026-10-30 sur `feat/radar-cle-empreinte-dediee` :

- Après un STOP, le Radar purge le numéro en clair d'un annonceur et ne garde que son empreinte,
  `radar_advertisers.phone_hmac` (ADR-0077 §9). La politique de confidentialité promet de ne jamais
  recontacter cette personne (`privacy.ts`).
- Cette empreinte se calculait sous une clé **dérivée d'`APP_KEY`** (`'radar-phone|'.APP_KEY`).
  `config/radar.php` déclarait bien `phone_hmac_key`, mais à `null` en dur : aucune variable ne la
  posait.
- Faire tourner `APP_KEY` rendait donc toutes les empreintes méconnaissables. Le numéro en clair
  n'existant plus, aucune empreinte ne se recalcule. La saisie suivante du même numéro créait un
  annonceur neuf, sans refus : **le Radar redémarchait qui avait dit STOP.**
- Une clé dédiée seule ne règle rien. La poser sur un parc existant produit exactement la même
  perte, pour la même raison : on ne recalcule pas une empreinte sans le numéro.
- Le Radar a deux HMAC sous `APP_KEY` : l'empreinte des refus et la signature du lien de
  réclamation (`ClaimLinks`). Le reste du Radar hache sans clé.

## Décision

**L'empreinte des refus du Radar se calcule sous `RADAR_PHONE_HMAC_KEY`, une clé distincte
d'`APP_KEY`. Une écriture se fait sous la clé courante ; une lecture cherche l'empreinte sous la clé
courante, sous chaque ancienne clé (`RADAR_PHONE_HMAC_PREVIOUS_KEYS`) et sous le repli sur `APP_KEY`
et `APP_PREVIOUS_KEYS`. Quand plusieurs lignes répondent, un refus gagne toujours.**

Le détail, décision par décision (retenu / écarté / raison) :

1. **Clé dédiée, avec repli sur `APP_KEY` quand elle est vide** / clé obligatoire, qui fait
   échouer le démarrage / rien ne casse avant que le porteur la pose. Vide, l'empreinte est
   exactement celle d'avant (`'radar-phone|'.APP_KEY`, à ne jamais changer).
2. **Signal par la sonde de santé `radar_phone_key`**, `degraded` hors `local` et `testing` /
   garde de démarrage, ou ligne de `./dev.sh doctor` / la garde couperait la préproduction dès la
   fusion ; `doctor` lit le `.env` du poste, où la clé n'est pas due. `/api/health` reste en 200.
3. **Le repli sur `APP_KEY` et `APP_PREVIOUS_KEYS` reste reconnu, même clé dédiée posée** / ne
   reconnaître que les clés listées / la pose de la clé sur un parc existant ne perd aucun refus,
   et une rotation d'`APP_KEY` est sûre dès aujourd'hui si l'ancienne reste dans
   `APP_PREVIOUS_KEYS`.
4. **Le lien de réclamation (`ClaimLinks`) reste signé sous `APP_KEY`**, et reconnaît
   `APP_PREVIOUS_KEYS` comme les URL signées de Laravel / le signer sous la clé dédiée / c'est un
   secret de signature, qui doit pouvoir tourner après une fuite sans emporter les refus. Un lien
   tué par une rotation est acceptable : le message suivant en porte un neuf, et le code SMS reste
   exigé.
5. **Une commande, `radar:rehash-phones`**, réécrit sous la clé courante les empreintes dont le
   numéro est connu, et compte le reste / s'en remettre à la seule réécriture paresseuse (une ligne
   retrouvée sous une ancienne clé est réécrite à la volée) / seule la commande dit combien
   d'empreintes dépendent encore d'une ancienne clé. Elle compte en conflit, sans rien écrire :
   - une empreinte qu'une autre ligne porte déjà ;
   - une ligne sans refus qui masque le refus d'une autre ligne du même numéro.
6. **`findOrCreate()` cherche la clé courante seule tant qu'il n'existe aucune ancienne clé**, et
   sinon toutes, refus d'abord / une seule requête ordonnée dans tous les cas / sans clé dédiée,
   la suite de requêtes est inchangée. Les deux épreuves de course de `RadarListingAdvertiserTest`
   s'accrochent à son texte SQL.

**Un refus gagne toujours.** Deux lignes peuvent répondre pour un même numéro si une ancienne clé a
été oubliée pendant une rotation, puis relistée. Ces lectures rendent alors la ligne refusée :
`findOrCreate()` (refus, puis clé courante, puis la plus ancienne), `refusedAmong()` (refus
seulement) et le rapprochement par téléphone (toutes les lignes). Une empreinte n'est jamais
réécrite sur une valeur qu'une autre ligne porte déjà : ni à la lecture, ni à la révocation, ni par
la commande.

### Consigne de rotation

- **Une ancienne clé ne se retire jamais.** Un refus est définitif, son numéro est purgé, et rien ne
  dit sous quelle clé il a été écrit : `refusals_without_number` ne redescend pas. Chaque rotation
  ajoute une clé pour toujours.
- **On ne fait tourner `RADAR_PHONE_HMAC_KEY` qu'après une fuite.** L'ancienne valeur passe dans
  `RADAR_PHONE_HMAC_PREVIOUS_KEYS` (séparées par des virgules), la neuve dans
  `RADAR_PHONE_HMAC_KEY`, puis on lance `php artisan radar:rehash-phones`.
- **Faire tourner `APP_KEY` ne demande rien au Radar** si l'ancienne reste dans `APP_PREVIOUS_KEYS`,
  ce qu'ADR-0044 exige déjà pour les colonnes chiffrées. Les empreintes écrites sous le repli avant
  la pose de la clé dédiée y restent reconnues. **Il n'y a pas lieu de recopier `APP_KEY` dans
  `RADAR_PHONE_HMAC_PREVIOUS_KEYS`** : ce serait un second exemplaire du même secret.
- **Une valeur dédiée ne peut pas remplacer le repli pour les refus déjà écrits.** Leur empreinte
  ne se recalcule pas sans le numéro ; seule la clé qui l'a écrite la retrouve.
- **La valeur ne se perd jamais.** Perdue, elle a l'effet d'une rotation sans ancienne clé. Elle se
  range hors du serveur, comme `APP_KEY` (`docs/infra/hebergement.md`).

## Conséquences

- **Un secret de production de plus**, à poser avant le premier démarchage de la production
  (TCK-517) et à ne jamais perdre.
- **La liste des anciennes clés ne fait que croître.** Une lecture de refus coûte un `whereIn` sur une
  empreinte par clé reconnue (quatre dans le cas courant) ; l'index unique de `phone_hmac` la sert.
- **Le repli sur `APP_KEY` vit pour toujours** dans `RadarPhone`, même quand la clé dédiée est posée.
- **Un lien de réclamation peut mourir** à une rotation d'`APP_KEY` dont l'ancienne n'est pas gardée.
- **Le patron sert ailleurs** : écrire sous la clé courante, lire sous toutes, et faire gagner l'état
  le plus protecteur. TCK-2430 le reprend pour les empreintes hors Radar (désinscription des
  alertes, crédit de bienvenue).

## Application

- `App\Support\RadarPhone` : `hmac()` (écriture), `hmacs()` (lecture), `hasDedicatedKey()`.
- `config/radar.php` : `phone_hmac_key`, `phone_hmac_previous_keys` ; `.env.example` et `.env.docker`
  déclarent les deux clés (`scripts/check-env-parity.mjs`).
- Lectures : `RadarAdvertiserDirectory::findOrCreate()` et `refusedAmong()`,
  `RadarMatcher::listingsByPhone()`. Réécriture gardée par l'unicité : `RadarAdvertiserDirectory`,
  `AdvertiserRevocation::apply()`.
- `App\Services\Radar\ClaimLinks` : `APP_KEY` et `APP_PREVIOUS_KEYS`.
- Sonde `radar_phone_key` de `HealthcheckService`, et sa tuile sur la page Santé.
- Commande `radar:rehash-phones` (`App\Console\Commands\RadarRehashPhones`).
- Épreuves : `RadarPhoneKeyTest`, `RadarRehashPhonesTest`, `RadarPhoneTest`, `ClaimLinksTest` et
  `HealthcheckRadarPhoneKeyTest`, chacune passée par une ablation.
