// Reader settings. Every book stores its own copy (#28); new books start from the saved defaults.
export const DEFAULTS = {
  theme: 'Cyber',
  font: 'Courier Prime',
  fontSize: 24,
  lineHeight: 1.5,
  align: 'left',
  typewriter: true,
  cps: 25,
  bionic: false,
  rsvp: false,
  wpm: 250,
  auto: false,
  autoBase: 900,         // ms pause after a sentence is fully shown…
  autoPerChar: 15,       // …plus this many ms per character (typing at 25 cps already paces the reading)
  sound: 'blip',
  volume: 60,            // % (#23)
  blipEvery: 2,
  keepAwake: true,       // keep the screen on while auto/RSVP runs (#12)
  minimal: false,        // minimal display (#25)
};

export const THEMES = ['Cyber', 'Dark', 'Light', 'Snow', 'Amber', 'Detective'];
export const FONTS = {
  'Courier Prime': "'Courier Prime', 'Courier New', monospace",
  'Monocraft': "'Monocraft', monospace",
  'Serif': "Georgia, 'Noto Serif', serif",
  'Sans': "system-ui, 'Roboto', sans-serif",
};
export const SOUNDS = { blip: 'Blip', soft: 'Soft click', square: 'Retro square', typewriter: 'Typewriter', off: 'Off' };
