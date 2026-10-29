// agent-office
//
// Watch Claude and its helper agents work in a small office.
//   Desktop app: an illustrated, animated office in a side panel.
//   Terminal: a live list of agents.
// Each helper walks in through the door, sits at its own desk and works there.
// An icon above it shows what it's doing (editing, running a command, researching,
// reading files, using an app, planning, thinking), and its screen's light changes
// color to match. A raised hand means it's waiting for your approval. When it
// finishes, it gets a green check and walks out the door.
//
//   /office   open the office
//
// Read-only: it watches events and draws. It makes no model calls and changes nothing.

// Draws the office as one SVG string. Pure functions: no mods API here.
//
// The scene is rebuilt only when something in it changes. Every animation uses a
// negative delay computed from absolute time, so a rebuilt picture continues each
// motion where the previous picture left it instead of starting over.

const VB_W = 440
const VB_H = 342

const U = 19 // one floor unit in pixels
const C30 = 0.866
const OX = 228.2
const OY = 92
const WALL_H = 4.2
const ROOM_W = 12
const ROOM_D = 13

const EASE_MOVE = 'cubic-bezier(.455,.03,.515,.955)'

const PAL = {
  bg: '#121a23',
  wallR: '#36586a',
  wallRTop: '#2b4757',
  wallL: '#2c4859',
  wallLTop: '#223a48',
  base: '#1d2f3b',
  floorA: '#74503d',
  floorB: '#5d3f31',
  plank: '#3e2a20',
  woodTop: '#c9a27a',
  woodL: '#a07a58',
  woodR: '#7f5d43',
  metalTop: '#9aa6b2',
  metalL: '#7b8794',
  metalR: '#5f6a76',
  rackTop: '#2a3644',
  rackL: '#1c2530',
  rackR: '#151c25',
  lamp: '#ffd58a',
  ink: '#0e141c',
  paper: '#eef2f5',
  pants: '#2e3542',
  ok: '#5dbb7a',
  warn: '#f5b841',
  bad: '#e5534b',
  work: '#62c9e6',
  idle: '#8b97a5',
}

const SHIRTS = ['#4fb0c6', '#e8a33d', '#8c7ae6', '#5dbb7a', '#e86f6f', '#f2c14e', '#6c8eef', '#d97bb2', '#45b7a0']
const SKINS = ['#f2c9a5', '#d9a37e', '#b07850', '#8a5a3c', '#f5d7b5', '#c68b63']
const HAIRS = ['#2b2118', '#5a3a22', '#c9a24a', '#1e1e1e', '#8c4a2f', '#3b2f5c']

// ---------- Geometry ----------
const r1 = (n) => Math.round(n * 10) / 10
function iso(x, y, z = 0) {
  return [OX + (x - y) * C30 * U, OY + (x + y) * 0.5 * U - z * U]
}
const pts = (list) => list.map(([X, Y]) => r1(X) + ',' + r1(Y)).join(' ')
const poly = (list, fill, extra = '') => `<polygon points="${pts(list)}" fill="${fill}"${extra}/>`

// A box with its three visible faces: top, the face toward the viewer's left, and the one toward the right
function box(x, y, z, w, d, h, c, extra = '') {
  const top = [iso(x, y, z + h), iso(x + w, y, z + h), iso(x + w, y + d, z + h), iso(x, y + d, z + h)]
  const left = [iso(x, y + d, z), iso(x + w, y + d, z), iso(x + w, y + d, z + h), iso(x, y + d, z + h)]
  const right = [iso(x + w, y, z), iso(x + w, y + d, z), iso(x + w, y + d, z + h), iso(x + w, y, z + h)]
  return poly(left, c.left, extra) + poly(right, c.right, extra) + poly(top, c.top, extra)
}

// Draw flat things on a wall. On a "y" plane, local x runs along +x; on an "x" plane, along +y.
// Local y points down (it is minus height), so a rect at y=-3 sits 3 units above the floor.
function onYPlane(x0, y0, inner) {
  const [X, Y] = iso(x0, y0, 0)
  return `<g transform="matrix(${r1(C30 * U * 100) / 100},${0.5 * U},0,${U},${r1(X)},${r1(Y)})">${inner}</g>`
}
function onXPlane(x0, y0, inner) {
  const [X, Y] = iso(x0, y0, 0)
  return `<g transform="matrix(${-r1(C30 * U * 100) / 100},${0.5 * U},0,${U},${r1(X)},${r1(Y)})">${inner}</g>`
}

// ---------- Places in the room ----------
const DESKS = [
  [3.3, 5.4], [6.3, 5.4], [9.3, 5.4],
  [3.3, 8.0], [6.3, 8.0], [9.3, 8.0],
  [3.3, 10.6], [6.3, 10.6], [9.3, 10.6],
]
const DESK_W = 2.0
const DESK_D = 1.1
const LEAD_DESK = [6.9, 2.6]
const LEAD_W = 2.6
const LEAD_D = 1.2

// Where a character stands for each station; k spreads several agents along the spot
function spotFor(station, seat, k, isLead) {
  const off = (k % 3) * 1.0
  switch (station) {
    case 'desk':
      if (isLead) return { x: LEAD_DESK[0] + 1.3, y: LEAD_DESK[1] - 0.45 }
      if (seat >= 0) return { x: DESKS[seat][0] + 1.0, y: DESKS[seat][1] - 0.42 }
      return { x: 2.0 + off, y: 7.0 }
    case 'files':
      return { x: 1.55, y: 2.7 + off }
    case 'terminal':
      return { x: 10.0 - off, y: 1.75 }
    case 'window':
      return { x: 5.0 + off, y: 0.95 }
    case 'whiteboard':
      return { x: 2.2 + off, y: 0.95 }
    case 'phone':
      return { x: 1.7, y: 8.9 + off }
    case 'coffee':
      return { x: 1.6, y: 5.6 + off }
    case 'door':
      return { x: 0.75, y: 11.8 }
    default:
      return { x: 6, y: 6 }
  }
}

// ---------- Small helpers ----------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
// A negative delay that keeps a looping animation in phase across rebuilds
const phase = (now, periodMs, shiftMs = 0) => '-' + (((now + shiftMs) % periodMs) / 1000).toFixed(2) + 's'

// ---------- The room ----------
function sky(hour) {
  if (hour >= 7 && hour < 17) return { top: '#7ec8e3', bottom: '#d4f0fb', night: false, dusk: false }
  if ((hour >= 17 && hour < 20) || (hour >= 5 && hour < 7)) return { top: '#6a4c93', bottom: '#f4a261', night: false, dusk: true }
  return { top: '#0b1d3a', bottom: '#24406b', night: true, dusk: false }
}

