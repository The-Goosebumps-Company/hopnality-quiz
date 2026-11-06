// Port of Pulse's Tooltip (portal-root/frontend/src/components/Tooltip.jsx): same API and
// positioning logic — portalled to <body>, measured before paint, auto-flip to the opposite
// side when it would overflow, clamped 8 px inside the viewport, tail aimed at the anchor's
// centre (clamped clear of the rounded corners), 220 ms expo-out pop, hidden below `sm`.
// PowerHER admin changes (kept): deep-navy surface instead of black, and it also opens on keyboard focus
// (Pulse is hover-only) so "?" help icons are reachable without a mouse.
import { cloneElement, isValidElement, useLayoutEffect, useRef, useState, useId } from 'react';
import { createPortal } from 'react-dom';

/**
 * <Tooltip label="Click to edit"><button>Edit</button></Tooltip>
 * <Tooltip label="Close" asChild><button>…</button></Tooltip>   // no wrapper element
 * @param position 'top' | 'bottom' | 'left' | 'right' (default 'top')
 */
export default function Tooltip({ label, children, position = 'top', autoFlip = true, delay = 0, wrapperClassName = '', asChild = false }) {
  const resolvedLabel = typeof label === 'string' || typeof label === 'number' ? label : label == null ? '' : String(label);
  const id = useId();
  const [isVisible, setIsVisible] = useState(false);
  const [isShown, setIsShown] = useState(false);
  const [coords, setCoords] = useState(null);
  const [tailCoord, setTailCoord] = useState(null);
  const [effectivePosition, setEffectivePosition] = useState(position);
  const wrapperRef = useRef(null);
  const tooltipRef = useRef(null);
  const timeoutRef = useRef(null);
  const effectivePositionRef = useRef(position);

  const setChildRef = (ref, node) => {
    if (!ref) return;
    if (typeof ref === 'function') { ref(node); return; }
    try { ref.current = node; } catch { /* read-only ref */ }
  };

  const show = () => {
    setIsShown(false);
    setEffectivePosition(position);
    effectivePositionRef.current = position;
    if (delay > 0) timeoutRef.current = setTimeout(() => setIsVisible(true), delay);
    else setIsVisible(true);
  };
  const hide = () => {
    clearTimeout(timeoutRef.current);
    setIsShown(false);
    setIsVisible(false);
    setCoords(null);
  };

  useLayoutEffect(() => {
    if (!isVisible || !resolvedLabel || !wrapperRef.current) return undefined;
    let rafId = null;
    let showRafId = null;

    const updatePosition = () => {
      const anchor = wrapperRef.current;
      const tooltipEl = tooltipRef.current;
      if (!anchor || !tooltipEl) return;
      const anchorRect = anchor.getBoundingClientRect();
      const tipRect = tooltipEl.getBoundingClientRect();
      const gap = 8;
      const padding = 8;

      const computeCoordsFor = (pos) => {
        if (pos === 'bottom') return { x: anchorRect.left + anchorRect.width / 2 - tipRect.width / 2, y: anchorRect.bottom + gap };
        if (pos === 'left') return { x: anchorRect.left - gap - tipRect.width, y: anchorRect.top + anchorRect.height / 2 - tipRect.height / 2 };
        if (pos === 'right') return { x: anchorRect.right + gap, y: anchorRect.top + anchorRect.height / 2 - tipRect.height / 2 };
        return { x: anchorRect.left + anchorRect.width / 2 - tipRect.width / 2, y: anchorRect.top - gap - tipRect.height };
      };
      const overflowScore = ({ x, y }) => Math.max(0, padding - x) + Math.max(0, padding - y)
        + Math.max(0, x + tipRect.width - (window.innerWidth - padding)) + Math.max(0, y + tipRect.height - (window.innerHeight - padding));
      const opposite = (pos) => ({ top: 'bottom', bottom: 'top', left: 'right', right: 'left' }[pos] || 'top');

      let bestPos = position;
      let bestCoords = computeCoordsFor(position);
      if (autoFlip) {
        const flipped = opposite(position);
        const flippedCoords = computeCoordsFor(flipped);
        if (overflowScore(flippedCoords) < overflowScore(bestCoords)) { bestPos = flipped; bestCoords = flippedCoords; }
      }
      const clampedX = Math.max(padding, Math.min(bestCoords.x, window.innerWidth - padding - tipRect.width));
      const clampedY = Math.max(padding, Math.min(bestCoords.y, window.innerHeight - padding - tipRect.height));
      if (effectivePositionRef.current !== bestPos) { effectivePositionRef.current = bestPos; setEffectivePosition(bestPos); }

      // Aim the tail at the anchor's centre (not the bubble's) so it still points at the trigger
      // when the bubble is clamped to a screen edge; keep it clear of the rounded corners.
      const tailMargin = 10;
      if (bestPos === 'left' || bestPos === 'right') {
        setTailCoord(Math.max(tailMargin, Math.min(anchorRect.top + anchorRect.height / 2 - clampedY, tipRect.height - tailMargin)));
      } else {
        setTailCoord(Math.max(tailMargin, Math.min(anchorRect.left + anchorRect.width / 2 - clampedX, tipRect.width - tailMargin)));
      }
      setCoords({ left: clampedX, top: clampedY });
    };
    const scheduleUpdate = () => { if (rafId) cancelAnimationFrame(rafId); rafId = requestAnimationFrame(updatePosition); };

    updatePosition();                                        // land before paint (no jump)
    showRafId = requestAnimationFrame(() => setIsShown(true)); // then animate in
    window.addEventListener('resize', scheduleUpdate);
    window.addEventListener('scroll', scheduleUpdate, true);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      if (showRafId) cancelAnimationFrame(showRafId);
      window.removeEventListener('resize', scheduleUpdate);
      window.removeEventListener('scroll', scheduleUpdate, true);
    };
  }, [isVisible, resolvedLabel, position, autoFlip]);

  const tailIsHorizontal = effectivePosition === 'top' || effectivePosition === 'bottom';
  const tailClasses = effectivePosition === 'bottom' ? '-translate-x-1/2 -top-[3px]'
    : effectivePosition === 'left' ? '-right-[3px] -translate-y-1/2'
      : effectivePosition === 'right' ? '-left-[3px] -translate-y-1/2'
        : '-translate-x-1/2 -bottom-[3px]';
  const tailStyle = tailIsHorizontal ? { left: tailCoord != null ? `${tailCoord}px` : '50%' } : { top: tailCoord != null ? `${tailCoord}px` : '50%' };
  const enterTransform = effectivePosition === 'bottom' ? 'translate3d(0, -6px, 0) scale(0.95)'
    : effectivePosition === 'left' ? 'translate3d(6px, 0, 0) scale(0.95)'
      : effectivePosition === 'right' ? 'translate3d(-6px, 0, 0) scale(0.95)'
        : 'translate3d(0, 6px, 0) scale(0.95)';
  const motion = { transitionProperty: 'opacity, transform', transitionDuration: '220ms', transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)', willChange: 'opacity, transform' };

  const tooltipPortal = isVisible && resolvedLabel && typeof document !== 'undefined'
    ? createPortal(
      <span
        ref={tooltipRef}
        id={id}
        role="tooltip"
        style={coords
          ? { position: 'fixed', left: coords.left, top: coords.top, visibility: 'visible', opacity: isShown ? 1 : 0, transform: isShown ? 'translate3d(0, 0, 0) scale(1)' : enterTransform, ...motion }
          : { position: 'fixed', left: 0, top: 0, visibility: 'hidden', opacity: 0, transform: enterTransform, ...motion }}
        className="relative px-2 py-1 text-xs font-medium text-white bg-[#0b1c29] rounded shadow-lg whitespace-normal break-words text-center leading-snug max-w-[min(90vw,18rem)] z-[9999] pointer-events-none hidden sm:block origin-bottom transform-gpu"
      >
        <span aria-hidden="true" style={tailStyle} className={`absolute ${tailClasses} w-[7px] h-[7px] bg-[#0b1c29] rotate-45 shadow-lg pointer-events-none z-0`} />
        <span className="relative z-10">{resolvedLabel}</span>
      </span>,
      document.body,
    )
    : null;

  const triggers = (props = {}) => ({
    onMouseEnter: (e) => { props.onMouseEnter?.(e); show(); },
    onMouseLeave: (e) => { props.onMouseLeave?.(e); hide(); },
    onFocus: (e) => { props.onFocus?.(e); show(); },
    onBlur: (e) => { props.onBlur?.(e); hide(); },
    'aria-describedby': isVisible ? id : props['aria-describedby'],
  });

  if (asChild && isValidElement(children)) {
    const child = children;
    return (
      <>
        {cloneElement(child, {
          ...child.props,
          ...triggers(child.props),
          className: `${child.props.className || ''} ${wrapperClassName}`.trim(),
          ref: (node) => { wrapperRef.current = node; setChildRef(child.ref, node); },
        })}
        {tooltipPortal}
      </>
    );
  }
  return (
    <div ref={wrapperRef} className={`relative inline-flex ${wrapperClassName}`} {...triggers()}>
      {children}
      {tooltipPortal}
    </div>
  );
}
