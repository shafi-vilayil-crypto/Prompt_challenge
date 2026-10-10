import { useEffect, useState } from 'react';
import type { Lang } from './methods';

const KEY = 'prompt-challenge.lang';

export function useLang(): [Lang, (l: Lang) => void] {
  const [lang, setLang] = useState<Lang>(() => {
    try { return localStorage.getItem(KEY) === 'ml' ? 'ml' : 'en'; } catch { return 'en'; }
  });
  useEffect(() => {
    try { localStorage.setItem(KEY, lang); } catch { /* ignore */ }
    document.documentElement.lang = lang === 'ml' ? 'ml' : 'en';
  }, [lang]);
  return [lang, setLang];
}

type Strings = {
  whatsName: string; nameHelp: string; namePlaceholder: string; join: string; change: string;
  offline: string; loading: string; waitFirst: string; challenge: string; useMethod: string;
  seeExample: string; hideExample: string; template: string; example: string;
  sent: string; timeUpWait: string; writePrompt: string; placeholder: string; onceOnly: string;
  send: string; sending: string; alreadySent: string; closed: string; results: string;
  bonusTotal: (bonus: number, total: number) => string; feedback: string; missed: string; leaderboard: string; waitNext: string;
  boardEmpty: string; you: string; timesUp: string; partsLabel: string;
  verdict: (score: number, max: number) => string; tokens: (n: number) => string; tokensHelp: string;
  promptsSent: (n: number) => string; scanJoin: string; getReady: string; bestPrompts: string; method: string;
};

