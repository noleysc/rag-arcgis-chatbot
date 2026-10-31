import palmArt from "../assets/pulse-palms.svg";
import Dashboard from "../components/Dashboard/Dashboard";
import { CalendarIcon } from "../components/Icons/Icons";
import { useMeetings } from "../hooks/useMeetings";

interface PulsePageProps {
  onAsk: (question: string) => void;
}

export default function PulsePage({ onAsk }: PulsePageProps) {
  const { meetings, loading, error } = useMeetings(3);

  return (
    <div className="pulse-page">
      <section className="pulse-hero" aria-labelledby="pulse-title">
        <img className="pulse-hero-art" src={palmArt} alt="" />
        <span className="pulse-hero-icon" aria-hidden="true">
          <CalendarIcon size={30} />
        </span>
        <div className="pulse-hero-text">
          <h1 id="pulse-title">Community Pulse</h1>
          <p>Community events and Village meetings in Estero</p>
        </div>
      </section>
      <Dashboard meetings={meetings} meetingsLoading={loading} meetingsError={error} onSend={onAsk} />
    </div>
  );
}
