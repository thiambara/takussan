<?php

namespace App\Services\Documents;

use App\Http\Controllers\Api\DocumentPdfController;
use App\Models\Agency;
use App\Models\Customer;
use App\Models\Document;
use App\Models\Enums\LeaseStatus;
use App\Models\Inventory;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\Property;
use App\Models\ServiceProviderBill;
use App\Models\User;
use App\Policies\DocumentPolicy;
use App\Services\Membership\MembershipCapabilityResolver;
use App\Services\Payout\OwnerStatementSnapshots;
use App\Services\Property\BailleurDuBien;
use App\Support\ImpersonationContext;
use Carbon\CarbonImmutable;
use DateTimeInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection as SupportCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

/**
 * TCK-2655 (ADR-0099) — le coffre de documents de l'appelant, rangé par dossier.
 *
 * **La liste suit la lecture.** Chaque entrée n'est rendue que si l'endpoint qui la sert l'ouvrirait,
 * jugée par la MÊME règle que lui :
 *
 *  - document téléversé : `DocumentPolicy::view` = `readsTarget(porteur)` (évalué une fois par cible)
 *    ∨ la règle d'auteur (`restreindreAuTeleverseur`, sa forme SQL) ; pièces de profil retirées sous
 *    impersonation (TCK-697) ;
 *  - contrat : `view` du bail (`DocumentPdfController::leaseContract`), bail hors brouillon ;
 *  - quittance : `DocumentPdfController::mayReadReceipts` et `receiptable()` (payée, hors restitution
 *    de caution ; une échéance remboursée n'est plus payée, TCK-2505) ;
 *  - état des lieux : `view` de l'état des lieux et `Inventory::pdfAvailable()` (`downloadPdf`) ;
 *  - relevé et attestation : `viewOwnerStatement` pour (le bailleur, l'agence du profil actif) ;
 *  - facture d'intervention : `provider_id` = l'appelant, la branche prestataire de
 *    `ServiceProviderBillController::visibleTo`.
 *
 * Les documents générés ne sont jamais copiés en `Document` : ils se listent depuis leur source et se
 * téléchargent par leur endpoint (`download_path`, chemin HTTP complet, préfixe `/api` compris).
 *
 * **Dossiers selon le profil actif** : le locataire n'a pas de profil — ses dossiers « bail » et
 * « quittances » viennent de ses baux, quel que soit le profil actif ; « bien » et « relevés » au
 * profil bailleur actif (son agence) ; « factures » au profil prestataire actif ; « mes pièces »
 * toujours. Un document n'apparaît que dans UN dossier : celui de sa cible quand elle a un dossier,
 * sinon « mes pièces ».
 *
 * **Requêtes** : un nombre constant, quel que soit le nombre d'échéances (les quittances d'un bail sont
 * une requête), de documents, de biens, de baux et d'états des lieux : les règles de lecture sont
 * celles des policies, jugées sous amorce ({@see self::agenciesInPlay()}) — TCK-2655, vérification
 * adverse.
 */
final class DocumentVault
{
    public const KIND_UPLOADED = 'uploaded';

    public const KIND_GENERATED = 'generated';

    /** @var array<string, array<string, mixed>> les dossiers, par clé, dans l'ordre d'ajout */
    private array $folders = [];

    /** @var array<string, string> cible « type:id » → clé du dossier qui la range */
    private array $folderOfTarget = [];

    /** @var array<string, list<array{type: string, id: int}>> cible « type:id » → ses cibles d'appartenance */
    private array $targetsOf = [];

    private User $user;

    private DocumentPolicy $policy;

    /**
     * @return array{folders: list<array<string, mixed>>, counts: array{expiring_soon: int, unverified: int}, attachable_targets: list<array<string, mixed>>}
     */
    public function for(User $user, ?Model $activeProfile): array
    {
        return MembershipCapabilityResolver::primed(
            [$user->id],
            $this->agenciesInPlay($user),
            fn (): array => $this->build($user, $activeProfile),
        );
    }

