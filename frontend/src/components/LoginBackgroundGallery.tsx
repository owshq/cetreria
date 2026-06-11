import { useEffect, useState } from 'react';
import {
  DEFAULT_PUBLIC_LOGIN_APPEARANCE,
  fetchPublicLoginAppearance,
} from '@/api/publicLoginAppearance';
import { applyWorkspaceTypography } from '@/lib/workspaceTypography';
import type { PublicLoginAppearance } from '@shared/types';
import ui from '@/styles/shared.module.css';

export default function LoginBackgroundGallery() {
  const [appearance, setAppearance] = useState<PublicLoginAppearance>(
    DEFAULT_PUBLIC_LOGIN_APPEARANCE,
  );
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void fetchPublicLoginAppearance().then((data) => {
      if (!cancelled) {
        setAppearance(data);
        setActiveIndex(0);
        applyWorkspaceTypography(data.headingFontId, data.subtitleFontId);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const images = appearance.images;

  useEffect(() => {
    images.forEach((image) => {
      const img = new Image();
      img.src = image.url;
    });
  }, [images]);

  useEffect(() => {
    if (images.length <= 1) return undefined;

    const timer = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % images.length);
    }, appearance.intervalMs);

    return () => window.clearInterval(timer);
  }, [appearance.intervalMs, images.length]);

  if (images.length === 0) return null;

  return (
    <div className={ui.loginBackground} aria-hidden="true">
      {images.map((image, index) => (
        <div
          key={image.id}
          className={`${ui.loginBackgroundSlide} ${index === activeIndex ? ui.loginBackgroundSlideActive : ''}`}
          style={{ backgroundImage: `url('${image.url}')` }}
        />
      ))}
      <div className={ui.loginBackgroundOverlay} />
    </div>
  );
}
