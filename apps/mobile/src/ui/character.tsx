import Svg, { Circle, ClipPath, Defs, Ellipse, G, Path, Rect } from 'react-native-svg';

// Vybe's illustrated avatar: a friendly, expressive bust built from parts (big eyes, brows, nose, clothes).
// Each part is an index; the server validates the same ranges (apps/server/src/modules/users/routes.ts
// avatarStyleSchema). Only ever APPEND options, never reorder: saved avatars must keep their look.
export type AvatarLook = {
  skin: number;
  face: number;
  hair: number;
  hairColor: number;
  eyes: number;
  mouth: number;
  accessory: number;
  outfit: number;
  // Optional (added later): older saved avatars fall back to option 0.
  brows?: number;
  nose?: number;
  facialHair?: number;
  eyeColor?: number;
  top?: number;
};

export const SKIN = ['#FFDBB4', '#F1C27D', '#E0AC69', '#C68642', '#A8693C', '#8D5524', '#6B3E1E', '#4A2A14'];
export const HAIR_COLOR = ['#1F1A17', '#3B2A20', '#6B4423', '#A0522D', '#D4A15A', '#E8C872', '#B33A3A', '#E86FA0', '#6C4CF5', '#3EC6FF'];
export const OUTFIT = ['#6C4CF5', '#FF6B4A', '#C6F432', '#3EC6FF', '#FFB020', '#14121F', '#2BB673', '#E5484D', '#F3F0FF', '#FF8FC8'];
export const EYE_COLOR = ['#5B3A1E', '#2B1B12', '#8A6A2F', '#3C7A4A', '#3B7DD8', '#7A8794'];
export const PART_COUNTS: Required<AvatarLook> = {
  skin: 8,
  face: 4,
  hair: 10,
  hairColor: 10,
  eyes: 6,
  mouth: 6,
  accessory: 6,
  outfit: 10,
  brows: 5,
  nose: 4,
  facialHair: 5,
  eyeColor: 6,
  top: 5,
};

export const randomLook = (): Required<AvatarLook> =>
  Object.fromEntries(Object.entries(PART_COUNTS).map(([k, n]) => [k, Math.floor(Math.random() * n)])) as Required<AvatarLook>;

const INK = '#1F1A17';

/** Darken (amt < 0) or lighten (amt > 0) a #RRGGBB colour. */
export function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)));
  return `#${[n >> 16, (n >> 8) & 255, n & 255].map((v) => ch(v).toString(16).padStart(2, '0')).join('')}`;
}

// ---- head ----------------------------------------------------------------------------------------------
const FACES = [
  'M29 38 C29 22 39 15 50 15 C61 15 71 22 71 38 C71 54 62 65 50 65 C38 65 29 54 29 38 Z', // oval
  'M28 40 C28 25 38 16 50 16 C62 16 72 25 72 40 C72 55 62 64 50 64 C38 64 28 55 28 40 Z', // round
  'M28 36 C28 21 39 15 50 15 C61 15 72 21 72 36 L71 50 C69 59 60 65 50 65 C40 65 31 59 29 50 Z', // square jaw
  'M29 36 C29 21 39 14 50 14 C61 14 71 21 71 36 C71 52 59 67 50 67 C41 67 29 52 29 36 Z', // heart
];

// ---- hair (back layer, then front layer) ---------------------------------------------------------------
const CROP = 'M28 38 C27 21 39 12 51 12 C63 12 73 21 72 38 C69 29 61 24 51 24 C41 24 32 29 28 38 Z';
const FRINGE = 'M27 40 C27 20 39 11 50 11 C62 11 73 20 73 40 C70 30 62 25 54 25 C47 30 36 31 27 40 Z';

