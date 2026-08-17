<?php

namespace App\Http\Responses;

use Illuminate\Contracts\Pagination\LengthAwarePaginator;

/**
 * LE point qui fait foi pour l'enveloppe de pagination de l'API (TCK-304).
 *
 * **Pourquoi ce fichier existe.** La forme était recopiée à la main dans 57 contrôleurs et un
 * service, et les jeux de clés divergeaient — mesuré le 2026-08-17 dans `app/` : `total` 88
 * occurrences, `current_page` 67, `last_page` 51, `per_page` 40 appels de paginateur. Un client de
 * l'API ne pouvait donc pas lire la pagination de la même façon d'un endpoint à l'autre : il devait
 * découvrir, endpoint par endpoint, quelles clés existaient. *Un contrat que le client doit
 * découvrir n'est pas un contrat.*
 *
 * `scripts/check-pagination-envelope.mjs` (Repo CI) casse si l'enveloppe est reconstruite hors d'ici.
 * C'est le seul fichier de `app/` où les jetons `'current_page' =>`, `'last_page' =>`,
 * `->currentPage()`, `->lastPage()` et `->perPage()` sont autorisés.
 *
 * **Ce qui n'est PAS ici, et pourquoi.** `'total' =>` et `'per_page' =>` restent libres ailleurs :
 * `total` porte des agrégats métier légitimes (`SystemMetricsController`, `DashboardAgencyService`,
 * `BankStatement`…) et `per_page` est aussi un nom de paramètre de requête validé
 * (`SearchQueryRequest`, `AuditLogController`…). Les bannir aurait produit une garde qu'on
 * désactive au premier faux positif. Elles ne suffisent de toute façon pas à construire une
 * enveloppe : `current_page` et `last_page`, elles, n'ont aucun autre usage dans ce dépôt.
 */
final class PaginationMeta
{
    /**
     * Les quatre clés canoniques — et elles seules.
     *
     * L'ordre est celui de `takussan-api/CLAUDE.md` § « Pagination — la forme canonique ». Il n'a
     * aucune portée en JSON ; il est fixé pour qu'un diff ne porte jamais un réordonnancement.
     *
     * @var list<string>
     */
    public const KEYS = ['total', 'per_page', 'current_page', 'last_page'];

    /**
     * Depuis un paginateur Eloquent — le cas courant.
     *
     * @param  array<string, mixed>  $extra  clés de méta propres à l'endpoint (compteurs métier
     *                                       comme `pending_count`). Une clé canonique passée ici
     *                                       est ignorée : le paginateur fait foi.
     * @return array<string, mixed>
     */
    public static function from(LengthAwarePaginator $paginator, array $extra = []): array
    {
        return self::of(
            total: $paginator->total(),
            perPage: (int) $paginator->perPage(),
            currentPage: $paginator->currentPage(),
            lastPage: $paginator->lastPage(),
            extra: $extra,
        );
    }

    /**
     * Depuis des compteurs bruts — pour une pagination qui ne vient PAS d'un paginateur Eloquent.
     *
     * Seul cas à ce jour : `App\Services\Search\PropertySearchService`, qui pagine un résultat
     * Meilisearch. Sans cette porte, ce service serait resté la 58ᵉ copie manuelle — et la garde
     * l'aurait poussé à se cacher plutôt qu'à converger.
     *
     * @param  array<string, mixed>  $extra
     * @return array<string, mixed>
     */
    public static function of(
        int $total,
        int $perPage,
        int $currentPage,
        ?int $lastPage = null,
        array $extra = [],
    ): array {
        $lastPage ??= $perPage > 0 ? max(1, (int) ceil($total / $perPage)) : 1;

        return [
            'total' => $total,
            'per_page' => $perPage,
            'current_page' => $currentPage,
            'last_page' => $lastPage,
            ...array_diff_key($extra, array_flip(self::KEYS)),
        ];
    }
}
