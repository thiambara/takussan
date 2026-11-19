<?php

namespace App\Console\Commands;

use App\Models\ActionLink;
use App\Models\MessageRelay;
use Illuminate\Console\Command;

/**
 * TCK-2980 (ADR-0132 § 4, « Rétention ») — un relais garde un numéro de téléphone le temps d'en servir (le routage, la
 * fenêtre, le relevé des statuts). Son numéro s'efface `messagerie.retention_numeros_jours` (90) jours après son dernier
 * envoi (`sent_at`, sinon sa création) ; la ligne reste, pour la trace. Planifiée chaque nuit (`routes/console.php`).
 * TCK-2982 y ajoute les liens d'action.
 */
class EffacerLesNumerosDuPont extends Command
{
    protected $signature = 'pont:effacer-numeros';

    protected $description = 'Efface le numéro de téléphone des relais du pont après la durée de rétention (ADR-0132 § 4).';

    public function handle(): int
    {
        $limite = now()->subDays((int) config('messagerie.retention_numeros_jours', 90));

        $effaces = MessageRelay::query()
            ->whereNotNull('phone')
            ->whereRaw('COALESCE(sent_at, created_at) < ?', [$limite])
            ->update(['phone' => null, 'updated_at' => now()]);

        $this->info("Relais du pont : {$effaces} numéro(s) effacé(s).");

        // TCK-2982 (ADR-0132 § 5) — le numéro qui a reçu un lien d'action s'efface 90 jours après l'EXPIRATION du lien.
        $liens = ActionLink::query()
            ->whereNotNull('phone')
            ->where('expires_at', '<', $limite)
            ->update(['phone' => null, 'updated_at' => now()]);
        $this->info("Liens d'action : {$liens} numéro(s) effacé(s).");
        // /TCK-2982

        return self::SUCCESS;
    }
}
