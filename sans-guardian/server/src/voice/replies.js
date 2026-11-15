// Spoken replies of the voice assistant, in English and French. Replies read values and rules; they never advise.
import { dayLabel, LANDING_DAY } from '../config.js';

const FR_TITLES = {
  'Total retinal thickness change vs baseline': 'variation de l’épaisseur rétinienne par rapport à la référence',
  'Refraction change vs baseline': 'variation de la réfraction par rapport à la référence',
  'Intraocular pressure': 'pression intraoculaire',
  'Persistent change after landing': 'changement persistant après l’atterrissage',
  'Safety signal during countermeasure session': 'signal de sécurité pendant une séance de contre-mesure',
  'Venous safety signal in daily log': 'signal veineux dans le journal du jour',
  'Supplement adherence below target': 'observance du supplément sous l’objectif',
  'Scheduled exam not recorded': 'examen prévu non enregistré',
  'Heart rate': 'rythme cardiaque',
  'Oxygen saturation': 'saturation en oxygène',
  'Body temperature': 'température corporelle',
  Sleep: 'sommeil',
  'Stress index': 'indice de stress',
  'Radiation dose rate': 'débit de dose de radiation',
};

const num = (v, lang, digits = 1) => {
  const s = Number(v).toFixed(digits).replace(/\.0+$/, '');
  return lang === 'fr' ? s.replace('.', ',') : s;
};
const signed = (v, lang, digits = 1) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${num(Math.abs(v), lang, digits)}`;

export function makeReplies(lang) {
  const fr = lang === 'fr';
  const t = (en, frText) => (fr ? frText : en);
  const title = (x) => (fr ? FR_TITLES[x] ?? x : x);
  const level = (lv) => t(lv === 'URGENT' ? 'urgent' : lv === 'WATCH' ? 'watch' : 'info', lv === 'URGENT' ? 'urgente' : lv === 'WATCH' ? 'à surveiller' : 'info');
  const risk = (lv) => t(lv, { high: 'élevé', moderate: 'modéré', low: 'faible' }[lv] ?? lv);
  // Agrees with "constantes" (plural) in French.
  const liveWord = [t('stable', 'stables'), t('under watch', 'sous surveillance'), t('critical', 'critiques')];

  const vital = {
    hr: (v) => t(`heart rate ${v.hr} beats per minute`, `rythme cardiaque ${v.hr} battements par minute`),
    spo2: (v) => t(`oxygen saturation ${v.spo2} percent`, `saturation en oxygène ${v.spo2} pour cent`),
    temp: (v) => t(`temperature ${num(v.temp, lang)} degrees`, `température ${num(v.temp, lang)} degrés`),
    sleep: (v) => {
      const h = Math.floor(v.sleep);
      const mn = Math.round((v.sleep - h) * 60);
      return mn ? t(`sleep ${h} hours ${mn} minutes`, `sommeil ${h} heures ${mn}`) : t(`sleep ${h} hours`, `sommeil ${h} heures`);
    },
    stress: (v) => t(`stress index ${v.stress} out of 100`, `indice de stress ${v.stress} sur 100`),
    radiation: (v) => t(`radiation ${num(v.radiation, lang)} microsieverts per hour`, `radiation ${num(v.radiation, lang)} microsieverts par heure`),
  };

  const eye = {
    retina: (c) => (c.retina.delta == null ? t('no retinal measurement yet', 'pas encore de mesure rétinienne') : t(`retinal thickness ${signed(c.retina.delta, lang, 0)} micrometres versus baseline`, `épaisseur rétinienne ${signed(c.retina.delta, lang, 0)} micromètres par rapport à la référence`)),
    refraction: (c) => (c.refraction.delta == null ? t('no refraction measurement yet', 'pas encore de mesure de réfraction') : t(`refraction ${signed(c.refraction.delta, lang, 2)} diopters versus baseline`, `réfraction ${signed(c.refraction.delta, lang, 2)} dioptries par rapport à la référence`)),
    iop: (c) => (c.iop.value == null ? t('no eye pressure measurement yet', 'pas encore de mesure de pression oculaire') : t(`eye pressure ${num(c.iop.value, lang)} millimetres of mercury`, `pression oculaire ${num(c.iop.value, lang)} millimètres de mercure`)),
  };

  // Reminders are built in English by the views service; translate the known sentence patterns.
  const reminder = (s) =>
    !fr
      ? s
      : s
          .replace('B-vitamin supplement not logged yet today.', 'Supplément de vitamines B pas encore enregistré aujourd’hui.')
          .replace('Daily vision log not filled in yet.', 'Journal de vision du jour pas encore rempli.')
          .replace(/^Exam due: (.*)\.$/, 'Examen à faire : $1.')
          .replace(/^Exam overdue: (.*)\.$/, 'Examen en retard : $1.')
          .replace('Thigh-cuff session in progress.', 'Séance de brassards en cours.')
          .replace('LBNP session in progress.', 'Séance LBNP en cours.')
          .replace(/Flight day (\d+)/, 'jour de vol $1')
          .replace(/Pre-flight baseline (\d)/, 'référence pré-vol $1')
          .replace('Landing (R+0)', 'atterrissage (R+0)')
          .replace('R+6 months', 'R+6 mois');
  const day = (d) => (!fr ? dayLabel(d) : d < 0 ? `L${d}` : d < LANDING_DAY ? `jour de vol ${d}` : d === LANDING_DAY ? 'atterrissage' : `R+${d - LANDING_DAY}`);

  return {
    t,
    day,
    reminder,
    title,
    level,
    risk,
    liveWord,
    vital,
    eye,
    help: (examples) => t(`You can say: ${examples.join('; ')}.`, `Tu peux dire : ${examples.join(' ; ')}.`),
    emergency: t(
      'In a real emergency, follow the onboard emergency procedure and call the crew medical officer and the flight surgeon now. This prototype only logs and reads data.',
      'En cas d’urgence réelle, applique la procédure d’urgence de bord et appelle tout de suite l’officier médical et le médecin de vol. Ce prototype ne fait qu’enregistrer et lire des données.',
    ),
    medical: t(
      'I cannot give medical advice. I can log your symptoms so the flight surgeon receives them with the next radio pass.',
      'Je ne peux pas donner d’avis médical. Je peux enregistrer tes symptômes pour que le médecin de vol les reçoive au prochain passage radio.',
    ),
    empty: t('I did not hear a command.', 'Je n’ai pas entendu de commande.'),
    unknown: t("I did not recognise that command. Say 'help' to hear the list.", "Je n’ai pas reconnu cette commande. Dis « aide » pour entendre la liste."),
  };
}
