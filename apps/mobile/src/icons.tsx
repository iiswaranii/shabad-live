// Line icons drawn in the style of SF Symbols (24-unit grid, round caps and joins).
import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

export type IconName =
  | 'mic' | 'mic.fill' | 'stop' | 'sliders' | 'chevron.left' | 'chevron.right' | 'chevron.down' | 'check'
  | 'globe' | 'textsize' | 'book' | 'waveform' | 'play' | 'info' | 'keyboard' | 'music' | 'arrow.down'
  | 'xmark' | 'warning' | 'cloud' | 'lock' | 'list' | 'equal' | 'approx' | 'question' | 'pause' | 'sparkle';

export function Icon({ name, size = 22, color, weight = 2 }: { name: IconName; size?: number; color: string; weight?: number }) {
  const p = { stroke: color, strokeWidth: weight, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  const f = { fill: color };
  let body: React.ReactNode;
  switch (name) {
    case 'mic': body = <><Rect x={9} y={3} width={6} height={11.5} rx={3} {...p} /><Path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6" {...p} /></>; break;
    case 'mic.fill': body = <><Rect x={8.5} y={2.5} width={7} height={12.5} rx={3.5} {...f} /><Path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6" {...p} /></>; break;
    case 'stop': body = <Rect x={6.5} y={6.5} width={11} height={11} rx={2.5} {...f} />; break;
    case 'pause': body = <><Rect x={7} y={5.5} width={3.5} height={13} rx={1.2} {...f} /><Rect x={13.5} y={5.5} width={3.5} height={13} rx={1.2} {...f} /></>; break;
    case 'play': body = <Path d="M8 5.5v13l10.5-6.5z" {...f} />; break;
    case 'sliders': body = <><Path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1" {...p} /><Circle cx={15} cy={7} r={2} {...p} /><Circle cx={9} cy={12} r={2} {...p} /><Circle cx={17} cy={17} r={2} {...p} /></>; break;
    case 'chevron.left': body = <Path d="M15 4.5 7.5 12l7.5 7.5" {...p} />; break;
    case 'chevron.right': body = <Path d="m9 4.5 7.5 7.5L9 19.5" {...p} />; break;
    case 'chevron.down': body = <Path d="m5 9 7 7 7-7" {...p} />; break;
    case 'check': body = <Path d="m5 12.5 4.5 4.5L19 7.5" {...p} />; break;
    case 'globe': body = <><Circle cx={12} cy={12} r={9} {...p} /><Path d="M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3z" {...p} /></>; break;
    case 'textsize': body = <Path d="M2.5 19 8 5l5.5 14M4.6 14h6.8M14 19l3.5-8.5L21 19M15.2 16.2h4.6" {...p} />; break;
    case 'book': body = <Path d="M12 6.5C10 5 7.5 4.5 3.5 4.5v14c4 0 6.5.5 8.5 2 2-1.5 4.5-2 8.5-2v-14c-4 0-6.5.5-8.5 2zM12 6.5v14" {...p} />; break;
    case 'waveform': body = <Path d="M3 12h0M6.5 9v6M10 5v14M13.5 8v8M17 10.5v3M20.5 12h0" {...p} />; break;
    case 'info': body = <><Circle cx={12} cy={12} r={9} {...p} /><Path d="M12 11v5.5" {...p} /><Circle cx={12} cy={7.6} r={1.2} {...f} /></>; break;
    case 'question': body = <><Circle cx={12} cy={12} r={9} {...p} /><Path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1.9-1.1 1.8" {...p} /><Circle cx={12} cy={16.8} r={1.1} {...f} /></>; break;
    case 'keyboard': body = <><Rect x={2.5} y={6} width={19} height={12} rx={2.5} {...p} /><Path d="M6.5 10h0M10 10h0M14 10h0M17.5 10h0M8 14.5h8" {...p} /></>; break;
    case 'music': body = <><Path d="M9 17.5V5.5l11-2v12" {...p} /><Circle cx={6.5} cy={17.5} r={2.5} {...p} /><Circle cx={17.5} cy={15.5} r={2.5} {...p} /></>; break;
    case 'arrow.down': body = <Path d="M12 4.5v15M6 13.5l6 6 6-6" {...p} />; break;
    case 'xmark': body = <Path d="M6 6l12 12M18 6 6 18" {...p} />; break;
    case 'warning': body = <><Path d="M10.3 4.2 2.8 17.5A2 2 0 0 0 4.5 20.5h15a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z" {...p} /><Path d="M12 9.5V14" {...p} /><Circle cx={12} cy={17} r={1.1} {...f} /></>; break;
    case 'cloud': body = <Path d="M7 18.5h10.5a4 4 0 0 0 .6-8 5.5 5.5 0 0 0-10.6-1.2A4.6 4.6 0 0 0 7 18.5z" {...p} />; break;
    case 'lock': body = <><Rect x={5} y={10.5} width={14} height={10} rx={2.5} {...p} /><Path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" {...p} /></>; break;
    case 'list': body = <Path d="M8.5 6.5H20M8.5 12H20M8.5 17.5H20M4.5 6.5h0M4.5 12h0M4.5 17.5h0" {...p} />; break;
    case 'equal': body = <Path d="M6 9.5h12M6 14.5h12" {...p} />; break;
    case 'approx': body = <Path d="M5 9.5c2.3-2 4.7-2 7 0s4.7 2 7 0M5 15c2.3-2 4.7-2 7 0s4.7 2 7 0" {...p} />; break;
    case 'sparkle': body = <Path d="M12 3c.6 4.6 2.4 6.4 7 7-4.6.6-6.4 2.4-7 7-.6-4.6-2.4-6.4-7-7 4.6-.6 6.4-2.4 7-7z" {...p} />; break;
  }
  return <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>{body}</Svg>;
}
