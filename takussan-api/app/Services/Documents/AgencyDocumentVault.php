<?php

namespace App\Services\Documents;

use App\Http\Controllers\Api\DocumentPdfController;
use App\Models\Agency;
use App\Models\Document;
use App\Models\Enums\LeaseStatus;
use App\Models\Inventory;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Property;
use App\Models\User;
use App\Policies\DocumentPolicy;
use App\Services\Membership\MembershipCapabilityResolver;
use App\Support\CaseInsensitive;
use DateTimeInterface;
use Illuminate\Database\Eloquent\Collection;

/**
 * TCK-2895 (ADR-0099, amendement du 2026-11-15, « le coffre de l'agence ») — l'arbre compté des
 * documents de l'agence du profil actif, pour son personnel actif : bien › (pièces du bien, bail ›
 * contrat, états des lieux, quittances, pièces du locataire), puis le dossier de l'agence ; et les
 * entrées générées de toute l'agence (`GET /api/documents?filter[agency]=current&filter[generated]=1`).
 *
 * **La liste suit la lecture.** Les téléversés sont comptés sur LA portée de la liste
 * ({@see DocumentPolicy::listableOnAgency()}) : l'arbre ne compte rien que la liste ne rende. Les
 * générés sont jugés comme au coffre ({@see DocumentVault}) : le contrat par `view` du bail, l'état des
 * lieux par `view` et `pdfAvailable()`, la quittance par `mayReadReceipts` et `receiptable()`.
 *
 * **Requêtes** : un nombre constant, quel que soit le nombre de biens, de baux et d'échéances — les
 * biens, les baux, les états des lieux, les quittances et les comptes de téléversés sont chacun une
 * requête, et les verdicts se jugent sous amorce de l'agence ({@see MembershipCapabilityResolver::primed()}).
 *
 * L'appelant est supposé du personnel actif (`staffAgencyId()` non nul) : le contrôleur refuse les autres.
 */
final class AgencyDocumentVault
{
    /**
     * @return array{agency: array{id: int}, totals: array<string, mixed>, properties: list<array<string, mixed>>, agency_folder: array<string, mixed>}
     */
    public function tree(User $user): array
    {
        $agencyId = (int) $user->staffAgencyId();

        return MembershipCapabilityResolver::primed([$user->id], [$agencyId], function () use ($user, $agencyId): array {
            $properties = $this->properties($agencyId);
            $leases = $this->leases($agencyId, $properties);
            $generated = $this->generatedByLease($user, $leases);
            $uploaded = $this->uploadedCounts($user);

            $nodes = [];
            foreach ($properties as $property) {
                $folders = [$this->folder('property_pieces', 'uploaded', ['type' => 'property', 'id' => (int) $property->id], $uploaded[Property::class][$property->id] ?? null)];
                $leaseNodes = [];
                foreach ($leases->where('property_id', $property->id) as $lease) {
                    $mine = $generated[$lease->id] ?? [];
                    $target = ['type' => 'lease', 'id' => (int) $lease->id];
                    $leaseFolders = [
                        $this->folder('contract', 'generated', $target, $this->countOf($mine, 'lease_contract')),
                        $this->folder('inventories', 'generated', $target, $this->countOf($mine, 'inventory_')),
                        $this->folder('receipts', 'generated', $target, $this->countOf($mine, 'receipt_')),
                        $this->folder('tenant_pieces', 'uploaded', $target, $uploaded[Lease::class][$lease->id] ?? null),
                    ];
                    $leaseNodes[] = [
                        'id' => (int) $lease->id,
                        'reference_number' => $lease->reference_number,
                        'status' => $lease->status?->value,
                        'start_date' => $this->day($lease->start_date),
                        'tenant' => ['name' => $this->tenantName($lease)],
                        ...$this->sum($leaseFolders),
                        'folders' => $leaseFolders,
                    ];
                }

                $nodes[] = [
                    'id' => (int) $property->id,
                    'title' => $property->title,
                    'neighborhood' => $property->address?->neighborhood,
                    ...$this->sum([...$folders, ...$leaseNodes]),
                    'folders' => $folders,
                    'leases' => $leaseNodes,
                ];
            }

            $agencyFolder = $this->folder('agency_pieces', 'uploaded', ['type' => 'agency', 'id' => $agencyId], $uploaded[Agency::class][$agencyId] ?? null);

            return [
                'agency' => ['id' => $agencyId],
                'totals' => $this->sum([...$nodes, $agencyFolder]),
                'properties' => $nodes,
                'agency_folder' => $agencyFolder,
            ];
        });
    }

