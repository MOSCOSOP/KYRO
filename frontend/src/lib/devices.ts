/**
 * Micrófono y cámara preferidos.
 *
 * La elección se guarda en el navegador (es propia de este equipo, no de la
 * cuenta) y la lee directamente `requestMedia`, de modo que cualquier llamada
 * —privada o de sala— arranca con los dispositivos correctos sin que haya que
 * pasarlos por toda la aplicación.
 */

const KEY = 'kyro.devices';

export interface DevicePreference {
  audioInput?: string;
  videoInput?: string;
}

export function getPreferredDevices(): DevicePreference {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as DevicePreference;
  } catch {
    return {};
  }
}

export function setPreferredDevice(kind: keyof DevicePreference, deviceId: string | null) {
  const current = getPreferredDevices();
  if (deviceId) current[kind] = deviceId;
  else delete current[kind];
  localStorage.setItem(KEY, JSON.stringify(current));
}

/**
 * `ideal` y no `exact` a propósito: si el dispositivo elegido ya no está
 * (auriculares desconectados), la llamada entra igual con otro en vez de fallar.
 */
export function audioConstraints(): MediaTrackConstraints {
  const preferred = getPreferredDevices().audioInput;
  return {
    echoCancellation: true,
    noiseSuppression: true,
    ...(preferred ? { deviceId: { ideal: preferred } } : {}),
  };
}

export function preferredVideoDevice() {
  return getPreferredDevices().videoInput;
}

export interface DeviceOption {
  deviceId: string;
  label: string;
}

/**
 * Lista los dispositivos disponibles. Sin permiso concedido, el navegador
 * oculta las etiquetas: en ese caso se devuelve la lista vacía para no mostrar
 * "Dispositivo 1, Dispositivo 2", que no dice nada.
 */
export async function listDevices(): Promise<{ audio: DeviceOption[]; video: DeviceOption[] }> {
  if (!navigator.mediaDevices?.enumerateDevices) return { audio: [], video: [] };

  const devices = await navigator.mediaDevices.enumerateDevices();
  const pick = (kind: MediaDeviceKind) =>
    devices
      .filter((device) => device.kind === kind && device.deviceId && device.label)
      .map((device) => ({ deviceId: device.deviceId, label: device.label }));

  return { audio: pick('audioinput'), video: pick('videoinput') };
}
