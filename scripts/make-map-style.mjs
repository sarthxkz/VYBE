// Builds Vybe's map styles from OpenFreeMap "liberty": a bright, playful light theme and a grape dark theme,
// with clutter (shop icons, shields, one-way arrows) removed. Output is served by Caddy from the VM, so the map's
// look can change without an app update. Run from the repo root: node scripts/make-map-style.mjs
import { mkdirSync, writeFileSync } from 'node:fs';

const SRC = 'https://tiles.openfreemap.org/styles/liberty';
const OUT = 'deploy/web/app/map';

const THEMES = {
  light: {
    background: '#F6F1E9', water: '#7FD3FF', park: '#B8F0A0', wood: '#A5E68A', residential: '#F2EDF8', sand: '#FBEBC4',
    building: '#ECE4F7', buildingOutline: '#DCD1EE', motorway: '#FFD66B', major: '#FFFFFF', minor: '#FFFFFF', casing: '#E2DBEE',
    rail: '#D6CEE6', label: '#3A3156', labelHalo: '#FFFFFF', waterLabel: '#2A7FB8',
  },
  dark: {
    background: '#17142A', water: '#24427E', park: '#1E4636', wood: '#1B3F31', residential: '#1E1A35', sand: '#2E2A3E',
    building: '#2A2450', buildingOutline: '#352E62', motorway: '#6C4CF5', major: '#3E3670', minor: '#2F2958', casing: '#120F22',
    rail: '#3A335E', label: '#E8E3FF', labelHalo: '#17142A', waterLabel: '#8FC2FF',
  },
};

const HIDE = /^(natural_earth|poi_|road_one_way|highway-shield|road_shield|.*hatching|aeroway_)/;

const style = await (await fetch(SRC)).json();
mkdirSync(OUT, { recursive: true });

for (const [name, t] of Object.entries(THEMES)) {
  const s = structuredClone(style);
  s.name = `Vybe ${name}`;
  s.layers = s.layers.filter((l) => !HIDE.test(l.id));
  for (const l of s.layers) {
    const id = l.id;
    const p = (l.paint ??= {});
    if (l.type === 'background') p['background-color'] = t.background;
    else if (l.type === 'fill') {
      if (id === 'water') p['fill-color'] = t.water;
      else if (/park|grass|pitch/.test(id)) p['fill-color'] = t.park;
      else if (/wood|wetland/.test(id)) p['fill-color'] = t.wood;
      else if (/sand|ice/.test(id)) p['fill-color'] = t.sand;
      else if (id === 'building') Object.assign(p, { 'fill-color': t.building, 'fill-outline-color': t.buildingOutline });
      else if (/residential|cemetery|hospital|school|track|road_area/.test(id)) p['fill-color'] = t.residential;
    } else if (l.type === 'fill-extrusion') p['fill-extrusion-color'] = t.building;
    else if (l.type === 'line') {
      if (/waterway/.test(id)) p['line-color'] = t.water;
      else if (/casing/.test(id)) p['line-color'] = t.casing;
      else if (/motorway/.test(id)) p['line-color'] = t.motorway;
      else if (/trunk|primary|secondary|tertiary/.test(id)) p['line-color'] = t.major;
      else if (/minor|service|link|path|street/.test(id)) p['line-color'] = t.minor;
      else if (/rail/.test(id)) p['line-color'] = t.rail;
      else if (/park_outline/.test(id)) p['line-color'] = t.park;
      else if (/boundary/.test(id)) p['line-color'] = t.rail;
    } else if (l.type === 'symbol' && l.layout?.['text-field']) {
      Object.assign(p, { 'text-color': /water/.test(id) ? t.waterLabel : t.label, 'text-halo-color': t.labelHalo, 'text-halo-width': 1.4 });
    }
  }
  writeFileSync(`${OUT}/vybe-${name}.json`, JSON.stringify(s));
  console.log(`${OUT}/vybe-${name}.json: ${s.layers.length} layers`);
}