    /**
     * TCK-2655 (vérification adverse) — les agences de l'appelant que ses jugements liront : celle de
     * son profil actif, ou, sans profil actif qui porte une agence (le locataire, le prestataire),
     * celles de tous ses profils — `User::getAgencyIdAttribute()` les relit alors à chaque jugement
     * de policy, et les charger une fois l'en dispense.
     *
     * @return SupportCollection<int, mixed>
     */
    private function ownAgencies(User $user): SupportCollection
    {
        $active = $user->activeProfile();
        if ($active !== null && isset($active->agency_id)) {
            return collect([$active->agency_id]);
        }
        $user->loadMissing(['ownerProfiles', 'agentProfiles', 'agencyAdminProfiles', 'serviceProviderProfile']);

        return $user->profiles()->pluck('agency_id');
    }

    /**
     * TCK-2655 (vérification adverse) — les agences pour lesquelles amorcer une fois les verdicts
     * « personnel », « membre » et « bailleur » de l'appelant ({@see MembershipCapabilityResolver::primed()}),
     * au lieu d'une requête par bien, bail et état des lieux. Les policies restent les seules juges :
     * l'amorce rend la réponse de leur requête, et une agence absente n'est qu'une requête de plus,
     * jamais un autre verdict (gardé par `DocumentVaultPrimedVerdictParityTest`).
     *
     * Pour le COFFRE, les agences de l'APPELANT suffisent, mesuré : les règles ne demandent une agence
     * que pour le personnel de l'appelant (`staffAgencyId()`, son agence) ou quand une colonne le
     * désigne lui-même (bailleur, conducteur, auteur) — et le coffre ne range que les biens de l'agence
     * du profil actif. Y ajouter les agences des baux et des biens jugés (trois requêtes) n'a retiré
     * aucune requête aux décors de `DocumentVaultOwnerTest` et `DocumentVaultTenantTest` (ablation).
     * `documents/generated` vise une cible quelconque : il y ajoute les agences de la cible.
     *
     * @return list<int>
     */
    private function agenciesInPlay(User $user): array
    {
        return $this->ownAgencies($user)->filter()->map(fn ($id) => (int) $id)->unique()->values()->all();
    }

    /**
     * @return array{folders: list<array<string, mixed>>, counts: array{expiring_soon: int, unverified: int}, attachable_targets: list<array<string, mixed>>}
     */
    private function build(User $user, ?Model $activeProfile): array
    {
        $this->user = $user;
        $this->policy = app(DocumentPolicy::class);
        $this->folders = [];
        $this->folderOfTarget = [];
        $this->targetsOf = [];

        $attachable = [['type' => 'user', 'id' => $user->id, 'folder' => 'pieces', 'name' => null]];

        $leases = $this->tenantLeases();
        foreach ($leases as $lease) {
            $this->addTargetFolder('lease', $lease, $lease->property?->title, [['type' => 'lease', 'id' => $lease->id]]);
        }

        $properties = new Collection;
        if ($activeProfile instanceof OwnerProfile) {
            $properties = $this->ownerProperties((int) $activeProfile->agency_id);
            foreach ($properties as $property) {
                $this->addTargetFolder('property', $property, $property->title, [['type' => 'property', 'id' => $property->id]]);
                foreach ($property->leases as $lease) {
                    $this->mapTarget('lease', $lease->id, "property:{$property->id}", [['type' => 'lease', 'id' => $lease->id], ['type' => 'property', 'id' => $property->id]]);
                }
            }
        }

        $this->folders['pieces'] = ['key' => 'pieces', 'kind' => 'pieces', 'target' => ['type' => 'user', 'id' => $user->id], 'name' => null, 'year' => null, 'entries' => []];

        // Les générés de chaque dossier de cible.
        $contractLeases = $leases->merge($properties->flatMap->leases)->unique('id');
        $this->addContracts($contractLeases);
        $this->addInventories($contractLeases);
        $this->addReceipts($leases);

        if ($activeProfile instanceof OwnerProfile) {
            $this->addStatements((int) $activeProfile->agency_id);
        }
        if ($activeProfile instanceof ServiceProviderProfile) {
            $this->addBills();
        }

        $documents = $this->uploadedDocuments($leases, $properties, $contractLeases);
        $this->addUploaded($documents);

        if (! app(ImpersonationContext::class)->active()) {
            foreach ([...$leases, ...$properties, ...$properties->flatMap->leases] as $target) {
                if ($user->can('attachTo', [Document::class, $target])) {
                    $type = $target instanceof Lease ? 'lease' : 'property';
                    $attachable[] = [
                        'type' => $type,
                        'id' => $target->id,
                        'folder' => $this->folderOfTarget["{$type}:{$target->id}"] ?? 'pieces',
                        'name' => $target instanceof Lease ? $target->property?->title : $target->title,
                    ];
                }
            }
        } else {
            $attachable = [];
        }

        return [
            // Un dossier de cible, « mes pièces » et « mes factures » existent même vides ; un dossier
            // d'année ou de relevés n'existe que par ses entrées.
            'folders' => array_values($this->folders),
            'counts' => $this->counts($documents),
            'attachable_targets' => $attachable,
        ];
    }

