<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Base\Controller;
use App\Services\Auth\AuthService;
use Illuminate\Http\Request;

class AuthController extends Controller
{
    public function __construct(private readonly AuthService $authService)
    {
    }

    public function authUser(Request $request)
    {
        return response()->json($request->user());
    }

    public function login(Request $request)
    {
        $request->validate([
            'username' => 'required|string',
            'password' => 'required|string',
        ]);

        $responseData = $this->authService->login($request->username, $request->password);

        return $this->json($responseData);
    }

    public function signUp(Request $request)
    {
        return $this->json($this->authService->signUp($request->all()));
    }

    public function logout()
    {
        $this->authService->logout();
        return $this->json(['message' => 'Logged out']);

    }

}
