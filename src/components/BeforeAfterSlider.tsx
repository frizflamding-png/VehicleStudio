 'use client';
 
 import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
 import Image from 'next/image';
 
 type BeforeAfterSliderProps = {
   beforeSrc: string;
   afterSrc: string;
   beforeAlt?: string;
   afterAlt?: string;
   initial?: number;
   autoDemo?: boolean;
  mode?: 'split' | 'overlay';
  fit?: 'cover' | 'contain';
 };
 
 const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
 
 export default function BeforeAfterSlider({
   beforeSrc,
   afterSrc,
   beforeAlt = 'Before image',
   afterAlt = 'After image',
   initial = 50,
   autoDemo = true,
  mode = 'split',
  fit = 'cover',
 }: BeforeAfterSliderProps) {
   const containerRef = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState(() => clamp(initial, 0, 100));
  const [isDragging, setIsDragging] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const valueRef = useRef(value);
  const directionRef = useRef(1);
  const phaseRef = useRef(Math.acos(1 - 2 * clamp(initial, 0, 100) / 100));
 
   const handlePointerMove = useCallback((event: PointerEvent) => {
     if (!containerRef.current) return;
     const rect = containerRef.current.getBoundingClientRect();
     const percent = ((event.clientX - rect.left) / rect.width) * 100;
     setValue(clamp(percent, 0, 100));
   }, []);
 
   const handlePointerUp = useCallback(() => {
     setIsDragging(false);
   }, []);
 
  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
     setIsDragging(true);
     handlePointerMove(event.nativeEvent);
   }, [handlePointerMove]);
 
   useEffect(() => {
     if (!isDragging) return;
     window.addEventListener('pointermove', handlePointerMove);
     window.addEventListener('pointerup', handlePointerUp, { once: true });
 
     return () => {
       window.removeEventListener('pointermove', handlePointerMove);
       window.removeEventListener('pointerup', handlePointerUp);
     };
   }, [handlePointerMove, handlePointerUp, isDragging]);
 
   useEffect(() => {
     if (!containerRef.current) return;
     const observer = new IntersectionObserver(
       ([entry]) => {
         if (entry.isIntersecting) {
           setIsVisible(true);
           observer.disconnect();
         }
       },
       { threshold: 0.35 }
     );
 
     observer.observe(containerRef.current);
 
     return () => observer.disconnect();
   }, []);
 
  useEffect(() => {
    valueRef.current = value;
    const normalized = clamp(value, 0, 100) / 100;
    phaseRef.current = Math.acos(1 - 2 * normalized);
  }, [value]);

  useEffect(() => {
    if (!autoDemo || !isVisible || isDragging) return;

    let frameId: number;
    let lastTime = performance.now();
    const phaseSpeed = 0.35; // radians per second

    const step = (now: number) => {
      const delta = (now - lastTime) / 1000;
      lastTime = now;

      let nextPhase = phaseRef.current + directionRef.current * phaseSpeed * delta;
      if (nextPhase >= Math.PI) {
        nextPhase = Math.PI;
        directionRef.current = -1;
      } else if (nextPhase <= 0) {
        nextPhase = 0;
        directionRef.current = 1;
      }

      phaseRef.current = nextPhase;
      const eased = (1 - Math.cos(nextPhase)) / 2;
      const nextValue = eased * 100;
      valueRef.current = nextValue;
      setValue(nextValue);

      frameId = window.requestAnimationFrame(step);
    };

    frameId = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frameId);
  }, [autoDemo, isVisible, isDragging]);
 
   const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
     if (event.key === 'ArrowLeft') {
       event.preventDefault();
       setValue((prev) => clamp(prev - 3, 0, 100));
     }
     if (event.key === 'ArrowRight') {
       event.preventDefault();
       setValue((prev) => clamp(prev + 3, 0, 100));
     }
   }, []);
 
   const sliderPosition = useMemo(() => clamp(value, 0, 100), [value]);
 
  const imageFitClass = fit === 'contain' ? 'object-contain' : 'object-cover';

  return (
     <div
       ref={containerRef}
       className="relative w-full overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40 shadow-xl"
       onPointerDown={handlePointerDown}
       onKeyDown={handleKeyDown}
       role="slider"
       aria-label="Before and after comparison"
       aria-valuemin={0}
       aria-valuemax={100}
       aria-valuenow={Math.round(sliderPosition)}
       tabIndex={0}
     >
      <div className="relative aspect-video w-full select-none">
        {mode === 'overlay' ? (
          <>
            <Image
              src={afterSrc}
              alt={afterAlt}
              fill
              sizes="(max-width: 1024px) 100vw, 960px"
              className={imageFitClass}
              priority={false}
            />
            <div
              className="absolute inset-0"
              style={{ opacity: sliderPosition / 100 }}
            >
              <Image
                src={beforeSrc}
                alt={beforeAlt}
                fill
                sizes="(max-width: 1024px) 100vw, 960px"
                className={imageFitClass}
                priority={false}
              />
            </div>
            <div
              className="absolute z-10 top-1/2 left-1/2 -translate-y-1/2"
              style={{ transform: `translate(-50%, -50%) translateX(${sliderPosition - 50}%)` }}
            >
              <div className="h-9 w-9 rounded-full border border-white/60 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center shadow-lg">
                <div className="h-4 w-4 rounded-full border border-white/70" />
              </div>
            </div>
          </>
        ) : (
          <>
            <Image
              src={beforeSrc}
              alt={beforeAlt}
              fill
              sizes="(max-width: 1024px) 100vw, 960px"
              className={imageFitClass}
              priority={false}
            />

            <div
              className="absolute inset-0"
              style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}
            >
              <Image
                src={afterSrc}
                alt={afterAlt}
                fill
                sizes="(max-width: 1024px) 100vw, 960px"
                className={imageFitClass}
                priority={false}
              />
            </div>

            <div
              className="absolute inset-y-0 z-10"
              style={{ left: `${sliderPosition}%` }}
            >
              <div className="absolute inset-y-0 -translate-x-1/2 w-px bg-white/70" />
              <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2">
                <div className="h-10 w-10 rounded-full border border-white/60 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center shadow-lg">
                  <div className="h-5 w-5 rounded-full border border-white/70" />
                </div>
              </div>
            </div>
          </>
        )}

        <div className="absolute left-4 top-4 text-xs uppercase tracking-widest text-slate-200/80 bg-slate-950/60 px-2 py-1 rounded-md">
          Before
        </div>
        <div className="absolute right-4 top-4 text-xs uppercase tracking-widest text-slate-200/80 bg-slate-950/60 px-2 py-1 rounded-md">
          After
        </div>
      </div>
     </div>
   );
 }
