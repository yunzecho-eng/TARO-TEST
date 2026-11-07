import assert from 'node:assert/strict';
import { test } from 'node:test';
import { access } from 'node:fs/promises';
import type { PersonaId } from '../lib/tarot';

// URLs allow Node's native TypeScript runner without changing app import settings.
const { deck, drawCards, getPositions, readCard } = await import(new URL('../lib/tarot.ts', import.meta.url).href) as typeof import('../lib/tarot');
const { calculateYearCard, calculatePersonalityCard, calculateDecadeCards, getYearInSeoul, getTopicReading, getFollowUp } = await import(new URL('../lib/reading.ts', import.meta.url).href) as typeof import('../lib/reading');

test('annual card sums year + birthday first, then reduces decimal digits', () => {
  assert.deepEqual(calculateYearCard(2026, 11, 7), { total: 2044, steps: [2044, 10], number: 10, cardId: 'major-10' });
  assert.equal(calculateYearCard(1000, 1, 1).number, 3);
  assert.equal(calculateYearCard(9999, 12, 31).number, 7);
});

test('22 and 23 both reduce again, while 21 is retained', () => {
  assert.deepEqual(calculateYearCard(1970, 7, 6), { total: 1983, steps: [1983, 21], number: 21, cardId: 'major-21' });
  assert.deepEqual(calculateYearCard(1970, 7, 7), { total: 1984, steps: [1984, 22, 4], number: 4, cardId: 'major-04' });
  assert.deepEqual(calculateYearCard(1970, 7, 8), { total: 1985, steps: [1985, 23, 5], number: 5, cardId: 'major-05' });
});

test('personality uses birth year and validates the actual birth date', () => {
  assert.deepEqual(calculatePersonalityCard(1970, 7, 7), { total: 1984, steps: [1984, 22, 4], number: 4, cardId: 'major-04' });
  assert.deepEqual(calculatePersonalityCard(2000, 2, 29), { total: 2031, steps: [2031, 6], number: 6, cardId: 'major-06' });
  assert.throws(() => calculatePersonalityCard(2001, 2, 29), RangeError);
  assert.throws(() => calculatePersonalityCard(1900, 2, 29), RangeError);
});

test('ten-year helper is exactly ten consecutive annual calculations', () => {
  const series = calculateDecadeCards(2026, 2, 29);
  assert.equal(series.length, 10);
  assert.deepEqual(series.map(({ year }) => year), [2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034, 2035]);
  for (const entry of series) assert.deepEqual(entry, { year: entry.year, ...calculateYearCard(entry.year, 2, 29) });
  assert.equal(calculateDecadeCards(9990, 1, 1).at(-1)?.year, 9999);
  assert.throws(() => calculateDecadeCards(9991, 1, 1), RangeError);
});

test('leap-day birthdays remain valid in a nonleap reading year', () => {
  assert.deepEqual(calculateYearCard(2026, 2, 29), { total: 2057, steps: [2057, 14], number: 14, cardId: 'major-14' });
});

test('impossible birthdays and invalid numeric inputs are rejected', () => {
  for (const [year, month, day] of [
    [2026, 2, 30], [2026, 4, 31], [2026, 0, 1], [2026, 13, 1],
    [2026, 1, 0], [2026, 1, 32], [2026, 1.5, 1], [2026, 1, 1.5],
    [999, 1, 1], [10000, 1, 1], [2026.5, 1, 1], [NaN, 1, 1], [Infinity, 1, 1],
  ]) assert.throws(() => calculateYearCard(year, month, day), RangeError);
});

test('Seoul year changes at 15:00 UTC on December 31', () => {
  assert.equal(getYearInSeoul(new Date('2026-12-31T14:59:59.999Z')), 2026);
  assert.equal(getYearInSeoul(new Date('2026-12-31T15:00:00.000Z')), 2027);
  assert.throws(() => getYearInSeoul(new Date('invalid')), RangeError);
});

test('deck includes 22 major and 56 minor cards with complete distinct content and real assets', async () => {
  assert.equal(deck.length, 78);
  assert.equal(new Set(deck.map((card) => card.id)).size, 78);
  assert.equal(new Set(deck.map((card) => card.upright)).size, 78);
  assert.equal(new Set(deck.map((card) => card.reversed)).size, 78);
  assert.equal(deck.filter((card) => card.arcana === 'major').length, 22);
  for (const suit of ['wands', 'cups', 'swords', 'pentacles']) {
    assert.equal(deck.filter((card) => card.suit === suit).length, 14);
  }
  for (const card of deck) {
    assert.equal(card.keywords.length, 3);
    for (const value of [card.name, card.nameEn, card.trait, card.upright, card.reversed, card.advice, card.reversedAdvice, card.reflection]) assert.ok(value.trim());
    await access(new URL(`../public${card.image}`, import.meta.url));
  }
});

