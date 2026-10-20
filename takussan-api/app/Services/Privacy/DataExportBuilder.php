<?php

namespace App\Services\Privacy;

use App\Models\AppNotification;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Customer;
use App\Models\DataExport;
use App\Models\Document;
use App\Models\Enums\DataExportStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Message;
use App\Models\Profiles\OwnerProfile;
use App\Models\Review;
use App\Models\User;
use App\Services\Messaging\ConversationAccess;
use App\Support\Audit\PropertyRedactor;
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
            'bookings.json' => Booking::query()
                ->whereIn('customer_id', $customerIds)
                ->orWhere('created_by_id', $user->id)
                ->get()
                ->toArray(),
            'leases.json' => Lease::query()
                ->where('landlord_id', $user->id)
                ->orWhereIn('tenant_id', $customerIds)
                ->get()
                ->toArray(),
            'payments.json' => [
                'booking_payments' => BookingPayment::query()->whereIn('payer_id', $customerIds)->get()->toArray(),
                'lease_payments' => LeasePayment::query()->whereIn('payer_id', $customerIds)->orWhere('collector_id', $user->id)->get()->toArray(),
            ],
            'messages.json' => Message::query()
                ->where('sender_id', $user->id)
                ->orWhereIn('conversation_id', $conversationIds)
                ->get()
                ->toArray(),
            'reviews.json' => Review::query()
                ->where('author_id', $user->id)
                ->orWhere(fn ($query) => $query->where('reviewable_type', User::class)->where('reviewable_id', $user->id))
                ->get()
                ->toArray(),
            'notifications.json' => AppNotification::query()->where('user_id', $user->id)->get()->toArray(),
            'documents.json' => Document::query()
                ->where('uploaded_by', $user->id)
                ->orWhere(fn ($query) => $query->where('documentable_type', User::class)->where('documentable_id', $user->id))
                ->get()
                ->toArray(),
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
