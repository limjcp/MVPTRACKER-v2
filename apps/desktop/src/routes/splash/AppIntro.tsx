import { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import logoUrl from '@/assets/mvp-condos-logo.png';

type AppIntroProps = {
  onLaunch: () => void;
};

const PARTICLE_COUNT = 32;

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

export default function AppIntro({ onLaunch }: AppIntroProps) {
  const prefersReducedMotion = useReducedMotion();
  const [showLaunch, setShowLaunch] = useState(!!prefersReducedMotion);

  const particles = useMemo(
    () =>
      Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
        id: i,
        left: `${randomBetween(2, 98)}%`,
        top: `${randomBetween(5, 95)}%`,
        size: randomBetween(1.5, 3.5),
        duration: randomBetween(14, 28),
        delay: randomBetween(0, 8),
      })),
    []
  );

  useEffect(() => {
    if (prefersReducedMotion) {
      setShowLaunch(true);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      if (!cancelled) setShowLaunch(true);
    }, 3600);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [prefersReducedMotion]);

  const reduced = !!prefersReducedMotion;

  return (
    <div className="relative flex min-h-dvh w-full flex-1 flex-col items-center justify-center overflow-hidden bg-[#0a0a0a] px-4 py-8 sm:px-6 sm:py-16 text-white">
      {/* Ambient glows */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -left-32 top-1/4 h-[420px] w-[420px] rounded-full bg-[#0047ab]/25 blur-[100px]"
        animate={reduced ? {} : { opacity: [0.35, 0.55, 0.35], scale: [1, 1.08, 1] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -right-24 bottom-1/4 h-[380px] w-[380px] rounded-full bg-[#000080]/30 blur-[90px]"
        animate={reduced ? {} : { opacity: [0.25, 0.45, 0.25], scale: [1, 1.06, 1] }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
      />

      {/* Floating particles */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        {particles.map((p) => (
          <motion.div
            key={p.id}
            className="absolute rounded-full bg-white/20 shadow-[0_0_12px_rgba(0,71,171,0.35)]"
            style={{
              left: p.left,
              top: p.top,
              width: p.size,
              height: p.size,
            }}
            animate={
              reduced
                ? { opacity: 0.15 }
                : {
                    y: [0, -40, 0],
                    opacity: [0.08, 0.35, 0.08],
                  }
            }
            transition={{
              duration: p.duration,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: p.delay,
            }}
          />
        ))}
      </div>

      <div className="relative z-10 flex w-full max-w-lg flex-col items-center">
        {/* Logo + scanner */}
        <div className="perspective-[900px]" style={{ perspective: 900 }}>
          <motion.div
            initial={
              reduced
                ? { opacity: 0, scale: 0.98 }
                : { opacity: 0, rotateX: -22, rotateY: 18, scale: 0.55 }
            }
            animate={{ opacity: 1, rotateX: 0, rotateY: 0, scale: 1 }}
            transition={
              reduced
                ? { duration: 0.35 }
                : { type: 'spring', stiffness: 76, damping: 18, mass: 0.9 }
            }
          >
            <motion.div
              className="relative"
              animate={
                reduced
                  ? {}
                  : {
                      scale: [1, 1.025, 1],
                      filter: [
                        'drop-shadow(0 0 28px rgba(0,71,171,0.35))',
                        'drop-shadow(0 0 48px rgba(0,71,171,0.55))',
                        'drop-shadow(0 0 28px rgba(0,71,171,0.35))',
                      ],
                    }
              }
              transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
            >
              <div className="relative overflow-hidden rounded-2xl ring-1 ring-white/15">
                <img
                  src={logoUrl}
                  alt="MVP Condos"
                  className="mx-auto block h-auto w-[min(100%,420px)] max-w-full select-none"
                  draggable={false}
                />
                {!reduced && (
                  <motion.div
                    className="pointer-events-none absolute inset-x-0 top-0 h-[28%] bg-gradient-to-b from-transparent via-sky-400/45 to-transparent mix-blend-screen"
                    initial={{ y: '-100%' }}
                    animate={{ y: ['-100%', '120%'] }}
                    transition={{ duration: 2.4, repeat: Infinity, ease: 'linear', repeatDelay: 0.2 }}
                  />
                )}
              </div>
            </motion.div>
          </motion.div>
        </div>

        {/* Title */}
        <div className="mt-10 flex flex-col items-center gap-1 text-center">
          <motion.p
            className="font-sans text-[11px] font-medium uppercase tracking-[0.55em] text-white/45"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: reduced ? 0 : 0.35, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            Welcome
          </motion.p>
          <motion.h1
            className="font-sans text-3xl font-semibold tracking-[0.28em] text-white sm:text-4xl"
            initial={{ opacity: 0, y: 22, letterSpacing: '0.5em' }}
            animate={{ opacity: 1, y: 0, letterSpacing: '0.28em' }}
            transition={{ delay: reduced ? 0.05 : 0.55, duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
          >
            MVP Condos
          </motion.h1>
          <motion.p
            className="font-tech mt-2 max-w-md text-xs text-sky-300/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: reduced ? 0.1 : 0.95, duration: 0.6 }}
          >
            Tracker · precision operations
          </motion.p>
        </div>

        {/* Launch */}
        <motion.div
          className="mt-14 flex justify-center"
          initial={false}
          animate={
            showLaunch
              ? { opacity: 1, y: 0, pointerEvents: 'auto' as const }
              : { opacity: 0, y: 16, pointerEvents: 'none' as const }
          }
          transition={{ type: 'spring', stiffness: 280, damping: 28 }}
        >
          <motion.button
            type="button"
            onClick={onLaunch}
            className="font-sans relative overflow-hidden rounded-2xl border border-white/20 bg-white/10 px-12 py-3.5 text-sm font-semibold tracking-wide text-white shadow-[0_0_40px_rgba(0,71,171,0.25)] backdrop-blur-xl transition-colors hover:border-sky-400/40 hover:bg-white/14"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.98 }}
          >
            <span className="relative z-10">Launch App</span>
            <span className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          </motion.button>
        </motion.div>
      </div>
    </div>
  );
}
