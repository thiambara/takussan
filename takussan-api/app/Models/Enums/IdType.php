<?php

namespace App\Models\Enums;

enum IdType: string
{
    case IdCard = 'id_card';
    case Passport = 'passport';
    case DrivingLicense = 'driving_license';
}
