// ===== QUESTIONS BANK (Arabic) =====
const QUESTIONS = [
  // Category 1: الانتباه (Attention) - Q1-7
  { id: 1, text: 'هل يجد الطفل صعوبة في التركيز على المهام أو الأنشطة؟', category: 'attention' },
  { id: 2, text: 'هل يرتكب أخطاء ناتجة عن عدم الانتباه في المدرسة أو العمل؟', category: 'attention' },
  { id: 3, text: 'هل يبدو وكأنه لا يستمع عند مناداته مباشرة؟', category: 'attention' },
  { id: 4, text: 'هل يصعب عليه إتمام الواجبات أو المهام حتى نهايتها؟', category: 'attention' },
  { id: 5, text: 'هل ينسى الأشياء في أنشطته اليومية (حقيبة، أدوات، كتب)؟', category: 'attention' },
  { id: 6, text: 'هل يتشتت بسهولة بفعل المؤثرات الخارجية؟', category: 'attention' },
  { id: 7, text: 'هل يفضل الطفل تجنب المهام التي تتطلب جهداً ذهنياً مستمراً؟', category: 'attention' },

  // Category 2: فرط الحركة (Hyperactivity) - Q8-13
  { id: 8, text: 'هل يتحرك كثيراً عند الجلوس (يحرك يديه أو قدميه)؟', category: 'hyperactivity' },
  { id: 9, text: 'هل يصعب عليه البقاء جالساً في المواقف التي تتطلب ذلك؟', category: 'hyperactivity' },
  { id: 10, text: 'هل يركض أو يتسلق في مواقف غير ملائمة؟', category: 'hyperactivity' },
  { id: 11, text: 'هل يتكلم بشكل مفرط؟', category: 'hyperactivity' },
  { id: 12, text: 'هل يتصرف دون التفكير في العواقب؟', category: 'hyperactivity' },
  { id: 13, text: 'هل يجد صعوبة في انتظار دوره أو الإنتظار بشكل عام؟', category: 'hyperactivity' },

  // Category 3: التفاعل الاجتماعي (Social Interaction) - Q14-20
  { id: 14, text: 'هل يواجه صعوبة في التفاعل مع الأطفال الآخرين والاندماج معهم؟', category: 'social' },
  { id: 15, text: 'هل يتجنب التواصل البصري أثناء الحديث؟', category: 'social' },
  { id: 16, text: 'هل يُظهر تعلقاً غير عادي بأشياء أو مواضيع بعينها؟', category: 'social' },
  { id: 17, text: 'هل يُكرر أنماطاً سلوكية أو حركات معينة بشكل متكرر؟', category: 'social' },
  { id: 18, text: 'هل يواجه صعوبة في فهم المشاعر أو تعابير الوجه لدى الآخرين؟', category: 'social' },
  { id: 19, text: 'هل يُفضّل اللعب منفرداً بدلاً من اللعب مع الآخرين؟', category: 'social' },
  { id: 20, text: 'هل يُظهر ردود فعل غير عادية تجاه الأصوات أو اللمس أو الضوء؟', category: 'social' }
];

const SCALE_LABELS = [
  { value: 1, label: 'نادراً' },
  { value: 2, label: 'أحياناً' },
  { value: 3, label: 'متوسط' },
  { value: 4, label: 'غالباً' },
  { value: 5, label: 'دائماً' }
];

// Max scores per category (for display)
const CATEGORY_MAX = { attention: 35, hyperactivity: 30, social: 35 };

const CATEGORY_LABELS = {
  attention: 'الانتباه والتركيز',
  hyperactivity: 'فرط الحركة',
  social: 'التفاعل الاجتماعي'
};

// Classify category level
function classifyCategoryScore(category, score) {
  const max = CATEGORY_MAX[category];
  const pct = (score / max) * 100;
  if (pct < 45) return 'normal';
  if (pct < 70) return 'attention';
  return 'hyperactive';
}

