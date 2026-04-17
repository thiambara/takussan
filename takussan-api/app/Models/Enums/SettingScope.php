<?php

namespace App\Models\Enums;

enum SettingScope: string
{
    case Global = 'global';
    case Agency = 'agency';
}
