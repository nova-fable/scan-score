/// MusicXML 归一化：把被 OMR 拆散的多个 <part> 合并成单 part。
///
/// 背景：Audiveris 经常把一页钢琴谱识别成多个 part（如 `Voice` + `LH`），
/// 而 alphaTab 把每个 part 当作独立音轨、**按顺序排成各自的系统**——
/// 结果页面顶部全是那条"几乎全空"的音轨，真正的音乐被排到很下面，
/// 播放却两条音轨一起发声，于是出现"页面上看不到内容但播放正常"。
///
/// 合并后是一个 track 带多行谱表（一轨多行），谱表回到同一系统里，
/// 页面从第一小节就能看到内容。全休止（0 个音符）的 part 直接丢掉。
///
/// 合并时有三件事绝不能丢，丢了就是静默错音：
/// 1. 速度标记（`<direction>` / `<sound tempo>`）——常只写在某个 part 里，
///    丢掉会让 alphaTab 回落到默认 120 BPM（实测 52 → 120，听起来"快了一倍多"）
/// 2. `<divisions>` 不一致时要换算时值，否则音符时长按错误单位解读
/// 3. 中途的谱号变更（`<attributes><clef>`），否则后半段谱表用错谱号

const CHILD = (el: Element, name: string) =>
  Array.from(el.children).filter((c) => c.localName === name);

const num = (v: string | null | undefined) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/// part 的谱表数：首小节 <attributes><staves>，缺省 1
function staffCount(part: Element): number {
  const first = CHILD(part, "measure")[0];
  const attrs = first && CHILD(first, "attributes")[0];
  const staves = attrs && CHILD(attrs, "staves")[0];
  const n = num(staves?.textContent);
  return n > 0 ? n : 1;
}

/// 逐小节的 divisions（`<attributes>` 里没写就沿用上一小节）
function divisionsTimeline(part: Element): number[] {
  const out: number[] = [];
  let current = 1;
  for (const measure of CHILD(part, "measure")) {
    const attrs = CHILD(measure, "attributes")[0];
    const d = attrs ? num(CHILD(attrs, "divisions")[0]?.textContent) : 0;
    if (d > 0) current = d;
    out.push(current);
  }
  return out;
}

/// 该小节第一段（第一个 <backup> 之前）的时值总和，用作回到小节线的 backup 距离
function measureDuration(measure: Element): number {
  let total = 0;
  for (const c of Array.from(measure.children)) {
    if (c.localName === "backup") break;
    if (c.localName === "note" || c.localName === "forward") {
      total += num(CHILD(c, "duration")[0]?.textContent);
    }
  }
  return total;
}

/// part 里除休止符外还有没有音符（纯休止的 part 是 OMR 造出来的空谱表）
function hasNotes(part: Element): boolean {
  for (const note of Array.from(part.getElementsByTagName("note"))) {
    if (!CHILD(note, "rest").length) return true;
  }
  return false;
}

/// 实音符数（用来挑"真正承载音乐"的那条 part）
function noteCount(part: Element): number {
  let n = 0;
  for (const note of Array.from(part.getElementsByTagName("note"))) {
    if (!CHILD(note, "rest").length) n++;
  }
  return n;
}

/// 该元素子树里声明过的速度值（`<sound tempo>`），用于避免重复添加同一个速度标记
function tempoValues(el: Element): string[] {
  return Array.from(el.getElementsByTagName("sound"))
    .map((s) => s.getAttribute("tempo"))
    .filter((v): v is string => !!v);
}

/// 递归改写元素内所有 <staff> 编号（含 <direction> 里的）
function offsetStaff(el: Element, offset: number, doc: Document, defaultStaff: boolean) {
  const staves = Array.from(el.getElementsByTagName("staff"));
  if (staves.length === 0) {
    if (defaultStaff) {
      const s = doc.createElement("staff");
      s.textContent = String(offset + 1);
      el.appendChild(s);
    }
    return;
  }
  for (const s of staves) s.textContent = String(num(s.textContent) + offset);
}

