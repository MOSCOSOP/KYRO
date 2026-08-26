import { useMemo, useRef, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { dur } from '@/lib/motion';
import {
  Bell,
  Home,
  LogOut,
  MessageCircle,
  Phone,
  Search,
  Settings,
  SmilePlus,
  User,
  Users,
} from 'lucide-react';
import type { PresenceStatus } from '@kyro/shared';
import { brand } from '@/config/brand';
import { Logo } from '@/components/brand/Logo';
import { PRESENCE_LABEL } from '@/lib/format';
import { useChat } from '@/store/chat';
import { useNotifications } from '@/store/notifications';
import { useSession } from '@/store/session';
import { useUI } from '@/store/ui';
import { Avatar, PresenceDot } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Feedback';
import { Menu, MenuHeading, MenuItem, MenuSeparator, useMenu } from '@/components/ui/Menu';
import { CustomStatusModal } from '@/components/profile/CustomStatusModal';
import { NewConversationModal } from '@/components/chat/NewConversationModal';
import { SavedMessagesModal } from '@/components/chat/SavedMessagesModal';
import { useIsCompact } from '@/hooks/useMediaQuery';
import styles from './AppShell.module.css';

const STATUSES: Exclude<PresenceStatus, 'offline'>[] = ['available', 'away', 'dnd', 'invisible'];

export function AppShell({ children }: { children: ReactNode }) {
  const user = useSession((state) => state.user);
  const setPresence = useSession((state) => state.setPresence);
  const logout = useSession((state) => state.logout);
  const openSearch = useUI((state) => state.openSearch);
  const conversations = useChat((state) => state.conversations);
  const unreadNotifications = useNotifications((state) => state.unreadCount);
  const navigate = useNavigate();
  const menu = useMenu();
  const avatarRef = useRef<HTMLButtonElement>(null);
  const modal = useUI((state) => state.modal);
  const openModal = useUI((state) => state.openModal);
  const openProfile = useUI((state) => state.openProfile);
  const compact = useIsCompact();
  const closeModal = useUI((state) => state.closeModal);
  const navRef = useRef<HTMLElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const indicatorPlaced = useRef(false);
  const location = useLocation();

  const unreadMessages = useMemo(
    () => conversations.reduce((total, conversation) => total + conversation.unreadCount, 0),
    [conversations],
  );

  // El destino activo no cambia de fondo de golpe: una losa de luz se
  // desliza y cambia de forma hasta encajar en el nuevo icono. Se mide en
  // píxeles reales porque el carril cambia de vertical a horizontal en
  // móvil, y ahí no hay un eje de CSS común entre ambas disposiciones.
  useGSAP(
    () => {
      const nav = navRef.current;
      const indicator = indicatorRef.current;
      if (!nav || !indicator) return;
      const active = nav.querySelector<HTMLElement>(`a.${styles.navItemActive}`);
      if (!active) {
        gsap.to(indicator, { opacity: 0, duration: dur('fast') });
        return;
      }

      const target = {
        left: active.offsetLeft,
        top: active.offsetTop,
        width: active.offsetWidth,
        height: active.offsetHeight,
        opacity: 1,
      };

      if (!indicatorPlaced.current) {
        gsap.set(indicator, target);
        indicatorPlaced.current = true;
      } else {
        gsap.to(indicator, { ...target, duration: dur('normal') });
      }
    },
    { dependencies: [location.pathname, compact], scope: navRef },
  );

  return (
    <div className={styles.shell}>
      <nav ref={navRef} className={styles.nav} aria-label="Navegación principal">
        <span ref={indicatorRef} className={styles.navIndicator} aria-hidden />

        <div className={styles.brandTile} aria-hidden>
          <Logo size="sm" markOnly className={styles.brand} />
        </div>

        <div className={styles.navGroup}>
          <NavItem to="/" label="Inicio" icon={<Home size={19} />} end />
          <NavItem
            to="/mensajes"
            label="Mensajes"
            icon={<MessageCircle size={19} />}
            badge={unreadMessages}
          />
          <NavItem to="/comunidades" label="Comunidades" icon={<Users size={19} />} />
          <NavItem
            to="/actividad"
            label="Actividad"
            icon={<Bell size={19} />}
            badge={unreadNotifications}
          />
          {/*
            En una barra inferior no caben siete destinos con su nombre. En
            pantallas estrechas se queda lo que se usa a diario y el resto vive en
            el menú del avatar, que sigue a un toque de distancia.
          */}
          <NavItem to="/llamadas" label="Llamadas" icon={<Phone size={19} />} desktopOnly />
        </div>

        <span className={styles.navSpacer} />

        <div className={styles.navFooter}>
          <button
            type="button"
            className={clsx(styles.navItem, styles.desktopOnly)}
            onClick={openSearch}
            aria-label="Buscar en KYRO"
            title="Buscar (Ctrl+K)"
          >
            <Search size={19} />
            <span className={styles.navLabel}>Buscar</span>
          </button>
          <NavItem to="/ajustes" label="Ajustes" icon={<Settings size={19} />} desktopOnly />
          {user ? (
            <button
              ref={avatarRef}
              type="button"
              className={styles.presenceButton}
              onClick={() => menu.openFrom(avatarRef.current, 'start')}
              aria-label={`Tu perfil · ${PRESENCE_LABEL[user.status]}`}
            >
              <Avatar user={user} size="md" presence onBackground />
            </button>
          ) : null}
        </div>
      </nav>

      {children}

      {menu.anchor && user ? (
        <Menu anchor={menu.anchor} open={menu.open} onClose={menu.close} label="Tu cuenta">
          <MenuHeading>{user.displayName}</MenuHeading>
          {STATUSES.map((status) => (
            <MenuItem
              key={status}
              icon={<PresenceDot status={status} size="sm" />}
              onSelect={() => {
                void setPresence(status);
                menu.close();
              }}
            >
              {PRESENCE_LABEL[status]}
            </MenuItem>
          ))}
          <MenuSeparator />
          <MenuItem
            icon={<SmilePlus size={16} />}
            onSelect={() => {
              openModal('custom-status');
              menu.close();
            }}
          >
            Estado personalizado
          </MenuItem>
          <MenuItem
            icon={<User size={16} />}
            onSelect={() => {
              openProfile(user.username);
              menu.close();
            }}
          >
            Ver mi perfil
          </MenuItem>

          {/* En móvil estos no caben en la barra inferior: su sitio es este. */}
          {compact ? (
            <>
              <MenuSeparator />
              <MenuItem
                icon={<Search size={16} />}
                onSelect={() => {
                  openSearch();
                  menu.close();
                }}
              >
                Buscar
              </MenuItem>
              <MenuItem
                icon={<Phone size={16} />}
                onSelect={() => {
                  navigate('/llamadas');
                  menu.close();
                }}
              >
                Llamadas
              </MenuItem>
              <MenuItem
                icon={<Settings size={16} />}
                onSelect={() => {
                  navigate('/ajustes');
                  menu.close();
                }}
              >
                Ajustes
              </MenuItem>
            </>
          ) : null}

          <MenuSeparator />
          <MenuItem
            icon={<LogOut size={16} />}
            danger
            onSelect={() => {
              void logout();
              menu.close();
            }}
          >
            Cerrar sesión
          </MenuItem>
        </Menu>
      ) : null}

      <CustomStatusModal open={modal === 'custom-status'} onClose={closeModal} />
      <NewConversationModal open={modal === 'new-conversation'} onClose={closeModal} />
      <SavedMessagesModal open={modal === 'saved-messages'} onClose={closeModal} />
    </div>
  );
}

function NavItem({
  to,
  label,
  icon,
  badge = 0,
  end,
  desktopOnly,
}: {
  to: string;
  label: string;
  icon: ReactNode;
  badge?: number;
  end?: boolean;
  /** Se oculta en la barra inferior; vive en el menú del avatar. */
  desktopOnly?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      aria-label={label}
      className={({ isActive }) =>
        clsx(styles.navItem, isActive && styles.navItemActive, desktopOnly && styles.desktopOnly)
      }
      title={`${label} ${brand.titleSeparator} ${brand.name}`}
    >
      {icon}
      <span className={styles.navLabel}>{label}</span>
      {badge > 0 ? (
        <span className={styles.navBadge}>
          <Badge count={badge} />
        </span>
      ) : null}
    </NavLink>
  );
}

/**
 * Zona de trabajo de dos paneles (lista + contenido). En pantallas pequeñas
 * solo se ve uno: es la misma arquitectura, adaptada.
 */
export function Workspace({
  sidebar,
  children,
  showContent = true,
}: {
  sidebar?: ReactNode;
  children: ReactNode;
  /** En compacto: indica si toca mostrar el contenido en lugar de la lista. */
  showContent?: boolean;
}) {
  const compact = useIsCompact();

  if (!sidebar) {
    return (
      <div className={clsx(styles.workspace, styles.workspaceWide)}>
        <section className={styles.content}>{children}</section>
      </div>
    );
  }

  return (
    <div className={styles.workspace}>
      <aside
        className={clsx(styles.sidebar, compact && showContent && styles.paneHidden)}
        aria-label="Lista"
      >
        {sidebar}
      </aside>
      <section className={clsx(styles.content, compact && !showContent && styles.paneHidden)}>
        {children}
      </section>
    </div>
  );
}