    /**
     * TCK-2655 — les entrées générées d'UNE cible (`GET /api/documents/generated?target=`), pour
     * l'onglet Documents d'un bien ou d'un bail : contrat(s), états des lieux signés, et pour un bail
     * ses quittances. Chacune jugée par la règle de son endpoint.
     *
     * @return list<array<string, mixed>>
     */
    public function generatedFor(User $user, Lease|Property $target): array
    {
        $leases = $target instanceof Lease
            ? new Collection([$target->loadMissing(['property', 'tenant'])])
            : $target->leases()->with(['property', 'tenant'])->get();
        // Une cible hors du périmètre du profil actif (la double casquette : agent de A, bailleur
        // de B, qui lit son bien de B) : ses agences, lues sur les modèles déjà chargés, s'ajoutent.
        $agencies = $leases->pluck('agency_id')
            ->merge($leases->map(fn (Lease $lease) => $lease->property?->agency_id))
            ->push($target instanceof Property ? $target->agency_id : $target->property?->agency_id)
            ->merge($this->agenciesInPlay($user));

        return MembershipCapabilityResolver::primed([$user->id], $agencies, fn (): array => $this->generatedOf($user, $target, $leases));
    }

    /**
     * @param  Collection<int, Lease>  $leases
     * @return list<array<string, mixed>>
     */
    private function generatedOf(User $user, Lease|Property $target, Collection $leases): array
    {
        $this->user = $user;
        $this->policy = app(DocumentPolicy::class);
        $this->folders = ['target' => ['key' => 'target', 'kind' => 'target', 'entries' => []]];
        $this->folderOfTarget = [];
        $this->targetsOf = [];

        foreach ($leases as $lease) {
            $targets = [['type' => 'lease', 'id' => $lease->id]];
            if ($lease->property_id !== null) {
                $targets[] = ['type' => 'property', 'id' => (int) $lease->property_id];
            }
            $this->mapTarget('lease', $lease->id, 'target', $targets);
        }
        if ($target instanceof Property) {
            $this->mapTarget('property', $target->id, 'target', [['type' => 'property', 'id' => $target->id]]);
        }

        $this->addContracts($leases);
        $this->addInventories($leases);
        if ($target instanceof Lease) {
            $this->addReceipts($leases, intoTarget: true);
        }

        return $this->folders['target']['entries'];
    }

    /** @return Collection<int, Lease> les baux dont l'appelant est le locataire, hors brouillon */
    private function tenantLeases(): Collection
    {
        return Lease::query()
            ->whereHas('tenant', fn (Builder $q) => $q->where('user_id', $this->user->id))
            ->where('status', '!=', LeaseStatus::Draft->value)
            ->with(['property', 'tenant'])
            ->orderByDesc('start_date')
            ->get()
            ->filter(fn (Lease $lease): bool => $this->policy->readsTarget($this->user, $lease))
            ->values();
    }