function walls(now, busy) {
  const d = new Date(now)
  const s = sky(d.getHours())
  let out = ''
  // Right wall (y = 0) and left wall (x = 0)
  out += poly([iso(0, 0, 0), iso(ROOM_W, 0, 0), iso(ROOM_W, 0, WALL_H), iso(0, 0, WALL_H)], 'url(#ao-wallR)')
  out += poly([iso(0, 0, 0), iso(0, ROOM_D, 0), iso(0, ROOM_D, WALL_H), iso(0, 0, WALL_H)], 'url(#ao-wallL)')
  // Baseboards
  out += poly([iso(0, 0, 0), iso(ROOM_W, 0, 0), iso(ROOM_W, 0, 0.18), iso(0, 0, 0.18)], PAL.base)
  out += poly([iso(0, 0, 0), iso(0, ROOM_D, 0), iso(0, ROOM_D, 0.18), iso(0, 0, 0.18)], PAL.base)
  // Top trim
  out += poly([iso(0, 0, WALL_H), iso(ROOM_W, 0, WALL_H), iso(ROOM_W, 0, WALL_H - 0.12), iso(0, 0, WALL_H - 0.12)], PAL.wallRTop)
  out += poly([iso(0, 0, WALL_H), iso(0, ROOM_D, WALL_H), iso(0, ROOM_D, WALL_H - 0.12), iso(0, 0, WALL_H - 0.12)], PAL.wallLTop)

  // Window on the right wall, with the sky for the actual time of day
  let win = `<rect x="4.3" y="-3.45" width="3.6" height="2.15" fill="#1a2733"/>`
  win += `<rect x="4.42" y="-3.33" width="3.36" height="1.91" fill="url(#ao-sky)"/>`
  if (s.night) {
    win += `<circle cx="7.1" cy="-2.95" r=".22" fill="#f4f1de"/><circle cx="7.2" cy="-3.0" r=".2" fill="url(#ao-sky)"/>`
    ;[[4.9, -3.0], [5.6, -2.6], [6.3, -3.1], [5.2, -2.2], [6.8, -2.4]].forEach(([x, y], i) => {
      win += `<circle cx="${x}" cy="${y}" r=".035" fill="#fff" class="ao-twinkle" style="animation-delay:${phase(now, 4000, i * 900)}"/>`
    })
  } else {
    win += `<g class="ao-cloud" style="animation-delay:${phase(now, 60000)}"><ellipse cx="5" cy="-2.7" rx=".42" ry=".14" fill="#fff" opacity=".85"/><ellipse cx="5.3" cy="-2.78" rx=".3" ry=".15" fill="#fff" opacity=".85"/></g>`
  }
  win += `<rect x="6.05" y="-3.33" width=".1" height="1.91" fill="#1a2733"/><rect x="4.42" y="-2.43" width="3.36" height=".08" fill="#1a2733"/>`
  win += `<rect x="4.2" y="-1.35" width="3.8" height=".14" fill="#22313d"/>`
  out += onYPlane(0, 0, win)

  // Whiteboard on the right wall; the scribble draws itself while someone plans
  let wb = `<rect x="1.1" y="-3.2" width="2.6" height="1.75" rx=".06" fill="#2a3a46"/><rect x="1.18" y="-3.12" width="2.44" height="1.59" fill="${PAL.paper}"/>`
  const scribble = 'M1.45,-2.8 q.3,-.18 .6,0 t.6,0 M1.45,-2.45 h1.3 M1.45,-2.15 h.9 M2.75,-2.25 l.25,.18 l.45,-.5'
  wb += `<path d="${scribble}" fill="none" stroke="#3d6fb6" stroke-width=".06" stroke-linecap="round"${busy.whiteboard ? ` class="ao-draw" style="animation-delay:${phase(now, 3200)}"` : ''}/>`
  wb += `<rect x="1.5" y="-1.53" width=".9" height=".07" fill="#d64545"/>`
  out += onYPlane(0, 0, wb)

  // Clock on the right wall, showing the real time
  const sec = d.getSeconds() + d.getMilliseconds() / 1000
  const min = d.getMinutes() + sec / 60
  const hr = (d.getHours() % 12) + min / 60
  let clock = `<circle cx="9.4" cy="-3.05" r=".42" fill="#f4f1ea" stroke="#22313d" stroke-width=".07"/>`
  clock += `<line x1="9.4" y1="-3.05" x2="9.4" y2="-3.27" stroke="#22313d" stroke-width=".06" stroke-linecap="round" class="ao-hand" style="transform-origin:9.4px -3.05px;animation-duration:43200s;animation-delay:-${(hr * 3600).toFixed(0)}s"/>`
  clock += `<line x1="9.4" y1="-3.05" x2="9.4" y2="-3.38" stroke="#22313d" stroke-width=".045" stroke-linecap="round" class="ao-hand" style="transform-origin:9.4px -3.05px;animation-duration:3600s;animation-delay:-${(min * 60).toFixed(0)}s"/>`
  clock += `<line x1="9.4" y1="-3.05" x2="9.4" y2="-3.4" stroke="${PAL.bad}" stroke-width=".02" class="ao-hand" style="transform-origin:9.4px -3.05px;animation-duration:60s;animation-delay:-${sec.toFixed(1)}s"/>`
  out += onYPlane(0, 0, clock)

  // Left wall: a framed print, the door and its exit sign
  let lw = `<rect x="3.4" y="-3.1" width="1.3" height=".95" fill="#22313d"/><rect x="3.48" y="-3.02" width="1.14" height=".79" fill="#e9c46a"/><path d="M3.48,-2.23 l.4,-.42 l.3,.25 l.44,-.5 v.67z" fill="#2a9d8f"/>`
  lw += `<rect x="11.15" y="-2.35" width="1.25" height="2.35" fill="#1f2c36"/><rect x="11.25" y="-2.25" width="1.05" height="2.25" fill="#5b4636"/><circle cx="12.1" cy="-1.1" r=".06" fill="#e9c46a"/>`
  lw += `<rect x="11.45" y="-2.75" width=".65" height=".26" rx=".04" fill="#1f6f43"/><rect x="11.52" y="-2.7" width=".51" height=".16" fill="#2fbf71" opacity=".9"/>`
  out += onXPlane(0, 0, lw)
  return out
}

function floor() {
  let out = poly([iso(0, 0), iso(ROOM_W, 0), iso(ROOM_W, ROOM_D), iso(0, ROOM_D)], 'url(#ao-floor)')
  // Planks run along x
  for (let y = 1; y < ROOM_D; y += 1) {
    const [a, b] = [iso(0, y), iso(ROOM_W, y)]
    out += `<line x1="${r1(a[0])}" y1="${r1(a[1])}" x2="${r1(b[0])}" y2="${r1(b[1])}" stroke="${PAL.plank}" stroke-width=".6" opacity=".35"/>`
  }
  // A rug under the lead desk, and pools of lamp light over the desk rows
  out += poly([iso(5.9, 1.4), iso(10.6, 1.4), iso(10.6, 4.5), iso(5.9, 4.5)], '#3d5a6c', ' opacity=".55"')
  ;[[7.5, 3.0, 3.4], [5.3, 6.2, 3.2], [8.3, 6.2, 3.2], [5.3, 8.8, 3.2], [8.3, 8.8, 3.2], [6.8, 11.2, 3.6]].forEach(([x, y, r]) => {
    const [X, Y] = iso(x, y)
    out += `<ellipse cx="${r1(X)}" cy="${r1(Y)}" rx="${r1(r * U * 0.95)}" ry="${r1(r * U * 0.5)}" fill="url(#ao-pool)"/>`
  })
  return out
}

