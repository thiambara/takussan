<?php

namespace App\Services\Messaging;

use App\Models\Booking;
use App\Models\Conversation;
use App\Models\Inventory;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\MaintenanceRequest;
use App\Models\PropertyVisit;
use App\Models\User;
use Closure;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use LogicException;
use Throwable;

/**
 * TCK-2961 (ADR-0128 § 3) — le fil où PARLE un objet, et la seule voie par laquelle un objet y écrit
 * ce qui lui arrive.
 *
 *  - une échéance, un état des lieux, un bail : la salle du bail ({@see SallesDuFil::salleDe()}) ;
 *  - une réservation : sa salle, transmise d'abord au contact principal ACTUEL
 *    ({@see SallesDuFil::synchroniser()}, TCK-2960) ;
 *  - une intervention : son fil ({@see MaintenanceRequest::conversation()}) ;
 *  - une visite : le fil EXISTANT du prospect sur le bien
 *    ({@see PropertyConversationResolver::findExisting()}, lecture pure).
 *
 * Aucun fil n'est CRÉÉ ici : un fil absent (parties sans compte, prospect qui n'a jamais écrit,
 * intervention sans fil) ne fait rien.
 *
 * {@see self::parler()} écrit APRÈS LE COMMIT (`DB::afterCommit` : tout de suite hors transaction) :
 * aucun événement ne précède la donnée qu'il annonce, une transaction annulée n'écrit rien, et un
 * échec de l'écriture est rapporté sans jamais remonter au geste — sous PostgreSQL, une erreur SQL
 * dans la transaction du geste l'abandonnerait entière.
 */
class FilDeLObjet
{
    public function __construct(
        private readonly SallesDuFil $salles,
        private readonly PropertyConversationResolver $prospects,
        private readonly EvenementsDuFil $evenements,
    ) {}

    /** Le fil où parle `$objet`, sans le créer ; `null` s'il n'en a pas. */
    public function filDe(Model $objet): ?Conversation
    {
        return match (true) {
            $objet instanceof LeasePayment, $objet instanceof Inventory => ($bail = Lease::query()->find($objet->lease_id)) !== null
                ? $this->salles->salleDe($bail)
                : null,
            $objet instanceof Lease => $this->salles->salleDe($objet),
            $objet instanceof Booking => $this->salleDeLaReservation($objet),
            $objet instanceof MaintenanceRequest => $objet->conversation()->first(),
            $objet instanceof PropertyVisit => $this->filDuProspect($objet),
            default => null,
        };
    }

    /**
     * L'événement `$code` de `$objet`, dans son fil, après le COMMIT. `$gesteAttendu` (facultatif) :
     * le prédicat du geste que l'objet attend, jugé à l'émission pour chaque participant actif du fil
     * ({@see self::participantsQui()}) — ceux qu'il retient forment `action_for`.
     *
     * @param  array<string, scalar|null>  $data
     * @param  (Closure(User): bool)|null  $gesteAttendu
     */
    public function parler(Model $objet, string $code, array $data = [], ?Closure $gesteAttendu = null): void
    {
        // Le code et les clés sont des constantes du programme : refusés tout de suite (une erreur de
        // programme se voit au test, elle ne se perd pas dans un rapport).
        $entree = CodesDuFil::entree($code);
        if ($entree['objet'] !== SujetsDuFil::typeDe($objet) || array_diff(array_keys($data), $entree['data']) !== []) {
            throw new LogicException("L'événement « {$code} » ne va pas avec cet objet ou ces clés de data.");
        }

        DB::afterCommit(function () use ($objet, $code, $data, $gesteAttendu): void {
            try {
                $fil = $this->filDe($objet);
                if ($fil === null) {
                    return;
                }
                $comptes = $gesteAttendu !== null ? self::participantsQui($fil, $gesteAttendu) : [];
                $this->evenements->ecrire($fil, $objet, $code, $data, $comptes);
            } catch (Throwable $e) {
                report($e);
            }
        });
    }

    /**
     * Les participants actifs du fil pour qui `$predicat` est vrai.
     *
     * @param  Closure(User): bool  $predicat
     * @return list<User>
     */
    public static function participantsQui(Conversation $fil, Closure $predicat): array
    {
        return $fil->participants()
            ->wherePivotNull('left_at')
            ->get()
            ->filter(fn (User $participant): bool => $predicat($participant))
            ->values()
            ->all();
    }

    private function salleDeLaReservation(Booking $booking): ?Conversation
    {
        $salle = $this->salles->salleDe($booking);
        if ($salle !== null) {
            // TCK-2960 — la salle suit le contact principal ACTUEL : transmise avant d'y écrire.
            $this->salles->synchroniser($salle, $booking);
        }

        return $salle;
    }

    private function filDuProspect(PropertyVisit $visit): ?Conversation
    {
        $visit->loadMissing(['property', 'visitor', 'customer.user']);
        $prospect = $visit->visitor ?? $visit->customer?->user;
        if ($visit->property === null || $prospect === null) {
            return null;
        }

        return $this->prospects->findExisting($visit->property, $prospect);
    }
}
