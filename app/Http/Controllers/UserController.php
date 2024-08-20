<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\UpdateUserRequest;
use App\Models\Bases\Enums\UserRoles;
use App\Models\Bases\Enums\UserStatus;
use App\Models\User;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;

class UserController extends Controller
{

    public function __construct()
    {
    }

    public function index(): JsonResponse
    {
//        $key = (new User)->cashBaseKey();
//        $responseData = cache()->tags([User::class])->remember($key, 60 * 60, fn() => User::allThroughRequest());
        $query = User::allThroughRequest();
        if (!in_array(UserRoles::ADMIN, auth()->user()->roles ?? [])) {
            $query->where('added_by_id', auth()->user()->id);
        }
        if ($search_query = request()->search_query) {
            $query->where(fn(Builder $query) => $query
                ->where('first_name', 'like', "%$search_query%")
                ->orWhere('last_name', 'like', "%$search_query%")
                ->orWhere('username', 'like', "%$search_query%")
                ->orWhere('email', 'like', "%$search_query%")
                ->orWhere('phone', 'like', "%$search_query%")
            );
        }
        return $this->json($query->paginatedThroughRequest());
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'first_name' => 'required|string',
            'last_name' => 'required|string',
            'username' => 'required|unique:string',
            'email' => 'email|unique:users,email',
            'phone' => 'string|max:255',
            'roles' => 'required',
            'password' => 'required|string|max:255',
        ]);
        $data['password'] = Hash::make($data['password']);
        $data['status'] ??= UserStatus::ACTIVE;
        $user = User::create($data);
        $user->save();
        return $this->json($user);
    }

    public function show(User $user): JsonResponse
    {
        return $this->json($user);
    }

    public function update(UpdateUserRequest $request, User $user): JsonResponse
    {
        $user->update($request->validationData());
        return $this->json($user);
    }

    public function destroy(User $user): JsonResponse
    {
        $user->delete();
        return $this->json($user);
    }

    public function forgotPassword(Request $request): JsonResponse
    {
        $request->validate(['email' => 'required|email']);
        $status = Password::sendResetLink(
            $request->only('email')
        );
        return $this->json(['status' => $status]);
    }

    public function resetPassword(Request $request): JsonResponse
    {
        $request->validate([
            'token' => 'required',
            'email' => 'required|email',
            'password' => 'required|min:8|confirmed',
        ]);

        $status = Password::reset(
            $request->only('email', 'password', 'password_confirmation', 'token'),
            function (User $user, string $password) {
                $user->forceFill([
                    'password' => Hash::make($password)
                ])->setRememberToken(Str::random(60));

                $user->save();

                event(new PasswordReset($user));
            }
        );

        return $this->json(['status' => $status]);
    }
}
