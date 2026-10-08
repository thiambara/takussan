<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use App\Models\User;
use App\Notifications\SavedSearchMatchesNotification;
use App\Services\Notifications\PreferenceResolver;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\Request;

class SavedSearchResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'user_id' => $this->user_id,
            'name' => $this->name,
            'criteria' => $this->criteria,
            'notification_frequency' => $this->notification_frequency,
            'is_active' => (bool) $this->is_active,
            'results_count' => $this->results_count,
            'alert_channels' => $this->alertChannels($request->user()),
            'created_at' => $this->iso($this->created_at),
        ];
    }

    /**
     * TCK-599 — les canaux par lesquels CETTE alerte arrivera, lus sur les canaux réels de la
     * notification (`via()`), pour que l'interface ne promette pas un e-mail que la préférence
     * `saved_search_match` a coupé. `database` est la cloche (`inapp`) ; vide pour une alerte
     * coupée (`off`) ou désactivée.
     *
     * @return list<string>
     */
    private function alertChannels(?User $user): array
    {
        // Une alerte coupée n'arrive par aucun canal : la liste vide le dit.
        if (! $user instanceof User || $this->notification_frequency === 'off' || ! $this->is_active) {
            return [];
        }

        $via = (new SavedSearchMatchesNotification($this->resource, new Collection, 0))->via($user);

        $canaux = array_map(fn (string $channel) => match ($channel) {
            'database' => PreferenceResolver::CHANNEL_INAPP,
            'mail' => PreferenceResolver::CHANNEL_EMAIL,
            default => $channel,
        }, $via);

        // L'ordre d'ENVOI met la cloche en dernier (verif-599 m11) ; l'ordre AFFICHÉ reste le sien.
        usort($canaux, fn (string $a, string $b) => $this->rang($a) <=> $this->rang($b));

        return $canaux;
    }

    private function rang(string $canal): int
    {
        $rang = array_search($canal, [PreferenceResolver::CHANNEL_INAPP, PreferenceResolver::CHANNEL_EMAIL], true);

        return $rang === false ? 2 : $rang;
    }
}
