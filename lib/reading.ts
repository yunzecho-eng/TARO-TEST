import type { PersonaId, TarotCard } from './tarot';

export type ReadingTopic = 'general' | 'relationships' | 'work' | 'self';
export type FollowUpQuestion = 'strength' | 'caution' | 'action' | 'reflection';

export interface YearCardCalculation {
  total: number;
  /** Includes the initial total, followed by every digit-sum reduction. */
  steps: number[];
  number: number;
  cardId: string;
}

/**
 * User-defined annual calculation: year + birthday month + birthday day,
 * then sum the decimal digits at least once. Reduce again at 22 or above.
 * This is a symbolic tarot calculation, not a saju or predictive model.
 */
export function calculateYearCard(year: number, month: number, day: number): YearCardCalculation {
  return calculateCard(year, month, day, true);
}

/** The same confirmed sum, using the full birth date and actual calendar validity. */
export function calculatePersonalityCard(year: number, month: number, day: number): YearCardCalculation {
  return calculateCard(year, month, day, false);
}

/** Ten consecutive yearly cards; this does not define a separate decade formula. */
export function calculateDecadeCards(startYear: number, month: number, day: number): Array<YearCardCalculation & { year: number }> {
  if (!Number.isInteger(startYear) || startYear < 1000 || startYear > 9990) {
    throw new RangeError('10년 흐름의 시작 연도는 1000년부터 9990년 사이여야 합니다.');
  }
  return Array.from({ length: 10 }, (_, index) => {
    const year = startYear + index;
    return { year, ...calculateYearCard(year, month, day) };
  });
}

function calculateCard(year: number, month: number, day: number, recurringBirthday: boolean): YearCardCalculation {
  if (!Number.isInteger(year) || year < 1000 || year > 9999) {
    throw new RangeError('연도는 1000년부터 9999년 사이의 정수여야 합니다.');
  }
  if (!Number.isInteger(month) || !Number.isInteger(day) || month < 1 || month > 12 || day < 1 || day > 31) {
    throw new RangeError('올바른 생일의 월과 일을 입력해 주세요.');
  }
  // A birthday on February 29 is valid even if the reading year is not a leap year.
  const birthday = new Date(Date.UTC(recurringBirthday ? 2000 : year, month - 1, day));
  if (birthday.getUTCMonth() !== month - 1 || birthday.getUTCDate() !== day) {
    throw new RangeError('존재하지 않는 생일입니다. 월과 일을 확인해 주세요.');
  }
  const total = year + month + day;
  const steps = [total];
  let number = total;
  do {
    number = String(number).split('').reduce((sum, digit) => sum + Number(digit), 0);
    steps.push(number);
  } while (number >= 22);
  return { total, steps, number, cardId: `major-${String(number).padStart(2, '0')}` };
}

/** Browser and server use the same calendar year at the Seoul New Year boundary. */
export function getYearInSeoul(now: Date = new Date()): number {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new RangeError('유효한 날짜가 필요합니다.');
  }
  return Number(new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone: 'Asia/Seoul' }).format(now));
}

function friendTone(text: string): string {
  return text
    .replaceAll('해보세요.', '해보자.').replaceAll('해 보세요.', '해 보자.')
    .replaceAll('보세요.', '보자.').replaceAll('없어요.', '없어.')
    .replaceAll('있어요.', '있어.').replaceAll('아니에요.', '아니야.')
    .replaceAll('괜찮아요.', '괜찮아.').replaceAll('필요해요.', '필요해.')
    .replaceAll('중요해요.', '중요해.').replaceAll('좋아요.', '좋아.')
    .replaceAll('돼요.', '돼.').replaceAll('이에요.', '이야.')
    .replaceAll('예요.', '야.').replaceAll('세요.', '자.')
    .replaceAll('인가요?', '일까?').replaceAll('싶나요?', '싶어?')
    .replaceAll('주나요?', '줘?').replaceAll('하나요?', '해?')
    .replaceAll('있나요?', '있어?').replaceAll('달라졌나요?', '달라졌어?')
    .replaceAll('달라지나요?', '달라져?').replaceAll('놓이나요?', '놓여?');
}

const topicNames: Record<ReadingTopic, string> = {
  general: '전체적인 흐름', relationships: '관계', work: '일과 배움', self: '나의 마음',
};

const topicPrompts: Record<ReadingTopic, string> = {
  general: '이 주제가 요즘의 선택과 어떤 점에서 닿아 있는지 살펴보세요.',
  relationships: '상대의 속마음을 단정하기보다, 서로에게 필요한 것을 확인하는 대화와 내가 지킬 경계를 떠올려 보세요.',
  work: '성과를 미리 예측하기보다, 지금 맡은 일에서 내가 조정할 수 있는 우선순위와 실행 방법을 찾아보세요.',
  self: '이 설명이 내 마음과 맞는 부분과 다른 부분을 나누어 보세요. 어떤 감정이든 바로 고치려고 하지 않아도 괜찮아요.',
};

