// ═══════════════════════════════════════════════════════════
// BEGGAR NETWORK — Pixel Sprite Library
// All UI icons in the Beggar King pixel-art style
// ═══════════════════════════════════════════════════════════

// Extended palette (same family as Mascot, plus icon-specific tones)
window.SPRITE_PALETTE = {
  // base
  'K': '#0F0E0B',  // outline / dark
  'B': '#2B231C',  // dark body
  'b': '#44382B',  // mid body
  'S': '#DAB78A',  // skin / bone
  's': '#B0916A',  // skin shadow
  'W': '#FFFFFF',  // white
  'w': '#E8DCC0',  // off-white

  // crown / gold
  'C': '#E8A02C',  // gold
  'c': '#B26A12',  // gold shadow
  'Y': '#FFD06B',  // gold light

  // brand
  'O': '#FF6B35',  // orange
  'o': '#B0461C',  // orange shadow
  'P': '#FFB58A',  // orange light

  // grade tier colors
  'G': '#22C55E',  // green (Legend)
  'g': '#15803D',  // green dark
  'L': '#3B82F6',  // blue (Solid)
  'l': '#1E40AF',  // blue dark
  'Y2': '#EAB308', // yellow (Fair) — note: 1-char only, use 'M' instead
  'M': '#EAB308',  // yellow (Fair)
  'm': '#A16207',  // yellow dark
  'R': '#EF4444',  // red (Borderline / cap / warning)
  'r': '#991B1B',  // red dark

  // wood / earth
  'T': '#5C4530',  // wood
  't': '#3A2D1F',  // wood dark
  'u': '#7C6440',  // wood light

  // misc
  'X': '#9CA3AF',  // gray
  'x': '#4B5563',  // dark gray
};