// ---------- Furniture, each with a depth key for drawing order ----------
function furniture(now, busy, seatsUsed) {
  const items = []
  const wood = { top: PAL.woodTop, left: PAL.woodL, right: PAL.woodR }

  // Helper desks, each with a chair behind it and a laptop facing the person
  DESKS.forEach(([x, y], i) => {
    const used = seatsUsed.has(i)
    // Chair sits behind the person (smaller depth than the person)
    items.push({
      key: x + 0.75 + y - 0.95,
      svg:
        box(x + 0.72, y - 1.05, 0.38, 0.56, 0.5, 0.08, { top: '#3b4654', left: '#2f3843', right: '#262e37' }) +
        box(x + 0.72, y - 1.05, 0.46, 0.56, 0.08, 0.62, { top: '#3b4654', left: '#333d49', right: '#262e37' }),
    })
    let desk = box(x, y, 0, DESK_W, DESK_D, 0.72, wood)
    // Laptop: base on the desk and the back of its lid toward us
    desk += box(x + 0.6, y + 0.15, 0.72, 0.8, 0.5, 0.03, { top: '#aeb6c2', left: '#8f99a6', right: '#7a8491' })
    const lid = [iso(x + 0.6, y + 0.15, 0.75), iso(x + 1.4, y + 0.15, 0.75), iso(x + 1.4, y + 0.15, 1.25), iso(x + 0.6, y + 0.15, 1.25)]
    desk += poly(lid, used ? '#c7ccd6' : '#a9b0bb')
    const [lx, ly] = iso(x + 1.0, y + 0.15, 1.0)
    desk += `<circle cx="${r1(lx)}" cy="${r1(ly)}" r="1.4" fill="${used ? PAL.work : '#8b95a1'}"${used ? ` class="ao-pulse" style="animation-delay:${phase(now, 2400, i * 300)}"` : ''}/>`
    // A small plant or mug for variety
    if (i % 3 === 1) desk += box(x + 1.65, y + 0.55, 0.72, 0.18, 0.18, 0.2, { top: '#e9ecef', left: '#cfd5db', right: '#b8c0c8' })
    if (i % 3 === 2) {
      desk += box(x + 0.15, y + 0.6, 0.72, 0.22, 0.22, 0.16, { top: '#7a5a44', left: '#6a4c39', right: '#583f2f' })
      const [px, py] = iso(x + 0.26, y + 0.71, 1.02)
      desk += `<circle cx="${r1(px)}" cy="${r1(py)}" r="3.2" fill="#3f8f5a"/><circle cx="${r1(px + 2)}" cy="${r1(py + 1)}" r="2.4" fill="#4fa86b"/>`
    }
    items.push({ key: x + DESK_W / 2 + y + DESK_D / 2 + 0.5, svg: desk })
  })

  // The lead desk by the window, with a monitor and a mug that steams while idle
  {
    const [x, y] = LEAD_DESK
    items.push({
      key: x + 1.05 + y - 1.0,
      svg:
        box(x + 1.0, y - 1.12, 0.38, 0.62, 0.55, 0.09, { top: '#43505f', left: '#36414d', right: '#2b343e' }) +
        box(x + 1.0, y - 1.12, 0.47, 0.62, 0.09, 0.72, { top: '#43505f', left: '#3c4855', right: '#2b343e' }),
    })
    let desk = box(x, y, 0, LEAD_W, LEAD_D, 0.74, { top: '#d3ae86', left: '#a8815e', right: '#856246' })
    desk += box(x + 0.85, y + 0.25, 0.74, 0.9, 0.12, 0.62, { top: '#2b3440', left: '#232b35', right: '#1b222b' })
    desk += box(x + 1.22, y + 0.3, 0.74, 0.16, 0.16, 0.12, { top: '#3a4552', left: '#2f3843', right: '#262e37' })
    desk += box(x + 2.1, y + 0.7, 0.74, 0.2, 0.2, 0.2, { top: '#f4f1ea', left: '#d9d4c9', right: '#c2bcb0' })
    if (busy.leadIdle) {
      const [sx, sy] = iso(x + 2.2, y + 0.8, 1.05)
      desk += `<path d="M${r1(sx)},${r1(sy)} q-2,-3 0,-6 t0,-6" fill="none" stroke="#ffffff" stroke-width="1" stroke-linecap="round" opacity=".5" class="ao-steam" style="animation-delay:${phase(now, 2600)}"/>`
    }
    items.push({ key: x + LEAD_W / 2 + y + LEAD_D / 2 + 0.5, svg: desk })
  }

  // Filing cabinets on the left wall, with drawer lines on their front
  {
    let cab = box(0.05, 2.0, 0, 0.85, 2.1, 1.45, { top: PAL.metalTop, left: PAL.metalL, right: PAL.metalR })
    let lines = ''
    for (let i = 0; i < 2; i++) for (let j = 0; j < 3; j++) lines += `<rect x="${2.1 + i * 1.02}" y="${-1.35 + j * 0.45}" width=".88" height=".38" fill="none" stroke="#4c5661" stroke-width=".035"/><rect x="${2.42 + i * 1.02}" y="${-1.2 + j * 0.45}" width=".24" height=".05" fill="#c7cdd4"/>`
    const [X, Y] = iso(0.9, 0, 0)
    cab += `<g transform="matrix(-${r1(C30 * U * 100) / 100},${0.5 * U},0,${U},${r1(X)},${r1(Y)})">${lines}</g>`
    if (busy.files) {
      const [px, py] = iso(1.0, 2.9, 1.55)
      cab += `<rect x="${r1(px - 3)}" y="${r1(py - 4)}" width="6" height="7.5" fill="${PAL.paper}" class="ao-flip" style="animation-delay:${phase(now, 1400)}"/>`
    }
    items.push({ key: 0.45 + 3.05, svg: cab })
  }

  // Coffee counter on the left wall
  {
    let c = box(0.05, 5.3, 0, 0.8, 1.6, 0.92, { top: '#d9d4c9', left: '#8a7a6a', right: '#6f6153' })
    c += box(0.15, 5.45, 0.92, 0.5, 0.45, 0.55, { top: '#2b3440', left: '#232b35', right: '#1b222b' })
    c += box(0.25, 6.35, 0.92, 0.18, 0.18, 0.16, { top: '#e86f6f', left: '#c95959', right: '#a84747' })
    if (busy.coffee) {
      const [sx, sy] = iso(0.4, 5.7, 1.5)
      c += `<path d="M${r1(sx)},${r1(sy)} q-2,-3 0,-6 t0,-6" fill="none" stroke="#fff" stroke-width="1" stroke-linecap="round" opacity=".5" class="ao-steam" style="animation-delay:${phase(now, 2600)}"/>`
    }
    items.push({ key: 0.45 + 6.1, svg: c })
  }

  // A glass phone booth on the left wall
  {
    let p = box(0.05, 8.4, 0, 1.15, 1.5, 2.45, { top: '#3a4a58', left: '#9ad0dd', right: '#7bb6c4' }, ' opacity=".55"')
    p += box(0.05, 8.4, 2.35, 1.15, 1.5, 0.1, { top: '#2a3a46', left: '#22313d', right: '#1a2733' })
    const [X, Y] = iso(1.2, 8.4, 0)
    p += `<g transform="matrix(-${r1(C30 * U * 100) / 100},${0.5 * U},0,${U},${r1(X)},${r1(Y)})"><rect x="0" y="-2.35" width="1.5" height="2.35" fill="none" stroke="#22313d" stroke-width=".07"/><rect x=".3" y="-1.5" width=".22" height=".12" fill="#22313d"/></g>`
    items.push({ key: 0.6 + 9.15, svg: p })
  }

  // Server rack in the back corner; its lights blink, faster while a command runs
  {
    let r = box(10.4, 0.1, 0, 1.25, 0.9, 2.6, { top: PAL.rackTop, left: PAL.rackL, right: PAL.rackR })
    const [X, Y] = iso(10.4, 1.0, 0)
    let leds = ''
    for (let row = 0; row < 6; row++) {
      leds += `<rect x=".12" y="${-2.4 + row * 0.38}" width="1.0" height=".26" fill="#26313d"/>`
      for (let k = 0; k < 3; k++) {
        const color = (row + k) % 4 === 0 ? PAL.warn : PAL.ok
        const period = busy.terminal ? 700 + ((row * 3 + k) % 5) * 130 : 2200 + ((row * 3 + k) % 5) * 500
        leds += `<rect x="${0.2 + k * 0.14}" y="${-2.33 + row * 0.38}" width=".07" height=".07" fill="${color}" class="ao-led" style="animation-duration:${period}ms;animation-delay:${phase(now, period, row * 170 + k * 90)}"/>`
      }
    }
    r += `<g transform="matrix(${r1(C30 * U * 100) / 100},${0.5 * U},0,${U},${r1(X)},${r1(Y)})">${leds}</g>`
    items.push({ key: 11.0 + 0.55, svg: r })
  }

  // Plants in two corners
  const plant = (x, y, s, i) => {
    let p = box(x, y, 0, 0.55 * s, 0.55 * s, 0.6 * s, { top: '#5b4636', left: '#c86b4a', right: '#a3563b' })
    const [px, py] = iso(x + 0.27 * s, y + 0.27 * s, 0.6 * s)
    p += `<g class="ao-sway" style="transform-origin:${r1(px)}px ${r1(py)}px;animation-delay:${phase(now, 7000, i * 1700)}">`
    p += `<ellipse cx="${r1(px - 4 * s)}" cy="${r1(py - 9 * s)}" rx="${r1(4 * s)}" ry="${r1(9 * s)}" fill="#2f7d4f" transform="rotate(-18 ${r1(px)} ${r1(py)})"/>`
    p += `<ellipse cx="${r1(px + 4 * s)}" cy="${r1(py - 10 * s)}" rx="${r1(4 * s)}" ry="${r1(10 * s)}" fill="#3f9a63" transform="rotate(16 ${r1(px)} ${r1(py)})"/>`
    p += `<ellipse cx="${r1(px)}" cy="${r1(py - 13 * s)}" rx="${r1(3.6 * s)}" ry="${r1(10 * s)}" fill="#4fae72"/></g>`
    return p
  }
  items.push({ key: 0.3 + 0.3, svg: plant(0.15, 0.15, 1.1, 0) })
  return items
}

