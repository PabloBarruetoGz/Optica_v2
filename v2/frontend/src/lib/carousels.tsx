import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
export type CarouselKey = 'exam' | 'glasses' | 'delivery' | 'advice';
export type CarouselSlide = { id: string; src: string; alt: string; image_id: string | null; can_restore: boolean; position: number };
export type CarouselGroup = { key: CarouselKey; name: string; description: string; slides: CarouselSlide[] };
const CarouselContext = createContext<CarouselGroup[]>([]);
export function CarouselProvider({ children }: { children: ReactNode }) {
  const [groups, setGroups] = useState<CarouselGroup[]>([]);
  useEffect(() => {
    let active = true;
    let controller: AbortController | undefined;
    async function refresh() {
      controller?.abort(); controller = new AbortController();
      try {
        const response = await fetch('/api/carousels', { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) return;
        const result = await response.json();
        if (active) setGroups(result.carousels);
      } catch { /* Keep the original local photos if the API is unavailable. */ }
    }
    void refresh();
    window.addEventListener('focus', refresh);
    return () => { active = false; controller?.abort(); window.removeEventListener('focus', refresh); };
  }, []);
  return <CarouselContext.Provider value={groups}>{children}</CarouselContext.Provider>;
}
export function useCarousel(key: CarouselKey) { return useContext(CarouselContext).find(group => group.key === key); }

export function ServiceText({ carouselKey, field, fallback }: { carouselKey: CarouselKey; field: 'name' | 'description'; fallback: string }) {
  const group = useCarousel(carouselKey);
  return <>{group?.[field] || fallback}</>;
}
