import React from 'react';

interface InspectorCardProps {
  title: string;
  icon: React.ReactNode;
  emptyMessage: string;
  isEmpty: boolean;
  children?: React.ReactNode;          // Actual telemetry data contents
  placeholderChildren?: React.ReactNode; // Mock skeleton placeholders shown during empty state
}

export const InspectorCard: React.FC<InspectorCardProps> = ({
  title,
  icon,
  emptyMessage,
  isEmpty,
  children,
  placeholderChildren
}) => {
  return (
    <div className="border border-[#1f1f23] bg-[#0c0c0e] rounded-lg p-3.5 transition-all duration-300 shadow-[0_1px_3px_rgba(0,0,0,0.5),0_0_1px_rgba(255,255,255,0.05)] hover:border-zinc-800 hover:bg-[#111113] group">
      {/* Card Header */}
      <div className="flex items-center justify-between border-b border-[#1f1f23] pb-2 mb-3">
        <div className="flex items-center gap-2">
          <div className="text-zinc-400 group-hover:text-zinc-200 transition-colors duration-300">
            {icon}
          </div>
          <h3 className="text-[10px] font-mono font-bold tracking-widest text-zinc-400 uppercase">
            {title}
          </h3>
        </div>
        
        {/* Subtle decorative dot grid typical of Linear/Vercel */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <span className="w-1.5 h-1.5 rounded-full bg-zinc-800" />
          <span className="w-1.5 h-1.5 rounded-full bg-zinc-800" />
        </div>
      </div>

      {/* Card Body */}
      <div className="space-y-3">
        {/* Empty State: Only visible when empty */}
        {isEmpty && (
          <div className="bg-[#070708] border border-dashed border-[#1f1f23] rounded-md p-3 flex flex-col items-center justify-center text-center gap-1.5">
            <div className="w-6 h-6 rounded-full bg-[#121215] flex items-center justify-center border border-[#1f1f23]">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-zinc-600" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
            </div>
            <p className="text-[10px] text-zinc-500 font-sans max-w-[200px] leading-relaxed">
              {emptyMessage}
            </p>
          </div>
        )}

        {/* Data Container */}
        {isEmpty ? (
          /* Placeholder View (Muted, Disabled) */
          <div className="opacity-20 pointer-events-none select-none border border-[#1f1f23] bg-[#070708] rounded-md p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[8px] font-mono text-zinc-500 uppercase tracking-widest">Properties</span>
              <span className="text-[8px] font-mono text-zinc-600 bg-zinc-900 border border-[#1f1f23] px-1 rounded">Awaiting Inspect</span>
            </div>
            {placeholderChildren}
          </div>
        ) : (
          /* Live Data View (Full Opacity, Interactive) */
          <div className="border border-[#1f1f23] bg-[#070708] rounded-md p-3 transition-opacity duration-300">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[8px] font-mono text-[#00f0ff] uppercase tracking-widest font-bold">Properties</span>
              <span className="text-[8px] font-mono text-emerald-400 bg-emerald-950/30 border border-emerald-900/50 px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide">Live</span>
            </div>
            {children}
          </div>
        )}
      </div>
    </div>
  );
};
