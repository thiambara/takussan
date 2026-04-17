<?php

namespace App\Models\Enums;

enum PropertyVisibility: string
{
    case Public = 'public';
    case Private = 'private';
}