// ---------- People ----------
function hair(style, color, accent) {
  switch (style % 6) {
    case 0:
      return `<path d="M-5.8,-29 a5.8,5.8 0 0 1 11.6,0 q-2.4,-2.4 -5.8,-2.6 q-3.4,.2 -5.8,2.6z" fill="${color}"/>`
    case 1:
      return `<path d="M-5.8,-29 a5.8,5.8 0 0 1 11.6,0 q-2.4,-2.4 -5.8,-2.6 q-3.4,.2 -5.8,2.6z" fill="${color}"/><circle cx="0" cy="-35.4" r="2.5" fill="${color}"/>`
    case 2:
      return `<path d="M-5.9,-28.5 a5.9,5.9 0 0 1 11.8,0 q-4.6,-1.8 -9,-.4z" fill="${color}"/>`
    case 3:
      return `<circle cx="-3.6" cy="-32.4" r="2.7" fill="${color}"/><circle cx="0" cy="-34" r="2.9" fill="${color}"/><circle cx="3.6" cy="-32.4" r="2.7" fill="${color}"/>`
    case 4:
      return `<path d="M-6,-29.4 a6,6 0 0 1 12,0z" fill="${accent}"/><rect x="-6.4" y="-30.2" width="12.8" height="2.1" rx="1" fill="${accent}" opacity=".75"/>`
    default:
      return `<path d="M-5.8,-29 a5.8,5.8 0 0 1 11.6,0 q-2.4,-2.4 -5.8,-2.6 q-3.4,.2 -5.8,2.6z" fill="${color}"/>`
  }
}

function person(a, pose, now) {
  const shirt = a.isLead ? '#eef1f6' : SHIRTS[a.n % SHIRTS.length]
  const skin = a.isLead ? '#f0caa6' : SKINS[(a.n * 7) % SKINS.length]
  const hairColor = a.isLead ? '#b9c2cc' : HAIRS[(a.n * 5) % HAIRS.length]
  const seated = SEATED.has(pose)
  const dy = seated ? 4 : 0
  let s = `<ellipse cx="0" cy="0" rx="6.5" ry="2.6" fill="#000" opacity=".28"/>`
  s += `<g transform="translate(0,${dy})">`
  if (!seated) {
    s += `<rect x="-4" y="-10" width="3.4" height="10" rx="1.3" fill="${PAL.pants}"/><rect x=".6" y="-10" width="3.4" height="10" rx="1.3" fill="${PAL.pants}"/>`
  }
  // Long hair sits behind the head
  if (!a.isLead && a.n % 6 === 5) s += `<rect x="-6.3" y="-31" width="12.6" height="10" rx="3.2" fill="${hairColor}"/>`
  const slump = pose === 'slump' ? ' transform="translate(0,2)"' : ''
  s += `<g${slump}>`
  s += `<rect x="-6.5" y="-23" width="13" height="14" rx="5" fill="${shirt}"/>`
  s += `<rect x=".6" y="-23" width="5.9" height="14" rx="4" fill="#000" opacity=".13"/>`
  if (a.isLead) s += `<path d="M-2,-22.6 l2,2.4 l2,-2.4" fill="none" stroke="#3b4a5a" stroke-width="1"/>`
  // Arms, by pose
  if (pose === 'type') {
    s += `<rect x="-8.4" y="-21" width="3" height="8.5" rx="1.5" fill="${shirt}" class="ao-type" style="animation-delay:${phase(now, 560)}"/>`
    s += `<rect x="5.4" y="-21" width="3" height="8.5" rx="1.5" fill="${shirt}" class="ao-type" style="animation-delay:${phase(now, 560, 280)}"/>`
  } else if (pose === 'raise' || pose === 'raisesit') {
    s += `<rect x="-8.4" y="-21" width="3" height="9.5" rx="1.5" fill="${shirt}"/>`
    s += `<g class="ao-wave" style="transform-origin:6.9px -21px;animation-delay:${phase(now, 1200)}"><rect x="5.4" y="-33.5" width="3" height="11" rx="1.5" fill="${shirt}"/><circle cx="6.9" cy="-34.2" r="1.7" fill="${skin}"/></g>`
  } else if (pose === 'phone') {
    s += `<rect x="-8.4" y="-21" width="3" height="9.5" rx="1.5" fill="${shirt}"/>`
    s += `<rect x="4.6" y="-29" width="3" height="9" rx="1.5" fill="${shirt}"/><rect x="5" y="-31.5" width="2.2" height="4" rx=".6" fill="#1d2733"/>`
  } else if (pose === 'mug') {
    s += `<rect x="-8.4" y="-21" width="3" height="9.5" rx="1.5" fill="${shirt}"/>`
    s += `<rect x="5.2" y="-20" width="3" height="7" rx="1.5" fill="${shirt}"/><rect x="6.2" y="-17.5" width="3.2" height="3.6" rx=".8" fill="#e86f6f"/>`
  } else if (pose === 'reach') {
    s += `<rect x="-8.4" y="-21" width="3" height="9.5" rx="1.5" fill="${shirt}"/>`
    s += `<rect x="5.4" y="-25" width="3" height="9.5" rx="1.5" fill="${shirt}" class="ao-reach" style="transform-origin:6.9px -21px;animation-delay:${phase(now, 1800)}"/>`
  } else {
    s += `<rect x="-8.4" y="-21" width="3" height="9.5" rx="1.5" fill="${shirt}"/><rect x="5.4" y="-21" width="3" height="9.5" rx="1.5" fill="${shirt}"/>`
  }
  // Head
  s += `<circle cx="0" cy="-28.5" r="5.7" fill="${skin}"/>`
  s += a.isLead
    ? `<path d="M-5.8,-29 a5.8,5.8 0 0 1 11.6,0 q-2.4,-2.4 -5.8,-2.6 q-3.4,.2 -5.8,2.6z" fill="${hairColor}"/>`
    : hair(a.n, hairColor, SHIRTS[(a.n + 3) % SHIRTS.length])
  if (pose === 'slump') s += `<path d="M-3,-27.6 h2 M1,-27.6 h2" stroke="#1d1d24" stroke-width=".8" stroke-linecap="round"/>`
  else s += `<circle cx="-2" cy="-28" r=".75" fill="#1d1d24"/><circle cx="2" cy="-28" r=".75" fill="#1d1d24"/>`
  // Light from the screen on the face while working
  if (pose === 'type' || pose === 'work') {
    s += `<circle cx="0" cy="-26" r="7.5" fill="${GLOW[a.act] || PAL.work}" fill-opacity=".2" class="ao-pulse" style="animation-delay:${phase(now, 2400, a.n * 300)}"/>`
  }
  s += `</g></g>`
  return s
}

// The tag and status bubble above a person
function tag(a, pose, now, lift = 0) {
  const label = esc(a.short)
  const w = Math.round(14 + a.short.length * 3.7)
  const color = { working: PAL.work, waiting: PAL.warn, done: PAL.ok, failed: PAL.bad, stopped: PAL.idle, idle: PAL.idle }[a.status] || PAL.idle
  const top = (SEATED.has(pose) ? -42 : -46) - lift
  let s = `<g transform="translate(0,${top})">`
  s += `<rect x="${-w / 2}" y="-5.6" width="${w}" height="9.6" rx="4.8" fill="${PAL.ink}" opacity=".8"/>`
  s += `<circle cx="${-w / 2 + 5.2}" cy="-.8" r="1.9" fill="${color}"${a.status === 'working' ? ` class="ao-pulse" style="animation-delay:${phase(now, 2400)}"` : ''}/>`
  s += `<text x="${-w / 2 + 9}" y="1.5" font-size="6.4" font-weight="600" fill="#f2f5f8" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif">${label}</text>`
  s += `</g>`
  // Status bubbles to the right of the head
  const bx = 9
  const by = top + 10
  if (a.status === 'waiting') {
    s += `<g class="ao-bounce" style="animation-delay:${phase(now, 1100)}"><circle cx="${bx}" cy="${by}" r="5" fill="${PAL.warn}"/><text x="${bx}" y="${by + 2.4}" font-size="7" font-weight="700" text-anchor="middle" fill="${PAL.ink}" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif">?</text></g>`
  } else if (a.status === 'done') {
    s += `<circle cx="${bx}" cy="${by}" r="5" fill="${PAL.ok}"/><path d="M${bx - 2.3},${by} l1.6,1.7 l3,-3.4" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>`
  } else if (a.status === 'failed') {
    s += `<circle cx="${bx}" cy="${by}" r="5" fill="${PAL.bad}"/><rect x="${bx - 0.7}" y="${by - 3}" width="1.4" height="3.6" rx=".7" fill="#fff"/><circle cx="${bx}" cy="${by + 2.2}" r=".8" fill="#fff"/>`
  } else if (a.status === 'working' && (pose === 'type' || pose === 'work')) {
    s += activityIcon(a.act, bx + 1, by, now)
  }
  return s
}

