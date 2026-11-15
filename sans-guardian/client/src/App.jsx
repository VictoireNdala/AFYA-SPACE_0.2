import { Component, useEffect, useState } from 'react';

/** Keeps the shell usable if one page fails to render. */
class PageBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <section className="panel">
        <h2>This view could not be displayed</h2>
        <p className="soft" style={{ marginTop: 6 }}>{String(this.state.error.message || this.state.error)}</p>
        <button className="btn" style={{ marginTop: 14 }} onClick={() => this.setState({ error: null })}>Try again</button>
      </section>
    );
  }
}
import Icon from './components/Icon.jsx';
import { MissionClock, LinkPill, Toasts } from './components/chrome.jsx';
import { VoiceDock } from './components/Voice.jsx';
import { VoiceProvider } from './lib/voice.jsx';
import { useApi, useApp } from './lib/live.jsx';
import Overview from './pages/Overview.jsx';
import Astronaut from './pages/Astronaut.jsx';
import Countermeasures from './pages/Countermeasures.jsx';
import DailyLog from './pages/DailyLog.jsx';
import Alerts from './pages/Alerts.jsx';
import LinkSync from './pages/LinkSync.jsx';
import Assistant from './pages/Assistant.jsx';
import Reports from './pages/Reports.jsx';
import Science from './pages/Science.jsx';

const PAGES = {
  overview: { icon: 'grid', label: 'Crew overview', title: <>Crew <em>overview</em></>, sub: 'SANS follow-up priority, open alerts and live vitals for the whole crew.', C: Overview },
  astronaut: { icon: 'eye', label: 'Astronaut', title: <>The <em>astronaut</em></>, sub: 'Ocular trends against the pre-flight baseline, explained follow-up score, exams and recovery.', img: { src: '/images/mri.jpg', pos: '50% 22%', caption: 'Neuro-ocular imaging' }, C: Astronaut },
  alerts: { icon: 'bell', label: 'Alerts', title: <>Graded <em>alerts</em></>, sub: 'Graded alerts for the flight surgeons. Each one states its rule, value and threshold.', img: { src: '/images/flight-surgeon.jpg', pos: '50% 45%', caption: 'Flight surgeons, ultrasound in flight' }, C: Alerts },
  daily: { icon: 'clipboard', label: 'Daily check-in', title: <>Daily <em>check-in</em></>, sub: 'Vision log, wellbeing and exercise. Under a minute a day.', img: { src: '/images/treadmill.jpg', pos: '45% 40%', caption: 'Exercise countermeasures' }, C: DailyLog },
  countermeasures: { icon: 'pill', label: 'Countermeasures', title: <><em>Counter</em>measures</>, sub: 'B-vitamin schedule, thigh-cuff and LBNP sessions with a mandatory safety checklist.', img: { src: '/images/vascular.jpg', pos: '50% 50%', zoom: 2.1, origin: '82% 42%', caption: 'Fluid shift and venous flow' }, C: Countermeasures },
  assistant: { icon: 'mic', label: 'Voice assistant', title: <>Voice <em>assistant</em></>, sub: 'Hands-free logging with a closed list of commands. No medical advice.', img: { src: '/images/iss-esa.jpg', pos: '50% 30%', caption: 'Hands-free work on the ISS (ESA)' }, C: Assistant },
  link: { icon: 'radio', label: 'Link & sync', title: <>Link <em>&amp;</em> sync</>, sub: 'Local-first storage and prioritised sync over a simulated low-bandwidth radio link.', img: { src: '/images/eva.jpg', pos: '50% 45%', zoom: 1.9, origin: '82% 44%', caption: 'Low Earth orbit' }, C: LinkSync },
  science: { icon: 'database', label: 'NASA data & model', title: <>NASA data <em>&amp;</em> model</>, sub: 'Real NASA open data on the eye model of SANS, and a prediction model trained on simulated missions.', C: Science },
  reports: { icon: 'file', label: 'Reports', title: <>Mission <em>reports</em></>, sub: 'End-of-mission reports for each astronaut and for the crew. Print or save as PDF.', C: Reports },
};
// One background per page. Overview, Link & sync and Reports keep their original photo.
const BACKDROPS = { overview: 'bg-iss-earth', astronaut: 'nasa-eye-exam', alerts: 'mri', daily: 'iss-esa', countermeasures: 'bg-iss-treadmill', assistant: 'flight-surgeon', link: 'bg-eva', reports: 'bg-milkyway', science: 'treadmill' };
const BG_POS = { 'bg-iss-earth': '30% 45%', 'nasa-eye-exam': '62% 35%', mri: '50% 30%', 'iss-esa': '50% 35%', 'bg-iss-treadmill': '45% 40%', 'flight-surgeon': '55% 45%', 'bg-eva': '60% 45%', 'bg-milkyway': '60% 40%', treadmill: '50% 35%' };

