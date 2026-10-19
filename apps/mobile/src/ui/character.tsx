import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';

// Vybe's illustrated avatar: a friendly bust built from parts. Each part is an index; the server validates the
// same ranges (apps/server/src/modules/users/routes.ts avatarStyleSchema). Only ever append options, never reorder.
export type AvatarLook = {
  skin: number;
  face: number;
  hair: number;
  hairColor: number;
  eyes: number;
  mouth: number;
  accessory: number;
  outfit: number;
};

export const SKIN = [
  '#FFDBB4',
  '#F1C27D',
  '#E0AC69',
  '#C68642',
  '#A8693C',
  '#8D5524',
  '#6B3E1E',
  '#4A2A14',
];
export const HAIR_COLOR = [
  '#1F1A17',
  '#3B2A20',
  '#6B4423',
  '#A0522D',
  '#D4A15A',
  '#E8C872',
  '#B33A3A',
  '#E86FA0',
  '#6C4CF5',
  '#3EC6FF',
];
export const OUTFIT = [
  '#6C4CF5',
  '#FF6B4A',
  '#C6F432',
  '#3EC6FF',
  '#FFB020',
  '#14121F',
  '#2BB673',
  '#E5484D',
  '#F3F0FF',
  '#FF8FC8',
];
export const PART_COUNTS: AvatarLook = {
  skin: 8,
  face: 4,
  hair: 10,
  hairColor: 10,
  eyes: 6,
  mouth: 6,
  accessory: 6,
  outfit: 10,
};

export const randomLook = (): AvatarLook =>
  Object.fromEntries(
    Object.entries(PART_COUNTS).map(([k, n]) => [k, Math.floor(Math.random() * n)]),
  ) as AvatarLook;

const INK = '#1F1A17';
const CROP = 'M28 40 C28 22 40 14 50 14 C62 14 73 22 72 40 C66 30 58 26 50 26 C42 26 34 30 28 40 Z';
const FRINGE =
  'M28 38 C30 22 42 16 50 16 C60 16 70 22 72 38 C64 30 56 28 50 28 C44 28 36 30 28 38 Z';

function HairBack({ style, color }: { style: number; color: string }) {
  if (style === 4)
    return (
      <Path
        d="M24 42 C22 18 40 12 50 12 C62 12 78 18 76 42 L78 76 L64 76 L64 48 L36 48 L36 76 L22 76 Z"
        fill={color}
      />
    );
  if (style === 8) return <Circle cx={50} cy={36} r={30} fill={color} />;
  if (style === 9)
    return (
      <Path
        d="M25 46 C22 20 38 13 50 13 C62 13 78 20 75 46 L75 60 C68 62 32 62 25 60 Z"
        fill={color}
      />
    );
  return null;
}

function HairFront({ style, color }: { style: number; color: string }) {
  switch (style) {
    case 1:
      return <Path d={CROP} fill={color} />;
    case 2:
      return (
        <Path
          d="M27 44 C25 22 40 13 52 14 C66 15 75 25 73 44 C70 34 64 26 56 25 C50 31 38 33 27 44 Z"
          fill={color}
        />
      );
    case 3:
      return (
        <G fill={color}>
          {[
            [30, 32, 8],
            [38, 22, 9],
            [50, 18, 10],
            [62, 22, 9],
            [70, 32, 8],
            [44, 26, 8],
            [56, 26, 8],
          ].map(([x, y, r]) => (
            <Circle key={`${x}-${y}`} cx={x} cy={y} r={r} />
          ))}
        </G>
      );
    case 4:
    case 9:
      return <Path d={FRINGE} fill={color} />;
    case 5:
      return (
        <G fill={color}>
          <Circle cx={50} cy={11} r={9} />
          <Path d={CROP} />
        </G>
      );
    case 6:
      return (
        <Path
          d="M28 38 L30 22 L36 28 L40 14 L46 24 L52 10 L56 23 L63 14 L65 27 L71 21 L72 38 C64 30 57 27 50 27 C43 27 35 30 28 38 Z"
          fill={color}
        />
      );
    case 7:
      return <Path d={CROP} fill={color} opacity={0.55} />;
    case 8:
      return <Path d={FRINGE} fill={color} />;
    default:
      return null; // 0: bald
  }
}

function Head({ face, skin }: { face: number; skin: string }) {
  if (face === 1) return <Ellipse cx={50} cy={42} rx={20} ry={26} fill={skin} />;
  if (face === 2) return <Rect x={28} y={18} width={44} height={48} rx={16} fill={skin} />;
  if (face === 3)
    return (
      <Path
        d="M28 36 C28 22 38 16 50 16 C62 16 72 22 72 36 C72 54 60 66 50 66 C40 66 28 54 28 36 Z"
        fill={skin}
      />
    );
  return <Ellipse cx={50} cy={42} rx={22} ry={24} fill={skin} />;
}

