<?php

namespace App\Filament\Resources\Properties\Schemas;

use Filament\Forms\Components\Section;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\Textarea;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Toggle;
use Filament\Schemas\Schema;
use Filament\SpatieLaravelMediaLibraryPlugin\Forms\Components\SpatieMediaLibraryFileUpload;

class PropertyForm
{
    public static function configure(Schema $schema): Schema
    {
        return $schema
            ->components([
                Section::make('Informations de base')
                    ->columns(2)
                    ->schema([
                        TextInput::make('title')
                            ->label('Titre de l\'annonce')
                            ->required()
                            ->minLength(10)
                            ->maxLength(255)
                            ->columnSpanFull(),

                        Select::make('type')
                            ->label('Type de bien')
                            ->required()
                            ->options([
                                'apartment' => 'Appartement',
                                'house' => 'Maison',
                                'villa' => 'Villa',
                                'studio' => 'Studio',
                                'land' => 'Terrain',
                                'office' => 'Bureau',
                                'shop' => 'Commerce',
                                'other' => 'Autre',
                            ])
                            ->default('apartment'),

                        Select::make('status')
                            ->label('Statut')
                            ->required()
                            ->options([
                                'draft' => 'Brouillon',
                                'published' => 'Publié',
                                'archived' => 'Archivé',
                            ])
                            ->default('draft'),

                        TextInput::make('price')
                            ->label('Prix')
                            ->required()
                            ->numeric()
                            ->minValue(1)
                            ->suffix('FCFA'),
                    ]),

                Section::make('Localisation')
                    ->columns(2)
                    ->schema([
                        TextInput::make('location_quarter')
                            ->label('Quartier')
                            ->required()
                            ->placeholder('ex: Almadies'),

                        TextInput::make('location_city')
                            ->label('Ville')
                            ->required()
                            ->default('Dakar'),
                    ]),

                Section::make('Caractéristiques')
                    ->columns(4)
                    ->schema([
                        TextInput::make('bedrooms')
                            ->label('Chambres')
                            ->numeric()
                            ->minValue(0),

                        TextInput::make('bathrooms')
                            ->label('Salles de bain')
                            ->numeric()
                            ->minValue(0),

                        TextInput::make('area')
                            ->label('Surface')
                            ->numeric()
                            ->minValue(1)
                            ->suffix('m²'),

                        Toggle::make('featured')
                            ->label('À la une')
                            ->default(false),
                    ]),

                Section::make('Contact propriétaire')
                    ->schema([
                        TextInput::make('owner_phone')
                            ->label('Téléphone WhatsApp')
                            ->required()
                            ->placeholder('+221771234567')
                            ->helperText('Format: +221 suivi de 9 chiffres')
                            ->regex('/^\+221[0-9]{9}$/'),
                    ]),

                Section::make('Photos')->schema([
                    SpatieMediaLibraryFileUpload::make('photos')
                        ->collection('photos')
                        ->multiple()
                        ->maxFiles(10)
                        ->maxSize(5120)
                        ->acceptedFileTypes(['image/jpeg', 'image/png', 'image/webp'])
                        ->reorderable()
                        ->label('Photos du bien')
                        ->columnSpanFull(),
                ]),

                Section::make('Description')
                    ->schema([
                        Textarea::make('description')
                            ->label('Description du bien')
                            ->rows(6)
                            ->columnSpanFull(),
                    ]),
            ]);
    }
}