    /**
     * Les entrées générées de l'agence, chacune avec son contexte (bien, bail, locataire), retenues par
     * `$search` (titre, bien, locataire) quand il est donné. Le plus récent d'abord.
     *
     * @return list<array<string, mixed>>
     */
    public function generatedEntries(User $user, ?string $search = null): array
    {
        $agencyId = (int) $user->staffAgencyId();

        $entries = MembershipCapabilityResolver::primed([$user->id], [$agencyId], function () use ($user, $agencyId): array {
            $properties = $this->properties($agencyId);

            return array_merge([], ...array_values($this->generatedByLease($user, $this->leases($agencyId, $properties))));
        });

        $terms = $search !== null ? array_values(array_filter(preg_split('/\s+/u', CaseInsensitive::fold(trim($search))) ?: [])) : [];
        if ($terms !== []) {
            $entries = array_values(array_filter($entries, function (array $entry) use ($terms): bool {
                $haystack = CaseInsensitive::fold(implode(' ', array_filter([
                    $entry['title'], $entry['context']['property']['title'] ?? null,
                    $entry['context']['lease']['reference_number'] ?? null, $entry['context']['lease']['tenant_name'] ?? null,
                ])));
                foreach ($terms as $term) {
                    if (! str_contains($haystack, $term)) {
                        return false;
                    }
                }

                return true;
            }));
        }

        usort($entries, fn (array $a, array $b): int => [$b['date'] ?? '', $b['download_path']] <=> [$a['date'] ?? '', $a['download_path']]);

        return $entries;
    }

    /** Le compte des générés de la liste de l'agence (la pastille « Générés »). */
    public function generatedCount(User $user): int
    {
        return count($this->generatedEntries($user));
    }

    /** @return Collection<int, Property> les biens de l'agence, une requête (adresse comprise) */
    private function properties(int $agencyId): Collection
    {
        return Property::query()
            ->where('agency_id', $agencyId)
            ->with('address')
            ->orderBy('title')
            ->orderBy('id')
            ->get(['id', 'title', 'agency_id', 'user_id']);
    }

    /**
     * Les baux hors brouillon de l'agence, sur ses biens : la condition de
     * {@see DocumentPolicy::listableOnAgency()}, une requête.
     *
     * @param  Collection<int, Property>  $properties
     * @return Collection<int, Lease>
     */
    private function leases(int $agencyId, Collection $properties): Collection
    {
        $byId = $properties->keyBy('id');

        return Lease::query()
            ->where('agency_id', $agencyId)
            ->where('status', '!=', LeaseStatus::Draft->value)
            ->whereIn('property_id', $properties->pluck('id'))
            ->with('tenant')
            ->orderByDesc('start_date')
            ->orderByDesc('id')
            ->get()
            // Le bien déjà chargé : `mayReadReceipts` et le contexte le lisent sans requête de plus.
            ->each(fn (Lease $lease) => $lease->setRelation('property', $byId->get($lease->property_id)));
    }

    /**
     * Les générés de chaque bail, jugés par la règle de leur endpoint (comme `DocumentVault`).
     *
     * @param  Collection<int, Lease>  $leases
     * @return array<int, list<array<string, mixed>>> par identifiant de bail
     */
    private function generatedByLease(User $user, Collection $leases): array
    {
        $out = [];
        if ($leases->isEmpty()) {
            return $out;
        }
        $byId = $leases->keyBy('id');

        foreach ($leases as $lease) {
            if ($user->can('view', $lease)) {
                $out[$lease->id][] = $this->entry($lease, 'lease_contract', $lease->reference_number, $lease->signed_at ?? $lease->start_date, route('leases.contract.pdf', ['lease' => $lease->id], false));
            }
        }

        $inventories = Inventory::query()
            ->whereIn('lease_id', $leases->pluck('id'))
            ->pdfAvailable()
            ->with(['property', 'tenant'])
            ->orderBy('conducted_at')
            ->get();
        foreach ($inventories as $inventory) {
            if ($user->can('view', $inventory)) {
                $out[$inventory->lease_id][] = $this->entry($byId[$inventory->lease_id], 'inventory_'.($inventory->type?->value ?? 'move_in'), null, $inventory->signed_at ?? $inventory->conducted_at, route('inventories.pdf', ['inventory' => $inventory->id], false));
            }
        }

        $readable = $leases->filter(fn (Lease $lease): bool => DocumentPdfController::mayReadReceipts($user, $lease));
        if ($readable->isNotEmpty()) {
            $payments = DocumentPdfController::receiptable(LeasePayment::query())
                ->whereIn('lease_id', $readable->pluck('id'))
                ->orderBy('due_date')
                ->get(['id', 'lease_id', 'reference_number', 'payment_type', 'due_date', 'paid_at']);
            foreach ($payments as $payment) {
                $out[$payment->lease_id][] = $this->entry($byId[$payment->lease_id], 'receipt_'.($payment->payment_type?->value ?? 'rent'), $payment->reference_number, $payment->due_date ?? $payment->paid_at, route('leases.receipts.pdf', ['lease' => $payment->lease_id, 'payment' => $payment->id], false));
            }
        }

        return $out;
    }

