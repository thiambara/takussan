<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Models\Enums\UserStatus;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class UserAdminController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        abort_unless($request->user()->hasRole(['admin', 'super_admin']), 403);

        $paginator = User::buildQuery(null, $request)
            ->defaultSort('-created_at')
            ->paginate();

        return $this->json([
            'data' => $paginator->items(),
            'meta' => [
                'total' => $paginator->total(),
                'current_page' => $paginator->currentPage(),
            ],
        ]);
    }

    public function block(Request $request, User $user): JsonResponse
    {
        abort_unless($request->user()->hasRole(['admin', 'super_admin']), 403);
        abort_if($user->id === $request->user()->id, 422, __('messages.cannot_block_self'));

        $user->update(['status' => UserStatus::Blocked]);
        $user->tokens()->delete();

        return $this->json(['data' => ['id' => $user->id, 'status' => $user->status]]);
    }

    public function activate(Request $request, User $user): JsonResponse
    {
        abort_unless($request->user()->hasRole(['admin', 'super_admin']), 403);

        $user->update(['status' => UserStatus::Active]);

        return $this->json(['data' => ['id' => $user->id, 'status' => $user->status]]);
    }

    public function assignRole(Request $request, User $user): JsonResponse
    {
        abort_unless($request->user()->hasRole(['admin', 'super_admin']), 403);

        $data = $request->validate([
            'role' => ['required', 'string'],
        ]);

        $user->assignRole($data['role']);

        return $this->json(['data' => ['id' => $user->id, 'roles' => $user->getRoleNames()]]);
    }

    public function removeRole(Request $request, User $user, string $role): JsonResponse
    {
        abort_unless($request->user()->hasRole(['admin', 'super_admin']), 403);

        $user->removeRole($role);

        return $this->json(['data' => ['id' => $user->id, 'roles' => $user->getRoleNames()]]);
    }

    public function destroy(Request $request, User $user): JsonResponse
    {
        abort_unless($request->user()->hasRole(['admin', 'super_admin']), 403);
        abort_if($user->id === $request->user()->id, 422, __('messages.cannot_delete_self'));

        $this->anonymize($user);

        return $this->json(null, 204);
    }

    public function deleteOwnAccount(Request $request): JsonResponse
    {
        $user = $request->user();
        $user->tokens()->delete();
        $this->anonymize($user);

        return $this->json(null, 204);
    }

    protected function anonymize(User $user): void
    {
        $user->tokens()->delete();
        $user->update([
            'first_name' => 'Deleted',
            'last_name' => 'User',
            'email' => 'deleted-'.$user->id.'@anonymized.local',
            'phone' => null,
            'bio' => null,
            'status' => UserStatus::Blocked,
            'google_id' => null,
            'facebook_id' => null,
            'apple_id' => null,
            'metadata' => null,
        ]);
        $user->delete();
    }
}
