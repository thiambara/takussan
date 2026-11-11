<?php

namespace Tests\Support;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Document;
use App\Models\Enums\DocumentType;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Inventory;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;

/**
 * TCK-2655 — le décor du coffre de documents, partagé par ses classes de test.
 *
 * Une agence, son admin et un agent ; un bailleur et deux biens ; deux locataires, chacun son bail
 * actif ; un brouillon pour le premier. Sur le bail du premier locataire :
 *
 *  - six échéances PAYÉES (une caution, cinq loyers) — ce sont les six quittances attendues ;
 *  - ce qui n'a pas de quittance : une échéance en attente, une remboursée, une restitution de
 *    caution payée (le reçu est refusé, TCK-594) ;
 *  - un état des lieux d'entrée SIGNÉ (son PDF s'ouvre) et un état des lieux de sortie en brouillon
 *    (son PDF est refusé) ;
 *  - un document de l'admin d'agence.
 *
 * Et ailleurs : un document de l'admin sur le bail de l'AUTRE locataire, un document de l'admin sur
 * le bien (le locataire ne lit pas les documents du bien), la pièce d'identité du premier locataire
 * sur son compte, expirant dans 42 jours, et un justificatif qui expire dans 90 jours.
 */
trait CoffreDeDocuments
{
    protected Agency $agency;

    protected User $admin;

    protected User $agent;

    protected User $landlord;

    protected Property $property;

    protected Property $otherProperty;

    protected User $tenant;

    protected User $otherTenant;

    protected Lease $lease;

    protected Lease $otherLease;

    protected Lease $draftLease;

    /** @var list<LeasePayment> les six échéances payées du bail */
    protected array $paid = [];

    /** @var array<string, LeasePayment> les échéances du bail SANS quittance, par motif */
    protected array $withoutReceipt = [];

    protected LeasePayment $otherTenantPayment;

    protected Inventory $signedInventory;

    protected Inventory $draftInventory;

    protected Document $adminDocOnLease;

    protected Document $adminDocOnOtherLease;

    protected Document $adminDocOnProperty;

    protected Document $idCard;

    protected Document $insurance;

