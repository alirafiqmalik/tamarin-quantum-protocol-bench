export function Home() {
  return (
    <div>
      <p className="eyebrow">Simulate it, or prove it?</p>
      <h1>Symbolic verification of quantum protocols with their classical control</h1>
      <p className="lead">
        Simulation samples executions. A proof covers all executions that the attacker model permits. This demo shows why symbolic modeling
        (Tamarin) is necessary for quantum protocols, that the classical control plane of a quantum protocol (authentication, basis announcement
        order, error reconciliation, key delivery) is where the specification-level failures are, and that the method scales to complex, configurable
        protocols: nine QKD configurations, two families (PM, EB), two adversaries, three reconciliation modes, three basis orders, and countermeasure
        toggles, all generated from one template. The industry standards (ETSI GS QKD 004/005/014, ITU-T) leave these choices open.
      </p>
      <div className="home-grid">
        <a className="station-card" href="#/a">
          <p className="eyebrow">Station A · 60 s</p>
          <h2>Simulate it, or prove it?</h2>
          <p className="muted">One protocol, two panels. The simulator samples shots and lights a few paths. Tamarin covers every path and ends in a verdict or a counterexample.</p>
        </a>
        <a className="station-card" href="#/b">
          <p className="eyebrow">Station B · 2 min</p>
          <h2>Attack witness and the classical control plane</h2>
          <p className="muted">Toggle the control-plane choices, watch the model diff, and read the counterexample as a message sequence chart.</p>
        </a>
        <a className="station-card" href="#/c">
          <p className="eyebrow">Station C · 1 min</p>
          <h2>Evidence matrix</h2>
          <p className="muted">Configurations against lemmas: verified, falsified (with V1/V2/V3 attribution), timeout, not run. Every cell opens its record; the manifest downloads as JSON.</p>
        </a>
      </div>
    </div>
  )
}
