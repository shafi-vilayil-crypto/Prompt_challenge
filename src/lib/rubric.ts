// The six parts of a good prompt. Each is worth 2 points; the teacher adds a 0-3 creativity bonus (max 15).
// The database recomputes the score from the accepted parts, so these ids must match schema.sql.

export type Part = { id: string; label: string; hint: string; test: (t: string) => boolean };

const words = (t: string) => (t.trim().match(/\S+/g) ?? []).length;

export const PARTS: Part[] = [
  {
    id: 'role', label: 'Role', hint: 'Tells AI who to be ("You are a teacher")',
    test: (t) => /\b(you are|act as|act like|pretend|imagine you|behave like|as an? (teacher|expert|doctor|scientist|friend|coach|guide|storyteller|poet))\b/i.test(t),
  },
  {
    id: 'task', label: 'Clear task', hint: 'Says exactly what to do (explain, write, list)',
    test: (t) => /\b(explain|explanation|write|list|make|create|give|tell|describe|summari[sz]e|summary|translate|compare|draw|plan|suggest|teach|prepare|design|help|find|show|generate|what|how|why|who|when|where|which|can you|could you|please)\b/i.test(t),
  },
  {
    id: 'audience', label: 'Audience', hint: 'Who is it for ("for a 7th class student")',
    test: (t) => /\b((for|to) (a|an|my|me|kids|children|students|class|beginners|parents|grandma|grandmother|friends?)|students?|class \d+|\d+(st|nd|rd|th) (class|std|standard|grade)|grade|std|year[- ]old|beginners?|child(ren)?|kids|grand(ma|mother|pa|father)|parents|teachers?|friends?|villagers|farmers)\b/i.test(t),
  },
  {
    id: 'format', label: 'Format', hint: 'Shape of the answer (5 points, table, poem)',
    test: (t) => /\b(\d+\s*(points?|lines?|steps?|words?|sentences?|questions?|tips|ideas|examples|days?)|points|bullets?|table|list|steps|paragraph|poem|story|song|quiz|chart|letter)\b/i.test(t),
  },
  {
    id: 'language', label: 'Language & tone', hint: 'Simple, funny, in Malayalam',
    test: (t) => /\b(malayalam|english|hindi|tamil|simple|easy|funny|friendly|short|polite|kind|interesting|fun)\b/i.test(t) || /[ഀ-ൿ]/.test(t),
  },
  {
    id: 'detail', label: 'Details', hint: 'Topic, example or reason',
    test: (t) => words(t) >= 18 || /\b(example|because|include|including|such as|related to|using)\b/i.test(t),
  },
];

export const MAX_BONUS = 3;
export const MAX_SCORE = PARTS.length * 2 + MAX_BONUS;

export const autoParts = (text: string) => PARTS.filter((p) => p.test(text)).map((p) => p.id);

export const scoreOf = (parts: string[], bonus: number) => parts.length * 2 + bonus;

export function verdict(score: number): string {
  if (score >= 13) return 'Champion prompt!';
  if (score >= 10) return 'Very good';
  if (score >= 6) return 'Good start';
  return 'Add more parts next time';
}
