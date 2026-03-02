// ===== FinTrack — Google Apps Script Backend =====
// Deploy as: Web App → Execute as: Me → Access: Anyone

const SHEET_MOV = 'Movimientos';
const SHEET_TPL = 'Plantillas';
const SHEET_CAT = 'Categorias';
const SHEET_STA = 'StatusAccounts';
const SHEET_STM = 'StatusMonthly';

// ===== ENTRY POINTS =====

function doGet(e) {
  const action = (e.parameter.action || '').trim();
  let result;

  try {
    switch (action) {
      case 'getMonth':
        result = getMonth(
          parseInt(e.parameter.year),
          parseInt(e.parameter.month)
        );
        break;
      case 'getTemplates':
        result = getTemplates();
        break;
      case 'getCategories':
        result = getCategories();
        break;
      case 'getStatusAccounts':
        result = getStatusAccounts();
        break;
      case 'getStatusMonth':
        result = getStatusMonth(
          parseInt(e.parameter.year),
          parseInt(e.parameter.month)
        );
        break;
      case 'test':
        result = diagnose();
        break;
      default:
        result = { error: 'Acción GET no reconocida: ' + action };
    }
  } catch (err) {
    result = { error: err.message };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: 'JSON inválido' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const action = (data.action || '').trim();
  let result = { ok: true };

  try {
    switch (action) {
      // --- Movimientos ---
      case 'add':
        addMovimiento(data);
        break;
      case 'update':
        updateMovimiento(data);
        break;
      case 'delete':
        deleteMovimiento(data.id);
        break;

      // --- Plantillas ---
      case 'addTemplate':
        addTemplate(data);
        break;
      case 'updateTemplate':
        updateTemplate(data);
        break;
      case 'deleteTemplate':
        deleteTemplate(data.plantilla_id);
        break;
      case 'pauseTemplate':
        toggleTemplate(data.plantilla_id, 'pausado');
        break;
      case 'activateTemplate':
        toggleTemplate(data.plantilla_id, 'activo');
        break;

      // --- Categorías ---
      case 'addCategory':
        addCategory(data);
        break;

      // --- Status ---
      case 'addStatusEntry':
        addStatusEntry(data);
        break;
      case 'updateStatusEntry':
        updateStatusEntry(data);
        break;

      default:
        result = { error: 'Acción POST no reconocida: ' + action };
    }
  } catch (err) {
    result = { error: err.message };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ===== HELPERS =====

function getSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1) Exact match
  let sh = ss.getSheetByName(name);
  if (sh) return sh;

  // 2) Known aliases (Categorias/Categorías)
  const aliases = {
    [SHEET_CAT]: ['Categorias', 'Categorías']
  };
  const candidates = aliases[name] || [name];
  for (let i = 0; i < candidates.length; i++) {
    sh = ss.getSheetByName(candidates[i]);
    if (sh) return sh;
  }

  // 3) Fuzzy match: ignore accents, spaces and case
  const target = normalizeSheetName_(name);
  const sheets = ss.getSheets();
  for (let i = 0; i < sheets.length; i++) {
    if (normalizeSheetName_(sheets[i].getName()) === target) return sheets[i];
  }

  return null;
}

function normalizeSheetName_(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase()
    .trim();
}

function findRow(sheet, colIndex, value) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][colIndex]) === String(value)) return i + 1; // 1-based row
  }
  return -1;
}

// ===== READ: MOVIMIENTOS =====
// Returns array of arrays: [id, fecha, tipo, ambito, categoria, subcategoria, descripcion, importe, recurrencia, frecuencia, plantilla_id, estado]

function getMonth(year, month) {
  const sheet = getSheet(SHEET_MOV);
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  const rows = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const fecha = row[1]; // Column B = fecha

    // Parse date — handle both Date objects and strings
    let d;
    if (fecha instanceof Date) {
      d = fecha;
    } else {
      d = new Date(String(fecha));
    }

    if (isNaN(d.getTime())) continue;

    const rowMonth = d.getMonth() + 1; // 1-based
    const rowYear = d.getFullYear();

    if (rowYear === year && rowMonth === month) {
      // Format date as yyyy-mm-dd string
      const dateStr = Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      rows.push([
        row[0],   // id
        dateStr,   // fecha
        row[2],   // tipo
        row[3],   // ambito
        row[4],   // categoria
        row[5],   // subcategoria
        row[6],   // descripcion
        row[7],   // importe
        row[8],   // recurrencia
        row[9],   // frecuencia
        row[10],  // plantilla_id
        row[11]   // estado
      ]);
    }
  }

  return rows;
}

// ===== READ: PLANTILLAS =====
// Returns: [plantilla_id, tipo, ambito, categoria, subcategoria, descripcion, importe, recurrencia, frecuencia, dia_cobro, inicio, proxima, estado]