// ── Sprite grids ─────────────────────────────────────────
// Each sprite is a string grid. '.' = empty, other chars = palette keys.
window.SPRITES = {
  // ─── The Table (throne) — 16w × 14h ──────────
  throne: `
................
.....C...C......
....CCC.CCC.....
.....C...C......
.....CCCCC......
....tTTTTTt.....
...tTTTTTTTt....
...tTTOOOTTt....
...tTTOOOTTt....
...tTTTTTTTt....
...tTTTTTTTt....
..tTTTTTTTTTt...
..T.........T...
..T.........T...
`,

  // ─── The Court (gavel) — 14w × 14h ──────────
  gavel: `
..............
.....TTTT.....
....TTTTTu....
...TTTTTTu....
...TtTTTtu....
...TTTTTTu....
....TTTu......
.....Tu.......
....Tu........
...Tu.........
..Tu..........
.Tu...........
TT............
ut............
`,

  // ─── HOT (flame) — 10×12 ──────────
  flame: `
....OO....
...OOOO...
..OOoooO..
..OoCYoO..
..OoYYoO..
..OoYCoO..
..OOoCoO..
...OooO...
...Oooo...
....OO....
`,

  // ─── Disputed (warning triangle) — 12×11 ──────────
  warning: `
.....RR.....
.....rr.....
....RYYR....
....RYYR....
...RYKYR....
...RYKYR....
..RYYKYYR...
..RYYKYYR...
.RYYYKYYYR..
.RYYYKYYYR..
RRRRRRRRRRR.
`,

  // ─── Stale (hourglass) — 10×12 ──────────
  hourglass: `
.YYYYYYYY.
.YsssssY..
..YsssY...
...YsY....
....Y.....
....s.....
...sss....
..sssss...
.YsssssY..
.YYYYYYY..
`,

  // ─── Globe (All filter) — 12×12 ──────────
  globe: `
...LLLLLL...
..LlLLLLLL..
.LLgGGGGgLL.
.LGGGGGGGGL.
LLGgGGGGgGLL
LGGGgGGgGGGL
LGGGgGGgGGGL
LLGGgGGgGGLL
.LGgGGGGgGL.
.LLgGGGGgLL.
..LLLLLLLL..
...LLLLLL...
`,

  // ─── Plate (Spots) — 12×11 ──────────
  plate: `
............
...wwwwww...
..wWWWWWWw..
.wWWooooWWw.
.wWoOOOOoWw.
.wWoOOOOoWw.
.wWooooooWw.
..wWWWWWWw..
...wwwwww...
....KKKK....
............
`,

  // ─── Store (Chains) — 12×12 ──────────
  store: `
............
.OOOOOOOOOO.
.OPOPOPOPOP.
.OOOOOOOOOO.
.SSSSSSSSSS.
.SOSSOSSOSS.
.SOSSOSSOSS.
.SSSSSSSSSS.
.SOOSSSSOOS.
.SOOSSSSOOS.
.SOOSSSSOOS.
KKKKKKKKKKKK
`,

  // ─── Cart (Marts) — 14×12 ──────────
  cart: `
..............
.YYY..........
...YY.........
....YYYYYYYY..
....YO.O.O.Y..
....YO.O.O.Y..
....YYYYYYYY..
.....Y.....Y..
....KKK...KKK.
....KKK...KKK.
.....K.....K..
..............
`,

  // ─── Coin ($) — 10×10 ──────────
  coin: `
..CCCCCC..
.CYCCCCcC.
CYCKCCKCcC
CCCCKCCCcC
CCCCKKCCcC
CCCKCCCKcC
CCCKCCCKcC
CCCKKKKKcC
.CCCKCCCcC
..cccccc..
`,

  // ─── Check (legit) — 10×10 ──────────
  check: `
..........
.........G
........GG
.......GGg
g.....GGg.
gG...GGg..
.GG.GGg...
..GGGg....
...Gg.....
..........
`,

  // ─── X (cap) — 10×10 ──────────
  ex: `
..........
.R......R.
.Rr....rR.
..Rr..rR..
...RrrR...
...rRRr...
..rR..Rr..
.rR....Rr.
.R......R.
..........
`,

  // ─── Plus (submit) — 10×10 ──────────
  plus: `
..........
....OO....
....OO....
....OO....
.OOOOOOOO.
.OOOOOOOO.
....OO....
....OO....
....OO....
..........
`,

  // ─── Magnifier (search) — 11×11 ──────────
  magnifier: `
...........
.....bbb...
...bbWWWbb.
..bWWWWWWb.
..bWWKWWWb.
..bWWWWWWb.
...bWWWb...
....bbb..bb
.........bb
..........b
...........
`,

  // ─── Star (save) — 10×10 ──────────
  star: `
....YY....
....CC....
...CCCC...
CCCCCCCCCC
.CCCCCCCC.
..CCCCCC..
..CC..CC..
..C....C..
..........
..........
`,

  // ─── Flag (report) — 10×11 ──────────
  flag: `
.K........
.KOOOOO...
.KOOOOOOO.
.KOOOOOOOO
.KOOOOOOO.
.KOOOOO...
.K........
.K........
.K........
.K........
.K........
`,

  // ─── Antenna (feed) — 12×12 ──────────
  antenna: `
............
..C......C..
...C.C.C.C..
....CCC.....
.....C......
..LLLLLLLLL.
..L.......L.
..L.LLLLL.L.
..L.L...L.L.
..L.LLLLL.L.
..L.......L.
..LLLLLLLLL.
`,

  // ─── Pencil (edit) — 10×10 ──────────
  pencil: `
.......YK.
......YYK.
.....YYK..
....YYK...
...YYK....
..YYK.....
.YYK......
.WK.......
.K........
..........
`,

  // ─── Share/Arrow (NE arrow) — 10×10 ──────────
  arrow: `
..........
..CCCCCC..
......CC..
.....CC...
....CC....
...CC.....
..CC......
..C.......
..........
..........
`,

  // ─── Moon (theme toggle) — 10×10 ──────────
  moon: `
..........
....YYYY..
...YYYYYY.
..YYYY.Y..
..YYY.....
..YYY.....
..YYYY....
...YYYYY..
....YYY...
..........
`,

  // ─── Coin stack (Coins/money) — 10×10 ──────────
  coins: `
..........
..CCCCCC..
.CYCCCCcC.
..cccccc..
..CCCCCC..
.CYCCCCcC.
..cccccc..
..CCCCCC..
.CYCCCCcC.
..cccccc..
`,

  // ─── Crown (Beggar King) — 12×10 ──────────
  crown: `
............
..C..C..C...
.CC.CCC.CC..
.CCCCCCCCC..
.CCCYCCYCC..
.CCCYCCYCC..
.CcccccccC..
.ccccccccc..
.tttttttttt.
............
`,

  // ─── Eye (verified) — 10×8 ──────────
  eye: `
..........
.WWWWWWWW.
WWKKWWKKWW
WKLLKKLLKW
WKLLKKLLKW
WWKKWWKKWW
.WWWWWWWW.
..........
`,
};

// ── Renderer ─────────────────────────────────────────────
window.renderSprite = function(name, scale = 2, opts = {}) {
  const grid = window.SPRITES[name];
  if (!grid) return '';
  const rows = grid.trim().split('\n');
  const h = rows.length;
  const w = Math.max(...rows.map(r => r.length));
  const W = w * scale, H = h * scale;
  let rects = '';
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      const ch = rows[y][x];
      if (ch === '.' || ch === ' ') continue;
      const color = window.SPRITE_PALETTE[ch] || (opts.tint || '#FF00FF');
      rects += `<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${color}"/>`;
    }
  }
  const cls = opts.className ? ` class="${opts.className}"` : '';
  return `<svg${cls} width="${W}" height="${H}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg" style="display:inline-block;vertical-align:middle">${rects}</svg>`;
};
