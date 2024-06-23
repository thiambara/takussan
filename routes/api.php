<?php

use App\Http\Controllers\AddressController;
use App\Http\Controllers\BookingController;
use App\Http\Controllers\LandController;
use App\Http\Controllers\OAuth2Controller;
use App\Http\Controllers\ProjectController;
use App\Http\Controllers\UserController;
use App\Models\User;
use Illuminate\Http\Request;
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
 * CURRENT USER
 * ============
 * ***
 */

Route::middleware('auth:api')->get('/auth-user', function (Request $request) {
    /** @var User $user */
    $user = $request->user();

    return response()->json($user->loadMissing('owner'));
});

/**
 * ADDRESS ROUTES
 * ==============
 * ***
 */
Route::prefix('addresses')->controller(AddressController::class)->group(function () {
    /**
     * PRIVATE ROUTES
     */
    Route::middleware("auth:api")->group(function () {
        Route::get('/', 'index')->name('index');
        Route::get('/{address}', 'show')->whereNumber('address')->name('show');
        Route::put('/{address}', 'update')->whereNumber('address')->name('update');
        Route::delete('/{address}', 'destroy')->whereNumber('address')->name('destroy');
    });
})->scopeBindings()->name('addresses.');

/**
 * BOOKING ROUTES
 * ==============
 * ***
 */
Route::prefix('bookings')->controller(BookingController::class)->group(function () {
    /**
     * PRIVATE ROUTES
     */
    Route::middleware("auth:api")->group(function () {
        Route::get('/', 'index')->name('index');
        Route::get('/{booking}', 'show')->whereNumber('booking')->name('show');
        Route::put('/{booking}', 'update')->whereNumber('booking')->name('update');
        Route::delete('/{booking}', 'destroy')->whereNumber('booking')->name('destroy');
    });
})->scopeBindings()->name('bookings.');

/**
 * LAND ROUTES
 * ===========
 * ***
 */
Route::prefix('lands')->controller(LandController::class)->group(function () {
    /**
     * PRIVATE ROUTES
     */
    Route::middleware("auth:api")->group(function () {
        Route::get('/', 'index')->name('index');
        Route::get('/{land}', 'show')->whereNumber('land')->name('show');
        Route::put('/{land}', 'update')->whereNumber('land')->name('update');
        Route::delete('/{land}', 'destroy')->whereNumber('land')->name('destroy');
    });
})->scopeBindings()->name('lands.');

/**
 * OAUTH2 ROUTES
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
    Route::middleware("auth:api")->group(function () {
        Route::get('/', 'index')->name('index');
        Route::get('/{project}', 'show')->whereNumber('project')->name('show');
        Route::put('/{project}', 'update')->whereNumber('project')->name('update');
        Route::delete('/{project}', 'destroy')->whereNumber('project')->name('destroy');
    });
})->scopeBindings()->name('projects.');

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
    Route::middleware("auth:api")->group(function () {
        Route::get('/', 'index')->can('viewAny', User::class)->name('index');
        Route::get('/{user}', 'show')->whereNumber('user')->name('show');
        Route::put('/{user}', 'update')->whereNumber('user')->name('update');
        Route::delete('/{user}', 'destroy')->whereNumber('user')->name('destroy');
    });
})->name('users.');


