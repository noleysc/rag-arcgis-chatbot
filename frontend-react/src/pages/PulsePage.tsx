import Dashboard from "../components/Dashboard/Dashboard";
import PageHeader from "../components/PageHeader/PageHeader";
import { useMeetings } from "../hooks/useMeetings";

interface PulsePageProps {
  onAsk: (question: string) => void;
}

export default function PulsePage({ onAsk }: PulsePageProps) {
  const { meetings, loading, error } = useMeetings(3);

  return (
    <>
      <PageHeader
        title="Community Pulse"
        subtitle="Upcoming events, board meetings, and the latest news from around Estero."
      />
      <Dashboard meetings={meetings} meetingsLoading={loading} meetingsError={error} onSend={onAsk} />
    </>
  );
}
