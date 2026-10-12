<?php

namespace App\Services\Geo;

/** TCK-633 — charger, rattacher, réindexer : ce que jouent la commande et le seeder. */
final class GeoReferentialSync
{
    public function __construct(
        private readonly GeoReferentialLoader $chargeur,
        private readonly GeoAddressAttacher $rattacheur,
        private readonly GeoReindexation $reindexation,
    ) {}

    public static function repertoireParDefaut(): string
    {
        return database_path('data/geo/regions');
    }

    /** @return array<string, int> */
    public function executer(string $repertoire): array
    {
        $bilan = $this->chargeur->charger($repertoire);
        $biens = $this->rattacheur->rattacher();
        $this->reindexation->biens($biens);

        return $bilan + ['biens_rattaches' => count(array_unique($biens))];
    }
}
