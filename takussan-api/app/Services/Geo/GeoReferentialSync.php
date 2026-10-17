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
        $renommes = $this->chargeur->biensRenommes();
        $biens = $this->rattacheur->rattacher();
        // TCK-787 — les biens dont le jeu a renommé la ville ou le quartier se réindexent aussi.
        $this->reindexation->biens([...$renommes, ...$biens]);

        return $bilan + [
            'biens_rattaches' => count(array_unique($biens)),
            'biens_renommes' => count(array_unique($renommes)),
        ];
    }
}
