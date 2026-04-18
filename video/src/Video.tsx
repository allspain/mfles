import { Sequence } from 'remotion';
import { TitleCard } from './scenes/TitleCard';
import { SingleOptimizer } from './scenes/SingleOptimizer';
import { AllTeams } from './scenes/AllTeams';
import { PositionTooltip } from './scenes/PositionTooltip';
import { FreeCallout } from './scenes/FreeCallout';
import { InstallCTA } from './scenes/InstallCTA';

// Scene layout (60fps):
// 0–360    (0–6s)    TitleCard
// 360–1320 (6–22s)   SingleOptimizer
// 1320–2400 (22–40s) AllTeams
// 2400–3000 (40–50s) PositionTooltip
// 3000–3360 (50–56s) FreeCallout
// 3360–3600 (56–60s) InstallCTA

export const MainVideo: React.FC = () => {
  return (
    <>
      <Sequence from={0} durationInFrames={360}>
        <TitleCard />
      </Sequence>
      <Sequence from={360} durationInFrames={960}>
        <SingleOptimizer />
      </Sequence>
      <Sequence from={1320} durationInFrames={1080}>
        <AllTeams />
      </Sequence>
      <Sequence from={2400} durationInFrames={600}>
        <PositionTooltip />
      </Sequence>
      <Sequence from={3000} durationInFrames={360}>
        <FreeCallout />
      </Sequence>
      <Sequence from={3360} durationInFrames={240}>
        <InstallCTA />
      </Sequence>
    </>
  );
};
