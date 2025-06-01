<?php
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

// Include all API route files
require __DIR__ . '/api/auth/auth.php';
require __DIR__ . '/api/auth/oauth2.php';
require __DIR__ . '/api/addresses.php';
require __DIR__ . '/api/booking-payments.php';
require __DIR__ . '/api/bookings.php';
require __DIR__ . '/api/customers.php';
require __DIR__ . '/api/enums.php';
require __DIR__ . '/api/permissions.php';
require __DIR__ . '/api/properties.php';
require __DIR__ . '/api/property-media.php';
require __DIR__ . '/api/reviews.php';
require __DIR__ . '/api/roles.php';
require __DIR__ . '/api/tags.php';
require __DIR__ . '/api/users.php';
