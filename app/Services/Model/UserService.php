<?php

namespace App\Services\Model;

use App\Models\Bases\Enums\UserStatus;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Throwable;

class UserService
{
    /**
     * Store a new user
     * @throws Throwable
     */
    public function store(array $data): User
    {
        return DB::transaction(function () use ($data) {
            $data['password'] = Hash::make($data['password']);
            $data['status'] ??= UserStatus::Active->value;
            
            return User::create($data);
        });
    }

    /**
     * Update an existing user
     * @throws Throwable
     */
    public function update(User $user, array $data): User
    {
        return DB::transaction(function () use ($user, $data) {
            // Password handling should be careful here, usually separate or checked if present
            if (isset($data['password'])) {
                 $data['password'] = Hash::make($data['password']);
            } else {
                unset($data['password']);
            }
            
            $user->update($data);
            return $user;
        });
    }

    /**
     * Delete a user
     * @throws Throwable
     */
    public function delete(User $user): bool
    {
        return DB::transaction(function () use ($user) {
            return $user->delete();
        });
    }
}
