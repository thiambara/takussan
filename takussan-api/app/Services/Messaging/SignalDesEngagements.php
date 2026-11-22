<?php

namespace App\Services\Messaging;

use App\Models\Commitment;
use App\Models\Conversation;
use App\Models\Enums\CommitmentStatus;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;
use Throwable;

/**
 * TCK-2970 (ADR-0130 § 4) — ce que la commande `commitments:signal` écrit au fil, toutes les 5 minutes.
 *
 *  - **rappel** (`commitment.due_soon`) : 24 h avant l'échéance, si l'engagement a été noté plus de 24 h
 *    avant elle ; marqueur `due_soon_sent_at` ;
 *  - **retard** (`commitment.overdue`) : au premier passage après l'échéance ; marqueur
 *    `overdue_signalled_at`, et `overdue_at` (l'historique) s'il est vide ;
 *  - **relances** (`commitment.reminded`) : tous les 3 jours après le retard, 3 au plus (`relances`,
 *    `last_relance_at`) ;
 *  - **« Tenu ? »** (`commitment.check_requested`) : une heure après l'échéance, au bénéficiaire ; marqueur
 *    `check_requested_at`. Sans bénéficiaire, rien.
 *
 * Les trois premiers attendent le PORTEUR (`action_for = [porteur]`), la question le BÉNÉFICIAIRE. Aucune
 * notification poussée : ce sont des événements du fil ({@see EvenementsDuFil::ecrire}, qui ne notifie pas).
 *
 * **Idempotence** (patron de `SendTaskDueReminders::notifyFor`) : chaque signal prend la ligne sous verrou
 * et rejuge sa condition, marqueur compris, sur la ligne RELUE — jamais sur l'instance de la requête de
 * sélection, qu'un passage concurrent a pu rendre périmée. Deux passages simultanés n'écrivent donc qu'un
 * événement par marqueur. Les marqueurs tombent quand `due_at` change (`Commitment::booted`).
 */
final class SignalDesEngagements
{
    public const RAPPEL = 'due_soon';

    public const RETARD = 'overdue';

    public const RELANCE = 'reminded';

    public const QUESTION = 'check_requested';

    /** L'ordre d'un passage : le retard avant ses relances (qui le supposent signalé). */
    public const SIGNAUX = [self::RAPPEL, self::RETARD, self::RELANCE, self::QUESTION];

    public const RELANCES_MAX = 3;

    public const JOURS_ENTRE_RELANCES = 3;

    public const HEURES_DU_RAPPEL = 24;

    public const MINUTES_AVANT_LA_QUESTION = 60;

    public function __construct(private readonly EvenementsDuFil $evenements) {}

    /**
     * Un passage entier.
     *
     * @return array{ecrits: array<string, int>, echecs: int}
     */
    public function passer(): array
    {
        $ecrits = array_fill_keys(self::SIGNAUX, 0);
        $echecs = 0;

        foreach (self::SIGNAUX as $signal) {
            $this->candidats($signal, now())->chunkById(100, function ($candidats) use ($signal, &$ecrits, &$echecs) {
                foreach ($candidats as $candidat) {
                    try {
                        if ($this->signaler($candidat, $signal)) {
                            $ecrits[$signal]++;
                        }
                    } catch (Throwable $erreur) {
                        // Une ligne en échec n'arrête pas le passage : rapportée, elle sera retentée au suivant.
                        report($erreur);
                        $echecs++;
                    }
                }
            });
        }

        return ['ecrits' => $ecrits, 'echecs' => $echecs];
    }

