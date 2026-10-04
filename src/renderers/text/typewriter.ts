// A fast typewriter for new output. The text goes into the page whole, so the
// layout never jumps and screen readers get every word at once; what types
// out is only its paint. A CSS highlight (::highlight(tx-unwritten)) covers
// everything not yet "typed" and shrinks a few characters each frame.
//
// Any key, click or new command finishes it at once. Without the Highlight
// API, or with reduced motion, text simply appears.

type Job = { nodes: Text[]; ends: number[]; total: number; shown: number; range: Range; marks: { el: Element; at: number }[]; raf: number; last: number };

/** Characters per millisecond, and the longest any one reveal may take. */
const SPEED = 0.9;
const MAX_MS = 1100;

export class Typewriter {
  private hl: Highlight | null = null;
  private job: Job | null = null;

  constructor(reducedMotion: boolean) {
    if (reducedMotion || typeof Highlight !== 'function' || !('highlights' in CSS)) return;
    this.hl = new Highlight();
    CSS.highlights.set('tx-unwritten', this.hl);
  }

  get busy() {
    return !!this.job;
  }

  /** Type out everything inside `root`. Elements marked [data-reveal] fade in as the typing reaches them. */
  play(root: HTMLElement) {
    this.finish();
    const marks = [...root.querySelectorAll('[data-reveal]')];
    if (!this.hl) return marks.forEach((m) => m.classList.add('is-in'));
    const nodes: Text[] = [];
    const ends: number[] = [];
    const starts = new Map<Element, number>();
    let total = 0;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
      if (!n.data.length) continue;
      for (const m of marks) if (!starts.has(m) && m.contains(n)) starts.set(m, total);
      nodes.push(n);
      total += n.data.length;
      ends.push(total);
    }
    if (!total) return marks.forEach((m) => m.classList.add('is-in'));
    const range = document.createRange();
    range.setStart(nodes[0], 0);
    range.setEnd(nodes[nodes.length - 1], nodes[nodes.length - 1].data.length);
    this.hl.add(range);
    const job: Job = { nodes, ends, total, shown: 0, range, marks: marks.map((el) => ({ el, at: starts.get(el) ?? 0 })), raf: 0, last: -1 };
    const speed = Math.max(SPEED, total / MAX_MS);
    const tick = (now: number) => {
      // The first frame's timestamp can be earlier than when play() ran, so time starts there.
      if (job.last >= 0) job.shown += Math.max(0, now - job.last) * speed;
      job.last = now;
      if (job.shown >= total) return this.finish();
      try {
        let i = 0;
        while (ends[i] <= job.shown) i++;
        job.range.setStart(nodes[i], Math.max(0, Math.floor(job.shown - (i ? ends[i - 1] : 0))));
        for (const m of job.marks) if (m.at <= job.shown) m.el.classList.add('is-in');
        job.raf = requestAnimationFrame(tick);
      } catch {
        this.finish(); // never leave words unwritten: if anything goes wrong, show it all
      }
    };
    this.job = job;
    job.raf = requestAnimationFrame(tick);
  }

  /** Show everything now. */
  finish() {
    const job = this.job;
    if (!job) return;
    this.job = null;
    cancelAnimationFrame(job.raf);
    this.hl?.delete(job.range);
    for (const m of job.marks) m.el.classList.add('is-in');
  }

  destroy() {
    this.finish();
    if (this.hl && CSS.highlights.get('tx-unwritten') === this.hl) CSS.highlights.delete('tx-unwritten');
  }
}
