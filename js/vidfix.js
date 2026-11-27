/* 修视频时长：MediaRecorder 录出来的文件，很多相册 / 播放器 / 微信读到的时长是 0 秒。
 *
 * - MP4（Chrome、Safari）：录出来的是「分片 MP4」（moof + mdat），总时长要播放器自己去数；
 *   Chrome 还把每条轨道 mdhd 里的时长按毫秒写、却标着轨道自己的时间单位（视频 30000/秒、音频 48000/秒），
 *   安卓相册等读 mdhd 的播放器就算成 0.2 秒左右，显示 0 秒。
 *   这里把它重新封装成普通 MP4：moov 在最前面、带完整采样表和正确时长，音视频数据原样搬过去，不重新编码。
 * - WebM（录不了 MP4 的浏览器）：文件里根本没写时长，这里补上 Info › Duration。
 *
 * 任何一步认不出来或出错，都返回原文件，不影响保存。 */
(function () {
  'use strict';

  function str4(u8, p) { return String.fromCharCode(u8[p], u8[p + 1], u8[p + 2], u8[p + 3]); }

  function ascii(s) {
    var out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }

  function concat(parts) {
    var n = 0, i;
    for (i = 0; i < parts.length; i++) n += parts[i].length;
    var out = new Uint8Array(n), o = 0;
    for (i = 0; i < parts.length; i++) { out.set(parts[i], o); o += parts[i].length; }
    return out;
  }

  /* ================= MP4 ================= */

  function Reader(u8) {
    this.u8 = u8;
    this.dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  }
  Reader.prototype.u32 = function (p) { return this.dv.getUint32(p); };
  Reader.prototype.i32 = function (p) { return this.dv.getInt32(p); };
  Reader.prototype.u64 = function (p) { return this.dv.getUint32(p) * 4294967296 + this.dv.getUint32(p + 4); };
  Reader.prototype.boxes = function (start, end) {
    var list = [], p = start;
    while (p + 8 <= end) {
      var size = this.u32(p), hdr = 8;
      if (size === 1) { size = this.u64(p + 8); hdr = 16; }
      else if (size === 0) size = end - p;
      if (size < hdr || p + size > end) throw new Error('mp4: bad box');
      list.push({ type: str4(this.u8, p + 4), start: p, body: p + hdr, end: p + size });
      p += size;
    }
    return list;
  };
  Reader.prototype.kids = function (b) { return this.boxes(b.body, b.end); };
  Reader.prototype.raw = function (b) { return this.u8.subarray(b.start, b.end); };

  function pick(list, type) {
    for (var i = 0; i < list.length; i++) if (list[i].type === type) return list[i];
    return null;
  }
  function pickAll(list, type) { return list.filter(function (b) { return b.type === type; }); }

  function box(type, parts) {
    var body = concat(parts), out = new Uint8Array(8 + body.length);
    new DataView(out.buffer).setUint32(0, out.length);
    out.set(ascii(type), 4);
    out.set(body, 8);
    return out;
  }
  function fullBox(type, version, flags, parts) {
    var head = new Uint8Array([version, flags >> 16 & 255, flags >> 8 & 255, flags & 255]);
    return box(type, [head].concat(parts));
  }
  function u32s(arr) {
    var out = new Uint8Array(arr.length * 4), dv = new DataView(out.buffer);
    for (var i = 0; i < arr.length; i++) dv.setUint32(i * 4, arr[i] >>> 0);
    return out;
  }
  /* [[a, b], [c, d]] → [a, b, c, d] */
  function flat(rows) { return [].concat.apply([], rows); }
  /* 连续相同的值合并成 [次数, 值]（stts / ctts 用） */
  function runs(values) {
    var out = [];
    values.forEach(function (v) {
      if (out.length && out[out.length - 1][1] === v) out[out.length - 1][0]++;
      else out.push([1, v]);
    });
    return out;
  }

  /* mvhd / mdhd 的 timescale；version 0 是 32 位字段，version 1 是 64 位 */
  function timescaleOf(R, b) { return R.u32(b.body + (R.u8[b.body] ? 20 : 12)); }
  /* 复制 mvhd / mdhd / tkhd，并把 duration 改成 dur */
  function withDuration(R, b, dur) {
    var out = R.raw(b).slice(), dv = new DataView(out.buffer);
    var body = b.body - b.start, v = out[body];
    var at = body + (b.type === 'tkhd' ? (v ? 28 : 20) : (v ? 24 : 16));
    if (v) { dv.setUint32(at, Math.floor(dur / 4294967296)); dv.setUint32(at + 4, dur >>> 0); }
    else dv.setUint32(at, Math.min(dur, 0xffffffff));
    return out;
  }

  function fixMp4(u8) {
    var R = new Reader(u8);
    var top = R.boxes(0, u8.length);
    var moov = pick(top, 'moov'), moofs = pickAll(top, 'moof');
    if (!moov || !moofs.length) return null; /* 已经是普通 MP4，不用动 */

    var mk = R.kids(moov);
    var mvhd = pick(mk, 'mvhd');
    if (!mvhd) throw new Error('mp4: no mvhd');
    var mvTs = timescaleOf(R, mvhd);

    var tracks = [], byId = {};
    pickAll(mk, 'trak').forEach(function (trak) {
      var tk = R.kids(trak), tkhd = pick(tk, 'tkhd'), mdia = pick(tk, 'mdia');
      if (!tkhd || !mdia) throw new Error('mp4: bad trak');
      var md = R.kids(mdia), mdhd = pick(md, 'mdhd'), minf = pick(md, 'minf');
      if (!mdhd || !minf) throw new Error('mp4: bad mdia');
      var mi = R.kids(minf), stbl = pick(mi, 'stbl');
      var stsd = stbl && pick(R.kids(stbl), 'stsd');
      if (!stsd) throw new Error('mp4: no stsd');
      var t = {
        trak: trak, tk: tk, md: md, mi: mi, stsd: stsd,
        id: R.u32(tkhd.body + (u8[tkhd.body] ? 20 : 12)),
        ts: timescaleOf(R, mdhd),
        def: { dur: 0, size: 0, flags: 0 },
        start: null, samples: []
      };
      tracks.push(t);
      byId[t.id] = t;
    });
    var mvex = pick(mk, 'mvex');
    if (mvex) pickAll(R.kids(mvex), 'trex').forEach(function (x) {
      var t = byId[R.u32(x.body + 4)];
      if (t) t.def = { dur: R.u32(x.body + 12), size: R.u32(x.body + 16), flags: R.u32(x.body + 20) };
    });

    /* 逐个分片读出每个采样：在文件里的位置、大小、时长、是不是关键帧、显示时间偏移 */
    moofs.forEach(function (moof) {
      var dataEnd = moof.start;
      pickAll(R.kids(moof), 'traf').forEach(function (traf) {
        var kids = R.kids(traf), tfhd = pick(kids, 'tfhd');
        if (!tfhd) throw new Error('mp4: no tfhd');
        var f = R.u32(tfhd.body) & 0xffffff, t = byId[R.u32(tfhd.body + 4)], o = tfhd.body + 8;
        if (!t) throw new Error('mp4: unknown track');
        var base = (f & 0x1) ? R.u64(o) : (f & 0x20000) ? moof.start : dataEnd;
        if (f & 0x1) o += 8;
        if (f & 0x2) o += 4;
        var dDur = t.def.dur, dSize = t.def.size, dFlags = t.def.flags;
        if (f & 0x8) { dDur = R.u32(o); o += 4; }
        if (f & 0x10) { dSize = R.u32(o); o += 4; }
        if (f & 0x20) { dFlags = R.u32(o); o += 4; }
        var tfdt = pick(kids, 'tfdt');
        if (tfdt && t.start === null) t.start = u8[tfdt.body] ? R.u64(tfdt.body + 4) : R.u32(tfdt.body + 4);

        var cursor = base;
        pickAll(kids, 'trun').forEach(function (trun) {
          var v = u8[trun.body], rf = R.u32(trun.body) & 0xffffff, n = R.u32(trun.body + 4), q = trun.body + 8;
          if (rf & 0x1) { cursor = base + R.i32(q); q += 4; }
          var first = null;
          if (rf & 0x4) { first = R.u32(q); q += 4; }
          for (var i = 0; i < n; i++) {
            var dur = dDur, size = dSize, flags = (i === 0 && first !== null) ? first : dFlags, cto = 0;
            if (rf & 0x100) { dur = R.u32(q); q += 4; }
            if (rf & 0x200) { size = R.u32(q); q += 4; }
            if (rf & 0x400) { flags = R.u32(q); q += 4; }
            if (rf & 0x800) { cto = v ? R.i32(q) : R.u32(q); q += 4; }
            if (cursor + size > u8.length) throw new Error('mp4: sample out of range');
            t.samples.push({ off: cursor, size: size, dur: dur, sync: !(flags & 0x10000), cto: cto });
            cursor += size;
          }
        });
        dataEnd = cursor;
      });
    });

    tracks = tracks.filter(function (t) { return t.samples.length; });
    if (!tracks.length) throw new Error('mp4: no samples');
    var trackOf = {};
    tracks.forEach(function (t) { trackOf[t.trak.start] = t; });

    /* 每条轨道按 0.5 秒切块，块按时间交错写进 mdat，边下边播也顺 */
    var chunks = [], movieDur = 0;
    tracks.forEach(function (t, ti) {
      var time = 0, cur = null;
      t.start = t.start || 0;
      t.chunks = [];
      t.samples.forEach(function (s) {
        if (!cur || time - cur.time >= t.ts / 2) {
          cur = { time: time, sec: (t.start + time) / t.ts, ti: ti, samples: [], size: 0, offset: 0 };
          t.chunks.push(cur);
          chunks.push(cur);
        }
        cur.samples.push(s);
        cur.size += s.size;
        time += s.dur;
      });
      t.mediaDur = time;
      t.lead = Math.round(t.start * mvTs / t.ts);        /* 轨道开头的空白，movie 时间单位 */
      t.movieDur = Math.round(time * mvTs / t.ts);
      movieDur = Math.max(movieDur, t.lead + t.movieDur);
    });
    if (!movieDur) throw new Error('mp4: zero duration');
    chunks.sort(function (a, b) { return a.sec - b.sec || a.ti - b.ti; });

    function stbl(t) {
      var s = t.samples;
      var parts = [R.raw(t.stsd)];
      var stts = runs(s.map(function (x) { return x.dur; }));
      parts.push(fullBox('stts', 0, 0, [u32s([stts.length].concat(flat(stts)))]));
      if (s.some(function (x) { return x.cto; })) {
        var ctts = runs(s.map(function (x) { return x.cto; }));
        var neg = s.some(function (x) { return x.cto < 0; });
        parts.push(fullBox('ctts', neg ? 1 : 0, 0, [u32s([ctts.length].concat(flat(ctts)))]));
      }
      if (!s.every(function (x) { return x.sync; })) {
        var keys = [];
        s.forEach(function (x, i) { if (x.sync) keys.push(i + 1); });
        parts.push(fullBox('stss', 0, 0, [u32s([keys.length].concat(keys))]));
      }
      var stsc = [];
      t.chunks.forEach(function (c, k) {
        if (!stsc.length || stsc[stsc.length - 1][1] !== c.samples.length) stsc.push([k + 1, c.samples.length, 1]);
      });
      parts.push(fullBox('stsc', 0, 0, [u32s([stsc.length].concat(flat(stsc)))]));
      parts.push(fullBox('stsz', 0, 0, [u32s([0, s.length].concat(s.map(function (x) { return x.size; })))]));
      parts.push(fullBox('stco', 0, 0, [u32s([t.chunks.length].concat(t.chunks.map(function (c) { return c.offset; })))]));
      return box('stbl', parts);
    }

    function trak(t) {
      var mi = t.mi.map(function (b) { return b.type === 'stbl' ? stbl(t) : R.raw(b); });
      var md = t.md.map(function (b) {
        if (b.type === 'mdhd') return withDuration(R, b, t.mediaDur);
        if (b.type === 'minf') return box('minf', mi);
        return R.raw(b);
      });
      var hasEdts = !!pick(t.tk, 'edts'), parts = [];
      t.tk.forEach(function (b) {
        if (b.type === 'tkhd') {
          parts.push(withDuration(R, b, t.lead + t.movieDur));
          if (!hasEdts && t.lead) {
            /* 开头空一段再播（音视频起点不一样时保持对齐） */
            parts.push(box('edts', [fullBox('elst', 0, 0, [u32s([2, t.lead, -1, 0x10000, t.movieDur, 0, 0x10000])])]));
          }
        } else if (b.type === 'mdia') parts.push(box('mdia', md));
        else parts.push(R.raw(b));
      });
      return box('trak', parts);
    }

    function buildMoov() {
      var parts = [];
      mk.forEach(function (b) {
        if (b.type === 'mvhd') parts.push(withDuration(R, b, movieDur));
        else if (b.type === 'trak') { if (trackOf[b.start]) parts.push(trak(trackOf[b.start])); }
        else if (b.type !== 'mvex') parts.push(R.raw(b));
      });
      return box('moov', parts);
    }

    var ftyp = box('ftyp', [ascii('isom'), u32s([0x200]), ascii('isomiso2avc1mp41')]);
    /* 先按 0 偏移排一次量出 moov 多大，再填真实偏移（stco 每项定长，大小不变） */
    var pos = ftyp.length + buildMoov().length + 8, dataStart = pos;
    chunks.forEach(function (c) { c.offset = pos; pos += c.size; });
    if (pos > 0xffffffff) throw new Error('mp4: too big');
    var moovBox = buildMoov();
    if (ftyp.length + moovBox.length + 8 !== dataStart) throw new Error('mp4: layout');

    var out = new Uint8Array(pos), o = 0;
    out.set(ftyp, o); o += ftyp.length;
    out.set(moovBox, o); o += moovBox.length;
    new DataView(out.buffer).setUint32(o, pos - o);
    out.set(ascii('mdat'), o + 4); o += 8;
    chunks.forEach(function (c) {
      c.samples.forEach(function (s) { out.set(u8.subarray(s.off, s.off + s.size), o); o += s.size; });
    });
    return out;
  }

  /* ================= WebM ================= */

  /* EBML 变长整数：长度由首字节前导 0 决定；数值位全 1 表示「大小未知」 */
  function vint(u8, p) {
    var b = u8[p], len = 1, mask = 0x80;
    while (len <= 8 && !(b & mask)) { len++; mask >>= 1; }
    if (len > 8 || p + len > u8.length) throw new Error('webm: bad vint');
    var v = b & (mask - 1), ones = v === mask - 1;
    for (var i = 1; i < len; i++) { v = v * 256 + u8[p + i]; if (u8[p + i] !== 255) ones = false; }
    return { len: len, value: v, unknown: ones };
  }
  /* 元素 ID 保留标记位，按原字节读 */
  function ebmlId(u8, p) {
    var len = vint(u8, p).len, id = 0;
    for (var i = 0; i < len; i++) id = id * 256 + u8[p + i];
    return { len: len, id: id };
  }
  function size8(n) {
    var out = new Uint8Array(8);
    out[0] = 1;
    for (var i = 7; i >= 1; i--) { out[i] = n % 256; n = Math.floor(n / 256); }
    return out;
  }

  function fixWebm(u8, ms) {
    var head = ebmlId(u8, 0);
    if (head.id !== 0x1A45DFA3) return null;
    var hs = vint(u8, head.len), p = head.len + hs.len + hs.value;
    var segId = ebmlId(u8, p);
    if (segId.id !== 0x18538067) return null;
    var segSizeAt = p + segId.len, seg = vint(u8, segSizeAt), segData = segSizeAt + seg.len;
    var segEnd = seg.unknown ? u8.length : Math.min(u8.length, segData + seg.value);

    var info = null, q = segData;
    while (q < segEnd) {
      var cid = ebmlId(u8, q), cs = vint(u8, q + cid.len);
      if (cid.id === 0x114D9B74) return null; /* 有 SeekHead：插字节会让它记的位置错开，不动 */
      if (cid.id === 0x1F43B675) break;       /* 到 Cluster 了还没 Info */
      if (cid.id === 0x1549A966) { info = { at: q, idLen: cid.len, sizeLen: cs.len, data: q + cid.len + cs.len, size: cs.value }; break; }
      if (cs.unknown) return null;
      q += cid.len + cs.len + cs.value;
    }
    if (!info) return null;

    var scale = 1000000, durAt = -1, durLen = 0, infoEnd = info.data + info.size, r = info.data;
    while (r < infoEnd) {
      var eid = ebmlId(u8, r), es = vint(u8, r + eid.len), ed = r + eid.len + es.len;
      if (eid.id === 0x2AD7B1) { scale = 0; for (var k = 0; k < es.value; k++) scale = scale * 256 + u8[ed + k]; }
      if (eid.id === 0x4489) { durAt = ed; durLen = es.value; }
      r = ed + es.value;
    }
    var dur = ms * 1e6 / (scale || 1000000);

    if (durAt >= 0) {
      var dv0 = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
      var old = durLen === 8 ? dv0.getFloat64(durAt) : durLen === 4 ? dv0.getFloat32(durAt) : NaN;
      if (old > 0) return null;               /* 已经有正常时长 */
      if (durLen !== 8 && durLen !== 4) return null;
      var copy = u8.slice(), dv = new DataView(copy.buffer);
      if (durLen === 8) dv.setFloat64(durAt, dur); else dv.setFloat32(durAt, dur);
      return copy;
    }

    var durEl = new Uint8Array(11);
    durEl[0] = 0x44; durEl[1] = 0x89; durEl[2] = 0x88;
    new DataView(durEl.buffer).setFloat64(3, dur);
    var grow = (8 - info.sizeLen) + durEl.length;
    return concat([
      u8.subarray(0, segSizeAt),
      seg.unknown ? u8.subarray(segSizeAt, segData) : size8(seg.value + grow),
      u8.subarray(segData, info.at + info.idLen),
      size8(info.size + durEl.length),
      u8.subarray(info.data, infoEnd),
      durEl,
      u8.subarray(infoEnd)
    ]);
  }

  /* ================= 入口 ================= */

  function readBlob(blob) {
    if (blob.arrayBuffer) return blob.arrayBuffer();
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = function () { reject(fr.error); };
      fr.readAsArrayBuffer(blob);
    });
  }

  /* blob：MediaRecorder 的结果；ms：实际录了多久（WebM 没有别的办法知道总时长） */
  function fix(blob, ms) {
    return readBlob(blob).then(function (buf) {
      var u8 = new Uint8Array(buf), out = null;
      if (u8.length > 8 && str4(u8, 4) === 'ftyp') out = fixMp4(u8);
      else if (u8.length > 4 && u8[0] === 0x1A && u8[1] === 0x45 && u8[2] === 0xDF && u8[3] === 0xA3) out = fixWebm(u8, ms);
      return out ? new Blob([out], { type: blob.type }) : blob;
    }).catch(function (e) {
      if (window.console) console.warn('[vidfix] 保留原文件：', e && e.message);
      return blob;
    });
  }

  window.VidFix = { fix: fix, fixMp4: fixMp4, fixWebm: fixWebm };
})();
