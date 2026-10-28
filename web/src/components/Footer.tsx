export function Footer() {
  return (
    <footer className="footer">
      <strong>How to read this demo.</strong>
      <ul>
        <li>Live and cached results are labeled. Cached results show the recorded time and the Tamarin version that produced them.</li>
        <li>A timeout is "inconclusive", never a verdict.</li>
        <li>The simulator is a model of ideal devices with optional depolarizing noise. It samples executions and makes no physical security claim.</li>
        <li>The CM1/CM2 variants are this demo's encodings. The published attacks (V1, V2, V3) and the combined fix are cited as prior work.</li>
        <li>The key-use layer is single session and single key manager.</li>
      </ul>
    </footer>
  )
}
