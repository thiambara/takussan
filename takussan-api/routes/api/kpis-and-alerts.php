<?php

use App\Http\Controllers\Api\KpiConfigController;
use App\Http\Controllers\Api\ThresholdAlertController;
use Illuminate\Support\Facades\Route;

/*
 * TCK-032 P3 — KPI configuration and threshold alert routes.
 */
Route::middleware('auth:sanctum')->group(function () {
    Route::get('kpi-configs/metrics', [KpiConfigController::class, 'metrics'])->name('kpi-configs.metrics');
    Route::apiResource('kpi-configs', KpiConfigController::class)
        ->only(['index', 'store', 'update', 'destroy']);
    Route::apiResource('threshold-alerts', ThresholdAlertController::class)
        ->only(['index', 'store', 'update', 'destroy']);
});
