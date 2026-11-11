import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { ReactLenis, useLenis } from 'lenis/react';
import 'lenis/dist/lenis.css';

const ScrollToTopOnRouteChange: React.FC = () => {
  const { pathname } = useLocation();
  const lenis = useLenis();

  useEffect(() => {
    if (lenis) lenis.scrollTo(0, { immediate: true });
    else window.scrollTo(0, 0);
  }, [pathname, lenis]);

  return null;
};

export const SmoothScroll: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const reduceMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (reduceMotion) return <>{children}</>;

  return (
    <ReactLenis root options={{ lerp: 0.1, smoothWheel: true }}>
      <ScrollToTopOnRouteChange />
      {children}
    </ReactLenis>
  );
};
