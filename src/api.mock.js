// Mock Columns (all visible)

// --- Contacts mock -----------------------------
const contacts = [
  {
    id: 'am',
    name: 'Allen Mitchell, Sales',
    email: 'allen.mitchell@example.com',
    color: '#62a0ff',
  },
  {
    id: 'br',
    name: 'Beth Richardson, Business Analyst',
    email: 'beth.richardson@example.com',
    color: '#88cc88',
  },
  {
    id: 'ca',
    name: 'Charlie Adams, Senior Engineer',
    email: 'charlie.adams@example.com',
    color: '#ee88cc',
  },
  {
    id: 'df',
    name: 'Diana Foster, Project Manager',
    email: 'diana.foster@example.com',
    color: '#555a65',
  },
  {
    id: 'ep',
    name: 'Ethan Parker, Engineer',
    email: 'ethan.parker@example.com',
    color: '#ee66aa',
  },
  {
    id: 'fs',
    name: 'Frank Sullivan, Tester',
    email: 'frank.sullivan@example.com',
    color: '#2b6cb0',
  },
];

// Return a lightweight list (id, name, email, color) for the dropdown
export async function getContacts() {
  return contacts;
}
const columns = [
  { id: 1, title: 'Task Name', type: 'TEXT_NUMBER' },
  { id: 2, title: 'Start', type: 'DATE' },
  { id: 3, title: 'End', type: 'DATE' },
  { id: 4, title: 'Duration', type: 'TEXT_NUMBER' },
  { id: 5, title: '% Complete', type: 'TEXT_NUMBER' },
  {
    id: 6,
    title: 'Status',
    type: 'PICKLIST',
    options: ['Not Started', 'In Progress', 'Complete', 'Blocked'],
  },
  { id: 7, title: 'Assigned To', type: 'CONTACT_LIST' },
  { id: 8, title: 'Milestone', type: 'CHECKBOX' },
  {
    id: 9,
    title: 'Health',
    type: 'PICKLIST',
    options: ['Green', 'Yellow', 'Red'],
  },
  { id: 10, title: 'Predecessors', type: 'TEXT_NUMBER' },
];

const phases = [
  { id: 1001, name: 'Mobilization' },
  { id: 1002, name: 'Align' },
  { id: 1003, name: 'Design' },
];

let rows = [
  // Phase
  flatPhase(1001, 1, 'Mobilization'),
  // Children
  flatTask(
    2001,
    2,
    1001,
    'Kickoff call',
    '2026-04-01',
    '2026-04-01',
    '0d',
    25,
    'In Progress',
    'Allen Mitchell',
    false,
    'Green',
    ''
  ),
  flatTask(
    2002,
    3,
    1001,
    'Stakeholder mapping',
    '2026-04-02',
    '2026-04-03',
    '1d',
    0,
    'Not Started',
    'Beth Richardson',
    false,
    'Yellow',
    '1FS'
  ),
  // Phase
  flatPhase(1002, 4, 'Align'),
  // Child
  flatTask(
    2003,
    5,
    1002,
    'Align task 1',
    '2026-04-07',
    '2026-04-10',
    '3d',
    60,
    'In Progress',
    'Charlie Adams',
    false,
    'Green',
    '2FS'
  ),
  // Phase
  flatPhase(1003, 6, 'Design'),
];

function cells(map) {
  const r = {};
  for (const c of columns) {
    const v = map[c.title];
    r[c.title] = {
      value: v ?? '',
      raw: v ?? null,
      // Pretend "Duration" and "Predecessors" are locked (formula/system)
      editable: c.title !== 'Duration' && c.title !== 'Predecessors',
    };
  }
  return r;
}
function flatPhase(id, rowNumber, title) {
  return {
    id,
    rowNumber,
    parentId: null,
    indent: 0,
    isPhase: true,
    cells: cells({ 'Task Name': title }),
  };
}
function flatTask(
  id,
  rowNumber,
  parentId,
  name,
  start,
  end,
  dur,
  pct,
  status,
  assigned,
  ms,
  health,
  pred
) {
  return {
    id,
    rowNumber,
    parentId,
    indent: 1,
    isPhase: false,
    cells: cells({
      'Task Name': name,
      Start: start,
      End: end,
      Duration: dur,
      '% Complete': pct,
      Status: status,
      'Assigned To': assigned,
      Milestone: ms,
      Health: health,
      Predecessors: pred,
    }),
  };
}

export async function getMeta() {
  return { sheetId: 123, columns, phases };
}
export async function getTasks() {
  return { rows };
}
export async function createTask(body) {
  const id = Math.floor(Math.random() * 100000) + 3000;
  rows.push(
    flatTask(
      id,
      rows.length + 1,
      body.parentId,
      body.cells['Task Name'] || 'New Task',
      body.cells['Start'] || '',
      body.cells['End'] || '',
      body.cells['Duration'] || '',
      body.cells['% Complete'] || 0,
      body.cells['Status'] || 'Not Started',
      body.cells['Assigned To'] || '',
      false,
      'Green',
      ''
    )
  );
  return { id };
}
export async function updateTask(rowId, patch) {
  const r = rows.find((r) => r.id === rowId);
  if (!r) return;
  for (const [k, v] of Object.entries(patch)) {
    if (r.cells[k]) {
      r.cells[k].value = v;
      r.cells[k].raw = v;
    }
  }
  return { ok: true };
}
export async function deleteTask(rowId) {
  const r = rows.find((r) => r.id === rowId);
  if (!r) return;
  if (!r.parentId) throw new Error('Cannot delete a phase');
  rows = rows.filter((x) => x.id !== rowId);
  return { ok: true };
}
