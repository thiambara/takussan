<?php

namespace App\Observers;

use App\Models\Commitment;
use App\Models\Enums\CommitmentStatus;
use App\Models\Enums\PropertyStatus;
use App\Services\Maintenance\MaintenanceStateMachine;
use App\Services\Messaging\EvenementsDuFil;
use App\Services\Messaging\SallesDuFil;
use App\Services\Messaging\SujetsDuFil;
use BackedEnum;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * TCK-2969 (ADR-0130 § 7, décision 3 du porteur) — un objet CLOS annule ses engagements en cours.
 *
 * Sur `updated` (si `status` a changé et ENTRE dans la liste de son type, {@see self::CLOS}) et sur
 * `deleted` (en douceur ou non), les engagements `proposed` ou `open` de l'objet passent `cancelled`
 * (`cancel_reason = object_closed`), et `commitment.cancelled` (`reason: object_closed`) s'écrit dans le
 * fil de chacun. Un objet rouvert ou restauré ne rouvre rien.
 *
 * Après le COMMIT (`DB::afterCommit` : tout de suite hors transaction), sur le patron de
 * `FilDeLObjet::parler` : une transaction annulée n'annule rien, et un échec est RAPPORTÉ sans jamais
 * remonter au geste de l'objet. Le jugement « le statut vient de changer » se prend tout de suite, dans
 * `updated` : après le COMMIT, l'état « sale » du modèle est perdu.
 *
 * Branché par une boucle sur les clés de {@see self::CLOS} dans `AppServiceProvider::bootObservers()`.
 *
 * ⚠ Ne voit que les écritures par MODÈLE. Une écriture par requête (`Model::query()->update()`) n'annule
 * rien ; relevé du 2026-11-19 (ADR-0130 § 7) : chaque clôture de ces quatre types passe par le modèle.
 * Les seeders, sous `withoutEvents()`, n'annulent rien.
 */
class AnnuleLesEngagementsDeSonObjet
{
    /**
     * Type du registre → statuts « clos » (valeurs). Une ligne par type rattachable, chacune avec son
     * test (`ClotureDesEngagementsTest`). La réservation `completed` reste ouverte, comme sa salle.
     *
     * @var array<string, list<string>>
     */
    public const CLOS = [
        'maintenance_request' => MaintenanceStateMachine::TERMINAL,
        'lease' => SallesDuFil::BAUX_EN_LECTURE_SEULE,
        'booking' => SallesDuFil::RESERVATIONS_EN_LECTURE_SEULE,
        'property' => [PropertyStatus::Archived->value, PropertyStatus::Sold->value],
    ];

    public function __construct(private readonly EvenementsDuFil $evenements) {}

    public function updated(Model $objet): void
    {
        if (! $objet->wasChanged('status')) {
            return;
        }
        $type = SujetsDuFil::typeDe($objet);
        $statut = $objet->getAttribute('status');
        $statut = $statut instanceof BackedEnum ? $statut->value : $statut;
        if (! in_array($statut, self::CLOS[$type] ?? [], true)) {
            return;
        }

        $this->annulerApresLeCommit($type, (int) $objet->getKey());
    }

    public function deleted(Model $objet): void
    {
        $this->annulerApresLeCommit(SujetsDuFil::typeDe($objet), (int) $objet->getKey());
    }

    private function annulerApresLeCommit(string $type, int $id): void
    {
        DB::afterCommit(function () use ($type, $id): void {
            try {
                $this->annuler($type, $id);
            } catch (Throwable $e) {
                report($e);
            }
        });
    }

    /** Les engagements en cours de l'objet, chacun sous verrou de ligne, puis son événement dans son fil. */
    private function annuler(string $type, int $id): void
    {
        $ids = Commitment::query()
            ->where('object_type', $type)
            ->where('object_id', $id)
            ->whereIn('status', array_map(fn (CommitmentStatus $s) => $s->value, CommitmentStatus::EN_COURS))
            ->orderBy('id')
            ->pluck('id');

        foreach ($ids as $engagementId) {
            try {
                DB::transaction(function () use ($engagementId): void {
                    $engagement = Commitment::query()->whereKey($engagementId)->lockForUpdate()->first();
                    if ($engagement === null || ! $engagement->enCours()) {
                        return;
                    }
                    $engagement->forceFill([
                        'status' => CommitmentStatus::Cancelled,
                        'cancelled_at' => now(),
                        'cancelled_by_id' => null,
                        'cancel_reason' => Commitment::ANNULE_OBJET_CLOS,
                    ])->save();

                    $fil = $engagement->conversation;
                    if ($fil !== null) {
                        $this->evenements->ecrire($fil, $engagement, 'commitment.cancelled', ['reason' => Commitment::ANNULE_OBJET_CLOS]);
                    }
                });
            } catch (Throwable $e) {
                report($e);
            }
        }
    }
}
