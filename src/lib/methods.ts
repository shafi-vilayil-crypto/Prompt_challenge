// Prompting methods the teacher can pick for a round. Each method has its own scoring parts (2 points each,
// at most 6) plus the teacher's 0-3 creativity bonus. Part ids must match ^[a-z_]{2,20}$ (checked in the database).
// Every check looks for English words and Malayalam words, so prompts in either language are auto-scored.

export type Lang = 'en' | 'ml';
export type Text = Record<Lang, string>;

export type Part = { id: string; label: Text; hint: Text; test: (t: string) => boolean };

export type Method = {
  id: string;
  name: Text;
  short: Text;
  template: Text;
  example: Text;
  parts: Part[];
};

// ───────────── Detectors ─────────────

const ML_SCRIPT = /[ഀ-ൿ]/;
const words = (t: string) => (t.trim().match(/\S+/g) ?? []).length;
const any = (t: string, re: RegExp | null, ml: string[] = []) => (re ? re.test(t) : false) || ml.some((w) => t.includes(w));

const TASK_EN = /\b(explain|explanation|write|list|make|create|give|tell|describe|summari[sz]e|summary|translate|compare|draw|plan|suggest|teach|prepare|design|help|find|show|generate|solve|calculate|what|how|why|who|when|where|which|can you|could you|please)\b/i;
const TASK_ML = ['വിശദീകരി', 'എഴുതു', 'എഴുതി', 'പറഞ്ഞു ത', 'പറയു', 'പറയാമോ', 'തരു', 'തരാമോ', 'നൽകു', 'ഉണ്ടാക്കു', 'തയ്യാറാക്കു', 'വിവരിക്കു', 'ലിസ്റ്റ്', 'എന്താണ്', 'എങ്ങനെ', 'എന്തുകൊണ്ട്', 'എത്ര', 'സഹായിക്കു', 'വിവർത്തന', 'താരതമ്യ', 'ചെയ്യു', 'കണ്ടെത്തു', 'നിർദ്ദേശിക്കു', 'പ്ലാൻ',
  'vishadeekarikk', 'ezhuth', 'paranju tha', 'parayu', 'undakk', 'enthanu', 'engane'];

