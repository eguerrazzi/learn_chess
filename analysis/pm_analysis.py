"""
pm_analysis.py — Process Mining analysis for chess games using pm4py.

Provides functions for:
  1. Loading event logs from CSV
  2. Process discovery (DFG, opening sequences)
  3. Error pattern analysis (blunder/mistake distribution by phase)
  4. Correlations (ELO ↔ result, hint usage ↔ improvement)
  5. Game statistics summary

Can be used standalone (CLI) or imported by the Flask dashboard route.
"""

import os
import csv
import io
import base64
from collections import Counter, defaultdict

import pandas as pd
import pm4py
from pm4py.objects.log.util import dataframe_utils
from pm4py.algo.discovery.dfg import algorithm as dfg_discovery
from pm4py.visualization.dfg import visualizer as dfg_visualization
from pm4py.statistics.variants.log import get as variants_get
from pm4py.algo.discovery.heuristics import algorithm as heuristics_miner

LOGS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'logs')
MOVES_LOG = os.path.join(LOGS_DIR, 'moves_log.csv')
GAMES_LOG = os.path.join(LOGS_DIR, 'games_log.csv')
HINTS_LOG = os.path.join(LOGS_DIR, 'hints_log.csv')

# ── Phase boundaries (move numbers) ──────────────────────────────
OPENING_END = 10      # moves 1-10
MIDDLEGAME_END = 30   # moves 11-30
# Everything after 30 = endgame

# ── CP-loss thresholds (same as Phase 3) ─────────────────────────
THRESHOLDS = [
    (200, 'blunder'),
    (100, 'mistake'),
    (50,  'inaccuracy'),
    (25,  'good'),
    (10,  'excellent'),
    (0,   'best'),
]


def _classify_cp_loss(cp_loss):
    """Classify a centipawn loss value."""
    for threshold, label in THRESHOLDS:
        if cp_loss >= threshold:
            return label
    return 'best'


def _move_phase(move_number):
    """Return game phase for a given move number."""
    if move_number <= OPENING_END:
        return 'opening'
    elif move_number <= MIDDLEGAME_END:
        return 'middlegame'
    return 'endgame'


# ═══════════════════════════════════════════════════════════════════
# 1. LOADING
# ═══════════════════════════════════════════════════════════════════

def load_moves_df():
    """Load moves_log.csv into a pandas DataFrame."""
    if not os.path.exists(MOVES_LOG):
        return pd.DataFrame()
    df = pd.read_csv(MOVES_LOG, encoding='utf-8')
    if 'timestamp' in df.columns:
        df['timestamp'] = pd.to_datetime(df['timestamp'])
    return df


def load_games_df():
    """Load games_log.csv into a pandas DataFrame."""
    if not os.path.exists(GAMES_LOG):
        return pd.DataFrame()
    df = pd.read_csv(GAMES_LOG, encoding='utf-8')
    for col in ['start_time', 'end_time']:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors='coerce')
    return df


def load_hints_df():
    """Load hints_log.csv into a pandas DataFrame."""
    if not os.path.exists(HINTS_LOG):
        return pd.DataFrame()
    df = pd.read_csv(HINTS_LOG, encoding='utf-8')
    if 'timestamp' in df.columns:
        df['timestamp'] = pd.to_datetime(df['timestamp'])
    return df


def build_pm4py_log(moves_df):
    """Convert moves DataFrame to a pm4py-compatible event log DataFrame."""
    if moves_df.empty:
        return moves_df
    log_df = moves_df.rename(columns={
        'game_id':   'case:concept:name',
        'move_san':  'concept:name',
        'timestamp': 'time:timestamp',
        'player':    'org:resource',
    })
    log_df = dataframe_utils.convert_timestamp_columns_in_df(log_df)
    return log_df


# ═══════════════════════════════════════════════════════════════════
# 2. PROCESS DISCOVERY
# ═══════════════════════════════════════════════════════════════════

def get_opening_sequences(moves_df, max_moves=8, top_n=10):
    """Extract the most common opening sequences (first N moves).

    Returns a list of (sequence_string, count) tuples.
    """
    if moves_df.empty:
        return []
    openings = moves_df[moves_df['move_number'] <= max_moves]
    sequences = (
        openings
        .sort_values(['game_id', 'move_number'])
        .groupby('game_id')['move_san']
        .apply(lambda x: ' '.join(x))
    )
    return Counter(sequences).most_common(top_n)


def discover_dfg(moves_df, user_only=False):
    """Discover a Directly-Follows Graph from the event log.

    Args:
        moves_df: moves DataFrame
        user_only: if True, filter to user moves only

    Returns:
        (dfg, start_activities, end_activities) tuple for pm4py
    """
    df = moves_df.copy()
    if user_only and 'player' in df.columns:
        df = df[df['player'] == 'user']
    log_df = build_pm4py_log(df)
    if log_df.empty:
        return {}, {}, {}

    log = pm4py.convert_to_event_log(log_df)
    dfg = dfg_discovery.apply(log)
    sa = pm4py.get_start_activities(log)
    ea = pm4py.get_end_activities(log)
    return dfg, sa, ea


