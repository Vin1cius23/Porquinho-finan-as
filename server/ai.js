import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

// Schema Zod para validar rigorosamente a resposta JSON da IA antes de qualquer ação
export const AIResponseSchema = z.object({
  intent: z.enum([
    'confirm_transaction',
    'ask_missing_info',
    'query_finances',
    'delete_last',
    'general_chat',
  ]),
  reply: z.string().min(1),
  missing_field: z.enum(['amount', 'category', 'date', 'none']).optional().default('none'),
  transaction: z
    .object({
      type: z.enum(['income', 'expense']).default('expense'),
      amount: z.number().nullable().optional(),
      category: z.string().nullable().optional(),
      date: z.string().nullable().optional(), // YYYY-MM-DD
      description: z.string().optional().default('Lançamento'),
      payment_method: z.string().optional().default('Débito'),
      account_name: z.string().optional().default('Conta Principal'),
      is_recurring: z.boolean().optional().default(false),
      installments: z.number().int().min(1).max(72).optional().default(1),
      installment_info: z.string().optional().default(''),
      notes: z.string().optional().default(''),
    })
    .nullable()
    .optional(),
});

export function getTodaySaoPaulo() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date()); // YYYY-MM-DD
}

export function formatBRDate(isoDate) {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}/.test(isoDate)) return isoDate || '';
  const [y, m, d] = isoDate.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export function formatBRL(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value || 0));
}

/**
 * Prompt de sistema oficial enviado ao Claude (Anthropic)
 */
export function buildSystemPrompt({ todayISO, categories, accounts, financialSummary, partialDraft }) {
  const weekdayNames = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const nowSP = new Date(`${todayISO}T12:00:00-03:00`);
  const weekday = weekdayNames[nowSP.getDay()];

  return `Você é o FinChat IA, um assistente financeiro pessoal brasileiro amigável, objetivo e sem julgamentos.
Data atual (America/Sao_Paulo): ${todayISO} (${formatBRDate(todayISO)}, ${weekday}).
Moeda padrão: Real Brasileiro (R$ / BRL).

CATEGORIAS DISPONÍVEIS DO USUÁRIO:
${categories.join(', ')}

CONTAS E CARTÕES DO USUÁRIO:
${accounts.join(', ')}

RESUMO FINANCEIRO ANONIMIZADO DO MÊS ATUAL (Apenas para responder dúvidas):
${JSON.stringify(financialSummary)}

RASCUNHO PARCIAL DA ÚLTIMA MENSAGEM (se o usuário estiver respondendo uma pergunta sua):
${partialDraft ? JSON.stringify(partialDraft) : 'Nenhum'}

REGRAS OBRIGATÓRIAS:
1. Responda SEMPRE e EXCLUSIVAMENTE com um objeto JSON válido seguindo exatamente o formato abaixo, sem blocos markdown extras fora do JSON:
{
  "intent": "confirm_transaction" | "ask_missing_info" | "query_finances" | "delete_last" | "general_chat",
  "reply": "Texto em português do Brasil para exibir no chat",
  "missing_field": "amount" | "category" | "date" | "none",
  "transaction": {
    "type": "expense" | "income",
    "amount": 45.0,
    "category": "Alimentação",
    "date": "YYYY-MM-DD",
    "description": "Mercado",
    "payment_method": "Débito" | "Crédito" | "PIX" | "Dinheiro" | "Boleto",
    "account_name": "Nome da conta ou cartão",
    "is_recurring": false,
    "installments": 1,
    "installment_info": "",
    "notes": ""
  }
}

2. INTERPRETAÇÃO DE LINGUAGEM NATURAL:
   - Entenda valores informais: "50 pila" = 50, "1,5 mil" = 1500, "2 conto" = 2, "3.200" = 3200.
   - Entenda datas relativas em relação a ${todayISO}: "hoje" = ${todayISO}, "ontem", "anteontem", "sexta passada", "dia 10". Se o usuário não citar data mas estiver registrando algo no presente ("gastei 45 no mercado"), assuma hoje (${todayISO}).
   - Inferir categoria óbvia pelo contexto: "mercado/ifood/padaria/restaurante" -> "Alimentação"; "uber/gasolina/ ônibus" -> "Transporte"; "aluguel/luz/água/condomínio" -> "Moradia"; "salário/freela/dividendo" -> "Outros" ou "Investimentos" (type: "income"); "netflix/spotify" -> "Assinaturas" (is_recurring: true).
   - Se for parcelado (ex: "em 3x", "10 parcelas"), defina "installments": N, "installment_info": "1/N" e "payment_method": "Crédito".

3. QUANDO FALTAR INFORMAÇÃO ESSENCIAL (valor ou categoria impossível de deduzir):
   - Use "intent": "ask_missing_info", preencha no objeto "transaction" tudo o que já descobriu e faça APENAS UMA pergunta curta e direta em "reply".

4. ANTES DE SALVAR UM LANÇAMENTO COMPLETO:
   - Quando tiver valor, categoria e data, use "intent": "confirm_transaction" e em "reply" apresente um resumo claro pedindo confirmação, por exemplo:
     "Despesa de R$ 45,00 em Alimentação (Mercado), em ${formatBRDate(todayISO)}, no Débito. Confirmar?"

5. COMANDOS E CONSULTAS:
   - Se pedir para apagar/excluir o último lançamento: use "intent": "delete_last".
   - Se perguntar "quanto gastei esse mês com X?", "mostre meus 5 maiores gastos", "estou gastando demais em quê?": use "intent": "query_finances" e responda com números exatos do RESUMO FINANCEIRO. Inclua uma dica curta e gentil de economia se fizer sentido.`;
}

