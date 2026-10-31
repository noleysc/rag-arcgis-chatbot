import logo from "../../assets/engage-estero-logo.png";
import logoLight from "../../assets/engage-estero-logo-light.png";

export default function ChatEmptyState() {
  return (
    <div className="chat-empty">
      {/* Navy logo on light, the light variant on dark (theme-dark.css). */}
      <img className="chat-empty-logo chat-empty-logo-light" src={logo} alt="" />
      <img className="chat-empty-logo chat-empty-logo-dark" src={logoLight} alt="" />
      <h2>Ask a question about Estero</h2>
      <p>Get answers from planning documents, board records, and meeting minutes.</p>
    </div>
  );
}