function Eyes({ style }: { style: number }) {
  const arc = (x: number, up: boolean) => (
    <Path
      key={x}
      d={`M${x - 3} 45 Q${x} ${up ? 41 : 47} ${x + 3} 45`}
      stroke={INK}
      strokeWidth={2.2}
      strokeLinecap="round"
      fill="none"
    />
  );
  const dot = (x: number) => <Circle key={x} cx={x} cy={44} r={2.6} fill={INK} />;
  switch (style) {
    case 1:
      return <G>{[41, 59].map((x) => arc(x, true))}</G>;
    case 2:
      return (
        <G>
          {[41, 59].map((x) => (
            <G key={x}>
              <Circle cx={x} cy={44} r={4} fill="#fff" />
              <Circle cx={x + 0.6} cy={44.6} r={2.1} fill={INK} />
            </G>
          ))}
        </G>
      );
    case 3:
      return <G>{[dot(41), arc(59, true)]}</G>;
    case 4:
      return <G>{[41, 59].map((x) => arc(x, false))}</G>;
    case 5:
      return (
        <G>
          {[41, 59].map((x) => (
            <G key={x}>
              {dot(x)}
              <Path
                d={`M${x - 3.5} 40.5 L${x - 2} 42`}
                stroke={INK}
                strokeWidth={1.4}
                strokeLinecap="round"
              />
              <Path
                d={`M${x + 3.5} 40.5 L${x + 2} 42`}
                stroke={INK}
                strokeWidth={1.4}
                strokeLinecap="round"
              />
            </G>
          ))}
        </G>
      );
    default:
      return <G>{[41, 59].map(dot)}</G>;
  }
}

function Mouth({ style }: { style: number }) {
  const line = { stroke: INK, strokeWidth: 2.2, strokeLinecap: 'round' as const, fill: 'none' };
  switch (style) {
    case 1:
      return <Path d="M42 53 Q50 63 58 53 Z" fill="#5A1F1F" />;
    case 2:
      return <Path d="M45 56 L55 56" {...line} />;
    case 3:
      return <Ellipse cx={50} cy={56} rx={3} ry={3.6} fill="#5A1F1F" />;
    case 4:
      return <Path d="M45 56 Q52 58 56 53" {...line} />;
    case 5:
      return (
        <G>
          <Path d="M42 53 Q50 63 58 53 Z" fill="#5A1F1F" />
          <Ellipse cx={50} cy={58} rx={3.4} ry={2.2} fill="#FF8FA3" />
        </G>
      );
    default:
      return <Path d="M44 54 Q50 59 56 54" {...line} />;
  }
}

function Accessory({ style }: { style: number }) {
  switch (style) {
    case 1:
      return (
        <G stroke={INK} strokeWidth={2} fill="none">
          <Circle cx={41} cy={44} r={6} />
          <Circle cx={59} cy={44} r={6} />
          <Path d="M47 44 L53 44" />
        </G>
      );
    case 2:
      return (
        <G fill="#14121F">
          <Rect x={33} y={39} width={15} height={9} rx={4} />
          <Rect x={52} y={39} width={15} height={9} rx={4} />
          <Rect x={47} y={41} width={6} height={2} />
        </G>
      );
    case 3:
      return (
        <G fill="#8D5524" opacity={0.45}>
          {[
            [36, 51],
            [39, 53],
            [42, 51],
            [58, 51],
            [61, 53],
            [64, 51],
          ].map(([x, y]) => (
            <Circle key={`${x}-${y}`} cx={x} cy={y} r={1} />
          ))}
        </G>
      );
    case 4:
      return (
        <G fill="#FFB020">
          <Circle cx={28} cy={53} r={2.4} />
          <Circle cx={72} cy={53} r={2.4} />
        </G>
      );
    case 5:
      return (
        <G>
          <Path d="M25 44 C25 10 75 10 75 44" stroke="#14121F" strokeWidth={5} fill="none" />
          <Rect x={20} y={38} width={9} height={15} rx={4} fill="#14121F" />
          <Rect x={71} y={38} width={9} height={15} rx={4} fill="#14121F" />
        </G>
      );
    default:
      return null;
  }
}

/** The avatar bust, drawn into a 100×100 box. Out-of-range indexes fall back to option 0. */
export function Character({ look, size }: { look: AvatarLook; size: number }) {
  const pick = (arr: string[], i: number) => arr[i] ?? arr[0]!;
  const skin = pick(SKIN, look.skin);
  const hair = pick(HAIR_COLOR, look.hairColor);
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <HairBack style={look.hair} color={hair} />
      <Path d="M14 102 C16 80 32 71 50 71 C68 71 84 80 86 102 Z" fill={pick(OUTFIT, look.outfit)} />
      <Rect x={43} y={58} width={14} height={15} rx={5} fill={skin} />
      <Rect x={43} y={58} width={14} height={15} rx={5} fill="#000" opacity={0.12} />
      <Circle cx={28} cy={45} r={5} fill={skin} />
      <Circle cx={72} cy={45} r={5} fill={skin} />
      <Head face={look.face} skin={skin} />
      <Circle cx={36} cy={52} r={4} fill="#FF6B8A" opacity={0.22} />
      <Circle cx={64} cy={52} r={4} fill="#FF6B8A" opacity={0.22} />
      <HairFront style={look.hair} color={hair} />
      <Eyes style={look.eyes} />
      <Mouth style={look.mouth} />
      <Accessory style={look.accessory} />
    </Svg>
  );
}
