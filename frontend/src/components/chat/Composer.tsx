import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from 'react';
import clsx from 'clsx';
import { Megaphone, Mic, Paperclip, Send, Smile, Trash2, X } from 'lucide-react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import type { Attachment, Conversation } from '@kyro/shared';
import { LIMITS, ROLE_RANK } from '@kyro/shared';
import { uploadFile } from '@/lib/api';
import { useChat } from '@/store/chat';
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';
import { useSession } from '@/store/session';
import { toastError } from '@/store/ui';
import { dur, EASE_POP, enterUp, punch } from '@/lib/motion';
import { IconButton } from '@/components/ui/Button';
import styles from './Composer.module.css';

const EMOJIS = [
  '😀','😂','🙂','😉','😍','😘','😎','🤔',
  '😅','😢','😭','😡','🥳','😴','🤯','🤝',
  '👍','👎','👏','🙏','💪','🔥','✨','🎉',
  '❤️','🧡','💛','💚','💙','💜','🖤','💔',
  '✅','❌','⚠️','💡','📌','📎','📁','🔗',
  '🎮','🎧','🎵','⚽','🍕','☕','🌙','☀️',
];

interface PendingAttachment {
  id: string;
  file: File;
  token?: string;
  attachment?: Attachment;
  progress: number;
  previewUrl?: string;
  error?: string;
}

