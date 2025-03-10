<?php

namespace App\Services\Auth\Traits;

use App\Models\Bases\Enums\UserStatus;
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
        $userData['password'] = Hash::make($userData['password']);
        $userData['status'] ??= UserStatus::ACTIVE;
        $user = User::create($userData);
        $user->save();
        return $user;
    }
}
