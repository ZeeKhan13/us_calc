      // ----- PWA: register service worker (works on http://localhost or https) -----
      if ("serviceWorker" in navigator) {
        window.addEventListener("load", () => {
          navigator.serviceWorker.register("./service-worker.js").catch(() => {});
        });
      }

      // ---- defaults (used if the user leaves fields blank) ----
      const DEFAULT_SKULL_THICKNESS_MM = 7.0;
      const DEFAULT_INSERTION_LOSS_DB = 6.0;

      const el = (id) => document.getElementById(id);

      // show defaults in UI chips
      el("il_default_chip").textContent = `default: ${DEFAULT_INSERTION_LOSS_DB.toFixed(2)} dB`;
      el("skull_default_chip").textContent = `default: ${DEFAULT_SKULL_THICKNESS_MM.toFixed(2)} mm`;

      const inputs = {
        fc_mhz: el("fc_mhz"),
        z_cm: el("z_cm"),
        pnp_mpa: el("pnp_mpa"),
        pd_val: el("pd_val"),
        pd_unit: el("pd_unit"),
        prf_val: el("prf_val"),
        prf_unit: el("prf_unit"),
        il_db: el("il_db"),
        skull_mm: el("skull_mm"),
        z_pick: el("z_pick"),
        z_custom: el("z_custom"),
      };

      const outputs = {
        input_msg: el("input_msg"),
        warn_msg: el("warn_msg"),
        copy_msg: el("copy_msg"),

        out_df: el("out_df"),
        out_pr3: el("out_pr3"),
        out_mi: el("out_mi"),
        out_pnp_tc: el("out_pnp_tc"),
        out_mitc: el("out_mitc"),
        out_isppa: el("out_isppa"),
        out_ispta: el("out_ispta"),
        out_skull_line: el("out_skull_line"),

        copy_btn: el("copy_btn"),
      };

      function fmt(x, digits = 6) {
        if (!Number.isFinite(x)) return "—";
        const v = Math.abs(x) < 1e-15 ? 0 : x;
        return v.toFixed(digits);
      }

      function isFiniteNonNeg(x) {
        return Number.isFinite(x) && x >= 0;
      }

      function pdSeconds(value, unit) {
        if (unit === "us") return value * 1e-6;
        if (unit === "ms") return value * 1e-3;
        return value;
      }

      function prfHz(value, unit) {
        if (unit === "khz") return value * 1e3;
        return value;
      }

      function getOptionalNumber(inputEl, defaultValue) {
        const raw = (inputEl.value ?? "").toString().trim();
        if (raw === "") return defaultValue;
        const v = Number(raw);
        if (!Number.isFinite(v)) return defaultValue;
        return v;
      }

      function getImpedanceMRayl() {
        const pick = inputs.z_pick.value;
        if (pick === "water") return 1.48;
        if (pick === "soft") return 1.54;
        const v = Number(inputs.z_custom.value);
        return Number.isFinite(v) && v > 0 ? v : 1.48;
      }

      // 0.3 dB/cm/MHz model on pressure amplitude
      function deratePressure03(p_mpa, f_mhz, z_cm) {
        const dB = 0.3 * f_mhz * z_cm;
        return p_mpa * Math.pow(10, -dB / 20);
      }

      // Insertion loss in dB on pressure amplitude
      function applyInsertionLoss(p_mpa, il_db) {
        return p_mpa * Math.pow(10, -il_db / 20);
      }

      function setMsg(node, text) {
        node.textContent = text || "";
        node.style.display = text ? "block" : "none";
      }

      function updateZUI() {
        const show = inputs.z_pick.value === "custom";
        inputs.z_custom.style.display = show ? "inline-block" : "none";
      }

      function updateAll() {
        setMsg(outputs.input_msg, "");
        setMsg(outputs.warn_msg, "");
        setMsg(outputs.copy_msg, "");

        const fc = Number(inputs.fc_mhz.value);
        const z = Number(inputs.z_cm.value);
        const pnp = Number(inputs.pnp_mpa.value);

        const pdv = Number(inputs.pd_val.value);
        const prfv = Number(inputs.prf_val.value);

        if (!isFiniteNonNeg(fc) || fc === 0 || !isFiniteNonNeg(z) || !isFiniteNonNeg(pnp) || !isFiniteNonNeg(pdv) || !isFiniteNonNeg(prfv)) {
          setMsg(outputs.input_msg, "Enter valid non-negative numbers (frequency must be > 0).");
          outputs.out_df.textContent = "—";
          outputs.out_pr3.textContent = "—";
          outputs.out_mi.textContent = "—";
          outputs.out_pnp_tc.textContent = "—";
          outputs.out_mitc.textContent = "—";
          outputs.out_isppa.textContent = "—";
          outputs.out_ispta.textContent = "—";
          outputs.out_skull_line.textContent = "—";
          return;
        }

        // Duty factor
        const df = pdSeconds(pdv, inputs.pd_unit.value) * prfHz(prfv, inputs.prf_unit.value);
        outputs.out_df.textContent = `${(df * 100).toFixed(3)}%  (f=${fmt(df, 6)})`;
        if (df > 1) setMsg(outputs.warn_msg, "Warning: duty cycle > 100% (check PD and PRF).");

        // Pr.3 and MI
        const pr3 = deratePressure03(pnp, fc, z);
        outputs.out_pr3.textContent = `${fmt(pr3, 4)} MPa`;
        const mi = pr3 / Math.sqrt(fc);
        outputs.out_mi.textContent = fmt(mi, 4);

        // Skull defaults (if blank)
        const il_db = getOptionalNumber(inputs.il_db, DEFAULT_INSERTION_LOSS_DB);
        const skull_mm = getOptionalNumber(inputs.skull_mm, DEFAULT_SKULL_THICKNESS_MM);
        outputs.out_skull_line.textContent = `${fmt(il_db, 2)} dB  •  ${fmt(skull_mm, 2)} mm`;

        // In situ estimate and MItc
        const p_tc = applyInsertionLoss(pr3, il_db);
        outputs.out_pnp_tc.textContent = `${fmt(p_tc, 4)} MPa`;
        const mitc = p_tc / Math.sqrt(fc);
        outputs.out_mitc.textContent = fmt(mitc, 4);

        // ISPPA / ISPTA from PNP (sinusoid assumption)
        const Z_MRayl = getImpedanceMRayl();
        const Z_Rayl = Z_MRayl * 1e6;
        const p_rms_pa = (pnp * 1e6) / Math.sqrt(2);
        const I_w_m2 = (p_rms_pa * p_rms_pa) / Z_Rayl;
        const I_w_cm2 = I_w_m2 / 1e4;

        outputs.out_isppa.textContent = `${fmt(I_w_cm2, 6)} W/cm²`;
        outputs.out_ispta.textContent = `${fmt(I_w_cm2 * df, 6)} W/cm²`;
      }

      async function copyAllResults() {
        const text =
`Ultrasound Output Calculator
fc: ${inputs.fc_mhz.value} MHz
z: ${inputs.z_cm.value} cm
PNP water: ${inputs.pnp_mpa.value} MPa
Duty cycle: ${outputs.out_df.textContent}
Pr.3: ${outputs.out_pr3.textContent}
MI: ${outputs.out_mi.textContent}
Skull IL • thickness: ${outputs.out_skull_line.textContent}
In situ PNP: ${outputs.out_pnp_tc.textContent}
MItc: ${outputs.out_mitc.textContent}
ISPPA: ${outputs.out_isppa.textContent}
ISPTA: ${outputs.out_ispta.textContent}`;

        try {
          await navigator.clipboard.writeText(text);
          setMsg(outputs.copy_msg, "Copied to clipboard.");
        } catch {
          setMsg(outputs.copy_msg, "Could not copy automatically. (Browser blocked clipboard.)");
        }
      }

      // wire up
      document.querySelectorAll("input").forEach((x) => x.addEventListener("input", updateAll));
      document.querySelectorAll("select").forEach((x) => x.addEventListener("change", () => { updateZUI(); updateAll(); }));
      outputs.copy_btn.addEventListener("click", copyAllResults);

      updateZUI();
      updateAll();
