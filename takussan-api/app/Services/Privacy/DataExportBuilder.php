<?php

namespace App\Services\Privacy;

use App\Models\AgencyUpgradeRequest;
use App\Models\AppNotification;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Customer;
use App\Models\DataExport;
use App\Models\Document;
use App\Models\Enums\DataExportStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\MaintenanceRequest;
use App\Models\Message;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\Property;
use App\Models\Review;
use App\Models\User;
use App\Services\Messaging\ConversationAccess;
use App\Services\Property\BailleurDuBien;
use App\Support\Audit\PropertyRedactor;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Storage;
use Spatie\Activitylog\Models\Activity;
use ZipArchive;

class DataExportBuilder
{
    public const DOMAINS = [
        'profile.json',
        'customers.json',
        'bookings.json',
        'leases.json',
        'payments.json',
        'messages.json',
        'reviews.json',
        'notifications.json',
        'documents.json',
        'audit-log.json',
        'media/manifest.json',
    ];

    /**
     * TCK-956 (ADR-0070 § 7) — les colonnes d'une fiche client qui entrent dans l'export : son
     * identité, pièce comprise. `notes`, `metadata` et les critères de recherche n'y entrent pas.
     */
    private const CUSTOMER_IDENTITY = [
        'id', 'agency_id', 'first_name', 'last_name', 'email', 'phone',
        'id_type', 'id_number', 'occupation', 'emergency_contact_name', 'emergency_contact_phone',
        'locale', 'created_at', 'updated_at',
    ];

    /**
     * TCK-2366 (P247.01 ; ADR-0070, amendement du 2026-10-25) — l'acte d'une ligne dont le
     * titulaire n'est que l'auteur ou l'encaisseur, comme TCK-1017 pour le journal : identifiant,
     * type, date, montant. Ni client, ni payeur, ni notes, ni metadata, ni nom de pièce.
     */
    private const BOOKING_ACT = ['id', 'total_amount', 'currency', 'created_at'];

    private const LEASE_PAYMENT_ACT = ['id', 'amount', 'currency', 'payment_type', 'paid_at'];

    private const DOCUMENT_ACT = ['id', 'type', 'created_at'];

    /** TCK-2366 (P247.03) — une pièce qui le décrit, déposée par un autre : sans le fichier. */
    private const DOCUMENT_METADATA = ['id', 'type', 'name', 'created_at'];

