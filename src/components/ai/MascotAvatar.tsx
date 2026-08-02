import './MascotAvatar.css';

interface MascotAvatarProps {
  size?: 'small' | 'medium' | 'large' | string;
  isTyping?: boolean;
  className?: string;
}

export function MascotAvatar({ size = 'medium', isTyping = false, className = '' }: MascotAvatarProps) {
  return (
    <div className={`mascot-avatar-wrapper size-${size} ${isTyping ? 'is-typing' : ''} ${className}`} title="Günlü — AKGÜN AI Asistan Maskotu">
      <div className="mascot-glow-ring"></div>
      <svg viewBox="0 0 100 100" className="mascot-svg-graphic">
        {/* Antenna */}
        <g className="mascot-antenna-group">
          <line x1="50" y1="24" x2="50" y2="12" stroke="#C9922E" strokeWidth="4" strokeLinecap="round" />
          <circle cx="50" cy="9" r="5" fill="#FFD700" className="antenna-gem" />
        </g>

        {/* Cute Ears */}
        <path d="M 22 36 C 12 18, 32 14, 37 28 Z" fill="#C9922E" className="mascot-ear ear-l" />
        <path d="M 78 36 C 88 18, 68 14, 63 28 Z" fill="#C9922E" className="mascot-ear ear-r" />

        {/* Main Body Outer */}
        <rect x="18" y="24" width="64" height="60" rx="28" fill="#C9922E" />
        
        {/* Inner Dark Face Plate */}
        <rect x="23" y="29" width="54" height="50" rx="23" fill="#1C1B19" />

        {/* Cute Blushing Cheeks */}
        <circle cx="31" cy="58" r="5" fill="#EF5350" opacity="0.75" className="cheek-left" />
        <circle cx="69" cy="58" r="5" fill="#EF5350" opacity="0.75" className="cheek-right" />

        {/* Animated Eyes Group */}
        <g className="mascot-eyes-group">
          {/* Left Eye */}
          <g className="eye-l">
            <circle cx="38" cy="47" r="6.5" fill="#FFFFFF" />
            <circle cx="39.5" cy="45.5" r="3" fill="#1C1B19" />
            <circle cx="41" cy="44.5" r="1.2" fill="#FFFFFF" />
          </g>

          {/* Right Eye */}
          <g className="eye-r">
            <circle cx="62" cy="47" r="6.5" fill="#FFFFFF" />
            <circle cx="60.5" cy="45.5" r="3" fill="#1C1B19" />
            <circle cx="59" cy="44.5" r="1.2" fill="#FFFFFF" />
          </g>
        </g>

        {/* Happy Smile Mouth */}
        <path d="M 43 58 Q 50 65 57 58" fill="none" stroke="#FFD700" strokeWidth="3" strokeLinecap="round" className="mascot-smile" />
      </svg>
    </div>
  );
}

export default MascotAvatar;