// A small white bubble with an icon for what someone is doing
function activityIcon(kind, x, y, now) {
  const ink = PAL.ink
  const st = `fill="none" stroke="${ink}" stroke-width=".9" stroke-linecap="round" stroke-linejoin="round"`
  let icon = ''
  switch (kind) {
    case 'edit': // pencil
      icon = `<path d="M${x - 2.6},${y + 2.6} l.5,-1.9 l3.6,-3.6 l1.4,1.4 l-3.6,3.6z" ${st}/><path d="M${x + 0.8},${y - 2.4} l1.4,1.4" ${st}/>`
      break
    case 'terminal': // >_
      icon = `<path d="M${x - 2.8},${y - 1.8} l1.8,1.6 l-1.8,1.6" ${st}/><path d="M${x + 0.2},${y + 1.6} h2.6" ${st}/>`
      break
    case 'web': // globe
      icon = `<circle cx="${x}" cy="${y}" r="2.8" ${st}/><ellipse cx="${x}" cy="${y}" rx="1.2" ry="2.8" ${st}/><path d="M${x - 2.8},${y} h5.6" ${st}/>`
      break
    case 'files': // document
      icon = `<path d="M${x - 2},${y - 3} h2.6 l1.4,1.4 v4.6 h-4z" ${st}/><path d="M${x - 1.1},${y - 0.4} h2.2 M${x - 1.1},${y + 1.2} h2.2" ${st}/>`
      break
    case 'app': // plug
      icon = `<path d="M${x - 1.2},${y - 3} v1.8 M${x + 1.2},${y - 3} v1.8" ${st}/><rect x="${x - 2.2}" y="${y - 1.2}" width="4.4" height="2.6" rx="1" ${st}/><path d="M${x},${y + 1.4} v1.8" ${st}/>`
      break
    case 'plan': // checklist
      icon = `<path d="M${x - 2.8},${y - 1.6} l.7,.7 l1.2,-1.3 M${x - 2.8},${y + 1.4} l.7,.7 l1.2,-1.3" ${st}/><path d="M${x},${y - 1.2} h2.8 M${x},${y + 1.8} h2.8" ${st}/>`
      break
    default: // thinking: three dots
      icon = [0, 1, 2].map((i) => `<circle cx="${x - 2.2 + i * 2.2}" cy="${y}" r=".75" fill="${ink}" class="ao-dot" style="animation-delay:${phase(now, 1200, i * 200)}"/>`).join('')
  }
  return `<rect x="${x - 4.6}" y="${y - 4.4}" width="9.2" height="8.8" rx="2.6" fill="#ffffff" opacity=".93"/>${icon}`
}

// Rising glyphs above a laptop while someone types at it
function particles(a, now) {
  if (a.seat < 0 && !a.isLead) return ''
  const [dx, dy] = a.isLead ? [LEAD_DESK[0] + 1.3, LEAD_DESK[1] + 0.3] : [DESKS[a.seat][0] + 1.0, DESKS[a.seat][1] + 0.15]
  const [X, Y] = iso(dx, dy, a.isLead ? 1.4 : 1.25)
  const glyphs = a.act === 'terminal' ? ['$', '>', '_', '.'] : ['{', '/', '>', '}']
  return glyphs
    .map(
      (g, i) =>
        `<text x="${r1(X - 6 + i * 4)}" y="${r1(Y)}" font-size="5.5" font-weight="700" fill="${GLOW[a.act] || PAL.work}" font-family="ui-monospace,Menlo,monospace" class="ao-rise" style="animation-delay:${phase(now, 2200, i * 550 + a.n * 130)}">${esc(g)}</text>`,
    )
    .join('')
}

const SEATED = new Set(['sit', 'type', 'work', 'slump', 'raisesit'])
function poseFor(a, arrived) {
  if (!arrived) return 'walk'
  if (a.station !== 'desk') return 'stand'
  if (a.status === 'failed') return 'slump'
  if (a.status === 'waiting') return 'raisesit'
  if (a.status !== 'working') return 'sit'
  return a.act === 'edit' || a.act === 'terminal' ? 'type' : 'work'
}

// The light from someone's screen, by what's on it
const GLOW = { edit: '#62c9e6', terminal: '#5dd39e', web: '#6c8eef', files: '#f2d27a', app: '#b48cf2', plan: '#f2c14e', think: '#62c9e6' }

