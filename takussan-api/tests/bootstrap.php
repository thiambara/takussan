<?php

use Tests\Support\TestDatabase;
use Tests\Support\TestFilesystemIsolation;
use Tests\Support\TestSearchIndex;

/*
|--------------------------------------------------------------------------
| Amorçage de la suite de tests
|--------------------------------------------------------------------------
|
| `phpunit.xml` pointait directement sur `vendor/autoload.php`. Ce fichier
| s'intercale pour poser ce qui doit l'être AVANT que la moindre application
| Laravel ne soit construite : les deux ressources PARTAGÉES PAR MACHINE que
| deux exécutions simultanées de la suite se détruisaient mutuellement — les
| index Meilisearch, et la racine des disques `Storage::fake()`.
|
| Il doit rester MINUSCULE : tout ce qui s'exécute ici s'exécute avant PHPUnit,
| donc sans rapport de test, sans couverture, et sans qu'un échec ne soit
| imputé à un test.
|
*/

require __DIR__.'/../vendor/autoload.php';

TestDatabase::install();
TestSearchIndex::install();
TestFilesystemIsolation::install();
