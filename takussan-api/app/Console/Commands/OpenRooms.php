<?php

namespace App\Console\Commands;

use App\Models\Booking;
use App\Models\Enums\ConversationType;
use App\Models\Lease;
use App\Services\Messaging\SallesDuFil;
use Illuminate\Console\Command;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Query\Builder as QueryBuilder;

/**
 * TCK-2960 (ADR-0128 § 2) — ouvre la salle des baux et des réservations qui n'en ont pas encore : ceux
 * d'avant les salles, que `LeaseObserver` et `OpenBookingRoom` ne voient pas.
 *
 * Idempotente : seuls les objets SANS salle (`whereNotExists`) sont examinés, par paquets, et la création
 * passe par l'index unique `conversations_salle_unique` (`insertOrIgnore`) — deux exécutions simultanées
 * n'en créent pas deux. Un objet sans aucun compte possible n'a pas de salle (journalisé), et le sera de
 * nouveau à l'exécution suivante sans rien créer. Supprimés exclus. Jouée par `docker/release.sh`.
 */
class OpenRooms extends Command
{
    protected $signature = 'messaging:open-rooms {--chunk=200 : Taille des paquets}';

    protected $description = 'Ouvre la salle des baux et des réservations qui n\'en ont pas.';

    public function handle(SallesDuFil $salles): int
    {
        $paquet = max(1, (int) $this->option('chunk'));
        $comptes = [];

        foreach ([
            'lease' => [Lease::query(), ConversationType::Lease, 'leases'],
            'booking' => [Booking::query(), ConversationType::Booking, 'bookings'],
        ] as $type => [$requete, $typeDeFil, $table]) {
            $creees = 0;
            /** @var Builder<Lease|Booking> $requete */
            $requete
                ->whereNotExists(fn (QueryBuilder $salle) => $salle->selectRaw('1')
                    ->from('conversations')
                    ->where('conversations.type', $typeDeFil->value)
                    ->where('conversations.subject_type', $type)
                    ->whereColumn('conversations.subject_id', "{$table}.id")
                    ->whereNull('conversations.deleted_at'))
                ->chunkById($paquet, function ($objets) use ($salles, &$creees): void {
                    foreach ($objets as $objet) {
                        if ($salles->ouvrir($objet)?->wasRecentlyCreated === true) {
                            $creees++;
                        }
                    }
                }, "{$table}.id", 'id');
            $comptes[] = "{$type}={$creees}";
        }

        $this->info('messaging:open-rooms '.implode(' ', $comptes));

        return self::SUCCESS;
    }
}
