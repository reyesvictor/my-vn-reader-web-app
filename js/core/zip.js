// Minimal ZIP reader using the browser's native DecompressionStream. No library.
export async function unzip(buffer) {
  const dv = new DataView(buffer), u8 = new Uint8Array(buffer), dec = new TextDecoder();
  let eocd = -1;
  for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a ZIP/EPUB file');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const entries = new Map();
  for (let k = 0; k < count; k++) {
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
    const off = dv.getUint32(p + 42, true);
    entries.set(dec.decode(u8.subarray(p + 46, p + 46 + nl)), { method, csize, off });
    p += 46 + nl + xl + cl;
  }

  async function bytes(name) {
    const e = entries.get(name);
    if (!e) return null;
    const start = e.off + 30 + dv.getUint16(e.off + 26, true) + dv.getUint16(e.off + 28, true);
    const data = u8.subarray(start, start + e.csize);
    if (e.method === 0) return data;
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  return {
    has: name => entries.has(name),
    names: () => [...entries.keys()],
    bytes,
    text: async name => { const b = await bytes(name); return b ? dec.decode(b) : null; },
  };
}
