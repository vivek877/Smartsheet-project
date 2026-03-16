// src/api.mock.js

/** ----------------------------------------------------------------------------
 * Smartsheet-compatible MOCK for your sheet:
 *  - Primary (name) column
 *  - Start Date / End Date (date-like)
 *  - % Complete (0..1 internally, but UI shows 0..100)
 *  - Status, Health => FORMULA (read-only)
 *  - Assigned To => MULTI-CONTACT (array of emails), even if type reads TEXT_NUMBER
 *  - Duration, Predecessors, Working Days Remaining, System fields => read-only
 *  - Top-level rows (no parentId) are PHASES; children are tasks
 * ----------------------------------------------------------------------------
 */

//
// CONTACTS (for multi-select Assigned To)
//
const contacts = [
  { id: 'am', name: 'Allen Mitchell, Sales', email: 'allen.mitchell@example.com', color: '#62a0ff' },
  { id: 'br', name: 'Beth Richardson, Business Analyst', email: 'beth.richardson@example.com', color: '#88cc88' },
  { id: 'ca', name: 'Charlie Adams, Senior Engineer', email: 'charlie.adams@example.com', color: '#cc88cc' },
  { id: 'df', name: 'Diana Foster, Project Manager', email: 'diana.foster@example.com', color: '#555a65' },
  { id: 'ep', name: 'Ethan Parker, Engineer', email: 'ethan.parker@example.com', color: '#ef6a9a' },
  { id: 'fs', name: 'Frank Sullivan, Tester', email: 'frank.sullivan@example.com', color: '#2b6cb0' },
];

export async function getContacts() {
  return contacts;
}

//
// COLUMNS (mirrors your sample)
//
// NOTE on types:
// - Smartsheet returns "ABSTRACT_DATETIME" for Start/End; we treat them as date fields in the UI.
// - Assigned To in your JSON appears as TEXT_NUMBER but with contactOptions. We treat it as CONTACT_LIST.
//
const columns = [
  { id: 7500498150838148n, title: 'Children', type: 'TEXT_NUMBER' },
  { id: 1870998616625028n, title: 'Ancestors', type: 'TEXT_NUMBER' },
  { id: 6374598243995524n, title: 'MR', type: 'CHECKBOX' },
  { id: 4122798430310276n, title: 'ATT', type: 'CHECKBOX' },
  { id: 8626398057680772n, title: 'Milestone', type: 'TEXT_NUMBER' },
  { id: 463623733071748n,  title: 'Health', type: 'PICKLIST', options: ['Red','Yellow','Green','Blue'] },
  { id: 4967223360442244n, title: 'Primary', type: 'TEXT_NUMBER', primary: true },
  { id: 2715423546756996n, title: 'Start Date', type: 'ABSTRACT_DATETIME' },
  { id: 7219023174127492n, title: 'End Date', type: 'ABSTRACT_DATETIME' },
  { id: 1589523639914372n, title: '% Complete', type: 'TEXT_NUMBER' }, // stored 0..100 in mock (UI convenience)
  { id: 6093123267284868n, title: 'Status', type: 'PICKLIST', options: ['In Queue','In Progress','Complete','Hold'] },
  // even though sample shows TEXT_NUMBER + contactOptions, we will treat it as contact-like
  { id: 3841323453599620n, title: 'Assigned To', type: 'CONTACT_LIST' },
  { id: 8344923080970116n, title: 'Duration', type: 'DURATION' },
  { id: 1026573686493060n, title: 'Predecessors', type: 'PREDECESSOR' },
  { id: 5530173313863556n, title: 'Working Days Remaining', type: 'TEXT_NUMBER' },
  { id: 3278373500178308n, title: 'Modified', type: 'DATETIME', systemColumnType: 'MODIFIED_DATE' },
  { id: 7781973127548804n, title: 'Modified By', type: 'CONTACT_LIST', systemColumnType: 'MODIFIED_BY' },
];

/** Helpers to mark which columns are editable inline in UI (mock rules) */
const EDITABLE_BY_TITLE = new Set([
  'Primary',
  'Start Date',
  'End Date',
  '% Complete',
  'Assigned To'
]);
const READONLY_ALWAYS = new Set([
  'Children','Ancestors','MR','ATT','Milestone','Health','Duration','Predecessors','Working Days Remaining','Modified','Modified By','Status'
]);

