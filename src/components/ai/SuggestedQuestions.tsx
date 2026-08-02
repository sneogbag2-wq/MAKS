import './SuggestedQuestions.css';

const SUGGESTIONS = [
  { icon: '📊', label: 'En Borçlu Müşteriler', query: 'En yüksek borcu olan 10 müşteriyi listele' },
  { icon: '📈', label: 'Genel Finansal Özet', query: 'Genel finansal durum ve alacak özeti ver' },
  { icon: '⏱️', label: 'Vade Yaşlandırma', query: 'Vade yaşlandırma dağılımını göster' },
  { icon: '💵', label: 'Tahsilat Türleri', query: 'Tahsilat türlerinin tutar bazlı dağılımı nedir?' },
  { icon: '🔍', label: 'Açık Faturalar', query: 'Toplam kaç adet açık fatura var ve bugün gelen tahsilat ne kadar?' }
];

interface SuggestedQuestionsProps {
  onSelectQuestion: (query: string) => void;
}

export function SuggestedQuestions({ onSelectQuestion }: SuggestedQuestionsProps) {
  return (
    <div className="suggested-questions-container">
      <div className="suggested-header">💡 Önerilen Analizler ve Sorular</div>
      <div className="suggested-chips">
        {SUGGESTIONS.map((item, idx) => (
          <button
            key={idx}
            className="suggested-chip"
            onClick={() => onSelectQuestion(item.query)}
          >
            <span className="chip-icon">{item.icon}</span>
            <span className="chip-label">{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
