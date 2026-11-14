<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use App\Models\Activity;
use App\Models\User;
use App\Services\Maintenance\MaintenanceJournal;
use Illuminate\Http\Request;

/**
 * TCK-2786 — une entrée du journal d'une intervention ({@see MaintenanceJournal}) : un CODE (le
 * front écrit le libellé, principe 5), un instant, et un acteur réduit à `{id, full_name}`, ou
 * `null` pour le système.
 *
 * Des champs NOMMÉS, jamais `properties` en bloc : une ligne d'activité peut porter un montant, un
 * motif ou un commentaire, et le journal ne révèle rien que la fiche ne montre déjà. `from` et `to`
 * ne sont rendus que pour une transition (`status.*`, `created`), et ce sont deux statuts.
 *
 * @mixin Activity
 */
class MaintenanceJournalEntryResource extends BaseResource
{
    private const STATUSES = ['from', 'to'];

    public function toArray(Request $request): array
    {
        $causer = $this->causer;
        $properties = $this->properties?->toArray() ?? [];
        $isTransition = str_starts_with((string) $this->event, MaintenanceJournal::STATUS_PREFIX)
            || $this->event === MaintenanceJournal::CREATED;

        $entry = [
            'id' => $this->id,
            'at' => $this->iso($this->created_at),
            'code' => $this->event,
            'actor' => $causer instanceof User ? ['id' => $causer->id, 'full_name' => $causer->full_name] : null,
        ];

        foreach (self::STATUSES as $key) {
            $entry[$key] = $isTransition && is_string($properties[$key] ?? null) ? $properties[$key] : null;
        }

        return $entry;
    }

    /**
     * L'entrée « avant le journal » d'une demande créée avant son déploiement : jamais écrite, sans
     * date ni acteur.
     *
     * @return array{id: null, at: null, code: string, actor: null, from: null, to: null}
     */
    public static function before(): array
    {
        return ['id' => null, 'at' => null, 'code' => MaintenanceJournal::BEFORE, 'actor' => null, 'from' => null, 'to' => null];
    }
}