test('full draws never repeat cards, do not mutate deck, and retain orientation', () => {
  const before = deck.map((card) => card.id);
  const all = drawCards(78, () => 0);
  assert.equal(new Set(all.map(({ card }) => card.id)).size, 78);
  assert.ok(all.every(({ reversed }) => reversed));
  assert.deepEqual(deck.map((card) => card.id), before);
  assert.ok(drawCards(78, () => 0.999999).every(({ reversed }) => !reversed));
  assert.deepEqual(drawCards(0), []);
  for (const count of [-1, 79, 1.2, NaN]) assert.throws(() => drawCards(count), RangeError);
  for (const random of [-0.1, 1, NaN, Infinity]) assert.throws(() => drawCards(1, () => random), RangeError);
});

test('a twelve-card spread samples distinct cards from the full 78-card deck', () => {
  const spread = drawCards(12, () => 0.999999);
  assert.equal(spread.length, 12);
  assert.equal(new Set(spread.map(({ card }) => card.id)).size, 12);
  assert.ok(spread.some(({ card }) => card.arcana === 'minor'));
  assert.ok(spread.every(({ card }) => deck.includes(card)));
  const selected = [spread[2], spread[7], spread[10]];
  assert.equal(new Set(selected.map(({ card }) => card.id)).size, 3);
  assert.deepEqual(getPositions('draw', 2026), ['현재 상황', '살펴볼 점', '실천할 조언']);
});

test('calculated readings never introduce direction in any persona, topic or follow-up', () => {
  const personas: PersonaId[] = ['reader', 'counselor', 'friend', 'teacher'];
  for (const card of deck) {
    for (const persona of personas) {
      for (const kind of ['personality', 'year', 'decade'] as const) {
        const normal = readCard(card, false, persona, kind, 0, 2026);
        // The calculated mode ignores an accidentally passed reversal flag too.
        assert.deepEqual(normal, readCard(card, true, persona, kind, 0, 2026));
        assert.doesNotMatch(Object.values(normal).join(' '), /정방향|역방향/);
      }
      for (const topic of ['general', 'relationships', 'work', 'self'] as const) {
        const normal = getTopicReading(card, false, persona, topic, false);
        assert.doesNotMatch(normal, /정방향|역방향/);
        assert.equal(normal, getTopicReading(card, true, persona, topic, false));
      }
      for (const question of ['strength', 'caution', 'action', 'reflection'] as const) {
        const normal = getFollowUp(card, false, persona, question, false);
        assert.doesNotMatch(normal, /정방향|역방향/);
        assert.equal(normal, getFollowUp(card, true, persona, question, false));
      }
    }
  }
});

test('only random-draw readings apply reversed meanings and their three positions', () => {
  for (const persona of ['reader', 'counselor', 'friend', 'teacher'] as const) {
    for (const [index, title] of getPositions('draw', 2026).entries()) {
      const normal = readCard(deck[0], false, persona, 'draw', index, 2026);
      const reverse = readCard(deck[0], true, persona, 'draw', index, 2026);
      assert.equal(normal.title, title);
      assert.notEqual(normal.text, reverse.text);
      assert.notEqual(normal.advice, reverse.advice);
    }
  }
  assert.match(readCard(deck[0], true, 'reader', 'draw', 0, 2026).text, /역방향/);
  assert.match(readCard(deck[0], false, 'reader', 'draw', 0, 2026).text, /정방향/);
});

test('readings distinguish persona, orientation, card, topic and follow-up intent', () => {
  const personas: PersonaId[] = ['reader', 'counselor', 'friend', 'teacher'];
  const card = deck[0];
  const sample = personas.map((persona) => readCard(card, false, persona, 'personality', 0, 2026).text);
  assert.equal(new Set(sample).size, 4);
  for (const persona of personas) {
    const normal = getTopicReading(card, false, persona, 'general');
    assert.notEqual(normal, getTopicReading(card, true, persona, 'general'));
    assert.notEqual(normal, getTopicReading(deck[1], false, persona, 'general'));
    const topics = ['general', 'relationships', 'work', 'self'] as const;
    assert.equal(new Set(topics.map((topic) => getTopicReading(card, false, persona, topic))).size, 4);
    const questions = ['strength', 'caution', 'action', 'reflection'] as const;
    assert.equal(new Set(questions.map((question) => getFollowUp(card, false, persona, question))).size, 4);
    for (const question of questions) assert.notEqual(getFollowUp(card, false, persona, question), getFollowUp(card, true, persona, question));
  }
});

test('positions reflect a single personality card, one yearly card and consecutive years', () => {
  assert.deepEqual(getPositions('personality', 2026), ['나의 성격 카드']);
  assert.deepEqual(getPositions('year', 2026), ['2026년의 주제']);
  const positions = getPositions('decade', 2026);
  assert.equal(positions.length, 10);
  assert.equal(positions[0], '2026년의 주제');
  assert.equal(positions[9], '2035년의 주제');
  assert.equal(readCard(deck[0], false, 'reader', 'personality', 2, 2026).title, '나의 성격 카드');
  assert.equal(readCard(deck[0], false, 'reader', 'year', 0, 2026).title, '2026년의 주제');
});