/** Build cell object */
function makeCellMap(mapIn) {
  const cellMap = {};
  for (const col of columns) {
    const value = mapIn[col.title];
    const editable = EDITABLE_BY_TITLE.has(col.title) && !READONLY_ALWAYS.has(col.title);
    cellMap[col.title] = { value: value ?? '', raw: value ?? null, editable };
  }
  return cellMap;
}

/** Row factories */
function phaseRow(id, rowNumber, name) {
  return {
    id, rowNumber,
    parentId: null,
    indent: 0,
    isPhase: true,
    cells: makeCellMap({
      'Primary': name,
      // formulas drive Health/Status in real sheet; keep read-only placeholders
      'Health': 'Green',
      'Status': 'In Queue',
      '% Complete': 0,
    })
  };
}
function taskRow(id, rowNumber, parentId, name, startISO, endISO, percent, assignedEmails, statusRO='In Progress', healthRO='Green', durationRO='1d', predecessorsRO='') {
  return {
    id, rowNumber,
    parentId,
    indent: 1,
    isPhase: false,
    cells: makeCellMap({
      'Primary': name,
      'Start Date': startISO || '',
      'End Date': endISO || '',
      '% Complete': typeof percent === 'number' ? percent : 0,
      // assigned to as array of emails (multi-select)
      'Assigned To': Array.isArray(assignedEmails) ? assignedEmails : (assignedEmails ? [assignedEmails] : []),
      // read-only / derived-like fields
      'Status': statusRO,
      'Health': healthRO,
      'Duration': durationRO,
      'Predecessors': predecessorsRO
    })
  };
}

// Seed rows (subset of your sample to keep file compact; feel free to add more):
let rows = [];
let rn = 1;

// Project header (top-level) – we’ll treat as Phase also (read-only)
const projectId = 3235632776544132n;
rows.push(phaseRow(projectId, rn++, 'PR-123456 - Example Project Plan'));

// PHASE: Mobilization
const mobilizationId = 7739232403914630n; // arbitrary unique ids for mock
rows.push(phaseRow(mobilizationId, rn++, 'Mobilization'));
rows.push(taskRow(2109732869701510n, rn++, mobilizationId, 'Mobilization task 1',
  '2026-02-01', '2026-02-01', 100, ['allen.mitchell@example.com'], 'Complete', 'Green', '1d'));
rows.push(taskRow(6613332497072000n, rn++, mobilizationId, 'Mobilization task 2',
  '2026-02-02', '2026-02-02', 100, ['allen.mitchell@example.com'], 'Complete', 'Green', '1d', '3FS'));
rows.push(taskRow(4361532683386760n, rn++, mobilizationId, 'Mobilization task 3',
  '2026-02-03', '2026-02-03', 100, ['allen.mitchell@example.com'], 'Complete', 'Green', '1d', '4FS'));

// PHASE: Align
const alignId = 4783745148452740n;
rows.push(phaseRow(alignId, rn++, 'Align'));
rows.push(taskRow(7035544962137990n, rn++, alignId, 'Align task 1',
  '2026-02-04', '2026-02-04', 100, ['allen.mitchell@example.com','beth.richardson@example.com'], 'Complete', 'Green', '1d', '7FS'));
rows.push(taskRow(1406045427924870n, rn++, alignId, 'Align task 2',
  '2026-02-05', '2026-02-05', 100, ['allen.mitchell@example.com','beth.richardson@example.com'], 'Complete', 'Green', '1d', '9FS'));
rows.push(taskRow(5909645055295360n, rn++, alignId, 'Align task 3',
  '2026-02-06', '2026-02-06', 100, ['allen.mitchell@example.com','beth.richardson@example.com'], 'Complete', 'Green', '1d', '10FS'));

// PHASE: Design
const designId = 8161444868980610n;
rows.push(phaseRow(designId, rn++, 'Design'));
rows.push(taskRow(5346695101874050n, rn++, designId, 'Design task 1',
  '2026-02-09', '2026-02-13', 100, ['beth.richardson@example.com','charlie.adams@example.com'], 'Complete', 'Green', '5d', '13FS'));
rows.push(taskRow(3094895288188800n, rn++, designId, 'Design task 2',
  '2026-02-16', '2026-02-20', 100, ['beth.richardson@example.com','charlie.adams@example.com'], 'Complete', 'Green', '5d', '15FS'));
rows.push(taskRow(7598494915559300n, rn++, designId, 'Design task 3',
  '2026-02-23', '2026-02-27', 100, ['beth.richardson@example.com','charlie.adams@example.com'], 'Complete', 'Green', '5d', '16FS'));

