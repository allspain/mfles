import { Composition, registerRoot } from 'remotion';
import { MainVideo } from './Video';

const RemotionRoot = () => {
  return (
    <Composition
      id="MFLESPromo"
      component={MainVideo}
      durationInFrames={3600}
      fps={60}
      width={1920}
      height={1080}
    />
  );
};

registerRoot(RemotionRoot);