def discover_dfg_opening(moves_df, max_moves=8):
    """DFG limited to opening moves only."""
    if moves_df.empty:
        return {}, {}, {}
    opening_df = moves_df[moves_df['move_number'] <= max_moves]
    return discover_dfg(opening_df)


def dfg_to_base64_image(dfg, sa, ea):
    """Render DFG to a base64-encoded PNG image string."""
    if not dfg:
        return None
    try:
        gviz = dfg_visualization.apply(
            dfg, activities_count=sa,
            parameters={
                dfg_visualization.Variants.FREQUENCY.value.Parameters.START_ACTIVITIES: sa,
                dfg_visualization.Variants.FREQUENCY.value.Parameters.END_ACTIVITIES: ea,
                dfg_visualization.Variants.FREQUENCY.value.Parameters.FORMAT: 'png',
            }
        )
        # pm4py can save to a temp file; read it back
        import tempfile
        with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as tmp:
            tmp_path = tmp.name
        dfg_visualization.save(gviz, tmp_path)
        with open(tmp_path, 'rb') as f:
            img_bytes = f.read()
        os.unlink(tmp_path)
        return base64.b64encode(img_bytes).decode('ascii')
    except Exception:
        return None


def get_variants(moves_df, top_n=10):
    """Get top process variants (full move sequences per game).

    Returns list of (variant_tuple, count).
    """
    if moves_df.empty:
        return []
    log_df = build_pm4py_log(moves_df)
    log = pm4py.convert_to_event_log(log_df)
    variants = variants_get.get_variants(log)
    sorted_v = sorted(variants.items(), key=lambda x: len(x[1]), reverse=True)
    return [(k, len(v)) for k, v in sorted_v[:top_n]]


# ═══════════════════════════════════════════════════════════════════
# 3. ERROR PATTERN ANALYSIS
# ═══════════════════════════════════════════════════════════════════

def compute_cp_losses(moves_df):
    """Compute centipawn loss for each user move.

    Returns a new DataFrame with columns: game_id, move_number, move_san,
    cp_loss, classification, phase.
    """
    if moves_df.empty:
        return pd.DataFrame()
    user_moves = moves_df[moves_df['player'] == 'user'].copy()
    if user_moves.empty:
        return pd.DataFrame()

    def _safe_float(v):
        try:
            return float(v)
        except (ValueError, TypeError):
            return None

    user_moves['eval_before_f'] = user_moves['eval_before'].apply(_safe_float)
    user_moves['eval_after_f'] = user_moves['eval_after'].apply(_safe_float)
    user_moves = user_moves.dropna(subset=['eval_before_f', 'eval_after_f'])

    if user_moves.empty:
        return pd.DataFrame()

    user_moves['cp_loss'] = (user_moves['eval_before_f'] - user_moves['eval_after_f']).clip(lower=0)
    user_moves['classification'] = user_moves['cp_loss'].apply(_classify_cp_loss)
    user_moves['phase'] = user_moves['move_number'].astype(int).apply(_move_phase)

    return user_moves[['game_id', 'move_number', 'move_san', 'cp_loss',
                        'classification', 'phase', 'elo_setting']].copy()


def error_distribution_by_phase(cp_losses_df):
    """Count errors (inaccuracy/mistake/blunder) grouped by game phase.

    Returns dict: {phase: {classification: count}}
    """
    if cp_losses_df.empty:
        return {}
    errors = cp_losses_df[cp_losses_df['classification'].isin(
        ['inaccuracy', 'mistake', 'blunder']
    )]
    result = {}
    for phase in ['opening', 'middlegame', 'endgame']:
        phase_data = errors[errors['phase'] == phase]
        counts = phase_data['classification'].value_counts().to_dict()
        result[phase] = {
            'inaccuracy': counts.get('inaccuracy', 0),
            'mistake': counts.get('mistake', 0),
            'blunder': counts.get('blunder', 0),
            'total': len(phase_data),
        }
    return result


def worst_moves(cp_losses_df, top_n=10):
    """Return the N moves with highest centipawn loss.

    Returns list of dicts with game_id, move_number, move_san, cp_loss, phase.
    """
    if cp_losses_df.empty:
        return []
    top = cp_losses_df.nlargest(top_n, 'cp_loss')
    return top[['game_id', 'move_number', 'move_san', 'cp_loss', 'phase']].to_dict('records')


def error_rate_by_elo(cp_losses_df):
    """Error rate (blunder+mistake per move) grouped by ELO setting.

    Returns dict: {elo: {'total_moves': N, 'errors': N, 'error_rate': float}}
    """
    if cp_losses_df.empty:
        return {}
    result = {}
    for elo, group in cp_losses_df.groupby('elo_setting'):
        errors = group[group['classification'].isin(['mistake', 'blunder'])]
        total = len(group)
        result[int(elo)] = {
            'total_moves': total,
            'errors': len(errors),
            'error_rate': round(len(errors) / total, 4) if total > 0 else 0,
        }
    return dict(sorted(result.items()))