/// 多 part 合并（原地修改 doc）。不适用（单 part / 小节数不一致）返回 false
function mergeParts(doc: Document, root: Element): boolean {
  const allParts = CHILD(root, "part");
  if (allParts.length < 2) return false;

  // 纯休止的 part 是噪声，直接排除；剩下的仍需合并
  const parts = allParts.filter(hasNotes);
  if (parts.length < 2) return false;

  // 必须在合并前算：合并会把后续 part 的音符搬进首 part，之后再数就数不出"谁才是主体"
  const mainPartId = parts.reduce((a, b) => (noteCount(b) > noteCount(a) ? b : a)).getAttribute("id");

  const merged = parts[0];
  const measureCount = CHILD(merged, "measure").length;
  if (parts.some((p) => CHILD(p, "measure").length !== measureCount)) return false;

  // 先取各 part 的谱表数与 divisions：后面会把首 part 的 <staves> 改写成总数，
  // 改完再读就会重复累加（踩过：音符全跑到第 4、5 行谱表）
  const stavesByPart = parts.map(staffCount);
  const totalStaves = stavesByPart.reduce((n, v) => n + v, 0);
  const mergedDivs = divisionsTimeline(merged);

  // 首小节 attributes：谱表总数改成合并后的值，并补上后续 part 的谱号（编号顺延）
  const firstMeasure = CHILD(merged, "measure")[0];
  const attrs = firstMeasure && CHILD(firstMeasure, "attributes")[0];
  if (attrs) {
    const stavesEl = CHILD(attrs, "staves")[0];
    if (stavesEl) stavesEl.textContent = String(totalStaves);
    else {
      const el = doc.createElement("staves");
      el.textContent = String(totalStaves);
      attrs.appendChild(el);
    }
  }

  let staffOffset = stavesByPart[0];
  for (const [pi, part] of parts.slice(1).entries()) {
    const measures = CHILD(part, "measure");
    const partDivs = divisionsTimeline(part);
    const partAttrs = CHILD(measures[0], "attributes")[0];

    if (attrs && partAttrs) {
      for (const clef of CHILD(partAttrs, "clef")) {
        const clone = clef.cloneNode(true) as Element;
        clone.setAttribute("number", String(num(clef.getAttribute("number") ?? "1") + staffOffset));
        attrs.appendChild(clone);
      }
    }

    let lastDuration = 0;
    measures.forEach((pm, i) => {
      const mm = CHILD(merged, "measure")[i];
      if (!mm) return;

      // divisions 不同就换算时值（同一份谱通常相同，这里只做保险）
      const ratio = mergedDivs[i] > 0 ? mergedDivs[i] / (partDivs[i] || 1) : 1;
      const scale = (d: number) => (ratio === 1 ? d : Math.max(1, Math.round(d * ratio)));

      // 中途的谱号变更：只搬 <clef>，插到本小节最前（attributes 必须在音符之前）
      const midAttrs = CHILD(pm, "attributes")[0];
      if (midAttrs && i > 0) {
        const clefs = CHILD(midAttrs, "clef");
        if (clefs.length) {
          const clone = doc.createElement("attributes");
          for (const clef of clefs) {
            const c = clef.cloneNode(true) as Element;
            c.setAttribute("number", String(num(clef.getAttribute("number") ?? "1") + staffOffset));
            clone.appendChild(c);
          }
          mm.insertBefore(clone, mm.firstChild);
        }
      }

      // 回到本小节开头，再接着写这一 part 的内容（MusicXML 的多谱表靠 backup 叠时间轴）
      const duration = scale(measureDuration(pm) || lastDuration);
      lastDuration = duration;
      if (duration > 0) {
        const backup = doc.createElement("backup");
        const d = doc.createElement("duration");
        d.textContent = String(duration);
        backup.appendChild(d);
        mm.appendChild(backup);
      }

      const existingTempos = new Set(tempoValues(mm));
      for (const child of Array.from(pm.children)) {
        const tag = child.localName;
        // 版面元素留给第一个 part；attributes 已单独处理
        if (tag === "print" || tag === "attributes" || tag === "barline") continue;

        // 速度标记必须保留（常常只写在某个 part 里），但同一个速度不重复添加
        if (tag === "direction" || tag === "sound") {
          const tempos = tempoValues(child);
          if (tempos.length && tempos.every((t) => existingTempos.has(t))) continue;
          const clone = child.cloneNode(true) as Element;
          if (tag === "direction") {
            const isTempo = tempos.length > 0 || clone.getElementsByTagName("metronome").length > 0;
            // 速度标记归到第一行谱表（合并后 staff 1），与常规排版一致；
            // 其余方向（力度等）按谱表顺延，别把 LH 的力度记号搬到第一行
            if (isTempo) for (const s of Array.from(clone.getElementsByTagName("staff"))) s.remove();
            else offsetStaff(clone, staffOffset, doc, true);
          }
          mm.appendChild(clone);
          tempos.forEach((t) => existingTempos.add(t));
          continue;
        }

        const clone = child.cloneNode(true) as Element;
        if (tag === "note" || tag === "forward") {
          const d = CHILD(clone, "duration")[0];
          if (d) d.textContent = String(scale(num(d.textContent)));
          offsetStaff(clone, staffOffset, doc, tag === "note");
        } else if (tag === "backup") {
          const d = CHILD(clone, "duration")[0];
          if (d) d.textContent = String(scale(num(d.textContent)));
        }
        mm.appendChild(clone);
      }
    });

    staffOffset += stavesByPart[pi + 1];
  }

  for (const part of allParts) if (part !== merged) part.remove();

  // 音色：合并后只剩一条音轨，只能用一个乐器。用音符最多那条 part 的——
  // Audiveris 常把第一个 part 标成 Voice Oohs（program 54），
  // 沿用第一条会让整首曲子用人声合唱发声（实测"音色奇怪"就是这么来的）。
  const partList = CHILD(root, "part-list")[0];
  if (partList) {
    const scoreParts = CHILD(partList, "score-part");
    const firstScorePart = scoreParts[0];
    const mainScorePart = scoreParts.find((sp) => sp.getAttribute("id") === mainPartId);
    const mergedId = merged.getAttribute("id");

    if (firstScorePart && mainScorePart && mainScorePart !== firstScorePart && mergedId) {
      const mainId = mainScorePart.getAttribute("id");
      for (const tag of ["score-instrument", "midi-instrument"]) {
        for (const el of CHILD(firstScorePart, tag)) el.remove();
        for (const el of CHILD(mainScorePart, tag)) {
          const clone = el.cloneNode(true) as Element;
          const id = clone.getAttribute("id");
          if (id && mainId) clone.setAttribute("id", id.replace(mainId, mergedId));
          firstScorePart.appendChild(clone);
        }
      }
    }

    scoreParts.slice(1).forEach((sp) => sp.remove());

    // 轨道名：合并后只剩一条音轨，OMR 给的名字（Voice / LH）已经不能描述它，
    // 清空后播放条落到"轨道 1"的兜底文案（`<part-name>` 保留但置空，schema 要求它存在）
    if (firstScorePart) {
      for (const tag of ["part-name", "part-abbreviation"]) {
        for (const el of CHILD(firstScorePart, tag)) el.textContent = "";
      }
    }
  }

  return true;
}

