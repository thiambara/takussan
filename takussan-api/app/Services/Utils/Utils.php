<?php

namespace App\Services\Utils;

use App\Services\Utils\Traits\_FilterByKeys;
use App\Services\Utils\Traits\_FormatPhone;
use App\Services\Utils\Traits\_GroupBy;
use App\Services\Utils\Traits\_SortByKeyThenValue;
use App\Services\Utils\Traits\_Sum;

class Utils
{

    use _FilterByKeys, _FormatPhone, _GroupBy, _SortByKeyThenValue, _Sum;
}
