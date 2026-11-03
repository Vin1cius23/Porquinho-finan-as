import * as XLSX from 'xlsx';

export function getTodayISO() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function getCurrentMonthISO() {
  return getTodayISO().slice(0, 7);
}

export function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value || 0));
}

export function formatDateBR(isoDate) {
  if (!isoDate) return '';
  const clean = String(isoDate).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    const [y, m, d] = clean.split('-');
    return `${d}/${m}/${y}`;
  }
  return isoDate;
}

export function brToIsoDate(brOrIso) {
  if (!brOrIso) return new Date().toISOString().slice(0, 10);
  const str = String(brOrIso).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (match) {
    const d = match[1].padStart(2, '0');
    const m = match[2].padStart(2, '0');
    let y = match[3];
    if (y.length === 2) y = `20${y}`;
    return `${y}-${m}-${d}`;
  }
  return new Date().toISOString().slice(0, 10);
}

/**
 * Exporta os lançamentos para Excel (.xlsx) ou CSV (.csv) compatível com Excel e Google Sheets
 */
export function exportTransactionsToFile(transactions, format = 'xlsx') {
  const rows = transactions.map((t) => ({
    Data: formatDateBR(t.date),
    Descrição: t.description,
    Categoria: t.category,
    Tipo: t.type === 'income' ? 'Receita' : 'Despesa',
    Valor: Number(t.amount),
    'Forma de pagamento': t.payment_method,
    'Conta/Cartão': t.account_name,
    Recorrente: t.is_recurring ? 'Sim' : 'Não',
    Parcela: t.installment_info || '-',
    Observações: t.notes || '',
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Lançamentos');

  const todayStr = new Date().toISOString().slice(0, 10);
  if (format === 'csv') {
    XLSX.writeFile(workbook, `finchat-lancamentos-${todayStr}.csv`, { bookType: 'csv' });
  } else {
    XLSX.writeFile(workbook, `finchat-lancamentos-${todayStr}.xlsx`, { bookType: 'xlsx' });
  }
}

/**
 * Lê arquivo .xlsx ou .csv importado pelo usuário e converte para o formato da API
 */
export async function parseImportedSpreadsheet(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  return rawRows
    .map((row) => {
      const rawDate = row['Data'] || row['data'] || row['Date'] || '';
      const rawDesc = row['Descrição'] || row['Descricao'] || row['descrição'] || row['Description'] || 'Importado';
      const rawCat = row['Categoria'] || row['categoria'] || row['Category'] || 'Outros';
      const rawType = String(row['Tipo'] || row['tipo'] || 'Despesa').toLowerCase();
      const rawVal = row['Valor'] ?? row['valor'] ?? row['Amount'] ?? 0;
      const rawPay = row['Forma de pagamento'] || row['Pagamento'] || 'Débito';
      const rawAcc = row['Conta/Cartão'] || row['Conta'] || 'Conta Principal';
      const rawRec = String(row['Recorrente'] || 'Não').toLowerCase();
      const rawInst = row['Parcela'] === '-' ? '' : (row['Parcela'] || '');
      const rawNotes = row['Observações'] || row['Observacoes'] || '';

      const numVal = typeof rawVal === 'number'
        ? Math.abs(rawVal)
        : Math.abs(parseFloat(String(rawVal).replace(/[R$\s.]/g, '').replace(',', '.')) || 0);

      return {
        date: brToIsoDate(rawDate),
        description: String(rawDesc),
        category: String(rawCat),
        type: rawType.includes('receita') || rawType.includes('income') ? 'income' : 'expense',
        amount: numVal,
        payment_method: String(rawPay),
        account_name: String(rawAcc),
        is_recurring: rawRec === 'sim' || rawRec === 'true' || rawRec === '1',
        installment_info: String(rawInst),
        notes: String(rawNotes),
      };
    })
    .filter((item) => item.amount > 0);
}

