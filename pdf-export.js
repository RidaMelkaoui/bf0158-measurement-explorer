(() => {
  "use strict";

  const exportButton = document.getElementById("export-pdf");
  const exportStatus = document.getElementById("export-status");
  const source = window.CLIPSP1_DATA;
  const explorer = window.BF0158_EXPLORER;
  const pdfLib = window.PDFLib;

  if (!exportButton || !source || !explorer || !pdfLib) return;

  const { PDFDocument, StandardFonts, rgb, degrees } = pdfLib;
  const PAGE = [841.89, 595.28];
  const COLORS = {
    navy: rgb(0.024, 0.086, 0.247),
    navySoft: rgb(0.09, 0.2, 0.4),
    blue: rgb(0.082, 0.341, 0.91),
    blueSoft: rgb(0.55, 0.71, 1),
    bluePale: rgb(0.91, 0.95, 1),
    amber: rgb(0.956, 0.478, 0),
    amberDark: rgb(0.77, 0.29, 0),
    ink: rgb(0.24, 0.31, 0.45),
    line: rgb(0.82, 0.86, 0.92),
    lineSoft: rgb(0.92, 0.94, 0.97),
    white: rgb(1, 1, 1),
  };

  const ascii = (value) =>
    String(value)
      .replaceAll("·", " | ")
      .replaceAll("–", "-")
      .replaceAll("—", "-")
      .replace(/[^\x20-\x7e]/g, "");
  const actual = (value) => Number(value).toFixed(3);
  const spec = (value) =>
    Number(value)
      .toFixed(3)
      .replace(/\.?0+$/, "");
  const percent = (value) => `${(value * 100).toFixed(1)}%`;
  const isOos = (row) => row.status !== "In spec";
  const sampleMap = new Map(source.samples.map((sample) => [sample.index, sample]));

  function fitText(text, font, size, maxWidth) {
    const normalized = ascii(text);
    if (font.widthOfTextAtSize(normalized, size) <= maxWidth) return normalized;
    let result = normalized;
    while (
      result.length > 1 &&
      font.widthOfTextAtSize(`${result}...`, size) > maxWidth
    ) {
      result = result.slice(0, -1);
    }
    return `${result}...`;
  }

  function drawTextFit(page, text, options) {
    const { font, size, maxWidth, ...rest } = options;
    page.drawText(fitText(text, font, size, maxWidth), {
      font,
      size,
      ...rest,
    });
  }

  function filteredSamples(snapshot) {
    const indexes = new Set(snapshot.sampleIndexes);
    return source.samples.filter((sample) => indexes.has(sample.index));
  }

  function rowsFor(characteristicId, samples) {
    const indexes = new Set(samples.map((sample) => sample.index));
    return source.measurements[characteristicId]
      .filter((row) => indexes.has(row.sampleIndex))
      .map((row) => ({ ...row, sample: sampleMap.get(row.sampleIndex) }));
  }

  function filterLabel(snapshot) {
    const part =
      snapshot.partNumber === "all"
        ? "All part groups"
        : `BF0158 ${snapshot.partNumber}`;
    const date = snapshot.dateCode === "all" ? "All dates" : snapshot.dateCode;
    return `${part} | ${date}`;
  }

  function addPage(pdfDoc, fonts, section, pageNumber) {
    const page = pdfDoc.addPage(PAGE);
    const { width, height } = page.getSize();

    page.drawRectangle({
      x: 0,
      y: height - 3,
      width,
      height: 3,
      color: COLORS.navy,
    });
    page.drawLine({
      start: { x: 28, y: height - 48 },
      end: { x: width - 28, y: height - 48 },
      thickness: 0.7,
      color: COLORS.line,
    });
    page.drawText("BF0158 MEASUREMENT EXPLORER", {
      x: 38,
      y: height - 31,
      size: 14,
      font: fonts.bold,
      color: COLORS.navy,
    });
    page.drawText(ascii(section).toUpperCase(), {
      x: 38,
      y: height - 43,
      size: 6,
      font: fonts.bold,
      color: COLORS.blue,
    });
    page.drawText(`PAGE ${pageNumber}`, {
      x: width - 70,
      y: height - 36,
      size: 6.5,
      font: fonts.bold,
      color: COLORS.ink,
    });

    page.drawLine({
      start: { x: 28, y: 31 },
      end: { x: width - 28, y: 31 },
      thickness: 0.6,
      color: COLORS.line,
    });
    page.drawText("Source | CLIPSP1.xlsx | Sheet modif 3", {
      x: 38,
      y: 18,
      size: 6.5,
      font: fonts.regular,
      color: COLORS.ink,
    });
    return page;
  }

  function drawKpis(page, fonts, samples, snapshot) {
    const allRows = source.characteristics.flatMap((item) =>
      rowsFor(item.id, samples),
    );
    const inSpec = allRows.filter((row) => !isOos(row)).length;
    const outOfSpec = allRows.length - inSpec;
    const passRate = allRows.length ? inSpec / allRows.length : 0;
    const metrics = [
      [String(samples.length), "Samples"],
      [String(source.characteristics.length), "Characteristics"],
      [percent(passRate), "Measurements in spec"],
      [String(outOfSpec), "Out of tolerance"],
    ];
    const x = 38;
    const y = 483;
    const width = 766;
    const cellWidth = width / metrics.length;

    page.drawRectangle({
      x,
      y,
      width,
      height: 54,
      color: COLORS.white,
      borderColor: COLORS.line,
      borderWidth: 0.7,
    });
    metrics.forEach(([value, label], index) => {
      const cellX = x + cellWidth * index;
      if (index > 0) {
        page.drawLine({
          start: { x: cellX, y: y + 10 },
          end: { x: cellX, y: y + 44 },
          thickness: 0.7,
          color: COLORS.line,
        });
      }
      page.drawText(value, {
        x: cellX + 20,
        y: y + 24,
        size: 20,
        font: fonts.bold,
        color: index === 3 ? COLORS.amber : COLORS.blue,
      });
      page.drawText(label, {
        x: cellX + 20,
        y: y + 11,
        size: 6.5,
        font: fonts.regular,
        color: COLORS.navySoft,
      });
    });
    page.drawText(filterLabel(snapshot), {
      x: 618,
      y: 472,
      size: 6.3,
      font: fonts.bold,
      color: COLORS.ink,
    });
  }

  function drawSpecChip(page, fonts, label, value, x, y) {
    page.drawRectangle({
      x,
      y,
      width: 76,
      height: 24,
      color: COLORS.bluePale,
      borderColor: COLORS.line,
      borderWidth: 0.55,
    });
    page.drawText(label.toUpperCase(), {
      x: x + 7,
      y: y + 14,
      size: 5.1,
      font: fonts.bold,
      color: COLORS.ink,
    });
    page.drawText(spec(value), {
      x: x + 7,
      y: y + 5,
      size: 7,
      font: fonts.bold,
      color: COLORS.blue,
    });
  }

  function drawMeasurementChart(page, fonts, characteristic, rows) {
    const x = 50;
    const y = 154;
    const width = 738;
    const height = 255;
    const values = rows.map((row) => row.value);
    const extent =
      Math.max(
        Math.abs(characteristic.lsl - characteristic.nominal),
        Math.abs(characteristic.usl - characteristic.nominal),
        ...values.map((value) => Math.abs(value - characteristic.nominal)),
        0.001,
      ) * 1.22;
    const domainMin = characteristic.nominal - extent;
    const domainMax = characteristic.nominal + extent;
    const mapY = (value) =>
      y + ((value - domainMin) / (domainMax - domainMin)) * height;
    const mapX = (index) =>
      x + (rows.length <= 1 ? width / 2 : (index / (rows.length - 1)) * width);
    const nominalY = mapY(characteristic.nominal);
    const lslY = mapY(characteristic.lsl);
    const uslY = mapY(characteristic.usl);

    page.drawRectangle({
      x,
      y: Math.min(lslY, uslY),
      width,
      height: Math.abs(uslY - lslY),
      color: COLORS.bluePale,
    });

    for (let index = 0; index <= 6; index += 1) {
      const value = domainMin + (index / 6) * (domainMax - domainMin);
      const tickY = mapY(value);
      page.drawLine({
        start: { x, y: tickY },
        end: { x: x + width, y: tickY },
        thickness: 0.4,
        color: COLORS.line,
      });
      page.drawText(actual(value), {
        x: 26,
        y: tickY - 2,
        size: 5.1,
        font: fonts.regular,
        color: COLORS.ink,
      });
    }

    page.drawLine({
      start: { x, y: lslY },
      end: { x: x + width, y: lslY },
      thickness: 1,
      color: COLORS.blue,
    });
    page.drawLine({
      start: { x, y: uslY },
      end: { x: x + width, y: uslY },
      thickness: 1,
      color: COLORS.blue,
    });
    page.drawLine({
      start: { x, y: nominalY },
      end: { x: x + width, y: nominalY },
      thickness: 1.6,
      color: COLORS.navy,
    });

    page.drawText(`USL ${spec(characteristic.usl)}`, {
      x: x + width - 42,
      y: uslY + 3,
      size: 5.5,
      font: fonts.bold,
      color: COLORS.blue,
    });
    page.drawText(`NOMINAL ${spec(characteristic.nominal)}`, {
      x: x + width - 62,
      y: nominalY + 3,
      size: 5.5,
      font: fonts.bold,
      color: COLORS.navy,
    });
    page.drawText(`LSL ${spec(characteristic.lsl)}`, {
      x: x + width - 42,
      y: lslY + 3,
      size: 5.5,
      font: fonts.bold,
      color: COLORS.blue,
    });

    if (rows.length === 0) {
      page.drawText("No samples match the selected filters", {
        x: x + width / 2 - 70,
        y: y + height / 2,
        size: 9,
        font: fonts.bold,
        color: COLORS.ink,
      });
      return;
    }

    rows.forEach((row, index) => {
      const pointX = mapX(index);
      const pointY = mapY(row.value);
      const next = rows[index + 1];

      page.drawLine({
        start: { x: pointX, y: nominalY },
        end: { x: pointX, y: pointY },
        thickness: 0.45,
        color: COLORS.blueSoft,
      });
      if (next) {
        page.drawLine({
          start: { x: pointX, y: pointY },
          end: { x: mapX(index + 1), y: mapY(next.value) },
          thickness: 0.8,
          color: COLORS.blueSoft,
        });
      }

      const outlier = isOos(row);
      page.drawCircle({
        x: pointX,
        y: pointY,
        size: outlier ? 3.5 : 3,
        color: outlier ? COLORS.white : COLORS.blue,
        borderColor: outlier ? COLORS.amber : COLORS.white,
        borderWidth: outlier ? 1.4 : 0.8,
      });

      const label = actual(row.value);
      const labelSize = 4.8;
      const labelWidth = fonts.bold.widthOfTextAtSize(label, labelSize);
      const labelY =
        pointY > y + height - 14
          ? pointY - 10 - (index % 2) * 6
          : pointY + 6 + (index % 3) * 5;
      page.drawText(label, {
        x: pointX - labelWidth / 2,
        y: labelY,
        size: labelSize,
        font: fonts.bold,
        color: outlier ? COLORS.amberDark : COLORS.navySoft,
      });

      const sampleNumber = String(row.sampleIndex).padStart(2, "0");
      const numberWidth = fonts.regular.widthOfTextAtSize(sampleNumber, 4.4);
      page.drawText(sampleNumber, {
        x: pointX - numberWidth / 2,
        y: y - 10,
        size: 4.4,
        font: fonts.regular,
        color: COLORS.ink,
      });
    });

    page.drawText("Sample index | full sample key on page 2", {
      x: x,
      y: y - 22,
      size: 5.6,
      font: fonts.bold,
      color: COLORS.ink,
    });
  }

  function drawPageOne(pdfDoc, fonts, snapshot, samples, characteristic, rows) {
    const page = addPage(pdfDoc, fonts, "Selected characteristic profile", 1);
    drawKpis(page, fonts, samples, snapshot);
    drawTextFit(page, characteristic.displayName, {
      x: 38,
      y: 446,
      size: 15,
      font: fonts.bold,
      color: COLORS.navy,
      maxWidth: 260,
    });
    drawSpecChip(page, fonts, "Nominal", characteristic.nominal, 365, 438);
    drawSpecChip(page, fonts, "LSL", characteristic.lsl, 449, 438);
    drawSpecChip(page, fonts, "USL", characteristic.usl, 533, 438);

    page.drawCircle({
      x: 682,
      y: 451,
      size: 3,
      color: COLORS.blue,
    });
    page.drawText("In spec", {
      x: 689,
      y: 448,
      size: 5.5,
      font: fonts.regular,
      color: COLORS.ink,
    });
    page.drawCircle({
      x: 736,
      y: 451,
      size: 3.2,
      color: COLORS.white,
      borderColor: COLORS.amber,
      borderWidth: 1.2,
    });
    page.drawText("Out of tolerance", {
      x: 743,
      y: 448,
      size: 5.5,
      font: fonts.regular,
      color: COLORS.ink,
    });
    drawMeasurementChart(page, fonts, characteristic, rows);
  }

  function drawSampleTableColumn(page, fonts, rows, x, yTop, width) {
    const rowHeight = 17;
    const columns = [24, 188, 72, 45, 54];
    const headers = ["#", "Sample", "Part group", "Actual", "Status"];
    let cursorX = x;

    page.drawRectangle({
      x,
      y: yTop - rowHeight,
      width,
      height: rowHeight,
      color: COLORS.navy,
    });
    headers.forEach((header, index) => {
      page.drawText(header.toUpperCase(), {
        x: cursorX + 4,
        y: yTop - 11,
        size: 5.2,
        font: fonts.bold,
        color: COLORS.white,
      });
      cursorX += columns[index];
    });

    rows.forEach((row, index) => {
      const rowY = yTop - rowHeight * (index + 2);
      if (index % 2 === 0) {
        page.drawRectangle({
          x,
          y: rowY,
          width,
          height: rowHeight,
          color: rgb(0.975, 0.982, 0.995),
        });
      }
      page.drawLine({
        start: { x, y: rowY },
        end: { x: x + width, y: rowY },
        thickness: 0.35,
        color: COLORS.lineSoft,
      });
      let cellX = x;
      const cells = [
        String(row.sampleIndex).padStart(2, "0"),
        row.sample.shortLabel,
        row.sample.partGroup,
        actual(row.value),
        row.status,
      ];
      cells.forEach((cell, cellIndex) => {
        drawTextFit(page, cell, {
          x: cellX + 4,
          y: rowY + 5.3,
          size: cellIndex === 1 ? 5.4 : 5.2,
          font: cellIndex === 3 ? fonts.bold : fonts.regular,
          color:
            cellIndex === 4 && isOos(row) ? COLORS.amberDark : COLORS.ink,
          maxWidth: columns[cellIndex] - 7,
        });
        cellX += columns[cellIndex];
      });
    });
  }

  function drawPageTwo(pdfDoc, fonts, snapshot, characteristic, rows) {
    const page = addPage(pdfDoc, fonts, "Measurement values and sample key", 2);
    drawTextFit(page, characteristic.displayName, {
      x: 38,
      y: 520,
      size: 14,
      font: fonts.bold,
      color: COLORS.navy,
      maxWidth: 320,
    });
    page.drawText(filterLabel(snapshot), {
      x: 555,
      y: 522,
      size: 6.5,
      font: fonts.bold,
      color: COLORS.ink,
    });
    drawSampleTableColumn(page, fonts, rows.slice(0, 26), 38, 498, 383);
    drawSampleTableColumn(page, fonts, rows.slice(26), 421, 498, 383);
  }

  function drawPageThree(pdfDoc, fonts, samples) {
    const page = addPage(pdfDoc, fonts, "Conformance overview", 3);
    const summaries = source.characteristics
      .map((characteristic) => {
        const rows = rowsFor(characteristic.id, samples);
        const passCount = rows.filter((row) => !isOos(row)).length;
        return {
          ...characteristic,
          rows,
          passCount,
          passRate: rows.length ? passCount / rows.length : 0,
          outOfSpec: rows.length - passCount,
        };
      })
      .sort((a, b) => a.passRate - b.passRate || Number(a.id) - Number(b.id));

    page.drawText("CONFORMANCE BY CHARACTERISTIC", {
      x: 38,
      y: 520,
      size: 10,
      font: fonts.bold,
      color: COLORS.navy,
    });
    const barX = 174;
    const barWidth = 510;
    const firstY = 495;
    summaries.forEach((item, index) => {
      const rowY = firstY - index * 17;
      drawTextFit(page, item.displayName, {
        x: 38,
        y: rowY,
        size: 6.2,
        font: fonts.regular,
        color: item.id === explorer.getExportSnapshot().selectedId ? COLORS.blue : COLORS.navy,
        maxWidth: 126,
      });
      page.drawRectangle({
        x: barX,
        y: rowY - 1,
        width: barWidth,
        height: 7,
        color: COLORS.lineSoft,
      });
      page.drawRectangle({
        x: barX,
        y: rowY - 1,
        width: barWidth * item.passRate,
        height: 7,
        color: item.outOfSpec ? COLORS.amber : COLORS.blue,
      });
      page.drawText(percent(item.passRate), {
        x: 694,
        y: rowY,
        size: 5.8,
        font: fonts.bold,
        color: COLORS.ink,
      });
      page.drawText(`${item.passCount}/${item.rows.length}`, {
        x: 744,
        y: rowY,
        size: 5.8,
        font: fonts.regular,
        color: COLORS.ink,
      });
    });

    page.drawText("OUT-OF-TOLERANCE MAP", {
      x: 38,
      y: 207,
      size: 10,
      font: fonts.bold,
      color: COLORS.navy,
    });
    page.drawCircle({ x: 665, y: 210, size: 2.7, color: COLORS.blueSoft });
    page.drawText("In spec", {
      x: 672,
      y: 207,
      size: 5.3,
      font: fonts.regular,
      color: COLORS.ink,
    });
    page.drawCircle({
      x: 720,
      y: 210,
      size: 2.9,
      color: COLORS.white,
      borderColor: COLORS.amber,
      borderWidth: 1,
    });
    page.drawText("Out of tolerance", {
      x: 727,
      y: 207,
      size: 5.3,
      font: fonts.regular,
      color: COLORS.ink,
    });

    const labelWidth = 114;
    const gridX = 38 + labelWidth;
    const gridY = 49;
    const gridHeight = 138;
    const cellWidth = samples.length ? Math.min(12.2, 644 / samples.length) : 12;
    const cellHeight = gridHeight / source.characteristics.length;
    const statuses = new Map(
      source.characteristics.map((characteristic) => [
        characteristic.id,
        new Map(
          source.measurements[characteristic.id].map((row) => [row.sampleIndex, row]),
        ),
      ]),
    );

    samples.forEach((sample, sampleIndex) => {
      const label = String(sample.index).padStart(2, "0");
      page.drawText(label, {
        x: gridX + sampleIndex * cellWidth + 2,
        y: gridY + gridHeight + 4,
        size: 4.1,
        font: fonts.regular,
        color: COLORS.ink,
        rotate: degrees(62),
      });
    });

    source.characteristics.forEach((characteristic, characteristicIndex) => {
      const rowY =
        gridY + gridHeight - (characteristicIndex + 1) * cellHeight + cellHeight / 2;
      drawTextFit(page, characteristic.displayName, {
        x: 38,
        y: rowY - 2,
        size: 5.4,
        font: fonts.regular,
        color: COLORS.navy,
        maxWidth: labelWidth - 8,
      });
      page.drawLine({
        start: { x: gridX, y: rowY - cellHeight / 2 },
        end: {
          x: gridX + samples.length * cellWidth,
          y: rowY - cellHeight / 2,
        },
        thickness: 0.3,
        color: COLORS.lineSoft,
      });
      samples.forEach((sample, sampleIndex) => {
        const row = statuses.get(characteristic.id).get(sample.index);
        const outlier = row && isOos(row);
        page.drawCircle({
          x: gridX + sampleIndex * cellWidth + cellWidth / 2,
          y: rowY,
          size: outlier ? 2.5 : 2,
          color: outlier ? COLORS.white : COLORS.blueSoft,
          borderColor: outlier ? COLORS.amber : COLORS.blueSoft,
          borderWidth: outlier ? 1 : 0.2,
        });
      });
    });
  }

  async function createReport() {
    const snapshot = explorer.getExportSnapshot();
    const samples = filteredSamples(snapshot);
    const characteristic = source.characteristics.find(
      (item) => item.id === snapshot.selectedId,
    );
    const rows = rowsFor(characteristic.id, samples);
    const pdfDoc = await PDFDocument.create();
    const fonts = {
      regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
      bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
    };

    pdfDoc.setTitle(`BF0158 Measurement Report | ${ascii(characteristic.displayName)}`);
    pdfDoc.setAuthor("BF0158 Measurement Explorer");
    pdfDoc.setSubject("Dimensional measurement visualization sourced from CLIPSP1.xlsx");
    pdfDoc.setKeywords([
      "BF0158",
      "measurement",
      "tolerance",
      "CLIPSP1",
      characteristic.name,
    ]);
    pdfDoc.setCreator("BF0158 Measurement Explorer");

    drawPageOne(pdfDoc, fonts, snapshot, samples, characteristic, rows);
    drawPageTwo(pdfDoc, fonts, snapshot, characteristic, rows);
    drawPageThree(pdfDoc, fonts, samples);

    const bytes = await pdfDoc.save();
    const slug = ascii(characteristic.displayName)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    return {
      bytes,
      fileName: `BF0158_Measurement_Report_${slug || "characteristic"}.pdf`,
      pageCount: 3,
      sampleCount: samples.length,
    };
  }

  exportButton.addEventListener("click", async () => {
    if (exportButton.disabled) return;
    const label = exportButton.querySelector(".export-button-label");
    const originalLabel = label.textContent;
    exportButton.disabled = true;
    exportButton.classList.add("is-busy");
    label.textContent = "Building PDF";
    exportStatus.textContent = "Building PDF report";

    try {
      const report = await createReport();
      const blob = new Blob([report.bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = report.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      exportStatus.textContent = `PDF downloaded: ${report.fileName}`;
      document.dispatchEvent(
        new CustomEvent("bf0158:pdf-exported", {
          detail: {
            fileName: report.fileName,
            pageCount: report.pageCount,
            sampleCount: report.sampleCount,
          },
        }),
      );
    } catch (error) {
      console.error("PDF export failed", error);
      exportStatus.textContent = "PDF export failed";
    } finally {
      exportButton.disabled = false;
      exportButton.classList.remove("is-busy");
      label.textContent = originalLabel;
    }
  });
})();
