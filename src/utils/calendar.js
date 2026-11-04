import { formatCurrency, formatDateBR } from './formatters.js';

/**
 * Formata uma data YYYY-MM-DD e hora HH:MM para o formato iCalendar local (YYYYMMDDTHHMMSS)
 */
function toICSDateTime(isoDate, hour = 9, minute = 0) {
  const clean = (isoDate || new Date().toISOString().slice(0, 10)).slice(0, 10).replace(/-/g, '');
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  return `${clean}T${hh}${mm}00`;
}

/**
 * Escapa textos para o padrão RFC 5545 (.ics)
 */
function escapeICS(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Constrói um bloco VEVENT com 2 alarmes (VALARM):
 * 1) 1 dia antes às 09:00 (-P1D)
 * 2) No horário exato do vencimento às 09:00 (PT0M)
 * 3) 3 dias antes caso a conta seja de valor alto ou recorrente (-P3D)
 */
function buildVEventBlock(item) {
  const dueDate = item.due_date || item.date || new Date().toISOString().slice(0, 10);
  const dtStart = toICSDateTime(dueDate, 9, 0);
  const dtEnd = toICSDateTime(dueDate, 10, 0);
  const nowStamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const uid = `finchat-${item.id || Date.now()}-${dueDate}@porquinhofinancas.app`;

  const amountStr = item.amount && Number(item.amount) > 0 ? ` (${formatCurrency(item.amount)})` : '';
  const summary = `💰 Vencimento: ${item.description}${amountStr}`;
  const descriptionLines = [
    `Conta a pagar registrada no Porquinho Finanças (FinChat IA).`,
    item.amount && Number(item.amount) > 0 ? `Valor: ${formatCurrency(item.amount)}` : null,
    item.category ? `Categoria: ${item.category}` : null,
    item.account_name ? `Conta/Cartão: ${item.account_name}` : null,
    `Vencimento: ${formatDateBR(dueDate)}`,
  ]
    .filter(Boolean)
    .join('\n');

  const rruleLine = item.is_recurring ? '\r\nRRULE:FREQ=MONTHLY' : '';

  return [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${nowStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}${rruleLine}`,
    `SUMMARY:${escapeICS(summary)}`,
    `DESCRIPTION:${escapeICS(descriptionLines)}`,
    'STATUS:CONFIRMED',
    // Alerta 1: 1 dia antes do vencimento
    'BEGIN:VALARM',
    'TRIGGER:-P1D',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeICS(`⚠️ Amanhã vence: ${item.description}${amountStr}`)}`,
    'END:VALARM',
    // Alerta 2: No dia do vencimento às 09:00
    'BEGIN:VALARM',
    'TRIGGER:PT0M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeICS(`🚨 Vence HOJE: ${item.description}${amountStr}`)}`,
    'END:VALARM',
    'END:VEVENT',
  ].join('\r\n');
}

/**
 * Gera conteúdo completo de arquivo .ics (iCalendar) compatível com iPhone (iOS), Android, Google Calendar e Outlook
 */
export function generateICSContent(items) {
  const list = Array.isArray(items) ? items : [items];
  const events = list.map(buildVEventBlock).join('\r\n');

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Porquinho Financas//FinChat IA//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Porquinho Finanças - Vencimentos',
    events,
    'END:VCALENDAR',
  ].join('\r\n');
}

/**
 * Abre/baixa o arquivo .ics para adicionar o alerta diretamente no Calendário do celular (iOS / Android) ou PC
 */
export function addBillToDeviceCalendar(items, customFilename = null) {
  const list = Array.isArray(items) ? items : [items];
  if (list.length === 0) return;

  const icsContent = generateICSContent(list);
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const firstDesc = String(list[0].description || 'vencimento')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const filename =
    customFilename ||
    (list.length === 1 ? `alerta-${firstDesc || 'conta'}.ics` : 'alertas-vencimentos-finchat.ics');

  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * Gera URL direta para criar o evento com lembrete no Google Agenda (Google Calendar)
 */
export function getGoogleCalendarUrl(item) {
  const dueDate = item.due_date || item.date || new Date().toISOString().slice(0, 10);
  const dtStart = toICSDateTime(dueDate, 9, 0);
  const dtEnd = toICSDateTime(dueDate, 10, 0);

  const amountStr = item.amount && Number(item.amount) > 0 ? ` (${formatCurrency(item.amount)})` : '';
  const title = `💰 Vencimento: ${item.description}${amountStr}`;
  const details = [
    `Alerta de vencimento criado pelo Porquinho Finanças (FinChat IA).`,
    item.amount && Number(item.amount) > 0 ? `Valor: ${formatCurrency(item.amount)}` : null,
    item.category ? `Categoria: ${item.category}` : null,
    item.account_name ? `Conta/Cartão: ${item.account_name}` : null,
    `Vencimento: ${formatDateBR(dueDate)}`,
  ]
    .filter(Boolean)
    .join('\n');

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${dtStart}/${dtEnd}`,
    details,
  });

  if (item.is_recurring) {
    params.set('recur', 'RRULE:FREQ=MONTHLY');
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Solicita permissão e envia notificação nativa do navegador/PWA para contas próximas do vencimento
 */
export async function requestAndSendBillNotification(bill) {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }

  let permission = Notification.permission;
  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }
  if (permission !== 'granted') {
    return false;
  }

  const dueDate = bill.due_date || bill.date;
  const amountStr = bill.amount && Number(bill.amount) > 0 ? ` • ${formatCurrency(bill.amount)}` : '';
  const title = `🔔 Conta próxima do vencimento: ${bill.description}`;
  const body = `Vence em ${formatDateBR(dueDate)}${amountStr} (${bill.account_name || 'Carteira'})`;

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      if (reg && reg.showNotification) {
        await reg.showNotification(title, {
          body,
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
          tag: `bill-due-${bill.id || bill.description}-${dueDate}`,
          vibrate: [200, 100, 200],
        });
        return true;
      }
    }
    new Notification(title, {
      body,
      icon: '/icons/icon-192.png',
    });
    return true;
  } catch {
    return false;
  }
}
