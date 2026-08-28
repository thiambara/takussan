<?php

namespace App\Services\Public;

use App\Models\Enums\ContractType;
use App\Models\Property;
use App\Models\Review;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use InvalidArgumentException;

/**
 * Les CHIFFRES d'une page d'index public — TCK-436.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE CLASSE PLUTÔT QUE `withCount()` SUR CHAQUE LIGNE
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Un index rend N profils, et chacun porte quatre agrégats : le volume du portefeuille, sa
 * répartition location/vente, les villes où il opère, la note moyenne. Écrits en accesseur ou en
 * relation chargée par ligne, ce sont **4N requêtes** — le N+1 classique, qui ne rougit nulle part
 * et se voit seulement en production.
 *
 * Les trois méthodes ci-dessous prennent la page ENTIÈRE d'identifiants et rendent trois tables
 * indexées par identifiant : **trois requêtes, quel que soit N**.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * LE NOM DE COLONNE EST UNE VALEUR D'ENTRÉE, ET IL EST DONC VÉRIFIÉ
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Agences et agents ne diffèrent que par la colonne qui rattache un bien à leur profil
 * (`properties.agency_id` vs `properties.user_id`). Cette colonne part dans du SQL brut
 * (`selectRaw`, `groupBy`), et les deux seuls appelants passent des littéraux. *Une garantie qui
 * repose sur la discipline des appelants n'est pas une garantie* — d'où
 * {@see self::COLONNES_DE_RATTACHEMENT} et le refus explicite de tout le reste.
 */
final class PublicProfileFacts
{
    /**
     * Les deux seules colonnes de rattachement admises.
     *
     * ⚠ Une liste blanche, pas un `preg_match` sur la forme d'un identifiant : ici l'ensemble des
     * valeurs légitimes est fini et connu, et la liste blanche est alors la garde exacte plutôt
     * qu'une approximation.
     *
     * @var array<int,string>
     */
    public const COLONNES_DE_RATTACHEMENT = ['agency_id', 'user_id'];

    /**
     * Combien de villes au plus sont rendues par profil.
     *
     * L'index sert à répondre à « qui opère dans ma ville » ; au-delà de trois villes, la liste
     * cesse d'informer et devient du bruit dans une carte. Le `city` PRINCIPAL est la première de
     * la liste, c'est-à-dire celle où le profil publie le plus.
     */
    public const VILLES_PAR_PROFIL = 3;

    /**
     * Volume, répartition location/vente et villes du portefeuille public, par profil.
     *
     * ⚠ **Les villes viennent du PORTEFEUILLE, jamais de l'adresse personnelle du profil.** Les
     * fiches `/agents/{slug}` et `/agencies/{slug}` dérivent leur `city` de `$profil->addresses`,
     * c'est-à-dire de l'adresse postale de la personne ou de l'établissement. Sur un index —
     * paginé, anonyme, énumérable — ce serait publier en vrac la commune de résidence de chaque
     * publieur, alors que la question posée par le visiteur porte sur les BIENS. Les villes
     * ci-dessous sont celles des annonces publiées : aucune donnée personnelle neuve n'entre dans
     * l'index par ce chemin, et l'information est celle qu'on cherchait.
     *
     * @param  'agency_id'|'user_id'  $rattachement
     * @param  array<int,int>  $ids
     * @return array<int, array{portfolio_count:int, rent_count:int, sale_count:int, cities:array<int,string>}>
     */
    public static function portefeuilles(string $rattachement, array $ids): array
    {
        $colonne = self::colonneVerifiee($rattachement);

        $vide = [
            'portfolio_count' => 0,
            'rent_count' => 0,
            'sale_count' => 0,
            'cities' => [],
        ];

        if ($ids === []) {
            return [];
        }

        /** @var array<int, array{portfolio_count:int, rent_count:int, sale_count:int, cities:array<int,string>}> $faits */
        $faits = array_fill_keys($ids, $vide);

        $parContrat = Property::query()
            ->publicPortfolio()
            ->whereIn("properties.{$colonne}", $ids)
            ->selectRaw("properties.{$colonne} as profil_id, properties.contract_type as contrat, COUNT(*) as total")
            ->groupBy("properties.{$colonne}", 'properties.contract_type')
            ->get();

        foreach ($parContrat as $ligne) {
            $id = (int) $ligne->profil_id;
            if (! array_key_exists($id, $faits)) {
                continue;
            }

            $total = (int) $ligne->total;
            $faits[$id]['portfolio_count'] += $total;

            // `contract_type` est nullable en base : un bien sans contrat compte dans le volume
            // total sans entrer dans l'une des deux répartitions. Les additionner pour retrouver
            // le total serait donc faux — c'est `portfolio_count` qui fait foi.
            if ($ligne->contrat === ContractType::Rent->value) {
                $faits[$id]['rent_count'] += $total;
            } elseif ($ligne->contrat === ContractType::Sale->value) {
                $faits[$id]['sale_count'] += $total;
            }
        }

        // ⚠ Jointure explicite plutôt que `whereHas('address')` : il faut la VALEUR de `city`, pas
        // seulement son existence. Toutes les colonnes sont qualifiées — `properties` et
        // `addresses` portent toutes deux `id`, `created_at`, `updated_at`, et PostgreSQL refuse
        // une référence ambiguë au lieu d'en choisir une en silence (CLAUDE.md, piège n°7).
        $parVille = Property::query()
            ->whereIn('properties.id', self::biensEligibles($colonne, $ids))
            ->join('addresses', function ($join) {
                $join->on('addresses.addressable_id', '=', 'properties.id')
                    ->where('addresses.addressable_type', '=', Property::class);
            })
            ->selectRaw("properties.{$colonne} as profil_id, addresses.city as ville, COUNT(*) as total")
            ->groupBy("properties.{$colonne}", 'addresses.city')
            // Un ordre TOTAL : `total` seul laisse deux villes à égalité dans un ordre que le
            // moteur choisit, et la « ville principale » d'un profil changerait alors d'une
            // requête à l'autre sans qu'une ligne ait bougé (même leçon que l'ordre du sitemap,
            // TCK-431).
            ->orderByDesc('total')
            ->orderBy('addresses.city')
            ->get();

        foreach ($parVille as $ligne) {
            $id = (int) $ligne->profil_id;
            $ville = (string) $ligne->ville;
            if (! array_key_exists($id, $faits) || $ville === '') {
                continue;
            }
            if (count($faits[$id]['cities']) >= self::VILLES_PAR_PROFIL) {
                continue;
            }
            $faits[$id]['cities'][] = $ville;
        }

        return $faits;
    }

