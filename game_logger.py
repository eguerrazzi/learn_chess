"""
game_logger.py — Logging module for chess games.
Writes move-level and game-level data to CSV files in the logs/ directory.
See PLAN.md, Phase 1.
"""

import csv
import os
from datetime import datetime, timezone

LOGS_DIR = os.path.join(os.path.dirname(__file__), 'logs')
MOVES_LOG = os.path.join(LOGS_DIR, 'moves_log.csv')
GAMES_LOG = os.path.join(LOGS_DIR, 'games_log.csv')

MOVES_HEADERS = [
    'game_id', 'move_number', 'timestamp', 'player', 'move_san', 'move_uci',
    'fen_before', 'fen_after', 'eval_before', 'eval_after', 'elo_setting', 'time_remaining',
    'game_mode'
]

HINTS_LOG = os.path.join(LOGS_DIR, 'hints_log.csv')
HINTS_HEADERS = [
    'game_id', 'move_number', 'timestamp', 'fen', 'hint_san', 'hint_uci'
]

GAMES_HEADERS = [
    'game_id', 'start_time', 'end_time', 'result', 'elo_setting', 'player_color', 'total_moves',
    'game_mode', 'player_age', 'player2_age'
]


def _ensure_logs_dir():
    os.makedirs(LOGS_DIR, exist_ok=True)


def _ensure_csv(path, headers):
    """Create CSV with headers if it doesn't exist yet, or migrate headers if new columns were added."""
    _ensure_logs_dir()
    if not os.path.exists(path):
        with open(path, 'w', newline='', encoding='utf-8') as f:
            csv.writer(f).writerow(headers)
        return
    # Check if existing file has outdated headers and migrate if needed
    with open(path, 'r', newline='', encoding='utf-8') as f:
        reader = csv.reader(f)
        existing_headers = next(reader, None)
        if existing_headers == headers:
            return
        rows = list(reader)
    # Rewrite with new headers, padding old rows with empty values
    with open(path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        new_len = len(headers)
        for row in rows:
            if len(row) < new_len:
                row.extend([''] * (new_len - len(row)))
            writer.writerow(row[:new_len])


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


def log_new_game(game_id, elo_setting, player_color, game_mode='cpu',
                 player_age='', player2_age=''):
    """Append a new row to games_log.csv when a game starts."""
    _ensure_csv(GAMES_LOG, GAMES_HEADERS)
    with open(GAMES_LOG, 'a', newline='', encoding='utf-8') as f:
        csv.writer(f).writerow([
            game_id, _now_iso(), '', '', elo_setting, player_color, 0,
            game_mode, player_age, player2_age
        ])


def log_move(game_id, move_number, player, move_san, move_uci,
             fen_before, fen_after, eval_before, eval_after,
             elo_setting, time_remaining, game_mode='cpu'):
    """Append a move row to moves_log.csv."""
    _ensure_csv(MOVES_LOG, MOVES_HEADERS)
    with open(MOVES_LOG, 'a', newline='', encoding='utf-8') as f:
        csv.writer(f).writerow([
            game_id, move_number, _now_iso(), player, move_san, move_uci,
            fen_before, fen_after, eval_before, eval_after,
            elo_setting, time_remaining, game_mode
        ])


def log_hint(game_id, move_number, fen, hint_san, hint_uci):
    """Append a row to hints_log.csv when a hint is requested."""
    _ensure_csv(HINTS_LOG, HINTS_HEADERS)
    with open(HINTS_LOG, 'a', newline='', encoding='utf-8') as f:
        csv.writer(f).writerow([
            game_id, move_number, _now_iso(), fen, hint_san, hint_uci
        ])


def log_end_game(game_id, result, total_moves):
    """Update the game row in games_log.csv with end_time, result, and total_moves.

    Reads the full CSV, updates the matching row, and rewrites the file.
    This is fine for a local single-user app with small log files.
    """
    _ensure_csv(GAMES_LOG, GAMES_HEADERS)
    rows = []
    with open(GAMES_LOG, 'r', newline='', encoding='utf-8') as f:
        reader = csv.reader(f)
        for row in reader:
            if row and row[0] == game_id:
                row[2] = _now_iso()       # end_time
                row[3] = result            # result
                row[6] = total_moves       # total_moves
            rows.append(row)
    with open(GAMES_LOG, 'w', newline='', encoding='utf-8') as f:
        csv.writer(f).writerows(rows)
