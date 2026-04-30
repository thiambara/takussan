<?php

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
| All files in routes/api/ are required here automatically.
*/

foreach (glob(__DIR__.'/api/*.php') as $file) {
    require $file;
}