export const STRINGS: Record<Lang, Strings> = {
  en: {
    whatsName: "What's your name?",
    nameHelp: "Your name shows on the leaderboard. Use your real name so your teacher knows it's you.",
    namePlaceholder: 'Your name',
    join: 'Join the game',
    change: 'change',
    offline: "Can't reach the game. Check your internet; it will reconnect by itself.",
    loading: 'Loading…',
    waitFirst: 'Waiting for your teacher to start the first round.',
    challenge: 'Challenge',
    useMethod: 'Use this method',
    seeExample: 'See an example',
    hideExample: 'Hide the example',
    template: 'Template',
    example: 'Example',
    sent: 'Sent! Wait for your teacher to score the prompts.',
    timeUpWait: "Time's up. Wait for the scores.",
    writePrompt: 'Write your prompt',
    placeholder: 'Write the prompt you would give to the AI…',
    onceOnly: 'You can send only once. Read it before you send.',
    send: 'Send my prompt',
    sending: 'Sending…',
    alreadySent: 'You already sent a prompt this round.',
    closed: "Time's up. This round is closed.",
    results: 'Results',
    bonusTotal: (b, t) => `+${b} creativity bonus from your teacher = ${t} points`,
    feedback: 'Feedback',
    missed: "You didn't send a prompt this round. Join the next one!",
    leaderboard: 'Leaderboard',
    waitNext: 'Wait for the next round. This page updates by itself.',
    boardEmpty: 'Scores appear here after the teacher publishes the first round.',
    you: 'You',
    timesUp: "Time's up",
    partsLabel: 'Parts of your prompt',
    verdict: (s, m) => (s >= m * 0.85 ? 'Champion prompt!' : s >= m * 0.65 ? 'Very good' : s >= m * 0.4 ? 'Good start' : 'Add more parts next time'),
    tokens: (n) => `≈ ${n} ${n === 1 ? 'token' : 'tokens'}`,
    tokensHelp: 'AI reads text in small pieces called tokens.',
    promptsSent: (n) => `${n} ${n === 1 ? 'prompt' : 'prompts'} sent`,
    scanJoin: 'Scan, type your name, and wait for the question.',
    getReady: 'Get ready! The first challenge starts soon.',
    bestPrompts: 'Best prompts this round',
    method: 'Method',
  },
  ml: {
    whatsName: 'നിങ്ങളുടെ പേര് എന്താണ്?',
    nameHelp: 'നിങ്ങളുടെ പേര് സ്കോർ പട്ടികയിൽ കാണിക്കും. ടീച്ചർക്ക് മനസ്സിലാകാൻ യഥാർത്ഥ പേര് നൽകുക.',
    namePlaceholder: 'നിങ്ങളുടെ പേര്',
    join: 'കളിയിൽ ചേരുക',
    change: 'മാറ്റുക',
    offline: 'ഗെയിമുമായി ബന്ധിപ്പിക്കാൻ കഴിയുന്നില്ല. ഇന്റർനെറ്റ് പരിശോധിക്കുക; തനിയെ വീണ്ടും കണക്റ്റ് ആകും.',
    loading: 'ലോഡ് ചെയ്യുന്നു…',
    waitFirst: 'ടീച്ചർ ആദ്യ റൗണ്ട് തുടങ്ങുന്നതുവരെ കാത്തിരിക്കുക.',
    challenge: 'ചലഞ്ച്',
    useMethod: 'ഈ രീതി ഉപയോഗിക്കുക',
    seeExample: 'ഒരു ഉദാഹരണം കാണുക',
    hideExample: 'ഉദാഹരണം മറയ്ക്കുക',
    template: 'മാതൃക',
    example: 'ഉദാഹരണം',
    sent: 'അയച്ചു! ടീച്ചർ സ്കോർ നൽകുന്നതുവരെ കാത്തിരിക്കുക.',
    timeUpWait: 'സമയം കഴിഞ്ഞു. സ്കോറിനായി കാത്തിരിക്കുക.',
    writePrompt: 'നിങ്ങളുടെ പ്രോംപ്റ്റ് എഴുതുക',
    placeholder: 'AI-യോട് നിങ്ങൾ ചോദിക്കുന്ന പ്രോംപ്റ്റ് ഇവിടെ എഴുതുക…',
    onceOnly: 'ഒരു തവണ മാത്രമേ അയയ്ക്കാൻ കഴിയൂ. അയയ്ക്കുന്നതിന് മുമ്പ് വായിച്ചു നോക്കുക.',
    send: 'പ്രോംപ്റ്റ് അയയ്ക്കുക',
    sending: 'അയയ്ക്കുന്നു…',
    alreadySent: 'ഈ റൗണ്ടിൽ നിങ്ങൾ ഇതിനകം പ്രോംപ്റ്റ് അയച്ചു.',
    closed: 'സമയം കഴിഞ്ഞു. ഈ റൗണ്ട് അവസാനിച്ചു.',
    results: 'ഫലം',
    bonusTotal: (b, t) => `ടീച്ചറിൽ നിന്ന് +${b} ക്രിയേറ്റിവിറ്റി ബോണസ് = ${t} പോയിന്റ്`,
    feedback: 'അഭിപ്രായം',
    missed: 'ഈ റൗണ്ടിൽ നിങ്ങൾ പ്രോംപ്റ്റ് അയച്ചില്ല. അടുത്ത റൗണ്ടിൽ പങ്കെടുക്കൂ!',
    leaderboard: 'സ്കോർ പട്ടിക',
    waitNext: 'അടുത്ത റൗണ്ടിനായി കാത്തിരിക്കുക. ഈ പേജ് തനിയെ പുതുക്കും.',
    boardEmpty: 'ടീച്ചർ ആദ്യ റൗണ്ടിന്റെ സ്കോർ പ്രസിദ്ധീകരിച്ച ശേഷം ഇവിടെ കാണാം.',
    you: 'നിങ്ങൾ',
    timesUp: 'സമയം കഴിഞ്ഞു',
    partsLabel: 'നിങ്ങളുടെ പ്രോംപ്റ്റിലെ ഭാഗങ്ങൾ',
    verdict: (s, m) => (s >= m * 0.85 ? 'ചാമ്പ്യൻ പ്രോംപ്റ്റ്!' : s >= m * 0.65 ? 'വളരെ നല്ലത്' : s >= m * 0.4 ? 'നല്ല തുടക്കം' : 'അടുത്ത തവണ കൂടുതൽ ഭാഗങ്ങൾ ചേർക്കൂ'),
    tokens: (n) => `≈ ${n} ടോക്കണുകൾ`,
    tokensHelp: 'AI വാക്കുകളെ ടോക്കണുകൾ എന്ന ചെറിയ കഷണങ്ങളായാണ് വായിക്കുന്നത്.',
    promptsSent: (n) => `${n} പ്രോംപ്റ്റുകൾ ലഭിച്ചു`,
    scanJoin: 'സ്കാൻ ചെയ്ത്, പേര് നൽകി, ചോദ്യത്തിനായി കാത്തിരിക്കുക.',
    getReady: 'തയ്യാറാകൂ! ആദ്യ ചലഞ്ച് ഉടൻ തുടങ്ങും.',
    bestPrompts: 'ഈ റൗണ്ടിലെ മികച്ച പ്രോംപ്റ്റുകൾ',
    method: 'രീതി',
  },
};