    /**
     * Écrit le signal `$signal` de `$candidat` si sa condition tient encore sur la ligne verrouillée.
     *
     * @return bool vrai si un événement a été écrit
     */
    public function signaler(Commitment $candidat, string $signal): bool
    {
        return DB::transaction(function () use ($candidat, $signal): bool {
            /** @var Commitment|null $engagement */
            $engagement = Commitment::query()->whereKey($candidat->getKey())->lockForUpdate()->first();
            if ($engagement === null || ! $this->doitSignaler($engagement, $signal, now())) {
                return false;
            }
            $fil = $engagement->conversation;
            if (! $fil instanceof Conversation) {
                return false;
            }

            $maintenant = now();
            $porteur = [(int) $engagement->holder_id];
            match ($signal) {
                self::RAPPEL => $engagement->forceFill(['due_soon_sent_at' => $maintenant]),
                self::RETARD => $engagement->forceFill([
                    'overdue_signalled_at' => $maintenant,
                    'overdue_at' => $engagement->overdue_at ?? $engagement->due_at,
                ]),
                self::RELANCE => $engagement->forceFill([
                    'relances' => (int) $engagement->relances + 1,
                    'last_relance_at' => $maintenant,
                ]),
                self::QUESTION => $engagement->forceFill(['check_requested_at' => $maintenant]),
            };
            $engagement->save();

            $actionFor = $signal === self::QUESTION ? [(int) $engagement->beneficiary_id] : $porteur;
            $this->evenements->ecrire($fil, $engagement, 'commitment.'.$signal, [], $actionFor);

            return true;
        });
    }

    /** La condition de `$signal`, jugée sur une ligne (la ligne verrouillée). Même règle que {@see self::candidats()}. */
    public function doitSignaler(Commitment $engagement, string $signal, CarbonInterface $maintenant): bool
    {
        if ($engagement->status !== CommitmentStatus::Open || $engagement->due_at === null) {
            return false;
        }
        $echeance = $engagement->due_at;

        return match ($signal) {
            self::RAPPEL => $engagement->due_soon_sent_at === null
                && $echeance->greaterThan($maintenant)
                && $echeance->lessThanOrEqualTo($maintenant->copy()->addHours(self::HEURES_DU_RAPPEL))
                && $engagement->created_at !== null
                && $engagement->created_at->lessThanOrEqualTo($echeance->copy()->subHours(self::HEURES_DU_RAPPEL)),
            self::RETARD => $engagement->overdue_signalled_at === null
                && $echeance->lessThan($maintenant),
            self::RELANCE => $engagement->overdue_signalled_at !== null
                && $echeance->lessThan($maintenant)
                && (int) $engagement->relances < self::RELANCES_MAX
                && ($engagement->last_relance_at ?? $engagement->overdue_signalled_at)
                    ->lessThanOrEqualTo($maintenant->copy()->subDays(self::JOURS_ENTRE_RELANCES)),
            self::QUESTION => $engagement->beneficiary_id !== null
                && $engagement->check_requested_at === null
                && $echeance->lessThanOrEqualTo($maintenant->copy()->subMinutes(self::MINUTES_AVANT_LA_QUESTION)),
            default => throw new InvalidArgumentException("Signal d'engagement inconnu : « {$signal} »."),
        };
    }

    /**
     * Les candidats de `$signal` : la même règle que {@see self::doitSignaler()}, en SQL (un engagement
     * `open` seulement). Une présélection : la ligne est rejugée sous verrou.
     *
     * @return Builder<Commitment>
     */
    public function candidats(string $signal, CarbonInterface $maintenant): Builder
    {
        $requete = Commitment::query()->where('status', CommitmentStatus::Open->value);

        return match ($signal) {
            self::RAPPEL => $requete
                ->whereNull('due_soon_sent_at')
                ->where('due_at', '>', $maintenant)
                ->where('due_at', '<=', $maintenant->copy()->addHours(self::HEURES_DU_RAPPEL))
                ->whereRaw("created_at <= due_at - interval '".self::HEURES_DU_RAPPEL." hours'"),
            self::RETARD => $requete
                ->whereNull('overdue_signalled_at')
                ->where('due_at', '<', $maintenant),
            self::RELANCE => $requete
                ->whereNotNull('overdue_signalled_at')
                ->where('due_at', '<', $maintenant)
                ->where('relances', '<', self::RELANCES_MAX)
                ->whereRaw('coalesce(last_relance_at, overdue_signalled_at) <= ?', [$maintenant->copy()->subDays(self::JOURS_ENTRE_RELANCES)]),
            self::QUESTION => $requete
                ->whereNotNull('beneficiary_id')
                ->whereNull('check_requested_at')
                ->where('due_at', '<=', $maintenant->copy()->subMinutes(self::MINUTES_AVANT_LA_QUESTION)),
            default => throw new InvalidArgumentException("Signal d'engagement inconnu : « {$signal} »."),
        };
    }
}
