"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, Bookmark, Check, Coffee, Heart, History, Moon, Search, Sparkles, Sun, Trash2, X } from "lucide-react";
import { deck, drawCards, getPositions, readCard, type DrawnCard, type PersonaId, type ReadingKind, type TarotCard } from "@/lib/tarot";
import { calculatePersonalityCard, calculateYearCard, getYearInSeoul, getTopicReading, getFollowUp, type ReadingTopic, type FollowUpQuestion } from "@/lib/reading";

type View = "home" | "draw" | "reveal" | "result" | "library" | "history";
type Calculation = ReturnType<typeof calculateYearCard> & { year: number };
type Session = { id: string; createdAt: string; kind: ReadingKind; persona: PersonaId; topic: ReadingTopic; calculations: Calculation[]; formula: string; note: string; drawnCards?: { cardId: string; reversed: boolean }[]; question?: string };
const STORAGE_KEY = "taro-test.readings.v1";
const PERSONAS = [
  { id: "reader" as const, name: "타로집 선생님", subtitle: "차분하고 직관적인 해석", icon: Moon, quote: "카드가 건네는 이야기를\n천천히 함께 읽어볼까요?" },
  { id: "counselor" as const, name: "심리 상담사", subtitle: "내 마음을 살피는 따뜻한 대화", icon: Heart, quote: "어떤 마음이 드는지,\n있는 그대로 들려주세요." },
  { id: "friend" as const, name: "친한 친구", subtitle: "편안하고 솔직한 한마디", icon: Coffee, quote: "너는 어떻게 느꼈어?\n우리 편하게 얘기해 보자." },
  { id: "teacher" as const, name: "학교 선생님", subtitle: "이해하기 쉽게, 차근차근", icon: BookOpen, quote: "카드 속 힌트를\n우리 일상에 연결해 볼까요?" },
];
const KINDS = [
  { id: "personality" as const, number: "01", name: "나의 성격", description: "나도 몰랐던 나의 모습과\n내 안에 있는 가능성", meta: "생년월일 · 메이저 1장", icon: Sparkles },
  { id: "decade" as const, number: "02", name: "10년의 흐름", description: "해마다 달라지는 주제로\n조금 더 멀리 바라보기", meta: "대운 · 10년간의 세운 카드", icon: Moon },
  { id: "year" as const, number: "03", name: "올해의 세운", description: "이번 한 해, 마음에 두고\n살펴볼 나만의 이야기", meta: "선택한 연도 · 메이저 1장", icon: Sun },
  { id: "draw" as const, number: "04", name: "카드 뽑기", description: "궁금한 일을 떠올리며\n직접 고르는 카드 3장", meta: "웨이트 78장 · 정·역방향", icon: Coffee },
];
const TOPICS: { id: ReadingTopic; label: string }[] = [{ id: "general", label: "전체적인 흐름" }, { id: "relationships", label: "사람과 관계" }, { id: "work", label: "일과 공부" }, { id: "self", label: "내 마음" }];
const FOLLOWUPS: { id: FollowUpQuestion; label: string }[] = [{ id: "strength", label: "나의 강점은?" }, { id: "caution", label: "무엇을 조심할까?" }, { id: "action", label: "지금 할 수 있는 일은?" }, { id: "reflection", label: "나에게 던지는 질문" }];
const SUITS = [{ id: "all", label: "전체 78" }, { id: "major", label: "메이저" }, { id: "wands", label: "완드" }, { id: "cups", label: "컵" }, { id: "swords", label: "소드" }, { id: "pentacles", label: "펜타클" }];

function isSession(value: unknown): value is Session {
  if (!value || typeof value !== "object") return false;
  const s = value as Session;
  const common = typeof s.id === "string" && typeof s.createdAt === "string" && Number.isFinite(Date.parse(s.createdAt)) && KINDS.some(k => k.id === s.kind) && PERSONAS.some(p => p.id === s.persona) && TOPICS.some(t => t.id === s.topic) && typeof s.formula === "string" && typeof s.note === "string" && Array.isArray(s.calculations) && (s.question === undefined || typeof s.question === "string");
  if (!common) return false;
  if (s.kind === "draw") return s.calculations.length === 0 && Array.isArray(s.drawnCards) && s.drawnCards.length === 3 && new Set(s.drawnCards.map(c => c?.cardId)).size === 3 && s.drawnCards.every(c => c && typeof c.reversed === "boolean" && deck.some(d => d.id === c.cardId));
  return s.calculations.length === (s.kind === "decade" ? 10 : 1) && s.calculations.every(c => c && Number.isInteger(c.year) && c.year >= 1000 && c.year <= 9999 && Number.isInteger(c.total) && Number.isInteger(c.number) && c.number >= 1 && c.number <= 21 && c.cardId === `major-${String(c.number).padStart(2, "0")}` && Array.isArray(c.steps) && c.steps.length >= 2 && c.steps.every(Number.isInteger));
}

