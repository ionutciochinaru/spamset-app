import { sortedBells } from '@/core/progression';
import { formatLoad, useApp } from '@/store/app-store';

import { Chips } from './ui';

/** Choose which of your bells an exercise uses next. Resets its progression streaks. */
export function BellPicker({ exercise, load }: { exercise: string; load: number }) {
  const settings = useApp((s) => s.settings);
  const setLoad = useApp((s) => s.setPrescriptionLoad);
  return (
    <Chips<string>
      options={sortedBells(settings.bells).map((kg) => ({ value: String(kg), label: formatLoad(kg, settings.units) }))}
      selected={String(load)}
      onToggle={(kg) => setLoad(exercise, Number(kg))}
    />
  );
}