function HairBack({ style, color }: { style: number; color: string }) {
  if (style === 4) return <Path d="M24 40 C21 15 40 9 50 9 C61 9 79 15 76 40 L79 78 C72 81 66 80 64 76 L64 48 L36 48 L36 76 C34 80 28 81 21 78 Z" fill={color} />;
  if (style === 8) return <Path d="M17 40 C14 18 31 5 50 5 C69 5 86 18 83 40 C85 52 78 60 72 56 L28 56 C22 60 15 52 17 40 Z" fill={color} />;
  if (style === 9) return <Path d="M24 44 C21 18 37 10 50 10 C63 10 79 18 76 44 L77 60 C69 64 31 64 23 60 Z" fill={color} />;
  return null;
}

function HairFront({ style, color }: { style: number; color: string }) {
  const shine = <Path d="M38 18 C43 15 49 14 55 15" stroke="#fff" strokeOpacity={0.28} strokeWidth={2.5} strokeLinecap="round" fill="none" />;
  switch (style) {
    case 1:
      return (
        <G>
          <Path d={CROP} fill={color} />
          {shine}
        </G>
      );
    case 2: // side part swoop
      return (
        <G>
          <Path d="M27 42 C24 19 40 10 53 11 C67 12 76 23 73 42 C71 32 66 26 60 24 C53 31 40 33 27 42 Z" fill={color} />
          {shine}
        </G>
      );
    case 3: // curls
      return (
        <G fill={color}>
          {[[30, 31, 8], [37, 21, 9], [50, 16, 10], [63, 21, 9], [70, 31, 8], [44, 24, 8], [57, 24, 8], [29, 40, 5], [71, 40, 5]].map(([x, y, r]) => (
            <Circle key={`${x}-${y}`} cx={x} cy={y} r={r} />
          ))}
        </G>
      );
    case 4: // long
    case 9: // bob
      return (
        <G>
          <Path d={FRINGE} fill={color} />
          {shine}
        </G>
      );
    case 5: // bun
      return (
        <G>
          <Circle cx={50} cy={9} r={9} fill={color} />
          <Path d={CROP} fill={color} />
          {shine}
        </G>
      );
    case 6: // spikes
      return <Path d="M28 38 L29 21 L35 26 L39 12 L45 22 L51 7 L56 21 L63 12 L65 25 L72 19 L72 38 C64 29 57 26 50 26 C43 26 35 29 28 38 Z" fill={color} />;
    case 7: // buzz
      return <Path d={CROP} fill={color} opacity={0.55} />;
    case 8: // afro (front fringe)
      return <Path d="M27 36 C29 24 39 19 50 19 C61 19 71 24 73 36 C66 30 58 28 50 28 C42 28 34 30 27 36 Z" fill={color} />;
    default:
      return null; // 0: bald
  }
}

// ---- face features --------------------------------------------------------------------------------------
function Eye({ x, style, iris, skin, wink }: { x: number; style: number; iris: string; skin: string; wink?: boolean }) {
  const closedArc = (up: boolean) => (
    <Path d={`M${x - 4} 41 Q${x} ${up ? 37 : 44} ${x + 4} 41`} stroke={INK} strokeWidth={1.8} strokeLinecap="round" fill="none" />
  );
  if (style === 1 || wink) return closedArc(true);
  const ry = style === 2 ? 4.2 : 3.4;
  return (
    <G>
      <Ellipse cx={x} cy={41} rx={4.4} ry={ry} fill="#fff" />
      <Circle cx={x + 0.3} cy={41.3} r={2.5} fill={iris} />
      <Circle cx={x + 0.3} cy={41.3} r={1.25} fill={INK} />
      <Circle cx={x + 1.2} cy={40.3} r={0.8} fill="#fff" />
      {/* upper lid line; "sleepy" pulls the lid half down */}
      {style === 4 ? (
        <Path d={`M${x - 4.6} 41 Q${x} 36 ${x + 4.6} 41 L${x + 4.6} 41 Q${x} 39.6 ${x - 4.6} 41 Z`} fill={shade(skin, -0.12)} stroke={INK} strokeWidth={1.2} />
      ) : (
        <Path d={`M${x - 4.6} 40.6 Q${x} ${41 - ry - 0.9} ${x + 4.6} 40.6`} stroke={INK} strokeWidth={1.3} strokeLinecap="round" fill="none" />
      )}
      {style === 5 && (
        <G stroke={INK} strokeWidth={1.1} strokeLinecap="round">
          <Path d={`M${x - 4.4} 39.4 L${x - 5.8} 38.3`} />
          <Path d={`M${x + 4.4} 39.4 L${x + 5.8} 38.3`} />
        </G>
      )}
    </G>
  );
}

