'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { Search, MapPin, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export interface HeroProps {
  readonly className?: string;
}

const quickChips = ['Dakar', 'Plateau', 'Almadies', 'Mermoz', 'Thiès'];

export function Hero({ className }: HeroProps) {
  const [location, setLocation] = useState('');
  const [transaction, setTransaction] = useState('Acheter');

  return (
    <section
      className={`relative min-h-[100dvh] flex items-center justify-center px-8 md:px-16 overflow-hidden ${
        className || ''
      }`}
    >
      {/* Background Image */}
      <div className="absolute inset-0 z-0">
        <Image
          alt="Luxury villa"
          className="w-full h-full object-cover"
          src="https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=1920&auto=format&fit=crop"
          fill
          priority
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-linear-to-b from-black/40 via-black/20 to-[#f8f9fa]" />
      </div>

      {/* Content */}
      <div className="relative z-10 w-full max-w-5xl text-center flex flex-col items-center justify-center pt-20">
        <h1 className="text-5xl md:text-7xl font-bold text-white text-center mb-6 tracking-tight">
          Louez, achetez, vendez en toute confiance
        </h1>
        <p className="text-white/90 text-lg md:text-xl font-medium text-center mb-8 max-w-2xl mx-auto">
          Des milliers de biens au Sénégal vous attendent
        </p>

        {/* Floating Search Bar */}
        <div className="bg-white p-2 md:p-3 rounded-full shadow-2xl flex flex-col md:flex-row items-center gap-2 max-w-4xl mx-auto w-full">
          {/* Location Input */}
          <div className="flex-1 flex items-center px-6 py-2 md:border-r border-gray-200 w-full">
            <MapPin className="text-primary mr-3 w-5 h-5 shrink-0" />
            <input
              type="text"
              placeholder="Où cherchez-vous ?"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full border-none focus:ring-0 bg-transparent text-gray-900 placeholder:text-gray-500 font-medium outline-none"
            />
          </div>

          {/* Transaction Select */}
          <div className="flex-1 flex items-center px-6 py-2 md:border-r border-gray-200 w-full">
            <Home className="text-primary mr-3 w-5 h-5 shrink-0" />
            <Select value={transaction} onValueChange={(v) => setTransaction(v ?? 'Acheter')}>
              <SelectTrigger className="w-full border-none shadow-none bg-transparent p-0 h-auto gap-1 text-gray-900 font-medium focus-visible:ring-0 focus-visible:border-transparent">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Acheter">Acheter</SelectItem>
                <SelectItem value="Louer">Louer</SelectItem>
                <SelectItem value="Programmes Neufs">Programmes Neufs</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Search Button */}
          <Button className="h-14 w-full md:w-14 rounded-full shadow-lg active:scale-95 shrink-0">
            <Search className="w-6 h-6" />
          </Button>
        </div>

        {/* Quick chips */}
        <div className="flex items-center gap-2 mt-5 flex-wrap justify-center">
          <span className="text-white/60 text-sm">Populaire :</span>
          {quickChips.map((chip) => (
            <button
              key={chip}
              onClick={() => setLocation(chip)}
              className="rounded-full bg-white/20 backdrop-blur-sm text-white text-sm px-4 py-1.5 hover:bg-white/30 transition-colors cursor-pointer border border-white/20"
            >
              {chip}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
