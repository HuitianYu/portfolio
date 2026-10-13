(function (root) {
  "use strict";
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const defaults = {
    dt: 5,
    sigma_set: 0.035,
    G_set: 3e-8,
    k: 68.2,
    k_loss: 6.4,
    c_p: 4180,
    r_reactor: 0.04,
    rho_solvent: 998,
    rho_solute: 1160.7,
    m_solvent: 0.3,
    "params.w_sigma": 12,
    "params.w_G": 12,
    "params.w_dT_dt": 2,
    "params.var_dT_dt": 1e-7,
    "params.var_dc_dt": 1e-12,
    "params.dT": 0.01,
    "params.dc": 0.001,
    "params.R": 8.314,
    "params.n": 1.75,
    "params.E_A": 150000,
    "params.k_0": (0.1 * 3e-8) / 0.035 ** 1.5 / Math.exp(-120000 / 8.314 / 306.15),
    "params.n_proc": 1.5,
    "params.E_A_proc": 120000,
    "params.k_0_proc": 3e-8 / 0.035 ** 1.5 / Math.exp(-120000 / 8.314 / 306.15),
    "params.T_R": 298.15,
    "params.K_P_dT_dt": 3,
    "params.K_I_dT_dt": 30,
    "params.K_P_T_sigma": 0,
    "params.K_I_T_sigma": 0,
    "params.K_P_T_G": 0.5,
    "params.K_I_T_G": 0,
    "params.K_u": 15,
    "params.T_u": 60,
    dT_dt_min_sigma: -0.3,
    dT_dt_max_sigma: 0.3,
    dT_dt_min_G: -0.5,
    dT_dt_max_G: 0.5,
    T_j_min: 253.15,
    T_j_max: 453.15,
    dT_j_dt_max: 0.2,
    dT_j: 0.01,
    dt_update: 0.01,
    sigma_threshold: 0.001,
    t_lag: 150,
    t_lag_perc: 20 / 150,
    t_lag_threshold_perc_sigma: 0.015,
    t_lag_threshold_perc_G: 1,
    T_init_sigma: 315.15,
    T_init_G: 311.65,
    T_j_init: 315.15,
    T_j_set_init: 315.15,
    c_init: 0.32,
    steps: 1620,
    m_seed: 0.001,
    d_mean_seed: 250e-6,
    d_std_seed: 25e-6,
    min_num_adapt: 15,
    max_num_adapt: 50,
    q2_G_measure: 1e-7,
    r_diag_G_measure: [4, 3, 2],
    t_base: 60,
  };
  function derive(p, target = "sigma") {
    const d = { ...p };
    d.area_1 = (2 * d.m_solvent) / (d.rho_solvent * d.r_reactor);
    d.area_2 = Math.PI * d.r_reactor ** 2;
    d["params.tau_1"] = (d.c_p * d.m_solvent) / (d.k * d.area_1);
    d["params.tau_2"] = (d.c_p * d.m_solvent) / (d.k_loss * d.area_2);
    d["params.rho_solute"] = d.rho_solute;
    d["params.K_P_target"] = 0.45 * d["params.K_u"];
    d["params.K_I_target"] = 0;
    d["params.K_P_T_applied"] = d["params.K_P_target"];
    d["params.PI_mode"] = "Ziegler_Nichols";
    for (const k of [
      "T_init",
      "dT_dt_min",
      "dT_dt_max",
      "t_lag_threshold_perc",
      "params.K_P_T",
      "params.K_I_T",
    ])
      d[k] = d[k + "_" + target];
    d.target_set = target === "sigma" ? d.sigma_set : d.G_set;
    d.C2K = 273.15;
    d.K2C = -273.15;
    return d;
  }
  const sat = (T) => 0.0000138423912271 * T * T - 0.0032814470982419 * T - 0.0047418316935379;
  const dsat = (T) => 2 * 0.0000138423912271 * T - 0.0032814470982419;
  const sigma = (c, T) => (c - sat(T)) / sat(T);
  function growth(p, c, T, process = false) {
    const s = sigma(c, T),
      suffix = process ? "_proc" : "";
    return (
      p["params.k_0" + suffix] *
      Math.abs(s) ** p["params.n" + suffix] *
      Math.exp(-p["params.E_A" + suffix] / p["params.R"] / T) *
      Math.sign(s)
    );
  }
  function targetError(p, target, set, c, T) {
    if (target === "sigma") return sigma(c, T) - set;
    const k = p["params.k_0"] * Math.exp(-p["params.E_A"] / p["params.R"] / T);
    return sigma(c, T) - Math.sign(set) * (Math.abs(set) / k) ** (1 / p["params.n"]);
  }
  function coefficients(p, x) {
    const [T, , c, dc] = x,
      cs = sat(T);
    if (Math.abs(sigma(c, T)) < 0.001) return [0, 0];
    return [
      dc *
        ((-p["params.n"] * c * dsat(T)) / cs / (c - cs) + p["params.E_A"] / p["params.R"] / T ** 2),
      (dc * p["params.n"]) / (c - cs),
    ];
  }
  function rhs(p, x) {
    const [a, b] = coefficients(p, x);
    return [x[1], 0, x[3], a * x[1] + b * x[3]];
  }
  function transition(p, x, dt) {
    let y = x.slice();
    const n = Math.max(1, Math.ceil(dt / 1));
    const h = dt / n;
    for (let k = 0; k < n; k++) {
      const a = rhs(p, y),
        b = rhs(
          p,
          y.map((v, i) => v + (h * a[i]) / 2),
        ),
        c = rhs(
          p,
          y.map((v, i) => v + (h * b[i]) / 2),
        ),
        d = rhs(
          p,
          y.map((v, i) => v + h * c[i]),
        );
      y = y.map((v, i) => v + (h * (a[i] + 2 * b[i] + 2 * c[i] + d[i])) / 6);
    }
    return y;
  }
  function objective(p, x, target, u, set, dt) {
    const [a, b] = coefficients(p, x);
    const c = x[2] + x[3] * dt + ((a * x[1] + b * x[3]) * dt * dt) / 2;
    const e = targetError(p, target, set, c, x[0] + u * dt);
    return p["params.w_" + target] * e * e + p["params.w_dT_dt"] * (u - x[1]) ** 2;
  }
  function minimize(f, lo, hi) {
    const r = (Math.sqrt(5) - 1) / 2;
    let a = hi - r * (hi - lo),
      b = lo + r * (hi - lo),
      fa = f(a),
      fb = f(b);
    for (let k = 0; k < 65; k++) {
      if (fa < fb) {
        hi = b;
        b = a;
        fb = fa;
        a = hi - r * (hi - lo);
        fa = f(a);
      } else {
        lo = a;
        a = b;
        fa = fb;
        b = lo + r * (hi - lo);
        fb = f(b);
      }
    }
    return (lo + hi) / 2;
  }
  const zeros = (n) => Array.from({ length: n }, () => Array(n).fill(0));
  const ident = (n) =>
    Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => +(i === j)));
  const transpose = (a) => a[0].map((_, j) => a.map((r) => r[j]));
  const mul = (a, b) => a.map((r) => b[0].map((_, j) => r.reduce((s, v, k) => s + v * b[k][j], 0)));
  const add = (a, b) => a.map((r, i) => r.map((v, j) => v + b[i][j]));
  function predictCov(P, F, Q) {
    return add(mul(mul(F, P), transpose(F)), Q);
  }
  function correctScalar(x, P, h, z, r) {
    const ph = P.map((row) => row.reduce((s, v, i) => s + v * h[i], 0));
    const s = r + h.reduce((s, v, i) => s + v * ph[i], 0),
      k = ph.map((v) => v / s),
      res = z - h.reduce((s, v, i) => s + v * x[i], 0);
    x = x.map((v, i) => v + k[i] * res);
    const a = ident(x.length).map((row, i) => row.map((v, j) => v - k[i] * h[j]));
    P = add(
      mul(mul(a, P), transpose(a)),
      k.map((ki) => k.map((kj) => ki * kj * r)),
    );
    return [x, P];
  }
  class Filter {
    constructor(p, x) {
      this.x = x.slice();
      this.P = ident(4);
    }
    step(p, T, c) {
      const dt = p.dt,
        x0 = this.x.slice(),
        xp = transition(p, x0, dt),
        F = zeros(4);
      for (let j = 0; j < 4; j++) {
        const eps = 1e-6 * Math.max(Math.abs(x0[j]), j === 2 ? 1e-2 : 1e-4);
        const plus = x0.slice(),
          minus = x0.slice();
        plus[j] += eps;
        minus[j] -= eps;
        const a = transition(p, plus, dt),
          b = transition(p, minus, dt);
        for (let i = 0; i < 4; i++) F[i][j] = (a[i] - b[i]) / (2 * eps);
      }
      const q = zeros(4);
      for (const [i, v] of [
        [0, p["params.var_dT_dt"]],
        [2, p["params.var_dc_dt"]],
      ]) {
        q[i][i] = dt * dt * v;
        q[i][i + 1] = q[i + 1][i] = dt * v;
        q[i + 1][i + 1] = v;
      }
      let P = predictCov(this.P, F, q),
        x = xp;
      [x, P] = correctScalar(x, P, [1, 0, 0, 0], T, p["params.dT"] ** 2);
      [x, P] = correctScalar(x, P, [0, 0, 1, 0], c, p["params.dc"] ** 2);
      this.x = x;
      this.P = P;
      return x;
    }
  }
  class GrowthFilter {
    constructor() {
      this.x = [0, 0, 0];
      this.P = ident(3);
      this.history = [];
    }
    step(value, p) {
      const dt = p.dt,
        F = [
          [1, dt, (dt * dt) / 2],
          [0, 1, dt],
          [0, 0, 1],
        ],
        v = [(dt * dt) / 2, dt, 1],
        q = v.map((a) => v.map((b) => a * b * p.q2_G_measure));
      let P = predictCov(this.P, F, q),
        x = mul(
          F,
          this.x.map((a) => [a]),
        ).map((a) => a[0]);
      const h = this.history;
      const z = [
        value,
        h.length ? (value - h.at(-1)) / dt : 0,
        h.length > 1 ? (value + h.at(-2) - 2 * h.at(-1)) / dt ** 2 : 0,
      ];
      for (let i = 0; i < 3; i++)
        [x, P] = correctScalar(
          x,
          P,
          [0, 1, 2].map((j) => +(i === j)),
          z[i],
          p.r_diag_G_measure[i],
        );
      this.x = x;
      this.P = P;
      h.push(value);
      return x[0];
    }
  }
  function random(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function normal(r) {
    return Math.sqrt(-2 * Math.log(Math.max(1e-12, r()))) * Math.cos(2 * Math.PI * r());
  }
  function seeds(p) {
    if (p.m_seed === 0) return [];
    const rng = random(123);
    const expected = (Math.PI / 6) * (p.d_mean_seed ** 3 + 3 * p.d_mean_seed * p.d_std_seed ** 2);
    const count = Math.max(1, Math.round(p.m_seed / (p.rho_solute * expected)));
    if (count > 500000)
      throw Error(
        "Seed population exceeds the browser limit of 500,000 particles. Increase the mean size or reduce seed mass.",
      );
    const sizes = Array.from({ length: count }, () =>
      Math.max(p.d_mean_seed * 0.01, p.d_mean_seed + p.d_std_seed * normal(rng)),
    );
    const mass = sizes.reduce((s, d) => s + (Math.PI / 6) * d ** 3 * p.rho_solute, 0);
    const scale = Math.cbrt(p.m_seed / mass);
    return sizes.map((d) => d * scale);
  }
  function jacket(p, T, set) {
    const n = Math.floor(p.dt / p.dt_update);
    let j = T;
    for (let i = 0; i < n; i++) {
      if (Math.abs(set - j) > p.dT_j) {
        const speed =
          j > 343.15
            ? (p.T_j_max - j) / (p.T_j_max - 343.15)
            : j < 278.15
              ? (j - p.T_j_min) / (278.15 - p.T_j_min)
              : 1;
        j += (p.dT_j_dt_max * speed * Math.sign(set - j) * p.dt) / n;
      }
    }
    return clamp(j, p.T_j_min, p.T_j_max);
  }
  function validate(p) {
    if (!p || typeof p !== "object") throw Error("A parameter configuration is required.");
    for (const [k, v] of Object.entries(p)) {
      if (typeof defaults[k] === "number" && !Number.isFinite(v))
        throw Error(k + " must be finite.");
    }
    for (const k of [
      "dt",
      "k",
      "k_loss",
      "c_p",
      "r_reactor",
      "rho_solvent",
      "rho_solute",
      "m_solvent",
      "params.R",
      "params.n",
      "params.n_proc",
      "params.k_0",
      "params.k_0_proc",
      "params.dT",
      "params.dc",
      "dt_update",
      "d_mean_seed",
      "t_base",
    ])
      if (!(p[k] > 0)) throw Error(k + " must be positive.");
    for (const k of [
      "m_seed",
      "d_std_seed",
      "dT_j",
      "dT_j_dt_max",
      "sigma_threshold",
      "t_lag",
      "t_lag_perc",
      "params.var_dT_dt",
      "params.var_dc_dt",
      "q2_G_measure",
      "params.w_sigma",
      "params.w_G",
      "params.w_dT_dt",
    ])
      if (p[k] < 0) throw Error(k + " must be nonnegative.");
    for (const k of ["steps", "min_num_adapt", "max_num_adapt"]) {
      const limit = k === "steps" ? 10000 : 200;
      if (!Number.isInteger(p[k]) || p[k] < 1 || p[k] > limit)
        throw Error(k + " must be an integer between 1 and " + limit + " for this browser lab.");
    }
    if (p.max_num_adapt < p.min_num_adapt)
      throw Error("Maximum adaptation points must be at least the minimum.");
    if (p.T_j_min >= p.T_j_max) throw Error("Jacket minimum must be below maximum.");
    if (p.dt / p.dt_update > 5000 || p.dt_update > p.dt)
      throw Error("Jacket update interval must be between dt / 5000 and dt.");
    if (
      !Array.isArray(p.r_diag_G_measure) ||
      p.r_diag_G_measure.length !== 3 ||
      p.r_diag_G_measure.some((x) => !Number.isFinite(x) || x <= 0)
    )
      throw Error("Growth measurement covariance needs three positive values.");
    for (const t of ["sigma", "G"])
      if (p["dT_dt_min_" + t] >= p["dT_dt_max_" + t])
        throw Error("Temperature gradient minimum must be below maximum.");
    return true;
  }
  class Simulation {
    constructor(values = defaults, options = {}) {
      this.values = { ...defaults, ...values };
      validate(this.values);
      this.options = {
        mode: "MPC",
        target: "sigma",
        adaptiveMode: "all",
        sensor: false,
        adaptive: false,
        ...options,
      };
      this.reset();
    }
    reset() {
      this.initialParameters = JSON.parse(JSON.stringify(this.values));
      this.initialOptions = { ...this.options };
      this.runEvents = [];
      const p = (this.p = derive(this.values, this.options.target));
      this.T = p.T_init;
      this.Tj = p.T_j_init;
      this.c = p.c_init;
      this.set = p.T_j_set_init;
      this.history = [];
      this.seedSizes = seeds(p);
      this.sizes = [];
      this.seedPending = 0;
      this.seedEvents = [];
      this.refresh();
    }
    recordEvent(kind, details = {}) {
      this.runEvents.push({
        kind,
        nextStep: this.history.length + 1,
        afterTime: this.history.at(-1)?.t || 0,
        ...JSON.parse(JSON.stringify(details)),
      });
    }
    refresh() {
      this.recordEvent("controller-refresh");
      this.filter = new Filter(this.p, [this.T, 0, this.c, 0]);
      this.gfilter = new GrowthFilter();
      this.intTarget = 0;
      this.intGradient = 0;
      this.intT = 0;
      this.adaptSamples = [];
    }
    refreshSensor() {
      this.recordEvent("sensor-refresh");
      this.gfilter = new GrowthFilter();
      this.adaptSamples = [];
    }
    update(values, options = {}) {
      const next = { ...this.values, ...values };
      validate(next);
      const changed = Object.fromEntries(
        Object.entries(next).filter(
          ([key, value]) => JSON.stringify(value) !== JSON.stringify(this.values[key]),
        ),
      );
      const changedOptions = Object.fromEntries(
        Object.entries(options).filter(([key, value]) => value !== this.options[key]),
      );
      if (Object.keys(changed).length || Object.keys(changedOptions).length) {
        this.recordEvent("settings-change", {
          parameters: changed,
          options: changedOptions,
          nextRunOnly: Object.keys(changed).filter((key) =>
            ["T_init_sigma", "T_init_G", "T_j_init", "T_j_set_init", "c_init"].includes(key),
          ),
        });
      }
      this.values = next;
      this.options = { ...this.options, ...options };
      this.p = derive(next, this.options.target);
    }
    addSeed() {
      if (!this.seedSizes.length)
        throw Error("Seed mass is zero. Set a positive seed mass before adding seed.");
      if (this.sizes.length + this.seedSizes.length * (this.seedPending + 1) > 500000)
        throw Error(
          "This seed batch would exceed the total browser limit of 500,000 particles. Use a smaller batch or reset the run.",
        );
      this.seedPending++;
      this.recordEvent("seed-queued", { pendingBatches: this.seedPending });
    }
    adapt(p, row) {
      row.adapted = false;
      const list = this.adaptSamples;
      if (row.GmeasureKF > 0 && row.sigma > 0) {
        list.push({ G: row.GmeasureKF, s: row.sigma, T: row.T });
        if (list.length > p.max_num_adapt) list.shift();
      }
      row.numAdapt = list.length;
      if (list.length < p.min_num_adapt) return;
      const mode = this.options.adaptiveMode,
        has = (k) => mode === "all" || mode.split("_and_").includes(k);
      let n = p["params.n"],
        E = p["params.E_A"],
        lk = Math.log(p["params.k_0"]);
      if (has("E_A")) {
        let num = 0,
          den = 0;
        for (const a of list) {
          const q = 1 / (p["params.R"] * a.T);
          num += q * (lk + n * Math.log(a.s) - Math.log(a.G));
          den += q * q;
        }
        E = clamp(num / den, E / 2, E * 2);
      }
      if (has("k_0")) {
        let num = 0,
          den = 0;
        for (const a of list) {
          const q = a.s ** n * Math.exp(-E / p["params.R"] / a.T) * 1e9;
          num += q * a.G * 1e9;
          den += q * q;
        }
        const bounds = [lk / 2, lk * 2].sort((a, b) => a - b);
        lk = clamp(Math.log(num / den), ...bounds);
      }
      if (has("n")) {
        let num = 0,
          den = 0;
        for (const a of list) {
          const q = Math.log(a.s);
          num += q * (Math.log(a.G) - lk + E / p["params.R"] / a.T);
          den += q * q;
        }
        n = clamp(num / den, n / 2, n * 2);
      }
      if (["E_A", "k_0", "n"].some(has) && [n, E, lk].every(Number.isFinite)) {
        row.adapted = true;
        if (has("n")) this.values["params.n"] = p["params.n"] = n;
        if (has("E_A")) this.values["params.E_A"] = p["params.E_A"] = E;
        if (has("k_0")) this.values["params.k_0"] = p["params.k_0"] = Math.exp(lk);
      }
    }
    step() {
      const p = this.p,
        o = this.options,
        i = this.history.length + 1;
      if (i > p.steps) return null;
      let seeded = false;
      if (this.seedPending) {
        this.seedSizes = seeds(p);
        const batches = this.seedPending;
        if (this.sizes.length + this.seedSizes.length * batches > 500000) {
          this.seedPending = 0;
          throw Error(
            "Total seed population would exceed 500,000 particles. Reset the run or use a smaller seed batch.",
          );
        }
        for (let batch = 0; batch < batches; batch++)
          this.sizes = this.sizes.concat(this.seedSizes);
        this.seedPending = 0;
        seeded = true;
      }
      if (i > 1) {
        const oldT = this.T,
          oldC = this.c;
        const rate = 1 / p["params.tau_1"] + 1 / p["params.tau_2"],
          eq = (this.Tj / p["params.tau_1"] + p["params.T_R"] / p["params.tau_2"]) / rate;
        this.T = eq + (oldT - eq) * Math.exp(-rate * p.dt);
        this.Tj = jacket(p, this.Tj, this.set);
        const G = growth(p, oldC, oldT, true);
        let dm = 0;
        this.sizes = this.sizes
          .map((d) => {
            const vol = (Math.PI / 6) * d ** 3,
              dv = Math.max(-vol, Math.PI * d * d * G * p.dt);
            dm += dv * p.rho_solute;
            return Math.cbrt((6 * Math.max(0, vol + dv)) / Math.PI);
          })
          .filter((d) => d > 0);
        this.c = oldC - dm / p.m_solvent;
        this.T += 0.01 * normal(random(i * 456));
        this.c += 0.0002 * normal(random(i * 789));
      }
      const previous = this.history.at(-1),
        x = this.filter.step(p, this.T, this.c),
        s = sigma(x[2], x[0]),
        G = growth(p, x[2], x[0]),
        setTarget = p.target_set;
      const value = o.target === "sigma" ? s : G,
        absError = Math.abs(value - setTarget),
        lagRatio =
          1 +
          (p.t_lag_perc *
            Math.atan((p.t_lag_threshold_perc * setTarget) / Math.max(absError, 1e-300))) /
            (Math.PI / 2),
        lag = p.t_lag * lagRatio;
      const advanced = x.map((v, j) => v + (j === 0 ? x[1] * lag : j === 2 ? x[3] * lag : 0));
      let u = previous?.dTset || 0;
      if (Math.abs(sigma(advanced[2], advanced[0])) >= p.sigma_threshold) {
        const err = targetError(p, o.target, setTarget, advanced[2], advanced[0]);
        this.intTarget += err * p.dt;
        u =
          o.mode === "MPC"
            ? minimize(
                (v) => objective(p, advanced, o.target, v, setTarget, p.dt),
                p.dT_dt_min,
                p.dT_dt_max,
              )
            : clamp(
                p["params.K_P_target"] * err + p["params.K_I_target"] * this.intTarget,
                p.dT_dt_min,
                p.dT_dt_max,
              );
        const secondary = (v) => {
          const tau = p["params.tau_1"],
            ratio = tau / p["params.tau_2"],
            calc = tau * v + (1 + ratio) * advanced[0] - ratio * p["params.T_R"];
          const e =
            -(1 / tau + 1 / p["params.tau_2"]) * advanced[0] +
            calc / tau +
            p["params.T_R"] / p["params.tau_2"] -
            v;
          // MATLAB calc_T_j_set_ uses the initial T_j and K_P_target here.
          const zero =
              (p.T_j_init / tau + p["params.T_R"] / p["params.tau_2"]) /
              (1 / tau + 1 / p["params.tau_2"]),
            et = Math.max(0, advanced[0] - zero),
            ig = this.intGradient + e * p.dt,
            it = this.intT + et * p.dt;
          return {
            set: clamp(
              calc -
                p["params.K_P_dT_dt"] * e -
                p["params.K_I_dT_dt"] * ig -
                p["params.K_P_target"] * et -
                p["params.K_I_T"] * it,
              p.T_j_min,
              p.T_j_max,
            ),
            ig,
            it,
          };
        };
        let result = secondary(u);
        if (o.target === "G") {
          const zero = secondary(0);
          if (result.set > zero.set) result = zero;
        }
        this.set = result.set;
        this.intGradient = result.ig;
        this.intT = result.it;
      }
      const row = {
        population: this.sizes.length,
        step: i,
        t: (previous?.t || 0) + p.dt,
        T: this.T,
        TKF: x[0],
        Tj: this.Tj,
        TjSet: this.set,
        c: this.c,
        cKF: x[2],
        dT: previous ? (this.T - previous.T) / p.dt : 0,
        dTKF: x[1],
        dTset: u,
        dc: previous ? (this.c - previous.c) / p.dt : 0,
        dcKF: x[3],
        sigma: s,
        G,
        sigmaSet: o.target === "sigma" ? setTarget : null,
        GSet: o.target === "G" ? setTarget : null,
        f: objective(p, x, o.target, u, setTarget, p.dt),
        target: o.target,
        lag,
        lagPercent: 100 * (lagRatio - 1),
        seeded,
        n: p["params.n"],
        lnk: Math.log(p["params.k_0"]),
        EA: p["params.E_A"] / 1000,
        numAdapt: 0,
      };
      if (o.sensor) {
        const model = growth(p, x[2], x[0], true);
        for (const [key, m] of [
          ["Gu", 1122],
          ["GuKF", 3344],
          ["Gv", 5566],
          ["GvKF", 7788],
        ])
          row[key] = model + 1e-9 * normal(random(i * m));
        row.Gmeasure = (row.GuKF + row.GvKF) / 2;
        if (o.adaptive) {
          row.GmeasureKF = this.gfilter.step(row.Gmeasure, p);
          this.adapt(p, row);
          row.n = p["params.n"];
          row.lnk = Math.log(p["params.k_0"]);
          row.EA = p["params.E_A"] / 1000;
        }
      }
      if (
        ![this.T, this.Tj, this.c, this.set, ...x, row.f, row.G].every(Number.isFinite) ||
        this.T <= 0 ||
        this.c < 0
      )
        throw Error(
          "Simulation left the physical or numerical range. Review parameters or reduce dt.",
        );
      if (seeded) this.seedEvents.push({ t: row.t, T: row.T });
      this.history.push(row);
      return row;
    }
  }
  root.MPCrystal = {
    defaults,
    derive,
    sat,
    sigma,
    growth,
    objective,
    minimize,
    transition,
    Simulation,
    validate,
    seeds,
  };
  if (typeof module !== "undefined") module.exports = root.MPCrystal;
})(typeof globalThis !== "undefined" ? globalThis : this);