function sessionCards(record: Session) { return record.kind === "draw" ? record.drawnCards! : record.calculations.map(c => ({ cardId: c.cardId, reversed: false })); }

function CardBack() {
  return <span className="card-back" aria-hidden="true"><span className="back-orbit" /><span className="back-star">✧</span><span className="back-word">TARO TEST</span></span>;
}

function PersonaPicker({ value, onChange }: { value: PersonaId; onChange: (id: PersonaId) => void }) {
  return <div className="persona-options" role="group" aria-label="해설자 선택">{PERSONAS.map(p => <button type="button" className="persona-option" data-selected={value === p.id} aria-pressed={value === p.id} key={p.id} onClick={() => onChange(p.id)}><span className="persona-icon"><p.icon size={20} strokeWidth={1.5} /></span><span className="persona-copy"><strong>{p.name}</strong><small>{p.subtitle}</small></span><span className="selection-dot">{value === p.id && <Check size={11} />}</span></button>)}</div>;
}

export default function Home() {
  const [view, setView] = useState<View>("home");
  const [kind, setKind] = useState<ReadingKind>("personality");
  const [persona, setPersona] = useState<PersonaId>("reader");
  const [topic, setTopic] = useState<ReadingTopic>("general");
  const [birthYear, setBirthYear] = useState("");
  const [month, setMonth] = useState("");
  const [day, setDay] = useState("");
  const [currentYear, setCurrentYear] = useState(() => getYearInSeoul());
  const [year, setYear] = useState(() => getYearInSeoul());
  const [error, setError] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [selectedYear, setSelectedYear] = useState(0);
  const [followup, setFollowup] = useState<FollowUpQuestion>("strength");
  const [question, setQuestion] = useState("");
  const [candidates, setCandidates] = useState<DrawnCard[]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [history, setHistory] = useState<Session[]>([]);
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");
  const [suit, setSuit] = useState("all");
  const [detail, setDetail] = useState<TarotCard | null>(null);
  const [reverse, setReverse] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pageHeadingRef = useRef<HTMLHeadingElement>(null);
  const previousView = useRef<View>("home");

  useEffect(() => {
    setCurrentYear(getYearInSeoul());
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
      if (Array.isArray(stored)) setHistory(stored.filter(isSession).slice(0, 30));
    } catch { setToast("저장된 기록을 읽지 못했어요. 새 리딩은 이용할 수 있어요."); }
  }, []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(""), 4000); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => {
    if (view !== previousView.current) { window.scrollTo({ top: 0, behavior: "instant" }); pageHeadingRef.current?.focus({ preventScroll: true }); previousView.current = view; }
  }, [view]);
  useEffect(() => { if (detail) { setReverse(false); dialogRef.current?.showModal(); } }, [detail]);

  const selectedPersona = PERSONAS.find(p => p.id === persona)!;
  const calculation = session?.calculations[selectedYear];
  const drawn = session?.drawnCards?.[selectedYear];
  const isReversed = session?.kind === "draw" && !!drawn?.reversed;
  const resultCard = deck.find(card => card.id === (session?.kind === "draw" ? drawn?.cardId : calculation?.cardId));
  const reading = resultCard && session ? readCard(resultCard, isReversed, session.persona, session.kind === "decade" ? "year" : session.kind, session.kind === "draw" ? selectedYear : 0, calculation?.year ?? currentYear) : null;
  const libraryCards = useMemo(() => deck.filter(card => (suit === "all" || card.arcana === suit || card.suit === suit) && `${card.name} ${card.nameEn} ${card.keywords.join(" ")}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())), [search, suit]);

  function goHome() { setError(""); setView("home"); }
  function startReading(event: React.FormEvent) {
    event.preventDefault(); setError("");
    if (kind === "draw") { setCandidates(drawCards(12)); setPicked([]); setView("draw"); return; }
    try {
      const m = Number(month), d = Number(day), born = Number(birthYear);
      if (!month || !day || (kind === "personality" && !birthYear)) throw new Error("생일을 모두 입력해 주세요.");
      if (kind === "personality" && (born < 1900 || born > currentYear)) throw new Error(`출생 연도는 1900~${currentYear}년으로 입력해 주세요.`);
      if (kind === "personality") {
        const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
        const today = ["year", "month", "day"].map(type => parts.find(p => p.type === type)!.value).join("-");
        const birthDate = `${born}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        if (birthDate > today) throw new Error("생일은 오늘 또는 이전 날짜로 입력해 주세요.");
      }
      const firstYear = kind === "personality" ? born : year;
      const calculations: Calculation[] = kind === "decade" ? Array.from({ length: 10 }, (_, i) => ({ ...calculateYearCard(year + i, m, d), year: year + i })) : [{ ...(kind === "personality" ? calculatePersonalityCard(born, m, d) : calculateYearCard(year, m, d)), year: firstYear }];
      setSession({ id: crypto.randomUUID(), createdAt: new Date().toISOString(), kind, persona, topic, calculations, formula: `${firstYear} + ${m} + ${d}`, note: "" });
      setSelectedYear(0); setFollowup("strength"); setView("reveal");
    } catch (err) { setError(err instanceof Error ? err.message : "입력한 날짜를 다시 확인해 주세요."); }
  }
  function saveReading() {
    if (!session) return;
    const next = [session, ...history.filter(s => s.id !== session.id)].slice(0, 30);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); setHistory(next); setToast("나의 기록에 저장했어요."); } catch { setToast("브라우저 저장 공간을 사용할 수 없어요. 저장되지 않았습니다."); }
  }
  function removeReading(id: string) {
    const next = history.filter(s => s.id !== id);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); setHistory(next); setToast("기록을 삭제했어요."); } catch { setToast("기록을 삭제하지 못했어요."); }
  }
  function openHistory(record: Session) { setSession(record); setSelectedYear(0); setFollowup("strength"); setView("result"); }
  function changeSessionPersona(next: PersonaId) { setPersona(next); setSession(s => s ? { ...s, persona: next } : s); }
  function finishDraw() {
    if (picked.length !== 3) return;
    setSession({ id: crypto.randomUUID(), createdAt: new Date().toISOString(), kind: "draw", persona, topic, calculations: [], formula: "", note: "", question: question.trim(), drawnCards: picked.map(i => ({ cardId: candidates[i].card.id, reversed: candidates[i].reversed })) });
    setSelectedYear(0); setFollowup("strength"); setView("result");
  }
  function scrollToSetup() { document.getElementById("reading-setup")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" }); }
  function closeDialog() { dialogRef.current?.close(); setDetail(null); }

  return <>
    <a className="skip-link" href="#main-content">본문으로 이동</a>
    <header className="site-header"><div className="header-inner">
      <button className="brand" onClick={goHome} aria-label="TARO TEST 홈"><span className="brand-mark">✳</span><span className="brand-name">TARO TEST<span className="brand-tag">나를 읽는 시간</span></span></button>
      <nav aria-label="주 메뉴"><button className={["home", "draw", "result", "reveal"].includes(view) ? "active" : ""} onClick={goHome}>타로 리딩</button><button className={view === "library" ? "active" : ""} onClick={() => setView("library")}>카드 도감</button><button className={view === "history" ? "active" : ""} onClick={() => setView("history")}>나의 기록</button></nav>
      <span className="header-note"><span /> 잠시, 나에게 집중하는 시간</span>
    </div></header>

    <main id="main-content" className="page-shell">
      {view === "home" && <>
        <section className="hero">
          <div className="hero-copy"><p className="eyebrow"><span /> RIDER–WAITE–SMITH TAROT</p><h1 ref={pageHeadingRef} tabIndex={-1} className="hero-title">타로로 보는<br /><em>성격과 운세.</em></h1><p className="hero-description">생년월일로 성격과 세운을 확인하고,<br />78장의 카드에서 오늘의 조언을 뽑아보세요.</p><div className="hero-actions"><button className="primary-button" onClick={scrollToSetup}>나의 카드 만나기 <ArrowUpRight size={19} /></button><span className="quiet-label">성격 · 세운 · 카드 뽑기</span></div></div>
          <div className="hero-art" aria-label="별, 태양, 여사제의 웨이트 타로 카드"><div className="orbit" /><span className="art-spark spark-one" aria-hidden="true">✧</span><span className="art-spark spark-two" aria-hidden="true">✦</span><div className="hero-card card-left"><img src="/cards/major-17.jpg" alt="별 카드" fetchPriority="high" /></div><div className="hero-card card-right"><img src="/cards/major-02.jpg" alt="여사제 카드" /></div><div className="hero-card card-middle"><img src="/cards/major-19.jpg" alt="태양 카드" fetchPriority="high" /></div><span className="art-caption">78 CARDS · 4 VOICES<br />RIDER–WAITE–SMITH</span></div>
        </section>
        <section id="reading-setup" className="reading-setup" aria-labelledby="setup-title">
          <div className="section-heading"><div><p className="eyebrow">YOUR READING</p><h2 id="setup-title">어떤 이야기가 궁금한가요?</h2></div><p>지금 마음이 가는 주제를 골라주세요.</p></div>
          <div className="reading-options" role="group" aria-label="리딩 종류">{KINDS.map(k => <button type="button" className="reading-option" data-selected={kind === k.id} aria-pressed={kind === k.id} key={k.id} onClick={() => { setKind(k.id); setError(""); }}><span className="option-number">{k.number}</span><k.icon className="option-icon" size={26} strokeWidth={1.1} /><h3>{k.name}</h3><p>{k.description}</p><span className="option-meta">{k.meta} <ArrowUpRight size={16} /></span></button>)}</div>
          <form className="setup-grid" onSubmit={startReading}>
            <div className="setup-main"><div className="field-label"><span>01</span><h3>누구에게 이야기를 들을까요?</h3></div><PersonaPicker value={persona} onChange={setPersona} />
              {kind !== "draw" && <><div className="field-label"><span>02</span><h3>생일을 입력해 주세요</h3></div><div className="birth-fields">
                {kind === "personality" && <div className="form-field"><label htmlFor="birth-year">태어난 연도</label><input id="birth-year" type="number" inputMode="numeric" min="1900" max={currentYear} placeholder="예: 1998" required value={birthYear} onChange={e => setBirthYear(e.target.value)} /></div>}
                <div className="form-field"><label htmlFor="birth-month">태어난 달</label><select id="birth-month" required value={month} onChange={e => setMonth(e.target.value)}><option value="">월 선택</option>{Array.from({ length: 12 }, (_, i) => <option value={i + 1} key={i}>{i + 1}월</option>)}</select></div>
                <div className="form-field"><label htmlFor="birth-day">태어난 날</label><select id="birth-day" required value={day} onChange={e => setDay(e.target.value)}><option value="">일 선택</option>{Array.from({ length: 31 }, (_, i) => <option value={i + 1} key={i}>{i + 1}일</option>)}</select></div>
                {kind !== "personality" && <div className="form-field"><label htmlFor="reading-year">{kind === "decade" ? "시작 연도" : "보고 싶은 해"}</label><select id="reading-year" value={year} onChange={e => setYear(Number(e.target.value))}>{Array.from({ length: 13 }, (_, i) => currentYear - 2 + i).map(y => <option key={y} value={y}>{y}년{y === currentYear ? " · 올해" : ""}</option>)}</select></div>}
              </div><p className="form-note">양력 생일로 입력해 주세요.</p></>}{kind === "draw" && <><div className="field-label"><span>02</span><h3>어떤 일이 궁금한가요?</h3></div><div className="form-field"><label htmlFor="draw-question">질문 메모 <span className="quiet-label">선택</span></label><input id="draw-question" maxLength={300} placeholder="예: 새로운 일을 시작할 때 무엇을 살펴볼까?" value={question} onChange={e => setQuestion(e.target.value)} /></div><p className="form-note">질문은 기록용입니다. 해설은 선택한 주제와 카드에 따라 제공하며, 입력한 문장을 자동 분석하지 않아요.</p></>}
              <div className="field-label"><span>03</span><h3>조금 더 들여다보고 싶은 주제</h3></div><div className="topic-options" role="group" aria-label="관심 주제">{TOPICS.map(t => <button type="button" data-selected={topic === t.id} aria-pressed={topic === t.id} key={t.id} onClick={() => setTopic(t.id)}>{t.label}</button>)}</div>
              {error && <p className="notice" role="alert">{error}</p>}
              <button className="primary-button start-button" type="submit">{kind === "draw" ? "카드 섞고 뽑기" : "나의 카드 확인하기"} <ArrowRight size={19} /></button><p className="form-note">입력한 생일은 서버로 전송하지 않아요.</p>
            </div>
            <aside className="setup-aside"><span className="small-stars" aria-hidden="true">✦</span><p className="eyebrow">A VOICE FOR YOU</p><blockquote className="aside-quote">“{selectedPersona.quote}”</blockquote><p className="aside-author">— {selectedPersona.name}</p><ol className="process-list"><li><span className="step-number">1</span><div><strong>{kind === "draw" ? "카드 세 장 선택" : "생일로 카드 계산"}</strong><p>{kind === "draw" ? "78장을 섞어 펼친 12장 중 3장을 골라요." : "연도와 생일을 더해 메이저 카드를 찾아요."}</p></div></li><li><span className="step-number">2</span><div><strong>해설자 선택</strong><p>네 가지 해설자 중 편안한 말투를 골라요.</p></div></li><li><span className="step-number">3</span><div><strong>추가 해설과 기록</strong><p>추가 질문과 나만의 메모로 이야기를 이어가요.</p></div></li></ol><p className="reading-method">정해진 카드 해설을 바탕으로 읽어요.<br />AI 자유 대화 기능은 사용하지 않습니다.</p></aside>
          </form>
        </section>
      </>}

      {view === "draw" && <section className="draw-stage"><button className="back-button" onClick={goHome}><ArrowLeft size={16} /> 주제 선택으로</button><div className="draw-header"><p className="eyebrow">PICK THREE CARDS</p><h1 ref={pageHeadingRef} tabIndex={-1}>카드 3장을 골라주세요.</h1><p>선택한 순서대로 현재 상황 · 살펴볼 점 · 실천할 조언을 읽습니다.</p></div><div className="draw-progress" aria-live="polite">{picked.length} / 3장 선택</div><div className="card-spread" role="group" aria-label="섞인 타로 카드 12장">{candidates.map((c, i) => <button className="deck-card" key={c.card.id} data-picked={picked.includes(i)} aria-label={`카드 ${i + 1}${picked.includes(i) ? ` · ${picked.indexOf(i) + 1}번째 선택됨` : " 선택"}`} disabled={picked.includes(i) || picked.length === 3} onClick={() => setPicked(previous => previous.length < 3 && !previous.includes(i) ? [...previous, i] : previous)}><CardBack />{picked.includes(i) && <span className="picked-number">{picked.indexOf(i) + 1}</span>}</button>)}</div><div className="draw-controls"><button className="secondary-button" onClick={() => { setCandidates(drawCards(12)); setPicked([]); }}>다시 섞기</button><button className="primary-button" disabled={picked.length !== 3} onClick={finishDraw}>선택한 카드 해설 보기 <ArrowRight size={17} /></button></div><p className="form-note">전체 78장 중 중복 없이 12장을 펼칩니다. 카드 뽑기에서는 정방향과 역방향을 함께 사용합니다.</p></section>}

      {view === "reveal" && session && <section className="reveal-stage"><button className="back-button" onClick={goHome}><ArrowLeft size={16} /> 입력으로 돌아가기</button><p className="eyebrow">A MOMENT JUST FOR YOU</p><h1 ref={pageHeadingRef} tabIndex={-1}>계산이 완료됐어요.</h1><p className="reveal-copy">카드를 눌러 결과를 확인하세요.</p><button className="reveal-card" onClick={() => setView("result")} aria-label="계산된 타로 카드 펼치기"><CardBack /></button><p className="quiet-label">{session.kind === "decade" ? `${session.calculations[0].year}년부터 10년의 카드 흐름` : session.kind === "personality" ? "생일에서 찾은 나의 성격 카드" : `${session.calculations[0].year}년, 나의 세운 카드`}</p><button className="text-button" onClick={() => setView("result")}>카드 펼치기 <ArrowRight size={17} /></button></section>}

      {view === "result" && session && resultCard && reading && <section className="reading-stage">
        <div className="reading-topbar"><button className="back-button" onClick={goHome}><ArrowLeft size={16} /> 새로운 리딩</button><span className="quiet-label">{KINDS.find(k => k.id === session.kind)?.name}{session.kind === "draw" ? ` · ${isReversed ? "역방향" : "정방향"}` : ""}</span></div>
        <div className="result-top"><p className="eyebrow">YOUR PERSONAL READING</p><h1 ref={pageHeadingRef} tabIndex={-1}>{session.kind === "draw" ? "선택한 세 장의 카드" : session.kind === "personality" ? "나의 성격 카드" : session.kind === "decade" ? "10년간의 세운 카드" : `${calculation!.year}년의 세운 카드`}</h1><p>{session.kind === "decade" ? "각 연도의 카드를 눌러 해설을 읽어보세요. 동일한 세운 공식으로 계산한 10년의 흐름입니다." : session.kind === "draw" ? "현재 상황, 살펴볼 점, 실천할 조언 순서로 읽습니다." : "계산 결과와 카드의 상징을 확인해 보세요."}</p></div>
        {session.kind === "decade" && <div className="year-timeline" role="group" aria-label="10년 세운 카드 선택">{session.calculations.map((c, i) => { const card = deck.find(d => d.id === c.cardId)!; return <button key={c.year} className="year-card" data-selected={i === selectedYear} aria-pressed={i === selectedYear} onClick={() => setSelectedYear(i)}><strong>{c.year}</strong><img src={card.image} alt="" /><span>{card.name}</span></button>; })}</div>}
        {session.kind === "draw" && <><div className="year-timeline drawn-timeline" role="group" aria-label="뽑은 카드 선택">{session.drawnCards!.map((d, i) => { const card = deck.find(c => c.id === d.cardId)!; return <button className="year-card" key={d.cardId} data-selected={selectedYear === i} aria-pressed={selectedYear === i} onClick={() => setSelectedYear(i)}><strong>{getPositions("draw", currentYear)[i]}</strong><img src={card.image} alt="" style={{ transform: d.reversed ? "rotate(180deg)" : undefined }} /><span>{card.name} · {d.reversed ? "역방향" : "정방향"}</span></button>; })}</div>{session.question && <p className="question-note"><strong>질문 메모</strong> {session.question}</p>}</>}<div className="result-layout"><div className="result-art"><button className="result-card-button" onClick={() => setDetail(resultCard)} aria-label={`${resultCard.name} 카드 자세히 보기`}><img className="result-card-image" style={{ transform: isReversed ? "rotate(180deg)" : undefined }} src={resultCard.image} alt={`${resultCard.name} · ${resultCard.nameEn}`} /></button><p className="quiet-label">{String(resultCard.number).padStart(2, "0")} · {resultCard.nameEn.toUpperCase()}</p><div className="keyword-list">{resultCard.keywords.map(word => <span key={word}>{word}</span>)}</div></div>
          <div className="result-copy"><p className="result-label">{session.kind === "draw" ? `${getPositions("draw", currentYear)[selectedYear]} · ${isReversed ? "역방향" : "정방향"}` : session.kind === "personality" ? "나의 성격 카드" : `${calculation!.year}년의 카드`}</p><h2 className="result-title">{resultCard.name}<span>{resultCard.nameEn}</span></h2><div className="result-tabs" role="group" aria-label="결과 해설자 선택">{PERSONAS.map(p => <button aria-pressed={session.persona === p.id} data-selected={session.persona === p.id} key={p.id} onClick={() => changeSessionPersona(p.id)}><p.icon size={15} />{p.name}</button>)}</div><p className="reading-text">{reading.text}</p><div className="detail-section"><h3 className="detail-heading"><Sparkles size={16} /> {TOPICS.find(t => t.id === session.topic)?.label}에 비추어 보면</h3><p className="reading-text">{getTopicReading(resultCard, isReversed, session.persona, session.topic, session.kind === "draw")}</p></div><div className="detail-section"><h3 className="detail-heading"><Sun size={16} /> 일상에 가져갈 작은 힌트</h3><p className="reading-text">{reading.advice}</p></div></div></div>
        {calculation && session.kind !== "draw" && <div className="calculation-strip"><span>나의 카드가 나온 과정</span><div className="calculation-steps"><strong>{session.kind === "decade" ? session.formula.replace(/^\d+/, String(calculation.year)) : session.formula}</strong><span>=</span>{calculation.steps.map((step, i) => <span key={i}>{i > 0 && <span className="calc-arrow">→</span>}<b>{step}</b></span>)}<span>→</span><strong>{resultCard.name}</strong></div><small>첫 합계의 자릿수를 더하고, 22 이상이면 다시 더해요. 22는 2 + 2 = 4로 계산합니다.</small></div>}
        <section className="followup-section"><div className="section-heading"><div><p className="eyebrow">A LITTLE DEEPER</p><h2>이야기를 조금 더 이어볼까요?</h2></div><p>궁금한 질문을 골라보세요.</p></div><div className="followup-options" role="group" aria-label="추가 해설 질문">{FOLLOWUPS.map(q => <button key={q.id} aria-pressed={followup === q.id} data-selected={followup === q.id} onClick={() => setFollowup(q.id)}>{q.label}<ArrowUpRight size={16} /></button>)}</div><div className="followup-answer" aria-live="polite"><span className="small-stars" aria-hidden="true">✧</span><p>{getFollowUp(resultCard, isReversed, session.persona, followup, session.kind === "draw")}</p></div><p className="form-note">선택한 질문에 맞춘 카드별 해설입니다. 자유 입력 질문을 이해하거나 새 답변을 생성하지는 않아요.</p></section>
        <section className="journal-section"><div className="form-field"><label htmlFor="reading-note">오늘의 나에게 남기는 한 줄 <span className="quiet-label">선택</span></label><textarea id="reading-note" maxLength={1500} rows={3} placeholder="와닿았던 말, 지금 느끼는 마음을 자유롭게 적어보세요." value={session.note} onChange={e => setSession({ ...session, note: e.target.value })} /></div><div className="save-row"><p className="form-note">메모는 해설에 반영되지 않아요.<br />저장하면 이 브라우저에만 기록이 남습니다. 최대 30개.</p><button className="primary-button" onClick={saveReading}><Bookmark size={17} /> {history.some(h => h.id === session.id) ? "기록 업데이트" : "나의 기록에 저장"}</button></div></section>
      </section>}

      {view === "library" && <section className="library-stage"><div className="subpage-header"><p className="eyebrow">THE CARD LIBRARY</p><h1 ref={pageHeadingRef} tabIndex={-1}>78장, 78개의 이야기.</h1><p>웨이트 카드의 상징과 정·역방향 해설을 천천히 살펴보세요.</p></div><div className="library-toolbar"><div className="search-field"><Search size={18} /><input aria-label="카드 이름 또는 키워드 검색" placeholder="카드 이름이나 키워드 검색" value={search} onChange={e => setSearch(e.target.value)} />{search && <button aria-label="검색어 지우기" onClick={() => setSearch("")}><X size={15} /></button>}</div><div className="filter-options" role="group" aria-label="카드 분류">{SUITS.map(s => <button key={s.id} data-selected={suit === s.id} aria-pressed={suit === s.id} onClick={() => setSuit(s.id)}>{s.label}</button>)}</div></div><p className="quiet-label" aria-live="polite">{libraryCards.length}장의 카드</p><div className="card-grid">{libraryCards.map(card => <button className="library-card" key={card.id} onClick={() => setDetail(card)}><img src={card.image} alt={`${card.name} 카드`} loading="lazy" /><h3>{card.name}</h3><p>{card.nameEn}</p></button>)}</div>{libraryCards.length === 0 && <div className="empty-state"><Search size={28} /><h2>찾는 카드가 없어요.</h2><p>다른 이름이나 키워드로 다시 검색해 보세요.</p><button className="secondary-button" onClick={() => { setSearch(""); setSuit("all"); }}>전체 카드 보기</button></div>}</section>}

      {view === "history" && <section className="history-stage"><div className="subpage-header"><p className="eyebrow">MY LITTLE JOURNAL</p><h1 ref={pageHeadingRef} tabIndex={-1}>그날의 카드, 그날의 마음.</h1><p>이 브라우저에 저장한 나만의 리딩 기록입니다.</p></div>{history.length === 0 ? <div className="empty-state"><History size={34} strokeWidth={1.2} /><h2>아직 기록이 없어요.</h2><p>리딩을 마친 뒤, 마음에 남은 이야기를 저장해 보세요.</p><button className="primary-button" onClick={goHome}>나의 카드 만나기 <ArrowRight size={17} /></button></div> : <div className="history-list">{history.map(record => <article className="history-item" key={record.id}><div className="history-images">{sessionCards(record).slice(0, 3).map((c, i) => <img src={deck.find(d => d.id === c.cardId)!.image} alt="" key={i} style={{ transform: c.reversed ? "rotate(180deg)" : undefined }} />)}</div><div className="history-copy"><p className="eyebrow">{KINDS.find(k => k.id === record.kind)?.name} · {new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeZone: "Asia/Seoul" }).format(new Date(record.createdAt))}</p><h2>{record.kind === "draw" ? "3장 카드 리딩" : record.kind === "decade" ? `${record.calculations[0].year}–${record.calculations[9].year}년의 흐름` : deck.find(d => d.id === record.calculations[0].cardId)?.name}</h2><p>{record.note || `${PERSONAS.find(p => p.id === record.persona)?.name}와 함께한 리딩`}</p></div><div className="history-actions"><button className="secondary-button" onClick={() => openHistory(record)}>다시 읽기 <ArrowUpRight size={15} /></button><button className="text-button" onClick={() => removeReading(record.id)} aria-label={`${new Date(record.createdAt).toLocaleDateString("ko-KR")} ${KINDS.find(k => k.id === record.kind)?.name} 기록 삭제`}><Trash2 size={15} /> 삭제</button></div></article>)}</div>}</section>}
    </main>

    <footer className="site-footer"><div className="footer-inner"><div><span className="footer-brand">✳ TARO TEST</span><p>미래를 단정하기보다, 나를 이해하는 작은 시간.</p></div><div><p>카드 해설은 자기 성찰과 즐거움을 위한 이야기입니다.<br />상담사 말투는 실제 심리 상담이나 진단을 제공하지 않습니다.</p><a href="/cards/sources.json" target="_blank" rel="noreferrer">Rider–Waite–Smith · Pamela Colman Smith <ArrowUpRight size={12} /></a></div></div></footer>
    {toast && <div className="toast" role="status"><Check size={16} />{toast}</div>}
    <dialog ref={dialogRef} aria-labelledby="card-detail-title" className="card-dialog" onCancel={() => setDetail(null)} onClose={() => setDetail(null)} onClick={e => { if (e.target === e.currentTarget) closeDialog(); }}>{detail && <div className="dialog-inner"><button className="dialog-close" aria-label="카드 상세 닫기" onClick={closeDialog}><X size={22} /></button><div className="dialog-grid"><img src={detail.image} alt={`${detail.name}${view === "library" || session?.kind === "draw" ? ` ${reverse ? "역방향" : "정방향"}` : ""}`} style={{ transform: reverse ? "rotate(180deg)" : undefined }} /><div className="dialog-copy"><p className="eyebrow">{detail.arcana === "major" ? "MAJOR ARCANA" : "MINOR ARCANA"} · {detail.number}</p><h2 id="card-detail-title">{detail.name}</h2><p className="quiet-label">{detail.nameEn}</p><div className="keyword-list">{detail.keywords.map(k => <span key={k}>{k}</span>)}</div>{(view === "library" || session?.kind === "draw") && <div className="result-tabs" role="group" aria-label="카드 방향"><button aria-pressed={!reverse} data-selected={!reverse} onClick={() => setReverse(false)}>정방향</button><button aria-pressed={reverse} data-selected={reverse} onClick={() => setReverse(true)}>역방향</button></div>}<p className="reading-text">{reverse ? detail.reversed : detail.upright}</p><h3 className="detail-heading">일상 속 작은 실천</h3><p className="reading-text">{reverse ? detail.reversedAdvice : detail.advice}</p><p className="dialog-reflection">{detail.reflection}</p></div></div></div>}</dialog>
  </>;
}
