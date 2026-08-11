import { useEffect, useState, useRef } from 'react';
import './SignCrossingOverlay.css';

interface SignCrossingOverlayProps {
  unrealizedPnL: number;
  connected: boolean;
}

export function SignCrossingOverlay({ unrealizedPnL, connected }: SignCrossingOverlayProps) {
  const [flashState, setFlashState] = useState<'green' | 'red' | null>(null);
  const previousSignRef = useRef<number | null>(null);
  const lastFireTimeRef = useRef<number>(0);
  const clearTimerRef = useRef<NodeJS.Timeout | null>(null);
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    // Reset baseline on disconnect
    if (!connected) {
      previousSignRef.current = null;
      return;
    }

    // Initialize baseline on first frame after connection
    if (previousSignRef.current === null) {
      previousSignRef.current = Math.sign(unrealizedPnL);
      return;
    }

    const currentSign = Math.sign(unrealizedPnL);
    const previousSign = previousSignRef.current;

    // Check for sign crossing (positive <-> negative)
    const signCrossing =
      (previousSign > 0 && currentSign < 0) ||
      (previousSign < 0 && currentSign > 0);

    if (!signCrossing) {
      previousSignRef.current = currentSign;
      return;
    }

    // Apply debounce: magnitude threshold ($1) AND cooldown (1500ms)
    const magnitude = Math.abs(unrealizedPnL);
    const now = Date.now();
    const timeSinceLastFire = now - lastFireTimeRef.current;

    if (magnitude < 1 || timeSinceLastFire < 1500) {
      previousSignRef.current = currentSign;
      return;
    }

    // Honor prefers-reduced-motion
    if (prefersReducedMotion) {
      previousSignRef.current = currentSign;
      return;
    }

    // Fire the overlay
    const flashColor = currentSign > 0 ? 'green' : 'red';
    setFlashState(flashColor);
    lastFireTimeRef.current = now;
    previousSignRef.current = currentSign;

    // Clear any existing timer before setting a new one
    if (clearTimerRef.current !== null) {
      clearTimeout(clearTimerRef.current);
    }

    // Clear flash after animation duration (900ms)
    // Managed in ref so it persists across renders and isn't cancelled by effect cleanup
    clearTimerRef.current = setTimeout(() => {
      setFlashState(null);
      clearTimerRef.current = null;
    }, 900);
  }, [unrealizedPnL, connected, prefersReducedMotion]);

  if (!flashState) {
    return null;
  }

  return (
    <div
      className={`sign-crossing-overlay sign-crossing-overlay--${flashState}`}
      aria-hidden="true"
    />
  );
}
