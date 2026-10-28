/**
 * Minimal complex state vector for 1..6 qubits.
 *
 * Qubit q is bit q of the amplitude index (little-endian): for two qubits the
 * amplitudes are ordered |q1 q0> = |00>, |01>(q0=1), |10>(q1=1), |11>.
 * Gates are applied in place; measurements collapse the state and return the bit.
 */

import type { Rng } from './rng.ts'

export type Bit = 0 | 1

/**
 * Measurement / preparation basis.
 * 'Z', 'X', 'Y' are the Pauli eigenbases. A number is a Bloch angle theta in
 * the X-Z plane: basis states Ry(theta)|0> and Ry(theta)|1>, so 0 is Z and
 * pi/2 is X.
 */
export type Basis = 'Z' | 'X' | 'Y' | number

/** A pure single-qubit state a|0> + b|1> as four reals. */
export interface Qubit {
  re0: number
  im0: number
  re1: number
  im1: number
}

const SQ = Math.SQRT1_2

export class QState {
  readonly n: number
  readonly re: Float64Array
  readonly im: Float64Array

  constructor(n: number) {
    if (!Number.isInteger(n) || n < 1 || n > 6) throw new Error('QState supports 1..6 qubits')
    this.n = n
    this.re = new Float64Array(1 << n)
    this.im = new Float64Array(1 << n)
    this.re[0] = 1
  }

  /** Back to |0...0>. */
  reset(): this {
    this.re.fill(0)
    this.im.fill(0)
    this.re[0] = 1
    return this
  }

  /** Apply the 2x2 complex matrix [[a, b], [c, d]] to qubit q. */
  apply1(q: number, ar: number, ai: number, br: number, bi: number, cr: number, ci: number, dr: number, di: number): this {
    const m = 1 << q
    const re = this.re
    const im = this.im
    const N = re.length
    for (let i = 0; i < N; i++) {
      if (i & m) continue
      const j = i | m
      const xr = re[i], xi = im[i], yr = re[j], yi = im[j]
      re[i] = ar * xr - ai * xi + br * yr - bi * yi
      im[i] = ar * xi + ai * xr + br * yi + bi * yr
      re[j] = cr * xr - ci * xi + dr * yr - di * yi
      im[j] = cr * xi + ci * xr + dr * yi + di * yr
    }
    return this
  }

  h(q: number): this { return this.apply1(q, SQ, 0, SQ, 0, SQ, 0, -SQ, 0) }
  x(q: number): this { return this.apply1(q, 0, 0, 1, 0, 1, 0, 0, 0) }
  y(q: number): this { return this.apply1(q, 0, 0, 0, -1, 0, 1, 0, 0) }
  z(q: number): this { return this.apply1(q, 1, 0, 0, 0, 0, 0, -1, 0) }
  s(q: number): this { return this.apply1(q, 1, 0, 0, 0, 0, 0, 0, 1) }
  sdg(q: number): this { return this.apply1(q, 1, 0, 0, 0, 0, 0, 0, -1) }
  /** diag(1, e^{i phi}) */
  phase(q: number, phi: number): this { return this.apply1(q, 1, 0, 0, 0, 0, 0, Math.cos(phi), Math.sin(phi)) }
  /** Rotation about Y: Ry(theta)|0> = cos(theta/2)|0> + sin(theta/2)|1>. */
  ry(q: number, theta: number): this {
    const c = Math.cos(theta / 2)
    const s = Math.sin(theta / 2)
    return this.apply1(q, c, 0, -s, 0, s, 0, c, 0)
  }

  cnot(c: number, t: number): this {
    const cm = 1 << c
    const tm = 1 << t
    const re = this.re
    const im = this.im
    const N = re.length
    for (let i = 0; i < N; i++) {
      if ((i & cm) && !(i & tm)) {
        const j = i | tm
        const r = re[i], s = im[i]
        re[i] = re[j]; im[i] = im[j]
        re[j] = r; im[j] = s
      }
    }
    return this
  }

  cz(c: number, t: number): this {
    const both = (1 << c) | (1 << t)
    const N = this.re.length
    for (let i = 0; i < N; i++) {
      if ((i & both) === both) { this.re[i] = -this.re[i]; this.im[i] = -this.im[i] }
    }
    return this
  }

  /** Probability that qubit q reads 1 in the Z basis. */
  prob1(q: number): number {
    const m = 1 << q
    let p = 0
    const re = this.re
    const im = this.im
    const N = re.length
    for (let i = 0; i < N; i++) if (i & m) p += re[i] * re[i] + im[i] * im[i]
    return p
  }

