<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Base\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Str;

class EnumsController extends Controller
{

    public function __construct()
    {
    }

    public function index(): JsonResponse
    {
        $name = request('name'); // like UserRoles or User_roles or user_roles
        $enum = 'App\Models\Bases\Enums\\' . Str::studly($name);
        if (enum_exists($enum)) {
            return $this->json(array_map('enum_value', $enum::cases()));
        }
        return $this->json();
    }
}