/** Space photographs behind the interface, darkened, cross-fading between pages. */
function Backdrop({ page }) {
  const active = BACKDROPS[page] ?? 'bg-milkyway';
  return (
    <div className="backdrop" aria-hidden="true">
      {Object.keys(BG_POS).map((k) => (
        <img key={k} src={`/images/${k}.jpg`} loading="lazy" alt="" className={k === active ? 'on' : ''} style={{ objectPosition: BG_POS[k] }} />
      ))}
    </div>
  );
}

const GROUPS = [
  ['Monitor', ['overview', 'astronaut', 'alerts']],
  ['Crew tools', ['daily', 'countermeasures', 'assistant']],
  ['Science', ['science']],
  ['Operations', ['link', 'reports']],
];

const fromHash = () => {
  const k = location.hash.replace('#/', '');
  return PAGES[k] ? k : 'overview';
};

export default function App() {
  const [page, setPage] = useState(fromHash);
  const { connected } = useApp();
  const { data: alertData } = useApi('/alerts');
  const urgentOpen = (alertData?.alerts ?? []).filter((a) => !a.acked && a.level === 'URGENT').length + (alertData?.live ?? []).filter((a) => !a.acked && !a.resolved && a.level === 'URGENT').length;

  useEffect(() => {
    const on = () => setPage(fromHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = (k) => {
    location.hash = `/${k}`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const P = PAGES[page];

  return (
    <VoiceProvider>
      <Backdrop page={page} />
      <div className="shell">
        <aside className="sidebar">
          <div className="brand">
            <span className="brand-word">SANS<em>guardian</em></span>
            <span className="brand-sub">Crew vision &amp; health</span>
          </div>
          <nav className="nav" aria-label="Main">
            {GROUPS.map(([g, keys]) => (
              <div key={g} style={{ display: 'contents' }}>
                <div className="nav-group eyebrow">{g}</div>
                {keys.map((k) => (
                  <button key={k} className={`nav-item ${page === k ? 'active' : ''}`} onClick={() => go(k)} aria-current={page === k ? 'page' : undefined}>
                    <Icon name={PAGES[k].icon} size={16} /> {PAGES[k].label}
                    {k === 'alerts' && urgentOpen > 0 && <span className="count">{urgentOpen}</span>}
                  </button>
                ))}
              </div>
            ))}
          </nav>
          <div className="sidebar-foot">
            <div className="row small" style={{ gap: 8 }}>
              <span className={`dot ${connected ? 'live' : 'off'}`} />
              <span className="soft">{connected ? 'Onboard server connected' : 'Onboard server offline'}</span>
            </div>
            <p className="disclaimer-mini">Research prototype for the NASA Space Apps Challenge 2026, Lubumbashi. Not a medical device. Simulated data.</p>
          </div>
        </aside>

        <main className="main">
          <div className="proto-strip" role="note">
            <b>Research prototype</b><span className="sep" />Not a medical device<span className="sep" />Simulated data
            <span className="right"><LinkPill onOpen={() => go('link')} /><MissionClock /></span>
          </div>
          <header className="topbar">
            <div className="page-title">
              <div className="eyebrow" style={{ marginBottom: 14 }}>Long-duration mission · simulated</div>
              <h1>{P.title}</h1>
              <p>{P.sub}</p>
            </div>
            {P.img && (
              <figure className="page-figure">
                <img src={P.img.src} alt="" style={{ objectPosition: P.img.pos, ...(P.img.zoom ? { transform: `scale(${P.img.zoom})`, transformOrigin: P.img.origin } : {}) }} />
                <figcaption>{P.img.caption}</figcaption>
              </figure>
            )}
          </header>
          <div className="page" key={page}>
            <PageBoundary>
              <P.C go={go} />
            </PageBoundary>
          </div>
        </main>
      </div>
      <Toasts onOpen={() => go('alerts')} />
      <VoiceDock hidden={page === 'assistant'} onOpenFull={() => go('assistant')} />
    </VoiceProvider>
  );
}
