import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { staticFile } from 'remotion';

interface LogoProps {
  size?: number;
  top?: number;
  left?: number;
}

export const Logo: React.FC<LogoProps> = ({ size = 80, top = 48, left = 48 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({ frame, fps, config: { damping: 14 } });
  const opacity = interpolate(progress, [0, 1], [0, 1]);
  const scale = interpolate(progress, [0, 1], [0.6, 1]);

  return (
    <img
      src={staticFile('logo.png')}
      style={{
        position: 'absolute',
        top,
        left,
        width: size,
        height: size,
        opacity,
        transform: `scale(${scale})`,
        borderRadius: 16,
      }}
    />
  );
};
