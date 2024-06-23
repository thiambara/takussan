<?php

use App\Http\Controllers\AddressController;
use App\Http\Controllers\OAuth2Controller;
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

Route::middleware('auth:api')->get('/auth-user', function (Request $request) {
    /** @var User $user */
    $user = $request->user();

    return response()->json($user->loadMissing('owner'));
});

Route::prefix('oauth2')->controller(OAuth2Controller::class)->group(function () {
    Route::any('google-redirect', 'googleRedirect')->name('google-redirect');
    Route::any('google-callback', 'googleCallback')->name('google-callback');
})->name('oauth2.');

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


