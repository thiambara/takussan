<?php

namespace App\Services\Auth;

use App\Models\User;

interface AuthServiceInterface
{
    public function login(string $identifier, string $password): array;

    public function logout(): bool;

    public function signUp(array $userData): User;
}
