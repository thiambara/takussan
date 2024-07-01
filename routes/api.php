<?php

use App\Http\Controllers\AddressController;
use App\Http\Controllers\auth\AuthController;
use App\Http\Controllers\auth\OAuth2Controller;
use App\Http\Controllers\BookingController;
use App\Http\Controllers\LandController;
use App\Http\Controllers\ProjectController;
use App\Http\Controllers\UserController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
|
| Here is where you can register API routes for your application. These
| routes are loaded by the RouteServiceProvider within a group which
| is assigned the "api" middleware group. Enjoy building your API!
|
*/
/**
 * AUTH ROUTES
 * ==============
 * ***
 */
Route::prefix('auth')->controller(AuthController::class)->group(function () {
    Route::post('/login', 'login')->name('auth-user');
    /**
     * PRIVATE ROUTES
     */
    Route::middleware("auth:sanctum")->group(function () {
        Route::get('/auth-user', 'authUser')->name('auth-user');
        Route::post('/logout', 'logout')->name('logout');
    });
})->name('auth.');

/**
 * 0AUTH2 ROUTES
 * =============
 * ***
 */
Route::prefix('oauth2')->controller(OAuth2Controller::class)->group(function () {
    Route::any('google-redirect', 'googleRedirect')->name('google-redirect');
    Route::any('google-callback', 'googleCallback')->name('google-callback');
})->name('oauth2.');

/**
 * ADDRESS ROUTES
 * ==============
 * ***
 */
Route::prefix('addresses')->controller(AddressController::class)->group(function () {
    /**
     * PRIVATE ROUTES
     */
    Route::middleware("auth:sanctum")->group(function () {
        Route::get('/', 'index')->name('index');
        Route::post('/', 'store')->name('store');
        Route::get('/{address}', 'show')->whereNumber('address')->name('show');
        Route::put('/{address}', 'update')->whereNumber('address')->name('update');
        Route::delete('/{address}', 'destroy')->whereNumber('address')->name('destroy');
    });
})->name('addresses.');

/**
 * BOOKING ROUTES
 * ==============
 * ***
 */
Route::prefix('bookings')->controller(BookingController::class)->group(function () {
    /**
     * PRIVATE ROUTES
     */
    Route::middleware("auth:sanctum")->group(function () {
        Route::get('/', 'index')->name('index');
        Route::post('/', 'store')->name('store');
        Route::get('/{booking}', 'show')->whereNumber('booking')->name('show');
        Route::put('/{booking}', 'update')->whereNumber('booking')->name('update');
        Route::delete('/{booking}', 'destroy')->whereNumber('booking')->name('destroy');
    });
})->name('bookings.');

/**
 * LAND ROUTES
 * ===========
 * ***
 */
Route::prefix('lands')->controller(LandController::class)->group(function () {
    /**
     * PRIVATE ROUTES
     */
    Route::middleware("auth:sanctum")->group(function () {
        Route::get('/', 'index')->name('index');
        Route::post('/', 'store')->name('store');
        Route::get('/{land}', 'show')->whereNumber('land')->name('show');
        Route::put('/{land}', 'update')->whereNumber('land')->name('update');
        Route::delete('/{land}', 'destroy')->whereNumber('land')->name('destroy');
    });
})->name('lands.');

/**
 * 0AUTH2 ROUTES
 * =============
 * ***
 */
Route::prefix('oauth2')->controller(OAuth2Controller::class)->group(function () {
    Route::any('google-redirect', 'googleRedirect')->name('google-redirect');
    Route::any('google-callback', 'googleCallback')->name('google-callback');
})->name('oauth2.');

/**
 * PROJECT ROUTES
 * ==============
 * ***
 */
Route::prefix('projects')->controller(ProjectController::class)->group(function () {
    /**
     * PRIVATE ROUTES
     */
    Route::middleware("auth:sanctum")->group(function () {
        Route::get('/', 'index')->name('index');
        Route::post('/', 'store')->name('store');
        Route::get('/{project}', 'show')->whereNumber('project')->name('show');
        Route::put('/{project}', 'update')->whereNumber('project')->name('update');
        Route::delete('/{project}', 'destroy')->whereNumber('project')->name('destroy');
    });
})->name('projects.');

/**
 * USER ROUTES
 * ===========
 * ***
 */
Route::prefix('users')->controller(UserController::class)->group(function () {
    Route::post('/register', 'store')->name('store');
    Route::post('/forgot-password', 'forgotPassword')->name('forgot-password');
    Route::post('/reset-password', 'resetPassword')->name('reset-password');

    /**
     * PRIVATE ROUTES
     */
    Route::middleware("auth:sanctum")->group(function () {
        Route::get('/', 'index')->name('index');
        Route::get('/{user}', 'show')->whereNumber('user')->name('show');
        Route::put('/{user}', 'update')->whereNumber('user')->name('update');
        Route::delete('/{user}', 'destroy')->whereNumber('user')->name('destroy');
    });
})->name('users.');


