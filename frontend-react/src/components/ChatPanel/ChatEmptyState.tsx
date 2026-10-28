import logo from "../../assets/logo.png";

export default function ChatEmptyState() {
  return (
    <div className="chat-empty">
      <img className="chat-empty-logo" src={logo} alt="" />
      <h2>Ask a question about Estero</h2>
      <p>Get answers from planning documents, board records, and meeting minutes.</p>
    </div>
  );
}