    /**
     * Note moyenne et nombre d'avis APPROUVÉS, par profil.
     *
     * `average` est `null` — et non `0` — quand il n'y a aucun avis : une moyenne de zéro est une
     * note très mauvaise, une moyenne absente est une absence. Les deux fiches publiques prennent
     * déjà cette décision (`PublicAgencyController::show()`), et l'index la reconduit.
     *
     * @param  class-string  $reviewableType
     * @param  array<int,int>  $ids
     * @return array<int, array{average:float|null, count:int}>
     */
    public static function avis(string $reviewableType, array $ids): array
    {
        if ($ids === []) {
            return [];
        }

        /** @var array<int, array{average:float|null, count:int}> $faits */
        $faits = array_fill_keys($ids, ['average' => null, 'count' => 0]);

        $lignes = Review::query()
            ->where('reviewable_type', $reviewableType)
            ->where('is_approved', true)
            ->whereIn('reviewable_id', $ids)
            ->selectRaw('reviewable_id, COUNT(*) as total, AVG(rating) as moyenne')
            ->groupBy('reviewable_id')
            ->get();

        foreach ($lignes as $ligne) {
            $id = (int) $ligne->reviewable_id;
            if (! array_key_exists($id, $faits)) {
                continue;
            }
            $faits[$id] = [
                'average' => round((float) $ligne->moyenne, 1),
                'count' => (int) $ligne->total,
            ];
        }

        return $faits;
    }

