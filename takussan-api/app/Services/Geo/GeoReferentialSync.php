<?php

namespace App\Services\Geo;

use Illuminate\Support\Facades\DB;

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
        // TCK-787 — les biens dont le jeu a renommé la ville ou le quartier se réindexent aussi :
        // le chargeur le fait région par région (TCK-1155).
        $bilan = $this->chargeur->charger($repertoire);
        $renommes = $this->chargeur->biensRenommes();
        // TCK-1155 (P89.01) — rattacher et réindexer dans une même transaction : un échec du
        // moteur annule le rattachement, que le passage suivant rejoue. Validé seul, il ne se
        // voyait plus à rattacher, et l'index restait sans le quartier.
        $biens = DB::transaction(function () {
            $biens = $this->rattacheur->rattacher();
            $this->reindexation->biensDansLaTransaction($biens);

            return $biens;
        });

        return $bilan + [
            'biens_rattaches' => count(array_unique($biens)),
            'biens_renommes' => count(array_unique($renommes)),
        ];
    }
}