    public function build(DataExport $export): DataExport
    {
        $export->update(['status' => DataExportStatus::Processing]);

        try {
            $user = $export->user()->firstOrFail();
            $path = "data-exports/user-{$user->id}/export-{$export->id}.zip";
            $absolutePath = Storage::disk('local')->path($path);
            if (! is_dir(dirname($absolutePath))) {
                mkdir(dirname($absolutePath), 0755, true);
            }

            $zip = new ZipArchive;
            $zip->open($absolutePath, ZipArchive::CREATE | ZipArchive::OVERWRITE);
            foreach ($this->payloads($user) as $name => $payload) {
                $zip->addFromString($name, json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
            }
            $zip->close();

            $export->update([
                'status' => DataExportStatus::Ready,
                'archive_path' => $path,
                'size_bytes' => Storage::disk('local')->size($path),
                'ready_at' => now(),
                'expires_at' => now()->addDays(7),
            ]);

            return $export->refresh();
        } catch (\Throwable $e) {
            $export->update(['status' => DataExportStatus::Failed]);
            throw $e;
        }
    }

    /**
     * @return array<string,mixed>
     */
    public function payloads(User $user): array
    {
        $customerIds = Customer::query()->where('user_id', $user->id)->pluck('id');
        // TCK-592 (passe 2, N1) — ses propres messages toujours ; ceux des autres, seulement dans
        // les fils que la garde de conversation lui ouvre encore.
        $conversationIds = app(ConversationAccess::class)->participatingQuery($user, activeOnly: false)->pluck('conversations.id');
        // TCK-2275 (P232.02, précédent TCK-1017) — les baux dont il est le bailleur au sens de
        // `BailleurDuBien`, ou le locataire : pas ceux qu'il a saisis comme agent, actif compris.
        // Ils décrivent le locataire et le bailleur réel.
        // TCK-2366 (P247.02) — sans `commission_amount`, que `LeaseResource` retire à qui n'est pas
        // du personnel : un terme du mandat de l'agence, ni du locataire ni du bailleur.
        $leases = Lease::query()
            ->where(fn ($q) => BailleurDuBien::restreindre($q, $user, 'landlord_id'))
            ->orWhereIn('tenant_id', $customerIds)
            ->get()
            ->each->makeHidden(['commission_amount']);
        $propertyIds = BailleurDuBien::restreindre(Property::query(), $user)->pluck('id');

        return [
            'profile.json' => [
                'user' => $user->makeHidden(['password', 'remember_token', 'two_factor_secret', 'two_factor_recovery_codes'])->toArray(),
                'profiles' => [
                    // TCK-601 — le droit d'accès reste entier : le titulaire reçoit ses identifiants
                    // sensibles EN CLAIR, que `$hidden` retire de toute autre sérialisation.
                    'owners' => $user->ownerProfiles()->get()->each->makeVisible(OwnerProfile::SENSITIVE)->toArray(),
                    'agents' => $user->agentProfiles()->get()->toArray(),
                    'agency_admins' => $user->agencyAdminProfiles()->get()->toArray(),
                    'service_provider' => $user->serviceProviderProfile()->first()?->toArray(),
                ],
            ],
            // TCK-956 (ADR-0070 § 7) — les fiches client du titulaire, pièce EN CLAIR, limitées à
            // l'identité : ni les notes, ni les métadonnées, ni les critères de recherche de
            // l'agence, dont TCK-537 et le conseil juridique décideront.
            'customers.json' => Customer::query()
                ->where('user_id', $user->id)
                ->get(self::CUSTOMER_IDENTITY)
                ->each->makeVisible(Customer::SENSITIVE)
                ->toArray(),
            // TCK-2366 (P247.01) — client, ou bailleur du bien : la ligne entière. Seulement
            // l'auteur : l'acte.
            'bookings.json' => Booking::query()
                ->whereIn('customer_id', $customerIds)
                ->orWhere('created_by_id', $user->id)
                ->get()
                ->map(fn (Booking $booking) => $customerIds->contains($booking->customer_id) || $propertyIds->contains($booking->property_id)
                    ? $booking->toArray()
                    : self::project($booking->toArray(), self::BOOKING_ACT))
                ->all(),
            'leases.json' => $leases->toArray(),
            'payments.json' => [
                'booking_payments' => BookingPayment::query()->whereIn('payer_id', $customerIds)->get()->toArray(),
                // TCK-2366 (P247.01) — payeur, ou bailleur du bail : la ligne entière. Seulement
                // l'encaisseur : l'acte.
                'lease_payments' => LeasePayment::query()
                    ->whereIn('payer_id', $customerIds)
                    ->orWhere('collector_id', $user->id)
                    ->get()
                    ->map(fn (LeasePayment $payment) => $customerIds->contains($payment->payer_id) || $leases->contains('id', $payment->lease_id)
                        ? $payment->toArray()
                        : self::project($payment->toArray(), self::LEASE_PAYMENT_ACT))
                    ->all(),
            ],
            'messages.json' => Message::query()
                ->where('sender_id', $user->id)
                ->orWhereIn('conversation_id', $conversationIds)
                ->get()
                ->toArray(),
            'reviews.json' => Review::query()
                ->where('author_id', $user->id)
                ->orWhere(fn ($query) => $query->where('reviewable_type', User::class)->where('reviewable_id', $user->id))
                // TCK-1397 (P139.04) — les avis sur son profil de prestataire le décrivent aussi
                // (même cible que `ReceivedReviews`) ; ceux sur ses biens restent hors de l'archive.
                ->orWhere(fn ($query) => $query
                    ->where('reviewable_type', ServiceProviderProfile::class)
                    ->whereIn('reviewable_id', ServiceProviderProfile::query()->select('id')->where('user_id', $user->id)))
                ->get()
                ->toArray(),
            'notifications.json' => AppNotification::query()->where('user_id', $user->id)->get()->toArray(),
            'documents.json' => $this->documents($user, $customerIds, $leases, $propertyIds),
            'audit-log.json' => Activity::query()
                ->where(fn ($query) => $query
                    ->where(fn ($inner) => $inner->where('causer_type', User::class)->where('causer_id', $user->id))
                    ->orWhere(fn ($inner) => $inner->where('subject_type', User::class)->where('subject_id', $user->id)))
                ->get()
                ->map(fn (Activity $activity) => $this->auditRow($activity, $user))
                ->all(),
            'media/manifest.json' => $user->media()->get(['id', 'collection_name', 'file_name', 'mime_type', 'size'])->toArray(),
        ];
    }

    /**
     * TCK-2366 (P247.01, P247.03 ; ADR-0070, amendement du 2026-10-25) — les pièces de l'archive,
     * selon le lien du titulaire avec leur porteur :
     * - posées sur son compte, ou déposées par lui sur un porteur qui le décrit : la ligne entière ;
     * - posées sur une de ses fiches client ou un de ses baux de locataire par un autre : les
     *   métadonnées (type, nom, date), sans le fichier ;
     * - déposées par lui sur un porteur qui décrit un tiers (fiche d'un client, bail d'autrui,
     *   caution…) : l'acte seul, sans nom de pièce.
     *
     * @param  Collection<int, int>  $customerIds
     * @param  Collection<int, Lease>  $leases
     * @param  Collection<int, int>  $propertyIds
     * @return array<int, array<string, mixed>>
     */
    private function documents(User $user, Collection $customerIds, Collection $leases, Collection $propertyIds): array
    {
        $tenantLeaseIds = $leases->whereIn('tenant_id', $customerIds)->pluck('id');

        // Les porteurs qui le décrivent : son compte, ses profils (retirés compris : l'agent retiré
        // garde les pièces de son ancien profil), ses fiches, ses baux, ses biens, les interventions
        // qu'il a demandées et les demandes de passage qu'il a déposées.
        $siens = [
            User::class => collect([$user->id]),
            OwnerProfile::class => OwnerProfile::withTrashed()->where('user_id', $user->id)->pluck('id'),
            AgentProfile::class => AgentProfile::withTrashed()->where('user_id', $user->id)->pluck('id'),
            AgencyAdminProfile::class => AgencyAdminProfile::withTrashed()->where('user_id', $user->id)->pluck('id'),
            ServiceProviderProfile::class => ServiceProviderProfile::withTrashed()->where('user_id', $user->id)->pluck('id'),
            Customer::class => $customerIds,
            Lease::class => $leases->pluck('id'),
            Property::class => $propertyIds,
            MaintenanceRequest::class => MaintenanceRequest::query()->where('requester_id', $user->id)->pluck('id'),
            AgencyUpgradeRequest::class => AgencyUpgradeRequest::query()->where('submitted_by', $user->id)->pluck('id'),
        ];
        $leDecrit = fn (Document $document): bool => ($siens[$document->documentable_type] ?? collect())
            ->contains((int) $document->documentable_id);

        return Document::query()
            ->where('uploaded_by', $user->id)
            ->orWhere(fn ($query) => $query->where('documentable_type', User::class)->where('documentable_id', $user->id))
            ->orWhere(fn ($query) => $query->where('documentable_type', Customer::class)->whereIn('documentable_id', $customerIds))
            ->orWhere(fn ($query) => $query->where('documentable_type', Lease::class)->whereIn('documentable_id', $tenantLeaseIds))
            ->get()
            ->map(function (Document $document) use ($user, $leDecrit): array {
                $row = $document->toArray();
                $sonCompte = $document->documentable_type === User::class && (int) $document->documentable_id === $user->id;

                return match (true) {
                    $sonCompte, (int) $document->uploaded_by === $user->id && $leDecrit($document) => $row,
                    (int) $document->uploaded_by === $user->id => self::project($row, self::DOCUMENT_ACT),
                    default => self::project($row, self::DOCUMENT_METADATA),
                };
            })
            ->all();
    }

    /**
     * Les clés de `$keys`, dans leur ordre, prises de la ligne sérialisée.
     *
     * @param  array<string, mixed>  $row
     * @param  list<string>  $keys
     * @return array<string, mixed>
     */
    private static function project(array $row, array $keys): array
    {
        return array_combine($keys, array_map(fn (string $key) => $row[$key] ?? null, $keys));
    }

    /**
     * TCK-1017 (P56.02) — une ligne dont le titulaire n'est que le CAUSEUR décrit un tiers (un
     * client qu'il a saisi, par exemple) : l'export n'en rend que l'acte. Une ligne dont il est le
     * SUJET garde son diff, passé par `PropertyRedactor` comme les autres lectures du journal.
     *
     * @return array<string,mixed>
     */
    private function auditRow(Activity $activity, User $user): array
    {
        $isSubject = $activity->subject_type === User::class && (int) $activity->subject_id === $user->id;

        if (! $isSubject) {
            return [
                'event' => $activity->event,
                'subject_type' => $activity->subject_type,
                'subject_id' => $activity->subject_id,
                'created_at' => $activity->created_at?->toJSON(),
                'description' => $activity->description,
            ];
        }

        $row = $activity->toArray();
        $row['properties'] = PropertyRedactor::redact($activity->properties);
        $row['attribute_changes'] = PropertyRedactor::redact($activity->attribute_changes);

        return $row;
    }
}
