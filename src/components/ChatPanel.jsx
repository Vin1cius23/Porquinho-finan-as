import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Send,
  Check,
  Edit3,
  X,
  Bot,
  Sparkles,
  CheckCircle2,
  XCircle,
  Mic,
  MicOff,
  Zap,
  Tag,
  Calendar,
  CreditCard,
} from 'lucide-react';
import { formatCurrency, formatDateBR } from '../utils/formatters.js';

const QUICK_EXAMPLES = [
  { label: '🛒 Mercado R$ 45', text: 'Gastei 45 reais no mercado hoje no débito' },
  { label: '💰 Salário R$ 3.200', text: 'Recebi 3.200 de salário' },
  { label: '🚗 Uber R$ 28 PIX', text: 'Paguei 28 reais de Uber hoje no PIX' },
  { label: '📊 Gasto Alimentação?', text: 'Quanto gastei esse mês com Alimentação?' },
  { label: '🏆 Top 5 gastos', text: 'Mostre meus 5 maiores gastos' },
  { label: '🔍 Onde gasto mais?', text: 'Estou gastando demais em quê?' },
  { label: '🗑️ Apagar último', text: 'Apague o último lançamento' },
];

const CATEGORY_EMOJIS = {
  Moradia: '🏠',
  Alimentação: '🍔',
  Transporte: '🚗',
  Saúde: '💊',
  Educação: '📚',
  Lazer: '🎉',
  Assinaturas: '📺',
  Dívidas: '💳',
  Investimentos: '📈',
  Outros: '📦',
};

// Detector instantâneo no cliente para mostrar preview ao vivo enquanto o usuário digita
function detectLivePreview(text) {
  const clean = text.trim();
  if (clean.length < 3) return null;
  const lower = clean.toLowerCase();

  if (/^(quanto|mostre|apague|exclu|onde|estou)/i.test(lower)) {
    return { isCommand: true, label: 'Comando / Consulta Inteligente' };
  }

  const isIncome = /\b(recebi|ganhei|sal[aá]rio|freela|rendeu|dividendo|reembolso|entrou)\b/i.test(lower);
  const milMatch = lower.match(/(\d+(?:[.,]\d+)?)\s*mil\b/);
  let amount = null;
  if (milMatch) {
    amount = parseFloat(milMatch[1].replace(',', '.')) * 1000;
  } else {
    const cleanForMoney = lower.replace(/\b\d+\s*x\b/g, '').replace(/\bdia\s+\d+\b/g, '');
    const m = cleanForMoney.match(/(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)/i);
    if (m) {
      let raw = m[1];
      if (raw.includes('.') && raw.includes(',')) raw = raw.replace(/\./g, '').replace(',', '.');
      else if (/^\d{1,3}(\.\d{3})+$/.test(raw)) raw = raw.replace(/\./g, '');
      else if (raw.includes(',')) raw = raw.replace(',', '.');
      amount = parseFloat(raw);
    }
  }

  let category = null;
  const map = [
    ['Alimentação', ['mercado', 'ifood', 'padaria', 'restaurante', 'almoço', 'almoco', 'lanche', 'pizza', 'café', 'feira']],
    ['Transporte', ['uber', '99', 'gasolina', 'combustível', 'ônibus', 'metrô', 'estacionamento', 'pedágio']],
    ['Moradia', ['aluguel', 'condomínio', 'luz', 'energia', 'enel', 'água', 'internet', 'gás', 'iptu']],
    ['Saúde', ['farmácia', 'remédio', 'médico', 'consulta', 'exame', 'academia', 'dentista']],
    ['Lazer', ['cinema', 'show', 'bar', 'viagem', 'passeio', 'jogo', 'shopping', 'fone', 'roupa']],
    ['Assinaturas', ['netflix', 'spotify', 'prime', 'disney', 'youtube', 'icloud', 'assinatura']],
    ['Educação', ['curso', 'faculdade', 'livro', 'escola', 'inglês']],
    ['Investimentos', ['tesouro', 'cdb', 'fii', 'ação', 'reserva', 'investimento']],
  ];
  for (const [cat, kws] of map) {
    if (kws.some((k) => lower.includes(k))) {
      category = cat;
      break;
    }
  }

  let payment = 'Débito';
  if (/\b(cr[eé]dito|cart[aã]o|\d+\s*x)\b/i.test(lower)) payment = 'Crédito';
  else if (/\bpix\b/i.test(lower)) payment = 'PIX';
  else if (/\bdinheiro\b/i.test(lower)) payment = 'Dinheiro';
  else if (isIncome) payment = 'PIX';

  let dateLabel = 'Hoje';
  if (/\bontem\b/i.test(lower)) dateLabel = 'Ontem';
  else if (/\banteontem\b/i.test(lower)) dateLabel = 'Anteontem';
  else if (/passad[oa]/i.test(lower)) dateLabel = 'Semana passada';
  else if (/\bdia\s+\d{1,2}\b/i.test(lower)) dateLabel = lower.match(/\bdia\s+\d{1,2}\b/i)[0];

  const instMatch = lower.match(/\b(\d{1,2})\s*x\b/i);
  const installments = instMatch ? parseInt(instMatch[1], 10) : 1;

  if (!amount && !category && !isIncome) return null;

  return {
    isCommand: false,
    type: isIncome ? 'Receita' : 'Despesa',
    isIncome,
    amount,
    category,
    payment,
    dateLabel,
    installments,
  };
}

