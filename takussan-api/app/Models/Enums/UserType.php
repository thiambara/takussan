<?php

namespace App\Models\Enums;

enum UserType: string
{
    case Individual = 'individual';
    case Agent = 'agent';
    case Broker = 'broker';
    case Admin = 'admin';
    case ServiceProvider = 'service_provider';
}
