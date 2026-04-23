<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
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
        $user = $request->user();

        return $this->json([
            'data' => [
                'preferences' => $this->resolver->matrixFor($user),
                'events' => PreferenceResolver::EVENTS,
                'channels' => PreferenceResolver::CHANNELS,
                'phone_verified' => $user->phone_verified_at !== null,

                // Legacy flat flags — do not rely on for new code.
                'notifications_email_enabled' => (bool) $user->notifications_email_enabled,
                'notifications_push_enabled' => (bool) $user->notifications_push_enabled,
                'notifications_sms_enabled' => (bool) $user->notifications_sms_enabled,
            ],
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $user = $request->user();

        // New bulk matrix update.
        if ($request->has('preferences')) {
            $validated = $request->validate([
                'preferences' => ['required', 'array'],
                'preferences.*.event_type' => ['required', 'string'],
                'preferences.*.channel' => ['required', 'string'],
                'preferences.*.enabled' => ['required', 'boolean'],
            ]);

            $this->resolver->updateMany($user, $validated['preferences']);
        }

        // Legacy path — flat booleans on users.
        $flat = $request->validate([
            'notifications_email_enabled' => ['sometimes', 'boolean'],
            'notifications_push_enabled' => ['sometimes', 'boolean'],
            'notifications_sms_enabled' => ['sometimes', 'boolean'],
        ]);
        if (! empty($flat)) {
            $user->fill($flat)->save();
        }

        return $this->json([
            'data' => [
                'preferences' => $this->resolver->matrixFor($user),
                'notifications_email_enabled' => (bool) $user->notifications_email_enabled,
                'notifications_push_enabled' => (bool) $user->notifications_push_enabled,
                'notifications_sms_enabled' => (bool) $user->notifications_sms_enabled,
            ],
        ]);
    }
}
