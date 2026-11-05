// Curated monochrome SVGs. Only these paths are injected, never SVG from config.
const paths={
 gramophone:['Граммофон','<path d="M4 17h15v4H4zM7 17v-2h9v2M13 15V9m0 0 7-5v8l-7-3Zm0 0H9V5h3M7 19h9"/><path d="M20 4c-2 1-2 7 0 8"/>'],
 welcome:['Встреча гостей','<path d="M4 21V5h16v16M9 21V5m6 9h.01M2 21h20"/>'],
 rings:['Кольца','<circle cx="8.5" cy="14" r="6"/><circle cx="15.5" cy="14" r="6"/><path d="m12 3 2 2-2 2-2-2z"/>'],
 dinner:['Ужин','<path d="M5 3v7m3-7v7M5 7h3m-1.5 3v11M18 3v18m0-18c-5 3-5 9 0 9"/>'],
 music:['Музыка','<path d="M9 18V5l11-2v13M9 9l11-2"/><ellipse cx="6" cy="18" rx="3" ry="2.5"/><ellipse cx="17" cy="16" rx="3" ry="2.5"/>'],
 camera:['Фотосессия','<path d="m8 5 1-2h6l1 2h5v15H3V5z"/><circle cx="12" cy="12" r="4"/>'],
 cake:['Торт','<path d="M4 21V10h16v11M2 21h20M4 14c3 4 5-3 8 0s5-3 8 0M8 10V7m8 3V7M8 3v1m8-1v1"/>'],
 car:['Трансфер','<path d="m4 10 2-6h12l2 6M3 10h18v8H3zM5 18v3m14-3v3M6 14h2m8 0h2"/>'],
 moon:['Завершение вечера','<path d="M20 15A9 9 0 0 1 9 3a9 9 0 1 0 11 12z"/>'],
 flower:['Цветы','<path d="M12 22v-9m0 7c-5 0-7-3-7-6 4 0 7 2 7 6m0-3c5 0 7-3 7-6-4 0-7 2-7 6"/><circle cx="12" cy="7" r="4"/>'],
 ceremony:['Церемония','<path d="M4 21V10a8 8 0 0 1 16 0v11M8 21V10a4 4 0 0 1 8 0v11M2 21h20"/>'],
 arrowDown:['Стрелка вниз','<path d="M12 3v18m-7-7 7 7 7-7"/>'],
 arrowUp:['Стрелка вверх','<path d="M12 21V3m-7 7 7-7 7 7"/>'],
 arrowRight:['Перейти','<path d="M4 12h16m-7-7 7 7-7 7"/>'],
 none:['Без иконки','']
};
export function iconSvg(key){const path=paths[key]?.[1];return path?`<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${path}</svg>`:''}
export const ICON_CATALOG=Object.freeze(Object.entries(paths).filter(([key])=>!key.startsWith('arrow')).map(([key,[label]])=>Object.freeze({key,label,svg:iconSvg(key)})));
