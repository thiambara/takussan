<?php

namespace App\Jobs;

use App\Models\Property;
use App\Support\Search\PropertyLabels;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Foundation\Queue\Queueable;

/**
 * Réindexe chaque jour les biens dont le jeton « neuf » peut avoir changé.
 *
 * « neuf » (TCK-506, {@see PropertyLabels::facts()}) vaut pour l'année de
 * construction courante ou précédente — c'est le SEUL fait relatif au temps
 * de tout document indexé, et il est figé à l'indexation. Rien ne le
 * périmait (revue de PR 253) : aucune réindexation planifiée, les compteurs de
 * vues passent par `increment()` que l'observateur Scout ne voit pas, et
 * `scripts/deploy.sh` n'importe que sur un diff des fichiers de forme. Un
 * bien de 2025 indexé en 2026 répondait encore à `q=neuf` en 2028.
 *
 * Le périmètre est volontairement plus large que le strict nécessaire — les
 * biens construits depuis trois ans, et pas seulement ceux qui viennent de
 * sortir de la fenêtre au 1er janvier — pour que le job soit idempotent et
 * se rattrape seul après un jour sans planificateur. C'est quelques dizaines
 * de documents, pas la table.
 */
class RefreshNewBuildSearchLabel implements ShouldQueue
{
    use Queueable;

    /** @return Builder<Property> */
    public static function scope(): Builder
    {
        return Property::query()->where('year_built', '>=', PropertyLabels::anneeNeufMin() - 1);
    }

    public function handle(): void
    {
        // `searchable()` sur un Builder réindexe par lots et filtre lui-même
        // par `shouldBeSearchable()` : un brouillon n'entre pas dans l'index.
        static::scope()->searchable();
    }
}