const d = {
  role: (t: string) => any(t, /\b(you are|act as|act like|pretend|imagine you|behave like|as an? (teacher|expert|doctor|scientist|friend|coach|guide|storyteller|poet|chef|planner))\b/i,
    ['നീ ഒരു', 'നിങ്ങൾ ഒരു', 'ആയി പ്രവർത്തി', 'ായി പ്രവർത്തി', 'ആയി പെരുമാറ', 'ായി പെരുമാറ', 'ആണെന്ന് കരുതുക', 'ആയി അഭിനയി', 'ായി അഭിനയി', 'nee oru', 'ningal oru']),
  task: (t: string) => any(t, TASK_EN, TASK_ML),
  audience: (t: string) => any(t, /\b((for|to) (a|an|my|me|kids|children|students|class|beginners|parents|grandma|grandmother|friends?)|students?|class \d+|\d+(st|nd|rd|th) (class|std|standard|grade)|grade|std|year[- ]old|beginners?|child(ren)?|kids|grand(ma|mother|pa|father)|parents|teachers?|friends?|villagers|farmers)\b/i,
    ['കുട്ടി', 'വിദ്യാർത്ഥി', 'ക്ലാസ', 'അമ്മൂമ്മ', 'അപ്പൂപ്പ', 'മാതാപിതാക്ക', 'അച്ഛന്', 'അമ്മയ്ക്ക്', 'കൂട്ടുകാര', 'സുഹൃത്ത', 'അധ്യാപക', 'കർഷക', 'വയസ്സ', 'തുടക്കക്കാര', 'kuttik', 'kuttikal']),
  format: (t: string) => any(t, /\b(\d+\s*(points?|lines?|steps?|words?|sentences?|questions?|tips|ideas|examples|days?)|(one|two|three|four|five) (lines?|sentences?|words?|paragraphs?)|points|bullets?|table|list|steps|paragraph|poem|story|song|quiz|chart|letter|title)\b/i,
    ['പോയിന്റ', 'വരി', 'വാക്യ', 'വാക്ക', 'ഘട്ട', 'പട്ടിക', 'കവിത', 'കഥ', 'പാട്ട', 'ചോദ്യ', 'ടേബിൾ', 'ലിസ്റ്റ', 'തലക്കെട്ട']),
  language: (t: string) => ML_SCRIPT.test(t) || any(t, /\b(malayalam|english|hindi|tamil|simple|easy|funny|friendly|short|polite|kind|interesting|fun)\b/i),
  tone: (t: string) => any(t, /\b(tone|simple|easy|funny|friendly|formal|polite|kind|serious|exciting|motivating|encouraging|calm|cheerful|gentle|respectful|fun)\b/i,
    ['ലളിത', 'എളുപ്പ', 'രസകര', 'തമാശ', 'സൗഹൃദ', 'ഗൗരവ', 'ആവേശ', 'ആത്മവിശ്വാസ', 'സൗമ്യ', 'ബഹുമാന', 'സന്തോഷ']),
  detail: (t: string) => words(t) >= 18 || (ML_SCRIPT.test(t) && words(t) >= 12) ||
    any(t, /\b(example|because|include|including|such as|related to|using|exam|test|in kerala|at school)\b/i,
      ['ഉദാഹരണ', 'കാരണം', 'ഉൾപ്പെടുത്ത', 'സ്കൂ', 'പരീക്ഷ', 'കേരള', 'ഉള്ള']),
  limits: (t: string) => any(t, /\b(\d+\s*(words?|lines?|sentences?|points?)|short|brief|only|don'?t|do not|avoid|without|under|maximum|max|at least|limit)\b/i,
    ['മാത്രം', 'ചുരുക്ക', 'കവിയാതെ', 'കവിയരുത്', 'ഇല്ലാതെ', 'ഒഴിവാക്ക', 'വേണ്ട']),
  example: (t: string) => any(t, /\b(example|e\.g\.|for instance|sample|like this|input\s*:|output\s*:)|→|->|=>/i, ['ഉദാഹരണ', 'മാതൃക']),
  moreExamples: (t: string) => (t.match(/example|e\.g\.|input\s*:|→|->|=>|ഉദാഹരണ/gi) ?? []).length >= 2,
  pattern: (t: string) => any(t, /\b(same (way|style|format|pattern)|like (these|this|the examples?)|as (in )?(these|the) examples|follow (the|this|these)|in this (way|format|style)|similar)\b/i,
    ['ഇതുപോലെ', 'ഉദാഹരണങ്ങൾ പോലെ', 'അതേ രീതി', 'ഇതേ രീതി', 'മാതൃകയിൽ']),
  newItem: (t: string) => any(t, /\b(now|new|next|your turn|do the same|for:)/i, ['ഇനി', 'പുതിയ']),
  facts: (t: string) => /\d/.test(t) || words(t) >= 18,
  steps: (t: string) => any(t, /\b(step[- ]by[- ]step|steps?|one by one|show (your |the )?(work|working|reasoning)|explain (your|the) (reasoning|thinking)|think)\b/i,
    ['ഘട്ടം ഘട്ടമായി', 'ഘട്ടങ്ങ', 'ഓരോ ഘട്ട', 'ഓരോന്നായി വിശദ']),
  check: (t: string) => any(t, /\b(check|verify|double[- ]check|final answer|make sure)\b/i, ['പരിശോധി', 'ഉറപ്പ', 'അവസാന ഉത്തരം']),
  context: (t: string) => any(t, /\b(i am|i'm|we are|we're|my|our|context|background|because|since|currently|in kerala|at school|school|exam|tomorrow|next week)\b/i,
    ['ഞാൻ', 'ഞങ്ങ', 'എന്റെ', 'നമ്മുടെ', 'കാരണം', 'സ്കൂ', 'പരീക്ഷ', 'കേരള', 'ഇപ്പോൾ', 'നാളെ']),
  objective: (t: string) => any(t, /\b(goal|objective|aim|purpose|i want|i need|i would like|help me|so that|in order to|to (learn|understand|pass|prepare|remember|make|choose|score))\b/i,
    ['ലക്ഷ്യ', 'ആഗ്രഹ', 'വേണം', 'ആവശ്യ', 'സഹായ', 'മനസ്സിലാക്കാൻ', 'പഠിക്കാൻ']),
  scenario: (t: string) => any(t, /\b(scenario|situation|imagine|suppose|i am|i'm|we are|my|our|there (is|are)|currently|tomorrow|next week|in \d+ days)\b/i,
    ['സാഹചര്യ', 'സങ്കൽപ്പി', 'ഞാൻ', 'ഞങ്ങ', 'എനിക്ക്', 'എന്റെ', 'നാളെ', 'ഇപ്പോൾ', 'ദിവസം']),
  expectation: (t: string) => any(t, /\b(i expect|should (be|include|have|contain)|must|make sure|the answer should|include|with (a|an)\b)/i,
    ['വേണം', 'ഉണ്ടാക', 'ഉൾപ്പെടുത്ത', 'ഉണ്ടായിരിക്ക']),
  style: (t: string) => any(t, /\b(style|like an? (story|poem|news|song|letter|speech|report|advert)|in the style|as an? (story|poem|letter|speech|news report|song)|storytelling|conversational)\b/i,
    ['ശൈലി', 'പോലെ', 'രീതിയിൽ']),
  askMe: (t: string) => any(t, /\b(ask me|ask (some |a few |\d+ )?questions|before (you )?(answer|start|begin|suggest)|quiz me|interview me)\b/i,
    ['എന്നോട്', 'ചോദ്യങ്ങൾ ചോദി', 'മുമ്പ് ചോദി']),
  oneAtATime: (t: string) => any(t, /\b(one (question )?at a time|\d+ questions?|(two|three|four|five|a few|some) questions)\b/i, ['ഓരോന്നായി', 'ഒന്നൊന്നായി']) || /\d+\s*ചോദ്യ/.test(t),
  thenStep: (t: string) => any(t, /\b(then|after (that|i answer|my answers?)|once i answer|finally)\b/i, ['അതിനുശേഷം', 'ശേഷം', 'പിന്നെ', 'എന്നിട്ട്']),
};

// ───────────── Parts ─────────────

const part = (id: string, test: (t: string) => boolean, en: string, ml: string, hintEn: string, hintMl: string): Part =>
  ({ id, test, label: { en, ml }, hint: { en: hintEn, ml: hintMl } });

const P = {
  role: part('role', d.role, 'Role', 'റോൾ', 'Who the AI should be', 'AI ആരായിരിക്കണം'),
  task: part('task', d.task, 'Clear task', 'വ്യക്തമായ ജോലി', 'What to do (explain, write, list)', 'എന്ത് ചെയ്യണം (വിശദീകരിക്കുക, എഴുതുക)'),
  action: part('task', d.task, 'Action', 'ആക്ഷൻ', 'What the AI must do', 'AI ചെയ്യേണ്ട കാര്യം'),
  audience: part('audience', d.audience, 'Audience', 'ആർക്കുവേണ്ടി', 'Who it is for', 'ആർക്കുവേണ്ടിയാണ്'),
  format: part('format', d.format, 'Format', 'രൂപം', 'Shape of the answer (points, table, poem)', 'ഉത്തരത്തിന്റെ രൂപം (പോയിന്റ്, പട്ടിക, കവിത)'),
  language: part('language', d.language, 'Language & tone', 'ഭാഷയും ശൈലിയും', 'Simple, funny, in Malayalam', 'ലളിതം, തമാശ, മലയാളത്തിൽ'),
  detail: part('detail', d.detail, 'Details', 'വിവരങ്ങൾ', 'Topic, example or reason', 'വിഷയം, ഉദാഹരണം, കാരണം'),
  topic: part('detail', d.detail, 'Topic details', 'വിഷയ വിവരങ്ങൾ', 'Exactly what it is about', 'കൃത്യമായ വിഷയം'),
  limits: part('limits', d.limits, 'Limits', 'പരിധികൾ', 'Length, or what to avoid', 'നീളം, ഒഴിവാക്കേണ്ടത്'),
  example: part('example', d.example, 'An example', 'ഒരു ഉദാഹരണം', 'Shows what you want', 'വേണ്ടത് കാണിക്കുന്നു'),
  moreExamples: part('more_examples', d.moreExamples, '2+ examples', '2+ ഉദാഹരണങ്ങൾ', 'More examples, clearer pattern', 'കൂടുതൽ ഉദാഹരണം, വ്യക്തമായ മാതൃക'),
  pattern: part('pattern', d.pattern, 'Same pattern', 'അതേ മാതൃക', 'Asks to follow the examples', 'ഉദാഹരണം പിന്തുടരാൻ പറയുന്നു'),
  newItem: part('new_item', d.newItem, 'New item', 'പുതിയ ചോദ്യം', 'What to do it for now', 'ഇനി ചെയ്യേണ്ടത്'),
  tone: part('tone', d.tone, 'Tone', 'ടോൺ', 'Friendly, funny, serious', 'സൗഹൃദം, തമാശ, ഗൗരവം'),
  facts: part('facts', d.facts, 'All the facts', 'എല്ലാ വിവരങ്ങളും', 'Numbers and details given', 'സംഖ്യകളും വിവരങ്ങളും'),
  steps: part('steps', d.steps, 'Step by step', 'ഘട്ടം ഘട്ടമായി', 'Asks for each step', 'ഓരോ ഘട്ടവും ചോദിക്കുന്നു'),
  check: part('check', d.check, 'Check answer', 'ഉത്തരം പരിശോധന', 'Asks to check, or for a final answer', 'പരിശോധിക്കാൻ / അവസാന ഉത്തരം'),
  context: part('context', d.context, 'Context', 'പശ്ചാത്തലം', 'Background: who, where, why', 'ആര്, എവിടെ, എന്തുകൊണ്ട്'),
  expectation: part('expectation', d.expectation, 'Expectation', 'പ്രതീക്ഷ', 'What the answer must include', 'ഉത്തരത്തിൽ ഉണ്ടാകേണ്ടത്'),
  objective: part('objective', (t) => d.objective(t) || d.task(t), 'Objective', 'ലക്ഷ്യം', 'What you want to achieve', 'നേടേണ്ടത്'),
  goal: part('objective', d.objective, 'Goal', 'ലക്ഷ്യം', 'What you want in the end', 'അവസാനം വേണ്ടത്'),
  scenario: part('scenario', d.scenario, 'Scenario', 'സാഹചര്യം', 'Your situation', 'നിങ്ങളുടെ സാഹചര്യം'),
  expected: part('expected', (t) => d.expectation(t) || d.format(t), 'Expected solution', 'പ്രതീക്ഷിക്കുന്ന ഉത്തരം', 'What you need back', 'തിരികെ വേണ്ടത്'),
  rosesSteps: part('steps', (t) => d.steps(t) || /\b(first|then|daily|each day|break)\b/i.test(t), 'Steps', 'ഘട്ടങ്ങൾ', 'How to go about it', 'എങ്ങനെ ചെയ്യണം'),
  style: part('style', d.style, 'Style', 'ശൈലി', 'Like a story, news, poem', 'കഥ, വാർത്ത, കവിത പോലെ'),
  response: part('format', (t) => d.format(t) || d.limits(t), 'Response format', 'ഉത്തര രൂപം', 'Format and length', 'രൂപവും നീളവും'),
  askMe: part('ask_me', d.askMe, 'AI asks you', 'AI നിങ്ങളോട് ചോദിക്കുന്നു', 'Ask me questions first', 'ആദ്യം എന്നോട് ചോദിക്കുക'),
  oneAtATime: part('one_at_a_time', d.oneAtATime, 'How many', 'എത്ര ചോദ്യം', 'Number of questions, one at a time', 'ചോദ്യങ്ങളുടെ എണ്ണം, ഓരോന്നായി'),
  thenStep: part('then_step', d.thenStep, 'Then what', 'അതിനുശേഷം', 'What to give after your answers', 'മറുപടിക്ക് ശേഷം നൽകേണ്ടത്'),
};

// ───────────── Methods ─────────────

export const METHODS: Method[] = [
  {
    id: 'basic',
    name: { en: 'Basic recipe', ml: 'അടിസ്ഥാന രീതി' },
    short: {
      en: 'Six parts of a good prompt: who the AI is, what to do, for whom, in what shape, in what language, and details.',
      ml: 'നല്ല പ്രോംപ്റ്റിന്റെ ആറ് ഭാഗങ്ങൾ: AI ആരാണ്, എന്ത് ചെയ്യണം, ആർക്കുവേണ്ടി, ഏത് രൂപത്തിൽ, ഏത് ഭാഷയിൽ, കൂടുതൽ വിവരങ്ങൾ.',
    },
    template: {
      en: 'You are a [role]. [Task] for [audience] in [format], in [language / tone]. [Details].',
      ml: 'നീ ഒരു [റോൾ] ആണ്. [ആർക്ക്] വേണ്ടി [ജോലി], [രൂപത്തിൽ], [ഭാഷ / ശൈലി]. [വിവരങ്ങൾ].',
    },
    example: {
      en: 'You are a science teacher. Explain the water cycle to a 7th class student in 5 simple points in Malayalam, with one example from Kerala rain.',
      ml: 'നീ ഒരു സയൻസ് അധ്യാപകനാണ്. ഏഴാം ക്ലാസ് വിദ്യാർത്ഥിക്ക് ജലചക്രം 5 ലളിതമായ പോയിന്റുകളിൽ മലയാളത്തിൽ വിശദീകരിക്കുക. കേരളത്തിലെ മഴയിൽ നിന്ന് ഒരു ഉദാഹരണം നൽകുക.',
    },
    parts: [P.role, P.task, P.audience, P.format, P.language, P.detail],
  },
  {
    id: 'zero_shot',
    name: { en: 'Zero-shot', ml: 'സീറോ-ഷോട്ട്' },
    short: {
      en: 'Ask directly, with no examples. Be very clear about the task, the topic, the shape of the answer and the limits.',
      ml: 'ഉദാഹരണങ്ങൾ ഇല്ലാതെ നേരിട്ട് ചോദിക്കുക. ജോലി, വിഷയം, ഉത്തരത്തിന്റെ രൂപം, പരിധികൾ എന്നിവ വ്യക്തമായി പറയുക.',
    },
    template: {
      en: '[Task] about [topic + details]. Answer in [format]. [Limits: length, what to avoid]. [Language].',
      ml: '[വിഷയവും വിവരങ്ങളും] കുറിച്ച് [ജോലി]. [രൂപത്തിൽ] ഉത്തരം നൽകുക. [പരിധികൾ: നീളം, ഒഴിവാക്കേണ്ടത്]. [ഭാഷ].',
    },
    example: {
      en: 'Explain why we have day and night, for a 6th class science test. Answer in 4 short points, under 60 words, in simple English.',
      ml: 'പകലും രാത്രിയും ഉണ്ടാകുന്നത് എന്തുകൊണ്ടെന്ന് ആറാം ക്ലാസ് പരീക്ഷയ്ക്ക് വേണ്ടി വിശദീകരിക്കുക. 60 വാക്കുകളിൽ കവിയാതെ, 4 ചെറിയ പോയിന്റുകളായി, ലളിതമായ മലയാളത്തിൽ ഉത്തരം നൽകുക.',
    },
    parts: [P.task, P.topic, P.format, P.limits, P.language],
  },
  {
    id: 'few_shot',
    name: { en: 'Few-shot', ml: 'ഫ്യൂ-ഷോട്ട്' },
    short: {
      en: 'Show the AI 2 or 3 examples of what you want, then ask it to do the same for something new.',
      ml: 'വേണ്ടതിന്റെ 2-3 ഉദാഹരണങ്ങൾ AI-ക്ക് കാണിക്കുക, എന്നിട്ട് പുതിയതിനും അതേ രീതിയിൽ ചെയ്യാൻ പറയുക.',
    },
    template: {
      en: '[Task], in the same format as these examples. Example 1: [input] → [output]. Example 2: [input] → [output]. Now do: [new input].',
      ml: 'ഈ ഉദാഹരണങ്ങൾ പോലെ [ജോലി]. ഉദാഹരണം 1: [ചോദ്യം] → [ഉത്തരം]. ഉദാഹരണം 2: [ചോദ്യം] → [ഉത്തരം]. ഇനി ഇതേ രീതിയിൽ: [പുതിയത്].',
    },
    example: {
      en: 'Give the opposite word, in the same format as these examples. Example 1: hot → cold. Example 2: big → small. Now do: happy, fast, early.',
      ml: 'ഈ ഉദാഹരണങ്ങൾ പോലെ വിപരീത പദം എഴുതുക. ഉദാഹരണം 1: ചൂട് → തണുപ്പ്. ഉദാഹരണം 2: വലുത് → ചെറുത്. ഇനി ഇതേ രീതിയിൽ: സന്തോഷം, വേഗം, രാവിലെ.',
    },
    parts: [P.task, P.example, P.moreExamples, P.pattern, P.newItem],
  },
  {
    id: 'role',
    name: { en: 'Role prompting', ml: 'റോൾ പ്രോംപ്റ്റിംഗ്' },
    short: {
      en: 'Give the AI a character or a job: a doctor, a poet, a cricket coach. The answer changes with the role.',
      ml: 'AI-ക്ക് ഒരു കഥാപാത്രമോ ജോലിയോ നൽകുക: ഡോക്ടർ, കവി, ക്രിക്കറ്റ് കോച്ച്. റോൾ മാറുമ്പോൾ ഉത്തരവും മാറും.',
    },
    template: {
      en: 'You are a [role]. [Task] for [audience]. Speak in a [tone] way. [Details].',
      ml: 'നീ ഒരു [റോൾ] ആണ്. [ആർക്ക്] വേണ്ടി [ജോലി]. [ടോൺ] രീതിയിൽ സംസാരിക്കുക. [വിവരങ്ങൾ].',
    },
    example: {
      en: 'You are a friendly cricket coach. Give 5 tips to a 12-year-old beginner who is scared of fast bowling. Speak in a motivating way.',
      ml: 'നീ ഒരു സൗഹൃദമുള്ള ക്രിക്കറ്റ് കോച്ച് ആണ്. ഫാസ്റ്റ് ബൗളിംഗിനെ പേടിയുള്ള 12 വയസ്സുള്ള ഒരു തുടക്കക്കാരന് 5 ടിപ്പുകൾ നൽകുക. ആത്മവിശ്വാസം നൽകുന്ന രീതിയിൽ സംസാരിക്കുക.',
    },
    parts: [P.role, P.task, P.audience, P.tone, P.detail],
  },
  {
    id: 'cot',
    name: { en: 'Chain of thought', ml: 'ചെയിൻ ഓഫ് തോട്ട്' },
    short: {
      en: 'Ask the AI to think step by step and show its working. Great for maths, science and puzzles.',
      ml: 'ഘട്ടം ഘട്ടമായി ചിന്തിച്ച് വഴി കാണിക്കാൻ AI-യോട് പറയുക. കണക്ക്, സയൻസ്, പസിലുകൾ എന്നിവയ്ക്ക് നല്ലത്.',
    },
    template: {
      en: '[Problem with all the numbers and facts]. Solve it step by step and show each step. Check your answer, then give the final answer as [format].',
      ml: '[എല്ലാ സംഖ്യകളും വിവരങ്ങളും ഉള്ള പ്രശ്നം]. ഘട്ടം ഘട്ടമായി ചെയ്ത് ഓരോ ഘട്ടവും കാണിക്കുക. ഉത്തരം പരിശോധിച്ച ശേഷം [രൂപത്തിൽ] അവസാന ഉത്തരം നൽകുക.',
    },
    example: {
      en: 'A shop sells pens at ₹12 each. Anu buys 7 pens and pays with a ₹100 note. How much change does she get? Solve it step by step, check your answer, and write the final answer in one line.',
      ml: 'ഒരു കടയിൽ ഒരു പേനയ്ക്ക് ₹12 ആണ്. അനു 7 പേന വാങ്ങി ₹100 നോട്ട് നൽകി. എത്ര ബാക്കി കിട്ടും? ഘട്ടം ഘട്ടമായി ചെയ്യുക, ഉത്തരം പരിശോധിക്കുക, അവസാന ഉത്തരം ഒരു വരിയിൽ എഴുതുക.',
    },
    parts: [P.task, P.facts, P.steps, P.check, P.format],
  },
  {
    id: 'rtf',
    name: { en: 'RTF (Role · Task · Format)', ml: 'RTF (റോൾ · ടാസ്ക് · ഫോർമാറ്റ്)' },
    short: {
      en: 'The simplest framework: say who the AI is, what it must do, and how the answer should look.',
      ml: 'ഏറ്റവും ലളിതമായ രീതി: AI ആരാണ്, എന്ത് ചെയ്യണം, ഉത്തരം എങ്ങനെ ആയിരിക്കണം എന്ന് പറയുക.',
    },
    template: {
      en: 'Act as a [role]. [Task]. Give it as [format].',
      ml: 'ഒരു [റോൾ] ആയി പ്രവർത്തിക്കുക. [ജോലി]. [രൂപത്തിൽ] നൽകുക.',
    },
    example: {
      en: 'Act as a nutrition expert. Plan a healthy school lunch for one week. Give it as a table with the day, the food and why it is healthy.',
      ml: 'ഒരു പോഷകാഹാര വിദഗ്ധനായി പ്രവർത്തിക്കുക. ഒരാഴ്ചത്തേക്കുള്ള ആരോഗ്യകരമായ സ്കൂൾ ഉച്ചഭക്ഷണം പ്ലാൻ ചെയ്യുക. ദിവസം, ഭക്ഷണം, എന്തുകൊണ്ട് ആരോഗ്യകരം എന്നിങ്ങനെ ഒരു പട്ടികയായി നൽകുക.',
    },
    parts: [P.role, P.task, P.format],
  },
  {
    id: 'race',
    name: { en: 'RACE', ml: 'RACE' },
    short: {
      en: 'Role, Action, Context, Expectation: give the AI a role, the action, the background, and what a good answer looks like.',
      ml: 'റോൾ, ആക്ഷൻ, കോൺടെക്സ്റ്റ്, എക്സ്പെക്ടേഷൻ: AI-ക്ക് ഒരു റോൾ, ചെയ്യേണ്ട കാര്യം, പശ്ചാത്തലം, നല്ല ഉത്തരം എങ്ങനെ ആയിരിക്കണം എന്നിവ നൽകുക.',
    },
    template: {
      en: 'Role: You are [role]. Action: [what to do]. Context: [background: who, where, why]. Expectation: [what the answer must include].',
      ml: 'റോൾ: നീ ഒരു [റോൾ] ആണ്. ആക്ഷൻ: [ചെയ്യേണ്ടത്]. കോൺടെക്സ്റ്റ്: [പശ്ചാത്തലം]. എക്സ്പെക്ടേഷൻ: [ഉത്തരത്തിൽ ഉണ്ടാകേണ്ടത്].',
    },
    example: {
      en: "You are a school event planner. Plan our class's Onam celebration. We are 40 students with ₹2,000 and 3 hours on Friday. The plan should include a timetable, a game list and a budget table.",
      ml: 'നീ ഒരു സ്കൂൾ പരിപാടി സംഘാടകനാണ്. ഞങ്ങളുടെ ക്ലാസിലെ ഓണാഘോഷം പ്ലാൻ ചെയ്യുക. ഞങ്ങൾ 40 വിദ്യാർത്ഥികളാണ്, ₹2,000 ഉം വെള്ളിയാഴ്ച 3 മണിക്കൂറും ഉണ്ട്. സമയക്രമം, കളികളുടെ ലിസ്റ്റ്, ബജറ്റ് പട്ടിക എന്നിവ ഉൾപ്പെടുത്തണം.',
    },
    parts: [P.role, P.action, P.context, P.expectation],
  },
  {
    id: 'roses',
    name: { en: 'ROSES', ml: 'ROSES' },
    short: {
      en: 'Role, Objective, Scenario, Expected solution, Steps. Good for planning and solving real problems.',
      ml: 'റോൾ, ലക്ഷ്യം (Objective), സാഹചര്യം (Scenario), പ്രതീക്ഷിക്കുന്ന ഉത്തരം (Expected solution), ഘട്ടങ്ങൾ (Steps). യഥാർത്ഥ പ്രശ്നങ്ങൾക്ക് നല്ലത്.',
    },
    template: {
      en: 'Role: You are [role]. Objective: I want to [goal]. Scenario: [my situation]. Expected solution: [what I need back]. Steps: [break it into steps].',
      ml: 'റോൾ: നീ ഒരു [റോൾ] ആണ്. ലക്ഷ്യം: എനിക്ക് [ലക്ഷ്യം] വേണം. സാഹചര്യം: [എന്റെ സാഹചര്യം]. പ്രതീക്ഷിക്കുന്ന ഉത്തരം: [എനിക്ക് വേണ്ടത്]. ഘട്ടങ്ങൾ: [ഘട്ടങ്ങളായി തിരിക്കുക].',
    },
    example: {
      en: 'You are a study coach. I want to score above 80 in my maths exam. My exam is in 10 days and I find fractions hard. Give me a daily study plan as a table. Break it into steps for each day.',
      ml: 'നീ ഒരു പഠന കോച്ച് ആണ്. കണക്ക് പരീക്ഷയിൽ 80-ന് മുകളിൽ മാർക്ക് നേടാൻ എനിക്ക് ആഗ്രഹമുണ്ട്. പരീക്ഷയ്ക്ക് ഇനി 10 ദിവസം മാത്രം, ഭിന്നസംഖ്യകൾ എനിക്ക് പ്രയാസമാണ്. ഓരോ ദിവസത്തെയും പഠന പ്ലാൻ ഒരു പട്ടികയായി നൽകുക. ഓരോ ദിവസവും ഘട്ടങ്ങളായി തിരിക്കുക.',
    },
    parts: [P.role, P.objective, P.scenario, P.expected, P.rosesSteps],
  },
  {
    id: 'costar',
    name: { en: 'CO-STAR', ml: 'CO-STAR' },
    short: {
      en: 'Context, Objective, Style, Tone, Audience, Response. The most complete framework; professionals use it.',
      ml: 'പശ്ചാത്തലം, ലക്ഷ്യം, ശൈലി, ടോൺ, ആർക്കുവേണ്ടി, ഉത്തര രൂപം. ഏറ്റവും പൂർണ്ണമായ രീതി; പ്രൊഫഷണലുകൾ ഉപയോഗിക്കുന്നത്.',
    },
    template: {
      en: 'Context: [background]. Objective: [what you want]. Style: [like a story / news / poem]. Tone: [funny / serious / kind]. Audience: [who will read it]. Response: [format and length].',
      ml: 'പശ്ചാത്തലം: [...]. ലക്ഷ്യം: [...]. ശൈലി: [കഥ / വാർത്ത / കവിത പോലെ]. ടോൺ: [തമാശ / ഗൗരവം / സൗമ്യം]. ആർക്ക്: [ആരാണ് വായിക്കുന്നത്]. ഉത്തരം: [രൂപവും നീളവും].',
    },
    example: {
      en: "Our school is starting a 'No plastic' week. Write an announcement to make students stop using plastic bottles. Write it like a news report, in an exciting tone, for students of class 5 to 7. Keep it under 100 words with a catchy title.",
      ml: "ഞങ്ങളുടെ സ്കൂളിൽ 'പ്ലാസ്റ്റിക് വേണ്ട' വാരം തുടങ്ങുന്നു. പ്ലാസ്റ്റിക് കുപ്പികൾ ഉപേക്ഷിക്കാൻ കുട്ടികളെ പ്രേരിപ്പിക്കുന്ന ഒരു അറിയിപ്പ് എഴുതുക. ഒരു വാർത്താ റിപ്പോർട്ട് പോലെ, ആവേശകരമായ രീതിയിൽ, 5 മുതൽ 7 വരെ ക്ലാസിലെ കുട്ടികൾക്കായി. ആകർഷകമായ തലക്കെട്ടോടെ 100 വാക്കുകളിൽ കവിയാതെ എഴുതുക.",
    },
    parts: [P.context, P.objective, P.style, P.tone, P.audience, P.response],
  },
  {
    id: 'flipped',
    name: { en: 'Flipped interaction', ml: 'ഫ്ലിപ്പ്ഡ് ഇന്ററാക്ഷൻ' },
    short: {
      en: 'Make the AI ask YOU questions first. Then it gives an answer that fits you exactly.',
      ml: 'ആദ്യം AI നിങ്ങളോട് ചോദ്യങ്ങൾ ചോദിക്കട്ടെ. അതിനുശേഷം നിങ്ങൾക്ക് കൃത്യമായി യോജിക്കുന്ന ഉത്തരം നൽകും.',
    },
    template: {
      en: 'I want [goal]. Before you answer, ask me [number] questions, one at a time. Then give me [final output].',
      ml: 'എനിക്ക് [ലക്ഷ്യം] വേണം. ഉത്തരം നൽകുന്നതിന് മുമ്പ് എന്നോട് [എണ്ണം] ചോദ്യങ്ങൾ ഓരോന്നായി ചോദിക്കുക. അതിനുശേഷം [അന്തിമ ഉത്തരം] നൽകുക.',
    },
    example: {
      en: 'I want to choose a science fair project. Before you suggest anything, ask me 3 questions, one at a time, about what I like. Then give me 2 project ideas with a list of materials.',
      ml: 'സയൻസ് ഫെയറിന് ഒരു പ്രോജക്റ്റ് തിരഞ്ഞെടുക്കാൻ എനിക്ക് സഹായം വേണം. എന്തെങ്കിലും നിർദ്ദേശിക്കുന്നതിന് മുമ്പ്, എനിക്ക് എന്താണ് ഇഷ്ടം എന്ന് അറിയാൻ എന്നോട് 3 ചോദ്യങ്ങൾ ഓരോന്നായി ചോദിക്കുക. അതിനുശേഷം ആവശ്യമായ സാധനങ്ങളുടെ ലിസ്റ്റോടെ 2 പ്രോജക്റ്റ് ആശയങ്ങൾ നൽകുക.',
    },
    parts: [P.goal, P.askMe, P.oneAtATime, P.thenStep, P.format],
  },
];

export const DEFAULT_METHOD = 'basic';

export const getMethod = (id?: string | null): Method => METHODS.find((m) => m.id === id) ?? METHODS[0];

export const MAX_BONUS = 3;
export const maxScore = (m: Method) => m.parts.length * 2 + MAX_BONUS;

export const autoParts = (m: Method, text: string) => (text.trim() ? m.parts.filter((p) => p.test(text)).map((p) => p.id) : []);

/** Score as the database computes it: 2 per accepted part of this method + bonus. */
export const scoreOf = (m: Method, parts: string[], bonus: number) =>
  m.parts.filter((p) => parts.includes(p.id)).length * 2 + bonus;
