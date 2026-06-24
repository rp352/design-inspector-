import React from 'react';
import type { BoxModelData } from '../shared/types';

interface BoxModelProps {
  data: BoxModelData;
  isPlaceholder?: boolean;
}

export const BoxModel: React.FC<BoxModelProps> = ({ data, isPlaceholder = false }) => {
  // Helper to format values: strip units like px if they are 0, etc.
  const formatVal = (val: string) => {
    if (!val || val === '0px' || val === '0') return '—';
    return val.replace('px', '');
  };

  return (
    <div className="w-full flex items-center justify-center p-2 font-mono text-[9px] select-none">
      {/* Margin Box (Outer) */}
      <div className={`w-full max-w-[280px] border border-amber-900/40 rounded p-1.5 flex flex-col items-center relative transition-all duration-300 ${
        isPlaceholder ? 'bg-[#221a0f]/20 opacity-50' : 'bg-[#221a0f]/50'
      }`}>
        <span className="absolute left-1.5 top-0.5 text-[8px] text-amber-600/80 uppercase font-semibold">margin</span>
        <span className="text-amber-500/80 mb-1">{formatVal(data.margin.top)}</span>
        
        <div className="w-full flex items-center justify-between">
          <span className="text-amber-500/80 mr-1.5">{formatVal(data.margin.left)}</span>
          
          {/* Border Box (Middle) */}
          <div className="flex-1 bg-[#1c1c1e] border border-zinc-800 rounded p-1.5 flex flex-col items-center relative">
            <span className="absolute left-1.5 top-0.5 text-[8px] text-zinc-500 uppercase font-semibold">border</span>
            <span className="text-zinc-400 mb-1">{formatVal(data.border.top)}</span>
            
            <div className="w-full flex items-center justify-between">
              <span className="text-zinc-400 mr-1.5">{formatVal(data.border.left)}</span>
              
              {/* Padding Box (Inner) */}
              <div className={`flex-1 border border-emerald-900/40 rounded p-1.5 flex flex-col items-center relative ${
                isPlaceholder ? 'bg-[#0f2214]/20' : 'bg-[#0f2214]/50'
              }`}>
                <span className="absolute left-1.5 top-0.5 text-[8px] text-emerald-600/85 uppercase font-semibold">padding</span>
                <span className="text-emerald-500/80 mb-1">{formatVal(data.padding.top)}</span>
                
                <div className="w-full flex items-center justify-between">
                  <span className="text-emerald-500/80 mr-1.5">{formatVal(data.padding.left)}</span>
                  
                  {/* Content Size Core */}
                  <div className={`flex-1 min-w-[70px] border border-sky-900/40 rounded py-1 px-1.5 text-center font-semibold truncate ${
                    isPlaceholder ? 'bg-[#0c1b2d]/20 text-sky-400/50' : 'bg-[#0c1b2d]/50 text-sky-400'
                  }`}>
                    {data.width.replace('px', '')} × {data.height.replace('px', '')}
                  </div>
                  
                  <span className="text-emerald-500/80 ml-1.5">{formatVal(data.padding.right)}</span>
                </div>
                
                <span className="text-emerald-500/80 mt-1">{formatVal(data.padding.bottom)}</span>
              </div>
              
              <span className="text-zinc-400 ml-1.5">{formatVal(data.border.right)}</span>
            </div>
            
            <span className="text-zinc-400 mt-1">{formatVal(data.border.bottom)}</span>
          </div>
          
          <span className="text-amber-500/80 ml-1.5">{formatVal(data.margin.right)}</span>
        </div>
        
        <span className="text-amber-500/80 mt-1">{formatVal(data.margin.bottom)}</span>
      </div>
    </div>
  );
};
