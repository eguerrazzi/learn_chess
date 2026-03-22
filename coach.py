"""
coach.py — Coach Report e Suggerimenti Didattici post-partita.

Due modalità:
  - 'rule_based' (default): genera report testuale da dati dell'analisi
  - 'llm': invia dati a Ollama locale, con fallback a rule_based

Configurazione via variabile d'ambiente COACH_MODE ('rule_based' | 'llm')
e OLLAMA_MODEL (default: 'llama3.1:8b').
"""

import os
import json
import requests

COACH_MODE = os.environ.get('COACH_MODE', 'rule_based')
OLLAMA_URL = os.environ.get('OLLAMA_URL', 'http://localhost:11434')
OLLAMA_MODEL = os.environ.get('OLLAMA_MODEL', 'llama3.1:8b')

# ═══════════════════════════════════════════════════════════════════
# TUTORIAL SUGGESTION MAPPINGS
# ═══════════════════════════════════════════════════════════════════

# Mapping da pattern di errore a lezione del tutorial
TUTORIAL_MAP = [
    {
        'condition': lambda cm, results: any(
            r.get('classification') in ('blunder', 'mistake') and r.get('ply', 99) <= 10
            for r in results if r.get('is_user')
        ),
        'lesson_id': 'pawn',
        'title': 'Il Pedone',
        'reason': "Hai commesso errori nelle prime mosse. Ripassare il movimento dei pedoni ti aiuterà a gestire meglio l'apertura.",
    },
    {
        'condition': lambda cm, results: any(
            'x' in (r.get('move_san', '') or '') and r.get('classification') in ('blunder', 'mistake')
            for r in results if r.get('is_user')
        ),
        'lesson_id': 'knight',
        'title': 'Il Cavallo',
        'reason': 'Hai perso materiale in alcune catture. Ripassare come si muovono i pezzi ti aiuterà a difenderli meglio.',
    },
    {
        'condition': lambda cm, results: any(
            r.get('cp_loss', 0) >= 200 for r in results
            if r.get('is_user') and r.get('ply', 99) > 20
        ),
        'lesson_id': 'king',
        'title': 'Il Re',
        'reason': 'Hai commesso sviste gravi nel mediogioco/finale. Conoscere bene il re è fondamentale per la sicurezza.',
    },
    {
        'condition': lambda cm, results: not any(
            'O-O' in (r.get('move_san', '') or '') for r in results if r.get('is_user')
        ),
        'lesson_id': 'castling',
        'title': 'Arrocco',
        'reason': 'Non hai arroccato in questa partita. L\'arrocco è fondamentale per la sicurezza del re!',
    },
    {
        'condition': lambda cm, results: any(
            r.get('classification') == 'blunder' for r in results if r.get('is_user')
        ),
        'lesson_id': 'check',
        'title': 'Scacco e Scaccomatto',
        'reason': 'Alcune mosse hanno lasciato pezzi indifesi. Ripassare lo scacco ti aiuterà a vedere le minacce.',
    },
]


def suggest_tutorials(critical_moments, results):
    """Suggerisce 1-3 lezioni del tutorial basate sui pattern di errore.

    Returns list of dicts: [{lesson_id, title, reason}]
    """
    suggestions = []
    seen = set()
    for mapping in TUTORIAL_MAP:
        if len(suggestions) >= 3:
            break
        if mapping['lesson_id'] in seen:
            continue
        try:
            if mapping['condition'](critical_moments, results):
                suggestions.append({
                    'lesson_id': mapping['lesson_id'],
                    'title': mapping['title'],
                    'reason': mapping['reason'],
                })
                seen.add(mapping['lesson_id'])
        except Exception:
            continue
    return suggestions


# ═══════════════════════════════════════════════════════════════════
# COACH REPORT — RULE-BASED
# ═══════════════════════════════════════════════════════════════════

def _accuracy_judgment(acc):
    if acc >= 90:
        return 'eccellente'
    elif acc >= 75:
        return 'buona'
    elif acc >= 60:
        return 'discreta'
    elif acc >= 40:
        return 'da migliorare'
    return 'bassa'


def _phase_summary(results):
    """Analizza errori per fase di gioco."""
    phases = {'opening': [], 'middlegame': [], 'endgame': []}
    for r in results:
        if not r.get('is_user') or not r.get('classification'):
            continue
        ply = r.get('ply', 1)
        move_num = (ply + 1) // 2
        if move_num <= 10:
            phase = 'opening'
        elif move_num <= 30:
            phase = 'middlegame'
        else:
            phase = 'endgame'
        if r['classification'] in ('inaccuracy', 'mistake', 'blunder'):
            phases[phase].append(r)
    return phases


