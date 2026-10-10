import './assistant-signal.css';

/** Decorative identity. The adjacent text always communicates the actual voice state. */
export default function AssistantSignal({
  active = false,
  small = false,
}: {
  active?: boolean;
  small?: boolean;
}) {
  return (
    <span
      className={`insight-signal${active ? ' is-active' : ''}${small ? ' is-small' : ''}`}
      aria-hidden="true"
    >
      <span className="signal-halo" />
      <span className="signal-shell" />
      <span className="signal-rim" />
      <span className="signal-core" />
      <span className="signal-wave">
        <i />
        <i />
        <i />
        <i />
        <i />
      </span>
    </span>
  );
}
