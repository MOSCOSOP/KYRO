import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, FileText, X } from 'lucide-react';
import type { Attachment } from '@kyro/shared';
import { fileSize } from '@/lib/format';
import { IconButton } from '@/components/ui/Button';
import styles from './Attachments.module.css';

export function Attachments({ items }: { items: Attachment[] }) {
  const [preview, setPreview] = useState<Attachment | null>(null);
  if (items.length === 0) return null;

  const images = items.filter((item) => item.kind === 'image');
  const videos = items.filter((item) => item.kind === 'video');
  const audios = items.filter((item) => item.kind === 'audio');
  const files = items.filter((item) => item.kind === 'file');

  return (
    <>
      {images.length > 0 ? (
        <div className={styles.grid}>
          {images.map((image) => (
            <button
              key={image.id}
              type="button"
              className={styles.media}
              onClick={() => setPreview(image)}
              aria-label={`Ver ${image.name}`}
            >
              <img
                className={styles.image}
                src={image.url}
                alt={image.name}
                width={image.width ?? undefined}
                height={image.height ?? undefined}
                loading="lazy"
                decoding="async"
              />
            </button>
          ))}
        </div>
      ) : null}

      {videos.map((video) => (
        <video key={video.id} className={styles.video} src={video.url} controls preload="metadata" />
      ))}

      {audios.map((audio) => (
        <audio key={audio.id} className={styles.audio} src={audio.url} controls preload="metadata" />
      ))}

      {files.length > 0 ? (
        <div className={styles.grid}>
          {files.map((file) => (
            <a
              key={file.id}
              className={styles.file}
              href={file.url}
              target="_blank"
              rel="noreferrer noopener"
              download
            >
              <span className={styles.fileIcon}>
                <FileText size={18} />
              </span>
              <span className={styles.fileText}>
                <span className={styles.fileName}>{file.name}</span>
                <span className={styles.fileMeta}>{fileSize(file.size)}</span>
              </span>
            </a>
          ))}
        </div>
      ) : null}

      {preview ? <Lightbox attachment={preview} onClose={() => setPreview(null)} /> : null}
    </>
  );
}

function Lightbox({ attachment, onClose }: { attachment: Attachment; onClose: () => void }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return createPortal(
    <div
      className={styles.lightbox}
      role="dialog"
      aria-modal="true"
      aria-label={attachment.name}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={styles.lightboxBar}>
        <IconButton
          label="Abrir en una pestaña"
          onClick={() => window.open(attachment.url, '_blank', 'noopener,noreferrer')}
        >
          <Download size={18} />
        </IconButton>
        <IconButton label="Cerrar" onClick={onClose}>
          <X size={18} />
        </IconButton>
      </div>
      <img className={styles.lightboxImage} src={attachment.url} alt={attachment.name} />
    </div>,
    document.body,
  );
}