function getTemplates() {
  const sheet = getSheet(SHEET_TPL);
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  const rows = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    // Format dates
    const inicio = row[10] instanceof Date
      ? Utilities.formatDate(row[10], Session.getScriptTimeZone(), 'yyyy-MM-dd')
      : String(row[10] || '');
    const proxima = row[11] instanceof Date
      ? Utilities.formatDate(row[11], Session.getScriptTimeZone(), 'yyyy-MM-dd')
      : String(row[11] || '');

    rows.push([
      row[0],   // plantilla_id
      row[1],   // tipo
      row[2],   // ambito
      row[3],   // categoria
      row[4],   // subcategoria
      row[5],   // descripcion
      row[6],   // importe
      row[7],   // recurrencia
      row[8],   // frecuencia
      row[9],   // dia_cobro
      inicio,   // inicio
      proxima,  // proxima
      row[12]   // estado
    ]);
  }

  return rows;
}

// ===== READ: CATEGORÍAS =====
// Returns: [tipo, categoria, subcategoria, icono, origen, estado]

function getCategories() {
  const sheet = getCategoriesSheet_();
  if (!sheet) throw new Error('No se encontró la hoja de categorías.');

  const data = sheet.getDataRange().getValues();
  const rows = [];

  for (let i = 1; i < data.length; i++) {
    rows.push([
      data[i][0], // tipo
      data[i][1], // categoria
      data[i][2], // subcategoria
      data[i][3], // icono
      data[i][4], // origen
      data[i][5]  // estado
    ]);
  }

  return rows;
}

function getCategoriesSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const candidates = ['Categorias', 'Categorías'];

  let best = null;
  let bestRows = -1;

  for (let i = 0; i < candidates.length; i++) {
    const sh = ss.getSheetByName(candidates[i]);
    if (!sh) continue;
    const rows = sh.getLastRow();
    if (rows > bestRows) {
      best = sh;
      bestRows = rows;
    }
  }

  // Fallback to generic resolver if none of the known names exist
  return best || getSheet(SHEET_CAT);
}

// ===== WRITE: MOVIMIENTOS =====

function addMovimiento(data) {
  const sheet = getSheet(SHEET_MOV);
  sheet.appendRow([
    data.id,
    data.fecha,
    data.tipo,
    data.ambito,
    data.categoria,
    data.subcategoria || '',
    data.descripcion || '',
    data.importe,
    data.recurrencia || '',
    data.frecuencia || '',
    data.plantilla_id || '',
    data.estado || 'activo',
    data.creado || new Date().toISOString(),
    data.modificado || new Date().toISOString()
  ]);
}

function updateMovimiento(data) {
  const sheet = getSheet(SHEET_MOV);
  const row = findRow(sheet, 0, data.id); // Column A = id
  if (row < 0) throw new Error('Movimiento no encontrado: ' + data.id);

  // Update only provided fields
  if (data.descripcion !== undefined) sheet.getRange(row, 7).setValue(data.descripcion);  // Col G
  if (data.importe !== undefined) sheet.getRange(row, 8).setValue(data.importe);          // Col H
  if (data.fecha !== undefined) sheet.getRange(row, 2).setValue(data.fecha);              // Col B
  if (data.categoria !== undefined) sheet.getRange(row, 5).setValue(data.categoria);      // Col E
  if (data.subcategoria !== undefined) sheet.getRange(row, 6).setValue(data.subcategoria);// Col F
  if (data.modificado !== undefined) sheet.getRange(row, 14).setValue(data.modificado);   // Col N
}

function deleteMovimiento(id) {
  const sheet = getSheet(SHEET_MOV);
  const row = findRow(sheet, 0, id);
  if (row < 0) throw new Error('Movimiento no encontrado: ' + id);

  // Soft delete: set estado to 'eliminado'
  sheet.getRange(row, 12).setValue('eliminado'); // Col L = estado
}

// ===== WRITE: PLANTILLAS =====

function addTemplate(data) {
  const sheet = getSheet(SHEET_TPL);
  sheet.appendRow([
    data.plantilla_id,
    data.tipo,
    data.ambito,
    data.categoria,
    data.subcategoria || '',
    data.descripcion || '',
    data.importe,
    data.recurrencia,
    data.frecuencia,
    data.dia_cobro || 1,
    data.inicio || '',
    data.proxima || '',
    data.estado || 'activo',
    data.creado || new Date().toISOString()
  ]);
}

function updateTemplate(data) {
  const sheet = getSheet(SHEET_TPL);
  const row = findRow(sheet, 0, data.plantilla_id);
  if (row < 0) throw new Error('Plantilla no encontrada: ' + data.plantilla_id);

  if (data.descripcion !== undefined) sheet.getRange(row, 6).setValue(data.descripcion);  // Col F
  if (data.importe !== undefined) sheet.getRange(row, 7).setValue(data.importe);          // Col G
  if (data.categoria !== undefined) sheet.getRange(row, 4).setValue(data.categoria);      // Col D
  if (data.subcategoria !== undefined) sheet.getRange(row, 5).setValue(data.subcategoria);// Col E
  if (data.frecuencia !== undefined) sheet.getRange(row, 9).setValue(data.frecuencia);    // Col I
  if (data.dia_cobro !== undefined) sheet.getRange(row, 10).setValue(data.dia_cobro);     // Col J
}

