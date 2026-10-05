import { useState } from 'react';
import { View } from 'react-native';

import { FigureViewer } from '@/components/figure-viewer';
import { Avatar, Blink, Body, Button, Card, Chips, Divider, Field, Heading, HudCard, IconButton, Label, MemeText, Meter, PixelText, Row, Screen, ScreenHeader, Segmented, Stat, StatBar, Stepper, Steps, Tag, Thumb, Title, Toggle, Well } from '@/components/ui';
import { Palette, PixelSize, Psx } from '@/constants/theme';

/** The visual library on one page (docs/design-system.md). Open from Profile → Visual library. */
export default function VisualLibrary() {
  const [on, setOn] = useState(true);
  const [chip, setChip] = useState('core');
  const [seg, setSeg] = useState<'kg' | 'lb'>('kg');
  const [reps, setReps] = useState(12);
  const [text, setText] = useState('');

  return (
    <Screen>
      <ScreenHeader title="Visual library" back />
      <Body muted>A modern app with a game layer: tactile buttons, HUD numbers in pixel type, and the PSX 3D stage.</Body>

      <Label>Type</Label>
      <Card>
        <Label>HUD (pixel, numbers and timers only)</Label>
        <Row>
          <PixelText size={PixelSize.large} color={Psx.hud}>
            12:04
          </PixelText>
          <PixelText size={PixelSize.medium} color={Palette.accent}>
            X 8
          </PixelText>
          <PixelText size={PixelSize.small} color={Psx.cyan}>
            STREAK 5
          </PixelText>
        </Row>
        <Title>Title</Title>
        <Heading>Heading</Heading>
        <Label>Label</Label>
        <Body>Body text stays in the system font so paragraphs and form cues read easily.</Body>
        <Body muted>Muted body for help and secondary detail.</Body>
      </Card>

      <Label>Colour roles</Label>
      <Row style={{ flexWrap: 'wrap' }}>
        {[
          ['Action', Palette.accent],
          ['Go', Palette.go],
          ['HUD', Psx.hud],
          ['System', Psx.cyan],
          ['Danger', Palette.danger],
          ['Text', Palette.text],
        ].map(([name, color]) => (
          <View key={name} style={{ alignItems: 'center', gap: 6 }}>
            <View style={{ width: 48, height: 48, backgroundColor: color, borderRadius: 12 }} />
            <Label>{name}</Label>
          </View>
        ))}
      </Row>

      <Label>ScreenHeader</Label>
      <Card>
        <ScreenHeader title="Pushed screen" back />
        <ScreenHeader title="Tab screen" />
      </Card>

      <Label>Surfaces</Label>
      <Card>
        <Heading>Card</Heading>
        <Body muted>Raised. Pass onPress and it sinks while pressed.</Body>
      </Card>
      <Card onPress={() => {}}>
        <Heading>Pressable card</Heading>
      </Card>
      <HudCard>
        <Heading>StatBar and MemeText</Heading>
        <Row style={{ gap: 16 }}>
          <StatBar label="Strength" value={46} color="#e5483b" icon={{ ios: 'bolt.fill', md: 'bolt' }} />
          <StatBar label="Stamina" value={14} color="#43c24c" icon={{ ios: 'heart.fill', md: 'favorite' }} />
        </Row>
        <MemeText>My moooscles are getting bigger</MemeText>
      </HudCard>
      <HudCard>
        <Heading>HudCard</Heading>
        <Body muted>The home&apos;s player card: warm corner light, orange edge. One per screen.</Body>
        <Divider />
        <Body muted>Divider: a hairline between sections of a card.</Body>
      </HudCard>
      <Well>
        <Heading>Well</Heading>
        <Body muted>Sunken: stats, inputs, inset content.</Body>
      </Well>

      <Label>Buttons</Label>
      <Button label="> Primary" large onPress={() => {}} />
      <Button label="> Go" kind="go" onPress={() => {}} />
      <Row>
        <View style={{ flex: 1 }}>
          <Button label="Tonal" kind="tonal" onPress={() => {}} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label="Ghost" kind="ghost" onPress={() => {}} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label="Danger" kind="danger" onPress={() => {}} />
        </View>
      </Row>
      <Button label="Disabled" disabled onPress={() => {}} />
      <Row>
        <IconButton label="↑" hint="Up" onPress={() => {}} />
        <IconButton label="↓" hint="Down" onPress={() => {}} />
        <IconButton label="X" hint="Remove" onPress={() => {}} />
        <IconButton icon={{ ios: 'shuffle', md: 'shuffle' }} hint="Swap" onPress={() => {}} />
        <Avatar size={40} onPress={() => {}} />
      </Row>

      <Label>Inputs</Label>
      <Card>
        <Field value={text} onChangeText={setText} placeholder="Field" />
        <Row style={{ justifyContent: 'space-between' }}>
          <Body>Toggle</Body>
          <Toggle value={on} onChange={setOn} label="Example toggle" />
        </Row>
        <Chips
          options={[
            { value: 'bodyweight', label: 'Bodyweight' },
            { value: 'core', label: 'Core' },
            { value: 'stretch', label: 'Stretch' },
          ]}
          selected={chip}
          onToggle={setChip}
        />
        <Segmented<'kg' | 'lb'>
          options={[
            { value: 'kg', label: 'Kilograms' },
            { value: 'lb', label: 'Pounds' },
          ]}
          value={seg}
          onChange={setSeg}
        />
        <Stepper label="Reps" value={reps} onChange={setReps} />
      </Card>

      <Label>Data</Label>
      <Well>
        <Row>
          <Stat value="3" label="Sessions" />
          <Stat value="148" label="Reps" />
          <Stat value="5" label="Streak" />
        </Row>
        <Meter value={4} max={9} />
        <Row style={{ flexWrap: 'wrap' }}>
          <Tag label="16 kg" accent />
          <Tag label="Per side" />
          <Tag label="Timed" />
        </Row>
      </Well>
      <Card>
        <Steps items={['Hike the bell back high.', 'Snap the hips forward.', 'Float to chest height.']} />
      </Card>

      <Label>Media</Label>
      <FigureViewer clipId="kb-swing" />
      <Row>
        <Thumb clip="kb-swing" style={{ flex: 1 }} />
        <Thumb clip="pushup" style={{ flex: 1 }} />
        <Thumb clip="plank" style={{ flex: 1 }} />
      </Row>

      <Label>Motion</Label>
      <Blink>
        <PixelText center>PRESS START</PixelText>
      </Blink>
    </Screen>
  );
}