// ---------- The whole picture ----------
// people: [{ id, n, short, isLead, status, station, seat, pos, from, moveAt, moveDur, exitAt }]
function buildScene(people, now, reducedMotion) {
  const working = (kind) => people.some((p) => p.status === 'working' && p.act === kind && p.arrived && p.station === 'desk')
  const busy = {
    whiteboard: people.some((p) => p.isLead && p.status === 'working' && p.act === 'plan'),
    files: false,
    terminal: working('terminal'),
    coffee: false,
    leadIdle: people.some((p) => p.isLead && p.status === 'idle'),
  }
  const seatsUsed = new Set(people.filter((p) => !p.isLead && p.seat >= 0 && p.station === 'desk').map((p) => p.seat))
  const s = sky(new Date(now).getHours())

  const keyframes = []
  const layers = furniture(now, busy, seatsUsed)
  const overlay = []
  const underlay = []

  const placed = []
  const liftFor = (p, pose) => {
    const [X, Y] = iso(p.pos.x, p.pos.y)
    const w = Math.round(14 + p.short.length * 3.7) + 12 // room for a status bubble
    const base = Y + (SEATED.has(pose) ? -42 : -46)
    let lift = 0
    const hits = (l) => placed.some((r) => X - w / 2 < r.x2 && X + w / 2 > r.x1 && base - l - 6 < r.y2 && base - l + 5 > r.y1)
    while (hits(lift) && lift < 44) lift += 11
    placed.push({ x1: X - w / 2, x2: X + w / 2, y1: base - lift - 6, y2: base - lift + 5 })
    return lift
  }
  // Settled people claim their label spots first, then walkers
  const order = [...people].sort((p, q) => (now < p.moveAt + p.moveDur ? 1 : 0) - (now < q.moveAt + q.moveDur ? 1 : 0) || p.n - q.n)
  const lifts = new Map(order.map((p) => [p.n, liftFor(p, poseFor(p, now >= p.moveAt + p.moveDur))]))

  for (const p of people) {
    const walking = now < p.moveAt + p.moveDur
    const pose = poseFor(p, !walking)
    const [tx, ty] = iso(p.pos.x, p.pos.y)
    const anims = []
    const id = 'p' + p.n
    if (walking) {
      const path = p.path && p.path.length > 1 ? p.path : [p.from, p.pos]
      const lens = path.slice(1).map((q, i) => Math.hypot(q.x - path[i].x, q.y - path[i].y))
      const total = lens.reduce((x, y) => x + y, 0) || 1
      let acc = 0
      const stops = path.map((q, i) => {
        if (i) acc += lens[i - 1]
        const [X, Y] = iso(q.x, q.y)
        return `${((acc / total) * 100).toFixed(1)}%{transform:translate(${r1(X)}px,${r1(Y)}px)}`
      })
      keyframes.push(`@keyframes ao-${id}{${stops.join('')}}`)
      const easing = path.length > 2 ? 'linear' : EASE_MOVE
      anims.push(`ao-${id} ${(p.moveDur / 1000).toFixed(2)}s ${easing} -${((now - p.moveAt) / 1000).toFixed(2)}s both`)
    }
    if (p.exitAt) {
      const start = (p.exitAt - now) / 1000
      anims.push(`ao-fade .9s ease-out ${start.toFixed(2)}s both`)
    }
    const style = anims.length ? ` style="animation:${anims.join(',')}"` : ''
    const bob = walking
      ? ` class="ao-bob" style="animation-iteration-count:${Math.max(1, Math.ceil(p.moveDur / 320))};animation-delay:-${(((now - p.moveAt) % 640) / 1000).toFixed(2)}s"`
      : ''
    layers.push({
      key: p.pos.x + p.pos.y + p.n * 0.001,
      svg: `<g transform="translate(${r1(tx)},${r1(ty)})"${style}><g${bob}>${person(p, pose, now)}</g></g>`,
    })
    // Walkers' tags go underneath, so seated people's tags stay readable as someone passes
    const tagSvg = `<g transform="translate(${r1(tx)},${r1(ty)})"${style}>${tag(p, pose, now, lifts.get(p.n) || 0)}</g>`
    if (walking) underlay.push(tagSvg)
    else overlay.push(tagSvg)
    if (pose === 'type') overlay.push(particles(p, now))
  }
  layers.sort((a, b) => a.key - b.key)

  const css = `
.ao-hand{animation-name:ao-spin;animation-timing-function:linear;animation-iteration-count:infinite}
@keyframes ao-spin{to{transform:rotate(360deg)}}
.ao-led{animation-name:ao-blink;animation-iteration-count:infinite;animation-timing-function:steps(1,end)}
@keyframes ao-blink{0%{opacity:1}55%{opacity:.25}}
.ao-pulse{animation:ao-pulse 2.4s ease-in-out infinite}
@keyframes ao-pulse{0%,100%{opacity:.55}50%{opacity:1}}
.ao-type{animation:ao-type .28s ease-in-out infinite alternate}
@keyframes ao-type{from{transform:translateY(0)}to{transform:translateY(1.3px)}}
.ao-bob{animation:ao-bob .32s ease-in-out alternate}
@keyframes ao-bob{from{transform:translateY(0)}to{transform:translateY(-1.6px)}}
.ao-rise{animation:ao-rise 2.2s ease-out infinite;opacity:0}
@keyframes ao-rise{0%{opacity:0;transform:translateY(0)}20%{opacity:.95}100%{opacity:0;transform:translateY(-14px)}}
.ao-wave{animation:ao-wave 1.2s ease-in-out infinite}
@keyframes ao-wave{0%,100%{transform:rotate(0)}50%{transform:rotate(9deg)}}
.ao-reach{animation:ao-reach 1.8s ease-in-out infinite}
@keyframes ao-reach{0%,100%{transform:rotate(0)}50%{transform:rotate(-14deg)}}
.ao-bounce{animation:ao-bounce 1.1s ease-in-out infinite}
@keyframes ao-bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-2px)}}
.ao-dot{animation:ao-dot 1.2s ease-in-out infinite}
@keyframes ao-dot{0%,100%{opacity:.25}40%{opacity:1}}
.ao-steam{animation:ao-steam 2.6s ease-out infinite}
@keyframes ao-steam{0%{opacity:0;transform:translateY(0)}30%{opacity:.55}100%{opacity:0;transform:translateY(-6px)}}
.ao-flip{animation:ao-flip 1.4s ease-in-out infinite}
@keyframes ao-flip{0%,100%{transform:translateY(0);opacity:.95}50%{transform:translateY(-3px);opacity:.7}}
.ao-draw{stroke-dasharray:6;animation:ao-draw 3.2s ease-in-out infinite}
@keyframes ao-draw{0%{stroke-dashoffset:6}60%,100%{stroke-dashoffset:0}}
.ao-sway{animation:ao-sway 7s ease-in-out infinite}
@keyframes ao-sway{0%,100%{transform:rotate(-1.5deg)}50%{transform:rotate(1.5deg)}}
.ao-cloud{animation:ao-cloud 60s linear infinite}
@keyframes ao-cloud{from{transform:translateX(-.6px)}to{transform:translateX(2.6px)}}
.ao-twinkle{animation:ao-twinkle 4s ease-in-out infinite}
@keyframes ao-twinkle{0%,100%{opacity:.3}50%{opacity:1}}
@keyframes ao-fade{to{opacity:0}}
${keyframes.join('\n')}
${reducedMotion ? '*{animation:none!important}' : '@media (prefers-reduced-motion: reduce){*{animation:none!important}}'}
`

  const defs = `<defs>
<linearGradient id="ao-wallR" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3f6377"/><stop offset="1" stop-color="${PAL.wallR}"/></linearGradient>
<linearGradient id="ao-wallL" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#32505f"/><stop offset="1" stop-color="${PAL.wallL}"/></linearGradient>
<linearGradient id="ao-floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${PAL.floorA}"/><stop offset="1" stop-color="${PAL.floorB}"/></linearGradient>
<linearGradient id="ao-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.top}"/><stop offset="1" stop-color="${s.bottom}"/></linearGradient>
<radialGradient id="ao-pool"><stop offset="0" stop-color="${PAL.lamp}" stop-opacity=".16"/><stop offset="1" stop-color="${PAL.lamp}" stop-opacity="0"/></radialGradient>
</defs>`

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VB_W} ${VB_H}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">` +
    `<style>${css}</style>${defs}` +
    `<rect x="0" y="0" width="${VB_W}" height="${VB_H}" rx="14" fill="${PAL.bg}"/>` +
    walls(now, busy) +
    floor() +
    layers.map((l) => l.svg).join('') +
    underlay.join('') +
    overlay.join('') +
    `</svg>`
  )
}

// ---------- Agent tracking ----------
// Read-only: this mod only watches events and draws. It makes no model calls and
// never changes a prompt, a tool call or its result.

const PANE = 'agent-office'
const ACT_DWELL_MS = 2500 // shortest time an activity icon stays up, so quick tool bursts don't flicker
const EXIT_LINGER_MS = 1300 // time at the door before fading out
const KEEP_FINISHED_MS = 15 * 60_000 // finished agents leave the list after this
const MAX_AGENTS = 40
const REBUILD_MIN_MS = 700 // rebuild the picture at most this often

const agents = new Map() // agent id -> agent
const pending = [] // agents Claude asked for, waiting for their id: { short, task, ref, at }
let counter = 0
let paneOpen = false
let version = 0
let built = { version: -1, at: 0, svg: '' }
let toastedThisBatch = false

const LEAD = 'lead'

// What a tool means for the person using it. People stay at their desks;
// the activity shows as an icon above them and the color of their screen's light.
function activityFor(tool) {
  const t = String(tool || '')
  if (/^(Read|Grep|Glob|LS|NotebookRead)$/.test(t)) return ['files', 'reading files']
  if (/^(Bash|BashOutput|KillShell|KillBash)$/.test(t)) return ['terminal', 'running a command']
  if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(t)) return ['edit', 'editing files']
  if (/^(WebFetch|WebSearch)$/.test(t)) return ['web', 'researching online']
  if (/^(Agent|Task)$/.test(t)) return ['plan', 'handing out work']
  if (/^TodoWrite$/.test(t)) return ['plan', 'planning']
  if (/^mcp__/.test(t)) {
    const server = t.split('__')[1] || 'an app'
    return ['app', 'using ' + server.replace(/[_-]+/g, ' ')]
  }
  return ['think', 'working']
}

const FILLER = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'for', 'to', 'with', 'in', 'on', 'at', 'from', 'into', 'all', 'new', 'page', 'pages'])
const VERBS = new Set(['build', 'write', 'create', 'make', 'add', 'fix', 'update', 'review', 'check', 'combine', 'merge', 'run', 'find', 'search', 'research', 'implement', 'design', 'draft', 'refactor', 'test', 'audit', 'analyze', 'analyse', 'investigate', 'explore', 'set', 'setup', 'migrate', 'clean', 'improve', 'polish', 'verify', 'read', 'look', 'get', 'pull', 'generate'])
function shortName(task, type) {
  const typeName = type && !/general|default/i.test(type) ? String(type) : ''
  const raw = (typeName || String(task || '')).replace(/[_-]+/g, ' ').replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/).filter(Boolean)
  let words = raw.filter((w) => !FILLER.has(w.toLowerCase()))
  // Drop a leading verb when something is left after it ("Build hero section" -> "Hero section")
  if (words.length > 1 && VERBS.has(words[0].toLowerCase())) words = words.slice(1)
  let out = ''
  for (const w of words) {
    const next = out ? out + ' ' + w : w
    if (next.length > 15) break
    out = next
  }
  out = out || (words[0] || raw[0] || 'Helper').slice(0, 15)
  return out[0].toUpperCase() + out.slice(1)
}

