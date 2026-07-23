(() => {
  "use strict";

  const data = window.CLIPSP1_DATA;
  if (!data) {
    document.body.innerHTML =
      '<main style="padding:40px;font:16px Segoe UI;color:#8a2200">Measurement data could not be loaded.</main>';
    return;
  }

  const byId = (id) => document.getElementById(id);
  const escapeHtml = (value) =>
    String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  const escapeAttr = escapeHtml;
  const fmtActual = (value) => Number(value).toFixed(3);
  const fmtSpec = (value) =>
    Number(value)
      .toFixed(3)
      .replace(/\.?0+$/, "");
  const fmtPercent = (value, digits = 1) => `${(value * 100).toFixed(digits)}%`;
  const isOos = (row) => row.status !== "In spec";
  const sampleByIndex = new Map(data.samples.map((sample) => [sample.index, sample]));

  const state = {
    selectedId:
      data.characteristics.find((item) => item.name === "Mi hauteur 2")?.id ??
      data.characteristics[0].id,
    partNumber: "all",
    dateCode: "all",
    mode: "detail",
    showValues: true,
    pinnedSampleIndex: null,
  };

  function currentCharacteristic() {
    return data.characteristics.find((item) => item.id === state.selectedId);
  }

  function filteredSamples() {
    return data.samples.filter(
      (sample) =>
        (state.partNumber === "all" || sample.partNumber === state.partNumber) &&
        (state.dateCode === "all" || sample.dateCode === state.dateCode),
    );
  }

  function rowsFor(characteristicId, samples = filteredSamples()) {
    const sampleIndexes = new Set(samples.map((sample) => sample.index));
    return data.measurements[characteristicId]
      .filter((row) => sampleIndexes.has(row.sampleIndex))
      .map((row) => ({ ...row, sample: sampleByIndex.get(row.sampleIndex) }));
  }

  function dynamicCharacteristicSummary(characteristic, samples = filteredSamples()) {
    const rows = rowsFor(characteristic.id, samples);
    const passCount = rows.filter((row) => !isOos(row)).length;
    return {
      ...characteristic,
      n: rows.length,
      passCount,
      outOfSpec: rows.length - passCount,
      passRate: rows.length ? passCount / rows.length : 0,
    };
  }

  function populateSelect(select, values, allLabel, formatter = (value) => value) {
    select.innerHTML = [
      `<option value="all">${escapeHtml(allLabel)}</option>`,
      ...values.map(
        (value) =>
          `<option value="${escapeAttr(value)}">${escapeHtml(formatter(value))}</option>`,
      ),
    ].join("");
  }

  function setupFilters() {
    const partValues = [...new Set(data.samples.map((sample) => sample.partNumber))];
    const dateValues = [...new Set(data.samples.map((sample) => sample.dateCode))];
    const desktopPart = byId("part-filter");
    const desktopDate = byId("date-filter");

    populateSelect(desktopPart, partValues, "All part groups", (value) => `BF0158 ${value}`);
    populateSelect(desktopDate, dateValues, "All dates");

    const mobileFilters = byId("mobile-filters");
    mobileFilters.innerHTML = `
      <label class="select-control">
        <span class="sr-only">Part group</span>
        <select id="mobile-part-filter" aria-label="Part group"></select>
      </label>
      <label class="select-control">
        <span class="sr-only">Date</span>
        <select id="mobile-date-filter" aria-label="Date"></select>
      </label>
    `;
    const mobilePart = byId("mobile-part-filter");
    const mobileDate = byId("mobile-date-filter");
    populateSelect(mobilePart, partValues, "All part groups", (value) => `BF0158 ${value}`);
    populateSelect(mobileDate, dateValues, "All dates");

    const changePart = (value) => {
      state.partNumber = value;
      desktopPart.value = value;
      mobilePart.value = value;
      state.pinnedSampleIndex = null;
      renderAll();
    };
    const changeDate = (value) => {
      state.dateCode = value;
      desktopDate.value = value;
      mobileDate.value = value;
      state.pinnedSampleIndex = null;
      renderAll();
    };

    desktopPart.addEventListener("change", (event) => changePart(event.target.value));
    mobilePart.addEventListener("change", (event) => changePart(event.target.value));
    desktopDate.addEventListener("change", (event) => changeDate(event.target.value));
    mobileDate.addEventListener("change", (event) => changeDate(event.target.value));

    const filterToggle = byId("mobile-filter-toggle");
    filterToggle.addEventListener("click", () => {
      const expanded = filterToggle.getAttribute("aria-expanded") === "true";
      filterToggle.setAttribute("aria-expanded", String(!expanded));
      filterToggle.setAttribute("aria-label", expanded ? "Show filters" : "Hide filters");
      mobileFilters.hidden = expanded;
    });
  }

  function setupCharacteristicSelect() {
    const select = byId("mobile-characteristic-select");
    select.innerHTML = data.characteristics
      .map(
        (item) =>
          `<option value="${escapeAttr(item.id)}">${escapeHtml(item.displayName)}</option>`,
      )
      .join("");
    select.value = state.selectedId;
    select.addEventListener("change", (event) => {
      selectCharacteristic(event.target.value, true);
    });
  }

  function renderKpis() {
    const samples = filteredSamples();
    const allRows = data.characteristics.flatMap((item) => rowsFor(item.id, samples));
    const inSpec = allRows.filter((row) => !isOos(row)).length;
    const oos = allRows.length - inSpec;
    const passRate = allRows.length ? inSpec / allRows.length : 0;

    byId("kpi-samples").textContent = String(samples.length);
    byId("kpi-characteristics").textContent = String(data.characteristics.length);
    byId("kpi-pass-rate").textContent = fmtPercent(passRate);
    byId("kpi-oos").textContent = String(oos);
    byId("header-sample-count").textContent = `${samples.length} ${
      samples.length === 1 ? "sample" : "samples"
    }`;
  }

  function renderCharacteristicList() {
    const samples = filteredSamples();
    byId("characteristic-list").innerHTML = data.characteristics
      .map((item) => {
        const summary = dynamicCharacteristicSummary(item, samples);
        const active = item.id === state.selectedId;
        return `
          <button
            class="characteristic-button${active ? " is-active" : ""}${
              summary.outOfSpec ? " has-failures" : ""
            }"
            type="button"
            data-characteristic-id="${escapeAttr(item.id)}"
            aria-pressed="${String(active)}"
          >
            <span class="char-name">${escapeHtml(item.displayName)}</span>
            <span class="char-count">${summary.passCount} / ${summary.n}</span>
            <span class="char-meter" aria-hidden="true">
              <i style="width:${(summary.passRate * 100).toFixed(3)}%"></i>
            </span>
            <span class="char-rate">${fmtPercent(summary.passRate, 0)}</span>
          </button>
        `;
      })
      .join("");

    byId("characteristic-list")
      .querySelectorAll("[data-characteristic-id]")
      .forEach((button) => {
        button.addEventListener("click", () =>
          selectCharacteristic(button.dataset.characteristicId),
        );
      });
  }

  function selectCharacteristic(id, scrollIntoView = false) {
    state.selectedId = id;
    state.pinnedSampleIndex = null;
    byId("mobile-characteristic-select").value = id;
    renderCharacteristicList();
    renderMeasurementWorkspace();
    renderConformance();
    if (scrollIntoView) {
      byId("measurement-workspace").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function renderMeasurementWorkspace() {
    const characteristic = currentCharacteristic();
    byId("chart-title").textContent = characteristic.displayName;
    byId("spec-nominal").textContent = fmtSpec(characteristic.nominal);
    byId("spec-lsl").textContent = fmtSpec(characteristic.lsl);
    byId("spec-usl").textContent = fmtSpec(characteristic.usl);
    renderMeasurementChart();
  }

  function chartGeometry(characteristic, rows, viewportWidth) {
    const detailWidth = Math.max(viewportWidth, 170, rows.length * 48 + 172);
    const fitWidth = Math.max(viewportWidth, 620);
    const width = state.mode === "detail" ? detailWidth : fitWidth;
    const height = 435;
    const margin = {
      top: 44,
      right: 92,
      bottom: state.mode === "detail" ? 106 : 78,
      left: 62,
    };
    const plotWidth = Math.max(100, width - margin.left - margin.right);
    const plotHeight = height - margin.top - margin.bottom;
    const values = rows.map((row) => row.value);
    const rawExtent = Math.max(
      Math.abs(characteristic.lsl - characteristic.nominal),
      Math.abs(characteristic.usl - characteristic.nominal),
      ...values.map((value) => Math.abs(value - characteristic.nominal)),
      0.001,
    );
    const extent = rawExtent * 1.22;
    const domainMin = characteristic.nominal - extent;
    const domainMax = characteristic.nominal + extent;
    const x = (index) =>
      margin.left +
      (rows.length <= 1 ? plotWidth / 2 : (index / (rows.length - 1)) * plotWidth);
    const y = (value) =>
      margin.top +
      ((domainMax - value) / (domainMax - domainMin)) * plotHeight;
    return {
      width,
      height,
      margin,
      plotWidth,
      plotHeight,
      domainMin,
      domainMax,
      x,
      y,
    };
  }

  function xLabelMarkup(sample, x, baseline, show, index) {
    if (!show) return "";
    const label = sample.sampleLabel;
    if (state.mode === "detail") {
      return `
        <text class="chart-x-label" x="${x}" y="${baseline}" text-anchor="${
          index === 0 ? "start" : "end"
        }"
          transform="rotate(-52 ${x} ${baseline})">
          ${escapeHtml(`${label} ${sample.dateCode}`)}
        </text>
      `;
    }
    return `
      <text class="chart-x-label" x="${x}" y="${baseline + 12}" text-anchor="middle">
        <tspan x="${x}" dy="0">${escapeHtml(label)}</tspan>
        <tspan x="${x}" dy="12">${escapeHtml(sample.dateCode)}</tspan>
      </text>
    `;
  }

  function renderMeasurementChart() {
    const characteristic = currentCharacteristic();
    const rows = rowsFor(characteristic.id);
    const scroll = byId("measurement-chart-scroll");
    const container = byId("measurement-chart");
    const viewportWidth = Math.max(scroll.clientWidth || 900, 320);
    const g = chartGeometry(characteristic, rows, viewportWidth);
    const plotBottom = g.margin.top + g.plotHeight;
    const nominalY = g.y(characteristic.nominal);
    const lslY = g.y(characteristic.lsl);
    const uslY = g.y(characteristic.usl);
    const bandY = Math.min(lslY, uslY);
    const bandHeight = Math.abs(lslY - uslY);
    const tickCount = 6;
    const ticks = Array.from(
      { length: tickCount + 1 },
      (_, index) =>
        g.domainMax - (index / tickCount) * (g.domainMax - g.domainMin),
    );
    const labelEvery =
      state.mode === "detail"
        ? 1
        : Math.max(1, Math.ceil(rows.length / Math.max(5, Math.floor(g.plotWidth / 100))));
    const points = rows.map((row, index) => ({
      ...row,
      px: g.x(index),
      py: g.y(row.value),
      index,
    }));
    const polyline = points.map((point) => `${point.px},${point.py}`).join(" ");
    const hasScroll = g.width > viewportWidth + 2;

    container.style.width = `${g.width}px`;
    container.innerHTML = `
      <svg
        width="${g.width}"
        height="${g.height}"
        viewBox="0 0 ${g.width} ${g.height}"
        role="img"
        aria-labelledby="measurement-chart-title measurement-chart-desc"
      >
        <title id="measurement-chart-title">${escapeHtml(
          characteristic.displayName,
        )} actual measurements</title>
        <desc id="measurement-chart-desc">Actual values for ${rows.length} filtered samples, centered on nominal ${fmtSpec(
          characteristic.nominal,
        )}, with tolerance from ${fmtSpec(characteristic.lsl)} to ${fmtSpec(
          characteristic.usl,
        )}.</desc>

        <rect class="tolerance-band" x="${g.margin.left}" y="${bandY}" width="${
          g.plotWidth
        }" height="${bandHeight}" />

        ${ticks
          .map((tick) => {
            const ty = g.y(tick);
            return `
              <line class="chart-grid" x1="${g.margin.left}" y1="${ty}" x2="${
                g.margin.left + g.plotWidth
              }" y2="${ty}" />
              <text class="chart-tick" x="${g.margin.left - 11}" y="${
                ty + 3.5
              }" text-anchor="end">${fmtActual(tick)}</text>
            `;
          })
          .join("")}

        <line class="spec-boundary" x1="${g.margin.left}" y1="${uslY}" x2="${
          g.margin.left + g.plotWidth
        }" y2="${uslY}" />
        <line class="nominal-line" x1="${g.margin.left}" y1="${nominalY}" x2="${
          g.margin.left + g.plotWidth
        }" y2="${nominalY}" />
        <line class="spec-boundary" x1="${g.margin.left}" y1="${lslY}" x2="${
          g.margin.left + g.plotWidth
        }" y2="${lslY}" />
        <line class="chart-axis" x1="${g.margin.left}" y1="${g.margin.top}" x2="${
          g.margin.left
        }" y2="${plotBottom}" />
        <line class="chart-axis" x1="${g.margin.left}" y1="${plotBottom}" x2="${
          g.margin.left + g.plotWidth
        }" y2="${plotBottom}" />

        <text class="spec-label" x="${g.margin.left + g.plotWidth + 9}" y="${
          uslY + 3
        }">USL ${fmtSpec(characteristic.usl)}</text>
        <text class="spec-label nominal" x="${g.margin.left + g.plotWidth + 9}" y="${
          nominalY + 3
        }">Nominal ${fmtSpec(characteristic.nominal)}</text>
        <text class="spec-label" x="${g.margin.left + g.plotWidth + 9}" y="${
          lslY + 3
        }">LSL ${fmtSpec(characteristic.lsl)}</text>

        ${
          points.length > 1
            ? `<polyline class="measurement-path" points="${polyline}" />`
            : ""
        }

        ${points
          .map((point) => {
            const oos = isOos(point);
            const valueDy =
              point.py < g.margin.top + 26
                ? 18 + (point.index % 2) * 11
                : point.index % 3 === 0
                  ? -15
                  : -10 - (point.index % 2) * 11;
            const showValue =
              state.showValues &&
              (state.mode === "detail" || oos || point.index % labelEvery === 0);
            return `
              <line class="measurement-stem" x1="${point.px}" y1="${nominalY}" x2="${
                point.px
              }" y2="${point.py}" />
              ${
                showValue
                  ? `<text class="chart-value${
                      oos ? " is-oos" : ""
                    }" x="${point.px}" y="${point.py + valueDy}" text-anchor="middle">${fmtActual(
                      point.value,
                    )}</text>`
                  : ""
              }
              <g
                class="point-group${oos ? " is-oos" : ""}${
                  state.pinnedSampleIndex === point.sampleIndex ? " is-pinned" : ""
                }"
                data-sample-index="${point.sampleIndex}"
                tabindex="0"
                role="button"
                aria-label="${escapeAttr(
                  `${point.sample.shortLabel}: ${fmtActual(point.value)}, ${point.status}`,
                )}"
              >
                <circle class="point-hit" cx="${point.px}" cy="${point.py}" r="13" />
                <circle class="measurement-point${
                  oos ? " is-oos" : ""
                }" cx="${point.px}" cy="${point.py}" r="${oos ? 5.5 : 5}" />
              </g>
              ${xLabelMarkup(
                point.sample,
                point.px,
                plotBottom + 12,
                point.index % labelEvery === 0 || point.index === points.length - 1,
                point.index,
              )}
            `;
          })
          .join("")}

        ${
          rows.length === 0
            ? `<text x="${g.width / 2}" y="${
                g.height / 2
              }" text-anchor="middle" class="chart-tick">No samples match these filters</text>`
            : ""
        }
      </svg>
    `;

    byId("scroll-cue").hidden = !hasScroll;
    if (state.mode === "fit") scroll.scrollLeft = 0;
    attachPointInteractions(rows, characteristic);
  }

  function tooltipMarkup(row, characteristic) {
    const deviation = row.value - characteristic.nominal;
    const deviationText = `${deviation >= 0 ? "+" : ""}${fmtActual(deviation)}`;
    const oos = isOos(row);
    return `
      <div class="tooltip-title">${escapeHtml(row.sample.shortLabel)}</div>
      <div class="tooltip-grid">
        <span>Part group</span><strong>${escapeHtml(row.sample.partGroup)}</strong>
        <span>Actual</span><strong class="${oos ? "is-oos" : ""}">${fmtActual(
          row.value,
        )}</strong>
        <span>Nominal</span><strong>${fmtActual(characteristic.nominal)}</strong>
        <span>LSL / USL</span><strong>${fmtActual(characteristic.lsl)} / ${fmtActual(
          characteristic.usl,
        )}</strong>
        <span>Deviation</span><strong>${deviationText}</strong>
        <span>Status</span><strong class="${oos ? "is-oos" : ""}">${escapeHtml(
          row.status,
        )}</strong>
      </div>
    `;
  }

  function placeTooltip(eventOrElement) {
    const tooltip = byId("chart-tooltip");
    const rect =
      eventOrElement instanceof Element
        ? eventOrElement.getBoundingClientRect()
        : {
            left: eventOrElement.clientX,
            right: eventOrElement.clientX,
            top: eventOrElement.clientY,
            bottom: eventOrElement.clientY,
          };
    const tooltipWidth = 250;
    const tooltipHeight = 205;
    const left = Math.min(
      window.innerWidth - tooltipWidth - 12,
      Math.max(12, rect.right + 12),
    );
    const top =
      rect.bottom + tooltipHeight < window.innerHeight
        ? Math.max(12, rect.bottom + 10)
        : Math.max(12, rect.top - tooltipHeight - 10);
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }

  function attachPointInteractions(rows, characteristic) {
    const tooltip = byId("chart-tooltip");
    const rowBySample = new Map(rows.map((row) => [row.sampleIndex, row]));
    const groups = byId("measurement-chart").querySelectorAll(".point-group");

    const show = (group, eventOrElement) => {
      const row = rowBySample.get(Number(group.dataset.sampleIndex));
      tooltip.classList.toggle("is-oos", isOos(row));
      tooltip.innerHTML = tooltipMarkup(row, characteristic);
      tooltip.hidden = false;
      placeTooltip(eventOrElement);
    };
    const hideIfUnpinned = () => {
      if (state.pinnedSampleIndex === null) tooltip.hidden = true;
    };
    const togglePin = (group) => {
      const sampleIndex = Number(group.dataset.sampleIndex);
      state.pinnedSampleIndex =
        state.pinnedSampleIndex === sampleIndex ? null : sampleIndex;
      groups.forEach((candidate) =>
        candidate.classList.toggle(
          "is-pinned",
          Number(candidate.dataset.sampleIndex) === state.pinnedSampleIndex,
        ),
      );
      if (state.pinnedSampleIndex === null) {
        tooltip.hidden = true;
      } else {
        show(group, group);
      }
    };

    groups.forEach((group) => {
      group.addEventListener("pointerenter", (event) => show(group, event));
      group.addEventListener("pointermove", (event) => placeTooltip(event));
      group.addEventListener("pointerleave", hideIfUnpinned);
      group.addEventListener("focus", () => show(group, group));
      group.addEventListener("blur", hideIfUnpinned);
      group.addEventListener("click", () => togglePin(group));
      group.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          togglePin(group);
        }
      });
    });
  }

  function renderConformance() {
    const samples = filteredSamples();
    const summaries = data.characteristics
      .map((item) => dynamicCharacteristicSummary(item, samples))
      .sort((a, b) => a.passRate - b.passRate || Number(a.id) - Number(b.id));
    byId("conformance-chart").innerHTML = summaries
      .map(
        (item) => `
          <button
            class="bar-row${item.outOfSpec ? " has-failures" : ""}${
              item.id === state.selectedId ? " is-active" : ""
            }"
            type="button"
            data-characteristic-id="${escapeAttr(item.id)}"
            aria-label="${escapeAttr(
              `${item.displayName}: ${item.passCount} of ${item.n} measurements in specification`,
            )}"
          >
            <span class="bar-name">${escapeHtml(item.displayName)}</span>
            <span class="bar-track" aria-hidden="true">
              <i class="bar-fill" style="width:${(item.passRate * 100).toFixed(3)}%"></i>
            </span>
            <span class="bar-value">${fmtPercent(item.passRate)}</span>
          </button>
        `,
      )
      .join("");
    byId("conformance-chart")
      .querySelectorAll("[data-characteristic-id]")
      .forEach((button) => {
        button.addEventListener("click", () =>
          selectCharacteristic(button.dataset.characteristicId, true),
        );
      });
  }

  function renderMatrix() {
    const samples = filteredSamples();
    const statusMaps = new Map(
      data.characteristics.map((characteristic) => [
        characteristic.id,
        new Map(
          data.measurements[characteristic.id].map((row) => [row.sampleIndex, row]),
        ),
      ]),
    );
    const header = [
      '<div class="matrix-corner" aria-hidden="true"></div>',
      ...samples.map(
        (sample) =>
          `<div class="matrix-sample" title="${escapeAttr(sample.shortLabel)}">${escapeHtml(
            sample.shortLabel,
          )}</div>`,
      ),
    ].join("");
    const rows = data.characteristics
      .map((characteristic) => {
        const statusMap = statusMaps.get(characteristic.id);
        return [
          `<div class="matrix-label" title="${escapeAttr(
            characteristic.displayName,
          )}">${escapeHtml(characteristic.displayName)}</div>`,
          ...samples.map((sample) => {
            const row = statusMap.get(sample.index);
            const oos = isOos(row);
            const tooltip = `${characteristic.displayName} Â· ${sample.shortLabel} Â· ${fmtActual(
              row.value,
            )} Â· ${row.status}`;
            return `<div
              class="matrix-cell${oos ? " is-oos" : ""}"
              tabindex="0"
              role="img"
              aria-label="${escapeAttr(tooltip)}"
              data-tooltip="${escapeAttr(tooltip)}"
            ></div>`;
          }),
        ].join("");
      })
      .join("");

    const matrix = byId("oos-matrix");
    matrix.style.setProperty("--sample-count", samples.length);
    matrix.style.minWidth = `${Math.max(500, 152 + samples.length * 32)}px`;
    matrix.innerHTML = `<div class="matrix-grid">${header}${rows}</div>`;
    matrix.querySelectorAll(".matrix-cell").forEach((cell) => {
      cell.addEventListener("pointermove", (event) => {
        cell.style.setProperty("--tip-x", `${Math.min(event.clientX + 12, innerWidth - 265)}px`);
        cell.style.setProperty("--tip-y", `${Math.min(event.clientY + 12, innerHeight - 70)}px`);
      });
    });
  }

  function renderAll() {
    renderKpis();
    renderCharacteristicList();
    renderMeasurementWorkspace();
    renderConformance();
    renderMatrix();
  }

  function setupChartControls() {
    document.querySelectorAll("[data-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        state.mode = button.dataset.mode;
        document.querySelectorAll("[data-mode]").forEach((candidate) => {
          candidate.classList.toggle("is-active", candidate.dataset.mode === state.mode);
        });
        state.pinnedSampleIndex = null;
        byId("chart-tooltip").hidden = true;
        renderMeasurementChart();
      });
    });
    byId("values-toggle").addEventListener("change", (event) => {
      state.showValues = event.target.checked;
      renderMeasurementChart();
    });
    byId("measurement-chart-scroll").addEventListener("scroll", () => {
      const scroll = byId("measurement-chart-scroll");
      byId("scroll-cue").hidden =
        scroll.scrollWidth <= scroll.clientWidth + 2 ||
        scroll.scrollLeft + scroll.clientWidth >= scroll.scrollWidth - 10;
    });
  }

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      renderMeasurementChart();
    }, 130);
  });

  setupFilters();
  setupCharacteristicSelect();
  setupChartControls();
  renderAll();
})();

