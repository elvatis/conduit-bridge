export const INSIGHT_KINDS = ['finding', 'decision', 'lesson', 'action'] as const;
export type InsightKind = typeof INSIGHT_KINDS[number];
export interface InsightCandidate { kind: InsightKind; quote: string; start: number; end: number }
const sentences = new Intl.Segmenter('en', { granularity: 'sentence' });

// These are conservative evidence gates, not a general-purpose semantic classifier.
// Unknown, quoted, hypothetical and incomplete statements are omitted. In particular,
// a small model cannot turn a question or a proposed choice into a recorded decision.
function statementKind(quote: string, role: string): InsightKind | undefined {
  const text = quote.replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/, '').replace(/\*\*|__/g, '').trim();
  if (text.length < 12 || !/\p{L}+[\s,:]+\p{L}+/u.test(text)) return;
  if (/^(?:[>"“„]|example\b|for example\b|e\.g\.|beispiel\b|zum beispiel\b|angenommen\b|suppose\b|if\b|wenn\b|falls\b)/i.test(text)) return;
  if (/\b(?:codeword|test\s*(?:token|keyword)|testkennwort|testwort|kennwort|nonce)\b/i.test(text)
    && /\b(?:remember|recall|repeat|reply|answer|respond|say|return|what|which|previous|merke|erinnere|wiederhole|antworte|welche[rs]?|vorherigen?)\b/i.test(text)) return;
  if (/\b(?:reply|answer|respond|say|repeat|return|output|antworte|wiederhole|gib)\b.{0,45}\b(?:exactly|only|just|nothing else|single word|exakt|genau|nur|ausschließlich)\b/i.test(text)) return;
  // Do not interpret an embedded prompt or fabricated quotation as the speaker's choice.
  if (/\b(?:classify|label|categorize|ignore (?:all|previous)|klassifiziere|ignoriere (?:alle|vorherige))\b/i.test(text)) return;

  const request = /^(?:(?:can|could|would|will) you\b|(?:kannst|könntest|würdest|würden|können) (?:du|sie)\b|please\b|bitte\b)/i.test(text);
  if (text.includes('?')) return request ? 'action' : undefined;
  if (request) return 'action';
  if (/^(?:who|what|which|when|where|why|how|should|is|are|does|did|wer|was|welche[rs]?|wann|wo|warum|wie|sollen|sollten)\b/i.test(text)) return;
  // Negating the act of deciding is different from deciding against an option.
  if (/\b(?:(?:not|never|no longer) (?:yet )?(?:decided|agreed|chosen|selected|approved)|(?:haven't|hasn't|didn't|don't) (?:yet )?(?:decide|agree|choose|select|approve)|(?:noch )?(?:nicht|nie) (?:[\p{L}\p{N}_]+\s+){0,4}(?:entschieden|beschlossen|vereinbart|gewählt|freigegeben))\b/iu.test(text)) return;
  const uncertain = /\b(?:could|might|maybe|perhaps|would|possibly|should|will have|könnten?|würden?|vielleicht|eventuell|möglicherweise|sollten?|suggest|recommend|propose|empfehle|vorschlag)\b/i;
  const decision = text.match(/\b(?:we|i|the team|the user) (?:have |has )?(?:decided|agreed|chosen|selected|approved)\b/i)
    || text.match(/\b(?:wir|ich|das team) (?:haben?|hat)\b.{0,160}\b(?:entschieden|beschlossen|vereinbart|gewählt|freigegeben)\b/i)
    || text.match(/\b(?:was|were|wurde|wurden)\b.{0,90}\b(?:approved|selected|agreed|beschlossen|vereinbart|freigegeben)\b/i);
  // A possible future benefit does not undo an explicit choice already recorded.
  if (decision && !uncertain.test(text.slice(0, (decision.index || 0) + decision[0].length))
    && !/\b(?:ask(?:ed|s)?|question(?:ed)?|whether|if|fragt?|fragte|gefragt|ob)\b/i.test(text.slice(0, decision.index))) return 'decision';
  if (uncertain.test(text)) return;

  if (/^(?:lesson(?: learned)?|learning|takeaway|lessons learned|lernerfahrung|erkenntnis|faustregel)\s*:/i.test(text)
    || /\b(?:a (?:repeated |general )?lesson is|we learned (?:that|to)|wir haben gelernt|für künftige|für zukünftige|in zukunft (?:immer|stets))\b/i.test(text)
    || /^(?:(?:always|never) (?:check|verify|run|test|publish|deploy|store|validate|use|keep)|remember to|best practice(?: is|:)|(?:immer|niemals|grundsätzlich) (?:prüfen|testen|veröffentlichen|speichern|validieren))\b/i.test(text)) return 'lesson';
  if (/^(?:decision|beschluss|entscheidung)\s*:/i.test(text)) {
    return /\b(?:pending|undecided|open|not yet|not made|not taken|ausstehend|offen|noch nicht|unentschieden|please|bitte)\b/i.test(text) ? undefined : 'decision';
  }

  if (/^(?:todo|to do|next (?:step|task)|action(?: item)?|aufgabe|nächster schritt|noch offen)\s*:/i.test(text)
    || /\b(?:still (?:pending|open|needed)|remains? (?:open|pending)|next task is|needs? to be|must (?:be|add|fix|run)|noch (?:offen|ausstehend)|steht noch aus|muss noch|müssen noch)\b/i.test(text)
    || /^(?:i will|i'll|we will|we'll|ich werde|wir werden)\b/i.test(text)) return 'action';
  if (/^(?:(?:the|der|die|das) )?(?:test|tests|build|check|run|review|deployment|release|prüfung|prüfungslauf|neustarttest)\b.{0,80}\b(?:passed|failed|succeeded|completed|finished|bestanden|fehlgeschlagen|abgeschlossen|erfolgreich)\b/i.test(text)) return 'finding';
  if (/^(?:do not |don't |nicht )?(?:add|fix|implement|create|remove|run|check|review|preserve|update|test|deploy|ergänze|behebe|erstelle|entferne|prüfe|prüfen|aktualisiere|teste|bewahre|implementiere)\b/i.test(text)) return 'action';
  // Assistant suggestions and prospective claims are neither observations nor decisions.
  if (/\b(?:recommend|suggest|propose|should|recommendation|empfehle|empfehlen|vorschlag|vorschlagen|sollten?|möchten?|plan to|planning to|intend to|will be)\b/i.test(text)) return;
  if (/\b(?:passed|failed|succeeded|completed|finished|verified|confirmed|observed|measured|found|returned|retained|caused|requires|contains|supports|fixed|resolved|implemented|added|removed|updated|created|deleted|wrote|written|saved|restarted|persisted|crashed|is missing|is unavailable|does not|did not|cannot|doesn't|didn't|can't)\b/i.test(text)
    || /\b(?:erfolgreich|fehlgeschlagen|bestanden|abgeschlossen|verifiziert|bestätigt|beobachtet|gemessen|gefunden|erhalten|verursacht|benötigt|enthält|unterstützt|fehlt|funktioniert|funktionieren|läuft|gestartet|erstellt|gespeichert|behoben|ergänzt|umgesetzt|aktualisiert|entfernt|gelöscht)\b/i.test(text)) return 'finding';
  // A user can make an explicit present-tense choice; an assistant's plan is only a task.
  if (role === 'user' && /^(?:we (?:choose|select|use)|i (?:choose|select)|wir (?:wählen|verwenden|nehmen)|ich wähle)\b/i.test(text)) return 'decision';
}

/** Keep whole sentences and their offsets; never classify a truncated suffix. */
export function insightCandidates(content: string, role: string): InsightCandidate[] {
  const candidates: InsightCandidate[] = []; let offset = 0, fence = '';
  for (const line of content.split(/(?<=\n)/)) {
    const marker = line.trimStart().match(/^(`{3,}|~{3,})/);
    if (marker) { if (!fence) fence = marker[1][0]; else if (marker[1][0] === fence) fence = ''; offset += line.length; continue; }
    if (!fence && !/^\s*(?:>|#|\||\[)/.test(line)) for (const part of sentences.segment(line)) {
      const quote = part.segment.trim();
      // At least two excerpts must fit in a selection request during reduction.
      if (!quote || quote.length > 480 || JSON.stringify(quote).length > 960) continue;
      const kind = statementKind(quote, role);
      if (kind) {
        const start = offset + part.index + part.segment.indexOf(quote);
        candidates.push({ kind, quote, start, end: start + quote.length });
      }
    }
    offset += line.length;
  }
  return candidates;
}