/**
 * Resolve datas relativas em português ("hoje", "ontem", "sexta passada", "dia 10", "dd/mm/aaaa")
 */
function parseRelativeDatePT(text, todayISO) {
  const lower = text.toLowerCase();
  const base = new Date(`${todayISO}T12:00:00-03:00`);

  if (/\banteontem\b/.test(lower)) {
    base.setDate(base.getDate() - 2);
    return base.toISOString().slice(0, 10);
  }
  if (/\bontem\b/.test(lower)) {
    base.setDate(base.getDate() - 1);
    return base.toISOString().slice(0, 10);
  }
  if (/\bamanh[aã]\b/.test(lower)) {
    base.setDate(base.getDate() + 1);
    return base.toISOString().slice(0, 10);
  }

  // "segunda passada", "terça passada", "quarta passada", "quinta passada", "sexta passada", "sábado passado", "domingo passado"
  const weekdaysMap = [
    { rx: /domingo\s+passad[oa]/, day: 0 },
    { rx: /segunda(?:-feira)?\s+passad[oa]/, day: 1 },
    { rx: /ter[cç]a(?:-feira)?\s+passad[oa]/, day: 2 },
    { rx: /quarta(?:-feira)?\s+passad[oa]/, day: 3 },
    { rx: /quinta(?:-feira)?\s+passad[oa]/, day: 4 },
    { rx: /sexta(?:-feira)?\s+passad[oa]/, day: 5 },
    { rx: /s[aá]bado\s+passad[oa]/, day: 6 },
  ];
  for (const w of weekdaysMap) {
    if (w.rx.test(lower)) {
      const currentDay = base.getDay();
      let diff = currentDay - w.day;
      if (diff <= 0) diff += 7;
      base.setDate(base.getDate() - diff);
      return base.toISOString().slice(0, 10);
    }
  }

  // "dia 10" ou "no dia 15"
  const dayMatch = lower.match(/\bdia\s+(\d{1,2})\b/);
  if (dayMatch) {
    const dayNum = Math.min(31, Math.max(1, parseInt(dayMatch[1], 10)));
    const [y, m] = todayISO.split('-');
    return `${y}-${m}-${String(dayNum).padStart(2, '0')}`;
  }

  // "dd/mm/aaaa" ou "dd/mm"
  const brDateMatch = lower.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (brDateMatch && !lower.includes('parcela')) {
    const d = String(brDateMatch[1]).padStart(2, '0');
    const m = String(brDateMatch[2]).padStart(2, '0');
    let y = brDateMatch[3] || todayISO.slice(0, 4);
    if (y.length === 2) y = `20${y}`;
    if (Number(m) >= 1 && Number(m) <= 12 && Number(d) >= 1 && Number(d) <= 31) {
      return `${y}-${m}-${d}`;
    }
  }

  return todayISO;
}

