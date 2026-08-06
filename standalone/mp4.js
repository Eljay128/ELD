/* Minimal ISO base media file format reader — enough to feed WebCodecs.
 *
 * This exists because the browser's own media pipeline is all-or-nothing: if its
 * demuxer will not open a QuickTime .mov, the platform's HEVC decoder never gets
 * a chance, even when it is perfectly capable. iPhone video is HEVC in .mov, so
 * that gap is the difference between the app working and not working for most
 * people. Parsing the container here and handing samples straight to
 * VideoDecoder skips the demuxer entirely.
 *
 * .mov and .mp4 are the same box structure, so one reader covers both.
 */

const FOURCC = (view, off) =>
  String.fromCharCode(view.getUint8(off), view.getUint8(off + 1), view.getUint8(off + 2), view.getUint8(off + 3));

/** Walk the boxes at [start, end), yielding {type, start, end} for each. */
function* boxes(view, start, end) {
  let off = start;
  while (off + 8 <= end) {
    let size = view.getUint32(off);
    const type = FOURCC(view, off + 4);
    let header = 8;
    if (size === 1) {
      // 64-bit size. Beyond 2^53 is not a real video file.
      const hi = view.getUint32(off + 8);
      const lo = view.getUint32(off + 12);
      size = hi * 2 ** 32 + lo;
      header = 16;
    } else if (size === 0) {
      size = end - off; // Extends to the end of its parent.
    }
    if (size < header || off + size > end) break;
    yield { type, start: off + header, end: off + size };
    off += size;
  }
}

function findBox(view, start, end, path) {
  let range = { start, end };
  for (const want of path) {
    let found = null;
    for (const box of boxes(view, range.start, range.end)) {
      if (box.type === want) { found = box; break; }
    }
    if (!found) return null;
    range = found;
  }
  return range;
}

/** Sample descriptions carry the decoder config in a child box (hvcC/avcC/vpcC). */
function parseSampleEntry(view, box) {
  // Visual sample entry: 6 reserved + 2 data_ref + 16 pre-defined/reserved +
  // 2 width + 2 height, then more fixed fields before the child boxes at +78.
  const format = null;
  const width = view.getUint16(box.start + 24);
  const height = view.getUint16(box.start + 26);
  let description = null;
  let descriptionType = null;
  for (const child of boxes(view, box.start + 78, box.end)) {
    if (['hvcC', 'avcC', 'vpcC', 'av1C'].includes(child.type)) {
      description = new Uint8Array(view.buffer, view.byteOffset + child.start, child.end - child.start).slice();
      descriptionType = child.type;
      break;
    }
  }
  return { format, width, height, description, descriptionType };
}

/** hvcC/avcC carry the profile/level bytes WebCodecs wants in the codec string. */
function codecString(entryType, desc) {
  if (entryType === 'avc1' || entryType === 'avc3') {
    if (!desc || desc.length < 4) return entryType;
    const hex = (n) => n.toString(16).padStart(2, '0');
    return `${entryType}.${hex(desc[1])}${hex(desc[2])}${hex(desc[3])}`;
  }
  if (entryType === 'hvc1' || entryType === 'hev1') {
    if (!desc || desc.length < 13) return `${entryType}.1.6.L93.B0`;
    const profileSpace = ['', 'A', 'B', 'C'][desc[1] >> 6];
    const profileIdc = desc[1] & 0x1f;
    // The codec registry wants the compatibility flags in reverse bit order,
    // which turns the stored 0x60000000 into the familiar "6".
    const stored = new DataView(desc.buffer, desc.byteOffset + 2, 4).getUint32(0);
    let compat = 0;
    for (let i = 0; i < 32; i++) compat = (compat << 1) | ((stored >>> i) & 1);
    compat >>>= 0;
    const tierFlag = (desc[1] & 0x20) ? 'H' : 'L';
    const levelIdc = desc[12];
    // Constraint bytes, trailing zeros trimmed, as the codec registry defines.
    const constraints = [];
    for (let i = 11; i >= 6; i--) {
      if (desc[i] || constraints.length) constraints.unshift(desc[i].toString(16).padStart(2, '0').toUpperCase());
    }
    return [
      `${entryType}.${profileSpace}${profileIdc}`,
      compat.toString(16).toUpperCase(),
      `${tierFlag}${levelIdc}`,
      ...constraints,
    ].join('.');
  }
  if (entryType === 'vp09') {
    // vpcC: 4-byte full-box header, then profile, level, then bit depth in the
    // high nibble of the next byte.
    if (!desc || desc.length < 7) return 'vp09.00.10.08';
    const pad = (n) => String(n).padStart(2, '0');
    return `vp09.${pad(desc[4])}.${pad(desc[5])}.${pad(desc[6] >> 4)}`;
  }
  return entryType;
}