function Brows({ style, color }: { style: number; color: string }) {
  const c = shade(color, -0.15);
  const p = (d: string, w = 2.2) => <Path d={d} stroke={c} strokeWidth={w} strokeLinecap="round" fill="none" />;
  switch (style) {
    case 1: // straight
      return <G>{p('M36.5 34.5 L45 34.5')}{p('M55 34.5 L63.5 34.5')}</G>;
    case 2: // thick
      return <G>{p('M36 35 Q41 32 45.5 34', 3.4)}{p('M54.5 34 Q59 32 64 35', 3.4)}</G>;
    case 3: // raised
      return <G>{p('M36.5 32.5 Q41 29 45.5 31.5')}{p('M54.5 31.5 Q59 29 63.5 32.5')}</G>;
    case 4: // determined
      return <G>{p('M36.5 33 L45.5 35.2')}{p('M54.5 35.2 L63.5 33')}</G>;
    default: // soft arch
      return <G>{p('M36.5 35 Q41 32.4 45.5 34.2')}{p('M54.5 34.2 Q59 32.4 63.5 35')}</G>;
  }
}

function Nose({ style, skin }: { style: number; skin: string }) {
  const c = shade(skin, -0.28);
  switch (style) {
    case 1: // button
      return <Ellipse cx={50} cy={48.5} rx={2.4} ry={1.6} fill={c} opacity={0.55} />;
    case 2: // long
      return <Path d="M50.5 41 Q48 48 50 50.5 Q51.5 51 52.5 50" stroke={c} strokeWidth={1.4} strokeLinecap="round" fill="none" />;
    case 3: // wide
      return (
        <G fill={c} opacity={0.7}>
          <Ellipse cx={47.6} cy={49.2} rx={1.3} ry={0.9} />
          <Ellipse cx={52.4} cy={49.2} rx={1.3} ry={0.9} />
        </G>
      );
    default: // small curve
      return <Path d="M49.5 45 Q47.8 49.2 50.4 49.8" stroke={c} strokeWidth={1.4} strokeLinecap="round" fill="none" />;
  }
}

function Mouth({ style }: { style: number }) {
  const line = { stroke: INK, strokeWidth: 1.8, strokeLinecap: 'round' as const, fill: 'none' };
  const open = 'M43 54 Q50 62 57 54 Z';
  switch (style) {
    case 1: // big grin with teeth
      return (
        <G>
          <Path d={open} fill="#5A1F1F" />
          <Path d="M44 54.6 L56 54.6 L55.2 56.2 L44.8 56.2 Z" fill="#fff" />
        </G>
      );
    case 2:
      return <Path d="M45.5 56 L54.5 56" {...line} />;
    case 3:
      return <Ellipse cx={50} cy={56.5} rx={2.6} ry={3.2} fill="#5A1F1F" />;
    case 4: // smirk
      return <Path d="M45 56.5 Q52 58.5 56 53.5" {...line} />;
    case 5: // grin + tongue
      return (
        <G>
          <Path d={open} fill="#5A1F1F" />
          <Path d="M44 54.6 L56 54.6 L55.2 56 L44.8 56 Z" fill="#fff" />
          <Ellipse cx={50} cy={59} rx={3.2} ry={2} fill="#FF8FA3" />
        </G>
      );
    default: // smile
      return <Path d="M44.5 54 Q50 59.5 55.5 54" {...line} />;
  }
}

