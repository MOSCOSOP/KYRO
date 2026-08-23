import { previewImageSrc, useLinkPreview } from '@/lib/linkPreview';
import styles from './LinkPreviewCard.module.css';

/**
 * Tarjeta del enlace citado en un mensaje.
 *
 * Mientras no hay nada que enseñar no ocupa sitio: aparecer vacía y luego
 * crecer movería el hilo entero bajo el cursor de quien está leyendo.
 */
export function LinkPreviewCard({ url }: { url: string }) {
  const preview = useLinkPreview(url);
  if (!preview) return null;

  return (
    <a className={styles.card} href={preview.url} target="_blank" rel="noreferrer noopener">
      {preview.imageUrl ? (
        <img
          className={styles.thumb}
          src={previewImageSrc(preview.imageUrl)}
          alt=""
          loading="lazy"
          decoding="async"
        />
      ) : null}
      <span className={styles.body}>
        {preview.siteName ? <span className={styles.site}>{preview.siteName}</span> : null}
        <span className={styles.title}>{preview.title}</span>
        {preview.description ? (
          <span className={styles.description}>{preview.description}</span>
        ) : null}
      </span>
    </a>
  );
}
