<?php

namespace App\Services\Kyc;

use App\Models\Agency;
use App\Models\AgencyUpgradeRequest;
use App\Models\Enums\AgencyUpgradeRequestStatus;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

/**
 * TCK-601 (C, ADR-0044 §5) — un NINEA ou un RIB professionnel déjà porté par une AUTRE agence.
 *
 * Un signal pour la revue du super-admin, jamais un refus : deux agences d'un même groupe peuvent
 * partager un compte, et une saisie fautive se corrige. La forme comparée ne suppose aucun format
 * (dette D-68 : pas de contrôle de forme) — tout blanc retiré, puis majuscules : `0012345 2G3` et
 * `00123452g3` sont le même identifiant, `00123452G4` non.
 *
 * La comparaison se fait en PHP, sur les valeurs DÉCHIFFRÉES : le cast `encrypted` (IV aléatoire)
 * interdit toute égalité SQL. Sources : les demandes de passage `pending` et `approved` des autres
 * agences — une par agence, le volume le permet. Chargées une fois par REQUÊTE HTTP
 * ({@see self::forRequestCycle()}) : une liste de la console ne déchiffre pas tout le registre par
 * ligne, et une requête suivante (un test en enchaîne plusieurs) relit l'état neuf.
 *
 * Raccord TCK-594 : le NINEA d'une agence vit aussi dans `agencies.ninea`, en clair (mention légale
 * publique). C'est une source de plus pour le NINEA, et celle qui fait foi pour l'agence elle-même
 * quand elle est posée. Le RIB pro reste lu sur la demande : 594 ne crée pas de colonne RIB d'agence.
 */
class SharedLegalIdentifierDetector
{
    public const FIELDS = ['ninea', 'rib_pro'];

    /** @var Collection<int, array{request_id: int, agency_id: int, agency_name: string, ninea: ?string, rib_pro: ?string}>|null */
    private ?Collection $candidates = null;

    /** @var Collection<int, array{agency_id: int, agency_name: string, ninea: ?string}>|null */
    private ?Collection $agencyNineas = null;

    /** Une instance par requête HTTP, rangée dans ses attributs. */
    public static function forRequestCycle(Request $request): self
    {
        $detector = $request->attributes->get(self::class);
        if (! $detector instanceof self) {
            $detector = new self;
            $request->attributes->set(self::class, $detector);
        }

        return $detector;
    }

    public static function normalize(?string $value): ?string
    {
        if ($value === null) {
            return null;
        }
        $clean = mb_strtoupper(preg_replace('/\s+/u', '', $value) ?? '');

        return $clean === '' ? null : $clean;
    }

    /**
     * @return array{ninea: list<array{id: int, name: string}>, rib_pro: list<array{id: int, name: string}>}
     */
    public function forRequest(AgencyUpgradeRequest $request): array
    {
        return $this->detect((int) $request->agency_id, [
            'ninea' => $request->ninea,
            'rib_pro' => $request->rib_pro,
        ]);
    }

    /**
     * Les identifiants d'une agence sont ceux de sa demande de passage la plus récente encore
     * `pending` ou `approved`.
     *
     * @return array{ninea: list<array{id: int, name: string}>, rib_pro: list<array{id: int, name: string}>}
     */
    public function forAgency(int $agencyId): array
    {
        // Lue dans les candidats déjà chargés : une file KYC de cinquante dossiers ne fait pas
        // cinquante requêtes de plus.
        $own = $this->candidates()->where('agency_id', $agencyId)->sortByDesc('request_id')->first();
        $column = $this->agencyNineas()->firstWhere('agency_id', $agencyId);

        return $this->detect($agencyId, [
            'ninea' => $column['ninea'] ?? $own['ninea'] ?? null,
            'rib_pro' => $own['rib_pro'] ?? null,
        ]);
    }

    /**
     * @param  array{ninea: ?string, rib_pro: ?string}  $values
     * @return array{ninea: list<array{id: int, name: string}>, rib_pro: list<array{id: int, name: string}>}
     */
    private function detect(int $agencyId, array $values): array
    {
        $result = [];
        foreach (self::FIELDS as $field) {
            $needle = self::normalize($values[$field]);
            $haystack = $field === 'ninea' ? $this->candidates()->concat($this->agencyNineas()) : $this->candidates();
            $result[$field] = $needle === null ? [] : $haystack
                ->filter(fn (array $row) => $row['agency_id'] !== $agencyId && $row[$field] === $needle)
                ->unique('agency_id')
                ->map(fn (array $row) => ['id' => $row['agency_id'], 'name' => $row['agency_name']])
                ->sortBy('id')
                ->values()
                ->all();
        }

        return $result;
    }

    /** @return Collection<int, array{request_id: int, agency_id: int, agency_name: string, ninea: ?string, rib_pro: ?string}> */
    private function candidates(): Collection
    {
        return $this->candidates ??= AgencyUpgradeRequest::query()
            ->with('agency:id,name')
            ->whereIn('status', [AgencyUpgradeRequestStatus::Pending->value, AgencyUpgradeRequestStatus::Approved->value])
            ->get()
            ->map(fn (AgencyUpgradeRequest $request) => [
                'request_id' => (int) $request->id,
                'agency_id' => (int) $request->agency_id,
                'agency_name' => (string) $request->agency?->name,
                'ninea' => self::normalize($request->ninea),
                'rib_pro' => self::normalize($request->rib_pro),
            ]);
    }

    /** @return Collection<int, array{agency_id: int, agency_name: string, ninea: ?string}> */
    private function agencyNineas(): Collection
    {
        return $this->agencyNineas ??= Agency::query()
            ->whereNotNull('ninea')
            ->get(['id', 'name', 'ninea'])
            ->map(fn (Agency $agency) => [
                'agency_id' => (int) $agency->id,
                'agency_name' => (string) $agency->name,
                'ninea' => self::normalize($agency->ninea),
            ])
            ->filter(fn (array $row) => $row['ninea'] !== null)
            ->values();
    }
}