function FacialHair({ style, color }: { style: number; color: string }) {
  switch (style) {
    case 1: // stubble
      return <Path d="M31 50 C34 60 42 65 50 65 C58 65 66 60 69 50 C66 56 59 60 50 60 C41 60 34 56 31 50 Z" fill={color} opacity={0.22} />;
    case 2: // mustache
      return <Path d="M43 52.6 Q46.5 50.3 50 52 Q53.5 50.3 57 52.6 Q53.5 54 50 53 Q46.5 54 43 52.6 Z" fill={color} />;
    case 3: // goatee
      return (
        <G fill={color}>
          <Path d="M43.5 52.5 Q47 50.6 50 52 Q53 50.6 56.5 52.5 Q53 53.8 50 53 Q47 53.8 43.5 52.5 Z" />
          <Path d="M46.5 60 Q50 59 53.5 60 L52.5 65 Q50 66.5 47.5 65 Z" />
        </G>
      );
    case 4: // full beard (the mouth stays visible on top)
      return <Path d="M30 46 C30 61 40 69 50 69 C60 69 70 61 70 46 C67 52 62 54 58 52 Q50 50 42 52 C38 54 33 52 30 46 Z" fill={color} />;
    default:
      return null;
  }
}

function Accessory({ style }: { style: number }) {
  switch (style) {
    case 1: // round glasses
      return (
        <G stroke={INK} strokeWidth={1.6} fill="none">
          <Circle cx={41} cy={41} r={6} />
          <Circle cx={59} cy={41} r={6} />
          <Path d="M47 41 Q50 39.5 53 41" />
          <Path d="M35 40 L29.5 39" />
          <Path d="M65 40 L70.5 39" />
        </G>
      );
    case 2: // shades
      return (
        <G>
          <Path d="M33.5 37 L48 37 Q48 46 41 46 Q33.5 46 33.5 37 Z" fill="#14121F" />
          <Path d="M52 37 L66.5 37 Q66.5 46 59 46 Q52 46 52 37 Z" fill="#14121F" />
          <Path d="M48 38 L52 38" stroke="#14121F" strokeWidth={1.6} />
          <Path d="M36 39 L41 39" stroke="#fff" strokeOpacity={0.35} strokeWidth={1.2} strokeLinecap="round" />
        </G>
      );
    case 3: // freckles
      return (
        <G fill="#8D5524" opacity={0.45}>
          {[[36, 48], [39, 50], [42, 48], [58, 48], [61, 50], [64, 48]].map(([x, y]) => (
            <Circle key={`${x}-${y}`} cx={x} cy={y} r={0.9} />
          ))}
        </G>
      );
    case 4: // earrings
      return (
        <G fill="#FFB020">
          <Circle cx={28.5} cy={50} r={2.2} />
          <Circle cx={71.5} cy={50} r={2.2} />
        </G>
      );
    case 5: // headphones
      return (
        <G>
          <Path d="M25 42 C25 8 75 8 75 42" stroke="#14121F" strokeWidth={4.5} fill="none" />
          <Rect x={20} y={36} width={9} height={15} rx={4} fill="#14121F" />
          <Rect x={71} y={36} width={9} height={15} rx={4} fill="#14121F" />
        </G>
      );
    default:
      return null;
  }
}

// ---- clothes ---------------------------------------------------------------------------------------------
const BODY = 'M12 102 C14 80 31 71 50 71 C69 71 86 80 88 102 Z';