/**
 * Extrai valores monetários informais ("50 pila", "1,5 mil", "3.200", "45,90")
 */
function parseAmountPT(text) {
  const lower = text
    .toLowerCase()
    .replace(/\b(\d+)\s*(?:x|vezes|parcelas?)\b/gi, '') // remove "3x", "10 parcelas", "5 vezes"
    .replace(/\bdia\s+\d{1,2}\b/g, '') // remove "dia 10"
    .replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, ''); // remove datas dd/mm

  // "1,5 mil" ou "2 mil"
  const milMatch = lower.match(/(\d+(?:[.,]\d+)?)\s*mil\b/);
  if (milMatch) {
    const num = parseFloat(milMatch[1].replace(',', '.'));
    if (!isNaN(num)) return num * 1000;
  }

  // "R$ 3.200,50" ou "3.200" ou "45,90" ou "50 pila" / "50 reais" / "50 conto"
  const moneyRegex = /(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)/i;
  const match = lower.match(moneyRegex);
  if (!match) return null;

  let raw = match[1];
  if (raw.includes('.') && raw.includes(',')) {
    raw = raw.replace(/\./g, '').replace(',', '.');
  } else if (raw.includes('.')) {
    // Se tiver exatamente 3 casas após o ponto (ex: 3.200), é separador de milhar
    if (/^\d{1,3}(\.\d{3})+$/.test(raw)) {
      raw = raw.replace(/\./g, '');
    }
  } else if (raw.includes(',')) {
    raw = raw.replace(',', '.');
  }

  const val = parseFloat(raw);
  return isNaN(val) || val <= 0 ? null : val;
}

/**
 * infere categoria e descrição a partir do texto em português
 */
function inferCategoryAndDesc(text, availableCategories) {
  const lower = text.toLowerCase();
  const rules = [
    { category: 'Alimentação', keywords: ['mercado', 'supermercado', 'ifood', 'padaria', 'restaurante', 'almoço', 'almoco', 'jantar', 'lanche', 'café', 'cafe', 'feira', 'açougue', 'pizza', 'hamburguer', 'alimentação', 'alimentacao', 'comida'] },
    { category: 'Transporte', keywords: ['uber', '99', 'gasolina', 'combustível', 'combustivel', 'etanol', 'ônibus', 'onibus', 'metrô', 'metro', 'estacionamento', 'pedágio', 'pedagio', 'transporte', 'oficina'] },
    { category: 'Moradia', keywords: ['aluguel', 'condomínio', 'condominio', 'luz', 'energia', 'enel', 'água', 'agua', 'sabesp', 'gás', 'gas', 'iptu', 'internet', 'moradia', 'casa'] },
    { category: 'Saúde', keywords: ['farmácia', 'farmacia', 'remédio', 'remedio', 'médico', 'medico', 'consulta', 'exame', 'dentista', 'plano de saúde', 'academia', 'saúde', 'saude'] },
    { category: 'Educação', keywords: ['curso', 'faculdade', 'escola', 'livro', 'apostila', 'inglês', 'ingles', 'udemy', 'alura', 'educação', 'educacao'] },
    { category: 'Assinaturas', keywords: ['netflix', 'spotify', 'amazon', 'prime', 'disney', 'icloud', 'youtube', 'chatgpt', 'claude', 'assinatura', 'mensalidade'] },
    { category: 'Lazer', keywords: ['cinema', 'show', 'bar', 'cerveja', 'viagem', 'hotel', 'passeio', 'jogo', 'game', 'shopping', 'presente', 'lazer', 'fone', 'roupa'] },
    { category: 'Dívidas', keywords: ['empréstimo', 'emprestimo', 'fatura', 'juros', 'dívida', 'divida', 'financiamento', 'acordo'] },
    { category: 'Investimentos', keywords: ['tesouro', 'cdb', 'ação', 'acoes', 'fii', 'bitcoin', 'cripto', 'poupança', 'poupanca', 'investimento', 'aporte', 'reserva'] },
  ];

  for (const rule of rules) {
    for (const kw of rule.keywords) {
      if (lower.includes(kw)) {
        const matchedCat = availableCategories.find((c) => c.toLowerCase() === rule.category.toLowerCase()) || rule.category;
        const cleanDesc = kw.charAt(0).toUpperCase() + kw.slice(1);
        return { category: matchedCat, keywordDesc: cleanDesc };
      }
    }
  }

  // Verifica se o próprio nome de uma categoria cadastrada pelo usuário está na mensagem
  for (const cat of availableCategories) {
    if (lower.includes(cat.toLowerCase())) {
      return { category: cat, keywordDesc: cat };
    }
  }

  if (/\b(sal[aá]rio|freela|freelance|pix recebido|rendimento|venda|reembolso)\b/.test(lower)) {
    return { category: 'Outros', keywordDesc: lower.includes('sal') ? 'Salário' : 'Receita' };
  }

  return { category: null, keywordDesc: null };
}

