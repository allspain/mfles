import { useCurrentFrame, useVideoConfig, spring, interpolate, staticFile } from 'remotion';

export const InstallCTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({ frame, fps, config: { damping: 14 } });
  const opacity = interpolate(progress, [0, 1], [0, 1]);
  const y = interpolate(progress, [0, 1], [40, 0]);

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
        gap: 32,
      }}
    >
      <div
        style={{
          opacity,
          transform: `translateY(${y}px)`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 24,
        }}
      >
        <img
          src={staticFile('logo.png')}
          style={{ width: 96, height: 96, borderRadius: 20 }}
        />
        <div
          style={{
            fontFamily: '"Inter", "Helvetica Neue", Arial, sans-serif',
            fontSize: 64,
            fontWeight: 800,
            color: '#e6edf3',
            textAlign: 'center',
          }}
        >
          MFL Enhancement Suite
        </div>
        <div
          style={{
            fontFamily: 'monospace',
            fontSize: 28,
            color: '#3fb950',
            background: '#161b22',
            padding: '16px 48px',
            borderRadius: 12,
            border: '1px solid #30363d',
          }}
        >
          chromewebstore.google.com/detail/mfl-enhancement-suite/bcaibdichinejdjfndnjommilhnijonj
        </div>
        <div
          style={{
            fontFamily: '"Inter", "Helvetica Neue", Arial, sans-serif',
            fontSize: 28,
            color: '#8b949e',
          }}
        >
          Free · Season 13 · Chrome Web Store
        </div>
      </div>
    </div>
  );
};