# ═══════════════════════════════════════════════════════════════════
# 4. CORRELATIONS
# ═══════════════════════════════════════════════════════════════════

def elo_vs_result(games_df):
    """Win/draw/loss rates by ELO setting.

    Returns dict: {elo: {'win': N, 'loss': N, 'draw': N, 'total': N, 'win_rate': float}}
    """
    if games_df.empty:
        return {}
    # Only games with a result
    finished = games_df[games_df['result'].notna() & (games_df['result'] != '')]
    result = {}
    for elo, group in finished.groupby('elo_setting'):
        counts = group['result'].value_counts().to_dict()
        total = len(group)
        wins = counts.get('win', 0)
        result[int(elo)] = {
            'win': wins,
            'loss': counts.get('loss', 0),
            'draw': counts.get('draw', 0),
            'resign': counts.get('resign', 0),
            'total': total,
            'win_rate': round(wins / total, 4) if total > 0 else 0,
        }
    return dict(sorted(result.items()))


def hint_usage_analysis(games_df, hints_df, moves_df):
    """Compare performance of games with vs. without hints.

    Returns dict with 'with_hints' and 'without_hints' stats.
    """
    if games_df.empty:
        return {}
    finished = games_df[games_df['result'].notna() & (games_df['result'] != '')]
    if finished.empty:
        return {}

    hint_game_ids = set()
    if not hints_df.empty:
        hint_game_ids = set(hints_df['game_id'].unique())

    def _stats_for_group(gdf):
        total = len(gdf)
        if total == 0:
            return {'games': 0, 'win_rate': 0, 'avg_moves': 0}
        wins = len(gdf[gdf['result'] == 'win'])
        avg_moves = gdf['total_moves'].astype(float).mean()
        return {
            'games': total,
            'win_rate': round(wins / total, 4),
            'avg_moves': round(float(avg_moves), 1),
        }

    with_hints = finished[finished['game_id'].isin(hint_game_ids)]
    without_hints = finished[~finished['game_id'].isin(hint_game_ids)]

    result = {
        'with_hints': _stats_for_group(with_hints),
        'without_hints': _stats_for_group(without_hints),
    }

    # Hint count per game
    if not hints_df.empty:
        hint_counts = hints_df.groupby('game_id').size()
        result['avg_hints_per_game'] = round(float(hint_counts.mean()), 1)
        result['max_hints_in_game'] = int(hint_counts.max())
    return result


# ═══════════════════════════════════════════════════════════════════
# 5. SUMMARY STATISTICS
# ═══════════════════════════════════════════════════════════════════

def summary_stats(games_df, moves_df, hints_df):
    """General dashboard summary statistics."""
    stats = {
        'total_games': 0,
        'completed_games': 0,
        'total_moves': 0,
        'total_hints': 0,
        'avg_moves_per_game': 0,
        'unique_elos': [],
        'results_distribution': {},
    }
    if not games_df.empty:
        stats['total_games'] = len(games_df)
        finished = games_df[games_df['result'].notna() & (games_df['result'] != '')]
        stats['completed_games'] = len(finished)
        if not finished.empty:
            stats['avg_moves_per_game'] = round(
                float(finished['total_moves'].astype(float).mean()), 1
            )
            stats['results_distribution'] = finished['result'].value_counts().to_dict()
        stats['unique_elos'] = sorted(games_df['elo_setting'].dropna().unique().tolist())

    if not moves_df.empty:
        stats['total_moves'] = len(moves_df)

    if not hints_df.empty:
        stats['total_hints'] = len(hints_df)

    return stats


# ═══════════════════════════════════════════════════════════════════
# 6. FULL DASHBOARD DATA (called by Flask route)
# ═══════════════════════════════════════════════════════════════════

def get_dashboard_data():
    """Compute all analyses and return a dict ready for JSON/template."""
    moves_df = load_moves_df()
    games_df = load_games_df()
    hints_df = load_hints_df()

    cp_losses = compute_cp_losses(moves_df)

    data = {
        'summary': summary_stats(games_df, moves_df, hints_df),
        'opening_sequences': get_opening_sequences(moves_df),
        'error_by_phase': error_distribution_by_phase(cp_losses),
        'worst_moves': worst_moves(cp_losses),
        'error_rate_by_elo': error_rate_by_elo(cp_losses),
        'elo_vs_result': elo_vs_result(games_df),
        'hint_analysis': hint_usage_analysis(games_df, hints_df, moves_df),
    }

    # DFG image (opening moves)
    dfg, sa, ea = discover_dfg_opening(moves_df)
    data['dfg_opening_img'] = dfg_to_base64_image(dfg, sa, ea)

    return data


# ═══════════════════════════════════════════════════════════════════
# CLI
# ═══════════════════════════════════════════════════════════════════

if __name__ == '__main__':
    import json

    data = get_dashboard_data()
    # Remove image from CLI output (too large)
    data.pop('dfg_opening_img', None)
    print(json.dumps(data, indent=2, default=str))
