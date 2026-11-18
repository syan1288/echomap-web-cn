import React, { useLayoutEffect, useRef, useCallback } from 'react';
import Lenis from 'lenis';
import './ScrollStack.css';

export const ScrollStackItem = ({
  children,
  itemClassName = '',
}: {
  children: React.ReactNode;
  itemClassName?: string;
}) => <div className={`scroll-stack-card ${itemClassName}`.trim()}>{children}</div>;

type ScrollStackProps = {
  children: React.ReactNode;
  className?: string;
  itemDistance?: number;
  itemScale?: number;
  itemStackDistance?: number;
  stackPosition?: string;
  scaleEndPosition?: string;
  baseScale?: number;
  scaleDuration?: number;
  rotationRange?: [number, number];
  rotationSeed?: number;
  offsetRange?: [number, number];
  blurAmount?: number;
  useWindowScroll?: boolean;
  onStackComplete?: () => void;
};

const ScrollStack = ({
  children,
  className = '',
  itemDistance = 100,
  itemScale = 0.03,
  itemStackDistance = 30,
  stackPosition = '20%',
  scaleEndPosition = '10%',
  baseScale = 0.85,
  scaleDuration = 0.5,
  rotationRange = [-8, 8],
  rotationSeed = 42,
  offsetRange = [0, 0],
  blurAmount = 0,
  useWindowScroll = false,
  onStackComplete,
}: ScrollStackProps) => {
  type TransformSnapshot = {
    translateX: number;
    translateY: number;
    scale: number;
    rotation: number;
    blur: number;
  };
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const stackCompletedRef = useRef(false);
  const animationFrameRef = useRef<number | null>(null);
  const lenisRef = useRef<Lenis | null>(null);
  const cardsRef = useRef<HTMLDivElement[]>([]);
  const lastTransformsRef = useRef(new Map<number, TransformSnapshot>());
  const isUpdatingRef = useRef(false);
  const randomRotationsRef = useRef<number[]>([]);
  const randomOffsetsRef = useRef<number[]>([]);

  const calculateProgress = useCallback((scrollTop: number, start: number, end: number) => {
    if (scrollTop < start) return 0;
    if (scrollTop > end) return 1;
    return (scrollTop - start) / Math.max(end - start, 1);
  }, []);

  const parsePercentage = useCallback((value: string | number, containerHeight: number) => {
    if (typeof value === 'string' && value.includes('%')) {
      return (parseFloat(value) / 100) * containerHeight;
    }
    return parseFloat(String(value));
  }, []);

  const getScrollData = useCallback(() => {
    if (useWindowScroll) {
      return {
        scrollTop: window.scrollY,
        containerHeight: window.innerHeight,
      };
    }

    const scroller = scrollerRef.current;
    return {
      scrollTop: scroller?.scrollTop ?? 0,
      containerHeight: scroller?.clientHeight ?? window.innerHeight,
    };
  }, [useWindowScroll]);

  const getElementOffset = useCallback(
    (element: HTMLElement) => {
      if (useWindowScroll) {
        const rect = element.getBoundingClientRect();
        return rect.top + window.scrollY;
      }
      return element.offsetTop;
    },
    [useWindowScroll]
  );

  const updateCardTransforms = useCallback(() => {
    if (!cardsRef.current.length || isUpdatingRef.current) return;
    isUpdatingRef.current = true;

    const { scrollTop, containerHeight } = getScrollData();
    const stackPositionPx = parsePercentage(stackPosition, containerHeight);
    const scaleEndPositionPx = parsePercentage(scaleEndPosition, containerHeight);
    const endElement = useWindowScroll
      ? document.querySelector<HTMLElement>('.scroll-stack-end')
      : scrollerRef.current?.querySelector<HTMLElement>('.scroll-stack-end');
    const endElementTop = endElement ? getElementOffset(endElement) : 0;

    cardsRef.current.forEach((card, i) => {
      const cardTop = getElementOffset(card);
      const triggerStart = cardTop - stackPositionPx - itemStackDistance * i;
      const triggerEnd = cardTop - scaleEndPositionPx;
      const pinStart = triggerStart;
      const pinEnd = endElementTop - containerHeight / 2;

      const scaleProgress = calculateProgress(scrollTop, triggerStart, triggerEnd);
      const targetScale = baseScale + i * itemScale;
      const scale = 1 - scaleProgress * (1 - targetScale);
      const easedProgress = 1 - Math.pow(1 - scaleProgress, 3);
      const rotation = (randomRotationsRef.current[i] ?? 0) * easedProgress;
      const translateX = (randomOffsetsRef.current[i] ?? 0) * easedProgress;

      let blur = 0;
      if (blurAmount) {
        let topCardIndex = 0;
        for (let j = 0; j < cardsRef.current.length; j += 1) {
          const jCardTop = getElementOffset(cardsRef.current[j]);
          const jTriggerStart = jCardTop - stackPositionPx - itemStackDistance * j;
          if (scrollTop >= jTriggerStart) topCardIndex = j;
        }
        if (i < topCardIndex) {
          blur = Math.max(0, (topCardIndex - i) * blurAmount);
        }
      }

      let translateY = 0;
      const isPinned = scrollTop >= pinStart && scrollTop <= pinEnd;
      if (isPinned) {
        translateY = scrollTop - cardTop + stackPositionPx + itemStackDistance * i;
      } else if (scrollTop > pinEnd) {
        translateY = pinEnd - cardTop + stackPositionPx + itemStackDistance * i;
      }

      const nextTransform = {
        translateX: Math.round(translateX * 100) / 100,
        translateY: Math.round(translateY * 100) / 100,
        scale: Math.round(scale * 1000) / 1000,
        rotation: Math.round(rotation * 100) / 100,
        blur: Math.round(blur * 100) / 100,
      };
      const prevTransform = lastTransformsRef.current.get(i);
      const changed =
        !prevTransform ||
        Math.abs(prevTransform.translateX - nextTransform.translateX) > 0.1 ||
        Math.abs(prevTransform.translateY - nextTransform.translateY) > 0.1 ||
        Math.abs(prevTransform.scale - nextTransform.scale) > 0.001 ||
        Math.abs(prevTransform.rotation - nextTransform.rotation) > 0.1 ||
        Math.abs(prevTransform.blur - nextTransform.blur) > 0.1;

      if (changed) {
        card.style.transform = `translate3d(${nextTransform.translateX}px, ${nextTransform.translateY}px, 0) scale(${nextTransform.scale}) rotate(${nextTransform.rotation}deg)`;
        card.style.filter = nextTransform.blur > 0 ? `blur(${nextTransform.blur}px)` : '';
        lastTransformsRef.current.set(i, nextTransform);
      }

      if (i === cardsRef.current.length - 1) {
        const active = scrollTop >= pinStart && scrollTop <= pinEnd;
        if (active && !stackCompletedRef.current) {
          stackCompletedRef.current = true;
          onStackComplete?.();
        } else if (!active && stackCompletedRef.current) {
          stackCompletedRef.current = false;
        }
      }
    });

    isUpdatingRef.current = false;
  }, [
    baseScale,
    blurAmount,
    calculateProgress,
    getElementOffset,
    getScrollData,
    itemScale,
    itemStackDistance,
    onStackComplete,
    parsePercentage,
    scaleEndPosition,
    stackPosition,
    useWindowScroll,
  ]);

  const handleScroll = useCallback(() => {
    updateCardTransforms();
  }, [updateCardTransforms]);

  const setupLenis = useCallback(() => {
    if (useWindowScroll) {
      const lenis = new Lenis({
        duration: 1.2,
        easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
        touchMultiplier: 2,
        infinite: false,
        wheelMultiplier: 1,
        lerp: 0.1,
        syncTouch: true,
        syncTouchLerp: 0.075,
      });
      lenis.on('scroll', handleScroll);
      const raf = (time: number) => {
        lenis.raf(time);
        animationFrameRef.current = requestAnimationFrame(raf);
      };
      animationFrameRef.current = requestAnimationFrame(raf);
      lenisRef.current = lenis;
      return;
    }

    const scroller = scrollerRef.current;
    const content = scroller?.querySelector<HTMLElement>('.scroll-stack-inner');
    if (!scroller || !content) return;

    const lenis = new Lenis({
      wrapper: scroller,
      content,
      duration: 1.2,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      touchMultiplier: 2,
      infinite: false,
      wheelMultiplier: 1,
      lerp: 0.1,
      syncTouch: true,
      syncTouchLerp: 0.075,
    });
    lenis.on('scroll', handleScroll);
    const raf = (time: number) => {
      lenis.raf(time);
      animationFrameRef.current = requestAnimationFrame(raf);
    };
    animationFrameRef.current = requestAnimationFrame(raf);
    lenisRef.current = lenis;
  }, [handleScroll, useWindowScroll]);

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return undefined;

    const cards = Array.from(
      useWindowScroll
        ? document.querySelectorAll<HTMLDivElement>('.scroll-stack-card')
        : scroller.querySelectorAll<HTMLDivElement>('.scroll-stack-card')
    );

    cardsRef.current = cards;
    const [minRot, maxRot] = rotationRange;
    const [minOffset, maxOffset] = offsetRange;
    randomRotationsRef.current = cards.map((_, i) => {
      const seed = (rotationSeed * 9973 + i * 7919 + 49297) % 233280;
      const t = seed / 233280;
      const maxMagnitude = Math.max(Math.abs(minRot), Math.abs(maxRot), 2);
      const magnitude = maxMagnitude * (0.35 + t * 0.65);
      const sign = i % 2 === 0 ? -1 : 1;
      return Math.min(maxRot, Math.max(minRot, magnitude * sign));
    });
    randomOffsetsRef.current = cards.map((_, i) => {
      const seed = (rotationSeed * 6151 + i * 3571 + 23197) % 233280;
      const t = seed / 233280;
      const raw = minOffset + t * (maxOffset - minOffset);
      return i % 2 === 0 ? raw : -raw;
    });

    cards.forEach((card, i) => {
      if (i < cards.length - 1) {
        card.style.marginBottom = `${itemDistance}px`;
      }
      card.style.willChange = 'transform, filter';
      card.style.transformOrigin = 'top center';
      card.style.backfaceVisibility = 'hidden';
      card.style.transform = 'translateZ(0)';
      card.style.webkitTransform = 'translateZ(0)';
      card.style.perspective = '1000px';
      card.style.webkitPerspective = '1000px';
      card.style.transitionDuration = `${scaleDuration * 0.8}s`;
      card.style.transitionTimingFunction = 'cubic-bezier(0.16, 1, 0.3, 1)';
    });

    setupLenis();
    updateCardTransforms();

    return () => {
      if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
      lenisRef.current?.destroy();
      stackCompletedRef.current = false;
      cardsRef.current = [];
      lastTransformsRef.current.clear();
      randomRotationsRef.current = [];
      randomOffsetsRef.current = [];
      isUpdatingRef.current = false;
    };
  }, [
    itemDistance,
    offsetRange,
    rotationRange,
    rotationSeed,
    scaleDuration,
    setupLenis,
    updateCardTransforms,
    useWindowScroll,
  ]);

  return (
    <div className={`scroll-stack-scroller ${className}`.trim()} ref={scrollerRef}>
      <div className="scroll-stack-inner">
        {children}
        <div className="scroll-stack-end" />
      </div>
    </div>
  );
};

export default ScrollStack;
