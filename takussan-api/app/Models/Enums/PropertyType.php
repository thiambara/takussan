<?php

namespace App\Models\Enums;

enum PropertyType: string
{
    case Land = 'land';
    case House = 'house';
    case Apartment = 'apartment';
    case Villa = 'villa';
    case Studio = 'studio';
    case Room = 'room';
    case Office = 'office';
    case Shop = 'shop';
    case Warehouse = 'warehouse';
    case Factory = 'factory';
    case Farm = 'farm';
    case Hotel = 'hotel';
    case Resort = 'resort';
    case Garage = 'garage';
    case Parking = 'parking';
    case Other = 'other';
}