/// 速度兜底：Audiveris 常把「♩=72」当普通文字导出（`<words>72</words>`），没有
/// `<metronome>` / `<sound tempo>`，alphaTab 就会用默认 120 BPM（实测 72 → 120，听感快一倍多）。
/// 把开头两小节里形如纯数字的速度文字补成真正的 tempo —— 数字来自谱面本身，不是猜的。
function ensureTempo(doc: Document, root: Element): boolean {
  const hasTempo =
    Array.from(doc.getElementsByTagName("sound")).some((s) => s.getAttribute("tempo")) ||
    doc.getElementsByTagName("metronome").length > 0;
  if (hasTempo) return false;

  const part = CHILD(root, "part")[0];
  if (!part) return false;

  for (const measure of CHILD(part, "measure").slice(0, 2)) {
    for (const direction of CHILD(measure, "direction")) {
      for (const words of Array.from(direction.getElementsByTagName("words"))) {
        const raw = (words.textContent ?? "").trim();
        // 允许前面带 1-4 个非数字字符（♩= 之类被拆成独立字形的场景）
        const m = raw.match(/^[^\d]{0,4}(\d{2,3})$/);
        if (!m) continue;
        const bpm = Number(m[1]);
        if (!Number.isFinite(bpm) || bpm < 20 || bpm > 300) continue;
        const sound = doc.createElement("sound");
        sound.setAttribute("tempo", String(bpm));
        direction.appendChild(sound);
        // 原来的数字文字已经由 tempo 渲染成正规的 ♩=N，留着会多画一个孤零零的 "72"
        words.remove();
        return true;
      }
    }
  }
  return false;
}

/// 资产字节 → 归一化后的字节；不需要改动时返回 null（调用方回落到原始数据）
export function normalizeScoreData(data: Uint8Array): Uint8Array | null {
  const head = new TextDecoder().decode(data.subarray(0, 64)).trimStart();
  if (!head.startsWith("<?xml") && !head.startsWith("<score-partwise")) return null;

  const text = new TextDecoder().decode(data);
  if (!text.includes("<score-partwise")) return null;

  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(text, "application/xml");
  } catch {
    return null;
  }
  if (doc.getElementsByTagName("parsererror").length > 0) return null;
  const root = doc.documentElement;
  if (!root || root.localName !== "score-partwise") return null;

  const merged = mergeParts(doc, root);
  const tempo = ensureTempo(doc, root);
  if (!merged && !tempo) return null;
  return new TextEncoder().encode(new XMLSerializer().serializeToString(doc));
}
