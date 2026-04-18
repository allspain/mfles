import { OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';

interface SceneVideoProps {
  src: string;
  label: string;
  fadeDuration?: number; // frames
}

export const SceneVideo: React.FC<SceneVideoProps> = ({ src, label, fadeDuration = 40 }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Black overlay: starts opaque, fades out (fade in), then fades back in at end (fade out)
  const blackOpacity = interpolate(
    frame,
    [0, fadeDuration, durationInFrames - fadeDuration, durationInFrames],
    [1, 0, 0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  return (
    <div style={{ width: '100%', height: '100%', background: '#000', position: 'relative' }}>
      <OffthreadVideo
        src={staticFile(src)}
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
      />
      {/* Gradient for label legibility */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 160,
          background: 'linear-gradient(transparent, rgba(0,0,0,0.75))',
          pointerEvents: 'none',
        }}
      />
      <LabelOverlay text={label} fadeDuration={fadeDuration} />
      {/* Black fade overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: '#000',
          opacity: blackOpacity,
          pointerEvents: 'none',
        }}
      />
    </div>
  );
};

const LabelOverlay: React.FC<{ text: string; fadeDuration: number }> = ({ text, fadeDuration }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const opacity = interpolate(
    frame,
    [fadeDuration, fadeDuration + 20, durationInFrames - fadeDuration - 10, durationInFrames - fadeDuration + 10],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const translateY = interpolate(frame, [fadeDuration, fadeDuration + 20], [20, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 64,
        left: 0,
        right: 0,
        textAlign: 'center',
        opacity,
        transform: `translateY(${translateY}px)`,
        fontFamily: '"Inter", "Helvetica Neue", Arial, sans-serif',
        fontSize: 56,
        fontWeight: 700,
        color: '#e6edf3',
        textShadow: '0 2px 16px rgba(0,0,0,0.9)',
        padding: '0 120px',
      }}
    >
      {text}
    </div>
  );
};