// PHASE: Develop
const developId = 6472595008716680n;
rows.push(phaseRow(developId, rn++, 'Develop'));
rows.push(taskRow(4220795195031430n, rn++, developId, 'Implementation',
  '2026-03-02', '2026-03-20', 67, ['charlie.adams@example.com','ethan.parker@example.com'], 'In Progress', 'Yellow', '15d'));
rows.push(taskRow(8724394822401920n, rn++, developId, 'Testing',
  '2026-03-09', '2026-03-27', 0, ['frank.sullivan@example.com'], 'In Progress', 'Red', '15d'));

// PHASE: Deploy
const deployId = 7879969892269960n;
rows.push(phaseRow(deployId, rn++, 'Deploy'));
rows.push(taskRow(6754069985427330n, rn++, deployId, 'Deploy task 1',
  '2026-03-30', '2026-04-03', 0, ['charlie.adams@example.com'], 'In Queue', 'Blue', '5d', '33FS'));
rows.push(taskRow(4502270171742080n, rn++, deployId, 'Deploy task 2',
  '2026-04-06', '2026-04-10', 0, ['charlie.adams@example.com'], 'In Queue', 'Blue', '5d', '35FS'));
rows.push(taskRow(9005869799112580n, rn++, deployId, 'Deploy task 3',
  '2026-04-13', '2026-04-17', 0, ['charlie.adams@example.com'], 'In Queue', 'Blue', '5d', '36FS'));

/** ------------------------------- API SURFACE -------------------------------- */

export async function getMeta() {
  // PHASES are top-level rows (no parentId)
  const phases = rows
    .filter(r => r.parentId === null)
    .map(r => ({ id: r.id, name: r.cells['Primary'].value || 'Phase' }));

  return {
    sheetId: 535205132586884, // your sheet id (for display only in mock)
    columns,
    phases
  };
}

export async function getTasks() {
  return { rows };
}

export async function createTask(body) {
  // body: { parentId, cells: { 'Primary': '...', 'Start Date': 'YYYY-MM-DD', 'End Date': 'YYYY-MM-DD', '% Complete': n, 'Assigned To': [emails] } }
  const id = BigInt(Math.floor(Math.random() * 9_000_000_000_000_000) + 1_000_000_000_000_000);
  const parentId = body.parentId ? BigInt(body.parentId) : null;
  const lastRowNum = rows.length ? Math.max(...rows.map(r => Number(r.rowNumber))) : 0;

  const name = (body.cells?.['Primary'] ?? body.cells?.['Task Name'] ?? 'New Task');
  const start = body.cells?.['Start Date'] || body.cells?.['Start'] || '';
  const end   = body.cells?.['End Date']   || body.cells?.['End']   || '';
  const pct   = typeof body.cells?.['% Complete'] === 'number' ? body.cells['% Complete'] : 0;
  const assg  = Array.isArray(body.cells?.['Assigned To']) ? body.cells['Assigned To'] : (
                 body.cells?.['Assigned To'] ? [body.cells['Assigned To']] : []
               );

  const row = taskRow(id, lastRowNum + 1, parentId, name, start, end, pct, assg, 'In Queue', 'Blue', '1d', '');
  rows.push(row);
  return { id: row.id };
}

export async function updateTask(rowId, patch) {
  // patch: { 'Primary': 'x', 'Start Date': 'YYYY-MM-DD', 'End Date': 'YYYY-MM-DD', '% Complete': n, 'Assigned To': [emails], ... }
  const idBig = BigInt(rowId);
  const row = rows.find(r => r.id === idBig);
  if (!row) return;

  for (const [k, v] of Object.entries(patch || {})) {
    const cell = row.cells[k];
    if (!cell) continue;
    if (!cell.editable) continue; // respect read-only
    // normalize percent if someone sends 0..1
    if (k === '% Complete') {
      row.cells[k].value = typeof v === 'number'
        ? (v <= 1 ? Math.round(v * 100) : Math.round(v)) // store 0..100
        : 0;
      continue;
    }
    // normalize assigned to -> array of emails
    if (k === 'Assigned To') {
      row.cells[k].value = Array.isArray(v) ? v : (v ? [v] : []);
      continue;
    }
    // dates and name fall through
    row.cells[k].value = v ?? '';
    row.cells[k].raw = v ?? null;
  }
  return { ok: true };
}

export async function deleteTask(rowId) {
  const idBig = BigInt(rowId);
  const row = rows.find(r => r.id === idBig);
  if (!row) return;
  if (row.parentId === null) throw new Error('Cannot delete a phase');
  rows = rows.filter(r => r.id !== idBig);
  return { ok: true };
}