function renderFormattedText(text) {
  if (!text) return null;
  return text.split('\n').map((line, idx) => {
    const parts = line.split(/(\*\*.*?\*\*|\*.*?\*)/g);
    return (
      <p key={idx} className={idx > 0 ? 'mt-1.5' : ''}>
        {parts.map((part, i) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            return (
              <strong key={i} className="font-semibold">
                {part.slice(2, -2)}
              </strong>
            );
          }
          if (part.startsWith('*') && part.endsWith('*')) {
            return (
              <em key={i} className="italic opacity-90">
                {part.slice(1, -1)}
              </em>
            );
          }
          return part;
        })}
      </p>
    );
  });
}

export default function ChatPanel({
  messages,
  categories,
  accounts,
  onSendMessage,
  onConfirmAction,
  loading,
}) {
  const [input, setInput] = useState('');
  const [editingMsgId, setEditingMsgId] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const [cardOverrides, setCardOverrides] = useState({});
  const [listening, setListening] = useState(false);
  const [showQuickBuilder, setShowQuickBuilder] = useState(false);
  const [qbCategory, setQbCategory] = useState('Alimentação');
  const [qbAmount, setQbAmount] = useState('50');
  const [qbPayment, setQbPayment] = useState('PIX');

  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const livePreview = useMemo(() => detectLivePreview(input), [input]);

  function handleSubmit(e) {
    e.preventDefault();
    if (!input.trim() || loading) return;
    const text = input.trim();
    setInput('');
    onSendMessage(text);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function toggleVoiceDictation() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Seu navegador não suporta ditado por voz nativo. Experimente no Chrome ou Edge!');
      return;
    }
    if (listening) {
      setListening(false);
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'pt-BR';
    recognition.interimResults = false;
    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript;
      if (transcript) {
        setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
        inputRef.current?.focus();
      }
    };
    recognition.start();
  }

  function startEditing(msg, currentTx) {
    setEditingMsgId(msg.id);
    setEditDraft({ ...currentTx });
  }

  function submitEditedConfirm(msgId) {
    onConfirmAction(msgId, 'confirm', editDraft);
    setEditingMsgId(null);
    setEditDraft(null);
  }

  // Permite ciclar forma de pagamento ou tipo com 1 clique direto no card antes de confirmar
  function cycleCardField(msgId, baseTx, field, options) {
    const current = cardOverrides[msgId] || baseTx;
    const idx = options.indexOf(current[field]);
    const nextVal = options[(idx + 1) % options.length];
    setCardOverrides((prev) => ({
      ...prev,
      [msgId]: { ...current, [field]: nextVal },
    }));
  }

  return (
    <div className="flex flex-col h-full bg-[#efeae2] dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
      {/* Cabeçalho estilo WhatsApp com botão de construtor rápido */}
      <div className="bg-emerald-700 dark:bg-emerald-900 text-white px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-500/30 border border-emerald-300/30 flex items-center justify-center">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-sm">Assistente FinChat IA</h2>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/30 text-emerald-100">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
                Interativo
              </span>
            </div>
            <p className="text-[11px] text-emerald-100/90">
              Digite livremente ou toque nos botões rápidos abaixo
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowQuickBuilder((v) => !v)}
          className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
            showQuickBuilder
              ? 'bg-white text-emerald-800 shadow'
              : 'bg-emerald-600/70 hover:bg-emerald-600 text-white border border-emerald-400/30'
          }`}
          title="Lançamento rápido por cliques"
        >
          <Zap className="w-3.5 h-3.5" />
          <span>Lançar 1-Click</span>
        </button>
      </div>

      {/* Gaveta interativa "Lançar com 1-Click" sem precisar digitar */}
      {showQuickBuilder && (
        <div className="bg-emerald-50 dark:bg-slate-800/95 border-b border-emerald-200 dark:border-slate-700 p-3 space-y-2.5 animate-pop-in shrink-0">
          <div className="flex items-center justify-between text-xs font-semibold text-emerald-800 dark:text-emerald-300">
            <span>⚡ Construtor Rápido por Toque</span>
            <button
              type="button"
              onClick={() => setShowQuickBuilder(false)}
              className="text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Seleção de categoria em pílulas */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {categories.map((c) => {
              const active = qbCategory === c.name;
              return (
                <button
                  key={c.id || c.name}
                  type="button"
                  onClick={() => setQbCategory(c.name)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition cursor-pointer ${
                    active
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  {CATEGORY_EMOJIS[c.name] || '🏷️'} {c.name}
                </button>
              );
            })}
          </div>

          {/* Seleção de valor rápido + pagamento + enviar */}
          <div className="flex flex-wrap items-center gap-1.5">
            {['20', '35', '50', '100', '200'].map((val) => (
              <button
                key={val}
                type="button"
                onClick={() => setQbAmount(val)}
                className={`px-2 py-1 rounded-md text-xs font-semibold border cursor-pointer ${
                  qbAmount === val
                    ? 'border-emerald-600 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700'
                }`}
              >
                R$ {val}
              </button>
            ))}
            <input
              type="number"
              value={qbAmount}
              onChange={(e) => setQbAmount(e.target.value)}
              className="w-20 px-2 py-1 rounded-md text-xs border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 font-semibold"
              placeholder="Valor"
            />
            <select
              value={qbPayment}
              onChange={(e) => setQbPayment(e.target.value)}
              className="px-2 py-1 rounded-md text-xs border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900"
            >
              <option value="PIX">PIX</option>
              <option value="Débito">Débito</option>
              <option value="Crédito">Crédito</option>
              <option value="Dinheiro">Dinheiro</option>
            </select>
            <button
              type="button"
              onClick={() => {
                onSendMessage(`Gastei ${qbAmount} reais em ${qbCategory} hoje no ${qbPayment}`);
                setShowQuickBuilder(false);
              }}
              className="ml-auto px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer shadow-xs"
            >
              Enviar para o Chat →
            </button>
          </div>
        </div>
      )}

      {/* Lista de mensagens */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg, index) => {
          const isUser = msg.role === 'user';
          const isLastMessage = index === messages.length - 1;
          const rawAction = msg.pending_action;
          const isPartialQuestion = rawAction && rawAction._isPartialDraft;
          const pending =
            rawAction && !rawAction._isPartialDraft
              ? cardOverrides[msg.id] || rawAction
              : null;
          const isEditingThis = editingMsgId === msg.id && editDraft;

          return (
            <div
              key={msg.id}
              className={`flex animate-pop-in ${isUser ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[90%] sm:max-w-[84%] rounded-2xl px-4 py-2.5 text-sm shadow-xs ${
                  isUser
                    ? 'bg-[#d9fdd3] dark:bg-emerald-800 text-slate-900 dark:text-slate-100 rounded-tr-xs'
                    : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-tl-xs border border-slate-100 dark:border-slate-700/60'
                }`}
              >
                <div className="leading-relaxed">{renderFormattedText(msg.content)}</div>

                {/* BOTÕES INTERATIVOS QUANDO A IA FAZ UMA PERGUNTA (Ex: Escolher categoria ou valor com 1 clique!) */}
                {isPartialQuestion && isLastMessage && (
                  <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-700 space-y-2">
                    {rawAction.missing_field === 'category' && (
                      <div>
                        <span className="block text-[11px] text-slate-400 mb-1.5">
                          Toque em uma categoria para responder:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {categories.map((c) => (
                            <button
                              key={c.id || c.name}
                              type="button"
                              onClick={() => onSendMessage(c.name)}
                              className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/70 dark:hover:bg-emerald-900 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-medium transition cursor-pointer"
                            >
                              {CATEGORY_EMOJIS[c.name] || '🏷️'} {c.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {rawAction.missing_field === 'amount' && (
                      <div>
                        <span className="block text-[11px] text-slate-400 mb-1.5">
                          Toque em um valor aproximado ou digite abaixo:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {['25 reais', '50 reais', '100 reais', '150 reais', '300 reais'].map((v) => (
                            <button
                              key={v}
                              type="button"
                              onClick={() => onSendMessage(v)}
                              className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/70 dark:hover:bg-emerald-900 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-medium transition cursor-pointer"
                            >
                              💰 {v}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Card de confirmação interativo (Confirmar / Editar / Cancelar + Toque Rápido nos campos) */}
                {pending && (
                  <div className="mt-3 pt-3 border-t border-slate-200/80 dark:border-slate-700">
                    {!isEditingThis ? (
                      <>
                        <div className="bg-slate-50 dark:bg-slate-900/70 rounded-xl p-3 text-xs space-y-2 border border-slate-200/70 dark:border-slate-700">
                          <div className="flex items-center justify-between">
                            <button
                              type="button"
                              disabled={msg.action_status !== 'pending'}
                              onClick={() =>
                                cycleCardField(msg.id, pending, 'type', ['expense', 'income'])
                              }
                              className={`px-2 py-0.5 rounded-md font-semibold transition ${
                                msg.action_status === 'pending' ? 'cursor-pointer hover:opacity-80' : ''
                              } ${
                                pending.type === 'income'
                                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                                  : 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                              }`}
                              title="Clique para alternar Despesa / Receita"
                            >
                              {pending.type === 'income' ? '⬆️ Receita' : '⬇️ Despesa'}
                            </button>
                            <span className="font-bold text-sm text-slate-900 dark:text-white">
                              {formatCurrency(pending.amount)}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-slate-600 dark:text-slate-300 pt-1">
                            <div className="truncate">
                              <span className="text-slate-400">Item:</span>{' '}
                              <strong className="font-medium">{pending.description}</strong>
                            </div>
                            <div>
                              <span className="text-slate-400">Categoria:</span>{' '}
                              <button
                                type="button"
                                disabled={msg.action_status !== 'pending'}
                                onClick={() =>
                                  cycleCardField(
                                    msg.id,
                                    pending,
                                    'category',
                                    categories.map((c) => c.name)
                                  )
                                }
                                className="font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                                title="Clique para trocar rapidamente a categoria"
                              >
                                {CATEGORY_EMOJIS[pending.category] || ''} {pending.category}
                              </button>
                            </div>
                            <div>
                              <span className="text-slate-400">Data:</span> {formatDateBR(pending.date)}
                            </div>
                            <div>
                              <span className="text-slate-400">Pgto:</span>{' '}
                              <button
                                type="button"
                                disabled={msg.action_status !== 'pending'}
                                onClick={() =>
                                  cycleCardField(msg.id, pending, 'payment_method', [
                                    'Débito',
                                    'PIX',
                                    'Crédito',
                                    'Dinheiro',
                                    'Boleto',
                                  ])
                                }
                                className="font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                                title="Clique para alternar forma de pagamento"
                              >
                                {pending.payment_method}
                              </button>
                            </div>
                            <div className="col-span-2 truncate">
                              <span className="text-slate-400">Conta:</span> {pending.account_name}
                              {pending.installments > 1 ? ` • ${pending.installments}x` : ''}
                            </div>
                          </div>
                        </div>

                        {msg.action_status === 'pending' && (
                          <div className="mt-2.5 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => onConfirmAction(msg.id, 'confirm', pending)}
                              className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-98 text-white text-xs font-semibold shadow-sm transition cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5" />
                              Confirmar
                            </button>
                            <button
                              type="button"
                              onClick={() => startEditing(msg, pending)}
                              className="inline-flex items-center justify-center gap-1 py-2 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-medium transition cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => onConfirmAction(msg.id, 'cancel')}
                              className="inline-flex items-center justify-center gap-1 py-2 px-3 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-300 text-xs font-medium transition cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                              Cancelar
                            </button>
                          </div>
                        )}

                        {msg.action_status === 'confirmed' && (
                          <div className="mt-2 flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Confirmado e salvo na planilha</span>
                          </div>
                        )}

                        {msg.action_status === 'cancelled' && (
                          <div className="mt-2 flex items-center gap-1.5 text-xs font-medium text-rose-500">
                            <XCircle className="w-4 h-4" />
                            <span>Lançamento cancelado</span>
                          </div>
                        )}
                      </>
                    ) : (
                      /* Formulário de edição completa no card */
                      <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded-xl space-y-2 text-xs border border-emerald-500/40 animate-pop-in">
                        <div className="font-semibold text-emerald-600 dark:text-emerald-400">
                          Editar detalhes do lançamento
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] text-slate-400">Descrição</label>
                            <input
                              type="text"
                              value={editDraft.description || ''}
                              onChange={(e) => setEditDraft({ ...editDraft, description: e.target.value })}
                              className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-400">Valor (R$)</label>
                            <input
                              type="number"
                              step="0.01"
                              value={editDraft.amount || ''}
                              onChange={(e) => setEditDraft({ ...editDraft, amount: Number(e.target.value) })}
                              className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-400">Categoria</label>
                            <select
                              value={editDraft.category || ''}
                              onChange={(e) => setEditDraft({ ...editDraft, category: e.target.value })}
                              className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                            >
                              {categories.map((c) => (
                                <option key={c.id || c.name} value={c.name}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-400">Data</label>
                            <input
                              type="date"
                              value={editDraft.date || ''}
                              onChange={(e) => setEditDraft({ ...editDraft, date: e.target.value })}
                              className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-400">Pagamento</label>
                            <select
                              value={editDraft.payment_method || 'Débito'}
                              onChange={(e) => setEditDraft({ ...editDraft, payment_method: e.target.value })}
                              className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                            >
                              {['Débito', 'Crédito', 'PIX', 'Dinheiro', 'Boleto'].map((pm) => (
                                <option key={pm} value={pm}>
                                  {pm}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-400">Conta/Cartão</label>
                            <select
                              value={editDraft.account_name || ''}
                              onChange={(e) => setEditDraft({ ...editDraft, account_name: e.target.value })}
                              className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                            >
                              {accounts.map((a) => (
                                <option key={a.id || a.name} value={a.name}>
                                  {a.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="flex gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => submitEditedConfirm(msg.id)}
                            className="flex-1 py-1.5 rounded bg-emerald-600 text-white font-semibold cursor-pointer"
                          >
                            Salvar e Confirmar
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingMsgId(null)}
                            className="px-3 py-1.5 rounded bg-slate-200 dark:bg-slate-700 cursor-pointer"
                          >
                            Voltar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {loading && (
          <div className="flex justify-start animate-pop-in">
            <div className="bg-white dark:bg-slate-800 rounded-2xl px-4 py-2.5 text-xs text-slate-500 flex items-center gap-2 shadow-xs">
              <Sparkles className="w-3.5 h-3.5 text-emerald-500 animate-spin" />
              <span>FinChat está digitando...</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* BARRA DE DETECÇÃO AO VIVO ENQUANTO O USUÁRIO DIGITA */}
      {livePreview && (
        <div className="px-3 py-1.5 bg-emerald-50/95 dark:bg-emerald-950/80 border-t border-emerald-200 dark:border-emerald-800/80 flex items-center gap-2 overflow-x-auto text-[11px] animate-pop-in shrink-0">
          <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          {livePreview.isCommand ? (
            <span className="font-medium text-emerald-800 dark:text-emerald-200">
              {livePreview.label} — pressione Enter para consultar
            </span>
          ) : (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-slate-500 dark:text-slate-400">Detectado:</span>
              <span
                className={`px-2 py-0.5 rounded-full font-semibold ${
                  livePreview.isIncome
                    ? 'bg-emerald-200/80 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-200'
                    : 'bg-rose-200/80 text-rose-900 dark:bg-rose-900 dark:text-rose-200'
                }`}
              >
                {livePreview.type}
              </span>
              {livePreview.amount && (
                <span className="px-2 py-0.5 rounded-full bg-white dark:bg-slate-800 font-bold text-slate-800 dark:text-slate-100">
                  {formatCurrency(livePreview.amount)}
                </span>
              )}
              {livePreview.category ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 font-medium">
                  <Tag className="w-3 h-3" />
                  {livePreview.category}
                </span>
              ) : (
                <span className="text-amber-600 dark:text-amber-400">
                  (diga a categoria ou escolha depois)
                </span>
              )}
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                <CreditCard className="w-3 h-3" />
                {livePreview.payment}
                {livePreview.installments > 1 ? ` (${livePreview.installments}x)` : ''}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                <Calendar className="w-3 h-3" />
                {livePreview.dateLabel}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Sugestões rápidas clicáveis */}
      <div className="px-3 py-2 bg-slate-100/90 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex items-center gap-1.5 overflow-x-auto shrink-0">
        {QUICK_EXAMPLES.map((ex) => (
          <button
            key={ex.label}
            type="button"
            onClick={() => onSendMessage(ex.text)}
            disabled={loading}
            className="px-2.5 py-1 rounded-full bg-white dark:bg-slate-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/60 hover:border-emerald-400 border border-slate-200 dark:border-slate-600 text-[11px] font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap transition active:scale-95 cursor-pointer"
          >
            {ex.label}
          </button>
        ))}
      </div>

      {/* Barra de digitação com microfone de voz */}
      <form
        onSubmit={handleSubmit}
        className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2 shrink-0"
      >
        <button
          type="button"
          onClick={toggleVoiceDictation}
          className={`w-10 h-10 rounded-full flex items-center justify-center transition cursor-pointer shrink-0 ${
            listening
              ? 'bg-rose-500 text-white animate-pulse'
              : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'
          }`}
          title="Falar lançamento por voz (Português)"
        >
          {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
        </button>

        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder='Ex.: "Gastei 50 pila no mercado hoje" ou fale no microfone...'
          className="flex-1 px-4 py-2.5 rounded-full bg-slate-100 dark:bg-slate-800 border border-transparent focus:border-emerald-500 focus:bg-white dark:focus:bg-slate-900 text-sm outline-none transition"
        />

        <button
          type="submit"
          disabled={!input.trim() || loading}
          className="w-10 h-10 rounded-full bg-emerald-600 hover:bg-emerald-500 active:scale-95 disabled:opacity-40 text-white flex items-center justify-center shadow-md transition cursor-pointer shrink-0"
          title="Enviar mensagem"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