    /**
     * Une entrée générée, dans la forme du coffre (`DocumentVault::normalised`), avec son contexte.
     *
     * @return array<string, mixed>
     */
    private function entry(Lease $lease, string $category, ?string $title, ?DateTimeInterface $date, string $path): array
    {
        $property = $lease->property;

        return [
            'kind' => DocumentVault::KIND_GENERATED,
            'category' => $category,
            'title' => $title,
            'date' => $this->day($date),
            'download_path' => $path,
            'document_id' => null,
            'is_verified' => null,
            'expiry_date' => null,
            'versions_count' => null,
            'targets' => [['type' => 'lease', 'id' => (int) $lease->id], ['type' => 'property', 'id' => (int) $lease->property_id]],
            'context' => [
                'property' => $property !== null ? ['id' => (int) $property->id, 'title' => $property->title, 'neighborhood' => $property->address?->neighborhood] : null,
                'lease' => ['id' => (int) $lease->id, 'reference_number' => $lease->reference_number, 'tenant_name' => $this->tenantName($lease)],
            ],
        ];
    }

    /**
     * Les comptes des téléversés de la portée de l'agence, par porteur, en une requête.
     *
     * @return array<class-string, array<int, array{documents: int, expiring_soon: int, unverified: int, next_expiry_date: ?string}>>
     */
    private function uploadedCounts(User $user): array
    {
        $today = Document::today();
        $rows = DocumentPolicy::listableOnAgency(Document::query(), $user)
            ->toBase()
            ->select(['documentable_type', 'documentable_id'])
            ->selectRaw(
                'count(*) as documents, count(*) filter (where expiry_date between ? and ?) as expiring_soon, count(*) filter (where is_verified = false) as unverified, min(expiry_date) filter (where expiry_date between ? and ?) as next_expiry_date',
                [$today->toDateString(), $limit = $today->addDays(Document::EXPIRING_SOON_DAYS)->toDateString(), $today->toDateString(), $limit],
            )
            ->groupBy('documentable_type', 'documentable_id')
            ->get();

        $out = [];
        foreach ($rows as $row) {
            $out[$row->documentable_type][(int) $row->documentable_id] = [
                'documents' => (int) $row->documents,
                'expiring_soon' => (int) $row->expiring_soon,
                'unverified' => (int) $row->unverified,
                'next_expiry_date' => $row->next_expiry_date !== null ? substr((string) $row->next_expiry_date, 0, 10) : null,
            ];
        }

        return $out;
    }

    /**
     * @param  list<array<string, mixed>>  $entries
     * @return array{documents: int, expiring_soon: int, unverified: int, next_expiry_date: null}
     */
    private function countOf(array $entries, string $prefix): array
    {
        $n = count(array_filter($entries, fn (array $e): bool => str_starts_with($e['category'], $prefix)));

        // Un généré n'a ni vérification ni expiration (ADR-0099 § 3) : il ne compte jamais dans les alertes.
        return ['documents' => $n, 'expiring_soon' => 0, 'unverified' => 0, 'next_expiry_date' => null];
    }

    /**
     * @param  array{type: string, id: int}  $target
     * @param  array{documents: int, expiring_soon: int, unverified: int, next_expiry_date: ?string}|null  $counts
     * @return array<string, mixed>
     */
    private function folder(string $key, string $kind, array $target, ?array $counts): array
    {
        return ['key' => $key, 'kind' => $kind, 'target' => $target]
            + ($counts ?? ['documents' => 0, 'expiring_soon' => 0, 'unverified' => 0, 'next_expiry_date' => null]);
    }

    /**
     * La somme de nœuds ou de dossiers : les trois comptes, et la plus proche des échéances.
     *
     * @param  list<array<string, mixed>>  $parts
     * @return array{documents: int, expiring_soon: int, unverified: int, next_expiry_date: ?string}
     */
    private function sum(array $parts): array
    {
        $dates = array_filter(array_column($parts, 'next_expiry_date'));

        return [
            'documents' => array_sum(array_column($parts, 'documents')),
            'expiring_soon' => array_sum(array_column($parts, 'expiring_soon')),
            'unverified' => array_sum(array_column($parts, 'unverified')),
            'next_expiry_date' => $dates === [] ? null : min($dates),
        ];
    }

    private function tenantName(Lease $lease): ?string
    {
        $name = $lease->tenant?->full_name;

        return $name !== null && $name !== '' ? $name : null;
    }

    private function day(?DateTimeInterface $date): ?string
    {
        return $date?->format('Y-m-d');
    }
}
