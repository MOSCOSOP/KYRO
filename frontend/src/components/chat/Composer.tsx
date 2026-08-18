import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from 'react';
import clsx from 'clsx';
import { Megaphone, Paperclip, Send, Smile, X } from 'lucide-react';
import type { Attachment, Conversation } from '@kyro/shared';
import { LIMITS, ROLE_RANK } from '@kyro/shared';
import { uploadFile } from '@/lib/api';
import { useChat } from '@/store/chat';
import { useSession } from '@/store/session';
import { toastError } from '@/store/ui';
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
  const textarea = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

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

  const send = async () => {
    const content = draft.trim();
    const tokens = pending.map((item) => item.token).filter((token): token is string => Boolean(token));
    if (!content && tokens.length === 0) return;
    if (pending.some((item) => !item.token)) return; // Todavía subiendo.

    try {
      await useChat.getState().sendMessage(conversation.id, { content, attachmentTokens: tokens });
      setPending([]);
      textarea.current?.focus();
    } catch (err) {
      toastError(err, 'No se pudo enviar el mensaje');
    }
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
        <div className={styles.replyBar}>
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
          <IconButton
            label="Enviar"
            onClick={() => void send()}
            disabled={
              sending ||
              (!draft.trim() && pending.length === 0) ||
              pending.some((item) => !item.token)
            }
          >
            <Send size={18} />
          </IconButton>

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
    </div>
  );
}
