<?php

namespace App\Filament\Resources\Properties\Tables;

use Filament\Actions\BulkActionGroup;
use Filament\Actions\DeleteBulkAction;
use Filament\Actions\EditAction;
use Filament\Tables\Columns\IconColumn;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Table;

class PropertiesTable
{
    public static function configure(Table $table): Table
    {
        return $table
            ->columns([
                TextColumn::make('title')
                    ->label('Titre')
                    ->searchable()
                    ->limit(50),

                TextColumn::make('status')
                    ->label('Statut')
                    ->badge()
                    ->color(fn (string $state): string => match ($state) {
                        'published' => 'success',
                        'archived' => 'danger',
                        default => 'gray',
                    })
                    ->formatStateUsing(fn (string $state): string => match ($state) {
                        'published' => 'Publié',
                        'archived' => 'Archivé',
                        default => 'Brouillon',
                    }),

                TextColumn::make('type')
                    ->label('Type')
                    ->badge()
                    ->formatStateUsing(fn (string $state): string => match ($state) {
                        'apartment' => 'Appartement',
                        'house' => 'Maison',
                        'villa' => 'Villa',
                        'studio' => 'Studio',
                        'land' => 'Terrain',
                        'office' => 'Bureau',
                        'shop' => 'Commerce',
                        default => 'Autre',
                    }),

                TextColumn::make('price')
                    ->label('Prix (FCFA)')
                    ->numeric(thousandsSeparator: ' ')
                    ->suffix(' FCFA')
                    ->sortable(),

                TextColumn::make('location_quarter')
                    ->label('Quartier')
                    ->searchable(),

                TextColumn::make('bedrooms')
                    ->label('Ch.')
                    ->numeric()
                    ->sortable(),

                TextColumn::make('area')
                    ->label('Surface')
                    ->numeric()
                    ->suffix(' m²')
                    ->sortable(),

                IconColumn::make('featured')
                    ->label('Une')
                    ->boolean(),

                TextColumn::make('created_at')
                    ->label('Créé le')
                    ->date('d/m/Y')
                    ->sortable(),
            ])
            ->defaultSort('created_at', 'desc')
            ->filters([
                SelectFilter::make('status')
                    ->label('Statut')
                    ->options([
                        'draft' => 'Brouillon',
                        'published' => 'Publié',
                        'archived' => 'Archivé',
                    ]),

                SelectFilter::make('type')
                    ->label('Type')
                    ->options([
                        'apartment' => 'Appartement',
                        'house' => 'Maison',
                        'villa' => 'Villa',
                        'studio' => 'Studio',
                        'land' => 'Terrain',
                        'office' => 'Bureau',
                        'shop' => 'Commerce',
                        'other' => 'Autre',
                    ]),
            ])
            ->recordActions([
                EditAction::make(),
            ])
            ->toolbarActions([
                BulkActionGroup::make([
                    DeleteBulkAction::make(),
                ]),
            ]);
    }
}
