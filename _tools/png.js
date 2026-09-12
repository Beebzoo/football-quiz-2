/* Minimal PNG reader: enough to get RGBA out of a 38x59 kit diagram.
   No npm in this workspace, and the images are tiny, so decoding by hand is
   cheaper than pulling a dependency in. Handles the colour types Commons
   kit files actually use: RGBA, RGB, palette and grey(+alpha). */
const zlib = require("zlib");

function decode(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a png");
  let pos = 8, w = 0, h = 0, depth = 8, ctype = 6, interlace = 0;
  let plte = null, trns = null;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      depth = data[8]; ctype = data[9]; interlace = data[12];
    } else if (type === "PLTE") plte = data;
    else if (type === "tRNS") trns = data;
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  if (depth !== 8 || interlace !== 0) throw new Error("unsupported png (depth " + depth + ", interlace " + interlace + ")");
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const CH = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ctype];
  if (!CH) throw new Error("unsupported colour type " + ctype);
  const stride = w * CH;
  const out = Buffer.alloc(h * stride);

  // undo the per-scanline filter
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= CH ? cur[i - CH] : 0, b = prev[i], c = i >= CH ? prev[i - CH] : 0;
      let v = line[i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      cur[i] = v & 255;
    }
  }

  // expand whatever we got into straight RGBA
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0, n = w * h; i < n; i++) {
    let r, g, b, a = 255;
    const s = i * CH;
    if (ctype === 6) { r = out[s]; g = out[s + 1]; b = out[s + 2]; a = out[s + 3]; }
    else if (ctype === 2) { r = out[s]; g = out[s + 1]; b = out[s + 2]; }
    else if (ctype === 0) { r = g = b = out[s]; }
    else if (ctype === 4) { r = g = b = out[s]; a = out[s + 1]; }
    else { const ix = out[s]; r = plte[ix * 3]; g = plte[ix * 3 + 1]; b = plte[ix * 3 + 2]; a = trns && ix < trns.length ? trns[ix] : 255; }
    rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = a;
  }
  return { w, h, rgba };
}

module.exports = { decode };
