// Closed-vocabulary command parser for the onboard voice assistant (English and French).
// Rule/regex based on purpose: the assistant can only trigger known actions or read known values,
// and never gives medical advice. Text is lower-cased and accents are removed before matching.
// Crew queries (status, alerts, vital signs) come from the AFYA SPACE voice-assistant branch.

const NUMBERS = { zero: 0, none: 0, aucun: 0, one: 1, un: 1, une: 1, two: 2, deux: 2, three: 3, trois: 3 };

const ROLE_WORDS = [
  ['AST-001', /\b(commander|commandant|commandante)\b/],
  ['AST-002', /\b(pilot|pilote)\b/],
  ['AST-003', /\b(flight engineer|engineer|ingenieur)\b/],
  ['AST-004', /\b(medical officer|officier medical|medecin de bord)\b/],
  ['AST-005', /\b(mission specialist|specialist|specialiste)\b/],
  ['AST-006', /\b(science officer|scientist|scientifique)\b/],
];
const DIGIT_WORDS = { one: 1, un: 1, une: 1, two: 2, deux: 2, three: 3, trois: 3, four: 4, quatre: 4, five: 5, cinq: 5, six: 6 };

const RULES = [
  { intent: 'HELP', re: /\b(help|what can i say|what can you do|aide|commandes?|que peux[- ]tu)\b/ },
  { intent: 'EMERGENCY', re: /\b(emergency|mayday|urgence|secours)\b/ },
  { intent: 'START_SESSION', type: 'THIGH_CUFF', re: /\b(start|begin|demarrer|commencer|lancer)\b.*\b(cuffs?|thigh|brassards?)\b/ },
  { intent: 'START_SESSION', type: 'LBNP', re: /\b(start|begin|demarrer|commencer|lancer)\b.*\b(lbnp|lower body|negative pressure)\b/ },
  { intent: 'STOP_SESSION', re: /\b(stop|end|finish|arreter|terminer)\b.*\b(cuffs?|thigh|brassards?|lbnp|session|seance)\b/ },
  { intent: 'LOG_SUPPLEMENT', re: /\b(log|logged|took|taken|record|j'ai pris|prise?)\b.*\b(supplements?|vitamins?|pills?|vitamines?|complements?)\b|\b(supplements?|vitamins?|vitamines?)\b.*\b(taken|pris)\b/ },
  { intent: 'LOG_BLURRY', re: /\b(blurry|blurred|vision floue)\b/ },
  { intent: 'ALERTS', re: /\b(alerts?|alarms?|warnings?|problems?|alertes?|problemes?|anomalies?)\b/ },
  { intent: 'VITAL', metric: 'hr', re: /\b(heart rate|pulse|bpm|rythme cardiaque|pouls|frequence cardiaque|coeur)\b/ },
  { intent: 'VITAL', metric: 'spo2', re: /\b(oxygen|spo2|saturation|oxygene)\b/ },
  { intent: 'VITAL', metric: 'temp', re: /\b(temperature|fever|fievre)\b/ },
  { intent: 'VITAL', metric: 'sleep', re: /\b(sleep|slept|sommeil|dormi)\b/ },
  { intent: 'VITAL', metric: 'stress', re: /\bstress\b/ },
  { intent: 'VITAL', metric: 'radiation', re: /\b(radiation|rayonnement|dose rate)\b/ },
  { intent: 'EYE', metric: 'retina', re: /\b(retina|retinal|oct|retine|retinienne|epaisseur)\b/ },
  { intent: 'EYE', metric: 'refraction', re: /\b(refraction|diopters?|dioptries?)\b/ },
  { intent: 'EYE', metric: 'iop', re: /\b(iop|eye pressure|intraocular|pression (de l'oeil|oculaire|intraoculaire))\b/ },
  { intent: 'READ_REMINDERS', re: /\b(reminders?|today|rappels?|aujourd'hui)\b/ },
  { intent: 'LINK_STATUS', re: /\b(link|sync|radio|liaison|synchro)\b/ },
  { intent: 'CREW_STATUS', re: /\b(status|crew|health|report|how is|how are|etat|equipage|sante|bilan|situation|comment va|comment vont)\b/ },
];

const MEDICAL_QUESTION = /\b(should i|what should|is it (bad|serious|normal|dangerous)|diagnos\w*|treat\w*|(what|which|quelle) dose|medicine|medication|medicament|dois[- ]je|est[- ]ce (grave|normal|dangereux)|que dois)\b/;

/** Lower-case, strip accents and punctuation (apostrophes are kept for "j'ai", "aujourd'hui"). */
export function normalise(input) {
  return String(input ?? '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’`]/g, "'")
    .replace(/[.!?,;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Astronaut named in the sentence: "AST-003", "astronaut 3", "astronaute trois", or a crew role. */
export function findTarget(text) {
  const m = text.match(/\bast[- ]?0*([1-6])\b/) || text.match(/\b(?:astronaut|astronaute|crew member|membre)\s+(?:number |numero )?([1-6]|one|two|three|four|five|six|un|une|deux|trois|quatre|cinq|six)\b/);
  if (m) {
    const n = /^\d$/.test(m[1]) ? Number(m[1]) : DIGIT_WORDS[m[1]];
    return `AST-00${n}`;
  }
  for (const [code, re] of ROLE_WORDS) if (re.test(text)) return code;
  return null;
}

/** Parse a transcript into an intent. Returns {intent, params, text} (+ target when an astronaut is named). */
export function parseCommand(input) {
  const text = normalise(input);
  if (!text) return { intent: 'EMPTY', params: {}, text };
  if (MEDICAL_QUESTION.test(text)) return { intent: 'MEDICAL_QUESTION', params: {}, text };
  const target = findTarget(text);
  const out = (intent, params = {}) => (target ? { intent, params, text, target } : { intent, params, text });
  for (const r of RULES) {
    if (!r.re.test(text)) continue;
    if (r.intent === 'LOG_BLURRY') {
      // The last number word or digit 0-3 in the sentence is the level ("... level two").
      let level = null;
      for (const t of text.split(' ')) {
        if (Object.hasOwn(NUMBERS, t)) level = NUMBERS[t];
        else if (/^[0-3]$/.test(t)) level = Number(t);
      }
      return out('LOG_BLURRY', { level });
    }
    if (r.metric) return out(r.intent, { metric: r.metric });
    return out(r.intent, r.type ? { type: r.type } : {});
  }
  // A crew member named on their own ("AST-003?", "le pilote") is a status request for that person.
  if (target) return out('CREW_STATUS');
  return { intent: 'UNKNOWN', params: {}, text };
}

export const COMMAND_EXAMPLES = [
  'Log supplement taken',
  'Blurry vision today, level two',
  'Start cuff session',
  'Stop cuff session',
  'Crew status',
  'Alerts',
  'Heart rate of AST-003',
  'Retinal thickness of the pilot',
  "Read today's reminders",
  'Link status',
  'Help',
];

export const COMMAND_EXAMPLES_FR = [
  "J'ai pris ma vitamine",
  'Vision floue aujourd\'hui, niveau deux',
  'Démarrer la séance de brassards',
  'Arrêter la séance',
  "État de l'équipage",
  'Alertes',
  "Rythme cardiaque d'AST-003",
  'Épaisseur rétinienne du pilote',
  'Lire les rappels',
  'État de la liaison',
  'Aide',
];
