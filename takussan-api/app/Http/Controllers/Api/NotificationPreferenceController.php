<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Me\UpdateNotificationPreferencesRequest;
use App\Models\User;
use App\Services\Notifications\PreferenceResolver;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-070 — event_type × channel matrix driven by
 * {@see PreferenceResolver}.
 *
 * The legacy flat booleans on users (notifications_email_enabled,
 * notifications_push_enabled, notifications_sms_enabled) are kept in
 * the schema for backwards compatibility but are no longer authoritative.
 */
class NotificationPreferenceController extends Controller
{
    public function __construct(private readonly PreferenceResolver $resolver) {}

    public function show(Request $request): JsonResponse
    {
        return $this->json(['data' => $this->payloadFor($request->user())]);
    }

    public function update(UpdateNotificationPreferencesRequest $request): JsonResponse
    {
        $user = $request->user();
        $validated = $request->validated();

        // New bulk matrix update.
        if (isset($validated['preferences'])) {
            $this->resolver->updateMany($user, $validated['preferences']);
        }

        // Legacy path — flat booleans on users.
        $flat = array_intersect_key(
            $validated,
            array_flip(UpdateNotificationPreferencesRequest::FLAT_KEYS)
        );
        if (! empty($flat)) {
            $user->fill($flat)->save();
        }

        return $this->json(['data' => $this->payloadFor($user)]);
    }

    /**
     * @return array<string, mixed>
     */
    private function payloadFor(User $user): array
    {
        return [
            'preferences' => $this->resolver->matrixFor($user),
            'events' => PreferenceResolver::EVENTS,
            'channels' => PreferenceResolver::CHANNELS,
            'phone_verified' => $user->phone_verified_at !== null,

            // Legacy flat flags — do not rely on for new code.
            'notifications_email_enabled' => (bool) $user->notifications_email_enabled,
            'notifications_push_enabled' => (bool) $user->notifications_push_enabled,
            'notifications_sms_enabled' => (bool) $user->notifications_sms_enabled,
        ];
    }
}