/**
 * Motor local inteligente (usado como fallback instantâneo se ANTHROPIC_API_KEY não estiver definida)
 */
function localSmartInterpreter({ message, todayISO, categories, accounts, financialSummary, partialDraft }) {
  const lower = message.trim().toLowerCase();

  // 1. Comando: apagar último lançamento
  if (/(apag(ue|ar)|exclu(ir|a)|delet(ar|e)|remov(er|a)).*(último|ultimo|lançamento|lancamento)/i.test(lower)) {
    return {
      intent: 'delete_last',
      reply: 'Prontinho! Confirma a exclusão do último lançamento ou já apaguei para você.',
      missing_field: 'none',
      transaction: null,
    };
  }

  // 2. Consultas: "5 maiores gastos"
  if (/(maiores\s+gastos|top\s*5|gastos\s+mais\s+altos)/i.test(lower)) {
    const top = financialSummary.topExpenses || [];
    if (top.length === 0) {
      return {
        intent: 'query_finances',
        reply: 'Você ainda não tem despesas registradas neste mês.',
        missing_field: 'none',
        transaction: null,
      };
    }
    const list = top
      .map((t, i) => `${i + 1}. **${t.description}** (${t.category}) — ${formatBRL(t.amount)} em ${formatBRDate(t.date)}`)
      .join('\n');
    return {
      intent: 'query_finances',
      reply: `Aqui estão os seus **${top.length} maiores gastos** deste mês:\n\n${list}\n\n💡 *Dica: Concentrar atenção nos 2 maiores itens costuma gerar 80% da economia mensal!*`,
      missing_field: 'none',
      transaction: null,
    };
  }

  // 3. Consultas: "estou gastando demais em quê?"
  if (/(gastando\s+demais|onde\s+gasto\s+mais|qual\s+minha\s+maior\s+despesa|resumo\s+do\s+m[eê]s)/i.test(lower)) {
    const byCat = financialSummary.byCategory || [];
    if (byCat.length === 0) {
      return {
        intent: 'query_finances',
        reply: 'Ainda não há gastos suficientes neste mês para analisar excessos.',
        missing_field: 'none',
        transaction: null,
      };
    }
    const biggest = byCat[0];
    const overBudget = byCat.filter((c) => c.budget > 0 && c.total >= c.budget * 0.8);
    let advice = `Sua maior categoria neste mês é **${biggest.category}**, somando **${formatBRL(biggest.total)}** (${biggest.percentage}% das despesas).`;
    if (overBudget.length > 0) {
      const alerts = overBudget
        .map((c) => `• **${c.category}**: ${formatBRL(c.total)} de ${formatBRL(c.budget)} (${Math.round((c.total / c.budget) * 100)}%)`)
        .join('\n');
      advice += `\n\n⚠️ **Atenção aos orçamentos próximos ou acima do limite:**\n${alerts}`;
    } else {
      advice += `\n\n✅ A boa notícia é que todas as suas categorias estão abaixo de 80% do orçamento planejado!`;
    }
    return {
      intent: 'query_finances',
      reply: advice,
      missing_field: 'none',
      transaction: null,
    };
  }

  // 4. Consultas: "quanto gastei esse mês..."
  if (/(quanto\s+(eu\s+)?gastei|qual\s+o\s+total|gasto\s+com|gastos\s+com|quanto\s+recebi)/i.test(lower)) {
    for (const cat of categories) {
      if (lower.includes(cat.toLowerCase())) {
        const found = (financialSummary.byCategory || []).find(
          (c) => c.category.toLowerCase() === cat.toLowerCase()
        );
        const totalCat = found ? found.total : 0;
        const budgetInfo = found && found.budget > 0
          ? ` (seu orçamento mensal para ${cat} é de ${formatBRL(found.budget)})`
          : '';
        return {
          intent: 'query_finances',
          reply: `Neste mês, você gastou **${formatBRL(totalCat)}** com **${cat}**${budgetInfo}.`,
          missing_field: 'none',
          transaction: null,
        };
      }
    }
    return {
      intent: 'query_finances',
      reply: `Neste mês você acumulou:\n• **Receitas:** ${formatBRL(financialSummary.totalIncome)}\n• **Despesas:** ${formatBRL(financialSummary.totalExpense)}\n• **Saldo do mês:** ${formatBRL(financialSummary.totalIncome - financialSummary.totalExpense)}`,
      missing_field: 'none',
      transaction: null,
    };
  }

  // 5. Criação ou continuação de lançamento
  const isIncome = /\b(recebi|ganhei|sal[aá]rio|freela|freelance|rendeu|dividendo|reembolso|entrou|depositaram)\b/i.test(lower);
  const amount = parseAmountPT(message) ?? partialDraft?.amount ?? null;
  const inferred = inferCategoryAndDesc(message, categories);
  const category = inferred.category || partialDraft?.category || null;
  const date = parseRelativeDatePT(message, todayISO) || partialDraft?.date || todayISO;

  let paymentMethod = partialDraft?.payment_method || 'Débito';
  if (/\b(cr[eé]dito|cart[aã]o|parcelad[oa]|\d+\s*x)\b/i.test(lower)) paymentMethod = 'Crédito';
  else if (/\bpix\b/i.test(lower)) paymentMethod = 'PIX';
  else if (/\b(dinheiro|esp[eé]cie)\b/i.test(lower)) paymentMethod = 'Dinheiro';
  else if (/\bboleto\b/i.test(lower)) paymentMethod = 'Boleto';
  else if (isIncome) paymentMethod = 'PIX';

  const installmentsMatch = lower.match(/\b(\d{1,2})\s*(?:x|vezes|parcelas)\b/i);
  const installments = installmentsMatch ? Math.max(1, parseInt(installmentsMatch[1], 10)) : (partialDraft?.installments || 1);
  const installmentInfo = installments > 1 ? `1/${installments}` : (partialDraft?.installment_info || '');
  const isRecurring = /\b(recorrente|mensal|todo\s+m[eê]s|assinatura|aluguel|sal[aá]rio|condom[ií]nio)\b/i.test(lower) || Boolean(partialDraft?.is_recurring);

  const defaultAcc = paymentMethod === 'Crédito'
    ? (accounts.find((a) => a.toLowerCase().includes('cart')) || accounts[0] || 'Cartão de Crédito')
    : (accounts[0] || 'Conta Principal');

  // Limpa descrição amigável
  const prevDesc =
    partialDraft?.description &&
    !['Despesa geral', 'Receita recebida', 'Lançamento', 'Outros'].includes(partialDraft.description)
      ? partialDraft.description
      : null;
  let description = prevDesc || inferred.keywordDesc || '';
  if (!description || description === 'Outros') {
    const cleaned = message
      .replace(/(?:gastei|paguei|comprei|recebi|ganhei|no|na|em|de|do|da|hoje|ontem|anteontem|reais|pila|conto|r\$|\d+(?:[.,]\d+)?)/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    description = cleaned.length >= 2
      ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1, 40)
      : (isIncome ? 'Receita recebida' : 'Despesa geral');
  }

  const draftTx = {
    type: partialDraft?.type || (isIncome ? 'income' : 'expense'),
    amount,
    category,
    date,
    description,
    payment_method: paymentMethod,
    account_name: defaultAcc,
    is_recurring: isRecurring,
    installments,
    installment_info: installmentInfo,
    notes: installments > 1 ? `Compra parcelada em ${installments}x` : '',
  };

  // Se não parece nem comando nem lançamento
  if (!amount && !category && !/\b(gastei|paguei|comprei|recebi|ganhei|conta|almoço|mercado|uber)\b/i.test(lower)) {
    return {
      intent: 'general_chat',
      reply: 'Posso registrar seus gastos e receitas ou responder dúvidas sobre seu mês! Experimente dizer algo como *"Gastei 45 reais no mercado hoje"* ou *"Quanto gastei esse mês com Alimentação?"*.',
      missing_field: 'none',
      transaction: null,
    };
  }

  // Pergunta única se faltar valor ou categoria
  if (!amount) {
    return {
      intent: 'ask_missing_info',
      reply: `Qual foi o valor desse lançamento${category ? ` em **${category}**` : ''}?`,
      missing_field: 'amount',
      transaction: draftTx,
    };
  }

  if (!category) {
    return {
      intent: 'ask_missing_info',
      reply: `Em qual categoria você quer classificar esse valor de **${formatBRL(amount)}**? (ex.: Alimentação, Moradia, Transporte, Lazer, Saúde)`,
      missing_field: 'category',
      transaction: draftTx,
    };
  }

  const labelType = draftTx.type === 'income' ? 'Receita' : 'Despesa';
  const parcelText = draftTx.installments > 1 ? ` (${draftTx.installments}x de ${formatBRL(draftTx.amount / draftTx.installments)})` : '';
  const recText = draftTx.is_recurring ? ', recorrente' : '';

  return {
    intent: 'confirm_transaction',
    reply: `${labelType} de **${formatBRL(draftTx.amount)}**${parcelText} em **${draftTx.category}** (${draftTx.description}), dia **${formatBRDate(draftTx.date)}**, no **${draftTx.payment_method}** (${draftTx.account_name}${recText}). Confirmar?`,
    missing_field: 'none',
    transaction: draftTx,
  };
}

