export function Asterisk({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
      <g strokeLinecap="round" strokeWidth="18">
        <line x1="50" y1="15" x2="50" y2="85" stroke="#6C4DF6" />
        <line x1="20" y1="32" x2="80" y2="68" stroke="#ED3E7E" />
        <line x1="20" y1="68" x2="80" y2="32" stroke="#FFAD47" />
      </g>
    </svg>
  );
}

export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <Asterisk size={22} />
      <div className="leading-tight">
        <div className="text-[15px] font-semibold tracking-tight text-paper">Event Studio</div>
        <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-n400">Factory Studios</div>
      </div>
    </div>
  );
}