export function Composer({ conversation }: { conversation: Conversation }) {
  const draft = useChat((state) => state.drafts[conversation.id] ?? '');
  const replyTo = useChat((state) => state.replyTo[conversation.id] ?? null);
  const sending = useChat((state) => state.sending[conversation.id] ?? false);
  const enterToSend = useSession((state) => state.user?.preferences.enterToSend ?? true);
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const voice = useVoiceRecorder();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const trailingRef = useRef<HTMLSpanElement>(null);
  const replyBarRef = useRef<HTMLDivElement>(null);
  const recordingRef = useRef<HTMLDivElement>(null);
  const hasContent = Boolean(draft.trim() || pending.length > 0);

  // El botón de enviar no sustituye al de grabar por arte de magia: entra con
  // un golpe de muñeca, la misma sensación física que tendría pulsarlo.
  useGSAP(
    () => {
      const el = trailingRef.current;
      if (!el) return;
      gsap.fromTo(
        el,
        { scale: 0.5, opacity: 0 },
        { scale: 1, opacity: 1, duration: dur('fast'), ease: EASE_POP },
      );
    },
    { dependencies: [hasContent], scope: trailingRef },
  );

  // La barra de respuesta se anuncia entrando, no aparece de golpe encima
  // del campo.
  useGSAP(
    () => {
      if (!replyTo || !replyBarRef.current) return;
      enterUp(replyBarRef.current);
    },
    { dependencies: [Boolean(replyTo)], scope: replyBarRef },
  );

  // Entrar en modo grabación cambia toda la caja: se marca con el mismo
  // gesto de llegada que el resto de paneles transitorios de KYRO.
  useGSAP(
    () => {
      if (!voice.recording || !recordingRef.current) return;
      enterUp(recordingRef.current);
    },
    { dependencies: [voice.recording], scope: recordingRef },
  );

  const readOnly =
    conversation.channelKind === 'announcement' &&
    ROLE_RANK[conversation.myRole] < ROLE_RANK.moderator;

  // Altura del campo según el contenido.
  useEffect(() => {
    const element = textarea.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 190)}px`;
  }, [draft]);

  useEffect(() => {
    if (replyTo) textarea.current?.focus();
  }, [replyTo]);

  // Si la grabación no arranca (sin permiso, sin micrófono), hay que decirlo:
  // un botón que no hace nada es peor que un error.
  useEffect(() => {
    if (voice.error) toastError(new Error(voice.error));
  }, [voice.error]);

  useEffect(() => {
    return () => {
      for (const item of pending) {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      }
    };
  }, [pending]);

  const addFiles = async (files: FileList | File[]) => {
    const list = Array.from(files).slice(0, LIMITS.attachmentsPerMessage - pending.length);
    for (const file of list) {
      const id = `${file.name}-${file.size}-${Date.now()}-${Math.random()}`;
      const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
      setPending((current) => [...current, { id, file, progress: 0, previewUrl }]);

      try {
        const result = await uploadFile(file, {
          scope: 'message',
          onProgress: (percent) =>
            setPending((current) =>
              current.map((item) => (item.id === id ? { ...item, progress: percent } : item)),
            ),
        });
        setPending((current) =>
          current.map((item) =>
            item.id === id
              ? { ...item, token: result.token, attachment: result.attachment, progress: 100 }
              : item,
          ),
        );
      } catch (err) {
        setPending((current) => current.filter((item) => item.id !== id));
        toastError(err, `No se pudo subir ${file.name}`);
      }
    }
  };

  const removePending = (id: string) => {
    setPending((current) => {
      const target = current.find((item) => item.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return current.filter((item) => item.id !== id);
    });
  };

  /** Envía la grabación como adjunto de audio, sin texto. */
  const sendVoice = async () => {
    const recording = await voice.stop();
    if (!recording) return;

    const extension = recording.mimeType.includes('mp4') ? 'm4a' : 'webm';
    const file = new File([recording.blob], `mensaje-de-voz.${extension}`, {
      type: recording.mimeType,
    });

    try {
      const { token } = await uploadFile(file, {
        scope: 'message',
        durationMs: recording.durationMs,
      });
      await useChat.getState().sendMessage(conversation.id, {
        content: '',
        attachmentTokens: [token],
      });
    } catch (err) {
      toastError(err, 'No se pudo enviar el mensaje de voz');
    }
  };

  const discardVoice = async () => {
    await voice.stop({ discard: true });
  };

  const send = async () => {
    const content = draft.trim();
    const tokens = pending.map((item) => item.token).filter((token): token is string => Boolean(token));
    if (!content && tokens.length === 0) return;
    if (pending.some((item) => !item.token)) return; // Todavía subiendo.

    // Responde igual si se envía con clic o con Enter: es el gesto de haber
    // mandado algo, no el efecto hover de un botón.
    if (trailingRef.current) punch(trailingRef.current);

    // Los adjuntos ya subidos se muestran en el propio mensaje mientras sale.
    const attachments = pending
      .map((item) => item.attachment)
      .filter((attachment): attachment is Attachment => Boolean(attachment));

    setPending([]);
    textarea.current?.focus();

    // Un fallo no se avisa con un aviso flotante: el mensaje se queda en el
    // hilo marcado como no enviado, que es donde el usuario está mirando.
    await useChat
      .getState()
      .sendMessage(conversation.id, { content, attachmentTokens: tokens, attachments })
      .catch(() => undefined);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter') {
      const shouldSend = enterToSend ? !event.shiftKey : event.ctrlKey || event.metaKey;
      if (shouldSend) {
        event.preventDefault();
        void send();
      }
    }
    if (event.key === 'Escape' && replyTo) {
      useChat.getState().setReplyTo(conversation.id, null);
    }
  };

  const onChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    useChat.getState().setDraft(conversation.id, event.target.value);
    useChat.getState().sendTyping(conversation.id, event.target.value.length > 0);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files.length > 0) void addFiles(event.dataTransfer.files);
  };

  if (readOnly) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.blocked}>
          <Megaphone size={16} />
          Solo el equipo de la comunidad puede publicar en este canal.
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      {replyTo ? (
        <div className={styles.replyBar} ref={replyBarRef}>
          <span className={styles.replyText}>
            Respondiendo a <span className={styles.replyAuthor}>{replyTo.author?.displayName}</span>
            {replyTo.content ? ` · ${replyTo.content}` : ''}
          </span>
          <IconButton
            label="Cancelar respuesta"
            size="sm"
            onClick={() => useChat.getState().setReplyTo(conversation.id, null)}
          >
            <X size={14} />
          </IconButton>
        </div>
      ) : null}

      {pending.length > 0 ? (
        <div className={styles.attachments}>
          {pending.map((item) => (
            <div key={item.id} className={styles.chip}>
              {item.previewUrl ? (
                <img className={styles.chipThumb} src={item.previewUrl} alt="" />
              ) : null}
              <span className={styles.chipName}>{item.file.name}</span>
              <IconButton label="Quitar archivo" size="sm" onClick={() => removePending(item.id)}>
                <X size={12} />
              </IconButton>
              {item.progress < 100 ? (
                <span className={styles.progress} style={{ width: `${item.progress}%` }} />
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {voice.recording ? (
        <div
          className={clsx(styles.box, replyTo && styles.boxWithReply, styles.recording)}
          ref={recordingRef}
        >
          <IconButton label="Descartar grabación" danger onClick={() => void discardVoice()}>
            <Trash2 size={18} />
          </IconButton>

          <span className={styles.recordDot} aria-hidden />
          <span className={styles.recordTime}>{formatElapsed(voice.elapsed)}</span>

          {/* La onda se dibuja con el nivel real del micrófono. */}
          <span className={styles.wave} aria-hidden>
            {voice.levels.map((level, index) => (
              <span
                key={index}
                className={styles.waveBar}
                style={{ transform: `scaleY(${Math.max(0.08, level)})` }}
              />
            ))}
          </span>

          <IconButton label="Enviar mensaje de voz" onClick={() => void sendVoice()}>
            <Send size={18} />
          </IconButton>
        </div>
      ) : (
      <div
        className={clsx(styles.box, replyTo && styles.boxWithReply, dragging && styles.dropzone)}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <IconButton label="Adjuntar archivo" onClick={() => fileInput.current?.click()}>
          <Paperclip size={18} />
        </IconButton>
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          onChange={(event) => {
            if (event.target.files) void addFiles(event.target.files);
            event.target.value = '';
          }}
        />

        <textarea
          ref={textarea}
          className={styles.input}
          value={draft}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onBlur={() => useChat.getState().sendTyping(conversation.id, false)}
          onPaste={(event) => {
            const files = Array.from(event.clipboardData.files);
            if (files.length > 0) {
              event.preventDefault();
              void addFiles(files);
            }
          }}
          placeholder={`Escribe un mensaje…`}
          rows={1}
          maxLength={LIMITS.messageContent.max}
          aria-label="Mensaje"
        />

        <div className={clsx(styles.tools, styles.emojiAnchor)}>
          <IconButton
            label="Emojis"
            active={emojiOpen}
            onClick={() => setEmojiOpen((open) => !open)}
          >
            <Smile size={18} />
          </IconButton>
          {/*
            El botón cambia según lo que haya escrito: con texto envía, sin
            texto graba. Es un solo sitio para la acción principal, como espera
            cualquiera que venga del móvil.
          */}
          <span className={styles.trailing} ref={trailingRef}>
            {hasContent ? (
              <IconButton
                label="Enviar"
                className={styles.sendButton}
                onClick={() => void send()}
                disabled={sending || pending.some((item) => !item.token)}
              >
                <Send size={18} />
              </IconButton>
            ) : (
              <IconButton label="Grabar un mensaje de voz" onClick={() => void voice.start()}>
                <Mic size={18} />
              </IconButton>
            )}
          </span>

          {emojiOpen ? (
            <div className={styles.emojiPanel} role="listbox" aria-label="Emojis">
              {EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className={styles.emojiButton}
                  onClick={() => {
                    useChat.getState().setDraft(conversation.id, draft + emoji);
                    setEmojiOpen(false);
                    textarea.current?.focus();
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      )}
    </div>
  );
}

/** m:ss para el contador de grabación. */
function formatElapsed(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
