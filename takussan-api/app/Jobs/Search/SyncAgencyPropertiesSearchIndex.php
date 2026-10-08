<?php

namespace App\Jobs\Search;

use App\Jobs\Property\RevalidatePublicPropertyPage;
use App\Models\Agency;
use App\Models\Enums\AgencyStatus;
use App\Models\Property;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Foundation\Queue\Queueable;

/**
 * TCK-600 (ADR-0048 §2) — l'index de recherche suit le statut de l'agence.
 *
 * `shouldBeSearchable()` lit désormais le statut de l'agence, mais Scout ne réévalue un bien que
 * quand CE bien est enregistré : suspendre une agence ne touche aucune ligne de `properties`, et
 * ses biens resteraient trouvables dans Meilisearch. Ce job les retire (agence sortie d'`active`)
 * ou les remet (agence revenue à `active` — seulement ceux que `shouldBeSearchable()` accepte),
 * par lots.
 *
 * Il relit le statut au moment où il tourne, pas celui du déclenchement : une suspension levée
 * avant son passage ne retire rien.
 *
 * Même angle mort pour la fiche publique du front, en cache étiqueté par slug (TCK-598,
 * ADR-0052) : son observateur ne voit que les écritures d'un bien. Chaque lot en demande donc
 * l'expiration, dans les deux sens — sans quoi la fiche d'une agence suspendue resterait servie
 * jusqu'à la revalidation temporelle du front.
 */
class SyncAgencyPropertiesSearchIndex implements ShouldQueue
{
    use Queueable;

    public const LOT = 200;

    public int $tries = 3;

    public array $backoff = [30, 120];

    public function __construct(
        public readonly int $agencyId,
    ) {}

    public function handle(): void
    {
        $agence = Agency::query()->find($this->agencyId);
        if ($agence === null) {
            return;
        }
        $publique = $agence->status === AgencyStatus::Active;

        Property::query()
            ->where('agency_id', $agence->id)
            ->with('address', 'tags', 'agency')
            ->chunkById(self::LOT, function (Collection $biens) use ($publique): void {
                // `searchable()` d'une collection n'appelle PAS `shouldBeSearchable()` (seuls
                // l'observateur et `makeAllSearchable` le font) : sans ce filtre, la levée
                // indexerait les brouillons et les biens privés de l'agence.
                $publique ? $biens->filter->shouldBeSearchable()->searchable() : $biens->unsearchable();
                RevalidatePublicPropertyPage::dispatch($biens->pluck('slug')->filter()->values()->all());
            });
    }
}