    /** @return Collection<int, Property> les biens du bailleur dans l'agence de son profil actif */
    private function ownerProperties(int $agencyId): Collection
    {
        return BailleurDuBien::restreindre(Property::query(), $this->user)
            ->where('agency_id', $agencyId)
            ->with(['leases' => fn ($q) => $q->where('status', '!=', LeaseStatus::Draft->value)->with(['property', 'tenant'])])
            ->orderBy('title')
            ->get()
            ->filter(fn (Property $property): bool => $this->policy->readsTarget($this->user, $property))
            ->each(fn (Property $property) => $property->setRelation('leases', $property->leases
                ->filter(fn (Lease $lease): bool => $this->policy->readsTarget($this->user, $lease))->values()))
            ->values();
    }

    /** @param  list<array{type: string, id: int}>  $targets */
    private function addTargetFolder(string $type, Model $target, ?string $name, array $targets): void
    {
        $key = "{$type}:{$target->getKey()}";
        $this->folders[$key] = ['key' => $key, 'kind' => $type, 'target' => ['type' => $type, 'id' => (int) $target->getKey()], 'name' => $name, 'year' => null, 'entries' => []];
        $this->mapTarget($type, (int) $target->getKey(), $key, $targets);
    }

    /** @param  list<array{type: string, id: int}>  $targets */
    private function mapTarget(string $type, int $id, string $folder, array $targets): void
    {
        $this->folderOfTarget["{$type}:{$id}"] ??= $folder;
        $this->targetsOf["{$type}:{$id}"] ??= $targets;
    }

    /** @param  Collection<int, Lease>  $leases */
    private function addContracts(Collection $leases): void
    {
        foreach ($leases as $lease) {
            if ($lease->status === LeaseStatus::Draft || ! $this->user->can('view', $lease)) {
                continue;
            }
            $this->push("lease:{$lease->id}", [
                'kind' => self::KIND_GENERATED,
                'category' => 'lease_contract',
                'title' => $lease->reference_number,
                'date' => $this->day($lease->signed_at ?? $lease->start_date),
                'download_path' => route('leases.contract.pdf', ['lease' => $lease->id], false),
            ]);
        }
    }

    /** @param  Collection<int, Lease>  $leases */
    private function addInventories(Collection $leases): void
    {
        if ($leases->isEmpty()) {
            return;
        }

        $inventories = Inventory::query()
            ->whereIn('lease_id', $leases->pluck('id'))
            ->pdfAvailable()
            ->with(['property', 'tenant'])
            ->orderBy('conducted_at')
            ->get();

        foreach ($inventories as $inventory) {
            if (! $this->user->can('view', $inventory)) {
                continue;
            }
            $this->push("lease:{$inventory->lease_id}", [
                'kind' => self::KIND_GENERATED,
                'category' => 'inventory_'.($inventory->type?->value ?? 'move_in'),
                'title' => null,
                'date' => $this->day($inventory->signed_at ?? $inventory->conducted_at),
                'download_path' => route('inventories.pdf', ['inventory' => $inventory->id], false),
            ]);
        }
    }

    /**
     * Les quittances : une requête pour tous les baux, quel que soit le nombre d'échéances. Rangées
     * par année d'échéance dans le coffre (« Quittances {année} »), ou dans la cible demandée.
     *
     * @param  Collection<int, Lease>  $leases
     */
    private function addReceipts(Collection $leases, bool $intoTarget = false): void
    {
        $readable = $leases->filter(fn (Lease $lease): bool => DocumentPdfController::mayReadReceipts($this->user, $lease));
        if ($readable->isEmpty()) {
            return;
        }

        $payments = DocumentPdfController::receiptable(LeasePayment::query())
            ->whereIn('lease_id', $readable->pluck('id'))
            ->orderBy('due_date')
            ->get(['id', 'lease_id', 'reference_number', 'payment_type', 'due_date', 'paid_at', 'period_start']);

        foreach ($payments as $payment) {
            $date = $payment->due_date ?? $payment->paid_at;
            $year = $date !== null ? (int) $date->format('Y') : null;
            $entry = [
                'kind' => self::KIND_GENERATED,
                'category' => 'receipt_'.($payment->payment_type?->value ?? 'rent'),
                'title' => $payment->reference_number,
                'date' => $this->day($date),
                'download_path' => route('leases.receipts.pdf', ['lease' => $payment->lease_id, 'payment' => $payment->id], false),
                'targets' => [['type' => 'lease', 'id' => (int) $payment->lease_id]],
            ];

            if ($intoTarget) {
                $this->folders['target']['entries'][] = $this->normalised($entry);

                continue;
            }

            $key = "receipts:{$year}";
            $this->folders[$key] ??= ['key' => $key, 'kind' => 'receipts', 'target' => null, 'name' => null, 'year' => $year, 'entries' => []];
            $this->folders[$key]['entries'][] = $this->normalised($entry);
        }
    }

