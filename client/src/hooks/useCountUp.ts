"use client";

import { useState, useEffect, useRef } from "react";
import { motion, useAnimationControls } from "framer-motion";

/**
 * useCountUp — animates a number from 0 to `target` over `duration` ms
 */
export function useCountUp(target: number, duration = 1500, delay = 0) {
  const [value, setValue] = useState(0);
  const startTime = useRef<number | null>(null);
  const rafRef = useRef<number>(0);
  const started = useRef(false);

  useEffect(() => {
    const timeout = setTimeout(() => {
      started.current = true;
      const step = (timestamp: number) => {
        if (!startTime.current) startTime.current = timestamp;
        const progress = Math.min((timestamp - startTime.current) / duration, 1);
        // Ease out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        setValue(Math.floor(eased * target));
        if (progress < 1) {
          rafRef.current = requestAnimationFrame(step);
        } else {
          setValue(target);
        }
      };
      rafRef.current = requestAnimationFrame(step);
    }, delay);

    return () => {
      clearTimeout(timeout);
      cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration, delay]);

  return value;
}