def _generate_rule_based(data):
    """Genera report rule-based in italiano."""
    summary = data.get('summary') or {}
    summary_white = data.get('summary_white')
    summary_black = data.get('summary_black')
    critical = data.get('critical_moments') or []
    game_mode = data.get('game_mode', 'cpu')
    elo = data.get('elo_setting', 0)
    age = data.get('player_age', '')
    is_pvp = (game_mode == 'pvp')

    # Adapt tone based on age
    is_child = False
    try:
        if age and int(age) <= 12:
            is_child = True
    except (ValueError, TypeError):
        pass

    lines = []

    if is_child:
        lines.append('## 🎓 Rapporto dell\'Allenatore')
        lines.append('')
    else:
        lines.append('## 🎓 Rapporto dell\'Allenatore')
        lines.append('')

    # Accuracy section
    if is_pvp and summary_white and summary_black:
        acc_w = summary_white.get('accuracy', 0)
        acc_b = summary_black.get('accuracy', 0)
        lines.append(f'**Precisione Bianco**: {acc_w}% ({_accuracy_judgment(acc_w)})')
        lines.append(f'**Precisione Nero**: {acc_b}% ({_accuracy_judgment(acc_b)})')
        lines.append('')
    else:
        acc = summary.get('accuracy', 0)
        if is_child:
            lines.append(f'La tua precisione in questa partita è stata del **{acc}%** — {_accuracy_judgment(acc)}! 🎯')
        else:
            lines.append(f'**Precisione**: {acc}% ({_accuracy_judgment(acc)})')
        lines.append('')

    # ELO context (CPU only)
    if not is_pvp and elo:
        try:
            elo_val = int(elo)
            if elo_val <= 600:
                level = 'principiante'
            elif elo_val <= 1000:
                level = 'principiante avanzato'
            elif elo_val <= 1500:
                level = 'intermedio'
            else:
                level = 'avanzato'
            lines.append(f'Hai giocato contro il computer a livello **{level}** (ELO {elo_val}).')
            lines.append('')
        except (ValueError, TypeError):
            pass

    # Move classification summary
    best = summary.get('best', 0)
    excellent = summary.get('excellent', 0)
    good = summary.get('good', 0)
    inaccuracy = summary.get('inaccuracy', 0)
    mistake = summary.get('mistake', 0)
    blunder = summary.get('blunder', 0)
    total = summary.get('total_user_moves', 0)

    good_moves = best + excellent + good
    bad_moves = inaccuracy + mistake + blunder

    if total > 0:
        if is_child:
            lines.append(f'Su **{total}** mosse analizzate:')
            if good_moves > 0:
                lines.append(f'- ✅ **{good_moves}** mosse buone o ottime — bravo!')
            if bad_moves > 0:
                lines.append(f'- ⚠️ **{bad_moves}** mosse da migliorare')
            if blunder > 0:
                lines.append(f'- 💥 **{blunder}** sviste gravi — attenzione!')
        else:
            lines.append(f'Su **{total}** mosse: {good_moves} buone/ottime, {bad_moves} imprecise.')
            if blunder > 0:
                lines.append(f'Sviste gravi (blunder): **{blunder}**.')
        lines.append('')

    # Critical moments
    if critical:
        if is_child:
            lines.append('### 🔍 I momenti dove potevi fare meglio:')
        else:
            lines.append('### 🔍 Momenti critici:')
        lines.append('')
        for i, cm in enumerate(critical, 1):
            move_num = (cm.get('ply', 1) + 1) // 2
            side = 'Bianco' if cm.get('is_white') else 'Nero'
            played = cm.get('move_san', '?')
            best = cm.get('best_move_san', '?')
            cp = cm.get('cp_loss', 0)
            if is_child:
                lines.append(f'{i}. Alla mossa **{move_num}** ({side}), hai giocato **{played}** — sarebbe stato meglio **{best}** (hai perso {cp} punti)')
            else:
                lines.append(f'{i}. Mossa {move_num} ({side}): **{played}** → meglio **{best}** (−{cp} cp)')
        lines.append('')

    # Encouragement
    if is_child:
        if summary.get('accuracy', 0) >= 70:
            lines.append('🌟 **Ottimo lavoro!** Continua così e diventerai fortissimo!')
        elif summary.get('accuracy', 0) >= 40:
            lines.append('💪 **Bene!** Stai migliorando, continua a esercitarti!')
        else:
            lines.append('🎮 **Non mollare!** Ogni partita ti fa imparare qualcosa di nuovo!')
    else:
        if summary.get('accuracy', 0) >= 70:
            lines.append('Buona partita complessivamente. Continua a lavorare sui momenti critici.')
        elif summary.get('accuracy', 0) >= 40:
            lines.append('Partita nella media. Concentrati su evitare le sviste gravi per migliorare.')
        else:
            lines.append('Partita difficile. Ripassare le basi tattiche ti aiuterà molto.')

    return '\n'.join(lines)


