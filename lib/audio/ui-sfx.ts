export type UiSoundName =
  | "move"
  | "focus"
  | "confirm"
  | "select"
  | "back"
  | "cancel"
  | "notify";

const STORAGE_KEY = "emustore.ui-sfx.enabled.v1";

type ToneProfile = {
  startFrequency: number;
  endFrequency: number;
  duration: number;
  volume: number;
  waveform: OscillatorType;
};

const TONE_PROFILES: Record<"move" | "confirm" | "back" | "notify", ToneProfile> = {
  move: { startFrequency: 470, endFrequency: 560, duration: 0.045, volume: 0.018, waveform: "sine" },
  confirm: { startFrequency: 510, endFrequency: 760, duration: 0.075, volume: 0.026, waveform: "triangle" },
  back: { startFrequency: 650, endFrequency: 390, duration: 0.075, volume: 0.022, waveform: "sine" },
  notify: { startFrequency: 620, endFrequency: 880, duration: 0.11, volume: 0.024, waveform: "triangle" },
};

let audioContext: AudioContext | null = null;

export function isUiSoundEnabled(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

export function setUiSoundEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(enabled));
  } catch {
    // Keep the current page usable when browser storage is unavailable.
  }
}

export function unlockUiSounds(): void {
  if (typeof window === "undefined" || !window.AudioContext) return;

  try {
    audioContext ??= new window.AudioContext();
    if (audioContext.state === "suspended") {
      void audioContext.resume().catch(() => undefined);
    }
  } catch {
    audioContext = null;
  }
}

function playTone(profile: ToneProfile): void {
  if (!audioContext) return;
  if (audioContext.state === "suspended") {
    void audioContext.resume().then(() => playTone(profile)).catch(() => undefined);
    return;
  }

  const now = audioContext.currentTime;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = profile.waveform;
  oscillator.frequency.setValueAtTime(profile.startFrequency, now);
  oscillator.frequency.exponentialRampToValueAtTime(profile.endFrequency, now + profile.duration);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(profile.volume, now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + profile.duration);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + profile.duration);
}

export function playUiSound(sound: UiSoundName): void {
  if (!isUiSoundEnabled()) return;
  unlockUiSounds();

  const profileName = sound === "move" || sound === "focus"
    ? "move"
    : sound === "confirm" || sound === "select"
      ? "confirm"
      : sound === "back" || sound === "cancel"
        ? "back"
        : "notify";
  playTone(TONE_PROFILES[profileName]);
}