    /**
     * L'agence de rattachement d'un agent, DÉRIVÉE DE SON PORTEFEUILLE PUBLIC — TCK-436.
     *
     * ⚠ **Ce n'est pas la source que `PublicAgentController::show()` emploie**, et l'écart est
     * mesuré, pas subi. `User::agency()` passe par `AgentProfile` (TCK-142) ; relevé le 2026-08-28
     * sur la base de développement :
     *
     *     publieurs publics porteurs d'un AgentProfile ........................  0 / 44
     *     publieurs publics dont au moins un bien porte un `agency_id` ....... 44 / 44
     *
     * Prendre `User::agency()` aurait donc rendu `agency: null` pour **la totalité** des profils
     * de l'index, c'est-à-dire livrer un champ mort en croyant livrer une information. La colonne
     * `properties.agency_id` est celle sous laquelle l'annonce est réellement publiée — c'est
     * d'ailleurs le couple que la fiche de bien affiche déjà côte à côte (`PropertyAgentCard` :
     * le publieur, puis son agence).
     *
     * *Une source qui rend toujours `null` ne « manque » pas de données : elle mesure autre chose
     * que ce qu'on croit.*
     *
     * @param  array<int,int>  $userIds
     * @return array<int, array{id:int, slug:string, name:string}> indexé par `user_id`
     */
    public static function agences(array $userIds): array
    {
        if ($userIds === []) {
            return [];
        }

        $lignes = Property::query()
            ->whereIn('properties.id', self::biensEligibles('user_id', $userIds))
            ->whereNotNull('properties.agency_id')
            ->join('agencies', 'agencies.id', '=', 'properties.agency_id')
            ->whereNull('agencies.deleted_at')
            ->selectRaw('properties.user_id as profil_id, agencies.id as agence_id, agencies.slug as agence_slug, agencies.name as agence_nom, COUNT(*) as total')
            ->groupBy('properties.user_id', 'agencies.id', 'agencies.slug', 'agencies.name')
            // Ordre TOTAL : à volume égal, `agencies.id` départage — sans quoi l'agence affichée
            // pour un agent qui publie autant sous deux enseignes changerait d'une requête à
            // l'autre, sans qu'une ligne ait bougé.
            ->orderByDesc('total')
            ->orderBy('agencies.id')
            ->get();

        $agences = [];
        foreach ($lignes as $ligne) {
            $id = (int) $ligne->profil_id;
            if (array_key_exists($id, $agences)) {
                continue; // la première rencontrée est la principale, l'ordre ci-dessus fait foi
            }
            $agences[$id] = [
                'id' => (int) $ligne->agence_id,
                'slug' => (string) $ligne->agence_slug,
                'name' => (string) $ligne->agence_nom,
            ];
        }

        return $agences;
    }

    /**
     * Les villes où le catalogue public éligible compte au moins un bien, ordonnées par volume.
     *
     * C'est la FACETTE de l'index : le front n'invente aucune liste de villes, il rend celle-ci.
     * Une liste écrite côté front serait juste le jour où on l'écrit, et le catalogue bouge sans
     * que le dépôt change.
     *
     * @param  'agency_id'|'user_id'  $rattachement
     * @return Collection<int,string>
     */
    public static function villesDuCatalogue(string $rattachement, int $limite = 30): Collection
    {
        $colonne = self::colonneVerifiee($rattachement);

        return Property::query()
            ->whereIn('properties.id', self::biensEligibles($colonne))
            ->join('addresses', function ($join) {
                $join->on('addresses.addressable_id', '=', 'properties.id')
                    ->where('addresses.addressable_type', '=', Property::class);
            })
            ->selectRaw('addresses.city as ville, COUNT(*) as total')
            ->groupBy('addresses.city')
            ->orderByDesc('total')
            ->orderBy('addresses.city')
            ->limit($limite)
            ->pluck('ville')
            ->map(fn ($ville) => (string) $ville)
            ->filter(fn (string $ville) => $ville !== '')
            ->values();
    }

    /**
     * Les identifiants des biens éligibles, EN SOUS-REQUÊTE — et c'est le piège n°7 de PostgreSQL.
     *
     * {@see Property::scopePublic()} écrit ses colonnes SANS les qualifier (`visibility`,
     * `is_test`, `published_at`, `status`). Appliqué à une requête qui joint `agencies` — qui
     * porte elle aussi une colonne `status` — PostgreSQL refuse :
     *
     *     SQLSTATE[42702] column reference "status" is ambiguous
     *
     * MySQL et SQLite en choisissaient une en silence. Mesuré ici le 2026-08-28, sur
     * `agences()` : la jointure sur `addresses` passait (aucune colonne homonyme), celle sur
     * `agencies` non — *deux jointures écrites de la même façon, une seule qui casse.*
     *
     * La sortie est de garder le prédicat dans une requête SANS jointure et de n'en ramener que
     * les identifiants. Qualifier les colonnes de `scopePublic()` aurait corrigé le symptôme au
     * prix d'une hypothèse fausse : que la table ne soit jamais aliasée, chez ses vingt et un
     * autres appelants.
     *
     * @param  array<int,int>|null  $ids  null = tout le catalogue éligible
     * @return Builder<Property>
     */
    private static function biensEligibles(string $colonne, ?array $ids = null): Builder
    {
        $query = Property::query()->publicPortfolio()->select('properties.id');

        if ($ids === null) {
            return $query->whereNotNull("properties.{$colonne}");
        }

        return $query->whereIn("properties.{$colonne}", $ids);
    }

    private static function colonneVerifiee(string $rattachement): string
    {
        if (! in_array($rattachement, self::COLONNES_DE_RATTACHEMENT, true)) {
            throw new InvalidArgumentException(
                "Colonne de rattachement « {$rattachement} » non admise : attendu ".
                implode(' ou ', self::COLONNES_DE_RATTACHEMENT).'.'
            );
        }

        return $rattachement;
    }
}
