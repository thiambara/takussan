<?php

use App\Models\Booking;
use App\Services\Booking\BookingRefundTaskService;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * TCK-3006 (vérification adverse) — reprise de données : la tâche de remboursement d'une réservation
 * n'a plus pour créateur le client de cette réservation.
 *
 * `BookingRefundTaskService::openFor` posait l'auteur de la fermeture en `created_by_id`. Quand le
 * client annulait, il devenait le créateur d'une tâche interne (acomptes et reversements du
 * bailleur), et `TachesLisibles::participe` la lui ouvrait en lecture et en écriture. Le service ne
 * l'écrit plus. Cette reprise retire le client des tâches déjà écrites. Aucune autre tâche n'est
 * touchée, ni une tâche de remboursement créée par le personnel, ni une tâche ordinaire du client.
 *
 * `tasks` n'est pas indexé par Scout : aucune réimportation n'est nécessaire.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::update(<<<'SQL'
            UPDATE tasks t SET created_by_id = NULL
            FROM bookings b
            JOIN customers c ON c.id = b.customer_id
            WHERE t.taskable_type = ?
              AND t.taskable_id = b.id
              AND t.metadata->>'kind' = ?
              AND t.created_by_id = c.user_id
        SQL, [(new Booking)->getMorphClass(), BookingRefundTaskService::KIND]);
    }

    /**
     * Sans retour, délibérément : rendre au client la paternité d'une tâche interne lui rouvrirait
     * les acomptes et reversements du bailleur.
     */
    public function down(): void {}
};