// ===== SMART CLASSIFICATION (category-aware) =====
// Uses the dominant category to determine the primary diagnosis
function classifyScore(total, categories) {
  if (total <= 35) return 'normal';

  // Calculate percentage of max for each category
  const attPct  = categories ? ((categories.attention      || 0) / CATEGORY_MAX.attention)      * 100 : 0;
  const hypPct  = categories ? ((categories.hyperactivity  || 0) / CATEGORY_MAX.hyperactivity)  * 100 : 0;
  const socPct  = categories ? ((categories.social         || 0) / CATEGORY_MAX.social)          * 100 : 0;

  // Autism: social interaction is the dominant elevated category
  if (socPct >= 65 && socPct > hypPct && socPct > attPct) return 'autism';

  // ADHD – Hyperactivity dominant
  if (hypPct >= 65 && hypPct >= attPct) return 'hyperactive';

  // ADHD – Attention type (inattentive)
  if (total <= 70) return 'attention';

  // High total with mixed profile → hyperactive
  return 'hyperactive';
}

// Get recommendations based on level
function getRecommendations(level, categories) {
  const base = [
    { text: 'هذا تشخيص مبدئي فقط وليس تشخيصاً طبياً رسمياً.' },
    { text: 'استشر طبيباً متخصصاً أو أخصائي نفسي لتقييم دقيق وشامل.' }
  ];

  if (level === 'normal') {
    return [
      { text: 'التشخيص المبدئي: سلوك الطفل ضمن النطاق الطبيعي. استمر في المتابعة الدورية.' },
      { text: 'وفّر بيئة داعمة ومحفزة تساعد على النمو الصحي.' },
      { text: 'شجّع الطفل على الأنشطة الاجتماعية والرياضية.' },
      ...base
    ];
  }

  if (level === 'attention') {
    return [
      { text: 'التشخيص المبدئي: مؤشرات على اضطراب تشتت الانتباه (ADHD – النوع غير المفرط الحركة).' },
      { text: 'حاول تقليل مصادر التشتيت في بيئة الدراسة والمنزل.' },
      { text: 'قسّم المهام الكبيرة إلى مهام صغيرة قابلة للتنفيذ.' },
      { text: 'أنشئ روتيناً يومياً ثابتاً يساعد الطفل على التنظيم.' },
      { text: 'تواصل مع معلم الطفل لتنسيق آليات دعم مشتركة.' },
      ...base
    ];
  }

  if (level === 'hyperactive') {
    return [
      { text: 'التشخيص المبدئي: مؤشرات على اضطراب فرط الحركة وتشتت الانتباه (ADHD).' },
      { text: 'راجع طبيب أطفال أو أخصائي نفسي في أقرب وقت ممكن.' },
      { text: 'وفّر مساحات آمنة للطفل لتفريغ طاقته البدنية (رياضة، لعب حر).' },
      { text: 'اعتمد أسلوب الثواب والتعزيز الإيجابي في التعامل مع الطفل.' },
      { text: 'تجنّب العقوبة المتكررة وركّز على تعديل السلوك تدريجياً.' },
      { text: 'تواصل مع المرشد التربوي في المدرسة لوضع خطة دعم مناسبة.' },
      ...base
    ];
  }

  if (level === 'autism') {
    return [
      { text: 'التشخيص المبدئي: مؤشرات على احتمال اضطراب طيف التوحد (ASD).' },
      { text: 'يُنصح بشدة بمراجعة طبيب متخصص في اضطرابات النمو العصبي في أقرب وقت ممكن.' },
      { text: 'لاحظ أن التدخل المبكر يُحدث فرقاً كبيراً في تحسين مهارات الطفل الاجتماعية.' },
      { text: 'ابحث عن برامج التدخل المبكر المتخصصة في مجال التوحد في منطقتك.' },
      { text: 'وفّر بيئة هادئة ومنظمة تتوقع فيها الطفل الروتين اليومي الثابت.' },
      { text: 'تواصل مع المختص التربوي لتوفير خطة تعليمية فردية (IEP) مناسبة للطفل.' },
      { text: 'تجنّب الإفراط في التحفيز الحسي (أصوات عالية، ضوء قوي) التي قد تسبب ضائقة للطفل.' },
      ...base
    ];
  }

  return base;
}