const agentIdOf = (e) => (e && (e.agentId || (e.agent && (e.agent.id || e.agent.agentId)))) || null
const bump = () => {
  version += 1
}

function freeSeat() {
  const taken = new Set([...agents.values()].filter((a) => !a.isLead && !a.gone && a.seat >= 0).map((a) => a.seat))
  for (let i = 0; i < DESKS.length; i++) if (!taken.has(i)) return i
  return -1
}

function makeAgent(id, now, info) {
  const isLead = id === LEAD
  const a = {
    id,
    n: isLead ? 0 : ++counter,
    isLead,
    short: isLead ? 'Claude' : info.short,
    task: isLead ? 'The main conversation' : info.task,
    ref: info.ref || null,
    status: isLead ? 'idle' : 'working',
    activity: isLead ? 'waiting for you' : 'starting',
    station: 'desk',
    desired: 'desk',
    stationSince: now,
    act: 'think',
    actWanted: 'think',
    actSince: now,
    seat: isLead ? -1 : freeSeat(),
    pos: { x: 0, y: 0 },
    from: { x: 0, y: 0 },
    path: [],
    slot: 0,
    moveAt: now,
    moveDur: 0,
    createdAt: now,
    endedAt: 0,
    exitAt: 0,
    gone: false,
    steps: 0,
    tools: 0,
  }
  if (isLead) {
    a.pos = spotFor('desk', -1, 0, true)
    a.from = { ...a.pos }
  } else {
    // Walk in through the door
    a.from = spotFor('door', -1, 0, false)
    a.pos = spotFor('desk', a.seat, 0, false)
    a.path = route(a.from, a.pos)
    a.moveDur = walkTime(a.path)
  }
  agents.set(id, a)
  bump()
  // Keep the list bounded: drop the oldest finished agents first
  if (agents.size > MAX_AGENTS) {
    const old = [...agents.values()].filter((x) => !x.isLead && x.endedAt).sort((p, q) => p.endedAt - q.endedAt)
    for (const x of old.slice(0, agents.size - MAX_AGENTS)) agents.delete(x.id)
  }
  return a
}

const AISLE_X = 2.4 // the walkway between the left-wall stations and the first desk column
const BACK_Y = 4.0 // above this line is the open area along the back walls

const near = (p, q) => Math.abs(p.x - q.x) < 0.05 && Math.abs(p.y - q.y) < 0.05
function route(from, to) {
  const path = [{ ...from }]
  const push = (pt) => {
    if (!near(path[path.length - 1], pt)) path.push(pt)
  }
  if (!(from.y < BACK_Y && to.y < BACK_Y)) {
    // Out along your own row to the aisle, along the aisle, then in along the target row
    push({ x: AISLE_X, y: from.y })
    push({ x: AISLE_X, y: to.y })
  }
  push({ ...to })
  return path
}
const pathLength = (path) => path.slice(1).reduce((n, pt, i) => n + Math.hypot(pt.x - path[i].x, pt.y - path[i].y), 0)
function walkTime(path) {
  return Math.max(500, Math.min(4200, pathLength(path) * 330))
}

// Where the person is right now, even partway through a walk (walks are constant speed)
function currentPos(a, now) {
  if (!a.moveDur || now >= a.moveAt + a.moveDur || a.path.length < 2) return { ...a.pos }
  let left = ((now - a.moveAt) / a.moveDur) * pathLength(a.path)
  for (let i = 1; i < a.path.length; i++) {
    const p = a.path[i - 1]
    const q = a.path[i]
    const seg = Math.hypot(q.x - p.x, q.y - p.y)
    if (left <= seg) {
      const t = seg ? left / seg : 1
      return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t }
    }
    left -= seg
  }
  return { ...a.pos }
}

function slotIndex(a, st) {
  const here = [...agents.values()].filter((x) => x !== a && !x.gone && x.station === st).length
  return here
}

function moveTo(a, st, now) {
  a.slot = slotIndex(a, st)
  const target = spotFor(st, a.seat, a.slot, a.isLead)
  const from = currentPos(a, now)
  a.from = from
  a.pos = target
  a.moveAt = now
  a.path = route(from, target)
  a.moveDur = near(from, target) ? 0 : walkTime(a.path)
  a.station = st
  a.desired = st
  a.stationSince = now
  bump()
}

// Change what someone is shown doing at their desk; quick bursts wait out the dwell time
function setAct(a, kind, now, force) {
  a.actWanted = kind
  if (a.act === kind) return
  if (force || now - a.actSince >= ACT_DWELL_MS) {
    a.act = kind
    a.actSince = now
    bump()
  }
}

function ensure(id, now) {
  const key = id || LEAD
  let a = agents.get(key)
  if (!a) {
    if (key === LEAD) return makeAgent(LEAD, now, {})
    const info = pending.shift() || { short: 'Helper ' + (counter + 1), task: 'A task Claude handed off', ref: null }
    a = makeAgent(key, now, info)
  } else if (a.gone || a.status === 'done' || a.status === 'stopped') {
    // Activity after finishing: bring them back
    a.status = 'working'
    a.endedAt = 0
    a.exitAt = 0
    if (a.gone) {
      a.gone = false
      a.seat = freeSeat()
      a.pos = spotFor('door', -1, 0, false)
      a.moveDur = 0
      a.station = 'door'
    }
    moveTo(a, 'desk', now)
  }
  return a
}

function finish(a, status, now) {
  if (a.isLead) return
  a.status = status
  a.activity = status === 'failed' ? 'failed' : status === 'stopped' ? 'stopped' : 'finished'
  a.endedAt = now
  if (status !== 'failed') {
    moveTo(a, 'door', now)
    a.exitAt = now + a.moveDur + EXIT_LINGER_MS
  }
  bump()
}

// Runs every second
function tick(now) {
  let changed = false
  for (const a of agents.values()) {
    if (a.gone) continue
    // Show a waiting activity once the current one has been up long enough
    if (a.actWanted !== a.act && now - a.actSince >= ACT_DWELL_MS) {
      a.act = a.actWanted
      a.actSince = now
      changed = true
    }
    // Arrival changes the pose (sitting down, for example), so redraw then
    if (a.moveDur && a.arrivedFor !== a.moveAt && now >= a.moveAt + a.moveDur) {
      a.arrivedFor = a.moveAt
      changed = true
    }
    // Gone once faded out at the door
    if (a.exitAt && now >= a.exitAt + 900) {
      a.gone = true
      changed = true
    }
  }
  // Forget finished agents after a while
  for (const a of [...agents.values()]) {
    if (!a.isLead && a.endedAt && a.gone && now - a.endedAt > KEEP_FINISHED_MS) {
      agents.delete(a.id)
      changed = true
    }
  }
  if (changed) bump()
  if (!active().length) toastedThisBatch = false
  return changed
}

const helpers = () => [...agents.values()].filter((a) => !a.isLead)
const active = () => helpers().filter((a) => a.status === 'working' || a.status === 'waiting')

function counts() {
  const h = helpers()
  return {
    working: h.filter((a) => a.status === 'working').length,
    waiting: h.filter((a) => a.status === 'waiting').length,
    done: h.filter((a) => a.status === 'done').length,
    failed: h.filter((a) => a.status === 'failed').length,
    stopped: h.filter((a) => a.status === 'stopped').length,
  }
}

function summary() {
  const c = counts()
  const parts = []
  if (c.working) parts.push(c.working + ' working')
  if (c.waiting) parts.push(c.waiting + ' waiting for you')
  if (c.done) parts.push(c.done + ' finished')
  if (c.failed) parts.push(c.failed + ' failed')
  if (c.stopped) parts.push(c.stopped + ' stopped')
  return parts.join(', ')
}

function fmtDur(ms) {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return s + 's'
  const m = Math.floor(s / 60)
  if (m < 60) return m + 'm ' + (s % 60) + 's'
  return Math.floor(m / 60) + 'h ' + (m % 60) + 'm'
}

function sceneSvg(now) {
  if (built.version === version) return built.svg
  if (built.svg && now - built.at < REBUILD_MIN_MS) return built.svg
  const people = [...agents.values()]
    .filter((a) => !a.gone)
    .sort((p, q) => p.n - q.n)
    .map((a) => ({ ...a, arrived: !a.moveDur || now >= a.moveAt + a.moveDur }))
  built = { version, at: now, svg: buildScene(people, now, false) }
  return built.svg
}

