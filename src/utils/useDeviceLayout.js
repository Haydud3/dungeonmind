import { useState, useEffect } from 'react';

/**
 * Hook to reactively detect device capabilities, orientation, and dimensions.
 * Handles mobile viewport quirks, camera cutouts / notches, and rotation.
 */
export function useDeviceLayout() {
  const [layout, setLayout] = useState(() => {
    if (typeof window === 'undefined') {
      return {
        isMobile: false,
        isTouch: false,
        isLandscape: false,
        isPortrait: true,
        orientation: 'portrait',
        windowWidth: 1200,
        windowHeight: 800,
      };
    }

    const ua = navigator.userAgent || '';
    const isTouch = (navigator.maxTouchPoints && navigator.maxTouchPoints > 0) || ('ontouchstart' in window);
    const w = window.innerWidth;
    const h = window.innerHeight;
    const isLandscape = w > h;
    const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua) || 
      (isTouch && (w < 1024 || h < 600));

    return {
      isMobile: isMobileDevice || w < 768,
      isTouch,
      isLandscape,
      isPortrait: !isLandscape,
      orientation: isLandscape ? 'landscape' : 'portrait',
      windowWidth: w,
      windowHeight: h,
    };
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleUpdate = () => {
      const ua = navigator.userAgent || '';
      const isTouch = (navigator.maxTouchPoints && navigator.maxTouchPoints > 0) || ('ontouchstart' in window);
      const w = window.innerWidth;
      const h = window.innerHeight;
      const isLandscape = w > h;
      const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua) || 
        (isTouch && (w < 1024 || h < 600));

      setLayout({
        isMobile: isMobileDevice || w < 768,
        isTouch,
        isLandscape,
        isPortrait: !isLandscape,
        orientation: isLandscape ? 'landscape' : 'portrait',
        windowWidth: w,
        windowHeight: h,
      });
    };

    window.addEventListener('resize', handleUpdate, { passive: true });
    window.addEventListener('orientationchange', handleUpdate, { passive: true });

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleUpdate, { passive: true });
    }

    return () => {
      window.removeEventListener('resize', handleUpdate);
      window.removeEventListener('orientationchange', handleUpdate);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleUpdate);
      }
    };
  }, []);

  return layout;
}

export default useDeviceLayout;