/**
 * Read the video track's sample table into a flat, seekable index.
 * Returns null when there is no video track this code understands.
 */
export function demuxVideoTrack(buffer) {
  const view = new DataView(buffer);

  let moov = null;
  for (const box of boxes(view, 0, buffer.byteLength)) {
    if (box.type === 'moov') { moov = box; break; }
  }
  if (!moov) return null;

  for (const trak of boxes(view, moov.start, moov.end)) {
    if (trak.type !== 'trak') continue;

    const hdlr = findBox(view, trak.start, trak.end, ['mdia', 'hdlr']);
    if (!hdlr || FOURCC(view, hdlr.start + 8) !== 'vide') continue;

    const mdhd = findBox(view, trak.start, trak.end, ['mdia', 'mdhd']);
    const version = view.getUint8(mdhd.start);
    const timescale = version === 1 ? view.getUint32(mdhd.start + 20) : view.getUint32(mdhd.start + 12);

    const stbl = findBox(view, trak.start, trak.end, ['mdia', 'minf', 'stbl']);
    if (!stbl) continue;

    const get = (type) => findBox(view, stbl.start, stbl.end, [type]);

    // --- sample description
    const stsd = get('stsd');
    let entryType = null;
    let entry = null;
    for (const e of boxes(view, stsd.start + 8, stsd.end)) { entryType = e.type; entry = e; break; }
    if (!entry) continue;
    const { width, height, description, descriptionType } = parseSampleEntry(view, entry);

    // --- sizes
    const stsz = get('stsz');
    const uniform = view.getUint32(stsz.start + 4);
    const count = view.getUint32(stsz.start + 8);
    const sizes = new Uint32Array(count);
    if (uniform) sizes.fill(uniform);
    else for (let i = 0; i < count; i++) sizes[i] = view.getUint32(stsz.start + 12 + i * 4);

    // --- chunk offsets
    const stco = get('stco');
    const co64 = get('co64');
    const chunkOffsets = [];
    if (stco) {
      const n = view.getUint32(stco.start + 4);
      for (let i = 0; i < n; i++) chunkOffsets.push(view.getUint32(stco.start + 8 + i * 4));
    } else if (co64) {
      const n = view.getUint32(co64.start + 4);
      for (let i = 0; i < n; i++) {
        chunkOffsets.push(view.getUint32(co64.start + 8 + i * 8) * 2 ** 32 + view.getUint32(co64.start + 12 + i * 8));
      }
    } else continue;

    // --- sample-to-chunk, expanded to a per-sample file offset
    const stsc = get('stsc');
    const stscCount = view.getUint32(stsc.start + 4);
    const runs = [];
    for (let i = 0; i < stscCount; i++) {
      const at = stsc.start + 8 + i * 12;
      runs.push({ first: view.getUint32(at), perChunk: view.getUint32(at + 4) });
    }
    const offsets = new Float64Array(count);
    let sample = 0;
    for (let r = 0; r < runs.length && sample < count; r++) {
      const firstChunk = runs[r].first;
      const lastChunk = r + 1 < runs.length ? runs[r + 1].first - 1 : chunkOffsets.length;
      for (let chunk = firstChunk; chunk <= lastChunk && sample < count; chunk++) {
        let pos = chunkOffsets[chunk - 1];
        for (let s = 0; s < runs[r].perChunk && sample < count; s++) {
          offsets[sample] = pos;
          pos += sizes[sample];
          sample++;
        }
      }
    }

    // --- decode timestamps
    const stts = get('stts');
    const sttsCount = view.getUint32(stts.start + 4);
    const times = new Float64Array(count);
    let t = 0;
    let idx = 0;
    for (let i = 0; i < sttsCount; i++) {
      const n = view.getUint32(stts.start + 8 + i * 8);
      const delta = view.getUint32(stts.start + 12 + i * 8);
      for (let k = 0; k < n && idx < count; k++) { times[idx++] = t / timescale; t += delta; }
    }

    // --- sync samples. Absent stss means every sample is a keyframe.
    const stss = get('stss');
    const keyframes = [];
    if (stss) {
      const n = view.getUint32(stss.start + 4);
      for (let i = 0; i < n; i++) keyframes.push(view.getUint32(stss.start + 8 + i * 4) - 1);
    } else {
      for (let i = 0; i < count; i++) keyframes.push(i);
    }

    return {
      entryType,
      codec: codecString(entryType, description),
      descriptionType,
      description,
      width,
      height,
      timescale,
      count,
      duration: count ? times[count - 1] : 0,
      sizes,
      offsets,
      times,
      keyframes,
    };
  }
  return null;
}

/** Index of the last keyframe at or before `time`. */
export function keyframeBefore(track, time) {
  let best = track.keyframes[0] ?? 0;
  for (const k of track.keyframes) {
    if (track.times[k] <= time + 1e-6) best = k;
    else break;
  }
  return best;
}