function Top({ style, color, skin }: { style: number; color: string; skin: string }) {
  const dark = shade(color, -0.22);
  const light = shade(color, 0.35);
  switch (style) {
    case 1: // hoodie: hood rim + drawstrings
      return (
        <G>
          <Path d={BODY} fill={color} />
          <Path d="M33 74 C38 83 62 83 67 74 C62 78 38 78 33 74 Z" fill={dark} />
          <Path d="M45 80 L44 92 M55 80 L56 92" stroke={light} strokeWidth={1.6} strokeLinecap="round" />
        </G>
      );
    case 2: // collared shirt
      return (
        <G>
          <Path d={BODY} fill={color} />
          <Path d="M41 72 L50 82 L46 86 L37 75 Z M59 72 L50 82 L54 86 L63 75 Z" fill={light} />
          <Path d="M50 82 L50 102" stroke={dark} strokeWidth={1.2} />
        </G>
      );
    case 3: // open jacket over a white tee
      return (
        <G>
          <Path d={BODY} fill={color} />
          <Path d="M41 72 C44 76 56 76 59 72 L57 102 L43 102 Z" fill="#F3F0FF" />
          <Path d="M41 72 L47 102 M59 72 L53 102" stroke={dark} strokeWidth={2} />
        </G>
      );
    case 4: // V-neck
      return (
        <G>
          <Path d={BODY} fill={color} />
          <Path d="M42 72 L50 84 L58 72 Z" fill={skin} />
          <Path d="M42 72 L50 84 L58 72" stroke={dark} strokeWidth={1.6} fill="none" />
        </G>
      );
    default: // crew-neck tee
      return (
        <G>
          <Path d={BODY} fill={color} />
          <Path d="M42 72 Q50 77 58 72" stroke={dark} strokeWidth={2} fill="none" />
        </G>
      );
  }
}

/** The avatar bust, drawn into a 100×100 box. Missing or out-of-range indexes fall back to option 0. */
export function Character({ look, size, focus }: { look: AvatarLook; size: number; focus?: 'face' }) {
  const pick = (arr: string[], i: number | undefined) => arr[i ?? 0] ?? arr[0]!;
  const skin = pick(SKIN, look.skin);
  const hair = pick(HAIR_COLOR, look.hairColor);
  const iris = pick(EYE_COLOR, look.eyeColor);
  const face = FACES[look.face] ?? FACES[0]!;
  return (
    // focus="face" zooms in, for picking small features (brows, nose, mouth).
    <Svg width={size} height={size} viewBox={focus === 'face' ? '24 22 52 52' : '0 0 100 100'}>
      <Defs>
        <ClipPath id="head">
          <Path d={face} />
        </ClipPath>
      </Defs>
      <HairBack style={look.hair} color={hair} />
      <Top style={look.top ?? 0} color={pick(OUTFIT, look.outfit)} skin={skin} />
      {/* neck with a soft shadow under the chin */}
      <Rect x={43} y={56} width={14} height={18} rx={6} fill={skin} />
      <Ellipse cx={50} cy={63} rx={8} ry={4} fill="#000" opacity={0.14} />
      {/* ears */}
      <Circle cx={29.5} cy={42} r={4.6} fill={skin} />
      <Circle cx={70.5} cy={42} r={4.6} fill={skin} />
      <Path d="M28 40.5 Q30 42 28.5 44" stroke={shade(skin, -0.25)} strokeWidth={1} fill="none" />
      <Path d="M72 40.5 Q70 42 71.5 44" stroke={shade(skin, -0.25)} strokeWidth={1} fill="none" />
      <Path d={face} fill={skin} />
      {/* gentle shading on the lower face, kept inside the head shape */}
      <G clipPath="url(#head)">
        <Ellipse cx={50} cy={70} rx={26} ry={10} fill="#000" opacity={0.07} />
      </G>
      <Circle cx={37} cy={50} r={3.6} fill="#FF6B8A" opacity={0.18} />
      <Circle cx={63} cy={50} r={3.6} fill="#FF6B8A" opacity={0.18} />
      <FacialHair style={look.facialHair ?? 0} color={hair} />
      <HairFront style={look.hair} color={hair} />
      <Brows style={look.brows ?? 0} color={hair} />
      <Eye x={41} style={look.eyes} iris={iris} skin={skin} />
      <Eye x={59} style={look.eyes} iris={iris} skin={skin} wink={look.eyes === 3} />
      <Nose style={look.nose ?? 0} skin={skin} />
      <Mouth style={look.mouth} />
      <Accessory style={look.accessory} />
    </Svg>
  );
}
