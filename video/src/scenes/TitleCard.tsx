import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { Logo } from '../components/Logo';

export const TitleCard: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleProgress = spring({ frame: Math.max(0, frame - 20), fps, config: { damping: 14 } });
  const titleOpacity = interpolate(titleProgress, [0, 1], [0, 1]);
  const titleY = interpolate(titleProgress, [0, 1], [60, 0]);

  const subProgress = spring({ frame: Math.max(0, frame - 45), fps, config: { damping: 14 } });
  const subOpacity = interpolate(subProgress, [0, 1], [0, 1]);
  const subY = interpolate(subProgress, [0, 1], [40, 0]);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: '#0d1117',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
      }}
    >
      <Logo size={96} top={48} left={48} />

      {/* Subtle radial glow */}
      <div
        style={{
          position: 'absolute',
          width: 600,
          height: 600,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(63,185,80,0.08) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          opacity: titleOpacity,
          transform: `translateY(${titleY}px)`,
          fontFamily: '"Inter", "Helvetica Neue", Arial, sans-serif',
          fontSize: 88,
          fontWeight: 800,
          color: '#e6edf3',
          textAlign: 'center',
          lineHeight: 1.1,
          padding: '0 120px',
          marginBottom: 32,
        }}
      >
        Stop leaving OVR<br />on the table
      </div>

      <div
        style={{
          opacity: subOpacity,
          transform: `translateY(${subY}px)`,
          fontFamily: '"Inter", "Helvetica Neue", Arial, sans-serif',
          fontSize: 32,
          fontWeight: 400,
          color: '#8b949e',
          textAlign: 'center',
        }}
      >
        MFL Enhancement Suite
      </div>
    </div>
  );
};
