import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';

export const FreeCallout: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({ frame: Math.max(0, frame - 10), fps, config: { damping: 12 } });
  const opacity = interpolate(progress, [0, 1], [0, 1]);
  const scale = interpolate(progress, [0, 1], [0.85, 1]);

  const subProgress = spring({ frame: Math.max(0, frame - 35), fps, config: { damping: 14 } });
  const subOpacity = interpolate(subProgress, [0, 1], [0, 1]);
  const subY = interpolate(subProgress, [0, 1], [30, 0]);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: 'linear-gradient(135deg, #1a0a2e 0%, #0d1117 50%, #0a1a0e 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24,
      }}
    >
      <div
        style={{
          opacity,
          transform: `scale(${scale})`,
          fontFamily: '"Inter", "Helvetica Neue", Arial, sans-serif',
          fontSize: 112,
          fontWeight: 900,
          color: '#bc8cff',
          textAlign: 'center',
          lineHeight: 1,
        }}
      >
        Free for Season 13
      </div>
      <div
        style={{
          opacity: subOpacity,
          transform: `translateY(${subY}px)`,
          fontFamily: '"Inter", "Helvetica Neue", Arial, sans-serif',
          fontSize: 36,
          fontWeight: 400,
          color: '#8b949e',
          textAlign: 'center',
        }}
      >
        No payment. No account. Just install.
      </div>
    </div>
  );
};