    /**
     * Les relevés mensuels envoyés (un instantané existe) et l'attestation annuelle de chaque année
     * close qui en a un. Le calcul du jour reste servi par l'endpoint ; rien n'est fabriqué ici.
     */
    private function addStatements(int $agencyId): void
    {
        $agency = Agency::query()->find($agencyId);
        if ($agency === null || ! Gate::forUser($this->user)->allows('viewOwnerStatement', [$this->user, $agency])) {
            return;
        }

        $periods = DB::table(OwnerStatementSnapshots::TABLE)
            ->where('agency_id', $agencyId)
            ->where('landlord_id', $this->user->id)
            ->orderByDesc('period')
            ->pluck('period');
        if ($periods->isEmpty()) {
            return;
        }

        $this->folders['statements'] = ['key' => 'statements', 'kind' => 'statements', 'target' => null, 'name' => null, 'year' => null, 'entries' => []];
        $currentYear = CarbonImmutable::now()->year;
        $years = [];
        foreach ($periods as $period) {
            $this->folders['statements']['entries'][] = $this->normalised([
                'kind' => self::KIND_GENERATED,
                'category' => 'owner_statement',
                'title' => $period,
                'date' => CarbonImmutable::createFromFormat('!Y-m', $period)->endOfMonth()->toDateString(),
                'download_path' => route('owner-statements.pdf', ['period' => $period, 'agency_id' => $agencyId], false),
            ]);
            $years[(int) substr($period, 0, 4)] = true;
        }
        foreach (array_keys($years) as $year) {
            if ($year >= $currentYear) {
                continue;
            }
            $this->folders['statements']['entries'][] = $this->normalised([
                'kind' => self::KIND_GENERATED,
                'category' => 'annual_attestation',
                'title' => (string) $year,
                'date' => "{$year}-12-31",
                'download_path' => route('owner-statements.pdf', ['period' => (string) $year, 'agency_id' => $agencyId], false),
            ]);
        }
    }

    /** « Mes factures » : les factures d'intervention du prestataire (fiche JSON : aucune n'a de PDF). */
    private function addBills(): void
    {
        $bills = ServiceProviderBill::query()
            ->where('provider_id', $this->user->id)
            ->orderByDesc('created_at')
            ->get(['id', 'reference_number', 'created_at', 'property_id']);

        $this->folders['bills'] = ['key' => 'bills', 'kind' => 'bills', 'target' => null, 'name' => null, 'year' => null, 'entries' => []];
        foreach ($bills as $bill) {
            $this->folders['bills']['entries'][] = $this->normalised([
                'kind' => self::KIND_GENERATED,
                'category' => 'provider_bill',
                'title' => $bill->reference_number,
                'date' => $this->day($bill->created_at),
                'download_path' => route('service-provider-bills.show', ['bill' => $bill->id], false),
            ]);
        }
    }

