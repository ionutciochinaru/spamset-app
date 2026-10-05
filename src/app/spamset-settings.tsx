import { useEffect, useMemo, useState } from 'react';
import { AppState, Platform, View } from 'react-native';

import { Body, Button, Card, Chips, Heading, Label, Row, Screen, ScreenHeader, Stepper, Toggle } from '@/components/ui';
import { Palette } from '@/constants/theme';
import { CATEGORY_LABELS, getExercise, type Category } from '@/core/exercises';
import { DEFAULT_SCHEDULE, INTERVALS, planSpamsets, slotMessage, spamCandidates, timeText, type SpamSchedule } from '@/core/spamset';
import {
  notificationPermission,
  notifyNow,
  openNotificationSettings,
  requestNotificationPermission,
  useExtensionInstalled,
  type PermissionState,
} from '@/lib/spamset-notify';
import { openSpamset, useTargetText } from '@/lib/spamset-scheduler';
import { ownedEquipment, spamSchedule, useApp } from '@/store/app-store';

const CATEGORIES: Category[] = ['bodyweight', 'core', 'stretch', 'gear', 'kettlebell'];
const DAYS = [1, 2, 3, 4, 5, 6, 0];
const dayLabel = (d: number) => new Date(2026, 9, 4 + d).toLocaleDateString(undefined, { weekday: 'short' });
const intervalLabel = (m: number) => (m < 60 ? `${m} min` : `${m / 60} h`);
const timeLabel = timeText;
/** An hour as "9 AM". */
const hourLabel = (h: number) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;

export default function SpamsetSettings() {
  const settings = useApp((s) => s.settings);
  const updateSettings = useApp((s) => s.updateSettings);
  const schedule = spamSchedule(settings);
  const owned = useMemo(() => ownedEquipment(settings), [settings]);
  const candidates = useMemo(() => spamCandidates(schedule, owned), [schedule, owned]);
  const target = useTargetText();
  const extension = useExtensionInstalled();
  const [permission, setPermission] = useState<PermissionState>();

  // Re-check when returning from the system settings.
  useEffect(() => {
    notificationPermission().then(setPermission);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && notificationPermission().then(setPermission));
    return () => sub.remove();
  }, []);

  const update = (patch: Partial<SpamSchedule>) => updateSettings({ spamset: { ...schedule, ...patch } });
  const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const setEnabled = async (enabled: boolean) => {
    if (!enabled) return update({ enabled });
    const state = await requestNotificationPermission();
    setPermission(state);
    // Turn on even if notifications are blocked: the Today card and "Do one now" still work.
    update({ enabled: true });
  };

  const preview = planSpamsets(schedule, owned, new Date(), 4, useApp.getState().spamSwaps);
  const available = CATEGORIES.filter((c) => spamCandidates({ ...DEFAULT_SCHEDULE, pool: [c] }, owned).length);

  return (
    <Screen>
      <ScreenHeader title="Spam sets" back />
      <Body muted>
        One short exercise at your interval, all day. Tap the notification, do the set, log it. Small sets add up.
      </Body>

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Heading style={{ flex: 1 }}>Send spam sets</Heading>
          <Toggle value={schedule.enabled} onChange={setEnabled} label="Send spam sets" />
        </Row>
        {schedule.enabled && permission === 'denied' && (
          <>
            <Body style={{ color: Palette.danger }}>Notifications are blocked, so spam sets can{"'"}t reach you.</Body>
            {Platform.OS === 'web' ? (
              <Body muted style={{ fontSize: 14 }}>
                Click the icon left of the address bar, set Notifications to Allow, then reload.
              </Body>
            ) : (
              <Button label="Open settings" kind="tonal" onPress={openNotificationSettings} />
            )}
          </>
        )}
        {schedule.enabled && permission === 'unsupported' && (
          <Body muted style={{ fontSize: 14 }}>This browser can{"'"}t show notifications. Use the app on your phone or Chrome.</Body>
        )}
        {schedule.enabled && permission === 'undetermined' && (
          <Button label="Allow notifications" kind="tonal" onPress={() => requestNotificationPermission().then(setPermission)} />
        )}
      </Card>

      <Card>
        <Label>Every</Label>
        <Chips<string>
          wrap
          options={INTERVALS.map((m) => ({ value: String(m), label: intervalLabel(m) }))}
          selected={String(schedule.every)}
          onToggle={(v) => update({ every: Number(v) })}
        />
        <Label>Active hours</Label>
        <Stepper
          label="From"
          value={schedule.start / 60}
          format={hourLabel}
          min={0}
          max={schedule.end / 60}
          onChange={(h) => update({ start: h * 60 })}
        />
        <Stepper
          label="Until"
          value={schedule.end / 60}
          format={hourLabel}
          min={schedule.start / 60}
          max={23}
          onChange={(h) => update({ end: h * 60 })}
        />
        <Label>Days</Label>
        <Chips<string>
          wrap
          options={DAYS.map((d) => ({ value: String(d), label: dayLabel(d) }))}
          selected={schedule.days.map(String)}
          onToggle={(v) => update({ days: toggle(schedule.days, Number(v)) })}
        />
      </Card>

      <Card>
        <Label>Exercises from</Label>
        <Chips<Category>
          wrap
          options={available.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))}
          selected={schedule.pool}
          onToggle={(c) => update({ pool: toggle(schedule.pool, c) })}
        />
        <Body muted style={{ fontSize: 14 }}>
          {candidates.length
            ? `${candidates.length} exercises your equipment allows. Targets follow your progression.`
            : 'Pick at least one group your equipment allows.'}
        </Body>
      </Card>

      {preview.length > 0 && (
        <Card>
          <Label>Coming up</Label>
          {preview.map((slot) => (
            <Row key={slot.at.getTime()} style={{ justifyContent: 'space-between' }}>
              <Body muted>
                {slot.at.toDateString() === new Date().toDateString()
                  ? timeLabel(slot.at)
                  : `${slot.at.toLocaleDateString(undefined, { weekday: 'short' })} ${timeLabel(slot.at)}`}
              </Body>
              <Body>
                {getExercise(slot.exercise).name} · {target(slot.exercise)}
              </Body>
            </Row>
          ))}
        </Card>
      )}

      {Platform.OS === 'web' && (
        <Card>
          <Label>With this tab closed</Label>
          <Body muted style={{ fontSize: 14 }}>
            {extension
              ? 'The Spamset Chrome extension is connected and sends spam sets even when this tab is closed.'
              : 'Browsers only let this page notify you while it is open. Install the Spamset Chrome extension to get spam sets with the tab closed; open this page once afterwards to connect it.'}
          </Body>
        </Card>
      )}

      {candidates.length > 0 && (
        <Row>
          <View style={{ flex: 1 }}>
            <Button label="Do one now" kind="go" onPress={() => openSpamset(preview[0]?.exercise ?? candidates[0])} />
          </View>
          {permission === 'granted' && (
            <View style={{ flex: 1 }}>
              <Button
                label="Test notification"
                kind="tonal"
                onPress={() => {
                  const exercise = preview[0]?.exercise ?? candidates[0];
                  notifyNow({ at: new Date(), exercise }, slotMessage(getExercise(exercise).name, target(exercise)));
                }}
              />
            </View>
          )}
        </Row>
      )}
    </Screen>
  );
}