# ═══════════════════════════════════════════════════════════════════
# COACH REPORT — LLM (OLLAMA)
# ═══════════════════════════════════════════════════════════════════

def _generate_llm(data):
    """Genera report via Ollama locale. Fallback a rule-based se non disponibile."""
    summary = data.get('summary') or {}
    critical = data.get('critical_moments') or []
    game_mode = data.get('game_mode', 'cpu')
    elo = data.get('elo_setting', 0)
    age = data.get('player_age', '')

    # Build prompt
    cm_text = ''
    for i, cm in enumerate(critical, 1):
        move_num = (cm.get('ply', 1) + 1) // 2
        cm_text += f"\n{i}. Mossa {move_num}: giocata {cm.get('move_san','?')}, " \
                   f"migliore era {cm.get('best_move_san','?')} " \
                   f"(persi {cm.get('cp_loss',0)} centipawn, {cm.get('classification','')})"

    age_note = ''
    if age:
        try:
            age_val = int(age)
            if age_val <= 8:
                age_note = 'Il giocatore è un bambino piccolo (sotto 8 anni). Usa un linguaggio molto semplice, incoraggiante e divertente.'
            elif age_val <= 14:
                age_note = 'Il giocatore è un ragazzo/a. Usa un tono amichevole e incoraggiante.'
            else:
                age_note = 'Il giocatore è un adulto. Puoi usare termini tecnici scacchistici.'
        except (ValueError, TypeError):
            pass

    prompt = f"""Sei un allenatore di scacchi esperto e gentile. Scrivi un breve rapporto (max 200 parole) IN ITALIANO sulla partita appena giocata.

Dati della partita:
- Modalità: {'1 vs 1' if game_mode == 'pvp' else f'vs Computer ELO {elo}'}
- Precisione: {summary.get('accuracy', 0)}%
- CP loss medio: {summary.get('avg_cp_loss', 0)}
- Mosse totali analizzate: {summary.get('total_user_moves', 0)}
- Mosse migliori: {summary.get('best', 0)}, ottime: {summary.get('excellent', 0)}, buone: {summary.get('good', 0)}
- Inesattezze: {summary.get('inaccuracy', 0)}, errori: {summary.get('mistake', 0)}, sviste: {summary.get('blunder', 0)}

Momenti critici:{cm_text if cm_text else ' Nessuno di grave.'}

{age_note}

Scrivi il rapporto con:
1. Valutazione generale della partita
2. Punti di forza
3. Cosa migliorare (basato sui momenti critici)
4. Un consiglio concreto per la prossima partita
5. Una frase motivazionale finale

Formatta con Markdown (titoli ##, grassetto **, elenchi -)."""

    try:
        resp = requests.post(
            f'{OLLAMA_URL}/api/generate',
            json={
                'model': OLLAMA_MODEL,
                'prompt': prompt,
                'stream': False,
                'options': {'temperature': 0.7, 'num_predict': 500}
            },
            timeout=120
        )
        if resp.status_code == 200:
            result = resp.json()
            return result.get('response', '').strip()
    except (requests.ConnectionError, requests.Timeout, requests.RequestException):
        pass

    # Fallback to rule-based
    return _generate_rule_based(data)


# ═══════════════════════════════════════════════════════════════════
# PUBLIC API
# ═══════════════════════════════════════════════════════════════════

def generate_llm_report(data):
    """Genera il report via LLM (Ollama) direttamente, senza fallback rule-based.
    Usato dall'endpoint on-demand /api/analysis/<id>/llm_report."""
    return _generate_llm(data)


def generate_coach_report(data, mode=None):
    """Genera il report dell'allenatore.

    Args:
        data: dict con summary, critical_moments, game_mode, elo_setting, player_age, ecc.
        mode: 'rule_based' | 'llm' | None (usa COACH_MODE env var se None)

    Returns:
        str: report in Markdown
    """
    effective_mode = mode if mode is not None else COACH_MODE
    if effective_mode == 'llm':
        return _generate_llm(data)
    return _generate_rule_based(data)
