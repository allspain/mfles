import { useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';

interface TextOverlayProps {
  text: string;
  fontSize?: number;
  color?: string;
  bottom?: number;
}

export const TextOverlay: React.FC<TextOverlayProps> = ({
  text,
  fontSize = 64,
  color = '#e6edf3',
  bottom = 80,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const opacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });
  const progress = spring({ frame, fps, config: { damping: 12 } });
  const translateY = interpolate(progress, [0, 1], [40, 0]);

  return (
    <div
      style={{
        position: 'absolute',
        bottom,
        left: 0,
        right: 0,
        textAlign: 'center',
        opacity,
        transform: `translateY(${translateY}px)`,
        fontFamily: '"Inter", "Helvetica Neue", Arial, sans-serif',
        fontSize,
        fontWeight: 700,
        color,
        textShadow: '0 2px 16px rgba(0,0,0,0.8)',
        padding: '0 120px',
      }}
    >
      {text}
    </div>
  );
};
