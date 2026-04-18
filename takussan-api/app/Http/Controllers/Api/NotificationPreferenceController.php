<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationPreferenceController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $user = $request->user();

        return $this->json([
            'data' => [
                'notifications_email_enabled' => (bool) $user->notifications_email_enabled,
                'notifications_push_enabled' => (bool) $user->notifications_push_enabled,
                'notifications_sms_enabled' => (bool) $user->notifications_sms_enabled,
            ],
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'notifications_email_enabled' => ['sometimes', 'boolean'],
            'notifications_push_enabled' => ['sometimes', 'boolean'],
            'notifications_sms_enabled' => ['sometimes', 'boolean'],
        ]);

        $request->user()->fill($data)->save();

        return $this->json([
            'data' => [
                'notifications_email_enabled' => (bool) $request->user()->notifications_email_enabled,
                'notifications_push_enabled' => (bool) $request->user()->notifications_push_enabled,
                'notifications_sms_enabled' => (bool) $request->user()->notifications_sms_enabled,
            ],
        ]);
    }
}