/** Curated topic framing, not a generated answer or a claim about another person's mind. */
export function getTopicReading(card: TarotCard, reversed: boolean, persona: PersonaId, topic: ReadingTopic, showDirection = true): string {
  const name = topicNames[topic];
  const useReversed = showDirection && reversed;
  const meaning = useReversed ? card.reversed : card.upright;
  const prompt = topicPrompts[topic];
  const advice = useReversed ? card.reversedAdvice : card.advice;
  const direction = showDirection ? ` ${reversed ? '역방향' : '정방향'}` : '';
  if (persona === 'friend') {
    return `${name} 얘기로 이어가 볼까? ${card.name} 카드에서 눈에 들어오는 건 ‘${card.keywords[0]}’이야. ${friendTone(meaning)} ${friendTone(prompt)} 너한테 맞는 부분부터 하나씩 해보면 돼.`;
  }
  if (persona === 'counselor') {
    return `‘${name}’에 마음을 두고 ${card.name} 카드의 이야기를 읽어보세요. ${meaning} ${prompt} 그중 어떤 문장에 마음이 머무는지 천천히 알아차려 보셔도 좋아요.`;
  }
  if (persona === 'teacher') {
    return `${name}에 적용할 핵심어는 ‘${card.keywords.join(' · ')}’입니다. ${meaning} ${prompt} 작은 적용 과제로, ${advice} 결과보다 시도하며 알아차린 점을 기록해 보세요.`;
  }
  return `${name}을 비추는 ${card.name}${direction} 카드입니다. ${meaning} ${prompt} 카드의 상징 중 지금의 상황과 닿는 부분을 골라 읽어보세요.`;
}

const followUpTitles: Record<FollowUpQuestion, string> = {
  strength: '내가 활용할 수 있는 힘',
  caution: '조금 더 살펴볼 부분',
  action: '지금 해볼 작은 행동',
  reflection: '내 마음에 남겨둘 질문',
};

/** Set showDirection=false for calculated cards, which have no orientation. */
export function getFollowUp(card: TarotCard, reversed: boolean, persona: PersonaId, question: FollowUpQuestion, showDirection = true): string {
  const useReversed = showDirection && reversed;
  const meaning = useReversed ? card.reversed : card.upright;
  const advice = useReversed ? card.reversedAdvice : card.advice;
  const direction = showDirection ? ` ${reversed ? '역방향' : '정방향'}` : '';
  const body: Record<FollowUpQuestion, string> = {
    strength: `${card.trait}에 주목해 보세요. ${useReversed ? '역방향은 그 힘이 없다는 뜻이 아니라, 지금 어떻게 쓰고 있는지 점검하는 관점이에요.' : '이 모습이 실제로 도움이 되었던 경험을 하나 떠올려 보세요.'} ${meaning}`,
    caution: `${card.reversed} ${useReversed ? '이미 역방향으로 나온 카드이니 이 부분을 천천히 살펴보세요.' : showDirection ? '정방향의 장점도 한쪽으로 치우치면 부담이 될 수 있어요.' : '카드가 보여주는 강점도 한쪽으로 치우치면 부담이 될 수 있어요.'} ${card.reversedAdvice}`,
    action: `${advice} 실행할 시간과 장소를 하나 정하고, 부담이 크면 더 작은 행동으로 바꿔도 괜찮아요.`,
    reflection: `${card.reflection} ${useReversed ? '방향을 바꾸고 싶은 부분이 있다면 그것도 함께 적어 보세요.' : '지금 떠오르는 첫 생각부터 편하게 적어 보세요.'} 답이 바로 나오지 않아도 괜찮아요.`,
  };
  if (persona === 'friend') {
    return `${card.name} 카드 얘기, 조금 더 해보자. ${friendTone(body[question])} 꼭 멋진 답을 낼 필요 없어. 지금 네 느낌이면 충분해.`;
  }
  if (persona === 'counselor') {
    return `${card.name} 카드에서 ‘${followUpTitles[question]}’을 함께 살펴볼게요. ${body[question]} 설명에 자신을 맞추기보다 지금 경험에 맞는 표현을 찾아보세요.`;
  }
  if (persona === 'teacher') {
    return `생각 연습: ${followUpTitles[question]}. ${card.name}의 핵심어 ‘${card.keywords.join(' · ')}’와 연결해 볼까요? ${body[question]} 내 경험을 한 가지 예로 들면 생각을 정리하는 데 도움이 됩니다.`;
  }
  return `${card.name}${direction} 카드로 ‘${followUpTitles[question]}’을 읽어볼게요. ${body[question]} 카드는 답을 정해주기보다 지금의 선택을 비추는 상징으로 받아들여 보세요.`;
}