    protected function batirLeCoffre(): void
    {
        $this->agency = Agency::factory()->create();
        $this->admin = User::factory()->create();
        AgencyAdminProfile::query()->create(['user_id' => $this->admin->id, 'agency_id' => $this->agency->id]);
        $this->agent = User::factory()->create();
        AgentProfile::query()->create(['user_id' => $this->agent->id, 'agency_id' => $this->agency->id]);
        $this->landlord = User::factory()->create();
        OwnerProfile::query()->create(['user_id' => $this->landlord->id, 'agency_id' => $this->agency->id]);

        $this->property = Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $this->landlord->id, 'title' => 'Villa Almadies']);
        $this->otherProperty = Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $this->landlord->id, 'title' => 'Appartement Plateau']);

        $this->tenant = User::factory()->create();
        $this->otherTenant = User::factory()->create();
        $this->lease = $this->leaseFor($this->tenant, $this->property, LeaseStatus::Active);
        $this->otherLease = $this->leaseFor($this->otherTenant, $this->otherProperty, LeaseStatus::Active);
        $this->draftLease = $this->leaseFor($this->tenant, $this->otherProperty, LeaseStatus::Draft);

        $this->paid = [$this->payment($this->lease, LeasePaymentType::Deposit, PaymentStatus::Paid, '2026-01-01')];
        foreach (range(1, 5) as $month) {
            $this->paid[] = $this->payment($this->lease, LeasePaymentType::Rent, PaymentStatus::Paid, sprintf('2026-%02d-05', $month));
        }
        $this->withoutReceipt = [
            'pending' => $this->payment($this->lease, LeasePaymentType::Rent, PaymentStatus::Pending, '2026-06-05'),
            'refunded' => $this->payment($this->lease, LeasePaymentType::Rent, PaymentStatus::Refunded, '2026-07-05'),
            'deposit_refund' => $this->payment($this->lease, LeasePaymentType::DepositRefund, PaymentStatus::Paid, '2026-08-05'),
        ];
        $this->otherTenantPayment = $this->payment($this->otherLease, LeasePaymentType::Rent, PaymentStatus::Paid, '2026-01-05');

        $this->signedInventory = Inventory::factory()->signed()->create([
            'lease_id' => $this->lease->id, 'property_id' => $this->property->id,
            'tenant_id' => $this->lease->tenant_id, 'conducted_by' => $this->admin->id,
        ]);
        $this->draftInventory = Inventory::factory()->moveOut()->create([
            'lease_id' => $this->lease->id, 'property_id' => $this->property->id,
            'tenant_id' => $this->lease->tenant_id, 'conducted_by' => $this->admin->id,
        ]);

        $this->adminDocOnLease = $this->document($this->lease, $this->admin, DocumentType::LeaseContract, 'Avenant signé');
        $this->adminDocOnOtherLease = $this->document($this->otherLease, $this->admin, DocumentType::LeaseContract, 'Avenant de l\'autre bail');
        $this->adminDocOnProperty = $this->document($this->property, $this->admin, DocumentType::Insurance, 'Assurance du bien');
        $this->idCard = $this->document($this->tenant, $this->tenant, DocumentType::IdCard, 'CNI', today()->addDays(42)->toDateString());
        $this->insurance = $this->document($this->tenant, $this->tenant, DocumentType::Insurance, 'Assurance habitation', today()->addDays(90)->toDateString());
    }

    protected function leaseFor(User $tenant, Property $property, LeaseStatus $status): Lease
    {
        $customer = Customer::query()->where('user_id', $tenant->id)->where('agency_id', $property->agency_id)->first()
            ?? Customer::factory()->create(['user_id' => $tenant->id, 'agency_id' => $property->agency_id]);

        return Lease::factory()->create([
            'property_id' => $property->id,
            'agency_id' => $property->agency_id,
            'landlord_id' => $property->user_id,
            'tenant_id' => $customer->id,
            'status' => $status,
        ]);
    }

    protected function payment(Lease $lease, LeasePaymentType $type, PaymentStatus $status, string $dueDate): LeasePayment
    {
        return LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'payer_id' => $lease->tenant_id,
            'payment_type' => $type,
            'status' => $status,
            'due_date' => $dueDate,
            'period_start' => substr($dueDate, 0, 8).'01',
            'period_end' => substr($dueDate, 0, 8).'28',
            'paid_at' => $status === PaymentStatus::Paid ? $dueDate.' 10:00:00' : null,
        ]);
    }

    protected function document(Model $target, User $author, DocumentType $type, string $name, ?string $expiry = null): Document
    {
        return Document::factory()->create([
            'documentable_type' => $target::class,
            'documentable_id' => $target->getKey(),
            'uploaded_by' => $author->id,
            'type' => $type,
            'name' => $name,
            'expiry_date' => $expiry,
        ]);
    }

    protected function connecter(User $user, ?Model $profile = null): void
    {
        $this->flushHeaders();
        $this->app['auth']->forgetGuards();
        Sanctum::actingAs($user->fresh());
        if ($profile !== null) {
            $type = match (true) {
                $profile instanceof OwnerProfile => 'owner',
                $profile instanceof AgentProfile => 'agent',
                $profile instanceof AgencyAdminProfile => 'agency_admin',
                default => 'service_provider',
            };
            $this->withHeader('X-Profile-Id', "{$type}:{$profile->getKey()}");
        }
    }

    /** @return array<string, mixed> le coffre de l'appelant connecté */
    protected function coffre(): array
    {
        return $this->getJson('/api/me/document-vault')->assertOk()->json('data');
    }

    /**
     * @param  array<string, mixed>  $vault
     * @return list<array<string, mixed>> toutes les entrées, dossier compris (clé `folder`)
     */
    protected function entrees(array $vault): array
    {
        $entries = [];
        foreach ($vault['folders'] as $folder) {
            foreach ($folder['entries'] as $entry) {
                $entries[] = $entry + ['folder' => $folder['key']];
            }
        }

        return $entries;
    }

    /**
     * @param  array<string, mixed>  $vault
     * @return list<string>
     */
    protected function chemins(array $vault): array
    {
        return array_column($this->entrees($vault), 'download_path');
    }

    /** Le nombre de requêtes d'un appel. */
    protected function requetes(callable $call): int
    {
        DB::flushQueryLog();
        DB::enableQueryLog();
        $call();
        $n = count(DB::getQueryLog());
        DB::disableQueryLog();

        return $n;
    }
}
