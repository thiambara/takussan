<?php

namespace App\Services\Auth\Traits;

use App\Models\Bases\Enums\UserRole;
use App\Models\Bases\Enums\UserStatus;
use App\Models\Customer;
use App\Models\Role;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

trait _SignUpTrait
{

    public function signUp(array $userData): User
    {
        $userData = validator($userData, [
            'first_name' => 'required|string',
            'last_name' => 'required|string',
            'username' => 'required|unique:users',
            'email' => 'email|unique:users,email',
            'phone' => 'string|max:255',
            'roles' => 'required',
            'password' => 'required|string|max:255',
        ])->validate();

        $roles = $userData['roles'];
        $roles = is_array($roles) ? $roles : [$roles];
        $roles = collect($roles)->map(function ($role) {
            return $role instanceof Role ? $role : Role::where('code', $role)->first();
        })->filter();
        unset($userData['roles']);

        $userData['password'] = Hash::make($userData['password']);
        $userData['status'] ??= UserStatus::Active;

        $user = User::create($userData);
        $user->assignRoles($roles->toArray());
        $user->save();

        $roles->some(fn(Role $role) => $role->code === UserRole::Customer) && $this->createCustomerForUser($user);

        return $user;
    }

    private function createCustomerForUser(User $user): Customer
    {
        $customer = $user->customer()->create([
            'first_name' => $user->first_name,
            'last_name' => $user->last_name,
            'email' => $user->email,
            'phone' => $user->phone,
            'status' => UserStatus::Active,
            'user_id' => $user->id

        ]);
        $customer->save();
        return $customer;
    }
}
