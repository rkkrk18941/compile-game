// Original vector crests: readable on a bracket, crisp at any display size.
const designs = [
 ['wolf','蒼狼','#65d5ff','shield','M23 20 32 28 50 25 68 28 77 20 72 47 64 68 50 81 36 68 28 47Z|M33 41 43 44M57 44 67 41M40 43V46M60 43V46M43 62 50 67 57 62 50 76Z'],
 ['fox','紅狐','#ff9275','hex','M24 20 45 36 55 36 76 20 70 55 50 80 30 55Z|M30 41 45 51 37 57M70 41 55 51 63 57M45 64 50 69 55 64M50 41V56'],
 ['dragon','翠龍','#63e5ad','shield','M66 22 53 29 43 25 45 37 31 42 23 57 36 54 45 61 47 72 61 80 72 68 61 66 56 57 66 50 76 50 72 40 60 41 56 36Z|M59 45 64 45M32 46 34 53M53 59 66 57M52 70 60 73'],
 ['phoenix','不死鳥','#ffb15e','circle','M50 25 57 38 76 26 69 46 83 40 68 59 57 63 50 80 43 63 32 59 17 40 31 46 24 26 43 38Z|M50 36V66M34 43 43 50M66 43 57 50M40 62 34 72M60 62 66 72'],
 ['owl','月梟','#bfabff','hex','M25 26 40 34 50 30 60 34 75 26 72 58 61 72 50 81 39 72 28 58Z|M32 43H46V55H32ZM54 43H68V55H54ZM47 59 50 64 53 59M39 66 50 73 61 66'],
 ['lion','獅子王','#f4d27f','shield','M50 19 62 25 74 25 76 40 82 50 73 65 64 73 50 83 36 73 27 65 18 50 24 40 26 25 38 25Z|M36 37 43 33H57L64 37 62 58 50 72 38 58ZM35 45 44 47M65 45 56 47M45 57 50 62 55 57M44 65H56'],
 ['shark','深海鮫','#6eb3ff','circle','M19 59 36 41 48 38 60 22 61 39 77 46 66 51 77 61 60 58 48 65 31 64 23 74 25 61Z|M36 52 61 52 55 58 48 53 43 59M57 44H61M32 53 29 58'],
 ['stag','白鹿','#c7dfca','shield','M33 18 32 29 39 37 42 46 50 41 58 46 61 37 68 29 67 18 72 26 81 22 75 32 82 39 68 37 63 47 60 67 50 81 40 67 37 47 32 37 18 39 25 32 19 22 28 26Z|M42 53 46 56M58 53 54 56M45 68 50 72 55 68'],
 ['raven','黒鴉','#a9b9f8','hex','M24 32 45 44 53 31 65 26 74 32 64 37 66 48 59 60 75 73 53 67 42 77 42 63 22 60 35 53 18 43 36 48Z|M55 36H59M38 54 49 58M47 46 42 56'],
 ['serpent','蛇環','#b5e87a','circle','M64 28C36 16 20 36 24 55S58 83 74 63 73 30 57 37C45 43 46 56 58 59L67 57 59 50 53 51C49 43 62 40 67 48S65 68 51 68 30 56 33 43 48 25 60 33L57 39 76 34 70 19Z|M66 30H68'],
 ['crown','王冠','#fbd883','shield','M24 36 38 46 50 25 62 46 76 36 69 65H31Z|M33 73H67M34 57H66M50 44V54M24 29V30M76 29V30M50 18V19'],
 ['knight','銀騎士','#d3dce9','hex','M49 20 70 31 70 56 59 73 36 77 27 64 31 45 41 37 39 24Z|M43 37 61 39 61 55 49 64 35 64M42 45H61M49 46V57M40 70 55 70'],
 ['swords','双剣','#ff889b','shield','M28 23 37 27 68 62 62 68 27 37ZM72 23 63 27 32 62 38 68 73 37Z|M24 57 43 76M57 76 76 57M30 70 24 76M70 70 76 76'],
 ['rose','薔薇','#f48dce','circle','M50 25 62 29 67 38 76 44 72 57 62 63 50 68 38 63 28 57 24 44 33 38 38 29Z|M38 37 52 34 63 44 58 58 43 59 36 49 44 41 55 43 56 51 48 54 44 48M50 69V80M50 76 36 69M50 73 65 66'],
 ['thunder','雷霆','#f4eb73','hex','M53 20 29 55H47L41 81 73 42H54L64 20Z|M25 30 20 40M75 68 80 58'],
 ['moon','三日月','#c5bbff','circle','M58 21C27 17 15 54 36 73 52 87 76 74 80 60 57 70 35 45 58 21Z|M68 27V41M61 34H75M75 46V50M73 48H77'],
 ['sun','太陽','#ffc783','circle','M50 31 63 36 69 50 63 64 50 70 37 64 31 50 37 36Z|M50 17V24M50 77V84M17 50H24M77 50H84M27 27 32 32M68 68 73 73M27 73 32 68M68 32 73 27M45 44 50 39 55 44 57 56 50 61 43 56Z'],
 ['compass','羅針盤','#83e1db','hex','M50 18 58 41 81 50 58 58 50 82 42 58 19 50 42 41Z|M50 31V69M31 50H69M50 41 59 50 50 59 41 50ZM27 27 33 33M67 67 73 73M27 73 33 67M67 33 73 27'],
 ['anchor','海錨','#8ccffc','shield','M44 25A6 6 0 1 0 56 25 6 6 0 1 0 44 25ZM50 32V75M35 44H65M23 53 23 64 35 61M77 53 77 64 65 61M24 62Q31 76 50 79 69 76 76 62|M50 68 44 73M50 68 56 73'],
 ['lotus','蓮華','#ebaae6','hex','M50 23Q65 40 59 62 50 68 41 62 35 40 50 23ZM41 61Q20 54 24 33 45 35 50 64M59 61Q80 54 76 33 55 35 50 64|M22 55Q23 74 50 77 77 74 78 55M34 79H66']
];
export const PLAYER_LOGOS=designs.map(([id,name,color,frame,art])=>({id,name,color,frame,art}));
export function validLogo(id){return PLAYER_LOGOS.some(l=>l.id===id)?id:'wolf';}
export function logoHTML(id,cls=''){
 const l=PLAYER_LOGOS.find(l=>l.id===validLogo(id));
 const border=l.frame==='shield'?'M50 5 89 20 85 59Q81 80 50 95 19 80 15 59L11 20Z':l.frame==='hex'?'M50 5 89 27V73L50 95 11 73V27Z':'M50 5A45 45 0 1 1 49.99 5Z';
 const [fill,line]=l.art.split('|');
 const accents={sun:'M50 17V24M50 77V84M17 50H24M77 50H84M27 27 32 32M68 68 73 73M27 73 32 68M68 32 73 27',moon:'M68 27V41M61 34H75M75 46V50M73 48H77',rose:'M50 69V80M50 76 36 69M50 73 65 66',thunder:'M25 30 20 40M75 68 80 58'};
 const accent=accents[l.id]?'<path d="'+accents[l.id]+'" stroke="'+l.color+'" fill="none" stroke-width="2.5" stroke-linecap="round"/>':'';
 return '<svg class="player-logo '+cls+'" viewBox="0 0 100 100" role="img" aria-label="'+l.name+'" style="--logo-color:'+l.color+'"><path d="'+border+'" fill="#101925" stroke="'+l.color+'" stroke-width="2.5"/><path d="'+border+'" fill="none" stroke="'+l.color+'" stroke-opacity=".2" stroke-width="8" transform="translate(8 8) scale(.84)"/><path d="'+fill+'" fill="'+l.color+'" stroke="'+l.color+'" stroke-width="2" stroke-linejoin="round"/><path d="'+(line||'')+'" fill="none" stroke="#101925" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'+accent+'<path d="M21 80 28 84M72 84 79 80" fill="none" stroke="'+l.color+'" stroke-width="2"/></svg>';
}
