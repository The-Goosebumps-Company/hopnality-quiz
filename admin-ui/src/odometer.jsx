// Rolling "tally / slot-machine" counter for live KPIs.
// Each digit is a reel: it rolls up on increases and down on decreases, spins extra full
// turns when the change is large relative to that digit's place, and gets a vertical-only
// motion blur while it travels far. Non-digits (spaces, %, /, .) stay put.
// Honours prefers-reduced-motion (the number simply changes).
import { useLayoutEffect, useRef, useState } from 'react';

const REDUCED = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const DURATION = 1100;      // ms
const STRIP = 40;           // four 0-9 cycles stacked vertically
const CELL = 1.15;          // em per digit

function Reel({ digit, change }) {
  const [pos, setPos] = useState(digit);
  const [moving, setMoving] = useState(false);
  const [blur, setBlur] = useState(false);
  const shown = useRef(digit);
  const lastTick = useRef(change.tick);

  useLayoutEffect(() => {
    const from = shown.current;
    const isNewTick = change.tick !== lastTick.current;
    lastTick.current = change.tick;
    shown.current = digit;
    if (!isNewTick) { setPos(digit); return undefined; }
    const unit = 10 ** change.place;
    const spins = change.delta >= unit * 10 ? Math.min(2, Math.floor(Math.log10(change.delta / unit))) : 0;
    if ((digit === from && spins === 0) || REDUCED) { setMoving(false); setPos(digit); return undefined; }
    let start, target;
    if (change.direction >= 0) { start = from; target = from + ((digit - from + 10) % 10) + 10 * spins; }
    else { start = from + 30; target = start - ((from - digit + 10) % 10) - 10 * spins; }
    setMoving(false); setBlur(false); setPos(start);
    let raf2;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => { setMoving(true); setBlur(Math.abs(target - start) >= 6); setPos(target); });
    });
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
  }, [digit, change.tick]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <span className="relative inline-block overflow-hidden align-bottom" style={{ height: `${CELL}em`, width: '0.62em' }} aria-hidden="true">
      <span
        onTransitionEnd={(e) => { if (e.propertyName === 'transform') { setMoving(false); setBlur(false); setPos(digit); } }}
        className="absolute left-0 top-0 flex w-full flex-col items-center"
        style={{
          transform: `translateY(${-pos * CELL}em)`,
          transition: moving ? `transform ${DURATION}ms cubic-bezier(0.16, 1, 0.3, 1)` : 'none',
          filter: blur && moving ? 'url(#ph-vblur)' : 'none',
          willChange: moving ? 'transform' : undefined,
        }}
      >
        {Array.from({ length: STRIP }, (_, i) => <span key={i} className="block" style={{ height: `${CELL}em`, lineHeight: `${CELL}em` }}>{i % 10}</span>)}
      </span>
    </span>
  );
}

// value: the number (drives direction and spin size); text: the formatted string shown.
export function Odometer({ value, text }) {
  // Work out the change during render so every reel animates with this change's direction.
  const memo = useRef({ value, direction: 0, delta: 0, tick: 0 });
  if (value !== memo.current.value) {
    const prev = memo.current.value;
    const ok = typeof value === 'number' && typeof prev === 'number';
    memo.current = { value, direction: ok ? Math.sign(value - prev) : 0, delta: ok ? Math.abs(value - prev) : 0, tick: memo.current.tick + 1 };
  }
  const change = memo.current;
  const chars = String(text).split('');
  let place = 0;
  const placed = [...chars].reverse().map((ch) => (/\d/.test(ch) ? { ch, place: place++ } : { ch, place: null })).reverse();
  // For decimals ("71.4%") treat the value as tenths so the last digit is place 0.
  const decimals = (String(text).match(/\.(\d+)/) || [, ''])[1].length;
  const scaledDelta = change.delta * 10 ** decimals;
  return (
    <span className="relative inline-flex items-baseline tabular-nums" role="img" aria-label={String(text)}>
      <svg width="0" height="0" className="absolute" aria-hidden="true" focusable="false">
        <filter id="ph-vblur" x="-10%" y="-30%" width="120%" height="160%"><feGaussianBlur stdDeviation="0 1.6" /></filter>
      </svg>
      {placed.map((p, i) => (p.place === null
        ? <span key={`c${placed.length - i}`} aria-hidden="true" className="whitespace-pre">{p.ch}</span>
        : <Reel key={`d${p.place}`} digit={Number(p.ch)} change={{ tick: change.tick, direction: change.direction, delta: scaledDelta, place: p.place }} />))}
    </span>
  );
}
