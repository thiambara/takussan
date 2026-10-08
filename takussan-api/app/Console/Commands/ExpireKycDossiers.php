<?php

namespace App\Console\Commands;

use App\Services\Kyc\KycExpiryService;
use Illuminate\Console\Command;

/**
 * TCK-601 (C) — relance les admins d'une agence dont le KYC arrive à échéance (J-30, J-7), puis
 * remet le dossier à `pending` le jour venu. Quotidien, idempotent : une relance déjà envoyée est
 * mémorisée sur le dossier.
 */
class ExpireKycDossiers extends Command
{
    protected $signature = 'kyc:expire-dossiers';

    protected $description = 'Relance puis fait expirer les dossiers KYC d\'agence arrivés à échéance.';

    public function handle(KycExpiryService $service): int
    {
        $counts = $service->run();
        $this->info("Relancés : {$counts['reminded']} ; expirés : {$counts['expired']}.");

        return self::SUCCESS;
    }
}
