<?php

use App\Http\Controllers\Api\FeatureFlagMeController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->get('feature-flags/me', FeatureFlagMeController::class)->name('feature-flags.me');
