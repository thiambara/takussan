<?php

namespace App\Services\Maintenance;

use App\Events\Maintenance\MaintenanceStatusChanged;
use App\Http\Resources\MaintenanceJournalEntryResource;
use App\Listeners\Maintenance\RecordMaintenanceJournal;
use App\Models\Activity;
use App\Models\MaintenanceRequest;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

/**
 * TCK-2786 — le journal d'une intervention : ce qui s'est passé, et quand, lisible sur la fiche par
 * le personnel de l'agence du bien.
 *
 * **Un seul écrivain par fait, un seul log relu.** Le journal ne relit que le log `maintenance`, que
 * seuls écrivent :
 *   · {@see RecordMaintenanceJournal} — une entrée par {@see MaintenanceStatusChanged}, devis
 *     compris (`status.quote_submitted`, `status.quote_awaiting_owner`…) ;
 *   · la création par l'API (`created`) ;
 *   · la relance du bailleur ({@see OwnerReminder}) : `owner_reminded`, ou `owner_unavailable` quand
 *     le bailleur est parti, suspendu ou injoignable.
 * Les `activity()` du devis, du refus et de la contestation restent dans le log `default` (l'audit,
 * avec leur montant, motif ou commentaire) : le journal ne les relit pas, il n'y a donc ni doublon
 * ni fuite de ce qu'ils portent.
 *
 * **Le journal ne révèle rien que le lecteur ne lit pas déjà.** Une entrée n'écrit que `from` et
 * `to` (deux statuts, que la fiche montre) ; jamais le contexte de l'événement — motif d'un refus,
 * commentaire d'une contestation, montant d'un devis. La ressource ne sert de toute façon que des
 * champs nommés ({@see MaintenanceJournalEntryResource}).
 *
 * L'historique commence au déploiement : une demande créée avant n'a pas d'entrée `created`, et son
 * journal s'ouvre sur `journal.before` (« avant le journal »). Aucune reprise : une reconstruction
 * partielle mêlerait deux vérités.
 */
class MaintenanceJournal
{
    public const LOG = 'maintenance';

    public const CREATED = 'created';

    public const OWNER_REMINDED = 'owner_reminded';

    public const OWNER_UNAVAILABLE = 'owner_unavailable';

    /** L'entrée synthétique d'une demande antérieure au journal (jamais écrite). */
    public const BEFORE = 'journal.before';

    /** Le préfixe des transitions : `status.<cause>` ({@see MaintenanceStatusChanged}). */
    public const STATUS_PREFIX = 'status.';

    /**
     * Écrit une entrée. `$actor` nul : un geste du système (clôture automatique, fin de
     * collaboration) — jamais l'utilisateur connecté par défaut, que spatie prendrait sinon.
     *
     * @param  array{from?: ?string, to?: ?string}  $properties
     */
    public function record(MaintenanceRequest $mr, string $event, ?User $actor, array $properties = []): void
    {
        $logger = activity(self::LOG)->performedOn($mr)->event($event);
        $logger = $actor !== null ? $logger->causedBy($actor) : $logger->causedByAnonymous();

        $logger->withProperties(array_intersect_key($properties, array_flip(['from', 'to'])))->log($event);
    }

    public function recordCreated(MaintenanceRequest $mr, ?User $actor): void
    {
        $this->record($mr, self::CREATED, $actor, ['to' => $mr->status?->value]);
    }

    /** Les entrées d'une demande, dans l'ordre où elles sont arrivées (date, puis identifiant). */
    public function entriesOf(MaintenanceRequest $mr): Builder
    {
        return Activity::query()
            ->where('log_name', self::LOG)
            ->where('subject_type', $mr->getMorphClass())
            ->where('subject_id', $mr->getKey())
            ->with('causer')
            ->orderBy('created_at')
            ->orderBy('id');
    }

    /** La demande est-elle née sous le journal ? Sinon, il s'ouvre sur `journal.before`. */
    public function startsWithRequest(MaintenanceRequest $mr): bool
    {
        return Activity::query()
            ->where('log_name', self::LOG)
            ->where('subject_type', $mr->getMorphClass())
            ->where('subject_id', $mr->getKey())
            ->where('event', self::CREATED)
            ->exists();
    }
}
