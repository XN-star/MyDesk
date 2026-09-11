import { useEffect, useState } from 'react';
import type { HabitCelebration } from '../stores/habits';
import { HABIT_CELEBRATION_EVENT } from '../stores/habits';

interface Burst {
  /** 唯一 key，用于 React 渲染与自动清理 */
  id: number;
  /** 爆发中心（页面视口坐标） */
  x: number;
  y: number;
  /** 大彩蛋（全部完成）粒子更多 */
  grand: boolean;
}

/** 粒子颜色：取各主题色 + 庆祝暖色，随粒子随机分配。 */
const COLORS = ['var(--accent)', 'var(--ok)', 'var(--warn)', '#f59e0b', '#ec4899', '#8b5cf6'];

const PARTICLE_COUNT = 18;
const PARTICLE_COUNT_GRAND = 32;
/** 与 CSS 动画时长一致，之后卸载 DOM */
const LIFETIME_MS = 1100;

let burstSeq = 0;

/** 用户偏好减少动效时不喷发。 */
function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function spawnBurst(detail: HabitCelebration): Burst | null {
  if (prefersReducedMotion()) return null;
  const row = document.querySelector<HTMLElement>(`[data-habit-row="${detail.habitId}"]`);
  const rect = row?.getBoundingClientRect();
  return {
    id: ++burstSeq,
    x: rect ? rect.left + rect.width * 0.12 : window.innerWidth / 2,
    y: rect ? rect.top + rect.height / 2 : window.innerHeight / 2,
    grand: detail.allDone,
  };
}

/**
 * 习惯打卡庆祝粒子层：监听 habit:celebrated 事件，
 * 在对应打卡行位置喷发一次 CSS 粒子，动画结束后自动卸载。
 * 放在 HabitsPage 根节点内（position: fixed，不占布局）。
 */
export default function Celebration() {
  const [bursts, setBursts] = useState<Burst[]>([]);

  useEffect(() => {
    function onCelebrate(e: Event) {
      const burst = spawnBurst((e as CustomEvent<HabitCelebration>).detail);
      if (!burst) return;
      setBursts((prev) => [...prev, burst]);
      window.setTimeout(() => {
        setBursts((prev) => prev.filter((b) => b.id !== burst.id));
      }, LIFETIME_MS);
    }
    window.addEventListener(HABIT_CELEBRATION_EVENT, onCelebrate);
    return () => window.removeEventListener(HABIT_CELEBRATION_EVENT, onCelebrate);
  }, []);

  return (
    <>
      {bursts.map((b) => (
        <div key={b.id} className="celebration-layer" aria-hidden>
          {Array.from({ length: b.grand ? PARTICLE_COUNT_GRAND : PARTICLE_COUNT }, (_, i) => {
            const angle = (Math.PI * 2 * i) / (b.grand ? PARTICLE_COUNT_GRAND : PARTICLE_COUNT) + Math.random() * 0.5;
            const dist = 46 + Math.random() * 44 + (b.grand ? 24 : 0);
            const dx = Math.cos(angle) * dist;
            const dy = Math.sin(angle) * dist - 20;
            return (
              <span
                key={i}
                className="confetti"
                style={{
                  '--dx': `${dx}px`,
                  '--dy': `${dy}px`,
                  '--rot': `${(Math.random() * 540 - 270).toFixed(0)}deg`,
                  background: COLORS[i % COLORS.length],
                  animationDelay: `${(Math.random() * 90).toFixed(0)}ms`,
                } as React.CSSProperties}
              />
            );
          })}
        </div>
      ))}
    </>
  );
}