    /**
     * Les documents téléversés que `view` ouvre : ceux des cibles que l'appelant lit (baux, biens,
     * états des lieux des baux rangés, ses fiches client, son compte), plus ses propres téléversements
     * sous la règle d'auteur. Une requête par forme, médias compris.
     *
     * @param  Collection<int, Lease>  $leases
     * @param  Collection<int, Property>  $properties
     * @param  Collection<int, Lease>  $allLeases
     * @return Collection<int, Document>
     */
    private function uploadedDocuments(Collection $leases, Collection $properties, Collection $allLeases): Collection
    {
        $customers = Customer::query()->where('user_id', $this->user->id)->get()
            ->filter(fn (Customer $c): bool => $this->policy->readsTarget($this->user, $c));
        $inventories = $allLeases->isEmpty() ? new Collection : Inventory::query()->whereIn('lease_id', $allLeases->pluck('id'))->with(['property', 'tenant'])->get()
            ->filter(fn (Inventory $i): bool => $this->policy->readsTarget($this->user, $i));
        foreach ($inventories as $inventory) {
            $folder = $this->folderOfTarget["lease:{$inventory->lease_id}"] ?? null;
            if ($folder !== null) {
                $this->mapTarget('inventory', $inventory->id, $folder, [...($this->targetsOf["lease:{$inventory->lease_id}"] ?? []), ['type' => 'inventory', 'id' => $inventory->id]]);
            }
        }

        $readable = [
            Lease::class => $allLeases->pluck('id')->all(),
            Property::class => $properties->pluck('id')->all(),
            Inventory::class => $inventories->pluck('id')->all(),
            Customer::class => $customers->pluck('id')->all(),
            User::class => [$this->user->id],
        ];

        $query = Document::query()
            ->where(function (Builder $any) use ($readable): void {
                foreach ($readable as $class => $ids) {
                    if ($ids !== []) {
                        $any->orWhere(fn (Builder $q) => $q->where('documentable_type', $class)->whereIn('documentable_id', $ids));
                    }
                }
                $any->orWhereIn('id', DocumentPolicy::restreindreAuTeleverseur(Document::query(), $this->user)->select('id'));
            })
            ->with('media')
            ->orderByDesc('created_at');

        if (app(ImpersonationContext::class)->active()) {
            $query->excludingProfilePieces();
        }

        return $query->get();
    }

    /** @param  Collection<int, Document>  $documents */
    private function addUploaded(Collection $documents): void
    {
        $types = array_flip(Document::TARGET_ALIASES);
        foreach ($documents as $document) {
            $type = $types[$document->documentable_type] ?? null;
            $targetKey = $type !== null ? "{$type}:{$document->documentable_id}" : null;
            $folder = $targetKey !== null ? ($this->folderOfTarget[$targetKey] ?? 'pieces') : 'pieces';

            $this->folders[$folder]['entries'][] = [
                'kind' => self::KIND_UPLOADED,
                'category' => $document->type?->value,
                'title' => $document->name,
                'date' => $this->day($document->created_at),
                'download_path' => route('documents.show', ['document' => $document->id], false),
                'document_id' => $document->id,
                'is_verified' => (bool) $document->is_verified,
                'expiry_date' => $this->day($document->expiry_date),
                'versions_count' => $document->media->where('collection_name', 'versions')->count(),
                'targets' => $targetKey !== null ? ($this->targetsOf[$targetKey] ?? [['type' => $type, 'id' => (int) $document->documentable_id]]) : [],
            ];
        }
    }

    /**
     * @param  Collection<int, Document>  $documents
     * @return array{expiring_soon: int, unverified: int}
     */
    private function counts(Collection $documents): array
    {
        $today = Document::today();
        $limit = $today->addDays(Document::EXPIRING_SOON_DAYS);

        return [
            'expiring_soon' => $documents->filter(fn (Document $d): bool => $d->expiry_date !== null
                && $d->expiry_date->toDateString() >= $today->toDateString()
                && $d->expiry_date->toDateString() <= $limit->toDateString())->count(),
            'unverified' => $documents->filter(fn (Document $d): bool => ! $d->is_verified)->count(),
        ];
    }

    /** @param  array<string, mixed>  $entry */
    private function push(string $targetKey, array $entry): void
    {
        $folder = $this->folderOfTarget[$targetKey] ?? null;
        if ($folder === null) {
            return;
        }
        $entry['targets'] = $this->targetsOf[$targetKey] ?? [];
        $this->folders[$folder]['entries'][] = $this->normalised($entry);
    }

    /**
     * Une entrée générée porte les clés d'une téléversée, à nul : la forme est la même partout.
     *
     * @param  array<string, mixed>  $entry
     * @return array<string, mixed>
     */
    private function normalised(array $entry): array
    {
        return $entry + [
            'document_id' => null,
            'is_verified' => null,
            'expiry_date' => null,
            'versions_count' => null,
            'targets' => [],
        ];
    }

    private function day(?DateTimeInterface $date): ?string
    {
        return $date?->format('Y-m-d');
    }
}
