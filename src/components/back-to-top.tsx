"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

export function BackToTop({ hidden = false }: { hidden?: boolean }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const update = () => setVisible(window.scrollY > 600);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  if (!visible || hidden) return null;
  return (
    <button
      type="button"
      className="back-to-top"
      aria-label="맨 위로 이동"
      title="맨 위로 이동"
      onClick={() =>
        window.scrollTo({
          top: 0,
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "instant"
            : "smooth",
        })
      }
    >
      <ArrowUp size={22} aria-hidden="true" />
    </button>
  );
}
