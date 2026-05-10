import React, { useState } from 'react';
import { Search, Bell, Plus, Command, ChevronDown, Zap } from 'lucide-react';
import { mockUser } from '../data/mock';

interface TopBarProps {
  onNewOffer?: () => void;
}

const TopBar: React.FC<TopBarProps> = ({ onNewOffer }) => {
  const [searchFocused, setSearchFocused] = useState(false);
  const user = mockUser;

  return (
    <header className="h-16 bg-white/80 backdrop-blur-xl border-b border-slate-100 flex items-center px-6 gap-4 sticky top-0 z-30">
      {/* Search */}
      <div className={`flex-1 max-w-md relative transition-all duration-200 ${searchFocused ? 'max-w-xl' : ''}`}>
        <div
          className={`flex items-center gap-2.5 px-3.5 py-2 rounded-xl border transition-all duration-200 cursor-text ${
            searchFocused
              ? 'border-indigo-300 bg-white shadow-md shadow-indigo-100'
              : 'border-slate-200 bg-slate-50 hover:border-slate-300'
          }`}
          onClick={() => setSearchFocused(true)}
        >
          <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <input
            type="text"
            placeholder="Buscar ofertas, canais..."
            className="flex-1 text-sm bg-transparent outline-none text-slate-700 placeholder-slate-400"
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
          />
          {!searchFocused && (
            <div className="flex items-center gap-1 text-slate-300">
              <Command className="w-3 h-3" />
              <span className="text-xs">K</span>
            </div>
          )}
        </div>
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-3 ml-auto">
        {/* New Offer Button */}
        <button
          onClick={onNewOffer}
          className="btn-gradient flex items-center gap-2 text-sm px-4 py-2.5 shadow-lg shadow-indigo-200"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Nova Oferta</span>
        </button>

        {/* Notifications */}
        <button className="relative w-9 h-9 rounded-xl border border-slate-200 bg-white flex items-center justify-center hover:border-slate-300 hover:bg-slate-50 transition-all duration-200">
          <Bell className="w-4 h-4 text-slate-500" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-indigo-500 border-2 border-white" />
        </button>

        {/* User Avatar */}
        <button className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-slate-50 transition-all duration-200 group">
          <div className="w-7 h-7 rounded-full overflow-hidden bg-gradient-to-br from-indigo-400 to-purple-400">
            <img
              src={`https://api.dicebear.com/7.x/initials/svg?seed=${user.name}&backgroundColor=4f46e5`}
              alt={user.name}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="hidden md:block text-left">
            <p className="text-xs font-semibold text-slate-700 leading-none">{user.name.split(' ')[0]}</p>
          </div>
          <ChevronDown className="w-3 h-3 text-slate-400 group-hover:text-slate-600 transition-transform" />
        </button>
      </div>

      {/* Plan Badge */}
      <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100">
        <Zap className="w-3 h-3 text-indigo-600" fill="currentColor" />
        <span className="text-xs font-semibold text-indigo-700">Pro</span>
      </div>
    </header>
  );
};

export default TopBar;
