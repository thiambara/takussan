<?php

use App\Http\Controllers\Api\HealthController;
use Illuminate\Support\Facades\Route;

// TCK-105 — public health endpoint; no PII, no auth required. Always returns HTTP 200.
// TCK-600 — it returns the aggregate status cached by `health:probe`, with no detail and no
// outbound call (it used to call the CDN on every anonymous request).
Route::get('health', HealthController::class)->name('health');
