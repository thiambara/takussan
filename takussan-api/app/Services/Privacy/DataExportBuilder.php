<?php

namespace App\Services\Privacy;

use App\Models\AppNotification;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\ConversationParticipant;
use App\Models\Customer;
use App\Models\DataExport;
use App\Models\Document;
use App\Models\Enums\DataExportStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Message;
use App\Models\Review;
use App\Models\User;
use Illuminate\Support\Facades\Storage;
use Spatie\Activitylog\Models\Activity;
use ZipArchive;

class DataExportBuilder
{
    public const DOMAINS = [
        'profile.json',
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
        $conversationIds = ConversationParticipant::query()->where('user_id', $user->id)->pluck('conversation_id');

        return [
            'profile.json' => [
                'user' => $user->makeHidden(['password', 'remember_token', 'two_factor_secret', 'two_factor_recovery_codes'])->toArray(),
                'profiles' => [
                    'owners' => $user->ownerProfiles()->get()->toArray(),
                    'agents' => $user->agentProfiles()->get()->toArray(),
                    'broker' => $user->brokerProfile()->first()?->toArray(),
                    'service_provider' => $user->serviceProviderProfile()->first()?->toArray(),
                ],
            ],
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
                ->toArray(),
            'media/manifest.json' => $user->media()->get(['id', 'collection_name', 'file_name', 'mime_type', 'size'])->toArray(),
        ];
    }
}
