<?php

namespace App\Services\Property;

use App\Models\Enums\ConversationType;
use App\Models\Enums\VisitStatus;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2905 (ADR-0117 § 4) — ce qu'une annonce a rapporté sur les 30 derniers jours, aujourd'hui compris
 * (depuis le début du jour J-29), pour une page entière de la liste agence (`include=stats30d`) : trois
 * agrégats groupés par bien, quel que soit le nombre de biens.
 *
 *  - `views` : la somme de `property_daily_views` sur la fenêtre (les vues datées, ADR-0117 § 2) ;
 *  - `contacts` : les pistes `property_contact_leads` du bien (formulaire, clic WhatsApp, appel — la définition
 *    de `RadarActivationReminders`) et les fils directs ouverts sur le bien par un autre que son titulaire
 *    (`contact-message`, qui ne crée pas de piste), créés dans la fenêtre ; un fil supprimé depuis reste un
 *    contact reçu ;
 *  - `visits` : les visites du bien demandées OU terminées dans la fenêtre, hors annulées.
 *
 * Les identifiants viennent de la page déjà bornée par `PropertyListScope` : rien ici n'élargit ce que
 * l'appelant lit.
 */
final class PropertyStats30d
{
    public const DAYS = 30;

    /**
     * @param  list<int>  $propertyIds
     * @return array<int, array{views: int, contacts: int, visits: int}>
     */
    public function for(array $propertyIds): array
    {
        if ($propertyIds === []) {
            return [];
        }

        $depuis = CarbonImmutable::now()->startOfDay()->subDays(self::DAYS - 1);

        $vues = DB::table('property_daily_views')
            ->whereIn('property_id', $propertyIds)
            ->where('day', '>=', $depuis->toDateString())
            ->groupBy('property_id')
            ->selectRaw('property_id, sum(views) as n')
            ->pluck('n', 'property_id');

        $pistes = DB::table('property_contact_leads')
            ->whereIn('property_id', $propertyIds)
            ->where('created_at', '>=', $depuis)
            ->select('property_id', DB::raw('count(*) as n'))
            ->groupBy('property_id');
        $fils = DB::table('conversations')
            ->join('properties', 'properties.id', '=', 'conversations.property_id')
            ->whereIn('conversations.property_id', $propertyIds)
            ->where('conversations.type', ConversationType::Direct->value)
            ->whereColumn('conversations.created_by', '!=', 'properties.user_id')
            ->where('conversations.created_at', '>=', $depuis)
            ->select('conversations.property_id', DB::raw('count(*) as n'))
            ->groupBy('conversations.property_id');
        $contacts = DB::query()->fromSub($pistes->unionAll($fils), 'c')
            ->groupBy('property_id')
            ->selectRaw('property_id, sum(n) as n')
            ->pluck('n', 'property_id');

        $visites = DB::table('property_visits')
            ->whereIn('property_id', $propertyIds)
            ->where('status', '!=', VisitStatus::Cancelled->value)
            ->where(fn ($q) => $q->where('created_at', '>=', $depuis)->orWhere('completed_at', '>=', $depuis))
            ->groupBy('property_id')
            ->selectRaw('property_id, count(*) as n')
            ->pluck('n', 'property_id');

        $stats = [];
        foreach ($propertyIds as $id) {
            $stats[$id] = [
                'views' => (int) ($vues[$id] ?? 0),
                'contacts' => (int) ($contacts[$id] ?? 0),
                'visits' => (int) ($visites[$id] ?? 0),
            ];
        }

        return $stats;
    }
}
