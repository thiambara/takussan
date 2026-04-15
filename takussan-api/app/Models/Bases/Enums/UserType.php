<?php

namespace App\Models\Bases\Enums;

enum UserType: string
{
    case Individual = 'individual';
    case Agent = 'agent';
    case Admin = 'admin';
}