  /** Projective Z measurement of qubit q; collapses and renormalizes. */
  measureZ(q: number, r: Rng): Bit {
    const m = 1 << q
    const p1 = this.prob1(q)
    const out: Bit = r() < p1 ? 1 : 0
    const p = out ? p1 : 1 - p1
    const scale = p > 0 ? 1 / Math.sqrt(p) : 0
    const re = this.re
    const im = this.im
    const N = re.length
    for (let i = 0; i < N; i++) {
      if (((i & m) !== 0) === (out === 1)) { re[i] *= scale; im[i] *= scale }
      else { re[i] = 0; im[i] = 0 }
    }
    return out
  }

  /** Map the basis to Z (so that basis state k becomes |k>). */
  rotateIn(q: number, basis: Basis): this {
    if (basis === 'Z') return this
    if (basis === 'X') return this.h(q)
    if (basis === 'Y') return this.sdg(q).h(q)
    return this.ry(q, -basis)
  }

  /** Inverse of rotateIn: map |k> to basis state k. */
  rotateOut(q: number, basis: Basis): this {
    if (basis === 'Z') return this
    if (basis === 'X') return this.h(q)
    if (basis === 'Y') return this.h(q).s(q)
    return this.ry(q, basis)
  }

  /** Projective measurement of qubit q in the given basis; collapses onto the basis state. */
  measure(q: number, basis: Basis, r: Rng): Bit {
    this.rotateIn(q, basis)
    const out = this.measureZ(q, r)
    this.rotateOut(q, basis)
    return out
  }

  /** Prepare qubit q (assumed |0> and unentangled) as basis state `b` of `basis`. */
  prepare(q: number, basis: Basis, b: Bit): this {
    if (b) this.x(q)
    return this.rotateOut(q, basis)
  }

  /**
   * Depolarizing channel rho -> (1-p) rho + p I/2 on qubit q, sampled as a
   * Pauli with probability p/4 each (identity with probability 1 - 3p/4).
   */
  depolarize(q: number, p: number, r: Rng): this {
    if (p <= 0) return this
    const u = r()
    if (u >= p) return this
    const k = Math.floor((u / p) * 4)
    if (k === 1) this.x(q)
    else if (k === 2) this.y(q)
    else if (k === 3) this.z(q)
    return this
  }

  /** Reduced density matrix of qubit q: [rho00, rho11, Re rho01, Im rho01]. */
  reduced1(q: number): [number, number, number, number] {
    const m = 1 << q
    let r00 = 0, r11 = 0, cr = 0, ci = 0
    const re = this.re
    const im = this.im
    const N = re.length
    for (let i = 0; i < N; i++) {
      if (i & m) continue
      const j = i | m
      r00 += re[i] * re[i] + im[i] * im[i]
      r11 += re[j] * re[j] + im[j] * im[j]
      // rho01 = sum psi_i conj(psi_j)
      cr += re[i] * re[j] + im[i] * im[j]
      ci += im[i] * re[j] - re[i] * im[j]
    }
    return [r00, r11, cr, ci]
  }

  /** Fidelity <ref| rho_q |ref> of qubit q with a pure reference state. */
  fidelity1(q: number, ref: Qubit): number {
    const [r00, r11, cr, ci] = this.reduced1(q)
    // <ref|rho|ref> = |a|^2 r00 + |b|^2 r11 + 2 Re(conj(a) rho01 b)
    const a2 = ref.re0 * ref.re0 + ref.im0 * ref.im0
    const b2 = ref.re1 * ref.re1 + ref.im1 * ref.im1
    // conj(a) * b = (re0 - i im0)(re1 + i im1)
    const cbr = ref.re0 * ref.re1 + ref.im0 * ref.im1
    const cbi = ref.re0 * ref.im1 - ref.im0 * ref.re1
    const cross = cr * cbr - ci * cbi
    const f = a2 * r00 + b2 * r11 + 2 * cross
    return f < 0 ? 0 : f > 1 ? 1 : f
  }
}

/** A Haar-random pure qubit, prepared on qubit q of `st` (assumed |0>) and returned as reference. */
export function haarQubit(st: QState, q: number, r: Rng): Qubit {
  const theta = Math.acos(1 - 2 * r())
  const phi = 2 * Math.PI * r()
  st.ry(q, theta).phase(q, phi)
  const c = Math.cos(theta / 2)
  const s = Math.sin(theta / 2)
  return { re0: c, im0: 0, re1: s * Math.cos(phi), im1: s * Math.sin(phi) }
}

/** Prepare the Bell state (|00> + |11>)/sqrt2 on qubits a, b of a fresh state. */
export function bell(st: QState, a: number, b: number): QState {
  return st.h(a).cnot(a, b)
}

/** Prepare the GHZ state (|000> + |111>)/sqrt2 on qubits a, b, c of a fresh state. */
export function ghz(st: QState, a: number, b: number, c: number): QState {
  return st.h(a).cnot(a, b).cnot(a, c)
}
