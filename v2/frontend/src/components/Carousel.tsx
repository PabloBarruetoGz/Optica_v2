import type { ReactNode } from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { useCarousel, type CarouselKey } from '../lib/carousels';
import { A11y, Navigation, Pagination, Autoplay } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/pagination';
export function Carousel({ children, pagination = false, carouselKey }: { children: ReactNode; pagination?: boolean; carouselKey: CarouselKey }) {
  const group = useCarousel(carouselKey);
  const version = group?.slides.map(slide => slide.src).join('|') || 'local';
  if (group && group.slides.length === 0) return <div className="carousel-empty">Próximamente nuevas imágenes.</div>;
  return <Swiper key={version} className="elementor-image-carousel-wrapper" onSwiper={swiper => swiper.wrapperEl.classList.add("elementor-image-carousel")} modules={[A11y, Navigation, Pagination, Autoplay]} navigation pagination={pagination ? { clickable: true } : false} loop speed={500} autoplay={window.matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { delay: 5000, disableOnInteraction: true, pauseOnMouseEnter: true }} spaceBetween={0} slidesPerView={1}>{group ? group.slides.map(slide => <SwiperSlide key={slide.id}><div className="v2-slide-content"><figure className="swiper-slide-inner"><img className="swiper-slide-image" src={slide.src} alt={slide.alt} decoding="async" /></figure></div></SwiperSlide>) : children}</Swiper>;
}
