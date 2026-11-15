<?php

namespace App\Services\Geo;

use RuntimeException;

/** TCK-2844 — Commons ne répond pas, trop tard, ou d'une façon illisible. */
final class CommonsIndisponible extends RuntimeException {}
