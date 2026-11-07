import { AlarmBackground } from './AlarmBackground';
import { HealthImportBackground } from './HealthImportBackground';

/** The module's background work on every page: the alarm (#129) and the health store import (#131). */
export function HealthBackground() {
  return (
    <>
      <AlarmBackground />
      <HealthImportBackground />
    </>
  );
}