// ---------- Drawing in the panel ----------
const STATUS_COLOR = { working: 'cyan', waiting: 'yellow', done: 'green', failed: 'red', stopped: undefined, idle: undefined }
const STATUS_GLYPH = { working: '●', waiting: '●', done: '✓', failed: '✕', stopped: '■', idle: '○' }

function listRows(els, now, cols) {
  const { Box, Text } = els
  const list = [...agents.values()].sort((p, q) => (p.isLead ? -1 : q.isLead ? 1 : p.n - q.n))
  return list.map((a) => {
    const color = STATUS_COLOR[a.status]
    const time = a.isLead ? '' : fmtDur((a.endedAt || now) - a.createdAt)
    const right = [time, a.steps ? a.steps + (a.steps === 1 ? ' step' : ' steps') : ''].filter(Boolean).join(', ')
    const glyph = color ? Text({ color, children: [STATUS_GLYPH[a.status] + ' '] }) : Text({ dimColor: true, children: [STATUS_GLYPH[a.status] + ' '] })
    const width = Math.max(30, cols - 2)
    return Box({
      flexDirection: 'row',
      justifyContent: 'space-between',
      width,
      children: [
        Box({
          flexDirection: 'row',
          children: [glyph, Text({ bold: true, children: [a.short] }), Text({ dimColor: true, children: ['  ' + a.activity] })],
        }),
        Text({ dimColor: true, children: [right] }),
      ],
    })
  })
}

function paneTree($, e, now) {
  const els = $.ui.resolve(e)
  const { Box, Text, Button, Svg } = els
  const cols = (e.props && e.props.bodyColumns) || 58
  const kids = []
  const sum = summary()
  if (e.surface !== 'terminal') {
    const w = Math.max(280, Math.floor(cols * 7.6))
    const h = Math.round((w * VB_H) / VB_W)
    kids.push(Svg({ alt: 'Your agents at work in a small office', width: w, height: h, source: sceneSvg(now) }))
    kids.push(Text({ children: [' '] }))
  }
  kids.push(Text({ bold: true, children: [sum || 'No helper agents right now. Claude is at its desk.'] }))
  kids.push(...listRows(els, now, cols))
  if (helpers().some((a) => a.endedAt)) {
    kids.push(Text({ children: [' '] }))
    kids.push(
      Button({
        key: 'ao-clear',
        label: 'Clear finished',
        hotkey: 'c',
        onPress: () => {
          for (const a of [...agents.values()]) if (!a.isLead && a.endedAt) agents.delete(a.id)
          bump()
          $.ui.invalidate('ui.render')
        },
      }),
    )
  }
  return Box({ flexDirection: 'column', children: kids })
}

async function openOffice($) {
  paneOpen = true
  try {
    await $.ui.open({ id: PANE, title: 'Agent office', focus: true, closeOnEscape: true })
  } catch (err) {
    $.ui.toast('Could not open the office: ' + err)
  }
}

// ---------- Hooks ----------
export function register(on) {
  on('session.start', async ($, e, next) => {
    const now = await $.clock.now()
    if (!agents.has(LEAD)) makeAgent(LEAD, now, {})
    $.clock.every(1000, async () => {
      const t = await $.clock.now()
      const changed = tick(t)
      if (paneOpen || active().length || changed) $.ui.invalidate('ui.render')
    })
    try {
      await $.command.register({ name: 'office', description: 'agent-office: watch your agents work', immediate: true })
    } catch (err) {
      $.ui.log('could not register /office: ' + err)
    }
    return next(e)
  })

  on('command.run', { command: 'office' }, async ($) => {
    await openOffice($)
    return {}
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === PANE) paneOpen = false
    return next(e)
  })

  // Claude asked for a helper: remember its task so the next new agent gets this name
  on('agent.spawn', async ($, e, next) => {
    const id = agentIdOf(e)
    const task = e.description || e.prompt || ''
    const type = e.subagentType || e.subagent_type || e.agentType || e.type || ''
    const now = await $.clock.now()
    if (id && !agents.has(id)) {
      // Use the name Claude gave in its Agent call if one is waiting, else this event's
      const idx = pending.findIndex((p) => now - p.at < 5000)
      const info = idx >= 0 ? pending.splice(idx, 1)[0] : { short: shortName(task, type), task: task || 'A task Claude handed off', ref: null }
      makeAgent(id, now, info)
    } else if (!id && (task || type) && !pending.some((p) => now - p.at < 2000)) {
      pending.push({ short: shortName(task, type), task: task || 'A task Claude handed off', ref: null, at: now })
    }
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const now = await $.clock.now()
    const a = ensure(agentIdOf(e), now)
    const [kind, label] = activityFor(e.tool)
    a.tools += 1
    a.activity = label
    if (a.status !== 'working') {
      a.status = 'working'
      bump()
    }
    setAct(a, kind, now, false)
    let ref = null
    if (e.tool === 'Agent' || e.tool === 'Task') {
      ref = 'r' + now + '-' + Math.random().toString(36).slice(2, 6)
      const task = e.description || e.prompt || ''
      pending.push({ short: shortName(task, e.subagent_type || e.subagentType), task: task || 'A task Claude handed off', ref, at: now })
      if (!toastedThisBatch) {
        toastedThisBatch = true
        $.ui.toast('Claude is handing work to helper agents. Run /office to watch.')
      }
    }
    if (paneOpen) $.ui.invalidate('ui.render')

    const result = await next(e)

    const t = await $.clock.now()
    a.tools -= 1
    if (a.status === 'waiting') {
      a.status = 'working'
      bump()
    }
    if (a.tools <= 0) {
      a.tools = 0
      a.activity = 'thinking'
      setAct(a, 'think', t, false)
    }
    if (ref) {
      const denied = result && (result.deny || result.isError)
      const helper = helpers().find((h) => h.ref === ref)
      if (denied && helper) finish(helper, 'failed', t)
      if (denied && !helper) {
        const i = pending.findIndex((p) => p.ref === ref)
        if (i >= 0) pending.splice(i, 1)
      }
    }
    if (paneOpen) $.ui.invalidate('ui.render')
    return result
  })

  // A permission prompt: the person raises a hand until you answer
  on('tool.check', async ($, e, next) => {
    const decided = await next(e)
    const d = typeof decided === 'string' ? decided : decided && decided.decision
    if (d === 'ask') {
      const now = await $.clock.now()
      const a = ensure(agentIdOf(e), now)
      a.status = 'waiting'
      a.activity = 'waiting for your approval'
      bump()
      $.ui.invalidate('ui.render')
    }
    return decided
  })

  on('turn.start', async ($, e, next) => {
    const now = await $.clock.now()
    const a = ensure(agentIdOf(e), now)
    if (a.status !== 'working') {
      a.status = 'working'
      bump()
    }
    a.activity = 'thinking'
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const now = await $.clock.now()
    const a = ensure(agentIdOf(e), now)
    if (a.status !== 'waiting' && a.status !== 'working') {
      a.status = 'working'
      bump()
    }
    if (!a.tools) a.activity = 'thinking'
    const result = yield* next(e)
    a.steps += 1
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const now = await $.clock.now()
    const id = agentIdOf(e)
    if (id) {
      const a = agents.get(id)
      if (a) finish(a, e.isAborted ? 'stopped' : 'done', now)
    } else {
      const lead = ensure(null, now)
      lead.status = 'idle'
      lead.activity = 'waiting for you'
      lead.tools = 0
      setAct(lead, 'think', now, true)
      bump()
    }
    $.ui.invalidate('ui.render')
    return next(e)
  })

  // A small line above the prompt while helpers are around
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const h = helpers().filter((a) => !a.gone || a.status === 'failed')
    if (!h.length) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const mine = Box({
      flexDirection: 'row',
      columnGap: 3,
      children: [
        Text({ dimColor: true, children: ['agent office'] }),
        Text({ children: [summary() || 'helpers idle'] }),
        Button({ key: 'ao-open', label: 'watch', hotkey: 'w', plain: true, onPress: () => openOffice($) }),
      ],
    })
    const theirs = await next(e)
    return theirs ? Box({ flexDirection: 'column', children: [mine, theirs] }) : mine
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE) return next(e)
    paneOpen = true
    const now = await $.clock.now()
    return paneTree($, e, now)
  })
}