function deleteTemplate(pid) {
  const sheet = getSheet(SHEET_TPL);
  const row = findRow(sheet, 0, pid);
  if (row < 0) throw new Error('Plantilla no encontrada: ' + pid);

  // Soft delete
  sheet.getRange(row, 13).setValue('eliminado'); // Col M = estado
}

function toggleTemplate(pid, status) {
  const sheet = getSheet(SHEET_TPL);
  const row = findRow(sheet, 0, pid);
  if (row < 0) throw new Error('Plantilla no encontrada: ' + pid);

  sheet.getRange(row, 13).setValue(status); // Col M = estado
}

// ===== WRITE: CATEGORÍAS =====

function addCategory(data) {
  const sheet = getSheet(SHEET_CAT);
  sheet.appendRow([
    data.tipo,
    data.categoria,
    data.subcategoria || '',
    data.icono || 'label',
    data.origen || 'usuario',
    data.estado || 'activo'
  ]);
}

// ===== READ: STATUS =====
// StatusAccounts: [cuenta_id, nombre, tipo, icono, orden, estado]

function getStatusAccounts() {
  const sheet = getSheet(SHEET_STA);
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  const rows = [];
  for (let i = 1; i < data.length; i++) {
    rows.push([
      data[i][0], // cuenta_id
      data[i][1], // nombre
      data[i][2], // tipo
      data[i][3], // icono
      data[i][4], // orden
      data[i][5]  // estado
    ]);
  }
  return rows;
}

// StatusMonthly: [status_id, year, month, cuenta_id, saldo, ha_stat, estado]

function getStatusMonth(year, month) {
  const sheet = getSheet(SHEET_STM);
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const y = parseInt(data[i][1], 10);
    const m = parseInt(data[i][2], 10);
    if (y !== year || m !== month) continue;

    const haStat = data[i][5] instanceof Date
      ? Utilities.formatDate(data[i][5], Session.getScriptTimeZone(), 'yyyy-MM-dd')
      : String(data[i][5] || '');

    rows.push([
      data[i][0], // status_id
      data[i][1], // year
      data[i][2], // month
      data[i][3], // cuenta_id
      data[i][4], // saldo
      haStat,     // ha_stat
      data[i][6]  // estado
    ]);
  }
  return rows;
}

// ===== WRITE: STATUS =====

function addStatusEntry(data) {
  const sheet = getSheet(SHEET_STM);
  if (!sheet) throw new Error('Hoja StatusMonthly no encontrada');

  sheet.appendRow([
    data.status_id || ('s_' + new Date().getTime()),
    parseInt(data.year, 10),
    parseInt(data.month, 10),
    data.cuenta_id,
    data.saldo,
    data.ha_stat || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
    data.estado || 'activo'
  ]);
}

function updateStatusEntry(data) {
  const sheet = getSheet(SHEET_STM);
  if (!sheet) throw new Error('Hoja StatusMonthly no encontrada');
  const row = findRow(sheet, 0, data.status_id); // col A = status_id
  if (row < 0) throw new Error('Status no encontrado: ' + data.status_id);

  if (data.saldo !== undefined) sheet.getRange(row, 5).setValue(data.saldo);    // col E
  if (data.ha_stat !== undefined) sheet.getRange(row, 6).setValue(data.ha_stat);// col F
  if (data.estado !== undefined) sheet.getRange(row, 7).setValue(data.estado);  // col G
}

// ===== DIAGNÓSTICO =====
// Accesible en: [tu-url]?action=test
// Devuelve info sobre las hojas del spreadsheet para verificar configuración

function diagnose() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets().map(s => ({
    name: s.getName(),
    rows: s.getLastRow(),
    cols: s.getLastColumn()
  }));

  const movSheet = ss.getSheetByName(SHEET_MOV);
  const tplSheet = ss.getSheetByName(SHEET_TPL);
  const catSheet = ss.getSheetByName(SHEET_CAT);
  const staSheet = ss.getSheetByName(SHEET_STA);
  const stmSheet = ss.getSheetByName(SHEET_STM);

  const headers = {};
  if (movSheet && movSheet.getLastRow() > 0)
    headers[SHEET_MOV] = movSheet.getRange(1, 1, 1, movSheet.getLastColumn()).getValues()[0];
  if (tplSheet && tplSheet.getLastRow() > 0)
    headers[SHEET_TPL] = tplSheet.getRange(1, 1, 1, tplSheet.getLastColumn()).getValues()[0];
  if (catSheet && catSheet.getLastRow() > 0)
    headers[SHEET_CAT] = catSheet.getRange(1, 1, 1, catSheet.getLastColumn()).getValues()[0];

  return {
    ok: true,
    spreadsheet: ss.getName(),
    timezone: Session.getScriptTimeZone(),
    expectedSheets: { MOV: SHEET_MOV, TPL: SHEET_TPL, CAT: SHEET_CAT },
    foundSheets: {
      movimientos: !!movSheet,
      plantillas: !!tplSheet,
      categorias: !!catSheet,
      statusAccounts: !!staSheet,
      statusMonthly: !!stmSheet
    },
    allSheets: sheets,
    firstRowHeaders: headers
  };
}
