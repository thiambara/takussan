'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { Search, MapPin, Home } from 'lucide-react';

export interface HeroProps {
  readonly className?: string;
}

export function Hero({ className }: HeroProps) {
  const [location, setLocation] = useState('');
  const [transaction, setTransaction] = useState('Acheter');

  return (
    <section
      className={`relative h-screen min-h-[700px] flex items-center justify-center px-8 md:px-16 overflow-hidden ${
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
            <MapPin className="text-[#0050cb] mr-3 w-5 h-5" />
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
            <Home className="text-[#0050cb] mr-3 w-5 h-5" />
            <select
              value={transaction}
              onChange={(e) => setTransaction(e.target.value)}
              className="w-full border-none focus:ring-0 bg-transparent text-gray-900 font-medium outline-none appearance-none cursor-pointer"
            >
              <option>Acheter</option>
              <option>Louer</option>
              <option>Programmes Neufs</option>
            </select>
          </div>

          {/* Search Button */}
          <button className="bg-[#0050cb] hover:bg-[#0043a8] text-white h-14 w-full md:w-14 rounded-full flex items-center justify-center transition-all shadow-lg active:scale-95 shrink-0">
            <Search className="w-6 h-6" />
          </button>
        </div>
      </div>
    </section>
  );
}
