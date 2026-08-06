function parseIsoDate(value) {
  if (value === null) {
    return { ok: true, date: null };
  }

  if (typeof value !== 'string') {
    return { ok: false };
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return { ok: false };
  }

  const [, year, month, day] = match;
  const date = new Date(0);
  date.setFullYear(Number(year), Number(month) - 1, Number(day));
  date.setHours(0, 0, 0, 0);
  const isSameCalendarDate =
    date.getFullYear() === Number(year) &&
    date.getMonth() === Number(month) - 1 &&
    date.getDate() === Number(day) &&
    date.getHours() === 0 &&
    date.getMinutes() === 0 &&
    date.getSeconds() === 0 &&
    date.getMilliseconds() === 0;

  return isSameCalendarDate ? { ok: true, date } : { ok: false };
}

function mapEvent(event, references) {
  const firstBatchDate = parseIsoDate(event.first_batch_date);
  if (!firstBatchDate.ok) {
    return { ok: false, reason: 'Invalid first_batch_date' };
  }

  const lastBatchDate = parseIsoDate(event.last_batch_date);
  if (!lastBatchDate.ok) {
    return { ok: false, reason: 'Invalid last_batch_date' };
  }

  return {
    ok: true,
    row: {
      frmId: references.frmId,
      facCode: references.facCode,
      facLabel: event.plant_name,
      frmLabel: null,
      fabDate: lastBatchDate.date || firstBatchDate.date,
      batchCode: null,
      firstFab: firstBatchDate.date === null ? 'N' : 'O',
      lastFab: lastBatchDate.date === null ? 'N' : 'O',
      derogation: null,
      startDerogation: null,
      endDerogation: null,
      commentDerogation: null,
      subcontracted: null,
      fullbuy: null,
      producerCode: null,
      producerLabel: null,
      producerCountry: null,
      updateDate: null,
      idSaturne: null,
      flagDeleteSaturne: null,
      codeBatchPf: null,
      source: 'SDDS',
      frmCd: event.r_i_formula_code,
      firstFabDate: firstBatchDate.date,
    },
  };
}

module.exports = { mapEvent };