/**
 * Função principal que chama a API do Claude (Anthropic) e valida o JSON com Zod.
 * Se ANTHROPIC_API_KEY não estiver configurada, usa o interpretador local com a mesma estrutura validada.
 */
export async function interpretUserMessage({ message, categories, accounts, financialSummary, partialDraft }) {
  const todayISO = getTodaySaoPaulo();
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (apiKey && apiKey !== 'sk-ant-api03-sua-chave-aqui' && apiKey.trim().length > 10) {
    try {
      const anthropic = new Anthropic({ apiKey: apiKey.trim() });
      const systemPrompt = buildSystemPrompt({
        todayISO,
        categories,
        accounts,
        financialSummary,
        partialDraft,
      });

      const response = await anthropic.messages.create({
        model: process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-latest',
        max_tokens: 600,
        temperature: 0.1,
        system: systemPrompt,
        messages: [{ role: 'user', content: message }],
      });

      const rawText = response.content?.[0]?.text || '';
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return AIResponseSchema.parse(parsed);
      }
    } catch (err) {
      console.warn('[FinChat AI] Aviso na chamada Anthropic Claude, usando fallback local validado:', err.message);
    }
  }

  const localResult = localSmartInterpreter({
    message,
    todayISO,
    categories,
    accounts,
    financialSummary,
    partialDraft,
  });

  return AIResponseSchema.parse(localResult);
}

