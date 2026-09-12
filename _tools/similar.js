/* Guess the Kit only works if two shirts can be told apart. A plain red
   Bayern and a plain red Manchester United are the same question with two
   answers, which is worse than no question. This scores every kit against
   every other on a coarse colour signature and reports the collisions. */
const { decode } = require("./png.js");
const fs = require("fs");

// 6x9 grid of average colour: coarse enough to ignore shading, fine enough
// to separate stripes from hoops from plain
function signature(buf) {
  const p = decode(buf);
  const GX = 6, GY = 9, sig = [];
  for (let gy = 0; gy < GY; gy++) for (let gx = 0; gx < GX; gx++) {
    let r = 0, g = 0, b = 0, n = 0;
    const x0 = Math.floor(gx * p.w / GX), x1 = Math.floor((gx + 1) * p.w / GX);
    const y0 = Math.floor(gy * p.h / GY), y1 = Math.floor((gy + 1) * p.h / GY);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = (y * p.w + x) * 4;
      if (p.rgba[i + 3] < 128) continue;
      r += p.rgba[i]; g += p.rgba[i + 1]; b += p.rgba[i + 2]; n++;
    }
    sig.push(n ? [r / n, g / n, b / n] : [-1, -1, -1]);
  }
  return sig;
}
// mean per-cell distance, 0 = identical
function distance(a, b) {
  let sum = 0, n = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i][0] < 0 || b[i][0] < 0) continue;
    sum += Math.hypot(a[i][0] - b[i][0], a[i][1] - b[i][1], a[i][2] - b[i][2]); n++;
  }
  return n ? sum / n : 999;
}
// how much variation within the shirt: low = a flat block of colour
function plainness(sig) {
  const live = sig.filter(c => c[0] >= 0);
  const m = [0, 1, 2].map(k => live.reduce((s, c) => s + c[k], 0) / live.length);
  return live.reduce((s, c) => s + Math.hypot(c[0] - m[0], c[1] - m[1], c[2] - m[2]), 0) / live.length;
}

module.exports = { signature, distance, plainness };

if (require.main === module) {
  const K = "c:/dev/_Personal/Hobbies/Football Quiz/assets/kits/";
  const bank = require(K + "index.json");
  const all = [].concat(...Object.entries(bank).map(([t, rows]) => rows.map(r => ({ ...r, tier: t }))));
  const sigs = all.map(k => ({ ...k, sig: signature(fs.readFileSync(K + k.s + ".png")) }));

  console.log("flattest shirts in the current deck (a plain block of colour):");
  sigs.map(k => ({ n: k.n, tier: k.tier, p: plainness(k.sig) })).sort((a, b) => a.p - b.p)
    .slice(0, 10).forEach(k => console.log(`  ${k.p.toFixed(1).padStart(5)}  ${k.n} (${k.tier})`));

  const pairs = [];
  for (let i = 0; i < sigs.length; i++) for (let j = i + 1; j < sigs.length; j++)
    pairs.push({ a: sigs[i], b: sigs[j], d: distance(sigs[i].sig, sigs[j].sig) });
  pairs.sort((x, y) => x.d - y.d);
  console.log("\nclosest pairs in the current deck (low = hard to tell apart):");
  pairs.slice(0, 12).forEach(p => console.log(`  ${p.d.toFixed(1).padStart(5)}  ${p.a.n} (${p.a.tier})  vs  ${p.b.n} (${p.b.tier})`));
}
