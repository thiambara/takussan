<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Admin\Support\ForcePasswordResetRequest;
use App\Http\Requests\Api\Admin\Support\Reset2faRequest;
use App\Http\Requests\Api\Admin\Support\RevokeSessionsRequest;
use App\Http\Requests\Api\Admin\Support\UnlockRequest;
use App\Models\User;
use App\Services\Admin\UserSupportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class UserSupportController extends Controller
{
    public function forcePasswordReset(
        ForcePasswordResetRequest $request,
        User $user,
        UserSupportService $support,
    ): JsonResponse {
        return $this->success($support->forcePasswordReset(
            $request->user(),
            $user,
            $request->validated('reason'),
        ));
    }

    public function unlock(UnlockRequest $request, User $user, UserSupportService $support): JsonResponse
    {
        return $this->success($support->unlock($request->user(), $user, $request->validated('reason')));
    }

    public function reset2fa(Reset2faRequest $request, User $user, UserSupportService $support): JsonResponse
    {
        return $this->success($support->resetTwoFactor($request->user(), $user, $request->validated('reason')));
    }

    public function revokeSessions(
        RevokeSessionsRequest $request,
        User $user,
        UserSupportService $support,
    ): JsonResponse {
        return $this->success($support->revokeSessions(
            $request->user(),
            $user,
            $request->validated('reason'),
            (bool) $request->boolean('keep_current_session', true),
        ));
    }

    public function destroySession(Request $request, User $user, int $tokenId, UserSupportService $support): JsonResponse
    {
        $data = $request->validate(['reason' => ['required', 'string', 'min:3', 'max:500']]);

        return $this->success($support->revokeSession($request->user(), $user, $tokenId, $data['reason']));
    }

    private function success(int $activityId): JsonResponse
    {
        return $this->json([
            'success' => true,
            'action_id' => $activityId,
        ]);
    }
}
